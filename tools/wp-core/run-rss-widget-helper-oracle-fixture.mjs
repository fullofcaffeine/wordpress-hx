#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-psk",
  external_ref: "WPHX-312.25",
  title: "WPHX-312.25 - Add RSS widget helper oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-rss-widget-helper-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-25";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-25-rss-widget-helper-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-25-rss-widget-helper-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-25-rss-widget-helper-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const DISPLAY_FIXTURE = "manifests/wp-core/wphx-312-24-magpie-rss-display-helper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/widgets.php"];
const COVERED_SYMBOLS = [
  "widgets.php",
  "wp_widget_rss_output",
  "wp_widget_rss_process",
  "fetch_feed",
  "is_wp_error",
  "is_admin",
  "current_user_can",
  "wp_parse_args",
  "esc_url",
  "esc_attr",
  "esc_html",
  "__",
  "sanitize_url",
  "wp_trim_words",
  "date_i18n",
  "get_option",
  "SimplePie-like get_item_quantity",
  "SimplePie-like get_items",
  "SimplePie-like get_permalink",
  "SimplePie-like __destruct"
];
const CASES = [
  { id: "rss-widget:output-full", focus: "wp_widget_rss_output item rendering with summary, date, author, link trimming, and item limit" },
  { id: "rss-widget:output-empty", focus: "wp_widget_rss_output empty-feed fallback message and destructor call" },
  { id: "rss-widget:output-error-visible", focus: "wp_widget_rss_output WP_Error branch visible to admin/manage_options" },
  { id: "rss-widget:process-success", focus: "wp_widget_rss_process sanitizes settings, clamps items, fetches feed, normalizes permalink, and destructs" },
  { id: "rss-widget:process-error", focus: "wp_widget_rss_process records feed error when check_feed is enabled" }
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

$GLOBALS['wp_version'] = '7.0-fixture';
$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_fetches'] = array();
$GLOBALS['wphx_escape_calls'] = array();
$GLOBALS['wphx_option_calls'] = array();
$GLOBALS['wphx_destructed_feeds'] = array();
$GLOBALS['wphx_admin'] = 'rss-widget:output-error-visible' === $case;
$GLOBALS['wphx_can_manage_options'] = 'rss-widget:output-error-visible' === $case;

class WP_Error {
\tprivate $message;

\tpublic function __construct( $code, $message ) {
\t\t$this->message = $message;
\t}

\tpublic function get_error_message() {
\t\treturn $this->message;
\t}
}

class WPHX_Fixture_Author {
\tprivate $name;

\tpublic function __construct( $name ) {
\t\t$this->name = $name;
\t}

\tpublic function get_name() {
\t\treturn $this->name;
\t}
}

class WPHX_Fixture_Item {
\tprivate $link;
\tprivate $title;
\tprivate $description;
\tprivate $date;
\tprivate $author;

\tpublic function __construct( $link, $title, $description, $date = 0, $author = null ) {
\t\t$this->link        = $link;
\t\t$this->title       = $title;
\t\t$this->description = $description;
\t\t$this->date        = $date;
\t\t$this->author      = $author;
\t}

\tpublic function get_link() {
\t\treturn $this->link;
\t}

\tpublic function get_title() {
\t\treturn $this->title;
\t}

\tpublic function get_description() {
\t\treturn $this->description;
\t}

\tpublic function get_date( $format = '' ) {
\t\treturn $this->date;
\t}

\tpublic function get_author() {
\t\treturn $this->author ? new WPHX_Fixture_Author( $this->author ) : null;
\t}
}

class WPHX_Fixture_Feed {
\tprivate $kind;
\tprivate $items;
\tprivate $permalink;

\tpublic function __construct( $kind = 'normal' ) {
\t\t$this->kind = $kind;
\t\tif ( 'empty' === $kind ) {
\t\t\t$this->items = array();
\t\t} else {
\t\t\t$this->items = array(
\t\t\t\tnew WPHX_Fixture_Item( '/https://example.test/alpha?x=1&y=2', 'Alpha <One>', 'Alpha summary with many fixture words for trimming [...]', 1782518400, 'Alice <Admin>' ),
\t\t\t\tnew WPHX_Fixture_Item( 'https://example.test/beta', '', 'Beta description', 1782604800, null ),
\t\t\t\tnew WPHX_Fixture_Item( '', 'No Link', 'No link description', 0, 'No Link Author' ),
\t\t\t);
\t\t}
\t\t$this->permalink = '/https://example.test/feed-home';
\t}

\tpublic function get_item_quantity() {
\t\treturn count( $this->items );
\t}

\tpublic function get_items( $start = 0, $items = 0 ) {
\t\treturn array_slice( $this->items, $start, $items );
\t}

\tpublic function get_permalink() {
\t\treturn $this->permalink;
\t}

\tpublic function __destruct() {
\t\t$GLOBALS['wphx_destructed_feeds'][] = $this->kind;
\t}
}

function fetch_feed( $url ) {
\t$GLOBALS['wphx_fetches'][] = $url;
\tif ( false !== strpos( $url, 'error' ) ) {
\t\treturn new WP_Error( 'fixture_feed_error', 'Fixture feed error' );
\t}
\tif ( false !== strpos( $url, 'empty' ) ) {
\t\treturn new WPHX_Fixture_Feed( 'empty' );
\t}
\treturn new WPHX_Fixture_Feed( 'normal' );
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}

function is_admin() {
\treturn $GLOBALS['wphx_admin'];
}

function current_user_can( $capability ) {
\treturn 'manage_options' === $capability && $GLOBALS['wphx_can_manage_options'];
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

function sanitize_url( $value ) {
\treturn 'sanitized:' . trim( $value );
}

function wp_parse_args( $args, $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$args = get_object_vars( $args );
\t}
\tif ( ! is_array( $args ) ) {
\t\tparse_str( (string) $args, $args );
\t}
\treturn array_merge( $defaults, $args );
}

function get_option( $name ) {
\t$GLOBALS['wphx_option_calls'][] = $name;
\tif ( 'blog_charset' === $name ) {
\t\treturn 'UTF-8';
\t}
\tif ( 'date_format' === $name ) {
\t\treturn 'Y-m-d';
\t}
\treturn null;
}

function wp_trim_words( $text, $num_words = 55, $more = null ) {
\t$words = preg_split( '/\\s+/', trim( wp_strip_all_tags( $text ) ) );
\tif ( count( $words ) > $num_words ) {
\t\treturn implode( ' ', array_slice( $words, 0, $num_words ) ) . $more;
\t}
\treturn implode( ' ', $words );
}

function wp_strip_all_tags( $text ) {
\treturn strip_tags( $text );
}

function date_i18n( $format, $timestamp ) {
\treturn gmdate( $format, $timestamp );
}

require __DIR__ . '/wp-includes/widgets.php';

function wphx_capture( $callback ) {
\tob_start();
\t$return = $callback();
\t$output = ob_get_clean();
\treturn array( $output, $return );
}

function wphx_output_result( $output, $return ) {
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'output' => $output,
\t\t'output_sha256' => hash( 'sha256', $output ),
\t\t'return_value' => $return,
\t\t'fetches' => $GLOBALS['wphx_fetches'],
\t\t'escape_calls' => $GLOBALS['wphx_escape_calls'],
\t\t'option_calls' => $GLOBALS['wphx_option_calls'],
\t\t'destructed_feeds' => $GLOBALS['wphx_destructed_feeds'],
\t);
}

