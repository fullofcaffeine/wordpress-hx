#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compileWphxRequestShell, installWphxRequestShell, requestShellShape, REQUEST_SHELL_HAXE_SOURCES, REQUIRED_REQUEST_SHELL_FEATURES, WPHX_REQUEST_SHELL_HXML, wphxRequestShellPaths } from "./wphx-request-shell-support.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.40",
  external_ref: "WPHX-312.92",
  title: "WPHX-312.92 - Add live or recorded HTTP transport parity gate"
};
const RECORDED_AT = "2026-07-02T23:00:00Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wphx-312-http-transport-parity-gate.mjs";
const HXML = "fixtures/wp-core/http-request-transport-parity-gate.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-92";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-92-http-transport-parity-gate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-92-http-transport-parity-gate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-92-http-transport-parity-gate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_HELPER_FIXTURE = "manifests/wp-core/wphx-312-41-wp-http-helper-oracle-fixture.v1.json";
const HTTP_PARSER_FIXTURE = "manifests/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";
const HTTP_API_FIXTURE = "manifests/wp-core/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";
const HTTP_TRANSPORT_FIXTURE = "manifests/wp-core/wphx-312-45-http-transport-callback-test-oracle-fixture.v1.json";
const REQUEST_ORCHESTRATION_FIXTURE = "manifests/wp-core/wphx-312-46-wp-http-request-orchestration-oracle-fixture.v1.json";
const REQUEST_PROXY_SAFETY_FIXTURE = "manifests/wp-core/wphx-312-49-wp-http-request-proxy-safety-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/class-wp-http-cookie.php",
  "src/wp-includes/class-wp-http-requests-response.php",
  "src/wp-includes/class-wp-http-requests-hooks.php",
  "src/wp-includes/class-wp-http-proxy.php",
  "src/wp-includes/class-wp-http.php"
];
const COVERED_SYMBOLS = [
  "WP_Http::request",
  "WP_Http::block_request",
  "WP_HTTP_Requests_Hooks",
  "WP_HTTP_Requests_Response",
  "WP_HTTP_Proxy",
  "WP_Http_Cookie",
  "WpOrg\\Requests\\Requests::request",
  "WpOrg\\Requests\\Hooks::register",
  "WpOrg\\Requests\\Proxy\\Http",
  "pre_http_request",
  "http_request_args",
  "http_request_timeout",
  "http_request_redirection_count",
  "http_request_version",
  "http_headers_useragent",
  "http_request_reject_unsafe_urls",
  "https_ssl_verify",
  "http_response",
  "http_api_debug",
  "wp_kses_bad_protocol",
  "wp_http_validate_url",
  "wp_is_writable",
  "mbstring_binary_safe_encoding",
  "reset_mbstring_encoding",
  "WP_PROXY_HOST",
  "WP_PROXY_PORT",
  "WP_PROXY_USERNAME",
  "WP_PROXY_PASSWORD"
];
const HAXE_SOURCES = [
  HXML,
  WPHX_REQUEST_SHELL_HXML,
  ...REQUEST_SHELL_HAXE_SOURCES,
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpRequestTransportParityGateEntry.hx"
];
const CASES = [
  { id: "wp-http-request:head-defaults", focus: "request defaults, filter defaults, HEAD redirection override, hooks, SSL verify path, and response filter" },
  { id: "wp-http-request:preempt", focus: "pre_http_request short-circuits before Requests execution" },
  { id: "wp-http-request:invalid-and-blocked", focus: "invalid URL and external-blocked URL return WP_Error and emit debug actions" },
  { id: "wp-http-request:streaming", focus: "stream filename default, blocking force, writable directory validation, and filename option handoff" },
  { id: "wp-http-request:headers-cookies-ssl-post", focus: "header string parsing, cookie normalization, sslverify=false, body data_format, redirects, and max_bytes" },
  { id: "wp-http-request:proxy-tls-handoff", focus: "proxy constants, proxy authentication, and SSL verification options are handed to Requests options" },
  { id: "wp-http-request:exception-and-nonblocking", focus: "Requests exception conversion and nonblocking response shape after dispatch" }
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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
namespace WpOrg\\Requests {
\tclass Autoload {
\t\tpublic static function register() {}
\t}

\tclass Hooks {
\t\tpublic $registered = array();

\t\tpublic function register( $hook, $callback, $priority = 0 ) {
\t\t\t$this->registered[] = array( 'hook' => $hook, 'callback' => is_array( $callback ) ? implode( '::', $callback ) : 'callable', 'priority' => $priority );
\t\t}

\t\tpublic function dispatch( $hook, $parameters = array() ) {
\t\t\treturn false;
\t\t}
\t}

\tclass Exception extends \\Exception {
\t\tpublic $type;

\t\tpublic function __construct( $message = '', $type = '' ) {
\t\t\tparent::__construct( $message );
\t\t\t$this->type = $type;
\t\t}
\t}

\tclass Requests {
\t\tpublic const GET = 'GET';

\t\tpublic static function set_certificate_path( $path ) {}

\t\tpublic static function request( $url, $headers = array(), $data = null, $type = 'GET', $options = array() ) {
\t\t\t$GLOBALS['wphx_requests_calls'][] = \\wphx_summarize_requests_call( $url, $headers, $data, $type, $options );
\t\t\tif ( ! empty( $GLOBALS['wphx_throw_requests_exception'] ) ) {
\t\t\t\tthrow new Exception( 'fixture transport failure', 'fixture.transport' );
\t\t\t}
\t\t\t$response = new Response();
\t\t\t$response->status_code = $GLOBALS['wphx_response_status'] ?? 201;
\t\t\t$response->body = $GLOBALS['wphx_response_body'] ?? 'fixture body';
\t\t\t$response->headers = new Response\\Headers( array( 'X-Fixture' => array( 'yes' ) ) );
\t\t\t$response->cookies = array(
\t\t\t\t(object) array(
\t\t\t\t\t'name' => 'server',
\t\t\t\t\t'value' => 'cookie%20value',
\t\t\t\t\t'attributes' => array( 'path' => '/', 'domain' => 'example.test' ),
\t\t\t\t\t'flags' => array( 'host-only' => false ),
\t\t\t\t),
\t\t\t);
\t\t\treturn $response;
\t\t}
\t}

\tclass Response {
\t\tpublic $headers;
\t\tpublic $cookies = array();
\t\tpublic $body = '';
\t\tpublic $status_code = 200;

\t\tpublic function __construct() {
\t\t\t$this->headers = new Response\\Headers();
\t\t}
\t}

\tclass Cookie {
\t\tpublic $name;
\t\tpublic $value;
\t\tpublic $attributes;
\t\tpublic $flags;

\t\tpublic function __construct( $name, $value, $attributes = array(), $flags = array() ) {
\t\t\t$this->name       = $name;
\t\t\t$this->value      = $value;
\t\t\t$this->attributes = $attributes;
\t\t\t$this->flags      = $flags;
\t\t}
\t}
}

namespace WpOrg\\Requests\\Response {
\tclass Headers implements \\ArrayAccess {
\t\tprivate $headers = array();

\t\tpublic function __construct( $headers = array() ) {
\t\t\tforeach ( $headers as $key => $value ) {
\t\t\t\t$this->headers[ strtolower( $key ) ] = is_array( $value ) ? array_values( $value ) : array( $value );
\t\t\t}
\t\t}

\t\tpublic function getAll() {
\t\t\treturn $this->headers;
\t\t}

\t\tpublic function offsetExists( $offset ): bool {
\t\t\treturn isset( $this->headers[ strtolower( $offset ) ] );
\t\t}

\t\tpublic function offsetGet( $offset ): mixed {
\t\t\t$values = $this->headers[ strtolower( $offset ) ] ?? null;
\t\t\treturn is_array( $values ) ? end( $values ) : $values;
\t\t}

\t\tpublic function offsetSet( $offset, $value ): void {
\t\t\t$this->headers[ strtolower( $offset ) ][] = $value;
\t\t}

\t\tpublic function offsetUnset( $offset ): void {
\t\t\tunset( $this->headers[ strtolower( $offset ) ] );
\t\t}
\t}
}

namespace WpOrg\\Requests\\Utility {
\tclass CaseInsensitiveDictionary implements \\ArrayAccess, \\IteratorAggregate, \\JsonSerializable {
\t\tprivate $data = array();

\t\tpublic function offsetExists( $offset ): bool {
\t\t\treturn isset( $this->data[ strtolower( $offset ) ] );
\t\t}

\t\tpublic function offsetGet( $offset ): mixed {
\t\t\treturn $this->data[ strtolower( $offset ) ] ?? null;
\t\t}

\t\tpublic function offsetSet( $offset, $value ): void {
\t\t\t$this->data[ strtolower( $offset ) ] = $value;
\t\t}

\t\tpublic function offsetUnset( $offset ): void {
\t\t\tunset( $this->data[ strtolower( $offset ) ] );
\t\t}

\t\tpublic function getIterator(): \\Traversable {
\t\t\treturn new \\ArrayIterator( $this->data );
\t\t}

\t\tpublic function jsonSerialize(): mixed {
\t\t\treturn $this->data;
\t\t}
\t}
}

namespace WpOrg\\Requests\\Cookie {
\tclass Jar implements \\ArrayAccess, \\IteratorAggregate, \\Countable {
\t\tprivate $cookies = array();

\t\tpublic function offsetExists( $offset ): bool {
\t\t\treturn isset( $this->cookies[ $offset ] );
\t\t}

\t\tpublic function offsetGet( $offset ): mixed {
\t\t\treturn $this->cookies[ $offset ] ?? null;
\t\t}

\t\tpublic function offsetSet( $offset, $value ): void {
\t\t\t$this->cookies[ $offset ] = $value;
\t\t}

\t\tpublic function offsetUnset( $offset ): void {
\t\t\tunset( $this->cookies[ $offset ] );
\t\t}

\t\tpublic function getIterator(): \\Traversable {
\t\t\treturn new \\ArrayIterator( $this->cookies );
\t\t}

\t\tpublic function count(): int {
\t\t\treturn count( $this->cookies );
\t\t}
\t}
}

namespace WpOrg\\Requests\\Proxy {
\tclass Http {
\t\tpublic $address;
\t\tpublic $use_authentication = false;
\t\tpublic $user = '';
\t\tpublic $pass = '';

\t\tpublic function __construct( $address ) {
\t\t\t$this->address = $address;
\t\t}
\t}
}

namespace {
$root = rtrim( $argv[1], '/\\\\' );
$case = $argv[2] ?? '';

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wphx_filter_calls'] = array();
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_requests_calls'] = array();
$GLOBALS['wphx_bad_protocol_calls'] = array();
$GLOBALS['wphx_writable_dirs'] = array( '/tmp/wphx-streams' => true );
$GLOBALS['wphx_case'] = $case;

function __( $text ) {
\treturn $text;
}

function get_bloginfo( $show ) {
\treturn 'version' === $show ? '7.0-fixture' : 'https://home.test';
}

function get_option( $name ) {
\treturn 'siteurl' === $name ? 'https://home.test' : null;
}

function get_status_header_desc( $code ) {
\treturn 201 === $code ? 'Created' : ( 200 === $code ? 'OK' : 'Status ' . $code );
}

function absint( $maybeint ) {
\treturn abs( (int) $maybeint );
}

function wp_parse_args( $args = array(), $defaults = array() ) {
\tif ( is_string( $args ) ) {
\t\tparse_str( $args, $parsed );
\t\t$args = $parsed;
\t}
\tif ( ! is_array( $args ) ) {
\t\t$args = array();
\t}
\treturn array_merge( $defaults, $args );
}

function apply_filters( $hook, $value, ...$args ) {
\t$GLOBALS['wphx_filter_calls'][] = array( 'hook' => $hook, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );
\tif ( 'http_request_timeout' === $hook ) {
\t\treturn 7;
\t}
\tif ( 'http_request_redirection_count' === $hook ) {
\t\treturn 3;
\t}
\tif ( 'http_request_version' === $hook ) {
\t\treturn '1.1';
\t}
\tif ( 'http_headers_useragent' === $hook ) {
\t\treturn 'FixtureAgent/1.0';
\t}
\tif ( 'pre_http_request' === $hook && str_contains( $args[1] ?? '', '/preempt' ) ) {
\t\treturn array(
\t\t\t'headers' => array( 'X-Preempt' => 'yes' ),
\t\t\t'body' => 'preempted',
\t\t\t'response' => array( 'code' => 299, 'message' => 'Preempted' ),
\t\t\t'cookies' => array(),
\t\t\t'filename' => null,
\t\t);
\t}
\tif ( 'http_response' === $hook ) {
\t\t$value['wphx_filtered'] = true;
\t\treturn $value;
\t}
\treturn $value;
}

function do_action( $hook, ...$args ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook, 'args' => wphx_summarize( $args ) );
}

function do_action_ref_array( $hook, $args ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook, 'args' => wphx_summarize( $args ) );
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}

