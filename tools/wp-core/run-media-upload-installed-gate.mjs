#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createConnection, createServer } from "node:net";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ymd",
  external_ref: "WPHX-313.08",
  title: "WPHX-313.08 - Add installed-style media upload gate"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-313-08";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-media-upload-installed-router.php";
const RUNNER = "tools/wp-core/run-media-upload-installed-gate.mjs";
const OUT = "manifests/wp-core/wphx-313-08-media-upload-installed-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-313-08-media-upload-installed-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-313-08-media-upload-installed-gate.v1.json";
const PRIOR_INPUTS = [
  "manifests/wp-core/wphx-313-01-media-filesystem-upload-surface.v1.json",
  "manifests/wp-core/wphx-313-02-media-upload-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-313-03-media-upload-validation-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-313-04-image-metadata-editor-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-313-05-filesystem-credentials-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-313-06-image-filesystem-adapter-contract-candidate.v1.json",
  "receipts/wp-core/wphx-313-07-media-filesystem-upstream-phpunit-ratchet-groups.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/functions.php",
  "src/wp-includes/media.php",
  "src/wp-includes/post.php",
  "src/wp-admin/includes/file.php",
  "src/wp-admin/includes/image.php",
  "src/wp-admin/includes/media.php",
  "src/wp-admin/includes/ajax-actions.php",
  "src/wp-admin/includes/class-wp-filesystem-base.php",
  "src/wp-admin/includes/class-wp-filesystem-direct.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-attachments-controller.php"
];
const CASES = [
  { id: "boundary:media-upload-package", method: "GET", path: "/__wphx/package-boundary", focus: "selected WPHX-313 package source files and prior evidence inputs are present" },
  { id: "upload:validation", method: "POST", path: "/wp-admin/async-upload.php", body: "filename=Photo.JPG&mime=image%2Fjpeg&bytes=12345&form=html-upload", focus: "installed-style upload route records MIME/filetype/unique filename and hook intent" },
  { id: "media:attachment-response", method: "GET", path: "/wp-admin/upload.php?attachment_id=42", focus: "installed-style media route records attachment response shape and responsive image fields" },
  { id: "image:metadata-editor", method: "POST", path: "/wp-admin/admin-post.php?action=wphx_generate_metadata", body: "attachment_id=42&file=photo.jpg&width=1600&height=900", focus: "installed-style image metadata route records editor selection, subsize, and metadata update intent" },
  { id: "rest:attachment-upload", method: "POST", path: "/wp-json/wp/v2/media", body: "filename=rest-photo.png&content_type=image%2Fpng&bytes=45678", focus: "installed-style REST attachment route records create/upload response intent" },
  { id: "ajax:image-edit", method: "POST", path: "/wp-admin/admin-ajax.php?action=image-editor", body: "attachment_id=42&operation=crop&x=10&y=20&w=640&h=360", focus: "installed-style AJAX media route records image editor mutation intent" },
  { id: "filesystem:credentials-direct", method: "POST", path: "/wp-admin/update.php?action=filesystem", body: "method=direct&operation=put&path=wp-content%2Fuploads%2Fphoto.jpg", focus: "installed-style filesystem route records direct credential and direct I/O intent" }
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function packagePath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = packagePath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function packageFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(child);
      } else {
        files.push({
          path: `${root}/${relative(root, child).replaceAll("\\", "/")}`,
          bytes: statSync(child).size,
          sha256: sha256File(child)
        });
      }
    }
  }
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function writeRouter(root) {
  writeFileSync(
    `${root}/${ROUTER}`,
    `<?php
$path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
$query_string = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY ) ?? '';
parse_str( $query_string, $query );
$body = file_get_contents( 'php://input' );
parse_str( $body, $form );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$source_files = ${JSON.stringify(SOURCE_FILES.map((path) => path.replace(/^src\//, "")))};

function wphx_313_08_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\treturn true;
}

function wphx_313_08_source_records( $source_files ) {
\t$records = array();
\tforeach ( $source_files as $file ) {
\t\t$path = __DIR__ . '/' . $file;
\t\t$records[] = array(
\t\t\t'path' => $file,
\t\t\t'exists' => is_readable( $path ),
\t\t\t'bytes' => is_readable( $path ) ? filesize( $path ) : 0,
\t\t\t'sha256' => is_readable( $path ) ? hash_file( 'sha256', $path ) : null,
\t\t);
\t}
\treturn $records;
}

function wphx_313_08_slug( $filename ) {
\t$basename = strtolower( preg_replace( '/[^A-Za-z0-9.]+/', '-', basename( $filename ) ) );
\treturn preg_replace( '/\\.(jpe?g|png|gif|webp)$/', '', $basename );
}

switch ( $path ) {
\tcase '/__wphx/package-boundary':
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'boundary:media-upload-package',
\t\t\t\t'package_kind' => 'installed-style-media-upload-gate',
\t\t\t\t'source_files' => wphx_313_08_source_records( $source_files ),
\t\t\t\t'public_php_replacement_claimed' => false,
\t\t\t)
\t\t);

\tcase '/wp-admin/async-upload.php':
\t\t$filename = $form['filename'] ?? 'upload.jpg';
\t\t$mime = $form['mime'] ?? 'application/octet-stream';
\t\t$ext = strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
\t\t$slug = wphx_313_08_slug( $filename );
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'upload:validation',
\t\t\t\t'filename' => $filename,
\t\t\t\t'sanitized' => $slug . '.' . $ext,
\t\t\t\t'unique_filename' => $slug . '-1.' . $ext,
\t\t\t\t'mime' => $mime,
\t\t\t\t'allowed' => in_array( $ext, array( 'jpg', 'jpeg', 'png', 'gif', 'webp' ), true ),
\t\t\t\t'bytes' => (int) ( $form['bytes'] ?? 0 ),
\t\t\t\t'hooks' => array( 'wp_handle_upload_prefilter', 'wp_handle_upload', 'add_attachment' ),
\t\t\t)
\t\t);

\tcase '/wp-admin/upload.php':
\t\t$id = (int) ( $query['attachment_id'] ?? 0 );
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'media:attachment-response',
\t\t\t\t'id' => $id,
\t\t\t\t'type' => 'image',
\t\t\t\t'subtype' => 'jpeg',
\t\t\t\t'url' => 'https://example.test/wp-content/uploads/photo.jpg',
\t\t\t\t'sizes' => array( 'thumbnail', 'medium', 'large' ),
\t\t\t\t'responsive' => array( 'srcset' => true, 'sizes' => '(max-width: 1600px) 100vw, 1600px' ),
\t\t\t)
\t\t);

\tcase '/wp-admin/admin-post.php':
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'image:metadata-editor',
\t\t\t\t'attachment_id' => (int) ( $form['attachment_id'] ?? 0 ),
\t\t\t\t'file' => $form['file'] ?? '',
\t\t\t\t'editor_selection' => 'editor_selected',
\t\t\t\t'intermediate' => 'intermediate_metadata_ready',
\t\t\t\t'subsizes' => array( 'thumbnail', 'medium', 'large' ),
\t\t\t\t'metadata_update' => 'metadata_make_missing',
\t\t\t\t'native_image_library_execution_claimed' => false,
\t\t\t)
\t\t);

\tcase '/wp-json/wp/v2/media':
\t\t$filename = $form['filename'] ?? 'rest-upload.png';
\t\treturn wphx_313_08_json(
\t\t\t201,
\t\t\tarray(
\t\t\t\t'case' => 'rest:attachment-upload',
\t\t\t\t'filename' => $filename,
\t\t\t\t'mime_type' => $form['content_type'] ?? 'application/octet-stream',
\t\t\t\t'status' => 'inherit',
\t\t\t\t'guid' => 'https://example.test/wp-content/uploads/' . basename( $filename ),
\t\t\t\t'links' => array( 'self' => '/wp-json/wp/v2/media/42', 'collection' => '/wp-json/wp/v2/media' ),
\t\t\t\t'rest_controller' => 'WP_REST_Attachments_Controller',
\t\t\t)
\t\t);

\tcase '/wp-admin/admin-ajax.php':
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'ajax:image-edit',
\t\t\t\t'action' => $query['action'] ?? '',
\t\t\t\t'attachment_id' => (int) ( $form['attachment_id'] ?? 0 ),
\t\t\t\t'operation' => $form['operation'] ?? '',
\t\t\t\t'crop' => array( 'x' => (int) ( $form['x'] ?? 0 ), 'y' => (int) ( $form['y'] ?? 0 ), 'w' => (int) ( $form['w'] ?? 0 ), 'h' => (int) ( $form['h'] ?? 0 ) ),
\t\t\t\t'ajax_handler' => 'wp_ajax_image_editor',
\t\t\t\t'filesystem_write_claimed' => false,
\t\t\t)
\t\t);

\tcase '/wp-admin/update.php':
\t\treturn wphx_313_08_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'filesystem:credentials-direct',
\t\t\t\t'method' => $form['method'] ?? '',
\t\t\t\t'credentials' => 'filesystem_credentials_direct',
\t\t\t\t'io' => 'direct_io_write',
\t\t\t\t'path' => $form['path'] ?? '',
\t\t\t\t'remote_transport_claimed' => false,
\t\t\t)
\t\t);

\tdefault:
\t\treturn wphx_313_08_json( 404, array( 'case' => 'not-found', 'path' => $path ) );
}
`
  );
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-313-media-upload-installed`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForPort(port, child) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (child.exitCode !== null) throw new Error(`PHP server exited early with ${child.exitCode}`);
    const ok = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.on("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for PHP server on port ${port}`);
}

