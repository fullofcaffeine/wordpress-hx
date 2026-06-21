#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.4",
  external_ref: "WPHX-305.04",
  title: "Build write/process-field fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-305-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-305-04-wpdb-write-fields-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-04-wpdb-write-fields-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-04-wpdb-write-fields-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-305-01-wpdb-surface.v1.json";
const PREPARE_FIXTURE = "manifests/wp-core/wphx-305-02-wpdb-prepare-escaping-fixture.v1.json";
const QUERY_FIXTURE = "manifests/wp-core/wphx-305-03-wpdb-query-results-fixture.v1.json";
const RECORDED_AT = "2026-06-21T01:45:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wpdb.php"
];

const COVERED_SYMBOLS = [
  "wpdb::insert",
  "wpdb::replace",
  "wpdb::_insert_replace_helper",
  "wpdb::update",
  "wpdb::delete",
  "wpdb::process_fields",
  "wpdb::process_field_formats",
  "wpdb::process_field_charsets",
  "wpdb::process_field_lengths",
  "wpdb::strip_invalid_text",
  "wpdb::get_col_charset",
  "wpdb::get_col_length"
];

const FIXTURE_CASES = [
  { id: "insert:formats-null-state", symbol: "wpdb::insert", focus: "INSERT SQL shape, explicit formats, NULL value omission from prepare values, affected rows, and insert_id mutation" },
  { id: "replace:field-types-default-formats", symbol: "wpdb::replace", focus: "field_types-driven format selection for REPLACE plus replace insert_id/rows_affected state" },
  { id: "update:null-where", symbol: "wpdb::update", focus: "SET NULL and WHERE IS NULL SQL shape with mixed data/where formats" },
  { id: "delete:where-null-format", symbol: "wpdb::delete", focus: "DELETE WHERE value formatting and null comparison handling" },
  { id: "insert-helper:invalid-type", symbol: "wpdb::_insert_replace_helper", focus: "invalid helper type rejection and insert_id reset boundary" },
  { id: "crud:invalid-array-guards", symbol: "wpdb::update/wpdb::delete", focus: "public write method array guards before field processing" },
  { id: "process-fields:field-types-charsets-lengths", symbol: "wpdb::process_fields", focus: "format pairing, numeric charset/length skips, string charset metadata, and null passthrough" },
  { id: "process-fields:length-rejection", symbol: "wpdb::process_fields", focus: "strip_invalid_text truncation detection, plural last_error text, and failed field processing" },
  { id: "process-fields:charset-error", symbol: "wpdb::process_field_charsets", focus: "WP_Error charset metadata short-circuit" },
  { id: "process-fields:length-error", symbol: "wpdb::process_field_lengths", focus: "WP_Error length metadata short-circuit" },
  { id: "process-field-formats:cycling-and-field-types", symbol: "wpdb::process_field_formats", focus: "explicit format cycling and field_types fallback mapping" },
  { id: "strip-invalid-text:standalone", symbol: "wpdb::strip_invalid_text", focus: "direct truncation/pass-through output without process_fields rejection" }
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

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );

