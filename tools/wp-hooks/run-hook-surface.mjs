#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const F7_MANIFEST = "manifests/php-facade/wphx-108-f7-hook-kernel.v1.json";
const OUT_ROOT = "build/wp-hooks";
const PROBE = `${OUT_ROOT}/hook-surface-probe.php`;
const EXPECTED = `${OUT_ROOT}/expected-hook-surface.json`;
const ORACLE_PLUGIN = "build/php-hook-kernel/oracle/wp-includes/plugin.php";
const GENERATED_PLUGIN = "build/php-hook-kernel/generated/wp-includes/plugin.php";
const OUT = "manifests/wp-hooks/wphx-302-hook-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-302-hooks-workset.v1.json";
const RECEIPT = "receipts/wp-hooks/wphx-302-hook-surface.v1.json";
const RECORDED_AT = "2026-06-20T21:35:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_UNITS = ["src/wp-includes/plugin.php", "src/wp-includes/class-wp-hook.php"];

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

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function sourcePath(unit) {
  return `../wordpress-develop/${unit}`;
}

function sourceRecord(unit) {
  const path = sourcePath(unit);
  return {
    unit,
    repo_path: path,
    bytes: Buffer.byteLength(readFileSync(path)),
    sha256: `sha256:${sha256File(path)}`
  };
}

function symbolId(entry) {
  return `${entry.kind}:${entry.qualified_name ?? entry.name}`;
}

function expectedEntry(entry) {
  return {
    symbol_id: symbolId(entry),
    kind: entry.kind,
    name: entry.name,
    local_name: entry.local_name,
    qualified_name: entry.qualified_name,
    class_name: entry.class_name ?? null,
    visibility: entry.flags?.visibility ?? null,
    static: entry.flags?.static ?? false,
    final: entry.flags?.final ?? false,
    abstract: entry.flags?.abstract ?? false,
    parameters: (entry.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      position: parameter.position,
      default_source: parameter.default_source,
      by_reference: parameter.by_reference,
      variadic: parameter.variadic
    })),
    location: entry.location,
    signature_hash: entry.signature_hash
  };
}

function expectedSurface() {
  const abi = readJson(ABI);
  const paths = new Set(SOURCE_UNITS);
  return abi.entries
    .filter((entry) => paths.has(entry.path))
    .filter((entry) => ["function", "class", "method", "property"].includes(entry.kind))
    .map(expectedEntry)
    .sort((a, b) => a.symbol_id.localeCompare(b.symbol_id));
}

function writeExpected(expected) {
  writeFile(EXPECTED, JSON.stringify({ entries: expected }, null, 2) + "\n");
}

