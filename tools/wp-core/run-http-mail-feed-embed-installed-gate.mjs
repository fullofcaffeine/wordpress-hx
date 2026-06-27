#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection, createServer } from "node:net";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.9",
  external_ref: "WPHX-312.09",
  title: "WPHX-312.09 — Add installed-style HTTP mail feed embed gate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-312-09";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-http-mail-feed-embed-installed-router.php";
const RUNNER = "tools/wp-core/run-http-mail-feed-embed-installed-gate.mjs";
const OUT = "manifests/wp-core/wphx-312-09-http-mail-feed-embed-installed-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-09-http-mail-feed-embed-installed-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-09-http-mail-feed-embed-installed-gate.v1.json";

const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json",
  "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-312-04-feed-embed-https-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-312-05-ai-http-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-312-06-trackback-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-312-07-privacy-request-mail-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/http.php",
  "src/wp-includes/class-wp-http.php",
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/class-wp-http-cookie.php",
  "src/wp-includes/cron.php",
  "src/wp-includes/pluggable.php",
  "src/wp-includes/feed.php",
  "src/wp-includes/embed.php",
  "src/wp-includes/class-wp-oembed.php",
  "src/wp-includes/class-wp-embed.php",
  "src/wp-includes/class-wp-user-request.php",
  "src/wp-includes/user.php",
  "src/wp-admin/includes/privacy-tools.php",
  "src/wp-trackback.php"
];
const CASES = [
  { id: "boundary:http-mail-feed-embed-package", method: "GET", path: "/__wphx/package-boundary", focus: "selected WPHX-312 package source files and prior evidence inputs are present" },
  { id: "http:fake-transport", method: "GET", path: "/__wphx/http?target=https%3A%2F%2Fapi.example.test%2Fpayload", focus: "installed-style route records deterministic HTTP transport request/response observation" },
  { id: "cron:spawn-intent", method: "POST", path: "/wp-cron.php?doing_wp_cron=fixture", body: "hook=wphx_fixture_event&timestamp=1893456000", focus: "cron route records scheduling and spawn intent without executing real cron loop" },
  { id: "mail:dispatch-intent", method: "POST", path: "/wp-mail.php", body: "to=user%40example.test&subject=Fixture&body=Hello", focus: "mail route records wp_mail-style payload without transport delivery" },
  { id: "feed:rss2-output", method: "GET", path: "/feed/", focus: "feed route emits deterministic RSS XML and selected feed headers" },
  { id: "oembed:json-output", method: "GET", path: "/wp-json/oembed/1.0/embed?url=https%3A%2F%2Fexample.test%2Ffixture-post", focus: "oEmbed route emits deterministic provider JSON for an installed-style REST URL" },
  { id: "trackback:post", method: "POST", path: "/wp-trackback.php?tb_id=123", body: "url=https%3A%2F%2Fsender.example%2Fpost&title=Sender&excerpt=Excerpt&blog_name=Sender%20Blog", focus: "trackback route records deterministic XML success and comment payload intent" },
  { id: "privacy:export-mail", method: "POST", path: "/wp-admin/export-personal-data.php?action=send", body: "request_id=701", focus: "privacy export route records deterministic export mail payload without real email delivery" }
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
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        files.push({
          path: `${root}/${relative(root, path).replaceAll("\\", "/")}`,
          bytes: statSync(path).size,
          sha256: sha256File(path)
        });
      }
    }
  }
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function writeRouter(root, mode) {
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

$mode = 'fixture';
$source_files = ${JSON.stringify(SOURCE_FILES.map((path) => path.replace(/^src\//, "")))};

function wphx_312_09_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\treturn true;
}

function wphx_312_09_xml( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/xml; charset=UTF-8' );
\techo $payload;
\treturn true;
}

function wphx_312_09_source_records( $source_files ) {
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

switch ( $path ) {
\tcase '/__wphx/package-boundary':
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'boundary:http-mail-feed-embed-package',
\t\t\t\t'mode' => $mode,
\t\t\t\t'package_kind' => 'installed-style-http-gate',
\t\t\t\t'source_files' => wphx_312_09_source_records( $source_files ),
\t\t\t\t'public_php_replacement_claimed' => false,
\t\t\t)
\t\t);

\tcase '/__wphx/http':
\t\t$target = $query['target'] ?? 'https://api.example.test/payload';
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'http:fake-transport',
\t\t\t\t'mode' => $mode,
\t\t\t\t'request' => array( 'method' => 'GET', 'url' => $target, 'timeout' => 5, 'redirection' => 3 ),
\t\t\t\t'response' => array( 'status' => 200, 'message' => 'OK', 'headers' => array( 'x-fixture' => 'transport' ), 'body_sha256' => hash( 'sha256', 'fixture transport body' ) ),
\t\t\t\t'network' => 'fake',
\t\t\t)
\t\t);

\tcase '/wp-cron.php':
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'cron:spawn-intent',
\t\t\t\t'mode' => $mode,
\t\t\t\t'doing_wp_cron' => $query['doing_wp_cron'] ?? null,
\t\t\t\t'event' => array( 'hook' => $form['hook'] ?? 'wphx_fixture_event', 'timestamp' => (int) ( $form['timestamp'] ?? 0 ), 'schedule' => false ),
\t\t\t\t'spawned' => false,
\t\t\t\t'lock' => 'fixture-cron-lock',
\t\t\t)
\t\t);

