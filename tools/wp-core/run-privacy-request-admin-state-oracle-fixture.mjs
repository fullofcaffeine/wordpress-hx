#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.11",
  external_ref: "WPHX-312.11",
  title: "WPHX-312.11 — Add privacy request admin state oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-privacy-request-admin-state-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-11";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-11-privacy-request-admin-state-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-11-privacy-request-admin-state-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-11-privacy-request-admin-state-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const PRIVACY_MAIL_FIXTURE = "manifests/wp-core/wphx-312-07-privacy-request-mail-oracle-fixture.v1.json";
const INSTALLED_GATE = "manifests/wp-core/wphx-312-09-http-mail-feed-embed-installed-gate.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-user-request.php",
  "src/wp-includes/user.php",
  "src/wp-admin/includes/privacy-tools.php",
  "src/wp-admin/includes/class-wp-privacy-requests-table.php"
];
const COVERED_SYMBOLS = [
  "WP_User_Request::__construct",
  "wp_get_user_request",
  "wp_user_request_action_description",
  "wp_send_user_request",
  "wp_generate_user_request_key",
  "_wp_privacy_resend_request",
  "_wp_privacy_completed_request",
  "WP_Privacy_Requests_Table::get_columns",
  "WP_Privacy_Requests_Table::get_admin_url",
  "WP_Privacy_Requests_Table::get_sortable_columns",
  "WP_Privacy_Requests_Table::get_request_counts",
  "WP_Privacy_Requests_Table::get_bulk_actions",
  "WP_Privacy_Requests_Table::prepare_items",
  "WP_Privacy_Requests_Table::process_bulk_action",
  "WP_Privacy_Requests_Table::column_status",
  "WP_Privacy_Requests_Table::column_cb",
  "WP_Privacy_Requests_Table::column_email",
  "WP_Query",
  "wp_update_post",
  "wp_delete_post"
];
const FIXTURE_CASES = [
  { id: "privacy-admin:request-object-normalization", focus: "WP_User_Request normalizes post fields, metadata timestamps, request data, and action descriptions" },
  { id: "privacy-admin:table-counts-columns", focus: "privacy request table exposes columns, admin URL, sortable columns, bulk actions, and status counts for export requests" },
  { id: "privacy-admin:prepare-items-filter-sort", focus: "privacy request table builds filtered/sorted WP_Query args and maps posts to user request objects" },
  { id: "privacy-admin:bulk-complete", focus: "bulk complete marks selected requests completed and records completion timestamp/update side effects" },
  { id: "privacy-admin:bulk-resend-delete", focus: "bulk resend regenerates confirmation mail state and bulk delete records success/failure notices" }
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
$case = $argv[2];

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'DAY_IN_SECONDS', 86400 );
if ( ! defined( 'ARRAY_A' ) ) {
\tdefine( 'ARRAY_A', 'ARRAY_A' );
}

