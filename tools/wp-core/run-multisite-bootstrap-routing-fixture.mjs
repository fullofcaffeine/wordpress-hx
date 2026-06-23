#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.11.4",
  external_ref: "WPHX-317.05",
  title: "Build multisite bootstrap and domain-path routing fixtures"
};
const OUT_ROOT = "build/wp-core/wphx-317-05";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-317-05-multisite-bootstrap-routing-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-317-05-multisite-bootstrap-routing-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-317-05-multisite-bootstrap-routing-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-317-01-multisite-network-surface.v1.json";
const SITE_NETWORK_QUERY = "manifests/wp-core/wphx-317-04-site-network-query-fixture.v1.json";
const RECORDED_AT = "2026-06-23T05:20:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-network.php",
  "src/wp-includes/class-wp-site.php",
  "src/wp-includes/ms-load.php"
];

const COVERED_SYMBOLS = [
  "wp_get_active_network_plugins",
  "ms_site_check",
  "get_network_by_path",
  "get_site_by_path",
  "ms_load_current_site_and_network",
  "ms_not_installed",
  "WP_Network::get_by_path",
  "WP_Network::get_instance",
  "WP_Site::get_instance"
];

const FIXTURE_CASES = [
  { id: "plugins:active-network-plugin-filtering", symbol: "wp_get_active_network_plugins", focus: "sorted sitewide plugin keys, validate_file rejection, .php suffix check, and file-existence filtering" },
  { id: "route:site-by-path-segments-and-www", symbol: "get_site_by_path", focus: "path-segment truncation, longest path selection, and www/non-www domain fallback" },
  { id: "route:network-by-path-domain-path", symbol: "get_network_by_path/WP_Network::get_by_path", focus: "domain suffix candidates, path candidates, and longest domain/path ordering" },
  { id: "bootstrap:subdirectory-network-first", symbol: "ms_load_current_site_and_network", focus: "subdirectory bootstrap resolves network first, populates current_site/current_blog, and fires no not-found actions" },
  { id: "bootstrap:subdomain-site-missing-redirect", symbol: "ms_load_current_site_and_network", focus: "subdomain bootstrap resolves network without a site and returns signup redirect destination" },
  { id: "bootstrap:constant-defined-network", symbol: "ms_load_current_site_and_network", focus: "DOMAIN_CURRENT_SITE/PATH_CURRENT_SITE constants route through configured current network and first path segment" },
  { id: "status:site-check-dropins", symbol: "ms_site_check", focus: "deleted and archived/spam sites return the expected content drop-in paths before wp_die fallback" },
  { id: "failure:ms-not-installed-admin", symbol: "ms_not_installed", focus: "admin failure path builds database/table diagnostics and exits through wp_die with response 500" }
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
  mkdirSync(`${root}/wp-content/plugins/alpha`, { recursive: true });
  mkdirSync(`${root}/wp-content/plugins/beta`, { recursive: true });
  mkdirSync(`${root}/wp-content/plugins/not-php`, { recursive: true });
  writeFileSync(`${root}/wp-content/plugins/alpha/network.php`, "<?php\n");
  writeFileSync(`${root}/wp-content/plugins/beta/main.php`, "<?php\n");
  writeFileSync(`${root}/wp-content/plugins/not-php/readme.txt`, "fixture\n");
  writeFileSync(`${root}/wp-content/blog-deleted.php`, "<?php echo 'deleted dropin';\n");
  writeFileSync(`${root}/wp-content/blog-suspended.php`, "<?php echo 'suspended dropin';\n");
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
\t\tif ( null !== $error && in_array( $error['type'], array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR ), true ) ) {
\t\t\tfwrite( STDERR, json_encode( $error, JSON_UNESCAPED_SLASHES ) . PHP_EOL );
\t\t}
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_PLUGIN_DIR', $root . '/wp-content/plugins' );
define( 'WP_DEBUG', false );
define( 'MULTISITE', true );
define( 'DB_NAME', 'wphx_fixture' );

class WPHX_317_05_WP_Die extends Exception {
\tpublic $title;
\tpublic $args;
\tpublic function __construct( $message, $title = '', $args = array() ) {
\t\tparent::__construct( (string) $message );
\t\t$this->title = $title;
\t\t$this->args = $args;
\t}
}

