#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-5d9",
  external_ref: "WPHX-312.53",
  title: "WPHX-312.53 - Promote WP_Http_Cookie matching and header behavior to Haxe candidate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-cookie-candidate.mjs";
const HXML = "fixtures/wp-core/http-cookie-candidate.hxml";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-cookie.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-53";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const WPHX_PHP_ROOT = `${OUT_ROOT}/wphx-php`;
const WPHX_PHP_MANIFEST = `${WPHX_PHP_ROOT}/wphx-php-emission.v1.json`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-53-http-cookie-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-53-http-cookie-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-53-http-cookie-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const COOKIE_FIXTURE = "manifests/wp-core/wphx-312-39-http-cookie-object-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-cookie.php"];
const HAXE_SOURCES = [
  HXML,
  WPHX_PHP_HXML,
  "src/wphx/wp/http/HttpCookieStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpCookieCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpCookieStrategy.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpCookieEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpCookieShell.hx"
];
const PROMOTED_SYMBOLS = [
  "WP_Http_Cookie::test post-construction matcher",
  "WP_Http_Cookie::getHeaderValue formatting around wp_http_cookie_value",
  "WP_Http_Cookie::getFullHeader",
  "WP_Http_Cookie::get_attributes"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_";
const CASES = [
  { id: "http-cookie:header-string-parse", focus: "Set-Cookie header string parses name/value attributes and URL defaults" },
  { id: "http-cookie:array-defaults", focus: "array construction applies requested URL domain/path defaults and nullable expiration" },
  { id: "http-cookie:test-matchers", focus: "test() accepts matching domain/path/port and rejects mismatches" },
  { id: "http-cookie:expired-and-nameless", focus: "expired and missing-name cookies are rejected and empty header values are emitted" },
  { id: "http-cookie:headers-and-filter", focus: "getHeaderValue and getFullHeader pass through wp_http_cookie_value filtering" },
  { id: "http-cookie:attributes", focus: "get_attributes returns expires/path/domain only" }
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
  const generated = `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-cookie.php`;
  const target = `${CANDIDATE_ROOT}/wp-includes/class-wp-http-cookie.php`;
  if (!existsSync(generated)) throw new Error(`Missing compiler-emitted shell ${generated}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(generated, target);
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
\tif ( 'wp_http_cookie_value' === $hook_name ) {
\t\treturn 'filtered-' . $args[0] . '-' . str_replace( ' ', '_', (string) $value );
\t}
\treturn $value;
}
function wphx_cookie_summary( $cookie ) {
\treturn array(
\t\t'name' => $cookie->name ?? null,
\t\t'value' => $cookie->value ?? null,
\t\t'expires' => $cookie->expires ?? null,
\t\t'path' => $cookie->path ?? null,
\t\t'domain' => $cookie->domain ?? null,
\t\t'port' => $cookie->port ?? null,
\t\t'host_only' => $cookie->host_only ?? null,
\t\t'secure' => $cookie->secure ?? null,
\t\t'httponly' => $cookie->httponly ?? null,
\t\t'attributes' => $cookie->get_attributes(),
\t);
}

require ABSPATH . WPINC . '/class-wp-http-cookie.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-cookie:header-string-parse':
\t\t$cookie = new WP_Http_Cookie( 'session=hello%20world; expires=Tue, 01 Jan 2030 00:00:00 GMT; path=/wp/; domain=.example.test; port=443,8443; secure; httponly', 'https://origin.example.test/wp-admin/post.php' );
\t\t$result['cookie'] = wphx_cookie_summary( $cookie );
\t\t$result['header'] = $cookie->getHeaderValue();
\t\t$assertions['name_value'] = 'session' === $cookie->name && 'hello world' === $cookie->value;
\t\t$assertions['parsed_attributes'] = 1893456000 === $cookie->expires && '/wp/' === $cookie->path && '.example.test' === $cookie->domain && '443,8443' === $cookie->port;
\t\t$assertions['dynamic_flags'] = '' === $cookie->secure && '' === $cookie->httponly;
\t\tbreak;

\tcase 'http-cookie:array-defaults':
\t\t$cookie = new WP_Http_Cookie( array( 'name' => 'pref', 'value' => 'dark mode' ), 'https://example.test/wp-admin/options.php' );
\t\t$result['cookie'] = wphx_cookie_summary( $cookie );
\t\t$assertions['defaults'] = 'example.test' === $cookie->domain && '/wp-admin/' === $cookie->path && null === $cookie->expires;
\t\t$assertions['host_only_not_defaulted_by_constructor'] = null === ( $cookie->host_only ?? null );
\t\tbreak;

\tcase 'http-cookie:test-matchers':
\t\t$cookie = new WP_Http_Cookie(
\t\t\tarray( 'name' => 'auth', 'value' => 'token', 'expires' => 1893456000, 'path' => '/wp/', 'domain' => '.example.test', 'port' => '443,8443', 'host_only' => false ),
\t\t\t'https://example.test/wp/login.php'
\t\t);
\t\t$result['cookie'] = wphx_cookie_summary( $cookie );
\t\t$result['tests'] = array(
\t\t\t'match' => $cookie->test( 'https://sub.example.test:443/wp/admin.php' ),
\t\t\t'port_mismatch' => $cookie->test( 'https://sub.example.test:444/wp/admin.php' ),
\t\t\t'path_mismatch' => $cookie->test( 'https://sub.example.test:443/other/admin.php' ),
\t\t\t'domain_mismatch' => $cookie->test( 'https://example.invalid:443/wp/admin.php' ),
\t\t);
\t\t$assertions['match'] = true === $result['tests']['match'];
\t\t$assertions['mismatches'] = false === $result['tests']['port_mismatch'] && false === $result['tests']['path_mismatch'] && false === $result['tests']['domain_mismatch'];
\t\tbreak;

\tcase 'http-cookie:expired-and-nameless':
\t\t$expired = new WP_Http_Cookie( array( 'name' => 'old', 'value' => 'gone', 'expires' => 946684800, 'path' => '/', 'domain' => 'example.test' ), 'https://example.test/' );
\t\t$nameless = new WP_Http_Cookie( array( 'value' => 'missing' ), 'https://example.test/path/file.php' );
\t\t$result['expired'] = wphx_cookie_summary( $expired );
\t\t$result['nameless'] = wphx_cookie_summary( $nameless );
\t\t$result['tests'] = array(
\t\t\t'expired' => $expired->test( 'https://example.test/' ),
\t\t\t'nameless' => $nameless->test( 'https://example.test/path/file.php' ),
\t\t\t'nameless_header' => $nameless->getHeaderValue(),
\t\t);
\t\t$assertions['expired_rejected'] = false === $result['tests']['expired'];
\t\t$assertions['nameless_rejected'] = false === $result['tests']['nameless'];
\t\t$assertions['nameless_header_empty'] = '' === $result['tests']['nameless_header'];
\t\tbreak;

\tcase 'http-cookie:headers-and-filter':
\t\t$cookie = new WP_Http_Cookie( array( 'name' => 'prefs', 'value' => 'blue sky', 'path' => '/', 'domain' => 'example.test' ), 'https://example.test/' );
\t\t$result['header_value'] = $cookie->getHeaderValue();
\t\t$result['full_header'] = $cookie->getFullHeader();
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$assertions['header_value'] = 'prefs=filtered-prefs-blue_sky' === $result['header_value'];
\t\t$assertions['full_header'] = 'Cookie: prefs=filtered-prefs-blue_sky' === $result['full_header'];
\t\t$assertions['filter_called_twice'] = 2 === count( $GLOBALS['wphx_filters'] ) && 'wp_http_cookie_value' === $GLOBALS['wphx_filters'][0]['hook'] && 'prefs' === $GLOBALS['wphx_filters'][0]['args'][0];
\t\tbreak;

\tcase 'http-cookie:attributes':
\t\t$cookie = new WP_Http_Cookie( array( 'name' => 'attrs', 'value' => '1', 'expires' => 1893456000, 'path' => '/attrs/', 'domain' => 'example.test', 'port' => '443' ), 'https://example.test/attrs/page.php' );
\t\t$result['cookie'] = wphx_cookie_summary( $cookie );
\t\t$result['attributes'] = $cookie->get_attributes();
\t\t$assertions['attributes_shape'] = array( 'expires' => 1893456000, 'path' => '/attrs/', 'domain' => 'example.test' ) === $result['attributes'];
\t\t$assertions['attributes_exclude_port_and_value'] = ! array_key_exists( 'port', $result['attributes'] ) && ! array_key_exists( 'value', $result['attributes'] );
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
    manifest_id: "ownership:wp-core/http-cookie-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http_Cookie matching and header behavior",
      area: "src/wp-includes/class-wp-http-cookie.php",
      public_contract:
        "This candidate preserves the WP_Http_Cookie PHP class shell, public properties, AllowDynamicProperties attribute, constructor parsing/default behavior, and wp_http_cookie_value filter boundary while delegating post-construction test() domain/path/port/expiry matching, header string formatting, full Cookie header formatting, and get_attributes shape to typed Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "compiler-emitted-original-path-public-php-shell",
      removal_gate:
        "Pass constructor-parsing ownership, live/recorded HTTP transport, Requests cookie jar conversion, redirect/cookie propagation, selected upstream HTTP PHPUnit, installed distribution routes, and ecosystem fixtures before claiming broader WP_Http_Cookie or whole-file HTTP ownership."
    },
    owned_paths: [RUNNER, ...HAXE_SOURCES, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, WPHX_PHP_MANIFEST, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-cookie-candidate",
        "npm run wp:core:wphx-312-http-cookie-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-53-http-cookie-candidate"],
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
  const wphxPhpManifest = JSON.parse(readFileSync(WPHX_PHP_MANIFEST, "utf8"));
  const generatedShell = readFileSync(`${WPHX_PHP_ROOT}/wp-includes/class-wp-http-cookie.php`, "utf8");
  const declaredCookieClass = wphxPhpManifest.files
    .flatMap((file) => file.declarations)
    .some((declaration) => declaration.kind === "class" && declaration.name === "WP_Http_Cookie");
  const unsupportedEmpty = Array.isArray(wphxPhpManifest.unsupported) && wphxPhpManifest.unsupported.length === 0;
  const cookieShellEmitted =
    generatedShell.includes("#[AllowDynamicProperties]") &&
    generatedShell.includes("class WP_Http_Cookie") &&
    generatedShell.includes("public $name;") &&
    generatedShell.includes("public $value;") &&
    generatedShell.includes("public $expires;") &&
    generatedShell.includes("public $path;") &&
    generatedShell.includes("public $domain;") &&
    generatedShell.includes("public $port;") &&
    generatedShell.includes("public $host_only;") &&
    generatedShell.includes("public function __construct($data, $requested_url = '')") &&
    generatedShell.includes("public function test($url)") &&
    generatedShell.includes("public function getHeaderValue()") &&
    generatedShell.includes("public function getFullHeader()") &&
    generatedShell.includes("public function get_attributes()") &&
    generatedShell.includes("parse_url( $requested_url )") &&
    generatedShell.includes(`${HAXE_MODULE}::test`) &&
    generatedShell.includes(`${HAXE_MODULE}::headerValue`) &&
    generatedShell.includes(`${HAXE_MODULE}::attributes`);
  if (!declaredCookieClass || !unsupportedEmpty || !cookieShellEmitted) {
    console.error(
      JSON.stringify(
        {
          status: "failed",
          reason: "compiler-emitted WP_Http_Cookie shell did not match expected declaration or shape",
          declared_cookie_class: declaredCookieClass,
          unsupported_empty: unsupportedEmpty,
          cookie_shell_emitted: cookieShellEmitted,
          manifest: WPHX_PHP_MANIFEST
        },
        null,
        2
      )
    );
    process.exit(1);
  }
  const compiledPhp = command("find", [HAXE_OUT, "-type", "f", "-name", "*.php"]);
  const manifest = {
    schema: "wphx.wp-core-http-cookie-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      cookie_oracle_fixture_manifest: inputRecord(COOKIE_FIXTURE),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST),
      runner: inputRecord(RUNNER),
      haxe_sources: HAXE_SOURCES.map(inputRecord),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    candidate: {
      hxml: HXML,
      wphx_php_hxml: WPHX_PHP_HXML,
      haxe_output: HAXE_OUT,
      wphx_php_output: WPHX_PHP_ROOT,
      public_shell: `${CANDIDATE_ROOT}/wp-includes/class-wp-http-cookie.php`,
      compiler_emitted_public_shell: `${WPHX_PHP_ROOT}/wp-includes/class-wp-http-cookie.php`,
      compiled_php_files: compiledPhp.split("\n").filter(Boolean).sort(),
      promoted_symbols: PROMOTED_SYMBOLS,
      public_shell_policy: {
        public_php_replacement_claimed: true,
        compiler_emitted_public_php: true,
        public_php_abi_preserved: true,
        shell_body_ownership:
          "compiler-emitted original-path public PHP shell preserves constructor/filter boundaries and delegates bounded post-construction behavior to generated Haxe PHP",
        native_boundaries: ["constructor parsing/defaults", "parse_url", "time", "public PHP properties", "AllowDynamicProperties", "wp_http_cookie_value/apply_filters"]
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
          "apply_filters is a deterministic WordPress-compatible stub for wp_http_cookie_value; constructor parsing remains in the PHP shell while post-construction behavior is Haxe-owned."
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
        id: "constructor-parsing-not-yet-haxe-owned",
        owner: ISSUE.external_ref,
        detail:
          "The candidate preserves upstream PHP constructor parsing/default behavior and does not yet promote Set-Cookie header parsing, requested-URL default derivation, strtotime, urldecode, or dynamic flag assignment to Haxe ownership."
      },
      {
        id: "live-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The candidate observes the cookie object in isolation. Live transport, redirects, Set-Cookie response propagation, request Cookie header propagation, proxy/TLS behavior, and network I/O remain later WPHX-312 gates."
      },
      {
        id: "requests-cookie-jar-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "Requests cookie jar semantics and conversion between Requests cookies and WP_Http_Cookie require further installed/live parity before ownership promotion."
      },
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
      cookie_shell_emitted: cookieShellEmitted,
      unsupported_empty: unsupportedEmpty,
      installed_wordpress_behavior_claimed: false,
      live_http_claimed: false,
      requests_cookie_jar_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-53-http-cookie-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http_Cookie Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned HTTP cookie post-construction behavior" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpCookieStrategy.hx", role: "typed Haxe source for WP_Http_Cookie matching/header behavior" },
      { path: WPHX_PHP_MANIFEST, role: "WPHX PHP emission manifest for the compiler-emitted original-path public shell" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-cookie-candidate",
      "npm run wp:core:wphx-312-http-cookie-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-39-http-cookie-object-oracle-fixture"
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
