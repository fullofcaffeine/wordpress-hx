#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ze7",
  external_ref: "WPHX-307.07",
  title: "Add WP_Query live DB SQL/result fixture"
};
const OUT_ROOT = "build/wp-core/wphx-307-07";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-307-07-wp-query-live-db-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-307-07-wp-query-live-db-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-307-07-wp-query-live-db-fixture.v1.json";
const RUNTIME_FIXTURE = "manifests/wp-core/wphx-307-06-wp-query-runtime-fixture.v1.json";
const PHP_DB_CLIENT_IMAGES = "manifests/toolchain/wphx-305-09-php-db-client-images.v1.json";
const RECORDED_AT = "2026-06-23T22:25:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const DB_USER = "root";
const DB_PASSWORD = "wordpresshx-live-password";
const ORACLE_DB = "wordpresshx_wpquery_oracle";
const CANDIDATE_DB = "wordpresshx_wpquery_candidate";
const RUNNER = "tools/wp-core/run-wp-query-live-db-fixture.mjs";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wpdb.php",
  "src/wp-includes/class-wp-meta-query.php",
  "src/wp-includes/class-wp-tax-query.php",
  "src/wp-includes/class-wp-query.php"
];

const COVERED_SYMBOLS = [
  "WP_Query::query",
  "WP_Query::get_posts",
  "WP_Query::parse_search",
  "WP_Query::parse_orderby",
  "WP_Query::set_found_posts",
  "WP_Meta_Query::get_sql",
  "WP_Tax_Query::get_sql",
  "wpdb::__construct",
  "wpdb::query",
  "wpdb::get_col",
  "wpdb::get_results",
  "wpdb::prepare"
];

const FIXTURE_CASES = [
  { id: "live-query:published-default", focus: "published post query, default date ordering, LIMIT, and ID result materialization" },
  { id: "live-query:post-in-order", focus: "post__in filtering and FIELD() order preservation" },
  { id: "live-query:search-title-content", focus: "search SQL over title/content/excerpt and result ordering" },
  { id: "live-query:meta-key-value", focus: "WP_Meta_Query join/where generation against wp_postmeta" },
  { id: "live-query:category-taxonomy", focus: "WP_Tax_Query join/where generation against term relationship tables" }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 80
  }).trim();
}

function maybeCommand(commandName, commandArgs, options = {}) {
  try {
    return command(commandName, commandArgs, options);
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

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );
$db_host = $argv[3];
$db_port = (int) $argv[4];
$db_user = $argv[5];
$db_password = $argv[6];
$db_name = $argv[7];
$runtime_id = $argv[8];

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );
mysqli_report( MYSQLI_REPORT_OFF );

$GLOBALS['wphx_307_07_actions'] = array();
$GLOBALS['wphx_307_07_filters'] = array();
$GLOBALS['wphx_307_07_php_errors'] = array();
$GLOBALS['wp_filter'] = array();

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_307_07_php_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

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
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', 'utf8mb4_unicode_ci' );

