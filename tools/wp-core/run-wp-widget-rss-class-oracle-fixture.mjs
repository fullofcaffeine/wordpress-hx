#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-yyr",
  external_ref: "WPHX-312.26",
  title: "WPHX-312.26 - Add WP_Widget_RSS class oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-widget-rss-class-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-26";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-26-wp-widget-rss-class-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-26-wp-widget-rss-class-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-26-wp-widget-rss-class-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const WIDGET_HELPER_FIXTURE = "manifests/wp-core/wphx-312-25-rss-widget-helper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/widgets/class-wp-widget-rss.php"];
const COVERED_SYMBOLS = [
  "class-wp-widget-rss.php",
  "WP_Widget_RSS",
  "WP_Widget_RSS::__construct",
  "WP_Widget_RSS::widget",
  "WP_Widget_RSS::update",
  "WP_Widget_RSS::form",
  "WP_Widget::__construct",
  "fetch_feed",
  "wp_widget_rss_output",
  "wp_widget_rss_process",
  "wp_widget_rss_form",
  "apply_filters",
  "current_theme_supports",
  "wp_lazy_loading_enabled",
  "includes_url",
  "untrailingslashit",
  "site_url",
  "home_url",
  "esc_url",
  "esc_html",
  "esc_attr",
  "esc_attr__"
];
const CASES = [
  { id: "wp-widget-rss:construct", focus: "constructor passes rss id/name/options/control options to WP_Widget" },
  { id: "wp-widget-rss:widget-success-html5", focus: "widget success path normalizes URL, builds title/feed link, wraps html5 nav, delegates output, and destructs feed" },
  { id: "wp-widget-rss:widget-guards", focus: "widget guard paths return early for error flag, empty normalized URL, and self URL" },
  { id: "wp-widget-rss:update", focus: "update delegates to wp_widget_rss_process and computes testurl from changed URL" },
  { id: "wp-widget-rss:form", focus: "form injects default instance values and widget number before delegation" }
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
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_fetches'] = array();
$GLOBALS['wphx_output_calls'] = array();
$GLOBALS['wphx_process_calls'] = array();
$GLOBALS['wphx_form_calls'] = array();
$GLOBALS['wphx_escape_calls'] = array();
$GLOBALS['wphx_destructed_feeds'] = array();

class WP_Widget {
\tpublic $id_base;
\tpublic $name;
\tpublic $option_name;
\tpublic $widget_options;
\tpublic $control_options;
\tpublic $number = 7;
\tpublic $id = 'rss-7';

\tpublic function __construct( $id_base, $name, $widget_options = array(), $control_options = array() ) {
\t\t$this->id_base         = strtolower( $id_base );
\t\t$this->name            = $name;
\t\t$this->option_name     = 'widget_' . $this->id_base;
\t\t$this->widget_options  = $widget_options;
\t\t$this->control_options = $control_options;
\t}
}

class WP_Error {
\tprivate $message;

\tpublic function __construct( $code, $message ) {
\t\t$this->message = $message;
\t}

\tpublic function get_error_message() {
\t\treturn $this->message;
\t}
}

class WPHX_RSS_Class_Feed {
\tprivate $kind;

\tpublic function __construct( $kind = 'normal' ) {
\t\t$this->kind = $kind;
\t}

\tpublic function get_description() {
\t\treturn 'Fixture <strong>description</strong> &amp; details';
\t}

\tpublic function get_title() {
\t\treturn 'Fixture Feed <Title>';
\t}

\tpublic function get_permalink() {
\t\treturn '/https://example.test/feed-home';
\t}

\tpublic function __destruct() {
\t\t$GLOBALS['wphx_destructed_feeds'][] = $this->kind;
\t}
}

function __( $value ) {
\treturn $value;
}

function esc_attr__( $value ) {
\t$GLOBALS['wphx_escape_calls'][] = array( 'esc_attr__', $value );
\treturn 'esc_attr__:' . htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
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
\treturn 'blog_charset' === $name ? 'UTF-8' : null;
}

function fetch_feed( $url ) {
\t$GLOBALS['wphx_fetches'][] = $url;
\tif ( false !== strpos( $url, 'error-feed' ) ) {
\t\treturn new WP_Error( 'fixture_error', 'Fixture feed error' );
\t}
\treturn new WPHX_RSS_Class_Feed( 'normal' );
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

function includes_url( $path = '' ) {
\treturn 'https://example.test/wp-includes/' . ltrim( $path, '/' );
}

function wp_lazy_loading_enabled( $tag_name, $context ) {
\treturn 'img' === $tag_name && 'rss_widget_feed_icon' === $context;
}

function current_theme_supports( $feature, ...$args ) {
\treturn 'html5' === $feature && in_array( 'navigation-widgets', $args, true );
}

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array(
\t\t'hook' => $hook_name,
\t\t'value' => $value,
\t\t'args' => $args,
\t);
\tif ( 'widget_title' === $hook_name ) {
\t\treturn 'filtered:' . $value;
\t}
\tif ( 'rss_widget_feed_link' === $hook_name ) {
\t\treturn 'filtered-feed-link:' . $value;
\t}
\tif ( 'navigation_widgets_format' === $hook_name ) {
\t\treturn $value;
\t}
\treturn $value;
}

function wp_widget_rss_output( $rss, $instance ) {
\t$GLOBALS['wphx_output_calls'][] = array(
\t\t'rss_class' => is_object( $rss ) ? get_class( $rss ) : gettype( $rss ),
\t\t'is_error' => is_wp_error( $rss ),
\t\t'instance' => $instance,
\t);
\techo '<rss-output-marker />';
}

function wp_widget_rss_process( $new_instance, $testurl ) {
\t$GLOBALS['wphx_process_calls'][] = array( 'new_instance' => $new_instance, 'testurl' => $testurl );
\treturn array( 'processed' => true, 'testurl' => $testurl, 'url' => $new_instance['url'] ?? null );
}

function wp_widget_rss_form( $instance ) {
\t$GLOBALS['wphx_form_calls'][] = $instance;
\techo '<rss-form-marker />';
}

require __DIR__ . '/wp-includes/widgets/class-wp-widget-rss.php';

function wphx_widget() {
\treturn new WP_Widget_RSS();
}

function wphx_capture( $callback ) {
\tob_start();
\t$return = $callback();
\t$output = ob_get_clean();
\treturn array( $output, $return );
}

function wphx_base_result( $output = '', $return = null ) {
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'output' => $output,
\t\t'output_sha256' => hash( 'sha256', $output ),
\t\t'return_value' => $return,
\t\t'fetches' => $GLOBALS['wphx_fetches'],
\t\t'filters' => $GLOBALS['wphx_filters'],
\t\t'output_calls' => $GLOBALS['wphx_output_calls'],
\t\t'process_calls' => $GLOBALS['wphx_process_calls'],
\t\t'form_calls' => $GLOBALS['wphx_form_calls'],
\t\t'escape_calls' => $GLOBALS['wphx_escape_calls'],
\t\t'destructed_feeds' => $GLOBALS['wphx_destructed_feeds'],
\t);
}

