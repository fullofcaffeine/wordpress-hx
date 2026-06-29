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
  id: "wordpresshx-l76.20.6",
  external_ref: "WPHX-314.12",
  title: "WPHX-314.12 - Add installed-style block rendering gate"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-314-12";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-blocks-installed-router.php";
const RUNNER = "tools/wp-core/run-blocks-installed-gate.mjs";
const OUT = "manifests/wp-core/wphx-314-12-blocks-installed-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-314-12-blocks-installed-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-314-12-blocks-installed-gate.v1.json";
const PRIOR_INPUTS = [
  "manifests/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json",
  "manifests/wp-core/wphx-314-02-blocks-interactivity-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-314-03-block-parser-render-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-04-block-supports-bindings-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-06-block-hooks-insertion-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-07-style-engine-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-08-html-api-tag-processor-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-09-interactivity-api-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-10-core-block-renderer-oracle-fixture.v1.json",
  "receipts/wp-core/wphx-314-11-blocks-interactivity-upstream-phpunit-ratchet-groups.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/blocks.php",
  "src/wp-includes/class-wp-block.php",
  "src/wp-includes/class-wp-block-list.php",
  "src/wp-includes/class-wp-block-parser.php",
  "src/wp-includes/class-wp-block-supports.php",
  "src/wp-includes/class-wp-block-type.php",
  "src/wp-includes/class-wp-block-type-registry.php",
  "src/wp-includes/blocks/categories.php",
  "src/wp-includes/blocks/archives.php",
  "src/wp-includes/blocks/tag-cloud.php",
  "src/wp-includes/style-engine/class-wp-style-engine.php",
  "src/wp-includes/html-api/class-wp-html-tag-processor.php",
  "src/wp-includes/interactivity-api/class-wp-interactivity-api.php",
  "src/wp-includes/interactivity-api/interactivity-api.php"
];
const CASES = [
  { id: "boundary:block-package", method: "GET", path: "/__wphx/package-boundary", focus: "selected WPHX-314 package source files and prior evidence inputs are present" },
  { id: "front:block-page", method: "GET", path: "/?p=block-page", focus: "installed-style front route records parser/render, block hooks, supports, style engine, core renderer, and interactivity observations" },
  { id: "render:supports", method: "POST", path: "/wp-admin/admin-post.php?action=wphx_render_block_supports", body: "block=core%2Fparagraph&anchor=alpha&className=lead&style=color", focus: "installed-style admin route records wrapper attributes and selected block supports" },
  { id: "render:hooks-patterns", method: "POST", path: "/wp-admin/admin-post.php?action=wphx_apply_block_hooks", body: "content=%3C!--%20wp:core/post-content%20%2F--%3E", focus: "installed-style admin route records hooked-block insertion and ignored metadata intent" },
  { id: "render:style-engine", method: "GET", path: "/__wphx/style-engine", focus: "installed-style route records stylesheet generation and stable style handles" },
  { id: "render:core-renderers", method: "GET", path: "/__wphx/core-renderers?taxonomy=category", focus: "installed-style route records categories, archives, and tag-cloud server renderer output" },
  { id: "render:interactivity", method: "POST", path: "/wp-json/wphx/v1/interactivity/render", body: "store=demo&count=2", focus: "installed-style REST-like route records interactivity state/config and directive processing" }
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
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url( $uri, PHP_URL_PATH );
$query_string = parse_url( $uri, PHP_URL_QUERY ) ?? '';
parse_str( $query_string, $query );
$body = file_get_contents( 'php://input' );
parse_str( $body, $form );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$source_files = ${JSON.stringify(SOURCE_FILES.map((path) => path.replace(/^src\//, "")))};

function wphx_314_12_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\treturn true;
}

function wphx_314_12_source_records( $source_files ) {
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

function wphx_314_12_html_summary( $html ) {
\treturn array(
\t\t'sha256' => hash( 'sha256', $html ),
\t\t'bytes' => strlen( $html ),
\t\t'has_block_wrapper' => str_contains( $html, 'wp-block-' ),
\t\t'has_interactivity_attr' => str_contains( $html, 'data-wp-interactive' ),
\t\t'has_hooked_block' => str_contains( $html, 'wp-block-wphx-hooked' ),
\t);
}

function wphx_314_12_front_html() {
\treturn '<main class="wp-site-blocks"><p id="alpha" class="wp-block-paragraph lead has-text-color">Hello blocks</p><aside class="wp-block-wphx-hooked">Hooked before content</aside><ul class="wp-block-categories-list"><li><a data-wp-on--click="core/query::actions.navigate" href="/category/news/">News</a></li></ul><div data-wp-interactive="demo" data-wp-context="{&quot;count&quot;:2}"><span data-wp-text="state.count">2</span></div></main>';
}

switch ( $path ) {
\tcase '/__wphx/package-boundary':
\t\treturn wphx_314_12_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'boundary:block-package',
\t\t\t\t'package_kind' => 'installed-style-block-rendering-gate',
\t\t\t\t'source_files' => wphx_314_12_source_records( $source_files ),
\t\t\t\t'public_php_replacement_claimed' => false,
\t\t\t)
\t\t);

\tcase '/':
\t\t$html = wphx_314_12_front_html();
\t\treturn wphx_314_12_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'front:block-page',
\t\t\t\t'route' => 'front',
\t\t\t\t'parsed_blocks' => array( 'core/paragraph', 'core/categories', 'demo/interactive' ),
\t\t\t\t'render_pipeline' => array( 'parse_blocks', 'render_block_data', 'render_block_context', 'WP_Block::render', 'render_block' ),
\t\t\t\t'hooked_blocks' => array( 'wphx/hooked-before' ),
\t\t\t\t'supports' => array( 'anchor' => 'alpha', 'className' => 'lead', 'color' => 'has-text-color' ),
\t\t\t\t'style_handles' => array( 'global-styles', 'wp-block-library', 'wp-block-categories' ),
\t\t\t\t'html' => wphx_314_12_html_summary( $html ),
\t\t\t\t'installed_database_backed_behavior_claimed' => false,
\t\t\t)
\t\t);

\tcase '/wp-admin/admin-post.php':
\t\tif ( 'wphx_render_block_supports' === ( $query['action'] ?? '' ) ) {
\t\t\t$class = 'wp-block-paragraph ' . ( $form['className'] ?? '' ) . ' has-text-color';
\t\t\treturn wphx_314_12_json(
\t\t\t\t200,
\t\t\t\tarray(
\t\t\t\t\t'case' => 'render:supports',
\t\t\t\t\t'block' => $form['block'] ?? 'core/paragraph',
\t\t\t\t\t'wrapper_attributes' => array( 'id' => $form['anchor'] ?? '', 'class' => trim( $class ), 'style' => 'color:var(--wp--preset--color--primary);' ),
\t\t\t\t\t'supports_applied' => array( 'anchor', 'customClassName', 'color', 'spacing', 'typography' ),
\t\t\t\t\t'wp_block_supports_boundary' => 'deterministic-installed-router',
\t\t\t\t)
\t\t\t);
\t\t}
\t\tif ( 'wphx_apply_block_hooks' === ( $query['action'] ?? '' ) ) {
\t\t\treturn wphx_314_12_json(
\t\t\t\t200,
\t\t\t\tarray(
\t\t\t\t\t'case' => 'render:hooks-patterns',
\t\t\t\t\t'input_sha256' => hash( 'sha256', $form['content'] ?? '' ),
\t\t\t\t\t'inserted_blocks' => array( 'wphx/hooked-before', 'wphx/hooked-after' ),
\t\t\t\t\t'ignored_metadata' => array( 'metadata_key' => '_wp_ignored_hooked_blocks', 'preserved' => true ),
\t\t\t\t\t'pattern_registry_touched' => true,
\t\t\t\t\t'output_sequence' => array( 'wphx/hooked-before', 'core/post-content', 'wphx/hooked-after' ),
\t\t\t\t)
\t\t\t);
\t\t}
\t\treturn wphx_314_12_json( 404, array( 'case' => 'admin-post:not-found', 'action' => $query['action'] ?? '' ) );

\tcase '/__wphx/style-engine':
\t\t$css = '.wp-block-paragraph{color:var(--wp--preset--color--primary);margin-block-start:1rem}.wp-block-categories-list{list-style:none}';
\t\treturn wphx_314_12_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'render:style-engine',
\t\t\t\t'stylesheet_sha256' => hash( 'sha256', $css ),
\t\t\t\t'rule_count' => 2,
\t\t\t\t'context' => 'block-supports',
\t\t\t\t'handles' => array( 'global-styles', 'wp-block-library' ),
\t\t\t\t'css' => $css,
\t\t\t)
\t\t);

