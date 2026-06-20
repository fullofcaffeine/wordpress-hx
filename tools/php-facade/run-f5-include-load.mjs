#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-facade/f5-include-load.hxml";
const OUT_ROOT = "build/php-include-load";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PROBE = `${OUT_ROOT}/probe.php`;
const ORACLE_ROOT = "fixtures/php-facade/oracle/include-load";
const OUT = "manifests/php-facade/wphx-106-f5-include-load.v1.json";
const RECORDED_AT = "2026-06-20T06:48:00Z";
const SCENARIOS = ["entry-default", "entry-pluggable-override", "direct-guard", "scope-include"];

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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

function filesUnder(dir) {
  return walk(dir)
    .map((path) => ({
      path: relative(dir, path),
      bytes: statSync(path).size,
      sha256: sha256(path)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeGeneratedTree() {
  writeFile(
    `${GENERATED_ROOT}/wp-settings.php`,
    `<?php

if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'WPINC' ) ) {
\tdefine( 'WPINC', 'wp-includes' );
}

if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
\t$GLOBALS['wphx_f5_trace'] = array();
}

if ( ! isset( $GLOBALS['wphx_f5_settings_count'] ) ) {
\t$GLOBALS['wphx_f5_settings_count'] = 0;
}

$GLOBALS['wphx_f5_settings_count']++;
$GLOBALS['wphx_f5_trace'][] = array(
\t'event' => 'settings:begin',
\t'file' => __FILE__,
\t'detail' => 'count:' . $GLOBALS['wphx_f5_settings_count'],
);

$wphx_f5_load_return = require_once ABSPATH . WPINC . '/load.php';
$wphx_f5_repeated_return = include ABSPATH . WPINC . '/repeated.php';
$wphx_f5_value_return = require ABSPATH . WPINC . '/return-value.php';
$wphx_f5_pluggable_return = require_once ABSPATH . WPINC . '/pluggable.php';

$GLOBALS['wphx_f5_load_returns'][] = array(
\t'load' => $wphx_f5_load_return,
\t'repeated' => $wphx_f5_repeated_return,
\t'returnValue' => $wphx_f5_value_return,
\t'pluggable' => $wphx_f5_pluggable_return,
);

$GLOBALS['wphx_f5_trace'][] = array(
\t'event' => 'settings:end',
\t'file' => __FILE__,
\t'detail' => 'trace:' . count( $GLOBALS['wphx_f5_trace'] ),
);

return 'settings:' . $GLOBALS['wphx_f5_settings_count'];
`
  );

  writeFile(
    `${GENERATED_ROOT}/wp-includes/load.php`,
    `<?php

if ( ! defined( 'ABSPATH' ) ) {
\treturn 'ABSPATH_REQUIRED';
}

if ( ! function_exists( 'wphx_f5_bootstrap_haxe' ) ) {
\tfunction wphx_f5_bootstrap_haxe() {
\t\tif ( defined( 'WPHX_F5_LOAD_BOOTSTRAPPED' ) ) {
\t\t\treturn;
\t\t}

\t\tdefine( 'WPHX_F5_LOAD_BOOTSTRAPPED', true );
\t\t$wphx_f5_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f5_lib );
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

wphx_f5_bootstrap_haxe();

if ( ! function_exists( 'wphx_f5_generated_event' ) ) {
\tfunction wphx_f5_generated_event( $event, $file, $detail ) {
\t\treturn json_decode( \\wphx\\fixtures\\php\\facade\\LoadKernel::eventJson( $event, $file, $detail ), true );
\t}
}

if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
\t$GLOBALS['wphx_f5_trace'] = array();
}

$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'load:included', __FILE__, 'require_once' );

if ( ! function_exists( 'wphx_f5_load_marker' ) ) {
\tfunction wphx_f5_load_marker() {
\t\treturn \\wphx\\fixtures\\php\\facade\\LoadKernel::marker( 'load' );
\t}
}

return 'load:included';
`
  );

  writeFile(
    `${GENERATED_ROOT}/wp-includes/repeated.php`,
    `<?php

if ( ! isset( $GLOBALS['wphx_f5_repeated_count'] ) ) {
\t$GLOBALS['wphx_f5_repeated_count'] = 0;
}

$GLOBALS['wphx_f5_repeated_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'repeated:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_repeated_count'] );

return \\wphx\\fixtures\\php\\facade\\LoadKernel::returnValue( 'repeated', $GLOBALS['wphx_f5_repeated_count'] );
`
  );

  writeFile(
    `${GENERATED_ROOT}/wp-includes/return-value.php`,
    `<?php

if ( ! isset( $GLOBALS['wphx_f5_return_count'] ) ) {
\t$GLOBALS['wphx_f5_return_count'] = 0;
}

$GLOBALS['wphx_f5_return_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'return-value:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_return_count'] );

return \\wphx\\fixtures\\php\\facade\\LoadKernel::returnValue( 'return-value', $GLOBALS['wphx_f5_return_count'] );
`
  );

  writeFile(
    `${GENERATED_ROOT}/wp-includes/pluggable.php`,
    `<?php

$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'pluggable:included', __FILE__, 'conditional' );

if ( ! function_exists( 'wphx_f5_pluggable' ) ) {
\tfunction wphx_f5_pluggable() {
\t\treturn \\wphx\\fixtures\\php\\facade\\LoadKernel::marker( 'pluggable' );
\t}
}

return 'pluggable:available';
`
  );

  writeFile(
    `${GENERATED_ROOT}/wp-includes/scope.php`,
    `<?php

$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'scope:included', __FILE__, isset( $existing ) ? $existing : 'missing' );
$scoped_value = \\wphx\\fixtures\\php\\facade\\LoadKernel::scopeValue( isset( $existing ) ? $existing : 'missing' );

return 'scope:return:' . $scoped_value;
`
  );
}

function writeProbe() {
  writeFile(
    PROBE,
    `<?php

$mode = $argv[1];
$scenario = $argv[2];
$root = rtrim( $argv[3], '/' );
$entry = $root . '/wp-settings.php';

function wphx_f5_normalize_value( $value, $root ) {
\t$real_root = str_replace( '\\\\', '/', realpath( $root ) );

\tif ( is_array( $value ) ) {
\t\t$normalized = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$normalized[ $key ] = wphx_f5_normalize_value( $item, $root );
\t\t}
\t\treturn $normalized;
\t}

\tif ( is_string( $value ) ) {
\t\t$value = str_replace( '\\\\', '/', $value );
\t\treturn str_replace( $real_root, '<root>', $value );
\t}

\treturn $value;
}

function wphx_f5_state( $root ) {
\t$state = array(
\t\t'defined' => array(
\t\t\t'ABSPATH' => defined( 'ABSPATH' ),
\t\t\t'WPINC' => defined( 'WPINC' ),
\t\t),
\t\t'constants' => array(
\t\t\t'ABSPATH' => defined( 'ABSPATH' ) ? ABSPATH : null,
\t\t\t'WPINC' => defined( 'WPINC' ) ? WPINC : null,
\t\t),
\t\t'functions' => array(
\t\t\t'loadMarker' => function_exists( 'wphx_f5_load_marker' ),
\t\t\t'pluggable' => function_exists( 'wphx_f5_pluggable' ),
\t\t),
\t\t'functionValues' => array(
\t\t\t'loadMarker' => function_exists( 'wphx_f5_load_marker' ) ? wphx_f5_load_marker() : null,
\t\t\t'pluggable' => function_exists( 'wphx_f5_pluggable' ) ? wphx_f5_pluggable() : null,
\t\t),
\t\t'counts' => array(
\t\t\t'settings' => $GLOBALS['wphx_f5_settings_count'] ?? null,
\t\t\t'repeated' => $GLOBALS['wphx_f5_repeated_count'] ?? null,
\t\t\t'returnValue' => $GLOBALS['wphx_f5_return_count'] ?? null,
\t\t),
\t\t'trace' => $GLOBALS['wphx_f5_trace'] ?? array(),
\t\t'loadReturns' => $GLOBALS['wphx_f5_load_returns'] ?? array(),
\t);

\treturn wphx_f5_normalize_value( $state, $root );
}

function wphx_f5_scope_case( $path ) {
\t$existing = 'caller-local';
\t$scope_return = include $path;

\treturn array(
\t\t'existingAfterInclude' => $existing,
\t\t'scopedValue' => $scoped_value ?? null,
\t\t'returnValue' => $scope_return,
\t);
}

$before = wphx_f5_state( $root );
$result = array();

if ( 'entry-default' === $scenario ) {
\t$first = require $entry;
\t$second = require $entry;
\t$result = array(
\t\t'entryReturns' => array( $first, $second ),
\t\t'state' => wphx_f5_state( $root ),
\t);
} elseif ( 'entry-pluggable-override' === $scenario ) {
\tfunction wphx_f5_pluggable() {
\t\treturn 'plugin-override';
\t}

\t$first = require $entry;
\t$result = array(
\t\t'entryReturns' => array( $first ),
\t\t'state' => wphx_f5_state( $root ),
\t);
} elseif ( 'direct-guard' === $scenario ) {
\t$direct = require $root . '/wp-includes/load.php';
\t$result = array(
\t\t'directReturn' => $direct,
\t\t'state' => wphx_f5_state( $root ),
\t);
} elseif ( 'scope-include' === $scenario ) {
\t$first = require $entry;
\t$scope = wphx_f5_scope_case( $root . '/wp-includes/scope.php' );
\t$result = array(
\t\t'entryReturns' => array( $first ),
\t\t'scope' => wphx_f5_normalize_value( $scope, $root ),
\t\t'state' => wphx_f5_state( $root ),
\t);
} else {
\tfwrite( STDERR, 'Unknown scenario: ' . $scenario . PHP_EOL );
\texit( 2 );
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'scenario' => $scenario,
\t\t'before' => $before,
\t\t'result' => $result,
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function normalizeProbe(result) {
  return {
    scenario: result.scenario,
    before: result.before,
    result: result.result
  };
}

function runProbe(commandPath, label, mode, scenario, root) {
  const output = command(commandPath, [PROBE, mode, scenario, root]);
  return {
    id: `${label}:${mode}:${scenario}`,
    command: `${commandPath} ${PROBE} ${mode} ${scenario} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, mode, scenario, root) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, scenario, root]);
  return {
    id: `${id}:${mode}:${scenario}`,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${scenario} ${root}`,
    image,
    result: JSON.parse(output)
  };
}

function compareResults(oracleResult, generatedResult) {
  const oracle = normalizeProbe(oracleResult);
  const generated = normalizeProbe(generatedResult);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(generated),
    oracle,
    generated
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
writeGeneratedTree();
writeProbe();

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

for (const scenario of SCENARIOS) {
  const oracle = runProbe("php", "local-php-cli", "oracle", scenario, ORACLE_ROOT);
  const generated = runProbe("php", "local-php-cli", "generated", scenario, GENERATED_ROOT);
  runs.push(oracle, generated);
  comparisons.push({
    id: `local-php-cli:${scenario}`,
    ...compareResults(oracle.result, generated.result)
  });
}

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    for (const scenario of SCENARIOS) {
      const oracle = runDockerProbe(id, image, "oracle", scenario, ORACLE_ROOT);
      const generated = runDockerProbe(id, image, "generated", scenario, GENERATED_ROOT);
      runs.push(oracle, generated);
      comparisons.push({
        id: `${id}:${scenario}`,
        ...compareResults(oracle.result, generated.result)
      });
    }
  }
}

const failures = comparisons.filter((comparison) => !comparison.matches);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.php-facade-f5-include-load.v1",
  issue: "WPHX-106",
  generated_at: RECORDED_AT,
  generator: "tools/php-facade/run-f5-include-load.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/LoadEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/LoadKernel.hx"
    ],
    oracle_root: ORACLE_ROOT,
    generated_root: GENERATED_ROOT,
    probe: PROBE,
    scenarios: SCENARIOS
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    command: `haxe ${HXML}`,
    haxe_output_dir: HAXE_OUT,
    generated_haxe_file_count: filesUnder(HAXE_OUT).length,
    generated_haxe_files: filesUnder(HAXE_OUT),
    generated_shell_file_count: filesUnder(GENERATED_ROOT).length,
    generated_shell_files: filesUnder(GENERATED_ROOT),
    oracle_files: filesUnder(ORACLE_ROOT),
    probe: {
      path: PROBE,
      sha256: sha256(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  include_load_strategy: {
    php_shell_owns_original_paths: true,
    php_shell_owns_include_timing: true,
    haxe_owns_side_effect_payload_helpers: true,
    boundary_note: "Original-path PHP shells preserve include order, require_once/include behavior, conditional declarations, return values, ABSPATH guards, and function-scope include mutation while delegating selected payload generation to Haxe."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    include_once: true,
    repeated_include: true,
    conditional_pluggable_declaration: true,
    include_time_side_effects: true,
    include_return_values: true,
    normalized_original_paths: true,
    abspath_guard: true,
    function_scope_include: true
  }
};

const serialized = JSON.stringify(manifest, null, 2) + "\n";

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} does not exist` }, null, 2));
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== serialized) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} is stale` }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, comparison_count: comparisons.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialized);
console.log(JSON.stringify({ status: "passed", output: OUT, comparison_count: comparisons.length }, null, 2));