class WPHX_317_05_Fake_WPDB {
\tpublic $base_prefix = 'wp_';
\tpublic $prefix = 'wp_';
\tpublic $site = 'wp_site';
\tpublic $blogs = 'wp_blogs';
\tpublic $sitemeta = 'wp_sitemeta';
\tpublic $blogid = 1;
\tpublic $queries = array();
\tpublic $site_table_exists = false;
\tprivate $sites = array();
\tprivate $networks = array();

\tpublic function __construct() {
\t\t$this->sites = array(
\t\t\t1 => array( 'blog_id' => '1', 'domain' => 'network.example.test', 'path' => '/', 'site_id' => '7', 'registered' => '2026-01-01 00:00:00', 'last_updated' => '2026-01-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '0' ),
\t\t\t2 => array( 'blog_id' => '2', 'domain' => 'network.example.test', 'path' => '/site-two/', 'site_id' => '7', 'registered' => '2026-02-01 00:00:00', 'last_updated' => '2026-02-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '1' ),
\t\t\t3 => array( 'blog_id' => '3', 'domain' => 'www.network.example.test', 'path' => '/www/', 'site_id' => '7', 'registered' => '2026-03-01 00:00:00', 'last_updated' => '2026-03-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '0' ),
\t\t\t4 => array( 'blog_id' => '4', 'domain' => 'alt.example.test', 'path' => '/alt/', 'site_id' => '8', 'registered' => '2026-04-01 00:00:00', 'last_updated' => '2026-04-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '2' ),
\t\t\t5 => array( 'blog_id' => '5', 'domain' => 'network.example.test', 'path' => '/deleted/', 'site_id' => '7', 'registered' => '2026-05-01 00:00:00', 'last_updated' => '2026-05-02 00:00:00', 'public' => '0', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '1', 'lang_id' => '0' ),
\t\t\t6 => array( 'blog_id' => '6', 'domain' => 'network.example.test', 'path' => '/suspended/', 'site_id' => '7', 'registered' => '2026-06-01 00:00:00', 'last_updated' => '2026-06-02 00:00:00', 'public' => '0', 'archived' => '1', 'mature' => '0', 'spam' => '1', 'deleted' => '0', 'lang_id' => '0' ),
\t\t);
\t\t$this->networks = array(
\t\t\t7 => array( 'id' => '7', 'domain' => 'network.example.test', 'path' => '/', 'blog_id' => '1', 'cookie_domain' => 'network.example.test', 'site_name' => 'Network Example' ),
\t\t\t8 => array( 'id' => '8', 'domain' => 'alt.example.test', 'path' => '/alt/', 'blog_id' => '4', 'cookie_domain' => '', 'site_name' => 'Alt Network' ),
\t\t);
\t}

\tpublic function set_blog_id( $blog_id ) {
\t\t$this->blogid = (int) $blog_id;
\t\t$this->prefix = 1 === $this->blogid ? $this->base_prefix : $this->base_prefix . $this->blogid . '_';
\t}

\tpublic function prepare( $query, ...$args ) {
\t\tif ( 1 === count( $args ) && is_array( $args[0] ) ) {
\t\t\t$args = $args[0];
\t\t}
\t\t$index = 0;
\t\treturn preg_replace_callback(
\t\t\t'/%(?:\\\\d+\\\\$)?([dsf])/',
\t\t\tfunction ( $matches ) use ( &$args, &$index ) {
\t\t\t\t$value = $args[ $index++ ] ?? '';
\t\t\t\treturn 'd' === $matches[1] ? (string) (int) $value : "'" . str_replace( "'", "\\\\'", (string) $value ) . "'";
\t\t\t},
\t\t\t$query
\t\t);
\t}

\tpublic function esc_like( $text ) {
\t\treturn addcslashes( $text, '_%\\\\' );
\t}

\tpublic function get_var( $query ) {
\t\t$this->queries[] = array( 'operation' => 'get_var', 'query' => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ) );
\t\tif ( false !== stripos( (string) $query, 'SHOW TABLES LIKE' ) ) {
\t\t\treturn $this->site_table_exists ? $this->site : null;
\t\t}
\t\treturn null;
\t}

\tpublic function get_row( $query ) {
\t\t$this->queries[] = array( 'operation' => 'get_row', 'query' => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ) );
\t\t$sql = (string) $query;
\t\tif ( false !== strpos( $sql, $this->blogs ) && preg_match( '/blog_id\\s*=\\s*([0-9]+)/', $sql, $matches ) ) {
\t\t\treturn isset( $this->sites[ (int) $matches[1] ] ) ? (object) $this->sites[ (int) $matches[1] ] : null;
\t\t}
\t\tif ( false !== strpos( $sql, $this->site ) && preg_match( '/id\\s*=\\s*([0-9]+)/', $sql, $matches ) ) {
\t\t\treturn isset( $this->networks[ (int) $matches[1] ] ) ? (object) $this->networks[ (int) $matches[1] ] : null;
\t\t}
\t\treturn null;
\t}

\tpublic function tables( $scope ) {
\t\treturn array( 'blogs' => $this->blogs, 'site' => $this->site, 'sitemeta' => $this->sitemeta );
\t}

\tpublic function site_rows() {
\t\treturn $this->sites;
\t}

\tpublic function network_rows() {
\t\treturn $this->networks;
\t}
}

$GLOBALS['wpdb'] = new WPHX_317_05_Fake_WPDB();
$GLOBALS['blog_id'] = 1;
$GLOBALS['current_blog'] = null;
$GLOBALS['current_site'] = null;
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_cache'] = array();
$GLOBALS['wphx_is_admin'] = false;
$GLOBALS['wphx_installing'] = false;
$GLOBALS['wphx_super_admin'] = false;

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'args' => array_map( 'wphx_317_05_plain', $args ) );
\treturn $value;
}

