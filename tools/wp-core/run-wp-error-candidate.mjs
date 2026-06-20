#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.7.3",
  external_ref: "WPHX-303.03",
  title: "Build WP_Error parity fixture and typed source candidate"
};
const HXML = "fixtures/wp-core/wp-error-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-303-03";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-303-03-wp-error-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-303-03-wp-error-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-303-03-wp-error-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-303-01-error-format-surface.v1.json";
const RECORDED_AT = "2026-06-21T00:10:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/load.php",
  "src/wp-includes/class-wp-error.php"
];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/error/WpErrorRuntime.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpErrorCandidateEntry.hx"
];

const COVERED_SYMBOLS = [
  "WP_Error",
  "WP_Error::__construct",
  "WP_Error::get_error_codes",
  "WP_Error::get_error_code",
  "WP_Error::get_error_messages",
  "WP_Error::get_error_message",
  "WP_Error::get_error_data",
  "WP_Error::has_errors",
  "WP_Error::add",
  "WP_Error::add_data",
  "WP_Error::get_all_error_data",
  "WP_Error::remove",
  "WP_Error::merge_from",
  "WP_Error::export_to",
  "WP_Error::copy_errors",
  "is_wp_error"
];

const FIXTURE_CASES = [
  { id: "constructor:empty", symbol: "WP_Error::__construct", focus: "empty constructor keeps public arrays empty" },
  { id: "constructor:code-message-data", symbol: "WP_Error::__construct", focus: "constructor adds code/message/data through add()" },
  { id: "constructor:empty-code-ignored", symbol: "WP_Error::__construct", focus: "empty constructor code ignores message and data" },
  { id: "add:ordering-and-messages", symbol: "WP_Error::add", focus: "code order, message order, and first-code lookup" },
  { id: "add:empty-and-int-codes", symbol: "WP_Error::add", focus: "empty string and integer code handling" },
  { id: "add:wp-error-added-action", symbol: "WP_Error::add", focus: "native wp_error_added action arguments" },
  { id: "data:history-and-public-mutation", symbol: "WP_Error::add_data", focus: "additional_data history plus public error_data mutation" },
  { id: "remove:clears-code-data-history", symbol: "WP_Error::remove", focus: "remove clears errors, latest data, and additional history" },
  { id: "merge:copy-other-into-instance", symbol: "WP_Error::merge_from", focus: "merge_from copies messages and full data history" },
  { id: "export:copy-instance-into-other", symbol: "WP_Error::export_to", focus: "export_to copies messages and full data history" },
  { id: "public-properties:manual-mutation", symbol: "WP_Error::$errors", focus: "public errors/error_data arrays remain observable and mutable" },
  { id: "is-wp-error:action-boundary", symbol: "is_wp_error", focus: "instanceof result and native is_wp_error_instance action" },
  { id: "reflection:object-shape", symbol: "WP_Error", focus: "class attribute, property visibility, and method signature shape" }
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

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_303_03_bootstrap_haxe' ) ) {
\tfunction wphx_303_03_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_303_03_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_303_03_lib );
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
wphx_303_03_bootstrap_haxe();`;
}

function candidateClassSource() {
  return `<?php
/**
 * WPHX-303.03 WP_Error Haxe parity candidate shell.
 *
 * The public PHP class shape intentionally remains native and reflection-visible
 * while typed Haxe runtime helpers own bounded behavior decisions.
 */

${haxeBootstrapBlock()}

