#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.8.3",
  external_ref: "WPHX-304.03",
  title: "Build transient and site-transient expiration fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-304-03";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const SIMPLEPIE_STUB = `${OUT_ROOT}/simplepie-stubs.php`;
const OUT = "manifests/wp-core/wphx-304-03-transient-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-304-03-transient-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-304-03-transient-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-304-01-options-cache-surface.v1.json";
const RECORDED_AT = "2026-06-21T02:45:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-includes/class-wp-feed-cache-transient.php",
  "src/wp-includes/class-wp-feed-cache.php"
];

const COVERED_SYMBOLS = [
  "set_transient",
  "get_transient",
  "delete_transient",
  "delete_expired_transients",
  "set_site_transient",
  "get_site_transient",
  "delete_site_transient",
  "WP_Feed_Cache_Transient",
  "WP_Feed_Cache_Transient::__construct",
  "WP_Feed_Cache_Transient::save",
  "WP_Feed_Cache_Transient::load",
  "WP_Feed_Cache_Transient::mtime",
  "WP_Feed_Cache_Transient::touch",
  "WP_Feed_Cache_Transient::unlink",
  "WP_Feed_Cache::create"
];

const FIXTURE_CASES = [
  { id: "transient:no-expiration-autoload", symbol: "set_transient/get_transient", focus: "no-timeout transient value is option-backed and autoloaded" },
  { id: "transient:expiration-timeout-pair", symbol: "set_transient/get_transient", focus: "timeout/value option pair, non-autoload placement, and retrieval" },
  { id: "transient:expired-read-deletes", symbol: "get_transient", focus: "expired timeout deletes both value and timeout options and returns false" },
  { id: "transient:update-existing-timeout", symbol: "set_transient", focus: "updating an existing timed transient refreshes timeout and value" },
  { id: "transient:add-timeout-to-existing-no-timeout", symbol: "set_transient", focus: "adding expiration to a no-timeout transient recreates value plus timeout pair" },
  { id: "transient:filters-actions", symbol: "set_transient/get_transient/delete_transient", focus: "pre-set, expiration, read, short-circuit, set, and delete hooks" },
  { id: "transient:delete-expired-transients", symbol: "delete_expired_transients", focus: "expired transient and site-transient cleanup in the options table" },
  { id: "site-transient:single-site-timeout-pair", symbol: "set_site_transient/get_site_transient", focus: "single-site site transient storage through site-option wrappers" },
  { id: "site-transient:filters-actions", symbol: "set_site_transient/get_site_transient/delete_site_transient", focus: "site transient filters and hooks" },
  { id: "transient:external-object-cache", symbol: "set_transient/set_site_transient", focus: "external object-cache path stores transient groups without option-table writes" },
  { id: "feed-cache-transient:save-load-touch-unlink", symbol: "WP_Feed_Cache_Transient", focus: "SimplePie object data saved through site transients plus mtime/touch/unlink behavior" },
  { id: "feed-cache:factory-create", symbol: "WP_Feed_Cache::create", focus: "legacy feed-cache factory returns transient-backed cache object" }
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

function writeSimplePieStub() {
  mkdirSync(dirname(SIMPLEPIE_STUB), { recursive: true });
  writeFileSync(
    SIMPLEPIE_STUB,
    `<?php
namespace SimplePie {
\tclass SimplePie {
\t\tpublic $data;

\t\tpublic function __construct( $data = array() ) {
\t\t\t$this->data = $data;
\t\t}
\t}

\tclass Cache {}
}

namespace SimplePie\\Cache {
\tinterface Base {
\t\tpublic const TYPE_FEED = 'spc';
\t\tpublic const TYPE_IMAGE = 'spi';

\t\tpublic function __construct( $location, $name, $type );
\t\tpublic function save( $data );
\t\tpublic function load();
\t\tpublic function mtime();
\t\tpublic function touch();
\t\tpublic function unlink();
\t}
}

namespace {
\tif ( ! function_exists( '__' ) ) {
\t\tfunction __( $text, $domain = 'default' ) {
\t\t\treturn $text;
\t\t}
\t}
}
`
  );
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );
$simplepie_stub = $argv[3];

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

require_once $simplepie_stub;

class WPHX_304_03_Fake_WPDB {
\tpublic $options = 'wp_options';
\tpublic $sitemeta = 'wp_sitemeta';
\tpublic $last_error = '';
\tpublic $queries = array();
\tprivate $suppress_errors = false;
\tprivate $rows = array();

\tpublic function __construct() {
\t\t$this->reset();
\t}

\tpublic function reset() {
\t\t$now = time();
\t\t$this->queries = array();
\t\t$this->rows    = array(
\t\t\t'siteurl'                                    => array( 'option_value' => 'https://example.test/', 'autoload' => 'on' ),
\t\t\t'home'                                       => array( 'option_value' => 'https://example.test/', 'autoload' => 'on' ),
\t\t\t'_transient_expired_seed'                    => array( 'option_value' => 'expired-value', 'autoload' => 'off' ),
\t\t\t'_transient_timeout_expired_seed'            => array( 'option_value' => (string) ( $now - 60 ), 'autoload' => 'off' ),
\t\t\t'_transient_fresh_seed'                      => array( 'option_value' => 'fresh-value', 'autoload' => 'off' ),
\t\t\t'_transient_timeout_fresh_seed'              => array( 'option_value' => (string) ( $now + 3600 ), 'autoload' => 'off' ),
\t\t\t'_site_transient_expired_site_seed'          => array( 'option_value' => 'expired-site-value', 'autoload' => 'off' ),
\t\t\t'_site_transient_timeout_expired_site_seed'  => array( 'option_value' => (string) ( $now - 60 ), 'autoload' => 'off' ),
\t\t\t'_site_transient_fresh_site_seed'            => array( 'option_value' => 'fresh-site-value', 'autoload' => 'off' ),
\t\t\t'_site_transient_timeout_fresh_site_seed'    => array( 'option_value' => (string) ( $now + 3600 ), 'autoload' => 'off' ),
\t\t);
\t}

\tpublic function suppress_errors( $suppress = null ) {
\t\t$previous = $this->suppress_errors;
\t\tif ( null !== $suppress ) {
\t\t\t$this->suppress_errors = (bool) $suppress;
\t\t}
\t\treturn $previous;
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

\tpublic function strip_invalid_text_for_column( $table, $column, $value ) {
\t\treturn $value;
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

\tprivate function normalize_arg( $value ) {
\t\tif ( is_int( $value ) && $value > 1000000000 ) {
\t\t\treturn '__timestamp__';
\t\t}
\t\tif ( is_array( $value ) ) {
\t\t\t$normalized = array();
\t\t\tforeach ( $value as $key => $entry ) {
\t\t\t\t$normalized[ $key ] = $this->normalize_arg( $entry );
\t\t\t}
\t\t\treturn $normalized;
\t\t}
\t\treturn $value;
\t}

\tprivate function record( $operation, $query, $args = array() ) {
\t\t$this->queries[] = array(
\t\t\t'operation' => $operation,
\t\t\t'query'     => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ),
\t\t\t'args'      => $this->normalize_arg( $args ),
\t\t);
\t}

\tprivate function row_object( $name, $columns = array( 'option_name', 'option_value', 'autoload' ) ) {
\t\tif ( ! isset( $this->rows[ $name ] ) ) {
\t\t\treturn null;
\t\t}
\t\t$row = new stdClass();
\t\tif ( in_array( 'option_name', $columns, true ) ) {
\t\t\t$row->option_name = $name;
\t\t}
\t\tif ( in_array( 'option_value', $columns, true ) ) {
\t\t\t$row->option_value = $this->rows[ $name ]['option_value'];
\t\t}
\t\tif ( in_array( 'autoload', $columns, true ) ) {
\t\t\t$row->autoload = $this->rows[ $name ]['autoload'];
\t\t}
\t\treturn $row;
\t}

\tpublic function get_row( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_row', $sql, $args );
\t\t$name = $args[0] ?? null;
\t\tif ( null === $name || ! isset( $this->rows[ $name ] ) ) {
\t\t\treturn null;
\t\t}
\t\tif ( false !== strpos( $sql, 'SELECT option_value' ) ) {
\t\t\treturn $this->row_object( $name, array( 'option_value' ) );
\t\t}
\t\tif ( false !== strpos( $sql, 'SELECT autoload' ) ) {
\t\t\treturn $this->row_object( $name, array( 'autoload' ) );
\t\t}
\t\treturn $this->row_object( $name );
\t}

\tpublic function get_var( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_var', $sql, $args );
\t\t$name = $args[0] ?? null;
\t\tif ( null === $name || ! isset( $this->rows[ $name ] ) ) {
\t\t\treturn null;
\t\t}
\t\tif ( false !== strpos( $sql, 'SELECT autoload' ) ) {
\t\t\treturn $this->rows[ $name ]['autoload'];
\t\t}
\t\treturn $this->rows[ $name ]['option_value'];
\t}

\tpublic function get_col( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_col', $sql, $args );
\t\treturn array();
\t}

\tpublic function get_results( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_results', $sql, $args );
\t\t$results = array();
\t\tif ( false !== strpos( $sql, 'WHERE option_name IN' ) ) {
\t\t\tforeach ( $args as $name ) {
\t\t\t\t$row = $this->row_object( $name, array( 'option_name', 'option_value' ) );
\t\t\t\tif ( null !== $row ) {
\t\t\t\t\t$results[] = $row;
\t\t\t\t}
\t\t\t}
\t\t\treturn $results;
\t\t}
\t\tif ( false !== strpos( $sql, 'WHERE autoload IN' ) ) {
\t\t\tpreg_match_all( \"/'([^']+)'/\", $sql, $matches );
\t\t\t$autoload_values = $matches[1] ?: array( 'yes', 'on', 'auto-on', 'auto' );
\t\t\tforeach ( $this->rows as $name => $row ) {
\t\t\t\tif ( in_array( $row['autoload'], $autoload_values, true ) ) {
\t\t\t\t\t$results[] = $this->row_object( $name, array( 'option_name', 'option_value' ) );
\t\t\t\t}
\t\t\t}
\t\t\treturn $results;
\t\t}
\t\tif ( false !== strpos( $sql, 'SELECT option_name, option_value FROM' ) ) {
\t\t\tforeach ( array_keys( $this->rows ) as $name ) {
\t\t\t\t$results[] = $this->row_object( $name, array( 'option_name', 'option_value' ) );
\t\t\t}
\t\t}
\t\treturn $results;
\t}

\tpublic function update( $table, $data, $where ) {
\t\t$this->record( 'update', $table, array( 'data' => $data, 'where' => $where ) );
\t\t$name = $where['option_name'] ?? null;
\t\tif ( null === $name || ! isset( $this->rows[ $name ] ) ) {
\t\t\treturn 0;
\t\t}
\t\tforeach ( $data as $column => $value ) {
\t\t\t$this->rows[ $name ][ $column ] = $value;
\t\t}
\t\treturn 1;
\t}

\tpublic function delete( $table, $where ) {
\t\t$this->record( 'delete', $table, array( 'where' => $where ) );
\t\t$name = $where['option_name'] ?? $where['meta_key'] ?? null;
\t\tif ( null === $name || ! isset( $this->rows[ $name ] ) ) {
\t\t\treturn 0;
\t\t}
\t\tunset( $this->rows[ $name ] );
\t\treturn 1;
\t}

\tprivate function cleanup_expired( $value_prefix, $timeout_prefix, $now ) {
\t\t$count = 0;
\t\tforeach ( array_keys( $this->rows ) as $name ) {
\t\t\tif ( 0 !== strpos( $name, $value_prefix ) || 0 === strpos( $name, $timeout_prefix ) ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\t$suffix       = substr( $name, strlen( $value_prefix ) );
\t\t\t$timeout_name = $timeout_prefix . $suffix;
\t\t\tif ( isset( $this->rows[ $timeout_name ] ) && (int) $this->rows[ $timeout_name ]['option_value'] < $now ) {
\t\t\t\tunset( $this->rows[ $name ], $this->rows[ $timeout_name ] );
\t\t\t\t$count += 2;
\t\t\t}
\t\t}
\t\treturn $count;
\t}

\tpublic function query( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'query', $sql, $args );
\t\tif ( false !== strpos( $sql, 'INSERT INTO' ) ) {
\t\t\t$name = $args[0] ?? null;
\t\t\tif ( null === $name ) {
\t\t\t\treturn 0;
\t\t\t}
\t\t\t$this->rows[ $name ] = array(
\t\t\t\t'option_value' => $args[1] ?? '',
\t\t\t\t'autoload'     => $args[2] ?? 'auto',
\t\t\t);
\t\t\treturn 1;
\t\t}
\t\tif ( false !== strpos( $sql, 'DELETE a, b FROM' ) ) {
\t\t\t$now = $args[2] ?? time();
\t\t\tif ( false !== strpos( $sql, '_site_transient_' ) ) {
\t\t\t\treturn $this->cleanup_expired( '_site_transient_', '_site_transient_timeout_', $now );
\t\t\t}
\t\t\treturn $this->cleanup_expired( '_transient_', '_transient_timeout_', $now );
\t\t}
\t\treturn 0;
\t}

\tpublic function snapshot() {
\t\tksort( $this->rows );
\t\treturn $this->rows;
\t}
}

function wphx_304_03_bootstrap() {
\tglobal $wpdb;

\t$wpdb = new WPHX_304_03_Fake_WPDB();

\trequire_once ABSPATH . WPINC . '/compat.php';
\trequire_once ABSPATH . WPINC . '/utf8.php';
\trequire_once ABSPATH . WPINC . '/load.php';
\trequire_once ABSPATH . WPINC . '/plugin.php';
\trequire_once ABSPATH . WPINC . '/cache.php';
\trequire_once ABSPATH . WPINC . '/functions.php';
\trequire_once ABSPATH . WPINC . '/formatting.php';
\trequire_once ABSPATH . WPINC . '/option.php';
\trequire_once ABSPATH . WPINC . '/class-wp-feed-cache-transient.php';
\trequire_once ABSPATH . WPINC . '/class-wp-feed-cache.php';
}

wphx_304_03_bootstrap();
wp_cache_init();

function wphx_304_03_meta_value( $value ) {
\tif ( is_int( $value ) && $value > 1000000000 ) {
\t\treturn '__timestamp__';
\t}
\tif ( is_array( $value ) ) {
\t\t$normalized = array();
\t\tforeach ( $value as $key => $entry ) {
\t\t\t$normalized[ $key ] = wphx_304_03_meta_value( $entry );
\t\t}
\t\treturn $normalized;
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_304_03_meta_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn $value;
}

function wphx_304_03_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value > 1000000000 ? '__timestamp__' : $value );
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

function wphx_304_03_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_304_03_scalar( $key ),
\t\t\t\t'value' => wphx_304_03_value( $entry_value ),
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
\t\t\t'properties' => wphx_304_03_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_304_03_scalar( $value );
}

function wphx_304_03_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_304_03_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_304_03_timeout_value( $name, $value ) {
\tif ( false !== strpos( $name, '_timeout_' ) && false !== $value ) {
\t\treturn (int) $value < time() ? '__expired_timestamp__' : '__future_timestamp__';
\t}
\treturn $value;
}

function wphx_304_03_rows_snapshot( $rows ) {
\t$result = array();
\tforeach ( $rows as $name => $row ) {
\t\t$result[ $name ] = array(
\t\t\t'option_value' => wphx_304_03_timeout_value( $name, $row['option_value'] ),
\t\t\t'autoload'     => $row['autoload'],
\t\t);
\t}
\tksort( $result );
\treturn $result;
}

function wphx_304_03_option_map_snapshot( $map ) {
\tif ( ! is_array( $map ) ) {
\t\treturn $map;
\t}
\t$result = array();
\tforeach ( $map as $name => $value ) {
\t\t$result[ $name ] = wphx_304_03_timeout_value( $name, $value );
\t}
\tksort( $result );
\treturn $result;
}

function wphx_304_03_cache_pick( $group, $keys ) {
\t$result = array();
\tforeach ( $keys as $key ) {
\t\t$result[ $key ] = wphx_304_03_timeout_value( $key, wp_cache_get( $key, $group ) );
\t}
\treturn $result;
}

function wphx_304_03_snapshot( $option_keys = array(), $object_cache_groups = array() ) {
\tglobal $wpdb;

\t$groups = array();
\tforeach ( $object_cache_groups as $group => $keys ) {
\t\t$groups[ $group ] = wphx_304_03_cache_pick( $group, $keys );
\t}

\treturn array(
\t\t'db'         => wphx_304_03_rows_snapshot( $wpdb->snapshot() ),
\t\t'options'    => array(
\t\t\t'alloptions' => wphx_304_03_option_map_snapshot( wp_cache_get( 'alloptions', 'options' ) ),
\t\t\t'notoptions' => wphx_304_03_option_map_snapshot( wp_cache_get( 'notoptions', 'options' ) ),
\t\t\t'keys'       => wphx_304_03_cache_pick( 'options', $option_keys ),
\t\t),
\t\t'cacheGroups' => $groups,
\t\t'queryCount'  => count( $wpdb->queries ),
\t\t'queryTail'   => array_slice( $wpdb->queries, -8 ),
\t);
}

function wphx_304_03_reset_state() {
\tglobal $wpdb, $wp_filter, $_wp_using_ext_object_cache;
\t$wpdb->reset();
\twp_cache_flush();
\t$wp_filter = array();
\t$_wp_using_ext_object_cache = false;
\t$GLOBALS['wphx_304_03_events'] = array();
}

function wphx_304_03_event_logger( $hook ) {
\treturn function () use ( $hook ) {
\t\t$GLOBALS['wphx_304_03_events'][] = array(
\t\t\t'hook' => $hook,
\t\t\t'args' => wphx_304_03_meta_value( func_get_args() ),
\t\t);
\t};
}

function wphx_304_03_install_event_loggers( $hooks ) {
\tforeach ( $hooks as $hook => $accepted_args ) {
\t\tadd_action( $hook, wphx_304_03_event_logger( $hook ), 10, $accepted_args );
\t}
}

function wphx_304_03_recent_timestamp( $value ) {
\treturn is_numeric( $value ) && abs( time() - (int) $value ) <= 3;
}

function wphx_304_03_run_cases() {
\t$cases = array();

\twphx_304_03_reset_state();
\t$set_no_timeout = set_transient( 'wphx_no_timeout', array( 'alpha' => 1, 'flag' => true ), 0 );
\t$cases[]        = wphx_304_03_case(
\t\t'transient:no-expiration-autoload',
\t\t'set_transient/get_transient',
\t\tarray(
\t\t\t'set'   => $set_no_timeout,
\t\t\t'value' => get_transient( 'wphx_no_timeout' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_transient_wphx_no_timeout', '_transient_timeout_wphx_no_timeout' ) )
\t);

\twphx_304_03_reset_state();
\t$set_timed = set_transient( 'wphx_timed', 'timed-value', 60 );
\t$cases[]   = wphx_304_03_case(
\t\t'transient:expiration-timeout-pair',
\t\t'set_transient/get_transient',
\t\tarray(
\t\t\t'set'   => $set_timed,
\t\t\t'value' => get_transient( 'wphx_timed' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_transient_wphx_timed', '_transient_timeout_wphx_timed' ) )
\t);

\twphx_304_03_reset_state();
\t$expired = get_transient( 'expired_seed' );
\t$cases[] = wphx_304_03_case(
\t\t'transient:expired-read-deletes',
\t\t'get_transient',
\t\tarray(
\t\t\t'value' => $expired,
\t\t\t'after' => get_option( '_transient_expired_seed', 'deleted' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_transient_expired_seed', '_transient_timeout_expired_seed' ) )
\t);

\twphx_304_03_reset_state();
\tset_transient( 'wphx_update', 'first', 60 );
\t$updated = set_transient( 'wphx_update', 'second', 120 );
\t$cases[] = wphx_304_03_case(
\t\t'transient:update-existing-timeout',
\t\t'set_transient',
\t\tarray(
\t\t\t'updated' => $updated,
\t\t\t'value'   => get_transient( 'wphx_update' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_transient_wphx_update', '_transient_timeout_wphx_update' ) )
\t);

\twphx_304_03_reset_state();
\tset_transient( 'wphx_recreate', 'without-timeout', 0 );
\t$recreated = set_transient( 'wphx_recreate', 'with-timeout', 90 );
\t$cases[]   = wphx_304_03_case(
\t\t'transient:add-timeout-to-existing-no-timeout',
\t\t'set_transient',
\t\tarray(
\t\t\t'recreated' => $recreated,
\t\t\t'value'     => get_transient( 'wphx_recreate' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_transient_wphx_recreate', '_transient_timeout_wphx_recreate' ) )
\t);

\twphx_304_03_reset_state();
\twphx_304_03_install_event_loggers(
\t\tarray(
\t\t\t'set_transient_wphx_filter'    => 3,
\t\t\t'set_transient'                => 3,
\t\t\t'delete_transient_wphx_filter' => 1,
\t\t\t'deleted_transient'            => 1,
\t\t)
\t);
\t$filter_events = array();
\tadd_filter(
\t\t'pre_set_transient_wphx_filter',
\t\tfunction ( $value, $expiration, $transient ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'pre_set_transient_wphx_filter', 'value' => $value, 'expiration' => $expiration, 'transient' => $transient );
\t\t\t$value['filtered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'expiration_of_transient_wphx_filter',
\t\tfunction ( $expiration, $value, $transient ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'expiration_of_transient_wphx_filter', 'expiration' => $expiration, 'transient' => $transient );
\t\t\treturn 33;
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'transient_wphx_filter',
\t\tfunction ( $value, $transient ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'transient_wphx_filter', 'value' => $value, 'transient' => $transient );
\t\t\t$value['readFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t2
\t);
\tadd_filter( 'pre_transient_wphx_short', fn( $pre, $transient ) => 'short-circuited', 10, 2 );
\t$set_filtered = set_transient( 'wphx_filter', array( 'raw' => 'value' ), 10 );
\t$read_filtered = get_transient( 'wphx_filter' );
\t$short = get_transient( 'wphx_short' );
\t$deleted = delete_transient( 'wphx_filter' );
\t$cases[] = wphx_304_03_case(
\t\t'transient:filters-actions',
\t\t'set_transient/get_transient/delete_transient',
\t\tarray(
\t\t\t'set'     => $set_filtered,
\t\t\t'read'    => $read_filtered,
\t\t\t'short'   => $short,
\t\t\t'deleted' => $deleted,
\t\t),
\t\tarray(
\t\t\t'filterEvents' => wphx_304_03_meta_value( $filter_events ),
\t\t\t'actionEvents' => $GLOBALS['wphx_304_03_events'],
\t\t\t'snapshot'     => wphx_304_03_snapshot( array( '_transient_wphx_filter', '_transient_timeout_wphx_filter' ) ),
\t\t)
\t);

\twphx_304_03_reset_state();
\tdelete_expired_transients( true );
\twp_cache_flush();
\t$cases[] = wphx_304_03_case(
\t\t'transient:delete-expired-transients',
\t\t'delete_expired_transients',
\t\tarray(
\t\t\t'expiredTransient' => get_transient( 'expired_seed' ),
\t\t\t'freshTransient'   => get_transient( 'fresh_seed' ),
\t\t\t'expiredSite'      => get_site_transient( 'expired_site_seed' ),
\t\t\t'freshSite'        => get_site_transient( 'fresh_site_seed' ),
\t\t),
\t\twphx_304_03_snapshot(
\t\t\tarray(
\t\t\t\t'_transient_expired_seed',
\t\t\t\t'_transient_timeout_expired_seed',
\t\t\t\t'_transient_fresh_seed',
\t\t\t\t'_transient_timeout_fresh_seed',
\t\t\t\t'_site_transient_expired_site_seed',
\t\t\t\t'_site_transient_timeout_expired_site_seed',
\t\t\t\t'_site_transient_fresh_site_seed',
\t\t\t\t'_site_transient_timeout_fresh_site_seed',
\t\t\t)
\t\t)
\t);

\twphx_304_03_reset_state();
\t$set_site = set_site_transient( 'wphx_site', array( 'scope' => 'site' ), 45 );
\t$cases[]  = wphx_304_03_case(
\t\t'site-transient:single-site-timeout-pair',
\t\t'set_site_transient/get_site_transient',
\t\tarray(
\t\t\t'set'   => $set_site,
\t\t\t'value' => get_site_transient( 'wphx_site' ),
\t\t),
\t\twphx_304_03_snapshot( array( '_site_transient_wphx_site', '_site_transient_timeout_wphx_site' ) )
\t);

\twphx_304_03_reset_state();
\twphx_304_03_install_event_loggers(
\t\tarray(
\t\t\t'set_site_transient_wphx_site_filter'    => 3,
\t\t\t'set_site_transient'                     => 3,
\t\t\t'delete_site_transient_wphx_site_filter' => 1,
\t\t\t'deleted_site_transient'                 => 1,
\t\t)
\t);
\t$site_filter_events = array();
\tadd_filter(
\t\t'pre_set_site_transient_wphx_site_filter',
\t\tfunction ( $value, $transient ) use ( &$site_filter_events ) {
\t\t\t$site_filter_events[] = array( 'hook' => 'pre_set_site_transient_wphx_site_filter', 'value' => $value, 'transient' => $transient );
\t\t\t$value['siteFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t2
\t);
\tadd_filter(
\t\t'expiration_of_site_transient_wphx_site_filter',
\t\tfunction ( $expiration, $value, $transient ) use ( &$site_filter_events ) {
\t\t\t$site_filter_events[] = array( 'hook' => 'expiration_of_site_transient_wphx_site_filter', 'expiration' => $expiration, 'transient' => $transient );
\t\t\treturn 44;
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'site_transient_wphx_site_filter',
\t\tfunction ( $value, $transient ) use ( &$site_filter_events ) {
\t\t\t$site_filter_events[] = array( 'hook' => 'site_transient_wphx_site_filter', 'value' => $value, 'transient' => $transient );
\t\t\t$value['readFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t2
\t);
\tadd_filter( 'pre_site_transient_wphx_site_short', fn( $pre, $transient ) => 'site-short-circuited', 10, 2 );
\t$set_site_filtered = set_site_transient( 'wphx_site_filter', array( 'raw' => 'site-value' ), 10 );
\t$read_site_filtered = get_site_transient( 'wphx_site_filter' );
\t$site_short = get_site_transient( 'wphx_site_short' );
\t$deleted_site = delete_site_transient( 'wphx_site_filter' );
\t$cases[] = wphx_304_03_case(
\t\t'site-transient:filters-actions',
\t\t'set_site_transient/get_site_transient/delete_site_transient',
\t\tarray(
\t\t\t'set'     => $set_site_filtered,
\t\t\t'read'    => $read_site_filtered,
\t\t\t'short'   => $site_short,
\t\t\t'deleted' => $deleted_site,
\t\t),
\t\tarray(
\t\t\t'filterEvents' => wphx_304_03_meta_value( $site_filter_events ),
\t\t\t'actionEvents' => $GLOBALS['wphx_304_03_events'],
\t\t\t'snapshot'     => wphx_304_03_snapshot( array( '_site_transient_wphx_site_filter', '_site_transient_timeout_wphx_site_filter' ) ),
\t\t)
\t);

\twphx_304_03_reset_state();
\twp_using_ext_object_cache( true );
\t$ext_transient = set_transient( 'wphx_ext', 'external-transient', 30 );
\t$ext_site = set_site_transient( 'wphx_ext_site', 'external-site-transient', 30 );
\t$ext_deleted = delete_transient( 'wphx_ext' );
\t$cases[] = wphx_304_03_case(
\t\t'transient:external-object-cache',
\t\t'set_transient/set_site_transient',
\t\tarray(
\t\t\t'transientSet' => $ext_transient,
\t\t\t'siteSet'      => $ext_site,
\t\t\t'transientGet' => get_transient( 'wphx_ext' ),
\t\t\t'siteGet'      => get_site_transient( 'wphx_ext_site' ),
\t\t\t'deleted'      => $ext_deleted,
\t\t\t'afterDelete'  => get_transient( 'wphx_ext' ),
\t\t),
\t\twphx_304_03_snapshot(
\t\t\tarray(),
\t\t\tarray(
\t\t\t\t'transient'      => array( 'wphx_ext' ),
\t\t\t\t'site-transient' => array( 'wphx_ext_site' ),
\t\t\t)
\t\t)
\t);
\twp_using_ext_object_cache( false );

\twphx_304_03_reset_state();
\tadd_filter( 'wp_feed_cache_transient_lifetime', fn( $lifetime, $name ) => 20, 10, 2 );
\t$feed_cache = new WP_Feed_Cache_Transient( 'https://example.test/feed', 'feed-key', 'spc' );
\t$simplepie = new SimplePie\\SimplePie( array( 'title' => 'Feed Title', 'items' => array( 'one' ) ) );
\t$feed_save = $feed_cache->save( $simplepie );
\t$feed_load = $feed_cache->load();
\t$feed_mtime = $feed_cache->mtime();
\t$feed_touch = $feed_cache->touch();
\t$feed_mtime_after = $feed_cache->mtime();
\t$feed_unlink = $feed_cache->unlink();
\t$cases[] = wphx_304_03_case(
\t\t'feed-cache-transient:save-load-touch-unlink',
\t\t'WP_Feed_Cache_Transient',
\t\tarray(
\t\t\t'name'             => $feed_cache->name,
\t\t\t'modName'          => $feed_cache->mod_name,
\t\t\t'lifetime'         => $feed_cache->lifetime,
\t\t\t'save'             => $feed_save,
\t\t\t'load'             => $feed_load,
\t\t\t'mtimeRecent'      => wphx_304_03_recent_timestamp( $feed_mtime ),
\t\t\t'touch'            => $feed_touch,
\t\t\t'mtimeAfterRecent' => wphx_304_03_recent_timestamp( $feed_mtime_after ),
\t\t\t'unlink'           => $feed_unlink,
\t\t\t'afterUnlink'      => $feed_cache->load(),
\t\t),
\t\twphx_304_03_snapshot( array( '_site_transient_feed_feed-key', '_site_transient_feed_mod_feed-key' ) )
\t);

\twphx_304_03_reset_state();
\t$factory = new WP_Feed_Cache();
\t$created = $factory->create( 'https://example.test/feed', 'factory-key', 'spc' );
\t$created->save( array( 'factory' => true ) );
\t$cases[] = wphx_304_03_case(
\t\t'feed-cache:factory-create',
\t\t'WP_Feed_Cache::create',
\t\tarray(
\t\t\t'class'    => get_class( $created ),
\t\t\t'name'     => $created->name,
\t\t\t'modName'  => $created->mod_name,
\t\t\t'loaded'   => $created->load(),
\t\t\t'unlinked' => $created->unlink(),
\t\t),
\t\twphx_304_03_snapshot( array( '_site_transient_feed_factory-key', '_site_transient_feed_mod_factory-key' ) )
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredFunctionExists' => array(
\t\t'set_transient'            => function_exists( 'set_transient' ),
\t\t'get_transient'            => function_exists( 'get_transient' ),
\t\t'delete_transient'         => function_exists( 'delete_transient' ),
\t\t'delete_expired_transients' => function_exists( 'delete_expired_transients' ),
\t\t'set_site_transient'       => function_exists( 'set_site_transient' ),
\t\t'get_site_transient'       => function_exists( 'get_site_transient' ),
\t\t'delete_site_transient'    => function_exists( 'delete_site_transient' ),
\t\t'WP_Feed_Cache_Transient'  => class_exists( 'WP_Feed_Cache_Transient' ),
\t\t'WP_Feed_Cache'            => class_exists( 'WP_Feed_Cache' ),
\t),
\t'cases'                 => wphx_304_03_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    coveredFunctionExists: result.coveredFunctionExists,
    cases: result.cases
  };
}

function runProbe(commandPath, runtimeId, mode, root, simplepieStub) {
  const output = command(commandPath, [PROBE, mode, root, simplepieStub]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `${commandPath} ${PROBE} ${mode} ${root} ${simplepieStub}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(runtimeId, image, mode, root) {
  const dockerRoot = `/work/${root}`;
  const dockerSimplePieStub = `/work/${SIMPLEPIE_STUB}`;
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, dockerRoot, dockerSimplePieStub]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${dockerRoot} ${dockerSimplePieStub}`,
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-304-transients`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/transient-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "transient/site-transient/feed-cache differential fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 transient, site transient, expiration, delete cleanup, external object-cache, and feed-cache transient behavior stay observable while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-transient-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-304-transients",
        "npm run wp:core:wphx-304-transients:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-304-03-transient-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-304.03. The probe uses constrained option-table behavior for transient storage and SimplePie stubs for the feed-cache bridge; real wpdb SQL/storage parity remains WPHX-305 and broader persistent object-cache drop-in coverage remains WPHX-304.04."
  };
}

const lock = readJson("toolchain.lock.json");
const surface = readJson(SURFACE);
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeSimplePieStub();
writeProbe();

const runs = [];
const comparisons = [];
const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_ROOT, SIMPLEPIE_STUB);
const localCandidate = runProbe("php", "local-php-cli", "candidate", CANDIDATE_ROOT, SIMPLEPIE_STUB);
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
  schema: "wphx.wp-core-transient-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-transient-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "transients")?.label ?? "transients/site transients/feed cache",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "wpdb-option-table-test-double",
        reason:
          "The probe supplies deterministic options-table behavior for transient value/timeout rows and expired cleanup. Full query preparation, SQL execution, DB errors, and storage-engine behavior remain WPHX-305."
      },
      {
        id: "single-site-site-transient-path",
        reason:
          "Site transients are exercised through the non-multisite site-option wrappers that fall back to the options table; multisite sitemeta parity remains a later multisite/storage slice."
      },
      {
        id: "object-cache-runtime",
        reason:
          "External object-cache transient paths use WordPress's native WP_Object_Cache runtime and public wp_cache_* functions until WPHX-304.04 expands runtime/drop-in coverage."
      },
      {
        id: "plugin-filter-hooks",
        reason:
          "Transient and site-transient pre-set, expiration, read, set, and delete hooks must remain native PHP callbacks with WordPress-compatible argument ordering."
      },
      {
        id: "simplepie-feed-cache-stub",
        reason:
          "The probe stubs the SimplePie interface/class surface only enough to exercise WordPress's transient-backed feed-cache bridge; full feed parsing is outside this storage/cache slice."
      },
      {
        id: "php-time-boundary",
        reason:
          "Timeout rows and feed cache mtimes use PHP time(); receipt snapshots normalize absolute timestamps to expired/future/recent markers for deterministic evidence."
      }
    ],
    follow_up_owner: "WPHX-304.07"
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
      owner: "WPHX-304.07",
      detail: "The candidate side is a copied WordPress oracle source tree until selected pure transient/cache helpers move to Haxe parity candidates."
    },
    {
      id: "real-wpdb-not-yet-ported",
      owner: "WPHX-305",
      detail: "This fixture constrains wpdb to deterministic option-table behavior. Full wpdb query preparation, cleanup SQL, DB errors, result objects, and storage parity are a separate WPHX-305 domain."
    },
    {
      id: "persistent-object-cache-dropin-expanded-later",
      owner: "WPHX-304.04",
      detail: "This fixture covers the public external-object-cache transient branch using WP_Object_Cache. Persistent drop-in compatibility and cache feature shims remain WPHX-304.04."
    },
    {
      id: "multisite-sitemeta-path-deferred",
      owner: "WPHX-317/WPHX-304",
      detail: "Site transient multisite sitemeta behavior is not fully claimed by this single-site fixture."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-304",
      detail: "This fixture covers seed traces. Full upstream transient PHPUnit parity remains a domain-level closure requirement."
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
  id: "receipt:wphx-304-03-transient-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "transient/site-transient/feed-cache differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-transient-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-304-transients",
    "npm run wp:core:wphx-304-transients:check",
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
