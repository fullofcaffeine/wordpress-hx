#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.8.7",
  external_ref: "WPHX-304.07",
  title: "Promote first pure options/cache helpers to Haxe parity candidates"
};
const HXML = "fixtures/wp-core/option-cache-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-304-07";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-304-07-option-cache-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-304-07-option-cache-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-304-07-option-cache-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-304-01-options-cache-surface.v1.json";
const OPTION_FIXTURE = "manifests/wp-core/wphx-304-02-option-storage-fixture.v1.json";
const OBJECT_CACHE_FIXTURE = "manifests/wp-core/wphx-304-04-object-cache-fixture.v1.json";
const SERIALIZATION_FIXTURE = "manifests/wp-core/wphx-304-05-serialization-cache-fixture.v1.json";
const RECORDED_AT = "2026-06-21T04:55:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/option.php",
  "src/wp-includes/functions.php"
];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/options/PureOptionCache.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/OptionCacheCandidateEntry.hx"
];

const PROMOTED_SYMBOLS = [
  "wp_determine_option_autoload_value",
  "wp_filter_default_autoload_value_via_option_size",
  "wp_cache_supports"
];

const FIXTURE_CASES = [
  {
    id: "option-autoload:explicit-values",
    symbol: "wp_determine_option_autoload_value",
    focus: "explicit bool/string autoload values, legacy yes/no values, and fallback auto behavior"
  },
  {
    id: "option-autoload:default-filter",
    symbol: "wp_determine_option_autoload_value",
    focus: "wp_default_autoload_value filter bool/null/non-bool return behavior and argument order"
  },
  {
    id: "option-size:threshold-filter",
    symbol: "wp_filter_default_autoload_value_via_option_size",
    focus: "max autoloaded option size filter, serialized value emptiness, bool/null pass-through, and large-value false return"
  },
  {
    id: "option-size:determine-integration",
    symbol: "wp_determine_option_autoload_value/wp_filter_default_autoload_value_via_option_size",
    focus: "combined default-autoload filter registration used by option storage"
  },
  {
    id: "cache-supports:default-runtime",
    symbol: "wp_cache_supports",
    focus: "default runtime feature switch contract"
  }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch {
    return null;
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_304_07_bootstrap_haxe' ) ) {
\tfunction wphx_304_07_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_304_07_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_304_07_lib );
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
wphx_304_07_bootstrap_haxe();
`;
}

function installBootstrap(source) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) {
    throw new Error("PHP source did not start with an expected PHP open tag");
  }
  return `${marker}\n${haxeBootstrapBlock()}\n${source.slice(marker.length)}`;
}

function replaceFunction(source, functionName, replacement) {
  const pattern = new RegExp(`function\\s+${functionName}\\s*\\(`, "m");
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Unable to locate function ${functionName}`);
  }

  const openBrace = source.indexOf("{", match.index);
  if (openBrace === -1) {
    throw new Error(`Unable to locate opening brace for ${functionName}`);
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, match.index)}${replacement}${source.slice(index + 1)}`;
      }
    }
  }
  throw new Error(`Unable to locate closing brace for ${functionName}`);
}

function transformCandidateOption() {
  const path = `${CANDIDATE_ROOT}/wp-includes/option.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceFunction(
    source,
    "wp_determine_option_autoload_value",
    `function wp_determine_option_autoload_value( $option, $value, $serialized_value, $autoload ) {
\tif ( is_bool( $autoload ) ) {
\t\t$wphx_explicit_autoload = $autoload ? 'bool:true' : 'bool:false';
\t} elseif ( is_string( $autoload ) ) {
\t\t$wphx_explicit_autoload = 'string:' . $autoload;
\t} else {
\t\t$wphx_explicit_autoload = 'other';
\t}

\tif ( \\wphx\\wp\\options\\PureOptionCache::hasExplicitAutoloadValue( $wphx_explicit_autoload ) ) {
\t\treturn \\wphx\\wp\\options\\PureOptionCache::determineOptionAutoloadValue( $wphx_explicit_autoload, null );
\t}

\t/**
\t * Allows to determine the default autoload value for an option where no explicit value is passed.
\t *
\t * @since 6.6.0
\t *
\t * @param bool|null $autoload         The default autoload value to set. Returning true will be set as 'auto-on' in the
\t *                                    database, false will be set as 'auto-off', and null will be set as 'auto'.
\t * @param string    $option           The passed option name.
\t * @param mixed     $value            The passed option value to be saved.
\t * @param mixed     $serialized_value The passed option value to be saved, in serialized form.
\t */
\t$wphx_default_autoload = apply_filters( 'wp_default_autoload_value', null, $option, $value, $serialized_value );
\t$wphx_default_bool     = is_bool( $wphx_default_autoload ) ? $wphx_default_autoload : null;

\treturn \\wphx\\wp\\options\\PureOptionCache::determineOptionAutoloadValue( $wphx_explicit_autoload, $wphx_default_bool );
}`
  );
  source = replaceFunction(
    source,
    "wp_filter_default_autoload_value_via_option_size",
    `function wp_filter_default_autoload_value_via_option_size( $autoload, $option, $value, $serialized_value ) {
\t/**
\t * Filters the maximum size of option value in bytes.
\t *
\t * @since 6.6.0
\t *
\t * @param int    $max_option_size The option-size threshold, in bytes. Default 150000.
\t * @param string $option          The name of the option.
\t */
\t$max_option_size = (int) apply_filters( 'wp_max_autoloaded_option_size', 150000, $option );
\t$wphx_exceeds    = \\wphx\\wp\\options\\PureOptionCache::serializedOptionExceedsSize( (string) $serialized_value, empty( $serialized_value ), $max_option_size );

\tif ( ! is_bool( $autoload ) && null !== $autoload ) {
\t\treturn $wphx_exceeds ? false : $autoload;
\t}

\treturn \\wphx\\wp\\options\\PureOptionCache::filterDefaultAutoloadValueViaOptionSize( $autoload, (string) $serialized_value, empty( $serialized_value ), $max_option_size );
}`
  );
  writeFileSync(path, source);
}

