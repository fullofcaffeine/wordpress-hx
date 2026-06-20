#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-facade/f4-public-class.hxml";
const OUT_ROOT = "build/php-public-class";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/generated/wp-includes/class-wphx-public-class.php`;
const PROBE = `${OUT_ROOT}/probe.php`;
const ORACLE = "fixtures/php-facade/oracle/public-class.php";
const OUT = "manifests/php-facade/wphx-105-f4-public-class.v1.json";
const RECORDED_AT = "2026-06-20T06:28:00Z";

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

if ( ! defined( 'WPHX_F4_CLASS_BOOTSTRAPPED' ) ) {
\tdefine( 'WPHX_F4_CLASS_BOOTSTRAPPED', true );
\t$wphx_f4_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f4_lib );
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

if ( ! interface_exists( 'WPHX_Public_Interface', false ) ) {
\tinterface WPHX_Public_Interface {
\t\tpublic function describe();
\t}
}

if ( ! class_exists( 'WPHX_Public_Base', false ) ) {
\tclass WPHX_Public_Base {
\t\tpublic const BASE_KIND = 'base';

\t\tpublic $baseValue;

\t\tpublic function __construct( $base_value = 'base-default' ) {
\t\t\t$this->baseValue = $base_value;
\t\t}

\t\tpublic function base_label() {
\t\t\treturn \\wphx\\fixtures\\php\\facade\\ClassKernel::baseLabel( $this->baseValue );
\t\t}
\t}
}

if ( ! class_exists( 'WPHX_Public_Class', false ) ) {
\tclass WPHX_Public_Class extends WPHX_Public_Base implements WPHX_Public_Interface {
\t\tpublic const KIND = 'fixture';

\t\tpublic static $instances = 0;

\t\tpublic $name;
\t\tprotected $meta;

\t\tpublic function __construct( $name, $meta = array() ) {
\t\t\tparent::__construct( 'base-' . $name );
\t\t\t$this->name = $name;
\t\t\t$this->meta = $meta;
\t\t\tself::$instances++;
\t\t}

\t\tpublic static function factory( $name ) {
\t\t\treturn new self( $name, array( 'fromFactory' => true ) );
\t\t}

\t\tpublic function describe() {
\t\t\treturn \\wphx\\fixtures\\php\\facade\\ClassKernel::describe( $this->name, count( $this->meta ) );
\t\t}

\t\tpublic function get_meta( $key, $default = null ) {
\t\t\treturn array_key_exists( $key, $this->meta ) ? $this->meta[ $key ] : $default;
\t\t}
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
\t'interface' => interface_exists( 'WPHX_Public_Interface', false ),
\t'base' => class_exists( 'WPHX_Public_Base', false ),
\t'class' => class_exists( 'WPHX_Public_Class', false ),
);

require $shell;
require $shell;

$after = array(
\t'interface' => interface_exists( 'WPHX_Public_Interface', false ),
\t'base' => class_exists( 'WPHX_Public_Base', false ),
\t'class' => class_exists( 'WPHX_Public_Class', false ),
);

$instance = new WPHX_Public_Class( 'core', array( 'a' => 1, 'b' => 2 ) );
$factory = WPHX_Public_Class::factory( 'factory' );
$class = new ReflectionClass( 'WPHX_Public_Class' );
$base = new ReflectionClass( 'WPHX_Public_Base' );
$interface = new ReflectionClass( 'WPHX_Public_Interface' );

function wphx_f4_params( $reflection ) {
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

$methods = array();
foreach ( array( '__construct', 'factory', 'describe', 'get_meta', 'base_label' ) as $method_name ) {
\t$owner = $class->hasMethod( $method_name ) ? $class : $base;
\t$method = $owner->getMethod( $method_name );
\t$methods[ $method_name ] = array(
\t\t'name' => $method->getName(),
\t\t'class' => $method->getDeclaringClass()->getName(),
\t\t'isPublic' => $method->isPublic(),
\t\t'isStatic' => $method->isStatic(),
\t\t'numberOfParameters' => $method->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $method->getNumberOfRequiredParameters(),
\t\t'hasReturnType' => $method->hasReturnType(),
\t\t'returnsReference' => $method->returnsReference(),
\t\t'parameters' => wphx_f4_params( $method ),
\t);
}

$properties = array();
foreach ( array( 'instances', 'name', 'meta', 'baseValue' ) as $property_name ) {
\t$owner = $class->hasProperty( $property_name ) ? $class : $base;
\t$property = $owner->getProperty( $property_name );
\t$properties[ $property_name ] = array(
\t\t'name' => $property->getName(),
\t\t'class' => $property->getDeclaringClass()->getName(),
\t\t'isPublic' => $property->isPublic(),
\t\t'isProtected' => $property->isProtected(),
\t\t'isStatic' => $property->isStatic(),
\t);
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'afterSecondRequire' => $after,
\t\t'classReflection' => array(
\t\t\t'name' => $class->getName(),
\t\t\t'isInstantiable' => $class->isInstantiable(),
\t\t\t'parent' => $class->getParentClass()->getName(),
\t\t\t'interfaceNames' => $class->getInterfaceNames(),
\t\t\t'constants' => $class->getConstants(),
\t\t\t'shortName' => $class->getShortName(),
\t\t),
\t\t'baseReflection' => array(
\t\t\t'name' => $base->getName(),
\t\t\t'constants' => $base->getConstants(),
\t\t),
\t\t'interfaceReflection' => array(
\t\t\t'name' => $interface->getName(),
\t\t\t'isInterface' => $interface->isInterface(),
\t\t),
\t\t'methods' => $methods,
\t\t'properties' => $properties,
\t\t'objectCases' => array(
\t\t\t'instanceOfClass' => $instance instanceof WPHX_Public_Class,
\t\t\t'instanceOfBase' => $instance instanceof WPHX_Public_Base,
\t\t\t'instanceOfInterface' => $instance instanceof WPHX_Public_Interface,
\t\t\t'nameProperty' => $instance->name,
\t\t\t'describe' => $instance->describe(),
\t\t\t'baseLabel' => $instance->base_label(),
\t\t\t'metaExisting' => $instance->get_meta( 'a', 'fallback' ),
\t\t\t'metaMissing' => $instance->get_meta( 'missing', 'fallback' ),
\t\t\t'factoryClass' => get_class( $factory ),
\t\t\t'factoryDescribe' => $factory->describe(),
\t\t\t'staticInstances' => WPHX_Public_Class::$instances,
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
    classReflection: result.classReflection,
    baseReflection: result.baseReflection,
    interfaceReflection: result.interfaceReflection,
    methods: result.methods,
    properties: result.properties,
    objectCases: result.objectCases
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
  schema: "wphx.php-facade-f4-public-class.v1",
  issue: "WPHX-105",
  generated_at: RECORDED_AT,
  generator: "tools/php-facade/run-f4-public-class.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/ClassEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/ClassKernel.hx"
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
  class_strategy: {
    php_shell_owns_public_class_identity: true,
    haxe_owns_method_logic: true,
    boundary_note: "Global PHP class/interface shells preserve reflection and instanceof behavior while delegating selected method logic to Haxe."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    global_class_identity: true,
    reflection_contract: true,
    inheritance: true,
    interface_contract: true,
    static_factory_and_property: true
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
