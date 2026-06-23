#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-jxj",
  external_ref: "WPHX-308.06",
  title: "Add taxonomy/comment live DB SQL-result fixture"
};
const OUT_ROOT = "build/wp-core/wphx-308-06";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-308-06-taxonomy-comment-live-db-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-308-06-taxonomy-comment-live-db-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-308-06-taxonomy-comment-live-db-fixture.v1.json";
const QUERY_STATE_FIXTURE = "manifests/wp-core/wphx-308-05-taxonomy-comment-query-state-fixture.v1.json";
const PHP_DB_CLIENT_IMAGES = "manifests/toolchain/wphx-305-09-php-db-client-images.v1.json";
const RECORDED_AT = "2026-06-23T23:55:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const DB_USER = "root";
const DB_PASSWORD = "wordpresshx-live-password";
const ORACLE_DB = "wordpresshx_taxcomment_oracle";
const CANDIDATE_DB = "wordpresshx_taxcomment_candidate";
const RUNNER = "tools/wp-core/run-taxonomy-comment-live-db-fixture.mjs";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wpdb.php",
  "src/wp-includes/class-wp-taxonomy.php",
  "src/wp-includes/class-wp-term.php",
  "src/wp-includes/class-wp-comment.php",
  "src/wp-includes/class-wp-meta-query.php",
  "src/wp-includes/class-wp-date-query.php",
  "src/wp-includes/class-wp-term-query.php",
  "src/wp-includes/class-wp-comment-query.php",
  "src/wp-includes/taxonomy.php",
  "src/wp-includes/comment.php"
];

const COVERED_SYMBOLS = [
  "WP_Term_Query::query",
  "WP_Term_Query::get_terms",
  "WP_Comment_Query::query",
  "WP_Comment_Query::get_comments",
  "WP_Comment_Query::get_comment_ids",
  "WP_Meta_Query::get_sql",
  "wpdb::__construct",
  "wpdb::query",
  "wpdb::get_var",
  "wpdb::get_col",
  "wpdb::get_results",
  "wpdb::prepare"
];

const FIXTURE_CASES = [
  { id: "live-term:ids-name-order", focus: "term id results, taxonomy filter, hide_empty=false, name ordering, and LIMIT" },
  { id: "live-term:include-order", focus: "include filtering and include order preservation" },
  { id: "live-term:meta-filter", focus: "termmeta join/where generation and live result materialization" },
  { id: "live-term:count", focus: "term count query and scalar result materialization" },
  { id: "live-comment:approved-post-order", focus: "approved comment IDs filtered by post and ordered by comment date" },
  { id: "live-comment:include-order", focus: "comment__in filtering and FIELD() order preservation" },
  { id: "live-comment:meta-date-search", focus: "commentmeta and date query joins with search filtering" },
  { id: "live-comment:count", focus: "comment count query and scalar result materialization" }
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

error_reporting( E_ALL );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );
mysqli_report( MYSQLI_REPORT_OFF );

$GLOBALS['wphx_308_06_actions'] = array();
$GLOBALS['wphx_308_06_filters'] = array();
$GLOBALS['wphx_308_06_php_errors'] = array();
$GLOBALS['wp_taxonomies'] = array();
$GLOBALS['wp_filter'] = array();
$GLOBALS['_wp_suspend_cache_invalidation'] = false;

set_error_handler(
	function ( $errno, $errstr, $errfile, $errline ) {
		$GLOBALS['wphx_308_06_php_errors'][] = array(
			'errno' => $errno,
			'message' => $errstr,
			'file' => basename( $errfile ),
			'line' => $errline,
		);
		return true;
	}
);

register_shutdown_function(
	function () {
		$error = error_get_last();
		if ( $error && in_array( $error['type'], array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR ), true ) ) {
			fwrite( STDERR, json_encode( array( 'fatal' => $error ), JSON_UNESCAPED_SLASHES ) . PHP_EOL );
		}
	}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', 'utf8mb4_unicode_ci' );