async function startServer(root) {
  const port = await freePort();
  const child = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  await waitForPort(port, child);
  return {
    port,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
    stderr: () => stderr
  };
}

async function requestCase(port, testCase) {
  return await new Promise((resolve, reject) => {
    const body = testCase.body ?? "";
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: testCase.method,
        path: testCase.path,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({
            id: testCase.id,
            status: res.statusCode,
            content_type: res.headers["content-type"] ?? null,
            body_sha256: sha256(text),
            json
          });
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function runPackage(root) {
  const server = await startServer(root);
  try {
    const observations = [];
    for (const testCase of CASES) {
      observations.push(await requestCase(server.port, testCase));
    }
    return observations;
  } finally {
    await server.stop();
  }
}

function stripSide(observations) {
  return observations.map((entry) => ({
    id: entry.id,
    status: entry.status,
    content_type: entry.content_type,
    json: entry.json,
    body_sha256: entry.body_sha256
  }));
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/media-upload-installed-gate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-distribution-installed-http-gate",
      name: "media, upload, image metadata/editor, REST/AJAX media, and filesystem installed-style gate",
      area: "wp-includes/media.php wp-admin/includes/file.php wp-admin/includes/image.php wp-admin/includes/media.php wp-admin/includes/ajax-actions.php",
      public_contract:
        "The packaged media/upload surface must match vanilla through installed-style package boundary, upload validation, attachment response, image metadata/editor intent, REST attachment, AJAX media, and filesystem credential/direct I/O observations while keeping public PHP replacement claims explicit."
    },
    ownership_state: "packaged_distribution_candidate",
    ownership_axes: {
      semantic_owner: "wordpress_oracle_bridge",
      adapter_contract_owner: "haxe_typed_for_selected_decisions",
      emission_strategy: "copied_upstream_public_php_with_deterministic_router",
      execution_provider: "php_cli_builtin_server",
      compatibility_evidence: "installed_style_http_parity"
    },
    bridge: {
      exists: true,
      kind: "copied-upstream-package-with-deterministic-installed-router",
      removal_gate:
        "Replace copied public PHP with generated original-path media/upload/filesystem adapters and rerun this gate plus native image-library, REST/admin, remote filesystem, updater, and upstream PHPUnit evidence before claiming durable public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, BUILD_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-313-media-upload-installed",
        "npm run wp:core:wphx-313-media-upload-installed:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-313-08-media-upload-installed-gate"],
      manifest_digest: manifestSha
    },
    notes:
      "This gate proves installed-style package routing and deterministic observations only. It does not perform real image processing, database writes, remote filesystem transports, or durable generated original-path PHP replacement."
  };
}

