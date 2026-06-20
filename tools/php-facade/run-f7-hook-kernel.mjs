#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-facade/f7-hook-kernel.hxml";
const OUT_ROOT = "build/php-hook-kernel";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const GENERATED_PLUGIN = `${GENERATED_ROOT}/wp-includes/plugin.php`;
const GENERATED_HOOK_CLASS = `${GENERATED_ROOT}/wp-includes/class-wp-hook.php`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const ORACLE_PLUGIN = `${ORACLE_ROOT}/wp-includes/plugin.php`;
const ORACLE_HOOK_CLASS = `${ORACLE_ROOT}/wp-includes/class-wp-hook.php`;
const UPSTREAM_PLUGIN = "../wordpress-develop/src/wp-includes/plugin.php";
const UPSTREAM_HOOK_CLASS = "../wordpress-develop/src/wp-includes/class-wp-hook.php";
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/php-facade/wphx-108-f7-hook-kernel.v1.json";
const RECORDED_AT = "2026-06-20T07:30:00Z";

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

function copyOracleTree() {
  mkdirSync(dirname(ORACLE_PLUGIN), { recursive: true });
  copyFileSync(UPSTREAM_PLUGIN, ORACLE_PLUGIN);
  copyFileSync(UPSTREAM_HOOK_CLASS, ORACLE_HOOK_CLASS);
}

function hookKernelClass() {
  return "\\wphx\\fixtures\\php\\facade\\HookKernel";
}

function phpBootstrapBlock() {
  return [
    "/**",
    " * WordPressHX generated shell bootstrap.",
    " *",
    " * The public hook shell remains PHP-native while bounded runtime decisions",
    " * delegate to typed Haxe code compiled into haxe/lib.",
    " */",
    "if ( ! defined( 'WPHX_F7_HOOK_BOOTSTRAPPED' ) ) {",
    "\tdefine( 'WPHX_F7_HOOK_BOOTSTRAPPED', true );",
    "\t$wphx_f7_lib = dirname( __DIR__, 2 ) . '/haxe/lib';",
    "\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f7_lib );",
    "\tspl_autoload_register(",
    "\t\tfunction ( $class ) {",
    "\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );",
    "\t\t\tif ( $file ) {",
    "\t\t\t\tinclude_once $file;",
    "\t\t\t}",
    "\t\t}",
    "\t);",
    "\t\\php\\Boot::__hx__init();",
    "}",
    ""
  ].join("\n");
}

function countText(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count++;
    offset = index + needle.length;
  }
}

function replaceExact(text, from, to, id, expectedCount = 1) {
  const count = countText(text, from);
  if (count !== expectedCount) {
    throw new Error(id + ": expected " + expectedCount + " occurrence(s), found " + count);
  }
  return text.split(from).join(to);
}

function transformHookClass(source) {
  const hookKernel = hookKernelClass();
  let text = replaceExact(source, "<?php\n", "<?php\n" + phpBootstrapBlock() + "\n", "class bootstrap");
  text = replaceExact(
    text,
    "\t\tif ( null === $priority ) {\n\t\t\t$priority = 0;\n\t\t}\n",
    "\t\t$priority = " + hookKernel + "::normalizeKernelPriority( $priority );\n",
    "class priority normalization",
    2
  );
  text = replaceExact(
    text,
    "\t\t\t\tif ( ! $this->doing_action ) {\n\t\t\t\t\t$args[0] = $value;\n\t\t\t\t}\n",
    "\t\t\t\tif ( " + hookKernel + "::shouldWriteFilteredValue( $this->doing_action ) ) {\n\t\t\t\t\t$args[0] = $value;\n\t\t\t\t}\n",
    "class filter value-write decision"
  );
  text = replaceExact(
    text,
    "\t\t\t\t// Avoid the array_slice() if possible.\n\t\t\t\tif ( 0 === $the_['accepted_args'] ) {\n\t\t\t\t\t$value = call_user_func( $the_['function'] );\n\t\t\t\t} elseif ( $the_['accepted_args'] >= $num_args ) {\n\t\t\t\t\t$value = call_user_func_array( $the_['function'], $args );\n\t\t\t\t} else {\n\t\t\t\t\t$value = call_user_func_array( $the_['function'], array_slice( $args, 0, $the_['accepted_args'] ) );\n\t\t\t\t}\n",
    "\t\t\t\t// Avoid the array_slice() if possible.\n\t\t\t\t$accepted_args = " + hookKernel + "::dispatchArgCount( $num_args, $the_['accepted_args'] );\n\t\t\t\tif ( 0 === $accepted_args ) {\n\t\t\t\t\t$value = call_user_func( $the_['function'] );\n\t\t\t\t} elseif ( $accepted_args === $num_args ) {\n\t\t\t\t\t$value = call_user_func_array( $the_['function'], $args );\n\t\t\t\t} else {\n\t\t\t\t\t$value = call_user_func_array( $the_['function'], array_slice( $args, 0, $accepted_args ) );\n\t\t\t\t}\n",
    "class dispatch arity decision"
  );
  return text;
}