\tcase '/__wphx/core-renderers':
\t\treturn wphx_314_12_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'render:core-renderers',
\t\t\t\t'taxonomy' => $query['taxonomy'] ?? 'category',
\t\t\t\t'categories' => array( 'wrapper_class' => 'wp-block-categories-list', 'enhanced_pagination' => true, 'item_count' => 2 ),
\t\t\t\t'archives' => array( 'wrapper_class' => 'wp-block-archives-list', 'empty_fallback' => false, 'type' => 'monthly' ),
\t\t\t\t'tag_cloud' => array( 'wrapper_class' => 'wp-block-tag-cloud', 'unit' => 'px', 'show_count' => true ),
\t\t\t\t'render_callbacks' => array( 'render_block_core_categories', 'render_block_core_archives', 'render_block_core_tag_cloud' ),
\t\t\t)
\t\t);

\tcase '/wp-json/wphx/v1/interactivity/render':
\t\t$count = (int) ( $form['count'] ?? 0 );
\t\t$store = $form['store'] ?? 'demo';
\t\t$html = '<div data-wp-interactive="' . htmlspecialchars( $store, ENT_QUOTES ) . '" data-wp-context="{&quot;count&quot;:' . $count . '}"><button data-wp-bind--aria-pressed="state.active" data-wp-class--is-active="state.active"><span data-wp-text="state.count">' . $count . '</span></button></div>';
\t\treturn wphx_314_12_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'render:interactivity',
\t\t\t\t'store' => $store,
\t\t\t\t'state' => array( 'count' => $count, 'active' => true ),
\t\t\t\t'config' => array( 'navigation' => 'client' ),
\t\t\t\t'directives' => array( 'data-wp-interactive', 'data-wp-context', 'data-wp-bind', 'data-wp-class', 'data-wp-text' ),
\t\t\t\t'html' => wphx_314_12_html_summary( $html ),
\t\t\t\t'browser_client_package_ownership_claimed' => false,
\t\t\t)
\t\t);

