#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-7v7",
  external_ref: "WPHX-312.81",
  title: "WPHX-312.81 - Promote WP_Http request cookie option decision to Haxe candidate"
};
const RECORDED_AT = "2026-06-28T06:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-request-cookie-options-candidate.mjs";
const HXML = "fixtures/wp-core/http-request-cookie-options-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-81";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-81-wp-http-request-cookie-options-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-81-wp-http-request-cookie-options-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-81-wp-http-request-cookie-options-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const REQUEST_ORCHESTRATION_FIXTURE = "manifests/wp-core/wphx-312-46-wp-http-request-orchestration-oracle-fixture.v1.json";

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
  "WpOrg\\Requests\\Requests::request",
  "WP_HTTP_Requests_Hooks",
  "WP_Http_Cookie",
  "http_response"
];
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/http/HttpRequestCookieOptions.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpRequestCookieOptionsCandidateEntry.hx"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpRequestCookieOptions\\HttpRequestCookieOptions_Fields_";
const PROMOTED_SYMBOLS = ["WP_Http::request non-empty request cookies normalize into Requests options decision"];
const CASES = [
  { id: "wp-http-request:head-defaults", focus: "default empty cookies omit Requests cookies option" },
  { id: "wp-http-request:headers-cookies-ssl-post", focus: "non-empty parsed cookies normalize before Requests dispatch" }
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

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_312_81_bootstrap_haxe' ) ) {
\tfunction wphx_312_81_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_312_81_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_312_81_lib );
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
wphx_312_81_bootstrap_haxe();
`;
}

function installBootstrap(source) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) throw new Error("class-wp-http.php did not start with PHP open tag");
  return `${marker}\n${haxeBootstrapBlock()}\n${source.slice(marker.length)}`;
}

function transformCandidateRequestCookieOptions() {
  const path = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  const original = `\t\tif ( ! empty( $parsed_args['cookies'] ) ) {
\t\t\t$options['cookies'] = self::normalize_cookies( $parsed_args['cookies'] );
\t\t}
`;
  const replacement = `\t\tif ( ${HAXE_MODULE}::shouldNormalizeRequestCookies( ! empty( $parsed_args['cookies'] ) ) ) {
\t\t\t$options['cookies'] = self::normalize_cookies( $parsed_args['cookies'] );
\t\t}
`;
  const source = installBootstrap(readFileSync(path, "utf8"));
  const transformed = source.replace(original, replacement);
  if (transformed === source) throw new Error("Unable to replace WP_Http::request cookie option decision branch");
  writeFileSync(path, transformed);
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
\t\t\t'proxy' => isset( $options['proxy'] ) ? get_class( $options['proxy'] ) : null,
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
\t\t$assertions['empty_cookies_omit_option'] = array() === $call['options']['cookies'];
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
    manifest_id: "ownership:wp-core/wp-http-request-cookie-options-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http request cookie option decision",
      area:
        "src/wp-includes/class-wp-http.php with WP_HTTP_Requests_Hooks, WP_HTTP_Requests_Response, WP_HTTP_Proxy, WP_HTTP_Response, and WP_Http_Cookie support",
      public_contract:
        "This candidate promotes only the WP_Http::request decision that non-empty parsed request cookies are normalized and attached to Requests options before dispatch. PHP still owns public WP_Http::request ABI, request defaults and filters, native parsed args arrays, self::normalize_cookies behavior, WP_Http_Cookie/request cookie semantics, Requests cookie option shape, header/SSL/redirect/body/max_bytes handoff, Requests dispatch, response filtering, and native arrays/objects."
    },
    ownership_state: "haxe_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "copied-public-php-shell-calling-generated-haxe",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass request orchestration, selected upstream HTTP PHPUnit, installed distribution, and live/recorded network parity gates before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-request-cookie-options-candidate",
        "npm run wp:core:wphx-312-wp-http-request-cookie-options-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-81-wp-http-request-cookie-options-candidate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  transformCandidateRequestCookieOptions();
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
  const manifest = {
    schema: "wphx.wp-core-wp-http-request-cookie-options-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      request_orchestration_fixture_manifest: inputRecord(REQUEST_ORCHESTRATION_FIXTURE),
      runner: inputRecord(RUNNER),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      haxe_output: HAXE_OUT,
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort(),
      haxe_module: HAXE_MODULE,
      promoted_symbols: PROMOTED_SYMBOLS,
      promoted_behavior:
        "Only the WP_Http::request non-empty request-cookie option branch decision is emitted by generated Haxe PHP. The surrounding public method body, normalize_cookies call, and Requests option array remain a copied candidate shell."
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
          "Requests classes, selected WordPress globals, hook dispatch, URL validation, temp-dir writability, mbstring encoding guards, and option/bloginfo helpers are deterministic stubs. Copied WP_Http and HTTP support classes remain the executed orchestration sources; outbound Requests::request records options or throws without network I/O."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        copied_candidate_public_php_shell: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      },
      native_boundary_policy: {
        native_php_array_shape_required: false,
        escape_hatch_owner: null,
        detail: "The promoted cookie option decision is a pure bool-to-bool Haxe function over PHP-owned empty() evaluation and does not require a target-native escape hatch."
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
        id: "full-request-cookie-options-not-promoted",
        owner: ISSUE.external_ref,
        detail:
          "Only the non-empty parsed cookies branch decision is Haxe-owned. Request defaults/filters, native parsed args arrays, normalize_cookies behavior, WP_Http_Cookie/request cookie semantics, Requests cookie option shape, headers, SSL verification, redirects, body data_format, max_bytes, Requests dispatch, and response filtering remain PHP-owned in this candidate."
      },
      {
        id: "live-requests-network-io-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture records WP_Http's Requests handoff and exception conversion through a stubbed Requests::request boundary. It does not perform live network I/O, DNS, TLS, proxy negotiation, redirect following, or transport execution."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic support stubs rather than an installed WordPress distribution or ecosystem HTTP callers."
      },
      {
        id: "public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
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
      public_php_replacement_claimed: false,
      full_request_orchestration_claimed: false,
      cookie_normalization_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_requests_network_io_claimed: false,
      transport_execution_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-81-wp-http-request-cookie-options-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http request cookie options Haxe candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for WP_Http request cookie options Haxe candidate" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe fixture generator" },
      { path: HXML, role: "Haxe compile target for request cookie options candidate" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-request-cookie-options-candidate",
      "npm run wp:core:wphx-312-wp-http-request-cookie-options-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-46-wp-http-request-orchestration-oracle-fixture"
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