#[AllowDynamicProperties]
class WP_Error {
\tpublic $errors = array();
\tpublic $error_data = array();
\tprotected $additional_data = array();

\tpublic function __construct( $code = '', $message = '', $data = '' ) {
\t\tif ( ! \\wphx\\wp\\error\\WpErrorRuntime::shouldConstruct( empty( $code ) ) ) {
\t\t\treturn;
\t\t}

\t\t$this->add( $code, $message, $data );
\t}

\tpublic function get_error_codes() {
\t\tif ( ! $this->has_errors() ) {
\t\t\treturn array();
\t\t}

\t\treturn array_keys( $this->errors );
\t}

\tpublic function get_error_code() {
\t\t$codes = $this->get_error_codes();

\t\tif ( empty( $codes ) ) {
\t\t\treturn '';
\t\t}

\t\treturn $codes[0];
\t}

\tpublic function get_error_messages( $code = '' ) {
\t\tif ( empty( $code ) ) {
\t\t\t$all_messages = array();
\t\t\tforeach ( (array) $this->errors as $messages ) {
\t\t\t\t$all_messages = array_merge( $all_messages, $messages );
\t\t\t}

\t\t\treturn $all_messages;
\t\t}

\t\tif ( isset( $this->errors[ $code ] ) ) {
\t\t\treturn $this->errors[ $code ];
\t\t}

\t\treturn array();
\t}

\tpublic function get_error_message( $code = '' ) {
\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldUseDefaultCode( empty( $code ) ) ) {
\t\t\t$code = $this->get_error_code();
\t\t}
\t\t$messages = $this->get_error_messages( $code );
\t\tif ( empty( $messages ) ) {
\t\t\treturn '';
\t\t}
\t\treturn $messages[0];
\t}

\tpublic function get_error_data( $code = '' ) {
\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldUseDefaultCode( empty( $code ) ) ) {
\t\t\t$code = $this->get_error_code();
\t\t}

\t\tif ( isset( $this->error_data[ $code ] ) ) {
\t\t\treturn $this->error_data[ $code ];
\t\t}
\t}

\tpublic function has_errors() {
\t\treturn \\wphx\\wp\\error\\WpErrorRuntime::hasErrors( count( $this->errors ) );
\t}

\tpublic function add( $code, $message, $data = '' ) {
\t\t$this->errors[ $code ][] = $message;

\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldStoreData( empty( $data ) ) ) {
\t\t\t$this->add_data( $data, $code );
\t\t}

\t\tdo_action( 'wp_error_added', $code, $message, $data, $this );
\t}

\tpublic function add_data( $data, $code = '' ) {
\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldUseDefaultCode( empty( $code ) ) ) {
\t\t\t$code = $this->get_error_code();
\t\t}

\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldCarryPreviousData( isset( $this->error_data[ $code ] ) ) ) {
\t\t\t$this->additional_data[ $code ][] = $this->error_data[ $code ];
\t\t}

\t\t$this->error_data[ $code ] = $data;
\t}

\tpublic function get_all_error_data( $code = '' ) {
\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldUseDefaultCode( empty( $code ) ) ) {
\t\t\t$code = $this->get_error_code();
\t\t}

\t\t$data = array();

\t\tif ( isset( $this->additional_data[ $code ] ) ) {
\t\t\t$data = $this->additional_data[ $code ];
\t\t}

\t\tif ( \\wphx\\wp\\error\\WpErrorRuntime::shouldAppendCurrentData( isset( $this->error_data[ $code ] ) ) ) {
\t\t\t$data[] = $this->error_data[ $code ];
\t\t}

\t\treturn $data;
\t}

\tpublic function remove( $code ) {
\t\tunset( $this->errors[ $code ] );
\t\tunset( $this->error_data[ $code ] );
\t\tunset( $this->additional_data[ $code ] );
\t}

\tpublic function merge_from( WP_Error $error ) {
\t\tstatic::copy_errors( $error, $this );
\t}

\tpublic function export_to( WP_Error $error ) {
\t\tstatic::copy_errors( $this, $error );
\t}

