#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const SPEC = "fixtures/wp-facade/bindings/global-facades.v1.json";
const OUT_ROOT = "build/wp-global-facades";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-facade/wphx-204-global-facades.v1.json";
const RECEIPT = "receipts/wp-facade/wphx-204-global-facades.v1.json";
const RECORDED_AT = "2026-06-20T06:35:00.000Z";

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
      sha256: sha256File(path)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function phpString(value) {
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function normalizeFunctionName(name) {
  return name.startsWith("\\") ? name.slice(1) : name;
}

function functionBasename(name) {
  const normalized = normalizeFunctionName(name);
  const parts = normalized.split("\\");
  return parts[parts.length - 1];
}

function namespaceOf(name) {
  const normalized = normalizeFunctionName(name);
  const parts = normalized.split("\\");
  parts.pop();
  return parts.join("\\");
}

function paramDeclaration(param) {
  return param.source;
}

function paramForward(param) {
  return `$${param.name}`;
}

function callTarget(binding) {
  return `${binding.haxe_class}::${binding.haxe_method}`;
}

function returnLine(binding, call) {
  if (!binding.reference_result) {
    return `\t\treturn ${call};`;
  }

  const target = binding.reference_result.assign_to;
  const returnValue = binding.reference_result.return ?? "null";
  return [
    `\t\t$wphx_204_result = ${call};`,
    `\t\t$${target} = $wphx_204_result;`,
    "",
    `\t\treturn ${returnValue};`
  ].join("\n");
}

function resolveBindings(spec, abi) {
  return spec.bindings.map((binding) => {
    const matches = abi.entries.filter(
      (entry) => entry.kind === "function" && entry.name === binding.name && entry.path === binding.path
    );
    if (matches.length !== 1) {
      throw new Error(`Expected one ABI function for ${binding.name} at ${binding.path}, got ${matches.length}`);
    }
    return {
      ...binding,
      entry: matches[0]
    };
  });
}

function groupByOutput(bindings) {
  const grouped = new Map();
  for (const binding of bindings) {
    const output = join(GENERATED_ROOT, binding.entry.distribution_path);
    if (!grouped.has(output)) {
      grouped.set(output, []);
    }
    grouped.get(output).push(binding);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function bootstrapBlock(spec, outputPath) {
  const distributionDir = dirname(relative(GENERATED_ROOT, outputPath));
  const distributionDepth = distributionDir === "." ? 0 : distributionDir.split("/").length;
  const levelsToBuildRoot = distributionDepth + 1;
  return `if ( ! defined( '${spec.bootstrap_constant}' ) ) {
\tdefine( '${spec.bootstrap_constant}', true );
\t$wphx_204_lib = dirname( __DIR__, ${levelsToBuildRoot} ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_204_lib );
\tspl_autoload_register(
\t\tfunction ( $class ) {
\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\tif ( $file ) {
\t\t\t\tinclude_once $file;
\t\t\t}
\t\t}
\t);
\t\\php\\Boot::__hx__init();
}`;
}

function renderFunction(binding) {
  const entry = binding.entry;
  const namespace = namespaceOf(entry.name);
  const name = functionBasename(entry.name);
  const returnRef = entry.flags?.by_reference_return === true ? "&" : "";
  const params = entry.parameters.map(paramDeclaration).join(", ");
  const forwards = entry.parameters.map(paramForward).join(", ");
  const call = `${callTarget(binding)}( ${forwards} )`;
  const body = returnLine(binding, call);
  const functionBlock = `if ( ! function_exists( ${phpString(entry.name)} ) ) {
\tfunction ${returnRef}${name}( ${params} ) {
${body}
\t}
}`;

  if (!namespace) {
    return functionBlock;
  }

  return `namespace ${namespace} {
${functionBlock.replaceAll("\n", "\n\t")}
}`;
}

function writeGeneratedFacades(spec, bindings) {
  const outputs = [];
  for (const [outputPath, outputBindings] of groupByOutput(bindings)) {
    mkdirSync(dirname(outputPath), { recursive: true });
    const text = ["<?php", "", bootstrapBlock(spec, outputPath), "", ...outputBindings.map(renderFunction)].join("\n\n") + "\n";
    writeFileSync(outputPath, text);
    outputs.push({
      path: outputPath,
      distribution_path: relative(GENERATED_ROOT, outputPath),
      functions: outputBindings.map((binding) => binding.entry.name),
      sha256: sha256File(outputPath)
    });
  }
  return outputs;
}

function projection(binding) {
  const entry = binding.entry;
  return {
    name: entry.name,
    path: entry.path,
    distribution_path: entry.distribution_path,
    declaration_timing: entry.declaration_timing,
    conditional_declaration: entry.conditional_declaration,
    flags: entry.flags,
    parameters: entry.parameters.map((param) => ({
      name: param.name,
      position: param.position,
      source: param.source,
      type: param.type,
      default_source: param.default_source,
      by_reference: param.by_reference,
      variadic: param.variadic
    })),
    return_type: entry.return_type,
    signature_hash: entry.signature_hash,
    source_hash: entry.source_hash,
    haxe_target: callTarget(binding)
  };
}

function writeProbe(generatedFiles, bindings) {
  mkdirSync(dirname(PROBE), { recursive: true });
  const requires = generatedFiles.map((file) => `require ${phpString(file.path)};`).join("\n");
  const expected = JSON.stringify(Object.fromEntries(bindings.map((binding) => [binding.entry.name, projection(binding)])));
  writeFileSync(
    PROBE,
    `<?php

$mode = $argv[1];
$expected = json_decode( '${expected.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}', true );

$before = array();
foreach ( array_keys( $expected ) as $function_name ) {
\t$before[ $function_name ] = function_exists( $function_name );
}

${requires}

$after = array();
$reflections = array();
foreach ( $expected as $function_name => $abi ) {
\t$after[ $function_name ] = function_exists( $function_name );
\t$reflection = new ReflectionFunction( $function_name );
\t$params = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
\t\t$default = null;
\t\tif ( $parameter->isDefaultValueAvailable() ) {
\t\t\t$default = $parameter->getDefaultValue();
\t\t}
\t\t$params[] = array(
\t\t\t'name' => $parameter->getName(),
\t\t\t'position' => $parameter->getPosition(),
\t\t\t'isOptional' => $parameter->isOptional(),
\t\t\t'hasDefault' => $parameter->isDefaultValueAvailable(),
\t\t\t'default' => $default,
\t\t\t'hasType' => $parameter->hasType(),
\t\t\t'type' => $parameter->hasType() ? (string) $parameter->getType() : null,
\t\t\t'isPassedByReference' => $parameter->isPassedByReference(),
\t\t\t'isVariadic' => $parameter->isVariadic(),
\t\t);
\t}
\t$reflections[ $function_name ] = array(
\t\t'name' => $reflection->getName(),
\t\t'numberOfParameters' => $reflection->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $reflection->returnsReference(),
\t\t'hasReturnType' => $reflection->hasReturnType(),
\t\t'returnType' => $reflection->hasReturnType() ? (string) $reflection->getReturnType() : null,
\t\t'parameters' => $params,
\t);
}

$call_return = add_filter( 'the_content', function ( $value ) { return $value; }, 10, 1 );
$filtered = apply_filters( 'the_content', 'hello', 'extra-one', 'extra-two' );
$array = array( 'existing' => true );
$array_set_return = _wp_array_set( $array, array( 'theme', 'spacing' ), 'tight' );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'after' => $after,
\t\t'expected' => $expected,
\t\t'reflections' => $reflections,
\t\t'calls' => array(
\t\t\t'addFilterReturn' => $call_return,
\t\t\t'applyFiltersReturn' => $filtered,
\t\t\t'arraySetReturn' => $array_set_return,
\t\t\t'arrayAfterSet' => $array,
\t\t\t'snapshot' => json_decode( \\wphx\\fixtures\\wp\\facade\\GlobalKernel::snapshotJson(), true ),
\t\t),
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function expectedDefaults(parameters) {
  return parameters
    .filter((param) => param.default_source != null)
    .map((param) => ({
      name: param.name,
      default_source: param.default_source
    }));
}

function compareReflectionToAbi(result) {
  const mismatches = [];
  for (const [name, abi] of Object.entries(result.expected)) {
    const reflection = result.reflections[name];
    if (!reflection) {
      mismatches.push(`${name}: missing reflection`);
      continue;
    }
    if (reflection.name !== name) mismatches.push(`${name}: reflected name ${reflection.name}`);
    if (reflection.returnsReference !== (abi.flags.by_reference_return === true)) {
      mismatches.push(`${name}: by-reference return mismatch`);
    }
    if (reflection.parameters.length !== abi.parameters.length) {
      mismatches.push(`${name}: parameter count mismatch`);
      continue;
    }
    for (const abiParam of abi.parameters) {
      const actual = reflection.parameters[abiParam.position];
      if (actual.name !== abiParam.name) mismatches.push(`${name}: parameter ${abiParam.position} name mismatch`);
      if (actual.isPassedByReference !== abiParam.by_reference) {
        mismatches.push(`${name}: parameter ${abiParam.name} reference mismatch`);
      }
      if (actual.isVariadic !== abiParam.variadic) {
        mismatches.push(`${name}: parameter ${abiParam.name} variadic mismatch`);
      }
      const hasDefault = abiParam.default_source != null;
      if (actual.hasDefault !== hasDefault) {
        mismatches.push(`${name}: parameter ${abiParam.name} default presence mismatch`);
      }
    }
  }
  return mismatches;
}

function runProbe(commandPath, label) {
  const output = command(commandPath, [PROBE, label]);
  const result = JSON.parse(output);
  const mismatches = compareReflectionToAbi(result);
  return {
    id: label,
    command: `${commandPath} ${PROBE} ${label}`,
    result,
    reflection_matches_abi: mismatches.length === 0,
    mismatches
  };
}

function runDockerProbe(id, image) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, id]);
  const result = JSON.parse(output);
  const mismatches = compareReflectionToAbi(result);
  return {
    id,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${id}`,
    image,
    result,
    reflection_matches_abi: mismatches.length === 0,
    mismatches
  };
}

const spec = readJson(SPEC);
const abi = readJson(spec.abi_manifest);
const lock = readJson("toolchain.lock.json");
if (spec.schema !== "wphx.wp-global-facade-bindings.v1") {
  throw new Error(`Unexpected binding schema ${spec.schema}`);
}
if (abi.schema !== "wphx.php-abi-manifest.v1") {
  throw new Error(`Unexpected ABI schema ${abi.schema}`);
}

rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [spec.hxml]);
const bindings = resolveBindings(spec, abi);
const generatedFiles = writeGeneratedFacades(spec, bindings);
writeProbe(generatedFiles, bindings);

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runtimeRuns = [runProbe("php", "local-php-cli")];
if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    runtimeRuns.push(runDockerProbe(id, image));
  }
}

