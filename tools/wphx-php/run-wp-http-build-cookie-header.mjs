#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-22o",
  external_ref: "WPHX-COMP-PHP.06",
  title: "Generate WP_Http::buildCookieHeader with native array mutation"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wphx-php/run-wp-http-build-cookie-header.mjs";
const WPHX_PHP_HXML = "fixtures/wphx-php/wp-http-build-cookie-header.hxml";
const HAXE_IMPL_HXML = "fixtures/wphx-php/wp-http-build-cookie-header-impl.hxml";
const OUT_ROOT = "build/wp-core/wphx-comp-php-06";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/generated`;
const WPHX_PHP_MANIFEST = `${CANDIDATE_ROOT}/wphx-php-emission.v1.json`;
const PROBE = `${OUT_ROOT}/probe.php`;
const RECEIPT = "receipts/compiler/wphx-comp-php-06-wp-http-build-cookie-header.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-http-cookie.php", "src/wp-includes/class-wp-http.php"];
const CANDIDATE_SUPPORT_FILES = ["src/wp-includes/class-wp-http-cookie.php"];
const HAXE_SOURCES = [
  WPHX_PHP_HXML,
  HAXE_IMPL_HXML,
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "src/wphx/compiler/php/WphxPhpWordPressAdapters.hx",
  "src/wphx/wp/http/HttpCookieHeaderAssembly.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/HttpCookieHeaderAssemblyCandidateEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpBuildCookieHeaderEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpBuildCookieHeaderShell.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpCookieHeaderAssembly.hx"
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
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

$GLOBALS['wphx_filters'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => wphx_summarize( $value ), 'args' => wphx_summarize( $args ) );
\tif ( 'wp_http_cookie_value' === $hook_name ) {
\t\treturn 'filtered-' . $args[0] . '-' . str_replace( ' ', '_', (string) $value );
\t}
\treturn $value;
}

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

$reflection = new ReflectionMethod( 'WP_Http', 'buildCookieHeader' );
$params     = $reflection->getParameters();

$args = array(
\t'headers' => array(),
\t'cookies' => array(
\t\t'scalar' => 'plain value',
\t\t'object' => new WP_Http_Cookie( array( 'name' => 'object', 'value' => 'raw value', 'path' => '/', 'domain' => 'example.test' ), 'https://example.test/' ),
\t),
);

WP_Http::buildCookieHeader( $args );

$assertions = array(
\t'byref_reflection' => 1 === count( $params ) && $params[0]->isPassedByReference(),
\t'scalar_upgraded' => $args['cookies']['scalar'] instanceof WP_Http_Cookie && 'scalar' === $args['cookies']['scalar']->name && 'plain value' === $args['cookies']['scalar']->value,
\t'object_preserved' => $args['cookies']['object'] instanceof WP_Http_Cookie && 'object' === $args['cookies']['object']->name,
\t'cookie_header' => 'scalar=filtered-scalar-plain_value; object=filtered-object-raw_value' === $args['headers']['cookie'],
\t'filter_payloads' => 2 === count( $GLOBALS['wphx_filters'] ) && 'wp_http_cookie_value' === $GLOBALS['wphx_filters'][0]['hook'] && 'scalar' === $GLOBALS['wphx_filters'][0]['args'][0] && 'object' === $GLOBALS['wphx_filters'][1]['args'][0],
);

echo json_encode(
\tarray(
\t\t'args' => wphx_summarize( $args ),
\t\t'filters' => $GLOBALS['wphx_filters'],
\t\t'reflection' => array(
\t\t\t'name' => $reflection->getName(),
\t\t\t'visibility' => $reflection->isPublic() ? 'public' : 'non-public',
\t\t\t'static' => $reflection->isStatic(),
\t\t\t'params' => array_map(
\t\t\t\tfunction ( $param ) {
\t\t\t\t\treturn array(
\t\t\t\t\t\t'name' => $param->getName(),
\t\t\t\t\t\t'by_ref' => $param->isPassedByReference(),
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
  const requiredCoreIrFeatures = [
    "stmt.if",
    "stmt.foreach",
    "stmt.foreach-key-value",
    "stmt.assign",
    "stmt.var",
    "expr.array-read",
    "expr.array-write-target",
    "expr.array-coerce",
    "expr.long-array",
    "expr.new",
    "expr.function-call",
    "expr.method-call",
    "expr.static-call"
  ];
  const shellChecks = {
    emitted_class: declarations.includes("class:WP_Http"),
    unsupported_empty: manifest.unsupported.length === 0,
    native_array_core_ir: requiredCoreIrFeatures.every((feature) => manifest.core_ir_features?.includes(feature)),
    method_emitted: /public\s+static\s+function\s+buildCookieHeader\s*\(\s*&\$r\s*\)/.test(generatedSource),
    native_array_mutation: generatedSource.includes("$r['cookies'][ $name ] = new WP_Http_Cookie(") && generatedSource.includes("$r['headers']['cookie'] = $cookies_header;"),
    helper_delegation: generatedSource.includes("HttpCookieHeaderAssembly_Fields_::appendCookieHeader")
  };
  if (!Object.values(shellChecks).every(Boolean)) {
    console.error(JSON.stringify({ status: "failed", reason: "generated shell checks failed", shellChecks, declarations, unsupported: manifest.unsupported }, null, 2));
    process.exit(1);
  }

  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-06-wp-http-build-cookie-header",
    issue: ISSUE.external_ref,
    recorded_at: RECORDED_AT,
    status: "passed",
    commands: [
      "npm run wphx:php:wp-http-build-cookie-header:check",
      "npm run wphx:php:wp-http-parser-helpers:check"
    ],
    generated_files: [
      {
        path: generatedShell,
        declarations,
        methods: ["WP_Http::buildCookieHeader"],
        probe:
          "PHP reflection verifies &$r; runtime probe verifies caller native-array mutation, scalar-to-WP_Http_Cookie upgrade, object preservation, wp_http_cookie_value filter payload/timing, and final Cookie header order."
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
      shell_checks: shellChecks
    },
    claims: [
      "The WPHX PHP emitter can generate the original-path public WP_Http::buildCookieHeader(&$r) shell.",
      "The generated shell body is emitted through reusable PHP-core IR nodes for if, foreach, native array reads/writes, array casts, long array literals, object construction, calls, local variables, and assignments.",
      "The generated shell preserves PHP-native by-reference request array mutation, scalar cookie upgrading, object preservation, filter payload/timing, and final Cookie header order.",
      "The generated shell delegates only the Cookie header separator assembly to the existing Haxe helper.",
      "The WPHX PHP emission manifest records class:WP_Http with unsupported=[] and the required native-array core IR feature list."
    ],
    non_claims: [
      "This does not claim whole-file WP_Http ownership.",
      "This does not claim WP_Http::processHeaders generation, full WP_Http::request ownership, live HTTP transport, installed WordPress behavior, or broad template/include behavior.",
      "The current buildCookieHeader adapter remains a WordPress profile selection of the public boundary shape; the reusable core IR is not yet arbitrary Haxe expression lowering or a full PHP backend."
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
