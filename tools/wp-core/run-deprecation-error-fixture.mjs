#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.7.4",
  external_ref: "WPHX-303.04",
  title: "Build deprecation and native error signaling fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-303-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-303-04-deprecation-error-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-303-04-deprecation-error-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-303-04-deprecation-error-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-303-01-error-format-surface.v1.json";
const RECORDED_AT = "2026-06-21T00:45:00.000Z";
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
  "src/wp-includes/option.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-exception.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/http.php",
  "src/wp-includes/kses.php",
  "src/wp-includes/formatting.php"
];

const COVERED_SYMBOLS = [
  "wp_trigger_error",
  "_deprecated_function",
  "_deprecated_argument",
  "_doing_it_wrong",
  "wp_die",
  "_wp_die_process_input",
  "_default_wp_die_handler",
  "_ajax_wp_die_handler",
  "_json_wp_die_handler",
  "_scalar_wp_die_handler"
];

const FIXTURE_CASES = [
  { id: "wp-trigger-error:warning-sanitized", symbol: "wp_trigger_error", focus: "E_USER_WARNING message formatting, KSES stripping, always/debug hooks" },
  { id: "wp-trigger-error:notice-default", symbol: "wp_trigger_error", focus: "default E_USER_NOTICE and empty function-name formatting" },
  { id: "wp-trigger-error:deprecated", symbol: "wp_trigger_error", focus: "E_USER_DEPRECATED capture without losing native level" },
  { id: "wp-trigger-error:user-error-exception", symbol: "wp_trigger_error", focus: "E_USER_ERROR throws WP_Exception instead of trigger_error()" },
  { id: "wp-trigger-error:filter-suppressed", symbol: "wp_trigger_error", focus: "wp_trigger_error_trigger_error=false prevents debug hook and native error" },
  { id: "deprecated-function:replacement", symbol: "_deprecated_function", focus: "deprecated_function_run hook and E_USER_DEPRECATED replacement message" },
  { id: "deprecated-function:suppressed", symbol: "_deprecated_function", focus: "deprecated_function_trigger_error=false keeps hook while suppressing native deprecation" },
  { id: "deprecated-argument:message", symbol: "_deprecated_argument", focus: "deprecated_argument_run hook and custom message" },
  { id: "deprecated-argument:no-message", symbol: "_deprecated_argument", focus: "no-alternative deprecated argument message" },
  { id: "doing-it-wrong:notice-and-filter", symbol: "_doing_it_wrong", focus: "doing_it_wrong_run hook, filter arguments, and E_USER_NOTICE message" },
  { id: "wp-die:process-input-wp-error", symbol: "_wp_die_process_input", focus: "WP_Error message, title, status, code, error_data, and additional_errors" },
  { id: "wp-die:handler-selection-default", symbol: "wp_die", focus: "default wp_die_handler filter and processed scalar args" },
  { id: "wp-die:handler-selection-ajax", symbol: "wp_die", focus: "wp_doing_ajax branch selects wp_die_ajax_handler" },
  { id: "wp-die:handler-selection-json", symbol: "wp_die", focus: "JSON Accept branch selects wp_die_json_handler" },
  { id: "wp-die:default-handler-output", symbol: "_default_wp_die_handler", focus: "HTML output, additional errors, response handling, and exit=false" },
  { id: "wp-die:json-handler-output", symbol: "_json_wp_die_handler", focus: "JSON handler encoded payload and exit=false" },
  { id: "wp-die:ajax-and-scalar-output", symbol: "_ajax_wp_die_handler/_scalar_wp_die_handler", focus: "Ajax and scalar text output without exiting" }
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

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_DISPLAY', true );

$_SERVER['SERVER_PROTOCOL'] = 'HTTP/1.1';

require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wp-exception.php';
require_once ABSPATH . WPINC . '/functions.php';

wp_cache_init();
wp_cache_set(
\t'alloptions',
\tarray(
\t\t'blog_charset' => 'UTF-8',
\t),
\t'options'
);

require_once ABSPATH . WPINC . '/http.php';
require_once ABSPATH . WPINC . '/kses.php';
require_once ABSPATH . WPINC . '/formatting.php';

$GLOBALS['wphx_303_04_die_events'] = array();

function wphx_303_04_error_name( $type ) {
\t$names = array(
\t\tE_USER_ERROR      => 'E_USER_ERROR',
\t\tE_USER_WARNING    => 'E_USER_WARNING',
\t\tE_USER_NOTICE     => 'E_USER_NOTICE',
\t\tE_USER_DEPRECATED => 'E_USER_DEPRECATED',
\t);
\treturn $names[ $type ] ?? 'E_' . $type;
}

function wphx_303_04_scalar( $value ) {
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

function wphx_303_04_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_303_04_scalar( $key ),
\t\t\t\t'value' => wphx_303_04_value( $entry_value ),
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
\t\t\t'type'             => 'object',
\t\t\t'class'            => get_class( $value ),
\t\t\t'publicProperties' => wphx_303_04_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_303_04_scalar( $value );
}

function wphx_303_04_output_summary( $output ) {
\treturn array(
\t\t'bytes'       => strlen( $output ),
\t\t'sha256'      => hash( 'sha256', $output ),
\t\t'prefix'      => substr( $output, 0, 180 ),
\t\t'suffix'      => substr( $output, max( 0, strlen( $output ) - 180 ) ),
\t\t'contains'    => array(
\t\t\t'htmlDoc'       => str_contains( $output, '<!DOCTYPE html>' ),
\t\t\t'wpDieMessage'  => str_contains( $output, 'wp-die-message' ),
\t\t\t'additionalLi'  => str_contains( $output, '<li>' ),
\t\t\t'jsonCode'      => str_contains( $output, '"code"' ),
\t\t\t'ajaxFallback0' => '0' === $output,
\t\t),
\t);
}

function wphx_303_04_capture_native( $callback ) {
\t$events = array();
\t$previous = set_error_handler(
\t\tfunction ( $type, $message ) use ( &$events ) {
\t\t\t$events[] = array(
\t\t\t\t'type'     => $type,
\t\t\t\t'typeName' => wphx_303_04_error_name( $type ),
\t\t\t\t'message'  => $message,
\t\t\t);
\t\t\treturn true;
\t\t}
\t);

\t$output = '';
\t$return = null;
\t$exception = null;
\tob_start();
\ttry {
\t\t$return = $callback();
\t} catch ( Throwable $throwable ) {
\t\t$exception = array(
\t\t\t'class'   => get_class( $throwable ),
\t\t\t'message' => $throwable->getMessage(),
\t\t\t'code'    => $throwable->getCode(),
\t\t);
\t} finally {
\t\t$output = ob_get_clean();
\t\trestore_error_handler();
\t}

\treturn array(
\t\t'return'    => wphx_303_04_value( $return ),
\t\t'errors'    => $events,
\t\t'exception' => $exception,
\t\t'output'    => wphx_303_04_output_summary( $output ),
\t);
}

function wphx_303_04_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_303_04_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_303_04_recording_die_handler( $message, $title = '', $args = array() ) {
\t$GLOBALS['wphx_303_04_die_events'][] = array(
\t\t'message'   => $message,
\t\t'title'     => $title,
\t\t'args'      => $args,
\t\t'processed' => _wp_die_process_input( $message, $title, $args ),
\t);
}

function wphx_303_04_hooked_trigger_call( $callback ) {
\t$events = array();
\t$always = function ( $function_name, $message, $error_level ) use ( &$events ) {
\t\t$events[] = array(
\t\t\t'hook'         => current_action(),
\t\t\t'functionName' => $function_name,
\t\t\t'message'      => $message,
\t\t\t'errorLevel'   => $error_level,
\t\t\t'errorName'    => wphx_303_04_error_name( $error_level ),
\t\t);
\t};
\t$debug = function ( $function_name, $message, $error_level ) use ( &$events ) {
\t\t$events[] = array(
\t\t\t'hook'         => current_action(),
\t\t\t'functionName' => $function_name,
\t\t\t'message'      => $message,
\t\t\t'errorLevel'   => $error_level,
\t\t\t'errorName'    => wphx_303_04_error_name( $error_level ),
\t\t);
\t};
\tadd_action( 'wp_trigger_error_always_run', $always, 10, 3 );
\tadd_action( 'wp_trigger_error_run', $debug, 10, 3 );
\t$result = wphx_303_04_capture_native( $callback );
\tremove_action( 'wp_trigger_error_always_run', $always, 10 );
\tremove_action( 'wp_trigger_error_run', $debug, 10 );
\t$result['hooks'] = $events;
\treturn $result;
}

function wphx_303_04_run_cases() {
\t$cases = array();

\t$cases[] = wphx_303_04_case(
\t\t'wp-trigger-error:warning-sanitized',
\t\t'wp_trigger_error',
\t\twphx_303_04_hooked_trigger_call(
\t\t\tfunction () {
\t\t\t\twp_trigger_error(
\t\t\t\t\t'some_function',
\t\t\t\t\t'<strong>expected</strong> <script>alert("bad")</script> <a href="javascript:bad">bad</a>',
\t\t\t\t\tE_USER_WARNING
\t\t\t\t);
\t\t\t}
\t\t)
\t);

\t$cases[] = wphx_303_04_case(
\t\t'wp-trigger-error:notice-default',
\t\t'wp_trigger_error',
\t\twphx_303_04_hooked_trigger_call(
\t\t\tfunction () {
\t\t\t\twp_trigger_error( '', 'notice only' );
\t\t\t}
\t\t)
\t);

\t$cases[] = wphx_303_04_case(
\t\t'wp-trigger-error:deprecated',
\t\t'wp_trigger_error',
\t\twphx_303_04_hooked_trigger_call(
\t\t\tfunction () {
\t\t\t\twp_trigger_error( 'old_function', 'deprecated call', E_USER_DEPRECATED );
\t\t\t}
\t\t)
\t);

\t$cases[] = wphx_303_04_case(
\t\t'wp-trigger-error:user-error-exception',
\t\t'wp_trigger_error',
\t\twphx_303_04_hooked_trigger_call(
\t\t\tfunction () {
\t\t\t\twp_trigger_error( 'fatal_function', '<em>fatal</em> <script>strip</script>', E_USER_ERROR );
\t\t\t}
\t\t)
\t);

\t$filter_events = array();
\t$suppress_trigger = function ( $trigger, $function_name, $message, $error_level ) use ( &$filter_events ) {
\t\t$filter_events[] = compact( 'trigger', 'function_name', 'message', 'error_level' );
\t\treturn false;
\t};
\tadd_filter( 'wp_trigger_error_trigger_error', $suppress_trigger, 10, 4 );
\t$suppressed_trigger = wphx_303_04_hooked_trigger_call(
\t\tfunction () {
\t\t\twp_trigger_error( 'filtered_function', 'filtered message', E_USER_WARNING );
\t\t}
\t);
\tremove_filter( 'wp_trigger_error_trigger_error', $suppress_trigger, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'wp-trigger-error:filter-suppressed',
\t\t'wp_trigger_error',
\t\t$suppressed_trigger,
\t\tarray( 'filterEvents' => $filter_events )
\t);

\t$deprecated_function_events = array();
\t$deprecated_function_run = function ( $function_name, $replacement, $version ) use ( &$deprecated_function_events ) {
\t\t$deprecated_function_events[] = compact( 'function_name', 'replacement', 'version' );
\t};
\tadd_action( 'deprecated_function_run', $deprecated_function_run, 10, 3 );
\t$deprecated_function = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_deprecated_function( 'old_api', '2.5.0', 'new_api' );
\t\t}
\t);
\tremove_action( 'deprecated_function_run', $deprecated_function_run, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'deprecated-function:replacement',
\t\t'_deprecated_function',
\t\t$deprecated_function,
\t\tarray( 'events' => $deprecated_function_events )
\t);

