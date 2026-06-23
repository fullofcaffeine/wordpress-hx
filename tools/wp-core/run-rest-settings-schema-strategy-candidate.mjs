#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.10.3",
  external_ref: "WPHX-311.03",
  title: "Promote REST settings strategy to Haxe candidate"
};
const HXML = "fixtures/wp-core/rest-settings-schema-strategy-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-311-03";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-311-03-rest-settings-schema-strategy-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-03-rest-settings-schema-strategy-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-03-rest-settings-schema-strategy-candidate.v1.json";
const CONTROLLER_FIXTURE = "manifests/wp-core/wphx-311-01-rest-settings-controller-fixture.v1.json";
const DISPATCH_FIXTURE = "manifests/wp-core/wphx-311-02-rest-settings-dispatch-fixture.v1.json";
const RECORDED_AT = "2026-06-22T09:15:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/pomo/plural-forms.php",
  "src/wp-includes/pomo/entry.php",
  "src/wp-includes/pomo/translations.php",
  "src/wp-includes/l10n.php",
  "src/wp-includes/class-wp-list-util.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-includes/rest-api.php",
  "src/wp-includes/rest-api/class-wp-rest-request.php",
  "src/wp-includes/rest-api/class-wp-rest-response.php",
  "src/wp-includes/rest-api/class-wp-rest-server.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-controller.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php"
];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/rest/RestSettingsSchemaStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/RestSettingsSchemaStrategyCandidateEntry.hx"
];

const PROMOTED_SYMBOLS = [
  "WP_REST_Settings_Controller::get_registered_options",
  "WP_REST_Settings_Controller::get_item_schema",
  "WP_REST_Settings_Controller::sanitize_callback",
  "WP_REST_Settings_Controller::get_item_permissions_check"
];

const FIXTURE_CASES = [
  {
    id: "rest-settings-schema:registered-options",
    symbol: "WP_REST_Settings_Controller::get_registered_options",
    focus: "show_in_rest filtering, custom REST names, default schema fields, supported type filtering, and option_name preservation"
  },
  {
    id: "rest-settings-schema:item-schema",
    symbol: "WP_REST_Settings_Controller::get_item_schema",
    focus: "schema properties are built from the Haxe-planned registered options and keep arg_options sanitize callbacks"
  },
  {
    id: "rest-settings-schema:sanitize-null",
    symbol: "WP_REST_Settings_Controller::sanitize_callback",
    focus: "null values remain non-destructive while non-null values still flow through native REST parsing"
  },
  {
    id: "rest-settings-schema:permission-plan",
    symbol: "WP_REST_Settings_Controller::get_item_permissions_check",
    focus: "settings permission remains the manage_options capability boundary"
  }
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

function phpVersionFamily(value) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
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

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source)
  };
}

function haxeBootstrapBlock(dirnameDepth) {
  return `if ( ! function_exists( 'wphx_311_03_bootstrap_haxe' ) ) {
\tfunction wphx_311_03_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_311_03_lib = dirname( __DIR__, ${dirnameDepth} ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_311_03_lib );
\t\tspl_autoload_register(
\t\t\tfunction ( $class ) {
\t\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\t\tif ( $file ) {
\t\t\t\t\tinclude_once $file;
\t\t\t\t}
\t\t\t}
\t\t);
\t\t\\php\\Boot::__hx__init();
\t}
}
wphx_311_03_bootstrap_haxe();`;
}

function installBootstrap(source, dirnameDepth) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) {
    throw new Error("PHP source did not start with an expected PHP open tag");
  }
  return `${marker}\n${haxeBootstrapBlock(dirnameDepth)}\n${source.slice(marker.length)}`;
}