function writeProbe() {
  writeFile(
    PROBE,
    `<?php

$plugin = $argv[1];
$expected_path = $argv[2];
$expected = json_decode( file_get_contents( $expected_path ), true );

define( 'WP_PLUGIN_DIR', '/tmp/wphx-302/wp-content/plugins' );
define( 'WPMU_PLUGIN_DIR', '/tmp/wphx-302/wp-content/mu-plugins' );
define( 'WP_PLUGIN_URL', 'https://example.test/wp-content/plugins' );

$GLOBALS['wphx_302_options'] = array();
$GLOBALS['wphx_302_deprecated'] = array();
$GLOBALS['wphx_302_wrong'] = array();
$GLOBALS['wphx_302_trace'] = array();
$GLOBALS['wp_plugin_paths'] = array();

function wp_normalize_path( $path ) {
\treturn str_replace( '\\\\', '/', $path );
}

function trailingslashit( $value ) {
\treturn rtrim( $value, '/\\\\' ) . '/';
}

function plugins_url( $path = '', $plugin = '' ) {
\t$base = WP_PLUGIN_URL;
\tif ( '' !== $plugin ) {
\t\t$basename = plugin_basename( $plugin );
\t\t$dir = dirname( $basename );
\t\tif ( '.' !== $dir && '' !== $dir ) {
\t\t\t$base .= '/' . trim( $dir, '/' );
\t\t}
\t}
\tif ( '' !== $path ) {
\t\t$base .= '/' . ltrim( $path, '/' );
\t}
\treturn $base;
}

function _deprecated_hook( $hook_name, $version, $replacement = '', $message = '' ) {
\t$GLOBALS['wphx_302_deprecated'][] = array(
\t\t'hook' => $hook_name,
\t\t'version' => $version,
\t\t'replacement' => $replacement,
\t\t'message' => $message,
\t);
}

function __( $text ) {
\treturn $text;
}

function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_302_wrong'][] = array(
\t\t'function' => $function_name,
\t\t'message' => $message,
\t\t'version' => $version,
\t);
}

function get_option( $name, $default = false ) {
\treturn array_key_exists( $name, $GLOBALS['wphx_302_options'] ) ? $GLOBALS['wphx_302_options'][ $name ] : $default;
}

function update_option( $name, $value ) {
\t$GLOBALS['wphx_302_options'][ $name ] = $value;
\treturn true;
}

function wphx_302_param( ReflectionParameter $parameter ) {
\treturn array(
\t\t'name' => $parameter->getName(),
\t\t'position' => $parameter->getPosition(),
\t\t'isOptional' => $parameter->isOptional(),
\t\t'hasDefault' => $parameter->isDefaultValueAvailable(),
\t\t'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
\t\t'isPassedByReference' => $parameter->isPassedByReference(),
\t\t'isVariadic' => $parameter->isVariadic(),
\t\t'hasType' => $parameter->hasType(),
\t\t'type' => $parameter->hasType() ? (string) $parameter->getType() : null,
\t);
}

function wphx_302_callable_surface( $reflection ) {
\t$params = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
\t\t$params[] = wphx_302_param( $parameter );
\t}
\treturn array(
\t\t'numberOfParameters' => $reflection->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $reflection->returnsReference(),
\t\t'hasReturnType' => $reflection->hasReturnType(),
\t\t'returnType' => $reflection->hasReturnType() ? (string) $reflection->getReturnType() : null,
\t\t'parameters' => $params,
\t);
}

function wphx_302_visibility( $reflection ) {
\tif ( $reflection->isPublic() ) {
\t\treturn 'public';
\t}
\tif ( $reflection->isProtected() ) {
\t\treturn 'protected';
\t}
\treturn 'private';
}

function wphx_302_symbol_surface( $entry ) {
\t$surface = array(
\t\t'symbol_id' => $entry['symbol_id'],
\t\t'kind' => $entry['kind'],
\t\t'exists' => true,
\t);

\ttry {
\t\tif ( 'function' === $entry['kind'] ) {
\t\t\t$reflection = new ReflectionFunction( $entry['local_name'] );
\t\t\treturn array_merge( $surface, wphx_302_callable_surface( $reflection ) );
\t\t}
\t\tif ( 'class' === $entry['kind'] ) {
\t\t\t$reflection = new ReflectionClass( $entry['local_name'] );
\t\t\treturn array_merge(
\t\t\t\t$surface,
\t\t\t\tarray(
\t\t\t\t\t'name' => $reflection->getName(),
\t\t\t\t\t'isFinal' => $reflection->isFinal(),
\t\t\t\t\t'isAbstract' => $reflection->isAbstract(),
\t\t\t\t\t'interfaceNames' => $reflection->getInterfaceNames(),
\t\t\t\t)
\t\t\t);
\t\t}
\t\tif ( 'method' === $entry['kind'] ) {
\t\t\t$reflection = ( new ReflectionClass( $entry['class_name'] ) )->getMethod( $entry['local_name'] );
\t\t\treturn array_merge(
\t\t\t\t$surface,
\t\t\t\twphx_302_callable_surface( $reflection ),
\t\t\t\tarray(
\t\t\t\t\t'visibility' => wphx_302_visibility( $reflection ),
\t\t\t\t\t'isStatic' => $reflection->isStatic(),
\t\t\t\t\t'isFinal' => $reflection->isFinal(),
\t\t\t\t)
\t\t\t);
\t\t}
\t\tif ( 'property' === $entry['kind'] ) {
\t\t\t$reflection = ( new ReflectionClass( $entry['class_name'] ) )->getProperty( $entry['local_name'] );
\t\t\treturn array_merge(
\t\t\t\t$surface,
\t\t\t\tarray(
\t\t\t\t\t'visibility' => wphx_302_visibility( $reflection ),
\t\t\t\t\t'isStatic' => $reflection->isStatic(),
\t\t\t\t\t'hasType' => $reflection->hasType(),
\t\t\t\t\t'type' => $reflection->hasType() ? (string) $reflection->getType() : null,
\t\t\t\t)
\t\t\t);
\t\t}
\t} catch ( Throwable $error ) {
\t\t$surface['exists'] = false;
\t\t$surface['error'] = $error->getMessage();
\t\treturn $surface;
\t}

\t$surface['exists'] = false;
\t$surface['error'] = 'unsupported symbol kind';
\treturn $surface;
}

function wphx_302_record( $event, $value ) {
\t$GLOBALS['wphx_302_trace'][] = array(
\t\t'event' => $event,
\t\t'value' => $value,
\t\t'current_filter' => current_filter(),
\t\t'current_action' => current_action(),
\t\t'doing_filter' => doing_filter(),
\t\t'doing_action' => doing_action(),
\t);
}

function wphx_302_filter( $value, $suffix ) {
\twphx_302_record( 'filter', $value . ':' . $suffix );
\treturn $value . '|filter-' . $suffix;
}

function wphx_302_action( $value ) {
\twphx_302_record( 'action', $value );
}

function wphx_302_activation() {
\twphx_302_record( 'activation', 'run' );
}

function wphx_302_deactivation() {
\twphx_302_record( 'deactivation', 'run' );
}

function wphx_302_uninstall() {
\twphx_302_record( 'uninstall', 'run' );
}

@mkdir( WP_PLUGIN_DIR . '/sample', 0777, true );
@mkdir( WPMU_PLUGIN_DIR, 0777, true );
$plugin_file = WP_PLUGIN_DIR . '/sample/sample.php';
file_put_contents( $plugin_file, "<?php\\n" );

require $plugin;

$surface = array();
foreach ( $expected['entries'] as $entry ) {
\t$surface[] = wphx_302_symbol_surface( $entry );
}

add_filter( 'wphx302/filter', 'wphx_302_filter', 10, 2 );
$deprecated_filter_result = apply_filters_deprecated( 'wphx302/filter', array( 'seed', 'x' ), '1.0.0', 'wphx302/filter_new', 'filter moved' );
$missing_deprecated_result = apply_filters_deprecated( 'wphx302/missing_filter', array( 'missing' ), '1.0.0', 'wphx302/missing_new', 'missing moved' );
$remove_all_filter_result = remove_all_filters( 'wphx302/filter' );
$has_filter_after_remove_all = has_filter( 'wphx302/filter' );

add_action( 'wphx302/action', 'wphx_302_action', 10, 1 );
do_action_ref_array( 'wphx302/action', array( 'ref-run' ) );
do_action_deprecated( 'wphx302/action', array( 'deprecated-run' ), '1.0.0', 'wphx302/action_new', 'action moved' );
$did_action_count = did_action( 'wphx302/action' );
$remove_all_action_result = remove_all_actions( 'wphx302/action' );
$has_action_after_remove_all = has_action( 'wphx302/action' );

$basename = plugin_basename( $plugin_file );
$registered_realpath = wp_register_plugin_realpath( $plugin_file );
$dir_path = plugin_dir_path( $plugin_file );
$dir_url = plugin_dir_url( $plugin_file );

register_activation_hook( $plugin_file, 'wphx_302_activation' );
register_deactivation_hook( $plugin_file, 'wphx_302_deactivation' );
$activation_hook = 'activate_' . plugin_basename( $plugin_file );
$deactivation_hook = 'deactivate_' . plugin_basename( $plugin_file );
$has_activation = has_action( $activation_hook, 'wphx_302_activation' );
$has_deactivation = has_action( $deactivation_hook, 'wphx_302_deactivation' );
do_action( $activation_hook );
do_action( $deactivation_hook );

register_uninstall_hook( $plugin_file, 'wphx_302_uninstall' );
$uninstall_options = get_option( 'uninstall_plugins' );

echo json_encode(
\tarray(
\t\t'surface' => $surface,
\t\t'behavior' => array(
\t\t\t'deprecatedFilterResult' => $deprecated_filter_result,
\t\t\t'missingDeprecatedResult' => $missing_deprecated_result,
\t\t\t'removeAllFilterResult' => $remove_all_filter_result,
\t\t\t'hasFilterAfterRemoveAll' => $has_filter_after_remove_all,
\t\t\t'didActionCount' => $did_action_count,
\t\t\t'removeAllActionResult' => $remove_all_action_result,
\t\t\t'hasActionAfterRemoveAll' => $has_action_after_remove_all,
\t\t\t'pluginBasename' => $basename,
\t\t\t'registeredRealpath' => $registered_realpath,
\t\t\t'pluginDirPath' => $dir_path,
\t\t\t'pluginDirUrl' => $dir_url,
\t\t\t'activationHook' => $activation_hook,
\t\t\t'deactivationHook' => $deactivation_hook,
\t\t\t'hasActivation' => $has_activation,
\t\t\t'hasDeactivation' => $has_deactivation,
\t\t\t'uninstallOptions' => $uninstall_options,
\t\t\t'deprecatedNotices' => $GLOBALS['wphx_302_deprecated'],
\t\t\t'doingItWrong' => $GLOBALS['wphx_302_wrong'],
\t\t\t'trace' => $GLOBALS['wphx_302_trace'],
\t\t),
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(commandPath, label, plugin) {
  const output = command(commandPath, [PROBE, plugin, EXPECTED]);
  return {
    id: label,
    runtime: label,
    command: `${commandPath} ${PROBE} ${plugin} ${EXPECTED}`,
    plugin,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, plugin) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, plugin, EXPECTED]);
  return {
    id,
    runtime: id,
    image,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${plugin} ${EXPECTED}`,
    plugin,
    result: JSON.parse(output)
  };
}