$GLOBALS['wphx_312_11_case'] = $case;
$GLOBALS['wphx_312_11_errors'] = array();
$GLOBALS['wphx_312_11_filters'] = array();
$GLOBALS['wphx_312_11_actions'] = array();
$GLOBALS['wphx_312_11_mail'] = array();
$GLOBALS['wphx_312_11_post_updates'] = array();
$GLOBALS['wphx_312_11_post_deletes'] = array();
$GLOBALS['wphx_312_11_meta_updates'] = array();
$GLOBALS['wphx_312_11_settings_errors'] = array();
$GLOBALS['wphx_312_11_queries'] = array();
$GLOBALS['wphx_312_11_cache'] = array();
$GLOBALS['wphx_312_11_posts'] = array(
\t801 => array( 'ID' => 801, 'post_author' => 9, 'post_title' => 'pending-export@example.test', 'post_name' => 'export_personal_data', 'post_status' => 'request-pending', 'post_type' => 'user_request', 'post_date_gmt' => '2026-06-01 10:00:00', 'post_modified_gmt' => '2026-06-01 10:10:00', 'post_content' => '{\"origin\":\"self-service\"}', 'post_password' => '' ),
\t802 => array( 'ID' => 802, 'post_author' => 0, 'post_title' => 'confirmed-export@example.test', 'post_name' => 'export_personal_data', 'post_status' => 'request-confirmed', 'post_type' => 'user_request', 'post_date_gmt' => '2026-06-02 11:00:00', 'post_modified_gmt' => '2026-06-02 11:10:00', 'post_content' => '{\"origin\":\"admin\"}', 'post_password' => 'stored-confirm-key' ),
\t803 => array( 'ID' => 803, 'post_author' => 0, 'post_title' => 'completed-export@example.test', 'post_name' => 'export_personal_data', 'post_status' => 'request-completed', 'post_type' => 'user_request', 'post_date_gmt' => '2026-06-03 12:00:00', 'post_modified_gmt' => '2026-06-03 12:10:00', 'post_content' => '{\"origin\":\"completed\"}', 'post_password' => '' ),
\t804 => array( 'ID' => 804, 'post_author' => 0, 'post_title' => 'failed-erase@example.test', 'post_name' => 'remove_personal_data', 'post_status' => 'request-failed', 'post_type' => 'user_request', 'post_date_gmt' => '2026-06-04 13:00:00', 'post_modified_gmt' => '2026-06-04 13:10:00', 'post_content' => '{\"origin\":\"failed\"}', 'post_password' => '' ),
\t805 => array( 'ID' => 805, 'post_author' => 14, 'post_title' => 'confirmed-erase@example.test', 'post_name' => 'remove_personal_data', 'post_status' => 'request-confirmed', 'post_type' => 'user_request', 'post_date_gmt' => '2026-06-05 14:00:00', 'post_modified_gmt' => '2026-06-05 14:10:00', 'post_content' => '{\"origin\":\"admin\"}', 'post_password' => 'erase-confirm-key' ),
);
$GLOBALS['wphx_312_11_meta'] = array(
\t801 => array(),
\t802 => array( '_wp_user_request_confirmed_timestamp' => 1780400000 ),
\t803 => array( '_wp_user_request_confirmed_timestamp' => 1780480000, '_wp_user_request_completed_timestamp' => 1780483600 ),
\t804 => array(),
\t805 => array( '_wp_user_request_confirmed_timestamp' => 1780560000 ),
);

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_312_11_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WP_Error {
\tprivate $code;
\tprivate $message;
\tpublic function __construct( $code = '', $message = '' ) {
\t\t$this->code = $code;
\t\t$this->message = $message;
\t}
\tpublic function get_error_code() { return $this->code; }
\tpublic function get_error_message() { return $this->message; }
}

class WP_User {
\tpublic $ID = 14;
\tpublic $user_email = 'confirmed-erase@example.test';
}

