#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-2po",
  external_ref: "WPHX-310.09",
  title: "WPHX-310.09 — Add customizer manager/settings oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-customizer-manager-setting-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-310-09";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-310-09-customizer-manager-setting-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-310-09-customizer-manager-setting-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-310-09-customizer-manager-setting-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-310-01-themes-template-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-310-02-theme-template-adapter-contract-candidate.v1.json";
const CUSTOMIZER_SURFACE = "manifests/wp-core/wphx-310-06-theme-customizer-widget-nav-surface.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-customize-manager.php",
  "src/wp-includes/class-wp-customize-setting.php",
  "src/wp-includes/class-wp-customize-panel.php",
  "src/wp-includes/class-wp-customize-section.php",
  "src/wp-includes/class-wp-customize-control.php",
  "src/wp-includes/customize/class-wp-customize-color-control.php",
  "src/wp-includes/customize/class-wp-customize-media-control.php",
  "src/wp-includes/customize/class-wp-customize-upload-control.php",
  "src/wp-includes/customize/class-wp-customize-image-control.php",
  "src/wp-includes/customize/class-wp-customize-background-image-control.php",
  "src/wp-includes/customize/class-wp-customize-background-position-control.php",
  "src/wp-includes/customize/class-wp-customize-cropped-image-control.php",
  "src/wp-includes/customize/class-wp-customize-site-icon-control.php",
  "src/wp-includes/customize/class-wp-customize-header-image-control.php",
  "src/wp-includes/customize/class-wp-customize-theme-control.php",
  "src/wp-includes/customize/class-wp-customize-code-editor-control.php",
  "src/wp-includes/customize/class-wp-customize-date-time-control.php",
  "src/wp-includes/customize/class-wp-widget-area-customize-control.php",
  "src/wp-includes/customize/class-wp-widget-form-customize-control.php",
  "src/wp-includes/customize/class-wp-sidebar-block-editor-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-item-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-location-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-name-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-locations-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-auto-add-control.php",
  "src/wp-includes/customize/class-wp-customize-nav-menus-panel.php",
  "src/wp-includes/customize/class-wp-customize-themes-panel.php",
  "src/wp-includes/customize/class-wp-customize-themes-section.php",
  "src/wp-includes/customize/class-wp-customize-sidebar-section.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-section.php",
  "src/wp-includes/customize/class-wp-customize-custom-css-setting.php",
  "src/wp-includes/customize/class-wp-customize-filter-setting.php",
  "src/wp-includes/customize/class-wp-customize-header-image-setting.php",
  "src/wp-includes/customize/class-wp-customize-background-image-setting.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-item-setting.php",
  "src/wp-includes/customize/class-wp-customize-nav-menu-setting.php",
  "src/wp-includes/customize/class-wp-customize-selective-refresh.php",
  "src/wp-includes/customize/class-wp-customize-partial.php"
];
const COVERED_SYMBOLS = [
  "WP_Customize_Manager::__construct",
  "WP_Customize_Manager::add_setting",
  "WP_Customize_Manager::get_setting",
  "WP_Customize_Manager::add_panel",
  "WP_Customize_Manager::add_section",
  "WP_Customize_Manager::add_control",
  "WP_Customize_Manager::unsanitized_post_values",
  "WP_Customize_Manager::post_value",
  "WP_Customize_Manager::set_post_value",
  "WP_Customize_Manager::validate_setting_values",
  "WP_Customize_Setting::value",
  "WP_Customize_Setting::post_value",
  "WP_Customize_Setting::json",
  "WP_Customize_Control::json",
  "WP_Customize_Control::get_link",
  "WP_Customize_Panel::json",
  "WP_Customize_Section::json",
  "WP_Customize_Selective_Refresh::add_partial",
  "WP_Customize_Partial::json",
  "WP_Customize_Partial::render"
];
const FIXTURE_CASES = [
  { id: "manager:bootstrap", focus: "manager construction, component filtering, changeset UUID, selective refresh, and bootstrap hooks" },
  { id: "registry:add-get-remove", focus: "settings, panels, sections, and controls are registered, retrievable, and removable" },
  { id: "settings:post-value-sanitize", focus: "incoming customized payload and set_post_value flow through validation, sanitization, and hooks" },
  { id: "settings:validate-values", focus: "validate_setting_values reports true, WP_Error invalidity, and unrecognized setting errors" },
  { id: "objects:json-and-capabilities", focus: "setting/control/panel/section JSON and capability checks preserve labels, links, and active filters" },
  { id: "selective-refresh:partial", focus: "selective refresh partial registration, JSON export, render callback, capability checks, and removal" }
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
define( 'ARRAY_A', 'ARRAY_A' );
define( 'OBJECT', 'OBJECT' );

$_SERVER['HTTP_HOST'] = 'example.test';
$_SERVER['REQUEST_URI'] = '/wp-admin/customize.php';
$_POST['customized'] = wp_slash(
\twp_json_encode(
\t\tarray(
\t\t\t'fixture_option' => ' posted value ',
\t\t\t'fixture_bad' => 'bad',
\t\t)
\t)
);

$GLOBALS['wp_actions'] = array();
$GLOBALS['wp_filter'] = array();
$GLOBALS['wphx_310_09_actions'] = array();
$GLOBALS['wphx_310_09_filters'] = array();
$GLOBALS['wphx_310_09_errors'] = array();
$GLOBALS['wphx_310_09_options'] = array(
\t'fixture_option' => 'stored option',
\t'fixture_nested' => array( 'child' => 'stored child' ),
\t'customize_stashed_theme_mods' => array(),
);
$GLOBALS['wphx_310_09_theme_mods'] = array(
\t'fixture_mod' => 'stored mod',
);
$GLOBALS['wphx_310_09_theme_supports'] = array( 'custom-logo' => true );

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_310_09_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WP_Error {
\tpublic $errors = array();
\tpublic $error_data = array();
\tpublic function __construct( $code = '', $message = '', $data = '' ) {
\t\tif ( '' !== $code ) {
\t\t\t$this->add( $code, $message, $data );
\t\t}
\t}
\tpublic function add( $code, $message, $data = '' ) {
\t\t$this->errors[ $code ][] = $message;
\t\tif ( '' !== $data ) {
\t\t\t$this->error_data[ $code ] = $data;
\t\t}
\t}
\tpublic function has_errors() {
\t\treturn ! empty( $this->errors );
\t}
\tpublic function get_error_codes() {
\t\treturn array_keys( $this->errors );
\t}
\tpublic function get_error_data( $code = '' ) {
\t\tif ( '' === $code ) {
\t\t\t$codes = $this->get_error_codes();
\t\t\t$code = reset( $codes );
\t\t}
\t\treturn $this->error_data[ $code ] ?? null;
\t}
}
class WP_Query {
\tpublic $posts = array();
\tpublic function __construct( $args = array() ) {
\t\t$this->posts = array();
\t}
}
class WP_Theme {
\tprivate $stylesheet;
\tpublic function __construct( $stylesheet = 'fixture-theme' ) {
\t\t$this->stylesheet = $stylesheet;
\t}
\tpublic function get_stylesheet() {
\t\treturn $this->stylesheet;
\t}
\tpublic function get( $header ) {
\t\treturn 'Fixture Theme';
\t}
\tpublic function exists() {
\t\treturn true;
\t}
}
class WP_Customize_Widgets {}
class WP_Customize_Nav_Menus {}

function __( $text ) { return $text; }
function _e( $text ) { echo $text; }
function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_310_09_errors'][] = array( 'doing_it_wrong' => $function_name, 'version' => $version, 'message' => $message );
}
function _deprecated_function( $function_name, $version, $replacement = '' ) {
\t$GLOBALS['wphx_310_09_errors'][] = array( 'deprecated_function' => $function_name, 'version' => $version, 'replacement' => $replacement );
}
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => $callback, 'accepted_args' => $accepted_args );
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\tadd_action( $hook_name, $callback, $priority, $accepted_args );
}
function remove_action( $hook_name, $callback = false, $priority = 10 ) { return true; }
function remove_filter( $hook_name, $callback = false, $priority = 10 ) { return true; }
function has_action( $hook_name ) { return ! empty( $GLOBALS['wp_filter'][ $hook_name ] ); }
function did_action( $hook_name ) { return $GLOBALS['wp_actions'][ $hook_name ] ?? 0; }
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wp_actions'][ $hook_name ] = ( $GLOBALS['wp_actions'][ $hook_name ] ?? 0 ) + 1;
\t$GLOBALS['wphx_310_09_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn;
\t}
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $callback ) {
\t\t\tcall_user_func_array( $callback['callback'], array_slice( $args, 0, $callback['accepted_args'] ) );
\t\t}
\t}
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_310_09_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $callback ) {
\t\t\t$value = call_user_func_array( $callback['callback'], array_slice( array_merge( array( $value ), $args ), 0, $callback['accepted_args'] ) );
\t\t}
\t}
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
function wp_array_slice_assoc( $array, $keys ) {
\t$out = array();
\tforeach ( $keys as $key ) {
\t\tif ( array_key_exists( $key, $array ) ) {
\t\t\t$out[ $key ] = $array[ $key ];
\t\t}
\t}
\treturn $out;
}
function wp_json_encode( $value, $flags = 0, $depth = 512 ) { return json_encode( $value, $flags, $depth ); }
function wp_slash( $value ) { return is_array( $value ) ? array_map( 'wp_slash', $value ) : addslashes( (string) $value ); }
function wp_unslash( $value ) { return is_array( $value ) ? array_map( 'wp_unslash', $value ) : stripslashes( (string) $value ); }
function sanitize_key( $key ) { return preg_replace( '/[^a-z0-9_\\-]/', '', strtolower( (string) $key ) ); }
function sanitize_text_field( $value ) { return trim( preg_replace( '/\\s+/', ' ', strip_tags( (string) $value ) ) ); }
function sanitize_title( $value ) { return trim( strtolower( preg_replace( '/[^a-zA-Z0-9]+/', '-', (string) $value ) ), '-' ); }
function wp_generate_uuid4() { return '11111111-2222-4333-8444-555555555555'; }
function wp_is_uuid( $uuid ) { return is_string( $uuid ) && 36 === strlen( $uuid ); }
function wp_is_block_theme() { return true; }
function get_stylesheet() { return 'fixture-theme'; }
function validate_file( $file ) { return preg_match( '/\\.\\./', (string) $file ) ? 1 : 0; }
function wp_get_theme( $stylesheet = null ) { return new WP_Theme( $stylesheet ?: 'fixture-theme' ); }
function get_raw_theme_root( $stylesheet, $skip_cache = false ) { return '/themes'; }
function current_user_can( $capability ) {
\treturn in_array( $capability, array( 'customize', 'edit_theme_options' ), true );
}
function is_user_logged_in() { return true; }
function get_current_user_id() { return 7; }
function is_admin() { return true; }
function wp_doing_ajax() { return false; }
function get_option( $name, $default = false ) {
\treturn array_key_exists( $name, $GLOBALS['wphx_310_09_options'] ) ? $GLOBALS['wphx_310_09_options'][ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
\t$GLOBALS['wphx_310_09_options'][ $name ] = $value;
\treturn true;
}
function delete_option( $name ) {
\tunset( $GLOBALS['wphx_310_09_options'][ $name ] );
\treturn true;
}
function get_theme_mod( $name, $default = false ) {
\treturn array_key_exists( $name, $GLOBALS['wphx_310_09_theme_mods'] ) ? $GLOBALS['wphx_310_09_theme_mods'][ $name ] : $default;
}
function set_theme_mod( $name, $value ) {
\t$GLOBALS['wphx_310_09_theme_mods'][ $name ] = $value;
}
function remove_theme_mod( $name ) {
\tunset( $GLOBALS['wphx_310_09_theme_mods'][ $name ] );
}
function current_theme_supports( $feature ) { return ! empty( $GLOBALS['wphx_310_09_theme_supports'][ $feature ] ); }
function get_bloginfo( $show = '', $filter = 'raw' ) { return 'UTF-8' === $show || 'charset' === $show ? 'UTF-8' : 'Fixture Site'; }
function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function esc_textarea( $value ) { return htmlspecialchars( (string) $value, ENT_NOQUOTES ); }
function esc_url( $value ) { return (string) $value; }
function selected( $selected, $current = true, $display = true ) {
\t$result = ( (string) $selected === (string) $current ) ? ' selected="selected"' : '';
\tif ( $display ) {
\t\techo $result;
\t}
\treturn $result;
}
function checked( $checked, $current = true, $display = true ) {
\t$result = ( (bool) $checked === (bool) $current ) ? ' checked="checked"' : '';
\tif ( $display ) {
\t\techo $result;
\t}
\treturn $result;
}
function wp_dropdown_pages( $args = array() ) { return ''; }
function wp_cache_get( $key, $group = '' ) { return false; }
function wp_cache_set( $key, $value, $group = '', $expiration = 0 ) { return true; }
function get_post_stati() { return array( 'publish', 'draft', 'auto-draft' ); }
function get_posts( $args = array() ) { return array(); }
function get_post( $post_id ) { return null; }
function get_post_type( $post = null ) { return null; }
function wp_get_post_autosave( $post_id, $user_id = 0 ) { return null; }
function wp_enqueue_script( $handle ) {}
function admin_url( $path = '' ) { return 'https://example.test/wp-admin/' . ltrim( $path, '/' ); }
function home_url( $path = '' ) { return 'https://example.test/' . ltrim( $path, '/' ); }

function wphx_310_09_sanitize_fixture( $value, $setting ) {
\treturn strtoupper( sanitize_text_field( $value ) );
}
function wphx_310_09_validate_fixture( $validity, $value, $setting ) {
\tif ( 'bad' === $value ) {
\t\t$validity->add( 'fixture_invalid', 'Fixture invalid value.' );
\t}
\treturn $validity;
}
function wphx_310_09_partial_render( $partial, $context = array() ) {
\treturn '<span class="partial">' . esc_html( $context['label'] ?? 'default' ) . '</span>';
}

add_filter(
\t'customize_loaded_components',
\tfunction ( $components, $manager ) {
\t\treturn array();
\t},
\t10,
\t2
);

require_once ABSPATH . WPINC . '/class-wp-customize-manager.php';

$manager = new WP_Customize_Manager(
\tarray(
\t\t'changeset_uuid' => '11111111-2222-4333-8444-555555555555',
\t\t'theme' => 'fixture-theme',
\t\t'messenger_channel' => 'fixture-channel',
\t\t'settings_previewed' => false,
\t\t'branching' => false,
\t\t'autosaved' => false,
\t)
);

$setting = $manager->add_setting(
\t'fixture_option',
\tarray(
\t\t'type' => 'option',
\t\t'default' => 'default option',
\t\t'transport' => 'postMessage',
\t\t'sanitize_callback' => 'wphx_310_09_sanitize_fixture',
\t\t'validate_callback' => 'wphx_310_09_validate_fixture',
\t\t'dirty' => true,
\t)
);
$bad_setting = $manager->add_setting(
\t'fixture_bad',
\tarray(
\t\t'type' => 'option',
\t\t'default' => 'default bad',
\t\t'validate_callback' => 'wphx_310_09_validate_fixture',
\t)
);
$nested_setting = $manager->add_setting(
\t'fixture_nested[child]',
\tarray(
\t\t'type' => 'option',
\t\t'default' => 'nested default',
\t)
);
$mod_setting = $manager->add_setting(
\t'fixture_mod',
\tarray(
\t\t'type' => 'theme_mod',
\t\t'default' => 'default mod',
\t)
);
$panel = $manager->add_panel(
\t'fixture_panel',
\tarray(
\t\t'title' => 'Fixture Panel',
\t\t'description' => 'Panel description',
\t\t'priority' => 20,
\t)
);
$section = $manager->add_section(
\t'fixture_section',
\tarray(
\t\t'title' => 'Fixture Section',
\t\t'description' => 'Section description',
\t\t'priority' => 30,
\t\t'panel' => 'fixture_panel',
\t)
);
$control = $manager->add_control(
\t'fixture_option',
\tarray(
\t\t'label' => 'Fixture Label',
\t\t'description' => 'Control description',
\t\t'section' => 'fixture_section',
\t\t'type' => 'select',
\t\t'choices' => array(
\t\t\t'STORED OPTION' => 'Stored',
\t\t\t'POSTED VALUE' => 'Posted',
\t\t),
\t)
);
$partial = $manager->selective_refresh->add_partial(
\t'fixture_option',
\tarray(
\t\t'settings' => array( 'fixture_option' ),
\t\t'selector' => '.fixture',
\t\t'render_callback' => 'wphx_310_09_partial_render',
\t\t'container_inclusive' => true,
\t\t'fallback_refresh' => false,
\t)
);

$post_before_set = $setting->post_value( 'fallback' );
$manager->set_post_value( 'fixture_option', ' set value ' );
$post_after_set = $setting->post_value( 'fallback' );
$validities = $manager->validate_setting_values(
\tarray(
\t\t'fixture_option' => 'good',
\t\t'fixture_bad' => 'bad',
\t\t'unknown_setting' => 'value',
\t),
\tarray( 'validate_existence' => true )
);
$control_json = $control->json();
$panel_json = $panel->json();
$section_json = $section->json();
$partial_json = $partial->json();
$partial_rendered = $partial->render( array( 'label' => 'Rendered Fixture' ) );
$partial_capabilities = $partial->check_capabilities();
$registry_snapshot = array(
\t'setting_ids_before_remove' => array_keys( $manager->settings() ),
\t'panel_title' => $manager->get_panel( 'fixture_panel' )->title,
\t'section_panel' => $manager->get_section( 'fixture_section' )->panel,
\t'control_section' => $manager->get_control( 'fixture_option' )->section,
\t'control_setting_id' => $manager->get_control( 'fixture_option' )->setting->id,
\t'nested_value' => $nested_setting->value(),
\t'theme_mod_value' => $mod_setting->value(),
);
$partial_count_before_remove = count( $manager->selective_refresh->partials() );
$manager->selective_refresh->remove_partial( 'fixture_option' );
$manager->remove_control( 'fixture_option' );
$manager->remove_section( 'fixture_section' );
$manager->remove_panel( 'fixture_panel' );
$partial_count_after_remove = count( $manager->selective_refresh->partials() );
$registry_removed = array(
\t'control_removed' => null === $manager->get_control( 'fixture_option' ),
\t'section_removed' => null === $manager->get_section( 'fixture_section' ),
\t'panel_removed' => null === $manager->get_panel( 'fixture_panel' ),
);

$cases = array(
\t'manager:bootstrap' => array(
\t\t'changeset_uuid' => $manager->changeset_uuid(),
\t\t'branching' => $manager->branching(),
\t\t'is_theme_active' => $manager->is_theme_active(),
\t\t'stylesheet' => $manager->get_stylesheet(),
\t\t'has_selective_refresh' => $manager->selective_refresh instanceof WP_Customize_Selective_Refresh,
\t\t'has_widgets_component' => isset( $manager->widgets ),
\t\t'has_nav_menus_component' => isset( $manager->nav_menus ),
\t\t'customize_preview_hook_registered' => has_action( 'customize_preview_init' ),
\t\t'setup_theme_hook_registered' => has_action( 'setup_theme' ),
\t),
\t'registry:add-get-remove' => array(
\t\t'snapshot' => $registry_snapshot,
\t\t'removed' => $registry_removed,
\t),
\t'settings:post-value-sanitize' => array(
\t\t'post_before_set' => $post_before_set,
\t\t'post_after_set' => $post_after_set,
\t\t'unsanitized_keys' => array_keys( $manager->unsanitized_post_values() ),
\t\t'setting_json' => $setting->json(),
\t\t'post_value_set_action_count' => did_action( 'customize_post_value_set' ),
\t),
\t'settings:validate-values' => array(
\t\t'fixture_option' => true === $validities['fixture_option'],
\t\t'fixture_bad_error_codes' => $validities['fixture_bad']->get_error_codes(),
\t\t'unknown_error_codes' => $validities['unknown_setting']->get_error_codes(),
\t),
\t'objects:json-and-capabilities' => array(
\t\t'control_json' => array(
\t\t\t'type' => $control_json['type'],
\t\t\t'active' => $control_json['active'],
\t\t\t'section' => $control_json['section'],
\t\t\t'label' => $control_json['label'],
\t\t\t'settings' => $control_json['settings'],
\t\t\t'content_has_select' => str_contains( $control_json['content'], '<select' ),
\t\t\t'content_has_link' => str_contains( $control_json['content'], 'data-customize-setting-link="fixture_option"' ),
\t\t),
\t\t'panel_json' => array(
\t\t\t'title' => $panel_json['title'],
\t\t\t'active' => $panel_json['active'],
\t\t\t'priority' => $panel_json['priority'],
\t\t),
\t\t'section_json' => array(
\t\t\t'title' => $section_json['title'],
\t\t\t'active' => $section_json['active'],
\t\t\t'panel' => $section_json['panel'],
\t\t\t'customizeAction' => $section_json['customizeAction'],
\t\t),
\t\t'capabilities' => array(
\t\t\t'setting' => $setting->check_capabilities(),
\t\t\t'control' => $control->check_capabilities(),
\t\t\t'panel' => $panel->check_capabilities(),
\t\t\t'section' => $section->check_capabilities(),
\t\t),
\t),
\t'selective-refresh:partial' => array(
\t\t'partial_json' => $partial_json,
\t\t'rendered' => $partial_rendered,
\t\t'capabilities' => $partial_capabilities,
\t\t'count_before_remove' => $partial_count_before_remove,
\t\t'count_after_remove' => $partial_count_after_remove,
\t),
);

ksort( $cases );
echo json_encode(
\tarray(
\t\t'cases' => $cases,
\t\t'actions' => $GLOBALS['wphx_310_09_actions'],
\t\t'filters' => $GLOBALS['wphx_310_09_filters'],
\t\t'php_errors' => $GLOBALS['wphx_310_09_errors'],
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
    if (current !== contents)
      throw new Error(`${path} is stale; run npm run wp:core:wphx-310-customizer-manager-setting-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/customizer-manager-setting-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Customizer manager, settings, controls, panels, sections, and selective refresh behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 Customizer source against deterministic in-process options, theme mods, capabilities, hooks, and customized request data. It does not claim generated public PHP replacement, full changeset transaction parity, Customizer admin UI parity, database-backed installed behavior, or upstream parity."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-haxe-adapter-contract-foundation",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass full changeset persistence, Customizer admin UI, selective-refresh request handling, installed behavior, and selected upstream Customizer PHPUnit gates before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-310-customizer-manager-setting-oracle-fixture",
        "npm run wp:core:wphx-310-customizer-manager-setting-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-310-09-customizer-manager-setting-oracle-fixture"],
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
  schema: "wphx.wp-core-customizer-manager-setting-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    customizer_surface_manifest: inputRecord(CUSTOMIZER_SURFACE),
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
      id: "changeset-persistence-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture covers in-process customized payload and setting validation flow. save_changeset_post, autosaves, locking, scheduled publication, and post/revision persistence remain later gates."
    },
    {
      id: "customizer-ui-and-request-handling-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "Customizer controls UI requests, nonce refresh, themes loading, selective-refresh AJAX rendering, widgets/nav-menus component behavior, and browser-admin interaction remain later gates."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "Customizer PHP files are copied oracle source in this fixture; generated original-path PHP replacement remains a later cross-domain gate."
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
  id: "receipt:wphx-310-09-customizer-manager-setting-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "customizer manager/settings oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle Customizer boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-310-customizer-manager-setting-oracle-fixture",
    "npm run wp:core:wphx-310-customizer-manager-setting-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-310-01-themes-template-surface",
    "receipt:wphx-310-02-theme-template-adapter-contract-candidate",
    "receipt:wphx-310-06-theme-customizer-widget-nav-surface",
    "receipt:wphx-310-07-widget-sidebar-oracle-fixture",
    "receipt:wphx-310-08-nav-menu-oracle-fixture"
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
