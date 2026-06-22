#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.11.3",
  external_ref: "WPHX-317.04",
  title: "Build WP_Site and WP_Network ABI/query fixtures"
};
const OUT_ROOT = "build/wp-core/wphx-317-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-317-04-site-network-query-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-317-04-site-network-query-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-317-04-site-network-query-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-317-01-multisite-network-surface.v1.json";
const OPTIONS_TRANSIENTS = "manifests/wp-core/wphx-317-02-multisite-options-transients-fixture.v1.json";
const BLOG_SWITCH_CACHE = "manifests/wp-core/wphx-317-03-multisite-blog-switch-cache-fixture.v1.json";
const RECORDED_AT = "2026-06-22T22:18:04.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/cache-compat.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/kses.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-includes/class-wp-meta-query.php",
  "src/wp-includes/class-wp-network.php",
  "src/wp-includes/class-wp-network-query.php",
  "src/wp-includes/ms-network.php",
  "src/wp-includes/class-wp-site.php",
  "src/wp-includes/class-wp-site-query.php",
  "src/wp-includes/ms-site.php",
  "src/wp-includes/ms-blogs.php"
];

const COVERED_SYMBOLS = [
  "WP_Site",
  "WP_Site::get_instance",
  "WP_Site::__get",
  "WP_Site::__isset",
  "WP_Site::__set",
  "WP_Site::to_array",
  "WP_Site_Query",
  "WP_Site_Query::query",
  "WP_Site_Query::get_sites",
  "WP_Network",
  "WP_Network::get_instance",
  "WP_Network::__get",
  "WP_Network::__isset",
  "WP_Network::__set",
  "WP_Network_Query",
  "WP_Network_Query::query",
  "WP_Network_Query::get_networks",
  "get_site",
  "get_sites",
  "get_network",
  "get_networks"
];

const FIXTURE_CASES = [
  { id: "abi:site-network-reflection", symbol: "WP_Site/WP_Network/WP_Site_Query/WP_Network_Query", focus: "reflection-visible class, property, method, attribute, final, and declaring-file shape" },
  { id: "site:constructor-magic-details", symbol: "WP_Site::__construct/__get/__isset/__set/to_array", focus: "public property order, alias magic, dynamic details after ms_loaded, and switch/get_option path" },
  { id: "network:constructor-magic-instance", symbol: "WP_Network::__construct/__get/__isset/__set/get_instance", focus: "private id/blog_id aliases, cookie-domain derivation, cache-backed instance retrieval, and public object vars" },
  { id: "site-query:ids-found-rows-search", symbol: "WP_Site_Query::query", focus: "ids query, domain/network/search filters, SQL_CALC_FOUND_ROWS, found_sites, and max_num_pages" },
  { id: "site-query:objects-and-count", symbol: "get_sites/WP_Site_Query", focus: "object query cache priming, public WP_Site instances, and count-only requests" },
  { id: "network-query:ids-found-rows-search", symbol: "WP_Network_Query::query", focus: "ids query, domain/path/search filters, orderby aliases, SQL_CALC_FOUND_ROWS, found_networks, and max_num_pages" },
  { id: "network-query:objects-and-count", symbol: "get_networks/WP_Network_Query", focus: "object query cache priming, public WP_Network instances, and count-only requests" }
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
\t\tif ( null !== $error && in_array( $error['type'], array( E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR ), true ) ) {
\t\t\tfwrite( STDERR, json_encode( $error, JSON_UNESCAPED_SLASHES ) . PHP_EOL );
\t\t}
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );
define( 'MULTISITE', true );
define( 'DOMAIN_CURRENT_SITE', 'network.example.test' );
define( 'PATH_CURRENT_SITE', '/' );
define( 'SITE_ID_CURRENT_SITE', 7 );
define( 'BLOG_ID_CURRENT_SITE', 1 );

