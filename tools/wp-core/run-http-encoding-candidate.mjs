#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.37",
  external_ref: "WPHX-312.50",
  title: "WPHX-312.50 - Promote WP_Http_Encoding to Haxe parity candidate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-encoding-candidate.mjs";
const HXML = "fixtures/wp-core/http-encoding-candidate.hxml";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-encoding.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-50";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const WPHX_PHP_ROOT = `${OUT_ROOT}/wphx-php`;
const WPHX_PHP_MANIFEST = `${WPHX_PHP_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-50-http-encoding-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-50-http-encoding-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-50-http-encoding-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const ENCODING_FIXTURE = "manifests/wp-core/wphx-312-40-http-encoding-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-encoding.php"];
const HAXE_SOURCES = [
  HXML,
  WPHX_PHP_HXML,
  "src/wphx/wp/http/HttpEncodingStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpEncodingCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpEncodingEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpEncodingShell.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpEncodingStrategy.hx"
];
const PROMOTED_SYMBOLS = [
  "WP_Http_Encoding::compress",
  "WP_Http_Encoding::decompress",
  "WP_Http_Encoding::compatible_gzinflate",
  "WP_Http_Encoding::content_encoding",
  "WP_Http_Encoding::should_decode",
  "WP_Http_Encoding::is_available"
];
const CASES = [
  { id: "http-encoding:roundtrip", focus: "compress/decompress roundtrip and content_encoding/is_available helpers" },
  { id: "http-encoding:fallbacks", focus: "decompress falls back through zlib/gzip paths and passes invalid data through" },
  { id: "http-encoding:compatible-gzinflate", focus: "compatible_gzinflate handles gzip-header and zlib-header payloads" },
  { id: "http-encoding:accept-enabled-filtered", focus: "accept_encoding enabled branch and wp_http_accept_encoding filter payload" },
  { id: "http-encoding:accept-disabled", focus: "accept_encoding disabled branches for decompress=false, stream=true, and limit_response_size" },
  { id: "http-encoding:should-decode", focus: "should_decode array/string/empty header behavior" }
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
  const source = `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-encoding.php`;
  const target = `${CANDIDATE_ROOT}/wp-includes/class-wp-http-encoding.php`;
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

$GLOBALS['wphx_filters'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => $value, 'args' => $args );
\tif ( 'wp_http_accept_encoding' === $hook_name && 'https://example.test/filter' === $args[0] ) {
\t\t$value[] = 'fixture;q=0.1';
\t}
\treturn $value;
}

require ABSPATH . WPINC . '/class-wp-http-encoding.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-encoding:roundtrip':
\t\t$raw = 'Encoding fixture payload: deflate me.';
\t\t$compressed = WP_Http_Encoding::compress( $raw, 6 );
\t\t$result['compressed_sha256'] = hash( 'sha256', $compressed );
\t\t$result['decompressed'] = WP_Http_Encoding::decompress( $compressed );
\t\t$result['content_encoding'] = WP_Http_Encoding::content_encoding();
\t\t$result['is_available'] = WP_Http_Encoding::is_available();
\t\t$assertions['roundtrip'] = $raw === $result['decompressed'];
\t\t$assertions['compressed_nonempty'] = is_string( $compressed ) && strlen( $compressed ) > 0;
\t\t$assertions['content_encoding'] = 'deflate' === $result['content_encoding'];
\t\t$assertions['available'] = true === $result['is_available'];
\t\tbreak;

\tcase 'http-encoding:fallbacks':
\t\t$raw = 'Fallback payload.';
\t\t$result['empty'] = WP_Http_Encoding::decompress( '' );
\t\t$result['gzcompress'] = WP_Http_Encoding::decompress( gzcompress( $raw ) );
\t\t$result['gzencode'] = WP_Http_Encoding::decompress( gzencode( $raw ) );
\t\t$result['invalid'] = WP_Http_Encoding::decompress( 'not-compressed' );
\t\t$assertions['empty_passthrough'] = '' === $result['empty'];
\t\t$assertions['gzcompress'] = $raw === $result['gzcompress'];
\t\t$assertions['gzencode'] = $raw === $result['gzencode'];
\t\t$assertions['invalid_passthrough'] = 'not-compressed' === $result['invalid'];
\t\tbreak;

\tcase 'http-encoding:compatible-gzinflate':
\t\t$raw = 'Compatible inflate payload.';
\t\t$result['gzip_header'] = WP_Http_Encoding::compatible_gzinflate( gzencode( $raw ) );
\t\t$result['zlib_header'] = WP_Http_Encoding::compatible_gzinflate( gzcompress( $raw ) );
\t\t$result['invalid'] = WP_Http_Encoding::compatible_gzinflate( 'invalid' );
\t\t$assertions['gzip_header'] = $raw === $result['gzip_header'];
\t\t$assertions['zlib_header'] = $raw === $result['zlib_header'];
\t\t$assertions['invalid_false'] = false === $result['invalid'];
\t\tbreak;

\tcase 'http-encoding:accept-enabled-filtered':
\t\t$args = array( 'decompress' => true, 'stream' => false );
\t\t$result['accept'] = WP_Http_Encoding::accept_encoding( 'https://example.test/filter', $args );
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$assertions['contains_core_encodings'] = str_contains( $result['accept'], 'deflate;q=1.0' ) && str_contains( $result['accept'], 'compress;q=0.5' ) && str_contains( $result['accept'], 'gzip;q=0.5' );
\t\t$assertions['filter_added'] = str_ends_with( $result['accept'], 'fixture;q=0.1' );
\t\t$assertions['filter_payload'] = 'wp_http_accept_encoding' === $GLOBALS['wphx_filters'][0]['hook'] && 'https://example.test/filter' === $GLOBALS['wphx_filters'][0]['args'][0] && $args === $GLOBALS['wphx_filters'][0]['args'][1];
\t\tbreak;

\tcase 'http-encoding:accept-disabled':
\t\t$result['decompress_false'] = WP_Http_Encoding::accept_encoding( 'https://example.test/no-decompress', array( 'decompress' => false, 'stream' => false ) );
\t\t$result['stream_true'] = WP_Http_Encoding::accept_encoding( 'https://example.test/stream', array( 'decompress' => true, 'stream' => true ) );
\t\t$result['limit_response_size'] = WP_Http_Encoding::accept_encoding( 'https://example.test/limit', array( 'decompress' => true, 'stream' => false, 'limit_response_size' => 128 ) );
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$assertions['disabled_empty'] = '' === $result['decompress_false'] && '' === $result['stream_true'] && '' === $result['limit_response_size'];
\t\t$assertions['filters_called'] = 3 === count( $GLOBALS['wphx_filters'] );
\t\t$assertions['filter_empty_values'] = array() === $GLOBALS['wphx_filters'][0]['value'] && array() === $GLOBALS['wphx_filters'][1]['value'] && array() === $GLOBALS['wphx_filters'][2]['value'];
\t\tbreak;

\tcase 'http-encoding:should-decode':
\t\t$result['array_gzip'] = WP_Http_Encoding::should_decode( array( 'content-encoding' => 'gzip' ) );
\t\t$result['array_empty'] = WP_Http_Encoding::should_decode( array( 'content-encoding' => '' ) );
\t\t$result['array_missing'] = WP_Http_Encoding::should_decode( array( 'content-type' => 'text/plain' ) );
\t\t$result['string_present'] = WP_Http_Encoding::should_decode( \"HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip\\r\\n\" );
\t\t$result['string_absent'] = WP_Http_Encoding::should_decode( \"HTTP/1.1 200 OK\\r\\nContent-Type: text/plain\\r\\n\" );
\t\t$assertions['array'] = true === $result['array_gzip'] && false === $result['array_empty'] && false === $result['array_missing'];
\t\t$assertions['string'] = true === $result['string_present'] && false === $result['string_absent'];
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
    manifest_id: "ownership:wp-core/http-encoding-candidate",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http_Encoding Haxe parity candidate",
      area: "src/wp-includes/class-wp-http-encoding.php public class shell backed by src/wphx/wp/http/HttpEncodingStrategy.hx",
      public_contract:
        "The candidate preserves the WP_Http_Encoding public PHP class/method ABI while delegating promoted encoding helpers to generated Haxe PHP. The Haxe strategy owns compression/decompression fallback order, gzip-compatible inflation, content-encoding, should-decode checks, and zlib availability decisions for the bounded fixture cases."
    },
    ownership_state: "haxe_parity_candidate",
    bridge: {
      exists: true,
      kind: "compiler-emitted-original-path-public-php-shell",
      removal_gate:
        "Promote beyond this bounded public class adapter only after selected upstream HTTP PHPUnit, installed distribution behavior, include timing, and live/recorded transfer-encoding parity gates pass."
    },
    owned_paths: [...HAXE_SOURCES, RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, WPHX_PHP_MANIFEST, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-encoding-candidate",
        "npm run wp:core:wphx-312-http-encoding-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-50-http-encoding-candidate", "receipt:wphx-312-40-http-encoding-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  command("haxe", [HXML]);
  command("haxe", [WPHX_PHP_HXML, "-D", `wphx_php_output=${WPHX_PHP_ROOT}`, "-D", `wphx_php_manifest=${WPHX_PHP_MANIFEST}`]);
  installCompilerEmittedCandidateShell();
  writeProbe();

  const oracle = runProbe(ORACLE_ROOT);
  const candidate = runProbe(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const observationsAssert = Object.values(oracle).every((entry) => Object.values(entry.assertions).every(Boolean));
  if (!observationsMatch || !observationsAssert) {
    console.error(JSON.stringify({ status: "failed", observationsMatch, observationsAssert, oracle, candidate }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const haxeOutputFiles = command("find", [HAXE_OUT, "-type", "f"]).split("\n").filter(Boolean).sort();
  const wphxPhpManifest = JSON.parse(readFileSync(WPHX_PHP_MANIFEST, "utf8"));
  const wphxDeclarations = wphxPhpManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
  if (JSON.stringify(wphxDeclarations) !== JSON.stringify(["class:WP_Http_Encoding"])) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP declarations", declarations: wphxDeclarations }, null, 2));
    process.exit(1);
  }
  if (wphxPhpManifest.unsupported.length !== 0) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP unsupported constructs", unsupported: wphxPhpManifest.unsupported }, null, 2));
    process.exit(1);
  }
  const generatedShellPath = mirrorPath(CANDIDATE_ROOT, "src/wp-includes/class-wp-http-encoding.php");
  const generatedShell = readFileSync(generatedShellPath, "utf8");
  const requiredShellShapes = [
    /#\[AllowDynamicProperties\]/,
    /class\s+WP_Http_Encoding/,
    /public\s+static\s+function\s+compress\s*\(\s*\$raw\s*,\s*\$level\s*=\s*9\s*,\s*\$supports\s*=\s*null\s*\)/,
    /public\s+static\s+function\s+decompress\s*\(\s*\$compressed\s*,\s*\$length\s*=\s*null\s*\)/,
    /public\s+static\s+function\s+compatible_gzinflate\s*\(\s*\$gz_data\s*\)/,
    /public\s+static\s+function\s+accept_encoding\s*\(\s*\$url\s*,\s*\$args\s*\)/,
    /public\s+static\s+function\s+content_encoding\s*\(\s*\)/,
    /public\s+static\s+function\s+should_decode\s*\(\s*\$headers\s*\)/,
    /public\s+static\s+function\s+is_available\s*\(\s*\)/
  ];
  const encodingShellEmitted =
    requiredShellShapes.every((pattern) => pattern.test(generatedShell)) &&
    generatedShell.includes("HttpEncodingStrategy::compress") &&
    generatedShell.includes("HttpEncodingStrategy::decompress") &&
    generatedShell.includes("HttpEncodingStrategy::compatibleGzinflate") &&
    generatedShell.includes("apply_filters( 'wp_http_accept_encoding', $type, $url, $args )") &&
    generatedShell.includes("HttpEncodingStrategy::shouldDecodeFromNativeHeaders") &&
    generatedShell.includes("HttpEncodingStrategy::isAvailable");
  if (!encodingShellEmitted) {
    console.error(JSON.stringify({ status: "failed", reason: "generated shell is missing WP_Http_Encoding adapter shape" }, null, 2));
    process.exit(1);
  }
  const manifest = {
    schema: "wphx.wp-core-http-encoding-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "haxe_generated_candidate", "php_cli_observed_fixture"],
    artifact_scope: "candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      encoding_oracle_fixture_manifest: inputRecord(ENCODING_FIXTURE),
      runner: inputRecord(RUNNER),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      kind: "haxe_generated_http_encoding_strategy",
      hxml: HXML,
      wphx_php_hxml: WPHX_PHP_HXML,
      promoted_symbols: PROMOTED_SYMBOLS,
      public_shell: generatedShellPath,
      compiler_emitted_public_shell: {
        path: generatedShellPath,
        source_path: `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-encoding.php`,
        manifest: WPHX_PHP_MANIFEST,
        declarations: wphxDeclarations,
        emitted_methods: [
          "compress",
          "decompress",
          "compatible_gzinflate",
          "accept_encoding",
          "content_encoding",
          "should_decode",
          "is_available"
        ],
        unsupported: wphxPhpManifest.unsupported
      },
      generated_php_files: haxeOutputFiles.map(inputRecord),
      boundary_notes: [
        "PHP zlib functions remain a narrow WPHX-211 native boundary because WordPress exposes PHP's binary string and false-on-failure semantics.",
        "accept_encoding keeps the native function_exists and apply_filters('wp_http_accept_encoding') boundaries in the compiler-emitted public PHP shell while is_available delegates to Haxe."
      ]
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
          "Only apply_filters is stubbed for the accept-encoding filter. Oracle executes copied WordPress class-wp-http-encoding.php; candidate executes the compiler-emitted original-path public class shell with promoted methods delegated to generated Haxe PHP."
      }
    },
    build: { haxe_out: HAXE_OUT, oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
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
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail: "The candidate is compared in a PHP CLI fixture rather than an installed WordPress distribution."
      },
      {
        id: "live-transfer-encoding-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes deterministic PHP CLI zlib payloads and header checks, not live HTTP content negotiation, streaming transfer behavior, or partial response races."
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
      encoding_shell_emitted: encodingShellEmitted,
      unsupported_empty: wphxPhpManifest.unsupported.length === 0,
      installed_wordpress_behavior_claimed: false,
      live_transfer_encoding_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-50-http-encoding-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http_Encoding Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-backed HTTP encoding candidate" },
      { path: RUNNER, role: "candidate generator and oracle comparator" },
      { path: "src/wphx/wp/http/HttpEncodingStrategy.hx", role: "Haxe-owned HTTP encoding strategy source" },
      { path: WPHX_PHP_MANIFEST, role: "WPHX PHP emission manifest for compiler-emitted class-wp-http-encoding.php" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-encoding-candidate",
      "npm run wp:core:wphx-312-http-encoding-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-40-http-encoding-oracle-fixture"
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

  console.log(JSON.stringify({ status: "passed", output: OUT, ownership: OWNERSHIP, receipt: RECEIPT, fixture_cases: CASES.length }, null, 2));
}

await main();