\t$deprecated_suppressed_events = array();
\t$deprecated_suppressed_run = function ( $function_name, $replacement, $version ) use ( &$deprecated_suppressed_events ) {
\t\t$deprecated_suppressed_events[] = compact( 'function_name', 'replacement', 'version' );
\t};
\t$deprecated_suppress_filter = function () {
\t\treturn false;
\t};
\tadd_action( 'deprecated_function_run', $deprecated_suppressed_run, 10, 3 );
\tadd_filter( 'deprecated_function_trigger_error', $deprecated_suppress_filter );
\t$deprecated_suppressed = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_deprecated_function( 'old_no_error', '3.0.0' );
\t\t}
\t);
\tremove_filter( 'deprecated_function_trigger_error', $deprecated_suppress_filter );
\tremove_action( 'deprecated_function_run', $deprecated_suppressed_run, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'deprecated-function:suppressed',
\t\t'_deprecated_function',
\t\t$deprecated_suppressed,
\t\tarray( 'events' => $deprecated_suppressed_events )
\t);

\t$deprecated_argument_events = array();
\t$deprecated_argument_run = function ( $function_name, $message, $version ) use ( &$deprecated_argument_events ) {
\t\t$deprecated_argument_events[] = compact( 'function_name', 'message', 'version' );
\t};
\tadd_action( 'deprecated_argument_run', $deprecated_argument_run, 10, 3 );
\t$deprecated_argument = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_deprecated_argument( 'arg_api', '4.0.0', 'Use the options array instead.' );
\t\t}
\t);
\tremove_action( 'deprecated_argument_run', $deprecated_argument_run, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'deprecated-argument:message',
\t\t'_deprecated_argument',
\t\t$deprecated_argument,
\t\tarray( 'events' => $deprecated_argument_events )
\t);