function wp_load_translations_early() {}
function __( $text ) { return $text; }
function _x( $text, $context, $domain = 'default' ) { return $text; }
function _doing_it_wrong( $function_name, $message, $version ) {}
function wp_die( $message = '', $title = '', $args = array() ) { throw new RuntimeException( wp_strip_all_tags( (string) $message ) ); }
function wp_strip_all_tags( $text ) { return strip_tags( (string) $text ); }
function wp_debug_backtrace_summary( $ignore_class = null, $skip_frames = 0, $pretty = true ) { return 'wphx-307-07-backtrace'; }
function has_filter( $hook_name, $callback = false ) {
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn false;
\t}
\tif ( false === $callback ) {
\t\treturn true;
\t}
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $priority => $callbacks ) {
\t\tforeach ( $callbacks as $registered ) {
\t\t\tif ( $registered['callback'] === $callback ) {
\t\t\t\treturn $priority;
\t\t\t}
\t\t}
\t}
\treturn false;
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array(
\t\t'callback' => $callback,
\t\t'accepted_args' => $accepted_args,
\t);
\t$GLOBALS['wphx_307_07_filters'][] = array( 'hook' => $hook_name, 'registered' => true, 'priority' => $priority, 'accepted_args' => $accepted_args );
\treturn true;
}
function remove_filter( $hook_name, $callback, $priority = 10 ) {
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ][ $priority ] ) ) {
\t\treturn false;
\t}
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ] = array_values(
\t\tarray_filter(
\t\t\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ],
\t\t\tfn( $registered ) => $registered['callback'] !== $callback
\t\t)
\t);
\treturn true;
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_307_07_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( ! empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\t\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\t\tforeach ( $callbacks as $registered ) {
\t\t\t\t$callback_args = array_slice( array_merge( array( $value ), $args ), 0, $registered['accepted_args'] );
\t\t\t\tif ( is_callable( $registered['callback'] ) ) {
\t\t\t\t\t$value = call_user_func_array( $registered['callback'], $callback_args );
\t\t\t\t}
\t\t\t}
\t\t}
\t}
\treturn $value;
}
function apply_filters_ref_array( $hook_name, $args ) {
\t$GLOBALS['wphx_307_07_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\t$value = $args[0] ?? null;
\tif ( ! empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\t\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\t\tforeach ( $callbacks as $registered ) {
\t\t\t\t$callback_args = array_slice( $args, 0, $registered['accepted_args'] );
\t\t\t\t$callback_args[0] = $value;
\t\t\t\tif ( is_callable( $registered['callback'] ) ) {
\t\t\t\t\t$value = call_user_func_array( $registered['callback'], $callback_args );
\t\t\t\t}
\t\t\t}
\t\t}
\t}
\treturn $value;
}
function do_action_ref_array( $hook_name, $args ) {
\t$GLOBALS['wphx_307_07_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_307_07_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
}
function remove_all_filters( $hook_name, $priority = false ) {
\tif ( false === $priority ) {
\t\tunset( $GLOBALS['wp_filter'][ $hook_name ] );
\t} else {
\t\tunset( $GLOBALS['wp_filter'][ $hook_name ][ $priority ] );
\t}
\treturn true;
}
function is_wp_error( $value ) { return $value instanceof WP_Error; }
function mbstring_binary_safe_encoding( $reset = false ) {}
function reset_mbstring_encoding() {}

require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wpdb.php';

$db_host_with_port = $db_host . ':' . $db_port;
$wpdb = new wpdb( $db_user, $db_password, $db_name, $db_host_with_port );
if ( ! $wpdb->ready ) {
\tfwrite( STDERR, json_encode( array( 'connect_error' => $wpdb->last_error ), JSON_UNESCAPED_SLASHES ) . PHP_EOL );
\texit( 2 );
}
$GLOBALS['wpdb'] = $wpdb;
$GLOBALS['table_prefix'] = 'wp_';
$wpdb->set_prefix( 'wp_' );

class WP_Post_Type {
\tpublic $name;
\tpublic $query_var;
\tpublic $hierarchical;
\tpublic $has_archive;
\tpublic $exclude_from_search;
\tpublic $cap;
\tpublic function __construct( $name, $args = array() ) {
\t\t$this->name = $name;
\t\t$this->query_var = $args['query_var'] ?? $name;
\t\t$this->hierarchical = (bool) ( $args['hierarchical'] ?? false );
\t\t$this->has_archive = (bool) ( $args['has_archive'] ?? false );
\t\t$this->exclude_from_search = (bool) ( $args['exclude_from_search'] ?? false );
\t\t$this->cap = (object) array(
\t\t\t'edit_others_posts' => 'edit_others_' . $name . 's',
\t\t\t'read_private_posts' => 'read_private_' . $name . 's',
\t\t);
\t}
}

class WP_Post {
\tpublic static function get_instance( $post_id ) {
\t\treturn get_post( $post_id );
\t}
}

function wp_parse_args( $args, $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$parsed = get_object_vars( $args );
\t} elseif ( is_array( $args ) ) {
\t\t$parsed = $args;
\t} else {
\t\tparse_str( (string) $args, $parsed );
\t}
\treturn array_merge( $defaults, $parsed );
}
function absint( $maybeint ) { return abs( (int) $maybeint ); }
function wp_checkdate( $month, $day, $year, $source_date ) { return checkdate( (int) $month, (int) $day, (int) $year ); }
function is_admin() { return false; }
function wp_is_serving_rest_request() { return false; }
function is_multisite() { return false; }
function get_option( $name, $default = false ) {
\t$options = array(
\t\t'posts_per_page' => 10,
\t\t'posts_per_rss' => 10,
\t\t'comments_per_page' => 50,
\t\t'show_on_front' => 'posts',
\t\t'page_on_front' => 0,
\t\t'page_for_posts' => 0,
\t\t'wp_page_for_privacy_policy' => 0,
\t\t'permalink_structure' => '/%postname%/',
\t\t'sticky_posts' => array(),
\t);
\treturn array_key_exists( $name, $options ) ? $options[ $name ] : $default;
}
function get_current_user_id() { return 0; }
function is_user_logged_in() { return false; }
function current_user_can( $capability, ...$args ) { return false; }
function sanitize_key( $key ) { return preg_replace( '/[^a-z0-9_\\-]/', '', strtolower( (string) $key ) ); }
function sanitize_title_for_query( $title ) {
\t$title = strtolower( trim( (string) $title ) );
\t$title = preg_replace( '/[^a-z0-9_\\-]+/', '-', $title );
\treturn trim( $title, '-' );
}
function sanitize_term_field( $field, $value, $term_id, $taxonomy, $context ) { return sanitize_title_for_query( $value ); }
function wp_basename( $path, $suffix = '' ) {
\t$basename = basename( str_replace( '\\\\', '/', $path ) );
\tif ( $suffix && str_ends_with( $basename, $suffix ) ) {
\t\t$basename = substr( $basename, 0, -strlen( $suffix ) );
\t}
\treturn $basename;
}
function wp_slash( $value ) {
\tif ( is_array( $value ) ) {
\t\treturn array_map( 'wp_slash', $value );
\t}
\treturn addslashes( (string) $value );
}
function wp_unslash( $value ) {
\tif ( is_array( $value ) ) {
\t\treturn array_map( 'wp_unslash', $value );
\t}
\treturn stripslashes( (string) $value );
}
function esc_sql( $data ) {
\tglobal $wpdb;
\tif ( is_array( $data ) ) {
\t\treturn array_map( 'esc_sql', $data );
\t}
\treturn isset( $wpdb ) ? $wpdb->_escape( $data ) : addslashes( (string) $data );
}
function wp_parse_id_list( $input_list ) {
\tif ( ! is_array( $input_list ) ) {
\t\t$input_list = preg_split( '/[\\s,]+/', (string) $input_list );
\t}
\treturn array_values( array_unique( array_map( 'absint', $input_list ) ) );
}
function wp_array_slice_assoc( $input_array, $keys ) {
\t$slice = array();
\tforeach ( $keys as $key ) {
\t\tif ( isset( $input_array[ $key ] ) ) {
\t\t\t$slice[ $key ] = $input_array[ $key ];
\t\t}
\t}
\treturn $slice;
}
function wp_list_pluck( $input_list, $field, $index_key = null ) {
\t$result = array();
\tforeach ( $input_list as $key => $value ) {
\t\t$item = is_object( $value ) ? ( $value->$field ?? null ) : ( $value[ $field ] ?? null );
\t\tif ( null === $index_key ) {
\t\t\t$result[] = $item;
\t\t} else {
\t\t\t$index = is_object( $value ) ? ( $value->$index_key ?? $key ) : ( $value[ $index_key ] ?? $key );
\t\t\t$result[ $index ] = $item;
\t\t}
\t}
\treturn $result;
}
function wp_list_filter( $input_list, $args = array(), $operator = 'AND' ) {
\treturn array_filter(
\t\t$input_list,
\t\tfunction ( $item ) use ( $args, $operator ) {
\t\t\t$matched = 0;
\t\t\tforeach ( $args as $key => $value ) {
\t\t\t\t$current = is_object( $item ) ? ( $item->$key ?? null ) : ( $item[ $key ] ?? null );
\t\t\t\tif ( $current === $value ) {
\t\t\t\t\t++$matched;
\t\t\t\t}
\t\t\t}
\t\t\treturn 'OR' === strtoupper( $operator ) ? $matched > 0 : $matched === count( $args );
\t\t}
\t);
}
function get_meta_table( $type ) {
\tglobal $wpdb;
\treturn 'post' === $type ? $wpdb->postmeta : false;
}
function _get_meta_table( $type ) { return get_meta_table( $type ); }
function get_post_type_object( $post_type ) {
\t$types = array(
\t\t'post' => new WP_Post_Type( 'post', array( 'query_var' => 'p', 'exclude_from_search' => false ) ),
\t\t'page' => new WP_Post_Type( 'page', array( 'query_var' => 'page_id', 'hierarchical' => true, 'exclude_from_search' => false ) ),
\t\t'book' => new WP_Post_Type( 'book', array( 'query_var' => 'book', 'has_archive' => true, 'exclude_from_search' => false ) ),
\t\t'attachment' => new WP_Post_Type( 'attachment', array( 'query_var' => 'attachment', 'exclude_from_search' => false ) ),
\t);
\treturn $types[ $post_type ] ?? null;
}
function get_post_types( $args = array(), $output = 'names', $operator = 'and' ) {
\t$types = array( 'post', 'page', 'book', 'attachment' );
\tif ( 'objects' === $output ) {
\t\t$result = array();
\t\tforeach ( $types as $type ) {
\t\t\t$result[ $type ] = get_post_type_object( $type );
\t\t}
\t\treturn $result;
\t}
\treturn $types;
}
function get_post_stati( $args = array(), $output = 'names', $operator = 'and' ) {
\t$statuses = array(
\t\t'publish' => (object) array( 'name' => 'publish', 'public' => true, 'private' => false, 'protected' => false, 'exclude_from_search' => false, 'show_in_admin_all_list' => true ),
\t\t'future' => (object) array( 'name' => 'future', 'public' => false, 'private' => false, 'protected' => true, 'exclude_from_search' => true, 'show_in_admin_all_list' => true ),
\t\t'draft' => (object) array( 'name' => 'draft', 'public' => false, 'private' => false, 'protected' => true, 'exclude_from_search' => true, 'show_in_admin_all_list' => true ),
\t\t'private' => (object) array( 'name' => 'private', 'public' => false, 'private' => true, 'protected' => false, 'exclude_from_search' => true, 'show_in_admin_all_list' => true ),
\t\t'inherit' => (object) array( 'name' => 'inherit', 'public' => false, 'private' => false, 'protected' => false, 'exclude_from_search' => true, 'show_in_admin_all_list' => false ),
\t);
\tforeach ( $args as $key => $value ) {
\t\t$statuses = array_filter( $statuses, fn( $status ) => property_exists( $status, $key ) && $status->$key === $value );
\t}
\treturn 'objects' === $output ? $statuses : array_keys( $statuses );
}
function get_post_status_object( $status ) {
\t$objects = get_post_stati( array(), 'objects' );
\treturn $objects[ $status ] ?? null;
}
function get_post_status( $post = null ) {
\t$post = get_post( $post );
\treturn $post ? $post->post_status : false;
}
function get_post( $post = null, $output = OBJECT, $filter = 'raw' ) {
\tglobal $wpdb;
\tif ( is_object( $post ) ) {
\t\treturn $post;
\t}
\tif ( ! $post ) {
\t\treturn null;
\t}
\t$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $wpdb->posts WHERE ID = %d", (int) $post ) );
\treturn $row ?: null;
}
function get_page_by_path( $path, $output = OBJECT, $post_type = 'page' ) { return null; }
function wp_post_mime_type_where( $post_mime_types, $table_alias = '' ) { return ''; }
function get_taxonomies( $args = array(), $output = 'names' ) {
\t$taxonomies = array(
\t\t'category' => (object) array( 'name' => 'category', 'query_var' => 'category_name', 'rewrite' => array( 'hierarchical' => true ), 'hierarchical' => true ),
\t\t'post_tag' => (object) array( 'name' => 'post_tag', 'query_var' => 'tag', 'rewrite' => array( 'hierarchical' => false ), 'hierarchical' => false ),
\t);
\treturn 'objects' === $output ? $taxonomies : array_keys( $taxonomies );
}
function taxonomy_exists( $taxonomy ) { return in_array( $taxonomy, get_taxonomies(), true ); }
function is_taxonomy_hierarchical( $taxonomy ) {
\t$taxonomies = get_taxonomies( array(), 'objects' );
\treturn ! empty( $taxonomies[ $taxonomy ]->hierarchical );
}
function get_term_children( $term_id, $taxonomy ) { return array(); }
function get_object_taxonomies( $object_type, $output = 'names' ) {
\treturn in_array( $object_type, array( 'post', 'book' ), true ) ? array( 'category', 'post_tag' ) : array();
}
function get_taxonomies_for_attachments( $output = 'names' ) { return array(); }
function get_term_by( $field, $value, $taxonomy = '', $output = OBJECT, $filter = 'raw' ) {
\tglobal $wpdb;
\t$column = 'slug' === $field ? 't.slug' : ( 'id' === $field || 'term_id' === $field ? 't.term_id' : 't.name' );
\t$row = $wpdb->get_row(
\t\t$wpdb->prepare(
\t\t\t"SELECT t.term_id, t.name, t.slug, tt.term_taxonomy_id, tt.taxonomy FROM $wpdb->terms t INNER JOIN $wpdb->term_taxonomy tt ON t.term_id = tt.term_id WHERE $column = %s AND tt.taxonomy = %s LIMIT 1",
\t\t\t$value,
\t\t\t$taxonomy
\t\t)
\t);
\treturn $row ?: false;
}
function get_terms( $args = array() ) {
\tglobal $wpdb;
\t$taxonomy = $args['taxonomy'] ?? 'category';
\t$include = array_map( 'absint', (array) ( $args['include'] ?? array() ) );
\tif ( empty( $include ) ) {
\t\treturn array();
\t}
\t$sql = "SELECT t.term_id, t.name, t.slug, tt.term_taxonomy_id, tt.taxonomy FROM $wpdb->terms t INNER JOIN $wpdb->term_taxonomy tt ON t.term_id = tt.term_id WHERE tt.taxonomy = %s AND t.term_id IN (" . implode( ',', $include ) . ")";
\treturn $wpdb->get_results( $wpdb->prepare( $sql, $taxonomy ) );
}
class WP_Term_Query {
\tpublic function query( $args ) {
\t\tglobal $wpdb;
\t\t$taxonomy = $args['taxonomy'] ?? 'category';
\t\t$where = array( $wpdb->prepare( 'tt.taxonomy = %s', $taxonomy ) );
\t\tif ( ! empty( $args['include'] ) ) {
\t\t\t$ids = wp_parse_id_list( $args['include'] );
\t\t\t$where[] = 't.term_id IN (' . implode( ',', $ids ) . ')';
\t\t}
\t\tif ( ! empty( $args['term_taxonomy_id'] ) ) {
\t\t\t$ids = wp_parse_id_list( $args['term_taxonomy_id'] );
\t\t\t$where[] = 'tt.term_taxonomy_id IN (' . implode( ',', $ids ) . ')';
\t\t}
\t\tif ( ! empty( $args['slug'] ) ) {
\t\t\t$slugs = array_map( fn( $slug ) => "'" . esc_sql( $slug ) . "'", (array) $args['slug'] );
\t\t\t$where[] = 't.slug IN (' . implode( ',', $slugs ) . ')';
\t\t}
\t\t$sql = "SELECT t.term_id, t.name, t.slug, tt.term_taxonomy_id, tt.taxonomy FROM $wpdb->terms t INNER JOIN $wpdb->term_taxonomy tt ON t.term_id = tt.term_id WHERE " . implode( ' AND ', $where );
\t\treturn $wpdb->get_results( $sql );
\t}
}
function wp_using_ext_object_cache( $using = null ) { return false; }
function wp_cache_get_last_changed( $group ) { return 'wphx-307-07-' . $group; }
function wp_cache_get_salted( $cache_key, $group, $salt ) { return false; }
function wp_cache_set_salted( $cache_key, $data, $group, $salt, $expire = 0 ) { return true; }
function wp_cache_add_multiple( array $data, $group = '', $expire = 0 ) { return true; }
function wp_cache_get_multiple( $keys, $group = '', $force = false ) { return array_fill_keys( $keys, false ); }
function _prime_post_caches( $ids, $update_term_cache = true, $update_meta_cache = true ) {}
function _prime_post_parent_id_caches( $ids ) {}
function _prime_comment_caches( $comment_ids, $update_meta_cache = true ) {}
function update_post_caches( &$posts, $post_type = 'post', $update_term_cache = true, $update_meta_cache = true ) {}
function update_postmeta_cache( $post_ids ) {}
function update_object_term_cache( $object_ids, $object_type ) {}
function update_menu_item_cache( $menu_items ) {}
function wp_queue_posts_for_term_meta_lazyload( $posts ) {}
function update_post_author_caches( $posts ) {}
function get_comment( $comment_id ) { return null; }

