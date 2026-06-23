#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.10.2",
  external_ref: "WPHX-311.02",
  title: "Add REST settings server-dispatch fixture"
};
const OUT_ROOT = "build/wp-core/wphx-311-02";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-311-02-rest-settings-dispatch-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-02-rest-settings-dispatch-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-02-rest-settings-dispatch-fixture.v1.json";
const CONTROLLER_FIXTURE = "manifests/wp-core/wphx-311-01-rest-settings-controller-fixture.v1.json";
const RECORDED_AT = "2026-06-22T08:10:00.000Z";
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
  "WP_REST_Server::dispatch",
  "WP_REST_Server::match_request_to_handler",
  "WP_REST_Server::respond_to_request",
  "WP_REST_Request::has_valid_params",
  "WP_REST_Request::sanitize_params",
  "WP_REST_Response::get_matched_route",
  "WP_REST_Response::get_matched_handler",
  "rest_convert_error_to_response",
  "rest_authorization_required_code",
  "WP_REST_Settings_Controller::register_routes",
  "WP_REST_Settings_Controller::get_item",
  "WP_REST_Settings_Controller::update_item"
];

const FIXTURE_CASES = [
  {
    id: "rest-settings-dispatch:get-success",
    symbol: "WP_REST_Server::dispatch",
    focus: "GET /wp/v2/settings route matching, permission callback, callback execution, response wrapping, and matched route metadata"
  },
  {
    id: "rest-settings-dispatch:post-sanitize-update",
    symbol: "WP_REST_Request::sanitize_params",
    focus: "POST dispatch validates route args, sanitizes request params, updates options, and returns the refreshed settings response"
  },
  {
    id: "rest-settings-dispatch:invalid-param",
    symbol: "WP_REST_Request::has_valid_params",
    focus: "invalid editable request parameter becomes a rest_invalid_param response before controller update logic runs"
  },
  {
    id: "rest-settings-dispatch:permission-denied-logged-out",
    symbol: "WP_REST_Server::respond_to_request",
    focus: "false permission callback becomes rest_forbidden with the logged-out authorization status code"
  },
  {
    id: "rest-settings-dispatch:permission-denied-logged-in",
    symbol: "rest_authorization_required_code",
    focus: "false permission callback becomes rest_forbidden with the logged-in authorization status code"
  },
  {
    id: "rest-settings-dispatch:no-route",
    symbol: "WP_REST_Server::match_request_to_handler",
    focus: "unknown REST route is converted to a 404 rest_no_route response"
  },
  {
    id: "rest-settings-dispatch:pre-dispatch-short-circuit",
    symbol: "rest_pre_dispatch",
    focus: "rest_pre_dispatch can short-circuit dispatch and is normalized to a WP_REST_Response"
  },
  {
    id: "rest-settings-dispatch:before-callback-error",
    symbol: "rest_request_before_callbacks",
    focus: "rest_request_before_callbacks can return WP_Error and skip endpoint callback execution"
  },
  {
    id: "rest-settings-dispatch:dispatch-request-filter",
    symbol: "rest_dispatch_request",
    focus: "rest_dispatch_request can replace the endpoint callback result while preserving response wrapping and matched metadata"
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

function phpVersionFamily(value) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
}

function stableRuntimeValue(value) {
  if (Array.isArray(value)) return value.map(stableRuntimeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, key === "phpVersion" ? phpVersionFamily(entry) : stableRuntimeValue(entry)])
    );
  }
  return value;
}