\t$deprecated_argument_no_message_events = array();
\t$deprecated_argument_no_message_run = function ( $function_name, $message, $version ) use ( &$deprecated_argument_no_message_events ) {
\t\t$deprecated_argument_no_message_events[] = compact( 'function_name', 'message', 'version' );
\t};
\tadd_action( 'deprecated_argument_run', $deprecated_argument_no_message_run, 10, 3 );
\t$deprecated_argument_no_message = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_deprecated_argument( 'arg_api_without_message', '4.1.0' );
\t\t}
\t);
\tremove_action( 'deprecated_argument_run', $deprecated_argument_no_message_run, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'deprecated-argument:no-message',
\t\t'_deprecated_argument',
\t\t$deprecated_argument_no_message,
\t\tarray( 'events' => $deprecated_argument_no_message_events )
\t);

\t$doing_it_wrong_events = array();
\t$doing_it_wrong_filters = array();
\t$doing_it_wrong_run = function ( $function_name, $message, $version ) use ( &$doing_it_wrong_events ) {
\t\t$doing_it_wrong_events[] = compact( 'function_name', 'message', 'version' );
\t};
\t$doing_it_wrong_filter = function ( $trigger, $function_name, $message, $version ) use ( &$doing_it_wrong_filters ) {
\t\t$doing_it_wrong_filters[] = compact( 'trigger', 'function_name', 'message', 'version' );
\t\treturn $trigger;
\t};
\tadd_action( 'doing_it_wrong_run', $doing_it_wrong_run, 10, 3 );
\tadd_filter( 'doing_it_wrong_trigger_error', $doing_it_wrong_filter, 10, 4 );
\t$doing_it_wrong = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_doing_it_wrong( 'wrong_api', 'Incorrect usage test.', '5.0.0' );
\t\t}
\t);
\tremove_filter( 'doing_it_wrong_trigger_error', $doing_it_wrong_filter, 10 );
\tremove_action( 'doing_it_wrong_run', $doing_it_wrong_run, 10 );
\t$cases[] = wphx_303_04_case(
\t\t'doing-it-wrong:notice-and-filter',
\t\t'_doing_it_wrong',
\t\t$doing_it_wrong,
\t\tarray(
\t\t\t'events'       => $doing_it_wrong_events,
\t\t\t'filterEvents' => $doing_it_wrong_filters,
\t\t)
\t);