function normalize(result) {
  return {
    surface: result.surface,
    behavior: result.behavior
  };
}

function compareRun(oracleRun, generatedRun) {
  const oracle = normalize(oracleRun.result);
  const generated = normalize(generatedRun.result);
  return {
    id: oracleRun.id,
    matches: JSON.stringify(oracle) === JSON.stringify(generated),
    oracle,
    generated
  };
}

function bySymbol(surface) {
  return new Map(surface.map((symbol) => [symbol.symbol_id, symbol]));
}

function validateSurface(expected, generatedSurface) {
  const errors = [];
  const actualBySymbol = bySymbol(generatedSurface);

  for (const entry of expected) {
    const actual = actualBySymbol.get(entry.symbol_id);
    if (!actual) {
      errors.push(`${entry.symbol_id}: missing from probe output`);
      continue;
    }
    if (!actual.exists) {
      errors.push(`${entry.symbol_id}: ${actual.error ?? "symbol does not exist"}`);
      continue;
    }

    if (entry.kind === "class") {
      if (actual.isFinal !== entry.final) errors.push(`${entry.symbol_id}: final flag mismatch`);
      if (actual.isAbstract !== entry.abstract) errors.push(`${entry.symbol_id}: abstract flag mismatch`);
      continue;
    }

    if (entry.kind === "property") {
      if (actual.visibility !== entry.visibility) errors.push(`${entry.symbol_id}: visibility mismatch`);
      if (actual.isStatic !== entry.static) errors.push(`${entry.symbol_id}: static flag mismatch`);
      continue;
    }

    if (entry.kind === "method") {
      if (actual.visibility !== entry.visibility) errors.push(`${entry.symbol_id}: visibility mismatch`);
      if (actual.isStatic !== entry.static) errors.push(`${entry.symbol_id}: static flag mismatch`);
      if (actual.isFinal !== entry.final) errors.push(`${entry.symbol_id}: final flag mismatch`);
    }

    const actualParams = actual.parameters ?? [];
    if (actualParams.length !== entry.parameters.length) {
      errors.push(`${entry.symbol_id}: parameter count mismatch`);
      continue;
    }

    for (const expectedParam of entry.parameters) {
      const actualParam = actualParams[expectedParam.position];
      if (!actualParam) {
        errors.push(`${entry.symbol_id}: missing parameter ${expectedParam.name}`);
        continue;
      }
      if (actualParam.name !== expectedParam.name) errors.push(`${entry.symbol_id}: parameter ${expectedParam.position} name mismatch`);
      if (actualParam.isPassedByReference !== expectedParam.by_reference) errors.push(`${entry.symbol_id}: parameter ${expectedParam.name} by-reference mismatch`);
      if (actualParam.isVariadic !== expectedParam.variadic) errors.push(`${entry.symbol_id}: parameter ${expectedParam.name} variadic mismatch`);
      if (actualParam.hasDefault !== (expectedParam.default_source != null)) errors.push(`${entry.symbol_id}: parameter ${expectedParam.name} default mismatch`);
    }
  }

  return errors;
}