\tprotected static function copy_errors( WP_Error $from, WP_Error $to ) {
\t\tforeach ( $from->get_error_codes() as $code ) {
\t\t\tforeach ( $from->get_error_messages( $code ) as $error_message ) {
\t\t\t\t$to->add( $code, $error_message );
\t\t\t}

\t\t\tforeach ( $from->get_all_error_data( $code ) as $data ) {
\t\t\t\t$to->add_data( $data, $code );
\t\t\t}
\t\t}
\t}
}
`;
}

function writeCandidateClass() {
  const path = `${CANDIDATE_ROOT}/wp-includes/class-wp-error.php`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, candidateClassSource());
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

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';

function wphx_303_03_scalar( $value ) {
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
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'  => 'object',
\t\t\t'class' => get_class( $value ),
\t\t);
\t}
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => (string) $value,
\t\t'hex'    => bin2hex( (string) $value ),
\t\t'bytes'  => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_303_03_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_303_03_scalar( $key ),
\t\t\t\t'value' => wphx_303_03_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\treturn wphx_303_03_scalar( $value );
}

function wphx_303_03_additional_data( WP_Error $error ) {
\t$reader = function () {
\t\treturn $this->additional_data;
\t};
\treturn $reader->call( $error );
}

function wphx_303_03_error_snapshot( WP_Error $error ) {
\t$first_code = $error->get_error_code();
\treturn array(
\t\t'class'           => get_class( $error ),
\t\t'instanceOf'      => $error instanceof WP_Error,
\t\t'hasErrors'       => $error->has_errors(),
\t\t'errors'          => $error->errors,
\t\t'errorData'       => $error->error_data,
\t\t'additionalData'  => wphx_303_03_additional_data( $error ),
\t\t'codes'           => $error->get_error_codes(),
\t\t'firstCode'       => $first_code,
\t\t'allMessages'     => $error->get_error_messages(),
\t\t'firstMessage'    => $error->get_error_message(),
\t\t'defaultData'     => $error->get_error_data(),
\t\t'allDataFirstCode' => $error->get_all_error_data( $first_code ),
\t);
}

function wphx_303_03_method_shape( ReflectionMethod $method ) {
\t$params = array();
\tforeach ( $method->getParameters() as $param ) {
\t\t$params[] = array(
\t\t\t'name'             => $param->getName(),
\t\t\t'optional'         => $param->isOptional(),
\t\t\t'defaultAvailable' => $param->isDefaultValueAvailable(),
\t\t\t'default'          => $param->isDefaultValueAvailable() ? $param->getDefaultValue() : null,
\t\t\t'hasType'          => $param->hasType(),
\t\t);
\t}
\treturn array(
\t\t'name'       => $method->getName(),
\t\t'public'     => $method->isPublic(),
\t\t'protected'  => $method->isProtected(),
\t\t'static'     => $method->isStatic(),
\t\t'paramCount' => $method->getNumberOfParameters(),
\t\t'params'     => $params,
\t);
}

function wphx_303_03_reflection_shape() {
\t$class = new ReflectionClass( 'WP_Error' );
\t$properties = array();
\tforeach ( array( 'errors', 'error_data', 'additional_data' ) as $name ) {
\t\t$property = $class->getProperty( $name );
\t\t$properties[ $name ] = array(
\t\t\t'public'    => $property->isPublic(),
\t\t\t'protected' => $property->isProtected(),
\t\t\t'static'    => $property->isStatic(),
\t\t);
\t}
\t$methods = array();
\tforeach (
\t\tarray(
\t\t\t'__construct',
\t\t\t'get_error_codes',
\t\t\t'get_error_code',
\t\t\t'get_error_messages',
\t\t\t'get_error_message',
\t\t\t'get_error_data',
\t\t\t'has_errors',
\t\t\t'add',
\t\t\t'add_data',
\t\t\t'get_all_error_data',
\t\t\t'remove',
\t\t\t'merge_from',
\t\t\t'export_to',
\t\t\t'copy_errors',
\t\t) as $name
\t) {
\t\t$methods[ $name ] = wphx_303_03_method_shape( $class->getMethod( $name ) );
\t}
\treturn array(
\t\t'class'                  => $class->getName(),
\t\t'allowDynamicProperties' => count( $class->getAttributes( 'AllowDynamicProperties' ) ) > 0,
\t\t'properties'             => $properties,
\t\t'methods'                => $methods,
\t);
}

function wphx_303_03_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_303_03_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_303_03_run_cases() {
\t$cases = array();

\t$cases[] = wphx_303_03_case( 'constructor:empty', 'WP_Error::__construct', wphx_303_03_error_snapshot( new WP_Error() ) );
\t$cases[] = wphx_303_03_case( 'constructor:code-message-data', 'WP_Error::__construct', wphx_303_03_error_snapshot( new WP_Error( 'code', 'message', array( 'data-key' => 'data-value' ) ) ) );
\t$cases[] = wphx_303_03_case( 'constructor:empty-code-ignored', 'WP_Error::__construct', wphx_303_03_error_snapshot( new WP_Error( '', 'ignored', 'data' ) ) );

\t$ordered = new WP_Error();
\t$ordered->add( 'code', 'message', 'data' );
\t$ordered->add( 'code2', 'message2', 'data2' );
\t$ordered->add( 'code', 'message3', 'data3' );
\t$cases[] = wphx_303_03_case(
\t\t'add:ordering-and-messages',
\t\t'WP_Error::add',
\t\tarray(
\t\t\t'snapshot'       => wphx_303_03_error_snapshot( $ordered ),
\t\t\t'codeMessages'   => $ordered->get_error_messages( 'code' ),
\t\t\t'code2Message'   => $ordered->get_error_message( 'code2' ),
\t\t\t'codeData'       => $ordered->get_error_data( 'code' ),
\t\t\t'codeAllData'    => $ordered->get_all_error_data( 'code' ),
\t\t)
\t);

\t$empty_and_int = new WP_Error();
\t$empty_and_int->add( '', '', 'empty-code-data' );
\t$empty_and_int->add( 7, 'int-message', 'int-data' );
\t$zero_constructor = new WP_Error( 0, 'ignored', 'ignored-data' );
\t$cases[] = wphx_303_03_case(
\t\t'add:empty-and-int-codes',
\t\t'WP_Error::add',
\t\tarray(
\t\t\t'added'           => wphx_303_03_error_snapshot( $empty_and_int ),
\t\t\t'zeroConstructor' => wphx_303_03_error_snapshot( $zero_constructor ),
\t\t\t'intData'         => $empty_and_int->get_error_data( 7 ),
\t\t)
\t);

\t$wp_error_added_events = array();
\t$wp_error_added = function ( $code, $message, $data, $wp_error ) use ( &$wp_error_added_events ) {
\t\t$wp_error_added_events[] = array(
\t\t\t'code'        => $code,
\t\t\t'message'     => $message,
\t\t\t'data'        => $data,
\t\t\t'isWpError'   => $wp_error instanceof WP_Error,
\t\t\t'firstCode'   => $wp_error->get_error_code(),
\t\t\t'messageCount' => count( $wp_error->get_error_messages( $code ) ),
\t\t);
\t};
\tadd_action( 'wp_error_added', $wp_error_added, 10, 4 );
\t$hooked = new WP_Error( 'hooked', 'hook message', 'hook data' );
\t$hooked->add( 'hooked', 'hook message 2', 'hook data 2' );
\tremove_action( 'wp_error_added', $wp_error_added, 10 );
\t$cases[] = wphx_303_03_case(
\t\t'add:wp-error-added-action',
\t\t'WP_Error::add',
\t\twphx_303_03_error_snapshot( $hooked ),
\t\tarray( 'events' => $wp_error_added_events )
\t);

\t$history = new WP_Error();
\t$history->add_data( 'data1', 'code' );
\t$history->add_data( 'data2', 'code' );
\t$history->error_data['code'] = 'dataX';
\t$cases[] = wphx_303_03_case(
\t\t'data:history-and-public-mutation',
\t\t'WP_Error::add_data',
\t\tarray(
\t\t\t'snapshot' => wphx_303_03_error_snapshot( $history ),
\t\t\t'codeData' => $history->get_error_data( 'code' ),
\t\t\t'allData'  => $history->get_all_error_data( 'code' ),
\t\t)
\t);

\t$removed = new WP_Error();
\t$removed->add( 'code', 'message', 'data' );
\t$removed->add( 'code', 'message2', 'data2' );
\t$removed->remove( 'code' );
\t$cases[] = wphx_303_03_case(
\t\t'remove:clears-code-data-history',
\t\t'WP_Error::remove',
\t\tarray(
\t\t\t'snapshot' => wphx_303_03_error_snapshot( $removed ),
\t\t\t'codeData' => $removed->get_error_data( 'code' ),
\t\t\t'allData'  => $removed->get_all_error_data( 'code' ),
\t\t)
\t);

\t$merge_target = new WP_Error();
\t$merge_target->add( 'code1', 'message1', 'data1' );
\t$merge_source = new WP_Error( 'code1', 'message2', 'data2' );
\t$merge_source->add( 'code2', 'message3' );
\t$merge_target->merge_from( $merge_source );
\t$cases[] = wphx_303_03_case( 'merge:copy-other-into-instance', 'WP_Error::merge_from', wphx_303_03_error_snapshot( $merge_target ) );

\t$export_target = new WP_Error();
\t$export_target->add( 'code1', 'message1', 'data1' );
\t$export_source = new WP_Error();
\t$export_source->add( 'code1', 'message2', 'data2' );
\t$export_source->add( 'code2', 'message3' );
\t$export_source->export_to( $export_target );
\t$cases[] = wphx_303_03_case( 'export:copy-instance-into-other', 'WP_Error::export_to', wphx_303_03_error_snapshot( $export_target ) );

\t$manual = new WP_Error();
\t$manual->errors['manual'][] = 'manual-message';
\t$manual->error_data['manual'] = array( 'manual' => true );
\t$cases[] = wphx_303_03_case( 'public-properties:manual-mutation', 'WP_Error::$errors', wphx_303_03_error_snapshot( $manual ) );

\t$is_wp_error_events = array();
\t$is_wp_error_action = function ( $thing ) use ( &$is_wp_error_events ) {
\t\t$is_wp_error_events[] = array(
\t\t\t'class'     => get_class( $thing ),
\t\t\t'firstCode' => $thing->get_error_code(),
\t\t);
\t};
\tadd_action( 'is_wp_error_instance', $is_wp_error_action, 10, 1 );
\t$is_wp_error_result = array(
\t\t'wpError'  => is_wp_error( $hooked ),
\t\t'stdClass' => is_wp_error( new stdClass() ),
\t\t'string'   => is_wp_error( 'not an error' ),
\t);
\tremove_action( 'is_wp_error_instance', $is_wp_error_action, 10 );
\t$cases[] = wphx_303_03_case(
\t\t'is-wp-error:action-boundary',
\t\t'is_wp_error',
\t\t$is_wp_error_result,
\t\tarray( 'events' => $is_wp_error_events )
\t);

\t$cases[] = wphx_303_03_case( 'reflection:object-shape', 'WP_Error', wphx_303_03_reflection_shape() );

\treturn $cases;
}

$snapshot = array(
\t'mode'                 => $mode,
\t'phpVersion'           => PHP_VERSION,
\t'classExists'           => class_exists( 'WP_Error' ),
\t'isWpErrorExists'       => function_exists( 'is_wp_error' ),
\t'coveredMethodCount'    => count( get_class_methods( 'WP_Error' ) ),
\t'candidateClassOrigin'  => ( new ReflectionClass( 'WP_Error' ) )->getFileName(),
\t'cases'                => wphx_303_03_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    classExists: result.classExists,
    isWpErrorExists: result.isWpErrorExists,
    coveredMethodCount: result.coveredMethodCount,
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-303-wp-error`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wp-error-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "class",
      name: "WP_Error Haxe parity candidate",
      area: "wp-includes/class-wp-error.php",
      public_contract:
        "WP_Error remains a reflection-visible PHP class with public errors/error_data arrays and protected additional_data while selected behavior decisions delegate to typed Haxe runtime helpers."
    },
    ownership_state: "haxe_parity_candidate",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: [...HAXE_SOURCES, "tools/wp-core/run-wp-error-candidate.mjs", OUT, RECEIPT],
    generated_paths: [OUT_ROOT, OUT, OWNERSHIP, RECEIPT],
    bridge: {
      kind: "generated_shell",
      reason:
        "WordPress plugins inspect and mutate WP_Error public properties and rely on instanceof/reflection; the candidate keeps the PHP object shell while Haxe owns bounded runtime decisions.",
      bounded_by: [
        "generated candidate wp-includes/class-wp-error.php shell",
        "WPHX-303.03 oracle comparison receipt",
        "reflection:object-shape fixture",
        "public-properties:manual-mutation fixture"
      ]
    },
    removal_gate: {
      condition:
        "Promote to verified owned distribution only after class emission proves PHP object shape, protected property visibility, native action timing, source maps, and plugin compatibility at distribution surface.",
      owner_issue: "WPHX-303",
      target_state: "verified_haxe_owned"
    },
    smell_fixes: [
      {
        description:
          "Isolated WP_Error state-transition decisions into named typed Haxe helpers instead of duplicating ad hoc empty/count checks across generated methods.",
        compatibility_evidence: [
          "constructor:empty",
          "add:ordering-and-messages",
          "data:history-and-public-mutation",
          "remove:clears-code-data-history",
          "reflection:object-shape"
        ],
        behavior_policy: "no_observable_change"
      }
    ],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-303-wp-error",
        "npm run wp:core:wphx-303-wp-error:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-303-03-wp-error-candidate", "receipt:wphx-303-01-error-format-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "is_wp_error() remains a native PHP boundary in load.php for instanceof semantics and the is_wp_error_instance action. The WP_Error class shell also keeps native PHP arrays because public property mutation is part of the compatibility surface."
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
command("haxe", [HXML]);
writeCandidateClass();
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

