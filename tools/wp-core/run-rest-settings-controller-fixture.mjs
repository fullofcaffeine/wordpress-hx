#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.10.1",
  external_ref: "WPHX-311.01",
  title: "Build REST settings controller fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-311-01";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-311-01-rest-settings-controller-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-01-rest-settings-controller-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-01-rest-settings-controller-fixture.v1.json";
const SETTINGS_FIXTURE = "manifests/wp-core/wphx-304-06-settings-defaults-fixture.v1.json";
const WPDB_CLOSURE = "receipts/wp-core/wphx-305-domain-closure.v1.json";
const RECORDED_AT = "2026-06-22T07:20:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/pomo/plural-forms.php",
  "src/wp-includes/pomo/entry.php",
  "src/wp-includes/pomo/translations.php",
  "src/wp-includes/l10n.php",
  "src/wp-includes/class-wp-list-util.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-includes/rest-api.php",
  "src/wp-includes/rest-api/class-wp-rest-request.php",
  "src/wp-includes/rest-api/class-wp-rest-response.php",
  "src/wp-includes/rest-api/class-wp-rest-server.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-controller.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php"
];

const COVERED_SYMBOLS = [
  "WP_REST_Settings_Controller::__construct",
  "WP_REST_Settings_Controller::register_routes",
  "WP_REST_Settings_Controller::get_item_permissions_check",
  "WP_REST_Settings_Controller::get_item",
  "WP_REST_Settings_Controller::update_item",
  "WP_REST_Settings_Controller::get_item_schema",
  "WP_REST_Settings_Controller::sanitize_callback",
  "register_rest_route",
  "rest_validate_value_from_schema",
  "rest_sanitize_value_from_schema",
  "rest_default_additional_properties_to_false",
  "rest_get_endpoint_args_for_schema"
];