function coverage(expected, generatedSurface) {
  const actualBySymbol = bySymbol(generatedSurface);
  const covered = expected.filter((entry) => actualBySymbol.get(entry.symbol_id)?.exists);
  const missing = expected.filter((entry) => !actualBySymbol.get(entry.symbol_id)?.exists);
  return {
    total: expected.length,
    covered: covered.length,
    missing: missing.map((entry) => entry.symbol_id),
    coverage_ratio: expected.length === 0 ? 1 : covered.length / expected.length
  };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp/hooks-workset",
    issue: {
      id: "wordpresshx-l76.2",
      external_ref: "WPHX-302"
    },
    unit: {
      kind: "workset",
      name: "hooks/plugin-api",
      area: "wp-includes",
      public_contract: "plugin.php and class-wp-hook.php hook/plugin API surface plus fixture plugin behavior"
    },
    ownership_state: "verified_haxe_owned",
    upstream: {
      repo: "../wordpress-develop",
      ref: WP_REF,
      paths: SOURCE_UNITS,
      digest: upstreamDigest
    },
    owned_paths: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx",
      "fixtures/php-facade/f7-hook-kernel.hxml",
      "tools/php-facade/run-f7-hook-kernel.mjs",
      "tools/wp-hooks/run-hook-surface.mjs"
    ],
    generated_paths: [
      "build/php-hook-kernel",
      "build/wp-hooks/hook-surface-probe.php",
      "build/wp-hooks/expected-hook-surface.json"
    ],
    verification: {
      oracle_commands: [
        "npm run php:facade:f7",
        "npm run wp:hooks:surface",
        "npm run wp:hooks:surface:check",
        "npm run wp:hooks:distribution-surface:check"
      ],
      receipt_refs: [
        "receipt:wphx-302-hook-surface",
        "receipt:wphx-306-hook-distribution-surface"
      ],
      manifest_digest: manifestSha
    },
    notes: "WPHX-302 records complete API surface coverage and fixture plugin parity for the hook workset. WPHX-306 promotes the surface to verified Haxe-owned distribution output with approved PHP-native public ABI boundaries."
  };
}

