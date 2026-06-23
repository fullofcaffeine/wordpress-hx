#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.13.5",
  external_ref: "WPHX-306.07",
  title: "Installed auth distribution parity gate"
};
const RECORDED_AT = "2026-06-24T03:45:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const CONTRACT_RUNNER = "tools/wp-core/run-user-auth-adapter-contract-candidate.mjs";
const CONTRACT_MANIFEST = "manifests/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-306-03-capability-role-fixture.v1.json",
  "manifests/wp-core/wphx-306-04-auth-cookie-nonce-fixture.v1.json",
  "manifests/wp-core/wphx-306-05-password-application-fixture.v1.json",
  "manifests/wp-core/wphx-306-06-user-auth-runtime-abi-fixture.v1.json"
];
const BUILD_ROOT = "build/wp-core/wphx-306-07";
const HAXE_OUT = "build/wp-core/wphx-306-02/haxe";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-auth-installed-router.php";
const OUT = "manifests/wp-core/wphx-306-07-auth-installed-distribution-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-07-auth-installed-distribution-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-306-07-auth-installed-distribution-gate.v1.json";
const RUNNER = "tools/wp-core/run-user-auth-installed-distribution-gate.mjs";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-role.php",
  "src/wp-includes/class-wp-roles.php",
  "src/wp-includes/class-wp-user.php",
  "src/wp-includes/class-wp-user-query.php",
  "src/wp-includes/class-wp-session-tokens.php",
  "src/wp-includes/class-wp-user-meta-session-tokens.php",
  "src/wp-includes/class-wp-application-passwords.php",
  "src/wp-includes/capabilities.php",
  "src/wp-includes/pluggable.php",
  "src/wp-includes/user.php"
];