const FIXTURE_CASES = [
  {
    id: "rest-settings:route-registration",
    symbol: "WP_REST_Settings_Controller::register_routes",
    focus: "wp/v2/settings route registration, readable/editable methods, schema callback, endpoint args, and route permission callback shape"
  },
  {
    id: "rest-settings:permission-callback",
    symbol: "WP_REST_Settings_Controller::get_item_permissions_check",
    focus: "manage_options capability delegation through the REST settings permission callback"
  },
  {
    id: "rest-settings:schema-emission",
    symbol: "WP_REST_Settings_Controller::get_item_schema",
    focus: "show_in_rest filtering, custom REST names, supported type filtering, object additionalProperties defaults, and arg_options sanitize callback"
  },
  {
    id: "rest-settings:get-item",
    symbol: "WP_REST_Settings_Controller::get_item",
    focus: "registered setting value retrieval, rest_pre_get_setting, schema validation failure to null, and REST sanitization"
  },
  {
    id: "rest-settings:update-item",
    symbol: "WP_REST_Settings_Controller::update_item",
    focus: "request ArrayAccess params, rest_pre_update_setting, update_option, delete_option on null, and response refresh"
  },
  {
    id: "rest-settings:null-invalid-stored-value",
    symbol: "WP_REST_Settings_Controller::update_item",
    focus: "null update rejection when the stored option value is invalid for its REST schema"
  },
  {
    id: "rest-settings:sanitize-callback",
    symbol: "WP_REST_Settings_Controller::sanitize_callback",
    focus: "null passthrough and route-argument sanitizer behavior through rest_parse_request_arg"
  }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch {
    return null;
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );
$GLOBALS['wphx_311_01_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_01_php_errors'][] = array(
\t\t\t'errno'   => $errno,
\t\t\t'message' => $errstr,
\t\t);
\t\treturn true;
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

class WPHX_311_01_Fake_WPDB {
\tpublic $options = 'wp_options';
\tpublic $queries = array();
\tpublic $last_error = '';
\tprivate $suppress_errors = false;
\tprivate $store = array();

\tpublic function reset() {
\t\t$this->queries = array();
\t\t$this->store   = array();
\t}

\tpublic function set_option( $name, $value, $autoload = 'off' ) {
\t\t$this->store[ $name ] = array(
\t\t\t'option_value' => maybe_serialize( $value ),
\t\t\t'autoload'     => $autoload,
\t\t);
\t}

\tpublic function snapshot() {
\t\t$result = array();
\t\tforeach ( $this->store as $name => $row ) {
\t\t\t$result[ $name ] = array(
\t\t\t\t'value'    => maybe_unserialize( $row['option_value'] ),
\t\t\t\t'autoload' => $row['autoload'],
\t\t\t);
\t\t}
\t\tksort( $result );
\t\treturn $result;
\t}

\tpublic function suppress_errors( $suppress = null ) {
\t\t$previous = $this->suppress_errors;
\t\tif ( null !== $suppress ) {
\t\t\t$this->suppress_errors = (bool) $suppress;
\t\t}
\t\treturn $previous;
\t}

\tpublic function strip_invalid_text_for_column( $table, $column, $value ) {
\t\treturn $value;
\t}

\tpublic function _escape( $data ) {
\t\tif ( is_array( $data ) ) {
\t\t\treturn array_map( array( $this, '_escape' ), $data );
\t\t}
\t\treturn str_replace( \"'\", \"\\\\'\", (string) $data );
\t}

\tpublic function esc_like( $text ) {
\t\treturn addcslashes( $text, '_%\\\\' );
\t}

\tpublic function prepare( $query, ...$args ) {
\t\tif ( 1 === count( $args ) && is_array( $args[0] ) ) {
\t\t\t$args = $args[0];
\t\t}
\t\treturn array(
\t\t\t'query' => $query,
\t\t\t'args'  => array_values( $args ),
\t\t);
\t}

\tprivate function unpack_query( $query ) {
\t\tif ( is_array( $query ) ) {
\t\t\treturn array( $query['query'], $query['args'] );
\t\t}
\t\treturn array( $query, array() );
\t}

\tprivate function record( $operation, $query, $args = array(), $extra = array() ) {
\t\t$this->queries[] = array_merge(
\t\t\tarray(
\t\t\t\t'operation' => $operation,
\t\t\t\t'query'     => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ),
\t\t\t\t'args'      => $args,
\t\t\t),
\t\t\t$extra
\t\t);
\t}

\tpublic function get_results( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_results', $sql, $args );
\t\tif ( false !== strpos( $sql, 'autoload' ) ) {
\t\t\t$rows = array();
\t\t\tforeach ( $this->store as $option_name => $row ) {
\t\t\t\tif ( in_array( $row['autoload'], wp_autoload_values_to_autoload(), true ) ) {
\t\t\t\t\t$rows[] = (object) array(
\t\t\t\t\t\t'option_name'  => $option_name,
\t\t\t\t\t\t'option_value' => $row['option_value'],
\t\t\t\t\t);
\t\t\t\t}
\t\t\t}
\t\t\treturn $rows;
\t\t}
\t\treturn array();
\t}

\tpublic function get_row( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_row', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\t$row = $this->store[ $option ];
\t\tif ( false !== strpos( $sql, 'autoload' ) && false === strpos( $sql, 'option_value' ) ) {
\t\t\treturn (object) array( 'autoload' => $row['autoload'] );
\t\t}
\t\treturn (object) array(
\t\t\t'option_value' => $row['option_value'],
\t\t\t'autoload'     => $row['autoload'],
\t\t);
\t}

\tpublic function get_var( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_var', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\tif ( false !== strpos( $sql, 'autoload' ) ) {
\t\t\treturn $this->store[ $option ]['autoload'];
\t\t}
\t\treturn $this->store[ $option ]['option_value'];
\t}

\tpublic function update( $table, $data, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'update', 'UPDATE ' . $table, array(), array( 'data' => $data, 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tif ( array_key_exists( 'option_value', $data ) ) {
\t\t\t$this->store[ $option ]['option_value'] = $data['option_value'];
\t\t}
\t\tif ( array_key_exists( 'autoload', $data ) ) {
\t\t\t$this->store[ $option ]['autoload'] = $data['autoload'];
\t\t}
\t\treturn 1;
\t}

\tpublic function delete( $table, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'delete', 'DELETE ' . $table, array(), array( 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tunset( $this->store[ $option ] );
\t\treturn 1;
\t}

\tpublic function query( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'query', $sql, $args );
\t\tif ( false !== strpos( $sql, 'INSERT INTO' ) && count( $args ) >= 3 ) {
\t\t\t$this->store[ $args[0] ] = array(
\t\t\t\t'option_value' => $args[1],
\t\t\t\t'autoload'     => $args[2],
\t\t\t);
\t\t\treturn 1;
\t\t}
\t\treturn true;
\t}
}

global $wpdb;
$wpdb = new WPHX_311_01_Fake_WPDB();

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_01_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args'       => $args,
\t);
\treturn (bool) $GLOBALS['wphx_311_01_can_manage_options'];
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/pomo/translations.php';
require_once ABSPATH . WPINC . '/l10n.php';
require_once ABSPATH . WPINC . '/class-wp-list-util.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wp-http-response.php';
require_once ABSPATH . WPINC . '/functions.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-request.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-response.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-server.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-controller.php';
require_once ABSPATH . WPINC . '/rest-api.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-settings-controller.php';