class WP_Query {
\tpublic $posts = array();
\tpublic $found_posts = 0;
\tpublic function __construct( $args = array() ) {
\t\t$GLOBALS['wphx_312_11_queries'][] = $args;
\t\t$posts = array();
\t\tforeach ( $GLOBALS['wphx_312_11_posts'] as $post ) {
\t\t\tif ( isset( $args['post_type'] ) && $args['post_type'] !== $post['post_type'] ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif ( isset( $args['post_name__in'] ) && ! in_array( $post['post_name'], (array) $args['post_name__in'], true ) ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif ( isset( $args['title'] ) && $args['title'] !== $post['post_title'] ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif ( isset( $args['post_status'] ) && 'any' !== $args['post_status'] && ! in_array( $post['post_status'], (array) $args['post_status'], true ) ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif ( isset( $args['s'] ) && '' !== $args['s'] && false === strpos( $post['post_title'], $args['s'] ) ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\t$posts[] = (object) $post;
\t\t}
\t\tif ( isset( $args['orderby'] ) && 'post_title' === $args['orderby'] ) {
\t\t\tusort(
\t\t\t\t$posts,
\t\t\t\tfunction ( $a, $b ) use ( $args ) {
\t\t\t\t\t$result = strcmp( $a->post_title, $b->post_title );
\t\t\t\t\treturn isset( $args['order'] ) && 'DESC' === $args['order'] ? -$result : $result;
\t\t\t\t}
\t\t\t);
\t\t}
\t\t$this->found_posts = count( $posts );
\t\tif ( isset( $args['fields'] ) && 'ids' === $args['fields'] ) {
\t\t\t$this->posts = array_map( fn( $post ) => $post->ID, $posts );
\t\t} else {
\t\t\t$this->posts = $posts;
\t\t}
\t}
}

class WPHX_WPDB {
\tpublic $posts = 'wp_posts';
\tpublic $last_prepare_args = array();
\tpublic function prepare( $query, ...$args ) {
\t\t$this->last_prepare_args = $args;
\t\treturn $query;
\t}
\tpublic function get_results( $query, $output = ARRAY_A ) {
\t\t$request_type = $this->last_prepare_args[1] ?? '';
\t\t$rows = array();
\t\tforeach ( $GLOBALS['wphx_312_11_posts'] as $post ) {
\t\t\tif ( 'user_request' !== $post['post_type'] || $request_type !== $post['post_name'] ) {
\t\t\t\tcontinue;
\t\t\t}
\t\t\tif ( ! isset( $rows[ $post['post_status'] ] ) ) {
\t\t\t\t$rows[ $post['post_status'] ] = array( 'post_status' => $post['post_status'], 'num_posts' => 0 );
\t\t\t}
\t\t\t++$rows[ $post['post_status'] ]['num_posts'];
\t\t}
\t\treturn array_values( $rows );
\t}
}
$GLOBALS['wpdb'] = new WPHX_WPDB();

class WP_List_Table {
\tpublic $items = array();
\tpublic $_pagination_args = array();
\tpublic $screen;
\tpublic function current_action() {
\t\tif ( isset( $_REQUEST['action'] ) && '-1' !== $_REQUEST['action'] ) {
\t\t\treturn $_REQUEST['action'];
\t\t}
\t\treturn $_REQUEST['action2'] ?? false;
\t}
\tprotected function set_pagination_args( $args ) { $this->_pagination_args = $args; }
\tprotected function get_views_links( $link_data = array() ) { return $link_data; }
\tprotected function row_actions( $actions, $always_visible = false ) { return empty( $actions ) ? '' : implode( ' | ', array_values( $actions ) ); }
\tprotected function get_items_per_page( $option, $default_value = 20 ) { return 2; }
\tprotected function single_row_columns( $item ) {}
}

function __( $text ) { return $text; }
function esc_html__( $text ) { return $text; }
function _n( $single, $plural, $number ) { return 1 === (int) $number ? $single : $plural; }
function _nx( $single, $plural, $number, $context ) { return _n( $single, $plural, $number ); }
function translate_nooped_plural( $nooped_plural, $count ) { return 1 === (int) $count ? $nooped_plural['singular'] : $nooped_plural['plural']; }
function number_format_i18n( $number ) { return (string) $number; }
function absint( $maybeint ) { return abs( (int) $maybeint ); }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function sanitize_key( $key ) { return preg_replace( '/[^a-z0-9_\\-]/', '', strtolower( (string) $key ) ); }
function sanitize_text_field( $str ) { return trim( strip_tags( (string) $str ) ); }
function sanitize_email( $email ) { return strtolower( trim( (string) $email ) ); }
function is_email( $email ) { return false !== strpos( (string) $email, '@' ) ? $email : false; }
function wp_unslash( $value ) { return $value; }
function wp_parse_id_list( $input_list ) { return array_values( array_filter( array_map( 'absint', (array) $input_list ) ) ); }
function wp_json_encode( $value ) { return json_encode( $value ); }
function wp_specialchars_decode( $text, $quote_style = ENT_NOQUOTES ) { return html_entity_decode( $text, $quote_style, 'UTF-8' ); }
function esc_url( $value ) { return (string) $value; }
function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
function sanitize_url( $value ) { return trim( strip_tags( (string) $value ) ); }
function human_time_diff( $from, $to = 0 ) { return 'fixture time'; }
function date_i18n( $format, $timestamp = false ) { return '2026/06/27'; }
function current_time( $type, $gmt = false ) { return $gmt ? '2026-06-27 00:00:00' : '2026-06-26 18:00:00'; }
function admin_url( $path = '', $scheme = 'admin' ) { return 'https://example.test/wp-admin/' . ltrim( $path, '/' ); }
function home_url( $path = '', $scheme = null ) { return 'https://example.test' . $path; }
function wp_login_url() { return 'https://example.test/wp-login.php'; }
function get_option( $name, $default = false ) { return 'blogname' === $name ? 'Fixture &amp; Site' : $default; }
function get_site_option( $name, $default = false ) { return 'admin_email' === $name ? 'admin@example.test' : $default; }
function get_locale() { return 'en_US'; }
function switch_to_user_locale( $user_id ) { return true; }
function switch_to_locale( $locale ) { return true; }
function restore_previous_locale() { return true; }
function wp_generate_password( $length = 12, $special_chars = true, $extra_special_chars = false ) { return 'fixture-confirm-key'; }
function wp_fast_hash( $value ) { return 'hash:' . $value; }
function wp_verify_fast_hash( $value, $hash ) { return 'hash:' . $value === $hash; }
function wp_mail( $to, $subject, $message, $headers = '', $attachments = array(), $embeds = array() ) {
\t$GLOBALS['wphx_312_11_mail'][] = array( 'to' => $to, 'subject' => $subject, 'headers' => $headers, 'message_sha256' => hash( 'sha256', $message ) );
\treturn true;
}
function add_query_arg( $args, $url = '' ) {
\tif ( is_array( $args ) ) {
\t\treturn $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . http_build_query( $args );
\t}
\treturn $url;
}
function get_user_by( $field, $value ) {
\tif ( 'email' === $field && 'confirmed-erase@example.test' === $value ) {
\t\t$user = new WP_User();
\t\treturn $user;
\t}
\treturn false;
}
function get_post( $post_id ) {
\t$post_id = absint( $post_id );
\treturn isset( $GLOBALS['wphx_312_11_posts'][ $post_id ] ) ? (object) $GLOBALS['wphx_312_11_posts'][ $post_id ] : null;
}
function get_post_meta( $post_id, $key = '', $single = false ) {
\t$meta = $GLOBALS['wphx_312_11_meta'][ absint( $post_id ) ] ?? array();
\tif ( '' === $key ) {
\t\treturn $meta;
\t}
\t$value = $meta[ $key ] ?? '';
\treturn $single ? $value : array( $value );
}
function update_post_meta( $post_id, $key, $value ) {
\t$recorded_value = '_wp_user_request_completed_timestamp' === $key ? 'dynamic:completed_timestamp' : $value;
\t$GLOBALS['wphx_312_11_meta_updates'][] = array( 'post_id' => absint( $post_id ), 'key' => $key, 'value' => $recorded_value );
\t$GLOBALS['wphx_312_11_meta'][ absint( $post_id ) ][ $key ] = $recorded_value;
\treturn true;
}
function wp_update_post( $postarr = array(), $wp_error = false, $fire_after_hooks = true ) {
\t$id = absint( $postarr['ID'] ?? 0 );
\tif ( ! isset( $GLOBALS['wphx_312_11_posts'][ $id ] ) ) {
\t\treturn $wp_error ? new WP_Error( 'invalid_post', 'Invalid post.' ) : 0;
\t}
\tforeach ( $postarr as $key => $value ) {
\t\tif ( 'ID' !== $key ) {
\t\t\t$GLOBALS['wphx_312_11_posts'][ $id ][ $key ] = $value;
\t\t}
\t}
\t$GLOBALS['wphx_312_11_post_updates'][] = $postarr;
\treturn $id;
}
function wp_insert_post( $postarr = array(), $wp_error = false ) {
\t$id = 900 + count( $GLOBALS['wphx_312_11_posts'] );
\t$postarr['ID'] = $id;
\t$GLOBALS['wphx_312_11_posts'][ $id ] = $postarr;
\t$GLOBALS['wphx_312_11_post_updates'][] = $postarr;
\treturn $id;
}
function wp_delete_post( $post_id = 0, $force_delete = false ) {
\t$post_id = absint( $post_id );
\t$GLOBALS['wphx_312_11_post_deletes'][] = array( 'post_id' => $post_id, 'force_delete' => (bool) $force_delete, 'existed' => isset( $GLOBALS['wphx_312_11_posts'][ $post_id ] ) );
\tif ( ! isset( $GLOBALS['wphx_312_11_posts'][ $post_id ] ) ) {
\t\treturn false;
\t}
\t$post = (object) $GLOBALS['wphx_312_11_posts'][ $post_id ];
\tunset( $GLOBALS['wphx_312_11_posts'][ $post_id ] );
\treturn $post;
}
function get_post_status( $post_id ) {
\t$post = get_post( $post_id );
\treturn $post ? $post->post_status : false;
}
function get_post_status_object( $post_status ) {
\t$labels = array(
\t\t'request-pending' => array( 'Pending', 'Pending <span class=\"count\">(%s)</span>' ),
\t\t'request-confirmed' => array( 'Confirmed', 'Confirmed <span class=\"count\">(%s)</span>' ),
\t\t'request-failed' => array( 'Failed', 'Failed <span class=\"count\">(%s)</span>' ),
\t\t'request-completed' => array( 'Completed', 'Completed <span class=\"count\">(%s)</span>' ),
\t);
\tif ( ! isset( $labels[ $post_status ] ) ) {
\t\treturn null;
\t}
\treturn (object) array( 'label' => $labels[ $post_status ][0], 'label_count' => array( 'singular' => $labels[ $post_status ][1], 'plural' => $labels[ $post_status ][1] ) );
}
function get_post_stati( $args = array(), $output = 'names', $operator = 'and' ) {
\treturn array( 'request-pending', 'request-confirmed', 'request-failed', 'request-completed' );
}
function _wp_privacy_statuses() {
\treturn array(
\t\t'request-pending' => 'Pending',
\t\t'request-confirmed' => 'Confirmed',
\t\t'request-failed' => 'Failed',
\t\t'request-completed' => 'Completed',
\t);
}
function wp_cache_get( $key, $group = '' ) {
\t$cache_key = $group . ':' . $key;
\treturn $GLOBALS['wphx_312_11_cache'][ $cache_key ] ?? false;
}
function wp_cache_set( $key, $value, $group = '' ) {
\t$GLOBALS['wphx_312_11_cache'][ $group . ':' . $key ] = $value;
\treturn true;
}
function check_admin_referer( $action = -1, $query_arg = '_wpnonce' ) {
\t$GLOBALS['wphx_312_11_actions'][] = array( 'check_admin_referer' => $action );
\treturn true;
}
function add_settings_error( $setting, $code, $message, $type = 'error' ) {
\t$GLOBALS['wphx_312_11_settings_errors'][] = compact( 'setting', 'code', 'message', 'type' );
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_312_11_filters'][] = array( 'hook' => $hook_name, 'value_type' => gettype( $value ), 'arg_count' => count( $args ) );
\treturn $value;
}
function apply_filters_deprecated( $hook_name, $args, $version, $replacement = '', $message = '' ) { return $args[0]; }
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_312_11_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
}

require ABSPATH . WPINC . '/class-wp-user-request.php';
require ABSPATH . WPINC . '/user.php';
require ABSPATH . 'wp-admin/includes/privacy-tools.php';
require ABSPATH . 'wp-admin/includes/class-wp-privacy-requests-table.php';

class WPHX_Privacy_Request_Table extends WP_Privacy_Requests_Table {
\tprotected $post_type = 'user_request';
\tpublic function __construct( $request_type ) {
\t\t$this->request_type = $request_type;
\t\t$this->screen = (object) array( 'id' => str_replace( '_', '-', $request_type ) );
\t}
\tpublic function expose_admin_url() { return $this->get_admin_url(); }
\tpublic function expose_sortable_columns() { return $this->get_sortable_columns(); }
\tpublic function expose_default_primary_column_name() { return $this->get_default_primary_column_name(); }
\tpublic function expose_request_counts() { return (array) $this->get_request_counts(); }
\tpublic function expose_bulk_actions() { return $this->get_bulk_actions(); }
\tpublic function expose_prepare_items() {
\t\t$this->prepare_items();
\t\treturn array(
\t\t\t'items' => array_map( 'wphx_312_11_request_summary', $this->items ),
\t\t\t'pagination' => $this->_pagination_args,
\t\t);
\t}
\tpublic function expose_status_column( $item ) {
\t\tob_start();
\t\t$return = $this->column_status( $item );
\t\t$output = ob_get_clean();
\t\treturn $return ? $return : $output;
\t}
\tpublic function expose_created_column( $item ) { return $this->column_created_timestamp( $item ); }
\tpublic function expose_checkbox_column( $item ) { return $this->column_cb( $item ); }
\tpublic function expose_email_column( $item ) { return $this->column_email( $item ); }
}

function wphx_312_11_request_summary( $request ) {
\tif ( ! $request ) {
\t\treturn null;
\t}
\treturn array(
\t\t'ID' => $request->ID,
\t\t'user_id' => $request->user_id,
\t\t'email' => $request->email,
\t\t'action_name' => $request->action_name,
\t\t'status' => $request->status,
\t\t'created_timestamp' => $request->created_timestamp,
\t\t'modified_timestamp' => $request->modified_timestamp,
\t\t'confirmed_timestamp' => $request->confirmed_timestamp,
\t\t'completed_timestamp' => $request->completed_timestamp,
\t\t'request_data' => $request->request_data,
\t\t'confirm_key' => $request->confirm_key,
\t);
}

function wphx_312_11_side_effects() {
\treturn array(
\t\t'post_updates' => $GLOBALS['wphx_312_11_post_updates'],
\t\t'post_deletes' => $GLOBALS['wphx_312_11_post_deletes'],
\t\t'meta_updates' => $GLOBALS['wphx_312_11_meta_updates'],
\t\t'settings_errors' => $GLOBALS['wphx_312_11_settings_errors'],
\t\t'mail' => $GLOBALS['wphx_312_11_mail'],
\t\t'actions' => $GLOBALS['wphx_312_11_actions'],
\t\t'filters' => $GLOBALS['wphx_312_11_filters'],
\t\t'queries' => $GLOBALS['wphx_312_11_queries'],
\t);
}

switch ( $case ) {
\tcase 'request-object-normalization':
\t\t$request = wp_get_user_request( 802 );
\t\t$result = array(
\t\t\t'request' => wphx_312_11_request_summary( $request ),
\t\t\t'descriptions' => array(
\t\t\t\t'export' => wp_user_request_action_description( 'export_personal_data' ),
\t\t\t\t'erase' => wp_user_request_action_description( 'remove_personal_data' ),
\t\t\t\t'custom' => wp_user_request_action_description( 'custom_action' ),
\t\t\t),
\t\t);
\t\tbreak;
\tcase 'table-counts-columns':
\t\t$_REQUEST = array();
\t\t$table = new WPHX_Privacy_Request_Table( 'export_personal_data' );
\t\t$result = array(
\t\t\t'columns' => $table->get_columns(),
\t\t\t'admin_url' => $table->expose_admin_url(),
\t\t\t'sortable_columns' => $table->expose_sortable_columns(),
\t\t\t'default_primary_column' => $table->expose_default_primary_column_name(),
\t\t\t'bulk_actions' => $table->expose_bulk_actions(),
\t\t\t'counts' => $table->expose_request_counts(),
\t\t);
\t\tbreak;
\tcase 'prepare-items-filter-sort':
\t\t$_REQUEST = array( 'filter-status' => 'request-confirmed', 'orderby' => 'requester', 'order' => 'ASC', 's' => 'confirmed', 'paged' => 1 );
\t\t$table = new WPHX_Privacy_Request_Table( 'export_personal_data' );
\t\t$prepared = $table->expose_prepare_items();
\t\t$item = wp_get_user_request( 802 );
\t\t$result = array(
\t\t\t'prepared' => $prepared,
\t\t\t'last_query_args' => end( $GLOBALS['wphx_312_11_queries'] ),
\t\t\t'status_column' => $table->expose_status_column( $item ),
\t\t\t'created_column' => $table->expose_created_column( $item ),
\t\t\t'checkbox_column_sha256' => hash( 'sha256', $table->expose_checkbox_column( $item ) ),
\t\t\t'email_column_sha256' => hash( 'sha256', $table->expose_email_column( $item ) ),
\t\t);
\t\tbreak;
\tcase 'bulk-complete':
\t\t$_REQUEST = array( 'action' => 'complete', 'request_id' => array( 802, 805 ) );
\t\t$table = new WPHX_Privacy_Request_Table( 'export_personal_data' );
\t\t$table->process_bulk_action();
\t\t$result = array(
\t\t\t'post_statuses' => array( 802 => get_post_status( 802 ), 805 => get_post_status( 805 ) ),
\t\t\t'side_effects' => wphx_312_11_side_effects(),
\t\t);
\t\tbreak;
\tcase 'bulk-resend-delete':
\t\t$_REQUEST = array( 'action' => 'resend', 'request_id' => array( 801 ) );
\t\t$table = new WPHX_Privacy_Request_Table( 'export_personal_data' );
\t\t$table->process_bulk_action();
\t\t$resend = wphx_312_11_side_effects();
\t\t$_REQUEST = array( 'action' => 'delete', 'request_id' => array( 804, 999 ) );
\t\t$table = new WPHX_Privacy_Request_Table( 'remove_personal_data' );
\t\t$table->process_bulk_action();
\t\t$result = array(
\t\t\t'post_statuses' => array( 801 => get_post_status( 801 ), 804 => get_post_status( 804 ) ),
\t\t\t'resend_side_effects' => $resend,
\t\t\t'combined_side_effects' => wphx_312_11_side_effects(),
\t\t);
\t\tbreak;
\tdefault:
\t\t$result = new WP_Error( 'unknown_case', $case );
}

echo json_encode(
\tarray(
\t\t'case' => $case,
\t\t'result' => $result instanceof WP_Error ? array( 'wp_error' => $result->get_error_code(), 'message' => $result->get_error_message() ) : $result,
\t\t'php_errors' => $GLOBALS['wphx_312_11_errors'],
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(root, mode) {
  return JSON.parse(command("php", [PROBE, root, mode]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-privacy-request-admin-state-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/privacy-request-admin-state-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "privacy request admin-management state handoff behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 privacy request state and privacy request table source against deterministic post, metadata, query, cache, mail, and admin-notice stubs. It observes the request-management state that feeds admin list tables, but it does not claim broad WPHX-315 admin list-table ownership or full rendered admin screen parity."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-admin-state-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed privacy request management, broad WPHX-315 admin list-table, selected upstream tests, real mail/DB side-effect, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-privacy-request-admin-state-oracle-fixture",
        "npm run wp:core:wphx-312-privacy-request-admin-state-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-11-privacy-request-admin-state-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const caseIds = ["request-object-normalization", "table-counts-columns", "prepare-items-filter-sort", "bulk-complete", "bulk-resend-delete"];
const oracle = Object.fromEntries(caseIds.map((id) => [id, runProbe(ORACLE_ROOT, id)]));
const candidate = Object.fromEntries(caseIds.map((id) => [id, runProbe(CANDIDATE_ROOT, id)]));
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
  schema: "wphx.wp-core-privacy-request-admin-state-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    privacy_mail_fixture_manifest: inputRecord(PRIVACY_MAIL_FIXTURE),
    installed_gate_manifest: inputRecord(INSTALLED_GATE),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord)
  },
  fixture: {
    cases: FIXTURE_CASES,
    covered_symbols: COVERED_SYMBOLS,
    source_files: SOURCE_FILES,
    probe: { path: PROBE, sha256: sha256File(PROBE) },
    side_effect_policy: {
      real_email_delivery: false,
      real_database_writes: false,
      installed_admin_routing: false,
      full_wp_list_table_rendering: false
    },
    public_abi_policy: {
      public_php_replacement_claimed: false,
      copied_oracle_public_php: true,
      adapter_contract_foundation: CONTRACT,
      installed_wordpress_behavior_claimed: false,
      admin_list_table_domain_claimed: false
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
      id: "admin-list-table-rendering-not-claimed",
      owner: "WPHX-315",
      detail: "This fixture observes privacy request table state and selected column outputs through a harness subclass. Full WP_List_Table rendering, screen options, admin page chrome, and broad admin screen ownership remain WPHX-315 work."
    },
    {
      id: "installed-privacy-management-routing-not-executed",
      owner: ISSUE.external_ref,
      detail: "The fixture bypasses browser/admin routing, nonce creation, capability checks, and request submission forms. Installed privacy management routes remain later distribution work."
    },
    {
      id: "real-mail-and-database-side-effects-not-executed",
      owner: ISSUE.external_ref,
      detail: "Mail delivery, database writes, cache persistence, and post deletion are deterministic in-process observations, not live operational side effects."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    fixture_cases: FIXTURE_CASES.length,
    covered_symbols: COVERED_SYMBOLS.length,
    observations_match: observationsMatch,
    public_php_replacement_claimed: false,
    admin_list_table_domain_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-312-11-privacy-request-admin-state-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "privacy request admin-state oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle privacy admin-state boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-312-privacy-request-admin-state-oracle-fixture",
    "npm run wp:core:wphx-312-privacy-request-admin-state-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
    "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
    "receipt:wphx-312-07-privacy-request-mail-oracle-fixture",
    "receipt:wphx-312-09-http-mail-feed-embed-installed-gate",
    "receipt:wphx-312-10-http-mail-feed-embed-upstream-phpunit-ratchet-groups"
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