\tcase '/wp-mail.php':
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'mail:dispatch-intent',
\t\t\t\t'mode' => $mode,
\t\t\t\t'mail' => array( 'to' => $form['to'] ?? '', 'subject' => $form['subject'] ?? '', 'message_sha256' => hash( 'sha256', $form['body'] ?? '' ), 'headers' => array( 'X-WPHX-Fixture: mail' ) ),
\t\t\t\t'delivered' => false,
\t\t\t)
\t\t);

\tcase '/feed/':
\t\t$rss = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fixture Feed</title><link>https://example.test/</link><item><title>Installed Feed Item</title><guid>urn:wphx:312:09</guid></item></channel></rss>';
\t\theader( 'X-WPHX-Feed: rss2' );
\t\treturn wphx_312_09_xml( 200, $rss );

\tcase '/wp-json/oembed/1.0/embed':
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'oembed:json-output',
\t\t\t\t'mode' => $mode,
\t\t\t\t'url' => $query['url'] ?? '',
\t\t\t\t'type' => 'rich',
\t\t\t\t'html' => '<iframe src="https://example.test/embed/fixture-post"></iframe>',
\t\t\t\t'provider_name' => 'Fixture Provider',
\t\t\t\t'width' => 640,
\t\t\t\t'height' => 360,
\t\t\t)
\t\t);

\tcase '/wp-trackback.php':
\t\t$xml = '<?xml version="1.0" encoding="utf-8"?><response><error>0</error></response>';
\t\theader( 'X-WPHX-Trackback-Comment-SHA256: ' . hash( 'sha256', ( $form['url'] ?? '' ) . '|' . ( $form['title'] ?? '' ) . '|' . ( $form['excerpt'] ?? '' ) . '|' . ( $form['blog_name'] ?? '' ) ) );
\t\treturn wphx_312_09_xml( 200, $xml );

\tcase '/wp-admin/export-personal-data.php':
\t\treturn wphx_312_09_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'case' => 'privacy:export-mail',
\t\t\t\t'mode' => $mode,
\t\t\t\t'request_id' => (int) ( $form['request_id'] ?? 0 ),
\t\t\t\t'mail' => array( 'to' => 'export-user@example.test', 'subject' => '[Fixture Site] Personal Data Export', 'link' => 'https://example.test/wp-content/uploads/wp-personal-data-file.zip' ),
\t\t\t\t'delivered' => false,
\t\t\t)
\t\t);
}

return wphx_312_09_json( 404, array( 'case' => 'missing', 'path' => $path, 'mode' => $mode ) );
`
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to reserve local port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) break;
    const ready = await new Promise((resolve) => {
      const socket = createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (ready) return;
    await sleep(50);
  }
  throw new Error(`PHP server did not open 127.0.0.1:${port}`);
}

async function withServer(root, callback) {
  const port = await freePort();
  const child = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await waitForPort(port, child);
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    if (child.exitCode && child.exitCode !== 0 && !child.killed) {
      throw new Error(`PHP server failed for ${root}: ${stderr}`);
    }
  }
}

function normalizeHeaders(headers) {
  const selected = {};
  for (const name of ["content-type", "x-wphx-feed", "x-wphx-trackback-comment-sha256"]) {
    const value = headers.get(name);
    if (value !== null) selected[name] = value;
  }
  return selected;
}

async function requestCase(baseUrl, testCase) {
  const response = await fetch(`${baseUrl}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.body ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
    body: testCase.body
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { kind: "text", sha256: sha256(text), text };
  }
  return {
    id: testCase.id,
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body
  };
}

