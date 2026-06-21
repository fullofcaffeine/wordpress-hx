#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.25",
  external_ref: "WPHX-305.25",
  title: "Expand wpdb public-state storage adapter coverage"
};
const HXML = "fixtures/wp-core/wpdb-public-state-expanded-storage-adapter-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-305-25";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/candidate-shell.php`;
const PROBE = `${OUT_ROOT}/storage-adapter-probe.php`;
const DROPIN_DIR = `${OUT_ROOT}/wp-content`;
const DROPIN = `${DROPIN_DIR}/db.php`;
const DROPIN_PROBE = `${OUT_ROOT}/dropin-probe.php`;
const STORAGE_ADAPTER_PHP = `${HAXE_OUT}/lib/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.php`;
const DESCRIPTOR_PHP = `${HAXE_OUT}/lib/wphx/wp/db/WpdbPublicStateDescriptor.php`;
const ENTRY_PHP = `${HAXE_OUT}/lib/wphx/fixtures/wp/core/WpdbPublicStateExpandedStorageAdapterCandidateEntry.php`;
const OUT = "manifests/wp-core/wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate.v1.json";
const PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE = "manifests/wp-core/wphx-305-24-wpdb-public-state-storage-adapter-candidate.v1.json";
const PUBLIC_STATE_DESCRIPTOR_CANDIDATE = "manifests/wp-core/wphx-305-23-wpdb-public-state-descriptor-candidate.v1.json";
const PUBLIC_STATE_PLAN = "manifests/wp-core/wphx-305-22-wpdb-dropin-public-state-plan.v1.json";
const ROW_MATERIALIZATION_CANDIDATE = "manifests/wp-core/wphx-305-21-wpdb-row-materialization-candidate.v1.json";
const MYSQLI_PHPGLOBAL_CANDIDATE = "manifests/wp-core/wphx-305-20-wpdb-mysqli-phpglobal-candidate.v1.json";
const RECORDED_AT = "2026-06-21T07:35:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wpdb.php",
  "src/wp-includes/load.php",
  "src/wp-includes/wp-db.php",
  "src/wp-settings.php"
];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
  "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbPublicStateExpandedStorageAdapterCandidateEntry.hx"
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-public-state-expanded-storage-adapter-candidate`);
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

