#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.19",
  external_ref: "WPHX-312.19",
  title: "WPHX-312.19 - Add RDF feed template oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-rdf-feed-template-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-19";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-19-rdf-feed-template-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-19-rdf-feed-template-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-19-rdf-feed-template-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const RSS2_FIXTURE = "manifests/wp-core/wphx-312-15-rss2-feed-template-oracle-fixture.v1.json";
const ATOM_FIXTURE = "manifests/wp-core/wphx-312-16-atom-feed-template-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/feed-rdf.php"];
const COVERED_SYMBOLS = [
  "feed-rdf.php",
  "feed_content_type",
  "rss_tag_pre",
  "rdf_ns",
  "rdf_header",
  "wp_title_rss",
  "bloginfo_rss",
  "get_feed_build_date",
  "rss_update_period",
  "rss_update_frequency",
  "have_posts",
  "the_post",
  "rewind_posts",
  "the_permalink_rss",
  "the_title_rss",
  "the_author",
  "mysql2date",
  "the_category_rss",
  "the_excerpt_rss",
  "the_content_feed",
  "rdf_item"
];
const CASES = [
  { id: "rdf:full-content", path: "/wp-includes/feed-rdf.php?case=full", focus: "RDF channel metadata, namespaces, update filters, full content, categories, item hook output, and two-pass loop" },
  { id: "rdf:excerpt-option", path: "/wp-includes/feed-rdf.php?case=excerpt", focus: "rss_use_excerpt omits content:encoded while retaining description output" },
  { id: "rdf:multi-post", path: "/wp-includes/feed-rdf.php?case=multi", focus: "multiple posts appear in the channel rdf:Seq and item body after rewind_posts" },
  { id: "rdf:filtered-updates", path: "/wp-includes/feed-rdf.php?case=filtered", focus: "rss_update_period and rss_update_frequency filters affect RDF syndication metadata" },
  { id: "rdf:empty-content", path: "/wp-includes/feed-rdf.php?case=empty-content", focus: "empty content feed branch still emits content:encoded with deterministic empty payload" }
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

function mirrorPath(root, path) {
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
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function writePrependStub(root) {
  writeFileSync(
    `${root}/rdf-prepend.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$GLOBALS['wphx_312_19_case'] = $_GET['case'] ?? 'full';
$GLOBALS['wphx_312_19_index'] = -1;
$GLOBALS['post'] = null;

function wphx_312_19_posts() {
\t$case = $GLOBALS['wphx_312_19_case'];
\t$base = array(
\t\t(object) array(
\t\t\t'ID' => 101,
\t\t\t'title' => 'Alpha & RDF',
\t\t\t'permalink' => 'https://example.test/posts/alpha-rdf',
\t\t\t'author' => 'Fixture Author',
\t\t\t'post_date_gmt' => '2026-06-01 01:02:03',
\t\t\t'categories' => array( 'News & Updates', 'Haxe <Compiler>' ),
\t\t\t'excerpt' => 'Alpha rdf excerpt',
\t\t\t'content' => 'empty-content' === $case ? '' : '<p>Alpha rdf content</p>',
\t\t),
\t\t(object) array(
\t\t\t'ID' => 202,
\t\t\t'title' => 'Beta RDF',
\t\t\t'permalink' => 'https://example.test/posts/beta-rdf',
\t\t\t'author' => 'Second Author',
\t\t\t'post_date_gmt' => '2026-06-02 02:03:04',
\t\t\t'categories' => array( 'Second Category' ),
\t\t\t'excerpt' => 'Beta rdf excerpt',
\t\t\t'content' => '<p>Beta rdf content</p>',
\t\t),
\t);
\treturn 'multi' === $case ? $base : array( $base[0] );
}
function wphx_312_19_current_post() {
\t$posts = wphx_312_19_posts();
\treturn $posts[ $GLOBALS['wphx_312_19_index'] ] ?? $posts[0];
}
function feed_content_type( $type = '' ) { return 'rdf' === $type ? 'application/rdf+xml' : 'application/octet-stream'; }
function get_option( $name, $default = false ) {
\tif ( 'blog_charset' === $name ) {
\t\treturn 'UTF-8';
\t}
\tif ( 'rss_use_excerpt' === $name ) {
\t\treturn 'excerpt' === $GLOBALS['wphx_312_19_case'];
\t}
\treturn $default;
}
function do_action( $hook_name, ...$args ) {
\tif ( 'rss_tag_pre' === $hook_name ) {
\t\techo "\\n<!-- rss_tag_pre:" . $args[0] . " -->\\n";
\t}
\tif ( 'rdf_ns' === $hook_name ) {
\t\techo 'xmlns:fixture="https://fixture.example/rdf"';
\t}
\tif ( 'rdf_header' === $hook_name ) {
\t\techo "\\t<fixture:head>rdf</fixture:head>\\n";
\t}
\tif ( 'rdf_item' === $hook_name ) {
\t\techo "\\t<fixture:item marker=\\"" . wphx_312_19_current_post()->ID . "\\" />\\n";
\t}
}
function apply_filters( $hook_name, $value, ...$args ) {
\tif ( 'rss_update_period' === $hook_name ) {
\t\treturn 'filtered' === $GLOBALS['wphx_312_19_case'] ? 'weekly' : 'daily';
\t}
\tif ( 'rss_update_frequency' === $hook_name ) {
\t\treturn 'filtered' === $GLOBALS['wphx_312_19_case'] ? '5' : '2';
\t}
\treturn $value;
}
function wp_title_rss() { echo 'Fixture RDF &amp; Title'; }
function bloginfo_rss( $show = '' ) {
\t$values = array(
\t\t'url' => 'https://example.test',
\t\t'description' => 'Fixture RDF description',
\t);
\techo $values[ $show ] ?? 'Fixture Site';
}
function get_feed_build_date( $format ) { return '2026-06-27T00:00:00Z'; }
function have_posts() { return $GLOBALS['wphx_312_19_index'] + 1 < count( wphx_312_19_posts() ); }
function the_post() {
\t$GLOBALS['wphx_312_19_index']++;
\t$GLOBALS['post'] = wphx_312_19_current_post();
}
function rewind_posts() {
\t$GLOBALS['wphx_312_19_index'] = -1;
\t$GLOBALS['post'] = null;
}
function the_permalink_rss() { echo wphx_312_19_current_post()->permalink; }
function the_title_rss() { echo htmlspecialchars( wphx_312_19_current_post()->title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); }
function the_author() { echo wphx_312_19_current_post()->author; }
function mysql2date( $format, $date, $translate = false ) { return gmdate( 'Y-m-d\\TH:i:s\\Z', strtotime( $date . ' UTC' ) ); }
function the_category_rss( $type = 'rdf' ) {
\tforeach ( wphx_312_19_current_post()->categories as $category ) {
\t\techo "\\t<dc:subject>" . htmlspecialchars( $category, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . "</dc:subject>\\n";
\t}
}
function the_excerpt_rss() { echo wphx_312_19_current_post()->excerpt; }
function the_content_feed( $feed_type = null ) { echo wphx_312_19_current_post()->content; }
`
  );
}

function observation(caseDef, response) {
  const body = response.body.replace(/\r\n/g, "\n");
  return {
    case: caseDef.id,
    request_path: caseDef.path,
    status: response.status,
    content_type: response.headers.get("content-type") ?? "",
    body_sha256: sha256(body),
    body,
    item_count: (body.match(/<item rdf:about=/g) ?? []).length,
    sequence_count: (body.match(/<rdf:li rdf:resource=/g) ?? []).length,
    has_fixture_namespace: body.includes('xmlns:fixture="https://fixture.example/rdf"'),
    has_header_action_output: body.includes("<fixture:head>rdf</fixture:head>"),
    has_item_action_output: body.includes("<fixture:item marker="),
    has_content_encoded: body.includes("<content:encoded><![CDATA["),
    has_filtered_updates: body.includes("weekly") && body.includes("\n\t5\t"),
    has_two_pass_multi_output:
      body.includes('<rdf:li rdf:resource="https://example.test/posts/beta-rdf"/>') &&
      body.includes('<item rdf:about="https://example.test/posts/beta-rdf">'),
    has_category_output: body.includes("<dc:subject>News &amp; Updates</dc:subject>"),
    has_empty_content_payload: body.includes("<content:encoded><![CDATA[]]></content:encoded>")
  };
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function startPhpServer(root) {
  const port = await freePort();
  const prepend = resolve(`${root}/rdf-prepend.php`);
  const proc = spawn("php", ["-d", `auto_prepend_file=${prepend}`, "-S", `127.0.0.1:${port}`, "-t", root], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (proc.exitCode !== null) throw new Error(`php -S exited early for ${root}: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/wp-includes/feed-rdf.php?case=full`);
      await response.text();
      return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () =>
          new Promise((resolveStop) => {
            proc.once("exit", resolveStop);
            proc.kill("SIGTERM");
          })
      };
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  proc.kill("SIGTERM");
  throw new Error(`php -S did not become ready for ${root}: ${stderr}`);
}

async function runRoot(root) {
  const server = await startPhpServer(root);
  try {
    const entries = [];
    for (const caseDef of CASES) {
      const response = await fetch(`${server.baseUrl}${caseDef.path}`);
      const body = await response.text();
      entries.push([caseDef.id, observation(caseDef, { status: response.status, headers: response.headers, body })]);
    }
    return Object.fromEntries(entries);
  } finally {
    await server.stop();
  }
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-rdf-feed-template-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rdf-feed-template-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "RDF feed template output behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/feed-rdf.php through PHP's built-in HTTP server with a deterministic auto-prepended feed-loop stub. It observes content-type headers and RDF XML output without database-backed WP_Query, installed feed routing, or live network behavior."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-feed-loop-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed feed routing, database-backed WP_Query/post/category behavior, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-rdf-feed-template-oracle-fixture",
        "npm run wp:core:wphx-312-rdf-feed-template-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-19-rdf-feed-template-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writePrependStub(ORACLE_ROOT);
  writePrependStub(CANDIDATE_ROOT);

  const oracle = await runRoot(ORACLE_ROOT);
  const candidate = await runRoot(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);

  if (!observationsMatch) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const manifest = {
    schema: "wphx.wp-core-rdf-feed-template-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "http_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      rss2_fixture_manifest: inputRecord(RSS2_FIXTURE),
      atom_fixture_manifest: inputRecord(ATOM_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_builtin_server: true,
        auto_prepend_stub: "rdf-prepend.php supplies deterministic feed-loop functions; copied feed-rdf.php remains the executed template."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: {
      oracle_root: ORACLE_ROOT,
      candidate_root: CANDIDATE_ROOT,
      php_lint: phpLint
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
        id: "installed-rdf-feed-routing-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture executes the RDF template directly through a local PHP server. do_feed_rdf routing, query resolution, canonical URL behavior, and browser-observed installed routing remain later gates."
      },
      {
        id: "database-backed-post-loop-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture stubs the post loop, rewind_posts, categories, dates, excerpts, and content. Database-backed WP_Query, taxonomy, post cache, and content filter behavior remain covered by other domains or later integration gates."
      },
      {
        id: "public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      observations_match: observationsMatch,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      database_backed_feed_loop_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-19-rdf-feed-template-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "RDF feed template oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle RDF feed template boundary" },
      { path: RUNNER, role: "deterministic HTTP-observed oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-rdf-feed-template-oracle-fixture",
      "npm run wp:core:wphx-312-rdf-feed-template-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-15-rss2-feed-template-oracle-fixture",
      "receipt:wphx-312-16-atom-feed-template-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, ownershipText);
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
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
}

await main();