class WPHX_317_04_Fake_WPDB {
\tpublic $base_prefix = 'wp_';
\tpublic $prefix = 'wp_';
\tpublic $options = 'wp_options';
\tpublic $site = 'wp_site';
\tpublic $blogs = 'wp_blogs';
\tpublic $sitemeta = 'wp_sitemeta';
\tpublic $blogid = 1;
\tpublic $last_error = '';
\tpublic $queries = array();
\tprivate $sites = array();
\tprivate $networks = array();
\tprivate $options_by_blog = array();
\tprivate $last_found_rows = 0;

\tpublic function __construct() {
\t\t$this->reset();
\t}

\tpublic function reset() {
\t\t$this->queries = array();
\t\t$this->last_found_rows = 0;
\t\t$this->sites = array(
\t\t\t1 => array( 'blog_id' => '1', 'domain' => 'one.example.test', 'path' => '/', 'site_id' => '7', 'registered' => '2026-01-01 00:00:00', 'last_updated' => '2026-01-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '0' ),
\t\t\t2 => array( 'blog_id' => '2', 'domain' => 'two.example.test', 'path' => '/two/', 'site_id' => '7', 'registered' => '2026-02-01 00:00:00', 'last_updated' => '2026-02-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '1' ),
\t\t\t3 => array( 'blog_id' => '3', 'domain' => 'archived.example.test', 'path' => '/archived/', 'site_id' => '8', 'registered' => '2026-03-01 00:00:00', 'last_updated' => '2026-03-02 00:00:00', 'public' => '0', 'archived' => '1', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '2' ),
\t\t);
\t\t$this->networks = array(
\t\t\t7 => array( 'id' => '7', 'domain' => 'network.example.test', 'path' => '/', 'blog_id' => '1', 'cookie_domain' => 'network.example.test', 'site_name' => 'Network Example' ),
\t\t\t8 => array( 'id' => '8', 'domain' => 'www.alt.example.test', 'path' => '/alt/', 'blog_id' => '3', 'cookie_domain' => '', 'site_name' => 'Alt Network' ),
\t\t\t9 => array( 'id' => '9', 'domain' => 'deep.network.example.test', 'path' => '/deep/', 'blog_id' => '4', 'cookie_domain' => '', 'site_name' => 'Deep Network' ),
\t\t);
\t\t$this->options_by_blog = array(
\t\t\t1 => array( 'siteurl' => 'https://one.example.test/', 'home' => 'https://one.example.test/', 'blogname' => 'Blog One', 'post_count' => '11' ),
\t\t\t2 => array( 'siteurl' => 'https://two.example.test/two/', 'home' => 'https://two.example.test/two/', 'blogname' => 'Blog Two', 'post_count' => '22' ),
\t\t\t3 => array( 'siteurl' => 'https://archived.example.test/archived/', 'home' => 'https://archived.example.test/archived/', 'blogname' => 'Blog Three', 'post_count' => '33' ),
\t\t);
\t\t$this->set_blog_id( 1 );
\t}

\tpublic function set_blog_id( $blog_id ) {
\t\t$this->blogid = (int) $blog_id;
\t\t$this->prefix = $this->get_blog_prefix( $this->blogid );
\t\t$this->options = $this->prefix . 'options';
\t}

\tpublic function get_blog_prefix( $blog_id = null ) {
\t\tif ( null === $blog_id ) {
\t\t\t$blog_id = $this->blogid;
\t\t}
\t\t$blog_id = (int) $blog_id;
\t\treturn 1 === $blog_id ? $this->base_prefix : $this->base_prefix . $blog_id . '_';
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
\t\t$index = 0;
\t\treturn preg_replace_callback(
\t\t\t'/%(?:\\\\d+\\\\$)?([dsf])/',
\t\t\tfunction ( $matches ) use ( &$args, &$index ) {
\t\t\t\t$value = $args[ $index++ ] ?? '';
\t\t\t\tif ( 'd' === $matches[1] ) {
\t\t\t\t\treturn (string) (int) $value;
\t\t\t\t}
\t\t\t\tif ( 'f' === $matches[1] ) {
\t\t\t\t\treturn (string) (float) $value;
\t\t\t\t}
\t\t\t\treturn \"'\" . $this->_escape( $value ) . \"'\";
\t\t\t},
\t\t\t$query
\t\t);
\t}

\tprivate function record( $operation, $query ) {
\t\t$this->queries[] = array(
\t\t\t'operation' => $operation,
\t\t\t'query' => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ),
\t\t\t'blogId' => $this->blogid,
\t\t\t'optionsTable' => $this->options,
\t\t);
\t}

\tprivate function row_object( $row ) {
\t\tif ( null === $row ) {
\t\t\treturn null;
\t\t}
\t\treturn (object) $row;
\t}

\tprivate function option_blog_from_sql( $sql ) {
\t\tif ( false !== strpos( $sql, 'wp_3_options' ) ) {
\t\t\treturn 3;
\t\t}
\t\tif ( false !== strpos( $sql, 'wp_2_options' ) ) {
\t\t\treturn 2;
\t\t}
\t\treturn 1;
\t}

\tprivate function option_name_from_sql( $sql ) {
\t\tif ( preg_match( \"/option_name\\\\s*=\\\\s*'([^']+)'/\", $sql, $matches ) ) {
\t\t\treturn str_replace( \"\\\\'\", \"'\", $matches[1] );
\t\t}
\t\treturn null;
\t}

\tprivate function ids_from_in_clause( $sql, $column ) {
\t\t$pattern = '/' . preg_quote( $column, '/' ) . '\\\\s+IN\\\\s*\\\\(\\\\s*([^\\\\)]+)\\\\s*\\\\)/';
\t\tif ( preg_match( $pattern, $sql, $matches ) ) {
\t\t\treturn array_map( 'intval', preg_split( '/\\\\s*,\\\\s*/', trim( $matches[1] ) ) );
\t\t}
\t\treturn null;
\t}

\tprivate function quoted_values_from_in_clause( $sql, $column ) {
\t\t$pattern = '/' . preg_quote( $column, '/' ) . '\\\\s+IN\\\\s*\\\\(([^\\\\)]+)\\\\)/';
\t\tif ( ! preg_match( $pattern, $sql, $matches ) ) {
\t\t\treturn null;
\t\t}
\t\tpreg_match_all( \"/'([^']*)'/\", $matches[1], $values );
\t\treturn $values[1];
\t}

\tprivate function scalar_condition( $sql, $column ) {
\t\t$pattern = '/' . preg_quote( $column, '/' ) . '\\\\s*=\\\\s*(?:\\'([^\\']*)\\'|([0-9]+))/';
\t\tif ( preg_match( $pattern, $sql, $matches ) ) {
\t\t\treturn '' !== $matches[1] ? $matches[1] : $matches[2];
\t\t}
\t\treturn null;
\t}

\tprivate function apply_limit( $rows, $sql ) {
\t\tif ( preg_match( '/LIMIT\\\\s+([0-9]+)\\\\s*,\\\\s*([0-9]+)/i', $sql, $matches ) ) {
\t\t\treturn array_slice( $rows, (int) $matches[1], (int) $matches[2] );
\t\t}
\t\tif ( preg_match( '/LIMIT\\\\s+([0-9]+)/i', $sql, $matches ) ) {
\t\t\treturn array_slice( $rows, 0, (int) $matches[1] );
\t\t}
\t\treturn $rows;
\t}

\tprivate function apply_site_filters( $sql ) {
\t\t$rows = array_values( $this->sites );
\t\tforeach ( array( 'wp_blogs.blog_id' => 'blog_id', 'blog_id' => 'blog_id', 'site_id' => 'site_id', 'domain' => 'domain', 'path' => 'path', 'archived' => 'archived', 'mature' => 'mature', 'spam' => 'spam', 'deleted' => 'deleted', 'public' => 'public', 'lang_id' => 'lang_id' ) as $sql_column => $row_column ) {
\t\t\t$value = $this->scalar_condition( $sql, $sql_column );
\t\t\tif ( null !== $value ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => (string) $row[ $row_column ] === (string) $value ) );
\t\t\t}
\t\t}
\t\tforeach ( array( 'wp_blogs.blog_id' => 'blog_id', 'blog_id' => 'blog_id', 'site_id' => 'site_id', 'lang_id' => 'lang_id' ) as $sql_column => $row_column ) {
\t\t\t$ids = $this->ids_from_in_clause( $sql, $sql_column );
\t\t\tif ( null !== $ids ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( (int) $row[ $row_column ], $ids, true ) ) );
\t\t\t}
\t\t}
\t\tforeach ( array( 'domain', 'path' ) as $column ) {
\t\t\t$values = $this->quoted_values_from_in_clause( $sql, $column );
\t\t\tif ( null !== $values ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row[ $column ], $values, true ) ) );
\t\t\t}
\t\t}
\t\tif ( preg_match( \"/LIKE\\\\s+'%([^']+)%'/\", $sql, $matches ) ) {
\t\t\t$needle = str_replace( '\\\\%', '%', $matches[1] );
\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => false !== strpos( $row['domain'], $needle ) || false !== strpos( $row['path'], $needle ) ) );
\t\t}
\t\treturn $this->sort_rows( $rows, $sql, 'blog_id' );
\t}

