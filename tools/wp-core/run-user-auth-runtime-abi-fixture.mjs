#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.13.4",
  external_ref: "WPHX-306.06",
  title: "User/auth runtime ABI fixture"
};
const OUT_ROOT = "build/wp-core/wphx-306-06";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-306-06-user-auth-runtime-abi-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-06-user-auth-runtime-abi-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-306-06-user-auth-runtime-abi-fixture.v1.json";
const FOUNDATION = "manifests/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-306-01-user-auth-surface.v1.json";
const RECORDED_AT = "2026-06-23T23:35:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-role.php",
  "src/wp-includes/class-wp-roles.php",
  "src/wp-includes/class-wp-user.php",
  "src/wp-includes/class-wp-user-query.php",
  "src/wp-includes/class-wp-session-tokens.php",
  "src/wp-includes/class-wp-user-meta-session-tokens.php",
  "src/wp-includes/class-wp-application-passwords.php"
];

const COVERED_CLASSES = [
  "WP_User",
  "WP_Roles",
  "WP_Role",
  "WP_User_Query",
  "WP_Session_Tokens",
  "WP_User_Meta_Session_Tokens",
  "WP_Application_Passwords"
];

const FIXTURE_CASES = [
  { id: "reflection:class-contracts", focus: "class flags, attributes, constants, parent, interfaces, traits, declaring files, public properties, and method signatures" },
  { id: "runtime:wp-user-object-vars", focus: "WP_User public property order, magic access, dynamic properties, serialization, and declaring method classes" },
  { id: "runtime:roles-object-vars", focus: "WP_Roles and WP_Role public object state, dynamic property behavior, and method declaring classes" },
  { id: "runtime:user-query-compat-fields", focus: "WP_User_Query private compat fields exposed by magic methods, dynamic-property deprecation, and serialization surface" },
  { id: "runtime:session-tokens", focus: "WP_Session_Tokens factory, final methods, protected storage, user-meta subclass behavior, and dynamic property support" },
  { id: "runtime:application-passwords", focus: "WP_Application_Passwords constants, static method signatures, dynamic property support, and instantiation surface" }
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

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wp_user_roles'] = array(
\t'subscriber' => array( 'name' => 'Subscriber', 'capabilities' => array( 'read' => true ) ),
\t'editor' => array( 'name' => 'Editor', 'capabilities' => array( 'read' => true, 'edit_posts' => true ) ),
);
$GLOBALS['wphx_306_06_user_meta'] = array(
\t7 => array(
\t\t'wp_capabilities' => array( 'editor' => true, 'custom_deny' => false ),
\t\t'nickname' => 'Plugin Nickname',
\t\t'session_tokens' => array(
\t\t\thash( 'sha256', 'known-token' ) => array( 'expiration' => 2000000000, 'ip' => '127.0.0.1' ),
\t\t),
\t),
);
$GLOBALS['wphx_306_06_options'] = array( 'default_role' => 'subscriber' );
$GLOBALS['wphx_306_06_errors'] = array();
$GLOBALS['wphx_306_06_actions'] = array();
$GLOBALS['wphx_306_06_filters'] = array();
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['HTTP_USER_AGENT'] = 'wphx-runtime-abi-fixture';

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_306_06_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => wphx_306_06_relative_file( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WPHX_306_06_Wpdb {
\tpublic $prefix = 'wp_';
\tpublic $users = 'wp_users';
\tpublic function get_blog_prefix( $site_id = 0 ) {
\t\treturn ( 0 === (int) $site_id || 1 === (int) $site_id ) ? 'wp_' : 'wp_' . (int) $site_id . '_';
\t}
\tpublic function prepare( $query, ...$args ) {
\t\treturn $query;
\t}
\tpublic function get_row( $query ) {
\t\treturn false;
\t}
}
$GLOBALS['wpdb'] = new WPHX_306_06_Wpdb();

function __( $text ) { return $text; }
function _deprecated_argument( $function_name, $version, $message = '' ) {
\t$GLOBALS['wphx_306_06_errors'][] = array( 'kind' => 'deprecated_argument', 'function' => $function_name, 'version' => $version, 'message' => $message );
}
function _deprecated_function( $function_name, $version, $replacement = '' ) {
\t$GLOBALS['wphx_306_06_errors'][] = array( 'kind' => 'deprecated_function', 'function' => $function_name, 'version' => $version, 'replacement' => $replacement );
}
function wp_trigger_error( $function_name, $message, $error_level = E_USER_NOTICE ) {
\t$GLOBALS['wphx_306_06_errors'][] = array( 'kind' => 'wp_trigger_error', 'function' => $function_name, 'message' => $message, 'level' => $error_level );
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_306_06_filters'][ $hook_name ][ $priority ][] = array( $callback, $accepted_args );
\tksort( $GLOBALS['wphx_306_06_filters'][ $hook_name ] );
\treturn true;
}
function apply_filters( $hook_name, $value, ...$args ) {
\tif ( empty( $GLOBALS['wphx_306_06_filters'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tforeach ( $GLOBALS['wphx_306_06_filters'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\t$callback_args = array_merge( array( $value ), $args );
\t\t\t$value = call_user_func_array( $record[0], array_slice( $callback_args, 0, $record[1] ) );
\t\t}
\t}
\treturn $value;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) { return add_filter( $hook_name, $callback, $priority, $accepted_args ); }
function remove_action( $hook_name, $callback, $priority = 10 ) { return true; }
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_306_06_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\tapply_filters( $hook_name, null, ...$args );
}
function get_current_blog_id() { return 1; }
function is_multisite() { return false; }
function switch_to_blog( $site_id ) { return true; }
function restore_current_blog() { return true; }
function absint( $value ) { return abs( (int) $value ); }
function get_option( $name, $default = false ) { return $GLOBALS['wphx_306_06_options'][ $name ] ?? $default; }
function update_option( $name, $value, $autoload = null ) { $GLOBALS['wphx_306_06_options'][ $name ] = $value; return true; }
function get_blog_option( $site_id, $name, $default = false ) { return get_option( $name, $default ); }
function wp_is_numeric_array( $value ) { return is_array( $value ) && array_keys( $value ) === range( 0, count( $value ) - 1 ); }
function metadata_exists( $type, $object_id, $meta_key ) { return array_key_exists( $meta_key, $GLOBALS['wphx_306_06_user_meta'][ (int) $object_id ] ?? array() ); }
function get_user_meta( $user_id, $key, $single = false ) {
\t$value = $GLOBALS['wphx_306_06_user_meta'][ (int) $user_id ][ $key ] ?? '';
\treturn $single ? $value : array( $value );
}
function update_user_meta( $user_id, $key, $value ) { $GLOBALS['wphx_306_06_user_meta'][ (int) $user_id ][ $key ] = $value; return true; }
function delete_user_meta( $user_id, $key ) { unset( $GLOBALS['wphx_306_06_user_meta'][ (int) $user_id ][ $key ] ); return true; }
function delete_metadata( $type, $object_id, $meta_key, $meta_value = '', $delete_all = false ) { $GLOBALS['wphx_306_06_deleted_metadata'] = array( $type, $object_id, $meta_key, $delete_all ); return true; }
function sanitize_user_field( $field, $value, $user_id, $context ) { return $context . ':' . $value; }
function wp_unslash( $value ) { return $value; }
function wp_generate_password( $length = 12, $special_chars = true, $extra_special_chars = false ) { return substr( str_repeat( 'abcDEF1234567890', 4 ), 0, $length ); }
function wp_roles() {
\tglobal $wp_roles;
\tif ( ! $wp_roles instanceof WP_Roles ) {
\t\t$wp_roles = new WP_Roles();
\t}
\treturn $wp_roles;
}

require $root . '/wp-includes/class-wp-role.php';
require $root . '/wp-includes/class-wp-roles.php';
require $root . '/wp-includes/class-wp-user.php';
require $root . '/wp-includes/class-wp-user-query.php';
require $root . '/wp-includes/class-wp-session-tokens.php';
require $root . '/wp-includes/class-wp-user-meta-session-tokens.php';
require $root . '/wp-includes/class-wp-application-passwords.php';

function wphx_306_06_relative_file( $file ) {
\tglobal $root;
\tif ( false === $file || null === $file ) {
\t\treturn null;
\t}
\t$real_root = realpath( $root );
\t$real_file = realpath( $file );
\tif ( $real_root && $real_file && str_starts_with( $real_file, $real_root . DIRECTORY_SEPARATOR ) ) {
\t\treturn str_replace( DIRECTORY_SEPARATOR, '/', substr( $real_file, strlen( $real_root ) + 1 ) );
\t}
\treturn str_replace( DIRECTORY_SEPARATOR, '/', (string) $file );
}
function wphx_306_06_type_name( $type ) {
\tif ( null === $type ) {
\t\treturn null;
\t}
\treturn (string) $type;
}
function wphx_306_06_default_value( ReflectionParameter $parameter ) {
\tif ( ! $parameter->isOptional() || ! $parameter->isDefaultValueAvailable() ) {
\t\treturn array( 'available' => false );
\t}
\t$value = $parameter->getDefaultValue();
\tif ( is_array( $value ) ) {
\t\treturn array( 'available' => true, 'type' => 'array', 'count' => count( $value ) );
\t}
\treturn array( 'available' => true, 'type' => get_debug_type( $value ), 'value' => $value );
}
function wphx_306_06_parameters( $reflection ) {
\t$result = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
\t\t$result[] = array(
\t\t\t'name' => $parameter->getName(),
\t\t\t'position' => $parameter->getPosition(),
\t\t\t'type' => wphx_306_06_type_name( $parameter->getType() ),
\t\t\t'optional' => $parameter->isOptional(),
\t\t\t'default' => wphx_306_06_default_value( $parameter ),
\t\t\t'by_reference' => $parameter->isPassedByReference(),
\t\t\t'variadic' => $parameter->isVariadic(),
\t\t);
\t}
\treturn $result;
}
function wphx_306_06_method_contract( ReflectionMethod $method ) {
\treturn array(
\t\t'name' => $method->getName(),
\t\t'declaring_class' => $method->getDeclaringClass()->getName(),
\t\t'declaring_file' => wphx_306_06_relative_file( $method->getFileName() ),
\t\t'visibility' => $method->isPublic() ? 'public' : ( $method->isProtected() ? 'protected' : 'private' ),
\t\t'static' => $method->isStatic(),
\t\t'final' => $method->isFinal(),
\t\t'abstract' => $method->isAbstract(),
\t\t'returns_reference' => $method->returnsReference(),
\t\t'return_type' => wphx_306_06_type_name( $method->getReturnType() ),
\t\t'parameters' => wphx_306_06_parameters( $method ),
\t);
}
function wphx_306_06_property_contract( ReflectionProperty $property ) {
\t$has_default = array_key_exists( $property->getName(), $property->getDeclaringClass()->getDefaultProperties() );
\treturn array(
\t\t'name' => $property->getName(),
\t\t'declaring_class' => $property->getDeclaringClass()->getName(),
\t\t'visibility' => $property->isPublic() ? 'public' : ( $property->isProtected() ? 'protected' : 'private' ),
\t\t'static' => $property->isStatic(),
\t\t'readonly' => method_exists( $property, 'isReadOnly' ) ? $property->isReadOnly() : false,
\t\t'type' => wphx_306_06_type_name( $property->getType() ),
\t\t'has_default' => $has_default,
\t);
}
function wphx_306_06_class_contract( $class_name ) {
\t$class = new ReflectionClass( $class_name );
\t$properties = array();
\tforeach ( $class->getProperties() as $property ) {
\t\t$properties[] = wphx_306_06_property_contract( $property );
\t}
\t$methods = array();
\tforeach ( $class->getMethods() as $method ) {
\t\t$methods[] = wphx_306_06_method_contract( $method );
\t}
\t$attributes = array_map( fn( $attribute ) => $attribute->getName(), $class->getAttributes() );
\treturn array(
\t\t'name' => $class->getName(),
\t\t'declaring_file' => wphx_306_06_relative_file( $class->getFileName() ),
\t\t'abstract' => $class->isAbstract(),
\t\t'final' => $class->isFinal(),
\t\t'instantiable' => $class->isInstantiable(),
\t\t'parent' => $class->getParentClass() ? $class->getParentClass()->getName() : null,
\t\t'interfaces' => array_values( $class->getInterfaceNames() ),
\t\t'traits' => array_values( $class->getTraitNames() ),
\t\t'attributes' => $attributes,
\t\t'constants' => $class->getConstants(),
\t\t'default_properties_order' => array_keys( $class->getDefaultProperties() ),
\t\t'properties' => $properties,
\t\t'methods' => $methods,
\t);
}
function wphx_306_06_object_contract( $object ) {
\t$vars = get_object_vars( $object );
\treturn array(
\t\t'class' => get_class( $object ),
\t\t'object_var_order' => array_keys( $vars ),
\t\t'object_vars' => wphx_306_06_value( $vars ),
\t\t'serialized_sha256' => 'sha256:' . hash( 'sha256', serialize( $object ) ),
\t\t'serialized_length' => strlen( serialize( $object ) ),
\t);
}
function wphx_306_06_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$result = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$result[ $key ] = wphx_306_06_value( $item );
\t\t}
\t\treturn $result;
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'class' => get_class( $value ), 'properties' => wphx_306_06_value( get_object_vars( $value ) ) );
\t}
\treturn $value;
}
function wphx_306_06_dynamic_probe( $object ) {
\t$object->plugin_runtime_marker = 'plugin-value';
\t$isset_before = isset( $object->plugin_runtime_marker );
\t$value_before = $object->plugin_runtime_marker ?? null;
\tunset( $object->plugin_runtime_marker );
\treturn array( 'isset_before_unset' => $isset_before, 'value_before_unset' => $value_before, 'isset_after_unset' => isset( $object->plugin_runtime_marker ) );
}

