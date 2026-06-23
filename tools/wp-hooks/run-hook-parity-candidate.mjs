#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/wp-hooks/hooks-parity-candidate.hxml";
const OUT_ROOT = "build/wp-hooks-candidate";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const HAXE_PROBE = `${OUT_ROOT}/haxe-probe.php`;
const ORACLE_PROBE = `${OUT_ROOT}/oracle-probe.php`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const ORACLE_PLUGIN = `${ORACLE_ROOT}/wp-includes/plugin.php`;
const OUT = "manifests/wp-hooks/wphx-302-01-hook-parity-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-302-01-hooks-decision-model.v1.json";
const RECEIPT = "receipts/wp-hooks/wphx-302-01-hook-parity-candidate.v1.json";
const RECORDED_AT = "2026-06-20T22:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_UNITS = ["src/wp-includes/plugin.php", "src/wp-includes/class-wp-hook.php"];
const HAXE_SOURCES = [
  HXML,
  "fixtures/wp-hooks/src/wphx/fixtures/wp/hooks/HookCandidateEntry.hx",
  "fixtures/wp-hooks/src/wphx/fixtures/wp/hooks/HookCandidateKernel.hx"
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

function phpVersionFamily(value = command("php", ["-r", "echo PHP_VERSION;"])) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
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

function inputRecord(path) {
  return {
    path,
    bytes: Buffer.byteLength(readFileSync(path)),
    sha256: `sha256:${sha256File(path)}`
  };
}

function writeHaxeProbe() {
  writeFile(
    HAXE_PROBE,
    `<?php

$wphx_302_01_lib = __DIR__ . '/haxe/lib';
set_include_path( get_include_path() . PATH_SEPARATOR . $wphx_302_01_lib );
spl_autoload_register(
\tfunction ( $class ) {
\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\tif ( $file ) {
\t\t\tinclude_once $file;
\t\t}
\t}
);
\\php\\Boot::__hx__init();
echo \\wphx\\fixtures\\wp\\hooks\\HookCandidateKernel::snapshotJson();
`
  );
}

function copyOracle() {
  for (const unit of SOURCE_UNITS) {
    const target = `${ORACLE_ROOT}/${unit.replace(/^src\//, "")}`;
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(sourcePath(unit), target);
  }
}

function writeOracleProbe() {
  writeFile(
    ORACLE_PROBE,
    `<?php

$plugin = $argv[1];

define( 'WP_PLUGIN_DIR', '/tmp/wphx-302-01/wp-content/plugins' );
define( 'WPMU_PLUGIN_DIR', '/tmp/wphx-302-01/wp-content/mu-plugins' );
define( 'WP_PLUGIN_URL', 'https://example.test/wp-content/plugins' );

$GLOBALS['wphx_302_01_options'] = array();
$GLOBALS['wphx_302_01_wrong'] = array();
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
\t\t$dir      = dirname( $basename );
\t\tif ( '.' !== $dir && '' !== $dir ) {
\t\t\t$base .= '/' . trim( $dir, '/' );
\t\t}
\t}
\tif ( '' !== $path ) {
\t\t$base .= '/' . ltrim( $path, '/' );
\t}
\treturn $base;
}

function __( $text ) {
\treturn $text;
}

function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_302_01_wrong'][] = array(
\t\t'function' => $function_name,
\t\t'message'  => $message,
\t\t'version'  => $version,
\t);
}

function get_option( $name, $default = false ) {
\treturn array_key_exists( $name, $GLOBALS['wphx_302_01_options'] ) ? $GLOBALS['wphx_302_01_options'][ $name ] : $default;
}

function update_option( $name, $value ) {
\t$GLOBALS['wphx_302_01_options'][ $name ] = $value;
\treturn true;
}

require $plugin;

function wphx_302_01_high( $value = '' ) {
\treturn $value;
}

function wphx_302_01_low( $value = '' ) {
\treturn $value;
}

function wphx_302_01_middle( $value = '', $extra = '' ) {
\treturn $value;
}

function wphx_302_01_callback_id( $function_name ) {
\t$ids = array(
\t\t'wphx_302_01_high'   => 'high',
\t\t'wphx_302_01_low'    => 'low',
\t\t'wphx_302_01_middle' => 'middle',
\t);
\treturn $ids[ $function_name ] ?? $function_name;
}

function wphx_302_01_hook_order( WP_Hook $hook ) {
\t$order = array();
\tforeach ( $hook->callbacks as $callbacks ) {
\t\tforeach ( $callbacks as $callback ) {
\t\t\t$order[] = wphx_302_01_callback_id( $callback['function'] );
\t\t}
\t}
\treturn $order;
}

function wphx_302_01_accepted_arg_counts( WP_Hook $hook ) {
\t$counts = array();
\tforeach ( $hook->callbacks as $callbacks ) {
\t\tforeach ( $callbacks as $callback ) {
\t\t\t$counts[] = $callback['accepted_args'];
\t\t}
\t}
\treturn $counts;
}

function wphx_302_01_priority_keys( WP_Hook $hook ) {
\treturn array_map( 'intval', array_keys( $hook->callbacks ) );
}

$priority_hook = new WP_Hook();
$priority_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_high', 20, 1 );
$priority_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_low', 5, 1 );
$priority_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_middle', 10, 2 );

$remove_hook = new WP_Hook();
$remove_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_high', 20, 1 );
$remove_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_low', 5, 1 );
$remove_hook->add_filter( 'wphx30201/manual', 'wphx_302_01_middle', 10, 2 );
$remove_hook->remove_all_filters( 10 );

$null_priority_hook = new WP_Hook();
$null_priority_hook->add_filter( 'wphx30201/null', 'wphx_302_01_low', null, 1 );
$default_priority = ( new ReflectionFunction( 'add_filter' ) )->getParameters()[2]->getDefaultValue();

$stack_snapshot = array();
add_action(
\t'inner_action',
\tfunction () use ( &$stack_snapshot ) {
\t\tif ( $stack_snapshot ) {
\t\t\treturn;
\t\t}
\t\t$stack_snapshot = array(
\t\t\t'currentFilter'          => current_filter(),
\t\t\t'doingAny'              => doing_filter(),
\t\t\t'doingOuter'            => doing_filter( 'outer_filter' ),
\t\t\t'doingMissing'          => doing_filter( 'missing' ),
\t\t);
\t},
\t10,
\t0
);
add_filter(
\t'outer_filter',
\tfunction ( $value ) {
\t\tdo_action( 'inner_action' );
\t\treturn $value;
\t},
\t10,
\t1
);
apply_filters( 'outer_filter', 'seed' );
$stack_snapshot['filterCountAfterFirst'] = did_filter( 'outer_filter' );
$stack_snapshot['actionCountAfterFirst'] = did_action( 'inner_action' );
apply_filters( 'outer_filter', 'seed' );
$stack_snapshot['filterCountAfterSecond'] = did_filter( 'outer_filter' );

$GLOBALS['wphx_302_01_dispatch_counts'] = array();
function wphx_302_01_dispatch_no_args() {
\t$GLOBALS['wphx_302_01_dispatch_counts']['noArgsAccepted'] = func_num_args();
\treturn 'no-args';
}
function wphx_302_01_dispatch_limited( $value, $extra = null ) {
\t$GLOBALS['wphx_302_01_dispatch_counts']['limitedArgsAccepted'] = func_num_args();
\treturn $value;
}
function wphx_302_01_dispatch_all( $value, $extra = null, $third = null ) {
\t$GLOBALS['wphx_302_01_dispatch_counts']['allArgsAccepted'] = func_num_args();
\treturn $value;
}

$dispatch_hook = new WP_Hook();
$dispatch_hook->add_filter( 'wphx30201/dispatch', 'wphx_302_01_dispatch_no_args', 5, 0 );
$dispatch_hook->add_filter( 'wphx30201/dispatch', 'wphx_302_01_dispatch_limited', 10, 2 );
$dispatch_hook->add_filter( 'wphx30201/dispatch', 'wphx_302_01_dispatch_all', 20, 5 );
$dispatch_hook->apply_filters( 'seed', array( 'seed', 'extra', 'third' ) );

$GLOBALS['wphx_302_01_write'] = array();
function wphx_302_01_filter_write_first( $value ) {
\treturn 'changed';
}
function wphx_302_01_filter_write_second( $value ) {
\t$GLOBALS['wphx_302_01_write']['filterWritesValue'] = ( 'changed' === $value );
\treturn $value;
}
function wphx_302_01_action_write_first( $value ) {
\treturn 'changed';
}
function wphx_302_01_action_write_second( $value ) {
\t$GLOBALS['wphx_302_01_write']['actionWritesValue'] = ( 'changed' === $value );
\treturn $value;
}

$filter_write_hook = new WP_Hook();
$filter_write_hook->add_filter( 'wphx30201/write-filter', 'wphx_302_01_filter_write_first', 10, 1 );
$filter_write_hook->add_filter( 'wphx30201/write-filter', 'wphx_302_01_filter_write_second', 20, 1 );
$filter_write_hook->apply_filters( 'original', array( 'original' ) );

$action_write_hook = new WP_Hook();
$action_write_hook->add_filter( 'wphx30201/write-action', 'wphx_302_01_action_write_first', 10, 1 );
$action_write_hook->add_filter( 'wphx30201/write-action', 'wphx_302_01_action_write_second', 20, 1 );
$action_write_hook->do_action( array( 'original' ) );

$GLOBALS['wphx_302_01_default_action_args'] = array();
function wphx_302_01_default_action( $value ) {
\t$GLOBALS['wphx_302_01_default_action_args'] = func_get_args();
}
add_action( 'wphx30201/default-action', 'wphx_302_01_default_action', 10, 1 );
do_action( 'wphx30201/default-action' );

$plugin_file = WP_PLUGIN_DIR . '/sample/sample.php';
$mu_file     = WPMU_PLUGIN_DIR . '/loader.php';
$GLOBALS['wp_plugin_paths'] = array(
\tWP_PLUGIN_DIR . '/mapped' => '/tmp/wphx-302-01/real-plugins/mapped',
);
$mapped_file = '/tmp/wphx-302-01/real-plugins/mapped/mapped.php';
$basename    = plugin_basename( $plugin_file );
register_activation_hook( $plugin_file, 'wphx_302_01_low' );
register_deactivation_hook( $plugin_file, 'wphx_302_01_low' );

echo json_encode(
\tarray(
\t\t'priorities'  => array(
\t\t\t'defaultPriority'     => $default_priority,
\t\t\t'nullKernelPriority'  => wphx_302_01_priority_keys( $null_priority_hook )[0],
\t\t\t'sortedPriorities'    => wphx_302_01_priority_keys( $priority_hook ),
\t\t\t'callbackOrder'       => wphx_302_01_hook_order( $priority_hook ),
\t\t\t'afterRemovePriority' => wphx_302_01_priority_keys( $remove_hook ),
\t\t\t'acceptedArgCounts'   => wphx_302_01_accepted_arg_counts( $priority_hook ),
\t\t),
\t\t'stack'       => $stack_snapshot,
\t\t'dispatch'    => array_merge(
\t\t\t$GLOBALS['wphx_302_01_dispatch_counts'],
\t\t\t$GLOBALS['wphx_302_01_write'],
\t\t\tarray(
\t\t\t\t'actionDefaultArgs' => $GLOBALS['wphx_302_01_default_action_args'],
\t\t\t)
\t\t),
\t\t'pluginPaths' => array(
\t\t\t'basename'         => $basename,
\t\t\t'muBasename'       => plugin_basename( $mu_file ),
\t\t\t'mappedBasename'   => plugin_basename( $mapped_file ),
\t\t\t'activationHook'   => 'activate_' . $basename,
\t\t\t'deactivationHook' => 'deactivate_' . $basename,
\t\t),
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function runHaxeProbe(commandPath, label) {
  return {
    id: label,
    runtime: label,
    command: `${commandPath} ${HAXE_PROBE}`,
    mode: "haxe-candidate",
    result: JSON.parse(command(commandPath, [HAXE_PROBE]))
  };
}

function runOracleProbe(commandPath, label) {
  return {
    id: label,
    runtime: label,
    command: `${commandPath} ${ORACLE_PROBE} ${ORACLE_PLUGIN}`,
    mode: "wordpress-oracle",
    result: JSON.parse(command(commandPath, [ORACLE_PROBE, ORACLE_PLUGIN]))
  };
}

function runDockerProbe(id, image, probe, mode, plugin = null) {
  const dockerArgs = ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", probe];
  if (plugin) dockerArgs.push(plugin);
  const output = command("docker", dockerArgs);
  return {
    id,
    runtime: id,
    image,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${probe}${plugin ? ` ${plugin}` : ""}`,
    mode,
    result: JSON.parse(output)
  };
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  if (typeof value === "string") {
    return value.replaceAll(process.cwd(), "$WORKSPACE").replaceAll("/work/", "$WORKSPACE/");
  }
  return value;
}

function stableRun(run) {
  return stableValue(run);
}

function compareRun(oracleRun, candidateRun) {
  const oracle = stableValue(oracleRun.result);
  const candidate = stableValue(candidateRun.result);
  return {
    id: oracleRun.id,
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp/hooks-decision-model",
    issue: {
      id: "wordpresshx-l76.3",
      external_ref: "WPHX-302.01"
    },
    unit: {
      kind: "module",
      name: "hooks/plugin-api decision model",
      area: "wp-includes",
      public_contract: "Typed Haxe candidate decisions for WP_Hook priority ordering, stack counters, callback arity, and plugin lifecycle hook names"
    },
    ownership_state: "verified_haxe_owned",
    upstream: {
      repo: "../wordpress-develop",
      ref: WP_REF,
      paths: SOURCE_UNITS,
      digest: upstreamDigest
    },
    owned_paths: [...HAXE_SOURCES, "tools/wp-hooks/run-hook-parity-candidate.mjs"],
    generated_paths: [OUT_ROOT, HAXE_PROBE, ORACLE_PROBE],
    verification: {
      oracle_commands: [
        "npm run wp:hooks:parity-candidate",
        "npm run wp:hooks:parity-candidate:check",
        "npm run wp:hooks:surface:check",
        "npm run wp:hooks:distribution-surface:check"
      ],
      receipt_refs: [
        "receipt:wphx-302-01-hook-parity-candidate",
        "receipt:wphx-302-hook-surface",
        "receipt:wphx-302-04-hook-distribution-surface"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "WPHX-302.01 promotes the Haxe-authored hook decision model; WPHX-302.04 verifies it as part of the distribution surface with plugin.php/class-wp-hook.php provenance and approved public ABI boundaries."
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
copyOracle();
writeHaxeProbe();
writeOracleProbe();

const lock = readJson("toolchain.lock.json");
const sourceUnits = SOURCE_UNITS.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ unit: unit.unit, sha256: unit.sha256 }))));
const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);

