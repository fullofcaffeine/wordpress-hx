#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.17.5",
  external_ref: "WPHX-310.05",
  title: "WPHX-310.05 — Add theme JSON resolver/global styles wrapper fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-theme-json-resolver-global-styles-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-310-05";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-310-05-theme-json-resolver-global-styles-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-310-05-theme-json-resolver-global-styles-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-310-05-theme-json-resolver-global-styles-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-310-01-themes-template-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-310-02-theme-template-adapter-contract-candidate.v1.json";
const SUPPORT_FIXTURE = "manifests/wp-core/wphx-310-03-theme-support-template-oracle-fixture.v1.json";
const THEME_JSON_FIXTURE = "manifests/wp-core/wphx-310-04-theme-json-global-styles-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-theme-json-schema.php",
  "src/wp-includes/class-wp-theme-json.php",
  "src/wp-includes/class-wp-theme-json-data.php",
  "src/wp-includes/class-wp-theme-json-resolver.php",
  "src/wp-includes/global-styles-and-settings.php"
];
const COVERED_SYMBOLS = [
  "WP_Theme_JSON_Resolver::get_core_data",
  "WP_Theme_JSON_Resolver::get_theme_data",
  "WP_Theme_JSON_Resolver::get_style_variations",
  "WP_Theme_JSON_Resolver::get_merged_data",
  "WP_Theme_JSON_Resolver::resolve_theme_file_uris",
  "WP_Theme_JSON_Resolver::clean_cached_data",
  "wp_get_global_settings",
  "wp_get_global_styles",
  "wp_get_global_stylesheet",
  "wp_theme_has_theme_json",
  "wp_get_theme_data_template_parts",
  "wp_clean_theme_json_cache"
];
const FIXTURE_CASES = [
  { id: "resolver:core-theme-merge", focus: "core and active theme theme.json data merge through WP_Theme_JSON_Resolver" },
  { id: "resolver:block-style-variation-partials", focus: "styles/*.json block variation partials are discovered and injected into theme data" },
  { id: "wrappers:global-settings-cache", focus: "wp_get_global_settings origin=base uses the theme_json cache key" },
  { id: "wrappers:global-styles-and-stylesheet", focus: "global styles and stylesheet wrappers expose merged theme data" },
  { id: "wrappers:theme-json-support-and-template-parts-cache", focus: "theme.json support and template-part metadata wrappers cache and return theme.json state" },
  { id: "resolver:theme-file-uri-resolution-and-clean", focus: "file:./ URLs resolve to theme URIs and wp_clean_theme_json_cache clears wrapper keys" }
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

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`);
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }

  writeJson(`${root}/wp-includes/theme-i18n.json`, {});
  writeJson(`${root}/wp-includes/theme.json`, {
    version: 3,
    settings: {
      color: {
        palette: [
          { slug: "core-black", name: "Core Black", color: "#111111" },
          { slug: "core-white", name: "Core White", color: "#ffffff" }
        ]
      },
      typography: {
        fontSizes: [{ slug: "core-small", name: "Core Small", size: "13px" }]
      }
    },
    styles: {
      color: {
        text: "var:preset|color|core-black",
        background: "var:preset|color|core-white"
      }
    }
  });

  const themeRoot = `${root}/wp-content/themes/wphx-theme`;
  mkdirSync(`${themeRoot}/styles`, { recursive: true });
  mkdirSync(`${themeRoot}/assets`, { recursive: true });
  writeFileSync(`${themeRoot}/assets/hero.jpg`, "wphx fixture image\n");
  writeJson(`${themeRoot}/theme.json`, {
    version: 3,
    settings: {
      appearanceTools: true,
      color: {
        palette: [
          { slug: "brand-blue", name: "Brand Blue", color: "#0055aa" },
          { slug: "accent-gold", name: "Accent Gold", color: "#d4a017" }
        ]
      },
      typography: {
        fontSizes: [{ slug: "display", name: "Display", size: "clamp(2rem, 4vw, 4rem)" }]
      }
    },
    styles: {
      color: {
        text: "var:preset|color|brand-blue"
      },
      background: {
        backgroundImage: {
          url: "file:./assets/hero.jpg"
        }
      },
      blocks: {
        "core/paragraph": {
          color: {
            text: "var:preset|color|accent-gold"
          },
          variations: {
            soft: {
              color: {
                background: "#f5f8ff"
              }
            }
          }
        }
      }
    },
    customTemplates: [{ name: "landing", title: "Landing", postTypes: ["page"] }],
    templateParts: [{ name: "header", title: "Header", area: "header" }],
    patterns: ["wphx/hero", "wphx/card-grid"]
  });
  writeJson(`${themeRoot}/styles/paragraph-soft.json`, {
    version: 3,
    title: "Soft Paragraph",
    slug: "soft",
    blockTypes: ["core/paragraph"],
    styles: {
      color: {
        text: "#123456",
        background: "#eef4ff"
      }
    }
  });
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

$GLOBALS['wphx_310_05_cache'] = array();
$GLOBALS['wphx_310_05_cache_ops'] = array();
$GLOBALS['wphx_310_05_filters'] = array();
$GLOBALS['wphx_310_05_errors'] = array();
$GLOBALS['wphx_310_05_registered_variations'] = array();
$GLOBALS['wphx_310_05_theme_root'] = ABSPATH . 'wp-content/themes/wphx-theme';

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_310_05_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

function __( $text ) { return $text; }
function _deprecated_function( $function_name, $version, $replacement = '' ) {
\t$GLOBALS['wphx_310_05_errors'][] = array( 'deprecated' => $function_name, 'version' => $version, 'replacement' => $replacement );
}
function _deprecated_argument( $function_name, $version, $message = '' ) {
\t$GLOBALS['wphx_310_05_errors'][] = array( 'deprecated_argument' => $function_name, 'version' => $version, 'message' => $message );
}
function wp_trigger_error( $function_name, $message, $error_level = E_USER_NOTICE ) {
\t$GLOBALS['wphx_310_05_errors'][] = array( 'function' => $function_name, 'message' => $message, 'level' => $error_level );
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_310_05_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\treturn $value;
}
function translate_settings_using_i18n_schema( $i18n_schema, $theme_json, $domain = 'default' ) { return $theme_json; }
function wp_json_file_decode( $filename, $options = array() ) {
\t$contents = file_get_contents( $filename );
\tif ( false === $contents ) {
\t\treturn null;
\t}
\t$associative = $options['associative'] ?? false;
\treturn json_decode( $contents, $associative );
}
function wp_json_encode( $data, $options = 0, $depth = 512 ) { return json_encode( $data, $options, $depth ); }
function wp_parse_args( $args, $defaults = array() ) { return array_merge( $defaults, is_array( $args ) ? $args : array() ); }
function current_theme_supports( $feature, ...$args ) { return false; }
function get_classic_theme_supports_block_editor_settings() { return array(); }
function wp_is_development_mode( $mode ) { return false; }
function wp_is_block_theme() { return true; }
function wp_should_load_block_assets_on_demand() { return false; }
function wp_add_inline_style( $handle, $css ) {}
function get_transient( $key ) { return false; }
function set_transient( $key, $value ) { return true; }

function wp_cache_get( $key, $group = '' ) {
\t$cache_key = $group . ':' . $key;
\t$hit = array_key_exists( $cache_key, $GLOBALS['wphx_310_05_cache'] );
\t$GLOBALS['wphx_310_05_cache_ops'][] = array( 'op' => 'get', 'group' => $group, 'key' => $key, 'hit' => $hit );
\treturn $hit ? $GLOBALS['wphx_310_05_cache'][ $cache_key ] : false;
}
function wp_cache_set( $key, $value, $group = '' ) {
\t$GLOBALS['wphx_310_05_cache_ops'][] = array( 'op' => 'set', 'group' => $group, 'key' => $key );
\t$GLOBALS['wphx_310_05_cache'][ $group . ':' . $key ] = $value;
\treturn true;
}
function wp_cache_delete( $key, $group = '' ) {
\t$GLOBALS['wphx_310_05_cache_ops'][] = array( 'op' => 'delete', 'group' => $group, 'key' => $key );
\tunset( $GLOBALS['wphx_310_05_cache'][ $group . ':' . $key ] );
\treturn true;
}

function _wp_array_get( $array, $path, $default = null ) {
\tforeach ( $path as $key ) {
\t\tif ( is_array( $array ) && array_key_exists( $key, $array ) ) {
\t\t\t$array = $array[ $key ];
\t\t} else {
\t\t\treturn $default;
\t\t}
\t}
\treturn $array;
}
function _wp_array_set( &$array, $path, $value ) {
\t$current =& $array;
\tforeach ( $path as $key ) {
\t\tif ( ! is_array( $current ) ) {
\t\t\t$current = array();
\t\t}
\t\tif ( ! array_key_exists( $key, $current ) ) {
\t\t\t$current[ $key ] = array();
\t\t}
\t\t$current =& $current[ $key ];
\t}
\t$current = $value;
}
function wp_is_numeric_array( $data ) {
\treturn is_array( $data ) && ( array() === $data || array_keys( $data ) === range( 0, count( $data ) - 1 ) );
}
function _wp_to_kebab_case( $value ) {
\t$value = preg_replace( '/([a-z])([A-Z])/', '$1-$2', (string) $value );
\t$value = preg_replace( '/[^a-zA-Z0-9]+/', '-', $value );
\treturn trim( strtolower( $value ), '-' );
}
function sanitize_title( $value ) { return _wp_to_kebab_case( $value ); }
function sanitize_html_class( $value ) { return preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $value ); }
function sanitize_url( $value ) { return (string) $value; }
function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function safecss_filter_attr( $css ) {
\t$parts = array();
\tforeach ( explode( ';', (string) $css ) as $declaration ) {
\t\tif ( '' === trim( $declaration ) || str_contains( strtolower( $declaration ), 'javascript:' ) || str_contains( strtolower( $declaration ), 'expression(' ) ) {
\t\t\tcontinue;
\t\t}
\t\t$parts[] = trim( $declaration );
\t}
\treturn implode( '; ', $parts );
}
function wp_recursive_ksort( &$array ) {
\tif ( ! is_array( $array ) ) {
\t\treturn;
\t}
\tksort( $array );
\tforeach ( $array as &$value ) {
\t\twp_recursive_ksort( $value );
\t}
}
function wp_get_typography_font_size_value( $preset, $settings = array() ) { return $preset['size'] ?? ''; }
function wp_get_layout_definitions() { return array(); }
function block_has_support( $block_type, $feature, $default = false ) { return $default; }
function wp_style_engine_get_styles( $styles, $options = array() ) {
\t$declarations = array();
\tforeach ( $styles as $property => $value ) {
\t\tif ( is_scalar( $value ) ) {
\t\t\t$declarations[ _wp_to_kebab_case( $property ) ] = (string) $value;
\t\t} elseif ( 'background' === $property && is_array( $value ) && isset( $value['backgroundImage'] ) ) {
\t\t\t$image = $value['backgroundImage'];
\t\t\tif ( is_array( $image ) && isset( $image['url'] ) ) {
\t\t\t\t$image = $image['url'];
\t\t\t}
\t\t\t$declarations['background-image'] = str_starts_with( (string) $image, 'url(' ) ? (string) $image : 'url(' . $image . ')';
\t\t}
\t}
\t$css = array();
\tforeach ( $declarations as $property => $value ) {
\t\t$css[] = $property . ': ' . $value;
\t}
\treturn array( 'css' => implode( '; ', $css ), 'declarations' => $declarations );
}
function wp_check_filetype( $filename ) {
\treturn str_ends_with( $filename, '.jpg' ) ? array( 'ext' => 'jpg', 'type' => 'image/jpeg' ) : array( 'ext' => '', 'type' => '' );
}
function get_theme_file_uri( $file = '' ) { return 'https://example.test/wp-content/themes/wphx-theme/' . ltrim( $file, '/' ); }
function get_stylesheet() { return 'wphx-theme'; }
function get_template() { return 'wphx-theme'; }
function get_stylesheet_directory() { return $GLOBALS['wphx_310_05_theme_root']; }
function get_template_directory() { return $GLOBALS['wphx_310_05_theme_root']; }

class WP_Theme {
\tprivate $stylesheet;
\tprivate $theme_root;
\tpublic function __construct( $stylesheet = 'wphx-theme', $theme_root = null ) {
\t\t$this->stylesheet = $stylesheet;
\t\t$this->theme_root = $theme_root ?: $GLOBALS['wphx_310_05_theme_root'];
\t}
\tpublic function get_file_path( $file = '' ) { return $this->theme_root . '/' . ltrim( $file, '/' ); }
\tpublic function get( $header ) { return 'TextDomain' === $header ? 'wphx-theme' : ''; }
\tpublic function get_stylesheet() { return $this->stylesheet; }
\tpublic function get_template() { return $this->stylesheet; }
\tpublic function parent() { return false; }
}
function wp_get_theme() { return new WP_Theme(); }

class WP_Post {}
class WP_Query {
\tpublic function query( $args ) { return array(); }
}
function wp_insert_post( $postarr, $wp_error = false ) { return 0; }
function get_post( $post = null ) { return null; }
function is_wp_error( $thing ) { return false; }

class WP_Block_Type_Registry {
\tpublic static function get_instance() { return new self(); }
\tpublic function get_all_registered() {
\t\treturn array(
\t\t\t'core/paragraph' => (object) array(
\t\t\t\t'name' => 'core/paragraph',
\t\t\t\t'supports' => array(
\t\t\t\t\t'__experimentalStyle' => array(
\t\t\t\t\t\t'color' => array( 'text' => '#333333' ),
\t\t\t\t\t),
\t\t\t\t),
\t\t\t\t'selectors' => array( 'root' => '.wp-block-paragraph' ),
\t\t\t),
\t\t);
\t}
\tpublic function get_registered( $name ) {
\t\t$all = $this->get_all_registered();
\t\treturn $all[ $name ] ?? null;
\t}
}
class WP_Block_Styles_Registry {
\tpublic static function get_instance() { return new self(); }
\tpublic function get_all_registered() {
\t\treturn array(
\t\t\t'core/paragraph' => array(
\t\t\t\t'quiet' => array(
\t\t\t\t\t'name' => 'quiet',
\t\t\t\t\t'label' => 'Quiet',
\t\t\t\t\t'style_data' => array( 'color' => array( 'text' => '#666666' ) ),
\t\t\t\t),
\t\t\t),
\t\t);
\t}
\tpublic function get_registered_styles_for_block( $block_type ) {
\t\t$all = $this->get_all_registered();
\t\treturn array_values( $all[ $block_type ] ?? array() );
\t}
}
function wp_register_block_style_variations_from_theme_json_partials( $variations ) {
\t$GLOBALS['wphx_310_05_registered_variations'][] = array_map(
\t\tstatic function ( $variation ) {
\t\t\treturn array(
\t\t\t\t'title' => $variation['title'] ?? '',
\t\t\t\t'slug' => $variation['slug'] ?? '',
\t\t\t\t'blockTypes' => $variation['blockTypes'] ?? array(),
\t\t\t);
\t\t},
\t\t$variations
\t);
}

require ABSPATH . WPINC . '/class-wp-theme-json-schema.php';
require ABSPATH . WPINC . '/class-wp-theme-json.php';
require ABSPATH . WPINC . '/class-wp-theme-json-data.php';
require ABSPATH . WPINC . '/class-wp-theme-json-resolver.php';
require ABSPATH . WPINC . '/global-styles-and-settings.php';

WP_Theme_JSON_Resolver::clean_cached_data();

$core_data = WP_Theme_JSON_Resolver::get_core_data();
$theme_without_supports = WP_Theme_JSON_Resolver::get_theme_data( array(), array( 'with_supports' => false ) );
$theme_raw = $theme_without_supports->get_raw_data();
$block_variations = WP_Theme_JSON_Resolver::get_style_variations( 'block' );
$merged_theme = WP_Theme_JSON_Resolver::get_merged_data( 'theme' );
$merged_theme_raw = $merged_theme->get_raw_data();

$settings_first = wp_get_global_settings( array( 'color', 'palette', 'theme' ), array( 'origin' => 'base' ) );
$settings_second = wp_get_global_settings( array( 'color', 'palette', 'theme' ), array( 'origin' => 'base' ) );
$styles_text = wp_get_global_styles( array( 'color', 'text' ), array( 'origin' => 'base', 'transforms' => array( 'resolve-variables' ) ) );
$stylesheet_typed = wp_get_global_stylesheet( array( 'variables', 'presets' ) );
$stylesheet_cached_first = wp_get_global_stylesheet();
$stylesheet_cached_second = wp_get_global_stylesheet();
$theme_has_json_first = wp_theme_has_theme_json();
$theme_has_json_second = wp_theme_has_theme_json();
$template_parts_first = wp_get_theme_data_template_parts();
$template_parts_second = wp_get_theme_data_template_parts();
$resolved_uris = WP_Theme_JSON_Resolver::get_resolved_theme_uris( $merged_theme );

$cache_ops_before_clean = $GLOBALS['wphx_310_05_cache_ops'];
wp_clean_theme_json_cache();
$settings_after_clean = wp_get_global_settings( array( 'color', 'palette', 'theme' ), array( 'origin' => 'base' ) );

$cases = array(
\t'resolver:core-theme-merge' => array(
\t\t'core_palette_slugs' => array_column( _wp_array_get( $core_data->get_settings(), array( 'color', 'palette', 'default' ), array() ), 'slug' ),
\t\t'theme_palette_slugs' => array_column( $settings_first, 'slug' ),
\t\t'merged_text' => _wp_array_get( $merged_theme_raw, array( 'styles', 'color', 'text' ) ),
\t\t'patterns' => $theme_without_supports->get_patterns(),
\t),
\t'resolver:block-style-variation-partials' => array(
\t\t'variation_titles' => array_column( $block_variations, 'title' ),
\t\t'registered_batches' => count( $GLOBALS['wphx_310_05_registered_variations'] ),
\t\t'paragraph_variation_keys' => array_keys( _wp_array_get( $theme_raw, array( 'styles', 'blocks', 'core/paragraph', 'variations' ), array() ) ),
\t),
\t'wrappers:global-settings-cache' => array(
\t\t'first_slugs' => array_column( $settings_first, 'slug' ),
\t\t'second_slugs' => array_column( $settings_second, 'slug' ),
\t\t'cache_gets' => count( array_filter( $cache_ops_before_clean, static fn( $op ) => 'get' === $op['op'] && 'wp_get_global_settings_theme' === $op['key'] ) ),
\t\t'cache_sets' => count( array_filter( $cache_ops_before_clean, static fn( $op ) => 'set' === $op['op'] && 'wp_get_global_settings_theme' === $op['key'] ) ),
\t\t'cache_hits' => count( array_filter( $cache_ops_before_clean, static fn( $op ) => ( $op['hit'] ?? false ) && 'wp_get_global_settings_theme' === $op['key'] ) ),
\t),
\t'wrappers:global-styles-and-stylesheet' => array(
\t\t'resolved_text' => $styles_text,
\t\t'has_brand_variable' => str_contains( $stylesheet_typed, '--wp--preset--color--brand-blue' ),
\t\t'has_accent_class' => str_contains( $stylesheet_typed, '.has-accent-gold-color' ),
\t\t'cached_stylesheet_hit' => $stylesheet_cached_first === $stylesheet_cached_second,
\t\t'cached_stylesheet_sha256' => hash( 'sha256', $stylesheet_cached_second ),
\t),
\t'wrappers:theme-json-support-and-template-parts-cache' => array(
\t\t'theme_has_json' => array( $theme_has_json_first, $theme_has_json_second ),
\t\t'template_part_names' => array_keys( $template_parts_first ),
\t\t'template_parts_cache_hit' => $template_parts_first === $template_parts_second,
\t),
\t'resolver:theme-file-uri-resolution-and-clean' => array(
\t\t'resolved_targets' => array_column( $resolved_uris, 'target' ),
\t\t'resolved_hrefs' => array_column( $resolved_uris, 'href' ),
\t\t'deleted_keys' => array_values( array_map(
\t\t\tstatic fn( $op ) => $op['key'],
\t\t\tarray_filter( $GLOBALS['wphx_310_05_cache_ops'], static fn( $op ) => 'delete' === $op['op'] )
\t\t) ),
\t\t'after_clean_slugs' => array_column( $settings_after_clean, 'slug' ),
\t),
);

ksort( $cases );
echo json_encode(
\tarray(
\t\t'cases' => $cases,
\t\t'filters' => $GLOBALS['wphx_310_05_filters'],
\t\t'cache_ops' => $GLOBALS['wphx_310_05_cache_ops'],
\t\t'registered_variations' => $GLOBALS['wphx_310_05_registered_variations'],
\t\t'php_errors' => $GLOBALS['wphx_310_05_errors'],
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
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-310-theme-json-resolver-global-styles`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/theme-json-resolver-global-styles-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Theme_JSON_Resolver and global styles/settings wrapper behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 WP_Theme_JSON_Resolver and global styles/settings wrapper source against deterministic core/theme fixture files while requiring prior WPHX-310 surface, adapter-contract, theme support/template, and WP_Theme_JSON evidence. It does not claim generated public PHP replacement, installed theme rendering/admin parity, customizer/widget/nav-menu parity, or full upstream PHPUnit coverage."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-haxe-adapter-contract-foundation",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass customizer/widget/nav-menu, installed front-end/admin, selected upstream PHPUnit, and full theme JSON/global styles gates before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-310-theme-json-resolver-global-styles",
        "npm run wp:core:wphx-310-theme-json-resolver-global-styles:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-310-05-theme-json-resolver-global-styles-fixture"],
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
  schema: "wphx.wp-core-theme-json-resolver-global-styles-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    theme_support_template_fixture: inputRecord(SUPPORT_FIXTURE),
    theme_json_fixture: inputRecord(THEME_JSON_FIXTURE),
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
      id: "installed-theme-rendering-and-admin-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture executes resolver and wrapper PHP against deterministic in-process files. Installed front-end rendering, block theme admin screens, customizer transactions, nav-menu/widget admin, and REST global styles controllers remain later WPHX-310 gates."
    },
    {
      id: "global-styles-user-cpt-path-is-empty",
      owner: ISSUE.external_ref,
      detail:
        "The user global styles custom-post-type query path is stubbed to no rows to keep the fixture deterministic. DB-backed user global styles mutation remains a later installed/distribution gate."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "WP_Theme_JSON_Resolver and global styles/settings PHP files are copied oracle source in this fixture; generated original-path PHP replacement remains a later cross-domain gate."
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
  id: "receipt:wphx-310-05-theme-json-resolver-global-styles-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "theme JSON resolver/global styles wrapper oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle resolver/global-styles boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-310-theme-json-resolver-global-styles",
    "npm run wp:core:wphx-310-theme-json-resolver-global-styles:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-310-01-themes-template-surface",
    "receipt:wphx-310-02-theme-template-adapter-contract-candidate",
    "receipt:wphx-310-03-theme-support-template-oracle-fixture",
    "receipt:wphx-310-04-theme-json-global-styles-oracle-fixture"
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
