#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, linkOriginalPathTree, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const SPEC = "fixtures/wp-public-types/public-types.v1.json";
const HXML = "fixtures/wp-public-types/public-types.hxml";
const OUT_ROOT = "build/wp-public-types";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PROBE = `${OUT_ROOT}/probe.php`;
const ORACLE = "fixtures/wp-public-types/oracle/public-types.php";
const OUT = "manifests/wp-public-types/wphx-206-public-types.v1.json";
const RECEIPT = "receipts/wp-public-types/wphx-206-public-types.v1.json";
const RECORDED_AT = "2026-06-20T19:20:00.000Z";

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

function phpString(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function haxeBootstrapBlock() {
  return `namespace {
\tif ( ! defined( 'WPHX_206_PUBLIC_TYPES_BOOTSTRAPPED' ) ) {
\t\tdefine( 'WPHX_206_PUBLIC_TYPES_BOOTSTRAPPED', true );
\t\t$wphx_206_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_206_lib );
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
}`;
}

function globalSymbolsBlock() {
  return `namespace {
\tif ( ! interface_exists( 'WPHX_Public_Contract', false ) ) {
\t\tinterface WPHX_Public_Contract {
\t\t\tpublic function describe( string $prefix = '' ): string;
\t\t}
\t}

\tif ( ! trait_exists( 'WPHX_Public_Trait', false ) ) {
\t\ttrait WPHX_Public_Trait {
\t\t\tprotected $traitValue = 'trait-seed';

\t\t\tpublic function trait_label( string $suffix = '' ): string {
\t\t\t\treturn \\wphx\\fixtures\\wp\\publictypes\\PublicTypeKernel::traitLabel( $this->name, $suffix );
\t\t\t}
\t\t}
\t}

\tif ( ! class_exists( 'WPHX_Public_Base', false ) ) {
\t\tclass WPHX_Public_Base {
\t\t\tpublic const BASE_KIND = 'base';

\t\t\tpublic $baseValue;

\t\t\tpublic function __construct( string $base_value = 'base-default' ) {
\t\t\t\t$this->baseValue = $base_value;
\t\t\t}

\t\t\tpublic function base_label(): string {
\t\t\t\treturn \\wphx\\fixtures\\wp\\publictypes\\PublicTypeKernel::baseLabel( $this->baseValue );
\t\t\t}
\t\t}
\t}

\tif ( ! class_exists( 'WPHX_Public_Class', false ) ) {
\t\tclass WPHX_Public_Class extends WPHX_Public_Base implements WPHX_Public_Contract {
\t\t\tuse WPHX_Public_Trait;

\t\t\tpublic const KIND = 'fixture';

\t\t\tpublic static $instances = 0;

\t\t\tpublic $name;
\t\t\tprotected $meta;

\t\t\tpublic function __construct( string $name, array $meta = array() ) {
\t\t\t\tparent::__construct( 'base-' . $name );
\t\t\t\t$this->name = $name;
\t\t\t\t$this->meta = $meta;
\t\t\t\tself::$instances++;
\t\t\t}

\t\t\tpublic static function factory( string $name ): self {
\t\t\t\treturn new self( $name, array( 'fromFactory' => true ) );
\t\t\t}

\t\t\tpublic function describe( string $prefix = '' ): string {
\t\t\t\treturn \\wphx\\fixtures\\wp\\publictypes\\PublicTypeKernel::describe( $prefix, $this->name, count( $this->meta ) );
\t\t\t}

\t\t\tpublic function get_meta( string $key, $default = null ) {
\t\t\t\treturn array_key_exists( $key, $this->meta ) ? $this->meta[ $key ] : $default;
\t\t\t}
\t\t}
\t}
}`;
}

function namespacedSymbolsBlock() {
  return `namespace WordPress\\WPHX\\Fixture {
\tif ( ! interface_exists( __NAMESPACE__ . '\\\\NamespacedContract', false ) ) {
\t\tinterface NamespacedContract {
\t\t\tpublic function namespacedDescribe( string $prefix = 'ns' ): string;
\t\t}
\t}

\tif ( ! trait_exists( __NAMESPACE__ . '\\\\NamespacedTrait', false ) ) {
\t\ttrait NamespacedTrait {
\t\t\tpublic function namespacedTraitLabel( string $suffix = '' ): string {
\t\t\t\treturn \\wphx\\fixtures\\wp\\publictypes\\PublicTypeKernel::namespacedTraitLabel( $this->name, $suffix );
\t\t\t}
\t\t}
\t}

\tif ( ! class_exists( __NAMESPACE__ . '\\\\NamespacedImplementation', false ) ) {
\t\tclass NamespacedImplementation implements NamespacedContract {
\t\t\tuse NamespacedTrait;

\t\t\tpublic const KIND = 'namespaced';

\t\t\tpublic static $instances = 0;

\t\t\tpublic $name;

\t\t\tpublic function __construct( string $name = 'core' ) {
\t\t\t\t$this->name = $name;
\t\t\t\tself::$instances++;
\t\t\t}

\t\t\tpublic function namespacedDescribe( string $prefix = 'ns' ): string {
\t\t\t\treturn \\wphx\\fixtures\\wp\\publictypes\\PublicTypeKernel::namespacedDescribe( $prefix, $this->name );
\t\t\t}
\t\t}
\t}
}`;
}

function segment(id, order, kind, source, content, owner = "wphx-206") {
  return { id, order, kind, owner, source, content };
}

function writeGeneratedShell(spec) {
  return linkOriginalPathTree({
    root: GENERATED_ROOT,
    files: [
      {
        distribution_path: spec.output,
        segments: [
          segment(`${spec.output}:open`, 0, "php-open", "public-type-emitter", "<?php"),
          segment(`${spec.output}:bootstrap`, 10, "haxe-bootstrap", "WPHX-206", haxeBootstrapBlock()),
          segment(`${spec.output}:global-types`, 20, "public-type-shell", "WPHX-206", globalSymbolsBlock()),
          segment(`${spec.output}:namespaced-types`, 30, "public-type-shell", "WPHX-206", namespacedSymbolsBlock())
        ]
      }
    ]
  });
}

function writeProbe(spec, generatedShell) {
  mkdirSync(dirname(PROBE), { recursive: true });
  const symbols = {
    interfaces: ["WPHX_Public_Contract", "WordPress\\WPHX\\Fixture\\NamespacedContract"],
    traits: ["WPHX_Public_Trait", "WordPress\\WPHX\\Fixture\\NamespacedTrait"],
    classes: ["WPHX_Public_Base", "WPHX_Public_Class", "WordPress\\WPHX\\Fixture\\NamespacedImplementation"]
  };
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$shell = $argv[2];
$symbols = json_decode( ${phpString(JSON.stringify(symbols))}, true );

function wphx_206_type_name( $type ) {
\treturn $type ? (string) $type : null;
}

function wphx_206_symbol_state( $symbols ) {
\t$state = array( 'interfaces' => array(), 'traits' => array(), 'classes' => array() );
\tforeach ( $symbols['interfaces'] as $name ) {
\t\t$state['interfaces'][ $name ] = interface_exists( $name, false );
\t}
\tforeach ( $symbols['traits'] as $name ) {
\t\t$state['traits'][ $name ] = trait_exists( $name, false );
\t}
\tforeach ( $symbols['classes'] as $name ) {
\t\t$state['classes'][ $name ] = class_exists( $name, false );
\t}

\treturn $state;
}

function wphx_206_params( $reflection ) {
\t$params = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
\t\t$params[] = array(
\t\t\t'name' => $parameter->getName(),
\t\t\t'position' => $parameter->getPosition(),
\t\t\t'isOptional' => $parameter->isOptional(),
\t\t\t'hasDefault' => $parameter->isDefaultValueAvailable(),
\t\t\t'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
\t\t\t'type' => wphx_206_type_name( $parameter->getType() ),
\t\t\t'allowsNull' => $parameter->getType() ? $parameter->getType()->allowsNull() : null,
\t\t\t'isPassedByReference' => $parameter->isPassedByReference(),
\t\t\t'isVariadic' => $parameter->isVariadic(),
\t\t);
\t}

\treturn $params;
}

function wphx_206_class_reflection( $name ) {
\t$reflection = new ReflectionClass( $name );

\treturn array(
\t\t'name' => $reflection->getName(),
\t\t'shortName' => $reflection->getShortName(),
\t\t'namespaceName' => $reflection->getNamespaceName(),
\t\t'isInterface' => $reflection->isInterface(),
\t\t'isTrait' => $reflection->isTrait(),
\t\t'isInstantiable' => $reflection->isInstantiable(),
\t\t'parent' => $reflection->getParentClass() ? $reflection->getParentClass()->getName() : null,
\t\t'interfaceNames' => $reflection->getInterfaceNames(),
\t\t'traitNames' => $reflection->getTraitNames(),
\t\t'constants' => $reflection->getConstants(),
\t);
}

function wphx_206_method_reflection( $class_name, $method_name ) {
\t$reflection = new ReflectionMethod( $class_name, $method_name );

\treturn array(
\t\t'name' => $reflection->getName(),
\t\t'class' => $reflection->getDeclaringClass()->getName(),
\t\t'isPublic' => $reflection->isPublic(),
\t\t'isProtected' => $reflection->isProtected(),
\t\t'isStatic' => $reflection->isStatic(),
\t\t'numberOfParameters' => $reflection->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
\t\t'returnType' => wphx_206_type_name( $reflection->getReturnType() ),
\t\t'returnAllowsNull' => $reflection->getReturnType() ? $reflection->getReturnType()->allowsNull() : null,
\t\t'returnsReference' => $reflection->returnsReference(),
\t\t'parameters' => wphx_206_params( $reflection ),
\t);
}

function wphx_206_property_reflection( $class_name, $property_name ) {
\t$reflection = new ReflectionProperty( $class_name, $property_name );

\treturn array(
\t\t'name' => $reflection->getName(),
\t\t'class' => $reflection->getDeclaringClass()->getName(),
\t\t'isPublic' => $reflection->isPublic(),
\t\t'isProtected' => $reflection->isProtected(),
\t\t'isStatic' => $reflection->isStatic(),
\t\t'type' => wphx_206_type_name( $reflection->getType() ),
\t);
}

$before = wphx_206_symbol_state( $symbols );
require $shell;
require $shell;
$after = wphx_206_symbol_state( $symbols );

$global = new WPHX_Public_Class( 'core', array( 'a' => 1, 'b' => 2 ) );
$global_factory = WPHX_Public_Class::factory( 'factory' );
$namespaced_class = 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation';
$namespaced = new $namespaced_class( 'CoreName' );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'afterSecondRequire' => $after,
\t\t'classes' => array(
\t\t\t'WPHX_Public_Contract' => wphx_206_class_reflection( 'WPHX_Public_Contract' ),
\t\t\t'WPHX_Public_Trait' => wphx_206_class_reflection( 'WPHX_Public_Trait' ),
\t\t\t'WPHX_Public_Base' => wphx_206_class_reflection( 'WPHX_Public_Base' ),
\t\t\t'WPHX_Public_Class' => wphx_206_class_reflection( 'WPHX_Public_Class' ),
\t\t\t'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedContract' => wphx_206_class_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedContract' ),
\t\t\t'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedTrait' => wphx_206_class_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedTrait' ),
\t\t\t'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation' => wphx_206_class_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation' ),
\t\t),
\t\t'methods' => array(
\t\t\t'globalInterfaceDescribe' => wphx_206_method_reflection( 'WPHX_Public_Contract', 'describe' ),
\t\t\t'globalClassConstruct' => wphx_206_method_reflection( 'WPHX_Public_Class', '__construct' ),
\t\t\t'globalClassFactory' => wphx_206_method_reflection( 'WPHX_Public_Class', 'factory' ),
\t\t\t'globalClassDescribe' => wphx_206_method_reflection( 'WPHX_Public_Class', 'describe' ),
\t\t\t'globalTraitLabel' => wphx_206_method_reflection( 'WPHX_Public_Class', 'trait_label' ),
\t\t\t'globalBaseLabel' => wphx_206_method_reflection( 'WPHX_Public_Base', 'base_label' ),
\t\t\t'namespacedInterfaceDescribe' => wphx_206_method_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedContract', 'namespacedDescribe' ),
\t\t\t'namespacedClassConstruct' => wphx_206_method_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation', '__construct' ),
\t\t\t'namespacedClassDescribe' => wphx_206_method_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation', 'namespacedDescribe' ),
\t\t\t'namespacedTraitLabel' => wphx_206_method_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation', 'namespacedTraitLabel' ),
\t\t),
\t\t'properties' => array(
\t\t\t'globalInstances' => wphx_206_property_reflection( 'WPHX_Public_Class', 'instances' ),
\t\t\t'globalName' => wphx_206_property_reflection( 'WPHX_Public_Class', 'name' ),
\t\t\t'globalMeta' => wphx_206_property_reflection( 'WPHX_Public_Class', 'meta' ),
\t\t\t'globalTraitValue' => wphx_206_property_reflection( 'WPHX_Public_Class', 'traitValue' ),
\t\t\t'globalBaseValue' => wphx_206_property_reflection( 'WPHX_Public_Base', 'baseValue' ),
\t\t\t'namespacedInstances' => wphx_206_property_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation', 'instances' ),
\t\t\t'namespacedName' => wphx_206_property_reflection( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation', 'name' ),
\t\t),
\t\t'objectCases' => array(
\t\t\t'globalInstanceOfClass' => $global instanceof WPHX_Public_Class,
\t\t\t'globalInstanceOfBase' => $global instanceof WPHX_Public_Base,
\t\t\t'globalInstanceOfInterface' => $global instanceof WPHX_Public_Contract,
\t\t\t'globalClassUsesTrait' => in_array( 'WPHX_Public_Trait', ( new ReflectionClass( 'WPHX_Public_Class' ) )->getTraitNames(), true ),
\t\t\t'globalDescribe' => $global->describe( 'pre' ),
\t\t\t'globalBaseLabel' => $global->base_label(),
\t\t\t'globalTraitLabel' => $global->trait_label( 'suffix' ),
\t\t\t'globalMetaExisting' => $global->get_meta( 'a', 'fallback' ),
\t\t\t'globalMetaMissing' => $global->get_meta( 'missing', 'fallback' ),
\t\t\t'globalFactoryClass' => get_class( $global_factory ),
\t\t\t'globalFactoryDescribe' => $global_factory->describe(),
\t\t\t'globalStaticInstances' => WPHX_Public_Class::$instances,
\t\t\t'namespacedInstanceOfClass' => $namespaced instanceof WordPress\\WPHX\\Fixture\\NamespacedImplementation,
\t\t\t'namespacedInstanceOfInterface' => $namespaced instanceof WordPress\\WPHX\\Fixture\\NamespacedContract,
\t\t\t'namespacedClassUsesTrait' => in_array( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedTrait', ( new ReflectionClass( 'WordPress\\\\WPHX\\\\Fixture\\\\NamespacedImplementation' ) )->getTraitNames(), true ),
\t\t\t'namespacedDescribe' => $namespaced->namespacedDescribe( 'pre' ),
\t\t\t'namespacedTraitLabel' => $namespaced->namespacedTraitLabel( 'suffix' ),
\t\t\t'namespacedStaticInstances' => WordPress\\WPHX\\Fixture\\NamespacedImplementation::$instances,
\t\t),
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );

  return {
    path: PROBE,
    generated_shell: generatedShell
  };
}

function normalizeProbe(result) {
  return {
    before: result.before,
    afterSecondRequire: result.afterSecondRequire,
    classes: result.classes,
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

function publicTypeCounts(abi) {
  const counts = { class: 0, interface: 0, trait: 0 };
  for (const entry of abi.entries) {
    if (Object.hasOwn(counts, entry.kind)) {
      counts[entry.kind]++;
    }
  }
  return counts;
}

function referenceAbiSymbols(spec, abi) {
  return spec.reference_abi_symbols.map((name) => {
    const entry = abi.entries.find((candidate) => candidate.name === name && ["class", "interface", "trait"].includes(candidate.kind));
    if (!entry) {
      throw new Error(`Missing reference ABI public type: ${name}`);
    }
    return {
      kind: entry.kind,
      name: entry.name,
      namespace: entry.namespace,
      path: entry.path,
      distribution_path: entry.distribution_path,
      signature_hash: entry.signature_hash,
      source_hash: entry.source_hash
    };
  });
}

const spec = readJson(SPEC);
const abi = readJson("manifests/php-abi/wordpress-7.0-core-abi.v1.json");
const lock = readJson("toolchain.lock.json");

rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
const generatedFiles = writeGeneratedShell(spec);
const generatedShell = generatedFiles.find((file) => file.distribution_path === spec.output).path;
writeProbe(spec, generatedShell);

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE);
const localGenerated = runProbe("php", "local-php-cli", "generated", generatedShell);
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
    const generated = runDockerProbe(id, image, "generated", generatedShell);
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
  schema: "wphx.wp-public-type-emitter.v1",
  issue: "WPHX-206",
  generated_at: RECORDED_AT,
  generator: "tools/wp-public-types/run-public-type-emitter.mjs",
  fixture: {
    spec: SPEC,
    hxml: HXML,
    haxe_sources: [
      "fixtures/wp-public-types/src/wphx/fixtures/wp/publictypes/PublicTypeEntry.hx",
      "fixtures/wp-public-types/src/wphx/fixtures/wp/publictypes/PublicTypeKernel.hx"
    ],
    oracle_shell: ORACLE,
    generated_root: GENERATED_ROOT,
    probe: PROBE
  },
  abi_reference: {
    manifest: "manifests/php-abi/wordpress-7.0-core-abi.v1.json",
    public_type_counts: publicTypeCounts(abi),
    symbols: referenceAbiSymbols(spec, abi)
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
    generated_public_files: generatedFiles,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  emission_strategy: {
    php_shell_owns_public_type_identity: true,
    haxe_owns_selected_method_payloads: true,
    supports_global_symbols: true,
    supports_namespaced_symbols: true,
    supports_interfaces: true,
    supports_traits: true,
    supports_classes: true
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    repeated_include_safety: true,
    global_public_type_identity: true,
    namespaced_public_type_identity: true,
    reflection_contract: true,
    trait_contract: true,
    haxe_delegation: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-public-type-emitter-receipt.v1",
  id: "receipt:wphx-206-public-types",
  issue: "WPHX-206",
  recorded_at: RECORDED_AT,
  command: "npm run wp:public-types",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  generated_public_files: generatedFiles.map((file) => file.distribution_path),
  comparison_count: comparisons.length,
  runtime_run_count: runs.length
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