require_once ABSPATH . WPINC . '/class-wp-meta-query.php';
require_once ABSPATH . WPINC . '/class-wp-tax-query.php';
require_once ABSPATH . WPINC . '/class-wp-query.php';

function wphx_307_07_exec( $sql ) {
\tglobal $wpdb;
\t$result = $wpdb->query( $sql );
\tif ( false === $result ) {
\t\tthrow new RuntimeException( $sql . ': ' . $wpdb->last_error );
\t}
\treturn $result;
}

function wphx_307_07_reset_database() {
\tglobal $wpdb;
\t$wpdb->suppress_errors( true );
\t$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 0' );
\tforeach ( array( 'wp_term_relationships', 'wp_term_taxonomy', 'wp_terms', 'wp_postmeta', 'wp_posts' ) as $table ) {
\t\t$wpdb->query( "DROP TABLE IF EXISTS $table" );
\t}
\t$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 1' );
\t$wpdb->suppress_errors( false );

\twphx_307_07_exec( "SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'" );
\twphx_307_07_exec( "CREATE TABLE wp_posts (
ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
post_author bigint(20) unsigned NOT NULL DEFAULT '0',
post_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
post_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
post_content longtext NOT NULL,
post_title text NOT NULL,
post_excerpt text NOT NULL,
post_status varchar(20) NOT NULL DEFAULT 'publish',
comment_status varchar(20) NOT NULL DEFAULT 'open',
ping_status varchar(20) NOT NULL DEFAULT 'open',
post_password varchar(255) NOT NULL DEFAULT '',
post_name varchar(200) NOT NULL DEFAULT '',
to_ping text NOT NULL,
pinged text NOT NULL,
post_modified datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
post_modified_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
post_content_filtered longtext NOT NULL,
post_parent bigint(20) unsigned NOT NULL DEFAULT '0',
guid varchar(255) NOT NULL DEFAULT '',
menu_order int(11) NOT NULL DEFAULT '0',
post_type varchar(20) NOT NULL DEFAULT 'post',
post_mime_type varchar(100) NOT NULL DEFAULT '',
comment_count bigint(20) NOT NULL DEFAULT '0',
PRIMARY KEY (ID),
KEY post_name (post_name(191)),
KEY type_status_date (post_type,post_status,post_date,ID),
KEY post_parent (post_parent),
KEY post_author (post_author)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_307_07_exec( "CREATE TABLE wp_postmeta (
meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
post_id bigint(20) unsigned NOT NULL DEFAULT '0',
meta_key varchar(255) DEFAULT NULL,
meta_value longtext,
PRIMARY KEY (meta_id),
KEY post_id (post_id),
KEY meta_key (meta_key(191))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_307_07_exec( "CREATE TABLE wp_terms (
term_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
name varchar(200) NOT NULL DEFAULT '',
slug varchar(200) NOT NULL DEFAULT '',
term_group bigint(10) NOT NULL DEFAULT '0',
PRIMARY KEY (term_id),
KEY slug (slug(191)),
KEY name (name(191))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_307_07_exec( "CREATE TABLE wp_term_taxonomy (
term_taxonomy_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
term_id bigint(20) unsigned NOT NULL DEFAULT '0',
taxonomy varchar(32) NOT NULL DEFAULT '',
description longtext NOT NULL,
parent bigint(20) unsigned NOT NULL DEFAULT '0',
count bigint(20) NOT NULL DEFAULT '0',
PRIMARY KEY (term_taxonomy_id),
UNIQUE KEY term_id_taxonomy (term_id,taxonomy),
KEY taxonomy (taxonomy)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_307_07_exec( "CREATE TABLE wp_term_relationships (
object_id bigint(20) unsigned NOT NULL DEFAULT '0',
term_taxonomy_id bigint(20) unsigned NOT NULL DEFAULT '0',
term_order int(11) NOT NULL DEFAULT '0',
PRIMARY KEY (object_id,term_taxonomy_id),
KEY term_taxonomy_id (term_taxonomy_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );

\t$posts = array(
\t\tarray( 101, 1, '2026-01-05 10:00:00', 'Alpha launch', 'Alpha content with search needle', 'publish', 'alpha-launch', 'post' ),
\t\tarray( 102, 1, '2026-01-06 10:00:00', 'Beta report', 'Beta content with search needle', 'publish', 'beta-report', 'post' ),
\t\tarray( 103, 2, '2026-01-07 10:00:00', 'Gamma hidden', 'Draft content with search needle', 'draft', 'gamma-hidden', 'post' ),
\t\tarray( 104, 3, '2026-01-08 10:00:00', 'Book one', 'Book content', 'publish', 'book-one', 'book' ),
\t\tarray( 105, 2, '2026-01-09 10:00:00', 'Alpha older', 'Older alpha content', 'publish', 'alpha-older', 'post' ),
\t);
\tforeach ( $posts as $post ) {
\t\twphx_307_07_exec(
\t\t\t$wpdb->prepare(
\t\t\t\t"INSERT INTO wp_posts (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_content, post_title, post_excerpt, post_status, post_name, post_type, guid) VALUES (%d, %d, %s, %s, %s, %s, %s, %s, '', %s, %s, %s, %s)",
\t\t\t\t$post[0],
\t\t\t\t$post[1],
\t\t\t\t$post[2],
\t\t\t\t$post[2],
\t\t\t\t$post[2],
\t\t\t\t$post[2],
\t\t\t\t$post[4],
\t\t\t\t$post[3],
\t\t\t\t$post[5],
\t\t\t\t$post[6],
\t\t\t\t$post[7],
\t\t\t\t'https://example.test/?p=' . $post[0]
\t\t\t)
\t\t);
\t}
\t$meta = array(
\t\tarray( 101, 'wphx_color', 'blue' ),
\t\tarray( 102, 'wphx_color', 'green' ),
\t\tarray( 105, 'wphx_color', 'blue' ),
\t);
\tforeach ( $meta as $row ) {
\t\twphx_307_07_exec( $wpdb->prepare( "INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES (%d, %s, %s)", $row[0], $row[1], $row[2] ) );
\t}
\twphx_307_07_exec( "INSERT INTO wp_terms (term_id, name, slug) VALUES (7, 'News', 'news'), (8, 'Featured', 'featured')" );
\twphx_307_07_exec( "INSERT INTO wp_term_taxonomy (term_taxonomy_id, term_id, taxonomy, description, parent, count) VALUES (70, 7, 'category', '', 0, 2), (80, 8, 'post_tag', '', 0, 1)" );
\twphx_307_07_exec( "INSERT INTO wp_term_relationships (object_id, term_taxonomy_id) VALUES (101, 70), (105, 70), (102, 80)" );
\t$wpdb->flush();
}

function wphx_307_07_normalize_sql( $sql ) {
\t$sql = preg_replace( '/\\s+/', ' ', (string) $sql );
\t$sql = preg_replace( '/\\{[a-f0-9]{64}\\}/', '%', $sql );
\t$sql = str_replace( array( '\`wp_posts\`', '\`wp_postmeta\`' ), array( 'wp_posts', 'wp_postmeta' ), $sql );
\treturn trim( $sql );
}

function wphx_307_07_selected_query_vars( WP_Query $query ) {
\t$keys = array( 'p', 'post__in', 'post_type', 'post_status', 'posts_per_page', 'paged', 'offset', 'orderby', 'order', 'fields', 's', 'meta_key', 'meta_value', 'cat', 'category__in', 'tax_query', 'no_found_rows', 'cache_results' );
\t$result = array();
\tforeach ( $keys as $key ) {
\t\tif ( array_key_exists( $key, $query->query_vars ) ) {
\t\t\t$result[ $key ] = $query->query_vars[ $key ];
\t\t}
\t}
\treturn $result;
}

function wphx_307_07_case_result( $id, $args ) {
\t$GLOBALS['wphx_307_07_actions'] = array();
\t$GLOBALS['wphx_307_07_filters'] = array();
\t$query = new WP_Query();
\t$posts = $query->query( array_merge( array(
\t\t'fields' => 'ids',
\t\t'no_found_rows' => true,
\t\t'cache_results' => false,
\t\t'update_post_meta_cache' => false,
\t\t'update_post_term_cache' => false,
\t\t'lazy_load_term_meta' => false,
\t\t'ignore_sticky_posts' => true,
\t\t'suppress_filters' => false,
\t), $args ) );
\treturn array(
\t\t'id' => $id,
\t\t'post_ids' => array_values( array_map( 'intval', $posts ) ),
\t\t'post_count' => (int) $query->post_count,
\t\t'found_posts' => (int) $query->found_posts,
\t\t'max_num_pages' => (int) $query->max_num_pages,
\t\t'request' => wphx_307_07_normalize_sql( $query->request ),
\t\t'query_vars' => wphx_307_07_selected_query_vars( $query ),
\t\t'flags' => array(
\t\t\t'is_home' => (bool) $query->is_home,
\t\t\t'is_single' => (bool) $query->is_single,
\t\t\t'is_search' => (bool) $query->is_search,
\t\t\t'is_archive' => (bool) $query->is_archive,
\t\t\t'is_category' => (bool) $query->is_category,
\t\t\t'is_tax' => (bool) $query->is_tax,
\t\t),
\t\t'tax_query' => $query->tax_query instanceof WP_Tax_Query ? array(
\t\t\t'queries' => $query->tax_query->queries,
\t\t\t'queried_terms' => $query->tax_query->queried_terms,
\t\t) : null,
\t\t'meta_query' => $query->meta_query instanceof WP_Meta_Query ? array(
\t\t\t'queries' => $query->meta_query->queries,
\t\t\t'clauses' => $query->meta_query->get_clauses(),
\t\t) : null,
\t\t'actions' => $GLOBALS['wphx_307_07_actions'],
\t\t'filters' => $GLOBALS['wphx_307_07_filters'],
\t);
}

wphx_307_07_reset_database();

$cases = array(
\t'live-query:published-default' => array( 'post_type' => 'post', 'posts_per_page' => 3, 'orderby' => 'date', 'order' => 'DESC' ),
\t'live-query:post-in-order' => array( 'post_type' => 'post', 'post__in' => array( 105, 101, 102 ), 'orderby' => 'post__in', 'posts_per_page' => 5 ),
\t'live-query:search-title-content' => array( 'post_type' => 'post', 's' => 'Alpha', 'orderby' => 'date', 'order' => 'DESC', 'posts_per_page' => 5 ),
\t'live-query:meta-key-value' => array( 'post_type' => 'post', 'meta_key' => 'wphx_color', 'meta_value' => 'blue', 'orderby' => 'ID', 'order' => 'ASC', 'posts_per_page' => 5 ),
\t'live-query:category-taxonomy' => array( 'post_type' => 'post', 'cat' => 7, 'orderby' => 'ID', 'order' => 'ASC', 'posts_per_page' => 5 ),
);

$results = array();
foreach ( $cases as $id => $vars ) {
\t$results[] = wphx_307_07_case_result( $id, $vars );
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'runtime' => $runtime_id,
\t\t'phpVersion' => PHP_VERSION,
\t\t'database' => array(
\t\t\t'name' => $db_name,
\t\t\t'server_info' => $wpdb->db_server_info(),
\t\t\t'charset' => $wpdb->charset,
\t\t\t'collate' => $wpdb->collate,
\t\t),
\t\t'coveredFunctionExists' => array(
\t\t\t'wp_parse_id_list' => function_exists( 'wp_parse_id_list' ),
\t\t\t'get_terms' => function_exists( 'get_terms' ),
\t\t\t'get_post_stati' => function_exists( 'get_post_stati' ),
\t\t),
\t\t'coveredMethodExists' => array(
\t\t\t'WP_Query::query' => method_exists( 'WP_Query', 'query' ),
\t\t\t'WP_Query::get_posts' => method_exists( 'WP_Query', 'get_posts' ),
\t\t\t'WP_Meta_Query::get_sql' => method_exists( 'WP_Meta_Query', 'get_sql' ),
\t\t\t'WP_Tax_Query::get_sql' => method_exists( 'WP_Tax_Query', 'get_sql' ),
\t\t\t'wpdb::get_col' => method_exists( $wpdb, 'get_col' ),
\t\t),
\t\t'cases' => $results,
\t\t'php_errors' => $GLOBALS['wphx_307_07_php_errors'],
\t),
\tJSON_UNESCAPED_SLASHES
) . PHP_EOL;
`
  );
}

function normalizeRun(run) {
  return {
    coveredFunctionExists: run.coveredFunctionExists,
    coveredMethodExists: run.coveredMethodExists,
    cases: run.cases,
    php_errors: run.php_errors
  };
}

function imageRef(image) {
  if (image.registry === "local") {
    return `${image.repository}:${image.tag}`;
  }
  return `${image.repository}@${image.index_digest}`;
}

function runPhpInClient(phpClient, network, phpArgs, options = {}) {
  const dockerArgs = ["run", "--rm", "--network", network, "-v", `${process.cwd()}:/work`, "-w", "/work"];
  for (const [key, value] of Object.entries(options.env ?? {})) {
    dockerArgs.push("-e", `${key}=${value}`);
  }
  dockerArgs.push(imageRef(phpClient.image_lock), "php", ...phpArgs);
  return command("docker", dockerArgs);
}

function dbProbe(phpClient, network) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli(getenv('WPHX_DB_HOST'), getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), '', intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $result = $mysqli->query("SELECT VERSION() AS version, @@version_comment AS comment");
    $row = $result->fetch_assoc();
    echo json_encode($row, JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    runPhpInClient(phpClient, network, ["-r", code], {
      env: {
        WPHX_DB_HOST: "db",
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_PORT: "3306"
      }
    })
  );
}

function createDatabases(phpClient, network) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli(getenv('WPHX_DB_HOST'), getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), '', intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    foreach (array('${ORACLE_DB}', '${CANDIDATE_DB}') as $db) {
      $mysqli->query("DROP DATABASE IF EXISTS " . $db);
      if (!$mysqli->query("CREATE DATABASE " . $db . " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")) {
        fwrite(STDERR, $mysqli->error . PHP_EOL);
        exit(3);
      }
    }
    echo json_encode(array('created' => array('${ORACLE_DB}', '${CANDIDATE_DB}')), JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    runPhpInClient(phpClient, network, ["-r", code], {
      env: {
        WPHX_DB_HOST: "db",
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_PORT: "3306"
      }
    })
  );
}

function dbRuntimeRecords(lock) {
  return [
    {
      id: "mysql-8.4",
      engine: "mysql",
      image_lock: lock.container_images.mysql_8_4,
      env: {
        MYSQL_ROOT_PASSWORD: DB_PASSWORD,
        MYSQL_ROOT_HOST: "%"
      }
    }
  ];
}

function phpClientRecords(lock) {
  return [
    {
      id: "php-8.4-db-client",
      php_minor: "8.4",
      image_lock: lock.container_images.php_8_4_db_client
    }
  ];
}

async function withDbRuntime(runtime, readinessClient, callback) {
  const name = `wordpresshx-wphx-307-07-${runtime.id}-${process.pid}`;
  const network = `wordpresshx-wphx-307-07-${runtime.id}-${process.pid}`;
  let containerId = "";
  let networkCreated = false;
  try {
    command("docker", ["network", "create", network]);
    networkCreated = true;
    const dockerArgs = ["run", "-d", "--rm", "--name", name, "--network", network, "--network-alias", "db"];
    for (const [key, value] of Object.entries(runtime.env)) {
      dockerArgs.push("-e", `${key}=${value}`);
    }
    dockerArgs.push(imageRef(runtime.image_lock));
    containerId = command("docker", dockerArgs);
    let query = null;
    let lastError = "";
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      try {
        query = dbProbe(readinessClient, network);
        break;
      } catch (error) {
        lastError = error.stderr?.toString?.() || error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!query) {
      throw new Error(`${runtime.id} did not become ready: ${lastError}`);
    }
    const initialized = createDatabases(readinessClient, network);
    return await callback({ network, query, initialized, container: { id: containerId, name, network } });
  } finally {
    if (containerId) {
      try {
        command("docker", ["stop", name], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Best-effort cleanup for failed startup or interrupted probes.
      }
    }
    if (networkCreated) {
      try {
        command("docker", ["network", "rm", network], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Best-effort cleanup for failed startup or interrupted probes.
      }
    }
  }
}

function runProbe(runtime, phpClient, mode, root, dbName, network) {
  const runtimeId = `${runtime.id}:${phpClient.id}`;
  const output = runPhpInClient(phpClient, network, [PROBE, mode, root, "db", "3306", DB_USER, DB_PASSWORD, dbName, runtimeId]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    db_runtime: runtime.id,
    php_client_runtime: phpClient.id,
    mode,
    database: dbName,
    command: `docker run --rm --network <network> -v <repo>:/work -w /work ${imageRef(phpClient.image_lock)} php ${PROBE} ${mode} ${root} db 3306 ${DB_USER} <password> ${dbName} ${runtimeId}`,
    result: JSON.parse(output)
  };
}

function compare(oracleRun, candidateRun) {
  const oracle = normalizeRun(oracleRun.result);
  const candidate = normalizeRun(candidateRun.result);
  const oracleText = JSON.stringify(oracle);
  const candidateText = JSON.stringify(candidate);
  const matches = oracleText === candidateText;
  return {
    id: oracleRun.runtime,
    runtime: oracleRun.runtime,
    db_runtime: oracleRun.db_runtime,
    php_client_runtime: oracleRun.php_client_runtime,
    matches,
    oracle_sha256: sha256(oracleText),
    candidate_sha256: sha256(candidateText),
    oracle_case_count: oracle.cases.length,
    candidate_case_count: candidate.cases.length,
    ...(matches ? {} : { oracle, candidate })
  };
}

function runSummary(run) {
  const normalized = normalizeRun(run.result);
  return {
    id: run.id,
    runtime: run.runtime,
    db_runtime: run.db_runtime,
    php_client_runtime: run.php_client_runtime,
    mode: run.mode,
    database: run.database,
    command: run.command,
    php_version: run.result.phpVersion,
    server_info: run.result.database.server_info,
    case_count: normalized.cases.length,
    result_sha256: sha256(JSON.stringify(normalized))
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-307-wp-query-live-db`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wp-query-live-db-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Query live DB SQL/result fixture",
      area: "wp-includes/class-wp-query.php",
      public_contract:
        "Mirrored upstream WP_Query, WP_Meta_Query, WP_Tax_Query, and wpdb source execute selected query cases against a locked live MySQL runtime. This is live SQL/result parity evidence only; it does not claim Haxe-owned public PHP replacement."
    },
    ownership_state: "upstream_oracle_source_mirror",
    ownership_axes: {
      semantic_owner: "upstream_wordpress_oracle",
      adapter_contract_owner: "not_claimed",
      emission_strategy: "oracle_source_mirror_fixture",
      execution_provider: "php_live_mysql",
      compatibility_evidence: "live_integration_parity"
    },
    bridge: {
      exists: true,
      kind: "fixture-only-upstream-source-mirror",
      removal_gate:
        "Replace the candidate side with Haxe-owned WP_Query public PHP output and keep this live DB fixture green before claiming migrated WP_Query ownership."
    },
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-307-wp-query-live-db",
        "npm run wp:core:wphx-307-wp-query-live-db:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-307-07-wp-query-live-db-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function receipt(manifestSha) {
  return {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-307-07-wp-query-live-db-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      {
        path: OUT,
        role: "WP_Query live DB SQL/result parity manifest",
        sha256: manifestSha
      },
      {
        path: OWNERSHIP,
        role: "oracle-source-mirror ownership manifest"
      },
      {
        path: RUNNER,
        role: "live DB runner"
      },
      {
        path: "toolchain.lock.json",
        role: "locked MySQL and PHP DB-client image inputs"
      }
    ],
    verification_commands: [
      "npm run php:db-client-images",
      "npm run php:db-client-images:check",
      "npm run wp:core:wphx-307-wp-query-live-db",
      "npm run wp:core:wphx-307-wp-query-live-db:check",
      "npm run receipts:validate"
    ],
    validation_result: {
      status: "passed",
      fixture_cases: FIXTURE_CASES.length,
      db_runtimes: 1,
      php_client_runtimes: 1
    }
  };
}

const lock = readJson("toolchain.lock.json");
const runtimeFixture = readJson(RUNTIME_FIXTURE);
const phpDbClientImages = readJson(PHP_DB_CLIENT_IMAGES);
const dbRuntimes = dbRuntimeRecords(lock);
const phpClients = phpClientRecords(lock);

if (!maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"])) {
  console.error(JSON.stringify({ status: "failed", error: "docker server unavailable; WPHX-307.07 requires live DB containers" }, null, 2));
  process.exit(1);
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const runs = [];
const comparisons = [];
const dbRuntimeResults = [];
const phpClientResults = new Map();

for (const runtime of dbRuntimes) {
  const result = await withDbRuntime(runtime, phpClients[0], async ({ network, query, initialized }) => {
    const clientResults = [];
    for (const phpClient of phpClients) {
      const clientQuery = dbProbe(phpClient, network);
      const oracle = runProbe(runtime, phpClient, "oracle", ORACLE_ROOT, ORACLE_DB, network);
      const candidate = runProbe(runtime, phpClient, "candidate", CANDIDATE_ROOT, CANDIDATE_DB, network);
      clientResults.push({ phpClient, oracle, candidate, query: clientQuery });
    }
    return { clientResults, query, initialized };
  });
  for (const clientResult of result.clientResults) {
    runs.push(clientResult.oracle, clientResult.candidate);
    comparisons.push(compare(clientResult.oracle, clientResult.candidate));
    phpClientResults.set(clientResult.phpClient.id, {
      id: clientResult.phpClient.id,
      php_minor: clientResult.phpClient.php_minor,
      image_lock: clientResult.phpClient.image_lock,
      query_samples: [
        ...(phpClientResults.get(clientResult.phpClient.id)?.query_samples ?? []),
        {
          db_runtime: runtime.id,
          query: clientResult.query
        }
      ]
    });
  }
  dbRuntimeResults.push({
    id: runtime.id,
    engine: runtime.engine,
    image_lock: runtime.image_lock,
    query: result.query,
    initialized: result.initialized
  });
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const caseErrors = runs.flatMap((run) =>
  (run.result.php_errors ?? []).map((entry) => ({
    run: run.id,
    error: entry
  }))
);
if (caseErrors.length > 0) {
  console.error(JSON.stringify({ status: "failed", caseErrors }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const manifest = {
  schema: "wphx.wp-core-wp-query-live-db-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  inputs: {
    wp_query_runtime_fixture: inputRecord(RUNTIME_FIXTURE),
    php_db_client_images: inputRecord(PHP_DB_CLIENT_IMAGES),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domains: ["posts", "postmeta", "taxonomy relationships", "WP_Query SQL assembly", "wpdb live execution"],
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    follows: ["WPHX-307.06", "WPHX-305.09"],
    inherited_runtime_fixture: {
      manifest: RUNTIME_FIXTURE,
      validation_result: runtimeFixture.validation_result
    },
    php_db_client_image_manifest: {
      manifest: PHP_DB_CLIENT_IMAGES,
      validation_result: phpDbClientImages.validation_result
    },
    db_runtimes: dbRuntimes.map((runtime) => ({
      id: runtime.id,
      engine: runtime.engine,
      image: imageRef(runtime.image_lock),
      index_digest: runtime.image_lock.index_digest,
      linux_amd64_digest: runtime.image_lock.linux_amd64_digest,
      linux_arm64_digest: runtime.image_lock.linux_arm64_digest
    })),
    php_clients: phpClients.map((client) => ({
      id: client.id,
      php_minor: client.php_minor,
      image: imageRef(client.image_lock),
      local_reference: `${client.image_lock.repository}:${client.image_lock.tag}`,
      dockerfile: client.image_lock.dockerfile,
      dockerfile_sha256: client.image_lock.dockerfile_sha256,
      base_image: client.image_lock.base_image,
      base_index_digest: client.image_lock.base_index_digest,
      required_extensions: client.image_lock.required_extensions
    })),
    live_boundaries_covered: [
      "real wpdb mysqli connection and query execution",
      "WP_Query SQL request construction for posts, search, meta, and taxonomy cases",
      "WP_Meta_Query postmeta join/where generation against live rows",
      "WP_Tax_Query term relationship join/where generation against live rows",
      "ID result materialization through wpdb::get_col"
    ],
    native_boundaries: [
      {
        id: "minimal-wordpress-service-stubs",
        reason:
          "This fixture isolates WP_Query SQL/result behavior. Generic WordPress services around hooks, cache, options, users, post type registration, and taxonomy registration are deterministic stubs while the query classes and wpdb execution remain upstream PHP."
      },
      {
        id: "mysql-only-initial-slice",
        reason:
          "WPHX-307.07 starts with the locked MySQL 8.4 runtime. MariaDB and upstream PHPUnit ratchets remain follow-up closure for the posts/query workset."
      }
    ]
  },
  runtimes: {
    db: dbRuntimeResults,
    php_clients: Array.from(phpClientResults.values())
  },
  run_summaries: runs.map(runSummary),
  trace_samples: comparisons.map((comparison) => {
    const run = runs.find((entry) => entry.runtime === comparison.runtime && entry.mode === "oracle");
    return {
      id: run.id,
      runtime: comparison.runtime,
      db_runtime: comparison.db_runtime,
      php_client_runtime: comparison.php_client_runtime,
      result: normalizeRun(run.result)
    };
  }),
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-307",
      detail: "The candidate side remains a copied WordPress oracle source tree until WP_Query and related post/query behavior move behind Haxe-owned public PHP output."
    },
    {
      id: "full-wordpress-bootstrap-not-used",
      owner: "WPHX-307",
      detail: "The fixture stubs surrounding WordPress services to isolate query SQL/result parity. Installed WordPress and upstream PHPUnit query suites remain required closure gates."
    },
    {
      id: "mariadb-and-php-version-matrix-deferred",
      owner: "WPHX-307",
      detail: "This first live WP_Query slice uses MySQL 8.4 with PHP 8.4 DB-client. MariaDB and additional PHP minors are intentionally left for a later matrix expansion."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "oracle_source_mirror",
    covered_symbols: COVERED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    db_runtimes: dbRuntimes.length,
    php_client_runtimes: phpClients.length,
    comparisons: comparisons.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receiptText = JSON.stringify(receipt(manifestSha), null, 2) + "\n";

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
      db_runtimes: dbRuntimes.length,
      php_client_runtimes: phpClients.length,
      comparisons: comparisons.length
    },
    null,
    2
  )
);