function stableRun(run) {
  return {
    ...run,
    result: stableRuntimeValue(run.result)
  };
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
$GLOBALS['wphx_311_02_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_02_php_errors'][] = array(
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

class WPHX_311_02_Fake_WPDB {
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
$wpdb = new WPHX_311_02_Fake_WPDB();

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_02_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args'       => $args,
\t);
\treturn (bool) $GLOBALS['wphx_311_02_can_manage_options'];
}

function is_user_logged_in() {
\treturn (bool) $GLOBALS['wphx_311_02_logged_in'];
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

function wphx_311_02_scalar( $value ) {
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

function wphx_311_02_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_311_02_scalar( $key ),
\t\t\t\t'value' => wphx_311_02_value( $entry_value ),
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
\t\t\t'data'    => wphx_311_02_value( $value->get_error_data() ),
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_311_02_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_311_02_scalar( $value );
}

function wphx_311_02_callback_label( $callback ) {
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

function wphx_311_02_response_summary( $response, $request ) {
\t$handler = $response instanceof WP_REST_Response ? $response->get_matched_handler() : null;
\treturn array(
\t\t'class'          => is_object( $response ) ? get_class( $response ) : gettype( $response ),
\t\t'status'         => $response instanceof WP_HTTP_Response ? $response->get_status() : null,
\t\t'data'           => $response instanceof WP_HTTP_Response ? $response->get_data() : $response,
\t\t'isError'        => $response instanceof WP_REST_Response ? $response->is_error() : null,
\t\t'matchedRoute'   => $response instanceof WP_REST_Response ? $response->get_matched_route() : null,
\t\t'matchedHandler' => is_array( $handler )
\t\t\t? array(
\t\t\t\t'callback'            => wphx_311_02_callback_label( $handler['callback'] ?? null ),
\t\t\t\t'permission_callback' => wphx_311_02_callback_label( $handler['permission_callback'] ?? null ),
\t\t\t\t'methods'             => array_keys( $handler['methods'] ?? array() ),
\t\t\t\t'argKeys'             => array_keys( $handler['args'] ?? array() ),
\t\t\t)
\t\t\t: null,
\t\t'request'        => array(
\t\t\t'method'     => $request->get_method(),
\t\t\t'route'      => $request->get_route(),
\t\t\t'params'     => $request->get_params(),
\t\t\t'attributes' => array(
\t\t\t\t'argKeys' => array_keys( $request->get_attributes()['args'] ?? array() ),
\t\t\t),
\t\t),
\t);
}

function wphx_311_02_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_311_02_value( $value ),
\t\t'meta'   => wphx_311_02_value( $meta ),
\t);
}

function wphx_311_02_reset_state() {
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
\t$GLOBALS['wphx_311_02_events']             = array();
\t$GLOBALS['wphx_311_02_capability_checks']  = array();
\t$GLOBALS['wphx_311_02_can_manage_options'] = true;
\t$GLOBALS['wphx_311_02_logged_in']          = true;
\t$wp_rest_server = new WP_REST_Server();
\tdo_action( 'rest_api_init', $wp_rest_server );
}

function wphx_311_02_register_settings() {
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
}

function wphx_311_02_seed_options() {
\tglobal $wpdb;
\t$wpdb->set_option( 'wphx_rest_text', ' stored text ', 'off' );
\t$wpdb->set_option( 'wphx_rest_named', '12', 'off' );
\t$wpdb->set_option( 'wphx_rest_object', array( 'enabled' => '1', 'label' => 5 ), 'off' );
\t$wpdb->set_option( 'wphx_rest_array', array( 'alpha', 'beta' ), 'off' );
}

function wphx_311_02_server() {
\t$controller = new WP_REST_Settings_Controller();
\t$controller->register_routes();
\treturn rest_get_server();
}

function wphx_311_02_request( $method, $route = '/wp/v2/settings', $params = array() ) {
\t$request = new WP_REST_Request( $method, $route );
\tif ( in_array( strtoupper( $method ), array( 'POST', 'PUT', 'PATCH', 'DELETE' ), true ) ) {
\t\t$request->set_body_params( $params );
\t} else {
\t\t$request->set_query_params( $params );
\t}
\treturn $request;
}

function wphx_311_02_dispatch_summary( $server, $request ) {
\t$response = $server->dispatch( $request );
\treturn wphx_311_02_response_summary( $response, $request );
}

function wphx_311_02_run_cases() {
\tglobal $wpdb;
\t$cases = array();

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\twphx_311_02_seed_options();
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:get-success',
\t\t'WP_REST_Server::dispatch',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray(
\t\t\t'capabilityChecks' => $GLOBALS['wphx_311_02_capability_checks'],
\t\t\t'queries'          => $wpdb->queries,
\t\t)
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\twphx_311_02_seed_options();
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request(
\t\t'POST',
\t\t'/wp/v2/settings',
\t\tarray(
\t\t\t'wphx_rest_text' => 123,
\t\t\t'renamed_count'  => '19',
\t\t\t'wphx_rest_array' => array( 'gamma', 'delta' ),
\t\t)
\t);
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:post-sanitize-update',
\t\t'WP_REST_Request::sanitize_params',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray(
\t\t\t'queries' => $wpdb->queries,
\t\t\t'options' => $wpdb->snapshot(),
\t\t)
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\twphx_311_02_seed_options();
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request( 'POST', '/wp/v2/settings', array( 'renamed_count' => 'not-an-int' ) );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:invalid-param',
\t\t'WP_REST_Request::has_valid_params',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray(
\t\t\t'queries' => $wpdb->queries,
\t\t\t'options' => $wpdb->snapshot(),
\t\t)
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\twphx_311_02_seed_options();
\t$GLOBALS['wphx_311_02_can_manage_options'] = false;
\t$GLOBALS['wphx_311_02_logged_in'] = false;
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:permission-denied-logged-out',
\t\t'WP_REST_Server::respond_to_request',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray( 'capabilityChecks' => $GLOBALS['wphx_311_02_capability_checks'] )
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\twphx_311_02_seed_options();
\t$GLOBALS['wphx_311_02_can_manage_options'] = false;
\t$GLOBALS['wphx_311_02_logged_in'] = true;
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:permission-denied-logged-in',
\t\t'rest_authorization_required_code',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray( 'capabilityChecks' => $GLOBALS['wphx_311_02_capability_checks'] )
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\t$server = wphx_311_02_server();
\t$request = wphx_311_02_request( 'GET', '/wp/v2/missing' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:no-route',
\t\t'WP_REST_Server::match_request_to_handler',
\t\twphx_311_02_dispatch_summary( $server, $request )
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\t$server = wphx_311_02_server();
\tadd_filter(
\t\t'rest_pre_dispatch',
\t\tfunction ( $result, $server, $request ) {
\t\t\t$GLOBALS['wphx_311_02_events'][] = array(
\t\t\t\t'hook'  => 'rest_pre_dispatch',
\t\t\t\t'route' => $request->get_route(),
\t\t\t);
\t\t\treturn array( 'short_circuit' => true, 'route' => $request->get_route() );
\t\t},
\t\t10,
\t\t3
\t);
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:pre-dispatch-short-circuit',
\t\t'rest_pre_dispatch',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray( 'events' => $GLOBALS['wphx_311_02_events'] )
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\t$server = wphx_311_02_server();
\tadd_filter(
\t\t'rest_request_before_callbacks',
\t\tfunction ( $response, $handler, $request ) {
\t\t\t$GLOBALS['wphx_311_02_events'][] = array(
\t\t\t\t'hook'     => 'rest_request_before_callbacks',
\t\t\t\t'callback' => wphx_311_02_callback_label( $handler['callback'] ?? null ),
\t\t\t);
\t\t\treturn new WP_Error( 'wphx_before_blocked', 'Blocked before callback.', array( 'status' => 418 ) );
\t\t},
\t\t10,
\t\t3
\t);
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:before-callback-error',
\t\t'rest_request_before_callbacks',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray( 'events' => $GLOBALS['wphx_311_02_events'] )
\t);

\twphx_311_02_reset_state();
\twphx_311_02_register_settings();
\t$server = wphx_311_02_server();
\tadd_filter(
\t\t'rest_dispatch_request',
\t\tfunction ( $dispatch_result, $request, $route, $handler ) {
\t\t\t$GLOBALS['wphx_311_02_events'][] = array(
\t\t\t\t'hook'  => 'rest_dispatch_request',
\t\t\t\t'route' => $route,
\t\t\t);
\t\t\treturn array( 'replaced' => true, 'method' => $request->get_method() );
\t\t},
\t\t10,
\t\t4
\t);
\t$request = wphx_311_02_request( 'GET' );
\t$cases[] = wphx_311_02_case(
\t\t'rest-settings-dispatch:dispatch-request-filter',
\t\t'rest_dispatch_request',
\t\twphx_311_02_dispatch_summary( $server, $request ),
\t\tarray( 'events' => $GLOBALS['wphx_311_02_events'] )
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredClassExists'    => array(
\t\t'WP_REST_Settings_Controller' => class_exists( 'WP_REST_Settings_Controller' ),
\t\t'WP_REST_Request'             => class_exists( 'WP_REST_Request' ),
\t\t'WP_REST_Response'            => class_exists( 'WP_REST_Response' ),
\t\t'WP_REST_Server'              => class_exists( 'WP_REST_Server' ),
\t),
\t'coveredFunctionExists' => array(
\t\t'rest_convert_error_to_response' => function_exists( 'rest_convert_error_to_response' ),
\t\t'rest_authorization_required_code' => function_exists( 'rest_authorization_required_code' ),
\t\t'rest_validate_request_arg' => function_exists( 'rest_validate_request_arg' ),
\t\t'rest_sanitize_request_arg' => function_exists( 'rest_sanitize_request_arg' ),
\t),
\t'cases'                 => wphx_311_02_run_cases(),
\t'phpErrors'             => $GLOBALS['wphx_311_02_php_errors'],
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-settings-dispatch`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-settings-dispatch-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "REST settings server-dispatch differential fixture harness",
      area: "wp-includes/rest-api.php wp-includes/rest-api/class-wp-rest-server.php wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php",
      public_contract:
        "The /wp/v2/settings endpoint must preserve WordPress REST server dispatch behavior: route matching, request validation/sanitization, permission failures, filter short-circuits, response wrapping, error conversion, and matched route/handler metadata."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-rest-settings-dispatch-fixture.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-settings-dispatch",
        "npm run wp:core:wphx-311-rest-settings-dispatch:check",
        "npm run wp:core:wphx-311-rest-settings-controller:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-02-rest-settings-dispatch-fixture",
        "receipt:wphx-311-01-rest-settings-controller-fixture"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This fixture proves REST server dispatch over the settings route with deterministic auth and wpdb/cache boundaries. It is not yet a typed Haxe REST implementation or an HTTP serving fixture."
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
  schema: "wphx.wp-core-rest-settings-dispatch-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-rest-settings-dispatch-fixture.mjs",
  inputs: {
    controller_fixture_manifest: inputRecord(CONTROLLER_FIXTURE),
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
        id: "current-user-and-login-boundary",
        reason:
          "The fixture uses deterministic current_user_can() and is_user_logged_in() boundaries to isolate REST dispatch permission behavior. Full users/roles/capabilities remain later domain work."
      },
      {
        id: "deterministic-wpdb-option-store",
        reason:
          "The endpoint runs through real option functions, but a deterministic wpdb/cache test double supplies rows instead of a live database. Live database storage parity is covered by WPHX-305."
      },
      {
        id: "http-serving-not-covered",
        reason:
          "This fixture uses internal dispatch. HTTP serving, headers, CORS, JSON encode/decode output, and web-server integration remain separate REST/E2E work."
      },
      {
        id: "plugin-filter-boundaries",
        reason:
          "rest_pre_dispatch, rest_request_before_callbacks, and rest_dispatch_request are intentionally PHP-native plugin extension boundaries."
      }
    ],
    follow_up_owner: "WPHX-311"
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version_family: phpVersionFamily(localOracle.result.phpVersion),
      executable: "php"
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs: runs.map(stableRun),
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-311.03",
      detail:
        "The candidate side is a copied WordPress oracle source tree. WPHX-311.03 owns the first typed Haxe REST settings-controller strategy candidate."
    },
    {
      id: "http-serving-deferred",
      owner: "WPHX-311",
      detail:
        "WP_REST_Server::serve_request(), headers, CORS, body parsing, and JSON response emission are outside this internal-dispatch fixture."
    },
    {
      id: "full-auth-user-capability-deferred",
      owner: "WPHX-312/WPHX-322",
      detail:
        "Capability and logged-in state are deterministic boundaries here. Full user/role/capability parity remains outside this endpoint dispatch slice."
    },
    {
      id: "upstream-phpunit-ratchet-deferred",
      owner: "WPHX-322",
      detail:
        "This fixture covers selected REST settings dispatch traces. Full upstream REST PHPUnit ratcheting remains part of PHP first-party closure."
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
  id: "receipt:wphx-311-02-rest-settings-dispatch-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST settings server-dispatch differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the dispatch fixture harness"
    },
    {
      path: "tools/wp-core/run-rest-settings-dispatch-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-settings-dispatch",
    "npm run wp:core:wphx-311-rest-settings-dispatch:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: ["receipt:wphx-311-01-rest-settings-controller-fixture"],
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
