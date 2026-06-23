#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { normalizeGeneratedPhpForManifest } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/wp-boundary/boundary-types.hxml";
const OUT_ROOT = "build/wp-boundary";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/generated/wp-includes/boundary-types.php`;
const PROBE = `${OUT_ROOT}/probe.php`;
const ORACLE = "fixtures/wp-boundary/oracle/boundary-types.php";
const OUT = "manifests/wp-boundary/wphx-203-boundary-types.v1.json";
const RECEIPT = "receipts/wp-boundary/wphx-203-boundary-types.v1.json";
const RECORDED_AT = "2026-06-20T06:20:00.000Z";

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

function phpVersionFamily(version) {
  return version.split(".").slice(0, 2).join(".");
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
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
    .map((path) => {
      const normalized = normalizeGeneratedPhpForManifest(readFileSync(path, "utf8"));
      return {
        path: relative(dir, path),
        bytes: Buffer.byteLength(normalized),
        sha256: sha256(normalized)
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function writeGeneratedShell() {
  mkdirSync(dirname(SHELL), { recursive: true });
  writeFileSync(
    SHELL,
    `<?php

if ( ! defined( 'WPHX_203_BOUNDARY_BOOTSTRAPPED' ) ) {
\tdefine( 'WPHX_203_BOUNDARY_BOOTSTRAPPED', true );
\t$wphx_203_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_203_lib );
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

if ( ! isset( $GLOBALS['wphx_boundary_options'] ) ) {
\t$GLOBALS['wphx_boundary_options'] = \\wphx\\wp\\boundary\\NativeArray::fromJsonObject( \\wphx\\fixtures\\wp\\boundary\\BoundaryKernel::seedJson() );
}

if ( ! class_exists( 'WP_Error', false ) ) {
\tclass WP_Error {
\t\tpublic $errors = array();
\t\tpublic $error_data = array();

\t\tpublic function __construct( $code = '', $message = '', $data = '' ) {
\t\t\tif ( '' !== $code ) {
\t\t\t\t$this->add( $code, $message, $data );
\t\t\t}
\t\t}

\t\tpublic function add( $code, $message, $data = '' ) {
\t\t\t$this->errors[ $code ][] = $message;
\t\t\tif ( '' !== $data ) {
\t\t\t\t$this->error_data[ $code ] = $data;
\t\t\t}
\t\t}

\t\tpublic function has_errors() {
\t\t\treturn ! empty( $this->errors );
\t\t}

\t\tpublic function get_error_code() {
\t\t\t$codes = array_keys( $this->errors );

\t\t\treturn $codes ? $codes[0] : '';
\t\t}

\t\tpublic function get_error_message( $code = '' ) {
\t\t\tif ( '' === $code ) {
\t\t\t\t$code = $this->get_error_code();
\t\t\t}

\t\t\treturn isset( $this->errors[ $code ][0] ) ? $this->errors[ $code ][0] : '';
\t\t}

\t\tpublic function get_error_data( $code = '' ) {
\t\t\tif ( '' === $code ) {
\t\t\t\t$code = $this->get_error_code();
\t\t\t}

\t\t\treturn array_key_exists( $code, $this->error_data ) ? $this->error_data[ $code ] : null;
\t\t}
\t}
}

if ( ! function_exists( 'wphx_boundary_get' ) ) {
\tfunction wphx_boundary_get( $key, $default = false ) {
\t\treturn \\wphx\\wp\\boundary\\NativeArray::get( $GLOBALS['wphx_boundary_options'], $key, $default );
\t}
}

if ( ! function_exists( 'wphx_boundary_set_global' ) ) {
\tfunction wphx_boundary_set_global( $key, $value ) {
\t\t$GLOBALS['wphx_boundary_options'][ $key ] = $value;

\t\treturn \\wphx\\wp\\boundary\\NativeArray::get( $GLOBALS['wphx_boundary_options'], $key, null );
\t}
}

if ( ! function_exists( 'wphx_boundary_normalize_key' ) ) {
\tfunction wphx_boundary_normalize_key( $key ) {
\t\treturn \\wphx\\fixtures\\wp\\boundary\\BoundaryKernel::normalizeKey( $key );
\t}
}