function wphx_output_full() {
\tlist( $output, $return ) = wphx_capture( function () {
\t\treturn wp_widget_rss_output(
\t\t\t'https://example.test/feed',
\t\t\tarray(
\t\t\t\t'items' => 2,
\t\t\t\t'show_summary' => 1,
\t\t\t\t'show_author' => 1,
\t\t\t\t'show_date' => 1,
\t\t\t)
\t\t);
\t} );
\treturn wphx_output_result( $output, $return );
}

function wphx_output_empty() {
\tlist( $output, $return ) = wphx_capture( function () {
\t\treturn wp_widget_rss_output( 'https://example.test/empty', array( 'items' => 5 ) );
\t} );
\treturn wphx_output_result( $output, $return );
}

function wphx_output_error_visible() {
\tlist( $output, $return ) = wphx_capture( function () {
\t\treturn wp_widget_rss_output( 'https://example.test/error', array( 'items' => 5 ) );
\t} );
\treturn wphx_output_result( $output, $return );
}

function wphx_process_success() {
\t$result = wp_widget_rss_process(
\t\tarray(
\t\t\t'url' => '<b>https://example.test/feed</b>',
\t\t\t'title' => '<em> Fixture Title </em>',
\t\t\t'items' => 99,
\t\t\t'show_summary' => '1',
\t\t\t'show_author' => '0',
\t\t\t'show_date' => '1',
\t\t),
\t\ttrue
\t);
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'result' => $result,
\t\t'fetches' => $GLOBALS['wphx_fetches'],
\t\t'escape_calls' => $GLOBALS['wphx_escape_calls'],
\t\t'destructed_feeds' => $GLOBALS['wphx_destructed_feeds'],
\t);
}