function transformPlugin(source) {
  const hookKernel = hookKernelClass();
  let text = source;
  text = replaceExact(
    text,
    "\tif ( ! isset( $wp_filters[ $hook_name ] ) ) {\n\t\t$wp_filters[ $hook_name ] = 1;\n\t} else {\n\t\t++$wp_filters[ $hook_name ];\n\t}\n",
    "\t$wp_filters[ $hook_name ] = " + hookKernel + "::incrementCount( $wp_filters[ $hook_name ] ?? 0 );\n",
    "plugin filter counters",
    2
  );
  text = replaceExact(
    text,
    "\tif ( ! isset( $wp_actions[ $hook_name ] ) ) {\n\t\t$wp_actions[ $hook_name ] = 1;\n\t} else {\n\t\t++$wp_actions[ $hook_name ];\n\t}\n",
    "\t$wp_actions[ $hook_name ] = " + hookKernel + "::incrementCount( $wp_actions[ $hook_name ] ?? 0 );\n",
    "plugin action counters",
    2
  );
  text = replaceExact(
    text,
    "\tif ( empty( $arg ) ) {\n\t\t$arg[] = '';\n",
    "\tif ( " + hookKernel + "::shouldUseDefaultActionArg( count( $arg ) ) ) {\n\t\t$arg[] = " + hookKernel + "::defaultActionArg();\n",
    "plugin default action arg"
  );
  text = replaceExact(
    text,
    "\t$file = preg_replace( '#^' . preg_quote( $plugin_dir, '#' ) . '/|^' . preg_quote( $mu_plugin_dir, '#' ) . '/#', '', $file );\n\t$file = trim( $file, '/' );\n\treturn $file;\n",
    "\treturn " + hookKernel + "::pluginBasenameAfterMappings( $file, $plugin_dir, $mu_plugin_dir );\n",
    "plugin basename trimming"
  );
  text = replaceExact(
    text,
    "\tif ( $plugin_path === $wp_plugin_path || $plugin_path === $wpmu_plugin_path ) {\n\t\treturn false;\n\t}\n\n\tif ( $plugin_path !== $plugin_realpath ) {\n\t\t$wp_plugin_paths[ $plugin_path ] = $plugin_realpath;\n\t}\n",
    "\tif ( ! " + hookKernel + "::shouldRegisterPluginRealpath( $plugin_path, $wp_plugin_path, $wpmu_plugin_path ) ) {\n\t\treturn false;\n\t}\n\n\tif ( " + hookKernel + "::shouldStorePluginRealpathMapping( $plugin_path, $plugin_realpath ) ) {\n\t\t$wp_plugin_paths[ $plugin_path ] = $plugin_realpath;\n\t}\n",
    "plugin realpath registration"
  );
  text = replaceExact(
    text,
    "\tadd_action( 'activate_' . $file, $callback );\n",
    "\tadd_action( " + hookKernel + "::lifecycleHookName( 'activate_', $file ), $callback );\n",
    "plugin activation hook name"
  );
  text = replaceExact(
    text,
    "\tadd_action( 'deactivate_' . $file, $callback );\n",
    "\tadd_action( " + hookKernel + "::lifecycleHookName( 'deactivate_', $file ), $callback );\n",
    "plugin deactivation hook name"
  );
  return text;
}

function writeGeneratedClass() {
  writeFile(GENERATED_HOOK_CLASS, transformHookClass(readFileSync(UPSTREAM_HOOK_CLASS, "utf8")));
}

function writeGeneratedPlugin() {
  writeFile(GENERATED_PLUGIN, transformPlugin(readFileSync(UPSTREAM_PLUGIN, "utf8")));
}

