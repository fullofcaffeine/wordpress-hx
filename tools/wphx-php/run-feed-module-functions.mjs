#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T23:58:00Z";
const ISSUE = {
  id: "wordpresshx-a89x",
  external_ref: "WPHX-COMP-PHP-MODULE-FUNCTION-ADAPTERS",
  title: "Add module-function original-path adapters for feed embed HTTPS helpers"
};
const CONTINUATION_ISSUE = {
  id: "wordpresshx-f2w7",
  external_ref: "WPHX-COMP-PHP-FEED-EMBED-HTTPS-REMAINDER",
  title: "Expand feed embed HTTPS original-path adapters"
};
const RUNNER = "tools/wphx-php/run-feed-module-functions.mjs";
const IMPL_HXML = "fixtures/wphx-php/feed-module-functions-impl.hxml";
const SHELL_HXML = "fixtures/wphx-php/feed-module-functions.hxml";
const SOURCE_FILES = [
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedImplEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedKernel.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleSurface.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/HaxeFeedKernel.hx"
];
const OUT_ROOT = "build/wphx-php/feed-module-functions";
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const HAXE_ROOT = `${OUT_ROOT}/haxe`;
const GENERATED_SHELL = `${GENERATED_ROOT}/wp-includes/feed.php`;
const EMISSION_MANIFEST = `${GENERATED_ROOT}/wphx-php-emission.v1.json`;
const ORACLE_SHELL = `${OUT_ROOT}/oracle/wp-includes/feed.php`;
const PROBE = `${OUT_ROOT}/probe.php`;
const MANIFEST = "manifests/wphx-php/feed-module-functions.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-module-function-adapters.v1.json";
const EXACT_PATTERNS = [
  "function get_bloginfo_rss($show = '')",
  "FeedKernel::getBloginfoRss($show)",
  "function get_default_feed()",
  "function get_wp_title_rss($deprecated = '&#8211;')",
  "FeedKernel::getWpTitleRss($deprecated)",
  "function get_the_title_rss($post = 0)",
  "FeedKernel::getTheTitleRss($post)",
  "function get_the_content_feed($feed_type = null)",
  "FeedKernel::getTheContentFeed($feed_type)",
  "function feed_content_type($type = '')",
  "FeedKernel::defaultFeed()",
  "FeedKernel::feedContentType($type)"
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function oracleSource() {
  return `<?php
function get_bloginfo_rss( $show = '' ) {
\t$info = strip_tags( get_bloginfo( $show ) );

\treturn apply_filters( 'get_bloginfo_rss', convert_chars( $info ), $show );
}

function get_default_feed() {
\t$default_feed = apply_filters( 'default_feed', 'rss2' );

\treturn ( 'rss' === $default_feed ) ? 'rss2' : $default_feed;
}

function get_wp_title_rss( $deprecated = '&#8211;' ) {
\tif ( '&#8211;' !== $deprecated ) {
\t\t_deprecated_argument( __FUNCTION__, '4.4.0', sprintf( __( 'Use the %s filter instead.' ), '<code>document_title_separator</code>' ) );
\t}

\treturn apply_filters( 'get_wp_title_rss', wp_get_document_title(), $deprecated );
}

function get_the_title_rss( $post = 0 ) {
\t$title = get_the_title( $post );

\treturn apply_filters( 'the_title_rss', $title );
}

function get_the_content_feed( $feed_type = null ) {
\tif ( ! $feed_type ) {
\t\t$feed_type = get_default_feed();
\t}

\t$content = apply_filters( 'the_content', get_the_content() );
\t$content = str_replace( ']]>', ']]&gt;', $content );

\treturn apply_filters( 'the_content_feed', $content, $feed_type );
}

function feed_content_type( $type = '' ) {
\tif ( empty( $type ) ) {
\t\t$type = get_default_feed();
\t}

\t$types = array(
\t\t'rss'      => 'application/rss+xml',
\t\t'rss2'     => 'application/rss+xml',
\t\t'rss-http' => 'text/xml',
\t\t'atom'     => 'application/atom+xml',
\t\t'rdf'      => 'application/rdf+xml',
\t);

\t$content_type = ( ! empty( $types[ $type ] ) ) ? $types[ $type ] : 'application/octet-stream';

\treturn apply_filters( 'feed_content_type', $content_type, $type );
}
`;
}

function probeSource() {
  return `<?php
$mode = $argv[1];
$shell = $argv[2];
$GLOBALS['wphx_filter_log'] = array();
$GLOBALS['wphx_filter_overrides'] = array();
$GLOBALS['wphx_deprecated_log'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filter_log'][] = array(
\t\t'hook' => $hook_name,
\t\t'value' => $value,
\t\t'args' => $args,
\t);
\t$key = $hook_name . ':' . $value . ':' . implode( ',', array_map( 'strval', $args ) );
\tif ( array_key_exists( $key, $GLOBALS['wphx_filter_overrides'] ) ) {
\t\treturn $GLOBALS['wphx_filter_overrides'][ $key ];
\t}
\tif ( array_key_exists( $hook_name, $GLOBALS['wphx_filter_overrides'] ) ) {
\t\treturn $GLOBALS['wphx_filter_overrides'][ $hook_name ];
\t}
\treturn $value;
}

function get_bloginfo( $show = '' ) {
\t$values = array(
\t\t'name' => 'Fixture <Blog> & Co',
\t\t'description' => 'Fixture <b>Description</b> & More',
\t);
\treturn array_key_exists( $show, $values ) ? $values[ $show ] : 'Fixture Unknown';
}

function convert_chars( $value ) {
\treturn str_replace( '&', '&amp;', (string) $value );
}

function __( $message ) {
\treturn $message;
}

function _deprecated_argument( $function_name, $version, $message = null ) {
\t$GLOBALS['wphx_deprecated_log'][] = array(
\t\t'function' => $function_name,
\t\t'version' => $version,
\t\t'message' => $message,
\t);
}

function wp_get_document_title() {
\treturn 'Fixture Document Title';
}

function get_the_title( $post = 0 ) {
\treturn 'Title #' . (string) $post . ' <Raw>';
}

function get_the_content() {
\treturn 'Before ]]> After';
}

require $shell;

function wphx_case( $id, $overrides, $callback ) {
\t$GLOBALS['wphx_filter_log'] = array();
\t$GLOBALS['wphx_filter_overrides'] = $overrides;
\t$GLOBALS['wphx_deprecated_log'] = array();
\treturn array(
\t\t'id' => $id,
\t\t'value' => $callback(),
\t\t'filters' => $GLOBALS['wphx_filter_log'],
\t\t'deprecated' => $GLOBALS['wphx_deprecated_log'],
\t);
}

$cases = array();
$cases[] = wphx_case( 'bloginfo-rss:name', array(), function () {
\treturn get_bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'bloginfo-rss:description', array(), function () {
\treturn get_bloginfo_rss( 'description' );
} );
$cases[] = wphx_case( 'bloginfo-rss:filtered', array( 'get_bloginfo_rss' => 'Filtered Blog' ), function () {
\treturn get_bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'default-feed:default', array(), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'default-feed:rss-normalized', array( 'default_feed' => 'rss' ), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'default-feed:atom-filter', array( 'default_feed' => 'atom' ), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'wp-title-rss:default', array(), function () {
\treturn get_wp_title_rss();
} );
$cases[] = wphx_case( 'wp-title-rss:deprecated-argument', array(), function () {
\treturn get_wp_title_rss( '-' );
} );
$cases[] = wphx_case( 'wp-title-rss:filtered', array( 'get_wp_title_rss' => 'Filtered Document Title' ), function () {
\treturn get_wp_title_rss();
} );
$cases[] = wphx_case( 'feed-content-type:empty-uses-default', array( 'default_feed' => 'atom' ), function () {
\treturn feed_content_type( '' );
} );
$cases[] = wphx_case( 'feed-content-type:zero-uses-default', array( 'default_feed' => 'rss-http' ), function () {
\treturn feed_content_type( '0' );
} );
$cases[] = wphx_case( 'feed-content-type:rss-http', array(), function () {
\treturn feed_content_type( 'rss-http' );
} );
$cases[] = wphx_case( 'feed-content-type:unknown', array(), function () {
\treturn feed_content_type( 'custom' );
} );
$cases[] = wphx_case( 'feed-content-type:filtered', array( 'feed_content_type:application/atom+xml:atom' => 'custom/atom' ), function () {
\treturn feed_content_type( 'atom' );
} );
$cases[] = wphx_case( 'title-rss:default', array(), function () {
\treturn get_the_title_rss();
} );
$cases[] = wphx_case( 'title-rss:post', array(), function () {
\treturn get_the_title_rss( 7 );
} );
$cases[] = wphx_case( 'title-rss:filtered', array( 'the_title_rss' => 'Filtered Title' ), function () {
\treturn get_the_title_rss( 7 );
} );
$cases[] = wphx_case( 'content-feed:default-feed', array( 'default_feed' => 'atom' ), function () {
\treturn get_the_content_feed();
} );
$cases[] = wphx_case( 'content-feed:zero-uses-default', array( 'default_feed' => 'rss-http' ), function () {
\treturn get_the_content_feed( '0' );
} );
$cases[] = wphx_case( 'content-feed:explicit-type', array(), function () {
\treturn get_the_content_feed( 'rdf' );
} );
$cases[] = wphx_case( 'content-feed:content-filtered', array( 'the_content' => 'Filtered ]]> Content' ), function () {
\treturn get_the_content_feed( 'rss2' );
} );
$cases[] = wphx_case( 'content-feed:feed-filtered', array( 'the_content_feed' => 'Filtered Feed Content' ), function () {
\treturn get_the_content_feed( 'atom' );
} );

$reflection = array();
foreach ( array( 'get_bloginfo_rss', 'get_default_feed', 'get_wp_title_rss', 'get_the_title_rss', 'get_the_content_feed', 'feed_content_type' ) as $function_name ) {
\t$function = new ReflectionFunction( $function_name );
\t$params = array();
\tforeach ( $function->getParameters() as $parameter ) {
\t\t$params[] = array(
\t\t\t'name' => $parameter->getName(),
\t\t\t'position' => $parameter->getPosition(),
\t\t\t'isOptional' => $parameter->isOptional(),
\t\t\t'hasDefault' => $parameter->isDefaultValueAvailable(),
\t\t\t'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
\t\t\t'hasType' => $parameter->hasType(),
\t\t\t'isPassedByReference' => $parameter->isPassedByReference(),
\t\t\t'isVariadic' => $parameter->isVariadic(),
\t\t);
\t}
\t$reflection[ $function_name ] = array(
\t\t'name' => $function->getName(),
\t\t'numberOfParameters' => $function->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $function->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $function->returnsReference(),
\t\t'hasReturnType' => $function->hasReturnType(),
\t\t'parameters' => $params,
\t);
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'cases' => $cases,
\t\t'reflection' => $reflection,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`;
}

function normalizeProbe(result) {
  return {
    cases: result.cases,
    reflection: result.reflection
  };
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(dirname(ORACLE_SHELL), { recursive: true });
  writeFileSync(ORACLE_SHELL, oracleSource());
  writeFileSync(PROBE, probeSource());

  run("haxe", [IMPL_HXML]);
  run("haxe", [SHELL_HXML]);
  const oracleLint = run("php", ["-l", ORACLE_SHELL]).trim();
  const generatedLint = run("php", ["-l", GENERATED_SHELL]).trim();
  const generatedSource = readFileSync(GENERATED_SHELL, "utf8");
  const missingPatterns = EXACT_PATTERNS.filter((pattern) => !generatedSource.includes(pattern));
  if (missingPatterns.length > 0) {
    throw new Error(`Generated feed module shell is missing exact patterns: ${JSON.stringify(missingPatterns)}`);
  }

  const oracle = JSON.parse(run("php", [PROBE, "oracle", ORACLE_SHELL]));
  const generated = JSON.parse(run("php", [PROBE, "generated", GENERATED_SHELL]));
  assertJsonEqual(normalizeProbe(generated), normalizeProbe(oracle), "feed module oracle/candidate probe");

  const emissionManifest = JSON.parse(readFileSync(EMISSION_MANIFEST, "utf8"));
  const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`)).sort();
  const expectedDeclarations = [
    "wp-includes/feed.php:global-function:feed_content_type",
    "wp-includes/feed.php:global-function:get_bloginfo_rss",
    "wp-includes/feed.php:global-function:get_default_feed",
    "wp-includes/feed.php:global-function:get_the_content_feed",
    "wp-includes/feed.php:global-function:get_the_title_rss",
    "wp-includes/feed.php:global-function:get_wp_title_rss"
  ];
  assertJsonEqual(declarations, expectedDeclarations, "feed module declarations");
  if ((emissionManifest.unsupported ?? []).length !== 0) {
    throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
  }
  const guardedValues = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => entry.guarded));
  if (guardedValues.some(Boolean)) {
    throw new Error(`Feed module functions must be unguarded WordPress module declarations: ${JSON.stringify(guardedValues)}`);
  }

  const manifest = {
    schema: "wphx.wphx-php-feed-module-functions.v1",
    issue: ISSUE,
    continuation_issue: CONTINUATION_ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "module_function_original_path_adapter",
    artifact_scope: "selected_wphx_312_04_feed_module_functions",
    inputs: [IMPL_HXML, SHELL_HXML, ...SOURCE_FILES].map(inputRecord),
    upstream_oracle: {
      repo_path: "../wordpress-develop/src/wp-includes/feed.php",
      selected_symbols: [
        "get_bloginfo_rss",
        "get_default_feed",
        "get_wp_title_rss",
        "get_the_title_rss",
        "get_the_content_feed",
        "feed_content_type"
      ],
      selected_source_lines: ["27-41", "80-91", "103-119", "158-169", "190-209", "768-791"]
    },
    generated_shell: {
      path: GENERATED_SHELL,
      bytes: statSync(GENERATED_SHELL).size,
      sha256: sha256File(GENERATED_SHELL),
      php_lint: "passed",
      php_lint_output: generatedLint,
      exact_patterns: EXACT_PATTERNS
    },
    oracle_shell: {
      path: ORACLE_SHELL,
      bytes: statSync(ORACLE_SHELL).size,
      sha256: sha256File(ORACLE_SHELL),
      php_lint: "passed",
      php_lint_output: oracleLint
    },
    emission_manifest: {
      path: EMISSION_MANIFEST,
      bytes: statSync(EMISSION_MANIFEST).size,
      sha256: sha256File(EMISSION_MANIFEST),
      declarations,
      unsupported: emissionManifest.unsupported,
      core_ir_features: emissionManifest.core_ir_features,
      segment_plans: emissionManifest.segment_plans,
      adapter_templates: emissionManifest.adapter_templates
    },
    observations: {
      oracle,
      generated,
      match: true
    },
    validation_result: {
      status: "passed",
      php_lint_passed: true,
      exact_contracts_passed: true,
      oracle_candidate_behavior_matched: true,
      reflection_abi_matched: true,
      unsupported_empty: true,
      unguarded_module_functions: true,
      original_path_feed_php: true,
      haxe_bootstrap_delegation: true
    },
    claims: [
      "WPHX PHP emits selected unguarded module-level public functions at original path wp-includes/feed.php.",
      "The generated get_bloginfo_rss, get_default_feed, get_wp_title_rss, get_the_title_rss, get_the_content_feed, and feed_content_type functions preserve reflection-visible parameters/defaults for the selected fixture.",
      "The generated functions delegate selected behavior to a stock Haxe PHP implementation through the WPHX PHP bootstrap while preserving native apply_filters timing at the public PHP boundary.",
      "The minimized oracle/candidate probe matches WordPress 7.0 behavior for bloginfo RSS sanitization/conversion, default feed normalization, feed title deprecation and filtering, title RSS filtering, feed content filtering/escaping, feed content-type mapping, PHP empty('0') behavior, and filter payloads."
    ],
    non_claims: [
      "This fixture does not claim full wp-includes/feed.php ownership.",
      "This fixture does not retire the WPHX-312.04 copied feed/embed/HTTPS oracle fixture.",
      "This fixture does not claim feed template rendering, installed WordPress feed behavior, remote feed/oEmbed behavior, class-wp-oembed.php, class-wp-embed.php, embed.php, https-detection.php, or https-migration.php ownership.",
      "This fixture does not claim arbitrary module-function lowering beyond the selected original-path feed helpers."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-receipt.v1",
    id: "receipt:wphx-comp-php-module-function-adapters",
    issue: ISSUE,
    continuation_issue: CONTINUATION_ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "module_function_original_path_adapter",
    artifact_scope: "selected_wphx_312_04_feed_module_functions",
    commands: ["npm run wphx:php:feed-module-functions", "npm run wphx:php:feed-module-functions:check"],
    artifacts: [
      { path: RUNNER, role: "deterministic feed module function adapter runner" },
      { path: SHELL_HXML, role: "WPHX PHP original-path feed module shell hxml" },
      { path: IMPL_HXML, role: "stock Haxe PHP feed helper implementation hxml" },
      { path: "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleSurface.hx", role: "typed Haxe public feed.php module-function shell metadata" },
      { path: "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedKernel.hx", role: "typed Haxe feed helper behavior" },
      { path: MANIFEST, role: "feed module function adapter manifest" }
    ],
    manifest_sha256: sha256(manifestText),
    claims: manifest.claims,
    non_claims: manifest.non_claims
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        manifest: MANIFEST,
        receipt: RECEIPT,
        generated_shell: GENERATED_SHELL,
        selected_symbols: manifest.upstream_oracle.selected_symbols
      },
      null,
      2
    )
  );
}

main();
