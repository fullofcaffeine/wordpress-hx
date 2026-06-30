#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-jme",
  external_ref: "WPHX-COMP-PHP.07",
  title: "Generate WP_Http::processHeaders with native header/cookie arrays"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wphx-php/run-wp-http-process-headers.mjs";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-process-headers.hxml";
const HAXE_IMPL_HXML = "fixtures/wphx-php/wp-http-process-headers-impl.hxml";
const OUT_ROOT = "build/wp-core/wphx-comp-php-07";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/generated`;
const WPHX_PHP_MANIFEST = `${CANDIDATE_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const RECEIPT = "receipts/compiler/wphx-comp-php-07-wp-http-process-headers.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-cookie.php", "src/wp-includes/class-wp-http.php"];
const CANDIDATE_SUPPORT_FILES = ["src/wp-includes/class-wp-http-cookie.php"];
const HAXE_SOURCES = [
  WPHX_PHP_HXML,
  HAXE_IMPL_HXML,
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "src/wphx/compiler/php/WphxPhpWordPressAdapters.hx",
  "src/wphx/wp/http/HttpProcessHeaders.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpProcessHeadersCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpProcessHeadersEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpProcessHeadersShell.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpProcessHeaders.hx"
];
const REQUIRED_CORE_IR_FEATURES = [
  "stmt.if",
  "stmt.if-else",
  "stmt.for",
  "stmt.foreach",
  "stmt.assign",
  "stmt.var",
  "stmt.return",
  "stmt.break",
  "stmt.continue",
  "expr.array-read",
  "expr.array-append",
  "expr.array-coerce",
  "expr.coerce-int",
  "expr.coerce-string",
  "expr.long-array",
  "expr.new",
  "expr.function-call",
  "expr.static-call",
  "expr.binop",
  "expr.assign"
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

function sourceRecord(path) {
  const repoPath = upstreamPath(path);
  return { path, repo_path: repoPath, bytes: statSync(repoPath).size, sha256: sha256File(repoPath) };
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function mirrorSources(root, paths) {
  for (const path of paths) {
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

$reflection = new ReflectionMethod( 'WP_Http', 'processHeaders' );
$params     = $reflection->getParameters();

$headers = "HTTP/1.1 301 Moved Permanently\\r\\nLocation: https://example.test/old\\r\\nX-Discard: first\\r\\n\\r\\nHTTP/1.1 200 OK\\r\\nX-Multi: one\\r\\nX-Multi: two\\r\\nX-Fold: first\\r\\n second\\r\\nSet-Cookie: session=abc%20123; expires=Tue, 01 Jan 2030 00:00:00 GMT; path=/wp/; domain=.example.test\\r\\nSet-Cookie: pref=dark; path=/; domain=example.test\\r\\n";
$processed = WP_Http::processHeaders( $headers, 'https://example.test/wp-admin/post.php' );

$empty = WP_Http::processHeaders( array( '', false, null ), '' );

$assertions = array(
\t'arity_and_default' => 2 === count( $params ) && 'headers' === $params[0]->getName() && 'url' === $params[1]->getName() && $params[1]->isDefaultValueAvailable() && '' === $params[1]->getDefaultValue(),
\t'final_response_selected' => array( 'code' => 200, 'message' => 'OK' ) === $processed['response'],
\t'duplicate_headers_array' => array( 'one', 'two' ) === $processed['headers']['x-multi'],
\t'folded_header_unfolded' => 'first second' === $processed['headers']['x-fold'],
\t'redirect_headers_discarded' => ! isset( $processed['headers']['x-discard'] ),
\t'cookies_converted' => 2 === count( $processed['cookies'] ) && 'session' === $processed['cookies'][0]->name && 'abc 123' === $processed['cookies'][0]->value && '/wp/' === $processed['cookies'][0]->path && '.example.test' === $processed['cookies'][0]->domain && 'pref' === $processed['cookies'][1]->name,
\t'empty_falsey_shape' => array( 'response' => array( 'code' => 0, 'message' => '' ), 'headers' => array(), 'cookies' => array() ) === $empty,
);

echo json_encode(
\tarray(
\t\t'processed' => wphx_summarize( $processed ),
\t\t'empty' => wphx_summarize( $empty ),
\t\t'reflection' => array(
\t\t\t'name' => $reflection->getName(),
\t\t\t'visibility' => $reflection->isPublic() ? 'public' : 'non-public',
\t\t\t'static' => $reflection->isStatic(),
\t\t\t'params' => array_map(
\t\t\t\tfunction ( $param ) {
\t\t\t\t\treturn array(
\t\t\t\t\t\t'name' => $param->getName(),
\t\t\t\t\t\t'by_ref' => $param->isPassedByReference(),
\t\t\t\t\t\t'default' => $param->isDefaultValueAvailable() ? $param->getDefaultValue() : null,
\t\t\t\t\t);
\t\t\t\t},
\t\t\t\t$params
\t\t\t),
\t\t),
\t\t'assertions' => $assertions,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
}
`
  );
}

function runProbe(root) {
  return JSON.parse(command("php", [PROBE, root]));
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

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  command("haxe", [HAXE_IMPL_HXML]);
  command("haxe", [WPHX_PHP_HXML]);
  mirrorSources(ORACLE_ROOT, SOURCE_FILES);
  mirrorSources(CANDIDATE_ROOT, CANDIDATE_SUPPORT_FILES);
  writeProbe();

  const oracle = runProbe(ORACLE_ROOT);
  const candidate = runProbe(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const assertionsPass = Object.values(candidate.assertions).every(Boolean);
  if (!observationsMatch || !assertionsPass) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate, observationsMatch, assertionsPass }, null, 2));
    process.exit(1);
  }

  const generatedShell = `${CANDIDATE_ROOT}/wp-includes/class-wp-http.php`;
  const generatedSource = readFileSync(generatedShell, "utf8");
  const manifest = JSON.parse(readFileSync(WPHX_PHP_MANIFEST, "utf8"));
  const declarations = manifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
  const phpLint = {
    generated_shell: command("php", ["-l", generatedShell]),
    candidate_cookie: command("php", ["-l", `${CANDIDATE_ROOT}/wp-includes/class-wp-http-cookie.php`])
  };
  const shellChecks = {
    emitted_class: declarations.includes("class:WP_Http"),
    unsupported_empty: manifest.unsupported.length === 0,
    process_headers_core_ir: REQUIRED_CORE_IR_FEATURES.every((feature) => manifest.core_ir_features?.includes(feature)),
    method_emitted: /public\s+static\s+function\s+processHeaders\s*\(\s*\$headers\s*,\s*\$url\s*=\s*''\s*\)/.test(generatedSource),
    native_array_return: generatedSource.includes("'response' => $response") && generatedSource.includes("'headers'  => $newheaders") && generatedSource.includes("'cookies'  => $cookies"),
    cookie_conversion: generatedSource.includes("$cookies[] = new WP_Http_Cookie( $value, $url );"),
    helper_delegation: generatedSource.includes("HttpProcessHeaders_Fields_::startsFinalResponseBlock") && generatedSource.includes("HttpProcessHeaders_Fields_::headerValue")
  };
  if (!Object.values(shellChecks).every(Boolean)) {
    console.error(JSON.stringify({ status: "failed", reason: "generated shell checks failed", shellChecks, declarations, unsupported: manifest.unsupported }, null, 2));
    process.exit(1);
  }

  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-07-wp-http-process-headers",
    issue: ISSUE.external_ref,
    recorded_at: RECORDED_AT,
    status: "passed",
    commands: [
      "npm run wphx:php:wp-http-process-headers:check",
      "npm run wphx:php:wp-http-parser-helpers:check"
    ],
    generated_files: [
      {
        path: generatedShell,
        declarations,
        methods: ["WP_Http::processHeaders"],
        probe:
          "PHP reflection verifies processHeaders($headers, $url = ''); runtime probe verifies final response block selection, folded-header unfolding, duplicate header arrays, Set-Cookie conversion, native return shape, and empty/falsey input shape."
      }
    ],
    source: HAXE_SOURCES.concat([RUNNER]),
    inputs: {
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      wphx_php_manifest: inputRecord(WPHX_PHP_MANIFEST)
    },
    validation_result: {
      status: "passed",
      observations_match: observationsMatch,
      assertions_pass: assertionsPass,
      php_lint: phpLint,
      shell_checks: shellChecks
    },
    claims: [
      "The WPHX PHP emitter can generate the original-path public WP_Http::processHeaders($headers, $url = '') shell.",
      "The generated shell body is emitted through reusable PHP-core IR nodes for conditionals, loops, break/continue, native arrays, casts, object construction, returns, and calls.",
      "The generated shell preserves PHP-native header arrays, final response block selection, duplicate-header accumulation, Set-Cookie conversion to WP_Http_Cookie, falsey/empty behavior, and return shape.",
      "The generated shell delegates scalar status/header line decisions to the existing Haxe processHeaders helpers.",
      "The WPHX PHP emission manifest records class:WP_Http with unsupported=[] and the required processHeaders core IR feature list."
    ],
    non_claims: [
      "This does not claim whole-file WP_Http ownership.",
      "This does not claim WP_Http::request ownership, live HTTP transport, installed WordPress behavior, or broad template/include behavior.",
      "This does not claim arbitrary Haxe expression lowering or a full PHP backend."
    ]
  };

  try {
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  } catch (error) {
    console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        receipt: RECEIPT,
        generated_shell: generatedShell,
        observations_match: observationsMatch,
        shell_checks: shellChecks
      },
      null,
      2
    )
  );
}

main();
