#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-c86",
  external_ref: "WPHX-312.33",
  title: "WPHX-312.33 - Add HTTP Requests bridge oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-requests-bridge-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-33";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-33-http-requests-bridge-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-33-http-requests-bridge-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-33-http-requests-bridge-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_FIXTURE = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const PROXY_FIXTURE = "manifests/wp-core/wphx-312-32-http-proxy-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/class-wp-http-cookie.php",
  "src/wp-includes/class-wp-http-requests-response.php",
  "src/wp-includes/class-wp-http-requests-hooks.php"
];
const CLAIMED_SOURCE_FILES = [
  "src/wp-includes/class-wp-http-requests-response.php",
  "src/wp-includes/class-wp-http-requests-hooks.php"
];
const SUPPORT_PATHS = ["src/wp-includes/Requests"];
const COVERED_SYMBOLS = [
  "WP_HTTP_Requests_Response::__construct",
  "WP_HTTP_Requests_Response::get_response_object",
  "WP_HTTP_Requests_Response::get_headers",
  "WP_HTTP_Requests_Response::set_headers",
  "WP_HTTP_Requests_Response::header",
  "WP_HTTP_Requests_Response::get_status",
  "WP_HTTP_Requests_Response::set_status",
  "WP_HTTP_Requests_Response::get_data",
  "WP_HTTP_Requests_Response::set_data",
  "WP_HTTP_Requests_Response::get_cookies",
  "WP_HTTP_Requests_Response::to_array",
  "WP_HTTP_Requests_Hooks::__construct",
  "WP_HTTP_Requests_Hooks::dispatch",
  "WpOrg\\Requests\\Response",
  "WpOrg\\Requests\\Response\\Headers",
  "WpOrg\\Requests\\Cookie",
  "WpOrg\\Requests\\Hooks",
  "WP_Http_Cookie",
  "http_api_curl",
  "requests-{$hook}"
];
const CASES = [
  { id: "requests-bridge:headers-status-body", focus: "response wrapper preserves object identity and converts headers, status, and body" },
  { id: "requests-bridge:mutations-to-array", focus: "set_headers, header replace/append, set_status, set_data, and to_array shape mutate the wrapped response" },
  { id: "requests-bridge:cookies", focus: "Requests cookies convert into WP_Http_Cookie values with decoded value and host-only metadata" },
  { id: "requests-bridge:hooks-parent-and-actions", focus: "registered Requests callbacks run and requests-* WordPress actions receive parameters, request data, and URL" },
  { id: "requests-bridge:curl-backcompat-action", focus: "curl.before_send dispatch forwards http_api_curl compatibility action and still emits requests-curl.before_send" }
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

function listFiles(path) {
  const source = upstreamPath(path);
  const stat = statSync(source);
  if (stat.isFile()) return [path];
  return readdirSync(source, { withFileTypes: true })
    .flatMap((entry) => listFiles(`${path}/${entry.name}`))
    .sort();
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
  for (const path of SUPPORT_PATHS) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(upstreamPath(path), target, { recursive: true });
  }
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );
$case = $argv[2] ?? '';

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_parent_callbacks'] = array();

function absint( $value ) {
\treturn abs( (int) $value );
}

function get_status_header_desc( $code ) {
\t$map = array(
\t\t200 => 'OK',
\t\t201 => 'Created',
\t\t202 => 'Accepted',
\t\t204 => 'No Content',
\t\t206 => 'Partial Content',
\t\t301 => 'Moved Permanently',
\t\t302 => 'Found',
\t\t404 => 'Not Found',
\t\t418 => \"I'm a Teapot\",
\t);
\treturn $map[ (int) $code ] ?? 'Status ' . (int) $code;
}

function do_action_ref_array( $hook_name, $args = array(), ...$extra ) {
\t$GLOBALS['wphx_actions'][] = array(
\t\t'hook' => $hook_name,
\t\t'args' => wphx_summarize( $args ),
\t\t'extra' => wphx_summarize( $extra ),
\t);
}