function wphx_process_error() {
\t$result = wp_widget_rss_process(
\t\tarray(
\t\t\t'url' => 'https://example.test/error',
\t\t\t'title' => 'Error Title',
\t\t\t'items' => 0,
\t\t\t'show_summary' => 0,
\t\t\t'show_author' => 1,
\t\t\t'show_date' => 0,
\t\t),
\t\ttrue
\t);
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'result' => $result,
\t\t'fetches' => $GLOBALS['wphx_fetches'],
\t\t'escape_calls' => $GLOBALS['wphx_escape_calls'],
\t\t'destructed_feeds' => $GLOBALS['wphx_destructed_feeds'],
\t);
}

$handlers = array(
\t'rss-widget:output-full' => 'wphx_output_full',
\t'rss-widget:output-empty' => 'wphx_output_empty',
\t'rss-widget:output-error-visible' => 'wphx_output_error_visible',
\t'rss-widget:process-success' => 'wphx_process_success',
\t'rss-widget:process-error' => 'wphx_process_error',
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-rss-widget-helper-oracle-fixture`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rss-widget-helper-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "RSS widget helper behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/widgets.php in PHP CLI with deterministic SimplePie-like feed/item objects and WordPress escaping/filter/date stubs. It observes wp_widget_rss_output and wp_widget_rss_process helper behavior without WP_Widget_RSS class runtime, installed widget registration, live network feeds, admin form rendering, database-backed widgets, or generated public PHP replacement."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass WP_Widget_RSS class runtime, installed widget registration/rendering, live/recorded feed, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-rss-widget-helper-oracle-fixture",
        "npm run wp:core:wphx-312-rss-widget-helper-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-25-rss-widget-helper-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function summarize(observations) {
  return {
    output_full_sha256: observations["rss-widget:output-full"].output_sha256,
    output_full_fetches: observations["rss-widget:output-full"].fetches.length,
    output_empty_message_present: observations["rss-widget:output-empty"].output.includes("feed is down"),
    output_error_visible: observations["rss-widget:output-error-visible"].output,
    process_success_items: observations["rss-widget:process-success"].result.items,
    process_success_link: observations["rss-widget:process-success"].result.link,
    process_error: observations["rss-widget:process-error"].result.error
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
    schema: "wphx.wp-core-rss-widget-helper-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      magpie_display_fixture_manifest: inputRecord(DISPLAY_FIXTURE),
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
          "fetch_feed, SimplePie-like feed/item/author objects, is_wp_error, is_admin, current_user_can, wp_parse_args, esc_url, esc_attr, esc_html, __, sanitize_url, wp_trim_words, date_i18n, and get_option are deterministic local stubs; copied widgets.php remains the executed RSS widget helper source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      },
      widget_helper_quirks_observed: [
        "wp_widget_rss_output trims leading characters until links begin with http before escaping.",
        "Item counts outside 1..20 are normalized to 10.",
        "wp_widget_rss_process sanitizes URL and title, records feed errors, and destructs successful feed objects."
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
        id: "wp-widget-rss-class-runtime-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture directly exercises shared RSS widget helpers. WP_Widget_RSS class widget/update/form runtime and WP_Widget inheritance remain separate gates."
      },
      {
        id: "installed-widget-registration-and-admin-form-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture does not claim installed widget registration, sidebar rendering, admin form HTML, database-backed widget options, or block/widget editor behavior."
      },
      {
        id: "live-network-and-public-php-replacement-not-claimed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses deterministic fetch_feed stubs and copied oracle PHP. Live/recorded network feeds and generated original-path PHP replacement remain later gates."
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
      wp_widget_rss_class_runtime_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-25-rss-widget-helper-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "RSS widget helper oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle RSS widget helper boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-rss-widget-helper-oracle-fixture",
      "npm run wp:core:wphx-312-rss-widget-helper-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-24-magpie-rss-display-helper-oracle-fixture"
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
