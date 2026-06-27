#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.18",
  external_ref: "WPHX-312.18",
  title: "WPHX-312.18 - Add Atom comments feed template oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-atom-comments-feed-template-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-18";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-18-atom-comments-feed-template-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-18-atom-comments-feed-template-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-18-atom-comments-feed-template-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const RSS2_FIXTURE = "manifests/wp-core/wphx-312-15-rss2-feed-template-oracle-fixture.v1.json";
const ATOM_FIXTURE = "manifests/wp-core/wphx-312-16-atom-feed-template-oracle-fixture.v1.json";
const RSS2_COMMENTS_FIXTURE = "manifests/wp-core/wphx-312-17-rss2-comments-feed-template-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/feed-atom-comments.php"];
const COVERED_SYMBOLS = [
  "feed-atom-comments.php",
  "feed_content_type",
  "rss_tag_pre",
  "atom_ns",
  "atom_comments_ns",
  "is_singular",
  "is_search",
  "get_bloginfo_rss",
  "get_wp_title_rss",
  "comments_atom_head",
  "have_comments",
  "the_comment",
  "get_post",
  "the_title_rss",
  "the_title_rss filter",
  "get_comment_author_rss",
  "comment_link",
  "comment_author_rss",
  "get_comment_author_url",
  "comment_guid",
  "post_password_required",
  "comment_text",
  "get_comment",
  "get_comment_link",
  "comment_atom_entry"
];
const CASES = [
  { id: "atom-comments:default", path: "/wp-includes/feed-atom-comments.php?case=default", focus: "default site comments feed title, Atom metadata links, namespace actions, top-level threading, and entry hook output" },
  { id: "atom-comments:singular", path: "/wp-includes/feed-atom-comments.php?case=singular", focus: "singular comments feed title, self/alternate post comment links, and By-author entry title branch" },
  { id: "atom-comments:search", path: "/wp-includes/feed-atom-comments.php?case=search", focus: "search comments feed title and search comments feed self/id links" },
  { id: "atom-comments:protected", path: "/wp-includes/feed-atom-comments.php?case=protected", focus: "protected comment branch emits password form content inside Atom CDATA" },
  { id: "atom-comments:threaded", path: "/wp-includes/feed-atom-comments.php?case=threaded", focus: "reply comment branch resolves parent comment GUID/link and renders multiple entries" }
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
    `${root}/atom-comments-prepend.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$GLOBALS['wphx_312_18_case'] = $_GET['case'] ?? 'default';
$GLOBALS['wphx_312_18_index'] = -1;
$GLOBALS['comment'] = null;
$GLOBALS['post'] = null;

function wphx_312_18_posts() {
\treturn array(
\t\t101 => (object) array( 'ID' => 101, 'title' => 'Alpha & Commented', 'permalink' => 'https://example.test/posts/alpha', 'guid' => 'post-guid-101', 'protected' => 'protected' === $GLOBALS['wphx_312_18_case'] ),
\t\t202 => (object) array( 'ID' => 202, 'title' => 'Beta Commented', 'permalink' => 'https://example.test/posts/beta', 'protected' => false ),
\t);
}
function wphx_312_18_comments() {
\t$base = array(
\t\t(object) array( 'comment_ID' => 501, 'comment_post_ID' => 101, 'comment_parent' => '0', 'author' => 'Alice & Author', 'author_url' => 'https://authors.example.test/alice', 'time' => '2026-06-01 03:04:05', 'guid' => 'comment-guid-501', 'html' => '<p>Alice <strong>html</strong></p>' ),
\t\t(object) array( 'comment_ID' => 502, 'comment_post_ID' => 101, 'comment_parent' => '501', 'author' => 'Bob Author', 'author_url' => '', 'time' => '2026-06-02 04:05:06', 'guid' => 'comment-guid-502', 'html' => '<p>Bob reply html</p>' ),
\t);
\treturn 'threaded' === $GLOBALS['wphx_312_18_case'] ? $base : array( $base[0] );
}
function wphx_312_18_current_comment() {
\t$comments = wphx_312_18_comments();
\treturn $comments[ $GLOBALS['wphx_312_18_index'] ] ?? $comments[0];
}
function feed_content_type( $type = '' ) { return 'atom' === $type ? 'application/atom+xml' : 'application/octet-stream'; }
function get_option( $name, $default = false ) { return 'blog_charset' === $name ? 'UTF-8' : $default; }
function do_action( $hook_name, ...$args ) {
\tif ( 'rss_tag_pre' === $hook_name ) {
\t\techo "\\n<!-- rss_tag_pre:" . $args[0] . " -->\\n";
\t}
\tif ( 'atom_ns' === $hook_name ) {
\t\techo 'xmlns:fixture="https://fixture.example/atom-comments"';
\t}
\tif ( 'atom_comments_ns' === $hook_name ) {
\t\techo "\\n\\txmlns:commentsfixture=\\"https://fixture.example/atom-comments/ns\\"";
\t}
\tif ( 'comments_atom_head' === $hook_name ) {
\t\techo "\\t<fixture:head>comments</fixture:head>\\n";
\t}
\tif ( 'comment_atom_entry' === $hook_name ) {
\t\techo "\\t\\t<fixture:entry marker=\\"" . $args[0] . ":" . $args[1] . "\\" />\\n";
\t}
}
function apply_filters( $hook_name, $value, ...$args ) {
\tif ( 'the_title_rss' === $hook_name ) {
\t\treturn 'Filtered ' . $value;
\t}
\treturn $value;
}
function __( $text ) { return $text; }
function ent2ncr( $text ) { return (string) $text; }
function is_singular() { return in_array( $GLOBALS['wphx_312_18_case'], array( 'singular', 'protected' ), true ); }
function is_search() { return 'search' === $GLOBALS['wphx_312_18_case']; }
function is_single() { return is_singular(); }
function get_the_title_rss() { return 'Alpha &amp; Commented'; }
function get_bloginfo_rss( $show = '' ) {
\t$values = array( 'name' => 'Fixture Site', 'url' => 'https://example.test', 'description' => 'Fixture comments feed', 'language' => 'en-US', 'html_type' => 'text/html', 'comments_atom_url' => 'https://example.test/comments/feed/atom/' );
\treturn $values[ $show ] ?? 'Fixture Site';
}
function bloginfo_rss( $show = '' ) { echo get_bloginfo_rss( $show ); }
function get_search_query() { return 'haxe ports'; }
function get_wp_title_rss() { return 'Fixture Site Comments'; }
function home_url() { return 'https://example.test'; }
function comments_link_feed() { echo 'https://example.test/posts/alpha#comments'; }
function get_post_comments_feed_link( $post_id = 0, $feed = '' ) { return 'https://example.test/posts/alpha/comments/feed/' . $feed; }
function get_search_comments_feed_link( $link = '', $feed = '' ) { return 'https://example.test/search/comments/feed/' . $feed . '?s=haxe%20ports'; }
function esc_url( $value ) { return (string) $value; }
function get_feed_build_date( $format ) { return '2026-06-27T00:00:00Z'; }
function the_permalink_rss() { echo 'https://example.test/posts/alpha'; }
function the_guid() { echo 'post-guid-101'; }
function have_comments() { return $GLOBALS['wphx_312_18_index'] + 1 < count( wphx_312_18_comments() ); }
function the_comment() {
\t$GLOBALS['wphx_312_18_index']++;
\t$GLOBALS['comment'] = wphx_312_18_current_comment();
}
function get_post( $post_id ) {
\t$posts = wphx_312_18_posts();
\treturn $posts[ $post_id ] ?? null;
}
function get_the_title( $post_id = 0 ) {
\t$post = get_post( $post_id );
\treturn $post ? $post->title : '';
}
function get_comment_author_rss() { return wphx_312_18_current_comment()->author; }
function comment_author_rss() { echo get_comment_author_rss(); }
function get_comment_author_url() { return wphx_312_18_current_comment()->author_url; }
function comment_link() { echo 'https://example.test/comments/' . wphx_312_18_current_comment()->comment_ID; }
function get_comment_link( $comment = null ) { $comment = $comment ?: wphx_312_18_current_comment(); return 'https://example.test/comments/' . $comment->comment_ID; }
function mysql2date( $format, $date, $translate = false ) { return gmdate( 'Y-m-d\\TH:i:s\\Z', strtotime( $date . ' UTC' ) ); }
function get_comment_time( $format, $gmt = true, $translate = false ) { return wphx_312_18_current_comment()->time; }
function comment_guid( $comment = null ) { $comment = $comment ?: wphx_312_18_current_comment(); echo $comment->guid; }
function get_comment( $comment_id ) {
\tforeach ( wphx_312_18_comments() as $comment ) {
\t\tif ( (string) $comment->comment_ID === (string) $comment_id ) {
\t\t\treturn $comment;
\t\t}
\t}
\treturn null;
}
function post_password_required( $post = null ) { return $post && ! empty( $post->protected ); }
function get_the_password_form() { return '<form>Password</form>'; }
function comment_text() { echo wphx_312_18_current_comment()->html; }
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
    has_fixture_namespace: body.includes('xmlns:fixture="https://fixture.example/atom-comments"'),
    has_comments_namespace: body.includes('xmlns:commentsfixture="https://fixture.example/atom-comments/ns"'),
    has_head_action_output: body.includes("<fixture:head>comments</fixture:head>"),
    has_entry_action_output: body.includes("<fixture:entry marker="),
    has_search_title: body.includes("Comments for Fixture Site searching on haxe ports"),
    has_singular_title: body.includes("Comments on Alpha &amp; Commented"),
    has_default_self_link: body.includes("<id>https://example.test/comments/feed/atom/</id>"),
    has_search_self_link: body.includes("<id>https://example.test/search/comments/feed/atom?s=haxe%20ports</id>"),
    has_author_uri: body.includes("<uri>https://authors.example.test/alice</uri>"),
    has_top_level_thread_ref: body.includes('thr:in-reply-to ref="post-guid-101"'),
    has_parent_thread_ref: body.includes('thr:in-reply-to ref="comment-guid-501"'),
    has_password_form: body.includes("<form>Password</form>"),
    has_comment_content: body.includes('<content type="html" xml:base="https://example.test/comments/501"><![CDATA[<p>Alice <strong>html</strong></p>]]></content>')
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
  const prepend = resolve(`${root}/atom-comments-prepend.php`);
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
      const response = await fetch(`http://127.0.0.1:${port}/wp-includes/feed-atom-comments.php?case=default`);
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
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-atom-comments-feed-template-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/atom-comments-feed-template-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Atom comments feed template output behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/feed-atom-comments.php through PHP's built-in HTTP server with a deterministic auto-prepended comment-loop stub. It observes content-type headers and Atom comments XML output without database-backed comments, installed feed routing, or live network behavior."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-comment-loop-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed feed routing, database-backed comment/post/password behavior, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-atom-comments-feed-template-oracle-fixture",
        "npm run wp:core:wphx-312-atom-comments-feed-template-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-18-atom-comments-feed-template-oracle-fixture"],
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
    schema: "wphx.wp-core-atom-comments-feed-template-oracle-fixture.v1",
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
      rss2_comments_fixture_manifest: inputRecord(RSS2_COMMENTS_FIXTURE),
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
        auto_prepend_stub: "atom-comments-prepend.php supplies deterministic comment-loop functions; copied feed-atom-comments.php remains the executed template."
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
        id: "installed-comments-feed-routing-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture executes the Atom comments template directly through a local PHP server. do_feed_atom_comments routing, query resolution, canonical URL behavior, and browser-observed installed routing remain later gates."
      },
      {
        id: "database-backed-comment-post-loop-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture stubs comments, posts, title/search/singular state, protected-post checks, dates, and content. Database-backed comment, post, password, taxonomy, and cache behavior remain covered by other domains or later integration gates."
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
      database_backed_comment_loop_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-18-atom-comments-feed-template-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "Atom comments feed template oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle Atom comments feed template boundary" },
      { path: RUNNER, role: "deterministic HTTP-observed oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-atom-comments-feed-template-oracle-fixture",
      "npm run wp:core:wphx-312-atom-comments-feed-template-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-15-rss2-feed-template-oracle-fixture",
      "receipt:wphx-312-16-atom-feed-template-oracle-fixture",
      "receipt:wphx-312-17-rss2-comments-feed-template-oracle-fixture"
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