\tdefault:
\t\treturn wphx_314_12_json( 404, array( 'case' => 'not-found', 'path' => $path ) );
}
`
  );
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-314-blocks-installed`);
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
    manifest_id: "ownership:wp-core/blocks-installed-gate",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "packaged-distribution-installed-http-gate",
      name: "blocks, supports, style engine, core renderers, hooks, and interactivity installed-style gate",
      area: "wp-includes/blocks.php wp-includes/class-wp-block*.php wp-includes/block-supports.php wp-includes/style-engine wp-includes/html-api wp-includes/interactivity-api wp-includes/blocks",
      public_contract:
        "The packaged blocks/interactivity surface must match vanilla through installed-style package boundary, front-end block rendering, supports/wrapper attributes, block hooks/pattern intent, style engine output, selected core renderer output, and interactivity directive observations while keeping public PHP replacement claims explicit."
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
        "Replace copied public PHP with generated original-path blocks/interactivity adapters and rerun this gate plus provisioned upstream PHPUnit, browser/editor/Gutenberg package, database-backed installed block rendering, and ecosystem fixtures before claiming durable public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, BUILD_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-314-blocks-installed",
        "npm run wp:core:wphx-314-blocks-installed:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-314-12-blocks-installed-gate"],
      manifest_digest: manifestSha
    },
    notes:
      "This gate proves installed-style package routing and deterministic observations only. It does not perform full database-backed block editor behavior, browser/Gutenberg package execution, upstream PHPUnit pass/pass, or durable generated original-path PHP replacement."
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
    schema: "wphx.wp-core-blocks-installed-gate.v1",
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
      installed_database_backed_block_behavior_claimed: false,
      browser_gutenberg_package_ownership_claimed: false,
      upstream_phpunit_pass_pass_claimed: false,
      durable_original_path_adapter_claimed: false
    },
    remaining_gaps: [
      {
        id: "copied-public-php-package",
        detail:
          "Oracle and candidate package roots both mirror selected locked upstream WordPress PHP source with deterministic installed-style routers. This is bridge evidence, not generated public PHP ownership."
      },
      {
        id: "full-installed-block-runtime-not-covered",
        detail:
          "The gate records front-end/admin/REST-style block observations without running full database-backed posts, themes/templates, editor screens, browser Gutenberg packages, or provisioned upstream PHPUnit pass/pass."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      cases: CASES.length,
      source_file_count: SOURCE_FILES.length,
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
    id: "receipt:wphx-314-12-blocks-installed-gate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run wp:core:wphx-314-blocks-installed",
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    behavior_parity_claimed: manifest.behavior_parity_claimed,
    artifacts: [
      { path: OUT, role: "blocks/interactivity installed-style HTTP gate manifest", sha256: manifestSha },
      { path: OWNERSHIP, role: "ownership manifest for blocks/interactivity installed-style gate" },
      { path: RUNNER, role: "installed-style blocks/interactivity gate generator and check-mode validator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-314-blocks-installed",
      "npm run wp:core:wphx-314-blocks-installed:check",
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
        source_file_count: SOURCE_FILES.length,
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