const failures = runtimeRuns.filter((run) => !run.reflection_matches_abi);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

const abiProjection = bindings.map(projection);
const manifest = {
  schema: "wphx.wp-global-facades.v1",
  issue: "WPHX-204",
  generated_at: RECORDED_AT,
  generator: "tools/wp-facade/run-global-facade-generator.mjs",
  binding_spec: SPEC,
  abi_manifest: spec.abi_manifest,
  fixture: {
    hxml: spec.hxml,
    haxe_sources: [
      "fixtures/wp-facade/src/wphx/fixtures/wp/facade/GlobalFacadeEntry.hx",
      "fixtures/wp-facade/src/wphx/fixtures/wp/facade/GlobalBindings.hx",
      "fixtures/wp-facade/src/wphx/fixtures/wp/facade/GlobalKernel.hx"
    ],
    probe: PROBE
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    command: `haxe ${spec.hxml}`,
    haxe_output_dir: HAXE_OUT,
    generated_file_count: filesUnder(HAXE_OUT).length,
    generated_files: filesUnder(HAXE_OUT),
    facade_files: generatedFiles,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    }
  },
  abi_projection: abiProjection,
  runtime_runs: runtimeRuns,
  generator_contract: {
    source_of_truth: "WordPress PHP ABI manifest",
    typed_binding_validation: "@:wp.global metadata is compiled before facade generation",
    signature_strategy: "PHP wrapper signatures are rendered from ABI parameter source records; Haxe remains behind the wrapper.",
    reference_strategy: "By-reference public parameters stay in the PHP wrapper, with configured reference assignment after Haxe returns a transformed value."
  },
  validation_result: {
    status: "passed",
    binding_count: bindings.length,
    facade_file_count: generatedFiles.length,
    runtime_run_count: runtimeRuns.length,
    reflection_matches_abi: true,
    default_parameters: abiProjection.flatMap((entry) => expectedDefaults(entry.parameters)),
    variadic_parameters: abiProjection.flatMap((entry) => entry.parameters.filter((param) => param.variadic).map((param) => `${entry.name}:${param.name}`)),
    reference_parameters: abiProjection.flatMap((entry) => entry.parameters.filter((param) => param.by_reference).map((param) => `${entry.name}:${param.name}`))
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-global-facades-receipt.v1",
  id: "receipt:wphx-204-global-facades",
  issue: "WPHX-204",
  recorded_at: RECORDED_AT,
  command: "npm run wp:facade:globals",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  binding_count: bindings.length,
  facade_file_count: generatedFiles.length,
  runtime_run_count: runtimeRuns.length,
  generated_distribution_paths: generatedFiles.map((file) => file.distribution_path)
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, binding_count: bindings.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, binding_count: bindings.length }, null, 2));