\tprivate function apply_network_filters( $sql ) {
\t\t$rows = array_values( $this->networks );
\t\tforeach ( array( 'wp_site.id' => 'id', 'id' => 'id', 'wp_site.domain' => 'domain', 'domain' => 'domain', 'wp_site.path' => 'path', 'path' => 'path' ) as $sql_column => $row_column ) {
\t\t\t$value = $this->scalar_condition( $sql, $sql_column );
\t\t\tif ( null !== $value ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => (string) $row[ $row_column ] === (string) $value ) );
\t\t\t}
\t\t}
\t\tforeach ( array( 'wp_site.id' => 'id', 'id' => 'id' ) as $sql_column => $row_column ) {
\t\t\t$ids = $this->ids_from_in_clause( $sql, $sql_column );
\t\t\tif ( null !== $ids ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( (int) $row[ $row_column ], $ids, true ) ) );
\t\t\t}
\t\t}
\t\tforeach ( array( 'wp_site.domain' => 'domain', 'domain' => 'domain', 'wp_site.path' => 'path', 'path' => 'path' ) as $sql_column => $row_column ) {
\t\t\t$values = $this->quoted_values_from_in_clause( $sql, $sql_column );
\t\t\tif ( null !== $values ) {
\t\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => in_array( $row[ $row_column ], $values, true ) ) );
\t\t\t}
\t\t}
\t\tif ( preg_match( \"/LIKE\\\\s+'%([^']+)%'/\", $sql, $matches ) ) {
\t\t\t$needle = str_replace( '\\\\%', '%', $matches[1] );
\t\t\t$rows = array_values( array_filter( $rows, fn( $row ) => false !== strpos( $row['domain'], $needle ) || false !== strpos( $row['path'], $needle ) ) );
\t\t}
\t\treturn $this->sort_rows( $rows, $sql, 'id' );
\t}

