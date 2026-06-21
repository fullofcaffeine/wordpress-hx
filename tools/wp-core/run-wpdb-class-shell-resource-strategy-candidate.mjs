#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.26",
  external_ref: "WPHX-305.26",
  title: "Prove complete wpdb class shell and native resource strategy"
};
const HXML = "fixtures/wp-core/wpdb-class-shell-resource-strategy-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-305-26";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/candidate-shell.php`;
const PROBE = `${OUT_ROOT}/class-shell-resource-probe.php`;
const DROPIN_DIR = `${OUT_ROOT}/wp-content`;
const DROPIN = `${DROPIN_DIR}/db.php`;
const DROPIN_PROBE = `${OUT_ROOT}/dropin-probe.php`;
const STRATEGY_PHP = `${HAXE_OUT}/lib/wphx/wp/db/WpdbClassShellStrategy.php`;
const ENTRY_PHP = `${HAXE_OUT}/lib/wphx/fixtures/wp/core/WpdbClassShellResourceStrategyCandidateEntry.php`;
const OUT = "manifests/wp-core/wphx-305-26-wpdb-class-shell-resource-strategy-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-26-wpdb-class-shell-resource-strategy-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-26-wpdb-class-shell-resource-strategy-candidate.v1.json";
const PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE = "manifests/wp-core/wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate.v1.json";
const PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE = "manifests/wp-core/wphx-305-24-wpdb-public-state-storage-adapter-candidate.v1.json";
const PUBLIC_STATE_DESCRIPTOR_CANDIDATE = "manifests/wp-core/wphx-305-23-wpdb-public-state-descriptor-candidate.v1.json";
const ROW_MATERIALIZATION_CANDIDATE = "manifests/wp-core/wphx-305-21-wpdb-row-materialization-candidate.v1.json";
const MYSQLI_PHPGLOBAL_CANDIDATE = "manifests/wp-core/wphx-305-20-wpdb-mysqli-phpglobal-candidate.v1.json";
const RAW_RESOURCE_CANDIDATE = "manifests/wp-core/wphx-305-15-wpdb-raw-resource-candidate.v1.json";
const MYSQLI_BOUNDARY_CANDIDATE = "manifests/wp-core/wphx-305-16-wpdb-mysqli-boundary-candidate.v1.json";
const RECORDED_AT = "2026-06-21T07:50:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const DB_NAME = "wordpresshx_live";
const DB_USER = "root";
const DB_PASSWORD = "wordpresshx-live-password";

const SOURCE_FILES = ["src/wp-includes/class-wpdb.php", "src/wp-includes/load.php", "src/wp-includes/wp-db.php"];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
  "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
  "src/wphx/wp/db/WpdbClassShellStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbClassShellResourceStrategyCandidateEntry.hx"
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 80
  }).trim();
}

function maybeCommand(commandName, commandArgs, options = {}) {
  try {
    return command(commandName, commandArgs, options);
  } catch {
    return null;
  }
}

function run(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 80
  });
  return {
    command: [commandName, ...commandArgs].map(quoteCommandArg).join(" "),
    status: result.status,
    signal: result.signal,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr),
    error: result.error ? result.error.message : null
  };
}

function quoteCommandArg(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function normalizeOutput(value) {
  return (value ?? "").trim().slice(0, 12000);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
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

function sourceRecord(path) {
  const repoPath = upstreamPath(path);
  return {
    path,
    repo_path: repoPath,
    bytes: statSync(repoPath).size,
    sha256: sha256File(repoPath)
  };
}

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source)
  };
}

function writeOrCheck(path, text) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== text) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-class-shell-resource-strategy-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function phpString(value) {
  return JSON.stringify(value);
}

function sorted(values) {
  return [...values].sort((left, right) => String(left).localeCompare(String(right)));
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function imageRef(image) {
  return `${image.repository}@${image.index_digest}`;
}

function dockerImageInfo(image) {
  const raw = command("docker", ["image", "inspect", imageRef(image)]);
  const [info] = JSON.parse(raw);
  return {
    image: imageRef(image),
    id: info.Id,
    repo_digests: info.RepoDigests ?? [],
    architecture: info.Architecture,
    os: info.Os,
    created: info.Created
  };
}

function dbProbe(port) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), getenv('WPHX_DB_NAME'), intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $result = $mysqli->query("SELECT VERSION() AS version, @@version_comment AS comment, DATABASE() AS db_name");
    $row = $result->fetch_assoc();
    echo json_encode($row, JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    command("php", ["-r", code], {
      env: {
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_NAME: DB_NAME,
        WPHX_DB_PORT: String(port)
      }
    })
  );
}

function dbRuntimeRecords(lock) {
  return [
    {
      id: "mysql-8.4",
      engine: "mysql",
      image_lock: lock.container_images.mysql_8_4,
      env: {
        MYSQL_ROOT_PASSWORD: DB_PASSWORD,
        MYSQL_DATABASE: DB_NAME,
        MYSQL_ROOT_HOST: "%"
      }
    },
    {
      id: "mariadb-11.8",
      engine: "mariadb",
      image_lock: lock.container_images.mariadb_11_8,
      env: {
        MARIADB_ROOT_PASSWORD: DB_PASSWORD,
        MARIADB_DATABASE: DB_NAME,
        MARIADB_ROOT_HOST: "%"
      }
    }
  ];
}

async function withDbRuntime(runtime, callback) {
  const name = `wordpresshx-wphx-305-26-${runtime.id}-${process.pid}`;
  let containerId = "";
  try {
    const dockerArgs = ["run", "-d", "--rm", "--name", name];
    for (const [key, value] of Object.entries(runtime.env)) {
      dockerArgs.push("-e", `${key}=${value}`);
    }
    dockerArgs.push("-p", "127.0.0.1::3306", imageRef(runtime.image_lock));
    containerId = command("docker", dockerArgs);
    const portOutput = command("docker", ["port", name, "3306/tcp"]);
    const port = Number(portOutput.split(":").at(-1));
    let query = null;
    let lastError = "";
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      try {
        query = dbProbe(port);
        break;
      } catch (error) {
        lastError = error.stderr?.toString?.() || error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!query) {
      throw new Error(`${runtime.id} did not become ready: ${lastError}`);
    }
    return await callback({ port, query, image: dockerImageInfo(runtime.image_lock) });
  } finally {
    if (containerId) {
      try {
        command("docker", ["stop", name], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Best-effort cleanup for failed startup or interrupted probes.
      }
    }
  }
}

function wordpressProbeStubs() {
  return `
