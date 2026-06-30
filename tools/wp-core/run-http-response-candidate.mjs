#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ldp",
  external_ref: "WPHX-312.52",
  title: "WPHX-312.52 - Promote WP_HTTP_Response object state to Haxe candidate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-response-candidate.mjs";
const HXML = "fixtures/wp-core/http-response-candidate.hxml";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-response.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-52";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const WPHX_PHP_ROOT = `${OUT_ROOT}/wphx-php`;
const WPHX_PHP_MANIFEST = `${WPHX_PHP_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-52-http-response-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-52-http-response-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-52-http-response-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const RESPONSE_FIXTURE = "manifests/wp-core/wphx-312-38-http-response-object-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-response.php"];
const HAXE_SOURCES = [
  HXML,
  WPHX_PHP_HXML,
  "src/wphx/wp/http/HttpResponseState.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpResponseCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpResponseState.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpResponseEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpResponseShell.hx"
];
const PROMOTED_SYMBOLS = [
  "WP_HTTP_Response::__construct",
  "WP_HTTP_Response::get_data",
  "WP_HTTP_Response::set_data",
  "WP_HTTP_Response::get_headers",
  "WP_HTTP_Response::set_headers",
  "WP_HTTP_Response::header",
  "WP_HTTP_Response::get_status",
  "WP_HTTP_Response::set_status",
  "WP_HTTP_Response::jsonSerialize"
];
const CASES = [
  { id: "http-response:constructor", focus: "constructor initializes data, absint status, and headers" },
  { id: "http-response:mutators", focus: "set_data, set_status, and set_headers update observable state" },
  { id: "http-response:header-replace", focus: "header() replaces existing values by default" },
  { id: "http-response:header-append", focus: "header() appends comma-separated values when replace=false" },
  { id: "http-response:json-serialize", focus: "jsonSerialize returns current data while json_encode serializes public properties" }
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
  const source = `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-response.php`;
  const target = `${CANDIDATE_ROOT}/wp-includes/class-wp-http-response.php`;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
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

function absint( $maybeint ) {
\treturn abs( (int) $maybeint );
}
function wphx_response_summary( $response ) {
\treturn array(
\t\t'data' => $response->get_data(),
\t\t'status' => $response->get_status(),
\t\t'headers' => $response->get_headers(),
\t\t'json' => $response->jsonSerialize(),
\t\t'public_data' => $response->data,
\t\t'public_status' => $response->status,
\t\t'public_headers' => $response->headers,
\t);
}

require ABSPATH . WPINC . '/class-wp-http-response.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-response:constructor':
\t\t$response = new WP_HTTP_Response( array( 'ok' => true ), '-201', array( 'X-Start' => 'one' ) );
\t\t$result['response'] = wphx_response_summary( $response );
\t\t$assertions['data'] = array( 'ok' => true ) === $response->get_data();
\t\t$assertions['status_absint'] = 201 === $response->get_status();
\t\t$assertions['headers'] = array( 'X-Start' => 'one' ) === $response->get_headers();
\t\tbreak;

\tcase 'http-response:mutators':
\t\t$response = new WP_HTTP_Response();
\t\t$response->set_data( array( 'changed' => array( 1, 2, 3 ) ) );
\t\t$response->set_status( -404 );
\t\t$response->set_headers( array( 'Content-Type' => 'application/json', 'X-Test' => 'alpha' ) );
\t\t$result['response'] = wphx_response_summary( $response );
\t\t$assertions['data'] = array( 'changed' => array( 1, 2, 3 ) ) === $response->get_data();
\t\t$assertions['status_absint'] = 404 === $response->get_status();
\t\t$assertions['headers'] = array( 'Content-Type' => 'application/json', 'X-Test' => 'alpha' ) === $response->get_headers();
\t\tbreak;

\tcase 'http-response:header-replace':
\t\t$response = new WP_HTTP_Response( 'body', 200, array( 'X-Mode' => 'old' ) );
\t\t$response->header( 'X-Mode', 'new' );
\t\t$response->header( 'X-New', 'created' );
\t\t$result['response'] = wphx_response_summary( $response );
\t\t$assertions['replaced'] = 'new' === $response->get_headers()['X-Mode'];
\t\t$assertions['created'] = 'created' === $response->get_headers()['X-New'];
\t\tbreak;

\tcase 'http-response:header-append':
\t\t$response = new WP_HTTP_Response( 'body', 200, array( 'Vary' => 'Accept' ) );
\t\t$response->header( 'Vary', 'User-Agent', false );
\t\t$response->header( 'Cache-Control', 'max-age=60', false );
\t\t$result['response'] = wphx_response_summary( $response );
\t\t$assertions['appended'] = 'Accept, User-Agent' === $response->get_headers()['Vary'];
\t\t$assertions['created_when_absent'] = 'max-age=60' === $response->get_headers()['Cache-Control'];
\t\tbreak;

\tcase 'http-response:json-serialize':
\t\t$response = new WP_HTTP_Response( array( 'first' => true ), 200, array() );
\t\t$first = $response->jsonSerialize();
\t\t$response->set_data( array( 'second' => array( 'nested' => true ) ) );
\t\t$second = $response->jsonSerialize();
\t\t$result['first'] = $first;
\t\t$result['second'] = $second;
\t\t$result['json_encoded'] = json_encode( $response );
\t\t$result['response'] = wphx_response_summary( $response );
\t\t$assertions['first'] = array( 'first' => true ) === $first;
\t\t$assertions['second'] = array( 'second' => array( 'nested' => true ) ) === $second;
\t\t$assertions['json_encode_uses_public_properties'] = '{"data":{"second":{"nested":true}},"headers":[],"status":200}' === $result['json_encoded'];
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
    manifest_id: "ownership:wp-core/http-response-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_HTTP_Response object state behavior",
      area: "src/wp-includes/class-wp-http-response.php",
      public_contract:
        "This candidate preserves the WP_HTTP_Response PHP class shell, public properties, AllowDynamicProperties attribute, and absint boundary while delegating constructor-equivalent state initialization, get/set data, get/set headers, single-header replace/append behavior, get/set status, and jsonSerialize data handoff to typed Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "compiler-emitted-original-path-public-php-shell",
      removal_gate:
        "Promote beyond this bounded public class adapter only after REST dispatch, Requests bridge, installed HTTP routes, selected upstream HTTP/REST PHPUnit, and ecosystem fixtures pass."
    },
    owned_paths: [RUNNER, ...HAXE_SOURCES, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, WPHX_PHP_MANIFEST, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-response-candidate",
        "npm run wp:core:wphx-312-http-response-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-52-http-response-candidate"],
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
  const wphxDeclarations = wphxPhpManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
  if (JSON.stringify(wphxDeclarations) !== JSON.stringify(["class:WP_HTTP_Response"])) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP declarations", declarations: wphxDeclarations }, null, 2));
    process.exit(1);
  }
  if (wphxPhpManifest.unsupported.length !== 0) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP unsupported constructs", unsupported: wphxPhpManifest.unsupported }, null, 2));
    process.exit(1);
  }
  const generatedShellPath = mirrorPath(CANDIDATE_ROOT, "src/wp-includes/class-wp-http-response.php");
  const generatedShell = readFileSync(generatedShellPath, "utf8");
  const requiredShellShapes = [
    /#\[AllowDynamicProperties\]/,
    /class\s+WP_HTTP_Response/,
    /public\s+\$data;/,
    /public\s+\$headers;/,
    /public\s+\$status;/,
    /public\s+function\s+__construct\s*\(\s*\$data\s*=\s*null\s*,\s*\$status\s*=\s*200\s*,\s*\$headers\s*=\s*\[\s*\]\s*\)/,
    /public\s+function\s+get_headers\s*\(\s*\)/,
    /public\s+function\s+set_headers\s*\(\s*\$headers\s*\)/,
    /public\s+function\s+header\s*\(\s*\$key\s*,\s*\$value\s*,\s*\$replace\s*=\s*true\s*\)/,
    /public\s+function\s+get_status\s*\(\s*\)/,
    /public\s+function\s+set_status\s*\(\s*\$code\s*\)/,
    /public\s+function\s+get_data\s*\(\s*\)/,
    /public\s+function\s+set_data\s*\(\s*\$data\s*\)/,
    /public\s+function\s+jsonSerialize\s*\(\s*\)/
  ];
  const responseShellEmitted =
    requiredShellShapes.every((pattern) => pattern.test(generatedShell)) &&
    generatedShell.includes("HttpResponseState::initialize( $this, $data, $status, $headers )") &&
    generatedShell.includes("HttpResponseState::header( $this, (string) $key, (string) $value, (bool) $replace )") &&
    generatedShell.includes("HttpResponseState::jsonSerialize( $this )");
  if (!responseShellEmitted) {
    console.error(JSON.stringify({ status: "failed", reason: "generated shell is missing WP_HTTP_Response adapter shape" }, null, 2));
    process.exit(1);
  }
  const manifest = {
    schema: "wphx.wp-core-http-response-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      response_oracle_fixture_manifest: inputRecord(RESPONSE_FIXTURE),
      runner: inputRecord(RUNNER),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      wphx_php_hxml: WPHX_PHP_HXML,
      haxe_output: HAXE_OUT,
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort(),
      promoted_symbols: PROMOTED_SYMBOLS,
      public_shell: generatedShellPath,
      compiler_emitted_public_shell: {
        path: generatedShellPath,
        source_path: `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-response.php`,
        manifest: WPHX_PHP_MANIFEST,
        declarations: wphxDeclarations,
        emitted_methods: ["__construct", "get_headers", "set_headers", "header", "get_status", "set_status", "get_data", "set_data", "jsonSerialize"],
        emitted_properties: ["data", "headers", "status"],
        unsupported: wphxPhpManifest.unsupported
      },
      public_shell_policy: {
        public_php_replacement_claimed: true,
        compiler_emitted_public_php: true,
        public_php_abi_preserved: true,
        shell_body_ownership: "compiler-emitted original-path public class shell delegates bounded state behavior to generated Haxe PHP",
        native_boundaries: ["absint", "public PHP properties", "AllowDynamicProperties", "json_encode public-property serialization"]
      }
    },
    fixture: {
      cases: CASES,
      source_files: SOURCE_FILES,
      probe: { path: PROBE, sha256: sha256File(PROBE) },
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
      php_cli: true,
      runtime_stubs:
          "absint is a deterministic WordPress-compatible stub; the candidate executes the compiler-emitted original-path public class shell while preserving the native absint call boundary through Haxe."
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
        id: "rest-server-dispatch-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The candidate observes WP_HTTP_Response in isolation. REST request dispatch, controller handoff, and installed REST HTTP behavior remain covered by WPHX-311 and later distribution gates."
      },
      {
        id: "requests-transport-integration-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The candidate does not execute live HTTP transport, Requests response conversion, redirects, cookies, proxy, TLS, or network I/O."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail: "The fixture uses PHP CLI with a deterministic absint stub rather than an installed WordPress distribution or plugin/theme ecosystem routes."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      promoted_symbols: PROMOTED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: true,
      compiler_emitted_public_php: true,
      response_shell_emitted: responseShellEmitted,
      unsupported_empty: wphxPhpManifest.unsupported.length === 0,
      installed_wordpress_behavior_claimed: false,
      rest_dispatch_claimed: false,
      live_http_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-52-http-response-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_HTTP_Response Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned HTTP response state behavior" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpResponseState.hx", role: "typed Haxe source for WP_HTTP_Response state behavior" },
      { path: WPHX_PHP_MANIFEST, role: "WPHX PHP emission manifest for compiler-emitted class-wp-http-response.php" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-response-candidate",
      "npm run wp:core:wphx-312-http-response-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-38-http-response-object-oracle-fixture"
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