\tprivate function sort_rows( $rows, $sql, $id_column ) {
\t\tif ( false !== stripos( $sql, 'CHAR_LENGTH(domain) DESC' ) ) {
\t\t\tusort( $rows, fn( $a, $b ) => strlen( $b['domain'] ) <=> strlen( $a['domain'] ) );
\t\t\treturn $rows;
\t\t}
\t\tif ( false !== stripos( $sql, 'CHAR_LENGTH(path) DESC' ) ) {
\t\t\tusort( $rows, fn( $a, $b ) => strlen( $b['path'] ) <=> strlen( $a['path'] ) );
\t\t\treturn $rows;
\t\t}
\t\tif ( preg_match( '/ORDER BY[^\\n]*(?:blog_id|wp_site.id|id)\\\\s+DESC/i', $sql ) ) {
\t\t\tusort( $rows, fn( $a, $b ) => (int) $b[ $id_column ] <=> (int) $a[ $id_column ] );
\t\t\treturn $rows;
\t\t}
\t\tusort( $rows, fn( $a, $b ) => (int) $a[ $id_column ] <=> (int) $b[ $id_column ] );
\t\treturn $rows;
\t}

\tpublic function get_row( $query ) {
\t\t$sql = (string) $query;
\t\t$this->record( 'get_row', $sql );
\t\tif ( false !== strpos( $sql, "FROM {$this->blogs}" ) && preg_match( '/blog_id\\\\s*=\\\\s*([0-9]+)/', $sql, $matches ) ) {
\t\t\treturn $this->row_object( $this->sites[ (int) $matches[1] ] ?? null );
\t\t}
\t\tif ( false !== strpos( $sql, "FROM {$this->site}" ) && preg_match( '/id\\\\s*=\\\\s*([0-9]+)/', $sql, $matches ) ) {
\t\t\treturn $this->row_object( $this->networks[ (int) $matches[1] ] ?? null );
\t\t}
\t\tif ( false !== strpos( $sql, '_options' ) || false !== strpos( $sql, 'wp_options' ) ) {
\t\t\t$blog_id = $this->option_blog_from_sql( $sql );
\t\t\t$name = $this->option_name_from_sql( $sql );
\t\t\tif ( null !== $name && isset( $this->options_by_blog[ $blog_id ][ $name ] ) ) {
\t\t\t\treturn (object) array( 'option_value' => $this->options_by_blog[ $blog_id ][ $name ], 'autoload' => 'on', 'option_name' => $name );
\t\t\t}
\t\t}
\t\treturn null;
\t}

\tpublic function get_results( $query ) {
\t\t$sql = (string) $query;
\t\t$this->record( 'get_results', $sql );
\t\tif ( false !== strpos( $sql, "FROM {$this->blogs}" ) ) {
\t\t\treturn array_map( array( $this, 'row_object' ), $this->apply_site_filters( $sql ) );
\t\t}
\t\tif ( false !== strpos( $sql, "FROM {$this->site}" ) ) {
\t\t\treturn array_map( array( $this, 'row_object' ), $this->apply_network_filters( $sql ) );
\t\t}
\t\tif ( false !== strpos( $sql, 'WHERE autoload IN' ) ) {
\t\t\t$blog_id = $this->option_blog_from_sql( $sql );
\t\t\t$rows = array();
\t\t\tforeach ( $this->options_by_blog[ $blog_id ] ?? array() as $name => $value ) {
\t\t\t\t$rows[] = (object) array( 'option_name' => $name, 'option_value' => $value );
\t\t\t}
\t\t\treturn $rows;
\t\t}
\t\treturn array();
\t}

\tpublic function get_col( $query ) {
\t\t$sql = (string) $query;
\t\t$this->record( 'get_col', $sql );
\t\tif ( false !== strpos( $sql, "FROM {$this->blogs}" ) ) {
\t\t\t$rows = $this->apply_site_filters( $sql );
\t\t\t$this->last_found_rows = count( $rows );
\t\t\t$rows = $this->apply_limit( $rows, $sql );
\t\t\treturn array_map( fn( $row ) => $row['blog_id'], $rows );
\t\t}
\t\tif ( false !== strpos( $sql, "FROM {$this->site}" ) ) {
\t\t\t$rows = $this->apply_network_filters( $sql );
\t\t\t$this->last_found_rows = count( $rows );
\t\t\t$rows = $this->apply_limit( $rows, $sql );
\t\t\treturn array_map( fn( $row ) => $row['id'], $rows );
\t\t}
\t\treturn array();
\t}

\tpublic function get_var( $query ) {
\t\t$sql = (string) $query;
\t\t$this->record( 'get_var', $sql );
\t\tif ( false !== stripos( $sql, 'SELECT FOUND_ROWS()' ) ) {
\t\t\treturn $this->last_found_rows;
\t\t}
\t\tif ( false !== stripos( $sql, 'COUNT(*)' ) && false !== strpos( $sql, "FROM {$this->blogs}" ) ) {
\t\t\treturn count( $this->apply_site_filters( $sql ) );
\t\t}
\t\tif ( false !== stripos( $sql, 'COUNT(*)' ) && false !== strpos( $sql, "FROM {$this->site}" ) ) {
\t\t\treturn count( $this->apply_network_filters( $sql ) );
\t\t}
\t\tif ( false !== strpos( $sql, '_options' ) || false !== strpos( $sql, 'wp_options' ) ) {
\t\t\t$blog_id = $this->option_blog_from_sql( $sql );
\t\t\t$name = $this->option_name_from_sql( $sql );
\t\t\treturn $this->options_by_blog[ $blog_id ][ $name ] ?? null;
\t\t}
\t\treturn null;
\t}