function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook_name, 'args' => array_map( 'wphx_317_05_plain', $args ) );
}

function did_action( $hook_name ) {
\treturn 0;
}

function wp_cache_get( $key, $group = '' ) {
\t$cache_key = $group . ':' . $key;
\treturn array_key_exists( $cache_key, $GLOBALS['wphx_cache'] ) ? $GLOBALS['wphx_cache'][ $cache_key ] : false;
}

function wp_cache_add( $key, $value, $group = '' ) {
\t$cache_key = $group . ':' . $key;
\tif ( array_key_exists( $cache_key, $GLOBALS['wphx_cache'] ) ) {
\t\treturn false;
\t}
\t$GLOBALS['wphx_cache'][ $cache_key ] = $value;
\treturn true;
}

function wp_using_ext_object_cache() {
\treturn false;
}

function wp_installing() {
\treturn $GLOBALS['wphx_installing'];
}

function is_ssl() {
\treturn false;
}

function is_admin() {
\treturn $GLOBALS['wphx_is_admin'];
}

function is_super_admin() {
\treturn $GLOBALS['wphx_super_admin'];
}

function is_wp_error( $thing ) {
\treturn false;
}

function validate_file( $file ) {
\treturn preg_match( '#(^/|\\.\\./|\\\\\\\\)#', (string) $file ) ? 1 : 0;
}

function get_site_option( $option, $default = false ) {
\tif ( 'active_sitewide_plugins' === $option ) {
\t\treturn array(
\t\t\t'beta/main.php' => 1700000002,
\t\t\t'alpha/network.php' => 1700000001,
\t\t\t'not-php/readme.txt' => 1700000003,
\t\t\t'../escape.php' => 1700000004,
\t\t\t'missing/missing.php' => 1700000005,
\t\t);
\t}
\tif ( 'admin_email' === $option ) {
\t\treturn 'admin@example.test';
\t}
\treturn $default;
}

function get_network_option( $network_id, $option, $default = false ) {
\tif ( 'site_name' === $option ) {
\t\treturn 7 === (int) $network_id ? 'Network Example' : 'Alt Network';
\t}
\tif ( 'main_site' === $option ) {
\t\treturn 7 === (int) $network_id ? 1 : 4;
\t}
\treturn $default;
}

function update_network_option( $network_id, $option, $value ) {
\treturn true;
}

function get_main_site_id( $network_id = null ) {
\treturn 8 === (int) $network_id ? 4 : 1;
}

