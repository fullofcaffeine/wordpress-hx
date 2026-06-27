#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.30",
  external_ref: "WPHX-312.43",
  title: "WPHX-312.43 - Add HTTP API wrapper and safety oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-api-wrapper-safety-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-43";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_CORE_FIXTURE = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const HELPER_FIXTURE = "manifests/wp-core/wphx-312-41-wp-http-helper-oracle-fixture.v1.json";
const PARSER_FIXTURE = "manifests/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/http.php"];
const COVERED_SYMBOLS = [
  "_wp_http_get_object",
  "wp_safe_remote_request",
  "wp_safe_remote_get",
  "wp_safe_remote_post",
  "wp_safe_remote_head",
  "wp_remote_request",
  "wp_remote_get",
  "wp_remote_post",
  "wp_remote_head",
  "wp_http_supports",
  "get_http_origin",
  "get_allowed_http_origins",
  "is_allowed_http_origin",
  "wp_http_validate_url",
  "allowed_http_request_hosts",
  "ms_allowed_http_request_hosts",
  "WpOrg\\Requests\\Requests::has_capabilities",
  "WP_Http::request",
  "WP_Http::get",
  "WP_Http::post",
  "WP_Http::head",
  "http_origin",
  "allowed_http_origins",
  "allowed_http_origin",
  "http_request_host_is_external",
  "http_allowed_safe_ports"
];
const CASES = [
  { id: "http-api:request-wrappers", focus: "safe and unsafe wp_remote_* wrappers reuse one WP_Http object and hand off method/reject_unsafe_urls state" },
  { id: "http-api:supports", focus: "wp_http_supports normalizes numeric capabilities and injects ssl for https/ssl URLs" },
  { id: "http-api:origins", focus: "origin helpers apply filters, derive admin/home origins, and authorize allowed origins" },
  { id: "http-api:validate-url", focus: "wp_http_validate_url protocol, userinfo, malformed host, same-host port, local-IP filter, and safe-port filter behavior" },
  { id: "http-api:allowed-hosts", focus: "allowed_http_request_hosts and ms_allowed_http_request_hosts bridge redirect/network/database domain allowances" }
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
\tclass Requests {
\t\tpublic static $capability_calls = array();

\t\tpublic static function has_capabilities( $capabilities ) {
\t\t\tself::$capability_calls[] = $capabilities;
\t\t\treturn empty( $capabilities['unsupported'] );
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

$_SERVER['HTTP_ORIGIN'] = 'https://custom.example';

$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_redirect_checks'] = array();
$GLOBALS['wphx_options'] = array( 'home' => 'https://home.example:8443/site' );
$GLOBALS['wpdb'] = new class {
\tpublic $blogs = 'wp_blogs';
\tpublic $queries = array();

\tpublic function prepare( $query, $host ) {
\t\t$this->queries[] = array( 'type' => 'prepare', 'query' => $query, 'host' => $host );
\t\treturn 'prepared:' . $host;
\t}

\tpublic function get_var( $query ) {
\t\t$this->queries[] = array( 'type' => 'get_var', 'query' => $query );
\t\treturn 'prepared:site.example' === $query ? 'site.example' : null;
\t}
};

class WP_Error {}

class WP_Http {
\tpublic static $instances = 0;
\tpublic static $calls = array();
\tpublic $instance_id;

\tpublic function __construct() {
\t\tself::$instances++;
\t\t$this->instance_id = self::$instances;
\t}

\tprivate function record( $method, $url, $args ) {
\t\t$entry = array( 'instance_id' => $this->instance_id, 'method' => $method, 'url' => $url, 'args' => $args );
\t\tself::$calls[] = $entry;
\t\treturn array( 'fixture_http_call' => $entry );
\t}

\tpublic function request( $url, $args = array() ) { return $this->record( 'request', $url, $args ); }
\tpublic function get( $url, $args = array() ) { return $this->record( 'get', $url, $args ); }
\tpublic function post( $url, $args = array() ) { return $this->record( 'post', $url, $args ); }
\tpublic function head( $url, $args = array() ) { return $this->record( 'head', $url, $args ); }
}

function wp_parse_args( $args = array(), $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$args = get_object_vars( $args );
\t} elseif ( ! is_array( $args ) ) {
\t\tparse_str( (string) $args, $args );
\t}
\treturn array_merge( $defaults, $args );
}

function is_wp_error( $value ) {
\treturn $value instanceof WP_Error;
}

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );
\tif ( 'http_origin' === $hook_name && 'https://custom.example' === $value ) {
\t\treturn 'https://filtered-origin.example';
\t}
\tif ( 'allowed_http_origins' === $hook_name ) {
\t\t$value[] = 'https://filtered-origin.example';
\t\t$value[] = 'https://extra.example';
\t\treturn array_values( array_unique( $value ) );
\t}
\tif ( 'allowed_http_origin' === $hook_name && 'https://blocked.example' === $args[0] ) {
\t\treturn 'https://override.example';
\t}
\tif ( 'http_request_host_is_external' === $hook_name && '192.168.0.1' === $args[0] && str_contains( $args[1], 'allow-local' ) ) {
\t\treturn true;
\t}
\tif ( 'http_allowed_safe_ports' === $hook_name && '198.51.100.10' === $args[0] && str_contains( $args[1], ':81/' ) ) {
\t\t$value[] = 81;
\t}
\treturn $value;
}