\tpublic function snapshot() {
\t\treturn array(
\t\t\t'sites' => $this->sites,
\t\t\t'networks' => $this->networks,
\t\t\t'optionsByBlog' => $this->options_by_blog,
\t\t\t'queries' => $this->queries,
\t\t);
\t}
}

function wphx_317_04_bootstrap() {
\tglobal $wpdb, $blog_id, $table_prefix, $current_site;

\t$wpdb = new WPHX_317_04_Fake_WPDB();
\t$blog_id = 1;
\t$table_prefix = 'wp_';
\t$GLOBALS['_wp_switched_stack'] = array();
\t$GLOBALS['switched'] = false;

\trequire_once ABSPATH . WPINC . '/class-wp-error.php';
\trequire_once ABSPATH . WPINC . '/compat.php';
\trequire_once ABSPATH . WPINC . '/utf8.php';
\trequire_once ABSPATH . WPINC . '/load.php';
\trequire_once ABSPATH . WPINC . '/plugin.php';
\trequire_once ABSPATH . WPINC . '/cache.php';
\trequire_once ABSPATH . WPINC . '/cache-compat.php';
\trequire_once ABSPATH . WPINC . '/functions.php';
\trequire_once ABSPATH . WPINC . '/kses.php';
\trequire_once ABSPATH . WPINC . '/formatting.php';
\trequire_once ABSPATH . WPINC . '/option.php';
\trequire_once ABSPATH . WPINC . '/class-wp-meta-query.php';
\trequire_once ABSPATH . WPINC . '/class-wp-network.php';
\trequire_once ABSPATH . WPINC . '/class-wp-network-query.php';
\trequire_once ABSPATH . WPINC . '/ms-network.php';
\trequire_once ABSPATH . WPINC . '/class-wp-site.php';
\trequire_once ABSPATH . WPINC . '/class-wp-site-query.php';
\trequire_once ABSPATH . WPINC . '/ms-site.php';
\trequire_once ABSPATH . WPINC . '/ms-blogs.php';

\t$current_site = new WP_Network(
\t\t(object) array(
\t\t\t'id' => 7,
\t\t\t'domain' => 'network.example.test',
\t\t\t'path' => '/',
\t\t\t'blog_id' => 1,
\t\t\t'cookie_domain' => 'network.example.test',
\t\t\t'site_name' => 'Network Example',
\t\t)
\t);
}

wphx_317_04_bootstrap();
wp_cache_init();

function wphx_317_04_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
\t}
\tif ( is_bool( $value ) ) {
\t\treturn array( 'type' => 'bool', 'value' => $value );
\t}
\tif ( null === $value ) {
\t\treturn array( 'type' => 'null', 'value' => null );
\t}
\treturn array(
\t\t'type' => 'string',
\t\t'value' => (string) $value,
\t\t'hex' => bin2hex( (string) $value ),
\t\t'bytes' => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_317_04_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array( 'key' => wphx_317_04_scalar( $key ), 'value' => wphx_317_04_value( $entry_value ) );
\t\t}
\t\treturn array( 'type' => 'array', 'count' => count( $value ), 'entries' => $entries );
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'type' => 'object', 'class' => get_class( $value ), 'properties' => wphx_317_04_value( get_object_vars( $value ) ) );
\t}
\treturn wphx_317_04_scalar( $value );
}

function wphx_317_04_case( $id, $symbol, $value, $meta = array() ) {
\treturn array( 'id' => $id, 'symbol' => $symbol, 'value' => wphx_317_04_value( $value ), 'meta' => $meta );
}

function wphx_317_04_root_relative_file( ReflectionClass $class ) {
\t$file = $class->getFileName();
\tif ( false === $file ) {
\t\treturn false;
\t}
\treturn str_replace( ABSPATH, '', $file );
}

function wphx_317_04_default_value( ReflectionParameter $parameter ) {
\tif ( ! $parameter->isDefaultValueAvailable() ) {
\t\treturn array( 'available' => false );
\t}
\treturn array( 'available' => true, 'value' => wphx_317_04_value( $parameter->getDefaultValue() ) );
}