const expected = expectedSurface();
rmSync(OUT_ROOT, { recursive: true, force: true });
command("node", ["tools/php-facade/run-f7-hook-kernel.mjs", ...(checkOnly ? ["--check"] : [])]);
writeExpected(expected);
writeProbe();

const abiManifestText = readFileSync(ABI, "utf8");
const f7ManifestText = readFileSync(F7_MANIFEST, "utf8");
const lock = readJson("toolchain.lock.json");
const sourceUnits = SOURCE_UNITS.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ unit: unit.unit, sha256: unit.sha256 }))));
const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);

const runs = [];
const comparisons = [];

const localOracle = runProbe("php", "local-php-cli", ORACLE_PLUGIN);
const localGenerated = runProbe("php", "local-php-cli", GENERATED_PLUGIN);
runs.push({ ...localOracle, mode: "oracle" }, { ...localGenerated, mode: "generated" });
comparisons.push(compareRun(localOracle, localGenerated));

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    const oracle = runDockerProbe(id, image, ORACLE_PLUGIN);
    const generated = runDockerProbe(id, image, GENERATED_PLUGIN);
    runs.push({ ...oracle, mode: "oracle" }, { ...generated, mode: "generated" });
    comparisons.push(compareRun(oracle, generated));
  }
}

const generatedSurface = localGenerated.result.surface;
const surfaceErrors = validateSurface(expected, generatedSurface);
const failedComparisons = comparisons.filter((comparison) => !comparison.matches);
if (surfaceErrors.length > 0 || failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", surfaceErrors, failedComparisons }, null, 2));
  process.exit(1);
}