\t$wp_error = new WP_Error(
\t\t'no_access',
\t\t'You do not have access.',
\t\tarray(
\t\t\t'status' => 403,
\t\t\t'title'  => 'Permission Error',
\t\t\t'error'  => array( 'debug' => 'extra' ),
\t\t)
\t);
\t$wp_error->add( 'second_error', 'Second failure.', array( 'status' => 409 ) );
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:process-input-wp-error',
\t\t'_wp_die_process_input',
\t\t_wp_die_process_input( $wp_error, '', array() )
\t);

\t$GLOBALS['wphx_303_04_die_events'] = array();
\t$default_handler_filter = function ( $callback ) {
\t\treturn 'wphx_303_04_recording_die_handler';
\t};
\tadd_filter( 'wp_die_handler', $default_handler_filter );
\twp_die( 'Default broken.', 'Default Title', array( 'response' => 418, 'exit' => false ) );
\tremove_filter( 'wp_die_handler', $default_handler_filter );
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:handler-selection-default',
\t\t'wp_die',
\t\t$GLOBALS['wphx_303_04_die_events']
\t);

\t$GLOBALS['wphx_303_04_die_events'] = array();
\t$ajax_doing_filter = function () {
\t\treturn true;
\t};
\t$ajax_handler_filter = function ( $callback ) {
\t\treturn 'wphx_303_04_recording_die_handler';
\t};
\tadd_filter( 'wp_doing_ajax', $ajax_doing_filter );
\tadd_filter( 'wp_die_ajax_handler', $ajax_handler_filter );
\twp_die( 'Ajax broken.', '', array( 'response' => 409, 'exit' => false ) );
\tremove_filter( 'wp_die_ajax_handler', $ajax_handler_filter );
\tremove_filter( 'wp_doing_ajax', $ajax_doing_filter );
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:handler-selection-ajax',
\t\t'wp_die',
\t\t$GLOBALS['wphx_303_04_die_events']
\t);