if (!defined('WP_DEBUG')) {
  define('WP_DEBUG', false);
}
if (!defined('WP_DEBUG_DISPLAY')) {
  define('WP_DEBUG_DISPLAY', false);
}
if (!defined('SAVEQUERIES')) {
  define('SAVEQUERIES', false);
}
if (!defined('DB_CHARSET')) {
  define('DB_CHARSET', 'utf8mb4');
}
if (!defined('DB_COLLATE')) {
  define('DB_COLLATE', '');
}
if (!defined('AUTH_SALT')) {
  define('AUTH_SALT', 'wphx-305-26-auth-salt');
}
if (!defined('WP_CONTENT_DIR')) {
  define('WP_CONTENT_DIR', ${phpString(resolve(DROPIN_DIR))});
}
if (!function_exists('apply_filters')) {
  function apply_filters($hook_name, $value) {
    return $value;
  }
}
if (!function_exists('has_filter')) {
  function has_filter($hook_name, $callback = false) {
    return false;
  }
}
if (!function_exists('add_filter')) {
  function add_filter($hook_name, $callback, $priority = 10, $accepted_args = 1): bool {
    return true;
  }
}
if (!function_exists('remove_filter')) {
  function remove_filter($hook_name, $callback, $priority = 10): bool {
    return true;
  }
}
if (!function_exists('absint')) {
  function absint($maybeint): int {
    return abs((int) $maybeint);
  }
}
if (!function_exists('is_multisite')) {
  function is_multisite(): bool {
    return false;
  }
}
if (!function_exists('wp_load_translations_early')) {
  function wp_load_translations_early(): void {
  }
}
if (!function_exists('__')) {
  function __($text) {
    return $text;
  }
}
if (!function_exists('wp_die')) {
  function wp_die($message = ''): void {
    throw new RuntimeException((string) $message);
  }
}
if (!function_exists('did_action')) {
  function did_action($hook_name): int {
    return 0;
  }
}
if (!function_exists('dead_db')) {
  function dead_db(): void {
    throw new RuntimeException('dead_db');
  }
}
`;
}

function shellSource() {
  return `<?php
require_once ${phpString(resolve(`${HAXE_OUT}/index.php`))};
${wordpressProbeStubs()}
if (!class_exists('wpdb')) {
  require_once ${phpString(resolve(upstreamPath("src/wp-includes/class-wpdb.php")))};
}

if (!function_exists('wphx_305_26_native_array')) {
  function wphx_305_26_native_array($values): array {
    if ($values instanceof Array_hx) {
      return $values->arr;
    }
    if (is_array($values)) {
      return $values;
    }
    throw new InvalidArgumentException('Expected PHP array or Array_hx.');
  }
}

#[AllowDynamicProperties]
class WPHX_305_26_Wpdb_Class_Shell extends wpdb {
  public function wphx_set_parent_visible_native_slot(string $name, $value): void {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbClassShellStrategy';
    if (!$strategy::shouldStoreNativeResourceInParentVisibleSlot($name)) {
      throw new InvalidArgumentException('Unsupported native slot.');
    }
    $this->$name = $value;
  }

  public function wphx_reset_lazy_parent_loaded_slot(string $name): void {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbClassShellStrategy';
    if (!$strategy::shouldDelegateLazyReadToParentLoader($name)) {
      throw new InvalidArgumentException('Unsupported lazy slot.');
    }
    $this->$name = null;
  }
}
`;
}

function classShellProbeSource() {
  return `<?php
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
ini_set('display_errors', 'stderr');
mysqli_report(MYSQLI_REPORT_OFF);

require_once ${phpString(resolve(SHELL))};

$db_host = $argv[1];
$db_port = (int) $argv[2];
$db_user = $argv[3];
$db_password = $argv[4];
$db_name = $argv[5];
$runtime_id = $argv[6];
$db_host_with_port = $db_host . ':' . $db_port;

function wphx_305_26_normalize_host($value): string {
  return preg_replace('/:\\\\d+$/', ':<port>', (string) $value);
}

function wphx_305_26_value_shape($value): array {
  if (is_array($value)) {
    return array('type' => 'array', 'count' => count($value));
  }
  if (is_object($value)) {
    return array('type' => 'object', 'class' => get_class($value));
  }
  if (is_bool($value)) {
    return array('type' => 'bool', 'value' => $value);
  }
  if (is_int($value)) {
    return array('type' => 'int', 'value' => $value);
  }
  if (is_null($value)) {
    return array('type' => 'null', 'value' => null);
  }
  return array('type' => gettype($value), 'value' => (string) $value);
}