const surfaceCoverage = coverage(expected, generatedSurface);
const manifest = {
  schema: "wphx.wp-hook-surface.v1",
  issue: "WPHX-302",
  generated_at: RECORDED_AT,
  generator: "tools/wp-hooks/run-hook-surface.mjs",
  inputs: {
    abi_manifest: ABI,
    abi_manifest_sha256: sha256(abiManifestText),
    f7_manifest: F7_MANIFEST,
    f7_manifest_sha256: sha256(f7ManifestText),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  expected_surface: expected,
  fixture: {
    f7_hxml: "fixtures/php-facade/f7-hook-kernel.hxml",
    generated_oracle_plugin: ORACLE_PLUGIN,
    generated_plugin: GENERATED_PLUGIN,
    expected_surface_json: EXPECTED,
    probe: {
      path: PROBE,
      sha256: `sha256:${sha256File(PROBE)}`
    }
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    generated_hook_files: filesUnder("build/php-hook-kernel/generated"),
    oracle_hook_files: filesUnder("build/php-hook-kernel/oracle"),
    wp_hooks_files: filesUnder(OUT_ROOT)
  },
  runtime_runs: runs,
  comparisons,
  coverage: surfaceCoverage,
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    expected_symbol_count: expected.length,
    covered_symbol_count: surfaceCoverage.covered,
    missing_symbol_count: surfaceCoverage.missing.length,
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    abi_surface_complete: surfaceCoverage.missing.length === 0,
    oracle_behavior_matches_generated: failedComparisons.length === 0,
    temporary_bridge_recorded: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-hook-surface-receipt.v1",
  id: "receipt:wphx-302-hook-surface",
  issue: "WPHX-302",
  recorded_at: RECORDED_AT,
  command: "npm run wp:hooks:surface",
  status: "passed",
  manifest: OUT,
  manifest_sha256: manifestSha,
  ownership_manifest: OWNERSHIP,
  ownership_manifest_sha256: sha256(ownershipText),
  expected_symbol_count: expected.length,
  covered_symbol_count: surfaceCoverage.covered,
  runtime_run_count: runs.length,
  comparison_count: comparisons.length,
  upstream_digest: upstreamDigest
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [OWNERSHIP, ownershipText],
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, covered_symbol_count: surfaceCoverage.covered }, null, 2));
  process.exit(0);
}

writeFile(OUT, manifestText);
writeFile(OWNERSHIP, ownershipText);
writeFile(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, covered_symbol_count: surfaceCoverage.covered }, null, 2));
