#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-0aw",
  external_ref: "WPHX-312.62",
  title: "WPHX-312.62 - Promote WP_Http processHeaders line decisions to Haxe candidate"
};
const RECORDED_AT = "2026-06-28T03:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-http-process-headers-candidate.mjs";
const HXML = "fixtures/wp-core/http-process-headers-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-312-62";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-62-wp-http-process-headers-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-62-wp-http-process-headers-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-62-wp-http-process-headers-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const PARSER_FIXTURE = "manifests/wp-core/wphx-312-42-wp-http-parser-header-oracle-fixture.v1.json";
const COOKIE_CANDIDATE = "manifests/wp-core/wphx-312-53-http-cookie-candidate.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-cookie.php", "src/wp-includes/class-wp-http.php"];
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/http/HttpProcessHeaders.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpProcessHeadersCandidateEntry.hx"
];
const HAXE_MODULE = "\\wphx\\wp\\http\\_HttpProcessHeaders\\HttpProcessHeaders_Fields_";
const PROMOTED_SYMBOLS = [
  "WP_Http::processHeaders final response status-line detection",
  "WP_Http::processHeaders response code extraction",
  "WP_Http::processHeaders response message extraction",
  "WP_Http::processHeaders header key normalization",
  "WP_Http::processHeaders header value trimming"
];
const CASES = [
  {
    id: "wp-http-parser:process-headers",
    focus: "processHeaders selects the final redirected response, unfolds headers, preserves duplicate headers, and converts Set-Cookie values"
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

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_312_62_bootstrap_haxe' ) ) {
\tfunction wphx_312_62_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_312_62_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_312_62_lib );
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
wphx_312_62_bootstrap_haxe();
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

function transformCandidateProcessHeaders() {
  const path = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceStaticMethod(
    source,
    "processHeaders",
    `public static function processHeaders( $headers, $url = '' ) {
\tif ( is_string( $headers ) ) {
\t\t$headers = str_replace( "\\r\\n", "\\n", $headers );
\t\t$headers = preg_replace( '/\\n[ \\t]/', ' ', $headers );
\t\t$headers = explode( "\\n", $headers );
\t}

\t$response = array(
\t\t'code'    => 0,
\t\t'message' => '',
\t);

\tfor ( $i = count( $headers ) - 1; $i >= 0; $i-- ) {
\t\tif ( ! empty( $headers[ $i ] ) && ${HAXE_MODULE}::startsFinalResponseBlock( (string) $headers[ $i ] ) ) {
\t\t\t$headers = array_splice( $headers, $i );
\t\t\tbreak;
\t\t}
\t}

\t$cookies    = array();
\t$newheaders = array();
\tforeach ( (array) $headers as $tempheader ) {
\t\tif ( empty( $tempheader ) ) {
\t\t\tcontinue;
\t\t}

\t\tif ( ! ${HAXE_MODULE}::isHeaderLine( (string) $tempheader ) ) {
\t\t\t$response['code']    = ${HAXE_MODULE}::responseCode( (string) $tempheader );
\t\t\t$response['message'] = ${HAXE_MODULE}::responseMessage( (string) $tempheader );
\t\t\tcontinue;
\t\t}

\t\t$key   = ${HAXE_MODULE}::headerKey( (string) $tempheader );
\t\t$value = ${HAXE_MODULE}::headerValue( (string) $tempheader );

\t\tif ( isset( $newheaders[ $key ] ) ) {
\t\t\tif ( ! is_array( $newheaders[ $key ] ) ) {
\t\t\t\t$newheaders[ $key ] = array( $newheaders[ $key ] );
\t\t\t}
\t\t\t$newheaders[ $key ][] = $value;
\t\t} else {
\t\t\t$newheaders[ $key ] = $value;
\t\t}
\t\tif ( 'set-cookie' === $key ) {
\t\t\t$cookies[] = new WP_Http_Cookie( $value, $url );
\t\t}
\t}

\t$response['code'] = (int) $response['code'];

\treturn array(
\t\t'response' => $response,
\t\t'headers'  => $newheaders,
\t\t'cookies'  => $cookies,
\t);
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

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
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
    manifest_id: "ownership:wp-core/wp-http-process-headers-candidate",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "haxe_parity_candidate",
      name: "WP_Http processHeaders line decisions",
      area: "src/wp-includes/class-wp-http.php WP_Http::processHeaders",
      public_contract:
        "This candidate preserves the WP_Http PHP class shell, public static method ABI, native arrays, duplicate-header accumulation, Set-Cookie conversion, and return shape while delegating scalar header/status line decisions to module-level Haxe source."
    },
    ownership_state: "haxe_owned_candidate_with_public_php_shell",
    bridge: {
      exists: true,
      kind: "generated-php-haxe-helper-with-temporary-original-path-shell",
      removal_gate:
        "Replace the temporary candidate shell with generated original-path public PHP adapters and pass broader parser/header, upstream HTTP PHPUnit, installed distribution, cookie/header, and generated-shell gates before claiming durable public PHP ownership."
    },
    owned_paths: [RUNNER, HXML, "src/wphx/wp/http/HttpProcessHeaders.hx", "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpProcessHeadersCandidateEntry.hx", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-http-process-headers-candidate",
        "npm run wp:core:wphx-312-wp-http-process-headers-candidate:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-62-wp-http-process-headers-candidate"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HXML]);
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  transformCandidateProcessHeaders();
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
    schema: "wphx.wp-core-wp-http-process-headers-candidate.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["haxe_source", "generated_php_candidate", "oracle_source_mirror", "php_cli_observed_fixture"],
    artifact_scope: "haxe_parity_candidate",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      parser_header_oracle_fixture_manifest: inputRecord(PARSER_FIXTURE),
      cookie_candidate_manifest: inputRecord(COOKIE_CANDIDATE),
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
          "temporary candidate shell preserves PHP-native header arrays, duplicate-header accumulation, Set-Cookie conversion, and return shape while delegating scalar line classification and normalization to generated Haxe PHP",
        native_boundaries: [
          "PHP string-to-header-array preprocessing and folded-line unfolding",
          "PHP array_splice final response block selection",
          "PHP duplicate header accumulation",
          "WP_Http_Cookie construction",
          "native associative array return shape"
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
        runtime_stubs: "Requests Autoload/Requests are deterministic local stubs. No network I/O is exercised. Cookie objects are local WP_Http_Cookie instances from copied oracle source."
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
        id: "php-native-header-array-and-cookie-boundaries-preserved",
        owner: ISSUE.external_ref,
        detail:
          "This candidate promotes only scalar line decisions. PHP still owns header array preprocessing, final response slicing, duplicate header accumulation, Set-Cookie conversion, and the native return shape."
      },
      {
        id: "broader-parser-header-helpers-not-promoted",
        owner: ISSUE.external_ref,
        detail:
          "buildCookieHeader, protected parse_url, and broader live header/transport behavior remain separate PHP boundaries or future candidates."
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
      live_http_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-62-wp-http-process-headers-candidate",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Http processHeaders Haxe parity candidate manifest" },
      { path: OWNERSHIP, role: "ownership manifest for Haxe-owned WP_Http processHeaders line decisions" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate Haxe runner" },
      { path: "src/wphx/wp/http/HttpProcessHeaders.hx", role: "module-level Haxe source for WP_Http::processHeaders scalar line decisions" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-http-process-headers-candidate",
      "npm run wp:core:wphx-312-wp-http-process-headers-candidate:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-42-wp-http-parser-header-oracle-fixture",
      "receipt:wphx-312-53-http-cookie-candidate"
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