function wphx_305_26_constructor_snapshot($object): array {
  return array(
    'dbuser' => $object->__get('dbuser'),
    'dbpassword_set' => is_string($object->__get('dbpassword')) && '' !== $object->__get('dbpassword'),
    'dbname' => $object->__get('dbname'),
    'dbhost' => wphx_305_26_normalize_host($object->__get('dbhost')),
    'dbh_type' => get_debug_type($object->__get('dbh')),
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'use_mysqli' => $object->__get('use_mysqli'),
    'charset' => $object->charset,
    'collate' => $object->collate,
    'result_initial' => wphx_305_26_value_shape($object->__get('result'))
  );
}

function wphx_305_26_col_info_names($col_info): array {
  $names = array();
  foreach ((array) $col_info as $column) {
    $names[] = $column->name;
  }
  return $names;
}

function wphx_305_26_query_snapshot($object): array {
  $return_value = $object->query("SELECT 1 AS alpha, 'two' AS beta");
  $result = $object->__get('result');
  $col_info = $object->__get('col_info');
  return array(
    'return_value' => $return_value,
    'result_type' => get_debug_type($result),
    'result_is_mysqli_result' => $result instanceof mysqli_result,
    'col_info_count' => count((array) $col_info),
    'col_info_names' => wphx_305_26_col_info_names($col_info),
    'get_col_info_names' => $object->get_col_info('name'),
    'num_rows' => $object->num_rows,
    'last_result_count' => is_array($object->last_result) ? count($object->last_result) : null,
    'last_result_first_row' => is_array($object->last_result) && isset($object->last_result[0])
      ? array('alpha' => (string) $object->last_result[0]->alpha, 'beta' => (string) $object->last_result[0]->beta)
      : null
  );
}

function wphx_305_26_bridge_snapshot($object): array {
  $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbClassShellStrategy';
  $mysqli = $object->__get('dbh');
  $result = $mysqli->query("SELECT 7 AS bridge_alpha, 'eight' AS bridge_beta");
  $object->wphx_set_parent_visible_native_slot('result', $result);
  $object->wphx_reset_lazy_parent_loaded_slot('col_info');
  $col_info = $object->__get('col_info');
  return array(
    'dbh_is_mysqli' => $mysqli instanceof mysqli,
    'result_is_mysqli_result' => $object->__get('result') instanceof mysqli_result,
    'col_info_count' => count((array) $col_info),
    'col_info_names' => wphx_305_26_col_info_names($col_info),
    'strategy_result_route' => $strategy::nativeResourceWriteRoute('result'),
    'strategy_col_info_route' => $strategy::lazyReadRoute('col_info')
  );
}

function wphx_305_26_plugin_snapshot($object): array {
  $object->wphx_plugin_extension = 'plugin-value';
  $before_col_meta = wphx_305_26_value_shape($object->__get('col_meta'));
  $object->__set('col_meta', array('blocked' => true));
  $after_col_meta = wphx_305_26_value_shape($object->__get('col_meta'));
  $before_table_charset = wphx_305_26_value_shape($object->__get('table_charset'));
  $object->__set('table_charset', array('blocked' => true));
  $after_table_charset = wphx_305_26_value_shape($object->__get('table_charset'));
  return array(
    'dynamic_property_added' => isset($object->wphx_plugin_extension) && 'plugin-value' === $object->wphx_plugin_extension,
    'dynamic_property_in_object_vars' => array_key_exists('wphx_plugin_extension', get_object_vars($object)),
    'col_meta_write_blocked' => $before_col_meta === $after_col_meta,
    'table_charset_write_blocked' => $before_table_charset === $after_table_charset
  );
}

function wphx_305_26_reflection_shape(string $class_name): array {
  $reflection = new ReflectionClass($class_name);
  $public_properties = array();
  foreach ($reflection->getProperties(ReflectionProperty::IS_PUBLIC) as $property) {
    $public_properties[] = $property->getName();
  }
  sort($public_properties);
  $magic_methods = array();
  foreach (array('__get', '__isset', '__set', '__unset') as $method_name) {
    if ($reflection->hasMethod($method_name) && $reflection->getMethod($method_name)->isPublic()) {
      $magic_methods[] = $method_name;
    }
  }
  return array(
    'public_properties' => $public_properties,
    'public_magic_methods' => $magic_methods,
    'allows_dynamic_properties' => count($reflection->getAttributes(AllowDynamicProperties::class)) > 0
  );
}

$oracle = new wpdb($db_user, $db_password, $db_name, $db_host_with_port);
$candidate = new WPHX_305_26_Wpdb_Class_Shell($db_user, $db_password, $db_name, $db_host_with_port);

$strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbClassShellStrategy';
$strategy_contract = array(
  'class_shell_kind' => $strategy::classShellKind(),
  'constructor_argument_properties' => wphx_305_26_native_array($strategy::constructorArgumentProperties()),
  'constructor_side_effect_properties' => wphx_305_26_native_array($strategy::constructorSideEffectProperties()),
  'parent_visible_native_resource_properties' => wphx_305_26_native_array($strategy::parentVisibleNativeResourceProperties()),
  'lazy_parent_loaded_properties' => wphx_305_26_native_array($strategy::lazyParentLoadedProperties()),
  'plugin_abi_compatibility_properties' => wphx_305_26_native_array($strategy::pluginAbiCompatibilityProperties()),
  'bootstrap_entry_points' => wphx_305_26_native_array($strategy::bootstrapEntryPoints()),
  'dbh_write_route' => $strategy::nativeResourceWriteRoute('dbh'),
  'result_write_route' => $strategy::nativeResourceWriteRoute('result'),
  'col_info_lazy_read_route' => $strategy::lazyReadRoute('col_info'),
  'require_wp_db_bootstrap_route' => $strategy::bootstrapRoute('require_wp_db'),
  'preserves_plugin_abi_compatibility' => $strategy::preservesPluginAbiCompatibility(),
  'preserves_require_wp_db_dropin_replacement' => $strategy::preservesRequireWpDbDropinReplacement(),
  'uses_expanded_public_state_adapter' => $strategy::usesExpandedPublicStateAdapter()
);