function wp_kses_bad_protocol( $string, $allowed_protocols ) {
\t$scheme = parse_url( $string, PHP_URL_SCHEME );
\tif ( $scheme && ! in_array( strtolower( $scheme ), $allowed_protocols, true ) ) {
\t\treturn '';
\t}
\treturn $string;
}

function get_option( $name ) {
\treturn $GLOBALS['wphx_options'][ $name ] ?? null;
}

function admin_url( $path = '' ) {
\treturn 'https://admin.example/wp-admin/' . ltrim( $path, '/' );
}

function home_url( $path = '' ) {
\treturn 'https://home.example/site/' . ltrim( $path, '/' );
}

function wp_validate_redirect( $location ) {
\t$GLOBALS['wphx_redirect_checks'][] = $location;
\treturn in_array( parse_url( $location, PHP_URL_HOST ), array( 'redirect.example', 'site.example' ), true ) ? $location : false;
}

function get_network() {
\treturn (object) array( 'domain' => 'network.example' );
}

function wphx_summarize( $value ) {
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

require ABSPATH . WPINC . '/http.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-api:request-wrappers':
\t\tWP_Http::$calls = array();
\t\t$safe_request = wp_safe_remote_request( 'https://api.example/request', array( 'timeout' => 7 ) );
\t\t$safe_get = wp_safe_remote_get( 'https://api.example/get', array( 'headers' => array( 'X-Test' => '1' ) ) );
\t\t$safe_post = wp_safe_remote_post( 'https://api.example/post', array( 'body' => 'payload' ) );
\t\t$safe_head = wp_safe_remote_head( 'https://api.example/head' );
\t\t$remote_request = wp_remote_request( 'https://api.example/raw', array( 'timeout' => 3 ) );
\t\t$remote_get = wp_remote_get( 'https://api.example/raw-get' );
\t\t$remote_post = wp_remote_post( 'https://api.example/raw-post' );
\t\t$remote_head = wp_remote_head( 'https://api.example/raw-head' );
\t\t$result['returns'] = array( $safe_request, $safe_get, $safe_post, $safe_head, $remote_request, $remote_get, $remote_post, $remote_head );
\t\t$result['calls'] = WP_Http::$calls;
\t\t$result['instances'] = WP_Http::$instances;
\t\t$assertions['single_http_object'] = 1 === WP_Http::$instances && 1 === count( array_unique( array_column( WP_Http::$calls, 'instance_id' ) ) );
\t\t$assertions['methods'] = array( 'request', 'get', 'post', 'head', 'request', 'get', 'post', 'head' ) === array_column( WP_Http::$calls, 'method' );
\t\t$assertions['safe_rejects_unsafe'] = true === WP_Http::$calls[0]['args']['reject_unsafe_urls'] && true === WP_Http::$calls[1]['args']['reject_unsafe_urls'] && true === WP_Http::$calls[2]['args']['reject_unsafe_urls'] && true === WP_Http::$calls[3]['args']['reject_unsafe_urls'];
\t\t$assertions['unsafe_does_not_inject_reject'] = ! isset( WP_Http::$calls[4]['args']['reject_unsafe_urls'] ) && ! isset( WP_Http::$calls[5]['args']['reject_unsafe_urls'] );
\t\tbreak;

\tcase 'http-api:supports':
\t\t\\WpOrg\\Requests\\Requests::$capability_calls = array();
\t\t$result['supports'] = array(
\t\t\t'numeric_https' => wp_http_supports( array( 'ssl', 'streams' ), 'https://secure.example/path' ),
\t\t\t'auto_ssl' => wp_http_supports( array( 'blocking' => true ), 'ssl://secure.example/path' ),
\t\t\t'unsupported' => wp_http_supports( array( 'unsupported' => true ), 'http://plain.example/path' ),
\t\t);
\t\t$result['capability_calls'] = \\WpOrg\\Requests\\Requests::$capability_calls;
\t\t$assertions['return_values'] = true === $result['supports']['numeric_https'] && true === $result['supports']['auto_ssl'] && false === $result['supports']['unsupported'];
\t\t$assertions['numeric_normalized'] = array( 'ssl' => true, 'streams' => true ) === \\WpOrg\\Requests\\Requests::$capability_calls[0];
\t\t$assertions['ssl_injected'] = array( 'blocking' => true, 'ssl' => true ) === \\WpOrg\\Requests\\Requests::$capability_calls[1];
\t\tbreak;

\tcase 'http-api:origins':
\t\t$result['http_origin'] = get_http_origin();
\t\t$result['allowed_origins'] = get_allowed_http_origins();
\t\t$result['is_allowed'] = array(
\t\t\t'filtered' => is_allowed_http_origin( 'https://filtered-origin.example' ),
\t\t\t'admin_http' => is_allowed_http_origin( 'http://admin.example' ),
\t\t\t'blocked_override' => is_allowed_http_origin( 'https://blocked.example' ),
\t\t\t'default_from_server' => is_allowed_http_origin(),
\t\t);
\t\t$assertions['origin_filtered'] = 'https://filtered-origin.example' === $result['http_origin'];
\t\t$assertions['allowed_contains_admin_home_and_filter'] = in_array( 'http://admin.example', $result['allowed_origins'], true ) && in_array( 'https://home.example', $result['allowed_origins'], true ) && in_array( 'https://extra.example', $result['allowed_origins'], true );
\t\t$assertions['allowed_results'] = 'https://filtered-origin.example' === $result['is_allowed']['filtered'] && 'http://admin.example' === $result['is_allowed']['admin_http'] && 'https://override.example' === $result['is_allowed']['blocked_override'] && 'https://filtered-origin.example' === $result['is_allowed']['default_from_server'];
\t\tbreak;

\tcase 'http-api:validate-url':
\t\t$result['validation'] = array(
\t\t\t'empty' => wp_http_validate_url( '' ),
\t\t\t'numeric' => wp_http_validate_url( '12345' ),
\t\t\t'ftp_protocol' => wp_http_validate_url( 'ftp://example.test/file' ),
\t\t\t'userinfo' => wp_http_validate_url( 'https://user:pass@example.test/file' ),
\t\t\t'bad_host_chars' => wp_http_validate_url( 'https://bad[host]/file' ),
\t\t\t'same_home_port' => wp_http_validate_url( 'https://home.example:8443/safe' ),
\t\t\t'same_home_other_port' => wp_http_validate_url( 'https://home.example:9443/unsafe' ),
\t\t\t'local_ip_blocked' => wp_http_validate_url( 'http://192.168.0.1/blocked' ),
\t\t\t'local_ip_allowed_by_filter' => wp_http_validate_url( 'http://192.168.0.1/allow-local' ),
\t\t\t'public_ip_safe_port' => wp_http_validate_url( 'http://198.51.100.10:8080/path' ),
\t\t\t'public_ip_custom_port' => wp_http_validate_url( 'http://198.51.100.10:81/path' ),
\t\t);
\t\t$assertions['invalid_inputs'] = false === $result['validation']['empty'] && false === $result['validation']['numeric'] && false === $result['validation']['ftp_protocol'] && false === $result['validation']['userinfo'] && false === $result['validation']['bad_host_chars'];
\t\t$assertions['same_home_port'] = 'https://home.example:8443/safe' === $result['validation']['same_home_port'] && false === $result['validation']['same_home_other_port'];
\t\t$assertions['local_ip_filter'] = false === $result['validation']['local_ip_blocked'] && 'http://192.168.0.1/allow-local' === $result['validation']['local_ip_allowed_by_filter'];
\t\t$assertions['safe_port_filter'] = 'http://198.51.100.10:8080/path' === $result['validation']['public_ip_safe_port'] && 'http://198.51.100.10:81/path' === $result['validation']['public_ip_custom_port'];
\t\tbreak;

\tcase 'http-api:allowed-hosts':
\t\t$result['allowed_http_request_hosts'] = array(
\t\t\t'initial_true' => allowed_http_request_hosts( true, 'blocked.example' ),
\t\t\t'redirect_allowed' => allowed_http_request_hosts( false, 'redirect.example' ),
\t\t\t'redirect_blocked' => allowed_http_request_hosts( false, 'blocked.example' ),
\t\t);
\t\t$result['ms_allowed'] = array(
\t\t\t'initial_true' => ms_allowed_http_request_hosts( true, 'anything.example' ),
\t\t\t'network_domain' => ms_allowed_http_request_hosts( false, 'network.example' ),
\t\t\t'db_allowed_first' => ms_allowed_http_request_hosts( false, 'site.example' ),
\t\t\t'db_allowed_cached' => ms_allowed_http_request_hosts( false, 'site.example' ),
\t\t\t'db_blocked' => ms_allowed_http_request_hosts( false, 'missing.example' ),
\t\t);
\t\t$result['redirect_checks'] = $GLOBALS['wphx_redirect_checks'];
\t\t$result['wpdb_queries'] = $GLOBALS['wpdb']->queries;
\t\t$assertions['allowed_http_hosts'] = true === $result['allowed_http_request_hosts']['initial_true'] && true === $result['allowed_http_request_hosts']['redirect_allowed'] && false === $result['allowed_http_request_hosts']['redirect_blocked'];
\t\t$assertions['ms_allowed_results'] = true === $result['ms_allowed']['initial_true'] && true === $result['ms_allowed']['network_domain'] && true === $result['ms_allowed']['db_allowed_first'] && true === $result['ms_allowed']['db_allowed_cached'] && false === $result['ms_allowed']['db_blocked'];
\t\t$assertions['db_cache_reused'] = 4 === count( $GLOBALS['wpdb']->queries );
\t\tbreak;
}