\t$GLOBALS['wphx_303_04_die_events'] = array();
\t$json_handler_filter = function ( $callback ) {
\t\treturn 'wphx_303_04_recording_die_handler';
\t};
\t$_SERVER['HTTP_ACCEPT'] = 'application/json';
\tadd_filter( 'wp_die_json_handler', $json_handler_filter );
\twp_die( 'JSON broken.', '', array( 'response' => 500, 'exit' => false ) );
\tremove_filter( 'wp_die_json_handler', $json_handler_filter );
\tunset( $_SERVER['HTTP_ACCEPT'] );
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:handler-selection-json',
\t\t'wp_die',
\t\t$GLOBALS['wphx_303_04_die_events']
\t);

\t$default_output = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_default_wp_die_handler(
\t\t\t\tnew WP_Error(
\t\t\t\t\t'primary',
\t\t\t\t\t'Primary failure.',
\t\t\t\t\tarray(
\t\t\t\t\t\t'status' => 451,
\t\t\t\t\t\t'title'  => 'Primary Title',
\t\t\t\t\t)
\t\t\t\t),
\t\t\t\t'',
\t\t\t\tarray( 'exit' => false )
\t\t\t);
\t\t}
\t);
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:default-handler-output',
\t\t'_default_wp_die_handler',
\t\t$default_output
\t);

\t$json_output = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_json_wp_die_handler(
\t\t\t\tnew WP_Error(
\t\t\t\t\t'json_primary',
\t\t\t\t\t'JSON failure.',
\t\t\t\t\tarray(
\t\t\t\t\t\t'status' => 422,
\t\t\t\t\t\t'error'  => array( 'detail' => 'invalid' ),
\t\t\t\t\t)
\t\t\t\t),
\t\t\t\t'',
\t\t\t\tarray( 'exit' => false )
\t\t\t);
\t\t}
\t);
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:json-handler-output',
\t\t'_json_wp_die_handler',
\t\t$json_output
\t);