register_shutdown_function(
\tfunction () {
\t\t$error = error_get_last();
\t\tif ( $error && in_array( $error['type'], array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR ), true ) ) {
\t\t\tfwrite( STDERR, json_encode( array( 'fatal' => $error ), JSON_UNESCAPED_SLASHES ) . PHP_EOL );
\t\t}
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_SETUP_CONFIG', true );
define( 'AUTH_SALT', 'wphx-305-04-auth-salt' );

$GLOBALS['wphx_305_04_events'] = array();

function wphx_305_04_event( $type, $payload = array() ) {
\t$GLOBALS['wphx_305_04_events'][] = array(
\t\t'type'    => $type,
\t\t'payload' => $payload,
\t);
}

if ( ! function_exists( 'wp_load_translations_early' ) ) {
\tfunction wp_load_translations_early() {
\t\twphx_305_04_event( 'wp_load_translations_early' );
\t}
}

if ( ! function_exists( '__' ) ) {
\tfunction __( $text, $domain = 'default' ) {
\t\treturn $text;
\t}
}

if ( ! function_exists( '_doing_it_wrong' ) ) {
\tfunction _doing_it_wrong( $function_name, $message, $version ) {
\t\twphx_305_04_event(
\t\t\t'doing_it_wrong',
\t\t\tarray(
\t\t\t\t'function' => $function_name,
\t\t\t\t'message'  => $message,
\t\t\t\t'version'  => $version,
\t\t\t)
\t\t);
\t}
}

if ( ! function_exists( 'mbstring_binary_safe_encoding' ) ) {
\tfunction mbstring_binary_safe_encoding( $reset = false ) {
\t\twphx_305_04_event( 'mbstring_binary_safe_encoding', array( 'reset' => (bool) $reset ) );
\t}
}

if ( ! function_exists( 'reset_mbstring_encoding' ) ) {
\tfunction reset_mbstring_encoding() {
\t\twphx_305_04_event( 'reset_mbstring_encoding' );
\t}
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';

if ( ! function_exists( 'is_wp_error' ) ) {
\tfunction is_wp_error( $thing ) {
\t\treturn $thing instanceof WP_Error;
\t}
}

require_once ABSPATH . WPINC . '/class-wpdb.php';

class WPHX_305_04_WPDB extends wpdb {
\tpublic $query_events = array();
\tpublic $charset_events = array();
\tpublic $length_events = array();

\tpublic function reset_fixture_state() {
\t\t$this->ready               = true;
\t\t$this->query_events        = array();
\t\t$this->charset_events      = array();
\t\t$this->length_events       = array();
\t\t$this->queries             = array();
\t\t$this->insert_id           = 0;
\t\t$this->last_error          = '';
\t\t$this->num_queries         = 0;
\t\t$this->rows_affected       = 0;
\t\t$this->num_rows            = 0;
\t\t$this->last_query          = null;
\t\t$this->last_result         = array();
\t\t$this->col_info            = null;
\t\t$this->func_call           = null;
\t\t$this->check_current_query = true;
\t\t$this->is_mysql            = true;
\t\t$this->charset             = 'utf8mb4';
\t\t$this->field_types         = array(
\t\t\t'id'    => '%d',
\t\t\t'count' => '%d',
\t\t\t'ratio' => '%f',
\t\t\t'score' => '%f',
\t\t);
\t}

\tpublic function public_state( $include_queries = false ) {
\t\t$state = array(
\t\t\t'last_query'          => $this->last_query,
\t\t\t'num_queries'         => $this->num_queries,
\t\t\t'num_rows'            => $this->num_rows,
\t\t\t'rows_affected'       => $this->rows_affected,
\t\t\t'insert_id'           => $this->insert_id,
\t\t\t'last_error'          => $this->last_error,
\t\t\t'func_call'           => $this->func_call,
\t\t\t'check_current_query' => $this->check_current_query,
\t\t);
\t\tif ( $include_queries ) {
\t\t\t$state['queries'] = $this->queries;
\t\t}
\t\treturn $state;
\t}

\tpublic function public_insert_replace_helper( $table, $data, $format = null, $type = 'INSERT' ) {
\t\treturn $this->_insert_replace_helper( $table, $data, $format, $type );
\t}

\tpublic function public_process_fields( $table, $data, $format ) {
\t\treturn $this->process_fields( $table, $data, $format );
\t}

\tpublic function public_process_field_formats( $data, $format ) {
\t\treturn $this->process_field_formats( $data, $format );
\t}

\tpublic function public_process_field_charsets( $data, $table ) {
\t\treturn $this->process_field_charsets( $data, $table );
\t}

\tpublic function public_process_field_lengths( $data, $table ) {
\t\treturn $this->process_field_lengths( $data, $table );
\t}

\tpublic function public_strip_invalid_text( $data ) {
\t\treturn $this->strip_invalid_text( $data );
\t}

\tpublic function _real_escape( $data ) {
\t\tif ( ! is_scalar( $data ) ) {
\t\t\treturn '';
\t\t}
\t\treturn $this->add_placeholder_escape( addslashes( $data ) );
\t}

\tprivate function record_query_event( $kind, $query, $result ) {
\t\t$this->query_events[] = array(
\t\t\t'kind'   => $kind,
\t\t\t'query'  => $query,
\t\t\t'result' => $result,
\t\t\t'state'  => $this->public_state(),
\t\t);
\t}

\tprivate function next_insert_id( $kind ) {
\t\treturn 'replace' === $kind ? 7402 : 7401;
\t}

\tpublic function query( $query ) {
\t\tif ( ! $this->ready ) {
\t\t\t$this->check_current_query = true;
\t\t\t$this->record_query_event( 'not-ready', $query, false );
\t\t\treturn false;
\t\t}

\t\t$query = apply_filters( 'query', $query );

\t\tif ( ! $query ) {
\t\t\t$this->insert_id = 0;
\t\t\t$this->record_query_event( 'empty-query', $query, false );
\t\t\treturn false;
\t\t}

\t\t$this->flush();
\t\t$this->func_call           = '$db->query("' . $query . '")';
\t\t$this->last_query          = $query;
\t\t$this->check_current_query = true;
\t\t++$this->num_queries;

\t\tif ( preg_match( '/^\\s*insert\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 1;
\t\t\t$this->insert_id     = $this->next_insert_id( 'insert' );
\t\t\t$this->record_query_event( 'insert', $query, 1 );
\t\t\treturn 1;
\t\t}

\t\tif ( preg_match( '/^\\s*replace\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 2;
\t\t\t$this->insert_id     = $this->next_insert_id( 'replace' );
\t\t\t$this->record_query_event( 'replace', $query, 2 );
\t\t\treturn 2;
\t\t}

\t\tif ( preg_match( '/^\\s*update\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 3;
\t\t\t$this->record_query_event( 'update', $query, 3 );
\t\t\treturn 3;
\t\t}

\t\tif ( preg_match( '/^\\s*delete\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 4;
\t\t\t$this->record_query_event( 'delete', $query, 4 );
\t\t\treturn 4;
\t\t}

\t\t$this->record_query_event( 'other', $query, 0 );
\t\treturn 0;
\t}

\tpublic function get_col_charset( $table, $column ) {
\t\t$table_key  = strtolower( $table );
\t\t$column_key = strtolower( $column );
\t\t$charsets   = array(
\t\t\t'wp_fixture' => array(
\t\t\t\t'bad_charset' => 'error',
\t\t\t\t'byte_text'   => 'latin1',
\t\t\t\t'description' => 'utf8mb4',
\t\t\t\t'name'        => 'utf8mb4',
\t\t\t\t'nullable'    => 'utf8mb4',
\t\t\t\t'raw_blob'    => false,
\t\t\t\t'short_text'  => 'utf8mb4',
\t\t\t),
\t\t);
\t\t$result = $charsets[ $table_key ][ $column_key ] ?? 'utf8mb4';
\t\tif ( 'error' === $result ) {
\t\t\t$result = new WP_Error( 'wphx_fixture_charset_error', 'fixture charset lookup failed' );
\t\t}
\t\t$this->charset_events[] = array(
\t\t\t'table'  => $table,
\t\t\t'column' => $column,
\t\t\t'result' => $result,
\t\t);
\t\treturn $result;
\t}

\tpublic function get_col_length( $table, $column ) {
\t\t$table_key = strtolower( $table );
\t\t$column_key = strtolower( $column );
\t\t$lengths = array(
\t\t\t'wp_fixture' => array(
\t\t\t\t'bad_length'  => 'error',
\t\t\t\t'byte_text'   => array( 'type' => 'byte', 'length' => 3 ),
\t\t\t\t'description' => array( 'type' => 'char', 'length' => 64 ),
\t\t\t\t'name'        => array( 'type' => 'char', 'length' => 32 ),
\t\t\t\t'nullable'    => array( 'type' => 'char', 'length' => 12 ),
\t\t\t\t'raw_blob'    => false,
\t\t\t\t'short_text'  => array( 'type' => 'char', 'length' => 4 ),
\t\t\t),
\t\t);
\t\t$result = $lengths[ $table_key ][ $column_key ] ?? false;
\t\tif ( 'error' === $result ) {
\t\t\t$result = new WP_Error( 'wphx_fixture_length_error', 'fixture length lookup failed' );
\t\t}
\t\t$this->length_events[] = array(
\t\t\t'table'  => $table,
\t\t\t'column' => $column,
\t\t\t'result' => $result,
\t\t);
\t\treturn $result;
\t}
}

$wpdb = new WPHX_305_04_WPDB( '', '', '', '' );
$wpdb->prefix = 'wp_';
$wpdb->users = 'wp_users';
$wpdb->posts = 'wp_posts';
$wpdb->postmeta = 'wp_postmeta';
$wpdb->reset_fixture_state();

function wphx_305_04_reset_events() {
\t$GLOBALS['wphx_305_04_events'] = array();
}

function wphx_305_04_placeholder() {
\tglobal $wpdb;
\treturn $wpdb->placeholder_escape();
}

function wphx_305_04_normalize_string( $value ) {
\t$placeholder = wphx_305_04_placeholder();
\tif ( '' !== $placeholder ) {
\t\t$value = str_replace( $placeholder, '{WPDB_PLACEHOLDER}', $value );
\t}
\treturn $value;
}

function wphx_305_04_scalar( $value ) {
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
\t$value = wphx_305_04_normalize_string( (string) $value );
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => $value,
\t\t'hex'    => bin2hex( $value ),
\t\t'bytes'  => strlen( $value ),
\t\t'sha256' => hash( 'sha256', $value ),
\t);
}

function wphx_305_04_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_305_04_scalar( $key ),
\t\t\t\t'value' => wphx_305_04_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_305_04_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_305_04_scalar( $value );
}

function wphx_305_04_events() {
\t$events = array();
\tforeach ( $GLOBALS['wphx_305_04_events'] as $event ) {
\t\t$events[] = wphx_305_04_value( $event );
\t}
\treturn $events;
}

function wphx_305_04_case( $id, $symbol, $callback ) {
\tglobal $wpdb;
\t$wpdb->reset_fixture_state();
\twphx_305_04_reset_events();
\t$error = null;
\ttry {
\t\t$value = $callback();
\t} catch ( Throwable $throwable ) {
\t\t$error = array(
\t\t\t'class'   => get_class( $throwable ),
\t\t\t'message' => $throwable->getMessage(),
\t\t);
\t\t$value = null;
\t}
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_305_04_value( $value ),
\t\t'error'  => null === $error ? null : wphx_305_04_value( $error ),
\t\t'events' => wphx_305_04_events(),
\t);
}

function wphx_305_04_run_cases() {
\tglobal $wpdb;

\t$cases = array();

\t$cases[] = wphx_305_04_case(
\t\t'insert:formats-null-state',
\t\t'wpdb::insert',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->insert(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'id'       => 7,
\t\t\t\t\t'name'     => "O'Reilly",
\t\t\t\t\t'nullable' => null,
\t\t\t\t\t'ratio'    => 1.5,
\t\t\t\t),
\t\t\t\tarray( '%d', '%s', '%s', '%f' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'queryEvents'   => $wpdb->query_events,
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'replace:field-types-default-formats',
\t\t'wpdb::replace',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->replace(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'id'    => 8,
\t\t\t\t\t'name'  => 'Beta',
\t\t\t\t\t'score' => 2.25,
\t\t\t\t\t'count' => 4,
\t\t\t\t)
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'queryEvents'   => $wpdb->query_events,
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'update:null-where',
\t\t'wpdb::update',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->update(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'name'       => 'Gamma',
\t\t\t\t\t'short_text' => null,
\t\t\t\t\t'score'      => 9.75,
\t\t\t\t),
\t\t\t\tarray(
\t\t\t\t\t'id'       => 7,
\t\t\t\t\t'nullable' => null,
\t\t\t\t),
\t\t\t\tarray( '%s', '%s', '%f' ),
\t\t\t\tarray( '%d', '%s' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'queryEvents'   => $wpdb->query_events,
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'delete:where-null-format',
\t\t'wpdb::delete',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->delete(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'id'       => 7,
\t\t\t\t\t'nullable' => null,
\t\t\t\t\t'name'     => 'Gamma',
\t\t\t\t),
\t\t\t\tarray( '%d', '%s', '%s' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'queryEvents'   => $wpdb->query_events,
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'insert-helper:invalid-type',
\t\t'wpdb::_insert_replace_helper',
\t\tfunction () use ( $wpdb ) {
\t\t\t$wpdb->insert_id = 555;
\t\t\t$result = $wpdb->public_insert_replace_helper( 'wp_fixture', array( 'id' => 1 ), array( '%d' ), 'UPSERT' );
\t\t\treturn array(
\t\t\t\t'return' => $result,
\t\t\t\t'state'  => $wpdb->public_state(),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'crud:invalid-array-guards',
\t\t'wpdb::update/wpdb::delete',
\t\tfunction () use ( $wpdb ) {
\t\t\t$update = $wpdb->update( 'wp_fixture', 'not-an-array', array( 'id' => 1 ) );
\t\t\t$after_update = $wpdb->public_state();
\t\t\t$delete = $wpdb->delete( 'wp_fixture', 'not-an-array' );
\t\t\t$after_delete = $wpdb->public_state();
\t\t\treturn compact( 'update', 'after_update', 'delete', 'after_delete' );
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'process-fields:field-types-charsets-lengths',
\t\t'wpdb::process_fields',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->public_process_fields(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'id'       => 1,
\t\t\t\t\t'name'     => 'Short',
\t\t\t\t\t'score'    => 2.5,
\t\t\t\t\t'nullable' => null,
\t\t\t\t),
\t\t\t\tnull
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'process-fields:length-rejection',
\t\t'wpdb::process_fields',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->public_process_fields(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'short_text' => 'abcdef',
\t\t\t\t\t'byte_text'  => 'abcdef',
\t\t\t\t),
\t\t\t\tarray( '%s', '%s' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'process-fields:charset-error',
\t\t'wpdb::process_field_charsets',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->public_process_fields(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'bad_charset' => 'value',
\t\t\t\t),
\t\t\t\tarray( '%s' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'process-fields:length-error',
\t\t'wpdb::process_field_lengths',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->public_process_fields(
\t\t\t\t'wp_fixture',
\t\t\t\tarray(
\t\t\t\t\t'bad_length' => 'value',
\t\t\t\t),
\t\t\t\tarray( '%s' )
\t\t\t);
\t\t\treturn array(
\t\t\t\t'return'        => $result,
\t\t\t\t'state'         => $wpdb->public_state(),
\t\t\t\t'charsetEvents' => $wpdb->charset_events,
\t\t\t\t'lengthEvents'  => $wpdb->length_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'process-field-formats:cycling-and-field-types',
\t\t'wpdb::process_field_formats',
\t\tfunction () use ( $wpdb ) {
\t\t\t$cycled = $wpdb->public_process_field_formats(
\t\t\t\tarray(
\t\t\t\t\t'a' => 1,
\t\t\t\t\t'b' => 'two',
\t\t\t\t\t'c' => 3,
\t\t\t\t),
\t\t\t\tarray( '%d', '%s' )
\t\t\t);
\t\t\t$field_types = $wpdb->public_process_field_formats(
\t\t\t\tarray(
\t\t\t\t\t'id'    => 1,
\t\t\t\t\t'score' => 1.25,
\t\t\t\t\t'name'  => 'Name',
\t\t\t\t),
\t\t\t\tnull
\t\t\t);
\t\t\treturn compact( 'cycled', 'field_types' );
\t\t}
\t);

\t$cases[] = wphx_305_04_case(
\t\t'strip-invalid-text:standalone',
\t\t'wpdb::strip_invalid_text',
\t\tfunction () use ( $wpdb ) {
\t\t\t$input = array(
\t\t\t\t'byte_text' => array(
\t\t\t\t\t'value'   => 'abcdef',
\t\t\t\t\t'format'  => '%s',
\t\t\t\t\t'charset' => 'latin1',
\t\t\t\t\t'length'  => array( 'type' => 'byte', 'length' => 3 ),
\t\t\t\t),
\t\t\t\t'numeric' => array(
\t\t\t\t\t'value'   => 42,
\t\t\t\t\t'format'  => '%d',
\t\t\t\t\t'charset' => false,
\t\t\t\t\t'length'  => false,
\t\t\t\t),
\t\t\t\t'no_length' => array(
\t\t\t\t\t'value'   => 'keep',
\t\t\t\t\t'format'  => '%s',
\t\t\t\t\t'charset' => 'utf8mb4',
\t\t\t\t\t'length'  => false,
\t\t\t\t),
\t\t\t);
\t\t\t$output = $wpdb->public_strip_invalid_text( $input );
\t\t\treturn compact( 'input', 'output' );
\t\t}
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                => $mode,
\t'phpVersion'          => PHP_VERSION,
\t'coveredMethodExists' => array(
\t\t'insert'                       => method_exists( $wpdb, 'insert' ),
\t\t'replace'                      => method_exists( $wpdb, 'replace' ),
\t\t'_insert_replace_helper'       => method_exists( $wpdb, '_insert_replace_helper' ),
\t\t'update'                       => method_exists( $wpdb, 'update' ),
\t\t'delete'                       => method_exists( $wpdb, 'delete' ),
\t\t'public_process_fields'        => method_exists( $wpdb, 'public_process_fields' ),
\t\t'public_process_field_formats' => method_exists( $wpdb, 'public_process_field_formats' ),
\t\t'public_process_field_charsets' => method_exists( $wpdb, 'public_process_field_charsets' ),
\t\t'public_process_field_lengths' => method_exists( $wpdb, 'public_process_field_lengths' ),
\t\t'public_strip_invalid_text'    => method_exists( $wpdb, 'public_strip_invalid_text' ),
\t\t'get_col_charset'              => method_exists( $wpdb, 'get_col_charset' ),
\t\t'get_col_length'               => method_exists( $wpdb, 'get_col_length' ),
\t),
\t'cases'               => wphx_305_04_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    coveredMethodExists: result.coveredMethodExists,
    cases: result.cases
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
  const oracleText = JSON.stringify(oracle);
  const candidateText = JSON.stringify(candidate);
  const matches = oracleText === candidateText;
  return {
    matches,
    oracle_sha256: sha256(oracleText),
    candidate_sha256: sha256(candidateText),
    oracle_case_count: oracle.cases.length,
    candidate_case_count: candidate.cases.length,
    ...(matches ? {} : { oracle, candidate })
  };
}

function runSummary(run) {
  const normalized = normalize(run.result);
  return {
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: run.command,
    image: run.image ?? null,
    php_version: run.result.phpVersion,
    case_count: normalized.cases.length,
    result_sha256: sha256(JSON.stringify(normalized))
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-write-fields`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-write-fields-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "wpdb write/process-field differential fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 wpdb write methods, field-format coercion, null SQL construction, charset/length metadata checks, and write-state mutation boundaries stay observable while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-wpdb-write-fields-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-write-fields",
        "npm run wp:core:wphx-305-write-fields:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-305-04-wpdb-write-fields-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-305.04. The probe runs WordPress write and process-field logic directly and isolates only live DB query execution plus charset/length metadata lookup behind deterministic test doubles."
  };
}

const lock = readJson("toolchain.lock.json");
const surface = readJson(SURFACE);
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
  schema: "wphx.wp-core-wpdb-write-fields-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-write-fields-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    prepare_escaping_fixture: inputRecord(PREPARE_FIXTURE),
    query_results_fixture: inputRecord(QUERY_FIXTURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "write_process_fields")?.label ?? "Write helpers and field processing",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "query-write-test-double",
        reason:
          "The probe overrides wpdb::query() with deterministic write return values so insert/replace/update/delete SQL construction and state mutation can be compared without a live mysqli connection."
      },
      {
        id: "prepare-escaping-covered-by-wphx-305-02",
        reason:
          "The write methods still call WordPress wpdb::prepare(); low-level _real_escape() is made deterministic here because dedicated prepare/escaping parity is already recorded by WPHX-305.02."
      },
      {
        id: "column-metadata-test-double",
        reason:
          "get_col_charset() and get_col_length() normally depend on live table metadata. The fixture supplies deterministic charset/length metadata and WP_Error cases to exercise process_field_charsets(), process_field_lengths(), and strip_invalid_text()."
      },
      {
        id: "php-reference-and-protected-method-exposure",
        reason:
          "Protected process-field helpers are exposed only through the fixture subclass so their native PHP array mutation and comparison behavior can be recorded before Haxe ownership."
      }
    ],
    follows: ["WPHX-305.01", "WPHX-305.02", "WPHX-305.03"],
    follow_up_owner: "WPHX-305.05/WPHX-305.06"
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
  run_summaries: runs.map(runSummary),
  trace_samples: [
    {
      id: "local-php-cli:oracle",
      runtime: "local-php-cli",
      mode: "oracle",
      result: normalize(localOracle.result)
    }
  ],
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-305",
      detail: "The candidate side is a copied WordPress oracle source tree until wpdb write/process-field helpers are promoted behind typed Haxe parity candidates."
    },
    {
      id: "live-mysqli-write-execution-not-yet-covered",
      owner: "WPHX-305.06",
      detail: "This fixture avoids real MySQL. Live affected rows, insert IDs, duplicate-key replace behavior, and mysqli write errors need the database runtime integration harness."
    },
    {
      id: "db-conversion-branch-not-yet-covered",
      owner: "WPHX-305.05/WPHX-305.06",
      detail: "strip_invalid_text() cases stay in local ASCII/latin1 truncation paths. The branch that asks MySQL to convert invalid text remains a later charset/collation plus DB runtime gate."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-305",
      detail: "This fixture covers seed traces from the upstream db tests. Full upstream wpdb PHPUnit parity remains a domain-level closure requirement."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "oracle_source_mirror",
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
  id: "receipt:wphx-305-04-wpdb-write-fields-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "wpdb write/process-field differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-wpdb-write-fields-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-write-fields",
    "npm run wp:core:wphx-305-write-fields:check",
    "npm run beads:validate",
    "npm run receipts:validate"
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
      covered_symbols: COVERED_SYMBOLS.length,
      fixture_cases: FIXTURE_CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
