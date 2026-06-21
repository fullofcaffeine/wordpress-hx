#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.7",
  external_ref: "WPHX-305.07",
  title: "Add live MySQL/MariaDB database runtime gate"
};
const OUT_ROOT = "build/wp-core/wphx-305-07";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-305-07-wpdb-live-db-runtime-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-07-wpdb-live-db-runtime-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-07-wpdb-live-db-runtime-gate.v1.json";
const SCHEMA_OPTION_FIXTURE = "manifests/wp-core/wphx-305-06-wpdb-schema-option-integration-fixture.v1.json";
const WPDB_SURFACE = "manifests/wp-core/wphx-305-01-wpdb-surface.v1.json";
const RECORDED_AT = "2026-06-21T04:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const DB_NAME = "wordpresshx_live";
const DB_USER = "root";
const DB_PASSWORD = "wordpresshx-live-password";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wpdb.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/kses.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-admin/includes/schema.php",
  "src/wp-admin/includes/upgrade.php"
];

const COVERED_SYMBOLS = [
  "wpdb::__construct",
  "wpdb::db_connect",
  "wpdb::query",
  "wpdb::get_var",
  "wpdb::get_row",
  "wpdb::get_col",
  "wpdb::get_results",
  "wpdb::insert",
  "wpdb::update",
  "wpdb::delete",
  "wpdb::prepare",
  "wpdb::set_charset",
  "wpdb::set_sql_mode",
  "wpdb::get_table_charset",
  "wpdb::get_col_charset",
  "wpdb::get_col_length",
  "wpdb::db_version",
  "wpdb::db_server_info",
  "maybe_create_table",
  "maybe_add_column",
  "dbDelta",
  "wp_get_db_schema",
  "wp_should_upgrade_global_tables",
  "wp_load_alloptions",
  "get_option",
  "get_options",
  "add_option",
  "update_option",
  "delete_option",
  "wp_prime_option_caches",
  "wp_set_option_autoload_values",
  "set_transient",
  "get_transient",
  "delete_transient",
  "delete_expired_transients"
];