$result['assertions'] = $assertions;
$result['filters'] = $GLOBALS['wphx_filters'];
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
    manifest_id: "ownership:wp-core/http-api-wrapper-safety-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "HTTP API request wrapper, capability, origin, and safe URL helper behavior",
      area: "src/wp-includes/http.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/http.php in isolated PHP CLI probes with deterministic WP_Http, Requests capability, option, filter, redirect, network, and wpdb stubs. It observes safe and unsafe request wrapper handoff, wp_http_supports capability shaping, HTTP origin helpers, wp_http_validate_url safety branches, allowed_http_request_hosts, and ms_allowed_http_request_hosts without claiming live HTTP transport, Requests network I/O, DNS behavior beyond deterministic numeric/stubbed paths, CORS header emission, proxy/TLS behavior, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-http-and-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded HTTP transport, SSRF validation with controlled DNS, CORS/header behavior, multisite installed behavior, selected upstream HTTP PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-api-wrapper-safety-oracle-fixture",
        "npm run wp:core:wphx-312-http-api-wrapper-safety-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-43-http-api-wrapper-safety-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
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
  const manifest = {
    schema: "wphx.wp-core-http-api-wrapper-safety-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_core_fixture_manifest: inputRecord(HTTP_CORE_FIXTURE),
      http_helper_fixture_manifest: inputRecord(HELPER_FIXTURE),
      http_parser_header_fixture_manifest: inputRecord(PARSER_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
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
          "WP_Http, Requests::has_capabilities, WP_Error, wp_parse_args, is_wp_error, apply_filters, wp_kses_bad_protocol, get_option, admin_url, home_url, wp_validate_redirect, get_network, and wpdb are deterministic local stubs; copied http.php remains the executed public HTTP API helper source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
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
        id: "live-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture observes public HTTP API wrappers with a deterministic WP_Http stub. Live Requests transport, cURL/streams behavior, network I/O, timeout races, proxy/TLS behavior, and response streaming remain later WPHX-312 gates."
      },
      {
        id: "dns-and-ssrf-runtime-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture avoids external DNS and uses numeric hosts or stubs for deterministic SSRF safety branches. Controlled DNS and installed-network SSRF parity remain later gates."
      },
      {
        id: "cors-header-emission-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "Origin authorization helpers are observed, but send_origin_headers is not executed because it emits real headers and can exit on OPTIONS requests."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic stubs rather than an installed WordPress distribution, real multisite database state, or ecosystem HTTP callers."
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
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_http_claimed: false,
      requests_network_io_claimed: false,
      cors_header_emission_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-43-http-api-wrapper-safety-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "HTTP API wrapper/safety oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle http.php wrapper/safety boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-api-wrapper-safety-oracle-fixture",
      "npm run wp:core:wphx-312-http-api-wrapper-safety-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
      "receipt:wphx-312-41-wp-http-helper-oracle-fixture",
      "receipt:wphx-312-42-wp-http-parser-header-oracle-fixture"
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