function compactRun(run) {
  const normalized = normalize(run.result);
  return {
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: run.command,
    image: run.image,
    php_version: run.result.phpVersion,
    class_exists: run.result.classExists,
    is_wp_error_exists: run.result.isWpErrorExists,
    covered_method_count: run.result.coveredMethodCount,
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

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const manifest = {
  schema: "wphx.wp-core-wp-error-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wp-error-candidate.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "haxe_generated_wp_error_shell",
    source_domain: "WP_Error and is_wp_error",
    covered_symbols: COVERED_SYMBOLS,
    hxml: HXML,
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    },
    cases: FIXTURE_CASES,
    public_abi_policy: {
      generated_php_shell_keeps_wp_error_class: true,
      public_properties_preserved: ["errors", "error_data"],
      protected_properties_preserved: ["additional_data"],
      allow_dynamic_properties_attribute_preserved: true,
      haxe_core_uses_typed_helpers_without_dynamic: true,
      raw_php_syntax_code_used_in_haxe: false
    },
    native_boundaries: [
      {
        id: "wp-error-public-object-shape",
        reason: "WP_Error public properties and protected additional_data are observable PHP object state; the candidate keeps them in the generated PHP shell."
      },
      {
        id: "wp-error-action-hooks",
        reason: "WP_Error::add() fires do_action('wp_error_added', ...), which remains native PHP callback dispatch."
      },
      {
        id: "is-wp-error-instanceof-action",
        reason: "is_wp_error() depends on PHP instanceof semantics and fires do_action('is_wp_error_instance', ...), so it remains a native load.php boundary for this slice."
      }
    ]
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    generated_haxe_files: filesUnder(HAXE_OUT),
    transformed_candidate_class: inputRecord(`${CANDIDATE_ROOT}/wp-includes/class-wp-error.php`)
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
      id: "is-wp-error-native-boundary",
      owner: "WPHX-303",
      detail: "is_wp_error remains in native load.php until load-order and global helper emission are owned with the broader distribution surface."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-303",
      detail: "The fixture covers constructor, add/remove, data history, public properties, merge/export, reflection, and is_wp_error seed cases. Full upstream PHPUnit parity remains a domain-level closure requirement."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_generated_wp_error_shell",
    covered_symbols: COVERED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length,
    oracle_behavior_matches_haxe_candidate: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-303-03-wp-error-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WP_Error Haxe candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "Haxe parity candidate ownership manifest"
    },
    {
      path: "tools/wp-core/run-wp-error-candidate.mjs",
      role: "candidate generator and oracle comparator"
    },
    {
      path: "src/wphx/wp/error/WpErrorRuntime.hx",
      role: "typed Haxe WP_Error runtime decision helper"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-303-wp-error",
    "npm run wp:core:wphx-303-wp-error:check",
    "npm run haxe:escape-hatches:check",
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