const FIXTURE_CASES = [
  { id: "schema:maybe-create-table", symbol: "maybe_create_table", focus: "existing table short-circuit and missing table creation through a live SHOW TABLES and CREATE TABLE path" },
  { id: "schema:maybe-add-column", symbol: "maybe_add_column", focus: "live DESC column discovery and ALTER TABLE ADD COLUMN execution" },
  { id: "schema:dbdelta-plan-no-execute", symbol: "dbDelta", focus: "live DESCRIBE/SHOW INDEX metadata consumed for a non-executed dbDelta schema plan" },
  { id: "schema:dbdelta-execute-and-dml", symbol: "dbDelta", focus: "live ALTER/INSERT/UPDATE execution and resulting schema/data state" },
  { id: "schema:wp-get-db-schema-blog-scope", symbol: "wp_get_db_schema", focus: "schema SQL generation with live wpdb charset/collation state" },
  { id: "schema:global-upgrade-filter", symbol: "wp_should_upgrade_global_tables/dbDelta", focus: "global table dbDelta filtering before live metadata/execution" },
  { id: "options:autoload-add-update-delete", symbol: "wp_load_alloptions/get_option/add_option/update_option/delete_option", focus: "real option.php cache/storage flow over a live wp_options table" },
  { id: "options:batch-prime-and-autoload", symbol: "get_options/wp_prime_option_caches/wp_set_option_autoload_values", focus: "batch option priming and autoload updates against live rows" },
  { id: "transients:database-backed", symbol: "set_transient/get_transient/delete_transient", focus: "non-expiring transient storage through the live options table" },
  { id: "transients:delete-expired-sql", symbol: "delete_expired_transients", focus: "live multi-table expired transient cleanup SQL" },
  { id: "runtime:server-sql-mode-and-metadata", symbol: "wpdb::db_server_info/wpdb::set_sql_mode", focus: "server identity, SQL mode normalization, charset/collation, and information-schema metadata" },
  { id: "runtime:permission-error", symbol: "wpdb::query", focus: "limited-user permission denial and wpdb last_error behavior" },
  { id: "runtime:transaction-and-locking", symbol: "wpdb::query", focus: "transaction rollback and explicit table lock/unlock behavior" }
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

function writeAdminStub(root) {
  const target = `${root}/wp-admin/includes/admin.php`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `<?php
/**
 * WPHX-305.07 live database runtime gate stub.
 *
 * upgrade.php requires the broad admin API at load time. The live gate exercises
 * dbDelta(), maybe_create_table(), maybe_add_column(), and option/transient
 * storage only, so admin.php remains outside this workset.
 */
`
  );
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
  writeAdminStub(root);
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
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_ADMIN', true );
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
define( 'AUTH_SALT', 'wphx-305-07-auth-salt' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', 'utf8mb4_unicode_ci' );
define( 'MULTISITE', false );

require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wpdb.php';

class WPHX_305_07_WPDB extends wpdb {
\tpublic function public_get_table_charset( $table ) {
\t\treturn $this->get_table_charset( $table );
\t}
}

$db_host_with_port = $db_host . ':' . $db_port;
$wpdb = new WPHX_305_07_WPDB( $db_user, $db_password, $db_name, $db_host_with_port );
if ( ! $wpdb->ready ) {
\tfwrite( STDERR, json_encode( array( 'connect_error' => $wpdb->last_error ), JSON_UNESCAPED_SLASHES ) . PHP_EOL );
\texit( 2 );
}
$GLOBALS['wpdb'] = $wpdb;
$GLOBALS['table_prefix'] = 'wp_';
$GLOBALS['wp_db_version'] = 60497;
$wpdb->set_prefix( 'wp_' );
$wpdb->set_blog_id( 1, 1 );

require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/class-wp-object-cache.php';
require_once ABSPATH . WPINC . '/functions.php';
require_once ABSPATH . WPINC . '/kses.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . 'wp-admin/includes/schema.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';

wp_cache_init();
wp_using_ext_object_cache( false );

function wphx_305_07_fail_on_false( $result, $context ) {
\tglobal $wpdb;
\tif ( false === $result ) {
\t\tthrow new RuntimeException( $context . ': ' . $wpdb->last_error );
\t}
\treturn $result;
}

function wphx_305_07_exec( $sql ) {
\tglobal $wpdb;
\treturn wphx_305_07_fail_on_false( $wpdb->query( $sql ), $sql );
}

function wphx_305_07_reset_database() {
\tglobal $wpdb;
\t$wpdb->suppress_errors( true );
\t$wpdb->query( "UNLOCK TABLES" );
\t$wpdb->query( "ROLLBACK" );
\t$wpdb->query( "DROP USER IF EXISTS 'wphx_limited'@'%'" );
\t$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 0' );
\tforeach ( array( 'wp_permission_denied', 'wp_created', 'wp_existing', 'wp_addcol', 'wp_delta', 'wp_options', 'wp_users' ) as $table ) {
\t\t$wpdb->query( "DROP TABLE IF EXISTS " . $table );
\t}
\t$wpdb->query( 'SET FOREIGN_KEY_CHECKS = 1' );
\t$wpdb->suppress_errors( false );

\twphx_305_07_exec( "SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'" );
\twphx_305_07_exec( "CREATE TABLE wp_options (
option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
option_name varchar(191) NOT NULL DEFAULT '',
option_value longtext NOT NULL,
autoload varchar(20) NOT NULL DEFAULT 'yes',
PRIMARY KEY (option_id),
UNIQUE KEY option_name (option_name),
KEY autoload (autoload)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_305_07_exec( "CREATE TABLE wp_existing (id int(11) NOT NULL DEFAULT '0') ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_305_07_exec( "CREATE TABLE wp_addcol (id int(11) NOT NULL DEFAULT '0') ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_305_07_exec( "CREATE TABLE wp_delta (
id int(11) NOT NULL DEFAULT '0',
title varchar(20) NOT NULL DEFAULT 'old',
PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );
\twphx_305_07_exec( "CREATE TABLE wp_users (ID bigint(20) unsigned NOT NULL) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" );

\t$seed_options = array(
\t\tarray( 'siteurl', 'https://example.test/', 'on' ),
\t\tarray( 'home', '', 'on' ),
\t\tarray( 'wphx_autoloaded', serialize( array( 'alpha' => 1, 'beta' => false ) ), 'on' ),
\t\tarray( 'wphx_nonautoload', 'stored-off', 'off' ),
\t\tarray( 'wphx_bulk_on', 'bulk-on', 'on' ),
\t\tarray( 'wphx_bulk_off', 'bulk-off', 'off' ),
\t\tarray( 'wphx_delete_me', 'delete-me', 'off' ),
\t\tarray( '_transient_wphx_stored', 'stored-transient', 'off' ),
\t\tarray( '_transient_timeout_old_value', '1', 'off' ),
\t\tarray( '_transient_old_value', 'expired-transient', 'off' ),
\t);
\tforeach ( $seed_options as $row ) {
\t\twphx_305_07_fail_on_false(
\t\t\t$wpdb->query( $wpdb->prepare( 'INSERT INTO wp_options (option_name, option_value, autoload) VALUES (%s, %s, %s)', $row[0], $row[1], $row[2] ) ),
\t\t\t'seed option ' . $row[0]
\t\t);
\t}
\t$wpdb->flush();
\twp_cache_flush();
\twp_using_ext_object_cache( false );
}

function wphx_305_07_normalize_string( $value ) {
\t$value = (string) $value;
\t$value = preg_replace( '/\\s+/', ' ', $value );
\treturn trim( $value );
}

function wphx_305_07_error_shape( $message ) {
\tif ( '' === (string) $message ) {
\t\treturn array( 'present' => false, 'sha256' => null, 'message' => '' );
\t}
\t$message = wphx_305_07_normalize_string( $message );
\treturn array(
\t\t'present' => true,
\t\t'sha256'  => hash( 'sha256', $message ),
\t\t'message' => $message,
\t);
}

function wphx_305_07_rows( $sql ) {
\tglobal $wpdb;
\t$rows = $wpdb->get_results( $sql, ARRAY_A );
\tif ( ! is_array( $rows ) ) {
\t\treturn array();
\t}
\treturn $rows;
}

function wphx_305_07_table_exists( $table ) {
\tglobal $wpdb;
\treturn $table === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wpdb->esc_like( $table ) ) );
}

function wphx_305_07_columns( $table ) {
\t$rows = wphx_305_07_rows( 'DESCRIBE ' . $table );
\t$result = array();
\tforeach ( $rows as $row ) {
\t\t$result[] = array(
\t\t\t'Field'   => $row['Field'],
\t\t\t'Type'    => strtolower( $row['Type'] ),
\t\t\t'Null'    => $row['Null'],
\t\t\t'Key'     => $row['Key'],
\t\t\t'Default' => $row['Default'],
\t\t\t'Extra'   => $row['Extra'],
\t\t);
\t}
\treturn $result;
}

function wphx_305_07_indexes( $table ) {
\t$rows = wphx_305_07_rows( 'SHOW INDEX FROM ' . $table );
\t$result = array();
\tforeach ( $rows as $row ) {
\t\t$result[] = array(
\t\t\t'Key_name'    => $row['Key_name'],
\t\t\t'Column_name' => $row['Column_name'],
\t\t\t'Non_unique'  => (string) $row['Non_unique'],
\t\t\t'Sub_part'    => $row['Sub_part'],
\t\t\t'Index_type'  => $row['Index_type'],
\t\t);
\t}
\treturn $result;
}

function wphx_305_07_option_rows( $names ) {
\tglobal $wpdb;
\tif ( ! $names ) {
\t\treturn array();
\t}
\t$placeholders = implode( ',', array_fill( 0, count( $names ), '%s' ) );
\t$rows = $wpdb->get_results(
\t\t$wpdb->prepare( "SELECT option_name, option_value, autoload FROM wp_options WHERE option_name IN ($placeholders) ORDER BY option_name", $names ),
\t\tARRAY_A
\t);
\t$result = array();
\tforeach ( $rows as $row ) {
\t\t$result[ $row['option_name'] ] = array(
\t\t\t'value'         => maybe_unserialize( $row['option_value'] ),
\t\t\t'rawSha256'     => hash( 'sha256', $row['option_value'] ),
\t\t\t'rawBytes'      => strlen( $row['option_value'] ),
\t\t\t'autoload'      => $row['autoload'],
\t\t);
\t}
\tksort( $result );
\treturn $result;
}

function wphx_305_07_cache_pick( $keys ) {
\t$result = array();
\tforeach ( $keys as $key ) {
\t\t$value = wp_cache_get( $key, 'options' );
\t\t$result[ $key ] = false === $value ? false : array( 'sha256' => hash( 'sha256', (string) $value ), 'bytes' => strlen( (string) $value ) );
\t}
\treturn $result;
}

function wphx_305_07_option_snapshot( $keys ) {
\treturn array(
\t\t'rows'  => wphx_305_07_option_rows( $keys ),
\t\t'cache' => array(
\t\t\t'alloptionsKeys' => is_array( wp_cache_get( 'alloptions', 'options' ) ) ? array_keys( wp_cache_get( 'alloptions', 'options' ) ) : false,
\t\t\t'notoptionsKeys' => is_array( wp_cache_get( 'notoptions', 'options' ) ) ? array_keys( wp_cache_get( 'notoptions', 'options' ) ) : false,
\t\t\t'keys'           => wphx_305_07_cache_pick( $keys ),
\t\t),
\t);
}

function wphx_305_07_schema_ddl() {
\treturn "CREATE TABLE wp_delta (
id int(11) NOT NULL default '0',
title varchar(50) NOT NULL default 'new',
slug varchar(30) NOT NULL default '',
PRIMARY KEY  (id),
KEY title_idx (title)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
}

function wphx_305_07_case( $id, $symbol, $callback ) {
\twphx_305_07_reset_database();
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
\t\t'value'  => $value,
\t\t'error'  => $error,
\t);
}

function wphx_305_07_run_cases() {
\tglobal $wpdb, $db_name, $db_host_with_port;
\t$cases = array();

\t$cases[] = wphx_305_07_case(
\t\t'schema:maybe-create-table',
\t\t'maybe_create_table',
\t\tfunction () {
\t\t\t$existing = maybe_create_table( 'wp_existing', "CREATE TABLE wp_existing (id int(11) NOT NULL default '0')" );
\t\t\t$created  = maybe_create_table( 'wp_created', "CREATE TABLE wp_created (id int(11) NOT NULL default '0')" );
\t\t\treturn array(
\t\t\t\t'existing'      => $existing,
\t\t\t\t'created'       => $created,
\t\t\t\t'existingTable' => wphx_305_07_table_exists( 'wp_existing' ),
\t\t\t\t'createdTable'  => wphx_305_07_table_exists( 'wp_created' ),
\t\t\t\t'createdCols'   => wphx_305_07_columns( 'wp_created' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'schema:maybe-add-column',
\t\t'maybe_add_column',
\t\tfunction () {
\t\t\t$existing = maybe_add_column( 'wp_addcol', 'id', "ALTER TABLE wp_addcol ADD COLUMN id int(11) NOT NULL default '0'" );
\t\t\t$added    = maybe_add_column( 'wp_addcol', 'slug', "ALTER TABLE wp_addcol ADD COLUMN slug varchar(30) NOT NULL default ''" );
\t\t\treturn array(
\t\t\t\t'existing' => $existing,
\t\t\t\t'added'    => $added,
\t\t\t\t'columns'  => wphx_305_07_columns( 'wp_addcol' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'schema:dbdelta-plan-no-execute',
\t\t'dbDelta',
\t\tfunction () {
\t\t\t$plan = dbDelta( wphx_305_07_schema_ddl(), false );
\t\t\treturn array(
\t\t\t\t'plan'    => $plan,
\t\t\t\t'columns' => wphx_305_07_columns( 'wp_delta' ),
\t\t\t\t'indexes' => wphx_305_07_indexes( 'wp_delta' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'schema:dbdelta-execute-and-dml',
\t\t'dbDelta',
\t\tfunction () {
\t\t\t$queries = array(
\t\t\t\twphx_305_07_schema_ddl(),
\t\t\t\t"INSERT INTO wp_delta (id, title, slug) VALUES (1, 'Alpha', 'alpha')",
\t\t\t\t"UPDATE wp_delta SET title = 'Beta' WHERE id = 1",
\t\t\t);
\t\t\t$plan = dbDelta( $queries, true );
\t\t\treturn array(
\t\t\t\t'plan'    => $plan,
\t\t\t\t'columns' => wphx_305_07_columns( 'wp_delta' ),
\t\t\t\t'indexes' => wphx_305_07_indexes( 'wp_delta' ),
\t\t\t\t'rows'    => wphx_305_07_rows( 'SELECT id, title, slug FROM wp_delta ORDER BY id' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'schema:wp-get-db-schema-blog-scope',
\t\t'wp_get_db_schema',
\t\tfunction () use ( $wpdb ) {
\t\t\t$schema = wp_get_db_schema( 'blog', 7 );
\t\t\treturn array(
\t\t\t\t'bytes'           => strlen( $schema ),
\t\t\t\t'sha256'          => hash( 'sha256', $schema ),
\t\t\t\t'containsOptions' => false !== strpos( $schema, 'CREATE TABLE wp_options' ),
\t\t\t\t'containsPosts'   => false !== strpos( $schema, 'CREATE TABLE wp_posts' ),
\t\t\t\t'charsetCollate'  => $wpdb->get_charset_collate(),
\t\t\t\t'blogidAfter'     => $wpdb->blogid,
\t\t\t\t'prefixAfter'     => $wpdb->prefix,
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'schema:global-upgrade-filter',
\t\t'wp_should_upgrade_global_tables/dbDelta',
\t\tfunction () {
\t\t\t$deny = function () {
\t\t\t\treturn false;
\t\t\t};
\t\t\tadd_filter( 'wp_should_upgrade_global_tables', $deny );
\t\t\t$plan_denied = dbDelta( 'CREATE TABLE wp_users (ID bigint(20) unsigned NOT NULL, PRIMARY KEY  (ID))', false );
\t\t\tremove_filter( 'wp_should_upgrade_global_tables', $deny );
\t\t\t$plan_allowed = dbDelta( 'CREATE TABLE wp_users (ID bigint(20) unsigned NOT NULL, PRIMARY KEY  (ID))', false );
\t\t\treturn array(
\t\t\t\t'allowedShouldUpgrade' => wp_should_upgrade_global_tables(),
\t\t\t\t'planDenied'           => $plan_denied,
\t\t\t\t'planAllowed'          => $plan_allowed,
\t\t\t\t'indexes'              => wphx_305_07_indexes( 'wp_users' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'options:autoload-add-update-delete',
\t\t'wp_load_alloptions/get_option/add_option/update_option/delete_option',
\t\tfunction () {
\t\t\t$alloptions = wp_load_alloptions();
\t\t\t$added      = add_option( 'wphx_added', array( 'nested' => 'value' ), '', true );
\t\t\t$updated    = update_option( 'wphx_nonautoload', 'changed-value', true );
\t\t\t$deleted    = delete_option( 'wphx_delete_me' );
\t\t\treturn array(
\t\t\t\t'alloptionKeys' => array_keys( $alloptions ),
\t\t\t\t'siteurl'       => get_option( 'siteurl' ),
\t\t\t\t'home'          => get_option( 'home' ),
\t\t\t\t'added'         => $added,
\t\t\t\t'addedValue'    => get_option( 'wphx_added' ),
\t\t\t\t'updated'       => $updated,
\t\t\t\t'updatedValue'  => get_option( 'wphx_nonautoload' ),
\t\t\t\t'deleted'       => $deleted,
\t\t\t\t'deletedAfter'  => get_option( 'wphx_delete_me', 'after-delete-default' ),
\t\t\t\t'snapshot'      => wphx_305_07_option_snapshot( array( 'wphx_added', 'wphx_nonautoload', 'wphx_delete_me' ) ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'options:batch-prime-and-autoload',
\t\t'get_options/wp_prime_option_caches/wp_set_option_autoload_values',
\t\tfunction () {
\t\t\t$options = get_options( array( 'wphx_nonautoload', 'wphx_autoloaded', 'wphx_absent_batch' ) );
\t\t\t$autoload_results = wp_set_option_autoload_values(
\t\t\t\tarray(
\t\t\t\t\t'wphx_bulk_on'  => false,
\t\t\t\t\t'wphx_bulk_off' => true,
\t\t\t\t\t'wphx_absent'   => true,
\t\t\t\t)
\t\t\t);
\t\t\treturn array(
\t\t\t\t'options'         => $options,
\t\t\t\t'autoloadResults' => $autoload_results,
\t\t\t\t'snapshot'        => wphx_305_07_option_snapshot( array( 'wphx_nonautoload', 'wphx_absent_batch', 'wphx_bulk_on', 'wphx_bulk_off' ) ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'transients:database-backed',
\t\t'set_transient/get_transient/delete_transient',
\t\tfunction () {
\t\t\twp_using_ext_object_cache( false );
\t\t\t$set     = set_transient( 'wphx_runtime', array( 'payload' => 'value' ), 0 );
\t\t\t$value   = get_transient( 'wphx_runtime' );
\t\t\t$deleted = delete_transient( 'wphx_runtime' );
\t\t\t$after   = get_transient( 'wphx_runtime' );
\t\t\treturn array(
\t\t\t\t'set'      => $set,
\t\t\t\t'value'    => $value,
\t\t\t\t'deleted'  => $deleted,
\t\t\t\t'after'    => $after,
\t\t\t\t'snapshot' => wphx_305_07_option_snapshot( array( '_transient_wphx_runtime' ) ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'transients:delete-expired-sql',
\t\t'delete_expired_transients',
\t\tfunction () {
\t\t\tdelete_expired_transients( true );
\t\t\treturn array(
\t\t\t\t'oldValue'   => get_option( '_transient_old_value', 'deleted' ),
\t\t\t\t'oldTimeout' => get_option( '_transient_timeout_old_value', 'deleted' ),
\t\t\t\t'snapshot'   => wphx_305_07_option_snapshot( array( '_transient_old_value', '_transient_timeout_old_value' ) ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'runtime:server-sql-mode-and-metadata',
\t\t'wpdb::db_server_info/wpdb::set_sql_mode',
\t\tfunction () use ( $wpdb ) {
\t\t\treturn array(
\t\t\t\t'dbServerInfo'       => $wpdb->db_server_info(),
\t\t\t\t'dbVersion'          => $wpdb->db_version(),
\t\t\t\t'sqlMode'            => $wpdb->get_var( 'SELECT @@SESSION.sql_mode' ),
\t\t\t\t'charsetCollate'     => $wpdb->get_charset_collate(),
\t\t\t\t'tableCharset'       => $wpdb->public_get_table_charset( 'wp_options' ),
\t\t\t\t'optionNameCharset'  => $wpdb->get_col_charset( 'wp_options', 'option_name' ),
\t\t\t\t'optionValueCharset' => $wpdb->get_col_charset( 'wp_options', 'option_value' ),
\t\t\t\t'optionNameLength'   => $wpdb->get_col_length( 'wp_options', 'option_name' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'runtime:permission-error',
\t\t'wpdb::query',
\t\tfunction () use ( $db_name, $db_host_with_port ) {
\t\t\tglobal $wpdb;
\t\t\t$limited_user = 'wphx_limited';
\t\t\t$limited_pass = 'wphx-limited-pass';
\t\t\twphx_305_07_exec( "DROP USER IF EXISTS '$limited_user'@'%'" );
\t\t\twphx_305_07_exec( "CREATE USER '$limited_user'@'%' IDENTIFIED BY '$limited_pass'" );
\t\t\twphx_305_07_exec( "GRANT SELECT ON $db_name.* TO '$limited_user'@'%'" );
\t\t\twphx_305_07_exec( 'FLUSH PRIVILEGES' );
\t\t\t$limited = new wpdb( $limited_user, $limited_pass, $db_name, $db_host_with_port );
\t\t\t$limited->suppress_errors( true );
\t\t\t$select_count = $limited->get_var( 'SELECT COUNT(*) FROM wp_options' );
\t\t\t$create_result = $limited->query( 'CREATE TABLE wp_permission_denied (id int)' );
\t\t\t$error = $limited->last_error;
\t\t\treturn array(
\t\t\t\t'selectCount'       => (int) $select_count,
\t\t\t\t'createResult'      => $create_result,
\t\t\t\t'createError'       => wphx_305_07_error_shape( $error ),
\t\t\t\t'createdTable'      => wphx_305_07_table_exists( 'wp_permission_denied' ),
\t\t\t);
\t\t}
\t);

\t$cases[] = wphx_305_07_case(
\t\t'runtime:transaction-and-locking',
\t\t'wpdb::query',
\t\tfunction () {
\t\t\tglobal $wpdb;
\t\t\twphx_305_07_exec( 'START TRANSACTION' );
\t\t\twphx_305_07_exec( "INSERT INTO wp_options (option_name, option_value, autoload) VALUES ('wphx_txn', 'inside', 'off')" );
\t\t\t$inside = (int) $wpdb->get_var( "SELECT COUNT(*) FROM wp_options WHERE option_name = 'wphx_txn'" );
\t\t\twphx_305_07_exec( 'ROLLBACK' );
\t\t\t$after = (int) $wpdb->get_var( "SELECT COUNT(*) FROM wp_options WHERE option_name = 'wphx_txn'" );
\t\t\twphx_305_07_exec( 'LOCK TABLES wp_options WRITE' );
\t\t\t$open_tables = wphx_305_07_rows( "SHOW OPEN TABLES WHERE In_use > 0" );
\t\t\twphx_305_07_exec( 'UNLOCK TABLES' );
\t\t\treturn array(
\t\t\t\t'insideTransactionCount' => $inside,
\t\t\t\t'afterRollbackCount'     => $after,
\t\t\t\t'openTablesDuringLock'   => array_map(
\t\t\t\t\tfunction ( $row ) {
\t\t\t\t\t\treturn array(
\t\t\t\t\t\t\t'Table'       => $row['Table'] ?? '',
\t\t\t\t\t\t\t'In_use'      => (string) ( $row['In_use'] ?? '' ),
\t\t\t\t\t\t\t'Name_locked' => (string) ( $row['Name_locked'] ?? '' ),
\t\t\t\t\t\t);
\t\t\t\t\t},
\t\t\t\t\t$open_tables
\t\t\t\t),
\t\t\t);
\t\t}
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'runtime'               => $runtime_id,
\t'phpVersion'            => PHP_VERSION,
\t'database'              => array(
\t\t'serverInfo' => $wpdb->db_server_info(),
\t\t'dbVersion'  => $wpdb->db_version(),
\t\t'host'       => '127.0.0.1',
\t\t'database'   => $db_name,
\t),
\t'coveredFunctionExists' => array(
\t\t'maybe_create_table'              => function_exists( 'maybe_create_table' ),
\t\t'maybe_add_column'                => function_exists( 'maybe_add_column' ),
\t\t'dbDelta'                         => function_exists( 'dbDelta' ),
\t\t'wp_get_db_schema'                => function_exists( 'wp_get_db_schema' ),
\t\t'wp_should_upgrade_global_tables' => function_exists( 'wp_should_upgrade_global_tables' ),
\t\t'wp_load_alloptions'              => function_exists( 'wp_load_alloptions' ),
\t\t'get_option'                      => function_exists( 'get_option' ),
\t\t'get_options'                     => function_exists( 'get_options' ),
\t\t'add_option'                      => function_exists( 'add_option' ),
\t\t'update_option'                   => function_exists( 'update_option' ),
\t\t'delete_option'                   => function_exists( 'delete_option' ),
\t\t'wp_prime_option_caches'          => function_exists( 'wp_prime_option_caches' ),
\t\t'wp_set_option_autoload_values'   => function_exists( 'wp_set_option_autoload_values' ),
\t\t'set_transient'                   => function_exists( 'set_transient' ),
\t\t'get_transient'                   => function_exists( 'get_transient' ),
\t\t'delete_transient'                => function_exists( 'delete_transient' ),
\t\t'delete_expired_transients'       => function_exists( 'delete_expired_transients' ),
\t),
\t'coveredMethodExists'   => array(
\t\t'wpdb_query'            => method_exists( $wpdb, 'query' ),
\t\t'wpdb_get_var'          => method_exists( $wpdb, 'get_var' ),
\t\t'wpdb_get_row'          => method_exists( $wpdb, 'get_row' ),
\t\t'wpdb_get_col'          => method_exists( $wpdb, 'get_col' ),
\t\t'wpdb_get_results'      => method_exists( $wpdb, 'get_results' ),
\t\t'wpdb_insert'           => method_exists( $wpdb, 'insert' ),
\t\t'wpdb_update'           => method_exists( $wpdb, 'update' ),
\t\t'wpdb_delete'           => method_exists( $wpdb, 'delete' ),
\t\t'wpdb_prepare'          => method_exists( $wpdb, 'prepare' ),
\t\t'wpdb_db_server_info'   => method_exists( $wpdb, 'db_server_info' ),
\t\t'wpdb_get_table_charset' => method_exists( $wpdb, 'get_table_charset' ),
\t),
\t'cases'                 => wphx_305_07_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    runtime: result.runtime,
    database: result.database,
    coveredFunctionExists: result.coveredFunctionExists,
    coveredMethodExists: result.coveredMethodExists,
    cases: result.cases
  };
}

function runProbe(runtime, mode, root, port) {
  const output = command("php", [PROBE, mode, root, "127.0.0.1", String(port), DB_USER, DB_PASSWORD, DB_NAME, runtime.id]);
  return {
    id: `${runtime.id}:${mode}`,
    runtime: runtime.id,
    mode,
    command: `php ${PROBE} ${mode} ${root} 127.0.0.1 <port> ${DB_USER} <password> ${DB_NAME} ${runtime.id}`,
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
    php_version: run.result.phpVersion,
    database: run.result.database,
    case_count: normalized.cases.length,
    result_sha256: sha256(JSON.stringify(normalized))
  };
}

function imageRef(image) {
  return `${image.repository}@${image.index_digest}`;
}

function dockerImageInfo(image) {
  const raw = command("docker", ["image", "inspect", imageRef(image)]);
  const [info] = JSON.parse(raw);
  return {
    image: imageRef(image),
    id: info.Id,
    repo_digests: info.RepoDigests ?? [],
    architecture: info.Architecture,
    os: info.Os,
    created: info.Created
  };
}

function dbProbe(port) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), getenv('WPHX_DB_NAME'), intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $result = $mysqli->query("SELECT VERSION() AS version, @@version_comment AS comment, DATABASE() AS db_name");
    $row = $result->fetch_assoc();
    echo json_encode($row, JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    command("php", ["-r", code], {
      env: {
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_NAME: DB_NAME,
        WPHX_DB_PORT: String(port)
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
        MYSQL_DATABASE: DB_NAME,
        MYSQL_ROOT_HOST: "%"
      }
    },
    {
      id: "mariadb-11.8",
      engine: "mariadb",
      image_lock: lock.container_images.mariadb_11_8,
      env: {
        MARIADB_ROOT_PASSWORD: DB_PASSWORD,
        MARIADB_DATABASE: DB_NAME,
        MARIADB_ROOT_HOST: "%"
      }
    }
  ];
}

async function withDbRuntime(runtime, callback) {
  const name = `wordpresshx-wphx-305-07-${runtime.id}-${process.pid}`;
  let containerId = "";
  try {
    const dockerArgs = ["run", "-d", "--rm", "--name", name];
    for (const [key, value] of Object.entries(runtime.env)) {
      dockerArgs.push("-e", `${key}=${value}`);
    }
    dockerArgs.push("-p", "127.0.0.1::3306", imageRef(runtime.image_lock));
    containerId = command("docker", dockerArgs);
    const portOutput = command("docker", ["port", name, "3306/tcp"]);
    const port = Number(portOutput.split(":").at(-1));
    let query = null;
    let lastError = "";
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      try {
        query = dbProbe(port);
        break;
      } catch (error) {
        lastError = error.stderr?.toString?.() || error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!query) {
      throw new Error(`${runtime.id} did not become ready: ${lastError}`);
    }
    return await callback({ port, query, image: dockerImageInfo(runtime.image_lock), container: { id: containerId, name } });
  } finally {
    if (containerId) {
      try {
        command("docker", ["stop", name], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Best-effort cleanup for failed startup or interrupted probes.
      }
    }
  }
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-live-db`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest, runtimes) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-live-db-runtime-gate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "wpdb live MySQL/MariaDB runtime gate",
      area: "wp-includes/wp-admin",
      public_contract:
        "WordPress 7.0 wpdb, dbDelta/maybe_* schema helpers, and database-backed option/transient storage stay observable against locked live MySQL and MariaDB runtimes while the candidate side remains an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-wpdb-live-db-runtime-gate.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-live-db",
        "npm run wp:core:wphx-305-live-db:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-305-07-wpdb-live-db-runtime-gate"],
      manifest_digest: manifestSha
    },
    notes:
      `The gate provisions ${runtimes.map((runtime) => runtime.id).join(" and ")} containers from locked index digests and runs the WPHX-305.06 seed cases plus live error/transaction/locking checks with local PHP mysqli. The broad wp-admin include remains stubbed because this workset is scoped to database helpers and storage paths.`
  };
}

const lock = readJson("toolchain.lock.json");
const schemaOptionFixture = readJson(SCHEMA_OPTION_FIXTURE);
const wpdbSurface = readJson(WPDB_SURFACE);
const dbRuntimes = dbRuntimeRecords(lock);

if (!maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"])) {
  console.error(JSON.stringify({ status: "failed", error: "docker server unavailable; WPHX-305.07 requires live DB containers" }, null, 2));
  process.exit(1);
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const runs = [];
const comparisons = [];
const dbRuntimeResults = [];

for (const runtime of dbRuntimes) {
  const result = await withDbRuntime(runtime, async ({ port, query, image }) => {
    const oracle = runProbe(runtime, "oracle", ORACLE_ROOT, port);
    const candidate = runProbe(runtime, "candidate", CANDIDATE_ROOT, port);
    return { oracle, candidate, query, image };
  });
  runs.push(result.oracle, result.candidate);
  comparisons.push({
    id: runtime.id,
    runtime: runtime.id,
    engine: runtime.engine,
    ...compare(result.oracle.result, result.candidate.result)
  });
  dbRuntimeResults.push({
    id: runtime.id,
    engine: runtime.engine,
    image_lock: runtime.image_lock,
    image: result.image,
    query: result.query
  });
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const caseErrors = runs.flatMap((run) =>
  (run.result.cases ?? [])
    .filter((entry) => entry.error !== null)
    .map((entry) => ({
      run: run.id,
      case: entry.id,
      error: entry.error
    }))
);
if (caseErrors.length > 0) {
  console.error(JSON.stringify({ status: "failed", caseErrors }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const dbDomains = wpdbSurface.domains
  .filter((domain) => ["bootstrap_connection", "query_execution_results", "write_field_processing", "charset_collation", "tables_prefix_multisite"].includes(domain.id))
  .map((domain) => domain.label);
const manifest = {
  schema: "wphx.wp-core-wpdb-live-db-runtime-gate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-live-db-runtime-gate.mjs",
  inputs: {
    wpdb_surface_manifest: inputRecord(WPDB_SURFACE),
    schema_option_fixture: inputRecord(SCHEMA_OPTION_FIXTURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domains: dbDomains,
    db_runtimes: dbRuntimes.map((runtime) => ({
      id: runtime.id,
      engine: runtime.engine,
      image: imageRef(runtime.image_lock),
      index_digest: runtime.image_lock.index_digest,
      linux_amd64_digest: runtime.image_lock.linux_amd64_digest,
      linux_arm64_digest: runtime.image_lock.linux_arm64_digest
    })),
    php_client: {
      id: "local-php-cli",
      executable: lock.tools.php_cli.executable,
      mysqli_extension: true,
      pdo_mysql_extension: true
    },
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    inherited_seed_fixture: {
      manifest: SCHEMA_OPTION_FIXTURE,
      validation_result: schemaOptionFixture.validation_result
    },
    live_boundaries_covered: [
      "mysqli connection/bootstrap through wpdb::__construct/db_connect",
      "server charset/collation negotiation and SQL mode setup",
      "real DDL/DML execution for maybe_create_table, maybe_add_column, and dbDelta",
      "DESCRIBE and SHOW INDEX metadata consumed by dbDelta",
      "database-backed option and transient storage in wp_options",
      "limited-user permission denial captured through wpdb::last_error",
      "transaction rollback and LOCK TABLES/UNLOCK TABLES behavior"
    ],
    native_boundaries: [
      {
        id: "local-php-mysqli-client",
        reason:
          "The locked php:8.4-cli and php:8.5-cli containers do not include mysqli/pdo_mysql in this toolchain. The live DB gate therefore uses the local PHP CLI mysqli client and records this as the client boundary."
      },
      {
        id: "wp-admin-admin-include-stub",
        reason:
          "upgrade.php requires wp-admin/includes/admin.php at load time, but the live gate exercises dbDelta(), maybe_create_table(), maybe_add_column(), wp_should_upgrade_global_tables(), option.php, and transient storage only."
      },
      {
        id: "root-container-bootstrap",
        reason:
          "The fixture provisions disposable local Docker databases with root bootstrap credentials, then creates a limited user for permission-denial coverage. Production credential provisioning and secret handling are outside this parity gate."
      }
    ],
    closes_gaps_from: [
      {
        manifest: SCHEMA_OPTION_FIXTURE,
        gap: "live-mysql-execution-not-yet-covered",
        resolution:
          "WPHX-305.07 runs the WPHX-305.06 schema/option/transient seed cases against locked live MySQL and MariaDB containers and records remaining non-database boundaries separately."
      }
    ],
    follows: ["WPHX-305.06"]
  },
  runtimes: {
    db: dbRuntimeResults,
    php_client: {
      id: "local-php-cli",
      php_version: runs[0]?.result.phpVersion ?? null,
      executable: lock.tools.php_cli.executable
    }
  },
  run_summaries: runs.map(runSummary),
  trace_samples: dbRuntimes.map((runtime) => {
    const run = runs.find((entry) => entry.runtime === runtime.id && entry.mode === "oracle");
    return {
      id: run.id,
      runtime: runtime.id,
      engine: runtime.engine,
      result: normalize(run.result)
    };
  }),
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-305",
      detail: "The candidate side is a copied WordPress oracle source tree until selected wpdb/schema/option helpers move behind typed Haxe parity candidates."
    },
    {
      id: "custom-php-db-client-image-not-yet-locked",
      owner: "future toolchain gate",
      detail: "The official locked PHP CLI images do not include mysqli/pdo_mysql. A future custom PHP DB-client image can add PHP-version matrix coverage for this live database gate."
    },
    {
      id: "full-admin-upgrade-surface-deferred",
      owner: "future admin/install workset",
      detail: "upgrade.php is loaded with a stubbed admin include because this harness covers database helpers and storage paths, not the broader install/admin API."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-305",
      detail: "This fixture covers WPHX-305.06 seed traces plus live runtime checks. Full upstream wpdb, dbDelta, option, and transient PHPUnit parity remains a domain-level closure requirement."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "oracle_source_mirror",
    covered_symbols: COVERED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    db_runtimes: dbRuntimes.length,
    comparisons: comparisons.length,
    skipped_runtimes: 0
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest, dbRuntimes), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-07-wpdb-live-db-runtime-gate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "wpdb live MySQL/MariaDB runtime gate manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the live DB gate"
    },
    {
      path: "tools/wp-core/run-wpdb-live-db-runtime-gate.mjs",
      role: "live DB runtime generator and check-mode validator"
    },
    {
      path: "toolchain.lock.json",
      role: "locked MySQL and MariaDB DB runtime images"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-live-db",
    "npm run wp:core:wphx-305-live-db:check",
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
      db_runtimes: dbRuntimes.length,
      comparisons: comparisons.length,
      skipped_runtimes: 0
    },
    null,
    2
  )
);