const CASES = [
  { id: "boundary:auth-package", focus: "public auth functions/classes are declared from the package root and Haxe contract artifacts are present in the candidate package" },
  { id: "login:get-form", focus: "installed-style wp-login.php GET renders login form and nonce through HTTP" },
  { id: "login:post-success", focus: "wp_signon authenticates, fires hooks, and emits auth/logged-in Set-Cookie headers" },
  { id: "admin:profile-cookie", focus: "logged-in cookie validates through wp_validate_auth_cookie for profile/admin access" },
  { id: "ajax:nonce-invalid", focus: "admin-ajax-style nonce failure returns plugin-visible JSON error" },
  { id: "ajax:nonce-valid", focus: "admin-ajax-style nonce success verifies a current nonce for the logged-in user" },
  { id: "rest:application-password", focus: "REST-style Basic auth validates application passwords and records usage" },
  { id: "profile:application-password-create", focus: "profile-style application-password creation uses WordPress storage and hooks" },
  { id: "logout:clear-cookies", focus: "wp_logout clears auth cookies and fires logout hook" },
  { id: "login:post-failure", focus: "bad password returns WP_Error over HTTP without setting login cookies" }
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
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function packagePath(root, path) {
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

function copySources(root) {
  for (const path of SOURCE_FILES) {
    const target = packagePath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function copyTree(sourceRoot, targetRoot) {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetPath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function writeRouter(root) {
  const router = `<?php
$root = __DIR__;
$request_path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

if ( str_starts_with( $request_path, '/wp-json/' ) ) {
\tdefine( 'REST_REQUEST', true );
} else {
\tdefine( 'REST_REQUEST', false );
}

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'DAY_IN_SECONDS', 86400 );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'YEAR_IN_SECONDS', 31536000 );
define( 'COOKIEHASH', 'wphx-auth-installed' );
define( 'AUTH_COOKIE', 'wordpress_' . COOKIEHASH );
define( 'SECURE_AUTH_COOKIE', 'wordpress_sec_' . COOKIEHASH );
define( 'LOGGED_IN_COOKIE', 'wordpress_logged_in_' . COOKIEHASH );
define( 'USER_COOKIE', 'wordpressuser_' . COOKIEHASH );
define( 'PASS_COOKIE', 'wordpresspass_' . COOKIEHASH );
define( 'COOKIEPATH', '/' );
define( 'SITECOOKIEPATH', '/' );
define( 'ADMIN_COOKIE_PATH', '/wp-admin' );
define( 'PLUGINS_COOKIE_PATH', '/wp-content/plugins' );
define( 'COOKIE_DOMAIN', '' );
define( 'AUTH_KEY', 'wphx-auth-key' );
define( 'AUTH_SALT', 'wphx-auth-salt' );
define( 'SECURE_AUTH_KEY', 'wphx-secure-auth-key' );
define( 'SECURE_AUTH_SALT', 'wphx-secure-auth-salt' );
define( 'LOGGED_IN_KEY', 'wphx-logged-in-key' );
define( 'LOGGED_IN_SALT', 'wphx-logged-in-salt' );
define( 'NONCE_KEY', 'wphx-nonce-key' );
define( 'NONCE_SALT', 'wphx-nonce-salt' );
define( 'SECRET_KEY', 'wphx-secret-key' );
define( 'SECRET_SALT', 'wphx-secret-salt' );
define( 'PASSWORD_BCRYPT_COST', 4 );

$GLOBALS['wphx_306_07_filters'] = array();
$GLOBALS['wphx_306_07_actions'] = array();
$GLOBALS['wphx_306_07_errors'] = array();
$GLOBALS['wphx_306_07_network_options'] = array( 'using_application_passwords' => true );
$GLOBALS['wphx_306_07_options'] = array( 'home' => 'http://127.0.0.1', 'siteurl' => 'http://127.0.0.1', 'default_role' => 'subscriber' );
$GLOBALS['wp_user_roles'] = array(
\t'subscriber' => array( 'name' => 'Subscriber', 'capabilities' => array( 'read' => true ) ),
\t'editor' => array( 'name' => 'Editor', 'capabilities' => array( 'read' => true, 'edit_posts' => true ) ),
);
$GLOBALS['wphx_306_07_user_meta'] = array(
\t7 => array(
\t\t'wp_capabilities' => array( 'editor' => true ),
\t\t'nickname' => 'API Nickname',
\t\t'session_tokens' => array(
\t\t\thash( 'sha256', substr( str_repeat( 'abcDEF1234567890', 4 ), 0, 43 ) ) => array( 'expiration' => 2000000000 ),
\t\t),
\t),
);
$GLOBALS['wphx_306_07_users'] = array(
\t7 => array(
\t\t'ID' => 7,
\t\t'user_login' => 'api-user',
\t\t'user_pass' => md5( 'secret' ),
\t\t'user_email' => 'api@example.test',
\t\t'user_nicename' => 'api-user',
\t\t'display_name' => 'API User',
\t\t'user_activation_key' => '',
\t\t'user_status' => 0,
\t),
);
$_SERVER['REMOTE_ADDR'] = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_306_07_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => wphx_306_07_relative_file( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WPHX_306_07_Wpdb {
\tpublic $prefix = 'wp_';
\tpublic $base_prefix = 'wp_';
\tpublic $users = 'wp_users';
\tpublic function get_blog_prefix( $site_id = 0 ) {
\t\treturn ( 0 === (int) $site_id || 1 === (int) $site_id ) ? 'wp_' : 'wp_' . (int) $site_id . '_';
\t}
\tpublic function prepare( $query, ...$args ) { return array( 'query' => $query, 'args' => $args ); }
\tpublic function get_row( $query ) { return false; }
\tpublic function update( $table, $data, $where ) { return true; }
}
$GLOBALS['wpdb'] = new WPHX_306_07_Wpdb();

function wphx_306_07_relative_file( $file ) {
\tglobal $root;
\t$real_root = realpath( $root );
\t$real_file = realpath( $file );
\tif ( $real_root && $real_file && str_starts_with( $real_file, $real_root . DIRECTORY_SEPARATOR ) ) {
\t\treturn str_replace( DIRECTORY_SEPARATOR, '/', substr( $real_file, strlen( $real_root ) + 1 ) );
\t}
\tif ( $real_root && is_string( $file ) && str_contains( $file, $real_root . DIRECTORY_SEPARATOR ) ) {
\t\t$relative = substr( $file, strpos( $file, $real_root . DIRECTORY_SEPARATOR ) + strlen( $real_root ) + 1 );
\t\treturn str_replace( DIRECTORY_SEPARATOR, '/', $relative );
\t}
\treturn str_replace( DIRECTORY_SEPARATOR, '/', (string) $file );
}
function __( $text ) { return $text; }
function _deprecated_argument( $function_name, $version, $message = '' ) { $GLOBALS['wphx_306_07_errors'][] = array( 'kind' => 'deprecated_argument', 'function' => $function_name, 'version' => $version ); }
function _deprecated_function( $function_name, $version, $replacement = '' ) { $GLOBALS['wphx_306_07_errors'][] = array( 'kind' => 'deprecated_function', 'function' => $function_name, 'version' => $version ); }
function wp_trigger_error( $function_name, $message, $error_level = E_USER_NOTICE ) { $GLOBALS['wphx_306_07_errors'][] = array( 'kind' => 'wp_trigger_error', 'function' => $function_name, 'message' => $message, 'level' => $error_level ); }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_306_07_filters'][ $hook_name ][ $priority ][] = array( $callback, $accepted_args );
\tksort( $GLOBALS['wphx_306_07_filters'][ $hook_name ] );
\treturn true;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) { return add_filter( $hook_name, $callback, $priority, $accepted_args ); }
function remove_action( $hook_name, $callback, $priority = 10 ) { return true; }
function apply_filters( $hook_name, $value, ...$args ) {
\tif ( empty( $GLOBALS['wphx_306_07_filters'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tforeach ( $GLOBALS['wphx_306_07_filters'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\t$callback_args = array_merge( array( $value ), $args );
\t\t\t$value = call_user_func_array( $record[0], array_slice( $callback_args, 0, $record[1] ) );
\t\t}
\t}
\treturn $value;
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_306_07_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\tapply_filters( $hook_name, null, ...$args );
}
function do_action_ref_array( $hook_name, $args ) {
\t$GLOBALS['wphx_306_07_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ), 'by_ref' => true );
\treturn apply_filters( $hook_name, null, ...$args );
}
function get_current_blog_id() { return 1; }
function is_multisite() { return false; }
function is_ssl() { return false; }
function wp_doing_ajax() { return false; }
function absint( $value ) { return abs( (int) $value ); }
function wp_unslash( $value ) { return $value; }
function wp_slash( $value ) { return $value; }
function wp_parse_args( $args, $defaults = array() ) { return array_merge( $defaults, is_array( $args ) ? $args : array() ); }
function sanitize_user( $username ) { return preg_replace( '/[^A-Za-z0-9_.@-]/', '', (string) $username ); }
function sanitize_text_field( $value ) { return trim( strip_tags( (string) $value ) ); }
function esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES ); }
function is_email( $value ) { return false !== strpos( (string) $value, '@' ); }
function wp_lostpassword_url() { return '/wp-login.php?action=lostpassword'; }
function wp_login_url() { return '/wp-login.php'; }
function site_url( $path = '', $scheme = null ) { return '/' . ltrim( $path, '/' ); }
function network_site_url( $path = '', $scheme = null ) { return site_url( $path, $scheme ); }
function admin_url( $path = '' ) { return '/wp-admin/' . ltrim( $path, '/' ); }
function get_option( $name, $default = false ) { return $GLOBALS['wphx_306_07_options'][ $name ] ?? $default; }
function update_option( $name, $value, $autoload = null ) { $GLOBALS['wphx_306_07_options'][ $name ] = $value; return true; }
function get_blog_option( $site_id, $name, $default = false ) { return get_option( $name, $default ); }
function get_site_option( $name, $default = false ) { return get_option( $name, $default ); }
function update_site_option( $name, $value ) { return update_option( $name, $value ); }
function get_main_network_id() { return 1; }
function get_network_option( $network_id, $name, $default = false ) { return $GLOBALS['wphx_306_07_network_options'][ $name ] ?? $default; }
function update_network_option( $network_id, $name, $value ) { $GLOBALS['wphx_306_07_network_options'][ $name ] = $value; return true; }
function wp_prime_site_option_caches( $options ) { return null; }
function metadata_exists( $type, $object_id, $meta_key ) { return array_key_exists( $meta_key, $GLOBALS['wphx_306_07_user_meta'][ (int) $object_id ] ?? array() ); }
function get_user_meta( $user_id, $key, $single = false ) {
\t$value = $GLOBALS['wphx_306_07_user_meta'][ (int) $user_id ][ $key ] ?? '';
\treturn $single ? $value : array( $value );
}
function update_user_meta( $user_id, $key, $value ) { $GLOBALS['wphx_306_07_user_meta'][ (int) $user_id ][ $key ] = $value; return true; }
function delete_user_meta( $user_id, $key ) { unset( $GLOBALS['wphx_306_07_user_meta'][ (int) $user_id ][ $key ] ); return true; }
function delete_metadata( $type, $object_id, $meta_key, $meta_value = '', $delete_all = false ) { return true; }
function wp_cache_get( $key, $group = '', $force = false, &$found = null ) { $found = false; return false; }
function wp_cache_set( $key, $data, $group = '', $expire = 0 ) { return true; }
function wp_cache_delete( $key, $group = '' ) { return true; }
function update_user_caches( $user ) { return true; }
function clean_user_cache( $user ) { return true; }
function wp_is_numeric_array( $value ) { return is_array( $value ) && array_keys( $value ) === range( 0, count( $value ) - 1 ); }
function wp_generate_password( $length = 12, $special_chars = true, $extra_special_chars = false ) { return substr( str_repeat( 'abcDEF1234567890', 4 ), 0, $length ); }
function wp_generate_uuid4() { return '11111111-2222-4333-8444-555555555555'; }
function wp_set_password( $password, $user_id ) { $GLOBALS['wphx_306_07_users'][ (int) $user_id ]['user_pass'] = md5( $password ); }
function wp_fast_hash( string $message ): string {
\t$hashed = sodium_crypto_generichash( $message, 'wp_fast_hash_6.8+', 30 );
\treturn '$generic$' . sodium_bin2base64( $hashed, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING );
}
function wp_verify_fast_hash( string $message, string $hash ): bool {
\tif ( ! str_starts_with( $hash, '$generic$' ) ) {
\t\treturn wp_check_password( $message, $hash );
\t}
\treturn hash_equals( $hash, wp_fast_hash( $message ) );
}
function get_user_by( $field, $value ) {
\tforeach ( $GLOBALS['wphx_306_07_users'] as $record ) {
\t\tif ( ( 'id' === $field || 'ID' === $field ) && (int) $record['ID'] === (int) $value ) {
\t\t\treturn new WP_User( (object) $record );
\t\t}
\t\tif ( 'login' === $field && $record['user_login'] === $value ) {
\t\t\treturn new WP_User( (object) $record );
\t\t}
\t\tif ( 'email' === $field && $record['user_email'] === $value ) {
\t\t\treturn new WP_User( (object) $record );
\t\t}
\t}
\treturn false;
}

require $root . '/wp-includes/class-wp-error.php';
require $root . '/wp-includes/class-wp-role.php';
require $root . '/wp-includes/class-wp-roles.php';
require $root . '/wp-includes/class-wp-user.php';
require $root . '/wp-includes/class-wp-user-query.php';
require $root . '/wp-includes/class-wp-session-tokens.php';
require $root . '/wp-includes/class-wp-user-meta-session-tokens.php';
require $root . '/wp-includes/class-wp-application-passwords.php';
require $root . '/wp-includes/capabilities.php';
require $root . '/wp-includes/pluggable.php';

function wphx_306_07_token_text( $token ) {
\treturn is_array( $token ) ? $token[1] : $token;
}
function wphx_306_07_extract_functions( $source, $names ) {
\t$tokens = token_get_all( "<?php\\n" . $source );
\t$output = '';
\t$count = count( $tokens );
\tfor ( $i = 0; $i < $count; $i++ ) {
\t\t$token = $tokens[ $i ];
\t\tif ( ! is_array( $token ) || T_FUNCTION !== $token[0] ) {
\t\t\tcontinue;
\t\t}
\t\t$j = $i + 1;
\t\twhile ( $j < $count && ( ( is_array( $tokens[ $j ] ) && T_WHITESPACE === $tokens[ $j ][0] ) || '&' === $tokens[ $j ] ) ) {
\t\t\t$j++;
\t\t}
\t\tif ( $j >= $count || ! is_array( $tokens[ $j ] ) || T_STRING !== $tokens[ $j ][0] || ! in_array( $tokens[ $j ][1], $names, true ) ) {
\t\t\tcontinue;
\t\t}
\t\t$depth = 0;
\t\t$seen_body = false;
\t\tfor ( $k = $i; $k < $count; $k++ ) {
\t\t\t$text = wphx_306_07_token_text( $tokens[ $k ] );
\t\t\t$output .= $text;
\t\t\tif ( is_string( $tokens[ $k ] ) ) {
\t\t\t\tif ( '{' === $tokens[ $k ] ) {
\t\t\t\t\t$depth++;
\t\t\t\t\t$seen_body = true;
\t\t\t\t} elseif ( '}' === $tokens[ $k ] ) {
\t\t\t\t\t$depth--;
\t\t\t\t\tif ( $seen_body && 0 === $depth ) {
\t\t\t\t\t\t$output .= "\\n";
\t\t\t\t\t\tbreak;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t}
\t\t}
\t}
\treturn $output;
}
eval(
\twphx_306_07_extract_functions(
\t\tfile_get_contents( $root . '/wp-includes/user.php' ),
\t\tarray(
\t\t\t'wp_signon',
\t\t\t'wp_authenticate_username_password',
\t\t\t'wp_authenticate_email_password',
\t\t\t'wp_authenticate_cookie',
\t\t\t'wp_authenticate_application_password',
\t\t\t'wp_validate_application_password',
\t\t\t'wp_is_application_passwords_supported',
\t\t\t'wp_is_application_passwords_available',
\t\t\t'wp_is_application_passwords_available_for_user',
\t\t)
\t)
);

add_filter( 'authenticate', 'wp_authenticate_username_password', 20, 3 );
add_filter( 'authenticate', 'wp_authenticate_email_password', 20, 3 );
add_filter( 'authenticate', 'wp_authenticate_application_password', 20, 3 );
add_filter( 'nonce_life', fn() => 4102444800 );
add_filter( 'wp_is_application_passwords_available', fn() => true );

$GLOBALS['wphx_306_07_user_meta'][7][WP_Application_Passwords::USERMETA_KEY_APPLICATION_PASSWORDS] = array(
\tarray(
\t\t'uuid' => '11111111-2222-4333-8444-555555555555',
\t\t'app_id' => '',
\t\t'name' => 'API Client',
\t\t'password' => WP_Application_Passwords::hash_password( 'app pass word' ),
\t\t'created' => 1700000000,
\t\t'last_used' => null,
\t\t'last_ip' => null,
\t),
);

function wphx_306_07_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json' );
\t$payload['actions'] = array_column( $GLOBALS['wphx_306_07_actions'], 'hook' );
\t$payload['errors'] = array_map(
\t\tfunction ( $error ) {
\t\t\tunset( $error['line'] );
\t\t\treturn $error;
\t\t},
\t\t$GLOBALS['wphx_306_07_errors']
\t);
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\texit;
}
function wphx_306_07_error_codes( $value ) {
\treturn $value instanceof WP_Error ? $value->get_error_codes() : array();
}
function wphx_306_07_boundary() {
\t$functions = array( 'wp_signon', 'wp_authenticate', 'wp_set_auth_cookie', 'wp_validate_auth_cookie', 'wp_create_nonce', 'wp_verify_nonce', 'wp_authenticate_application_password', 'wp_validate_application_password', 'current_user_can', 'user_can' );
\t$function_records = array();
\tforeach ( $functions as $function_name ) {
\t\t$reflection = new ReflectionFunction( $function_name );
\t\t$function_records[ $function_name ] = array(
\t\t\t'file' => wphx_306_07_relative_file( $reflection->getFileName() ),
\t\t\t'parameters' => array_map( fn( $p ) => $p->getName(), $reflection->getParameters() ),
\t\t);
\t}
\t$classes = array( 'WP_User', 'WP_Roles', 'WP_Role', 'WP_User_Query', 'WP_Session_Tokens', 'WP_User_Meta_Session_Tokens', 'WP_Application_Passwords' );
\t$class_records = array();
\tforeach ( $classes as $class_name ) {
\t\t$reflection = new ReflectionClass( $class_name );
\t\t$class_records[ $class_name ] = array(
\t\t\t'file' => wphx_306_07_relative_file( $reflection->getFileName() ),
\t\t\t'attributes' => array_map( fn( $a ) => $a->getName(), $reflection->getAttributes() ),
\t\t);
\t}
\treturn array(
\t\t'functions' => $function_records,
\t\t'classes' => $class_records,
\t\t'haxe_contract_present' => file_exists( ABSPATH . 'haxe/index.php' ) && file_exists( ABSPATH . 'haxe/lib/wphx/wp/auth/AuthAdapterContract.php' ),
\t\t'public_auth_files_are_copied_oracle_source' => true,
\t\t'generated_public_auth_replacement_claimed' => false,
\t);
}

if ( '/__wphx/package-boundary' === $request_path ) {
\twphx_306_07_json( 200, array( 'boundary' => wphx_306_07_boundary() ) );
}

if ( '/wp-login.php' === $request_path && 'GET' === $_SERVER['REQUEST_METHOD'] ) {
\tif ( 'logout' === ( $_GET['action'] ?? '' ) ) {
\t\twp_logout();
\t\twphx_306_07_json( 200, array( 'route' => 'logout', 'logged_in' => is_user_logged_in() ) );
\t}
\theader( 'Content-Type: text/html' );
\techo '<form id="loginform" method="post"><input name="log"><input name="pwd"><input name="_wpnonce" value="' . esc_attr( wp_create_nonce( 'wphx_ajax' ) ) . '"></form>';
\texit;
}

if ( '/wp-login.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\t$result = wp_signon(
\t\tarray(
\t\t\t'user_login' => $body['log'] ?? '',
\t\t\t'user_password' => $body['pwd'] ?? '',
\t\t\t'remember' => ! empty( $body['rememberme'] ),
\t\t),
\t\tfalse
\t);
\tif ( $result instanceof WP_Error ) {
\t\twphx_306_07_json( 403, array( 'route' => 'login', 'ok' => false, 'error_codes' => $result->get_error_codes() ) );
\t}
\twp_set_current_user( $result->ID );
\twphx_306_07_json( 200, array( 'route' => 'login', 'ok' => true, 'user_id' => $result->ID, 'can_edit_posts' => current_user_can( 'edit_posts' ) ) );
}

if ( '/wp-admin/profile.php' === $request_path ) {
\t$user_id = wp_validate_auth_cookie( '', 'logged_in' );
\tif ( ! $user_id ) {
\t\twphx_306_07_json( 401, array( 'route' => 'profile', 'ok' => false ) );
\t}
\twp_set_current_user( $user_id );
\tif ( 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\t\tparse_str( file_get_contents( 'php://input' ), $body );
\t\t$created = WP_Application_Passwords::create_new_application_password( $user_id, array( 'name' => $body['name'] ?? 'CLI App' ) );
\t\twphx_306_07_json(
\t\t\t200,
\t\t\tarray(
\t\t\t\t'route' => 'profile',
\t\t\t\t'ok' => ! is_wp_error( $created ),
\t\t\t\t'user_id' => $user_id,
\t\t\t\t'password_count' => count( WP_Application_Passwords::get_user_application_passwords( $user_id ) ),
\t\t\t\t'created_error_codes' => wphx_306_07_error_codes( $created ),
\t\t\t)
\t\t);
\t}
\twphx_306_07_json( 200, array( 'route' => 'profile', 'ok' => true, 'user_id' => $user_id, 'can_edit_posts' => current_user_can( 'edit_posts' ) ) );
}

if ( '/wp-admin/admin-ajax.php' === $request_path ) {
\t$user_id = wp_validate_auth_cookie( '', 'logged_in' );
\twp_set_current_user( $user_id ?: 0 );
\t$nonce_result = wp_verify_nonce( $_GET['_ajax_nonce'] ?? '', 'wphx_ajax' );
\twphx_306_07_json( $nonce_result ? 200 : 403, array( 'route' => 'ajax', 'ok' => (bool) $nonce_result, 'nonce_result' => $nonce_result ) );
}

if ( '/wp-json/wp/v2/users/me' === $request_path ) {
\t$user = wp_validate_application_password( false );
\tif ( $user instanceof WP_Error || ! $user ) {
\t\twphx_306_07_json( 401, array( 'route' => 'rest-me', 'ok' => false, 'error_codes' => wphx_306_07_error_codes( $user ) ) );
\t}
\twphx_306_07_json( 200, array( 'route' => 'rest-me', 'ok' => true, 'user_id' => $user->ID, 'application_passwords' => count( WP_Application_Passwords::get_user_application_passwords( $user->ID ) ) ) );
}

wphx_306_07_json( 404, array( 'route' => 'missing', 'path' => $request_path ) );
`;
  writeFileSync(`${root}/${ROUTER}`, router);
}

function writePackage(root, mode) {
  mkdirSync(root, { recursive: true });
  copySources(root);
  if (mode === "candidate") {
    copyTree(HAXE_OUT, `${root}/haxe`);
  }
  writeRouter(root);
}

function phpLintPackage(root) {
  return [ROUTER, ...SOURCE_FILES.map((path) => path.replace(/^src\//, ""))]
    .map((path) => ({
      path: `${root}/${path}`,
      php_lint: command("php", ["-l", `${root}/${path}`])
    }));
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          rejectPort(new Error("Unable to reserve local port"));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function withServer(root, callback) {
  const port = await freePort();
  const server = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await sleep(250);
  try {
    return await callback(`http://127.0.0.1:${port}`, () => stderr);
  } finally {
    server.kill("SIGTERM");
    await sleep(100);
  }
}

function curl(baseUrl, path, options = {}) {
  const curlArgs = ["-sS", "-i", "-X", options.method ?? "GET"];
  for (const header of options.headers ?? []) {
    curlArgs.push("-H", header);
  }
  if (options.basicAuth) {
    curlArgs.push("-u", options.basicAuth);
  }
  if (options.cookie) {
    curlArgs.push("-H", `Cookie: ${options.cookie}`);
  }
  if (options.body !== undefined) {
    curlArgs.push("-H", options.contentType ?? "Content-Type: application/x-www-form-urlencoded");
    curlArgs.push("--data", options.body);
  }
  curlArgs.push(`${baseUrl}${path}`);
  const raw = command("curl", curlArgs);
  const [headerText, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const body = bodyParts.join("\n\n");
  const headerLines = headerText.split(/\r?\n/);
  const statusMatch = headerLines[0].match(/HTTP\/\S+\s+(\d+)/);
  const headers = headerLines.slice(1);
  const setCookies = headers
    .filter((line) => /^set-cookie:/i.test(line))
    .map((line) => line.replace(/^set-cookie:\s*/i, ""));
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return {
    status: statusMatch ? Number(statusMatch[1]) : 0,
    body,
    json,
    setCookies,
    normalizedSetCookies: setCookies.map(normalizeSetCookie)
  };
}

function normalizeSetCookie(cookie) {
  const [pair, ...attrs] = cookie.split(";").map((part) => part.trim());
  const [name, value = ""] = pair.split("=");
  const decodedValue = decodeURIComponent(value);
  const parts = decodedValue.split("|");
  return {
    name,
    value_parts: parts.length,
    username: parts.length > 1 ? parts[0] : null,
    has_hmac: parts.length > 3 && parts[3].length >= 40,
    path: attrs.find((attr) => attr.toLowerCase().startsWith("path="))?.slice(5) ?? null,
    httponly: attrs.some((attr) => attr.toLowerCase() === "httponly"),
    expires: attrs.some((attr) => attr.toLowerCase().startsWith("expires="))
  };
}

function cookieHeader(setCookies) {
  return setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => pair.startsWith("wordpress_logged_in_") || pair.startsWith("wordpress_"))
    .join("; ");
}

function normalizeJson(value) {
  if (!value || typeof value !== "object") return value;
  const copy = JSON.parse(JSON.stringify(value));
  if (Array.isArray(copy.actions)) copy.actions = [...new Set(copy.actions)].sort();
  if (Array.isArray(copy.errors)) {
    copy.errors = copy.errors.map((error) => {
      if (error.message && error.message.includes("dynamic property")) {
        return { ...error, message: "dynamic property diagnostic" };
      }
      return error;
    });
  }
  return copy;
}

async function runWebRoot(mode, root) {
  return withServer(root, async (baseUrl, stderrSnapshot) => {
    const boundary = curl(baseUrl, "/__wphx/package-boundary");
    const loginForm = curl(baseUrl, "/wp-login.php");
    const loginSuccess = curl(baseUrl, "/wp-login.php", {
      method: "POST",
      body: "log=api-user&pwd=secret&rememberme=1"
    });
    const cookies = cookieHeader(loginSuccess.setCookies);
    const profile = curl(baseUrl, "/wp-admin/profile.php", { cookie: cookies });
    const invalidAjax = curl(baseUrl, "/wp-admin/admin-ajax.php?action=wphx_nonce&_ajax_nonce=bad", { cookie: cookies });
    const nonce = boundary.json?.boundary ? curl(baseUrl, "/wp-admin/admin-ajax.php?action=wphx_nonce&_ajax_nonce=" + encodeURIComponent("bad"), { cookie: cookies }) : invalidAjax;
    const validNonceValue = extractNonce(loginForm.body);
    const validAjax = curl(baseUrl, `/wp-admin/admin-ajax.php?action=wphx_nonce&_ajax_nonce=${encodeURIComponent(validNonceValue)}`, { cookie: cookies });
    const restMe = curl(baseUrl, "/wp-json/wp/v2/users/me", { basicAuth: "api-user:app pass word" });
    const appPasswordCreate = curl(baseUrl, "/wp-admin/profile.php", { method: "POST", cookie: cookies, body: "name=CLI%20App" });
    const logout = curl(baseUrl, "/wp-login.php?action=logout", { cookie: cookies });
    const loginFailure = curl(baseUrl, "/wp-login.php", { method: "POST", body: "log=api-user&pwd=wrong" });
    return {
      mode,
      command: `php -S 127.0.0.1:<port> ${ROUTER}`,
      stderr_sha256: sha256(stderrSnapshot()),
      cases: {
        boundary: normalizeJson(boundary.json),
        login_form: {
          status: loginForm.status,
          has_login_form: loginForm.body.includes("loginform"),
          has_nonce: /name="_wpnonce"/.test(loginForm.body)
        },
        login_success: {
          status: loginSuccess.status,
          json: normalizeJson(loginSuccess.json),
          set_cookies: loginSuccess.normalizedSetCookies
        },
        profile,
        invalid_ajax: invalidAjax,
        valid_ajax: validAjax,
        rest_me: restMe,
        app_password_create: appPasswordCreate,
        logout: {
          status: logout.status,
          json: normalizeJson(logout.json),
          set_cookies: logout.normalizedSetCookies
        },
        login_failure: {
          status: loginFailure.status,
          json: normalizeJson(loginFailure.json),
          set_cookies: loginFailure.normalizedSetCookies
        }
      }
    };
  });
}

function extractNonce(body) {
  const match = body.match(/name="_wpnonce" value="([^"]+)"/);
  return match ? match[1] : "";
}

function comparableRun(run) {
  const selected = {};
  for (const [key, value] of Object.entries(run.cases)) {
    if (key === "boundary") {
      selected[key] = normalizeBoundaryForComparison(value);
      continue;
    }
    if (value && typeof value === "object" && "body" in value) {
      selected[key] = {
        status: value.status,
        json: normalizeJson(value.json),
        set_cookies: value.normalizedSetCookies
      };
    } else {
      selected[key] = value;
    }
  }
  return selected;
}

function normalizeBoundaryForComparison(value) {
  const boundary = value?.boundary;
  if (!boundary) return value;
  const normalized = JSON.parse(JSON.stringify(boundary));
  normalized.haxe_contract_present = "mode-specific";
  for (const record of Object.values(normalized.functions)) {
    if (typeof record.file === "string" && record.file.startsWith("wphx-auth-installed-router.php")) {
      record.file = "wphx-auth-installed-router.php:imported-user-function";
    }
  }
  return { boundary: normalized };
}

function assertPackageBoundary(candidateRun) {
  const boundary = candidateRun.cases.boundary?.boundary;
  if (!boundary) {
    return { status: "failed", reason: "missing boundary payload" };
  }
  const functionFiles = Object.values(boundary.functions).map((record) => record.file);
  const classFiles = Object.values(boundary.classes).map((record) => record.file);
  const allPackageFiles = [...functionFiles, ...classFiles];
  return {
    status:
      allPackageFiles.every(
        (file) => typeof file === "string" && (file.startsWith("wp-includes/") || file.startsWith("wphx-auth-installed-router.php"))
      ) && boundary.haxe_contract_present === true
        ? "passed"
        : "failed",
    declared_from_package_root: allPackageFiles.every(
      (file) => typeof file === "string" && (file.startsWith("wp-includes/") || file.startsWith("wphx-auth-installed-router.php"))
    ),
    haxe_contract_present: boundary.haxe_contract_present === true,
    generated_public_auth_replacement_claimed: boundary.generated_public_auth_replacement_claimed === true,
    public_auth_files_are_copied_oracle_source: boundary.public_auth_files_are_copied_oracle_source === true
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-306-installed-auth`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/user-auth-installed-distribution-gate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-installed-auth-gate",
      name: "users/auth installed-style HTTP distribution parity gate",
      area: "wp-login.php wp-admin/profile.php wp-admin/admin-ajax.php REST application-password auth and wp-includes auth classes/functions",
      public_contract:
        "The packaged auth surface must behave like vanilla through HTTP login/logout, auth cookies, nonce checks, profile/application-password flows, REST Basic auth, hooks, errors, and package-boundary reflection."
    },
    ownership_state: "packaged_distribution_oracle_source_gate",
    ownership_axes: {
      semantic_owner: "upstream_oracle_for_public_php",
      adapter_contract_owner: "haxe_typed_contract_present",
      emission_strategy: "upstream_source_package_with_haxe_private_contract_artifacts",
      execution_provider: "php_web_server",
      compatibility_evidence: "live_integration_parity"
    },
    bridge: {
      exists: true,
      kind: "oracle-source-package-with-haxe-contract-artifacts",
      removal_gate:
        "Replace copied public auth files with typed Adapter IR/original-path generated PHP before claiming generated public auth replacement or no-upstream-fallback closure."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [BUILD_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-306-installed-auth",
        "npm run wp:core:wphx-306-installed-auth:check",
        "npm run wp:core:wphx-306-auth-adapter-contract-candidate:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-306-07-auth-installed-distribution-gate"],
      manifest_digest: manifestSha
    }
  };
}

command("node", [CONTRACT_RUNNER, ...(checkOnly ? ["--check"] : [])]);
rmSync(BUILD_ROOT, { recursive: true, force: true });
writePackage(ORACLE_ROOT, "oracle");
writePackage(CANDIDATE_ROOT, "candidate");
const oracleLint = phpLintPackage(ORACLE_ROOT);
const candidateLint = phpLintPackage(CANDIDATE_ROOT);

const oracleRun = await runWebRoot("oracle", ORACLE_ROOT);
const candidateRun = await runWebRoot("candidate", CANDIDATE_ROOT);
const oracleComparable = comparableRun(oracleRun);
const candidateComparable = comparableRun(candidateRun);
const observationsEqual = JSON.stringify(oracleComparable) === JSON.stringify(candidateComparable);
const packageBoundary = assertPackageBoundary(candidateRun);

if (!observationsEqual || packageBoundary.status !== "passed") {
  console.error(JSON.stringify({ status: "failed", observationsEqual, packageBoundary, oracleComparable, candidateComparable }, null, 2));
  process.exit(1);
}

const candidateFiles = filesUnder(CANDIDATE_ROOT).map((file) => ({
  path: `${CANDIDATE_ROOT}/${file.path}`,
  bytes: file.bytes,
  sha256: `sha256:${file.sha256}`
}));

const manifest = {
  schema: "wphx.wp-core-auth-installed-distribution-gate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["live_integration_parity", "runtime_abi", "targeted_semantic_parity"],
  artifact_scope: "packaged_distribution",
  upstream: {
    repo: UPSTREAM_ROOT,
    commit: WP_REF,
    source_files: SOURCE_FILES.map(sourceRecord)
  },
  inputs: {
    runner: inputRecord(RUNNER),
    package_json: inputRecord("package.json"),
    contract_manifest: inputRecord(CONTRACT_MANIFEST),
    prior_manifests: PRIOR_MANIFESTS.map(inputRecord)
  },
  package: {
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    candidate_files: candidateFiles,
    public_auth_files_are_copied_oracle_source: true,
    generated_public_auth_replacement_claimed: false,
    haxe_contract_artifacts_in_candidate_package: true
  },
  fixture: {
    cases: CASES,
    transport: "PHP built-in HTTP server plus curl with cookie carry-over",
    php_lint: {
      oracle: oracleLint,
      candidate: candidateLint
    }
  },
  runs: [
    {
      id: "installed-auth:http-oracle",
      mode: "oracle",
      command: oracleRun.command,
      normalized_sha256: sha256(JSON.stringify(oracleComparable))
    },
    {
      id: "installed-auth:http-candidate",
      mode: "candidate",
      command: candidateRun.command,
      normalized_sha256: sha256(JSON.stringify(candidateComparable))
    }
  ],
  comparison: {
    observations_equal: observationsEqual,
    oracle_normalized: oracleComparable,
    candidate_normalized: candidateComparable
  },
  package_boundary: packageBoundary,
  remaining_gaps: [
    {
      id: "generated-public-auth-replacement-not-yet-installed",
      owner: "WPHX-306-follow-up",
      detail:
        "This gate proves installed-style auth behavior over package roots and Haxe contract presence, but public auth PHP files are still copied WordPress oracle source. Typed Adapter IR/original-path generated auth files remain required before a no-upstream-fallback claim."
    },
    {
      id: "full-wordpress-installer-and-database-deferred",
      owner: "WPHX-700",
      detail:
        "The gate uses deterministic in-memory stores under PHP's HTTP server. Full MySQL-backed installation, admin screens, external plugin corpus, and selected upstream PHPUnit auth groups remain broader distribution work."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    fixture_cases: CASES.length,
    evidence_classes: ["live_integration_parity", "runtime_abi", "targeted_semantic_parity"],
    artifact_scope: "packaged_distribution",
    generated_public_auth_replacement_claimed: false,
    package_boundary: packageBoundary
  }
};

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha = sha256(manifestText);
const ownershipText = `${JSON.stringify(ownershipManifest(manifestSha), null, 2)}\n`;
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-306-07-auth-installed-distribution-gate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "users/auth installed-style HTTP distribution parity manifest", sha256: manifestSha },
    { path: OWNERSHIP, role: "users/auth installed distribution ownership manifest", sha256: sha256(ownershipText) },
    { path: RUNNER, role: "installed auth HTTP gate generator and check-mode validator", sha256: sha256File(RUNNER) }
  ],
  verification_commands: [
    "npm run wp:core:wphx-306-installed-auth",
    "npm run wp:core:wphx-306-installed-auth:check",
    "npm run wp:core:wphx-306-auth-adapter-contract-candidate:check",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-306-foundation",
    "receipt:wphx-306-03-capability-role-fixture",
    "receipt:wphx-306-04-auth-cookie-nonce-fixture",
    "receipt:wphx-306-05-password-application-fixture",
    "receipt:wphx-306-06-user-auth-runtime-abi-fixture"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = `${JSON.stringify(receipt, null, 2)}\n`;

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
      generated_public_auth_replacement_claimed: false
    },
    null,
    2
  )
);