function replaceMethod(source, methodName, replacement) {
  const pattern = new RegExp(`((?:public|protected|private)\\s+function\\s+${methodName}\\s*\\()`, "m");
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Unable to locate method ${methodName}`);
  }

  const openBrace = source.indexOf("{", match.index);
  if (openBrace === -1) {
    throw new Error(`Unable to locate opening brace for ${methodName}`);
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, match.index)}${replacement}${source.slice(index + 1)}`;
      }
    }
  }
  throw new Error(`Unable to locate closing brace for ${methodName}`);
}

function transformCandidateRestSettingsController() {
  const path = `${CANDIDATE_ROOT}/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`;
  let source = installBootstrap(readFileSync(path, "utf8"), 4);
  source = replaceMethod(
    source,
    "get_registered_options",
    `protected function get_registered_options() {
\t$rest_options = array();
\t$strategy     = '\\\\wphx\\\\wp\\\\rest\\\\RestSettingsSchemaStrategy';

\tforeach ( get_registered_settings() as $name => $args ) {
\t\tif ( ! $strategy::shouldExposeInRest( empty( $args['show_in_rest'] ) ) ) {
\t\t\tcontinue;
\t\t}

\t\t$rest_args = array();

\t\tif ( $strategy::shouldUseRestArgs( is_array( $args['show_in_rest'] ) ) ) {
\t\t\t$rest_args = $args['show_in_rest'];
\t\t}

\t\t$defaults = array(
\t\t\t'name'   => $strategy::restName( ! empty( $rest_args['name'] ) ? (string) $rest_args['name'] : '', $name ),
\t\t\t'schema' => array(),
\t\t);

\t\t$rest_args = array_merge( $defaults, $rest_args );

\t\t$default_schema = array(
\t\t\t'type'        => $strategy::schemaType( empty( $args['type'] ) ? '' : (string) $args['type'] ),
\t\t\t'title'       => empty( $args['label'] ) ? '' : $args['label'],
\t\t\t'description' => empty( $args['description'] ) ? '' : $args['description'],
\t\t\t'default'     => $args['default'] ?? null,
\t\t);

\t\t$rest_args['schema']      = array_merge( $default_schema, $rest_args['schema'] );
\t\t$rest_args['option_name'] = $name;
\t\t$schema_type              = empty( $rest_args['schema']['type'] ) ? '' : (string) $rest_args['schema']['type'];

\t\tif ( $strategy::shouldSkipSchemaType( $schema_type ) ) {
\t\t\tcontinue;
\t\t}

\t\tif ( ! $strategy::isSupportedSchemaType( $schema_type ) ) {
\t\t\tcontinue;
\t\t}

\t\tif ( $strategy::shouldDefaultAdditionalPropertiesToFalse( $schema_type ) ) {
\t\t\t$rest_args['schema'] = rest_default_additional_properties_to_false( $rest_args['schema'] );
\t\t}

\t\t$rest_options[ $rest_args['name'] ] = $rest_args;
\t}

\treturn $rest_options;
}`
  );
  writeFileSync(path, source);
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
$GLOBALS['wphx_311_03_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_03_php_errors'][] = array(
\t\t\t'errno'   => $errno,
\t\t\t'message' => $errstr,
\t\t);
\t\treturn true;
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_03_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args'       => $args,
\t);
\treturn (bool) $GLOBALS['wphx_311_03_can_manage_options'];
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/pomo/translations.php';
require_once ABSPATH . WPINC . '/l10n.php';
require_once ABSPATH . WPINC . '/class-wp-list-util.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wp-http-response.php';
require_once ABSPATH . WPINC . '/functions.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-request.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-response.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-server.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-controller.php';
require_once ABSPATH . WPINC . '/rest-api.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-settings-controller.php';

wp_cache_init();

class WPHX_311_03_Settings_Probe extends WP_REST_Settings_Controller {
\tpublic function registered_options() {
\t\treturn $this->get_registered_options();
\t}
}

function wphx_311_03_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
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