class WP_Error {
\tpublic $errors = array();
\tpublic $error_data = array();

\tpublic function __construct( $code = '', $message = '', $data = '' ) {
\t\tif ( '' !== $code ) {
\t\t\t$this->errors[ $code ][] = $message;
\t\t\tif ( '' !== $data ) {
\t\t\t\t$this->error_data[ $code ] = $data;
\t\t\t}
\t\t}
\t}

\tpublic function get_error_code() {
\t\t$codes = array_keys( $this->errors );
\t\treturn $codes[0] ?? '';
\t}

\tpublic function get_error_message( $code = '' ) {
\t\t$code = $code ?: $this->get_error_code();
\t\treturn $this->errors[ $code ][0] ?? '';
\t}
}

function wp_kses_bad_protocol( $url, $allowed_protocols ) {
\t$GLOBALS['wphx_bad_protocol_calls'][] = array( 'url' => $url, 'allowed' => $allowed_protocols );
\t$scheme = parse_url( $url, PHP_URL_SCHEME );
\treturn in_array( $scheme, $allowed_protocols, true ) ? $url : '';
}

function wp_http_validate_url( $url ) {
\treturn str_starts_with( $url, 'https://valid.example/' ) || str_starts_with( $url, 'https://example.test/' ) ? $url : false;
}