function wp_load_translations_early() {}
function __( $text ) { return $text; }
function _x( $text, $context = '', $domain = 'default' ) { return $text; }
function _n( $single, $plural, $number ) { return 1 === (int) $number ? $single : $plural; }
function _deprecated_function( $function_name, $version, $replacement = '' ) {
	$GLOBALS['wphx_308_06_php_errors'][] = array( 'deprecated_function' => $function_name, 'version' => $version, 'replacement' => $replacement );
}
function _doing_it_wrong( $function_name, $message, $version ) {
	$GLOBALS['wphx_308_06_php_errors'][] = array( 'doing_it_wrong' => $function_name, 'version' => $version );
}
function wp_die( $message = '', $title = '', $args = array() ) { throw new RuntimeException( wp_strip_all_tags( (string) $message ) ); }
function wp_strip_all_tags( $text ) { return strip_tags( (string) $text ); }
function wp_debug_backtrace_summary( $ignore_class = null, $skip_frames = 0, $pretty = true ) { return 'wphx-308-06-backtrace'; }

function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
	$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => $callback, 'accepted_args' => $accepted_args );
	$GLOBALS['wphx_308_06_filters'][] = array( 'hook' => $hook_name, 'registered' => true, 'priority' => $priority, 'accepted_args' => $accepted_args );
	return true;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) { return add_filter( $hook_name, $callback, $priority, $accepted_args ); }