const runs = [];
const comparisons = [];

const localOracle = runOracleProbe("php", "local-php-cli");
const localCandidate = runHaxeProbe("php", "local-php-cli");
runs.push(localOracle, localCandidate);
comparisons.push(compareRun(localOracle, localCandidate));

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    const oracle = runDockerProbe(id, image, ORACLE_PROBE, "wordpress-oracle", ORACLE_PLUGIN);
    const candidate = runDockerProbe(id, image, HAXE_PROBE, "haxe-candidate");
    runs.push(oracle, candidate);
    comparisons.push(compareRun(oracle, candidate));
  }
}

const failedComparisons = comparisons.filter((comparison) => !comparison.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-hook-parity-candidate.v1",
  issue: "WPHX-302.01",
  generated_at: RECORDED_AT,
  generator: "tools/wp-hooks/run-hook-parity-candidate.mjs",
  inputs: {
    hxml: HXML,
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    hxml: HXML,
    haxe_probe: {
      path: HAXE_PROBE,
      sha256: `sha256:${sha256File(HAXE_PROBE)}`
    },
    oracle_probe: {
      path: ORACLE_PROBE,
      sha256: `sha256:${sha256File(ORACLE_PROBE)}`
    },
    oracle_plugin: ORACLE_PLUGIN
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version_family: phpVersionFamily(),
    docker_available: dockerVersion != null
  },
  build: {
    generated_haxe_files: filesUnder(HAXE_OUT),
    wp_hooks_candidate_files: filesUnder(OUT_ROOT)
  },
  runtime_runs: runs.map(stableRun),
  comparisons,
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    oracle_behavior_matches_haxe_candidate: true,
    broad_haxe_php_string_port: false,
    verified_distribution_surface: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-hook-parity-candidate-receipt.v1",
  id: "receipt:wphx-302-01-hook-parity-candidate",
  issue: "WPHX-302.01",
  recorded_at: RECORDED_AT,
  command: "npm run wp:hooks:parity-candidate",
  status: "passed",
  manifest: OUT,
  manifest_sha256: manifestSha,
  ownership_manifest: OWNERSHIP,
  ownership_manifest_sha256: sha256(ownershipText),
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, comparisons: comparisons.length }, null, 2));
  process.exit(0);
}

writeFile(OUT, manifestText);
writeFile(OWNERSHIP, ownershipText);
writeFile(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, comparisons: comparisons.length }, null, 2));