function get_temp_dir() {
\treturn '/tmp/wphx-streams/';
}

function wp_is_writable( $path ) {
\treturn ! empty( $GLOBALS['wphx_writable_dirs'][ $path ] );
}

function mbstring_binary_safe_encoding() {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => 'mbstring_binary_safe_encoding', 'args' => array() );
}

function reset_mbstring_encoding() {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => 'reset_mbstring_encoding', 'args' => array() );
}

function wphx_proxy_summary( $proxy ) {
\tif ( ! is_object( $proxy ) ) {
\t\treturn null;
\t}
\treturn array(
\t\t'class' => get_class( $proxy ),
\t\t'address' => $proxy->address ?? null,
\t\t'use_authentication' => $proxy->use_authentication ?? null,
\t\t'user' => $proxy->user ?? null,
\t\t'pass' => $proxy->pass ?? null,
\t);
}

function wphx_summarize_requests_call( $url, $headers, $data, $type, $options ) {
\t$hooks = $options['hooks'] ?? null;
\t$hook_registrations = is_object( $hooks ) && property_exists( $hooks, 'registered' ) ? $hooks->registered : array();
\t$cookies = array();
\tif ( isset( $options['cookies'] ) ) {
\t\tforeach ( $options['cookies'] as $name => $cookie ) {
\t\t\t$cookies[ $name ] = array( 'name' => $cookie->name, 'value' => $cookie->value, 'attributes' => $cookie->attributes, 'flags' => $cookie->flags );
\t\t}
\t}
\treturn array(
\t\t'url' => $url,
\t\t'headers' => $headers,
\t\t'data' => $data,
\t\t'type' => $type,
\t\t'options' => array(
\t\t\t'timeout' => $options['timeout'] ?? null,
\t\t\t'useragent' => $options['useragent'] ?? null,
\t\t\t'blocking' => $options['blocking'] ?? null,
\t\t\t'hooks_class' => is_object( $hooks ) ? get_class( $hooks ) : null,
\t\t\t'hook_registrations' => $hook_registrations,
\t\t\t'filename' => $options['filename'] ?? null,
\t\t\t'follow_redirects' => $options['follow_redirects'] ?? null,
\t\t\t'redirects' => $options['redirects'] ?? null,
\t\t\t'max_bytes' => $options['max_bytes'] ?? null,
\t\t\t'cookies' => $cookies,
\t\t\t'verify' => wphx_summarize( $options['verify'] ?? null ),
\t\t\t'verifyname' => $options['verifyname'] ?? null,
\t\t\t'data_format' => $options['data_format'] ?? null,
\t\t\t'proxy' => wphx_proxy_summary( $options['proxy'] ?? null ),
\t\t),
\t);
}