function writeProbe() {
  writeFile(
    PROBE,
    `<?php

$mode = $argv[1];
$plugin = $argv[2];

$GLOBALS['wphx_f7_trace'] = array();

function wphx_f7_record( $event, $hook_name, $detail ) {
\t$GLOBALS['wphx_f7_trace'][] = array(
\t\t'event' => $event,
\t\t'hookName' => $hook_name,
\t\t'detail' => $detail,
\t\t'current' => function_exists( 'current_filter' ) ? current_filter() : false,
\t\t'doing' => function_exists( 'doing_filter' ) ? doing_filter( $hook_name ) : false,
\t);
}

function wphx_f7_all() {
\t$args = func_get_args();
\twphx_f7_record( 'all', $args[0], count( $args ) . ':' . json_encode( array_slice( $args, 1 ), JSON_UNESCAPED_SLASHES ) );
}

function wphx_f7_filter_low( $value, $suffix ) {
\twphx_f7_record( 'filter-low', 'title', $value . ':' . $suffix );
\treturn $value . '|low-' . $suffix;
}

function wphx_f7_filter_mid( $value ) {
\twphx_f7_record( 'filter-mid', 'title', $value );
\treturn $value . '|mid';
}

function wphx_f7_filter_high( $value, $suffix ) {
\twphx_f7_record( 'filter-high', 'title', $value . ':' . $suffix );
\treturn $value . '|high-' . $suffix;
}

function wphx_f7_action( $post, $id ) {
\twphx_f7_record( 'action', 'save_post', $post . ':' . $id );
}

function wphx_f7_ref( &$value ) {
\twphx_f7_record( 'ref-filter', 'ref_hook', $value );
\t$value .= '|ref-mutated';
\treturn $value;
}

$before = array(
\t'add_filter' => function_exists( 'add_filter' ),
\t'WP_Hook' => class_exists( 'WP_Hook', false ),
);

require $plugin;

$after = array(
\t'add_filter' => function_exists( 'add_filter' ),
\t'WP_Hook' => class_exists( 'WP_Hook', false ),
);

$reflections = array();
foreach (
\tarray(
\t\t'_wp_call_all_hook',
\t\t'_wp_filter_build_unique_id',
\t\t'add_action',
\t\t'add_filter',
\t\t'apply_filters',
\t\t'apply_filters_deprecated',
\t\t'apply_filters_ref_array',
\t\t'current_action',
\t\t'current_filter',
\t\t'did_action',
\t\t'did_filter',
\t\t'do_action',
\t\t'do_action_deprecated',
\t\t'do_action_ref_array',
\t\t'doing_action',
\t\t'doing_filter',
\t\t'has_action',
\t\t'has_filter',
\t\t'plugin_basename',
\t\t'plugin_dir_path',
\t\t'plugin_dir_url',
\t\t'register_activation_hook',
\t\t'register_deactivation_hook',
\t\t'register_uninstall_hook',
\t\t'remove_action',
\t\t'remove_all_actions',
\t\t'remove_all_filters',
\t\t'remove_filter',
\t\t'wp_register_plugin_realpath',
\t)
\tas $function_name
) {
\t$reflection = new ReflectionFunction( $function_name );
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
\t$reflections[ $function_name ] = array(
\t\t'name' => $reflection->getName(),
\t\t'numberOfParameters' => $reflection->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $reflection->returnsReference(),
\t\t'hasReturnType' => $reflection->hasReturnType(),
\t\t'parameters' => $params,
\t);
}

$add_all = add_filter( 'all', 'wphx_f7_all', 1, 99 );
$add_low = add_filter( 'title', 'wphx_f7_filter_low', 5, 2 );
$add_mid = add_filter( 'title', 'wphx_f7_filter_mid', 10, 1 );
$add_high = add_filter( 'title', 'wphx_f7_filter_high', 20, 2 );
$has_mid_before = has_filter( 'title', 'wphx_f7_filter_mid' );
$has_high_exact = has_filter( 'title', 'wphx_f7_filter_high', 20 );
$first = apply_filters( 'title', 'start', 'x' );
$removed_mid = remove_filter( 'title', 'wphx_f7_filter_mid', 10 );
$has_mid_after = has_filter( 'title', 'wphx_f7_filter_mid' );
$second = apply_filters_ref_array( 'title', array( 'again', 'y' ) );

add_action( 'save_post', 'wphx_f7_action', 10, 2 );
do_action( 'save_post', 'post', 42 );

add_filter( 'ref_hook', 'wphx_f7_ref', 10, 1 );
$ref_value = 'seed';
$ref_args = array( &$ref_value );
$ref_return = apply_filters_ref_array( 'ref_hook', $ref_args );

$globals = array(
\t'wp_filter_type' => gettype( $GLOBALS['wp_filter'] ),
\t'wp_filter_keys' => array_keys( $GLOBALS['wp_filter'] ),
\t'wp_filter_title_class' => get_class( $GLOBALS['wp_filter']['title'] ),
\t'wp_filter_title_priorities' => array_map( 'intval', array_keys( $GLOBALS['wp_filter']['title']->callbacks ) ),
\t'wp_filters' => $GLOBALS['wp_filters'],
\t'wp_actions' => $GLOBALS['wp_actions'],
\t'wp_current_filter' => $GLOBALS['wp_current_filter'],
);

$class_reflection = new ReflectionClass( 'WP_Hook' );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'after' => $after,
\t\t'reflections' => $reflections,
\t\t'classReflection' => array(
\t\t\t'name' => $class_reflection->getName(),
\t\t\t'isFinal' => $class_reflection->isFinal(),
\t\t\t'interfaceNames' => $class_reflection->getInterfaceNames(),
\t\t\t'hasCallbacksProperty' => $class_reflection->hasProperty( 'callbacks' ),
\t\t),
\t\t'addReturns' => array( $add_all, $add_low, $add_mid, $add_high ),
\t\t'filterResults' => array(
\t\t\t'hasMidBefore' => $has_mid_before,
\t\t\t'hasHighExact' => $has_high_exact,
\t\t\t'first' => $first,
\t\t\t'removedMid' => $removed_mid,
\t\t\t'hasMidAfter' => $has_mid_after,
\t\t\t'second' => $second,
\t\t),
\t\t'actionResults' => array(
\t\t\t'didSavePost' => did_action( 'save_post' ),
\t\t),
\t\t'referenceResults' => array(
\t\t\t'refReturn' => $ref_return,
\t\t\t'refValue' => $ref_value,
\t\t),
\t\t'globals' => $globals,
\t\t'trace' => $GLOBALS['wphx_f7_trace'],
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function normalizeProbe(result) {
  return {
    before: result.before,
    after: result.after,
    reflections: result.reflections,
    classReflection: result.classReflection,
    addReturns: result.addReturns,
    filterResults: result.filterResults,
    actionResults: result.actionResults,
    referenceResults: result.referenceResults,
    globals: result.globals,
    trace: result.trace
  };
}

function runProbe(commandPath, label, mode, plugin) {
  const output = command(commandPath, [PROBE, mode, plugin]);
  return {
    id: `${label}:${mode}`,
    command: `${commandPath} ${PROBE} ${mode} ${plugin}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, mode, plugin) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, plugin]);
  return {
    id: `${id}:${mode}`,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${plugin}`,
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
copyOracleTree();
writeGeneratedClass();
writeGeneratedPlugin();
writeProbe();

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_PLUGIN);
const localGenerated = runProbe("php", "local-php-cli", "generated", GENERATED_PLUGIN);
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
    const oracle = runDockerProbe(id, image, "oracle", ORACLE_PLUGIN);
    const generated = runDockerProbe(id, image, "generated", GENERATED_PLUGIN);
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
  schema: "wphx.php-facade-f7-hook-kernel.v1",
  issue: "WPHX-108",
  generated_at: RECORDED_AT,
  generator: "tools/php-facade/run-f7-hook-kernel.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx"
    ],
    upstream_oracle_sources: [UPSTREAM_PLUGIN, UPSTREAM_HOOK_CLASS],
    oracle_plugin: ORACLE_PLUGIN,
    generated_plugin: GENERATED_PLUGIN,
    generated_hook_class: GENERATED_HOOK_CLASS,
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
    generated_haxe_file_count: filesUnder(HAXE_OUT).length,
    generated_haxe_files: filesUnder(HAXE_OUT),
    oracle_files: filesUnder(ORACLE_ROOT),
    generated_files: filesUnder(GENERATED_ROOT),
    probe: {
      path: PROBE,
      sha256: sha256(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  hook_strategy: {
    php_globals_remain_native: true,
    php_callbacks_remain_native: true,
    haxe_owns_bounded_trace_helpers: true,
    boundary_note: "The hook public ABI and callback execution remain original-path PHP because PHP callables, references, and globals are observable. Haxe can own typed helper payloads behind that boundary while later work ports a larger WP_Hook kernel deliberately."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    upstream_oracle: true,
    reflected_signatures: true,
    callback_ordering: true,
    callback_removal: true,
    accepted_args: true,
    all_hook_trace: true,
    action_trace: true,
    reference_filter: true,
    current_filter_stack: true,
    native_hook_globals: true
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