$contracts = array();
foreach ( array( 'WP_User', 'WP_Roles', 'WP_Role', 'WP_User_Query', 'WP_Session_Tokens', 'WP_User_Meta_Session_Tokens', 'WP_Application_Passwords' ) as $class_name ) {
\t$contracts[ $class_name ] = wphx_306_06_class_contract( $class_name );
}

$data = (object) array(
\t'ID' => 7,
\t'user_login' => 'api-user',
\t'user_email' => 'api@example.test',
\t'display_name' => 'API User',
);
$user = new WP_User( $data );
$user->favorite_color = 'blue';
$user->filter = 'display';
$user_magic = array(
\t'id' => $user->id,
\t'user_login' => $user->user_login,
\t'nickname' => $user->nickname,
\t'isset_nickname' => isset( $user->nickname ),
\t'to_array_order' => array_keys( $user->to_array() ),
\t'call_init_caps' => $user->_init_caps(),
);
unset( $user->favorite_color );

$roles = new WP_Roles();
$role = new WP_Role( 'fixture_role', array( 'read' => true, 'edit_posts' => false ) );
$roles->_init();

$query = new WP_User_Query();
$query->results = array( 7, 8 );
$query->total_users = 2;
$query_compat = array(
\t'results' => $query->results,
\t'total_users' => $query->total_users,
\t'isset_results' => isset( $query->results ),
\t'unknown_get' => $query->plugin_missing_field,
);
unset( $query->results );
$query_compat['isset_results_after_unset'] = isset( $query->results );