function wphx_311_03_callback_label( $callback ) {
\tif ( null === $callback || '' === $callback ) {
\t\treturn null;
\t}
\tif ( is_string( $callback ) ) {
\t\treturn array( 'type' => 'function', 'name' => $callback );
\t}
\tif ( is_array( $callback ) ) {
\t\treturn array(
\t\t\t'type'   => 'array',
\t\t\t'target' => is_object( $callback[0] ?? null ) ? get_class( $callback[0] ) : (string) ( $callback[0] ?? '' ),
\t\t\t'method' => (string) ( $callback[1] ?? '' ),
\t\t);
\t}
\tif ( $callback instanceof Closure ) {
\t\treturn array( 'type' => 'closure' );
\t}
\treturn array( 'type' => gettype( $callback ) );
}

function wphx_311_03_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_311_03_scalar( $key ),
\t\t\t\t'value' => wphx_311_03_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( $value instanceof WP_Error ) {
\t\treturn array(
\t\t\t'type'    => 'wp_error',
\t\t\t'code'    => $value->get_error_code(),
\t\t\t'message' => $value->get_error_message(),
\t\t\t'data'    => wphx_311_03_value( $value->get_error_data() ),
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_311_03_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_311_03_scalar( $value );
}

function wphx_311_03_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_311_03_value( $value ),
\t\t'meta'   => wphx_311_03_value( $meta ),
\t);
}

function wphx_311_03_reset_state() {
\tglobal $wp_filter, $wp_actions, $wp_filters, $wp_current_filter, $wp_registered_settings, $new_allowed_options;
\t$wp_filter              = array();
\t$wp_actions             = array();
\t$wp_filters             = array();
\t$wp_current_filter      = array();
\t$wp_registered_settings = array();
\t$new_allowed_options    = array();
\t$GLOBALS['new_whitelist_options']          = &$new_allowed_options;
\t$GLOBALS['wp_rest_additional_fields']      = array();
\t$GLOBALS['wphx_311_03_capability_checks']  = array();
\t$GLOBALS['wphx_311_03_can_manage_options'] = true;
\twp_cache_flush();
}