\t$ajax_output = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_ajax_wp_die_handler( array( 'not scalar' ), '', array( 'exit' => false, 'response' => null ) );
\t\t}
\t);
\t$scalar_output = wphx_303_04_capture_native(
\t\tfunction () {
\t\t\t_scalar_wp_die_handler( 'Scalar done.', '', array( 'exit' => false ) );
\t\t}
\t);
\t$cases[] = wphx_303_04_case(
\t\t'wp-die:ajax-and-scalar-output',
\t\t'_ajax_wp_die_handler/_scalar_wp_die_handler',
\t\tarray(
\t\t\t'ajax'   => $ajax_output,
\t\t\t'scalar' => $scalar_output,
\t\t)
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'wpDebug'               => WP_DEBUG,
\t'wpDebugDisplay'        => WP_DEBUG_DISPLAY,
\t'coveredFunctionExists' => array(
\t\t'wp_trigger_error'       => function_exists( 'wp_trigger_error' ),
\t\t'_deprecated_function'   => function_exists( '_deprecated_function' ),
\t\t'_deprecated_argument'   => function_exists( '_deprecated_argument' ),
\t\t'_doing_it_wrong'        => function_exists( '_doing_it_wrong' ),
\t\t'wp_die'                 => function_exists( 'wp_die' ),
\t\t'_wp_die_process_input'  => function_exists( '_wp_die_process_input' ),
\t\t'_default_wp_die_handler' => function_exists( '_default_wp_die_handler' ),
\t\t'_ajax_wp_die_handler'   => function_exists( '_ajax_wp_die_handler' ),
\t\t'_json_wp_die_handler'   => function_exists( '_json_wp_die_handler' ),
\t\t'_scalar_wp_die_handler' => function_exists( '_scalar_wp_die_handler' ),
\t),
\t'cases'                 => wphx_303_04_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    wpDebug: result.wpDebug,
    wpDebugDisplay: result.wpDebugDisplay,
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-303-deprecation`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function compactRun(run) {
  const normalized = normalize(run.result);
  return {
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: run.command,
    image: run.image,
    php_version: run.result.phpVersion,
    wp_debug: run.result.wpDebug,
    wp_debug_display: run.result.wpDebugDisplay,
    covered_function_count: Object.values(run.result.coveredFunctionExists).filter(Boolean).length,
    case_count: run.result.cases.length,
    case_ids: run.result.cases.map((entry) => entry.id),
    normalized_sha256: sha256(JSON.stringify(normalized))
  };
}

function compactComparison(comparison) {
  return {
    id: comparison.id,
    matches: comparison.matches,
    oracle_sha256: sha256(JSON.stringify(comparison.oracle)),
    candidate_sha256: sha256(JSON.stringify(comparison.candidate)),
    case_count: comparison.oracle.cases.length
  };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/deprecation-error-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "deprecation and native error signaling fixture harness",
      area: "wp-includes/functions.php",
      public_contract:
        "WordPress 7.0 deprecation helpers, wp_trigger_error(), wp_die(), and selected wp_die handlers keep native PHP warning, deprecation, exception, output, and hook behavior while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-deprecation-error-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT_ROOT, OUT, OWNERSHIP, RECEIPT],
    native_boundaries: [
      {
        id: "php-user-error-engine",
        reason:
          "E_USER_WARNING, E_USER_NOTICE, and E_USER_DEPRECATED are PHP engine-level trigger_error() events; fixtures record type and message through a native error handler."
      },
      {
        id: "wp-exception-user-error",
        reason: "WordPress maps E_USER_ERROR in wp_trigger_error() to the native WP_Exception class."
      },
      {
        id: "wp-die-output-headers-exit",
        reason: "wp_die handlers combine PHP output buffering, header/status calls, and optional die()/exit behavior."
      },
      {
        id: "plugin-hooks-and-filters",
        reason:
          "Deprecation, _doing_it_wrong(), wp_trigger_error(), and wp_die handler selection all expose native PHP callback hooks and filters."
      }
    ],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-303-deprecation",
        "npm run wp:core:wphx-303-deprecation:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-303-04-deprecation-error-fixture", "receipt:wphx-303-01-error-format-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "This slice intentionally records an external-oracle fixture before promoting any error/deprecation implementation to Haxe. A later candidate should isolate message construction and branch decisions while keeping PHP-native signaling, headers, and die/exit behavior behind explicit boundaries."
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
  schema: "wphx.wp-core-deprecation-error-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-deprecation-error-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domain: surface.domains.find((domain) => domain.id === "error_deprecation")?.label ?? "error/deprecation",
    covered_symbols: COVERED_SYMBOLS,
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    },
    cases: FIXTURE_CASES,
    native_boundaries: ownershipManifest("pending", upstreamDigest).native_boundaries
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
  runs: runs.map(compactRun),
  comparisons: comparisons.map(compactComparison),
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-303",
      detail:
        "The candidate side is a copied WordPress oracle source tree. A later Haxe candidate can own pure message/branch decisions while preserving PHP-native trigger_error(), WP_Exception, hooks, headers, and exit semantics."
    },
    {
      id: "full-wp-die-context-matrix",
      owner: "WPHX-303/WPHX-301",
      detail:
        "This fixture covers default, Ajax, JSON, direct default/json/ajax/scalar handlers, and WP_Error input processing. XML-RPC, XML feed, REST JSONP, admin-head, and real HTTP header assertions remain broader bootstrap/context coverage."
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
  id: "receipt:wphx-303-04-deprecation-error-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "deprecation and native error signaling fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for native PHP signaling boundaries"
    },
    {
      path: "tools/wp-core/run-deprecation-error-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-303-deprecation",
    "npm run wp:core:wphx-303-deprecation:check",
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
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