$session = WP_Session_Tokens::get_instance( 7 );
$session_update = array( 'expiration' => 2000000000, 'fixture' => true );
$session->update( 'known-token', $session_update );
$session_runtime = array(
\t'class' => get_class( $session ),
\t'get_known_token' => $session->get( 'known-token' ),
\t'verify_known_token' => $session->verify( 'known-token' ),
\t'all_count' => count( $session->get_all() ),
);
$session->destroy( 'known-token' );
$session_runtime['verify_after_destroy'] = $session->verify( 'known-token' );
WP_Session_Tokens::destroy_all_for_all_users();

$app_passwords = new WP_Application_Passwords();

$runtime = array(
\t'wp_user' => array(
\t\t'object' => wphx_306_06_object_contract( $user ),
\t\t'magic' => wphx_306_06_value( $user_magic ),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $user ),
\t),
\t'wp_roles' => array(
\t\t'object' => wphx_306_06_object_contract( $roles ),
\t\t'call_init_result' => $roles->_init(),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $roles ),
\t),
\t'wp_role' => array(
\t\t'object' => wphx_306_06_object_contract( $role ),
\t\t'has_read' => $role->has_cap( 'read' ),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $role ),
\t),
\t'wp_user_query' => array(
\t\t'object' => wphx_306_06_object_contract( $query ),
\t\t'compat' => wphx_306_06_value( $query_compat ),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $query ),
\t),
\t'wp_session_tokens' => array(
\t\t'object' => wphx_306_06_object_contract( $session ),
\t\t'runtime' => wphx_306_06_value( $session_runtime ),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $session ),
\t),
\t'wp_application_passwords' => array(
\t\t'object' => wphx_306_06_object_contract( $app_passwords ),
\t\t'dynamic' => wphx_306_06_dynamic_probe( $app_passwords ),
\t),
);

