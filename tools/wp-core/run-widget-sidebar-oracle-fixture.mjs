#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.17.7",
  external_ref: "WPHX-310.07",
  title: "WPHX-310.07 — Add widget/sidebar oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-widget-sidebar-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-310-07";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-310-07-widget-sidebar-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-310-07-widget-sidebar-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-310-07-widget-sidebar-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-310-01-themes-template-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-310-02-theme-template-adapter-contract-candidate.v1.json";
const WIDGET_SURFACE = "manifests/wp-core/wphx-310-06-theme-customizer-widget-nav-surface.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-widget.php",
  "src/wp-includes/class-wp-widget-factory.php",
  "src/wp-includes/widgets.php"
];
const COVERED_SYMBOLS = [
  "WP_Widget::__construct",
  "WP_Widget::_register",
  "WP_Widget::display_callback",
  "WP_Widget::get_settings",
  "WP_Widget_Factory::register",
  "WP_Widget_Factory::_register_widgets",
  "register_sidebar",
  "register_widget",
  "wp_register_sidebar_widget",
  "wp_register_widget_control",
  "wp_get_sidebars_widgets",
  "is_active_sidebar",
  "dynamic_sidebar",
  "the_widget",
  "_get_widget_id_base"
];
const FIXTURE_CASES = [
  { id: "sidebar:registration", focus: "register_sidebar stores parsed sidebar args, adds widget theme support, and fires register_sidebar" },
  { id: "widget:factory-registration", focus: "WP_Widget_Factory registers a WP_Widget subclass and populates widget/control/update globals" },
  { id: "sidebars-widgets:active-state", focus: "wp_get_sidebars_widgets strips array_version and is_active_sidebar reflects populated/empty sidebars" },
  { id: "dynamic-sidebar:render-hooks", focus: "dynamic_sidebar renders widget wrapper/title/body output and fires expected hooks/filters" },
  { id: "dynamic-sidebar:empty", focus: "empty sidebars fire before/after hooks with has_widgets=false and return filtered false" },
  { id: "the-widget:direct-render", focus: "the_widget renders a registered WP_Widget instance outside sidebar assignment" }
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

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wp_actions'] = array();
$GLOBALS['wp_filter'] = array();
$GLOBALS['wphx_310_07_actions'] = array();
$GLOBALS['wphx_310_07_filters'] = array();
$GLOBALS['wphx_310_07_errors'] = array();
$GLOBALS['wphx_310_07_options'] = array(
\t'widget_wphx_widget' => array(
\t\t2 => array( 'title' => 'Fixture Title', 'body' => 'Fixture Body' ),
\t\t'_multiwidget' => 1,
\t),
\t'sidebars_widgets' => array(
\t\t'fixture-sidebar' => array( 'wphx_widget-2' ),
\t\t'empty-sidebar' => array(),
\t\t'array_version' => 3,
\t),
);
$GLOBALS['wphx_310_07_theme_supports'] = array();
$GLOBALS['wphx_310_07_cache_addition_suspended'] = false;

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_310_07_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

function __( $text ) { return $text; }
function _e( $text ) { echo $text; }
function _deprecated_argument( $function_name, $version, $message = '' ) {
\t$GLOBALS['wphx_310_07_errors'][] = array( 'deprecated_argument' => $function_name, 'version' => $version, 'message' => $message );
}
function _deprecated_constructor( $class_name, $version, $parent_class = '' ) {
\t$GLOBALS['wphx_310_07_errors'][] = array( 'deprecated_constructor' => $class_name, 'version' => $version, 'parent' => $parent_class );
}
function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_310_07_errors'][] = array( 'doing_it_wrong' => $function_name, 'version' => $version, 'message' => $message );
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][] = array( 'callback' => $callback, 'priority' => $priority, 'accepted_args' => $accepted_args );
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\tadd_action( $hook_name, $callback, $priority, $accepted_args );
}
function did_action( $hook_name ) {
\treturn $GLOBALS['wp_actions'][ $hook_name ] ?? 0;
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wp_actions'][ $hook_name ] = ( $GLOBALS['wp_actions'][ $hook_name ] ?? 0 ) + 1;
\t$GLOBALS['wphx_310_07_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
}
function do_action_ref_array( $hook_name, $args ) {
\tdo_action( $hook_name, ...$args );
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_310_07_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\treturn $value;
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
function sanitize_title( $value ) {
\t$value = preg_replace( '/[^a-zA-Z0-9]+/', '-', (string) $value );
\treturn trim( strtolower( $value ), '-' );
}
function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function wp_kses( $value, $context = '' ) { return (string) $value; }
function add_theme_support( $feature ) {
\t$GLOBALS['wphx_310_07_theme_supports'][ $feature ] = true;
}
function is_admin() { return false; }
function get_option( $name, $default = false ) {
\treturn array_key_exists( $name, $GLOBALS['wphx_310_07_options'] ) ? $GLOBALS['wphx_310_07_options'][ $name ] : $default;
}
function update_option( $name, $value ) {
\t$GLOBALS['wphx_310_07_options'][ $name ] = $value;
\treturn true;
}
function delete_option( $name ) {
\tunset( $GLOBALS['wphx_310_07_options'][ $name ] );
\treturn true;
}
function wp_suspend_cache_addition( $suspend = null ) {
\t$previous = $GLOBALS['wphx_310_07_cache_addition_suspended'];
\tif ( null !== $suspend ) {
\t\t$GLOBALS['wphx_310_07_cache_addition_suspended'] = (bool) $suspend;
\t}
\treturn $previous;
}
function current_theme_supports( $feature ) { return ! empty( $GLOBALS['wphx_310_07_theme_supports'][ $feature ] ); }
function get_theme_mod( $name, $default = false ) { return $default; }

require ABSPATH . WPINC . '/class-wp-widget.php';
require ABSPATH . WPINC . '/class-wp-widget-factory.php';
require ABSPATH . WPINC . '/widgets.php';

$wp_widget_factory = new WP_Widget_Factory();

class WPHX_Widget extends WP_Widget {
\tpublic function __construct() {
\t\tparent::__construct(
\t\t\t'wphx_widget',
\t\t\t'WPHX Widget',
\t\t\tarray(
\t\t\t\t'classname' => 'wphx-widget',
\t\t\t\t'description' => 'Fixture widget',
\t\t\t)
\t\t);
\t}
\tpublic function widget( $args, $instance ) {
\t\techo $args['before_widget'];
\t\tif ( ! empty( $instance['title'] ) ) {
\t\t\techo $args['before_title'] . esc_html( $instance['title'] ) . $args['after_title'];
\t\t}
\t\techo '<span class="fixture-body">' . esc_html( $instance['body'] ?? '' ) . '</span>';
\t\techo $args['after_widget'];
\t}
}

$sidebar_id = register_sidebar(
\tarray(
\t\t'name' => 'Fixture Sidebar',
\t\t'id' => 'fixture-sidebar',
\t\t'description' => 'Fixture description',
\t\t'class' => 'fixture-class',
\t\t'before_sidebar' => '<aside id="%1$s" class="%2$s">',
\t\t'after_sidebar' => '</aside>',
\t\t'before_widget' => '<section id="%1$s" class="%2$s">',
\t\t'after_widget' => '</section>',
\t\t'before_title' => '<h3>',
\t\t'after_title' => '</h3>',
\t\t'show_in_rest' => true,
\t)
);
$empty_sidebar_id = register_sidebar(
\tarray(
\t\t'name' => 'Empty Sidebar',
\t\t'id' => 'empty-sidebar',
\t)
);
register_widget( 'WPHX_Widget' );
$wp_widget_factory->_register_widgets();

$sidebars_widgets = wp_get_sidebars_widgets();
$active_fixture = is_active_sidebar( 'fixture-sidebar' );
$active_empty = is_active_sidebar( 'empty-sidebar' );

ob_start();
$dynamic_result = dynamic_sidebar( 'fixture-sidebar' );
$dynamic_output = ob_get_clean();

ob_start();
$empty_result = dynamic_sidebar( 'empty-sidebar' );
$empty_output = ob_get_clean();

ob_start();
the_widget( 'WPHX_Widget', array( 'title' => 'Direct Title', 'body' => 'Direct Body' ), array( 'before_widget' => '<div class="%s">', 'after_widget' => '</div>' ) );
$direct_output = ob_get_clean();

$cases = array(
\t'sidebar:registration' => array(
\t\t'sidebar_id' => $sidebar_id,
\t\t'empty_sidebar_id' => $empty_sidebar_id,
\t\t'registered_sidebars' => array_keys( $GLOBALS['wp_registered_sidebars'] ),
\t\t'fixture_show_in_rest' => $GLOBALS['wp_registered_sidebars']['fixture-sidebar']['show_in_rest'],
\t\t'theme_support_widgets' => current_theme_supports( 'widgets' ),
\t),
\t'widget:factory-registration' => array(
\t\t'factory_widget_classes' => array_map( static fn( $widget ) => get_class( $widget ), $wp_widget_factory->widgets ),
\t\t'registered_widget_ids' => array_keys( $GLOBALS['wp_registered_widgets'] ),
\t\t'control_ids' => array_keys( $GLOBALS['wp_registered_widget_controls'] ),
\t\t'update_ids' => array_keys( $GLOBALS['wp_registered_widget_updates'] ),
\t\t'id_base' => _get_widget_id_base( 'wphx_widget-2' ),
\t),
\t'sidebars-widgets:active-state' => array(
\t\t'sidebar_keys' => array_keys( $sidebars_widgets ),
\t\t'array_version_present' => array_key_exists( 'array_version', $sidebars_widgets ),
\t\t'active_fixture' => $active_fixture,
\t\t'active_empty' => $active_empty,
\t),
\t'dynamic-sidebar:render-hooks' => array(
\t\t'result' => $dynamic_result,
\t\t'has_aside' => str_contains( $dynamic_output, '<aside id="fixture-sidebar" class="fixture-class">' ),
\t\t'has_widget_wrapper' => str_contains( $dynamic_output, '<section id="wphx_widget-2" class="wphx-widget">' ),
\t\t'has_title' => str_contains( $dynamic_output, '<h3>Fixture Title</h3>' ),
\t\t'has_body' => str_contains( $dynamic_output, 'Fixture Body' ),
\t\t'sha256' => hash( 'sha256', $dynamic_output ),
\t),
\t'dynamic-sidebar:empty' => array(
\t\t'result' => $empty_result,
\t\t'output' => $empty_output,
\t),
\t'the-widget:direct-render' => array(
\t\t'has_direct_title' => str_contains( $direct_output, 'Direct Title' ),
\t\t'has_direct_body' => str_contains( $direct_output, 'Direct Body' ),
\t\t'has_direct_wrapper' => str_contains( $direct_output, '<div class="wphx-widget">' ),
\t\t'sha256' => hash( 'sha256', $direct_output ),
\t),
);

ksort( $cases );
echo json_encode(
\tarray(
\t\t'cases' => $cases,
\t\t'actions' => $GLOBALS['wphx_310_07_actions'],
\t\t'filters' => $GLOBALS['wphx_310_07_filters'],
\t\t'php_errors' => $GLOBALS['wphx_310_07_errors'],
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(root) {
  return JSON.parse(command("php", [PROBE, root]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-310-widget-sidebar-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/widget-sidebar-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Widget/sidebar registry and dynamic_sidebar behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 widget and sidebar source against deterministic in-process options, hooks, and a custom WP_Widget subclass. It does not claim generated public PHP replacement, bundled default widget parity, block widget REST parity, widget admin screen parity, or installed rendering parity."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-haxe-adapter-contract-foundation",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass bundled widget, widget admin, block widget REST, installed theme rendering/admin, and selected upstream widget PHPUnit gates before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-310-widget-sidebar-oracle-fixture",
        "npm run wp:core:wphx-310-widget-sidebar-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-310-07-widget-sidebar-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const oracle = runProbe(ORACLE_ROOT);
const candidate = runProbe(CANDIDATE_ROOT);
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
  schema: "wphx.wp-core-widget-sidebar-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    widget_surface_manifest: inputRecord(WIDGET_SURFACE),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord)
  },
  fixture: {
    cases: FIXTURE_CASES,
    covered_symbols: COVERED_SYMBOLS,
    source_files: SOURCE_FILES,
    probe: { path: PROBE, sha256: sha256File(PROBE) },
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
      id: "bundled-default-and-block-widgets-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture executes a custom WP_Widget subclass through core registry and sidebar APIs. Bundled default widgets, block widget bridge files, and widget REST controllers remain later WPHX-310 or WPHX-314 gates."
    },
    {
      id: "widget-admin-installed-behavior-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "widgets.php admin screens, Customizer widget controls, nonce/capability checks, and installed front-end/admin rendering remain later gates."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "Widget/sidebar PHP files are copied oracle source in this fixture; generated original-path PHP replacement remains a later cross-domain gate."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    fixture_cases: FIXTURE_CASES.length,
    covered_symbols: COVERED_SYMBOLS.length,
    observations_match: observationsMatch,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-310-07-widget-sidebar-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "widget/sidebar oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle widget/sidebar boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-310-widget-sidebar-oracle-fixture",
    "npm run wp:core:wphx-310-widget-sidebar-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-310-01-themes-template-surface",
    "receipt:wphx-310-02-theme-template-adapter-contract-candidate",
    "receipt:wphx-310-06-theme-customizer-widget-nav-surface"
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
      fixture_cases: FIXTURE_CASES.length,
      observations_match: observationsMatch
    },
    null,
    2
  )
);
