#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-facade/f3-native-values.hxml";
const OUT_ROOT = "build/php-native-values";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/generated/wp-includes/native-values.php`;
const PROBE = `${OUT_ROOT}/probe.php`;
const ORACLE = "fixtures/php-facade/oracle/native-values.php";
const OUT = "manifests/php-facade/wphx-104-f3-native-values.v1.json";
const RECORDED_AT = "2026-06-20T06:08:00Z";

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

function writeGeneratedShell() {
  mkdirSync(dirname(SHELL), { recursive: true });
  writeFileSync(
    SHELL,
    `<?php

if ( ! defined( 'WPHX_F3_NATIVE_BOOTSTRAPPED' ) ) {
\tdefine( 'WPHX_F3_NATIVE_BOOTSTRAPPED', true );
\t$wphx_f3_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f3_lib );
\tspl_autoload_register(
\t\tfunction ( $class ) {
\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\tif ( $file ) {
\t\t\t\tinclude_once $file;
\t\t\t}
\t\t}
\t);
\t\\php\\Boot::__hx__init();
}

if ( ! isset( $GLOBALS['wphx_f3_options'] ) ) {
\t$GLOBALS['wphx_f3_options'] = json_decode( \\wphx\\fixtures\\php\\facade\\NativeKernel::seedJson(), true );
}

if ( ! isset( $_SERVER['WPHX_F3_REQUEST_METHOD'] ) ) {
\t$_SERVER['WPHX_F3_REQUEST_METHOD'] = 'GET';
}

if ( ! function_exists( 'wphx_native_get' ) ) {
\tfunction wphx_native_get( $key, $default = false ) {
\t\treturn array_key_exists( $key, $GLOBALS['wphx_f3_options'] ) ? $GLOBALS['wphx_f3_options'][ $key ] : $default;
\t}
}

if ( ! function_exists( 'wphx_native_set_global' ) ) {
\tfunction wphx_native_set_global( $key, $value ) {
\t\t$GLOBALS['wphx_f3_options'][ $key ] = $value;

\t\treturn $GLOBALS['wphx_f3_options'][ $key ];
\t}
}

if ( ! function_exists( 'wphx_native_normalize_key' ) ) {
\tfunction wphx_native_normalize_key( $key ) {
\t\treturn \\wphx\\fixtures\\php\\facade\\NativeKernel::normalizeKey( $key );
\t}
}