function wphx_summarize( $value ) {
\tif ( $value instanceof WpOrg\\Requests\\Response ) {
\t\treturn array( 'class' => get_class( $value ), 'status_code' => $value->status_code, 'body' => $value->body );
\t}
\tif ( $value instanceof WpOrg\\Requests\\Response\\Headers || $value instanceof WpOrg\\Requests\\Utility\\CaseInsensitiveDictionary ) {
\t\treturn array( 'class' => get_class( $value ), 'all' => $value->getAll() );
\t}
\tif ( $value instanceof WpOrg\\Requests\\Cookie ) {
\t\treturn array( 'class' => get_class( $value ), 'name' => $value->name, 'value' => $value->value, 'attributes' => iterator_to_array( $value->attributes ), 'flags' => $value->flags );
\t}
\tif ( $value instanceof WP_Http_Cookie ) {
\t\treturn array(
\t\t\t'class' => get_class( $value ),
\t\t\t'name' => $value->name,
\t\t\t'value' => $value->value,
\t\t\t'expires' => $value->expires,
\t\t\t'path' => $value->path,
\t\t\t'domain' => $value->domain,
\t\t\t'host_only' => $value->host_only,
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn get_object_vars( $value ) + array( 'class' => get_class( $value ) );
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

require ABSPATH . WPINC . '/Requests/src/Autoload.php';
WpOrg\\Requests\\Autoload::register();

require ABSPATH . WPINC . '/class-wp-http-response.php';
require ABSPATH . WPINC . '/class-wp-http-cookie.php';
require ABSPATH . WPINC . '/class-wp-http-requests-response.php';
require ABSPATH . WPINC . '/class-wp-http-requests-hooks.php';

function wphx_response_fixture() {
\t$response = new WpOrg\\Requests\\Response();
\t$response->status_code = 201;
\t$response->body = 'original-body';
\t$response->headers['Content-Type'] = 'text/plain';
\t$response->headers['X-Multi'] = 'one';
\t$response->headers['X-Multi'] = 'two';
\treturn $response;
}

function wphx_cookie_fixture_response() {
\t$response = new WpOrg\\Requests\\Response();
\t$response->status_code = 200;
\t$response->body = 'cookies';
\t$response->cookies['session'] = new WpOrg\\Requests\\Cookie(
\t\t'session',
\t\t'value%20encoded',
\t\tarray( 'expires' => '2030-01-02 03:04:05 UTC', 'path' => '/account', 'domain' => '.example.test' ),
\t\tarray( 'host-only' => false ),
\t\t1700000000
\t);
\t$response->cookies['pref'] = new WpOrg\\Requests\\Cookie(
\t\t'pref',
\t\t'plain',
\t\tarray( 'path' => '/', 'domain' => 'site.example.test' ),
\t\tarray( 'host-only' => true ),
\t\t1700000000
\t);
\treturn $response;
}

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'requests-bridge:headers-status-body':
\t\t$response = wphx_response_fixture();
\t\t$wrapper = new WP_HTTP_Requests_Response( $response, '/tmp/download.txt' );
\t\t$headers = $wrapper->get_headers();
\t\t$result['same_object'] = $wrapper->get_response_object() === $response;
\t\t$result['headers'] = wphx_summarize( $headers );
\t\t$result['status'] = $wrapper->get_status();
\t\t$result['body'] = $wrapper->get_data();
\t\t$result['filename'] = $wrapper->to_array()['filename'];
\t\t$assertions['same_object'] = true === $result['same_object'];
\t\t$assertions['content_type_case_insensitive'] = 'text/plain' === $headers['content-type'] && 'text/plain' === $headers['CONTENT-TYPE'];
\t\t$assertions['single_header_scalar'] = 'text/plain' === $headers['Content-Type'];
\t\t$assertions['repeated_header_array'] = array( 'one', 'two' ) === $headers['x-multi'];
\t\t$assertions['status_body_filename'] = 201 === $result['status'] && 'original-body' === $result['body'] && '/tmp/download.txt' === $result['filename'];
\t\tbreak;

\tcase 'requests-bridge:mutations-to-array':
\t\t$response = wphx_response_fixture();
\t\t$wrapper = new WP_HTTP_Requests_Response( $response, 'saved.bin' );
\t\t$wrapper->set_headers( array( 'X-Set' => 'alpha' ) );
\t\t$wrapper->header( 'X-Set', 'beta', false );
\t\t$wrapper->header( 'X-Replace', 'first' );
\t\t$wrapper->header( 'X-Replace', 'second' );
\t\t$wrapper->set_status( '202 accepted' );
\t\t$wrapper->set_data( 'mutated-body' );
\t\t$array = $wrapper->to_array();
\t\t$result['array'] = wphx_summarize( $array );
\t\t$result['wrapped_headers'] = $response->headers->getAll();
\t\t$assertions['append_preserved'] = array( 'alpha', 'beta' ) === $response->headers->getValues( 'X-Set' );
\t\t$assertions['replace_removed_previous'] = array( 'second' ) === $response->headers->getValues( 'X-Replace' );
\t\t$assertions['status_absint'] = 202 === $array['response']['code'] && 'Accepted' === $array['response']['message'];
\t\t$assertions['body_filename'] = 'mutated-body' === $array['body'] && 'saved.bin' === $array['filename'];
\t\tbreak;

\tcase 'requests-bridge:cookies':
\t\t$response = wphx_cookie_fixture_response();
\t\t$wrapper = new WP_HTTP_Requests_Response( $response );
\t\t$cookies = $wrapper->get_cookies();
\t\t$array = $wrapper->to_array();
\t\t$result['cookies'] = array_map( 'wphx_summarize', $cookies );
\t\t$result['array_cookies'] = array_map( 'wphx_summarize', $array['cookies'] );
\t\t$assertions['two_cookies'] = 2 === count( $cookies );
\t\t$assertions['decoded_value'] = 'value encoded' === $cookies[0]->value;
\t\t$assertions['domain_normalized_and_path'] = 'example.test' === $cookies[0]->domain && '/account' === $cookies[0]->path;
\t\t$assertions['host_only_false_preserved'] = false === $cookies[0]->host_only;
\t\t$assertions['host_only_true_preserved'] = true === $cookies[1]->host_only;
\t\tbreak;

\tcase 'requests-bridge:hooks-parent-and-actions':
\t\t$url = 'https://api.example.test/data';
\t\t$request = array( 'method' => 'POST', 'timeout' => 3, 'headers' => array( 'Accept' => 'application/json' ) );
\t\t$hooks = new WP_HTTP_Requests_Hooks( $url, $request );
\t\t$hooks->register(
\t\t\t'requests.before_request',
\t\t\tfunction ( &$hook_url, &$headers, &$data, &$type, &$options ) {
\t\t\t\t$GLOBALS['wphx_parent_callbacks'][] = array( 'url' => $hook_url, 'type' => $type, 'timeout' => $options['timeout'] ?? null );
\t\t\t\t$headers['X-Parent'] = 'ran';
\t\t\t},
\t\t\t-10
\t\t);
\t\t$hook_url = $url;
\t\t$headers = array( 'Accept' => 'application/json' );
\t\t$data = 'payload';
\t\t$type = 'POST';
\t\t$options = array( 'timeout' => 3 );
\t\t$dispatch_result = $hooks->dispatch( 'requests.before_request', array( &$hook_url, &$headers, &$data, &$type, &$options ) );
\t\t$result['dispatch_result'] = $dispatch_result;
\t\t$result['headers_after_parent'] = $headers;
\t\t$result['parent_callbacks'] = $GLOBALS['wphx_parent_callbacks'];
\t\t$result['actions'] = $GLOBALS['wphx_actions'];
\t\t$assertions['parent_result_true'] = true === $dispatch_result;
\t\t$assertions['parent_callback_ran'] = array( 'X-Parent' => 'ran' ) === array_intersect_key( $headers, array( 'X-Parent' => true ) );
\t\t$assertions['requests_action_forwarded'] = 'requests-requests.before_request' === $GLOBALS['wphx_actions'][0]['hook'];
\t\t$assertions['request_and_url_extra'] = $request === $GLOBALS['wphx_actions'][0]['extra'][0] && $url === $GLOBALS['wphx_actions'][0]['extra'][1];
\t\tbreak;

\tcase 'requests-bridge:curl-backcompat-action':
\t\t$url = 'https://api.example.test/curl';
\t\t$request = array( 'method' => 'GET', 'timeout' => 9 );
\t\t$hooks = new WP_HTTP_Requests_Hooks( $url, $request );
\t\t$curl_handle = (object) array( 'id' => 'curl-handle' );
\t\t$dispatch_result = $hooks->dispatch( 'curl.before_send', array( &$curl_handle ) );
\t\t$result['dispatch_result'] = $dispatch_result;
\t\t$result['actions'] = $GLOBALS['wphx_actions'];
\t\t$assertions['parent_result_false_without_registered_callback'] = false === $dispatch_result;
\t\t$assertions['curl_backcompat_action'] = 'http_api_curl' === $GLOBALS['wphx_actions'][0]['hook'];
\t\t$assertions['curl_action_receives_request_url'] = $request === $GLOBALS['wphx_actions'][0]['args'][1] && $url === $GLOBALS['wphx_actions'][0]['args'][2];
\t\t$assertions['requests_curl_action_forwarded'] = 'requests-curl.before_send' === $GLOBALS['wphx_actions'][1]['hook'];
\t\tbreak;
}

$result['assertions'] = $assertions;

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
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
    manifest_id: "ownership:wp-core/http-requests-bridge-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_HTTP_Requests_Response and WP_HTTP_Requests_Hooks bridge behavior",
      area: "src/wp-includes/class-wp-http-requests-response.php; src/wp-includes/class-wp-http-requests-hooks.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 HTTP Requests bridge classes in isolated PHP CLI probes with real copied Requests support classes. It observes response object wrapping, case-insensitive header conversion, repeated header preservation, status/body/header mutation, cookie conversion into WP_Http_Cookie, to_array shape, parent Requests hook dispatch, requests-* WordPress action forwarding, and curl.before_send/http_api_curl compatibility without claiming live HTTP transport routing, Requests network I/O, redirect validation, proxy/TLS negotiation, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-real-requests-support-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass WP_Http request routing, Requests redirect validation, proxy/TLS negotiation, recorded/live HTTP transport behavior, selected upstream PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-requests-bridge-oracle-fixture",
        "npm run wp:core:wphx-312-http-requests-bridge-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-33-http-requests-bridge-oracle-fixture"],
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
    schema: "wphx.wp-core-http-requests-bridge-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_cron_mail_fixture_manifest: inputRecord(HTTP_FIXTURE),
      http_proxy_fixture_manifest: inputRecord(PROXY_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      claimed_source_files: CLAIMED_SOURCE_FILES,
      support_sources: SUPPORT_PATHS.flatMap(listFiles).map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: CLAIMED_SOURCE_FILES,
      support_files: SOURCE_FILES.filter((path) => !CLAIMED_SOURCE_FILES.includes(path)),
      support_paths: SUPPORT_PATHS,
      probe: { path: PROBE, sha256: sha256File(PROBE) },
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "get_status_header_desc, absint, and do_action_ref_array are deterministic stubs; copied Requests support classes are executed through their upstream autoloader; copied HTTP bridge classes remain the executed public source."
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
        id: "live-http-transport-routing-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture instantiates bridge classes directly. WP_Http::request routing, Requests::request network execution, transport selection, redirect validation, and response parsing from live/recorded traffic remain later WPHX-312 gates."
      },
      {
        id: "proxy-tls-and-network-errors-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "Requests support classes are real copied sources, but cURL/fsockopen proxy behavior, TLS validation, DNS/socket failures, timeout enforcement, and HTTP error mapping are not executed."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic WordPress stubs rather than an installed WordPress distribution, plugin/theme action callbacks, or real package-boundary HTTP routes."
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
      live_http_transport_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-33-http-requests-bridge-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP HTTP Requests bridge oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle HTTP Requests bridge boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-requests-bridge-oracle-fixture",
      "npm run wp:core:wphx-312-http-requests-bridge-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
      "receipt:wphx-312-32-http-proxy-oracle-fixture"
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