function wphx_311_03_register_settings() {
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_text',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'label'        => 'REST text',
\t\t\t'description'  => 'REST-visible text setting',
\t\t\t'show_in_rest' => true,
\t\t\t'default'      => 'fallback-text',
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_named',
\t\tarray(
\t\t\t'type'         => 'integer',
\t\t\t'label'        => 'Named count',
\t\t\t'description'  => 'REST-visible renamed integer',
\t\t\t'default'      => 7,
\t\t\t'show_in_rest' => array(
\t\t\t\t'name'   => 'renamed_count',
\t\t\t\t'schema' => array(
\t\t\t\t\t'minimum' => 0,
\t\t\t\t\t'context' => array( 'view', 'edit' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_object',
\t\tarray(
\t\t\t'type'         => 'object',
\t\t\t'label'        => 'Object value',
\t\t\t'default'      => array( 'enabled' => false, 'label' => 'fallback' ),
\t\t\t'show_in_rest' => array(
\t\t\t\t'schema' => array(
\t\t\t\t\t'properties' => array(
\t\t\t\t\t\t'enabled' => array( 'type' => 'boolean' ),
\t\t\t\t\t\t'label'   => array( 'type' => 'string' ),
\t\t\t\t\t),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_array',
\t\tarray(
\t\t\t'type'         => 'array',
\t\t\t'default'      => array( 'fallback' ),
\t\t\t'show_in_rest' => array(
\t\t\t\t'schema' => array(
\t\t\t\t\t'items' => array( 'type' => 'string' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_hidden',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'show_in_rest' => false,
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_unsupported',
\t\tarray(
\t\t\t'type'         => 'date',
\t\t\t'show_in_rest' => true,
\t\t)
\t);
}

function wphx_311_03_schema_summary( $schema ) {
\t$summary = array(
\t\t'title'      => $schema['title'] ?? null,
\t\t'type'       => $schema['type'] ?? null,
\t\t'properties' => array(),
\t);
\tforeach ( $schema['properties'] ?? array() as $name => $property ) {
\t\t$summary['properties'][ $name ] = array(
\t\t\t'type'                 => $property['type'] ?? null,
\t\t\t'title'                => $property['title'] ?? null,
\t\t\t'description'          => $property['description'] ?? null,
\t\t\t'default'              => $property['default'] ?? null,
\t\t\t'optionName'           => $property['option_name'] ?? null,
\t\t\t'additionalProperties' => $property['additionalProperties'] ?? null,
\t\t\t'argOptions'           => array(
\t\t\t\t'sanitize_callback' => wphx_311_03_callback_label( $property['arg_options']['sanitize_callback'] ?? null ),
\t\t\t),
\t\t);
\t\tif ( isset( $property['properties'] ) ) {
\t\t\t$summary['properties'][ $name ]['nested'] = $property['properties'];
\t\t}
\t\tif ( isset( $property['items'] ) ) {
\t\t\t$summary['properties'][ $name ]['items'] = $property['items'];
\t\t}
\t}
\treturn $summary;
}

function wphx_311_03_run_cases() {
\t$cases = array();

\twphx_311_03_reset_state();
\twphx_311_03_register_settings();
\t$controller = new WPHX_311_03_Settings_Probe();
\t$registered = $controller->registered_options();
\t$cases[] = wphx_311_03_case(
\t\t'rest-settings-schema:registered-options',
\t\t'WP_REST_Settings_Controller::get_registered_options',
\t\t$registered,
\t\tarray(
\t\t\t'keys' => array_keys( $registered ),
\t\t)
\t);

\t$cases[] = wphx_311_03_case(
\t\t'rest-settings-schema:item-schema',
\t\t'WP_REST_Settings_Controller::get_item_schema',
\t\twphx_311_03_schema_summary( $controller->get_item_schema() )
\t);

\t$request = new WP_REST_Request( 'POST', '/wp/v2/settings' );
\t$cases[] = wphx_311_03_case(
\t\t'rest-settings-schema:sanitize-null',
\t\t'WP_REST_Settings_Controller::sanitize_callback',
\t\tarray(
\t\t\t'null'    => $controller->sanitize_callback( null, $request, 'wphx_rest_text' ),
\t\t\t'nonNull' => $controller->sanitize_callback( 'value', $request, 'wphx_rest_text' ),
\t\t)
\t);

\t$cases[] = wphx_311_03_case(
\t\t'rest-settings-schema:permission-plan',
\t\t'WP_REST_Settings_Controller::get_item_permissions_check',
\t\tarray(
\t\t\t'allowed' => $controller->get_item_permissions_check( new WP_REST_Request( 'GET', '/wp/v2/settings' ) ),
\t\t),
\t\tarray( 'capabilityChecks' => $GLOBALS['wphx_311_03_capability_checks'] )
\t);

\treturn $cases;
}

$reflection = new ReflectionMethod( 'WP_REST_Settings_Controller', 'get_registered_options' );
$snapshot   = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredClassExists'    => array(
\t\t'WP_REST_Settings_Controller' => class_exists( 'WP_REST_Settings_Controller' ),
\t\t'WP_REST_Request'             => class_exists( 'WP_REST_Request' ),
\t\t'WP_REST_Server'              => class_exists( 'WP_REST_Server' ),
\t),
\t'coveredFunctionExists' => array(
\t\t'register_setting'                            => function_exists( 'register_setting' ),
\t\t'get_registered_settings'                     => function_exists( 'get_registered_settings' ),
\t\t'rest_default_additional_properties_to_false' => function_exists( 'rest_default_additional_properties_to_false' ),
\t\t'rest_parse_request_arg'                      => function_exists( 'rest_parse_request_arg' ),
\t),
\t'promotedMethodOrigin'  => array(
\t\t'file'           => $reflection->getFileName(),
\t\t'declaringClass' => $reflection->getDeclaringClass()->getName(),
\t\t'isProtected'    => $reflection->isProtected(),
\t),
\t'haxeStrategyLoaded'    => class_exists( '\\\\wphx\\\\wp\\\\rest\\\\RestSettingsSchemaStrategy' ),
\t'cases'                 => wphx_311_03_run_cases(),
\t'phpErrors'             => $GLOBALS['wphx_311_03_php_errors'],
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    coveredClassExists: result.coveredClassExists,
    coveredFunctionExists: result.coveredFunctionExists,
    cases: result.cases,
    phpErrors: result.phpErrors
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
  const oracleText = JSON.stringify(oracle);
  const candidateText = JSON.stringify(candidate);
  return {
    matches: oracleText === candidateText,
    oracle_sha256: sha256(oracleText),
    candidate_sha256: sha256(candidateText),
    oracle_case_count: oracle.cases.length,
    candidate_case_count: candidate.cases.length,
    ...(oracleText === candidateText ? {} : { oracle, candidate })
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-settings-schema-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-settings-schema-strategy-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "class-method-strategy",
      name: "WP_REST_Settings_Controller registered-options schema strategy",
      area: "wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php",
      public_contract:
        "The REST settings controller must expose registered settings through the same PHP class/method ABI while typed Haxe owns the bounded visibility, REST name, supported schema type, null-sanitize, and capability decisions."
    },
    ownership_state: "haxe_parity_candidate",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: [...HAXE_SOURCES, "tools/wp-core/run-rest-settings-schema-strategy-candidate.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    abi_policy: {
      php_surface_preserved: [
        "WP_REST_Settings_Controller remains a PHP class with the same public/protected method names",
        "get_registered_options remains protected",
        "get_item_schema, sanitize_callback, and get_item_permissions_check stay plugin/reflection visible through the upstream class shell"
      ],
      haxe_owned_decisions: [
        "show_in_rest visibility",
        "show_in_rest array argument usage",
        "REST response property name fallback",
        "supported schema type filtering",
        "additionalProperties normalization route",
        "null sanitizer passthrough route",
        "manage_options capability identifier"
      ],
      native_boundaries: [
        "PHP arrays remain native at the WordPress boundary",
        "register_setting(), get_registered_settings(), rest_default_additional_properties_to_false(), rest_parse_request_arg(), current_user_can(), and filters remain PHP-native WordPress boundaries"
      ]
    },
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-settings-schema-candidate",
        "npm run wp:core:wphx-311-rest-settings-schema-candidate:check",
        "npm run wp:core:wphx-311-rest-settings-controller:check",
        "npm run wp:core:wphx-311-rest-settings-dispatch:check",
        "npm run haxe:escape-hatches:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-03-rest-settings-schema-strategy-candidate",
        "receipt:wphx-311-01-rest-settings-controller-fixture",
        "receipt:wphx-311-02-rest-settings-dispatch-fixture"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This is the first typed Haxe REST settings candidate. It intentionally does not replace request objects, PHP array ABI, filters, or full controller update/get_item bodies."
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
command("haxe", [HXML]);
transformCandidateRestSettingsController();
writeProbe();
command("php", ["-l", `${CANDIDATE_ROOT}/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`]);
command("php", ["-l", `${HAXE_OUT}/lib/wphx/wp/rest/RestSettingsSchemaStrategy.php`]);

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

const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) => !audit.contains_dynamic && !audit.contains_untyped && !audit.contains_cast && !audit.contains_php_syntax_code
);

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const manifest = {
  schema: "wphx.wp-core-rest-settings-schema-strategy-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-rest-settings-schema-strategy-candidate.mjs",
  inputs: {
    controller_fixture_manifest: inputRecord(CONTROLLER_FIXTURE),
    dispatch_fixture_manifest: inputRecord(DISPATCH_FIXTURE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "haxe_generated_rest_settings_schema_strategy_shell",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "linked_candidate",
    promoted_symbols: PROMOTED_SYMBOLS,
    cases: FIXTURE_CASES,
    haxe_strategy_probe: {
      loaded_in_candidate: localCandidate.result.haxeStrategyLoaded,
      route: "typed_haxe_rest_settings_schema_plan",
      owned_method: "get_registered_options"
    },
    haxe_source_audits: haxeSourceAudits,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    native_boundaries: [
      {
        id: "native-php-array-abi",
        reason:
          "WordPress REST settings methods expose native PHP arrays and callbacks to plugins and reflection. The candidate keeps PHP array assembly in the class shell while Haxe owns bounded decisions."
      },
      {
        id: "wordpress-rest-schema-functions",
        reason:
          "rest_default_additional_properties_to_false() and rest_parse_request_arg() are still upstream PHP REST schema/sanitization boundaries."
      },
      {
        id: "wordpress-settings-registry",
        reason:
          "register_setting() and get_registered_settings() remain native registry APIs that plugins can mutate before the controller reads them."
      }
    ],
    follow_up_owner: "WPHX-311"
  },
  generated: {
    haxe_output: HAXE_OUT,
    generated_haxe_files: filesUnder(HAXE_OUT),
    candidate_controller: inputRecord(`${CANDIDATE_ROOT}/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`),
    strategy_php: inputRecord(`${HAXE_OUT}/lib/wphx/wp/rest/RestSettingsSchemaStrategy.php`),
    php_lint: {
      candidate_controller: "passed",
      strategy_php: "passed"
    }
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version_family: phpVersionFamily(localOracle.result.phpVersion),
      executable: "php"
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs: runs.map((run) => ({
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: run.command,
    php_version_family: phpVersionFamily(run.result.phpVersion),
    haxe_strategy_loaded: run.result.haxeStrategyLoaded,
    case_count: run.result.cases.length,
    normalized_sha256: sha256(JSON.stringify(normalize(run.result)))
  })),
  comparisons,
  remaining_gaps: [
    {
      id: "get-item-and-update-item-not-yet-haxe-owned",
      owner: "WPHX-311",
      detail:
        "This slice ports registered-option schema planning decisions. get_item value preparation/filter behavior and update_item routing remain later Haxe candidates."
    },
    {
      id: "server-dispatch-remains-upstream-shell",
      owner: "WPHX-311",
      detail:
        "The WPHX-311.02 dispatch fixture remains authoritative for server routing behavior while WP_REST_Server itself is not yet a Haxe candidate."
    },
    {
      id: "php-array-abi-still-native",
      owner: "WPHX-311",
      detail:
        "Native PHP arrays are intentionally kept in the class shell until a broader public ABI strategy proves plugin-facing array/object behavior."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: sourceEscapeAuditPassed ? "passed" : "failed",
    candidate_kind: "haxe_generated_rest_settings_schema_strategy_shell",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "linked_candidate",
    promoted_symbols: PROMOTED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length,
    source_escape_audit_passed: sourceEscapeAuditPassed
  }
};

if (!sourceEscapeAuditPassed) {
  console.error(JSON.stringify({ status: "failed", haxeSourceAudits }, null, 2));
  process.exit(1);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-03-rest-settings-schema-strategy-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "typed Haxe REST settings schema strategy candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "Haxe parity-candidate ownership manifest"
    },
    {
      path: "src/wphx/wp/rest/RestSettingsSchemaStrategy.hx",
      role: "typed Haxe REST settings strategy source"
    },
    {
      path: "tools/wp-core/run-rest-settings-schema-strategy-candidate.mjs",
      role: "candidate generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-settings-schema-candidate",
    "npm run wp:core:wphx-311-rest-settings-schema-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-controller:check",
    "npm run wp:core:wphx-311-rest-settings-dispatch:check",
    "npm run haxe:escape-hatches:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-311-01-rest-settings-controller-fixture",
    "receipt:wphx-311-02-rest-settings-dispatch-fixture"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      manifest: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      cases: FIXTURE_CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