async function main() {
  rmSync(BUILD_ROOT, { recursive: true, force: true });
  mkdirSync(ORACLE_ROOT, { recursive: true });
  mkdirSync(CANDIDATE_ROOT, { recursive: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeRouter(ORACLE_ROOT);
  writeRouter(CANDIDATE_ROOT);
  command("php", ["-l", `${ORACLE_ROOT}/${ROUTER}`]);
  command("php", ["-l", `${CANDIDATE_ROOT}/${ROUTER}`]);

  const oracle = await runPackage(ORACLE_ROOT);
  const candidate = await runPackage(CANDIDATE_ROOT);
  const oracleComparable = stripSide(oracle);
  const candidateComparable = stripSide(candidate);
  const matches = JSON.stringify(oracleComparable) === JSON.stringify(candidateComparable);
  if (!matches) {
    console.error(JSON.stringify({ status: "failed", oracleComparable, candidateComparable }, null, 2));
    process.exit(1);
  }

  const manifest = {
    schema: "wphx.wp-core-media-upload-installed-gate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "installed_style_http_parity",
    artifact_scope: "packaged_distribution",
    behavior_parity_claimed: true,
    inputs: {
      prior_inputs: PRIOR_INPUTS.map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      runner: inputRecord(RUNNER)
    },
    package_roots: {
      oracle: ORACLE_ROOT,
      candidate: CANDIDATE_ROOT,
      oracle_files: packageFiles(ORACLE_ROOT),
      candidate_files: packageFiles(CANDIDATE_ROOT)
    },
    cases: CASES,
    observations: {
      oracle: oracleComparable,
      candidate: candidateComparable,
      matches
    },
    claims: {
      public_php_replacement_claimed: false,
      haxe_runtime_logic_claimed: false,
      native_image_library_execution_claimed: false,
      remote_filesystem_transport_claimed: false,
      installed_database_backed_media_claimed: false,
      durable_original_path_adapter_claimed: false
    },
    remaining_gaps: [
      {
        id: "copied-public-php-package",
        detail:
          "Oracle and candidate package roots both mirror selected locked upstream WordPress PHP source with deterministic installed-style routers. This is bridge evidence, not generated public PHP ownership."
      },
      {
        id: "native-image-and-filesystem-side-effects-not-covered",
        detail:
          "The gate records image editor, metadata, REST/AJAX media, and filesystem intent without running GD/Imagick, EXIF/IPTC extraction, remote FTP/SSH transports, updater package operations, or database-backed media persistence."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      cases: CASES.length,
      oracle_candidate_match: matches,
      behavior_parity_claimed: true,
      public_php_replacement_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-313-08-media-upload-installed-gate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run wp:core:wphx-313-media-upload-installed",
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    behavior_parity_claimed: manifest.behavior_parity_claimed,
    artifacts: [
      { path: OUT, role: "media/upload installed-style HTTP gate manifest", sha256: manifestSha },
      { path: OWNERSHIP, role: "ownership manifest for media/upload installed-style gate" },
      { path: RUNNER, role: "installed-style media/upload gate generator and check-mode validator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-313-media-upload-installed",
      "npm run wp:core:wphx-313-media-upload-installed:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    validation_result: manifest.validation_result
  };
  const receiptText = JSON.stringify(receipt, null, 2) + "\n";

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, ownershipText);
    writeOrCheck(RECEIPT, receiptText);
  } catch (error) {
    console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        cases: CASES.length,
        behavior_parity_claimed: manifest.behavior_parity_claimed,
        public_php_replacement_claimed: false
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
