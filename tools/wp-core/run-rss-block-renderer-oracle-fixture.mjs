#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-hc3",
  external_ref: "WPHX-312.27",
  title: "WPHX-312.27 - Add RSS block renderer oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-rss-block-renderer-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-27";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-27-rss-block-renderer-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-27-rss-block-renderer-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-27-rss-block-renderer-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const WIDGET_CLASS_FIXTURE = "manifests/wp-core/wphx-312-26-wp-widget-rss-class-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/blocks/rss.php"];
const COVERED_SYMBOLS = [
  "blocks/rss.php",
  "render_block_core_rss",
  "register_block_core_rss",
  "fetch_feed",
  "is_wp_error",
  "untrailingslashit",
  "site_url",
  "home_url",
  "esc_html",
  "esc_attr",
  "esc_url",
  "__",
  "get_option",
  "date_i18n",
  "wp_trim_words",
  "get_block_wrapper_attributes",
  "register_block_type_from_metadata",
  "add_action",
  "HOUR_IN_SECONDS",
  "SimplePie-like get_item_quantity",
  "SimplePie-like get_items"
];
const CASES = [
  { id: "rss-block:self-feed-guard", focus: "homepage/self-feed guard returns a placeholder and avoids fetch_feed" },
  { id: "rss-block:error-placeholder", focus: "WP_Error fetch result returns an RSS Error placeholder with escaped message" },
  { id: "rss-block:empty-placeholder", focus: "empty feed returns the feed-down placeholder" },
  { id: "rss-block:render-full", focus: "linked item rendering with target/rel, date, author, excerpt, grid classes, and wrapper attributes" },
  { id: "rss-block:registration", focus: "add_action hook and register_block_type_from_metadata render callback registration" }
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

function writeProbe(root) {
  writeFileSync(
    `${root}/probe.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$case = $argv[1] ?? '';

$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_fetches'] = array();
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_registrations'] = array();
$GLOBALS['wphx_escape_calls'] = array();
$GLOBALS['wphx_option_calls'] = array();
$GLOBALS['wphx_wrapper_calls'] = array();

define( 'HOUR_IN_SECONDS', 3600 );

class WP_Error {
\tprivate $message;

\tpublic function __construct( $code, $message ) {
\t\t$this->message = $message;
\t}

\tpublic function get_error_message() {
\t\treturn $this->message;
\t}
}

class WPHX_Block_Author {
\tprivate $name;

\tpublic function __construct( $name ) {
\t\t$this->name = $name;
\t}

\tpublic function get_name() {
\t\treturn $this->name;
\t}
}

class WPHX_Block_Item {
\tprivate $title;
\tprivate $link;
\tprivate $date;
\tprivate $author;
\tprivate $description;

\tpublic function __construct( $title, $link, $date, $author, $description ) {
\t\t$this->title       = $title;
\t\t$this->link        = $link;
\t\t$this->date        = $date;
\t\t$this->author      = $author;
\t\t$this->description = $description;
\t}

\tpublic function get_title() {
\t\treturn $this->title;
\t}

\tpublic function get_link() {
\t\treturn $this->link;
\t}

\tpublic function get_date( $format = '' ) {
\t\treturn $this->date;
\t}

\tpublic function get_author() {
\t\treturn $this->author ? new WPHX_Block_Author( $this->author ) : null;
\t}

\tpublic function get_description() {
\t\treturn $this->description;
\t}
}

class WPHX_Block_Feed {
\tprivate $kind;
\tprivate $items;

\tpublic function __construct( $kind = 'normal' ) {
\t\t$this->kind = $kind;
\t\tif ( 'empty' === $kind ) {
\t\t\t$this->items = array();
\t\t} else {
\t\t\t$this->items = array(
\t\t\t\tnew WPHX_Block_Item( 'Alpha <One>', 'https://example.test/alpha?x=1&y=2', 1782518400, 'Alice <Admin>', 'Alpha summary with enough words to trim cleanly [...]' ),
\t\t\t\tnew WPHX_Block_Item( '', '', 0, '', 'Beta description with no title or link' ),
\t\t\t\tnew WPHX_Block_Item( 'Gamma', 'https://example.test/gamma', 1782604800, 'Gamma Author', 'Gamma summary' ),
\t\t\t);
\t\t}
\t}

\tpublic function get_item_quantity() {
\t\treturn count( $this->items );
\t}

\tpublic function get_items( $start = 0, $items = 0 ) {
\t\treturn array_slice( $this->items, $start, $items );
\t}
}

function fetch_feed( $url ) {
\t$GLOBALS['wphx_fetches'][] = $url;
\tif ( false !== strpos( $url, 'error' ) ) {
\t\treturn new WP_Error( 'fixture_error', 'Fixture feed error' );
\t}
\tif ( false !== strpos( $url, 'empty' ) ) {
\t\treturn new WPHX_Block_Feed( 'empty' );
\t}
\treturn new WPHX_Block_Feed( 'normal' );
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}

function untrailingslashit( $value ) {
\treturn rtrim( $value, '/' );
}

function site_url() {
\treturn 'https://example.test/site';
}

function home_url() {
\treturn 'https://example.test/home';
}

function __( $value ) {
\treturn $value;
}

function esc_url( $value ) {
\t$GLOBALS['wphx_escape_calls'][] = array( 'esc_url', $value );
\treturn 'esc_url:' . htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
}

function esc_attr( $value ) {
\t$GLOBALS['wphx_escape_calls'][] = array( 'esc_attr', $value );
\treturn 'esc_attr:' . htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
}

function esc_html( $value ) {
\t$GLOBALS['wphx_escape_calls'][] = array( 'esc_html', $value );
\treturn 'esc_html:' . htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
}

function get_option( $name ) {
\t$GLOBALS['wphx_option_calls'][] = $name;
\tif ( 'gmt_offset' === $name ) {
\t\treturn '2';
\t}
\tif ( 'date_format' === $name ) {
\t\treturn 'Y-m-d';
\t}
\tif ( 'blog_charset' === $name ) {
\t\treturn 'UTF-8';
\t}
\treturn null;
}

function date_i18n( $format, $timestamp ) {
\treturn gmdate( $format, $timestamp );
}

function wp_trim_words( $text, $num_words = 55, $more = null ) {
\t$words = preg_split( '/\\s+/', trim( strip_tags( $text ) ) );
\tif ( count( $words ) > $num_words ) {
\t\treturn implode( ' ', array_slice( $words, 0, $num_words ) ) . $more;
\t}
\treturn implode( ' ', $words );
}

function get_block_wrapper_attributes( $attrs = array() ) {
\t$GLOBALS['wphx_wrapper_calls'][] = $attrs;
\t$class = trim( 'wp-block-rss ' . ( $attrs['class'] ?? '' ) );
\treturn 'class="' . esc_attr( $class ) . '"';
}

function register_block_type_from_metadata( $path, $args = array() ) {
\t$normalized_path = preg_replace( '#^.*?/wp-includes/#', 'wp-includes/', $path );
\t$GLOBALS['wphx_registrations'][] = array( 'path' => $normalized_path, 'args' => $args );
\treturn array( 'path' => $normalized_path, 'args' => $args );
}

function add_action( $hook_name, $callback ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook_name, 'callback' => $callback );
}

require __DIR__ . '/wp-includes/blocks/rss.php';

function wphx_attrs( $overrides = array() ) {
\treturn array_merge(
\t\tarray(
\t\t\t'feedURL' => 'https://example.test/feed',
\t\t\t'itemsToShow' => 2,
\t\t\t'openInNewTab' => false,
\t\t\t'rel' => '',
\t\t\t'displayDate' => false,
\t\t\t'displayAuthor' => false,
\t\t\t'displayExcerpt' => false,
\t\t\t'excerptLength' => 6,
\t\t\t'blockLayout' => 'list',
\t\t\t'columns' => 2,
\t\t),
\t\t$overrides
\t);
}

function wphx_render_result( $attributes ) {
\t$output = render_block_core_rss( $attributes );
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'output' => $output,
\t\t'output_sha256' => hash( 'sha256', $output ),
\t\t'fetches' => $GLOBALS['wphx_fetches'],
\t\t'actions' => $GLOBALS['wphx_actions'],
\t\t'registrations' => $GLOBALS['wphx_registrations'],
\t\t'escape_calls' => $GLOBALS['wphx_escape_calls'],
\t\t'option_calls' => $GLOBALS['wphx_option_calls'],
\t\t'wrapper_calls' => $GLOBALS['wphx_wrapper_calls'],
\t);
}

function wphx_self_feed_guard() {
\treturn wphx_render_result( wphx_attrs( array( 'feedURL' => 'https://example.test/home/' ) ) );
}

function wphx_error_placeholder() {
\treturn wphx_render_result( wphx_attrs( array( 'feedURL' => 'https://example.test/error' ) ) );
}

function wphx_empty_placeholder() {
\treturn wphx_render_result( wphx_attrs( array( 'feedURL' => 'https://example.test/empty' ) ) );
}

function wphx_render_full() {
\treturn wphx_render_result(
\t\twphx_attrs(
\t\t\tarray(
\t\t\t\t'openInNewTab' => true,
\t\t\t\t'rel' => 'nofollow noopener',
\t\t\t\t'displayDate' => true,
\t\t\t\t'displayAuthor' => true,
\t\t\t\t'displayExcerpt' => true,
\t\t\t\t'excerptLength' => 6,
\t\t\t\t'blockLayout' => 'grid',
\t\t\t\t'columns' => 3,
\t\t\t)
\t\t)
\t);
}

function wphx_registration() {
\t$result = register_block_core_rss();
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'actions' => $GLOBALS['wphx_actions'],
\t\t'registrations' => $GLOBALS['wphx_registrations'],
\t\t'return_value' => $result,
\t);
}

$handlers = array(
\t'rss-block:self-feed-guard' => 'wphx_self_feed_guard',
\t'rss-block:error-placeholder' => 'wphx_error_placeholder',
\t'rss-block:empty-placeholder' => 'wphx_empty_placeholder',
\t'rss-block:render-full' => 'wphx_render_full',
\t'rss-block:registration' => 'wphx_registration',
);

if ( ! isset( $handlers[ $case ] ) ) {
\tfwrite( STDERR, "Unknown case: $case\\n" );
\texit( 2 );
}

echo json_encode( $handlers[ $case ](), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\\n";
`
  );
}

function runProbe(root, caseId) {
  const stdout = command("php", ["probe.php", caseId], { cwd: root });
  return JSON.parse(stdout);
}

function runAllCases(root) {
  return Object.fromEntries(CASES.map((fixtureCase) => [fixtureCase.id, runProbe(root, fixtureCase.id)]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-rss-block-renderer-oracle-fixture`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rss-block-renderer-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "core/rss block server renderer behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/blocks/rss.php in PHP CLI with deterministic feed, block wrapper, escaping, date, option, action, and registration stubs. It observes render_block_core_rss and register_block_core_rss behavior without installed block editor behavior, client-side block rendering, live network feeds, database-backed feeds, full block registry integration, or generated public PHP replacement."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed block registry/rendering, editor/client behavior, live/recorded feed, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-rss-block-renderer-oracle-fixture",
        "npm run wp:core:wphx-312-rss-block-renderer-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-27-rss-block-renderer-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function summarize(observations) {
  return {
    self_guard_fetch_count: observations["rss-block:self-feed-guard"].fetches.length,
    error_placeholder: observations["rss-block:error-placeholder"].output,
    empty_placeholder_present: observations["rss-block:empty-placeholder"].output.includes("feed is down"),
    render_full_sha256: observations["rss-block:render-full"].output_sha256,
    render_full_wrapper_class: observations["rss-block:render-full"].wrapper_calls[0]?.class,
    registration_hook: observations["rss-block:registration"].actions[0]?.hook,
    registration_callback: observations["rss-block:registration"].registrations[0]?.args?.render_callback
  };
}

function buildRoot(root) {
  mirrorSources(root);
  writeProbe(root);
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  buildRoot(ORACLE_ROOT);
  buildRoot(CANDIDATE_ROOT);

  const oracle = runAllCases(ORACLE_ROOT);
  const candidate = runAllCases(CANDIDATE_ROOT);
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
  const probeLint = {
    oracle_lint: command("php", ["-l", `${ORACLE_ROOT}/probe.php`]),
    candidate_lint: command("php", ["-l", `${CANDIDATE_ROOT}/probe.php`])
  };

  const manifest = {
    schema: "wphx.wp-core-rss-block-renderer-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      wp_widget_rss_class_fixture_manifest: inputRecord(WIDGET_CLASS_FIXTURE),
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
        php_cli: true,
        wordPress_stubs:
          "fetch_feed, SimplePie-like feed/item/author objects, is_wp_error, untrailingslashit, site_url, home_url, escaping, translation, get_option, date_i18n, wp_trim_words, get_block_wrapper_attributes, register_block_type_from_metadata, and add_action are deterministic local stubs; copied blocks/rss.php remains the executed RSS block renderer source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      },
      renderer_quirks_observed: [
        "Self-home feed URLs return the explicit loop-prevention placeholder before fetch_feed.",
        "openInNewTab and rel attributes are appended directly to rendered item links after rel escaping.",
        "date output applies gmt_offset in HOUR_IN_SECONDS before date_i18n formatting.",
        "grid, date, author, and excerpt attributes contribute wrapper classes through get_block_wrapper_attributes."
      ]
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint, probe_lint: probeLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      summary: summarize(oracle),
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate))
    },
    remaining_gaps: [
      {
        id: "installed-block-registry-editor-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes the copied server renderer directly. Installed block registry integration, editor/client rendering, block metadata loading, and asset behavior remain later gates."
      },
      {
        id: "live-network-and-database-feeds-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses deterministic fetch_feed and feed object stubs. Live/recorded network feeds and database-backed feed state remain outside this claim."
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
      live_network_behavior_claimed: false,
      client_side_block_behavior_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-27-rss-block-renderer-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "RSS block renderer oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle RSS block renderer boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-rss-block-renderer-oracle-fixture",
      "npm run wp:core:wphx-312-rss-block-renderer-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-26-wp-widget-rss-class-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n");
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