$raw_paths = array();
foreach ( $contracts as $class_name => $contract ) {
\t$reflection = new ReflectionClass( $class_name );
\t$raw_paths[ $class_name ] = array(
\t\t'class_file' => $reflection->getFileName(),
\t);
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'root' => $root,
\t\t'evidence_class' => 'runtime_abi',
\t\t'artifact_scope' => 'oracle_source_mirror',
\t\t'classes' => $contracts,
\t\t'runtime' => $runtime,
\t\t'actions' => $GLOBALS['wphx_306_06_actions'],
\t\t'errors' => $GLOBALS['wphx_306_06_errors'],
\t\t'raw_paths' => $raw_paths,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(mode, root) {
  const output = command("php", [PROBE, mode, root]);
  const result = JSON.parse(output);
  return {
    mode,
    command: `php ${PROBE} ${mode} ${root}`,
    raw_output_sha256: sha256(output),
    result
  };
}

function writeIfChanged(path, contents) {
  if (existsSync(path) && readFileSync(path, "utf8") === contents) {
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/user-auth-runtime-abi-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "runtime_abi_fixture",
      name: "users/auth runtime ABI and plugin-facing reflection fixture",
      area: "wp-includes user/auth classes",
      public_contract:
        "This fixture records WordPress 7.0 runtime ABI for user/auth classes: reflection-visible declarations, declaring files/classes, public object state order, dynamic properties, magic methods, serialization shape, session token storage, and plugin-style access."
    },
    ownership_state: "oracle_fixture",
    ownership_axes: {
      semantic_owner: "upstream_oracle",
      adapter_contract_owner: "not_claimed",
      emission_strategy: "upstream_source_mirror_fixture",
      execution_provider: "php_oracle_process",
      compatibility_evidence: "runtime_abi"
    },
    bridge: {
      exists: true,
      kind: "oracle-source-mirror-runtime-abi-fixture",
      removal_gate:
        "Replace candidate mirror with generated original-path PHP once WPHX-306 public adapter classes exist; keep this fixture as the ABI oracle."
    },
    owned_paths: ["tools/wp-core/run-user-auth-runtime-abi-fixture.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT_ROOT],
    verification: {
      oracle_commands: ["npm run wp:core:wphx-306-runtime-abi", "npm run wp:core:wphx-306-runtime-abi:check", "npm run receipts:validate"],
      receipt_refs: ["receipt:wphx-306-06-user-auth-runtime-abi-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const oracleRun = runProbe("oracle", ORACLE_ROOT);
const candidateRun = runProbe("candidate", CANDIDATE_ROOT);
const comparableOracle = {
  classes: oracleRun.result.classes,
  runtime: oracleRun.result.runtime,
  actions: oracleRun.result.actions,
  errors: oracleRun.result.errors
};
const comparableCandidate = {
  classes: candidateRun.result.classes,
  runtime: candidateRun.result.runtime,
  actions: candidateRun.result.actions,
  errors: candidateRun.result.errors
};
const observationsEqual = JSON.stringify(comparableOracle) === JSON.stringify(comparableCandidate);

if (!observationsEqual) {
  console.error(JSON.stringify({ status: "failed", oracle: comparableOracle, candidate: comparableCandidate }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-user-auth-runtime-abi-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-user-auth-runtime-abi-fixture.mjs",
  upstream: {
    repo: UPSTREAM_ROOT,
    commit: WP_REF,
    source_files: SOURCE_FILES.map(sourceRecord)
  },
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    foundation_manifest: inputRecord(FOUNDATION)
  },
  evidence: {
    class_count: COVERED_CLASSES.length,
    fixture_case_count: FIXTURE_CASES.length,
    evidence_class: "runtime_abi",
    artifact_scope: "oracle_source_mirror",
    compared_projection:
      "Reflection/runtime ABI comparison uses root-relative declaring files for oracle-vs-candidate equality; raw absolute declaring paths are retained in oracle_run.result.raw_paths and candidate_run.result.raw_paths.",
    limitations: [
      "Candidate is still an upstream source mirror, not generated public PHP.",
      "This fixture records runtime ABI and plugin-facing object behavior; installed web login/auth parity remains WPHX-306.07.",
      "Database-backed WP_User_Query execution is intentionally not exercised here; this is an ABI fixture, not query semantic parity."
    ]
  },
  covered_classes: COVERED_CLASSES,
  fixture_cases: FIXTURE_CASES,
  comparison: {
    observations_equal: observationsEqual,
    oracle_raw_output_sha256: oracleRun.raw_output_sha256,
    candidate_raw_output_sha256: candidateRun.raw_output_sha256
  },
  oracle_run: oracleRun,
  candidate_run: candidateRun
};

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha = sha256(manifestJson);
const ownershipJson = `${JSON.stringify(ownershipManifest(manifestSha), null, 2)}\n`;
const receipt = {
  schema: "wphx.receipt.v1",
  id: "receipt:wphx-306-06-user-auth-runtime-abi-fixture",
  issue: ISSUE,
  generated_at: RECORDED_AT,
  artifacts: [
    { path: OUT, sha256: manifestSha, role: "user/auth runtime ABI fixture manifest" },
    { path: OWNERSHIP, sha256: sha256(ownershipJson), role: "ownership manifest" },
    { path: "tools/wp-core/run-user-auth-runtime-abi-fixture.mjs", sha256: sha256File("tools/wp-core/run-user-auth-runtime-abi-fixture.mjs"), role: "fixture runner" }
  ],
  commands: ["npm run wp:core:wphx-306-runtime-abi", "npm run wp:core:wphx-306-runtime-abi:check"],
  result: {
    status: "passed",
    evidence_class: "runtime_abi",
    artifact_scope: "oracle_source_mirror",
    class_count: COVERED_CLASSES.length,
    fixture_case_count: FIXTURE_CASES.length,
    observations_equal: observationsEqual
  }
};
const receiptJson = `${JSON.stringify(receipt, null, 2)}\n`;

if (checkOnly) {
  const expected = [
    [OUT, manifestJson],
    [OWNERSHIP, ownershipJson],
    [RECEIPT, receiptJson]
  ];
  for (const [path, contents] of expected) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run npm run wp:core:wphx-306-runtime-abi`);
    }
    const actual = readFileSync(path, "utf8");
    if (actual !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-306-runtime-abi`);
    }
  }
} else {
  writeIfChanged(OUT, manifestJson);
  writeIfChanged(OWNERSHIP, ownershipJson);
  writeIfChanged(RECEIPT, receiptJson);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT
    },
    null,
    2
  )
);