function analyzeGeneratedStorageAdapter() {
  const source = readFileSync(STORAGE_ADAPTER_PHP, "utf8");
  return {
    path: STORAGE_ADAPTER_PHP,
    bytes: statSync(STORAGE_ADAPTER_PHP).size,
    sha256: sha256File(STORAGE_ADAPTER_PHP),
    descriptor_path: DESCRIPTOR_PHP,
    descriptor_sha256: sha256File(DESCRIPTOR_PHP),
    entry_path: ENTRY_PHP,
    entry_sha256: sha256File(ENTRY_PHP),
    generated_php_postprocessing_required: false,
    methods: {
      expanded_public_storage_properties: /function expandedPublicStorageProperties\s*\(/.test(source),
      expanded_magic_storage_properties: /function expandedMagicStorageProperties\s*\(/.test(source),
      lazy_magic_native_boundary_properties: /function lazyMagicNativeBoundaryProperties\s*\(/.test(source),
      native_resource_boundary_properties: /function nativeResourceBoundaryProperties\s*\(/.test(source),
      native_array_public_properties: /function nativeArrayPublicProperties\s*\(/.test(source),
      native_array_magic_properties: /function nativeArrayMagicProperties\s*\(/.test(source),
      public_default_kind: /function publicDefaultKind\s*\(/.test(source),
      magic_default_kind: /function magicDefaultKind\s*\(/.test(source),
      should_route_public_write_to_php_property: /function shouldRoutePublicWriteToPhpProperty\s*\(/.test(source),
      should_route_dynamic_write_to_php_property: /function shouldRouteDynamicWriteToPhpProperty\s*\(/.test(source),
      should_route_magic_write_to_storage: /function shouldRouteMagicWriteToStorage\s*\(/.test(source),
      should_defer_magic_read_to_wordpress_lazy_boundary: /function shouldDeferMagicReadToWordPressLazyBoundary\s*\(/.test(source),
      should_block_magic_write: /function shouldBlockMagicWrite\s*\(/.test(source),
      write_route: /function writeRoute\s*\(/.test(source),
      complete_declared_public_state_coverage: /function completeDeclaredPublicStateCoverage\s*\(/.test(source)
    },
    evidence_lines: source
      .split(/\r?\n/)
      .map((line, index) => ({ line: index + 1, text: line.trimEnd() }))
      .filter((entry) =>
        [
          "function expandedPublicStorageProperties",
          "function expandedMagicStorageProperties",
          "function lazyMagicNativeBoundaryProperties",
          "function nativeResourceBoundaryProperties",
          "function publicDefaultKind",
          "function magicDefaultKind",
          "function shouldRouteMagicWriteToStorage",
          "function shouldRouteDynamicWriteToPhpProperty"
        ].some((needle) => entry.text.includes(needle))
      )
  };
}

function shellSource() {
  return `<?php
require_once ${phpString(resolve(`${HAXE_OUT}/index.php`))};
if (!class_exists('wpdb')) {
  require_once ${phpString(resolve(upstreamPath("src/wp-includes/class-wpdb.php")))};
}

if (!function_exists('wphx_305_25_native_array')) {
  function wphx_305_25_native_array($values): array {
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
class WPHX_305_25_Wpdb_Expanded_State_Shell extends wpdb {
  private array $wphx_magic_storage = array();

  public function __construct() {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    foreach (wphx_305_25_native_array($adapter::expandedPublicStorageProperties()) as $name) {
      $this->$name = $this->wphx_public_default_value($name);
    }
    foreach (wphx_305_25_native_array($adapter::expandedMagicStorageProperties()) as $name) {
      $this->wphx_magic_storage[$name] = $this->wphx_magic_default_value($name);
    }
  }

  private function wphx_public_default_value(string $name) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    $kind = $adapter::publicDefaultKind($name);
    if ('native_php_array' === $kind) {
      return wphx_305_25_native_array($adapter::publicNativeArrayDefaultValues($name));
    }
    if ('string' === $kind) {
      return $adapter::publicStringDefault($name);
    }
    if ('int' === $kind) {
      return $adapter::publicIntDefault($name);
    }
    if ('bool' === $kind) {
      return $adapter::publicBoolDefault($name);
    }
    return null;
  }

  private function wphx_magic_default_value(string $name) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    $kind = $adapter::magicDefaultKind($name);
    if ('string' === $kind) {
      return $adapter::magicStringDefault($name);
    }
    if ('bool' === $kind) {
      return $adapter::magicBoolDefault($name);
    }
    if ('int' === $kind) {
      return $adapter::magicIntDefault($name);
    }
    if ('native_php_array' === $kind) {
      return wphx_305_25_native_array($adapter::magicNativeArrayDefaultValues($name));
    }
    return null;
  }

  public function __get($name) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    if ($adapter::shouldRouteMagicReadToStorage($name) && array_key_exists($name, $this->wphx_magic_storage)) {
      return $this->wphx_magic_storage[$name];
    }
    return parent::__get($name);
  }

  public function __set($name, $value) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    if ($adapter::shouldBlockMagicWrite($name)) {
      return;
    }
    if ($adapter::shouldRouteMagicWriteToStorage($name)) {
      $this->wphx_magic_storage[$name] = $value;
      return;
    }
    if ($adapter::shouldRouteDynamicWriteToPhpProperty($name)) {
      $this->$name = $value;
      return;
    }
    parent::__set($name, $value);
  }

  public function __isset($name) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    if ($adapter::shouldRouteMagicReadToStorage($name) && array_key_exists($name, $this->wphx_magic_storage)) {
      return isset($this->wphx_magic_storage[$name]);
    }
    return parent::__isset($name);
  }

  public function __unset($name) {
    $adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
    if ($adapter::shouldRouteMagicWriteToStorage($name)) {
      unset($this->wphx_magic_storage[$name]);
      return;
    }
    parent::__unset($name);
  }
}
`;
}

function storageProbeSource() {
  return `<?php
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

require_once ${phpString(resolve(upstreamPath("src/wp-includes/class-wpdb.php")))};
require_once ${phpString(resolve(SHELL))};

function wphx_305_25_normalized_value($value): array {
  if (is_array($value)) {
    ksort($value);
    return array('type' => 'array', 'count' => count($value), 'json' => json_encode($value));
  }
  if (is_bool($value)) {
    return array('type' => 'bool', 'value' => $value);
  }
  if (is_int($value)) {
    return array('type' => 'int', 'value' => $value);
  }
  if (is_float($value)) {
    return array('type' => 'float', 'value' => $value);
  }
  if (is_null($value)) {
    return array('type' => 'null', 'value' => null);
  }
  return array('type' => gettype($value), 'value' => (string) $value);
}

function wphx_305_25_public_snapshot($object, array $names): array {
  $snapshot = array();
  foreach ($names as $name) {
    $snapshot[$name] = wphx_305_25_normalized_value($object->$name);
  }
  return $snapshot;
}

function wphx_305_25_magic_snapshot($object, array $names): array {
  $snapshot = array();
  foreach ($names as $name) {
    $snapshot[$name] = array(
      'isset' => $object->__isset($name),
      'value' => wphx_305_25_normalized_value($object->__get($name))
    );
  }
  return $snapshot;
}

function wphx_305_25_lazy_boundary_snapshot($object, array $names): array {
  $snapshot = array();
  foreach ($names as $name) {
    try {
      $snapshot[$name] = array(
        'threw' => false,
        'value' => wphx_305_25_normalized_value($object->__get($name))
      );
    } catch (Throwable $error) {
      $snapshot[$name] = array(
        'threw' => true,
        'class' => get_class($error)
      );
    }
  }
  return $snapshot;
}

function wphx_305_25_protected_write_block_snapshot($object): array {
  $result = array();
  foreach (array('allow_unsafe_unquoted_parameters', 'check_current_query', 'col_meta', 'table_charset') as $name) {
    $before = wphx_305_25_normalized_value($object->__get($name));
    $object->__set($name, '__wphx_block_probe__');
    $after = wphx_305_25_normalized_value($object->__get($name));
    $result[$name] = array(
      'before' => $before,
      'after' => $after,
      'blocked' => $before === $after
    );
  }
  return $result;
}

function wphx_305_25_write_public_probe_values($object): void {
  $object->base_prefix = 'base_';
  $object->blogid = 2;
  $object->blogmeta = 'base_blogmeta';
  $object->blogs = 'base_blogs';
  $object->charset = 'utf8mb4';
  $object->collate = 'utf8mb4_unicode_ci';
  $object->commentmeta = 'base_commentmeta';
  $object->comments = 'base_comments';
  $object->error = 'public-error';
  $object->field_types = array('option_id' => '%d', 'post_author' => '%d');
  $object->func_call = 'wpdb::query';
  $object->global_tables = array('users', 'usermeta', 'wphx_global');
  $object->insert_id = 11;
  $object->is_mysql = true;
  $object->last_error = 'last-public-error';
  $object->last_query = 'SELECT 1';
  $object->last_result = array('row-one', 'row-two');
  $object->links = 'base_links';
  $object->ms_global_tables = array('blogs', 'blogmeta', 'wphx_ms_global');
  $object->num_queries = 13;
  $object->num_rows = 7;
  $object->old_ms_global_tables = array('sitecategories', 'old_ms_extra');
  $object->old_tables = array('categories', 'post2cat', 'link2cat', 'old_extra');
  $object->options = 'base_options';
  $object->postmeta = 'base_postmeta';
  $object->posts = 'base_posts';
  $object->prefix = 'wp_';
  $object->queries = array('SELECT 1');
  $object->ready = true;
  $object->registration_log = 'base_registration_log';
  $object->rows_affected = 3;
  $object->show_errors = true;
  $object->signups = 'base_signups';
  $object->site = 'base_site';
  $object->sitecategories = 'base_sitecategories';
  $object->siteid = 5;
  $object->sitemeta = 'base_sitemeta';
  $object->suppress_errors = true;
  $object->tables = array('posts', 'comments', 'wphx_table');
  $object->term_relationships = 'base_term_relationships';
  $object->term_taxonomy = 'base_term_taxonomy';
  $object->termmeta = 'base_termmeta';
  $object->terms = 'base_terms';
  $object->time_start = 123.456;
  $object->usermeta = 'base_usermeta';
  $object->users = 'base_users';
}

function wphx_305_25_write_magic_probe_values($object): void {
  $object->__set('checking_collation', true);
  $object->__set('dbh', 'native-resource-boundary-dbh');
  $object->__set('dbhost', '127.0.0.1');
  $object->__set('dbname', 'wordpresshx');
  $object->__set('dbpassword', 'secret-redacted');
  $object->__set('dbuser', 'wp_user');
  $object->__set('has_connected', true);
  $object->__set('incompatible_modes', array('ANSI', 'TRADITIONAL'));
  $object->__set('reconnect_retries', 9);
  $object->__set('result', 'native-resource-boundary-result');
  $object->__set('use_mysqli', false);
}

function wphx_305_25_public_array_snapshot(array $snapshot): array {
  return array(
    'field_types' => $snapshot['field_types'],
    'global_tables' => $snapshot['global_tables'],
    'ms_global_tables' => $snapshot['ms_global_tables'],
    'old_ms_global_tables' => $snapshot['old_ms_global_tables'],
    'old_tables' => $snapshot['old_tables'],
    'tables' => $snapshot['tables']
  );
}

function wphx_305_25_magic_array_snapshot(array $snapshot): array {
  return array(
    'col_meta' => $snapshot['col_meta'],
    'incompatible_modes' => $snapshot['incompatible_modes'],
    'table_charset' => $snapshot['table_charset']
  );
}

function wphx_305_25_reflection_shape(string $class_name): array {
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

function wphx_305_25_exercise_state_object($object, array $public_names, array $magic_names, array $lazy_magic_names): array {
  $initial_public = wphx_305_25_public_snapshot($object, $public_names);
  $initial_magic = wphx_305_25_magic_snapshot($object, $magic_names);
  $lazy_magic = wphx_305_25_lazy_boundary_snapshot($object, $lazy_magic_names);

  wphx_305_25_write_public_probe_values($object);
  $after_public_write = wphx_305_25_public_snapshot($object, $public_names);

  $object->wphx_plugin_extension = 'plugin-value';
  $dynamic_state = array(
    'isset' => isset($object->wphx_plugin_extension),
    'value' => $object->wphx_plugin_extension ?? null,
    'object_vars_has_key' => array_key_exists('wphx_plugin_extension', get_object_vars($object))
  );

  wphx_305_25_write_magic_probe_values($object);
  $after_magic_write = wphx_305_25_magic_snapshot($object, $magic_names);

  $object->__unset('dbhost');
  $after_magic_unset = array(
    'dbhost_isset' => $object->__isset('dbhost')
  );

  return array(
    'initial_public' => $initial_public,
    'after_public_write' => $after_public_write,
    'dynamic_state' => $dynamic_state,
    'initial_magic' => $initial_magic,
    'lazy_magic' => $lazy_magic,
    'after_magic_write' => $after_magic_write,
    'after_magic_unset' => $after_magic_unset,
    'protected_write_blocks' => wphx_305_25_protected_write_block_snapshot($object)
  );
}

$adapter = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateExpandedStorageAdapter';
$oracle_reflection = new ReflectionClass('wpdb');
$oracle = $oracle_reflection->newInstanceWithoutConstructor();
$candidate = new WPHX_305_25_Wpdb_Expanded_State_Shell();

$adapter_contract = array(
  'expanded_public_storage_properties' => wphx_305_25_native_array($adapter::expandedPublicStorageProperties()),
  'expanded_magic_storage_properties' => wphx_305_25_native_array($adapter::expandedMagicStorageProperties()),
  'lazy_magic_native_boundary_properties' => wphx_305_25_native_array($adapter::lazyMagicNativeBoundaryProperties()),
  'native_resource_boundary_properties' => wphx_305_25_native_array($adapter::nativeResourceBoundaryProperties()),
  'native_array_public_properties' => wphx_305_25_native_array($adapter::nativeArrayPublicProperties()),
  'native_array_magic_properties' => wphx_305_25_native_array($adapter::nativeArrayMagicProperties()),
  'complete_declared_public_state_coverage' => $adapter::completeDeclaredPublicStateCoverage(),
  'field_types_direct_mutation_allowed' => $adapter::fieldTypesDirectMutationAllowed(),
  'table_prefix_mutation_allowed' => $adapter::tablePrefixMutationAllowed(),
  'dynamic_plugin_property_allowed' => $adapter::dynamicPluginPropertyAllowed(),
  'dbhost_write_route' => $adapter::writeRoute('dbhost'),
  'dbh_write_route' => $adapter::writeRoute('dbh'),
  'result_write_route' => $adapter::writeRoute('result'),
  'col_meta_write_route' => $adapter::writeRoute('col_meta'),
  'col_info_write_route' => $adapter::writeRoute('col_info'),
  'field_types_write_route' => $adapter::writeRoute('field_types'),
  'base_prefix_write_route' => $adapter::writeRoute('base_prefix'),
  'dynamic_write_route' => $adapter::writeRoute('wphx_plugin_extension'),
  'preserves_db_dropin_replacement' => $adapter::preservesDbDropinReplacement()
);

$public_names = $adapter_contract['expanded_public_storage_properties'];
$magic_names = $adapter_contract['expanded_magic_storage_properties'];
$lazy_magic_names = $adapter_contract['lazy_magic_native_boundary_properties'];
$oracle_snapshot = wphx_305_25_exercise_state_object($oracle, $public_names, $magic_names, $lazy_magic_names);
$candidate_snapshot = wphx_305_25_exercise_state_object($candidate, $public_names, $magic_names, $lazy_magic_names);
$oracle_reflection_shape = wphx_305_25_reflection_shape('wpdb');
$candidate_reflection_shape = wphx_305_25_reflection_shape('WPHX_305_25_Wpdb_Expanded_State_Shell');
$comparisons = array(
  'state_snapshots_match' => $oracle_snapshot === $candidate_snapshot,
  'field_types_direct_mutation_preserved' => $candidate_snapshot['after_public_write']['field_types'] === $oracle_snapshot['after_public_write']['field_types'],
  'table_prefix_mutation_preserved' => $candidate_snapshot['after_public_write']['prefix'] === $oracle_snapshot['after_public_write']['prefix'] && $candidate_snapshot['after_public_write']['base_prefix'] === $oracle_snapshot['after_public_write']['base_prefix'],
  'native_public_array_defaults_preserved' => wphx_305_25_public_array_snapshot($candidate_snapshot['initial_public']) === wphx_305_25_public_array_snapshot($oracle_snapshot['initial_public']),
  'native_magic_array_defaults_preserved' => wphx_305_25_magic_array_snapshot($candidate_snapshot['initial_magic']) === wphx_305_25_magic_array_snapshot($oracle_snapshot['initial_magic']),
  'native_resource_boundaries_preserved' => $candidate_snapshot['after_magic_write']['dbh'] === $oracle_snapshot['after_magic_write']['dbh'] && $candidate_snapshot['after_magic_write']['result'] === $oracle_snapshot['after_magic_write']['result'],
  'dynamic_property_addition_preserved' => $candidate_snapshot['dynamic_state'] === $oracle_snapshot['dynamic_state'],
  'magic_internal_write_preserved' => $candidate_snapshot['after_magic_write'] === $oracle_snapshot['after_magic_write'],
  'lazy_magic_boundary_preserved' => $candidate_snapshot['lazy_magic'] === $oracle_snapshot['lazy_magic'],
  'protected_write_blocks_preserved' => $candidate_snapshot['protected_write_blocks'] === $oracle_snapshot['protected_write_blocks'],
  'reflection_public_properties_preserved' => $candidate_reflection_shape['public_properties'] === $oracle_reflection_shape['public_properties'],
  'reflection_public_magic_methods_preserved' => $candidate_reflection_shape['public_magic_methods'] === $oracle_reflection_shape['public_magic_methods'],
  'reflection_dynamic_properties_preserved' => $candidate_reflection_shape['allows_dynamic_properties'] === $oracle_reflection_shape['allows_dynamic_properties'],
  'adapter_expands_complete_declared_public_state' => true === $adapter_contract['complete_declared_public_state_coverage'],
  'adapter_routes_public_field_types' => 'direct_public_php_property' === $adapter_contract['field_types_write_route'],
  'adapter_routes_public_base_prefix' => 'direct_public_php_property' === $adapter_contract['base_prefix_write_route'],
  'adapter_routes_magic_dbhost' => 'magic_storage' === $adapter_contract['dbhost_write_route'],
  'adapter_routes_native_resource_boundaries' => 'magic_storage' === $adapter_contract['dbh_write_route'] && 'magic_storage' === $adapter_contract['result_write_route'],
  'adapter_blocks_col_meta' => 'protected_magic_write_block' === $adapter_contract['col_meta_write_route'],
  'adapter_defers_lazy_col_info' => 'wordpress_lazy_magic_boundary' === $adapter_contract['col_info_write_route'],
  'adapter_routes_dynamic_plugin_property' => 'dynamic_php_property' === $adapter_contract['dynamic_write_route']
);

echo json_encode(
  array(
    'adapter_contract' => $adapter_contract,
    'oracle' => $oracle_snapshot,
    'candidate' => $candidate_snapshot,
    'reflection' => array(
      'oracle' => $oracle_reflection_shape,
      'candidate' => $candidate_reflection_shape
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
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

define('ABSPATH', ${phpString(`${resolve(UPSTREAM_ROOT)}/src/`)});
define('WPINC', 'wp-includes');
define('WP_CONTENT_DIR', ${phpString(resolve(DROPIN_DIR))});

require_once ${phpString(resolve(upstreamPath("src/wp-includes/load.php")))};

require_wp_db();
global $wpdb;

echo json_encode(
  array(
    'class_wpdb_loaded' => class_exists('wpdb'),
    'global_wpdb_set' => isset($wpdb),
    'global_wpdb_class' => is_object($wpdb) ? get_class($wpdb) : null,
    'global_wpdb_marker' => is_object($wpdb) && isset($wpdb->marker) ? $wpdb->marker : null,
    'dropin_replacement_preserved' => is_object($wpdb) && 'WPHX_305_25_Dropin_Wpdb' === get_class($wpdb),
    'default_wpdb_constructor_skipped' => is_object($wpdb) && 'dropin' === ($wpdb->marker ?? null),
    'adapter_public_state_available' => is_object($wpdb) && 'dropin-error' === $wpdb->last_error,
    'adapter_prefix_state_available' => is_object($wpdb) && 'drop_' === $wpdb->prefix && 'drop_base_' === $wpdb->base_prefix,
    'adapter_field_types_native_array_available' => is_object($wpdb) && is_array($wpdb->field_types) && '%d' === ($wpdb->field_types['drop_id'] ?? null),
    'adapter_magic_state_available' => is_object($wpdb) && 'dropin-db' === $wpdb->__get('dbhost')
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function writeProbeFiles() {
  mkdirSync(OUT_ROOT, { recursive: true });
  mkdirSync(DROPIN_DIR, { recursive: true });
  writeFileSync(SHELL, shellSource());
  writeFileSync(PROBE, storageProbeSource());
  writeFileSync(
    DROPIN,
    `<?php
require_once ${phpString(resolve(SHELL))};
class WPHX_305_25_Dropin_Wpdb extends WPHX_305_25_Wpdb_Expanded_State_Shell {
  public string $marker = 'dropin';
}
$wpdb = new WPHX_305_25_Dropin_Wpdb();
$wpdb->last_error = 'dropin-error';
$wpdb->prefix = 'drop_';
$wpdb->base_prefix = 'drop_base_';
$wpdb->field_types = array('drop_id' => '%d');
$wpdb->__set('dbhost', 'dropin-db');
`
  );
  writeFileSync(DROPIN_PROBE, dropinProbeSource());
}

function runJsonPhp(path) {
  return JSON.parse(command("php", [path]));
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-public-state-expanded-storage-adapter-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "module",
      name: "wpdb public-state expanded storage adapter shell proof",
      area: "wp-includes",
      public_contract:
        "WordPress-compatible wpdb remains a PHP-visible class/global object with declared public fields, dynamic properties, magic accessors, protected __set write-block behavior, field_types direct mutation, and db.php replacement timing intact while typed Haxe owns expanded public/magic state default and write-routing policy."
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
      "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
      "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
      "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbPublicStateExpandedStorageAdapterCandidateEntry.hx",
      "tools/wp-core/run-wpdb-public-state-expanded-storage-adapter-candidate.mjs",
      OUT,
      RECEIPT
    ],
    generated_paths: [HAXE_OUT, SHELL, PROBE, DROPIN, DROPIN_PROBE, OUT, OWNERSHIP, RECEIPT],
    typed_haxe_ownership: {
      adapter: "wphx.wp.db.WpdbPublicStateExpandedStorageAdapter",
      owns: [
        "all declared public property default kind/value policy",
        "expanded magic-visible property default kind/value policy except lazy col_info",
        "direct public write shell-routing policy",
        "dynamic plugin property shell-routing policy",
        "magic-visible storage write-routing policy",
        "protected __set write-block routing policy",
        "native PHP array default shape policy",
        "native resource boundary routing policy",
        "lazy col_info boundary routing policy",
        "reflection shape compatibility policy",
        "db.php replacement preservation flag"
      ],
      does_not_yet_own: [
        "complete wpdb class replacement",
        "actual mysqli resource values",
        "lazy col_info materialization",
        "wpdb constructor side effects",
        "require_wp_db() bootstrap implementation",
        "db.php drop-in loading"
      ]
    },
    php_abi_shell: {
      preserved: [
        "class wpdb remains PHP-visible",
        "global $wpdb can be supplied by wp-content/db.php",
        "direct public property reads/writes still use PHP object fields",
        "plugins can add dynamic properties",
        "expanded magic-visible internals route through adapter-backed shell storage",
        "protected magic write blocks remain compatible",
        "field_types and table-list defaults remain native PHP arrays",
        "dbh/result remain native-resource boundaries at the PHP shell",
        "public reflection shape matches wpdb"
      ],
      proof:
        "WPHX-305.25 compares a Haxe-adapter-backed PHP shell against a constructor-free WordPress 7.0 wpdb oracle and also installs that shell through a temp db.php drop-in."
    },
    bridge: {
      kind: "typed_storage_adapter_php_abi_shell",
      reason:
        "This slice moves all declared public defaults plus expanded magic-visible state routing into typed Haxe while keeping mixed native PHP values in the PHP ABI shell. That avoids Dynamic and raw php.Syntax.code while proving public/magic behavior against WordPress before attempting complete wpdb class ownership.",
      bounded_by: [
        "WPHX-305.24 selected storage adapter proof",
        "WPHX-305.23 descriptor/reflection proof",
        "WordPress 7.0 constructor-free wpdb public/magic behavior oracle",
        "Haxe-adapter-backed PHP shell state snapshot comparison",
        "isolated require_wp_db() db.php drop-in probe",
        "WPHX-305.21 row materialization live candidate receipt",
        "WPHX-305.20 mysqli @:phpGlobal live candidate receipt"
      ]
    },
    removal_gate: {
      condition:
        "Do not replace the full wpdb class or require_wp_db() bootstrap until actual mysqli resources, lazy col_info materialization, constructor side effects, live plugin reflection probes, and bootstrap loading are proven under broader WordPress probes.",
      owner_issue: "WPHX-305.26",
      target_state: "verified_haxe_owned_wpdb_class_shell"
    },
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-public-state-expanded-storage-adapter-candidate",
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

const publicStateStorageAdapterCandidate = readJson(PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE);
const publicStateDescriptorCandidate = readJson(PUBLIC_STATE_DESCRIPTOR_CANDIDATE);
const publicStatePlan = readJson(PUBLIC_STATE_PLAN);
const rowMaterializationCandidate = readJson(ROW_MATERIALIZATION_CANDIDATE);
const mysqliPhpGlobalCandidate = readJson(MYSQLI_PHPGLOBAL_CANDIDATE);
const toolchainLock = readJson("toolchain.lock.json");
const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const haxeVersion = command("haxe", ["--version"]);

rmSync(OUT_ROOT, { recursive: true, force: true });
const compile = run("haxe", [HXML]);
if (compile.status !== 0) {
  console.error(JSON.stringify({ status: "failed", phase: "haxe_compile", compile }, null, 2));
  process.exit(1);
}

writeProbeFiles();
const storageProbe = runJsonPhp(PROBE);
const dropinProbe = runJsonPhp(DROPIN_PROBE);
const generatedStorageAdapter = analyzeGeneratedStorageAdapter();
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);

const adapterContract = storageProbe.adapter_contract;
const expectedPublicStorageProperties = publicStatePlan.fixture.public_state.public_properties.map((property) => property.name);
const expectedLazyMagicNativeBoundaryProperties = ["col_info"];
const expectedMagicStorageProperties = publicStatePlan.fixture.public_state.magic_visible_internal_properties
  .map((property) => property.name)
  .filter((name) => !expectedLazyMagicNativeBoundaryProperties.includes(name));
const expectedNativeArrayPublicProperties = [
  "field_types",
  "global_tables",
  "ms_global_tables",
  "old_ms_global_tables",
  "old_tables",
  "tables"
];
const expectedNativeArrayMagicProperties = ["col_meta", "incompatible_modes", "table_charset"];
const expectedNativeResourceBoundaryProperties = ["dbh", "result"];
const adapterMatchesPlan = {
  public_storage_properties_match_expected: arraysEqual(sorted(adapterContract.expanded_public_storage_properties), sorted(expectedPublicStorageProperties)),
  magic_storage_properties_match_expected: arraysEqual(sorted(adapterContract.expanded_magic_storage_properties), sorted(expectedMagicStorageProperties)),
  lazy_magic_native_boundary_properties_match_expected: arraysEqual(
    sorted(adapterContract.lazy_magic_native_boundary_properties),
    sorted(expectedLazyMagicNativeBoundaryProperties)
  ),
  native_array_public_properties_match_expected: arraysEqual(
    sorted(adapterContract.native_array_public_properties),
    sorted(expectedNativeArrayPublicProperties)
  ),
  native_array_magic_properties_match_expected: arraysEqual(
    sorted(adapterContract.native_array_magic_properties),
    sorted(expectedNativeArrayMagicProperties)
  ),
  native_resource_boundary_properties_match_expected: arraysEqual(
    sorted(adapterContract.native_resource_boundary_properties),
    sorted(expectedNativeResourceBoundaryProperties)
  ),
  all_public_storage_properties_are_declared_wpdb_properties: adapterContract.expanded_public_storage_properties.every((name) =>
    publicStatePlan.fixture.public_state.public_properties.some((property) => property.name === name)
  ),
  all_magic_storage_properties_are_magic_visible_wpdb_properties: adapterContract.expanded_magic_storage_properties.every((name) =>
    publicStatePlan.fixture.public_state.magic_visible_internal_properties.some((property) => property.name === name)
  ),
  complete_declared_public_state_coverage: adapterContract.complete_declared_public_state_coverage === true
};
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) => !audit.contains_dynamic && !audit.contains_untyped && !audit.contains_cast && !audit.contains_php_syntax_code
);
const generatedMethodsPresent = Object.values(generatedStorageAdapter.methods).every(Boolean);
const storageProbePassed = storageProbe.status === "passed" && Object.values(storageProbe.comparisons).every(Boolean);
const dropinProbePassed =
  dropinProbe.class_wpdb_loaded === true &&
  dropinProbe.global_wpdb_set === true &&
  dropinProbe.dropin_replacement_preserved === true &&
  dropinProbe.default_wpdb_constructor_skipped === true &&
  dropinProbe.adapter_public_state_available === true &&
  dropinProbe.adapter_prefix_state_available === true &&
  dropinProbe.adapter_field_types_native_array_available === true &&
  dropinProbe.adapter_magic_state_available === true;

const validationStatus =
  storageProbePassed &&
  dropinProbePassed &&
  Object.values(adapterMatchesPlan).every(Boolean) &&
  sourceEscapeAuditPassed &&
  generatedMethodsPresent &&
  adapterContract.field_types_direct_mutation_allowed === true &&
  adapterContract.table_prefix_mutation_allowed === true &&
  adapterContract.complete_declared_public_state_coverage === true &&
  adapterContract.dynamic_plugin_property_allowed === true &&
  adapterContract.preserves_db_dropin_replacement === true &&
  publicStateStorageAdapterCandidate.validation_result?.status === "passed" &&
  publicStateDescriptorCandidate.validation_result?.status === "passed" &&
  rowMaterializationCandidate.validation_result?.status === "passed" &&
  mysqliPhpGlobalCandidate.validation_result?.status === "passed"
    ? "passed"
    : "failed";

const manifest = {
  schema: "wphx.wp-core-wpdb-public-state-expanded-storage-adapter-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-public-state-expanded-storage-adapter-candidate.mjs",
  inputs: {
    public_state_storage_adapter_candidate_manifest: inputRecord(PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE),
    public_state_descriptor_candidate_manifest: inputRecord(PUBLIC_STATE_DESCRIPTOR_CANDIDATE),
    public_state_plan_manifest: inputRecord(PUBLIC_STATE_PLAN),
    row_materialization_candidate_manifest: inputRecord(ROW_MATERIALIZATION_CANDIDATE),
    mysqli_phpglobal_candidate_manifest: inputRecord(MYSQLI_PHPGLOBAL_CANDIDATE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "typed_haxe_wpdb_public_state_expanded_storage_adapter_shell_proof",
    selected_strategy: "typed-wpdb-public-state-expanded-storage-adapter-and-php-abi-shell",
    haxe_version: haxeVersion,
    locked_haxe_version: toolchainLock.tools.haxe.version,
    locked_php_cli: toolchainLock.tools.php_cli.executable,
    generated_haxe_files: filesUnder(HAXE_OUT),
    haxe_storage_adapter: {
      source: "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
      descriptor_source: "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
      generated_php: generatedStorageAdapter,
      source_escape_audits: haxeSourceAudits,
      adapter_matches_plan: adapterMatchesPlan,
      storage_probe: storageProbe,
      dropin_probe: dropinProbe
    },
    public_abi_policy: {
      preserve_class_name_wpdb: true,
      preserve_global_wpdb: true,
      preserve_db_php_dropin_replacement: true,
      preserve_declared_public_properties: true,
      preserve_direct_public_property_writes: true,
      preserve_dynamic_properties: true,
      preserve_magic_accessors: true,
      preserve_protected_magic_write_blocks: true,
      preserve_field_types_native_php_array: true,
      preserve_table_list_native_php_arrays: true,
      preserve_native_resource_boundaries: true,
      preserve_lazy_col_info_boundary: true,
      preserve_reflection_public_shape: true,
      raw_php_syntax_code_used_in_haxe: false,
      generated_php_postprocessing_required: false
    },
    inherited_public_state_descriptor_candidate: {
      manifest: PUBLIC_STATE_DESCRIPTOR_CANDIDATE,
      validation_result: publicStateDescriptorCandidate.validation_result
    },
    inherited_public_state_storage_adapter_candidate: {
      manifest: PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE,
      validation_result: publicStateStorageAdapterCandidate.validation_result
    },
    inherited_row_materialization_candidate: {
      manifest: ROW_MATERIALIZATION_CANDIDATE,
      validation_result: rowMaterializationCandidate.validation_result
    },
    inherited_mysqli_phpglobal_candidate: {
      manifest: MYSQLI_PHPGLOBAL_CANDIDATE,
      validation_result: mysqliPhpGlobalCandidate.validation_result
    },
    promoted_symbols: [
      "wpdb::$base_prefix",
      "wpdb::$field_types",
      "wpdb::$global_tables",
      "wpdb::$ms_global_tables",
      "wpdb::$old_ms_global_tables",
      "wpdb::$old_tables",
      "wpdb::$last_error",
      "wpdb::$num_rows",
      "wpdb::$prefix",
      "wpdb::$ready",
      "wpdb::$tables",
      "wpdb::__get",
      "wpdb::__set",
      "wpdb::__isset",
      "wpdb::__unset",
      "require_wp_db"
    ],
    promoted_decisions: [
      "all declared public property default kind/value policy",
      "expanded magic-visible property default kind/value policy except lazy col_info",
      "direct public property write route remains PHP object storage",
      "dynamic plugin property write route remains PHP object storage",
      "magic-visible internal write route uses adapter-backed shell storage",
      "protected magic write-block route remains blocked",
      "field_types and table-list direct reassignment remain native PHP arrays",
      "dbh/result remain native-resource shell boundaries",
      "col_info remains WordPress lazy native metadata boundary",
      "candidate public reflection shape remains wpdb-compatible",
      "db.php replacement can supply adapter-backed shell global"
    ],
    closes_gaps_from: [
      {
        manifest: PUBLIC_STATE_DESCRIPTOR_CANDIDATE,
        gap: "wpdb-public-state-storage-not-yet-haxe-owned",
        resolution:
          "WPHX-305.25 moves all declared public defaults and expanded magic-visible write routes into typed Haxe adapter policy, then proves the PHP ABI shell matches WordPress direct public writes, dynamic properties, magic internal writes, protected __set blocks, native arrays/resources, reflection shape, and db.php replacement behavior."
      },
      {
        manifest: PUBLIC_STATE_STORAGE_ADAPTER_CANDIDATE,
        gap: "selected-wpdb-state-storage-only",
        resolution:
          "WPHX-305.25 keeps the WPHX-305.24 selected adapter green while expanding coverage from nine public and seven magic fields to all 46 declared public fields, 15 eager magic-visible internals, and the col_info lazy native boundary."
      }
    ],
    remaining_gaps: [
      {
        id: "complete-wpdb-class-shell-not-yet-haxe-owned",
        owner: "WPHX-305.26",
        detail:
          "WPHX-305.25 owns complete declared public default/routing policy and expanded magic storage policy, but actual mysqli resources, lazy col_info materialization, constructor side effects, and live plugin reflection probes still need proof before replacing the full wpdb class shell."
      },
      {
        id: "require-wp-db-bootstrap-not-yet-haxe-owned",
        owner: "future WPHX-305 bootstrap distribution workset",
        detail:
          "require_wp_db(), db.php inclusion, and global $wpdb replacement remain WordPress PHP shell behavior; WPHX-305.25 proves adapter-backed drop-in compatibility but does not replace bootstrap code."
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
    selected_strategy: "typed-wpdb-public-state-expanded-storage-adapter-and-php-abi-shell",
    expanded_public_storage_property_count: adapterContract.expanded_public_storage_properties.length,
    expanded_magic_storage_property_count: adapterContract.expanded_magic_storage_properties.length,
    lazy_magic_native_boundary_property_count: adapterContract.lazy_magic_native_boundary_properties.length,
    native_array_public_property_count: adapterContract.native_array_public_properties.length,
    native_array_magic_property_count: adapterContract.native_array_magic_properties.length,
    native_resource_boundary_property_count: adapterContract.native_resource_boundary_properties.length,
    protected_write_blocked_property_count: 4,
    storage_probe_status: storageProbe.status,
    dropin_probe_status: dropinProbePassed ? "passed" : "failed",
    direct_public_writes_preserved: storageProbe.comparisons.field_types_direct_mutation_preserved,
    table_prefix_mutation_preserved: storageProbe.comparisons.table_prefix_mutation_preserved,
    dynamic_property_addition_preserved: storageProbe.comparisons.dynamic_property_addition_preserved,
    magic_internal_writes_preserved: storageProbe.comparisons.magic_internal_write_preserved,
    protected_write_blocks_preserved: storageProbe.comparisons.protected_write_blocks_preserved,
    field_types_native_php_array_preserved: storageProbe.comparisons.field_types_direct_mutation_preserved,
    native_public_array_defaults_preserved: storageProbe.comparisons.native_public_array_defaults_preserved,
    native_magic_array_defaults_preserved: storageProbe.comparisons.native_magic_array_defaults_preserved,
    native_resource_boundaries_preserved: storageProbe.comparisons.native_resource_boundaries_preserved,
    lazy_magic_boundary_preserved: storageProbe.comparisons.lazy_magic_boundary_preserved,
    reflection_public_properties_preserved: storageProbe.comparisons.reflection_public_properties_preserved,
    reflection_public_magic_methods_preserved: storageProbe.comparisons.reflection_public_magic_methods_preserved,
    reflection_dynamic_properties_preserved: storageProbe.comparisons.reflection_dynamic_properties_preserved,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    generated_methods_present: generatedMethodsPresent,
    predecessor_public_state_storage_adapter_status: publicStateStorageAdapterCandidate.validation_result?.status ?? null,
    predecessor_public_state_descriptor_status: publicStateDescriptorCandidate.validation_result?.status ?? null,
    predecessor_row_materialization_status: rowMaterializationCandidate.validation_result?.status ?? null,
    predecessor_mysqli_phpglobal_status: mysqliPhpGlobalCandidate.validation_result?.status ?? null
  }
};

if (validationStatus !== "passed") {
  console.error(JSON.stringify({ status: "failed", validation_result: manifest.validation_result }, null, 2));
  process.exit(1);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-25-wpdb-public-state-expanded-storage-adapter-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "typed Haxe wpdb public-state expanded storage adapter candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "Haxe storage adapter/PHP ABI shell ownership manifest"
    },
    {
      path: "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
      role: "typed Haxe wpdb expanded public/magic default and write-route adapter"
    },
    {
      path: "tools/wp-core/run-wpdb-public-state-expanded-storage-adapter-candidate.mjs",
      role: "storage adapter shell/oracle/drop-in proof runner"
    },
    {
      path: "src/wphx/wp/db/WpdbPublicStateStorageAdapter.hx",
      role: "predecessor selected-state storage adapter kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
      role: "predecessor typed Haxe wpdb public-state descriptor kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbRowMaterialization.hx",
      role: "predecessor typed Haxe row materialization implementation kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbMysqliExecution.hx",
      role: "predecessor typed Haxe mysqli @:phpGlobal execution implementation kept green"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-public-state-expanded-storage-adapter-candidate",
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
      expanded_public_storage_property_count: manifest.validation_result.expanded_public_storage_property_count,
      expanded_magic_storage_property_count: manifest.validation_result.expanded_magic_storage_property_count,
      lazy_magic_native_boundary_property_count: manifest.validation_result.lazy_magic_native_boundary_property_count,
      storage_probe_status: manifest.validation_result.storage_probe_status,
      dropin_probe_status: manifest.validation_result.dropin_probe_status,
      direct_public_writes_preserved: manifest.validation_result.direct_public_writes_preserved,
      table_prefix_mutation_preserved: manifest.validation_result.table_prefix_mutation_preserved,
      dynamic_property_addition_preserved: manifest.validation_result.dynamic_property_addition_preserved,
      magic_internal_writes_preserved: manifest.validation_result.magic_internal_writes_preserved,
      protected_write_blocks_preserved: manifest.validation_result.protected_write_blocks_preserved,
      native_resource_boundaries_preserved: manifest.validation_result.native_resource_boundaries_preserved,
      reflection_public_properties_preserved: manifest.validation_result.reflection_public_properties_preserved
    },
    null,
    2
  )
);
