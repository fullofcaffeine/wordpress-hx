#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ubd",
  external_ref: "WPHX-312.54",
  title: "WPHX-312.54 - Promote WP_Http block-request policy to Haxe candidate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-block-request-candidate.mjs";
const HXML = "fixtures/wp-core/http-block-request-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-54";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-54-wp-http-block-request-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-54-wp-http-block-request-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-54-wp-http-block-request-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const BLOCK_FIXTURE = "manifests/wp-core/wphx-312-47-wp-http-block-request-policy-oracle-fixture.v1.json";
const HTTP_REQUEST_FIXTURE = "manifests/wp-core/wphx-312-46-wp-http-request-orchestration-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http.php"];
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/http/HttpBlockRequestPolicy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpBlockRequestCandidateEntry.hx"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpBlockRequestPolicy\\HttpBlockRequestPolicy_Fields_";
const PROMOTED_SYMBOLS = [
  "WP_Http::block_request local-host detection",
  "WP_Http::block_request WP_ACCESSIBLE_HOSTS exact allowlist matching",
  "WP_Http::block_request WP_ACCESSIBLE_HOSTS wildcard allowlist matching"
];
const CASES = [
  { id: "wp-http-block:disabled", focus: "missing/false WP_HTTP_BLOCK_EXTERNAL leaves all requests unblocked" },
  { id: "wp-http-block:default-external", focus: "WP_HTTP_BLOCK_EXTERNAL blocks malformed and external URLs while allowing localhost and site host" },
  { id: "wp-http-block:local-filter", focus: "block_local_requests filter can block local/site-host requests" },
  { id: "wp-http-block:accessible-exact", focus: "WP_ACCESSIBLE_HOSTS exact host allowlist bypasses external blocking" },
  { id: "wp-http-block:accessible-wildcard", focus: "WP_ACCESSIBLE_HOSTS wildcard allowlist bypasses matching subdomains only" }
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
  return `if ( ! function_exists( 'wphx_312_54_bootstrap_haxe' ) ) {
\tfunction wphx_312_54_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_312_54_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_312_54_lib );
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
wphx_312_54_bootstrap_haxe();
`;
}

function installBootstrap(source) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) throw new Error("class-wp-http.php did not start with PHP open tag");
  return `${marker}\n${haxeBootstrapBlock()}\n${source.slice(marker.length)}`;
}