function get_sites( $args = array() ) {
\tglobal $wpdb;
\t$rows = array_values( $wpdb->site_rows() );
\tif ( isset( $args['domain'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => $row['domain'] === $args['domain'] ) );
\t}
\tif ( isset( $args['domain__in'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row['domain'], $args['domain__in'], true ) ) );
\t}
\tif ( isset( $args['path'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => $row['path'] === $args['path'] ) );
\t}
\tif ( isset( $args['path__in'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row['path'], $args['path__in'], true ) ) );
\t}
\tif ( isset( $args['network_id'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => (int) $row['site_id'] === (int) $args['network_id'] ) );
\t}
\tif ( isset( $args['orderby']['domain_length'] ) ) {
\t\tusort( $rows, fn( $a, $b ) => strlen( $b['domain'] ) <=> strlen( $a['domain'] ) );
\t}
\tif ( isset( $args['orderby']['path_length'] ) ) {
\t\tusort( $rows, fn( $a, $b ) => strlen( $b['path'] ) <=> strlen( $a['path'] ) );
\t}
\t$number = isset( $args['number'] ) ? (int) $args['number'] : 0;
\tif ( 0 < $number ) {
\t\t$rows = array_slice( $rows, 0, $number );
\t}
\tif ( isset( $args['fields'] ) && 'ids' === $args['fields'] ) {
\t\treturn array_map( fn( $row ) => (int) $row['blog_id'], $rows );
\t}
\treturn array_map( fn( $row ) => new WP_Site( (object) $row ), $rows );
}

function get_networks( $args = array() ) {
\tglobal $wpdb;
\t$rows = array_values( $wpdb->network_rows() );
\tif ( isset( $args['domain__in'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row['domain'], $args['domain__in'], true ) ) );
\t}
\tif ( isset( $args['path__in'] ) ) {
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row['path'], $args['path__in'], true ) ) );
\t}
\tif ( isset( $args['path__not_in'] ) ) {
\t\t$not_in = (array) $args['path__not_in'];
\t\t$rows = array_values( array_filter( $rows, fn( $row ) => ! in_array( $row['path'], $not_in, true ) ) );
\t}
\tif ( isset( $args['orderby']['domain_length'] ) ) {
\t\tusort( $rows, fn( $a, $b ) => strlen( $b['domain'] ) <=> strlen( $a['domain'] ) );
\t}
\tif ( isset( $args['orderby']['path_length'] ) ) {
\t\tusort( $rows, fn( $a, $b ) => strlen( $b['path'] ) <=> strlen( $a['path'] ) );
\t}
\tif ( isset( $args['count'] ) && $args['count'] ) {
\t\treturn count( $rows );
\t}
\t$number = isset( $args['number'] ) ? (int) $args['number'] : 0;
\tif ( 0 < $number ) {
\t\t$rows = array_slice( $rows, 0, $number );
\t}
\treturn array_map( fn( $row ) => new WP_Network( (object) $row ), $rows );
}

function get_site( $site = null ) {
\tglobal $wpdb, $current_blog;
\tif ( $site instanceof WP_Site ) {
\t\treturn $site;
\t}
\tif ( null === $site && $current_blog instanceof WP_Site ) {
\t\treturn $current_blog;
\t}
\t$id = null === $site ? $GLOBALS['blog_id'] : $site;
\t$rows = $wpdb->site_rows();
\treturn isset( $rows[ (int) $id ] ) ? new WP_Site( (object) $rows[ (int) $id ] ) : null;
}

function get_network( $network = null ) {
\tglobal $wpdb, $current_site;
\tif ( $network instanceof WP_Network ) {
\t\treturn $network;
\t}
\tif ( null === $network && $current_site instanceof WP_Network ) {
\t\treturn $current_site;
\t}
\t$id = null === $network ? 7 : $network;
\t$rows = $wpdb->network_rows();
\treturn isset( $rows[ (int) $id ] ) ? new WP_Network( (object) $rows[ (int) $id ] ) : null;
}

function dead_db() {
\tthrow new WPHX_317_05_WP_Die( 'dead_db', 'dead_db', array( 'response' => 500 ) );
}

function wp_load_translations_early() {}

function __( $text ) {
\treturn $text;
}

function wp_die( $message = '', $title = '', $args = array() ) {
\tthrow new WPHX_317_05_WP_Die( $message, $title, $args );
}

