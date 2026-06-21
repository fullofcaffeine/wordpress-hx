#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.3",
  external_ref: "WPHX-305.03",
  title: "Build query and read-result fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-305-03";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-305-03-wpdb-query-results-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-03-wpdb-query-results-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-03-wpdb-query-results-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-305-01-wpdb-surface.v1.json";
const PREPARE_FIXTURE = "manifests/wp-core/wphx-305-02-wpdb-prepare-escaping-fixture.v1.json";
const RECORDED_AT = "2026-06-21T01:25:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/class-wpdb.php"
];

const COVERED_SYMBOLS = [
  "wpdb::query",
  "wpdb::get_var",
  "wpdb::get_row",
  "wpdb::get_col",
  "wpdb::get_results",
  "wpdb::get_col_info",
  "wpdb::load_col_info",
  "wpdb::log_query",
  "wpdb::flush"
];

const FIXTURE_CASES = [
  { id: "query:select-state", symbol: "wpdb::query", focus: "SELECT return count, last_query, last_result, num_rows, and SAVEQUERIES log shape" },
  { id: "query:filter-mutation-log-data", symbol: "wpdb::query", focus: "query filter mutation and log_query_custom_data filter behavior" },
  { id: "query:write-ddl-error-not-ready", symbol: "wpdb::query", focus: "write count, insert id, DDL result, error result, and not-ready branch state" },
  { id: "get-var:index-empty", symbol: "wpdb::get_var", focus: "x/y indexing, empty string to null, and previous-result reuse" },
  { id: "get-row:output-shapes", symbol: "wpdb::get_row", focus: "OBJECT, lowercase object, ARRAY_A, ARRAY_N, missing row, and invalid output handling" },
  { id: "get-col:query-and-previous", symbol: "wpdb::get_col", focus: "column extraction from a fresh query and from previous last_result" },
  { id: "get-results:output-shapes", symbol: "wpdb::get_results", focus: "OBJECT, OBJECT_K duplicate-key collapse, ARRAY_A, ARRAY_N, and invalid output null" },
  { id: "get-col-info:seeded-metadata", symbol: "wpdb::get_col_info", focus: "column metadata retrieval without live mysqli_result" },
  { id: "flush:state-reset", symbol: "wpdb::flush", focus: "public query/result state reset semantics" },
  { id: "log-query:direct", symbol: "wpdb::log_query", focus: "direct query log entry plus custom data filter" }
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
define( 'SAVEQUERIES', true );

$GLOBALS['wphx_305_03_events'] = array();

function wphx_305_03_event( $type, $payload = array() ) {
\t$GLOBALS['wphx_305_03_events'][] = array(
\t\t'type'    => $type,
\t\t'payload' => $payload,
\t);
}

if ( ! function_exists( 'wp_load_translations_early' ) ) {
\tfunction wp_load_translations_early() {
\t\twphx_305_03_event( 'wp_load_translations_early' );
\t}
}

if ( ! function_exists( '__' ) ) {
\tfunction __( $text, $domain = 'default' ) {
\t\treturn $text;
\t}
}

if ( ! function_exists( '_doing_it_wrong' ) ) {
\tfunction _doing_it_wrong( $function_name, $message, $version ) {
\t\twphx_305_03_event(
\t\t\t'doing_it_wrong',
\t\t\tarray(
\t\t\t\t'function' => $function_name,
\t\t\t\t'message'  => $message,
\t\t\t\t'version'  => $version,
\t\t\t)
\t\t);
\t}
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/class-wpdb.php';

class WPHX_305_03_WPDB extends wpdb {
\tpublic $query_events = array();

\tpublic function reset_fixture_state() {
\t\t$this->ready         = true;
\t\t$this->query_events  = array();
\t\t$this->queries       = array();
\t\t$this->insert_id     = 0;
\t\t$this->last_error    = '';
\t\t$this->num_queries   = 0;
\t\t$this->rows_affected = 0;
\t\t$this->num_rows      = 0;
\t\t$this->last_query    = null;
\t\t$this->last_result   = array();
\t\t$this->col_info      = null;
\t\t$this->func_call     = null;
\t}

\tprivate function row( $values ) {
\t\treturn (object) $values;
\t}

\tprivate function default_rows() {
\t\treturn array(
\t\t\t$this->row( array( 'id' => '1', 'user_login' => 'alpha', 'score' => '7', 'empty_value' => '' ) ),
\t\t\t$this->row( array( 'id' => '2', 'user_login' => 'beta', 'score' => '0', 'empty_value' => 'filled' ) ),
\t\t\t$this->row( array( 'id' => '2', 'user_login' => 'duplicate', 'score' => '9', 'empty_value' => 'shadow' ) ),
\t\t);
\t}

\tprivate function rows_for_query( $query ) {
\t\tif ( false !== stripos( $query, 'EMPTY_RESULT' ) ) {
\t\t\treturn array();
\t\t}
\t\tif ( false !== stripos( $query, 'SINGLE_RESULT' ) ) {
\t\t\treturn array( $this->row( array( 'id' => '9', 'user_login' => 'single', 'score' => '11', 'empty_value' => '' ) ) );
\t\t}
\t\treturn $this->default_rows();
\t}

\tprivate function set_rows( $rows ) {
\t\t$this->last_result = array_values( $rows );
\t\t$this->num_rows    = count( $this->last_result );
\t}

\tprivate function record_query_event( $kind, $query, $result ) {
\t\t$this->query_events[] = array(
\t\t\t'kind'   => $kind,
\t\t\t'query'  => $query,
\t\t\t'result' => $result,
\t\t\t'state'  => $this->public_state( false ),
\t\t);
\t}

\tpublic function public_state( $include_results = true ) {
\t\t$state = array(
\t\t\t'last_query'    => $this->last_query,
\t\t\t'num_queries'   => $this->num_queries,
\t\t\t'num_rows'      => $this->num_rows,
\t\t\t'rows_affected' => $this->rows_affected,
\t\t\t'insert_id'     => $this->insert_id,
\t\t\t'last_error'    => $this->last_error,
\t\t\t'func_call'     => $this->func_call,
\t\t\t'queries'       => $this->queries,
\t\t);
\t\tif ( $include_results ) {
\t\t\t$state['last_result'] = $this->last_result;
\t\t}
\t\treturn $state;
\t}

\tpublic function seed_previous_results() {
\t\t$this->flush();
\t\t$this->last_query = 'SELECT previous fixture';
\t\t$this->set_rows( $this->default_rows() );
\t}

\tpublic function seed_col_info() {
\t\t$this->col_info = array(
\t\t\t(object) array( 'name' => 'id', 'table' => 'wp_users', 'max_length' => 1, 'type' => 'int', 'numeric' => 1 ),
\t\t\t(object) array( 'name' => 'user_login', 'table' => 'wp_users', 'max_length' => 9, 'type' => 'varchar', 'numeric' => 0 ),
\t\t\t(object) array( 'name' => 'score', 'table' => 'wp_users', 'max_length' => 2, 'type' => 'int', 'numeric' => 1 ),
\t\t);
\t}

\tpublic function query( $query ) {
\t\tif ( ! $this->ready ) {
\t\t\t$this->check_current_query = true;
\t\t\treturn false;
\t\t}

\t\t$query = apply_filters( 'query', $query );

\t\tif ( ! $query ) {
\t\t\t$this->insert_id = 0;
\t\t\t$this->record_query_event( 'empty-query', $query, false );
\t\t\treturn false;
\t\t}

\t\t$this->flush();
\t\t$this->func_call  = '$db->query(\"' . $query . '\")';
\t\t$this->last_query = $query;
\t\t++$this->num_queries;

\t\tif ( defined( 'SAVEQUERIES' ) && SAVEQUERIES ) {
\t\t\t$this->log_query( $query, 0.001, 'wphx_305_03_fixture', 123456.789, array( 'fixture' => true ) );
\t\t}

\t\tif ( false !== stripos( $query, 'SIMULATED_ERROR' ) ) {
\t\t\t$this->last_error = 'simulated database error';
\t\t\t$this->record_query_event( 'error', $query, false );
\t\t\treturn false;
\t\t}

\t\tif ( preg_match( '/^\\s*(create|alter|truncate|drop)\\s/i', $query ) ) {
\t\t\t$this->result = true;
\t\t\t$this->record_query_event( 'ddl', $query, true );
\t\t\treturn true;
\t\t}

\t\tif ( preg_match( '/^\\s*(insert|replace)\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 1;
\t\t\t$this->insert_id     = 321;
\t\t\t$this->record_query_event( 'insert', $query, 1 );
\t\t\treturn 1;
\t\t}

\t\tif ( preg_match( '/^\\s*(update|delete)\\s/i', $query ) ) {
\t\t\t$this->rows_affected = 3;
\t\t\t$this->record_query_event( 'write', $query, 3 );
\t\t\treturn 3;
\t\t}

\t\t$rows = $this->rows_for_query( $query );
\t\t$this->set_rows( $rows );
\t\t$this->record_query_event( 'select', $query, count( $rows ) );
\t\treturn count( $rows );
\t}
}

$wpdb = new WPHX_305_03_WPDB( '', '', '', '' );
$wpdb->prefix = 'wp_';
$wpdb->users = 'wp_users';
$wpdb->posts = 'wp_posts';
$wpdb->postmeta = 'wp_postmeta';
$wpdb->reset_fixture_state();

function wphx_305_03_reset_events() {
\t$GLOBALS['wphx_305_03_events'] = array();
}

function wphx_305_03_scalar( $value ) {
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
\t$value = (string) $value;
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => $value,
\t\t'hex'    => bin2hex( $value ),
\t\t'bytes'  => strlen( $value ),
\t\t'sha256' => hash( 'sha256', $value ),
\t);
}

function wphx_305_03_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_305_03_scalar( $key ),
\t\t\t\t'value' => wphx_305_03_value( $entry_value ),
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
\t\t\t'properties' => wphx_305_03_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_305_03_scalar( $value );
}

function wphx_305_03_events() {
\t$events = array();
\tforeach ( $GLOBALS['wphx_305_03_events'] as $event ) {
\t\t$events[] = wphx_305_03_value( $event );
\t}
\treturn $events;
}

function wphx_305_03_case( $id, $symbol, $callback ) {
\tglobal $wpdb;
\t$wpdb->reset_fixture_state();
\twphx_305_03_reset_events();
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
\t\t'value'  => wphx_305_03_value( $value ),
\t\t'error'  => null === $error ? null : wphx_305_03_value( $error ),
\t\t'events' => wphx_305_03_events(),
\t);
}

