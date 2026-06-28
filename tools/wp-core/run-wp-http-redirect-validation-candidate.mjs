#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-9ny",
  external_ref: "WPHX-312.57",
  title: "WPHX-312.57 - Promote WP_Http redirect validation decision to Haxe candidate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-redirect-validation-candidate.mjs";
const HXML = "fixtures/wp-core/http-redirect-validation-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-57";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-57-wp-http-redirect-validation-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-57-wp-http-redirect-validation-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-57-wp-http-redirect-validation-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HELPER_FIXTURE = "manifests/wp-core/wphx-312-41-wp-http-helper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http.php"];
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/http/HttpRedirectValidation.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpRedirectValidationCandidateEntry.hx"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpRedirectValidation\\HttpRedirectValidation_Fields_";
const PROMOTED_SYMBOLS = ["WP_Http::validate_redirects failure decision"];
const CASES = [
  { id: "wp-http:validate-redirects", focus: "redirect validation accepts safe URLs and throws the Requests exception/type for invalid URLs" }
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
  return `if ( ! function_exists( 'wphx_312_57_bootstrap_haxe' ) ) {
\tfunction wphx_312_57_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_312_57_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_312_57_lib );
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
wphx_312_57_bootstrap_haxe();
`;
}

function installBootstrap(source) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) throw new Error("class-wp-http.php did not start with PHP open tag");
  return `${marker}\n${haxeBootstrapBlock()}\n${source.slice(marker.length)}`;
}

function replaceStaticMethod(source, methodName, replacement) {
  const pattern = new RegExp(`public\\s+static\\s+function\\s+${methodName}\\s*\\(`, "m");
  const match = pattern.exec(source);
  if (!match) throw new Error(`Unable to locate static method ${methodName}`);
  const openBrace = source.indexOf("{", match.index);
  if (openBrace === -1) throw new Error(`Unable to locate opening brace for ${methodName}`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return `${source.slice(0, match.index)}${replacement}${source.slice(index + 1)}`;
    }
  }
  throw new Error(`Unable to locate closing brace for ${methodName}`);
}

function transformCandidateRedirectValidation() {
  const path = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceStaticMethod(
    source,
    "validate_redirects",
    `public static function validate_redirects( $location ) {
\tif ( ${HAXE_MODULE}::shouldRejectRedirect( (bool) wp_http_validate_url( $location ) ) ) {
\t\tthrow new WpOrg\\Requests\\Exception( __( 'A valid URL was not provided.' ), 'wp_http.redirect_failed_validation' );
\t}
}`
  );
  writeFileSync(path, source);
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

function __( $text ) {
\treturn $text;
}

function wp_http_validate_url( $location ) {
\treturn str_starts_with( $location, 'https://valid.example/' ) ? $location : false;
}

require ABSPATH . WPINC . '/class-wp-http.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'wp-http:validate-redirects':
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
\t\t$assertions['valid_no_throw'] = 'no-throw' === $valid;
\t\t$assertions['invalid_exception'] = array( 'class' => 'WpOrg\\\\Requests\\\\Exception', 'message' => 'A valid URL was not provided.', 'type' => 'wp_http.redirect_failed_validation' ) === $error;
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
    manifest_id: "ownership:wp-core/wp-http-redirect-validation-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http redirect validation failure decision",
      area: "src/wp-includes/class-wp-http.php WP_Http::validate_redirects",
      public_contract:
        "This candidate preserves the WP_Http PHP class shell, wp_http_validate_url, translation, and Requests exception ABI while delegating the validated/failed branch decision to module-level Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "generated-php-haxe-helper-with-temporary-original-path-shell",
      removal_gate:
        "Replace the temporary candidate shell with generated original-path public PHP adapters and pass broader redirect helper, upstream HTTP PHPUnit, installed distribution, ecosystem redirect, and generated-shell gates before claiming durable public PHP ownership."
    },
    owned_paths: [RUNNER, HXML, "src/wphx/wp/http/HttpRedirectValidation.hx", "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpRedirectValidationCandidateEntry.hx", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-redirect-validation-candidate",
        "npm run wp:core:wphx-312-wp-http-redirect-validation-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-57-wp-http-redirect-validation-candidate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  transformCandidateRedirectValidation();
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
    schema: "wphx.wp-core-wp-http-redirect-validation-candidate.v1",
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
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      haxe_output: HAXE_OUT,
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort(),
      promoted_symbols: PROMOTED_SYMBOLS,
      public_shell_policy: {
        public_php_replacement_claimed: false,
        public_php_abi_preserved: true,
        shell_body_ownership:
          "temporary candidate shell preserves the WP_Http public static method ABI, WordPress URL validation, translation, and Requests exception construction while delegating the bounded failure decision to generated Haxe PHP",
        native_boundaries: ["wp_http_validate_url", "__ translation", "WpOrg\\Requests\\Exception"]
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
        runtime_stubs: "Requests Autoload/Requests/Exception, __, and wp_http_validate_url are deterministic local stubs. No HTTP request is dispatched."
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
          "This candidate promotes only the validate_redirects failure branch decision. browser redirect compatibility, make_absolute_url, handle_redirects, cookie filtering, and remote redirect orchestration remain owned by their separate fixtures or future candidates."
      },
      {
        id: "url-validation-exception-boundaries-preserved",
        owner: ISSUE.external_ref,
        detail:
          "The candidate intentionally keeps wp_http_validate_url, translation, and Requests exception construction in PHP because these are public WordPress/Requests compatibility boundaries."
      },
      {
        id: "live-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture observes redirect validation helper behavior only. It does not execute WP_Http::request, Requests network I/O, DNS, proxy, TLS, redirect following, or transport execution."
      },
      {
        id: "durable-public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The candidate uses a bounded generated-PHP helper plus temporary original-path shell; durable shell generation remains a later cross-domain gate."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      promoted_symbols: PROMOTED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_http_claimed: false,
      dns_resolution_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-57-wp-http-redirect-validation-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http redirect validation Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned WP_Http redirect validation decision" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpRedirectValidation.hx", role: "module-level Haxe source for WP_Http::validate_redirects decision" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-redirect-validation-candidate",
      "npm run wp:core:wphx-312-wp-http-redirect-validation-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
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