require_once ABSPATH . WPINC . '/class-wp-network.php';
require_once ABSPATH . WPINC . '/class-wp-site.php';
require_once ABSPATH . WPINC . '/ms-load.php';

function wphx_317_05_plain( $value ) {
\tif ( $value instanceof WP_Site ) {
\t\treturn array( 'class' => 'WP_Site', 'blog_id' => (int) $value->blog_id, 'domain' => $value->domain, 'path' => $value->path, 'site_id' => (int) $value->site_id );
\t}
\tif ( $value instanceof WP_Network ) {
\t\treturn array( 'class' => 'WP_Network', 'id' => (int) $value->id, 'domain' => $value->domain, 'path' => $value->path );
\t}
\tif ( is_array( $value ) ) {
\t\treturn array_map( 'wphx_317_05_plain', $value );
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'class' => get_class( $value ), 'vars' => array_map( 'wphx_317_05_plain', get_object_vars( $value ) ) );
\t}
\treturn $value;
}

function wphx_317_05_site_summary( $site ) {
\tif ( ! $site ) {
\t\treturn false;
\t}
\treturn array( 'class' => get_class( $site ), 'blog_id' => (int) $site->blog_id, 'domain' => $site->domain, 'path' => $site->path, 'site_id' => (int) $site->site_id, 'deleted' => $site->deleted, 'archived' => $site->archived, 'spam' => $site->spam );
}

function wphx_317_05_network_summary( $network ) {
\tif ( ! $network ) {
\t\treturn false;
\t}
\treturn array( 'class' => get_class( $network ), 'id' => (int) $network->id, 'domain' => $network->domain, 'path' => $network->path, 'blog_id' => (int) $network->blog_id, 'cookie_domain' => $network->cookie_domain, 'site_name' => $network->site_name );
}

function wphx_317_05_case( $id, $symbol, $value, $meta = array() ) {
\treturn array( 'id' => $id, 'symbol' => $symbol, 'value' => wphx_317_05_plain( $value ), 'meta' => $meta );
}

function wphx_317_05_reset_globals() {
\t$GLOBALS['current_blog'] = null;
\t$GLOBALS['current_site'] = null;
\t$GLOBALS['wphx_actions'] = array();
\t$GLOBALS['wphx_filters'] = array();
\t$GLOBALS['wphx_cache'] = array();
\t$GLOBALS['wphx_installing'] = false;
\t$GLOBALS['wphx_super_admin'] = false;
\t$GLOBALS['wphx_is_admin'] = false;
}

$cases = array();

$active_plugins = array_map( fn( $path ) => str_replace( ABSPATH, '', $path ), wp_get_active_network_plugins() );
$cases[] = wphx_317_05_case( 'plugins:active-network-plugin-filtering', 'wp_get_active_network_plugins', $active_plugins );

$cases[] = wphx_317_05_case(
\t'route:site-by-path-segments-and-www',
\t'get_site_by_path',
\tarray(
\t\t'exactRoot' => wphx_317_05_site_summary( get_site_by_path( 'network.example.test', '/', null ) ),
\t\t'nestedPath' => wphx_317_05_site_summary( get_site_by_path( 'network.example.test', '/site-two/post/42/', 1 ) ),
\t\t'wwwPath' => wphx_317_05_site_summary( get_site_by_path( 'www.network.example.test', '/www/child/', 1 ) ),
\t\t'missing' => wphx_317_05_site_summary( get_site_by_path( 'missing.example.test', '/none/', 1 ) ),
\t)
);

$cases[] = wphx_317_05_case(
\t'route:network-by-path-domain-path',
\t'get_network_by_path',
\tarray(
\t\t'root' => wphx_317_05_network_summary( get_network_by_path( 'network.example.test', '/', null ) ),
\t\t'childPathFallsBackToRoot' => wphx_317_05_network_summary( get_network_by_path( 'network.example.test', '/site-two/post/', 1 ) ),
\t\t'altPath' => wphx_317_05_network_summary( get_network_by_path( 'alt.example.test', '/alt/dashboard/', 1 ) ),
\t\t'subdomainSuffix' => wphx_317_05_network_summary( get_network_by_path( 'missing.network.example.test', '/signup/', 1 ) ),
\t)
);