function has_filter( $hook_name, $callback = false ) { return ! empty( $GLOBALS['wp_filter'][ $hook_name ] ); }
function remove_filter( $hook_name, $callback, $priority = 10 ) { unset( $GLOBALS['wp_filter'][ $hook_name ][ $priority ] ); return true; }
function remove_all_filters( $hook_name, $priority = false ) { unset( $GLOBALS['wp_filter'][ $hook_name ] ); return true; }
function apply_filters( $hook_name, $value, ...$args ) {
	$GLOBALS['wphx_308_06_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
	if ( ! empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
		ksort( $GLOBALS['wp_filter'][ $hook_name ] );
		foreach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
			foreach ( $callbacks as $registered ) {
				$callback_args = array_slice( array_merge( array( $value ), $args ), 0, $registered['accepted_args'] );
				if ( is_callable( $registered['callback'] ) ) {
					$value = call_user_func_array( $registered['callback'], $callback_args );
				}
			}
		}
	}
	return $value;
}
function apply_filters_ref_array( $hook_name, $args ) { return apply_filters( $hook_name, ...$args ); }
function do_action_ref_array( $hook_name, $args ) { $GLOBALS['wphx_308_06_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) ); }
function do_action( $hook_name, ...$args ) { $GLOBALS['wphx_308_06_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) ); }
function is_wp_error( $value ) { return $value instanceof WP_Error; }
function mbstring_binary_safe_encoding( $reset = false ) {}
function reset_mbstring_encoding() {}

require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wpdb.php';

$db_host_with_port = $db_host . ':' . $db_port;
$wpdb = new wpdb( $db_user, $db_password, $db_name, $db_host_with_port );
if ( ! $wpdb->ready ) {
	fwrite( STDERR, json_encode( array( 'connect_error' => $wpdb->last_error ), JSON_UNESCAPED_SLASHES ) . PHP_EOL );
	exit( 2 );
}
$GLOBALS['wpdb'] = $wpdb;
$GLOBALS['table_prefix'] = 'wp_';
$wpdb->set_prefix( 'wp_' );

function wp_parse_args( $args, $defaults = array() ) {
	if ( is_object( $args ) ) {
		$parsed = get_object_vars( $args );
	} elseif ( is_array( $args ) ) {
		$parsed = $args;
	} else {
		parse_str( (string) $args, $parsed );
	}
	return array_merge( $defaults, $parsed );
}
function wp_parse_list( $input_list ) { return is_array( $input_list ) ? $input_list : preg_split( '/[\s,]+/', (string) $input_list, -1, PREG_SPLIT_NO_EMPTY ); }
function absint( $maybeint ) { return abs( (int) $maybeint ); }
function wp_checkdate( $month, $day, $year, $source_date ) { return checkdate( (int) $month, (int) $day, (int) $year ); }
function is_admin() { return false; }
function wp_is_serving_rest_request() { return false; }
function is_multisite() { return false; }
function get_option( $name, $default = false ) { return 'comments_per_page' === $name ? 50 : $default; }
function update_option( $name, $value, $autoload = null ) { return true; }
function delete_option( $name ) { return true; }
function sanitize_key( $key ) { return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) ); }
function sanitize_title( $title, $fallback_title = '', $context = 'save' ) {
	$title = strtolower( trim( (string) $title ) );
	$title = preg_replace( '/[^a-z0-9]+/', '-', $title );
	$title = trim( $title, '-' );
	return '' === $title ? (string) $fallback_title : $title;
}
function sanitize_title_with_dashes( $title, $raw_title = '', $context = 'display' ) { return sanitize_title( $title ); }
function sanitize_title_for_query( $title ) { return sanitize_title( $title, '', 'query' ); }
function wp_slash( $value ) { return is_array( $value ) ? array_map( 'wp_slash', $value ) : addslashes( (string) $value ); }
function wp_unslash( $value ) { return is_array( $value ) ? array_map( 'wp_unslash', $value ) : stripslashes( (string) $value ); }
function esc_sql( $data ) { global $wpdb; return is_array( $data ) ? array_map( 'esc_sql', $data ) : $wpdb->_escape( $data ); }
function wp_parse_id_list( $input_list ) { return array_values( array_unique( array_map( 'absint', wp_parse_list( $input_list ) ) ) ); }
function wp_parse_slug_list( $input_list ) { return array_values( array_unique( array_map( 'sanitize_title', wp_parse_list( $input_list ) ) ) ); }
function wp_array_slice_assoc( $input_array, $keys ) { $slice = array(); foreach ( $keys as $key ) { if ( array_key_exists( $key, $input_array ) ) { $slice[ $key ] = $input_array[ $key ]; } } return $slice; }
function wp_list_pluck( $input_list, $field, $index_key = null ) {
	$result = array();
	foreach ( $input_list as $key => $value ) {
		$item = is_object( $value ) ? ( $value->$field ?? null ) : ( $value[ $field ] ?? null );
		if ( null === $index_key ) {
			$result[] = $item;
		} else {
			$index = is_object( $value ) ? ( $value->$index_key ?? $key ) : ( $value[ $index_key ] ?? $key );
			$result[ $index ] = $item;
		}
	}
	return $result;
}
function get_meta_table( $type ) { global $wpdb; $property = $type . 'meta'; return $wpdb->$property ?? false; }
function _get_meta_table( $type ) { return get_meta_table( $type ); }
function get_post( $post = null, $output = OBJECT, $filter = 'raw' ) { global $wpdb; return $post ? $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $wpdb->posts WHERE ID = %d", (int) $post ) ) : null; }
function wp_using_ext_object_cache( $using = null ) { return false; }
function wp_cache_get_last_changed( $group ) { return 'wphx-308-06-' . $group; }
function wp_cache_set_last_changed( $group ) { return 'wphx-308-06-' . $group; }
function wp_cache_get( $key, $group = '', $force = false, &$found = null ) { $found = false; return false; }
function wp_cache_set( $key, $data, $group = '', $expire = 0 ) { return true; }
function wp_cache_add( $key, $data, $group = '', $expire = 0 ) { return true; }
function wp_cache_delete( $key, $group = '' ) { return true; }
function wp_cache_get_salted( $cache_key, $group, $salt ) { return false; }
function wp_cache_set_salted( $cache_key, $data, $group, $salt, $expire = 0 ) { return true; }
function wp_cache_get_multiple_salted( $keys, $group, $salt ) { return array_fill_keys( $keys, false ); }
function wp_cache_set_multiple_salted( $data, $group, $salt, $expire = 0 ) { return true; }
function wp_cache_add_multiple( array $data, $group = '', $expire = 0 ) { return true; }
function wp_cache_get_multiple( $keys, $group = '', $force = false ) { return array_fill_keys( $keys, false ); }
function _get_non_cached_ids( $object_ids, $cache_group ) { return $object_ids; }
function update_metadata_cache( $meta_type, $object_ids ) { return array(); }
function _prime_post_caches( $ids, $update_term_cache = true, $update_meta_cache = true ) {}
function post_type_exists( $post_type ) { return 'post' === $post_type; }
function _get_custom_object_labels( $data_object, $nohier_vs_hier_defaults ) {
	return (object) array(
		'name' => $data_object->name ?? 'fixture',
		'singular_name' => $data_object->name ?? 'fixture',
	);
}

require_once ABSPATH . WPINC . '/class-wp-taxonomy.php';
require_once ABSPATH . WPINC . '/class-wp-term.php';
require_once ABSPATH . WPINC . '/class-wp-comment.php';
require_once ABSPATH . WPINC . '/class-wp-meta-query.php';
require_once ABSPATH . WPINC . '/class-wp-date-query.php';
require_once ABSPATH . WPINC . '/taxonomy.php';
require_once ABSPATH . WPINC . '/comment.php';
require_once ABSPATH . WPINC . '/class-wp-term-query.php';
require_once ABSPATH . WPINC . '/class-wp-comment-query.php';

function wphx_308_06_exec( $sql ) { global $wpdb; $result = $wpdb->query( $sql ); if ( false === $result ) { throw new RuntimeException( $sql . ': ' . $wpdb->last_error ); } return $result; }
function wphx_308_06_reset_database() {
	global $wpdb;
	$wpdb->suppress_errors( true );
	$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 0' );
	foreach ( array( 'wp_commentmeta', 'wp_comments', 'wp_termmeta', 'wp_term_relationships', 'wp_term_taxonomy', 'wp_terms', 'wp_posts' ) as $table ) { $wpdb->query( "DROP TABLE IF EXISTS $table" ); }
	$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 1' );
	$wpdb->suppress_errors( false );
	wphx_308_06_exec( "SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'" );
	wphx_308_06_exec( "CREATE TABLE wp_posts (ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, post_author bigint(20) unsigned NOT NULL DEFAULT '0', post_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_content longtext NOT NULL, post_title text NOT NULL, post_excerpt text NOT NULL, post_status varchar(20) NOT NULL DEFAULT 'publish', comment_status varchar(20) NOT NULL DEFAULT 'open', ping_status varchar(20) NOT NULL DEFAULT 'open', post_password varchar(255) NOT NULL DEFAULT '', post_name varchar(200) NOT NULL DEFAULT '', to_ping text NOT NULL, pinged text NOT NULL, post_modified datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_modified_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00', post_content_filtered longtext NOT NULL, post_parent bigint(20) unsigned NOT NULL DEFAULT '0', guid varchar(255) NOT NULL DEFAULT '', menu_order int(11) NOT NULL DEFAULT '0', post_type varchar(20) NOT NULL DEFAULT 'post', post_mime_type varchar(100) NOT NULL DEFAULT '', comment_count bigint(20) NOT NULL DEFAULT '0', PRIMARY KEY (ID), KEY type_status_date (post_type,post_status,post_date,ID)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_terms (term_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, name varchar(200) NOT NULL DEFAULT '', slug varchar(200) NOT NULL DEFAULT '', term_group bigint(10) NOT NULL DEFAULT '0', PRIMARY KEY (term_id), KEY slug (slug(191)), KEY name (name(191))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_term_taxonomy (term_taxonomy_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, term_id bigint(20) unsigned NOT NULL DEFAULT '0', taxonomy varchar(32) NOT NULL DEFAULT '', description longtext NOT NULL, parent bigint(20) unsigned NOT NULL DEFAULT '0', count bigint(20) NOT NULL DEFAULT '0', PRIMARY KEY (term_taxonomy_id), UNIQUE KEY term_id_taxonomy (term_id,taxonomy), KEY taxonomy (taxonomy)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_term_relationships (object_id bigint(20) unsigned NOT NULL DEFAULT '0', term_taxonomy_id bigint(20) unsigned NOT NULL DEFAULT '0', term_order int(11) NOT NULL DEFAULT '0', PRIMARY KEY (object_id,term_taxonomy_id), KEY term_taxonomy_id (term_taxonomy_id)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_termmeta (meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, term_id bigint(20) unsigned NOT NULL DEFAULT '0', meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY term_id (term_id), KEY meta_key (meta_key(191))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_comments (comment_ID bigint(20) unsigned NOT NULL AUTO_INCREMENT, comment_post_ID bigint(20) unsigned NOT NULL DEFAULT '0', comment_author tinytext NOT NULL, comment_author_email varchar(100) NOT NULL DEFAULT '', comment_author_url varchar(200) NOT NULL DEFAULT '', comment_author_IP varchar(100) NOT NULL DEFAULT '', comment_date datetime NOT NULL DEFAULT '0000-00-00 00:00:00', comment_date_gmt datetime NOT NULL DEFAULT '0000-00-00 00:00:00', comment_content text NOT NULL, comment_karma int(11) NOT NULL DEFAULT '0', comment_approved varchar(20) NOT NULL DEFAULT '1', comment_agent varchar(255) NOT NULL DEFAULT '', comment_type varchar(20) NOT NULL DEFAULT 'comment', comment_parent bigint(20) unsigned NOT NULL DEFAULT '0', user_id bigint(20) unsigned NOT NULL DEFAULT '0', PRIMARY KEY (comment_ID), KEY comment_post_ID (comment_post_ID), KEY comment_approved_date_gmt (comment_approved,comment_date_gmt), KEY comment_date_gmt (comment_date_gmt), KEY comment_parent (comment_parent), KEY comment_author_email (comment_author_email(10))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "CREATE TABLE wp_commentmeta (meta_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, comment_id bigint(20) unsigned NOT NULL DEFAULT '0', meta_key varchar(255) DEFAULT NULL, meta_value longtext, PRIMARY KEY (meta_id), KEY comment_id (comment_id), KEY meta_key (meta_key(191))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
	wphx_308_06_exec( "INSERT INTO wp_posts (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_title, post_status, post_name, post_type, guid) VALUES (101, 1, '2026-01-05 10:00:00', '2026-01-05 10:00:00', '2026-01-05 10:00:00', '2026-01-05 10:00:00', 'Alpha launch', 'publish', 'alpha-launch', 'post', 'https://example.test/?p=101'), (102, 1, '2026-01-06 10:00:00', '2026-01-06 10:00:00', '2026-01-06 10:00:00', '2026-01-06 10:00:00', 'Beta report', 'publish', 'beta-report', 'post', 'https://example.test/?p=102'), (103, 1, '2026-01-07 10:00:00', '2026-01-07 10:00:00', '2026-01-07 10:00:00', '2026-01-07 10:00:00', 'Gamma report', 'publish', 'gamma-report', 'post', 'https://example.test/?p=103')" );
	wphx_308_06_exec( "INSERT INTO wp_terms (term_id, name, slug) VALUES (11, 'Alpha Topic', 'alpha-topic'), (12, 'Beta Topic', 'beta-topic'), (13, 'Gamma Topic', 'gamma-topic'), (14, 'Unused Topic', 'unused-topic')" );
	wphx_308_06_exec( "INSERT INTO wp_term_taxonomy (term_taxonomy_id, term_id, taxonomy, description, parent, count) VALUES (110, 11, 'fixture_topic', '', 0, 2), (120, 12, 'fixture_topic', '', 0, 1), (130, 13, 'fixture_topic', '', 0, 1), (140, 14, 'fixture_topic', '', 0, 0)" );
	wphx_308_06_exec( "INSERT INTO wp_term_relationships (object_id, term_taxonomy_id) VALUES (101, 110), (102, 110), (103, 120), (102, 130)" );
	wphx_308_06_exec( "INSERT INTO wp_termmeta (term_id, meta_key, meta_value) VALUES (11, 'fixture_key', 'fixture_value'), (12, 'fixture_key', 'other_value'), (13, 'fixture_key', 'fixture_value')" );
	wphx_308_06_exec( "INSERT INTO wp_comments (comment_ID, comment_post_ID, comment_author, comment_author_email, comment_date, comment_date_gmt, comment_content, comment_approved, comment_type) VALUES (301, 101, 'Fixture Author', 'fixture@example.test', '2026-01-10 10:00:00', '2026-01-10 10:00:00', 'Approved alpha needle', '1', 'comment'), (302, 101, 'Fixture Author', 'fixture@example.test', '2026-01-11 10:00:00', '2026-01-11 10:00:00', 'Hold beta needle', '0', 'comment'), (303, 102, 'Fixture Author', 'fixture@example.test', '2026-01-12 10:00:00', '2026-01-12 10:00:00', 'Approved fixture search', '1', 'trackback'), (304, 102, 'Fixture Author', 'fixture@example.test', '2025-12-31 10:00:00', '2025-12-31 10:00:00', 'Old fixture search', '1', 'comment')" );
	wphx_308_06_exec( "INSERT INTO wp_commentmeta (comment_id, meta_key, meta_value) VALUES (301, 'fixture_key', 'fixture_value'), (302, 'fixture_key', 'other_value'), (303, 'fixture_key', 'fixture_value')" );
	$wpdb->flush();
}

function wphx_308_06_normalize_sql( $sql ) { $sql = preg_replace( '/\s+/', ' ', (string) $sql ); $sql = preg_replace( '/\{[a-f0-9]{64}\}/', '%', $sql ); return trim( $sql ); }
function wphx_308_06_selected_vars( $vars ) { return wp_array_slice_assoc( (array) $vars, array( 'taxonomy', 'fields', 'include', 'orderby', 'order', 'hide_empty', 'number', 'offset', 'meta_key', 'meta_value', 'status', 'type', 'type__in', 'post_id', 'post__in', 'comment__in', 'count', 'no_found_rows', 'paged', 'date_query', 'search' ) ); }
function wphx_308_06_normalize_result_ids( $result, $object_id_field ) { if ( is_numeric( $result ) ) { return (int) $result; } return array_values( array_map( fn( $value ) => is_object( $value ) ? (int) $value->$object_id_field : (int) $value, (array) $result ) ); }
function wphx_308_06_reset_logs() { $GLOBALS['wphx_308_06_actions'] = array(); $GLOBALS['wphx_308_06_filters'] = array(); }
function wphx_308_06_term_case( $id, $args ) {
	wphx_308_06_reset_logs();
	$query = new WP_Term_Query();
	$result = $query->query( array_merge( array( 'cache_results' => false, 'update_term_meta_cache' => false ), $args ) );
	return array( 'id' => $id, 'result' => wphx_308_06_normalize_result_ids( $result, 'term_id' ), 'request' => wphx_308_06_normalize_sql( $query->request ), 'query_vars' => wphx_308_06_selected_vars( $query->query_vars ), 'meta_query' => $query->meta_query instanceof WP_Meta_Query ? array( 'queries' => $query->meta_query->queries, 'clauses' => $query->meta_query->get_clauses() ) : null, 'actions' => $GLOBALS['wphx_308_06_actions'], 'filters' => $GLOBALS['wphx_308_06_filters'] );
}
function wphx_308_06_comment_case( $id, $args ) {
	wphx_308_06_reset_logs();
	$query = new WP_Comment_Query();
	$result = $query->query( array_merge( array( 'fields' => 'ids', 'cache_results' => false, 'update_comment_meta_cache' => false, 'update_comment_post_cache' => false ), $args ) );
	return array( 'id' => $id, 'result' => wphx_308_06_normalize_result_ids( $result, 'comment_ID' ), 'found_comments' => (int) $query->found_comments, 'max_num_pages' => (int) $query->max_num_pages, 'request' => wphx_308_06_normalize_sql( $query->request ), 'query_vars' => wphx_308_06_selected_vars( $query->query_vars ), 'meta_query' => $query->meta_query instanceof WP_Meta_Query ? array( 'queries' => $query->meta_query->queries, 'clauses' => $query->meta_query->get_clauses() ) : null, 'actions' => $GLOBALS['wphx_308_06_actions'], 'filters' => $GLOBALS['wphx_308_06_filters'] );
}

wphx_308_06_reset_database();
register_taxonomy( 'fixture_topic', array( 'post' ), array( 'public' => true, 'hierarchical' => true, 'rewrite' => false ) );

$results = array(
	wphx_308_06_term_case( 'live-term:ids-name-order', array( 'taxonomy' => 'fixture_topic', 'fields' => 'ids', 'hide_empty' => false, 'orderby' => 'name', 'order' => 'DESC', 'number' => 3 ) ),
	wphx_308_06_term_case( 'live-term:include-order', array( 'taxonomy' => 'fixture_topic', 'fields' => 'ids', 'include' => array( 13, 11 ), 'orderby' => 'include', 'hide_empty' => false ) ),
	wphx_308_06_term_case( 'live-term:meta-filter', array( 'taxonomy' => 'fixture_topic', 'fields' => 'ids', 'hide_empty' => false, 'meta_key' => 'fixture_key', 'meta_value' => 'fixture_value', 'orderby' => 'term_id', 'order' => 'ASC' ) ),
	wphx_308_06_term_case( 'live-term:count', array( 'taxonomy' => 'fixture_topic', 'fields' => 'count', 'hide_empty' => false ) ),
	wphx_308_06_comment_case( 'live-comment:approved-post-order', array( 'status' => 'approve', 'type' => 'comment', 'post_id' => 101, 'orderby' => 'comment_date_gmt', 'order' => 'ASC' ) ),
	wphx_308_06_comment_case( 'live-comment:include-order', array( 'comment__in' => array( 303, 301 ), 'orderby' => 'comment__in', 'status' => 'all' ) ),
	wphx_308_06_comment_case( 'live-comment:meta-date-search', array( 'status' => 'approve', 'search' => 'fixture search', 'date_query' => array( array( 'after' => '2026-01-01', 'column' => 'comment_date_gmt' ) ), 'meta_key' => 'fixture_key', 'meta_value' => 'fixture_value', 'orderby' => 'comment_ID', 'order' => 'ASC' ) ),
	wphx_308_06_comment_case( 'live-comment:count', array( 'count' => true, 'status' => 'approve', 'type' => 'comment' ) ),
);

echo json_encode(
	array(
		'mode' => $mode,
		'runtime' => $runtime_id,
		'phpVersion' => PHP_VERSION,
		'database' => array( 'name' => $db_name, 'server_info' => $wpdb->db_server_info(), 'charset' => $wpdb->charset, 'collate' => $wpdb->collate ),
		'coveredFunctionExists' => array( 'wp_parse_id_list' => function_exists( 'wp_parse_id_list' ), 'get_terms' => function_exists( 'get_terms' ), 'get_comments' => function_exists( 'get_comments' ) ),
		'coveredMethodExists' => array( 'WP_Term_Query::query' => method_exists( 'WP_Term_Query', 'query' ), 'WP_Term_Query::get_terms' => method_exists( 'WP_Term_Query', 'get_terms' ), 'WP_Comment_Query::query' => method_exists( 'WP_Comment_Query', 'query' ), 'WP_Comment_Query::get_comments' => method_exists( 'WP_Comment_Query', 'get_comments' ), 'WP_Meta_Query::get_sql' => method_exists( 'WP_Meta_Query', 'get_sql' ), 'wpdb::get_results' => method_exists( $wpdb, 'get_results' ), 'wpdb::get_col' => method_exists( $wpdb, 'get_col' ), 'wpdb::get_var' => method_exists( $wpdb, 'get_var' ) ),
		'cases' => $results,
		'php_errors' => $GLOBALS['wphx_308_06_php_errors'],
	),
	JSON_UNESCAPED_SLASHES
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
  const name = `wordpresshx-wphx-308-06-${runtime.id}-${process.pid}`;
  const network = `wordpresshx-wphx-308-06-${runtime.id}-${process.pid}`;
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-308-taxonomy-comment-live-db`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/taxonomy-comment-live-db-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "taxonomy/comment live DB SQL-result fixture",
      area: "wp-includes/class-wp-term-query.php wp-includes/class-wp-comment-query.php",
      public_contract:
        "Mirrored upstream WP_Term_Query, WP_Comment_Query, WP_Meta_Query, taxonomy/comment functions, and wpdb source execute selected query cases against a locked live MySQL runtime. This is live SQL/result parity evidence only; it does not claim Haxe-owned public PHP replacement."
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
        "Replace the candidate side with Haxe-owned taxonomy/comment public PHP output and keep this live DB fixture green before claiming migrated WPHX-308 ownership."
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
        "npm run wp:core:wphx-308-taxonomy-comment-live-db",
        "npm run wp:core:wphx-308-taxonomy-comment-live-db:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-308-06-taxonomy-comment-live-db-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function receipt(manifestSha) {
  return {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-308-06-taxonomy-comment-live-db-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      {
        path: OUT,
        role: "taxonomy/comment live DB SQL-result parity manifest",
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
      "npm run wp:core:wphx-308-taxonomy-comment-live-db",
      "npm run wp:core:wphx-308-taxonomy-comment-live-db:check",
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
const queryStateFixture = readJson(QUERY_STATE_FIXTURE);
const phpDbClientImages = readJson(PHP_DB_CLIENT_IMAGES);
const dbRuntimes = dbRuntimeRecords(lock);
const phpClients = phpClientRecords(lock);

if (!maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"])) {
  console.error(JSON.stringify({ status: "failed", error: "docker server unavailable; WPHX-308.06 requires live DB containers" }, null, 2));
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
  schema: "wphx.wp-core-taxonomy-comment-live-db-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  inputs: {
    taxonomy_comment_query_state_fixture: inputRecord(QUERY_STATE_FIXTURE),
    php_db_client_images: inputRecord(PHP_DB_CLIENT_IMAGES),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domains: ["taxonomy", "terms", "termmeta", "comments", "commentmeta", "WP_Term_Query SQL assembly", "WP_Comment_Query SQL assembly", "wpdb live execution"],
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    follows: ["WPHX-308.06", "WPHX-305.09"],
    inherited_query_state_fixture: {
      manifest: QUERY_STATE_FIXTURE,
      validation_result: queryStateFixture.validation_result
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
      "WP_Term_Query SQL request construction for term, include, meta, order, limit, and count cases",
      "WP_Comment_Query SQL request construction for status, type, post, include, search, date, meta, and count cases",
      "WP_Meta_Query termmeta/commentmeta join/where generation against live rows",
      "ID result materialization through wpdb::get_col"
    ],
    native_boundaries: [
      {
        id: "minimal-wordpress-service-stubs",
        reason:
          "This fixture isolates taxonomy/comment query SQL/result behavior. Generic WordPress services around hooks, cache, options, and post objects are deterministic stubs while the query classes, taxonomy/comment functions, and wpdb execution remain upstream PHP."
      },
      {
        id: "mysql-only-initial-slice",
        reason:
          "WPHX-308.06 starts with the locked MySQL 8.4 runtime. MariaDB and upstream PHPUnit ratchets remain follow-up closure for the taxonomy/comment workset."
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
      owner: "WPHX-308",
      detail: "The candidate side remains a copied WordPress oracle source tree until taxonomy/comment query behavior moves behind Haxe-owned public PHP output."
    },
    {
      id: "full-wordpress-bootstrap-not-used",
      owner: "WPHX-308",
      detail: "The fixture stubs surrounding WordPress services to isolate query SQL/result parity. Installed WordPress and upstream PHPUnit query suites remain required closure gates."
    },
    {
      id: "mariadb-and-php-version-matrix-deferred",
      owner: "WPHX-308",
      detail: "This first live taxonomy/comment query slice uses MySQL 8.4 with PHP 8.4 DB-client. MariaDB and additional PHP minors are intentionally left for a later matrix expansion."
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
