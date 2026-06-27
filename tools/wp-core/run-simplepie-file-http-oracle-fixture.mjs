#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.23",
  external_ref: "WPHX-312.36",
  title: "WPHX-312.36 - Add SimplePie file HTTP oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-simplepie-file-http-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-36";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-36-simplepie-file-http-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-36-simplepie-file-http-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-36-simplepie-file-http-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const REMOTE_FEED_FIXTURE = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const REQUESTS_FIXTURE = "manifests/wp-core/wphx-312-33-http-requests-bridge-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-simplepie-file.php"];
const COVERED_SYMBOLS = [
  "WP_SimplePie_File::__construct",
  "SimplePie\\File",
  "SimplePie\\SimplePie::FILE_SOURCE_REMOTE",
  "SimplePie\\Misc::get_default_useragent",
  "WpOrg\\Requests\\Utility\\CaseInsensitiveDictionary::getAll",
  "wp_safe_remote_request",
  "is_wp_error",
  "wp_remote_retrieve_headers",
  "wp_remote_retrieve_body",
  "wp_remote_retrieve_response_code",
  "WP_Error::get_error_message"
];
const CASES = [
  { id: "simplepie-file:default-useragent", focus: "remote HTTP request omits user-agent when caller passes SimplePie default" },
  { id: "simplepie-file:custom-headers-useragent", focus: "remote HTTP request includes caller headers and custom user-agent" },
  { id: "simplepie-file:repeated-array-headers", focus: "array-valued response headers normalize to comma-joined strings except content-type last value" },
  { id: "simplepie-file:case-dictionary-headers", focus: "Requests CaseInsensitiveDictionary response headers are converted through getAll before normalization" },
  { id: "simplepie-file:wp-error", focus: "WP_Error transport failure maps to SimplePie-style error and success=false" },
  { id: "simplepie-file:non-http-url", focus: "non-HTTP local URL marks file unsuccessful without issuing a Core HTTP request" }
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
namespace SimplePie {
\tclass SimplePie {
\t\tpublic const FILE_SOURCE_REMOTE = 1;
\t}
\tclass File {}
\tclass Misc {
\t\tpublic static function get_default_useragent() {
\t\t\treturn 'SimplePie/default-fixture';
\t\t}
\t}
}

namespace WpOrg\\Requests\\Utility {
\tclass CaseInsensitiveDictionary {
\t\tprivate $data;
\t\tpublic function __construct( $data ) {
\t\t\t$this->data = $data;
\t\t}
\t\tpublic function getAll() {
\t\t\t$GLOBALS['wphx_dictionary_get_all']++;
\t\t\treturn $this->data;
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
$GLOBALS['wphx_requests'] = array();
$GLOBALS['wphx_dictionary_get_all'] = 0;

class WP_Error {
\tprivate $message;
\tpublic function __construct( $code, $message ) {
\t\t$this->message = $message;
\t}
\tpublic function get_error_message() {
\t\treturn $this->message;
\t}
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}
function wp_safe_remote_request( $url, $args ) {
\t$GLOBALS['wphx_requests'][] = array( 'url' => $url, 'args' => $args );
\tswitch ( $url ) {
\t\tcase 'https://feeds.example/default.xml':
\t\t\treturn array( 'headers' => array( 'content-type' => 'application/rss+xml' ), 'body' => '<rss>default</rss>', 'response' => array( 'code' => 200 ) );
\t\tcase 'https://feeds.example/custom.xml':
\t\t\treturn array( 'headers' => array( 'etag' => '"custom-fixture"' ), 'body' => '<rss>custom</rss>', 'response' => array( 'code' => 202 ) );
\t\tcase 'https://feeds.example/repeated.xml':
\t\t\treturn array(
\t\t\t\t'headers' => array(
\t\t\t\t\t'content-type' => array( 'text/plain', 'application/atom+xml' ),
\t\t\t\t\t'link' => array( '<https://feeds.example/a>; rel="self"', '<https://feeds.example/b>; rel="next"' ),
\t\t\t\t\t'x-cache' => array( 'miss', 'store' ),
\t\t\t\t),
\t\t\t\t'body' => '<feed>repeated</feed>',
\t\t\t\t'response' => array( 'code' => 203 ),
\t\t\t);
\t\tcase 'https://feeds.example/dictionary.xml':
\t\t\treturn array(
\t\t\t\t'headers' => new WpOrg\\Requests\\Utility\\CaseInsensitiveDictionary(
\t\t\t\t\tarray(
\t\t\t\t\t\t'content-type' => array( 'text/html', 'application/xml' ),
\t\t\t\t\t\t'vary' => array( 'Accept', 'User-Agent' ),
\t\t\t\t\t)
\t\t\t\t),
\t\t\t\t'body' => '<feed>dictionary</feed>',
\t\t\t\t'response' => array( 'code' => 204 ),
\t\t\t);
\t\tcase 'https://feeds.example/error.xml':
\t\t\treturn new WP_Error( 'http_request_failed', 'fixture transport failed' );
\t}
\treturn array( 'headers' => array(), 'body' => '', 'response' => array( 'code' => 500 ) );
}
function wp_remote_retrieve_headers( $response ) {
\treturn $response['headers'] ?? array();
}
function wp_remote_retrieve_body( $response ) {
\treturn $response['body'] ?? '';
}
function wp_remote_retrieve_response_code( $response ) {
\treturn $response['response']['code'] ?? 0;
}
function wphx_file_summary( $file ) {
\treturn array(
\t\t'url' => $file->url ?? null,
\t\t'timeout' => $file->timeout ?? null,
\t\t'redirects' => $file->redirects ?? null,
\t\t'headers' => $file->headers ?? null,
\t\t'useragent' => $file->useragent ?? null,
\t\t'method' => $file->method ?? null,
\t\t'body' => $file->body ?? null,
\t\t'status_code' => $file->status_code ?? null,
\t\t'error' => $file->error ?? null,
\t\t'success' => $file->success ?? null,
\t);
}

require ABSPATH . WPINC . '/class-wp-simplepie-file.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'simplepie-file:default-useragent':
\t\t$file = new WP_SimplePie_File( 'https://feeds.example/default.xml', 7, 3, null, SimplePie\\Misc::get_default_useragent() );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['requests'] = $GLOBALS['wphx_requests'];
\t\t$assertions['request_args'] = array( 'timeout' => 7, 'redirection' => 3 ) === $GLOBALS['wphx_requests'][0]['args'];
\t\t$assertions['body_status_headers'] = '<rss>default</rss>' === $file->body && 200 === $file->status_code && array( 'content-type' => 'application/rss+xml' ) === $file->headers;
\t\t$assertions['method_remote'] = SimplePie\\SimplePie::FILE_SOURCE_REMOTE === $file->method;
\t\tbreak;

\tcase 'simplepie-file:custom-headers-useragent':
\t\t$file = new WP_SimplePie_File( 'https://feeds.example/custom.xml', 11, 4, array( 'Accept' => 'application/rss+xml' ), 'custom-agent/1.0' );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['requests'] = $GLOBALS['wphx_requests'];
\t\t$assertions['request_args'] = array( 'timeout' => 11, 'redirection' => 4, 'headers' => array( 'Accept' => 'application/rss+xml' ), 'user-agent' => 'custom-agent/1.0' ) === $GLOBALS['wphx_requests'][0]['args'];
\t\t$assertions['response'] = '<rss>custom</rss>' === $file->body && 202 === $file->status_code && array( 'etag' => '"custom-fixture"' ) === $file->headers;
\t\tbreak;

\tcase 'simplepie-file:repeated-array-headers':
\t\t$file = new WP_SimplePie_File( 'https://feeds.example/repeated.xml', 5, 2, null, SimplePie\\Misc::get_default_useragent() );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['requests'] = $GLOBALS['wphx_requests'];
\t\t$assertions['content_type_last'] = 'application/atom+xml' === $file->headers['content-type'];
\t\t$assertions['joined_headers'] = '<https://feeds.example/a>; rel="self", <https://feeds.example/b>; rel="next"' === $file->headers['link'] && 'miss, store' === $file->headers['x-cache'];
\t\t$assertions['status_body'] = 203 === $file->status_code && '<feed>repeated</feed>' === $file->body;
\t\tbreak;

\tcase 'simplepie-file:case-dictionary-headers':
\t\t$file = new WP_SimplePie_File( 'https://feeds.example/dictionary.xml', 6, 1, null, SimplePie\\Misc::get_default_useragent() );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['dictionary_get_all'] = $GLOBALS['wphx_dictionary_get_all'];
\t\t$assertions['dictionary_used'] = 1 === $GLOBALS['wphx_dictionary_get_all'];
\t\t$assertions['normalized_headers'] = 'application/xml' === $file->headers['content-type'] && 'Accept, User-Agent' === $file->headers['vary'];
\t\t$assertions['status_body'] = 204 === $file->status_code && '<feed>dictionary</feed>' === $file->body;
\t\tbreak;

\tcase 'simplepie-file:wp-error':
\t\t$file = new WP_SimplePie_File( 'https://feeds.example/error.xml', 8, 2, null, SimplePie\\Misc::get_default_useragent() );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['requests'] = $GLOBALS['wphx_requests'];
\t\t$assertions['error_message'] = 'WP HTTP Error: fixture transport failed' === $file->error;
\t\t$assertions['success_false'] = false === $file->success;
\t\t$assertions['no_body_or_status'] = null === ( $file->body ?? null ) && null === ( $file->status_code ?? null );
\t\tbreak;

\tcase 'simplepie-file:non-http-url':
\t\t$file = new WP_SimplePie_File( '/tmp/feed.xml', 9, 6, array( 'Accept' => 'text/xml' ), 'custom-agent/2.0' );
\t\t$result['file'] = wphx_file_summary( $file );
\t\t$result['requests'] = $GLOBALS['wphx_requests'];
\t\t$assertions['no_request'] = array() === $GLOBALS['wphx_requests'];
\t\t$assertions['error_empty_success_false'] = '' === $file->error && false === $file->success;
\t\t$assertions['method_remote'] = SimplePie\\SimplePie::FILE_SOURCE_REMOTE === $file->method;
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
    manifest_id: "ownership:wp-core/simplepie-file-http-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_SimplePie_File WordPress HTTP adapter behavior",
      area: "src/wp-includes/class-wp-simplepie-file.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-simplepie-file.php in isolated PHP CLI probes with deterministic SimplePie parent/Misc, Requests header dictionary, WP_Error, and WordPress HTTP helper stubs. It observes remote constructor argument handoff, default user-agent omission, custom user-agent inclusion, successful response body/status/header capture, repeated-header normalization, CaseInsensitiveDictionary conversion, WP_Error failure mapping, and non-HTTP URL failure behavior without claiming live network I/O, SimplePie parser behavior, feed XML parsing, Requests transport/TLS/proxy behavior, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-http-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded feed fetching, SimplePie parser integration, Requests transport/TLS/proxy behavior, selected upstream feed PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-simplepie-file-http-oracle-fixture",
        "npm run wp:core:wphx-312-simplepie-file-http-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-36-simplepie-file-http-oracle-fixture"],
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
    schema: "wphx.wp-core-simplepie-file-http-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      remote_feed_fixture_manifest: inputRecord(REMOTE_FEED_FIXTURE),
      http_requests_bridge_fixture_manifest: inputRecord(REQUESTS_FIXTURE),
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
          "SimplePie parent/Misc, Requests CaseInsensitiveDictionary, WP_Error, wp_safe_remote_request, is_wp_error, and wp_remote_retrieve_* helpers are deterministic stubs; copied class-wp-simplepie-file.php remains the executed public feed HTTP adapter source."
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
        id: "live-network-io-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses deterministic wp_safe_remote_request stubs. Real DNS, TLS, redirects, proxies, streaming, timeout races, and Requests transport behavior remain later WPHX-312 gates."
      },
      {
        id: "simplepie-parser-and-feed-xml-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture observes the WordPress HTTP file adapter only. SimplePie feed parsing, sanitizer registry wiring, cache registration, and feed XML interpretation remain separate gates."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic stubs rather than an installed WordPress distribution, plugin filters, production HTTP configuration, or real remote feed endpoints."
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
      live_network_io_claimed: false,
      simplepie_parser_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-36-simplepie-file-http-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_SimplePie_File oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle SimplePie file HTTP boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-simplepie-file-http-oracle-fixture",
      "npm run wp:core:wphx-312-simplepie-file-http-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
      "receipt:wphx-312-33-http-requests-bridge-oracle-fixture"
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