function wphx_summarize( $value ) {
\tif ( $value instanceof WP_Error ) {
\t\treturn array( 'wp_error' => $value->get_error_code(), 'message' => $value->get_error_message() );
\t}
\tif ( $value instanceof WP_HTTP_Requests_Response ) {
\t\treturn array( 'class' => 'WP_HTTP_Requests_Response' );
\t}
\tif ( $value instanceof WpOrg\\Requests\\Utility\\CaseInsensitiveDictionary ) {
\t\treturn $value->jsonSerialize();
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'class' => get_class( $value ) );
\t}
\tif ( is_array( $value ) ) {
\t\t$out = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$out[ $key ] = wphx_summarize( $item );
\t\t}
\t\treturn $out;
\t}
\tif ( is_string( $value ) && str_starts_with( $value, ABSPATH ) ) {
\t\treturn '<ABSPATH>/' . substr( $value, strlen( ABSPATH ) );
\t}
\treturn $value;
}

function wphx_error_summary( $value ) {
\treturn $value instanceof WP_Error ? array( 'code' => $value->get_error_code(), 'message' => $value->get_error_message() ) : null;
}

require ABSPATH . WPINC . '/class-wp-http-response.php';
require ABSPATH . WPINC . '/class-wp-http-cookie.php';
require ABSPATH . WPINC . '/class-wp-http-requests-response.php';
require ABSPATH . WPINC . '/class-wp-http-requests-hooks.php';
require ABSPATH . WPINC . '/class-wp-http-proxy.php';
require ABSPATH . WPINC . '/class-wp-http.php';

