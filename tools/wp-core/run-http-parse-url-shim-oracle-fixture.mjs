#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.31",
  external_ref: "WPHX-312.44",
  title: "WPHX-312.44 - Add HTTP parse-url and class-http shim oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-parse-url-shim-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-44";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-44-http-parse-url-shim-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-44-http-parse-url-shim-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-44-http-parse-url-shim-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const API_FIXTURE = "manifests/wp-core/wphx-312-43-http-api-wrapper-safety-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/http.php", "src/wp-includes/class-http.php", "src/wp-includes/class-wp-http.php"];
const COVERED_SYMBOLS = [
  "wp_parse_url",
  "_get_component_from_parsed_url_array",
  "_wp_translate_php_url_constant_to_key",
  "class-http.php",
  "_deprecated_file",
  "WP_Http",
  "WpOrg\\Requests\\Autoload",
  "WpOrg\\Requests\\Requests"
];
const CASES = [
  { id: "http-parse-url:absolute-and-components", focus: "absolute URL parsing and PHP_URL_* component extraction" },
  { id: "http-parse-url:relative-and-schemeless", focus: "schemeless and root-relative placeholder normalization with query-colon behavior" },
  { id: "http-parse-url:component-helper", focus: "_get_component_from_parsed_url_array success, missing, false, and whole-array behavior" },
  { id: "http-parse-url:constant-translation", focus: "_wp_translate_php_url_constant_to_key maps known constants and rejects invalid constants" },
  { id: "class-http:deprecated-wrapper", focus: "class-http.php records deprecation and requires class-wp-http.php exactly once" }
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

$GLOBALS['wphx_deprecated_files'] = array();

function _deprecated_file( $file, $version, $replacement = '' ) {
\t$GLOBALS['wphx_deprecated_files'][] = array( 'file' => $file, 'version' => $version, 'replacement' => $replacement );
}

function wp_parse_args( $args = array(), $defaults = array() ) {
\treturn is_array( $args ) ? array_merge( $defaults, $args ) : $defaults;
}

require ABSPATH . WPINC . '/http.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-parse-url:absolute-and-components':
\t\t$url = 'https://user:pass@example.test:8443/path/file.php?x=1#frag';
\t\t$result['all'] = wp_parse_url( $url );
\t\t$result['components'] = array(
\t\t\t'scheme' => wp_parse_url( $url, PHP_URL_SCHEME ),
\t\t\t'host' => wp_parse_url( $url, PHP_URL_HOST ),
\t\t\t'port' => wp_parse_url( $url, PHP_URL_PORT ),
\t\t\t'user' => wp_parse_url( $url, PHP_URL_USER ),
\t\t\t'pass' => wp_parse_url( $url, PHP_URL_PASS ),
\t\t\t'path' => wp_parse_url( $url, PHP_URL_PATH ),
\t\t\t'query' => wp_parse_url( $url, PHP_URL_QUERY ),
\t\t\t'fragment' => wp_parse_url( $url, PHP_URL_FRAGMENT ),
\t\t);
\t\t$assertions['all_parts'] = array(
\t\t\t'scheme' => 'https',
\t\t\t'host' => 'example.test',
\t\t\t'port' => 8443,
\t\t\t'user' => 'user',
\t\t\t'pass' => 'pass',
\t\t\t'path' => '/path/file.php',
\t\t\t'query' => 'x=1',
\t\t\t'fragment' => 'frag',
\t\t) === $result['all'];
\t\t$assertions['components'] = array(
\t\t\t'scheme' => 'https',
\t\t\t'host' => 'example.test',
\t\t\t'port' => 8443,
\t\t\t'user' => 'user',
\t\t\t'pass' => 'pass',
\t\t\t'path' => '/path/file.php',
\t\t\t'query' => 'x=1',
\t\t\t'fragment' => 'frag',
\t\t) === $result['components'];
\t\tbreak;

\tcase 'http-parse-url:relative-and-schemeless':
\t\t$result['schemeless'] = wp_parse_url( '//cdn.example.test/lib.js?ver=1' );
\t\t$result['root_relative'] = wp_parse_url( '/wp-admin/admin.php?page=a:b&x=1' );
\t\t$result['root_components'] = array(
\t\t\t'scheme' => wp_parse_url( '/wp-admin/admin.php?page=a:b&x=1', PHP_URL_SCHEME ),
\t\t\t'host' => wp_parse_url( '/wp-admin/admin.php?page=a:b&x=1', PHP_URL_HOST ),
\t\t\t'path' => wp_parse_url( '/wp-admin/admin.php?page=a:b&x=1', PHP_URL_PATH ),
\t\t\t'query' => wp_parse_url( '/wp-admin/admin.php?page=a:b&x=1', PHP_URL_QUERY ),
\t\t);
\t\t$result['parse_failure'] = wp_parse_url( 'http://' );
\t\t$assertions['schemeless_removes_placeholder_scheme'] = array( 'host' => 'cdn.example.test', 'path' => '/lib.js', 'query' => 'ver=1' ) === $result['schemeless'];
\t\t$assertions['root_relative_removes_placeholder_scheme_host'] = array( 'path' => '/wp-admin/admin.php', 'query' => 'page=a:b&x=1' ) === $result['root_relative'];
\t\t$assertions['components_missing_are_null'] = null === $result['root_components']['scheme'] && null === $result['root_components']['host'] && '/wp-admin/admin.php' === $result['root_components']['path'] && 'page=a:b&x=1' === $result['root_components']['query'];
\t\t$assertions['parse_failure_false'] = false === $result['parse_failure'];
\t\tbreak;

\tcase 'http-parse-url:component-helper':
\t\t$parts = array( 'scheme' => 'https', 'host' => 'example.test', 'path' => '/index.php' );
\t\t$result['helper'] = array(
\t\t\t'all' => _get_component_from_parsed_url_array( $parts ),
\t\t\t'host' => _get_component_from_parsed_url_array( $parts, PHP_URL_HOST ),
\t\t\t'missing_query' => _get_component_from_parsed_url_array( $parts, PHP_URL_QUERY ),
\t\t\t'false_parts' => _get_component_from_parsed_url_array( false, PHP_URL_HOST ),
\t\t\t'invalid_component' => _get_component_from_parsed_url_array( $parts, 999 ),
\t\t);
\t\t$assertions['all'] = $parts === $result['helper']['all'];
\t\t$assertions['host'] = 'example.test' === $result['helper']['host'];
\t\t$assertions['missing_and_false_null'] = null === $result['helper']['missing_query'] && null === $result['helper']['false_parts'] && null === $result['helper']['invalid_component'];
\t\tbreak;

\tcase 'http-parse-url:constant-translation':
\t\t$result['translations'] = array(
\t\t\tPHP_URL_SCHEME => _wp_translate_php_url_constant_to_key( PHP_URL_SCHEME ),
\t\t\tPHP_URL_HOST => _wp_translate_php_url_constant_to_key( PHP_URL_HOST ),
\t\t\tPHP_URL_PORT => _wp_translate_php_url_constant_to_key( PHP_URL_PORT ),
\t\t\tPHP_URL_USER => _wp_translate_php_url_constant_to_key( PHP_URL_USER ),
\t\t\tPHP_URL_PASS => _wp_translate_php_url_constant_to_key( PHP_URL_PASS ),
\t\t\tPHP_URL_PATH => _wp_translate_php_url_constant_to_key( PHP_URL_PATH ),
\t\t\tPHP_URL_QUERY => _wp_translate_php_url_constant_to_key( PHP_URL_QUERY ),
\t\t\tPHP_URL_FRAGMENT => _wp_translate_php_url_constant_to_key( PHP_URL_FRAGMENT ),
\t\t\t'invalid' => _wp_translate_php_url_constant_to_key( 999 ),
\t\t);
\t\t$assertions['known_constants'] = array(
\t\t\tPHP_URL_SCHEME => 'scheme',
\t\t\tPHP_URL_HOST => 'host',
\t\t\tPHP_URL_PORT => 'port',
\t\t\tPHP_URL_USER => 'user',
\t\t\tPHP_URL_PASS => 'pass',
\t\t\tPHP_URL_PATH => 'path',
\t\t\tPHP_URL_QUERY => 'query',
\t\t\tPHP_URL_FRAGMENT => 'fragment',
\t\t\t'invalid' => false,
\t\t) === $result['translations'];
\t\tbreak;

\tcase 'class-http:deprecated-wrapper':
\t\trequire ABSPATH . WPINC . '/class-http.php';
\t\t$result['deprecated_files'] = $GLOBALS['wphx_deprecated_files'];
\t\t$result['class_exists'] = class_exists( 'WP_Http', false );
\t\trequire_once ABSPATH . WPINC . '/class-http.php';
\t\t$result['deprecated_after_second_require_once'] = $GLOBALS['wphx_deprecated_files'];
\t\t$assertions['deprecated_recorded'] = array( array( 'file' => 'class-http.php', 'version' => '5.9.0', 'replacement' => 'wp-includes/class-wp-http.php' ) ) === $result['deprecated_files'];
\t\t$assertions['class_loaded'] = true === $result['class_exists'];
\t\t$assertions['require_once_idempotent'] = $result['deprecated_files'] === $result['deprecated_after_second_require_once'];
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
    manifest_id: "ownership:wp-core/http-parse-url-shim-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "HTTP parse-url helper and deprecated class-http shim behavior",
      area: "src/wp-includes/http.php src/wp-includes/class-http.php src/wp-includes/class-wp-http.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/http.php, class-http.php, and class-wp-http.php in isolated PHP CLI probes with deterministic Requests autoload and deprecation stubs. It observes wp_parse_url, _get_component_from_parsed_url_array, _wp_translate_php_url_constant_to_key, and class-http.php's deprecated handoff without claiming live HTTP transport, Requests network I/O, URL safety validation, CORS header emission, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-requests-and-deprecation-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass URL parsing, compatibility shim, selected upstream HTTP PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-parse-url-shim-oracle-fixture",
        "npm run wp:core:wphx-312-http-parse-url-shim-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-44-http-parse-url-shim-oracle-fixture"],
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
    schema: "wphx.wp-core-http-parse-url-shim-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_api_wrapper_safety_fixture_manifest: inputRecord(API_FIXTURE),
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
          "Requests Autoload/Requests and _deprecated_file are deterministic structural stubs; copied http.php, class-http.php, and class-wp-http.php remain the executed public HTTP parse-url/shim sources."
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
          "The fixture observes URL parsing helpers and the deprecated class shim in isolation. Live HTTP transport, Requests network behavior, proxy/TLS behavior, and response streaming remain later WPHX-312 gates."
      },
      {
        id: "url-safety-validation-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "wp_http_validate_url and SSRF safety behavior are covered by WPHX-312.43; this fixture only observes parse_url compatibility helpers."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic stubs rather than an installed WordPress distribution or ecosystem HTTP callers."
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
    id: "receipt:wphx-312-44-http-parse-url-shim-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "HTTP parse-url/shim oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle HTTP parse-url/shim boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-parse-url-shim-oracle-fixture",
      "npm run wp:core:wphx-312-http-parse-url-shim-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-43-http-api-wrapper-safety-oracle-fixture"
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
