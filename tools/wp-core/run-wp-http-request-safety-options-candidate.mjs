#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-e5g",
  external_ref: "WPHX-312.67",
  title: "WPHX-312.67 - Promote WP_Http request redirect-validation hook decision to Haxe candidate"
};
const RECORDED_AT = "2026-06-28T05:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-request-safety-options-candidate.mjs";
const HXML = "fixtures/wp-core/http-request-safety-options-candidate.hxml";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-request-nonblocking.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-67";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const WPHX_PHP_ROOT = `${OUT_ROOT}/wphx-php`;
const WPHX_PHP_MANIFEST = `${WPHX_PHP_ROOT}/wphx-php-emission.v1.json`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-67-wp-http-request-safety-options-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-67-wp-http-request-safety-options-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-67-wp-http-request-safety-options-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_PROXY_FIXTURE = "manifests/wp-core/wphx-312-32-http-proxy-oracle-fixture.v1.json";
const HTTP_API_FIXTURE = "manifests/wp-core/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";
const HTTP_REQUEST_FIXTURE = "manifests/wp-core/wphx-312-46-wp-http-request-orchestration-oracle-fixture.v1.json";
const HTTP_BLOCK_FIXTURE = "manifests/wp-core/wphx-312-47-wp-http-block-request-policy-oracle-fixture.v1.json";
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
  "WP_HTTP_Proxy::send_through_proxy",
  "WP_HTTP_Requests_Hooks",
  "WP_HTTP_Requests_Response",
  "WpOrg\\Requests\\Requests::request",
  "WpOrg\\Requests\\Proxy\\Http",
  "http_request_reject_unsafe_urls",
  "pre_http_send_through_proxy",
  "requests.before_redirect",
  "WP_Http::browser_redirect_compatibility",
  "WP_Http::validate_redirects",
  "wp_http_validate_url",
  "wp_kses_bad_protocol",
  "WP_PROXY_HOST",
  "WP_PROXY_PORT",
  "WP_PROXY_USERNAME",
  "WP_PROXY_PASSWORD",
  "WP_PROXY_BYPASS_HOSTS"
];
const HAXE_SOURCES = [
  HXML,
  WPHX_PHP_HXML,
  "src/wphx/wp/http/HttpRequestNonblocking.hx",
  "src/wphx/wp/http/HttpBlockRequestPolicy.hx",
  "src/wphx/wp/http/HttpRequestSafetyOptions.hx",
  "src/wphx/wp/http/HttpRequestStreamBlocking.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpBlockRequestPolicy.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRequestNonblocking.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpRequestNonblockingEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpRequestNonblockingShell.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpRequestSafetyOptionsCandidateEntry.hx"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpRequestSafetyOptions\\HttpRequestSafetyOptions_Fields_";
const PROMOTED_SYMBOLS = ["WP_Http::request redirect validation hook registration condition"];
const CASES = [
  { id: "wp-http-request-safety:reject-safe-filter", focus: "http_request_reject_unsafe_urls enables validation, safe URL survives, and redirect validation hooks are registered" },
  { id: "wp-http-request-safety:reject-unsafe-filter", focus: "unsafe URL rejected before Requests execution when reject_unsafe_urls is enabled by filter" },
  { id: "wp-http-request-safety:bad-protocol-strip", focus: "wp_kses_bad_protocol strips disallowed protocol and yields valid-URL WP_Error before Requests execution" },
  { id: "wp-http-request-proxy:auth-handoff", focus: "configured proxy with authentication becomes a Requests Proxy\\Http option with address and credentials" },
  { id: "wp-http-request-proxy:bypass-hosts", focus: "site host and WP_PROXY_BYPASS_HOSTS wildcard hosts bypass proxy option handoff" },
  { id: "wp-http-request-proxy:pre-filter-overrides", focus: "pre_http_send_through_proxy false/true overrides proxy option handoff for specific URLs" }
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

function installCompilerEmittedCandidateShell() {
  const source = `${WPHX_PHP_ROOT}/wp-includes/class-wp-http.php`;
  const target = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  if (!existsSync(source)) throw new Error(`Missing WPHX PHP emitted shell: ${source}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
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
\t}

\tclass Requests {
\t\tpublic const GET = 'GET';

\t\tpublic static function set_certificate_path( $path ) {}

\t\tpublic static function request( $url, $headers = array(), $data = null, $type = 'GET', $options = array() ) {
\t\t\t$GLOBALS['wphx_requests_calls'][] = \\wphx_summarize_requests_call( $url, $headers, $data, $type, $options );
\t\t\t$response = new Response();
\t\t\t$response->status_code = 200;
\t\t\t$response->body = 'fixture body';
\t\t\t$response->headers = new Response\\Headers( array( 'X-Fixture' => array( 'yes' ) ) );
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

$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_filter_calls'] = array();
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_requests_calls'] = array();
$GLOBALS['wphx_bad_protocol_calls'] = array();
$GLOBALS['wphx_validate_url_calls'] = array();

switch ( $case ) {
\tcase 'wp-http-request-proxy:auth-handoff':
\t\tdefine( 'WP_PROXY_HOST', 'proxy.example.test' );
\t\tdefine( 'WP_PROXY_PORT', '8080' );
\t\tdefine( 'WP_PROXY_USERNAME', 'proxy-user' );
\t\tdefine( 'WP_PROXY_PASSWORD', 'proxy-pass' );
\t\tbreak;
\tcase 'wp-http-request-proxy:bypass-hosts':
\t\tdefine( 'WP_PROXY_HOST', 'proxy.example.test' );
\t\tdefine( 'WP_PROXY_PORT', '8080' );
\t\tdefine( 'WP_PROXY_BYPASS_HOSTS', '*.wordpress.org' );
\t\tbreak;
\tcase 'wp-http-request-proxy:pre-filter-overrides':
\t\tdefine( 'WP_PROXY_HOST', 'proxy.example.test' );
\t\tdefine( 'WP_PROXY_PORT', '8080' );
\t\tbreak;
}

function __( $text ) {
\treturn $text;
}

function get_bloginfo( $show ) {
\treturn 'version' === $show ? '7.0-fixture' : 'https://site.example.test';
}

function get_option( $name ) {
\treturn 'siteurl' === $name ? 'https://site.example.test' : null;
}

function get_status_header_desc( $code ) {
\treturn 200 === $code ? 'OK' : 'Status ' . $code;
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
\t$record = array( 'hook' => $hook, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );

\tif ( 'http_request_reject_unsafe_urls' === $hook && str_starts_with( $GLOBALS['wphx_case'], 'wp-http-request-safety:reject-' ) ) {
\t\t$record['return'] = true;
\t\t$GLOBALS['wphx_filter_calls'][] = $record;
\t\treturn true;
\t}

\tif ( 'pre_http_send_through_proxy' === $hook && 'wp-http-request-proxy:pre-filter-overrides' === $GLOBALS['wphx_case'] ) {
\t\tif ( 'https://force-bypass.example/path' === ( $args[0] ?? null ) ) {
\t\t\t$record['return'] = false;
\t\t\t$GLOBALS['wphx_filter_calls'][] = $record;
\t\t\treturn false;
\t\t}
\t\tif ( 'https://force-proxy.example/path' === ( $args[0] ?? null ) ) {
\t\t\t$record['return'] = true;
\t\t\t$GLOBALS['wphx_filter_calls'][] = $record;
\t\t\treturn true;
\t\t}
\t}

\t$record['return'] = wphx_summarize( $value );
\t$GLOBALS['wphx_filter_calls'][] = $record;
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
\t$GLOBALS['wphx_validate_url_calls'][] = $url;
\treturn str_starts_with( $url, 'https://valid.example/' ) ? $url : false;
}

function get_temp_dir() {
\treturn '/tmp/wphx-streams/';
}

function wp_is_writable( $path ) {
\treturn true;
}

function mbstring_binary_safe_encoding() {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => 'mbstring_binary_safe_encoding', 'args' => array() );
}

function reset_mbstring_encoding() {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => 'reset_mbstring_encoding', 'args' => array() );
}

function wphx_summarize_requests_call( $url, $headers, $data, $type, $options ) {
\t$hooks = $options['hooks'] ?? null;
\t$hook_registrations = is_object( $hooks ) && property_exists( $hooks, 'registered' ) ? $hooks->registered : array();
\t$proxy = $options['proxy'] ?? null;
\treturn array(
\t\t'url' => $url,
\t\t'headers' => $headers,
\t\t'data' => $data,
\t\t'type' => $type,
\t\t'options' => array(
\t\t\t'hooks_class' => is_object( $hooks ) ? get_class( $hooks ) : null,
\t\t\t'hook_registrations' => $hook_registrations,
\t\t\t'proxy' => is_object( $proxy ) ? array(
\t\t\t\t'class' => get_class( $proxy ),
\t\t\t\t'address' => $proxy->address ?? null,
\t\t\t\t'use_authentication' => $proxy->use_authentication ?? null,
\t\t\t\t'user' => $proxy->user ?? null,
\t\t\t\t'pass' => $proxy->pass ?? null,
\t\t\t) : null,
\t\t\t'verify' => wphx_summarize( $options['verify'] ?? null ),
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
$browser_hook = array( 'hook' => 'requests.before_redirect', 'callback' => 'WP_Http::browser_redirect_compatibility', 'priority' => 0 );
$validate_hook = array( 'hook' => 'requests.before_redirect', 'callback' => 'WP_Http::validate_redirects', 'priority' => 0 );

switch ( $case ) {
\tcase 'wp-http-request-safety:reject-safe-filter':
\t\t$response = $http->request( 'https://valid.example/resource' );
\t\t$call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call'] = $call;
\t\t$result['validate_url_calls'] = $GLOBALS['wphx_validate_url_calls'];
\t\t$result['bad_protocol_calls'] = $GLOBALS['wphx_bad_protocol_calls'];
\t\t$result['filters'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['validation_filter_enabled'] = ! empty( array_filter( $GLOBALS['wphx_filter_calls'], static function ( $filter ) { return 'http_request_reject_unsafe_urls' === $filter['hook'] && true === $filter['return']; } ) );
\t\t$assertions['safe_url_validated_and_called'] = array( 'https://valid.example/resource' ) === $GLOBALS['wphx_validate_url_calls'] && 'https://valid.example/resource' === $call['url'];
\t\t$assertions['bad_protocol_allowlist_applied'] = array( 'http', 'https', 'ssl' ) === ( $GLOBALS['wphx_bad_protocol_calls'][0]['allowed'] ?? null );
\t\t$assertions['redirect_validation_hook_registered'] = array( $browser_hook, $validate_hook ) === $call['options']['hook_registrations'];
\t\tbreak;

\tcase 'wp-http-request-safety:reject-unsafe-filter':
\t\t$error = $http->request( 'https://blocked.example/resource' );
\t\t$result['error'] = wphx_error_summary( $error );
\t\t$result['validate_url_calls'] = $GLOBALS['wphx_validate_url_calls'];
\t\t$result['bad_protocol_calls'] = $GLOBALS['wphx_bad_protocol_calls'];
\t\t$result['request_call_count'] = count( $GLOBALS['wphx_requests_calls'] );
\t\t$result['actions'] = $GLOBALS['wphx_actions'];
\t\t$assertions['unsafe_url_validated'] = array( 'https://blocked.example/resource' ) === $GLOBALS['wphx_validate_url_calls'];
\t\t$assertions['unsafe_error_before_requests'] = 'http_request_failed' === $result['error']['code'] && 0 === count( $GLOBALS['wphx_requests_calls'] );
\t\t$assertions['no_bad_protocol_after_failed_validation'] = array() === $GLOBALS['wphx_bad_protocol_calls'];
\t\tbreak;

\tcase 'wp-http-request-safety:bad-protocol-strip':
\t\t$error = $http->request( 'ftp://valid.example/file' );
\t\t$result['error'] = wphx_error_summary( $error );
\t\t$result['bad_protocol_calls'] = $GLOBALS['wphx_bad_protocol_calls'];
\t\t$result['request_call_count'] = count( $GLOBALS['wphx_requests_calls'] );
\t\t$assertions['bad_protocol_checked'] = 'ftp://valid.example/file' === ( $GLOBALS['wphx_bad_protocol_calls'][0]['url'] ?? null );
\t\t$assertions['bad_protocol_error_before_requests'] = 'http_request_failed' === $result['error']['code'] && 0 === count( $GLOBALS['wphx_requests_calls'] );
\t\tbreak;

\tcase 'wp-http-request-proxy:auth-handoff':
\t\t$response = $http->request( 'https://external.example.test/path' );
\t\t$call = $GLOBALS['wphx_requests_calls'][0] ?? array();
\t\t$result['response'] = wphx_summarize( $response );
\t\t$result['request_call'] = $call;
\t\t$result['filters'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['proxy_object_handoff'] = array(
\t\t\t'class' => 'WpOrg\\Requests\\Proxy\\Http',
\t\t\t'address' => 'proxy.example.test:8080',
\t\t\t'use_authentication' => true,
\t\t\t'user' => 'proxy-user',
\t\t\t'pass' => 'proxy-pass',
\t\t) === $call['options']['proxy'];
\t\t$assertions['proxy_filter_observed'] = ! empty( array_filter( $GLOBALS['wphx_filter_calls'], static function ( $filter ) { return 'pre_http_send_through_proxy' === $filter['hook']; } ) );
\t\tbreak;

\tcase 'wp-http-request-proxy:bypass-hosts':
\t\t$site = $http->request( 'https://site.example.test/wp-json/' );
\t\t$wordpress = $http->request( 'https://downloads.wordpress.org/plugin.zip' );
\t\t$external = $http->request( 'https://external.example.test/path' );
\t\t$calls = $GLOBALS['wphx_requests_calls'];
\t\t$result['responses'] = array( wphx_summarize( $site ), wphx_summarize( $wordpress ), wphx_summarize( $external ) );
\t\t$result['request_calls'] = $calls;
\t\t$assertions['site_host_bypasses_proxy'] = null === $calls[0]['options']['proxy'];
\t\t$assertions['wildcard_host_bypasses_proxy'] = null === $calls[1]['options']['proxy'];
\t\t$assertions['external_uses_proxy'] = 'proxy.example.test:8080' === ( $calls[2]['options']['proxy']['address'] ?? null );
\t\tbreak;

\tcase 'wp-http-request-proxy:pre-filter-overrides':
\t\t$bypass = $http->request( 'https://force-bypass.example/path' );
\t\t$forced = $http->request( 'https://force-proxy.example/path' );
\t\t$calls = $GLOBALS['wphx_requests_calls'];
\t\t$result['responses'] = array( wphx_summarize( $bypass ), wphx_summarize( $forced ) );
\t\t$result['request_calls'] = $calls;
\t\t$result['filters'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['filter_false_bypasses_proxy'] = null === $calls[0]['options']['proxy'];
\t\t$assertions['filter_true_uses_proxy'] = 'proxy.example.test:8080' === ( $calls[1]['options']['proxy']['address'] ?? null );
\t\t$assertions['filter_returns_recorded'] = array( false, true ) === array_values( array_map( static function ( $filter ) { return $filter['return']; }, array_filter( $GLOBALS['wphx_filter_calls'], static function ( $filter ) { return 'pre_http_send_through_proxy' === $filter['hook']; } ) ) );
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
    manifest_id: "ownership:wp-core/wp-http-request-safety-options-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http request redirect-validation hook decision",
      area:
        "src/wp-includes/class-wp-http.php with WP_HTTP_Proxy, WP_HTTP_Requests_Hooks, WP_HTTP_Requests_Response, WP_HTTP_Response, and WP_Http_Cookie support",
      public_contract:
        "This candidate promotes only the WP_Http::request decision to register the validate_redirects hook when wp_kses_bad_protocol exists and reject_unsafe_urls is enabled. PHP still owns public request ABI, http_request_reject_unsafe_urls filtering, URL validation, bad-protocol stripping, hook object mechanics, proxy option/auth handoff, pre_http_send_through_proxy overrides, Requests dispatch, debug/error handling, and native arrays/objects."
    },
    ownership_state: "compiler_emitted_original_path_shell",
    bridge: {
      exists: true,
      kind: "compiler-emitted-original-path-public-php-shell",
      removal_gate:
        "Promote additional WP_Http::request branches only through WPHX PHP emitted adapters, typed Haxe helpers, request proxy/safety gates, selected upstream HTTP PHPUnit, installed distribution, and live/recorded network/proxy parity gates before claiming full request or whole-file ownership."
    },
    owned_paths: [RUNNER, ...HAXE_SOURCES, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT, WPHX_PHP_MANIFEST],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-request-safety-options-candidate",
        "npm run wp:core:wphx-312-wp-http-request-safety-options-candidate:check",
        "npm run wphx:php:public-shell-snapshots:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-67-wp-http-request-safety-options-candidate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  command("haxe", [WPHX_PHP_HXML, "-D", `wphx_php_output=${WPHX_PHP_ROOT}`, "-D", `wphx_php_manifest=${WPHX_PHP_MANIFEST}`]);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  installCompilerEmittedCandidateShell();
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
  const wphxPhpManifest = JSON.parse(readFileSync(WPHX_PHP_MANIFEST, "utf8"));
  const generatedShellPath = mirrorPath(CANDIDATE_ROOT, "src/wp-includes/class-wp-http.php");
  const generatedShell = readFileSync(generatedShellPath, "utf8");
  const requiredRequestIrFeatures = [
    "stmt.try-catch",
    "stmt.if",
    "stmt.if-else",
    "expr.long-array",
    "expr.method-call",
    "expr.static-call",
    "wp-http.request.nonblocking-response",
    "wp-http.request.safety-options-helper",
    "wp-http.request.stream-blocking-helper"
  ];
  const coreIrFeatures = new Set(wphxPhpManifest.core_ir_features ?? []);
  const missingRequestIrFeatures = requiredRequestIrFeatures.filter((feature) => !coreIrFeatures.has(feature));
  const wphxPhpShape = {
    manifest_declares_wp_http: wphxPhpManifest.files.some((file) =>
      file.path === "wp-includes/class-wp-http.php" &&
      file.declarations.some((declaration) => declaration.kind === "class" && declaration.name === "WP_Http")
    ),
    unsupported_empty: Array.isArray(wphxPhpManifest.unsupported) && wphxPhpManifest.unsupported.length === 0,
    request_signature: generatedShell.includes("public function request($url, $args = [])"),
    block_request_signature: generatedShell.includes("public function block_request($uri)"),
    safety_options_haxe_call: generatedShell.includes(`${HAXE_MODULE}::shouldRegisterRedirectValidation`),
    stream_blocking_haxe_call: generatedShell.includes("HttpRequestStreamBlocking_Fields_::shouldForceBlockingForStream"),
    nonblocking_haxe_call: generatedShell.includes("HttpRequestNonblocking_Fields_::nonblockingResponse"),
    requests_dispatch: generatedShell.includes("WpOrg\\Requests\\Requests::request"),
    request_ir_features_present: missingRequestIrFeatures.length === 0
  };
  if (!Object.values(wphxPhpShape).every(Boolean)) {
    console.error(JSON.stringify({ status: "failed", reason: "WPHX PHP generated shell shape check failed", wphxPhpShape }, null, 2));
    process.exit(1);
  }
  const manifest = {
    schema: "wphx.wp-core-wp-http-request-safety-options-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: [
      "haxe_source",
      "generated_php_candidate",
      "oracle_source_mirror",
      "php_cli_observed_fixture",
      "compiler_php_ir_feature_evidence"
    ],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_proxy_fixture_manifest: inputRecord(HTTP_PROXY_FIXTURE),
      http_api_wrapper_safety_fixture_manifest: inputRecord(HTTP_API_FIXTURE),
      http_request_orchestration_fixture_manifest: inputRecord(HTTP_REQUEST_FIXTURE),
      http_block_request_policy_fixture_manifest: inputRecord(HTTP_BLOCK_FIXTURE),
      request_proxy_safety_fixture_manifest: inputRecord(REQUEST_PROXY_SAFETY_FIXTURE),
      runner: inputRecord(RUNNER),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      wphx_php_hxml: WPHX_PHP_HXML,
      haxe_output: HAXE_OUT,
      wphx_php_output: WPHX_PHP_ROOT,
      public_shell: {
        path: generatedShellPath,
        source_path: `${WPHX_PHP_ROOT}/wp-includes/class-wp-http.php`,
        sha256: sha256File(generatedShellPath),
        compiler_emitted: true,
        shape: wphxPhpShape
      },
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort(),
      haxe_module: HAXE_MODULE,
      promoted_symbols: PROMOTED_SYMBOLS,
      promoted_behavior:
        "Only the redirect validation hook registration condition in WP_Http::request is claimed by this candidate. The surrounding public method body is now emitted by structured WPHX PHP Adapter IR as a bounded original-path adapter and remains PHP-owned request orchestration, not full request behavior ownership.",
      adapter_ir: {
        adapter: "wp-http-request-nonblocking",
        required_features: requiredRequestIrFeatures,
        missing_features: missingRequestIrFeatures
      }
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
          "Requests classes, selected WordPress globals, hook dispatch, URL validation, site URL, proxy constants, mbstring encoding guards, and option/bloginfo helpers are deterministic stubs. Copied WP_Http and HTTP support classes remain the executed request proxy/safety sources; outbound Requests::request records options without network I/O."
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
        id: "full-request-safety-not-promoted",
        owner: ISSUE.external_ref,
        detail:
          "Only the validate_redirects hook registration condition is Haxe-owned. reject_unsafe_urls filtering, URL validation, bad-protocol stripping, hook registration mechanics, proxy handoff, Requests dispatch, and response/error handling remain PHP-owned in this candidate."
      },
      {
        id: "live-requests-network-and-proxy-io-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture records WP_Http's Requests and proxy option handoff through a stubbed Requests::request boundary. It does not perform live network I/O, DNS, TLS, proxy negotiation, redirect following, or transport execution."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic support stubs rather than an installed WordPress distribution or ecosystem HTTP callers."
      },
      {
        id: "full-wp-http-request-not-yet-owned",
        owner: ISSUE.external_ref,
        detail:
          "The candidate consumes a compiler-emitted original-path class-wp-http.php shell for a bounded WP_Http::request safety branch gate plus supporting request/block_request branches. Broader request semantics, whole-file WP_Http ownership, and installed distribution behavior remain later compiler-driven gates."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      promoted_symbols: PROMOTED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      request_shell_emitted: true,
      wphx_php_manifest_unsupported_empty: wphxPhpShape.unsupported_empty,
      request_ir_features_present: missingRequestIrFeatures.length === 0,
      request_ir_features: requiredRequestIrFeatures,
      public_php_replacement_claimed: true,
      full_request_safety_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_requests_network_io_claimed: false,
      proxy_negotiation_claimed: false,
      transport_execution_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-67-wp-http-request-safety-options-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http request safety options Haxe candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for WP_Http request safety options Haxe candidate" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe fixture generator" },
      { path: HXML, role: "Haxe compile target for request safety options candidate" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-request-safety-options-candidate",
      "npm run wp:core:wphx-312-wp-http-request-safety-options-candidate:check",
      "npm run wphx:php:public-shell-snapshots:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-32-http-proxy-oracle-fixture",
      "receipt:wphx-312-43-http-api-wrapper-safety-oracle-fixture",
      "receipt:wphx-312-46-wp-http-request-orchestration-oracle-fixture",
      "receipt:wphx-312-47-wp-http-block-request-policy-oracle-fixture",
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
