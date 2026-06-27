#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.16",
  external_ref: "WPHX-312.16",
  title: "WPHX-312.16 - Add Atom feed template oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-atom-feed-template-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-16";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-16-atom-feed-template-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-16-atom-feed-template-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-16-atom-feed-template-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const FEED_EMBED_FIXTURE = "manifests/wp-core/wphx-312-04-feed-embed-https-oracle-fixture.v1.json";
const INSTALLED_GATE = "manifests/wp-core/wphx-312-09-http-mail-feed-embed-installed-gate.v1.json";
const RSS2_FIXTURE = "manifests/wp-core/wphx-312-15-rss2-feed-template-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/feed-atom.php"];
const COVERED_SYMBOLS = [
  "feed-atom.php",
  "feed_content_type",
  "wp_title_rss",
  "bloginfo_rss",
  "bloginfo",
  "self_link",
  "get_feed_build_date",
  "atom_ns",
  "atom_head",
  "have_posts",
  "the_post",
  "get_the_author_meta",
  "atom_author",
  "html_type_rss",
  "the_title_rss",
  "the_permalink_rss",
  "get_post_modified_time",
  "get_post_time",
  "the_category_rss",
  "the_content_feed",
  "atom_enclosure",
  "atom_entry"
];
const CASES = [
  { id: "atom:full-content-comments", path: "/wp-includes/feed-atom.php?case=full", focus: "Atom emits channel metadata, namespace/action output, author URI, full content, enclosures, and reply links" },
  { id: "atom:excerpt-option", path: "/wp-includes/feed-atom.php?case=excerpt", focus: "rss_use_excerpt omits content while retaining summary output" },
  { id: "atom:no-author-uri", path: "/wp-includes/feed-atom.php?case=no-author-uri", focus: "empty author URL omits author uri while keeping atom_author hook output" },
  { id: "atom:no-comments", path: "/wp-includes/feed-atom.php?case=no-comments", focus: "items without comments or open comment status omit replies and thr:total output" },
  { id: "atom:multi-post", path: "/wp-includes/feed-atom.php?case=multi", focus: "feed loop renders multiple entries with per-post categories, IDs, authors, dates, content, and item hooks" }
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
    `${root}/atom-prepend.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', __DIR__ . '/' );
$GLOBALS['wphx_312_16_case'] = $_GET['case'] ?? 'full';
$GLOBALS['wphx_312_16_index'] = -1;
$GLOBALS['post'] = null;

function wphx_312_16_posts() {
\t$case = $GLOBALS['wphx_312_16_case'];
\t$base = array(
\t\t(object) array(
\t\t\t'ID' => 101,
\t\t\t'title' => 'Alpha & Atom',
\t\t\t'permalink' => 'https://example.test/posts/alpha',
\t\t\t'comments_number' => 'no-comments' === $case ? 0 : 3,
\t\t\t'comments_open' => 'no-comments' !== $case,
\t\t\t'comments_feed' => 'https://example.test/posts/alpha/comments/atom',
\t\t\t'author' => 'Fixture Author',
\t\t\t'author_url' => 'no-author-uri' === $case ? '' : 'https://authors.example.test/fixture',
\t\t\t'post_time' => '2026-06-01 01:02:03',
\t\t\t'modified_time' => '2026-06-03 04:05:06',
\t\t\t'categories' => array( 'News & Updates', 'Haxe <Compiler>' ),
\t\t\t'guid' => 'fixture-guid-atom-101',
\t\t\t'excerpt' => 'Alpha atom excerpt',
\t\t\t'content' => '<p>Alpha atom content</p>',
\t\t\t'enclosure' => 'https://media.example.test/alpha-atom.mp3',
\t\t),
\t\t(object) array(
\t\t\t'ID' => 202,
\t\t\t'title' => 'Beta Atom',
\t\t\t'permalink' => 'https://example.test/posts/beta',
\t\t\t'comments_number' => 0,
\t\t\t'comments_open' => false,
\t\t\t'comments_feed' => 'https://example.test/posts/beta/comments/atom',
\t\t\t'author' => 'Second Author',
\t\t\t'author_url' => 'https://authors.example.test/second',
\t\t\t'post_time' => '2026-06-02 02:03:04',
\t\t\t'modified_time' => '2026-06-04 05:06:07',
\t\t\t'categories' => array( 'Second Category' ),
\t\t\t'guid' => 'fixture-guid-atom-202',
\t\t\t'excerpt' => 'Beta atom excerpt',
\t\t\t'content' => '<p>Beta atom content</p>',
\t\t\t'enclosure' => '',
\t\t),
\t);
\treturn 'multi' === $case ? $base : array( $base[0] );
}
function wphx_312_16_current_post() {
\t$posts = wphx_312_16_posts();
\treturn $posts[ $GLOBALS['wphx_312_16_index'] ] ?? $posts[0];
}
function feed_content_type( $type = '' ) { return 'atom' === $type ? 'application/atom+xml' : 'application/octet-stream'; }
function get_option( $name, $default = false ) {
\tif ( 'blog_charset' === $name ) {
\t\treturn 'UTF-8';
\t}
\tif ( 'rss_use_excerpt' === $name ) {
\t\treturn 'excerpt' === $GLOBALS['wphx_312_16_case'];
\t}
\treturn $default;
}
function do_action( $hook_name, ...$args ) {
\tif ( 'rss_tag_pre' === $hook_name ) {
\t\techo "\\n<!-- rss_tag_pre:" . $args[0] . " -->\\n";
\t}
\tif ( 'atom_ns' === $hook_name ) {
\t\techo 'xmlns:fixture="https://fixture.example/atom"';
\t}
\tif ( 'atom_head' === $hook_name ) {
\t\techo "\\t<fixture:head>yes</fixture:head>\\n";
\t}
\tif ( 'atom_author' === $hook_name ) {
\t\techo "\\t\\t\\t<fixture:author marker=\\"" . wphx_312_16_current_post()->ID . "\\" />\\n";
\t}
\tif ( 'atom_entry' === $hook_name ) {
\t\techo "\\t\\t<fixture:entry marker=\\"" . wphx_312_16_current_post()->ID . "\\" />\\n";
\t}
}
function esc_url( $value ) {
\t$value = trim( (string) $value );
\treturn preg_match( '/^https?:\\/\\//', $value ) ? $value : '';
}
function wp_title_rss() { echo 'Fixture Atom &amp; Title'; }
function bloginfo_rss( $show = '' ) {
\t$values = array(
\t\t'language' => 'en-US',
\t\t'description' => 'Fixture atom description',
\t\t'html_type' => 'text/html',
\t\t'url' => 'https://example.test',
\t);
\techo $values[ $show ] ?? 'Fixture Atom Site';
}
function bloginfo( $show = '' ) {
\tif ( 'atom_url' === $show ) {
\t\techo 'https://example.test/feed/atom/';
\t\treturn;
\t}
\techo 'Fixture Atom Site';
}
function self_link() { echo 'https://example.test/feed/atom/?fixture=atom'; }
function get_feed_build_date( $format ) { return '2026-06-27T00:00:00Z'; }
function have_posts() {
\treturn $GLOBALS['wphx_312_16_index'] + 1 < count( wphx_312_16_posts() );
}
function the_post() {
\t$GLOBALS['wphx_312_16_index']++;
\t$GLOBALS['post'] = wphx_312_16_current_post();
}
function the_author() { echo wphx_312_16_current_post()->author; }
function get_the_author_meta( $field ) { return 'url' === $field ? wphx_312_16_current_post()->author_url : ''; }
function the_author_meta( $field ) { echo get_the_author_meta( $field ); }
function html_type_rss() { echo 'html'; }
function the_title_rss() { echo htmlspecialchars( wphx_312_16_current_post()->title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); }
function the_permalink_rss() { echo wphx_312_16_current_post()->permalink; }
function the_guid() { echo wphx_312_16_current_post()->guid; }
function get_post_modified_time( $format, $gmt = false ) { return gmdate( 'Y-m-d\\TH:i:s\\Z', strtotime( wphx_312_16_current_post()->modified_time . ' UTC' ) ); }
function get_post_time( $format, $gmt = false ) { return gmdate( 'Y-m-d\\TH:i:s\\Z', strtotime( wphx_312_16_current_post()->post_time . ' UTC' ) ); }
function the_category_rss( $type = 'atom' ) {
\tforeach ( wphx_312_16_current_post()->categories as $category ) {
\t\techo "\\t\\t<category term=\\"" . htmlspecialchars( $category, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . "\\" />\\n";
\t}
}
function the_excerpt_rss() { echo wphx_312_16_current_post()->excerpt; }
function the_content_feed( $feed_type = null ) { echo wphx_312_16_current_post()->content; }
function atom_enclosure() {
\t$enclosure = wphx_312_16_current_post()->enclosure;
\tif ( '' !== $enclosure ) {
\t\techo "\\t\\t<link rel=\\"enclosure\\" href=\\"" . esc_url( $enclosure ) . "\\" length=\\"1234\\" type=\\"audio/mpeg\\" />\\n";
\t}
}
function get_comments_number() { return wphx_312_16_current_post()->comments_number; }
function comments_open() { return wphx_312_16_current_post()->comments_open; }
function get_post_comments_feed_link( $post_id = 0, $feed = '' ) { return wphx_312_16_current_post()->comments_feed; }
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
    entry_count: (body.match(/<entry>/g) ?? []).length,
    has_content: body.includes("<content "),
    has_author_uri: body.includes("<uri>https://authors.example.test/fixture</uri>"),
    has_reply_links: body.includes('rel="replies"'),
    has_thr_total: body.includes("<thr:total>"),
    has_enclosure: body.includes('rel="enclosure"'),
    has_fixture_namespace: body.includes('xmlns:fixture="https://fixture.example/atom"'),
    has_head_action_output: body.includes("<fixture:head>yes</fixture:head>"),
    has_author_action_output: body.includes("<fixture:author marker="),
    has_entry_action_output: body.includes("<fixture:entry marker=")
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
  const prepend = resolve(`${root}/atom-prepend.php`);
  const proc = spawn("php", ["-d", `auto_prepend_file=${prepend}`, "-S", `127.0.0.1:${port}`, "-t", root], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (proc.exitCode !== null) {
      throw new Error(`php -S exited early for ${root}: ${stderr}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/wp-includes/feed-atom.php?case=full`);
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
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-atom-feed-template-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/atom-feed-template-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Atom post feed template output behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/feed-atom.php through PHP's built-in HTTP server with a deterministic auto-prepended feed-loop stub. It observes content-type headers and Atom XML output without database-backed WP_Query, installed feed routing, or live network behavior."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-feed-loop-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed feed routing, database-backed WP_Query/post/comment/enclosure behavior, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-atom-feed-template-oracle-fixture",
        "npm run wp:core:wphx-312-atom-feed-template-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-16-atom-feed-template-oracle-fixture"],
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
    schema: "wphx.wp-core-atom-feed-template-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "http_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      feed_embed_fixture_manifest: inputRecord(FEED_EMBED_FIXTURE),
      installed_gate_manifest: inputRecord(INSTALLED_GATE),
      rss2_fixture_manifest: inputRecord(RSS2_FIXTURE),
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
        auto_prepend_stub: "atom-prepend.php supplies deterministic feed-loop functions; copied feed-atom.php remains the executed template."
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
        id: "installed-feed-routing-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture executes the Atom template directly through a local PHP server. do_feed_atom routing, query resolution, canonical URL behavior, and browser-observed installed routing remain later gates."
      },
      {
        id: "database-backed-post-comment-loop-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture stubs the post loop, author metadata, comments, categories, dates, and enclosures. Database-backed WP_Query, comment, taxonomy, media/enclosure, and cache behavior remain covered by other domains or later integration gates."
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
    id: "receipt:wphx-312-16-atom-feed-template-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "Atom feed template oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle Atom feed template boundary" },
      { path: RUNNER, role: "deterministic HTTP-observed oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-atom-feed-template-oracle-fixture",
      "npm run wp:core:wphx-312-atom-feed-template-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-04-feed-embed-https-oracle-fixture",
      "receipt:wphx-312-09-http-mail-feed-embed-installed-gate",
      "receipt:wphx-312-15-rss2-feed-template-oracle-fixture"
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
}

await main();