$oracle_constructor = wphx_305_26_constructor_snapshot($oracle);
$candidate_constructor = wphx_305_26_constructor_snapshot($candidate);
$oracle_query = wphx_305_26_query_snapshot($oracle);
$candidate_query = wphx_305_26_query_snapshot($candidate);
$candidate_bridge = wphx_305_26_bridge_snapshot($candidate);
$oracle_plugin = wphx_305_26_plugin_snapshot($oracle);
$candidate_plugin = wphx_305_26_plugin_snapshot($candidate);
$oracle_reflection = wphx_305_26_reflection_shape('wpdb');
$candidate_reflection = wphx_305_26_reflection_shape('WPHX_305_26_Wpdb_Class_Shell');

$comparisons = array(
  'constructor_side_effects_preserved' => $oracle_constructor === $candidate_constructor,
  'actual_mysqli_query_result_preserved' => $oracle_query === $candidate_query,
  'lazy_col_info_materialization_preserved' => $candidate_query['col_info_names'] === array('alpha', 'beta') && $candidate_query['get_col_info_names'] === array('alpha', 'beta'),
  'parent_visible_native_resource_bridge_preserved' => $candidate_bridge['dbh_is_mysqli'] && $candidate_bridge['result_is_mysqli_result'] && $candidate_bridge['col_info_names'] === array('bridge_alpha', 'bridge_beta'),
  'plugin_dynamic_property_preserved' => $oracle_plugin['dynamic_property_added'] === $candidate_plugin['dynamic_property_added'] && $candidate_plugin['dynamic_property_in_object_vars'],
  'protected_magic_write_blocks_preserved' => $oracle_plugin['col_meta_write_blocked'] && $candidate_plugin['col_meta_write_blocked'] && $oracle_plugin['table_charset_write_blocked'] && $candidate_plugin['table_charset_write_blocked'],
  'reflection_public_properties_preserved' => $oracle_reflection['public_properties'] === $candidate_reflection['public_properties'],
  'reflection_public_magic_methods_preserved' => $oracle_reflection['public_magic_methods'] === $candidate_reflection['public_magic_methods'],
  'reflection_dynamic_properties_preserved' => $candidate_reflection['allows_dynamic_properties'] === true,
  'strategy_routes_native_resources_to_parent_visible_slots' => 'parent_visible_php_property' === $strategy_contract['dbh_write_route'] && 'parent_visible_php_property' === $strategy_contract['result_write_route'],
  'strategy_delegates_lazy_col_info_to_parent_loader' => 'wordpress_parent_lazy_loader' === $strategy_contract['col_info_lazy_read_route'],
  'strategy_preserves_bootstrap_dropin' => 'db_php_dropin_global' === $strategy_contract['require_wp_db_bootstrap_route'] && true === $strategy_contract['preserves_require_wp_db_dropin_replacement']
);