function wphx_305_03_run_cases() {
\tglobal $wpdb;

\t$cases = array();

\t$cases[] = wphx_305_03_case(
\t\t'query:select-state',
\t\t'wpdb::query',
\t\tfunction () use ( $wpdb ) {
\t\t\t$result = $wpdb->query( 'SELECT DEFAULT_RESULT' );
\t\t\treturn array(
\t\t\t\t'return'      => $result,
\t\t\t\t'state'       => $wpdb->public_state(),
\t\t\t\t'queryEvents' => $wpdb->query_events,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'query:filter-mutation-log-data',
\t\t'wpdb::query',
\t\tfunction () use ( $wpdb ) {
\t\t\t$query_filter = function ( $query ) {
\t\t\t\treturn $query . ' /*filtered*/';
\t\t\t};
\t\t\t$log_filter = function ( $data, $query, $query_time, $query_callstack, $query_start ) {
\t\t\t\t$data['filtered'] = true;
\t\t\t\t$data['queryHash'] = hash( 'sha256', $query );
\t\t\t\treturn $data;
\t\t\t};
\t\t\tadd_filter( 'query', $query_filter, 10, 1 );
\t\t\tadd_filter( 'log_query_custom_data', $log_filter, 10, 5 );
\t\t\t$result = $wpdb->query( 'SELECT SINGLE_RESULT' );
\t\t\tremove_filter( 'query', $query_filter, 10 );
\t\t\tremove_filter( 'log_query_custom_data', $log_filter, 10 );
\t\t\treturn array(
\t\t\t\t'return' => $result,
\t\t\t\t'state'  => $wpdb->public_state(),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'query:write-ddl-error-not-ready',
\t\t'wpdb::query',
\t\tfunction () use ( $wpdb ) {
\t\t\t$insert = $wpdb->query( 'INSERT INTO wp_users VALUES fixture' );
\t\t\t$after_insert = $wpdb->public_state();
\t\t\t$update = $wpdb->query( 'UPDATE wp_users SET user_login = fixture' );
\t\t\t$after_update = $wpdb->public_state();
\t\t\t$ddl = $wpdb->query( 'CREATE TABLE wp_fixture (id int)' );
\t\t\t$after_ddl = $wpdb->public_state();
\t\t\t$error = $wpdb->query( 'SELECT SIMULATED_ERROR' );
\t\t\t$after_error = $wpdb->public_state();
\t\t\t$wpdb->ready = false;
\t\t\t$not_ready = $wpdb->query( 'SELECT DEFAULT_RESULT' );
\t\t\t$after_not_ready = $wpdb->public_state();
\t\t\t$wpdb->ready = true;
\t\t\treturn compact( 'insert', 'after_insert', 'update', 'after_update', 'ddl', 'after_ddl', 'error', 'after_error', 'not_ready', 'after_not_ready' );
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'get-var:index-empty',
\t\t'wpdb::get_var',
\t\tfunction () use ( $wpdb ) {
\t\t\t$first = $wpdb->get_var( 'SELECT DEFAULT_RESULT', 1, 0 );
\t\t\t$empty = $wpdb->get_var( null, 3, 0 );
\t\t\t$second_row = $wpdb->get_var( null, 2, 1 );
\t\t\t$missing = $wpdb->get_var( null, 9, 9 );
\t\t\treturn array(
\t\t\t\t'first'     => $first,
\t\t\t\t'empty'     => $empty,
\t\t\t\t'secondRow' => $second_row,
\t\t\t\t'missing'   => $missing,
\t\t\t\t'state'     => $wpdb->public_state(),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'get-row:output-shapes',
\t\t'wpdb::get_row',
\t\tfunction () use ( $wpdb ) {
\t\t\t$object = $wpdb->get_row( 'SELECT DEFAULT_RESULT', OBJECT, 1 );
\t\t\t$array_a = $wpdb->get_row( 'SELECT DEFAULT_RESULT', ARRAY_A, 0 );
\t\t\t$array_n = $wpdb->get_row( 'SELECT DEFAULT_RESULT', ARRAY_N, 0 );
\t\t\t$lower_object = $wpdb->get_row( 'SELECT DEFAULT_RESULT', 'object', 0 );
\t\t\t$missing = $wpdb->get_row( 'SELECT EMPTY_RESULT', OBJECT, 0 );
\t\t\t$invalid = $wpdb->get_row( 'SELECT DEFAULT_RESULT', 'BAD_OUTPUT', 0 );
\t\t\treturn compact( 'object', 'array_a', 'array_n', 'lower_object', 'missing', 'invalid' );
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'get-col:query-and-previous',
\t\t'wpdb::get_col',
\t\tfunction () use ( $wpdb ) {
\t\t\t$fresh = $wpdb->get_col( 'SELECT DEFAULT_RESULT', 1 );
\t\t\t$wpdb->seed_previous_results();
\t\t\t$previous = $wpdb->get_col( null, 2 );
\t\t\treturn array(
\t\t\t\t'fresh'    => $fresh,
\t\t\t\t'previous' => $previous,
\t\t\t\t'state'    => $wpdb->public_state(),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'get-results:output-shapes',
\t\t'wpdb::get_results',
\t\tfunction () use ( $wpdb ) {
\t\t\t$object = $wpdb->get_results( 'SELECT DEFAULT_RESULT', OBJECT );
\t\t\t$object_k = $wpdb->get_results( 'SELECT DEFAULT_RESULT', OBJECT_K );
\t\t\t$array_a = $wpdb->get_results( 'SELECT DEFAULT_RESULT', ARRAY_A );
\t\t\t$array_n = $wpdb->get_results( 'SELECT DEFAULT_RESULT', ARRAY_N );
\t\t\t$lower_object = $wpdb->get_results( 'SELECT DEFAULT_RESULT', 'object' );
\t\t\t$invalid = $wpdb->get_results( 'SELECT DEFAULT_RESULT', 'BAD_OUTPUT' );
\t\t\t$empty = $wpdb->get_results( 'SELECT EMPTY_RESULT', OBJECT );
\t\t\treturn compact( 'object', 'object_k', 'array_a', 'array_n', 'lower_object', 'invalid', 'empty' );
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'get-col-info:seeded-metadata',
\t\t'wpdb::get_col_info',
\t\tfunction () use ( $wpdb ) {
\t\t\t$wpdb->seed_col_info();
\t\t\treturn array(
\t\t\t\t'names'       => $wpdb->get_col_info( 'name' ),
\t\t\t\t'tables'      => $wpdb->get_col_info( 'table' ),
\t\t\t\t'secondName'  => $wpdb->get_col_info( 'name', 1 ),
\t\t\t\t'thirdType'   => $wpdb->get_col_info( 'type', 2 ),
\t\t\t\t'missingInfo' => $wpdb->get_col_info( 'missing' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'flush:state-reset',
\t\t'wpdb::flush',
\t\tfunction () use ( $wpdb ) {
\t\t\t$wpdb->query( 'SELECT DEFAULT_RESULT' );
\t\t\t$before = $wpdb->public_state();
\t\t\t$wpdb->flush();
\t\t\t$after = $wpdb->public_state();
\t\t\treturn compact( 'before', 'after' );
\t\t}
\t);

\t$cases[] = wphx_305_03_case(
\t\t'log-query:direct',
\t\t'wpdb::log_query',
\t\tfunction () use ( $wpdb ) {
\t\t\t$log_filter = function ( $data ) {
\t\t\t\t$data['directFiltered'] = true;
\t\t\t\treturn $data;
\t\t\t};
\t\t\tadd_filter( 'log_query_custom_data', $log_filter, 10, 5 );
\t\t\t$wpdb->log_query( 'SELECT direct log', 0.25, 'direct_fixture', 9876.5, array( 'direct' => true ) );
\t\t\tremove_filter( 'log_query_custom_data', $log_filter, 10 );
\t\t\treturn $wpdb->public_state( false );
\t\t}
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                => $mode,
\t'phpVersion'          => PHP_VERSION,
\t'coveredMethodExists' => array(
\t\t'query'        => method_exists( $wpdb, 'query' ),
\t\t'get_var'      => method_exists( $wpdb, 'get_var' ),
\t\t'get_row'      => method_exists( $wpdb, 'get_row' ),
\t\t'get_col'      => method_exists( $wpdb, 'get_col' ),
\t\t'get_results'  => method_exists( $wpdb, 'get_results' ),
\t\t'get_col_info' => method_exists( $wpdb, 'get_col_info' ),
\t\t'log_query'    => method_exists( $wpdb, 'log_query' ),
\t\t'flush'        => method_exists( $wpdb, 'flush' ),
\t),
\t'cases'               => wphx_305_03_run_cases(),
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-query-results`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-query-results-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "wpdb query/read-result differential fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 wpdb query state, read-result output shapes, column metadata reads, flush semantics, and query logging stay observable while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-wpdb-query-results-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-query-results",
        "npm run wp:core:wphx-305-query-results:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-305-03-wpdb-query-results-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-305.03. The probe uses a constrained query/result test double so WordPress read-result methods are exercised deterministically; live mysqli_result traversal remains a later WPHX-305 gate."
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
  schema: "wphx.wp-core-wpdb-query-results-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-query-results-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    prepare_escaping_fixture: inputRecord(PREPARE_FIXTURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "query_execution_results")?.label ?? "Query execution and result retrieval",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "query-result-test-double",
        reason:
          "The probe overrides wpdb::query() with deterministic result seeding so get_var/get_row/get_col/get_results and query state can be compared without a live mysqli_result."
      },
      {
        id: "live-mysqli-result-traversal",
        reason:
          "Parent wpdb::query() fetches mysqli_result objects and mysqli affected-row/insert-id state. That live execution path remains a later WPHX-305 database runtime gate."
      },
      {
        id: "query-filter-and-log-hooks",
        reason:
          "The fixture exercises native query and log_query_custom_data filters through the mirrored WordPress plugin API."
      },
      {
        id: "column-metadata-test-double",
        reason:
          "get_col_info() is exercised with seeded col_info because parent load_col_info() depends on mysqli_fetch_field()."
      }
    ],
    follows: ["WPHX-305.01", "WPHX-305.02"],
    follow_up_owner: "WPHX-305.04/WPHX-305.06"
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
      detail: "The candidate side is a copied WordPress oracle source tree until database read/query helpers are promoted behind typed Haxe parity candidates."
    },
    {
      id: "live-mysqli-result-not-yet-covered",
      owner: "WPHX-305.04/WPHX-305.06",
      detail: "This fixture avoids real MySQL. Parent wpdb::query() mysqli_result traversal, affected rows, insert IDs, and errors need the database runtime harness before Haxe ownership."
    },
    {
      id: "safe-collation-and-table-metadata-deferred",
      owner: "WPHX-305.05",
      detail: "The seed queries are ASCII and use seeded col_info. Charset/collation table metadata checks belong to WPHX-305.05."
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
  id: "receipt:wphx-305-03-wpdb-query-results-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "wpdb query/read-result differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-wpdb-query-results-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-query-results",
    "npm run wp:core:wphx-305-query-results:check",
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
