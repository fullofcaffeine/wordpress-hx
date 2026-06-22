#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.11.1",
  external_ref: "WPHX-317.02",
  title: "Build site/network option and site-transient differential fixtures"
};
const OUT_ROOT = "build/wp-core/wphx-317-02";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-317-02-multisite-options-transients-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-317-02-multisite-options-transients-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-317-02-multisite-options-transients-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-317-01-multisite-network-surface.v1.json";
const OPTION_FIXTURE = "manifests/wp-core/wphx-304-02-option-storage-fixture.v1.json";
const TRANSIENT_FIXTURE = "manifests/wp-core/wphx-304-03-transient-fixture.v1.json";
const WPDB_SCHEMA_FIXTURE = "manifests/wp-core/wphx-305-06-wpdb-schema-option-integration-fixture.v1.json";
const RECORDED_AT = "2026-06-22T21:39:49.000Z";
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
  "src/wp-includes/kses.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/class-wp-network.php",
  "src/wp-includes/ms-network.php",
  "src/wp-includes/option.php"
];

const COVERED_SYMBOLS = [
  "wp_prime_site_option_caches",
  "wp_prime_network_option_caches",
  "wp_load_core_site_options",
  "get_site_option",
  "add_site_option",
  "delete_site_option",
  "update_site_option",
  "get_network_option",
  "add_network_option",
  "delete_network_option",
  "update_network_option",
  "delete_site_transient",
  "get_site_transient",
  "set_site_transient"
];

const FIXTURE_CASES = [
  { id: "network-option:get-cache-default", symbol: "get_network_option", focus: "sitemeta read, unserialize, site-options cache key, missing-option default, and notoptions cache" },
  { id: "network-option:add-update-delete-current", symbol: "add_site_option/update_site_option/delete_site_option", focus: "current-network wrappers, insert/update/delete sitemeta rows, cache updates, and notoptions mutation" },
  { id: "network-option:prime-core", symbol: "wp_prime_network_option_caches/wp_load_core_site_options", focus: "batched sitemeta query, cache priming, missing option notoptions, and core network option seed list" },
  { id: "network-option:filters-actions", symbol: "get_network_option/update_network_option/add_network_option/delete_network_option", focus: "pre/default/read filters plus add/update/delete action argument order" },
  { id: "network-option:invalid-network", symbol: "get_network_option/add_network_option/update_network_option/delete_network_option", focus: "non-numeric network IDs fail closed without touching storage" },
  { id: "site-transient:multisite-timeout-pair", symbol: "set_site_transient/get_site_transient", focus: "multisite site transient value and timeout stored as network options in sitemeta" },
  { id: "site-transient:expired-read-deletes", symbol: "get_site_transient/delete_site_option", focus: "expired timeout deletes value and timeout sitemeta rows and returns false" },
  { id: "site-transient:filters-actions", symbol: "set_site_transient/get_site_transient/delete_site_transient", focus: "site transient pre-set, expiration, read, short-circuit, set, and delete hooks" },
  { id: "site-transient:external-object-cache", symbol: "set_site_transient/get_site_transient/delete_site_transient", focus: "external object-cache path uses site-transient group without sitemeta writes" }
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

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );
define( 'MULTISITE', true );
define( 'DOMAIN_CURRENT_SITE', 'network.example.test' );
define( 'PATH_CURRENT_SITE', '/' );
define( 'SITE_ID_CURRENT_SITE', 7 );
define( 'BLOG_ID_CURRENT_SITE', 1 );