function replaceMethod(source, methodName, replacement) {
  const pattern = new RegExp(`public\\s+function\\s+${methodName}\\s*\\(`, "m");
  const match = pattern.exec(source);
  if (!match) throw new Error(`Unable to locate method ${methodName}`);
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

function transformCandidateBlockRequest() {
  const path = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceMethod(
    source,
    "block_request",
    `public function block_request( $uri ) {
\t// We don't need to block requests, because nothing is blocked.
\tif ( ! defined( 'WP_HTTP_BLOCK_EXTERNAL' ) || ! WP_HTTP_BLOCK_EXTERNAL ) {
\t\treturn false;
\t}

\t$check = parse_url( $uri );
\tif ( ! $check ) {
\t\treturn true;
\t}

\t$home         = parse_url( get_option( 'siteurl' ) );
\t$request_host = $check['host'] ?? '';
\t$site_host    = isset( $home['host'] ) ? $home['host'] : '';

\t// Don't block requests back to ourselves by default.
\tif ( ${HAXE_MODULE}::isLocalRequest( $request_host, $site_host ) ) {
\t\treturn apply_filters( 'block_local_requests', false );
\t}

\tif ( ! defined( 'WP_ACCESSIBLE_HOSTS' ) ) {
\t\treturn true;
\t}

\treturn ${HAXE_MODULE}::shouldBlockExternalHost( $request_host, WP_ACCESSIBLE_HOSTS );
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

$GLOBALS['wphx_filter_calls'] = array();
$GLOBALS['wphx_force_block_local'] = 'wp-http-block:local-filter' === $case;

function apply_filters( $hook, $value, ...$args ) {
\t$GLOBALS['wphx_filter_calls'][] = array( 'hook' => $hook, 'value' => $value, 'args' => $args );
\tif ( 'block_local_requests' === $hook && ! empty( $GLOBALS['wphx_force_block_local'] ) ) {
\t\treturn true;
\t}
\treturn $value;
}

function get_option( $name ) {
\treturn 'siteurl' === $name ? 'https://site.example.test/wp' : null;
}

require ABSPATH . WPINC . '/class-wp-http.php';

$http = new WP_Http();
$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'wp-http-block:disabled':
\t\t$result['blocked'] = array(
\t\t\t'external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t\t'malformed' => $http->block_request( 'http://' ),
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t);
\t\t$assertions['nothing_blocked_when_disabled'] = array( 'external' => false, 'malformed' => false, 'localhost' => false ) === $result['blocked'];
\t\tbreak;

\tcase 'wp-http-block:default-external':
\t\t$result['blocked'] = array(
\t\t\t'external' => $http->block_request( 'https://blocked.example.test/path' ),
\t\t\t'malformed' => $http->block_request( 'http://' ),
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t\t'site_host' => $http->block_request( 'https://site.example.test/wp-json/' ),
\t\t);
\t\t$result['filter_calls'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['external_and_malformed_blocked'] = true === $result['blocked']['external'] && true === $result['blocked']['malformed'];
\t\t$assertions['local_and_site_allowed'] = false === $result['blocked']['localhost'] && false === $result['blocked']['site_host'];
\t\t$assertions['local_filter_called_twice'] = 2 === count( array_filter( $GLOBALS['wphx_filter_calls'], static function ( $call ) { return 'block_local_requests' === $call['hook']; } ) );
\t\tbreak;

\tcase 'wp-http-block:local-filter':
\t\t$result['blocked'] = array(
\t\t\t'localhost' => $http->block_request( 'http://localhost/path' ),
\t\t\t'site_host' => $http->block_request( 'https://site.example.test/wp-json/' ),
\t\t);
\t\t$result['filter_calls'] = $GLOBALS['wphx_filter_calls'];
\t\t$assertions['local_filter_can_block_local_and_site'] = array( 'localhost' => true, 'site_host' => true ) === $result['blocked'];
\t\tbreak;

\tcase 'wp-http-block:accessible-exact':
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
    manifest_id: "ownership:wp-core/wp-http-block-request-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http external request blocking policy",
      area: "src/wp-includes/class-wp-http.php WP_Http::block_request",
      public_contract:
        "This candidate preserves the WP_Http PHP class shell and native WP_HTTP_BLOCK_EXTERNAL, WP_ACCESSIBLE_HOSTS, parse_url, get_option('siteurl'), and block_local_requests filter boundaries while delegating local-host/site-host detection plus exact and wildcard accessible-host policy decisions to module-level Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "generated-php-haxe-policy-with-temporary-original-path-shell",
      removal_gate:
        "Replace the temporary candidate shell with generated original-path public PHP adapters and pass external request blocking, selected upstream HTTP PHPUnit, installed distribution, ecosystem HTTP policy, and live/recorded transport gates before claiming durable public PHP ownership."
    },
    owned_paths: [RUNNER, HXML, "src/wphx/wp/http/HttpBlockRequestPolicy.hx", "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpBlockRequestCandidateEntry.hx", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-block-request-candidate",
        "npm run wp:core:wphx-312-wp-http-block-request-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-54-wp-http-block-request-candidate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  transformCandidateBlockRequest();
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
    schema: "wphx.wp-core-wp-http-block-request-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      block_request_oracle_fixture_manifest: inputRecord(BLOCK_FIXTURE),
      http_request_orchestration_fixture_manifest: inputRecord(HTTP_REQUEST_FIXTURE),
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
        shell_body_ownership: "temporary candidate shell preserves constants, parse_url, option, and filter boundaries while delegating bounded policy decisions to generated Haxe PHP",
        native_boundaries: ["WP_HTTP_BLOCK_EXTERNAL", "WP_ACCESSIBLE_HOSTS", "parse_url", "get_option('siteurl')", "block_local_requests/apply_filters"]
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
          "Requests Autoload/Requests, get_option('siteurl'), and apply_filters are deterministic local stubs. No HTTP request is dispatched."
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
        id: "native-constant-url-option-filter-boundaries-preserved",
        owner: ISSUE.external_ref,
        detail:
          "The candidate intentionally keeps WP_HTTP_BLOCK_EXTERNAL, WP_ACCESSIBLE_HOSTS, parse_url, get_option('siteurl'), and block_local_requests filter timing at the PHP compatibility boundary."
      },
      {
        id: "live-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The candidate observes external request blocking policy only. It does not execute WP_Http::request, live Requests network I/O, DNS, proxy, TLS, redirects, or transport execution."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic support stubs rather than an installed WordPress distribution, wp-config constants in situ, or ecosystem HTTP callers."
      },
      {
        id: "durable-public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The candidate uses a bounded generated-PHP policy plus temporary original-path shell; durable shell generation remains a later cross-domain gate."
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
    id: "receipt:wphx-312-54-wp-http-block-request-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http block-request Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned WP_Http request-blocking policy" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpBlockRequestPolicy.hx", role: "module-level Haxe source for WP_Http block-request policy" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-block-request-candidate",
      "npm run wp:core:wphx-312-wp-http-block-request-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-47-wp-http-block-request-policy-oracle-fixture",
      "receipt:wphx-312-46-wp-http-request-orchestration-oracle-fixture"
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