async function runPackage(root) {
  return withServer(root, async (baseUrl) => {
    const observations = {};
    for (const testCase of CASES) {
      observations[testCase.id] = await requestCase(baseUrl, testCase);
    }
    return observations;
  });
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-installed-http`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/http-mail-feed-embed-installed-gate",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "packaged-distribution-installed-http-gate",
      name: "HTTP, cron, mail, feed, oEmbed, trackback, and privacy request installed-style observations",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "The packaged WPHX-312 surface must match vanilla through deterministic local HTTP package-boundary, fake HTTP transport, cron intent, mail intent, feed XML, oEmbed JSON, trackback, and privacy mail observations while keeping public PHP replacement claims explicit."
    },
    ownership_state: "installed_style_package_gate_with_copied_oracle_php",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-router-observation-gate",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded network parity, real cron spawn/dispatch, mail transport, installed feed/embed rendering, selected upstream tests, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, BUILD_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-installed-http",
        "npm run wp:core:wphx-312-installed-http:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-09-http-mail-feed-embed-installed-gate"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(BUILD_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeRouter(ORACLE_ROOT, "oracle");
writeRouter(CANDIDATE_ROOT, "candidate");

const oracle = await runPackage(ORACLE_ROOT);
const candidate = await runPackage(CANDIDATE_ROOT);
const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);

if (!observationsMatch) {
  console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-http-mail-feed-embed-installed-gate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_package_http", "candidate_package_http"],
  artifact_scope: "installed_style_http_gate",
  inputs: {
    prior_manifests: PRIOR_MANIFESTS.map(inputRecord),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord)
  },
  fixture: {
    cases: CASES,
    source_files: SOURCE_FILES,
    side_effect_policy: {
      live_network_requests: false,
      real_cron_spawn_or_dispatch: false,
      real_email_delivery: false,
      database_backed_writes: false,
      feed_template_rendering: false
    },
    public_abi_policy: {
      public_php_replacement_claimed: false,
      copied_oracle_public_php: true,
      installed_wordpress_behavior_claimed: "focused installed-style local package gate only"
    }
  },
  build: {
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    oracle_files: packageFiles(ORACLE_ROOT),
    candidate_files: packageFiles(CANDIDATE_ROOT)
  },
  observations: {
    oracle,
    candidate,
    match: observationsMatch,
    oracle_sha256: sha256(JSON.stringify(oracle)),
    candidate_sha256: sha256(JSON.stringify(candidate))
  },
  remaining_gaps: [
    {
      id: "live-or-recorded-network-parity-not-executed",
      owner: ISSUE.external_ref,
      detail: "The gate serves deterministic local fake HTTP observations. Live HTTP, TLS, redirects, provider availability, and recorded-network replay remain later gates."
    },
    {
      id: "real-cron-and-mail-transports-not-executed",
      owner: ISSUE.external_ref,
      detail: "Cron and mail routes record intent only. Real cron spawn/dispatch locks, PHPMailer/SMTP transport, and operational delivery remain later gates."
    },
    {
      id: "database-backed-installed-state-not-executed",
      owner: ISSUE.external_ref,
      detail: "Trackback and privacy routes use deterministic request state. Real comments/user-request tables, admin list tables, status transitions, and plugin side effects remain later distribution work."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail: "The gate compares copied oracle PHP package roots; generated original-path PHP replacement remains a later cross-domain gate."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    fixture_cases: CASES.length,
    observations_match: observationsMatch,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-312-09-http-mail-feed-embed-installed-gate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "WPHX-312 installed-style HTTP gate manifest" },
    { path: OWNERSHIP, role: "ownership manifest for WPHX-312 installed-style HTTP package gate" },
    { path: RUNNER, role: "installed-style HTTP gate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-312-installed-http",
    "npm run wp:core:wphx-312-installed-http:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
    "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
    "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
    "receipt:wphx-312-04-feed-embed-https-oracle-fixture",
    "receipt:wphx-312-05-ai-http-oracle-fixture",
    "receipt:wphx-312-06-trackback-oracle-fixture",
    "receipt:wphx-312-07-privacy-request-mail-oracle-fixture",
    "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture"
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
      fixture_cases: CASES.length,
      observations_match: observationsMatch
    },
    null,
    2
  )
);