function wphx_317_04_reflection_contract( $class_name ) {
\t$class = new ReflectionClass( $class_name );
\t$properties = array();
\tforeach ( $class->getProperties() as $property ) {
\t\t$properties[] = array(
\t\t\t'name' => $property->getName(),
\t\t\t'visibility' => Reflection::getModifierNames( $property->getModifiers() ),
\t\t\t'static' => $property->isStatic(),
\t\t\t'declaringClass' => $property->getDeclaringClass()->getName(),
\t\t\t'hasDefault' => array_key_exists( $property->getName(), $class->getDefaultProperties() ),
\t\t\t'default' => array_key_exists( $property->getName(), $class->getDefaultProperties() ) ? wphx_317_04_value( $class->getDefaultProperties()[ $property->getName() ] ) : null,
\t\t);
\t}
\t$methods = array();
\tforeach ( $class->getMethods() as $method ) {
\t\t$parameters = array();
\t\tforeach ( $method->getParameters() as $parameter ) {
\t\t\t$parameters[] = array(
\t\t\t\t'name' => $parameter->getName(),
\t\t\t\t'position' => $parameter->getPosition(),
\t\t\t\t'byReference' => $parameter->isPassedByReference(),
\t\t\t\t'variadic' => $parameter->isVariadic(),
\t\t\t\t'optional' => $parameter->isOptional(),
\t\t\t\t'default' => wphx_317_04_default_value( $parameter ),
\t\t\t);
\t\t}
\t\t$methods[] = array(
\t\t\t'name' => $method->getName(),
\t\t\t'visibility' => Reflection::getModifierNames( $method->getModifiers() ),
\t\t\t'static' => $method->isStatic(),
\t\t\t'final' => $method->isFinal(),
\t\t\t'abstract' => $method->isAbstract(),
\t\t\t'returnsReference' => $method->returnsReference(),
\t\t\t'declaringClass' => $method->getDeclaringClass()->getName(),
\t\t\t'parameters' => $parameters,
\t\t);
\t}
\t$attributes = array_map( fn( $attribute ) => $attribute->getName(), $class->getAttributes() );
\treturn array(
\t\t'name' => $class->getName(),
\t\t'file' => wphx_317_04_root_relative_file( $class ),
\t\t'final' => $class->isFinal(),
\t\t'abstract' => $class->isAbstract(),
\t\t'parent' => $class->getParentClass() ? $class->getParentClass()->getName() : null,
\t\t'interfaces' => $class->getInterfaceNames(),
\t\t'traits' => $class->getTraitNames(),
\t\t'attributes' => $attributes,
\t\t'properties' => $properties,
\t\t'methods' => $methods,
\t);
}

function wphx_317_04_reset_state() {
\tglobal $wpdb, $wp_filter, $blog_id, $table_prefix, $current_site;
\t$wpdb->reset();
\t$blog_id = 1;
\t$table_prefix = 'wp_';
\t$current_site = new WP_Network( (object) array( 'id' => 7, 'domain' => 'network.example.test', 'path' => '/', 'blog_id' => 1, 'cookie_domain' => 'network.example.test', 'site_name' => 'Network Example' ) );
\t$GLOBALS['_wp_switched_stack'] = array();
\t$GLOBALS['switched'] = false;
\t$GLOBALS['wp_actions'] = array();
\t$GLOBALS['wp_current_filter'] = array();
\t$wp_filter = array();
\twp_cache_init();
\twp_cache_flush();
}

function wphx_317_04_site_summary( $site ) {
\treturn array(
\t\t'class' => is_object( $site ) ? get_class( $site ) : gettype( $site ),
\t\t'objectVars' => is_object( $site ) ? get_object_vars( $site ) : null,
\t\t'id' => is_object( $site ) ? $site->id : null,
\t\t'networkId' => is_object( $site ) ? $site->network_id : null,
\t\t'toArray' => is_object( $site ) && method_exists( $site, 'to_array' ) ? $site->to_array() : null,
\t);
}

function wphx_317_04_network_summary( $network ) {
\treturn array(
\t\t'class' => is_object( $network ) ? get_class( $network ) : gettype( $network ),
\t\t'objectVars' => is_object( $network ) ? get_object_vars( $network ) : null,
\t\t'id' => is_object( $network ) ? $network->id : null,
\t\t'blogId' => is_object( $network ) ? $network->blog_id : null,
\t\t'siteId' => is_object( $network ) ? $network->site_id : null,
\t\t'cookieDomain' => is_object( $network ) ? $network->cookie_domain : null,
\t);
}

function wphx_317_04_query_summary( $query, $result, $result_summarizer ) {
\t$reflection = new ReflectionObject( $query );
\t$sql_clauses = null;
\tif ( $reflection->hasProperty( 'sql_clauses' ) ) {
\t\t$property = $reflection->getProperty( 'sql_clauses' );
\t\t$property->setAccessible( true );
\t\t$sql_clauses = $property->getValue( $query );
\t}
\treturn array(
\t\t'result' => array_map( $result_summarizer, (array) $result ),
\t\t'queryVars' => $query->query_vars,
\t\t'request' => preg_replace( '/\\s+/', ' ', trim( $query->request ) ),
\t\t'sqlClauses' => $sql_clauses,
\t\t'foundSites' => property_exists( $query, 'found_sites' ) ? $query->found_sites : null,
\t\t'foundNetworks' => property_exists( $query, 'found_networks' ) ? $query->found_networks : null,
\t\t'maxNumPages' => $query->max_num_pages,
\t);
}