wphx_317_05_reset_globals();
$subdirectory_result = ms_load_current_site_and_network( 'alt.example.test', '/alt/dashboard/', false );
$cases[] = wphx_317_05_case(
\t'bootstrap:subdirectory-network-first',
\t'ms_load_current_site_and_network',
\tarray(
\t\t'result' => $subdirectory_result,
\t\t'currentSite' => wphx_317_05_network_summary( $GLOBALS['current_site'] ),
\t\t'currentBlog' => wphx_317_05_site_summary( $GLOBALS['current_blog'] ),
\t\t'actions' => $GLOBALS['wphx_actions'],
\t\t'filters' => array_column( $GLOBALS['wphx_filters'], 'hook' ),
\t)
);

wphx_317_05_reset_globals();
$subdomain_result = ms_load_current_site_and_network( 'missing.network.example.test', '/missing/', true );
$cases[] = wphx_317_05_case(
\t'bootstrap:subdomain-site-missing-redirect',
\t'ms_load_current_site_and_network',
\tarray(
\t\t'result' => $subdomain_result,
\t\t'currentSite' => wphx_317_05_network_summary( $GLOBALS['current_site'] ),
\t\t'currentBlog' => wphx_317_05_site_summary( $GLOBALS['current_blog'] ),
\t\t'actions' => $GLOBALS['wphx_actions'],
\t)
);

define( 'DOMAIN_CURRENT_SITE', 'network.example.test' );
define( 'PATH_CURRENT_SITE', '/' );
define( 'SITE_ID_CURRENT_SITE', 7 );
define( 'BLOG_ID_CURRENT_SITE', 1 );
wphx_317_05_reset_globals();
$constant_result = ms_load_current_site_and_network( 'network.example.test', '/site-two/post/', false );
$cases[] = wphx_317_05_case(
\t'bootstrap:constant-defined-network',
\t'ms_load_current_site_and_network',
\tarray(
\t\t'result' => $constant_result,
\t\t'currentSite' => wphx_317_05_network_summary( $GLOBALS['current_site'] ),
\t\t'currentBlog' => wphx_317_05_site_summary( $GLOBALS['current_blog'] ),
\t\t'actions' => $GLOBALS['wphx_actions'],
\t)
);

wphx_317_05_reset_globals();
$GLOBALS['current_blog'] = get_site( 5 );
$deleted_check = ms_site_check();
$GLOBALS['current_blog'] = get_site( 6 );
$suspended_check = ms_site_check();
$cases[] = wphx_317_05_case(
\t'status:site-check-dropins',
\t'ms_site_check',
\tarray(
\t\t'deleted' => str_replace( ABSPATH, '', $deleted_check ),
\t\t'suspended' => str_replace( ABSPATH, '', $suspended_check ),
\t)
);