if ( ! function_exists( 'wphx_native_callback' ) ) {
\tfunction wphx_native_callback( $callback, $value ) {
\t\treturn $callback( $value );
\t}
}
`
  );
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$shell = $argv[2];

$before = array(
\t'wphx_native_get' => function_exists( 'wphx_native_get' ),
\t'wphx_native_set_global' => function_exists( 'wphx_native_set_global' ),
\t'wphx_native_normalize_key' => function_exists( 'wphx_native_normalize_key' ),
\t'wphx_native_callback' => function_exists( 'wphx_native_callback' ),
);

require $shell;
require $shell;

$after = array(
\t'wphx_native_get' => function_exists( 'wphx_native_get' ),
\t'wphx_native_set_global' => function_exists( 'wphx_native_set_global' ),
\t'wphx_native_normalize_key' => function_exists( 'wphx_native_normalize_key' ),
\t'wphx_native_callback' => function_exists( 'wphx_native_callback' ),
);

function wphx_f3_params( $reflection ) {
\t$params = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
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

\treturn $params;
}

$get_reflection = new ReflectionFunction( 'wphx_native_get' );
$set_reflection = new ReflectionFunction( 'wphx_native_set_global' );
$normalize_reflection = new ReflectionFunction( 'wphx_native_normalize_key' );
$callback_reflection = new ReflectionFunction( 'wphx_native_callback' );

$missing_default = wphx_native_get( 'missing', 'fallback' );
$null_value = wphx_native_get( 'null_value', 'fallback' );
$false_value = wphx_native_get( 'false_bool', true );
$zero_string = wphx_native_get( 'zero_string', 'fallback' );
$empty_string = wphx_native_get( 'empty_string', 'fallback' );
$list = wphx_native_get( 'list' );
$assoc = wphx_native_get( 'assoc' );
$set_return = wphx_native_set_global( 'dynamic', array( 'nested' => array( 'value' => 7 ) ) );
$callback_return = wphx_native_callback(
\tfunction ( $value ) {
\t\treturn strtoupper( $value ) . '-CALLBACK';
\t},
\t'core'
);

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'afterSecondRequire' => $after,
\t\t'globals' => array(
\t\t\t'hasOptions' => isset( $GLOBALS['wphx_f3_options'] ),
\t\t\t'optionsType' => gettype( $GLOBALS['wphx_f3_options'] ),
\t\t\t'optionKeys' => array_keys( $GLOBALS['wphx_f3_options'] ),
\t\t\t'serverMethod' => $_SERVER['WPHX_F3_REQUEST_METHOD'],
\t\t),
\t\t'getReflection' => array(
\t\t\t'name' => $get_reflection->getName(),
\t\t\t'numberOfParameters' => $get_reflection->getNumberOfParameters(),
\t\t\t'numberOfRequiredParameters' => $get_reflection->getNumberOfRequiredParameters(),
\t\t\t'returnsReference' => $get_reflection->returnsReference(),
\t\t\t'hasReturnType' => $get_reflection->hasReturnType(),
\t\t\t'parameters' => wphx_f3_params( $get_reflection ),
\t\t),
\t\t'setReflection' => array(
\t\t\t'name' => $set_reflection->getName(),
\t\t\t'numberOfParameters' => $set_reflection->getNumberOfParameters(),
\t\t\t'numberOfRequiredParameters' => $set_reflection->getNumberOfRequiredParameters(),
\t\t\t'returnsReference' => $set_reflection->returnsReference(),
\t\t\t'hasReturnType' => $set_reflection->hasReturnType(),
\t\t\t'parameters' => wphx_f3_params( $set_reflection ),
\t\t),
\t\t'normalizeReflection' => array(
\t\t\t'name' => $normalize_reflection->getName(),
\t\t\t'numberOfParameters' => $normalize_reflection->getNumberOfParameters(),
\t\t\t'numberOfRequiredParameters' => $normalize_reflection->getNumberOfRequiredParameters(),
\t\t\t'returnsReference' => $normalize_reflection->returnsReference(),
\t\t\t'hasReturnType' => $normalize_reflection->hasReturnType(),
\t\t\t'parameters' => wphx_f3_params( $normalize_reflection ),
\t\t),
\t\t'callbackReflection' => array(
\t\t\t'name' => $callback_reflection->getName(),
\t\t\t'numberOfParameters' => $callback_reflection->getNumberOfParameters(),
\t\t\t'numberOfRequiredParameters' => $callback_reflection->getNumberOfRequiredParameters(),
\t\t\t'returnsReference' => $callback_reflection->returnsReference(),
\t\t\t'hasReturnType' => $callback_reflection->hasReturnType(),
\t\t\t'parameters' => wphx_f3_params( $callback_reflection ),
\t\t),
\t\t'valueCases' => array(
\t\t\t'missingDefault' => $missing_default,
\t\t\t'nullValue' => $null_value,
\t\t\t'nullArrayKeyExists' => array_key_exists( 'null_value', $GLOBALS['wphx_f3_options'] ),
\t\t\t'nullIsset' => isset( $GLOBALS['wphx_f3_options']['null_value'] ),
\t\t\t'falseValue' => $false_value,
\t\t\t'zeroString' => $zero_string,
\t\t\t'emptyString' => $empty_string,
\t\t\t'listCount' => count( $list ),
\t\t\t'listValues' => array_values( $list ),
\t\t\t'assocKeys' => array_keys( $assoc ),
\t\t\t'assocValues' => array_values( $assoc ),
\t\t\t'dynamicSetReturn' => $set_return,
\t\t\t'dynamicStored' => $GLOBALS['wphx_f3_options']['dynamic'],
\t\t\t'normalizedKey' => wphx_native_normalize_key( '  Site URL  ' ),
\t\t\t'callbackReturn' => $callback_return,
\t\t),
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function normalizeProbe(result) {
  return {
    before: result.before,
    afterSecondRequire: result.afterSecondRequire,
    globals: result.globals,
    getReflection: result.getReflection,
    setReflection: result.setReflection,
    normalizeReflection: result.normalizeReflection,
    callbackReflection: result.callbackReflection,
    valueCases: result.valueCases
  };
}

function runProbe(commandPath, label, mode, shell) {
  const output = command(commandPath, [PROBE, mode, shell]);
  return {
    id: `${label}:${mode}`,
    command: `${commandPath} ${PROBE} ${mode} ${shell}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, mode, shell) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, shell]);
  return {
    id: `${id}:${mode}`,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${shell}`,
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
writeGeneratedShell();
writeProbe();

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE);
const localGenerated = runProbe("php", "local-php-cli", "generated", SHELL);
runs.push(localOracle, localGenerated);
comparisons.push({
  id: "local-php-cli",
  ...compareResults(localOracle.result, localGenerated.result)
});

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    const oracle = runDockerProbe(id, image, "oracle", ORACLE);
    const generated = runDockerProbe(id, image, "generated", SHELL);
    runs.push(oracle, generated);
    comparisons.push({
      id,
      ...compareResults(oracle.result, generated.result)
    });
  }
}

const failures = comparisons.filter((comparison) => !comparison.matches);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.php-facade-f3-native-values.v1",
  issue: "WPHX-104",
  generated_at: RECORDED_AT,
  generator: "tools/php-facade/run-f3-native-values.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/NativeEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/NativeKernel.hx"
    ],
    oracle_shell: ORACLE,
    generated_shell: SHELL,
    probe: PROBE
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
    generated_file_count: filesUnder(HAXE_OUT).length,
    generated_files: filesUnder(HAXE_OUT),
    shell: {
      path: SHELL,
      sha256: sha256(SHELL)
    },
    probe: {
      path: PROBE,
      sha256: sha256(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  native_strategy: {
    php_shell_owns_globals_and_native_arrays: true,
    haxe_owns_seed_and_scalar_normalization: true,
    boundary_note: "The public PHP shell decodes Haxe seed JSON into native PHP arrays before exposing values through globals."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    globals: true,
    array_key_exists_vs_isset_null: true,
    false_zero_empty_distinctions: true,
    native_array_order: true,
    callback_value: true
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