if ( ! function_exists( 'wphx_boundary_callback' ) ) {
\tfunction wphx_boundary_callback( $callback, $value ) {
\t\treturn \\wphx\\wp\\boundary\\CallableValue::call1( $callback, $value );
\t}
}

if ( ! function_exists( 'wphx_boundary_reference_param' ) ) {
\tfunction wphx_boundary_reference_param( &$value, $suffix = '-ref' ) {
\t\t$value = \\wphx\\wp\\boundary\\ReferenceBoundary::transformString( $value, $suffix );

\t\treturn strlen( $value );
\t}
}

if ( ! function_exists( 'wphx_boundary_reference_return' ) ) {
\tfunction &wphx_boundary_reference_return() {
\t\tif ( ! isset( $GLOBALS['wphx_boundary_reference_store'] ) ) {
\t\t\t$GLOBALS['wphx_boundary_reference_store'] = \\wphx\\wp\\boundary\\ReferenceBoundary::initialStore();
\t\t}

\t\treturn $GLOBALS['wphx_boundary_reference_store'];
\t}
}

if ( ! function_exists( 'wphx_boundary_reference_callback' ) ) {
\tfunction wphx_boundary_reference_callback( $callback, &$value ) {
\t\t$callback( $value );

\t\treturn $value;
\t}
}

