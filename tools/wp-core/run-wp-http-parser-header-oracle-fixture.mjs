#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.29",
  external_ref: "WPHX-312.42",
  title: "WPHX-312.42 - Add WP_Http parser/header oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-parser-header-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-42";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_CORE_FIXTURE = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const COOKIE_FIXTURE = "manifests/wp-core/wphx-312-39-http-cookie-object-oracle-fixture.v1.json";
const HELPER_FIXTURE = "manifests/wp-core/wphx-312-41-wp-http-helper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http.php", "src/wp-includes/class-wp-http-cookie.php"];
const COVERED_SYMBOLS = [
  "WP_Http::processResponse",
  "WP_Http::processHeaders",
  "WP_Http::buildCookieHeader",
  "WP_Http::chunkTransferDecode",
  "WP_Http::parse_url",
  "WP_Http_Cookie",
  "wp_http_cookie_value",
  "apply_filters",
  "_deprecated_function",
  "wp_parse_url",
  "WpOrg\\Requests\\Autoload",
  "WpOrg\\Requests\\Requests"
];
const CASES = [
  { id: "wp-http-parser:process-response", focus: "processResponse splits headers from body at the first CRLF CRLF and defaults missing body to empty string" },
  { id: "wp-http-parser:process-headers", focus: "processHeaders selects the final redirected response, unfolds headers, preserves duplicate headers, and converts Set-Cookie values" },
  { id: "wp-http-parser:build-cookie-header", focus: "buildCookieHeader upgrades scalar cookies, preserves object cookies, filters values, and assembles Cookie header order" },
  { id: "wp-http-parser:chunk-transfer-decode", focus: "chunkTransferDecode decodes valid chunk bodies and returns malformed/non-chunk bodies unchanged" },
  { id: "wp-http-parser:parse-url-wrapper", focus: "deprecated protected parse_url wrapper delegates to wp_parse_url and records deprecation metadata" }
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

\tclass Requests {
\t\tpublic static function set_certificate_path( $path ) {}
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

$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_deprecated'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );
\tif ( 'wp_http_cookie_value' === $hook_name ) {
\t\treturn 'filtered-' . $args[0] . '-' . str_replace( ' ', '_', (string) $value );
\t}
\treturn $value;
}

function _deprecated_function( $function_name, $version, $replacement = '' ) {
\t$GLOBALS['wphx_deprecated'][] = array( 'function' => $function_name, 'version' => $version, 'replacement' => $replacement );
}

function wp_parse_url( $url ) {
\treturn parse_url( $url );
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

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'wp-http-parser:process-response':
\t\t$split = WP_Http::processResponse( "HTTP/1.1 200 OK\\r\\nX-Test: yes\\r\\n\\r\\nbody\\r\\nwith delimiter\\r\\n\\r\\nkept" );
\t\t$header_only = WP_Http::processResponse( "HTTP/1.1 204 No Content\\r\\nX-Empty: true" );
\t\t$result['split'] = $split;
\t\t$result['header_only'] = $header_only;
\t\t$assertions['split_header'] = "HTTP/1.1 200 OK\\r\\nX-Test: yes" === $split['headers'];
\t\t$assertions['split_body_keeps_later_delimiter'] = "body\\r\\nwith delimiter\\r\\n\\r\\nkept" === $split['body'];
\t\t$assertions['missing_body_defaults_empty'] = "HTTP/1.1 204 No Content\\r\\nX-Empty: true" === $header_only['headers'] && '' === $header_only['body'];
\t\tbreak;

\tcase 'wp-http-parser:process-headers':
\t\t$headers = "HTTP/1.1 301 Moved Permanently\\r\\nLocation: https://example.test/old\\r\\nX-Discard: first\\r\\n\\r\\nHTTP/1.1 200 OK\\r\\nX-Multi: one\\r\\nX-Multi: two\\r\\nX-Fold: first\\r\\n second\\r\\nSet-Cookie: session=abc%20123; expires=Tue, 01 Jan 2030 00:00:00 GMT; path=/wp/; domain=.example.test\\r\\nSet-Cookie: pref=dark; path=/; domain=example.test\\r\\n";
\t\t$processed = WP_Http::processHeaders( $headers, 'https://example.test/wp-admin/post.php' );
\t\t$result['processed'] = wphx_summarize( $processed );
\t\t$assertions['final_response_selected'] = array( 'code' => 200, 'message' => 'OK' ) === $processed['response'];
\t\t$assertions['duplicate_headers_array'] = array( 'one', 'two' ) === $processed['headers']['x-multi'];
\t\t$assertions['folded_header_unfolded'] = 'first second' === $processed['headers']['x-fold'];
\t\t$assertions['redirect_headers_discarded'] = ! isset( $processed['headers']['x-discard'] );
\t\t$assertions['cookies_converted'] = 2 === count( $processed['cookies'] ) && 'session' === $processed['cookies'][0]->name && 'abc 123' === $processed['cookies'][0]->value && '/wp/' === $processed['cookies'][0]->path && '.example.test' === $processed['cookies'][0]->domain && 'pref' === $processed['cookies'][1]->name;
\t\tbreak;

\tcase 'wp-http-parser:build-cookie-header':
\t\t$args = array(
\t\t\t'headers' => array(),
\t\t\t'cookies' => array(
\t\t\t\t'scalar' => 'plain value',
\t\t\t\t'object' => new WP_Http_Cookie( array( 'name' => 'object', 'value' => 'raw value', 'path' => '/', 'domain' => 'example.test' ), 'https://example.test/' ),
\t\t\t),
\t\t);
\t\tWP_Http::buildCookieHeader( $args );
\t\t$result['args'] = wphx_summarize( $args );
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$assertions['scalar_upgraded'] = $args['cookies']['scalar'] instanceof WP_Http_Cookie && 'scalar' === $args['cookies']['scalar']->name && 'plain value' === $args['cookies']['scalar']->value;
\t\t$assertions['object_preserved'] = $args['cookies']['object'] instanceof WP_Http_Cookie && 'object' === $args['cookies']['object']->name;
\t\t$assertions['cookie_header'] = 'scalar=filtered-scalar-plain_value; object=filtered-object-raw_value' === $args['headers']['cookie'];
\t\t$assertions['filter_payloads'] = 2 === count( $GLOBALS['wphx_filters'] ) && 'wp_http_cookie_value' === $GLOBALS['wphx_filters'][0]['hook'] && 'scalar' === $GLOBALS['wphx_filters'][0]['args'][0] && 'object' === $GLOBALS['wphx_filters'][1]['args'][0];
\t\tbreak;

\tcase 'wp-http-parser:chunk-transfer-decode':
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
\t\t$assertions['valid_decoded'] = 'Wikipedia' === $result['decoded']['valid'];
\t\t$assertions['extension_decoded'] = 'Test' === $result['decoded']['extension'];
\t\t$assertions['inter_chunk_crlf_passthrough'] = $inter_chunk_crlf === $result['decoded']['inter_chunk_crlf'];
\t\t$assertions['plain_passthrough'] = $plain === $result['decoded']['plain'];
\t\t$assertions['malformed_passthrough'] = $malformed === $result['decoded']['malformed'];
\t\tbreak;

\tcase 'wp-http-parser:parse-url-wrapper':
\t\t$parsed = WPHX_Parse_Url_Probe::expose_parse_url( 'https://user:pass@example.test:8443/path/file.php?x=1#frag' );
\t\t$result['parsed'] = $parsed;
\t\t$result['deprecated'] = $GLOBALS['wphx_deprecated'];
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
    manifest_id: "ownership:wp-core/wp-http-parser-header-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Http parser, header, cookie-header, chunk decoding, and parse-url helper behavior",
      area: "src/wp-includes/class-wp-http.php src/wp-includes/class-wp-http-cookie.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-http.php and class-wp-http-cookie.php in isolated PHP CLI probes with deterministic WordPress and Requests autoload stubs. It observes processResponse, processHeaders, buildCookieHeader, chunkTransferDecode, and the deprecated parse_url wrapper without claiming live HTTP transport, Requests network I/O, redirect following, proxy/TLS behavior, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-requests-and-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded HTTP transport, raw HTTP response parsing, Requests integration, selected upstream HTTP PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-parser-header-oracle-fixture",
        "npm run wp:core:wphx-312-wp-http-parser-header-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-42-wp-http-parser-header-oracle-fixture"],
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
    schema: "wphx.wp-core-wp-http-parser-header-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_core_fixture_manifest: inputRecord(HTTP_CORE_FIXTURE),
      http_cookie_fixture_manifest: inputRecord(COOKIE_FIXTURE),
      http_helper_fixture_manifest: inputRecord(HELPER_FIXTURE),
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
          "Requests Autoload and Requests are deterministic structural stubs; WordPress functions apply_filters, _deprecated_function, and wp_parse_url are deterministic stubs; copied class-wp-http.php and class-wp-http-cookie.php remain the executed public HTTP parser/header sources."
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
          "The fixture observes parser/header helpers in isolation. Live Requests transport, cURL/streams behavior, network I/O, timeout races, proxy/TLS behavior, and response streaming remain later WPHX-312 gates."
      },
      {
        id: "requests-integration-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture structurally stubs the Requests autoload boundary and does not execute real Requests response parsing, redirect following, or transport behavior."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic stubs rather than an installed WordPress distribution, plugin-modified HTTP filters beyond the observed cookie-value filter, or ecosystem HTTP callers."
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
      requests_network_io_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-42-wp-http-parser-header-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http parser/header oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle WP_Http parser/header boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-parser-header-oracle-fixture",
      "npm run wp:core:wphx-312-wp-http-parser-header-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
      "receipt:wphx-312-39-http-cookie-object-oracle-fixture",
      "receipt:wphx-312-41-wp-http-helper-oracle-fixture"
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
