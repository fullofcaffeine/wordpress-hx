#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-9ze",
  external_ref: "WPHX-COMP-PHP-GROUP-WP-HTTP-HELPERS",
  title: "Group WP_Http parser/header/cookie adapters in one generated shell"
};
const RECORDED_AT = "2026-06-30T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wphx-php/run-wp-http-grouped-helpers.mjs";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-grouped-helpers.hxml";
const HAXE_IMPL_HXML = "fixtures/wphx-php/wp-http-grouped-helpers-impl.hxml";
const OUT_ROOT = "build/wp-core/wphx-comp-php-group-wp-http";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/generated`;
const WPHX_PHP_MANIFEST = `${CANDIDATE_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wphx-php/grouped-wp-http-helpers.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-comp-php-group-wp-http-helpers.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-group-wp-http-helpers.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-cookie.php", "src/wp-includes/class-wp-http.php"];
const CANDIDATE_SUPPORT_FILES = ["src/wp-includes/class-wp-http-cookie.php"];
const PRIOR_INPUTS = [
  "receipts/compiler/wphx-comp-php-03-wp-http-parser-helpers.v1.json",
  "receipts/compiler/wphx-comp-php-04-wp-http-protected-parse-url.v1.json",
  "receipts/compiler/wphx-comp-php-06-wp-http-build-cookie-header.v1.json",
  "receipts/compiler/wphx-comp-php-07-wp-http-process-headers.v1.json",
  "manifests/wphx-php/public-shell-snapshots.v1.json",
  "manifests/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json"
];
const HAXE_SOURCES = [
  WPHX_PHP_HXML,
  HAXE_IMPL_HXML,
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "src/wphx/compiler/php/WphxPhpWordPressAdapters.hx",
  "src/wphx/wp/http/HttpProcessResponse.hx",
  "src/wphx/wp/http/HttpChunkTransferDecode.hx",
  "src/wphx/wp/http/HttpDeprecatedParseUrl.hx",
  "src/wphx/wp/http/HttpCookieHeaderAssembly.hx",
  "src/wphx/wp/http/HttpProcessHeaders.hx",
  "src/wphx/wp/http/HttpIpAddress.hx",
  "src/wphx/wp/http/HttpRedirectCompatibility.hx",
  "src/wphx/wp/http/HttpRedirectValidation.hx",
  "src/wphx/wp/http/HttpAbsoluteUrl.hx",
  "src/wphx/wp/http/HttpBlockRequestPolicy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpGroupedHelpersCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpGroupedHelpersEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpGroupedHelpersShell.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpProcessResponse.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpChunkTransferDecode.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpDeprecatedParseUrl.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpCookieHeaderAssembly.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpProcessHeaders.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpIpAddress.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRedirectCompatibility.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRedirectValidation.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpAbsoluteUrl.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpBlockRequestPolicy.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/PhpHttpGlobals.hx"
];
const CASES = [
  "wp-http-parser:process-response",
  "wp-http-parser:chunk-transfer-decode",
  "wp-http-parser:parse-url-wrapper",
  "wp-http-parser:build-cookie-header",
  "wp-http-parser:process-headers",
  "wp-http:is-ip-address",
  "wp-http:browser-redirect-compatibility",
  "wp-http:validate-redirects",
  "wp-http:make-absolute-url",
  "wp-http-block:disabled",
  "wp-http-block:default-external",
  "wp-http-block:local-filter",
  "wp-http-block:accessible-exact",
  "wp-http-block:accessible-wildcard"
];
const REQUIRED_CORE_IR_FEATURES = [
  "stmt.if",
  "stmt.if-else",
  "stmt.for",
  "stmt.foreach",
  "stmt.foreach-key-value",
  "stmt.assign",
  "stmt.var",
  "stmt.return",
  "stmt.throw",
  "stmt.break",
  "stmt.continue",
  "expr.array-read",
  "expr.array-append",
  "expr.array-write-target",
  "expr.array-coerce",
  "expr.bool",
  "expr.coerce-bool",
  "expr.coerce-int",
  "expr.coerce-string",
  "expr.long-array",
  "expr.new",
  "expr.object-property",
  "expr.class-const",
  "expr.function-call",
  "expr.method-call",
  "expr.null",
  "expr.static-call",
  "expr.binop",
  "expr.assign"
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

function sourceRecord(path) {
  const repoPath = upstreamPath(path);
  return { path, repo_path: repoPath, bytes: statSync(repoPath).size, sha256: sha256File(repoPath) };
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function mirrorSources(root, paths) {
  for (const path of paths) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
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

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
namespace WpOrg\\Requests {
\tclass Autoload {
\t\tpublic static function register() {}
\t}

\tclass Requests {
\t\tpublic const GET = 'GET';

\t\tpublic static function set_certificate_path( $path ) {}
\t}

\tclass Response {
\t\tpublic $status_code;

\t\tpublic function __construct( $status_code = 200 ) {
\t\t\t$this->status_code = $status_code;
\t\t}
\t}

\tclass Exception extends \\Exception {
\t\tpublic $type;

\t\tpublic function __construct( $message = '', $type = '' ) {
\t\t\tparent::__construct( $message );
\t\t\t$this->type = $type;
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

if ( 'wp-http-block:default-external' === $case || 'wp-http-block:local-filter' === $case ) {
\tdefine( 'WP_HTTP_BLOCK_EXTERNAL', true );
}
if ( 'wp-http-block:accessible-exact' === $case ) {
\tdefine( 'WP_HTTP_BLOCK_EXTERNAL', true );
\tdefine( 'WP_ACCESSIBLE_HOSTS', 'api.wordpress.org,updates.example.test' );
}
if ( 'wp-http-block:accessible-wildcard' === $case ) {
\tdefine( 'WP_HTTP_BLOCK_EXTERNAL', true );
\tdefine( 'WP_ACCESSIBLE_HOSTS', '*.wordpress.org,downloads.example.test' );
}

$GLOBALS['wphx_deprecated'] = array();
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_force_block_local'] = 'wp-http-block:local-filter' === $case;

function _deprecated_function( $function_name, $version, $replacement = '' ) {
\t$GLOBALS['wphx_deprecated'][] = array( 'function' => $function_name, 'version' => $version, 'replacement' => $replacement );
}

function wp_parse_url( $url ) {
\tif ( 'fixture://parse-fail' === $url || 'fixture://relative-parse-fail' === $url ) {
\t\treturn false;
\t}
\treturn parse_url( $url );
}

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );
\tif ( 'wp_http_cookie_value' === $hook_name ) {
\t\treturn 'filtered-' . $args[0] . '-' . str_replace( ' ', '_', (string) $value );
\t}
\tif ( 'block_local_requests' === $hook_name && ! empty( $GLOBALS['wphx_force_block_local'] ) ) {
\t\treturn true;
\t}
\treturn $value;
}

function get_option( $name ) {
\treturn 'siteurl' === $name ? 'https://site.example.test/wp' : null;
}

function __( $text ) {
\treturn $text;
}

function wp_http_validate_url( $location ) {
\treturn str_starts_with( $location, 'https://valid.example/' ) ? $location : false;
}

function wphx_summarize( $value ) {
\tif ( $value instanceof WP_Http_Cookie ) {
\t\treturn array(
\t\t\t'class' => get_class( $value ),
\t\t\t'name' => $value->name,
\t\t\t'value' => $value->value,
\t\t\t'expires' => $value->expires,
\t\t\t'path' => $value->path,
\t\t\t'domain' => $value->domain,
\t\t\t'port' => $value->port,
\t\t\t'host_only' => $value->host_only,
\t\t\t'attributes' => $value->get_attributes(),
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'class' => get_class( $value ), 'vars' => get_object_vars( $value ) );
\t}
\tif ( is_array( $value ) ) {
\t\t$out = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$out[ $key ] = wphx_summarize( $item );
\t\t}
\t\treturn $out;
\t}
\treturn $value;
}

require ABSPATH . WPINC . '/class-wp-http-cookie.php';
require ABSPATH . WPINC . '/class-wp-http.php';

class WPHX_Parse_Url_Probe extends WP_Http {
\tpublic static function expose_parse_url( $url ) {
\t\treturn parent::parse_url( $url );
\t}
}

$result = array( 'case' => $case );
$assertions = array();

switch ( $case ) {
\tcase 'wp-http-parser:process-response':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'processResponse' );
\t\t$split = WP_Http::processResponse( "HTTP/1.1 200 OK\\r\\nX-Test: yes\\r\\n\\r\\nbody\\r\\nwith delimiter\\r\\n\\r\\nkept" );
\t\t$header_only = WP_Http::processResponse( "HTTP/1.1 204 No Content\\r\\nX-Empty: true" );
\t\t$result['split'] = $split;
\t\t$result['header_only'] = $header_only;
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => $reflection->getNumberOfParameters() );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 1 === $reflection->getNumberOfParameters();
\t\t$assertions['split_header'] = "HTTP/1.1 200 OK\\r\\nX-Test: yes" === $split['headers'];
\t\t$assertions['split_body_keeps_later_delimiter'] = "body\\r\\nwith delimiter\\r\\n\\r\\nkept" === $split['body'];
\t\t$assertions['missing_body_defaults_empty'] = "HTTP/1.1 204 No Content\\r\\nX-Empty: true" === $header_only['headers'] && '' === $header_only['body'];
\t\tbreak;
\tcase 'wp-http-parser:chunk-transfer-decode':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'chunkTransferDecode' );
\t\t$valid = "9\\r\\nWikipedia\\r\\n0";
\t\t$extension = "4;ext=value\\r\\nTest\\r\\n0";
\t\t$inter_chunk_crlf = "4\\r\\nWiki\\r\\n5\\r\\npedia\\r\\n0";
\t\t$malformed = "4\\r\\nWiki\\r\\n5\\r\\nped";
\t\t$plain = "plain body";
\t\t$result['decoded'] = array(
\t\t\t'valid' => WP_Http::chunkTransferDecode( $valid ),
\t\t\t'extension' => WP_Http::chunkTransferDecode( $extension ),
\t\t\t'inter_chunk_crlf' => WP_Http::chunkTransferDecode( $inter_chunk_crlf ),
\t\t\t'plain' => WP_Http::chunkTransferDecode( $plain ),
\t\t\t'malformed' => WP_Http::chunkTransferDecode( $malformed ),
\t\t);
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => $reflection->getNumberOfParameters() );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 1 === $reflection->getNumberOfParameters();
\t\t$assertions['valid_decoded'] = 'Wikipedia' === $result['decoded']['valid'];
\t\t$assertions['extension_decoded'] = 'Test' === $result['decoded']['extension'];
\t\t$assertions['inter_chunk_crlf_passthrough'] = $inter_chunk_crlf === $result['decoded']['inter_chunk_crlf'];
\t\t$assertions['plain_passthrough'] = $plain === $result['decoded']['plain'];
\t\t$assertions['malformed_passthrough'] = $malformed === $result['decoded']['malformed'];
\t\tbreak;
\tcase 'wp-http-parser:parse-url-wrapper':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'parse_url' );
\t\t$parsed = WPHX_Parse_Url_Probe::expose_parse_url( 'https://user:pass@example.test:8443/path/file.php?x=1#frag' );
\t\t$result['parsed'] = $parsed;
\t\t$result['deprecated'] = $GLOBALS['wphx_deprecated'];
\t\t$result['reflection'] = array( 'visibility' => $reflection->isProtected() ? 'protected' : 'not-protected', 'static' => $reflection->isStatic(), 'params' => $reflection->getNumberOfParameters() );
\t\t$assertions['reflection'] = $reflection->isProtected() && $reflection->isStatic() && 1 === $reflection->getNumberOfParameters();
\t\t$assertions['parsed_shape'] = array(
\t\t\t'scheme' => 'https',
\t\t\t'host' => 'example.test',
\t\t\t'port' => 8443,
\t\t\t'user' => 'user',
\t\t\t'pass' => 'pass',
\t\t\t'path' => '/path/file.php',
\t\t\t'query' => 'x=1',
\t\t\t'fragment' => 'frag',
\t\t) === $parsed;
\t\t$assertions['deprecated_recorded'] = 1 === count( $GLOBALS['wphx_deprecated'] ) && 'WP_Http::parse_url' === $GLOBALS['wphx_deprecated'][0]['function'] && '4.4.0' === $GLOBALS['wphx_deprecated'][0]['version'] && 'wp_parse_url()' === $GLOBALS['wphx_deprecated'][0]['replacement'];
\t\tbreak;
\tcase 'wp-http-parser:build-cookie-header':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'buildCookieHeader' );
\t\t$params = $reflection->getParameters();
\t\t$request = array(
\t\t\t'headers' => array(),
\t\t\t'cookies' => array(
\t\t\t\t'scalar' => 'plain value',
\t\t\t\t'object' => new WP_Http_Cookie( array( 'name' => 'object', 'value' => 'raw value', 'path' => '/', 'domain' => 'example.test' ), 'https://example.test/' ),
\t\t\t),
\t\t);
\t\tWP_Http::buildCookieHeader( $request );
\t\t$result['request'] = wphx_summarize( $request );
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $params ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 1 === count( $params ) && $params[0]->isPassedByReference();
\t\t$assertions['scalar_upgraded'] = $request['cookies']['scalar'] instanceof WP_Http_Cookie && 'scalar' === $request['cookies']['scalar']->name && 'plain value' === $request['cookies']['scalar']->value;
\t\t$assertions['object_preserved'] = $request['cookies']['object'] instanceof WP_Http_Cookie && 'object' === $request['cookies']['object']->name;
\t\t$assertions['cookie_header'] = 'scalar=filtered-scalar-plain_value; object=filtered-object-raw_value' === $request['headers']['cookie'];
\t\t$assertions['filter_payloads'] = 2 === count( $GLOBALS['wphx_filters'] ) && 'wp_http_cookie_value' === $GLOBALS['wphx_filters'][0]['hook'] && 'scalar' === $GLOBALS['wphx_filters'][0]['args'][0] && 'object' === $GLOBALS['wphx_filters'][1]['args'][0];
\t\tbreak;
\tcase 'wp-http-parser:process-headers':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'processHeaders' );
\t\t$params = $reflection->getParameters();
\t\t$headers = "HTTP/1.1 301 Moved Permanently\\r\\nLocation: https://example.test/old\\r\\nX-Discard: first\\r\\n\\r\\nHTTP/1.1 200 OK\\r\\nX-Multi: one\\r\\nX-Multi: two\\r\\nX-Fold: first\\r\\n second\\r\\nSet-Cookie: session=abc%20123; expires=Tue, 01 Jan 2030 00:00:00 GMT; path=/wp/; domain=.example.test\\r\\nSet-Cookie: pref=dark; path=/; domain=example.test\\r\\n";
\t\t$processed = WP_Http::processHeaders( $headers, 'https://example.test/wp-admin/post.php' );
\t\t$empty = WP_Http::processHeaders( array( '', false, null ), '' );
\t\t$result['processed'] = wphx_summarize( $processed );
\t\t$result['empty'] = wphx_summarize( $empty );
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference(), 'default' => $param->isDefaultValueAvailable() ? $param->getDefaultValue() : null ); }, $params ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 2 === count( $params ) && 'headers' === $params[0]->getName() && 'url' === $params[1]->getName() && $params[1]->isDefaultValueAvailable() && '' === $params[1]->getDefaultValue();
\t\t$assertions['final_response_selected'] = array( 'code' => 200, 'message' => 'OK' ) === $processed['response'];
\t\t$assertions['duplicate_headers_array'] = array( 'one', 'two' ) === $processed['headers']['x-multi'];
\t\t$assertions['folded_header_unfolded'] = 'first second' === $processed['headers']['x-fold'];
\t\t$assertions['redirect_headers_discarded'] = ! isset( $processed['headers']['x-discard'] );
\t\t$assertions['cookies_converted'] = 2 === count( $processed['cookies'] ) && 'session' === $processed['cookies'][0]->name && 'abc 123' === $processed['cookies'][0]->value && '/wp/' === $processed['cookies'][0]->path && '.example.test' === $processed['cookies'][0]->domain && 'pref' === $processed['cookies'][1]->name;
\t\t$assertions['empty_falsey_shape'] = array( 'response' => array( 'code' => 0, 'message' => '' ), 'headers' => array(), 'cookies' => array() ) === $empty;
\t\tbreak;
\tcase 'wp-http:is-ip-address':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'is_ip_address' );
\t\t$result['addresses'] = array(
\t\t\t'ipv4' => WP_Http::is_ip_address( '192.0.2.10' ),
\t\t\t'ipv6' => WP_Http::is_ip_address( '2001:db8::1' ),
\t\t\t'bracketed_ipv6' => WP_Http::is_ip_address( '[2001:db8::1]' ),
\t\t\t'host' => WP_Http::is_ip_address( 'example.test' ),
\t\t\t'regex_shaped_invalid_ipv4' => WP_Http::is_ip_address( '999.999.999.999' ),
\t\t);
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $reflection->getParameters() ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 1 === $reflection->getNumberOfParameters() && 'maybe_ip' === $reflection->getParameters()[0]->getName();
\t\t$assertions['ipv4'] = 4 === $result['addresses']['ipv4'];
\t\t$assertions['ipv6'] = 6 === $result['addresses']['ipv6'] && 6 === $result['addresses']['bracketed_ipv6'];
\t\t$assertions['host_false'] = false === $result['addresses']['host'];
\t\t$assertions['regex_shaped_invalid_ipv4_returns_4'] = 4 === $result['addresses']['regex_shaped_invalid_ipv4'];
\t\tbreak;
\tcase 'wp-http:browser-redirect-compatibility':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'browser_redirect_compatibility' );
\t\t$params = $reflection->getParameters();
\t\t$options302 = array( 'type' => 'POST' );
\t\tWP_Http::browser_redirect_compatibility( 'https://redirect.example/next', array(), 'payload', $options302, new WpOrg\\Requests\\Response( 302 ) );
\t\t$options301 = array( 'type' => 'POST' );
\t\tWP_Http::browser_redirect_compatibility( 'https://redirect.example/next', array(), 'payload', $options301, new WpOrg\\Requests\\Response( 301 ) );
\t\t$result['options_302'] = $options302;
\t\t$result['options_301'] = $options301;
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $params ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 5 === count( $params ) && 'options' === $params[3]->getName() && $params[3]->isPassedByReference();
\t\t$assertions['status_302_switches_to_get'] = 'GET' === $options302['type'];
\t\t$assertions['status_301_preserves_type'] = 'POST' === $options301['type'];
\t\tbreak;
\tcase 'wp-http:validate-redirects':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'validate_redirects' );
\t\t$params = $reflection->getParameters();
\t\t$valid = 'no-throw';
\t\t$error = null;
\t\tWP_Http::validate_redirects( 'https://valid.example/path' );
\t\ttry {
\t\t\tWP_Http::validate_redirects( 'ftp://invalid.example/path' );
\t\t} catch ( WpOrg\\Requests\\Exception $exception ) {
\t\t\t$error = array( 'class' => get_class( $exception ), 'message' => $exception->getMessage(), 'type' => $exception->type );
\t\t}
\t\t$result['valid'] = $valid;
\t\t$result['error'] = $error;
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $params ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 1 === count( $params ) && 'location' === $params[0]->getName();
\t\t$assertions['valid_no_throw'] = 'no-throw' === $valid;
\t\t$assertions['invalid_exception'] = array( 'class' => 'WpOrg\\\\Requests\\\\Exception', 'message' => 'A valid URL was not provided.', 'type' => 'wp_http.redirect_failed_validation' ) === $error;
\t\tbreak;
\tcase 'wp-http:make-absolute-url':
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'make_absolute_url' );
\t\t$params = $reflection->getParameters();
\t\t$base = 'https://example.test/wp-admin/css/edit.css';
\t\t$result['urls'] = array(
\t\t\t'absolute' => WP_Http::make_absolute_url( 'https://other.test/x', $base ),
\t\t\t'schemeless' => WP_Http::make_absolute_url( '//cdn.example.test:8443/lib.js', $base ),
\t\t\t'root_relative' => WP_Http::make_absolute_url( '/assets/app.js?ver=1#top', $base ),
\t\t\t'relative_parent' => WP_Http::make_absolute_url( '../img/logo.png?x=1#frag', $base ),
\t\t\t'query_fragment' => WP_Http::make_absolute_url( '?updated=1#section', $base ),
\t\t\t'empty_base' => WP_Http::make_absolute_url( 'relative/file.txt', '' ),
\t\t\t'base_parse_fail' => WP_Http::make_absolute_url( 'relative/file.txt', 'fixture://parse-fail' ),
\t\t\t'relative_parse_fail' => WP_Http::make_absolute_url( 'fixture://relative-parse-fail', $base ),
\t\t);
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $params ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && $reflection->isStatic() && 2 === count( $params ) && 'maybe_relative_path' === $params[0]->getName() && 'url' === $params[1]->getName();
\t\t$assertions['absolute'] = 'https://other.test/x' === $result['urls']['absolute'];
\t\t$assertions['schemeless'] = 'https://cdn.example.test:8443/lib.js' === $result['urls']['schemeless'];
\t\t$assertions['root_relative'] = 'https://example.test/assets/app.js?ver=1#top' === $result['urls']['root_relative'];
\t\t$assertions['relative_parent'] = 'https://example.test/wp-admin/img/logo.png?x=1#frag' === $result['urls']['relative_parent'];
\t\t$assertions['query_fragment'] = 'https://example.test/wp-admin/css/edit.css?updated=1#section' === $result['urls']['query_fragment'];
\t\t$assertions['parse_failures_passthrough'] = 'relative/file.txt' === $result['urls']['empty_base'] && 'relative/file.txt' === $result['urls']['base_parse_fail'] && 'fixture://relative-parse-fail' === $result['urls']['relative_parse_fail'];
\t\tbreak;
\tcase 'wp-http-block:disabled':
\t\t$http = new WP_Http();
\t\t$reflection = new ReflectionMethod( 'WP_Http', 'block_request' );
\t\t$result['blocked'] = array(
\t\t\t'external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t\t'malformed' => $http->block_request( 'http://' ),
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t);
\t\t$result['reflection'] = array( 'visibility' => $reflection->isPublic() ? 'public' : 'non-public', 'static' => $reflection->isStatic(), 'params' => array_map( function ( $param ) { return array( 'name' => $param->getName(), 'by_ref' => $param->isPassedByReference() ); }, $reflection->getParameters() ) );
\t\t$assertions['reflection'] = $reflection->isPublic() && ! $reflection->isStatic() && 1 === $reflection->getNumberOfParameters() && 'uri' === $reflection->getParameters()[0]->getName();
\t\t$assertions['nothing_blocked_when_disabled'] = array( 'external' => false, 'malformed' => false, 'localhost' => false ) === $result['blocked'];
\t\tbreak;
\tcase 'wp-http-block:default-external':
\t\t$http = new WP_Http();
\t\t$result['blocked'] = array(
\t\t\t'external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t\t'malformed' => $http->block_request( 'http://' ),
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t\t'site_host' => $http->block_request( 'https://site.example.test/wp-json/' ),
\t\t);
\t\t$result['filter_calls'] = $GLOBALS['wphx_filters'];
\t\t$assertions['external_and_malformed_blocked'] = true === $result['blocked']['external'] && true === $result['blocked']['malformed'];
\t\t$assertions['local_and_site_allowed'] = false === $result['blocked']['localhost'] && false === $result['blocked']['site_host'];
\t\t$assertions['local_filter_called_twice'] = 2 === count( array_filter( $GLOBALS['wphx_filters'], static function ( $call ) { return 'block_local_requests' === $call['hook']; } ) );
\t\tbreak;
\tcase 'wp-http-block:local-filter':
\t\t$http = new WP_Http();
\t\t$result['blocked'] = array(
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t\t'site_host' => $http->block_request( 'https://site.example.test/wp-json/' ),
\t\t);
\t\t$result['filter_calls'] = $GLOBALS['wphx_filters'];
\t\t$assertions['local_filter_can_block_local_and_site'] = array( 'localhost' => true, 'site_host' => true ) === $result['blocked'];
\t\tbreak;
\tcase 'wp-http-block:accessible-exact':
\t\t$http = new WP_Http();
\t\t$result['blocked'] = array(
\t\t\t'api_wordpress_org' => $http->block_request( 'https://api.wordpress.org/core/version-check/1.7/' ),
\t\t\t'updates_example' => $http->block_request( 'https://updates.example.test/package.zip' ),
\t\t\t'subdomain_not_exact' => $http->block_request( 'https://downloads.wordpress.org/plugin/example.zip' ),
\t\t\t'other_external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t);
\t\t$assertions['exact_hosts_allowed'] = false === $result['blocked']['api_wordpress_org'] && false === $result['blocked']['updates_example'];
\t\t$assertions['non_exact_and_other_blocked'] = true === $result['blocked']['subdomain_not_exact'] && true === $result['blocked']['other_external'];
\t\tbreak;
\tcase 'wp-http-block:accessible-wildcard':
\t\t$http = new WP_Http();
\t\t$result['blocked'] = array(
\t\t\t'api_wordpress_org' => $http->block_request( 'https://api.wordpress.org/core/version-check/1.7/' ),
\t\t\t'downloads_wordpress_org' => $http->block_request( 'https://downloads.wordpress.org/plugin/example.zip' ),
\t\t\t'root_wordpress_org' => $http->block_request( 'https://wordpress.org/news/' ),
\t\t\t'downloads_example_exact' => $http->block_request( 'https://downloads.example.test/file.zip' ),
\t\t\t'blocked_external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t);
\t\t$assertions['wildcard_subdomains_allowed'] = false === $result['blocked']['api_wordpress_org'] && false === $result['blocked']['downloads_wordpress_org'];
\t\t$assertions['root_and_other_external_blocked'] = true === $result['blocked']['root_wordpress_org'] && true === $result['blocked']['blocked_external'];
\t\t$assertions['exact_entry_still_allowed'] = false === $result['blocked']['downloads_example_exact'];
\t\tbreak;
\tdefault:
\t\t$assertions['known_case'] = false;
}

$result['assertions'] = $assertions;
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
}
`
  );
}

function runProbe(root) {
  const observations = {};
  for (const testCase of CASES) {
    observations[testCase] = JSON.parse(command("php", [PROBE, root, testCase]));
  }
  return observations;
}

function allAssertionsPass(observations) {
  return Object.values(observations).every((entry) => Object.values(entry.assertions).every(Boolean));
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wphx-php/grouped-wp-http-helpers",
    issue: ISSUE,
    unit: {
      kind: "compiler-emitted-original-path-public-shell",
      name: "Grouped WP_Http parser/header/cookie/IP/redirect/absolute URL/block-request helper shell",
      path: "wp-includes/class-wp-http.php",
      public_contract:
        "One generated WP_Http class shell must preserve processResponse, chunkTransferDecode, protected parse_url, buildCookieHeader(&$r), processHeaders($headers, $url = ''), is_ip_address($maybe_ip), browser_redirect_compatibility(..., &$options, $original), validate_redirects($location), make_absolute_url($maybe_relative_path, $url), and block_request($uri) ABI and behavior gates in one original-path file."
    },
    ownership_state: "compiler_emitted_original_path_shell",
    ownership_axes: {
      semantic_owner: "haxe_helpers_for_bounded_decisions",
      adapter_contract_owner: "wphx_php_adapter_ir",
      emission_strategy: "wphx_php_staged_custom_compiler",
      execution_provider: "php_cli",
      compatibility_evidence: "oracle_candidate_behavior_and_reflection"
    },
    bridge: {
      exists: true,
      kind: "copied-upstream-support-class-only",
      removal_gate:
        "Generated WP_Http_Cookie and full class-wp-http.php ownership remain future work. This gate only claims the grouped helper shell methods listed in the manifest."
    },
    owned_paths: [RUNNER, WPHX_PHP_HXML, HAXE_IMPL_HXML, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      commands: [
        "npm run wphx:php:wp-http-grouped-helpers",
        "npm run wphx:php:wp-http-grouped-helpers:check",
        "npm run wphx:php:wp-http-parser-helpers:check",
        "npm run wphx:php:wp-http-build-cookie-header:check",
        "npm run wphx:php:wp-http-process-headers:check"
      ],
      receipt_refs: ["receipt:wphx-comp-php-group-wp-http-helpers"],
      manifest_digest: manifestSha
    },
    notes:
      "This grouped shell proves neighboring helpers can coexist in one generated original-path WP_Http adapter. It does not claim WP_Http::request, whole-file WP_Http ownership, live HTTP transport, installed behavior, or mixed-template ownership."
  };
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HAXE_IMPL_HXML]);
  command("haxe", [WPHX_PHP_HXML]);
  mirrorSources(ORACLE_ROOT, SOURCE_FILES);
  mirrorSources(CANDIDATE_ROOT, CANDIDATE_SUPPORT_FILES);
  writeProbe();

  const generatedShell = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  const generatedCookie = `${CANDIDATE_ROOT}/wp-includes/class-wp-http-cookie.php`;
  const phpLint = {
    generated_shell: command("php", ["-l", generatedShell]),
    candidate_cookie: command("php", ["-l", generatedCookie])
  };

  const oracle = runProbe(ORACLE_ROOT);
  const candidate = runProbe(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const assertionsPass = allAssertionsPass(candidate);
  if (!observationsMatch || !assertionsPass) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate, observationsMatch, assertionsPass }, null, 2));
    process.exit(1);
  }

  const generatedSource = readFileSync(generatedShell, "utf8");
  const wphxManifest = JSON.parse(readFileSync(WPHX_PHP_MANIFEST, "utf8"));
  const declarations = wphxManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
  const shellChecks = {
    emitted_class: declarations.includes("class:WP_Http"),
    unsupported_empty: wphxManifest.unsupported.length === 0,
    core_ir_features: REQUIRED_CORE_IR_FEATURES.every((feature) => wphxManifest.core_ir_features?.includes(feature)),
    grouped_methods:
      /public\s+static\s+function\s+processResponse\s*\(\s*\$response\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+chunkTransferDecode\s*\(\s*\$body\s*\)/.test(generatedSource) &&
      /protected\s+static\s+function\s+parse_url\s*\(\s*\$url\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+buildCookieHeader\s*\(\s*&\$r\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+processHeaders\s*\(\s*\$headers\s*,\s*\$url\s*=\s*''\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+is_ip_address\s*\(\s*\$maybe_ip\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+browser_redirect_compatibility\s*\(\s*\$location\s*,\s*\$headers\s*,\s*\$data\s*,\s*&\$options\s*,\s*\$original\s*\)/.test(
        generatedSource
      ) &&
      /public\s+static\s+function\s+validate_redirects\s*\(\s*\$location\s*\)/.test(generatedSource) &&
      /public\s+static\s+function\s+make_absolute_url\s*\(\s*\$maybe_relative_path\s*,\s*\$url\s*\)/.test(generatedSource) &&
      /public\s+function\s+block_request\s*\(\s*\$uri\s*\)/.test(generatedSource),
    one_wp_http_class: (generatedSource.match(/class WP_Http/g) ?? []).length === 1,
    wordpress_bootstrap_profile: generatedSource.includes("HAXE_CUSTOM_ERROR_HANDLER") && generatedSource.includes("WPHX_WP_HTTP_GROUPED_HELPERS_BOOTSTRAPPED"),
    parser_delegation: generatedSource.includes("HttpProcessResponse_Fields_::responseHeaders") && generatedSource.includes("HttpChunkTransferDecode_Fields_::decodeChunkTransfer"),
    header_cookie_ir: generatedSource.includes("$r['headers']['cookie'] = $cookies_header;") && generatedSource.includes("$cookies[] = new WP_Http_Cookie( $value, $url );"),
    ip_address_delegation: generatedSource.includes("HttpIpAddress_Fields_::ipAddressVersion"),
    redirect_compatibility_ir:
      generatedSource.includes("HttpRedirectCompatibility_Fields_::shouldUseBrowserGet") &&
      generatedSource.includes("$options['type'] = \\WpOrg\\Requests\\Requests::GET;"),
    redirect_validation_ir:
      generatedSource.includes("HttpRedirectValidation_Fields_::shouldRejectRedirect") &&
      generatedSource.includes("wp_http_validate_url( $location )") &&
      generatedSource.includes("throw new \\WpOrg\\Requests\\Exception"),
    absolute_url_ir:
      generatedSource.includes("HttpAbsoluteUrl_Fields_::makeAbsoluteUrl") &&
      generatedSource.includes("wp_parse_url( $url )") &&
      generatedSource.includes("wp_parse_url( $maybe_relative_path )") &&
      generatedSource.includes("return $maybe_relative_path;"),
    block_request_ir:
      generatedSource.includes("HttpBlockRequestPolicy_Fields_::isLocalRequest") &&
      generatedSource.includes("HttpBlockRequestPolicy_Fields_::shouldBlockExternalHost") &&
      generatedSource.includes("defined( 'WP_HTTP_BLOCK_EXTERNAL' )") &&
      generatedSource.includes("constant( 'WP_ACCESSIBLE_HOSTS' )") &&
      generatedSource.includes("apply_filters( 'block_local_requests', false )")
  };
  if (!Object.values(shellChecks).every(Boolean)) {
    console.error(JSON.stringify({ status: "failed", reason: "shell checks failed", shellChecks, declarations, unsupported: wphxManifest.unsupported }, null, 2));
    process.exit(1);
  }

  const manifest = {
    schema: "wphx.wphx-php-grouped-wp-http-helpers.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "compiler_emitted_original_path_shell",
    artifact_scope: "grouped_wordpress_public_adapter",
    inputs: {
      prior_inputs: PRIOR_INPUTS.map(inputRecord),
      haxe_sources: HAXE_SOURCES.concat([RUNNER]).map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST)
    },
    generated: {
      root: CANDIDATE_ROOT,
      shell: inputRecord(generatedShell),
      support_files: [inputRecord(generatedCookie)],
      declarations,
      core_ir_features: wphxManifest.core_ir_features,
      unsupported: wphxManifest.unsupported
    },
    cases: CASES,
    observations: { oracle, candidate, matches: observationsMatch },
    php_lint: phpLint,
    shell_checks: shellChecks,
    validation_result: {
      status: "passed",
      observations_match: observationsMatch,
      assertions_pass: assertionsPass,
      unsupported_empty: wphxManifest.unsupported.length === 0,
      emitted_methods: [
        "WP_Http::processResponse",
        "WP_Http::chunkTransferDecode",
        "WP_Http::parse_url",
        "WP_Http::buildCookieHeader",
        "WP_Http::processHeaders",
        "WP_Http::is_ip_address",
        "WP_Http::browser_redirect_compatibility",
        "WP_Http::validate_redirects",
        "WP_Http::make_absolute_url",
        "WP_Http::block_request"
      ]
    },
    claims: {
      compiler_emitted_original_path_shell: true,
      one_generated_wp_http_class: true,
      grouped_helper_methods_claimed: true,
      whole_file_wp_http_owned: false,
      wp_http_request_owned: false,
      live_http_transport_owned: false,
      installed_distribution_behavior_claimed: false
    },
    ownership_manifest: OWNERSHIP
  };
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-group-wp-http-helpers",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    commands: [
      "npm run wphx:php:wp-http-grouped-helpers",
      "npm run wphx:php:wp-http-grouped-helpers:check",
      "npm run wphx:php:wp-http-parser-helpers:check",
      "npm run wphx:php:wp-http-build-cookie-header:check",
      "npm run wphx:php:wp-http-process-headers:check"
    ],
    artifacts: [
      { path: OUT, role: "grouped WP_Http helper compiler manifest", sha256: manifestSha },
      { path: OWNERSHIP, role: "ownership manifest for grouped WP_Http helper shell" },
      { path: generatedShell, role: "generated original-path grouped WP_Http shell" }
    ],
    validation_result: manifest.validation_result,
    claims: [
      "WPHX PHP emits one original-path wp-includes/class-wp-http.php adapter containing processResponse, chunkTransferDecode, protected parse_url, buildCookieHeader(&$r), processHeaders($headers, $url = ''), is_ip_address($maybe_ip), browser_redirect_compatibility(..., &$options, $original), validate_redirects($location), make_absolute_url($maybe_relative_path, $url), and block_request($uri).",
      "The grouped shell passes PHP lint, PHP reflection, behavior parity against the copied WordPress oracle for all fourteen helper cases, and WPHX PHP manifest unsupported=[].",
      "The shell combines parser-helper delegation with reusable PHP-core IR bodies for native array cookie/header helpers, direct static-helper IP detection, object-property reads, class constants, by-reference redirect option mutation, boolean coercion, Requests exception throwing, null and bool literals, PHP-owned wp_parse_url boundary handling before Haxe absolute URL assembly, and PHP-owned block_request constants/options/filter boundaries around Haxe policy helpers."
    ],
    non_claims: [
      "This does not claim whole-file WP_Http ownership.",
      "This does not claim WP_Http::request ownership, live HTTP transport, installed WordPress distribution behavior, generated WP_Http_Cookie ownership, or mixed PHP/HTML template ownership.",
      "This does not claim WPHX PHP is already a complete arbitrary-Haxe PHP backend."
    ]
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, ownershipText);
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
        cases: CASES.length,
        declarations,
        shell_checks: shellChecks
      },
      null,
      2
    )
  );
}

main();