function wphx_317_04_run_cases() {
\t$cases = array();

\twphx_317_04_reset_state();
\t$cases[] = wphx_317_04_case(
\t\t'abi:site-network-reflection',
\t\t'WP_Site/WP_Network/WP_Site_Query/WP_Network_Query',
\t\tarray(
\t\t\t'WP_Site' => wphx_317_04_reflection_contract( 'WP_Site' ),
\t\t\t'WP_Network' => wphx_317_04_reflection_contract( 'WP_Network' ),
\t\t\t'WP_Site_Query' => wphx_317_04_reflection_contract( 'WP_Site_Query' ),
\t\t\t'WP_Network_Query' => wphx_317_04_reflection_contract( 'WP_Network_Query' ),
\t\t)
\t);

\twphx_317_04_reset_state();
\t$site = new WP_Site( (object) array( 'blog_id' => '2', 'domain' => 'two.example.test', 'path' => '/two/', 'site_id' => '7', 'registered' => '2026-02-01 00:00:00', 'last_updated' => '2026-02-02 00:00:00', 'public' => '1', 'archived' => '0', 'mature' => '0', 'spam' => '0', 'deleted' => '0', 'lang_id' => '1' ) );
\t$before_ms_loaded = array( 'blogname' => $site->blogname, 'issetBlogname' => isset( $site->blogname ) );
\tdo_action( 'ms_loaded' );
\t$after_ms_loaded = array( 'blogname' => $site->blogname, 'siteurl' => $site->siteurl, 'postCount' => $site->post_count, 'home' => $site->home, 'issetHome' => isset( $site->home ) );
\t$site->id = 20;
\t$site->network_id = 70;
\t$site->custom_probe = 'custom-prop';
\t$cases[] = wphx_317_04_case(
\t\t'site:constructor-magic-details',
\t\t'WP_Site::__construct/__get/__isset/__set/to_array',
\t\tarray(
\t\t\t'beforeMsLoaded' => $before_ms_loaded,
\t\t\t'afterMsLoaded' => $after_ms_loaded,
\t\t\t'afterSet' => wphx_317_04_site_summary( $site ),
\t\t\t'instance' => wphx_317_04_site_summary( WP_Site::get_instance( 1 ) ),
\t\t\t'db' => $GLOBALS['wpdb']->snapshot(),
\t\t)
\t);

\twphx_317_04_reset_state();
\t$network = new WP_Network( (object) array( 'id' => '8', 'domain' => 'www.alt.example.test', 'path' => '/alt/', 'blog_id' => '3', 'cookie_domain' => '', 'site_name' => 'Alt Network' ) );
\t$network->site_id = 30;
\t$network->custom_probe = 'network-custom';
\t$cases[] = wphx_317_04_case(
\t\t'network:constructor-magic-instance',
\t\t'WP_Network::__construct/__get/__isset/__set/get_instance',
\t\tarray(
\t\t\t'network' => wphx_317_04_network_summary( $network ),
\t\t\t'isset' => array( 'id' => isset( $network->id ), 'blogId' => isset( $network->blog_id ), 'siteId' => isset( $network->site_id ), 'missing' => isset( $network->missing ) ),
\t\t\t'instance' => wphx_317_04_network_summary( WP_Network::get_instance( 7 ) ),
\t\t\t'db' => $GLOBALS['wpdb']->snapshot(),
\t\t)
\t);

\twphx_317_04_reset_state();
\t$site_query = new WP_Site_Query();
\t$site_ids = $site_query->query( array( 'fields' => 'ids', 'network_id' => 7, 'domain__in' => array( 'one.example.test', 'two.example.test' ), 'search' => 'example', 'number' => 1, 'offset' => 1, 'orderby' => array( 'domain_length' => 'DESC' ), 'order' => 'ASC', 'no_found_rows' => false, 'update_site_meta_cache' => false ) );
\t$cases[] = wphx_317_04_case(
\t\t'site-query:ids-found-rows-search',
\t\t'WP_Site_Query::query',
\t\twphx_317_04_query_summary( $site_query, $site_ids, fn( $id ) => (int) $id ),
\t\tarray( 'db' => $GLOBALS['wpdb']->snapshot() )
\t);

\twphx_317_04_reset_state();
\t$site_objects_query = new WP_Site_Query();
\t$site_objects = $site_objects_query->query( array( 'network_id' => 7, 'number' => 2, 'orderby' => 'id', 'order' => 'ASC', 'no_found_rows' => false, 'update_site_cache' => true, 'update_site_meta_cache' => false ) );
\t$count_query = new WP_Site_Query();
\t$site_count = $count_query->query( array( 'count' => true, 'network_id' => 7, 'update_site_meta_cache' => false ) );
\t$cases[] = wphx_317_04_case(
\t\t'site-query:objects-and-count',
\t\t'get_sites/WP_Site_Query',
\t\tarray(
\t\t\t'objects' => wphx_317_04_query_summary( $site_objects_query, $site_objects, 'wphx_317_04_site_summary' ),
\t\t\t'count' => array( 'result' => $site_count, 'request' => preg_replace( '/\\s+/', ' ', trim( $count_query->request ) ), 'queryVars' => $count_query->query_vars ),
\t\t),
\t\tarray( 'db' => $GLOBALS['wpdb']->snapshot() )
\t);

\twphx_317_04_reset_state();
\t$network_query = new WP_Network_Query();
\t$network_ids = $network_query->query( array( 'fields' => 'ids', 'domain__in' => array( 'network.example.test', 'www.alt.example.test', 'deep.network.example.test' ), 'path__in' => array( '/', '/alt/', '/deep/' ), 'search' => 'example', 'number' => 2, 'orderby' => array( 'domain_length' => 'DESC' ), 'order' => 'ASC', 'no_found_rows' => false ) );
\t$cases[] = wphx_317_04_case(
\t\t'network-query:ids-found-rows-search',
\t\t'WP_Network_Query::query',
\t\twphx_317_04_query_summary( $network_query, $network_ids, fn( $id ) => (int) $id ),
\t\tarray( 'db' => $GLOBALS['wpdb']->snapshot() )
\t);

\twphx_317_04_reset_state();
\t$network_objects_query = new WP_Network_Query();
\t$network_objects = $network_objects_query->query( array( 'number' => 2, 'orderby' => 'id', 'order' => 'ASC', 'no_found_rows' => false, 'update_network_cache' => true ) );
\t$network_count_query = new WP_Network_Query();
\t$network_count = $network_count_query->query( array( 'count' => true, 'domain__in' => array( 'network.example.test', 'www.alt.example.test' ) ) );
\t$cases[] = wphx_317_04_case(
\t\t'network-query:objects-and-count',
\t\t'get_networks/WP_Network_Query',
\t\tarray(
\t\t\t'objects' => wphx_317_04_query_summary( $network_objects_query, $network_objects, 'wphx_317_04_network_summary' ),
\t\t\t'count' => array( 'result' => $network_count, 'request' => preg_replace( '/\\s+/', ' ', trim( $network_count_query->request ) ), 'queryVars' => $network_count_query->query_vars ),
\t\t),
\t\tarray( 'db' => $GLOBALS['wpdb']->snapshot() )
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode' => $mode,
\t'phpVersion' => PHP_VERSION,
\t'multisite' => is_multisite(),
\t'coveredFunctionExists' => array(
\t\t'get_site' => function_exists( 'get_site' ),
\t\t'get_sites' => function_exists( 'get_sites' ),
\t\t'get_network' => function_exists( 'get_network' ),
\t\t'get_networks' => function_exists( 'get_networks' ),
\t),
\t'coveredClassExists' => array(
\t\t'WP_Site' => class_exists( 'WP_Site' ),
\t\t'WP_Site_Query' => class_exists( 'WP_Site_Query' ),
\t\t'WP_Network' => class_exists( 'WP_Network' ),
\t\t'WP_Network_Query' => class_exists( 'WP_Network_Query' ),
\t),
\t'cases' => wphx_317_04_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    multisite: result.multisite,
    coveredFunctionExists: result.coveredFunctionExists,
    coveredClassExists: result.coveredClassExists,
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-317-site-network-query`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/site-network-query-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "WP_Site, WP_Network, WP_Site_Query, and WP_Network_Query ABI/query fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 multisite site/network classes and query objects preserve reflection-visible ABI, magic property behavior, query SQL shape, found-row behavior, cache priming, and public object values while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-multisite-site-network-query-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-317-site-network-query",
        "npm run wp:core:wphx-317-site-network-query:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-317-04-site-network-query-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-317.04. The probe supplies deterministic site/network rows and option values through a constrained wpdb test double; installed multisite routing, live database parity, and Haxe-owned class/query replacements remain later WPHX-317 gates."
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
  schema: "wphx.wp-core-site-network-query-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-multisite-site-network-query-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    options_transients_fixture: inputRecord(OPTIONS_TRANSIENTS),
    blog_switch_cache_fixture: inputRecord(BLOG_SWITCH_CACHE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "site_network_query_objects")?.label ?? "site/network objects and query classes",
    evidence_class: "static_and_runtime_abi_plus_targeted_semantic_parity",
    artifact_scope: "oracle_mirror_fixture",
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "wpdb-site-network-query-test-double",
        reason:
          "The probe supplies deterministic wp_blogs, wp_site, and per-blog option rows so real WordPress multisite object/query classes can execute without a live database. Live SQL/database parity remains a later gate."
      },
      {
        id: "reflection-visible-abi",
        reason:
          "Reflection contracts intentionally capture PHP class, property, method, visibility, attribute, and declaring-file shape because plugins can inspect these surfaces."
      },
      {
        id: "multisite-magic-properties",
        reason:
          "WP_Site and WP_Network magic aliases and dynamic properties are plugin-facing PHP behavior and must remain observable during Haxe migration."
      },
      {
        id: "query-request-sql-shape",
        reason:
          "WP_Site_Query and WP_Network_Query expose request SQL, found rows, and max page counts as public runtime state."
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
      detail: "The candidate side is a copied WordPress oracle source tree until selected multisite site/network classes or query helpers move to Haxe parity candidates."
    },
    {
      id: "live-database-not-yet-authoritative",
      owner: "WPHX-317.07",
      detail: "This fixture uses a deterministic wpdb test double; live MySQL/MariaDB multisite query parity remains a later installed/distribution gate."
    },
    {
      id: "installed-routing-not-yet-covered",
      owner: "WPHX-317.05",
      detail: "The probe enables multisite state but does not claim full installed multisite domain/path bootstrap routing parity."
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
  id: "receipt:wphx-317-04-site-network-query-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WP_Site/WP_Network ABI and query fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the site/network query fixture harness"
    },
    {
      path: "tools/wp-core/run-multisite-site-network-query-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-317-site-network-query",
    "npm run wp:core:wphx-317-site-network-query:check",
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