if ( ! function_exists( 'wphx_boundary_error_snapshot' ) ) {
\tfunction wphx_boundary_error_snapshot( $error ) {
\t\treturn \\wphx\\wp\\boundary\\WpErrorValue::snapshot( $error );
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
\t'wphx_boundary_get' => function_exists( 'wphx_boundary_get' ),
\t'wphx_boundary_set_global' => function_exists( 'wphx_boundary_set_global' ),
\t'wphx_boundary_callback' => function_exists( 'wphx_boundary_callback' ),
\t'wphx_boundary_reference_param' => function_exists( 'wphx_boundary_reference_param' ),
\t'wphx_boundary_reference_return' => function_exists( 'wphx_boundary_reference_return' ),
\t'wphx_boundary_reference_callback' => function_exists( 'wphx_boundary_reference_callback' ),
\t'wphx_boundary_error_snapshot' => function_exists( 'wphx_boundary_error_snapshot' ),
\t'WP_Error' => class_exists( 'WP_Error', false ),
);

require $shell;
require $shell;

$after = array(
\t'wphx_boundary_get' => function_exists( 'wphx_boundary_get' ),
\t'wphx_boundary_set_global' => function_exists( 'wphx_boundary_set_global' ),
\t'wphx_boundary_callback' => function_exists( 'wphx_boundary_callback' ),
\t'wphx_boundary_reference_param' => function_exists( 'wphx_boundary_reference_param' ),
\t'wphx_boundary_reference_return' => function_exists( 'wphx_boundary_reference_return' ),
\t'wphx_boundary_reference_callback' => function_exists( 'wphx_boundary_reference_callback' ),
\t'wphx_boundary_error_snapshot' => function_exists( 'wphx_boundary_error_snapshot' ),
\t'WP_Error' => class_exists( 'WP_Error', false ),
);

function wphx_203_params( $reflection ) {
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

$get_reflection = new ReflectionFunction( 'wphx_boundary_get' );
$set_reflection = new ReflectionFunction( 'wphx_boundary_set_global' );
$callback_reflection = new ReflectionFunction( 'wphx_boundary_callback' );
$param_reflection = new ReflectionFunction( 'wphx_boundary_reference_param' );
$return_reflection = new ReflectionFunction( 'wphx_boundary_reference_return' );
$reference_callback_reflection = new ReflectionFunction( 'wphx_boundary_reference_callback' );
$error_reflection = new ReflectionFunction( 'wphx_boundary_error_snapshot' );

$missing_default = wphx_boundary_get( 'missing', 'fallback' );
$null_value = wphx_boundary_get( 'null_value', 'fallback' );
$false_value = wphx_boundary_get( 'false_bool', true );
$zero_string = wphx_boundary_get( 'zero_string', 'fallback' );
$empty_string = wphx_boundary_get( 'empty_string', 'fallback' );
$list = wphx_boundary_get( 'list' );
$assoc = wphx_boundary_get( 'assoc' );
$numeric_keys = wphx_boundary_get( 'numeric_keys' );
$nested = wphx_boundary_get( 'nested' );
$set_return = wphx_boundary_set_global( 'dynamic', array( 'nested' => array( 'value' => 7 ) ) );
$callback_return = wphx_boundary_callback(
\tfunction ( $value ) {
\t\treturn strtoupper( $value ) . '-CALLBACK';
\t},
\t'core'
);

$param_value = 'core';
$param_return = wphx_boundary_reference_param( $param_value, '-tail' );

$store_ref =& wphx_boundary_reference_return();
$store_before = $GLOBALS['wphx_boundary_reference_store'];
$store_ref = 'changed-through-reference';
$store_after = $GLOBALS['wphx_boundary_reference_store'];

$reference_callback_value = 'callback';
$reference_callback_return = wphx_boundary_reference_callback(
\tfunction ( &$item ) {
\t\t$item .= '-mutated';
\t},
\t$reference_callback_value
);

$error = new WP_Error( 'wphx_boundary', 'Boundary failed', array( 'status' => 500 ) );
$error->add( 'second_code', 'Second message', array( 'status' => 501 ) );
$error_snapshot = wphx_boundary_error_snapshot( $error );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'afterSecondRequire' => $after,
\t\t'globals' => array(
\t\t\t'hasOptions' => isset( $GLOBALS['wphx_boundary_options'] ),
\t\t\t'optionsType' => gettype( $GLOBALS['wphx_boundary_options'] ),
\t\t\t'optionKeys' => array_keys( $GLOBALS['wphx_boundary_options'] ),
\t\t),
\t\t'arrayCases' => array(
\t\t\t'missingDefault' => $missing_default,
\t\t\t'nullValue' => $null_value,
\t\t\t'nullArrayKeyExists' => array_key_exists( 'null_value', $GLOBALS['wphx_boundary_options'] ),
\t\t\t'nullIsset' => isset( $GLOBALS['wphx_boundary_options']['null_value'] ),
\t\t\t'falseValue' => $false_value,
\t\t\t'zeroString' => $zero_string,
\t\t\t'emptyString' => $empty_string,
\t\t\t'listCount' => count( $list ),
\t\t\t'listValues' => array_values( $list ),
\t\t\t'assocKeys' => array_keys( $assoc ),
\t\t\t'assocValues' => array_values( $assoc ),
\t\t\t'numericKeys' => array_keys( $numeric_keys ),
\t\t\t'numericValues' => array_values( $numeric_keys ),
\t\t\t'nestedThemeName' => $nested['theme']['name'],
\t\t\t'dynamicSetReturn' => $set_return,
\t\t\t'dynamicStored' => $GLOBALS['wphx_boundary_options']['dynamic'],
\t\t\t'normalizedKey' => wphx_boundary_normalize_key( '  Site URL  ' ),
\t\t),
\t\t'callableCase' => array(
\t\t\t'return' => $callback_return,
\t\t),
\t\t'referenceCases' => array(
\t\t\t'paramReturn' => $param_return,
\t\t\t'paramValueAfterCall' => $param_value,
\t\t\t'storeBefore' => $store_before,
\t\t\t'referenceValueAfterAssignment' => $store_ref,
\t\t\t'storeAfter' => $store_after,
\t\t\t'callbackReturn' => $reference_callback_return,
\t\t\t'callbackValueAfterCall' => $reference_callback_value,
\t\t),
\t\t'errorCase' => $error_snapshot,
\t\t'reflection' => array(
\t\t\t'get' => array(
\t\t\t\t'name' => $get_reflection->getName(),
\t\t\t\t'numberOfParameters' => $get_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $get_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $get_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $get_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $get_reflection ),
\t\t\t),
\t\t\t'set' => array(
\t\t\t\t'name' => $set_reflection->getName(),
\t\t\t\t'numberOfParameters' => $set_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $set_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $set_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $set_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $set_reflection ),
\t\t\t),
\t\t\t'callback' => array(
\t\t\t\t'name' => $callback_reflection->getName(),
\t\t\t\t'numberOfParameters' => $callback_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $callback_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $callback_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $callback_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $callback_reflection ),
\t\t\t),
\t\t\t'referenceParam' => array(
\t\t\t\t'name' => $param_reflection->getName(),
\t\t\t\t'numberOfParameters' => $param_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $param_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $param_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $param_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $param_reflection ),
\t\t\t),
\t\t\t'referenceReturn' => array(
\t\t\t\t'name' => $return_reflection->getName(),
\t\t\t\t'numberOfParameters' => $return_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $return_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $return_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $return_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $return_reflection ),
\t\t\t),
\t\t\t'referenceCallback' => array(
\t\t\t\t'name' => $reference_callback_reflection->getName(),
\t\t\t\t'numberOfParameters' => $reference_callback_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $reference_callback_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $reference_callback_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $reference_callback_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $reference_callback_reflection ),
\t\t\t),
\t\t\t'error' => array(
\t\t\t\t'name' => $error_reflection->getName(),
\t\t\t\t'numberOfParameters' => $error_reflection->getNumberOfParameters(),
\t\t\t\t'numberOfRequiredParameters' => $error_reflection->getNumberOfRequiredParameters(),
\t\t\t\t'returnsReference' => $error_reflection->returnsReference(),
\t\t\t\t'hasReturnType' => $error_reflection->hasReturnType(),
\t\t\t\t'parameters' => wphx_203_params( $error_reflection ),
\t\t\t),
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
    arrayCases: result.arrayCases,
    callableCase: result.callableCase,
    referenceCases: result.referenceCases,
    errorCase: result.errorCase,
    reflection: result.reflection
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
  schema: "wphx.wp-boundary-types.v1",
  issue: "WPHX-203",
  generated_at: RECORDED_AT,
  generator: "tools/wp-boundary/run-boundary-types.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "src/wphx/wp/boundary/CallableValue.hx",
      "src/wphx/wp/boundary/Globals.hx",
      "src/wphx/wp/boundary/NativeArray.hx",
      "src/wphx/wp/boundary/ReferenceBoundary.hx",
      "src/wphx/wp/boundary/WpErrorValue.hx",
      "fixtures/wp-boundary/src/wphx/fixtures/wp/boundary/BoundaryEntry.hx",
      "fixtures/wp-boundary/src/wphx/fixtures/wp/boundary/BoundaryKernel.hx"
    ],
    oracle_shell: ORACLE,
    generated_shell: SHELL,
    probe: PROBE
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version_family: phpVersionFamily(command("php", ["-r", "echo PHP_VERSION;"])),
    docker_available: dockerVersion != null
  },
  build: {
    command: `haxe ${HXML}`,
    haxe_output_dir: HAXE_OUT,
    generated_file_count: filesUnder(HAXE_OUT).length,
    generated_files: filesUnder(HAXE_OUT),
    shell: {
      path: SHELL,
      sha256: sha256File(SHELL)
    },
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  boundary_strategy: {
    haxe_owns_native_value_helpers: true,
    php_shell_owns_original_public_reference_abi: true,
    wp_error_is_native_php_object: true,
    next_generator_contract: "WPHX-204 should call these helpers from generated original-name facades instead of inventing per-function native value handling."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    arrays: true,
    globals: true,
    callables: true,
    references: true,
    wp_error_values: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-boundary-types-receipt.v1",
  id: "receipt:wphx-203-boundary-types",
  issue: "WPHX-203",
  recorded_at: RECORDED_AT,
  command: "npm run wp:boundary",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  boundary_sources: manifest.fixture.haxe_sources.slice(0, 5),
  runtime_run_count: runs.length,
  comparison_count: comparisons.length,
  coverage: ["arrays", "globals", "callables", "references", "wp_error_values"]
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText]
  ]) {
    if (!existsSync(path)) {
      console.error(JSON.stringify({ status: "failed", error: `${path} does not exist` }, null, 2));
      process.exit(1);
    }
    if (readFileSync(path, "utf8") !== text) {
      console.error(JSON.stringify({ status: "failed", error: `${path} is stale` }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, comparison_count: comparisons.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, comparison_count: comparisons.length }, null, 2));