class WPHX_317_02_Fake_WPDB {
\tpublic $sitemeta = 'wp_sitemeta';
\tpublic $site = 'wp_site';
\tpublic $options = 'wp_options';
\tpublic $last_error = '';
\tpublic $queries = array();
\tprivate $rows = array();
\tprivate $next_meta_id = 1000;

\tpublic function __construct() {
\t\t$this->reset();
\t}

\tpublic function reset() {
\t\t$now = time();
\t\t$this->queries      = array();
\t\t$this->next_meta_id = 1000;
\t\t$this->rows         = array();
\t\t$this->seed( 7, 'wphx_existing', serialize( array( 'network' => 7, 'flag' => true ) ) );
\t\t$this->seed( 7, 'wphx_delete_me', 'delete-me' );
\t\t$this->seed( 7, 'site_name', 'Network Example' );
\t\t$this->seed( 7, 'siteurl', 'https://network.example.test/' );
\t\t$this->seed( 7, '_site_transient_expired_seed', 'expired-value' );
\t\t$this->seed( 7, '_site_transient_timeout_expired_seed', (string) ( $now - 60 ) );
\t\t$this->seed( 7, '_site_transient_fresh_seed', 'fresh-value' );
\t\t$this->seed( 7, '_site_transient_timeout_fresh_seed', (string) ( $now + 3600 ) );
\t\t$this->seed( 9, 'wphx_existing', 'other-network' );
\t}

\tprivate function seed( $site_id, $key, $value ) {
\t\t$this->rows[ $this->row_key( $site_id, $key ) ] = array(
\t\t\t'meta_id'    => $this->next_meta_id++,
\t\t\t'site_id'    => (int) $site_id,
\t\t\t'meta_key'   => $key,
\t\t\t'meta_value' => $value,
\t\t);
\t}

\tprivate function row_key( $site_id, $key ) {
\t\treturn (int) $site_id . ':' . $key;
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

\tpublic function suppress_errors( $suppress = null ) {
\t\treturn false;
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
\t\tif ( is_string( $value ) && ctype_digit( $value ) && (int) $value > 1000000000 ) {
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

\tprivate function row_object( $row, $columns ) {
\t\tif ( null === $row ) {
\t\t\treturn null;
\t\t}
\t\t$object = new stdClass();
\t\tforeach ( $columns as $column ) {
\t\t\t$object->{$column} = $row[ $column ];
\t\t}
\t\treturn $object;
\t}

\tpublic function get_row( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_row', $sql, $args );

\t\tif ( false !== strpos( $sql, 'FROM ' . $this->site . ' ' ) ) {
\t\t\t$network_id = (int) ( $args[0] ?? 7 );
\t\t\tif ( 7 !== $network_id ) {
\t\t\t\treturn null;
\t\t\t}
\t\t\treturn (object) array(
\t\t\t\t'id'            => '7',
\t\t\t\t'domain'        => 'network.example.test',
\t\t\t\t'path'          => '/',
\t\t\t\t'blog_id'       => '1',
\t\t\t\t'cookie_domain' => 'network.example.test',
\t\t\t\t'site_name'     => 'Network Example',
\t\t\t);
\t\t}

\t\t$option = $args[0] ?? null;
\t\t$site_id = (int) ( $args[1] ?? 0 );
\t\t$row = $this->rows[ $this->row_key( $site_id, $option ) ] ?? null;
\t\tif ( false !== strpos( $sql, 'SELECT meta_id' ) ) {
\t\t\treturn $this->row_object( $row, array( 'meta_id' ) );
\t\t}
\t\treturn $this->row_object( $row, array( 'meta_value' ) );
\t}

\tpublic function get_results( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_results', $sql, $args );
\t\tif ( false === strpos( $sql, $this->sitemeta ) ) {
\t\t\treturn array();
\t\t}
\t\t$site_id = (int) end( $args );
\t\t$options = array_slice( $args, 0, -1 );
\t\t$results = array();
\t\tforeach ( $options as $option ) {
\t\t\t$row = $this->rows[ $this->row_key( $site_id, $option ) ] ?? null;
\t\t\tif ( null !== $row ) {
\t\t\t\t$results[] = $this->row_object( $row, array( 'meta_key', 'meta_value' ) );
\t\t\t}
\t\t}
\t\treturn $results;
\t}

\tpublic function insert( $table, $data ) {
\t\t$this->record( 'insert', $table, array( 'data' => $data ) );
\t\t$key = $this->row_key( $data['site_id'] ?? 0, $data['meta_key'] ?? '' );
\t\tif ( isset( $this->rows[ $key ] ) ) {
\t\t\treturn false;
\t\t}
\t\t$this->rows[ $key ] = array(
\t\t\t'meta_id'    => $this->next_meta_id++,
\t\t\t'site_id'    => (int) $data['site_id'],
\t\t\t'meta_key'   => $data['meta_key'],
\t\t\t'meta_value' => $data['meta_value'],
\t\t);
\t\treturn 1;
\t}

\tpublic function update( $table, $data, $where ) {
\t\t$this->record( 'update', $table, array( 'data' => $data, 'where' => $where ) );
\t\t$key = $this->row_key( $where['site_id'] ?? 0, $where['meta_key'] ?? '' );
\t\tif ( ! isset( $this->rows[ $key ] ) ) {
\t\t\treturn 0;
\t\t}
\t\tforeach ( $data as $column => $value ) {
\t\t\t$this->rows[ $key ][ $column ] = $value;
\t\t}
\t\treturn 1;
\t}

\tpublic function delete( $table, $where ) {
\t\t$this->record( 'delete', $table, array( 'where' => $where ) );
\t\t$key = $this->row_key( $where['site_id'] ?? 0, $where['meta_key'] ?? '' );
\t\tif ( ! isset( $this->rows[ $key ] ) ) {
\t\t\treturn 0;
\t\t}
\t\tunset( $this->rows[ $key ] );
\t\treturn 1;
\t}

\tpublic function snapshot() {
\t\t$result = array();
\t\tforeach ( $this->rows as $key => $row ) {
\t\t\t$result[ $key ] = array(
\t\t\t\t'meta_id'    => $row['meta_id'],
\t\t\t\t'site_id'    => $row['site_id'],
\t\t\t\t'meta_key'   => $row['meta_key'],
\t\t\t\t'meta_value' => $this->normalize_arg( $row['meta_value'] ),
\t\t\t);
\t\t}
\t\tksort( $result );
\t\treturn $result;
\t}
}

function wphx_317_02_bootstrap() {
\tglobal $wpdb, $current_site, $blog_id;

\t$wpdb = new WPHX_317_02_Fake_WPDB();
\t$blog_id = 1;

\trequire_once ABSPATH . WPINC . '/compat.php';
\trequire_once ABSPATH . WPINC . '/utf8.php';
\trequire_once ABSPATH . WPINC . '/load.php';
\trequire_once ABSPATH . WPINC . '/plugin.php';
\trequire_once ABSPATH . WPINC . '/cache.php';
\trequire_once ABSPATH . WPINC . '/functions.php';
\trequire_once ABSPATH . WPINC . '/kses.php';
\trequire_once ABSPATH . WPINC . '/formatting.php';
\trequire_once ABSPATH . WPINC . '/class-wp-network.php';
\trequire_once ABSPATH . WPINC . '/ms-network.php';
\trequire_once ABSPATH . WPINC . '/option.php';

\t$current_site = new WP_Network(
\t\t(object) array(
\t\t\t'id'            => 7,
\t\t\t'domain'        => 'network.example.test',
\t\t\t'path'          => '/',
\t\t\t'blog_id'       => 1,
\t\t\t'cookie_domain' => 'network.example.test',
\t\t\t'site_name'     => 'Network Example',
\t\t)
\t);
}

wphx_317_02_bootstrap();
wp_cache_init();

function wphx_317_02_meta_value( $value ) {
\tif ( is_int( $value ) && $value > 1000000000 ) {
\t\treturn '__timestamp__';
\t}
\tif ( is_string( $value ) && ctype_digit( $value ) && (int) $value > 1000000000 ) {
\t\treturn '__timestamp__';
\t}
\tif ( is_array( $value ) ) {
\t\t$normalized = array();
\t\tforeach ( $value as $key => $entry ) {
\t\t\t$normalized[ $key ] = wphx_317_02_meta_value( $entry );
\t\t}
\t\treturn $normalized;
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_317_02_meta_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn $value;
}

function wphx_317_02_scalar( $value ) {
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

function wphx_317_02_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_317_02_scalar( $key ),
\t\t\t\t'value' => wphx_317_02_value( $entry_value ),
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
\t\t\t'properties' => wphx_317_02_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_317_02_scalar( $value );
}

function wphx_317_02_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_317_02_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_317_02_cache_pick( $group, $keys ) {
\t$result = array();
\tforeach ( $keys as $key ) {
\t\t$result[ $key ] = wphx_317_02_meta_value( wp_cache_get( $key, $group ) );
\t}
\treturn $result;
}

function wphx_317_02_snapshot( $site_option_keys = array(), $site_transient_keys = array() ) {
\tglobal $wpdb;
\t$site_options = array();
\tforeach ( $site_option_keys as $network_id => $keys ) {
\t\t$cache_keys = array();
\t\tforeach ( $keys as $key ) {
\t\t\t$cache_keys[] = $network_id . ':' . $key;
\t\t}
\t\t$cache_keys[] = $network_id . ':notoptions';
\t\t$site_options[ $network_id ] = wphx_317_02_cache_pick( 'site-options', $cache_keys );
\t}
\treturn array(
\t\t'db'             => $wpdb->snapshot(),
\t\t'siteOptions'    => $site_options,
\t\t'siteTransients' => wphx_317_02_cache_pick( 'site-transient', $site_transient_keys ),
\t\t'queryCount'     => count( $wpdb->queries ),
\t\t'queryTail'      => array_slice( $wpdb->queries, -10 ),
\t);
}

function wphx_317_02_reset_state() {
\tglobal $wpdb, $wp_filter, $_wp_using_ext_object_cache;
\t$wpdb->reset();
\twp_cache_flush();
\t$wp_filter = array();
\t$_wp_using_ext_object_cache = false;
\t$GLOBALS['wphx_317_02_events'] = array();
}

function wphx_317_02_event_logger( $hook ) {
\treturn function () use ( $hook ) {
\t\t$GLOBALS['wphx_317_02_events'][] = array(
\t\t\t'hook' => $hook,
\t\t\t'args' => wphx_317_02_meta_value( func_get_args() ),
\t\t);
\t};
}

function wphx_317_02_install_event_loggers( $hooks ) {
\tforeach ( $hooks as $hook => $accepted_args ) {
\t\tadd_action( $hook, wphx_317_02_event_logger( $hook ), 10, $accepted_args );
\t}
}

function wphx_317_02_run_cases() {
\t$cases = array();

\twphx_317_02_reset_state();
\t$first = get_network_option( 7, 'wphx_existing', 'missing' );
\t$missing = get_network_option( 7, 'wphx_missing', 'fallback' );
\t$second_missing = get_network_option( 7, 'wphx_missing', 'second-fallback' );
\t$cases[] = wphx_317_02_case(
\t\t'network-option:get-cache-default',
\t\t'get_network_option',
\t\tarray(
\t\t\t'first'         => $first,
\t\t\t'missing'       => $missing,
\t\t\t'secondMissing' => $second_missing,
\t\t),
\t\twphx_317_02_snapshot( array( 7 => array( 'wphx_existing', 'wphx_missing' ) ) )
\t);

\twphx_317_02_reset_state();
\twphx_317_02_install_event_loggers(
\t\tarray(
\t\t\t'add_site_option_wphx_added'       => 3,
\t\t\t'add_site_option'                  => 3,
\t\t\t'update_site_option_wphx_existing' => 4,
\t\t\t'update_site_option'               => 4,
\t\t\t'pre_delete_site_option_wphx_delete_me' => 2,
\t\t\t'delete_site_option_wphx_delete_me'     => 2,
\t\t\t'delete_site_option'                    => 2,
\t\t)
\t);
\t$added = add_site_option( 'wphx_added', array( 'new' => true ) );
\t$updated = update_site_option( 'wphx_existing', array( 'network' => 7, 'changed' => true ) );
\t$deleted = delete_site_option( 'wphx_delete_me' );
\t$cases[] = wphx_317_02_case(
\t\t'network-option:add-update-delete-current',
\t\t'add_site_option/update_site_option/delete_site_option',
\t\tarray(
\t\t\t'added'       => $added,
\t\t\t'addedValue'  => get_site_option( 'wphx_added' ),
\t\t\t'updated'     => $updated,
\t\t\t'updatedValue' => get_site_option( 'wphx_existing' ),
\t\t\t'deleted'     => $deleted,
\t\t\t'afterDelete' => get_site_option( 'wphx_delete_me', 'after-delete' ),
\t\t),
\t\tarray(
\t\t\t'events'   => $GLOBALS['wphx_317_02_events'],
\t\t\t'snapshot' => wphx_317_02_snapshot( array( 7 => array( 'wphx_added', 'wphx_existing', 'wphx_delete_me' ) ) ),
\t\t)
\t);

\twphx_317_02_reset_state();
\twp_prime_network_option_caches( 7, array( 'wphx_existing', 'wphx_missing_prime', 'site_name' ) );
\twp_load_core_site_options( 7 );
\t$cases[] = wphx_317_02_case(
\t\t'network-option:prime-core',
\t\t'wp_prime_network_option_caches/wp_load_core_site_options',
\t\tarray(
\t\t\t'existing' => get_network_option( 7, 'wphx_existing' ),
\t\t\t'missing'  => get_network_option( 7, 'wphx_missing_prime', 'missing-default' ),
\t\t\t'siteName' => get_site_option( 'site_name' ),
\t\t),
\t\twphx_317_02_snapshot( array( 7 => array( 'wphx_existing', 'wphx_missing_prime', 'site_name', 'siteurl', 'active_sitewide_plugins' ) ) )
\t);

\twphx_317_02_reset_state();
\t$filter_events = array();
\twphx_317_02_install_event_loggers(
\t\tarray(
\t\t\t'add_site_option_wphx_action_added' => 3,
\t\t\t'update_site_option_wphx_action_update' => 4,
\t\t\t'delete_site_option_wphx_action_delete' => 2,
\t\t)
\t);
\tadd_filter(
\t\t'pre_site_option_wphx_pre',
\t\tfunction ( $pre, $option, $network_id, $default_value ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'pre_site_option_wphx_pre', 'option' => $option, 'network' => $network_id, 'default' => $default_value );
\t\t\treturn 'pre-short';
\t\t},
\t\t10,
\t\t4
\t);
\tadd_filter(
\t\t'default_site_option_wphx_default',
\t\tfunction ( $default_value, $option, $network_id ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'default_site_option_wphx_default', 'option' => $option, 'network' => $network_id );
\t\t\treturn 'default-filtered';
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'site_option_wphx_existing',
\t\tfunction ( $value, $option, $network_id ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'site_option_wphx_existing', 'option' => $option, 'network' => $network_id );
\t\t\t$value['readFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'pre_add_site_option_wphx_action_added',
\t\tfunction ( $value, $option, $network_id ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'pre_add_site_option_wphx_action_added', 'option' => $option, 'network' => $network_id );
\t\t\t$value['addFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t3
\t);
\tadd_filter(
\t\t'pre_update_site_option_wphx_action_update',
\t\tfunction ( $value, $old_value, $option, $network_id ) use ( &$filter_events ) {
\t\t\t$filter_events[] = array( 'hook' => 'pre_update_site_option_wphx_action_update', 'old' => $old_value, 'option' => $option, 'network' => $network_id );
\t\t\t$value['updateFiltered'] = true;
\t\t\treturn $value;
\t\t},
\t\t10,
\t\t4
\t);
\tadd_network_option( 7, 'wphx_action_update', array( 'old' => true ) );
\tadd_network_option( 7, 'wphx_action_delete', 'delete-me' );
\t$cases[] = wphx_317_02_case(
\t\t'network-option:filters-actions',
\t\t'get_network_option/update_network_option/add_network_option/delete_network_option',
\t\tarray(
\t\t\t'pre'          => get_network_option( 7, 'wphx_pre', 'unused' ),
\t\t\t'default'      => get_network_option( 7, 'wphx_default', 'raw-default' ),
\t\t\t'readFiltered' => get_network_option( 7, 'wphx_existing' ),
\t\t\t'added'        => add_network_option( 7, 'wphx_action_added', array( 'raw' => true ) ),
\t\t\t'updated'      => update_network_option( 7, 'wphx_action_update', array( 'new' => true ) ),
\t\t\t'deleted'      => delete_network_option( 7, 'wphx_action_delete' ),
\t\t),
\t\tarray(
\t\t\t'filterEvents' => wphx_317_02_meta_value( $filter_events ),
\t\t\t'actionEvents' => $GLOBALS['wphx_317_02_events'],
\t\t\t'snapshot'     => wphx_317_02_snapshot( array( 7 => array( 'wphx_action_added', 'wphx_action_update', 'wphx_action_delete' ) ) ),
\t\t)
\t);

\twphx_317_02_reset_state();
\t$cases[] = wphx_317_02_case(
\t\t'network-option:invalid-network',
\t\t'get_network_option/add_network_option/update_network_option/delete_network_option',
\t\tarray(
\t\t\t'get'    => get_network_option( 'bad-network', 'wphx_existing', 'fallback' ),
\t\t\t'add'    => add_network_option( 'bad-network', 'wphx_bad', 'value' ),
\t\t\t'update' => update_network_option( 'bad-network', 'wphx_existing', 'value' ),
\t\t\t'delete' => delete_network_option( 'bad-network', 'wphx_existing' ),
\t\t),
\t\twphx_317_02_snapshot( array( 7 => array( 'wphx_existing', 'wphx_bad' ) ) )
\t);

\twphx_317_02_reset_state();
\t$set_site = set_site_transient( 'wphx_ms_site', array( 'scope' => 'network' ), 45 );
\t$cases[] = wphx_317_02_case(
\t\t'site-transient:multisite-timeout-pair',
\t\t'set_site_transient/get_site_transient',
\t\tarray(
\t\t\t'set'   => $set_site,
\t\t\t'value' => get_site_transient( 'wphx_ms_site' ),
\t\t),
\t\twphx_317_02_snapshot( array( 7 => array( '_site_transient_wphx_ms_site', '_site_transient_timeout_wphx_ms_site' ) ) )
\t);

\twphx_317_02_reset_state();
\t$expired = get_site_transient( 'expired_seed' );
\t$cases[] = wphx_317_02_case(
\t\t'site-transient:expired-read-deletes',
\t\t'get_site_transient/delete_site_option',
\t\tarray(
\t\t\t'expired' => $expired,
\t\t\t'fresh'   => get_site_transient( 'fresh_seed' ),
\t\t\t'after'   => get_site_option( '_site_transient_expired_seed', 'deleted' ),
\t\t),
\t\twphx_317_02_snapshot( array( 7 => array( '_site_transient_expired_seed', '_site_transient_timeout_expired_seed', '_site_transient_fresh_seed', '_site_transient_timeout_fresh_seed' ) ) )
\t);

\twphx_317_02_reset_state();
\twphx_317_02_install_event_loggers(
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
\t$cases[] = wphx_317_02_case(
\t\t'site-transient:filters-actions',
\t\t'set_site_transient/get_site_transient/delete_site_transient',
\t\tarray(
\t\t\t'set'     => $set_site_filtered,
\t\t\t'read'    => $read_site_filtered,
\t\t\t'short'   => $site_short,
\t\t\t'deleted' => $deleted_site,
\t\t),
\t\tarray(
\t\t\t'filterEvents' => wphx_317_02_meta_value( $site_filter_events ),
\t\t\t'actionEvents' => $GLOBALS['wphx_317_02_events'],
\t\t\t'snapshot'     => wphx_317_02_snapshot( array( 7 => array( '_site_transient_wphx_site_filter', '_site_transient_timeout_wphx_site_filter' ) ) ),
\t\t)
\t);

\twphx_317_02_reset_state();
\twp_using_ext_object_cache( true );
\t$ext_site = set_site_transient( 'wphx_ext_site', 'external-site-transient', 30 );
\t$ext_deleted = delete_site_transient( 'wphx_ext_site' );
\t$cases[] = wphx_317_02_case(
\t\t'site-transient:external-object-cache',
\t\t'set_site_transient/get_site_transient/delete_site_transient',
\t\tarray(
\t\t\t'siteSet'     => $ext_site,
\t\t\t'siteGet'     => get_site_transient( 'wphx_ext_site' ),
\t\t\t'deleted'     => $ext_deleted,
\t\t\t'afterDelete' => get_site_transient( 'wphx_ext_site' ),
\t\t),
\t\twphx_317_02_snapshot( array(), array( 'wphx_ext_site' ) )
\t);
\twp_using_ext_object_cache( false );

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'multisite'             => is_multisite(),
\t'currentNetworkId'      => get_current_network_id(),
\t'coveredFunctionExists' => array(
\t\t'wp_prime_site_option_caches'    => function_exists( 'wp_prime_site_option_caches' ),
\t\t'wp_prime_network_option_caches' => function_exists( 'wp_prime_network_option_caches' ),
\t\t'wp_load_core_site_options'      => function_exists( 'wp_load_core_site_options' ),
\t\t'get_site_option'                => function_exists( 'get_site_option' ),
\t\t'add_site_option'                => function_exists( 'add_site_option' ),
\t\t'delete_site_option'             => function_exists( 'delete_site_option' ),
\t\t'update_site_option'             => function_exists( 'update_site_option' ),
\t\t'get_network_option'             => function_exists( 'get_network_option' ),
\t\t'add_network_option'             => function_exists( 'add_network_option' ),
\t\t'delete_network_option'          => function_exists( 'delete_network_option' ),
\t\t'update_network_option'          => function_exists( 'update_network_option' ),
\t\t'delete_site_transient'          => function_exists( 'delete_site_transient' ),
\t\t'get_site_transient'             => function_exists( 'get_site_transient' ),
\t\t'set_site_transient'             => function_exists( 'set_site_transient' ),
\t),
\t'cases'                 => wphx_317_02_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    multisite: result.multisite,
    currentNetworkId: result.currentNetworkId,
    coveredFunctionExists: result.coveredFunctionExists,
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-317-multisite-options-transients`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/multisite-options-transients-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "multisite site/network option and site-transient differential fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 multisite site/network option and site-transient behavior remains observable while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-multisite-options-transients-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-317-multisite-options-transients",
        "npm run wp:core:wphx-317-multisite-options-transients:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-317-02-multisite-options-transients-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-317.02. The probe enables multisite and supplies deterministic sitemeta behavior through a constrained wpdb test double; full SQL/storage parity remains WPHX-305, and first Haxe-owned multisite helpers are deferred to WPHX-317.07."
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
  schema: "wphx.wp-core-multisite-options-transients-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-multisite-options-transients-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    option_storage_fixture: inputRecord(OPTION_FIXTURE),
    transient_fixture: inputRecord(TRANSIENT_FIXTURE),
    wpdb_schema_option_fixture: inputRecord(WPDB_SCHEMA_FIXTURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domains: [
      surface.domains.find((domain) => domain.id === "site_network_options")?.label ?? "site/network options",
      surface.domains.find((domain) => domain.id === "site_transients")?.label ?? "site transients"
    ],
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "wpdb-sitemeta-test-double",
        reason:
          "The probe supplies deterministic sitemeta behavior for network option rows. Full SQL preparation, table-prefix behavior, storage engines, and database errors remain WPHX-305."
      },
      {
        id: "wordpress-object-cache-runtime",
        reason:
          "site-options and site-transient cache groups use WordPress's native WP_Object_Cache runtime and public wp_cache_* APIs."
      },
      {
        id: "multisite-current-network-bootstrap",
        reason:
          "The probe enables MULTISITE and loads WP_Network/ms-network.php so get_current_network_id() reaches the real current-network path without a full installed distribution."
      },
      {
        id: "plugin-filter-hooks",
        reason:
          "site option and site transient hooks remain native PHP callbacks with WordPress-compatible dynamic hook names and argument ordering."
      },
      {
        id: "php-time-boundary",
        reason:
          "Site transient timeout rows use PHP time(); snapshots normalize absolute timestamps to deterministic markers."
      }
    ],
    follow_up_owner: "WPHX-317.07"
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
      owner: "WPHX-317.07",
      detail: "The candidate side is a copied WordPress oracle source tree until selected multisite option/transient helpers move to Haxe parity candidates."
    },
    {
      id: "real-wpdb-and-live-db-not-yet-used",
      owner: "WPHX-305/WPHX-317",
      detail: "This fixture constrains wpdb to deterministic sitemeta behavior. Live database multisite storage remains a later integration gate."
    },
    {
      id: "site-meta-api-not-yet-covered",
      owner: "WPHX-317.04",
      detail: "This slice covers network options stored in sitemeta via option.php; generic site meta APIs and WP_Site object/query behavior remain separate WPHX-317 work."
    },
    {
      id: "installed-multisite-bootstrap-not-yet-covered",
      owner: "WPHX-317.05",
      detail: "The probe loads the needed current-network path but does not claim full installed multisite routing/bootstrap parity."
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
  id: "receipt:wphx-317-02-multisite-options-transients-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "multisite site/network option and site-transient differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-multisite-options-transients-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-317-multisite-options-transients",
    "npm run wp:core:wphx-317-multisite-options-transients:check",
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