echo json_encode(
  array(
    'runtime' => $runtime_id,
    'strategy_contract' => $strategy_contract,
    'oracle' => array(
      'constructor' => $oracle_constructor,
      'query' => $oracle_query,
      'plugin' => $oracle_plugin,
      'reflection' => $oracle_reflection
    ),
    'candidate' => array(
      'constructor' => $candidate_constructor,
      'query' => $candidate_query,
      'bridge' => $candidate_bridge,
      'plugin' => $candidate_plugin,
      'reflection' => $candidate_reflection
    ),
    'comparisons' => $comparisons,
    'status' => in_array(false, $comparisons, true) ? 'failed' : 'passed'
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function dropinProbeSource() {
  return `<?php
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
ini_set('display_errors', 'stderr');
mysqli_report(MYSQLI_REPORT_OFF);

$db_host = $argv[1];
$db_port = (int) $argv[2];
$db_user = $argv[3];
$db_password = $argv[4];
$db_name = $argv[5];
$runtime_id = $argv[6];

define('ABSPATH', ${phpString(`${resolve(UPSTREAM_ROOT)}/src/`)});
define('WPINC', 'wp-includes');
define('WP_CONTENT_DIR', ${phpString(resolve(DROPIN_DIR))});
define('WP_DEBUG', false);
define('WP_DEBUG_DISPLAY', false);
define('SAVEQUERIES', false);
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');
define('DB_USER', $db_user);
define('DB_PASSWORD', $db_password);
define('DB_NAME', $db_name);
define('DB_HOST', $db_host . ':' . $db_port);

require_once ${phpString(resolve(upstreamPath("src/wp-includes/load.php")))};
${wordpressProbeStubs()}

require_wp_db();
global $wpdb;

$query_return = $wpdb->query("SELECT 11 AS dropin_alpha, 'twelve' AS dropin_beta");
$result = $wpdb->__get('result');
$col_info = $wpdb->__get('col_info');
$col_names = array();
foreach ((array) $col_info as $column) {
  $col_names[] = $column->name;
}
$wpdb->wphx_dropin_plugin_property = 'dropin-plugin';

echo json_encode(
  array(
    'runtime' => $runtime_id,
    'class_wpdb_loaded' => class_exists('wpdb'),
    'global_wpdb_set' => isset($wpdb),
    'global_wpdb_class' => is_object($wpdb) ? get_class($wpdb) : null,
    'dropin_replacement_preserved' => is_object($wpdb) && 'WPHX_305_26_Dropin_Wpdb' === get_class($wpdb),
    'constructor_side_effects_available' => is_object($wpdb) && true === $wpdb->ready && true === $wpdb->__get('has_connected') && $wpdb->__get('dbh') instanceof mysqli,
    'actual_result_available' => $result instanceof mysqli_result && 1 === $query_return,
    'lazy_col_info_available' => $col_names === array('dropin_alpha', 'dropin_beta'),
    'dynamic_plugin_property_available' => is_object($wpdb) && 'dropin-plugin' === ($wpdb->wphx_dropin_plugin_property ?? null)
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function writeProbeFiles() {
  mkdirSync(OUT_ROOT, { recursive: true });
  mkdirSync(DROPIN_DIR, { recursive: true });
  writeFileSync(SHELL, shellSource());
  writeFileSync(PROBE, classShellProbeSource());
  writeFileSync(
    DROPIN,
    `<?php
require_once ${phpString(resolve(SHELL))};
#[AllowDynamicProperties]
class WPHX_305_26_Dropin_Wpdb extends WPHX_305_26_Wpdb_Class_Shell {
}
$wpdb = new WPHX_305_26_Dropin_Wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
`
  );
  writeFileSync(DROPIN_PROBE, dropinProbeSource());
}

function runJsonPhp(path, runtime, port) {
  return JSON.parse(command("php", [path, "127.0.0.1", String(port), DB_USER, DB_PASSWORD, DB_NAME, runtime.id]));
}

function analyzeGeneratedStrategy() {
  const source = readFileSync(STRATEGY_PHP, "utf8");
  return {
    path: STRATEGY_PHP,
    bytes: statSync(STRATEGY_PHP).size,
    sha256: sha256File(STRATEGY_PHP),
    entry_path: ENTRY_PHP,
    entry_sha256: sha256File(ENTRY_PHP),
    generated_php_postprocessing_required: false,
    methods: {
      class_shell_kind: /function classShellKind\s*\(/.test(source),
      constructor_argument_properties: /function constructorArgumentProperties\s*\(/.test(source),
      constructor_side_effect_properties: /function constructorSideEffectProperties\s*\(/.test(source),
      parent_visible_native_resource_properties: /function parentVisibleNativeResourceProperties\s*\(/.test(source),
      lazy_parent_loaded_properties: /function lazyParentLoadedProperties\s*\(/.test(source),
      plugin_abi_compatibility_properties: /function pluginAbiCompatibilityProperties\s*\(/.test(source),
      bootstrap_entry_points: /function bootstrapEntryPoints\s*\(/.test(source),
      native_resource_write_route: /function nativeResourceWriteRoute\s*\(/.test(source),
      lazy_read_route: /function lazyReadRoute\s*\(/.test(source),
      bootstrap_route: /function bootstrapRoute\s*\(/.test(source),
      preserves_plugin_abi_compatibility: /function preservesPluginAbiCompatibility\s*\(/.test(source),
      preserves_require_wp_db_dropin_replacement: /function preservesRequireWpDbDropinReplacement\s*\(/.test(source),
      uses_expanded_public_state_adapter: /function usesExpandedPublicStateAdapter\s*\(/.test(source)
    }
  };
}

function runtimeSummary(runtime, probe, dropinProbe, image, query) {
  return {
    id: runtime.id,
    engine: runtime.engine,
    image,
    server: {
      version: query.version,
      comment: query.comment,
      db_name: query.db_name
    },
    class_shell_probe: probe,
    dropin_probe: dropinProbe,
    passed:
      probe.status === "passed" &&
      Object.values(probe.comparisons).every(Boolean) &&
      dropinProbe.dropin_replacement_preserved === true &&
      dropinProbe.constructor_side_effects_available === true &&
      dropinProbe.actual_result_available === true &&
      dropinProbe.lazy_col_info_available === true &&
      dropinProbe.dynamic_plugin_property_available === true
  };
}

function sanitizedRunCommand(path, runtime) {
  return `php ${path} 127.0.0.1 <port> ${DB_USER} <password> ${DB_NAME} ${runtime.id}`;
}

function ownershipManifest(manifestSha, upstreamDigest, runtimes) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-class-shell-resource-strategy-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "module",
      name: "wpdb class shell native resource strategy",
      area: "wp-includes",
      public_contract:
        "WordPress-compatible wpdb remains a PHP-visible class/global with declared public properties, dynamic plugin properties, magic accessors, live constructor side effects, native mysqli handles/results, lazy col_info materialization, and require_wp_db()/db.php replacement behavior preserved while typed Haxe owns class-shell/resource/bootstrap route policy."
    },
    ownership_state: "haxe_parity_candidate",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: [
      HXML,
      "src/wphx/wp/db/WpdbClassShellStrategy.hx",
      "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbClassShellResourceStrategyCandidateEntry.hx",
      "tools/wp-core/run-wpdb-class-shell-resource-strategy-candidate.mjs",
      OUT,
      RECEIPT
    ],
    generated_paths: [HAXE_OUT, SHELL, PROBE, DROPIN, DROPIN_PROBE, OUT, OWNERSHIP, RECEIPT],
    typed_haxe_ownership: {
      strategy: "wphx.wp.db.WpdbClassShellStrategy",
      owns: [
        "PHP ABI subclass shell classification",
        "constructor argument and side-effect property contract",
        "parent-visible native mysqli resource slot routing",
        "lazy col_info parent-loader routing",
        "plugin ABI compatibility contract",
        "require_wp_db()/db.php bootstrap replacement route",
        "expanded public-state adapter dependency"
      ],
      does_not_yet_own: [
        "full wpdb method bodies",
        "all upstream PHPUnit wpdb/dbDelta/option cases",
        "packaged distribution bootstrap"
      ]
    },
    php_abi_shell: {
      preserved: [
        "class wpdb remains PHP-visible",
        "global $wpdb can be supplied by wp-content/db.php",
        "constructor establishes a live mysqli connection",
        "dbh/result are parent-visible native PHP slots",
        "col_info remains lazily materialized by WordPress parent logic",
        "declared public property reflection shape matches wpdb",
        "dynamic plugin properties remain available",
        "protected magic writes remain blocked"
      ],
      proof:
        `WPHX-305.26 provisions ${runtimes.map((runtime) => runtime.id).join(" and ")} from locked images and compares a WPHX_305_26_Wpdb_Class_Shell subclass against WordPress wpdb for constructor side effects, mysqli_result, lazy col_info, plugin mutation, reflection shape, protected magic write blocks, and db.php replacement.`
    },
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-class-shell-resource-strategy-candidate",
        "npm run wp:core:wphx-305-class-shell-resource-strategy-candidate:check",
        "npm run wp:core:wphx-305-public-state-expanded-storage-adapter-candidate:check",
        "npm run wp:core:wphx-305-public-state-storage-adapter-candidate:check",
        "npm run wp:core:wphx-305-public-state-descriptor-candidate:check",
        "npm run wp:core:wphx-305-row-materialization-candidate:check",
        "npm run wp:core:wphx-305-mysqli-phpglobal-candidate:check",
        "npm run format:haxe:check",
        "npm run haxe:escape-hatches:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-305-26-wpdb-class-shell-resource-strategy-candidate",
        "receipt:wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate",
        "receipt:wphx-305-24-wpdb-public-state-storage-adapter-candidate",
        "receipt:wphx-305-23-wpdb-public-state-descriptor-candidate",
        "receipt:wphx-305-21-wpdb-row-materialization-candidate",
        "receipt:wphx-305-20-wpdb-mysqli-phpglobal-candidate"
      ],
      manifest_digest: manifestSha
    }
  };
}

const publicStateExpandedStorageAdapterCandidate = readJson(PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE);
const publicStateStorageAdapterCandidate = readJson(PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE);
const publicStateDescriptorCandidate = readJson(PUBLIC_STATE_DESCRIPTOR_CANDIDATE);
const rowMaterializationCandidate = readJson(ROW_MATERIALIZATION_CANDIDATE);
const mysqliPhpGlobalCandidate = readJson(MYSQLI_PHPGLOBAL_CANDIDATE);
const rawResourceCandidate = readJson(RAW_RESOURCE_CANDIDATE);
const mysqliBoundaryCandidate = readJson(MYSQLI_BOUNDARY_CANDIDATE);
const toolchainLock = readJson("toolchain.lock.json");
const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const haxeVersion = command("haxe", ["--version"]);

if (!maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"])) {
  console.error(JSON.stringify({ status: "failed", error: "docker server unavailable; WPHX-305.26 requires live DB containers" }, null, 2));
  process.exit(1);
}

rmSync(OUT_ROOT, { recursive: true, force: true });
const compile = run("haxe", [HXML]);
if (compile.status !== 0) {
  console.error(JSON.stringify({ status: "failed", phase: "haxe_compile", compile }, null, 2));
  process.exit(1);
}

writeProbeFiles();
const generatedStrategy = analyzeGeneratedStrategy();
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) => !audit.contains_dynamic && !audit.contains_untyped && !audit.contains_cast && !audit.contains_php_syntax_code
);
const generatedMethodsPresent = Object.values(generatedStrategy.methods).every(Boolean);
const dbRuntimes = dbRuntimeRecords(toolchainLock);
const runtimeResults = [];

for (const runtime of dbRuntimes) {
  const result = await withDbRuntime(runtime, async ({ port, query, image }) => {
    const classShellProbe = runJsonPhp(PROBE, runtime, port);
    const dropinProbe = runJsonPhp(DROPIN_PROBE, runtime, port);
    return runtimeSummary(runtime, classShellProbe, dropinProbe, image, query);
  });
  runtimeResults.push(result);
}

const strategyContract = runtimeResults[0]?.class_shell_probe?.strategy_contract ?? {};
const expectedConstructorArgumentProperties = ["dbhost", "dbname", "dbpassword", "dbuser"];
const expectedConstructorSideEffectProperties = ["dbh", "has_connected", "is_mysql", "ready", "use_mysqli"];
const expectedParentVisibleNativeResourceProperties = ["dbh", "result"];
const expectedLazyParentLoadedProperties = ["col_info"];
const expectedPluginAbiCompatibilityProperties = [
  "declared_public_reflection_shape",
  "dynamic_properties",
  "magic_accessors",
  "protected_magic_write_blocks"
];
const expectedBootstrapEntryPoints = ["require_wp_db", "wp-content/db.php"];
const strategyMatchesPlan = {
  class_shell_kind_is_php_abi_subclass: strategyContract.class_shell_kind === "php_abi_subclass_shell",
  constructor_arguments_match_expected: arraysEqual(
    sorted(strategyContract.constructor_argument_properties ?? []),
    sorted(expectedConstructorArgumentProperties)
  ),
  constructor_side_effects_match_expected: arraysEqual(
    sorted(strategyContract.constructor_side_effect_properties ?? []),
    sorted(expectedConstructorSideEffectProperties)
  ),
  parent_visible_native_resources_match_expected: arraysEqual(
    sorted(strategyContract.parent_visible_native_resource_properties ?? []),
    sorted(expectedParentVisibleNativeResourceProperties)
  ),
  lazy_parent_loaded_properties_match_expected: arraysEqual(
    sorted(strategyContract.lazy_parent_loaded_properties ?? []),
    sorted(expectedLazyParentLoadedProperties)
  ),
  plugin_abi_properties_match_expected: arraysEqual(
    sorted(strategyContract.plugin_abi_compatibility_properties ?? []),
    sorted(expectedPluginAbiCompatibilityProperties)
  ),
  bootstrap_entry_points_match_expected: arraysEqual(sorted(strategyContract.bootstrap_entry_points ?? []), sorted(expectedBootstrapEntryPoints)),
  uses_expanded_public_state_adapter: strategyContract.uses_expanded_public_state_adapter === true
};

const runtimeResultsPassed = runtimeResults.every((result) => result.passed);
const predecessorStatuses = {
  public_state_expanded_storage_adapter: publicStateExpandedStorageAdapterCandidate.validation_result?.status ?? null,
  public_state_storage_adapter: publicStateStorageAdapterCandidate.validation_result?.status ?? null,
  public_state_descriptor: publicStateDescriptorCandidate.validation_result?.status ?? null,
  row_materialization: rowMaterializationCandidate.validation_result?.status ?? null,
  mysqli_phpglobal: mysqliPhpGlobalCandidate.validation_result?.status ?? null,
  raw_resource: rawResourceCandidate.validation_result?.status ?? null,
  mysqli_boundary: mysqliBoundaryCandidate.validation_result?.status ?? null
};
const predecessorsPassed = Object.values(predecessorStatuses).every((status) => status === "passed");
const validationStatus =
  runtimeResultsPassed &&
  Object.values(strategyMatchesPlan).every(Boolean) &&
  sourceEscapeAuditPassed &&
  generatedMethodsPresent &&
  predecessorsPassed
    ? "passed"
    : "failed";

const manifest = {
  schema: "wphx.wp-core-wpdb-class-shell-resource-strategy-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-class-shell-resource-strategy-candidate.mjs",
  inputs: {
    public_state_expanded_storage_adapter_candidate_manifest: inputRecord(PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE),
    public_state_storage_adapter_candidate_manifest: inputRecord(PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE),
    public_state_descriptor_candidate_manifest: inputRecord(PUBLIC_STATE_DESCRIPTOR_CANDIDATE),
    row_materialization_candidate_manifest: inputRecord(ROW_MATERIALIZATION_CANDIDATE),
    mysqli_phpglobal_candidate_manifest: inputRecord(MYSQLI_PHPGLOBAL_CANDIDATE),
    raw_resource_candidate_manifest: inputRecord(RAW_RESOURCE_CANDIDATE),
    mysqli_boundary_candidate_manifest: inputRecord(MYSQLI_BOUNDARY_CANDIDATE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "typed_haxe_wpdb_class_shell_resource_strategy",
    selected_strategy: "typed-wpdb-class-shell-resource-strategy-and-live-php-abi-shell",
    haxe_version: haxeVersion,
    locked_haxe_version: toolchainLock.tools.haxe.version,
    locked_php_cli: toolchainLock.tools.php_cli.executable,
    generated_haxe_files: filesUnder(HAXE_OUT),
    haxe_class_shell_strategy: {
      source: "src/wphx/wp/db/WpdbClassShellStrategy.hx",
      generated_php: generatedStrategy,
      source_escape_audits: haxeSourceAudits,
      strategy_matches_plan: strategyMatchesPlan,
      runtime_results: runtimeResults.map((result) => ({
        id: result.id,
        engine: result.engine,
        image: result.image,
        server: result.server,
        class_shell_probe_status: result.class_shell_probe.status,
        dropin_probe_status: result.dropin_probe.dropin_replacement_preserved ? "passed" : "failed",
        comparisons: result.class_shell_probe.comparisons,
        dropin_probe: result.dropin_probe,
        passed: result.passed
      }))
    },
    public_abi_policy: {
      preserve_class_name_wpdb: true,
      preserve_global_wpdb: true,
      preserve_db_php_dropin_replacement: true,
      preserve_declared_public_properties: true,
      preserve_dynamic_properties: true,
      preserve_magic_accessors: true,
      preserve_protected_magic_write_blocks: true,
      preserve_constructor_side_effects: true,
      preserve_actual_mysqli_resource_behavior: true,
      preserve_lazy_col_info_materialization: true,
      raw_php_syntax_code_used_in_haxe: false,
      generated_php_postprocessing_required: false
    },
    inherited_candidates: {
      public_state_expanded_storage_adapter: {
        manifest: PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE,
        validation_result: publicStateExpandedStorageAdapterCandidate.validation_result
      },
      public_state_storage_adapter: {
        manifest: PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE,
        validation_result: publicStateStorageAdapterCandidate.validation_result
      },
      public_state_descriptor: {
        manifest: PUBLIC_STATE_DESCRIPTOR_CANDIDATE,
        validation_result: publicStateDescriptorCandidate.validation_result
      },
      row_materialization: {
        manifest: ROW_MATERIALIZATION_CANDIDATE,
        validation_result: rowMaterializationCandidate.validation_result
      },
      mysqli_phpglobal: {
        manifest: MYSQLI_PHPGLOBAL_CANDIDATE,
        validation_result: mysqliPhpGlobalCandidate.validation_result
      }
    },
    closes_gaps_from: [
      {
        manifest: PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE,
        gap: "complete-wpdb-class-shell-not-yet-haxe-owned",
        resolution:
          "WPHX-305.26 adds typed Haxe class-shell/resource/bootstrap route policy and proves a PHP ABI subclass shell against live WordPress wpdb constructor, actual mysqli handles/results, lazy col_info materialization, plugin dynamic properties, reflection shape, protected magic write blocks, and require_wp_db()/db.php replacement."
      },
      {
        manifest: ROW_MATERIALIZATION_CANDIDATE,
        gap: "full-wpdb-replacement-dropin-behavior-not-yet-proven",
        resolution:
          "WPHX-305.26 keeps the row materialization/live mysqli gates green while adding db.php replacement and global $wpdb bootstrap proof for the class shell."
      }
    ],
    remaining_gaps: [
      {
        id: "full-wpdb-method-bodies-not-yet-haxe-owned",
        owner: "WPHX-305.27",
        detail:
          "WPHX-305.26 owns the class-shell/resource/bootstrap strategy and proves live PHP ABI behavior, but the broad wpdb method bodies are still represented by WordPress PHP parent methods around typed Haxe helper slices."
      },
      {
        id: "packaged-distribution-bootstrap-not-yet-owned",
        owner: "future WPHX-305 distribution workset",
        detail:
          "The probe proves require_wp_db()/db.php replacement semantics in isolation. Packaging the replacement into a distributable WordPress core layout remains future distribution work."
      },
      {
        id: "full-upstream-phpunit-not-yet-ported",
        owner: "WPHX-305",
        detail:
          "Storage ABI probes and live DB candidate gates cover this slice, but full upstream wpdb/dbDelta/option PHPUnit parity remains a domain closure requirement."
      }
    ]
  },
  validation_result: {
    status: validationStatus,
    selected_strategy: "typed-wpdb-class-shell-resource-strategy-and-live-php-abi-shell",
    db_runtimes: runtimeResults.length,
    runtime_results_passed: runtimeResultsPassed,
    constructor_side_effects_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.constructor_side_effects_preserved),
    actual_mysqli_query_result_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.actual_mysqli_query_result_preserved),
    lazy_col_info_materialization_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.lazy_col_info_materialization_preserved),
    parent_visible_native_resource_bridge_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.parent_visible_native_resource_bridge_preserved
    ),
    plugin_dynamic_property_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.plugin_dynamic_property_preserved),
    protected_magic_write_blocks_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.protected_magic_write_blocks_preserved),
    reflection_public_properties_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.reflection_public_properties_preserved),
    require_wp_db_dropin_replacement_preserved: runtimeResults.every((result) => result.dropin_probe.dropin_replacement_preserved),
    source_escape_audit_passed: sourceEscapeAuditPassed,
    generated_methods_present: generatedMethodsPresent,
    strategy_matches_plan: Object.values(strategyMatchesPlan).every(Boolean),
    predecessor_statuses: predecessorStatuses
  }
};

if (validationStatus !== "passed") {
  console.error(JSON.stringify({ status: "failed", validation_result: manifest.validation_result }, null, 2));
  process.exit(1);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest, dbRuntimes), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-26-wpdb-class-shell-resource-strategy-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "typed Haxe wpdb class-shell/resource strategy candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "class-shell/resource/bootstrap strategy ownership manifest"
    },
    {
      path: "src/wphx/wp/db/WpdbClassShellStrategy.hx",
      role: "typed Haxe wpdb class-shell/resource route policy"
    },
    {
      path: "tools/wp-core/run-wpdb-class-shell-resource-strategy-candidate.mjs",
      role: "live class-shell/resource/drop-in proof runner"
    },
    {
      path: "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
      role: "predecessor expanded public-state adapter kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbMysqliExecution.hx",
      role: "predecessor typed Haxe mysqli @:phpGlobal execution implementation kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbRowMaterialization.hx",
      role: "predecessor typed Haxe row materialization implementation kept green"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-class-shell-resource-strategy-candidate",
    "npm run wp:core:wphx-305-class-shell-resource-strategy-candidate:check",
    "npm run wp:core:wphx-305-public-state-expanded-storage-adapter-candidate:check",
    "npm run wp:core:wphx-305-public-state-storage-adapter-candidate:check",
    "npm run wp:core:wphx-305-public-state-descriptor-candidate:check",
    "npm run wp:core:wphx-305-row-materialization-candidate:check",
    "npm run wp:core:wphx-305-mysqli-phpglobal-candidate:check",
    "npm run format:haxe:check",
    "npm run haxe:escape-hatches:check",
    "npm run beads:validate",
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
      selected_strategy: manifest.validation_result.selected_strategy,
      db_runtimes: manifest.validation_result.db_runtimes,
      constructor_side_effects_preserved: manifest.validation_result.constructor_side_effects_preserved,
      actual_mysqli_query_result_preserved: manifest.validation_result.actual_mysqli_query_result_preserved,
      lazy_col_info_materialization_preserved: manifest.validation_result.lazy_col_info_materialization_preserved,
      parent_visible_native_resource_bridge_preserved: manifest.validation_result.parent_visible_native_resource_bridge_preserved,
      require_wp_db_dropin_replacement_preserved: manifest.validation_result.require_wp_db_dropin_replacement_preserved
    },
    null,
    2
  )
);