function wphx_construct() {
\t$widget = wphx_widget();
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'id_base' => $widget->id_base,
\t\t'name' => $widget->name,
\t\t'option_name' => $widget->option_name,
\t\t'widget_options' => $widget->widget_options,
\t\t'control_options' => $widget->control_options,
\t);
}

function wphx_widget_success_html5() {
\t$widget = wphx_widget();
\t$args = array(
\t\t'before_widget' => '<aside class="widget-rss">',
\t\t'after_widget' => '</aside>',
\t\t'before_title' => '<h2>',
\t\t'after_title' => '</h2>',
\t);
\t$instance = array(
\t\t'url' => '/https://example.test/feed',
\t\t'title' => '',
\t\t'items' => 2,
\t\t'show_summary' => 1,
\t\t'show_author' => 1,
\t\t'show_date' => 1,
\t);
\tlist( $output, $return ) = wphx_capture( function () use ( $widget, $args, $instance ) {
\t\treturn $widget->widget( $args, $instance );
\t} );
\treturn wphx_base_result( $output, $return );
}

function wphx_widget_guards() {
\t$widget = wphx_widget();
\t$args = array(
\t\t'before_widget' => '<aside>',
\t\t'after_widget' => '</aside>',
\t\t'before_title' => '<h2>',
\t\t'after_title' => '</h2>',
\t);
\t$cases = array(
\t\t'error-flag' => array( 'url' => 'https://example.test/feed', 'title' => 'Hidden', 'error' => true ),
\t\t'empty-url' => array( 'url' => '////', 'title' => 'Hidden' ),
\t\t'self-url' => array( 'url' => 'https://example.test/home/', 'title' => 'Hidden' ),
\t);
\t$results = array();
\tforeach ( $cases as $name => $instance ) {
\t\tlist( $output, $return ) = wphx_capture( function () use ( $widget, $args, $instance ) {
\t\t\treturn $widget->widget( $args, $instance );
\t\t} );
\t\t$results[ $name ] = array( 'output' => $output, 'return_value' => $return );
\t}
\t$result = wphx_base_result();
\t$result['guard_results'] = $results;
\treturn $result;
}