wphx_317_05_reset_globals();
$GLOBALS['wphx_is_admin'] = true;
try {
\tms_not_installed( 'missing.network.example.test', '/missing/' );
\t$not_installed = array( 'threw' => false );
} catch ( WPHX_317_05_WP_Die $error ) {
\t$not_installed = array(
\t\t'threw' => true,
\t\t'title' => $error->title,
\t\t'args' => $error->args,
\t\t'messageSha256' => hash( 'sha256', $error->getMessage() ),
\t\t'containsMissingTables' => false !== strpos( $error->getMessage(), 'Database tables are missing.' ),
\t\t'containsSiteTable' => false !== strpos( $error->getMessage(), '<code>wp_site</code>' ),
\t);
}
$cases[] = wphx_317_05_case( 'failure:ms-not-installed-admin', 'ms_not_installed', $not_installed );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'phpVersion' => PHP_VERSION,
\t\t'cases' => $cases,
\t\t'queryCount' => count( $GLOBALS['wpdb']->queries ),
\t\t'queries' => $GLOBALS['wpdb']->queries,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(executable, runtime, mode, root) {
  const output = command(executable, [PROBE, mode, root]);
  return {
    id: `${runtime}:${mode}`,
    runtime,
    mode,
    command: `${executable} ${PROBE} ${mode} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(runtime, image, mode, root) {
  const cwd = process.cwd();
  const mountRoot = `${cwd}:/workspace`;
  const output = command("docker", [
    "run",
    "--rm",
    "-v",
    mountRoot,
    "-w",
    "/workspace",
    image,
    "php",
    PROBE,
    mode,
    root
  ]);
  return {
    id: `${runtime}:${mode}`,
    runtime,
    image,
    mode,
    command: `docker run --rm -v ${mountRoot} -w /workspace ${image} php ${PROBE} ${mode} ${root}`,
    result: JSON.parse(output)
  };
}

function normalize(result) {
  return {
    caseCount: result.cases.length,
    cases: result.cases.map((entry) => ({
      id: entry.id,
      symbol: entry.symbol,
      value: entry.value,
      meta: entry.meta
    })),
    queryCount: result.queryCount,
    queries: result.queries
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

function runSummary(run) {
  const normalized = normalize(run.result);
  return {
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: run.command,
    image: run.image,
    php_version: run.result.phpVersion,
    normalized_sha256: sha256(JSON.stringify(normalized)),
    case_count: normalized.cases.length,
    case_ids: normalized.cases.map((entry) => entry.id)
  };
}

function comparisonSummary(entry) {
  return {
    id: entry.id,
    matches: entry.matches,
    oracle_sha256: sha256(JSON.stringify(entry.oracle)),
    candidate_sha256: sha256(JSON.stringify(entry.candidate))
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-317-bootstrap-routing`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/multisite-bootstrap-routing-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "Multisite bootstrap and domain/path routing fixture harness",
      area: "wp-includes/ms-load.php",
      public_contract:
        "WordPress 7.0 multisite loader preserves active network plugin selection, domain/path site and network resolution, current site/blog global population, site-status drop-in routing, and ms_not_installed failure behavior while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-multisite-bootstrap-routing-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-317-bootstrap-routing",
        "npm run wp:core:wphx-317-bootstrap-routing:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-317-05-multisite-bootstrap-routing-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-317.05. The probe supplies deterministic filter, cache, plugin, database, and wp_die boundaries so real ms-load.php routing functions can execute without a full installed multisite database. Haxe-owned public PHP replacements remain later gates."
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
  schema: "wphx.wp-core-multisite-bootstrap-routing-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-multisite-bootstrap-routing-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    site_network_query_fixture: inputRecord(SITE_NETWORK_QUERY),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "multisite_bootstrap")?.label ?? "multisite bootstrap and routing",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "oracle_mirror_fixture",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "wpdb-bootstrap-routing-test-double",
        reason:
          "The probe supplies deterministic wp_site/wp_blogs rows and SHOW TABLES behavior so real ms-load.php branches can execute without a live database. Installed database parity remains a later gate."
      },
      {
        id: "wp-die-capture",
        reason:
          "wp_die and dead_db are converted to typed exceptions inside the probe so failure output, title, response code, and diagnostic-message shape can be compared without terminating the runner."
      },
      {
        id: "filter-action-log",
        reason:
          "apply_filters and do_action preserve default pass-through behavior while recording hook names and arguments that are observable to plugins."
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
  canonical_observations: normalize(localOracle.result),
  runs: runs.map(runSummary),
  comparisons: comparisons.map(comparisonSummary),
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-317.07",
      detail: "The candidate side is a copied WordPress oracle source tree until multisite loader/adapter contracts are emitted from Haxe-owned sources."
    },
    {
      id: "live-database-not-yet-authoritative",
      owner: "WPHX-317.06",
      detail: "This fixture uses deterministic PHP test doubles; live MySQL/MariaDB multisite bootstrap parity remains an installed/distribution gate."
    },
    {
      id: "constant-defined-branch-runs-last",
      owner: "WPHX-317.07",
      detail: "PHP constants cannot be undefined in-process, so DOMAIN_CURRENT_SITE/PATH_CURRENT_SITE coverage is ordered last within the single probe process."
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
  id: "receipt:wphx-317-05-multisite-bootstrap-routing-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "multisite bootstrap and domain/path routing fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the bootstrap/routing fixture harness"
    },
    {
      path: "tools/wp-core/run-multisite-bootstrap-routing-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-317-bootstrap-routing",
    "npm run wp:core:wphx-317-bootstrap-routing:check",
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

console.log(JSON.stringify(manifest.validation_result, null, 2));