function transformCandidateCache() {
  const path = `${CANDIDATE_ROOT}/wp-includes/cache.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceFunction(
    source,
    "wp_cache_supports",
    `function wp_cache_supports( $feature ) {
\tif ( ! is_scalar( $feature ) ) {
\t\treturn false;
\t}

\treturn \\wphx\\wp\\options\\PureOptionCache::cacheSupports( (string) $feature );
}`
  );
  writeFileSync(path, source);
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/functions.php';

wp_cache_init();

function wphx_304_07_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
\t}
\tif ( is_float( $value ) ) {
\t\treturn array( 'type' => 'float', 'value' => $value );
\t}
\tif ( is_bool( $value ) ) {
\t\treturn array( 'type' => 'bool', 'value' => $value );
\t}
\tif ( null === $value ) {
\t\treturn array( 'type' => 'null', 'value' => null );
\t}
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => (string) $value,
\t\t'hex'    => bin2hex( (string) $value ),
\t\t'bytes'  => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_304_07_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_304_07_scalar( $key ),
\t\t\t\t'value' => wphx_304_07_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_304_07_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_304_07_scalar( $value );
}

function wphx_304_07_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_304_07_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_304_07_reset_state() {
\tglobal $wp_filter;
\t$wp_filter = array();
}

function wphx_304_07_run_cases() {
\t$cases = array();

\twphx_304_07_reset_state();
\t$cases[] = wphx_304_07_case(
\t\t'option-autoload:explicit-values',
\t\t'wp_determine_option_autoload_value',
\t\tarray(
\t\t\t'true'      => wp_determine_option_autoload_value( 'explicit_true', 'value', 'value', true ),
\t\t\t'false'     => wp_determine_option_autoload_value( 'explicit_false', 'value', 'value', false ),
\t\t\t'on'        => wp_determine_option_autoload_value( 'explicit_on', 'value', 'value', 'on' ),
\t\t\t'yes'       => wp_determine_option_autoload_value( 'explicit_yes', 'value', 'value', 'yes' ),
\t\t\t'off'       => wp_determine_option_autoload_value( 'explicit_off', 'value', 'value', 'off' ),
\t\t\t'no'        => wp_determine_option_autoload_value( 'explicit_no', 'value', 'value', 'no' ),
\t\t\t'autoOn'    => wp_determine_option_autoload_value( 'explicit_auto_on', 'value', 'value', 'auto-on' ),
\t\t\t'autoOff'   => wp_determine_option_autoload_value( 'explicit_auto_off', 'value', 'value', 'auto-off' ),
\t\t\t'auto'      => wp_determine_option_autoload_value( 'explicit_auto', 'value', 'value', 'auto' ),
\t\t\t'invalid'   => wp_determine_option_autoload_value( 'explicit_invalid', 'value', 'value', 'sometimes' ),
\t\t\t'null'      => wp_determine_option_autoload_value( 'explicit_null', 'value', 'value', null ),
\t\t)
\t);

\twphx_304_07_reset_state();
\t$default_events = array();
\tadd_filter(
\t\t'wp_default_autoload_value',
\t\tfunction ( $autoload, $option, $value, $serialized_value ) use ( &$default_events ) {
\t\t\t$default_events[] = array(
\t\t\t\t'autoload' => $autoload,
\t\t\t\t'option' => $option,
\t\t\t\t'value' => $value,
\t\t\t\t'serialized' => $serialized_value,
\t\t\t);
\t\t\tif ( 'filter_true' === $option ) {
\t\t\t\treturn true;
\t\t\t}
\t\t\tif ( 'filter_false' === $option ) {
\t\t\t\treturn false;
\t\t\t}
\t\t\tif ( 'filter_nonbool' === $option ) {
\t\t\t\treturn 'ignored';
\t\t\t}
\t\t\treturn $autoload;
\t\t},
\t\t10,
\t\t4
\t);
\t$cases[] = wphx_304_07_case(
\t\t'option-autoload:default-filter',
\t\t'wp_determine_option_autoload_value',
\t\tarray(
\t\t\t'true'    => wp_determine_option_autoload_value( 'filter_true', array( 'x' => 1 ), serialize( array( 'x' => 1 ) ), null ),
\t\t\t'false'   => wp_determine_option_autoload_value( 'filter_false', 'value', 'value', null ),
\t\t\t'null'    => wp_determine_option_autoload_value( 'filter_null', 'value', 'value', null ),
\t\t\t'nonBool' => wp_determine_option_autoload_value( 'filter_nonbool', 'value', 'value', null ),
\t\t),
\t\tarray( 'events' => $default_events )
\t);

\twphx_304_07_reset_state();
\t$max_events = array();
\tadd_filter(
\t\t'wp_max_autoloaded_option_size',
\t\tfunction ( $max_option_size, $option ) use ( &$max_events ) {
\t\t\t$max_events[] = array( 'max' => $max_option_size, 'option' => $option );
\t\t\treturn 8;
\t\t},
\t\t10,
\t\t2
\t);
\t$cases[] = wphx_304_07_case(
\t\t'option-size:threshold-filter',
\t\t'wp_filter_default_autoload_value_via_option_size',
\t\tarray(
\t\t\t'nullSmall'      => wp_filter_default_autoload_value_via_option_size( null, 'small', 'value', '1234' ),
\t\t\t'nullLarge'      => wp_filter_default_autoload_value_via_option_size( null, 'large', 'value', str_repeat( 'x', 9 ) ),
\t\t\t'trueLarge'      => wp_filter_default_autoload_value_via_option_size( true, 'true_large', 'value', str_repeat( 'x', 9 ) ),
\t\t\t'falseSmall'     => wp_filter_default_autoload_value_via_option_size( false, 'false_small', 'value', '1234' ),
\t\t\t'zeroString'     => wp_filter_default_autoload_value_via_option_size( null, 'zero_string', 'value', '0' ),
\t\t\t'nonBoolSmall'   => wp_filter_default_autoload_value_via_option_size( 'keep', 'non_bool_small', 'value', '1234' ),
\t\t\t'nonBoolLarge'   => wp_filter_default_autoload_value_via_option_size( 'keep', 'non_bool_large', 'value', str_repeat( 'x', 9 ) ),
\t\t),
\t\tarray( 'events' => $max_events )
\t);

\twphx_304_07_reset_state();
\t$integration_events = array();
\tadd_filter( 'wp_default_autoload_value', 'wp_filter_default_autoload_value_via_option_size', 10, 4 );
\tadd_filter(
\t\t'wp_max_autoloaded_option_size',
\t\tfunction ( $max_option_size, $option ) use ( &$integration_events ) {
\t\t\t$integration_events[] = array( 'option' => $option, 'max' => $max_option_size );
\t\t\treturn 8;
\t\t},
\t\t10,
\t\t2
\t);
\t$cases[] = wphx_304_07_case(
\t\t'option-size:determine-integration',
\t\t'wp_determine_option_autoload_value/wp_filter_default_autoload_value_via_option_size',
\t\tarray(
\t\t\t'small' => wp_determine_option_autoload_value( 'integration_small', 'value', '1234', null ),
\t\t\t'large' => wp_determine_option_autoload_value( 'integration_large', 'value', str_repeat( 'x', 9 ), null ),
\t\t\t'explicitOnLarge' => wp_determine_option_autoload_value( 'integration_explicit', 'value', str_repeat( 'x', 9 ), 'on' ),
\t\t),
\t\tarray( 'events' => $integration_events )
\t);

\twphx_304_07_reset_state();
\t$supports = array();
\tforeach ( array( 'add_multiple', 'set_multiple', 'get_multiple', 'delete_multiple', 'flush_runtime', 'flush_group', 'unknown', '' ) as $feature ) {
\t\t$supports[ $feature ] = wp_cache_supports( $feature );
\t}
\t$cases[] = wphx_304_07_case(
\t\t'cache-supports:default-runtime',
\t\t'wp_cache_supports',
\t\t$supports
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredFunctionExists' => array(
\t\t'wp_determine_option_autoload_value'             => function_exists( 'wp_determine_option_autoload_value' ),
\t\t'wp_filter_default_autoload_value_via_option_size' => function_exists( 'wp_filter_default_autoload_value_via_option_size' ),
\t\t'wp_cache_supports'                              => function_exists( 'wp_cache_supports' ),
\t),
\t'promotedFunctionOrigins' => array(
\t\t'wp_determine_option_autoload_value'             => ( new ReflectionFunction( 'wp_determine_option_autoload_value' ) )->getFileName(),
\t\t'wp_filter_default_autoload_value_via_option_size' => ( new ReflectionFunction( 'wp_filter_default_autoload_value_via_option_size' ) )->getFileName(),
\t\t'wp_cache_supports'                              => ( new ReflectionFunction( 'wp_cache_supports' ) )->getFileName(),
\t),
\t'cases'                 => wphx_304_07_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    coveredFunctionExists: result.coveredFunctionExists,
    cases: result.cases
  };
}

function runProbe(commandPath, runtimeId, mode, root) {
  const output = command(commandPath, [PROBE, mode, root]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `${commandPath} ${PROBE} ${mode} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(runtimeId, image, mode, root) {
  const dockerRoot = `/work/${root}`;
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, dockerRoot]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${dockerRoot}`,
    image,
    result: JSON.parse(output)
  };
}

function compare(oracleResult, candidateResult) {
  const oracle = normalize(oracleResult);
  const candidate = normalize(candidateResult);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-304-option-cache-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/option-cache-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "module",
      name: "pure options/cache Haxe parity candidates",
      area: "wp-includes/option.php wp-includes/cache.php",
      public_contract:
        "WordPress-compatible global PHP functions remain callable with the same names and reflection-visible PHP files while selected pure option/cache decision logic delegates to typed Haxe-generated PHP."
    },
    ownership_state: "haxe_parity_candidate",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: ["src/wp-includes/option.php", "src/wp-includes/cache.php", "src/wp-includes/functions.php", "src/wp-includes/plugin.php"],
      digest: upstreamDigest
    },
    owned_paths: [...HAXE_SOURCES, "tools/wp-core/run-option-cache-candidate.mjs", OUT, RECEIPT],
    generated_paths: [OUT_ROOT, OUT, OWNERSHIP, RECEIPT],
    bridge: {
      kind: "generated_shell",
      reason:
        "WordPress plugins and core call global PHP functions with mixed native values and filters. The candidate keeps the public PHP shell and delegates only pure normalized decisions to Haxe.",
      bounded_by: [
        "generated candidate wp-includes/option.php and wp-includes/cache.php shells",
        "WPHX-304.07 oracle comparison receipt",
        "native apply_filters boundary for autoload defaults and max-size thresholds"
      ]
    },
    removal_gate: {
      condition:
        "Promote from generated shell candidate to verified owned distribution only after option/cache distribution work proves reflection, include timing, filters, mixed PHP ABI, and plugin compatibility.",
      owner_issue: "WPHX-304",
      target_state: "verified_haxe_owned"
    },
    smell_fixes: [
      {
        description:
          "Moved repeated autoload switch/size/feature decision branches into typed Haxe functions with small scalar contracts and explicit nullable-bool handling.",
        compatibility_evidence: [
          "option-autoload:explicit-values",
          "option-autoload:default-filter",
          "option-size:threshold-filter",
          "cache-supports:default-runtime"
        ],
        behavior_policy: "no_observable_change"
      }
    ],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-304-option-cache-candidate",
        "npm run wp:core:wphx-304-option-cache-candidate:check",
        "npm run wp:core:wphx-304-option-storage:check",
        "npm run wp:core:wphx-304-object-cache:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-304-07-option-cache-candidate",
        "receipt:wphx-304-02-option-storage-fixture",
        "receipt:wphx-304-04-object-cache-fixture",
        "receipt:wphx-304-05-serialization-cache-fixture"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "maybe_serialize(), maybe_unserialize(), is_serialized(), salted helpers, and cache/global mutation APIs remain native/oracle-owned for now because their PHP serialization grammar, references, globals, or drop-in timing are not low-risk pure Haxe candidates."
  };
}

const lock = readJson("toolchain.lock.json");
const surface = readJson(SURFACE);
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
command("haxe", [HXML]);
transformCandidateOption();
transformCandidateCache();
writeProbe();

const runs = [];
const comparisons = [];
const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_ROOT);
const localCandidate = runProbe("php", "local-php-cli", "candidate", CANDIDATE_ROOT);
runs.push(localOracle, localCandidate);
comparisons.push({
  id: "local-php-cli",
  ...compare(localOracle.result, localCandidate.result)
});

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const dockerImages = [
  ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
  ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
];
const skippedRuntimes = [];

if (dockerVersion) {
  for (const [runtimeId, image] of dockerImages) {
    const oracle = runDockerProbe(runtimeId, image, "oracle", ORACLE_ROOT);
    const candidate = runDockerProbe(runtimeId, image, "candidate", CANDIDATE_ROOT);
    runs.push(oracle, candidate);
    comparisons.push({
      id: runtimeId,
      ...compare(oracle.result, candidate.result)
    });
  }
} else {
  for (const [runtimeId, image] of dockerImages) {
    skippedRuntimes.push({
      id: runtimeId,
      image,
      reason: "docker server unavailable"
    });
  }
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const sourceDomains = surface.domains.filter((domain) => domain.id === "option_storage_autoload" || domain.id === "object_cache_runtime");
const manifest = {
  schema: "wphx.wp-core-option-cache-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-option-cache-candidate.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    base_fixture_manifests: [OPTION_FIXTURE, OBJECT_CACHE_FIXTURE, SERIALIZATION_FIXTURE].map(inputRecord),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "haxe_generated_option_cache_shell",
    source_domains: sourceDomains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      symbol_count: domain.symbol_count,
      test_count: domain.test_count
    })),
    promoted_symbols: PROMOTED_SYMBOLS,
    hxml: HXML,
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    },
    cases: FIXTURE_CASES,
    public_abi_policy: {
      generated_php_shells_keep_global_functions: true,
      function_names_preserved: true,
      reflection_visible_php_files_preserved: true,
      haxe_core_uses_typed_helpers_without_dynamic: true,
      raw_php_syntax_code_used_in_haxe: false
    },
    native_boundaries: [
      {
        id: "autoload-filter-boundary",
        reason:
          "wp_determine_option_autoload_value keeps apply_filters('wp_default_autoload_value', ...) in the public PHP shell; Haxe owns the explicit/default result mapping."
      },
      {
        id: "max-option-size-filter-boundary",
        reason:
          "wp_filter_default_autoload_value_via_option_size keeps apply_filters('wp_max_autoloaded_option_size', ...) in PHP; Haxe owns the size threshold decision."
      },
      {
        id: "php-empty-and-mixed-input-normalization",
        reason:
          "The shell normalizes PHP bool/string/null/scalar and empty() observations before calling typed Haxe, preserving WordPress's mixed public ABI without introducing Dynamic into Haxe."
      },
      {
        id: "haxe-autoload-bootstrap",
        reason:
          "The candidate build root installs the Haxe PHP autoloader before option.php/cache.php public wrappers delegate to generated classes."
      }
    ],
    non_promoted_symbols: [
      {
        symbols: ["maybe_serialize", "maybe_unserialize", "is_serialized", "is_serialized_string"],
        reason:
          "These depend on PHP native serialization grammar, class names, enum tokens, suppressed unserialize failures, and false/null ambiguity; WPHX-304.05 records the boundary before a dedicated strategy."
      },
      {
        symbols: ["wp_cache_get_salted", "wp_cache_set_salted", "wp_cache_get_multiple_salted", "wp_cache_set_multiple_salted"],
        reason:
          "Salted helpers are cache-compat/drop-in-facing and remain native until the persistent drop-in compatibility matrix is broader."
      },
      {
        symbols: ["wp_suspend_cache_addition", "wp_suspend_cache_invalidation", "wp_cache_get_last_changed", "wp_cache_set_last_changed"],
        reason:
          "These expose function-static state, globals, hook emissions, and microtime salts; WPHX-304.05 keeps them as native boundaries for now."
      }
    ],
    follow_up_owner: "WPHX-304"
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    generated_haxe_files: filesUnder(HAXE_OUT),
    transformed_candidate_files: [
      inputRecord(`${CANDIDATE_ROOT}/wp-includes/option.php`),
      inputRecord(`${CANDIDATE_ROOT}/wp-includes/cache.php`)
    ]
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version: localOracle.result.phpVersion,
      executable: lock.tools.php_cli.executable
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs,
  comparisons,
  remaining_gaps: [
    {
      id: "full-option-storage-not-yet-haxe-owned",
      owner: "WPHX-304",
      detail:
        "This slice promotes only pure decision helpers. Database writes, alloptions/notoptions mutation, option CRUD, and transients remain oracle/native until separate ownership gates."
    },
    {
      id: "serialization-strategy-not-yet-promoted",
      owner: "WPHX-304",
      detail:
        "PHP serialization helpers remain native/oracle-owned pending a deliberate Haxe/PHP serialization compatibility strategy."
    },
    {
      id: "distribution-surface-not-yet-verified",
      owner: "WPHX-304",
      detail:
        "This candidate proves behavior through the differential harness; full distribution ownership still needs linker/include/reflection compatibility receipts for option.php and cache.php."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-304",
      detail:
        "This fixture covers seed traces. Full upstream options/cache PHPUnit parity remains a domain-level closure requirement."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_generated_option_cache_shell",
    promoted_symbols: PROMOTED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length,
    oracle_behavior_matches_haxe_candidate: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-304-07-option-cache-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "option/cache Haxe candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "Haxe parity candidate ownership manifest"
    },
    {
      path: "tools/wp-core/run-option-cache-candidate.mjs",
      role: "candidate generator and oracle comparator"
    },
    {
      path: "src/wphx/wp/options/PureOptionCache.hx",
      role: "typed Haxe pure option/cache helper implementation"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-304-option-cache-candidate",
    "npm run wp:core:wphx-304-option-cache-candidate:check",
    "npm run wp:core:wphx-304-option-storage:check",
    "npm run wp:core:wphx-304-object-cache:check",
    "npm run haxe:escape-hatches:check",
    "npm run receipts:validate"
  ],
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
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
      promoted_symbols: PROMOTED_SYMBOLS.length,
      fixture_cases: FIXTURE_CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