wp_cache_init();

function wphx_311_01_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
\t}
\tif ( is_float( $value ) ) {
\t\treturn array( 'type' => 'float', 'value' => $value );
\t}
\tif ( is_bool( $value ) ) {
\t\treturn array( 'type' => 'bool', 'value' => $value );
\t}
\tif ( null === $value ) {
\t\treturn array( 'type' => 'null', 'value' => null );
\t}
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => (string) $value,
\t\t'hex'    => bin2hex( (string) $value ),
\t\t'bytes'  => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_311_01_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_311_01_scalar( $key ),
\t\t\t\t'value' => wphx_311_01_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( $value instanceof WP_Error ) {
\t\treturn array(
\t\t\t'type'    => 'wp_error',
\t\t\t'code'    => $value->get_error_code(),
\t\t\t'message' => $value->get_error_message(),
\t\t\t'data'    => wphx_311_01_value( $value->get_error_data() ),
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_311_01_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_311_01_scalar( $value );
}

function wphx_311_01_callback_label( $callback ) {
\tif ( null === $callback || '' === $callback ) {
\t\treturn null;
\t}
\tif ( is_string( $callback ) ) {
\t\treturn array( 'type' => 'function', 'name' => $callback );
\t}
\tif ( is_array( $callback ) ) {
\t\treturn array(
\t\t\t'type'   => 'array',
\t\t\t'target' => is_object( $callback[0] ?? null ) ? get_class( $callback[0] ) : (string) ( $callback[0] ?? '' ),
\t\t\t'method' => (string) ( $callback[1] ?? '' ),
\t\t);
\t}
\tif ( $callback instanceof Closure ) {
\t\treturn array( 'type' => 'closure' );
\t}
\treturn array( 'type' => gettype( $callback ) );
}

function wphx_311_01_schema_summary( $schema ) {
\t$properties = array();
\tforeach ( $schema['properties'] ?? array() as $name => $property ) {
\t\t$properties[ $name ] = array(
\t\t\t'type'                 => $property['type'] ?? null,
\t\t\t'title'                => $property['title'] ?? null,
\t\t\t'description'          => $property['description'] ?? null,
\t\t\t'default'              => $property['default'] ?? null,
\t\t\t'context'              => $property['context'] ?? null,
\t\t\t'additionalProperties' => $property['additionalProperties'] ?? null,
\t\t\t'items'                => $property['items'] ?? null,
\t\t\t'properties'           => array_keys( $property['properties'] ?? array() ),
\t\t\t'arg_options'          => array(
\t\t\t\t'sanitize_callback' => wphx_311_01_callback_label( $property['arg_options']['sanitize_callback'] ?? null ),
\t\t\t),
\t\t);
\t}
\treturn array(
\t\t'title'         => $schema['title'] ?? null,
\t\t'type'          => $schema['type'] ?? null,
\t\t'propertyKeys'  => array_keys( $schema['properties'] ?? array() ),
\t\t'properties'    => $properties,
\t\t'hasArgOptions' => array_keys( array_filter( $properties, static function ( $property ) {
\t\t\treturn null !== $property['arg_options']['sanitize_callback'];
\t\t} ) ),
\t);
}

function wphx_311_01_route_summary( $routes ) {
\t$route = $routes['/wp/v2/settings'] ?? array();
\t$handlers = array();
\tforeach ( $route as $key => $handler ) {
\t\tif ( ! is_numeric( $key ) ) {
\t\t\tcontinue;
\t\t}
\t\t$handlers[] = array(
\t\t\t'methods'             => array_keys( $handler['methods'] ?? array() ),
\t\t\t'callback'            => wphx_311_01_callback_label( $handler['callback'] ?? null ),
\t\t\t'permission_callback' => wphx_311_01_callback_label( $handler['permission_callback'] ?? null ),
\t\t\t'argKeys'             => array_keys( $handler['args'] ?? array() ),
\t\t);
\t}
\treturn array(
\t\t'routeKeys'       => array_keys( $routes ),
\t\t'settingsRoute'  => array(
\t\t\t'handlerCount' => count( $handlers ),
\t\t\t'handlers'     => $handlers,
\t\t\t'schema'       => wphx_311_01_callback_label( $route['schema'] ?? null ),
\t\t),
\t\t'namespaceIndex' => isset( $routes['/wp/v2'] ),
\t);
}

function wphx_311_01_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_311_01_value( $value ),
\t\t'meta'   => wphx_311_01_value( $meta ),
\t);
}

