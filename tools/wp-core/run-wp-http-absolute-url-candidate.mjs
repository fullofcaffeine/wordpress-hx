#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-a7v",
  external_ref: "WPHX-312.58",
  title: "WPHX-312.58 - Promote WP_Http absolute URL helper to Haxe candidate"
};
const RECORDED_AT = "2026-06-28T00:50:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-absolute-url-candidate.mjs";
const HXML = "fixtures/wp-core/http-absolute-url-candidate.hxml";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-grouped-helpers.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-58";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const WPHX_PHP_ROOT = `${OUT_ROOT}/wphx-php`;
const WPHX_PHP_MANIFEST = `${WPHX_PHP_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-58-wp-http-absolute-url-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-58-wp-http-absolute-url-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-58-wp-http-absolute-url-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HELPER_FIXTURE = "manifests/wp-core/wphx-312-41-wp-http-helper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http.php"];
const HAXE_SOURCES = [
  HXML,
  WPHX_PHP_HXML,
  "src/wphx/wp/http/HttpAbsoluteUrl.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpAbsoluteUrlCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpGroupedHelpersEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpGroupedHelpersShell.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpCookieHeaderAssembly.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpProcessHeaders.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpProcessResponse.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpChunkTransferDecode.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpDeprecatedParseUrl.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpIpAddress.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRedirectCompatibility.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRedirectValidation.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpAbsoluteUrl.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/PhpHttpGlobals.hx"
];
const PROMOTED_SYMBOLS = [
  "WP_Http::make_absolute_url schemeless host assembly",
  "WP_Http::make_absolute_url root-relative path assembly",
  "WP_Http::make_absolute_url relative parent path normalization",
  "WP_Http::make_absolute_url query and fragment append"
];
const CASES = [
  {
    id: "wp-http:make-absolute-url",
    focus: "absolute, schemeless, root-relative, relative-parent, query, fragment, empty-base, and parse-failure URL resolution"
  }
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

function wp_parse_url( $url ) {
\tif ( 'fixture://parse-fail' === $url || 'fixture://relative-parse-fail' === $url ) {
\t\treturn false;
\t}
\treturn parse_url( $url );
}

require ABSPATH . WPINC . '/class-wp-http.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'wp-http:make-absolute-url':
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
\t\t$assertions['absolute'] = 'https://other.test/x' === $result['urls']['absolute'];
\t\t$assertions['schemeless'] = 'https://cdn.example.test:8443/lib.js' === $result['urls']['schemeless'];
\t\t$assertions['root_relative'] = 'https://example.test/assets/app.js?ver=1#top' === $result['urls']['root_relative'];
\t\t$assertions['relative_parent'] = 'https://example.test/wp-admin/img/logo.png?x=1#frag' === $result['urls']['relative_parent'];
\t\t$assertions['query_fragment'] = 'https://example.test/wp-admin/css/edit.css?updated=1#section' === $result['urls']['query_fragment'];
\t\t$assertions['parse_failures_passthrough'] = 'relative/file.txt' === $result['urls']['empty_base'] && 'relative/file.txt' === $result['urls']['base_parse_fail'] && 'fixture://relative-parse-fail' === $result['urls']['relative_parse_fail'];
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
    manifest_id: "ownership:wp-core/wp-http-absolute-url-candidate",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http absolute URL helper",
      area: "src/wp-includes/class-wp-http.php WP_Http::make_absolute_url",
      public_contract:
        "This candidate preserves the WP_Http PHP class shell and wp_parse_url parse/failure behavior while delegating URL assembly and relative-path normalization to module-level Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "compiler-emitted-grouped-original-path-public-php-shell",
      removal_gate:
        "Pass broader redirect helper, upstream HTTP PHPUnit, installed distribution, ecosystem redirect, and whole-file WP_Http gates before claiming durable public PHP or whole-file ownership."
    },
    owned_paths: [
      RUNNER,
      HXML,
      WPHX_PHP_HXML,
      "src/wphx/wp/http/HttpAbsoluteUrl.hx",
      "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpAbsoluteUrlCandidateEntry.hx",
      "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpGroupedHelpersShell.hx",
      OUT,
      OWNERSHIP,
      RECEIPT
    ],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, WPHX_PHP_MANIFEST, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-absolute-url-candidate",
        "npm run wp:core:wphx-312-wp-http-absolute-url-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-58-wp-http-absolute-url-candidate"],
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
  if (JSON.stringify(wphxDeclarations) !== JSON.stringify(["class:WP_Http"])) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP declarations", declarations: wphxDeclarations }, null, 2));
    process.exit(1);
  }
  if (wphxPhpManifest.unsupported.length !== 0) {
    console.error(JSON.stringify({ status: "failed", reason: "unexpected WPHX PHP unsupported constructs", unsupported: wphxPhpManifest.unsupported }, null, 2));
    process.exit(1);
  }
  const generatedShellPath = mirrorPath(CANDIDATE_ROOT, "src/wp-includes/class-wp-http.php");
  const generatedShell = readFileSync(generatedShellPath, "utf8");
  const absoluteUrlEmitted =
    /public\s+static\s+function\s+make_absolute_url\s*\(\s*\$maybe_relative_path\s*,\s*\$url\s*\)/.test(generatedShell) &&
    generatedShell.includes("wp_parse_url( $url )") &&
    generatedShell.includes("wp_parse_url( $maybe_relative_path )") &&
    generatedShell.includes("HttpAbsoluteUrl_Fields_::makeAbsoluteUrl");
  if (!absoluteUrlEmitted) {
    console.error(JSON.stringify({ status: "failed", reason: "generated shell is missing make_absolute_url adapter shape" }, null, 2));
    process.exit(1);
  }
  const manifest = {
    schema: "wphx.wp-core-wp-http-absolute-url-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      helper_oracle_fixture_manifest: inputRecord(HELPER_FIXTURE),
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
      compiler_emitted_public_shell: {
        path: generatedShellPath,
        source_path: `${WPHX_PHP_ROOT}/wp-includes/class-wp-http.php`,
        manifest: WPHX_PHP_MANIFEST,
        declarations: wphxDeclarations,
        emitted_methods: [
          {
            name: "make_absolute_url",
            visibility: "public",
            by_reference_parameters: []
          }
        ],
        unsupported: wphxPhpManifest.unsupported
      },
      promoted_symbols: PROMOTED_SYMBOLS,
      public_shell_policy: {
        public_php_replacement_claimed: true,
        public_php_abi_preserved: true,
        shell_body_ownership:
          "compiler-emitted original-path class-wp-http.php shell preserves the WP_Http::make_absolute_url public static method ABI and wp_parse_url failure/passthrough behavior while delegating URL construction to generated Haxe PHP",
        native_boundaries: [
          "wp_parse_url",
          "PHP empty() branch booleans for parsed URL components",
          "compiler-emitted original-path class-wp-http.php shell"
        ]
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
        runtime_stubs: "Requests Autoload/Requests and wp_parse_url are deterministic local stubs. No HTTP request is dispatched."
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
        id: "broader-redirect-helpers-not-promoted",
        owner: ISSUE.external_ref,
        detail:
          "This candidate promotes only make_absolute_url assembly/normalization. handle_redirects, cookie filtering, remote redirect orchestration, and live transport remain owned by their separate fixtures or future candidates."
      },
      {
        id: "wp-parse-url-boundary-preserved",
        owner: ISSUE.external_ref,
        detail:
          "The candidate intentionally keeps wp_parse_url and parse-failure passthrough in PHP because WordPress URL parsing behavior is a public compatibility boundary."
      },
      {
        id: "live-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture observes absolute URL helper behavior only. It does not execute WP_Http::request, Requests network I/O, DNS, proxy, TLS, redirect following, or transport execution."
      },
      {
        id: "whole-wp-http-file-not-yet-owned",
        owner: ISSUE.external_ref,
        detail:
          "The candidate consumes a compiler-emitted grouped original-path class-wp-http.php shell for the make_absolute_url boundary, but broader WP_Http methods and whole-file original-path ownership remain later compiler-driven gates."
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
      make_absolute_url_emitted: absoluteUrlEmitted,
      unsupported_empty: wphxPhpManifest.unsupported.length === 0,
      installed_wordpress_behavior_claimed: false,
      live_http_claimed: false,
      dns_resolution_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-58-wp-http-absolute-url-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http absolute URL Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned WP_Http absolute URL helper" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpAbsoluteUrl.hx", role: "module-level Haxe source for WP_Http::make_absolute_url assembly" },
      { path: WPHX_PHP_MANIFEST, role: "WPHX PHP emission manifest for compiler-emitted class-wp-http.php" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-absolute-url-candidate",
      "npm run wp:core:wphx-312-wp-http-absolute-url-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-41-wp-http-helper-oracle-fixture",
      "receipt:wphx-comp-php-group-wp-http-helpers"
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