function wphx_update() {
\t$widget = wphx_widget();
\t$same = $widget->update( array( 'url' => 'https://example.test/feed', 'title' => 'Same' ), array( 'url' => 'https://example.test/feed' ) );
\t$changed = $widget->update( array( 'url' => 'https://example.test/new', 'title' => 'Changed' ), array( 'url' => 'https://example.test/feed' ) );
\t$missing_old = $widget->update( array( 'url' => 'https://example.test/first', 'title' => 'First' ), array() );
\t$result = wphx_base_result();
\t$result['returns'] = array( 'same' => $same, 'changed' => $changed, 'missing_old' => $missing_old );
\treturn $result;
}

function wphx_form() {
\t$widget = wphx_widget();
\t$empty = wphx_capture( function () use ( $widget ) {
\t\treturn $widget->form( array() );
\t} );
\t$custom = wphx_capture( function () use ( $widget ) {
\t\treturn $widget->form( array( 'title' => 'Custom', 'url' => 'https://example.test/feed', 'items' => 3 ) );
\t} );
\t$result = wphx_base_result( $empty[0] . $custom[0], null );
\t$result['empty_return'] = $empty[1];
\t$result['custom_return'] = $custom[1];
\treturn $result;
}

$handlers = array(
\t'wp-widget-rss:construct' => 'wphx_construct',
\t'wp-widget-rss:widget-success-html5' => 'wphx_widget_success_html5',
\t'wp-widget-rss:widget-guards' => 'wphx_widget_guards',
\t'wp-widget-rss:update' => 'wphx_update',
\t'wp-widget-rss:form' => 'wphx_form',
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-wp-widget-rss-class-oracle-fixture`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wp-widget-rss-class-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Widget_RSS class wrapper behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/widgets/class-wp-widget-rss.php in PHP CLI with deterministic WP_Widget, feed, escaping, filter, and RSS widget helper stubs. It observes WP_Widget_RSS constructor, widget guard/title/delegation behavior, update delegation, and form defaulting without installed widget registration/sidebar rendering, helper internals already covered by WPHX-312.25, admin form helper HTML, live network feeds, database-backed widgets, or generated public PHP replacement."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed widget registration/sidebar rendering, real WP_Widget base/runtime, live/recorded feed, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-widget-rss-class-oracle-fixture",
        "npm run wp:core:wphx-312-wp-widget-rss-class-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-26-wp-widget-rss-class-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function summarize(observations) {
  const success = observations["wp-widget-rss:widget-success-html5"];
  const update = observations["wp-widget-rss:update"];
  const form = observations["wp-widget-rss:form"];
  return {
    constructor_id_base: observations["wp-widget-rss:construct"].id_base,
    widget_success_fetches: success.fetches,
    widget_success_output_sha256: success.output_sha256,
    widget_success_output_calls: success.output_calls.length,
    guard_fetch_count: observations["wp-widget-rss:widget-guards"].fetches.length,
    update_testurl_sequence: update.process_calls.map((call) => call.testurl),
    form_call_count: form.form_calls.length,
    form_default_items: form.form_calls[0]?.items
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
    schema: "wphx.wp-core-wp-widget-rss-class-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      rss_widget_helper_fixture_manifest: inputRecord(WIDGET_HELPER_FIXTURE),
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
          "WP_Widget, fetch_feed, feed object, wp_widget_rss_output, wp_widget_rss_process, wp_widget_rss_form, escaping, filters, theme support, URLs, includes URL, lazy loading, and options are deterministic local stubs; copied class-wp-widget-rss.php remains the executed widget class source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      },
      class_wrapper_quirks_observed: [
        "widget strips leading characters until feed URL and feed permalink begin with http.",
        "widget returns early for error flag, empty normalized URL, or self URL.",
        "update passes testurl true only when URL is new or changed.",
        "form injects default RSS widget settings and current widget number before delegation."
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
        id: "installed-widget-registration-sidebar-rendering-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture directly instantiates WP_Widget_RSS with a deterministic WP_Widget base stub. Installed widget registration, sidebar rendering, widget factory integration, and database-backed widget options remain later gates."
      },
      {
        id: "rss-helper-internals-and-admin-form-html-not-claimed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture delegates to stubbed wp_widget_rss_output/process/form. Shared helper internals are covered by WPHX-312.25, while full admin form helper HTML remains outside this class-wrapper claim."
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
      rss_helper_internals_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-26-wp-widget-rss-class-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Widget_RSS class oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle WP_Widget_RSS class boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-widget-rss-class-oracle-fixture",
      "npm run wp:core:wphx-312-wp-widget-rss-class-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-25-rss-widget-helper-oracle-fixture"
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