function wphx_311_01_reset_state() {
\tglobal $wpdb, $wp_filter, $wp_actions, $wp_filters, $wp_current_filter, $wp_registered_settings, $new_allowed_options, $wp_rest_server;
\t$wpdb->reset();
\twp_cache_flush();
\t$wp_filter              = array();
\t$wp_actions             = array();
\t$wp_filters             = array();
\t$wp_current_filter      = array();
\t$wp_registered_settings = array();
\t$new_allowed_options    = array();
\t$GLOBALS['new_whitelist_options']          = &$new_allowed_options;
\t$GLOBALS['wp_rest_additional_fields']      = array();
\t$GLOBALS['wphx_311_01_events']             = array();
\t$GLOBALS['wphx_311_01_capability_checks']  = array();
\t$GLOBALS['wphx_311_01_can_manage_options'] = true;
\t$wp_rest_server = new WP_REST_Server();
\tdo_action( 'rest_api_init', $wp_rest_server );
}

function wphx_311_01_register_settings() {
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_text',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'label'        => 'REST text',
\t\t\t'description'  => 'REST-visible text setting',
\t\t\t'show_in_rest' => true,
\t\t\t'default'      => 'fallback-text',
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_named',
\t\tarray(
\t\t\t'type'         => 'integer',
\t\t\t'label'        => 'Named count',
\t\t\t'description'  => 'REST-visible renamed integer',
\t\t\t'default'      => 7,
\t\t\t'show_in_rest' => array(
\t\t\t\t'name'   => 'renamed_count',
\t\t\t\t'schema' => array(
\t\t\t\t\t'minimum' => 0,
\t\t\t\t\t'context' => array( 'view', 'edit' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_object',
\t\tarray(
\t\t\t'type'         => 'object',
\t\t\t'default'      => array( 'enabled' => false, 'label' => 'fallback' ),
\t\t\t'show_in_rest' => array(
\t\t\t\t'schema' => array(
\t\t\t\t\t'properties' => array(
\t\t\t\t\t\t'enabled' => array( 'type' => 'boolean' ),
\t\t\t\t\t\t'label'   => array( 'type' => 'string' ),
\t\t\t\t\t),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_array',
\t\tarray(
\t\t\t'type'         => 'array',
\t\t\t'default'      => array( 'fallback' ),
\t\t\t'show_in_rest' => array(
\t\t\t\t'schema' => array(
\t\t\t\t\t'items' => array( 'type' => 'string' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_hidden',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'show_in_rest' => false,
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_invalid_type',
\t\tarray(
\t\t\t'type'         => 'date',
\t\t\t'show_in_rest' => true,
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_missing_type',
\t\tarray(
\t\t\t'show_in_rest' => true,
\t\t)
\t);
}

function wphx_311_01_seed_options( $invalid_object = false ) {
\tglobal $wpdb;
\t$wpdb->set_option( 'wphx_rest_text', ' stored text ', 'off' );
\t$wpdb->set_option( 'wphx_rest_named', '12', 'off' );
\t$wpdb->set_option(
\t\t'wphx_rest_object',
\t\t$invalid_object ? array( 'enabled' => true, 'label' => 'stored', 'extra' => 'invalid' ) : array( 'enabled' => '1', 'label' => 5 ),
\t\t'off'
\t);
\t$wpdb->set_option( 'wphx_rest_array', array( 'alpha', 'beta' ), 'off' );
}

function wphx_311_01_request( $method, $params = array() ) {
\t$request = new WP_REST_Request( $method, '/wp/v2/settings' );
\tforeach ( $params as $key => $value ) {
\t\t$request->set_param( $key, $value );
\t}
\treturn $request;
}

function wphx_311_01_run_cases() {
\tglobal $wpdb;
\t$cases = array();

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\t$controller = new WP_REST_Settings_Controller();
\t$controller->register_routes();
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:route-registration',
\t\t'WP_REST_Settings_Controller::register_routes',
\t\twphx_311_01_route_summary( rest_get_server()->get_routes( 'wp/v2' ) ),
\t\tarray( 'didRestApiInit' => did_action( 'rest_api_init' ) )
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\t$controller = new WP_REST_Settings_Controller();
\t$request = wphx_311_01_request( 'GET' );
\t$GLOBALS['wphx_311_01_can_manage_options'] = true;
\t$allowed = $controller->get_item_permissions_check( $request );
\t$GLOBALS['wphx_311_01_can_manage_options'] = false;
\t$denied = $controller->get_item_permissions_check( $request );
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:permission-callback',
\t\t'WP_REST_Settings_Controller::get_item_permissions_check',
\t\tarray(
\t\t\t'allowed' => $allowed,
\t\t\t'denied'  => $denied,
\t\t\t'checks'  => $GLOBALS['wphx_311_01_capability_checks'],
\t\t)
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\t$controller = new WP_REST_Settings_Controller();
\t$schema = $controller->get_item_schema();
\t$public_schema = $controller->get_public_item_schema();
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:schema-emission',
\t\t'WP_REST_Settings_Controller::get_item_schema',
\t\tarray(
\t\t\t'privateSchema' => wphx_311_01_schema_summary( $schema ),
\t\t\t'publicSchema'  => wphx_311_01_schema_summary( $public_schema ),
\t\t\t'endpointArgs'  => array_keys( $controller->get_endpoint_args_for_item_schema( WP_REST_Server::EDITABLE ) ),
\t\t)
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\twphx_311_01_seed_options();
\tadd_filter(
\t\t'rest_pre_get_setting',
\t\tfunction ( $result, $name, $args ) {
\t\t\t$GLOBALS['wphx_311_01_events'][] = array(
\t\t\t\t'hook'        => 'rest_pre_get_setting',
\t\t\t\t'name'        => $name,
\t\t\t\t'option_name' => $args['option_name'] ?? null,
\t\t\t);
\t\t\tif ( 'renamed_count' === $name ) {
\t\t\t\treturn 42;
\t\t\t}
\t\t\treturn $result;
\t\t},
\t\t10,
\t\t3
\t);
\t$controller = new WP_REST_Settings_Controller();
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:get-item',
\t\t'WP_REST_Settings_Controller::get_item',
\t\t$controller->get_item( wphx_311_01_request( 'GET' ) ),
\t\tarray(
\t\t\t'events'   => $GLOBALS['wphx_311_01_events'],
\t\t\t'queries'  => $wpdb->queries,
\t\t\t'options'  => $wpdb->snapshot(),
\t\t)
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\twphx_311_01_seed_options();
\tadd_filter(
\t\t'rest_pre_update_setting',
\t\tfunction ( $updated, $name, $value, $args ) {
\t\t\t$GLOBALS['wphx_311_01_events'][] = array(
\t\t\t\t'hook'        => 'rest_pre_update_setting',
\t\t\t\t'name'        => $name,
\t\t\t\t'value'       => $value,
\t\t\t\t'option_name' => $args['option_name'] ?? null,
\t\t\t);
\t\t\tif ( 'renamed_count' === $name ) {
\t\t\t\treturn true;
\t\t\t}
\t\t\treturn $updated;
\t\t},
\t\t10,
\t\t4
\t);
\t$controller = new WP_REST_Settings_Controller();
\t$update_result = $controller->update_item(
\t\twphx_311_01_request(
\t\t\t'POST',
\t\t\tarray(
\t\t\t\t'wphx_rest_text' => 'updated text',
\t\t\t\t'renamed_count'  => 15,
\t\t\t\t'wphx_rest_array' => null,
\t\t\t)
\t\t)
\t);
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:update-item',
\t\t'WP_REST_Settings_Controller::update_item',
\t\t$update_result,
\t\tarray(
\t\t\t'events'  => $GLOBALS['wphx_311_01_events'],
\t\t\t'queries' => $wpdb->queries,
\t\t\t'options' => $wpdb->snapshot(),
\t\t)
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\twphx_311_01_seed_options( true );
\t$controller = new WP_REST_Settings_Controller();
\t$invalid_null = $controller->update_item(
\t\twphx_311_01_request(
\t\t\t'POST',
\t\t\tarray(
\t\t\t\t'wphx_rest_object' => null,
\t\t\t)
\t\t)
\t);
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:null-invalid-stored-value',
\t\t'WP_REST_Settings_Controller::update_item',
\t\t$invalid_null,
\t\tarray(
\t\t\t'queries' => $wpdb->queries,
\t\t\t'options' => $wpdb->snapshot(),
\t\t)
\t);

\twphx_311_01_reset_state();
\twphx_311_01_register_settings();
\t$controller = new WP_REST_Settings_Controller();
\t$request = wphx_311_01_request( 'POST' );
\t$request->set_attributes(
\t\tarray(
\t\t\t'args' => $controller->get_endpoint_args_for_item_schema( WP_REST_Server::EDITABLE ),
\t\t)
\t);
\t$cases[] = wphx_311_01_case(
\t\t'rest-settings:sanitize-callback',
\t\t'WP_REST_Settings_Controller::sanitize_callback',
\t\tarray(
\t\t\t'null'    => $controller->sanitize_callback( null, $request, 'wphx_rest_text' ),
\t\t\t'text'    => $controller->sanitize_callback( 123, $request, 'wphx_rest_text' ),
\t\t\t'integer' => $controller->sanitize_callback( '19', $request, 'renamed_count' ),
\t\t)
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredClassExists'    => array(
\t\t'WP_REST_Settings_Controller' => class_exists( 'WP_REST_Settings_Controller' ),
\t\t'WP_REST_Controller'          => class_exists( 'WP_REST_Controller' ),
\t\t'WP_REST_Request'             => class_exists( 'WP_REST_Request' ),
\t\t'WP_REST_Server'              => class_exists( 'WP_REST_Server' ),
\t),
\t'coveredFunctionExists' => array(
\t\t'register_rest_route'                         => function_exists( 'register_rest_route' ),
\t\t'rest_validate_value_from_schema'             => function_exists( 'rest_validate_value_from_schema' ),
\t\t'rest_sanitize_value_from_schema'             => function_exists( 'rest_sanitize_value_from_schema' ),
\t\t'rest_default_additional_properties_to_false' => function_exists( 'rest_default_additional_properties_to_false' ),
\t\t'rest_get_endpoint_args_for_schema'           => function_exists( 'rest_get_endpoint_args_for_schema' ),
\t),
\t'cases'                 => wphx_311_01_run_cases(),
\t'phpErrors'             => $GLOBALS['wphx_311_01_php_errors'],
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    coveredClassExists: result.coveredClassExists,
    coveredFunctionExists: result.coveredFunctionExists,
    cases: result.cases,
    phpErrors: result.phpErrors
  };
}

function runProbe(commandPath, runtimeId, mode, root) {
  const output = command(commandPath, [PROBE, mode, root]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `${commandPath} ${PROBE} ${mode} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(runtimeId, image, mode, root) {
  const dockerRoot = `/work/${root}`;
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, dockerRoot]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${dockerRoot}`,
    image,
    result: JSON.parse(output)
  };
}

function compare(oracleResult, candidateResult) {
  const oracle = normalize(oracleResult);
  const candidate = normalize(candidateResult);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-settings-controller`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-settings-controller-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "REST settings controller differential fixture harness",
      area: "wp-includes/rest-api.php wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php",
      public_contract:
        "The /wp/v2/settings REST controller must preserve WordPress route registration, permission callback, show_in_rest schema, request ArrayAccess, option update/delete, and WP_Error behavior while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-rest-settings-controller-fixture.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-settings-controller",
        "npm run wp:core:wphx-311-rest-settings-controller:check",
        "npm run wp:core:wphx-304-settings-defaults:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-01-rest-settings-controller-fixture",
        "receipt:wphx-304-06-settings-defaults-fixture",
        "receipt:wphx-305-domain-closure"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This fixture proves REST settings-controller behavior with a deterministic wpdb/cache test double. It is not yet a typed Haxe REST implementation or full REST server dispatch proof."
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const runs = [];
const comparisons = [];
const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_ROOT);
const localCandidate = runProbe("php", "local-php-cli", "candidate", CANDIDATE_ROOT);
runs.push(localOracle, localCandidate);
comparisons.push({
  id: "local-php-cli",
  ...compare(localOracle.result, localCandidate.result)
});

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const dockerImages = [
  ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
  ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
];
const skippedRuntimes = [];

if (dockerVersion) {
  for (const [runtimeId, image] of dockerImages) {
    const oracle = runDockerProbe(runtimeId, image, "oracle", ORACLE_ROOT);
    const candidate = runDockerProbe(runtimeId, image, "candidate", CANDIDATE_ROOT);
    runs.push(oracle, candidate);
    comparisons.push({
      id: runtimeId,
      ...compare(oracle.result, candidate.result)
    });
  }
} else {
  for (const [runtimeId, image] of dockerImages) {
    skippedRuntimes.push({
      id: runtimeId,
      image,
      reason: "docker server unavailable"
    });
  }
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const manifest = {
  schema: "wphx.wp-core-rest-settings-controller-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-rest-settings-controller-fixture.mjs",
  inputs: {
    settings_fixture_manifest: inputRecord(SETTINGS_FIXTURE),
    wpdb_domain_closure_receipt: inputRecord(WPDB_CLOSURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "helper",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "current-user-capability-resolution",
        reason:
          "The fixture uses a deterministic current_user_can() boundary to prove the settings controller delegates to manage_options. Full user, role, and capability resolution remains broader auth/user-domain work."
      },
      {
        id: "deterministic-wpdb-option-store",
        reason:
          "The controller runs through real get_option(), update_option(), and delete_option(), but a deterministic wpdb/cache test double supplies option rows instead of a live database. Live database parity remains covered by WPHX-305 gates."
      },
      {
        id: "rest-server-dispatch-not-yet-covered",
        reason:
          "This slice covers route registration and direct controller method behavior. Full WP_REST_Server dispatch, authentication, response conversion, headers, and HTTP serving remain later WPHX-311 work."
      },
      {
        id: "schema-validation-native-boundary",
        reason:
          "REST schema validation/sanitization functions remain upstream PHP-native in this fixture. Future Haxe ownership must preserve WP_Error codes, null handling, object additionalProperties behavior, and request arg sanitization."
      },
      {
        id: "l10n-error-text",
        reason:
          "WP_Error messages and schema diagnostics call __()/translate(); the fixture compares observable text through the locked WordPress source but does not move l10n into Haxe."
      }
    ],
    follow_up_owner: "WPHX-311"
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version: localOracle.result.phpVersion,
      executable: lock.tools.php_cli.executable
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs,
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-311",
      detail:
        "The candidate side is a copied WordPress oracle source tree. This receipt identifies the REST settings-controller behavior a future typed Haxe candidate must preserve."
    },
    {
      id: "full-rest-dispatch-deferred",
      owner: "WPHX-311",
      detail:
        "WP_REST_Server dispatch, request validation inside dispatch(), authentication filters, response conversion, headers, and HTTP serving are not part of this direct-controller fixture."
    },
    {
      id: "full-auth-user-capability-deferred",
      owner: "WPHX-312/WPHX-322",
      detail:
        "current_user_can() is represented by a deterministic boundary here. Full user/role/capability parity remains outside this controller slice."
    },
    {
      id: "live-database-not-required-for-this-slice",
      owner: "WPHX-305/WPHX-311",
      detail:
        "The fixture intentionally uses a deterministic option-store test double. WPHX-305 supplies live database parity gates for the underlying wpdb/option storage paths."
    },
    {
      id: "rest-api-upstream-phpunit-not-yet-ratcheted",
      owner: "WPHX-322",
      detail:
        "This fixture covers selected WP_REST_Settings_Controller traces. Full upstream REST PHPUnit ratcheting remains part of PHP first-party closure."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "oracle_source_mirror",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "helper",
    covered_symbols: COVERED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-01-rest-settings-controller-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST settings controller differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-rest-settings-controller-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-settings-controller",
    "npm run wp:core:wphx-311-rest-settings-controller:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-304-06-settings-defaults-fixture",
    "receipt:wphx-305-domain-closure"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      manifest: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      cases: FIXTURE_CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