$assertions = array();
$result = array( 'case' => $case );
$http = new WP_Http();

switch ( $case ) {
\tcase 'wp-http-request:head-defaults':
\t\t$response = $http->request( 'https://example.test/head', array( 'method' => 'HEAD' ) );
\t\t$call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call'] = $call;
\t\t$result['filters'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['head_type'] = 'HEAD' === $call['type'];
\t\t$assertions['head_disables_redirects'] = false === $call['options']['follow_redirects'] && null === $call['options']['redirects'];
\t\t$assertions['filtered_defaults_flow_to_options'] = 7 === $call['options']['timeout'] && 'FixtureAgent/1.0' === $call['options']['useragent'];
\t\t$assertions['hooks_registered'] = array( array( 'hook' => 'requests.before_redirect', 'callback' => 'WP_Http::browser_redirect_compatibility', 'priority' => 0 ) ) === $call['options']['hook_registrations'];
\t\t$assertions['ssl_verify_path'] = '<ABSPATH>/' . WPINC . '/certificates/ca-bundle.crt' === $call['options']['verify'];
\t\t$assertions['response_filtered'] = ! empty( $response['wphx_filtered'] ) && 201 === $response['response']['code'];
\t\tbreak;

\tcase 'wp-http-request:preempt':
\t\t$response = $http->request( 'https://example.test/preempt' );
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call_count'] = count( $GLOBALS['wphx_requests_calls'] );
\t\t$assertions['preempt_response_returned'] = 'preempted' === $response['body'] && 299 === $response['response']['code'];
\t\t$assertions['requests_not_called'] = 0 === count( $GLOBALS['wphx_requests_calls'] );
\t\tbreak;

\tcase 'wp-http-request:invalid-and-blocked':
\t\t$invalid = $http->request( 'relative/path' );
\t\tdefine( 'WP_HTTP_BLOCK_EXTERNAL', true );
\t\t$blocked = $http->request( 'https://blocked.example/path' );
\t\t$result['invalid'] = wphx_error_summary( $invalid );
\t\t$result['blocked'] = wphx_error_summary( $blocked );
\t\t$result['actions'] = $GLOBALS['wphx_actions'];
\t\t$assertions['invalid_url_error'] = 'http_request_failed' === $result['invalid']['code'];
\t\t$assertions['blocked_url_error'] = 'http_request_not_executed' === $result['blocked']['code'];
\t\t$assertions['debug_actions_for_errors'] = 2 === count( array_filter( $GLOBALS['wphx_actions'], static function ( $action ) { return 'http_api_debug' === $action['hook']; } ) );
\t\t$assertions['requests_not_called'] = 0 === count( $GLOBALS['wphx_requests_calls'] );
\t\tbreak;

\tcase 'wp-http-request:streaming':
\t\t$streamed = $http->request( 'https://example.test/files/archive.zip', array( 'stream' => true ) );
\t\t$stream_call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$bad = $http->request( 'https://example.test/files/bad.zip', array( 'stream' => true, 'filename' => '/not-writable/bad.zip' ) );
\t\t$result['streamed'] = wphx_summarize( $streamed );
\t\t$result['stream_call'] = $stream_call;
\t\t$result['bad'] = wphx_error_summary( $bad );
\t\t$assertions['default_filename'] = '/tmp/wphx-streams/archive.zip' === $stream_call['options']['filename'];
\t\t$assertions['stream_forces_blocking'] = true === $stream_call['options']['blocking'];
\t\t$assertions['bad_destination_error'] = 'http_request_failed' === $result['bad']['code'];
\t\tbreak;

\tcase 'wp-http-request:headers-cookies-ssl-post':
\t\t$response = $http->request(
\t\t\t'https://example.test/post',
\t\t\tarray(
\t\t\t\t'method' => 'PUT',
\t\t\t\t'headers' => \"X-One: 1\\r\\nX-Two: 2\\r\\n\",
\t\t\t\t'body' => 'payload',
\t\t\t\t'cookies' => array( 'alpha' => 'beta' ),
\t\t\t\t'sslverify' => false,
\t\t\t\t'redirection' => 2,
\t\t\t\t'limit_response_size' => 12,
\t\t\t)
\t\t);
\t\t$call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call'] = $call;
\t\t$assertions['headers_parsed'] = array( 'x-one' => '1', 'x-two' => '2' ) === $call['headers'];
\t\t$assertions['body_and_method'] = 'PUT' === $call['type'] && 'payload' === $call['data'] && 'body' === $call['options']['data_format'];
\t\t$assertions['cookies_normalized'] = isset( $call['options']['cookies']['alpha'] ) && 'beta' === $call['options']['cookies']['alpha']['value'];
\t\t$assertions['ssl_disabled'] = false === $call['options']['verify'] && false === $call['options']['verifyname'];
\t\t$assertions['redirects_and_limit'] = 2 === $call['options']['redirects'] && 12 === $call['options']['max_bytes'];
\t\tbreak;

\tcase 'wp-http-request:proxy-tls-handoff':
\t\tdefine( 'WP_PROXY_HOST', 'proxy.fixture.test' );
\t\tdefine( 'WP_PROXY_PORT', '8080' );
\t\tdefine( 'WP_PROXY_USERNAME', 'fixture-user' );
\t\tdefine( 'WP_PROXY_PASSWORD', 'fixture-pass' );
\t\t$response = $http->request(
\t\t\t'https://transport.example/proxy',
\t\t\tarray(
\t\t\t\t'sslverify' => false,
\t\t\t\t'redirection' => 1,
\t\t\t)
\t\t);
\t\t$call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call'] = $call;
\t\t$assertions['proxy_object_handoff'] = isset( $call['options']['proxy']['class'] ) && 'WpOrg\\\\Requests\\\\Proxy\\\\Http' === $call['options']['proxy']['class'];
\t\t$assertions['proxy_address_handoff'] = 'proxy.fixture.test:8080' === $call['options']['proxy']['address'];
\t\t$assertions['proxy_auth_handoff'] = true === $call['options']['proxy']['use_authentication'] && 'fixture-user' === $call['options']['proxy']['user'] && 'fixture-pass' === $call['options']['proxy']['pass'];
\t\t$assertions['tls_verify_disabled'] = false === $call['options']['verify'] && false === $call['options']['verifyname'];
\t\t$assertions['redirect_limit_handoff'] = 1 === $call['options']['redirects'];
\t\tbreak;

\tcase 'wp-http-request:exception-and-nonblocking':
\t\t$GLOBALS['wphx_throw_requests_exception'] = true;
\t\t$error = $http->request( 'https://example.test/error' );
\t\t$GLOBALS['wphx_throw_requests_exception'] = false;
\t\t$nonblocking = $http->request( 'https://example.test/nonblocking', array( 'blocking' => false ) );
\t\t$result['error'] = wphx_error_summary( $error );
\t\t$result['nonblocking'] = wphx_summarize( $nonblocking );
\t\t$result['request_calls'] = $GLOBALS['wphx_requests_calls'];
\t\t$assertions['exception_converted'] = 'http_request_failed' === $result['error']['code'] && 'fixture transport failure' === $result['error']['message'];
\t\t$assertions['nonblocking_shape'] = array(
\t\t\t'headers' => array(),
\t\t\t'body' => '',
\t\t\t'response' => array( 'code' => false, 'message' => false ),
\t\t\t'cookies' => array(),
\t\t\t'http_response' => null,
\t\t) === $nonblocking;
\t\t$assertions['nonblocking_option_sent'] = false === $GLOBALS['wphx_requests_calls'][1]['options']['blocking'];
\t\tbreak;
}

$result['assertions'] = $assertions;
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
}
`
  );
}

function runProbe(root) {
  const observations = {};
  for (const fixtureCase of CASES) {
    const output = command("php", [PROBE, root, fixtureCase.id]);
    observations[fixtureCase.id] = JSON.parse(output);
  }
  return observations;
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    const existing = readFileSync(path, "utf8");
    if (existing !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/http-transport-parity-gate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "recorded_transport_parity_gate",
      name: "WP_Http recorded transport handoff parity",
      area:
        "src/wp-includes/class-wp-http.php with WP_HTTP_Requests_Hooks, WP_HTTP_Requests_Response, WP_HTTP_Proxy, WP_HTTP_Response, and WP_Http_Cookie support",
      public_contract:
        "This gate compares copied WordPress 7.0 WP_Http request behavior against the WPHX PHP compiler-emitted original-path WP_Http request shell in isolated PHP CLI probes. It observes recorded Requests handoff and response/error handling for success, redirects, errors, headers/cookies, proxy/TLS options, and streaming/response-size behavior without claiming live Requests network I/O, real DNS/proxy/TLS negotiation, curl/streams transport execution, installed distribution behavior, whole-file WP_Http ownership, or full request ownership."
    },
    ownership_state: "compiler_emitted_original_path_shell",
    bridge: {
      exists: true,
      kind: "compiler-emitted-original-path-public-php-shell-with-recorded-requests-boundary",
      removal_gate:
        "Promote beyond this recorded transport parity gate only after selected upstream HTTP PHPUnit, installed distribution, live or recorded transport expansion, and whole-file WP_Http gates pass without copied public PHP fallback."
    },
    owned_paths: [RUNNER, ...HAXE_SOURCES, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT, wphxRequestShellPaths(OUT_ROOT).manifest],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-transport-parity-gate",
        "npm run wp:core:wphx-312-http-transport-parity-gate:check",
        "npm run wp:core:wphx-312-public-shell-gap-audit:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-92-http-transport-parity-gate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  compileWphxRequestShell(command, OUT_ROOT);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  installWphxRequestShell(CANDIDATE_ROOT, OUT_ROOT);
  writeProbe();

  const oracle = runProbe(ORACLE_ROOT);
  const candidate = runProbe(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const observationsAssert = Object.values(oracle).every((entry) => Object.values(entry.assertions).every(Boolean));
  if (!observationsMatch) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
    process.exit(1);
  }
  if (!observationsAssert) {
    console.error(JSON.stringify({ status: "failed", reason: "fixture assertions failed", oracle }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const compiledPhp = command("find", [HAXE_OUT, "-type", "f", "-name", "*.php"]);
  const wphxPhp = wphxRequestShellPaths(OUT_ROOT);
  const wphxPhpShape = requestShellShape(CANDIDATE_ROOT, OUT_ROOT);
  if (!Object.values(wphxPhpShape).every(Boolean)) {
    console.error(JSON.stringify({ status: "failed", reason: "WPHX PHP generated shell shape check failed", wphxPhpShape }, null, 2));
    process.exit(1);
  }
  const manifest = {
    schema: "wphx.wp-core-http-transport-parity-gate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["recorded_transport_parity", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture", "compiler_php_ir_feature_evidence"],
    artifact_scope: "recorded_transport_parity_gate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_helper_fixture_manifest: inputRecord(HTTP_HELPER_FIXTURE),
      http_parser_header_fixture_manifest: inputRecord(HTTP_PARSER_FIXTURE),
      http_api_wrapper_safety_fixture_manifest: inputRecord(HTTP_API_FIXTURE),
      http_transport_callback_test_fixture_manifest: inputRecord(HTTP_TRANSPORT_FIXTURE),
      request_orchestration_fixture_manifest: inputRecord(REQUEST_ORCHESTRATION_FIXTURE),
      request_proxy_safety_fixture_manifest: inputRecord(REQUEST_PROXY_SAFETY_FIXTURE),
      runner: inputRecord(RUNNER),
      wphx_php_manifest: inputRecord(wphxPhp.manifest),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      wphx_php_hxml: WPHX_REQUEST_SHELL_HXML,
      haxe_output: HAXE_OUT,
      wphx_php_output: wphxPhp.root,
      public_shell: {
        path: `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`,
        source_path: wphxPhp.shell,
        sha256: sha256File(`${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`),
        compiler_emitted: true,
        shape: wphxPhpShape
      },
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort()
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      probe: { path: PROBE, sha256: sha256File(PROBE) },
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "Requests classes, selected WordPress globals, hook dispatch, URL validation, temp-dir writability, mbstring encoding guards, and option/bloginfo helpers are deterministic stubs. The oracle root executes copied WordPress WP_Http; the candidate root executes the WPHX PHP compiler-emitted original-path WP_Http request shell. Outbound Requests::request records options or throws without network I/O."
      },
      public_abi_policy: {
        public_php_replacement_claimed: true,
        copied_oracle_public_php: true,
        copied_candidate_public_php_shell: false,
        compiler_emitted_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: { hxml: HXML, haxe_output: HAXE_OUT, oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate)),
      assertions_pass: observationsAssert
    },
    remaining_gaps: [
      {
        id: "live-requests-network-io-deferred",
        owner: ISSUE.external_ref,
        detail:
          "This gate records WP_Http's Requests handoff and exception conversion through a stubbed Requests::request boundary. It does not perform live network I/O, DNS, TLS handshake, proxy negotiation, redirect following by Requests, curl/streams execution, timeout races, socket behavior, or real streamed file transfers."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic support stubs rather than an installed WordPress distribution or ecosystem HTTP callers."
      },
      {
        id: "whole-wp-http-request-not-yet-owned",
        owner: ISSUE.external_ref,
        detail: "The candidate uses the WPHX PHP compiler-emitted original-path WP_Http request shell and compiled Haxe helper support, but this gate does not claim whole-file WP_Http ownership, the full WordPress HTTP API, or installed ecosystem behavior."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: true,
      wphx_php_manifest_unsupported_empty: wphxPhpShape.unsupported_empty,
      request_ir_features: REQUIRED_REQUEST_SHELL_FEATURES,
      installed_wordpress_behavior_claimed: false,
      live_requests_network_io_claimed: false,
      transport_execution_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-92-http-transport-parity-gate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http recorded transport parity gate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for WPHX PHP recorded transport parity boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/generated-candidate parity fixture generator" },
      { path: HXML, role: "Haxe compile target for request helper support used by generated public shell" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-transport-parity-gate",
      "npm run wp:core:wphx-312-http-transport-parity-gate:check",
      "npm run wp:core:wphx-312-public-shell-gap-audit:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-41-wp-http-helper-oracle-fixture",
      "receipt:wphx-312-42-wp-http-parser-header-oracle-fixture",
      "receipt:wphx-312-43-http-api-wrapper-safety-oracle-fixture",
      "receipt:wphx-312-45-http-transport-callback-test-oracle-fixture",
      "receipt:wphx-312-46-wp-http-request-orchestration-oracle-fixture",
      "receipt:wphx-312-49-wp-http-request-proxy-safety-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n");
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
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
        fixture_cases: CASES.length,
        observations_match: observationsMatch
      },
      null,
      2
    )
  );
}

await main();
