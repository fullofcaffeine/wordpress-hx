#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.23",
  external_ref: "WPHX-305.23",
  title: "Implement typed wpdb public-state descriptor shell proof"
};
const HXML = "fixtures/wp-core/wpdb-public-state-descriptor-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-305-23";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const PROBE = `${OUT_ROOT}/public-state-probe.php`;
const DROPIN_DIR = `${OUT_ROOT}/wp-content`;
const DROPIN = `${DROPIN_DIR}/db.php`;
const DROPIN_PROBE = `${OUT_ROOT}/dropin-probe.php`;
const DESCRIPTOR_PHP = `${HAXE_OUT}/lib/wphx/wp/db/WpdbPublicStateDescriptor.php`;
const ENTRY_PHP = `${HAXE_OUT}/lib/wphx/fixtures/wp/core/WpdbPublicStateDescriptorCandidateEntry.php`;
const OUT = "manifests/wp-core/wphx-305-23-wpdb-public-state-descriptor-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-23-wpdb-public-state-descriptor-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-23-wpdb-public-state-descriptor-candidate.v1.json";
const PUBLIC_STATE_PLAN = "manifests/wp-core/wphx-305-22-wpdb-dropin-public-state-plan.v1.json";
const ROW_MATERIALIZATION_CANDIDATE = "manifests/wp-core/wphx-305-21-wpdb-row-materialization-candidate.v1.json";
const MYSQLI_PHPGLOBAL_CANDIDATE = "manifests/wp-core/wphx-305-20-wpdb-mysqli-phpglobal-candidate.v1.json";
const RECORDED_AT = "2026-06-21T07:10:00.000Z";
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
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbPublicStateDescriptorCandidateEntry.hx"
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-public-state-descriptor-candidate`);
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

function analyzeGeneratedDescriptor() {
  const source = readFileSync(DESCRIPTOR_PHP, "utf8");
  return {
    path: DESCRIPTOR_PHP,
    bytes: statSync(DESCRIPTOR_PHP).size,
    sha256: sha256File(DESCRIPTOR_PHP),
    entry_path: ENTRY_PHP,
    entry_sha256: sha256File(ENTRY_PHP),
    generated_php_postprocessing_required: false,
    methods: {
      declared_public_properties: /function declaredPublicProperties\s*\(/.test(source),
      magic_visible_internal_properties: /function magicVisibleInternalProperties\s*\(/.test(source),
      public_magic_methods: /function publicMagicMethods\s*\(/.test(source),
      protected_write_blocked_properties: /function protectedWriteBlockedProperties\s*\(/.test(source),
      dynamic_properties_allowed: /function dynamicPropertiesAllowed\s*\(/.test(source),
      mutation_policy: /function mutationPolicy\s*\(/.test(source),
      category: /function category\s*\(/.test(source)
    },
    evidence_lines: source
      .split(/\r?\n/)
      .map((line, index) => ({ line: index + 1, text: line.trimEnd() }))
      .filter((entry) =>
        [
          "function declaredPublicProperties",
          "function magicVisibleInternalProperties",
          "function protectedWriteBlockedProperties",
          "function preservesDbDropinReplacement",
          "function requireWpDbReturnsWhenGlobalIsSet"
        ].some((needle) => entry.text.includes(needle))
      )
  };
}

function descriptorProbeSource() {
  return `<?php
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

require ${phpString(resolve(`${HAXE_OUT}/index.php`))};
require_once ${phpString(resolve(upstreamPath("src/wp-includes/class-wpdb.php")))};

function wphx_305_23_native_array($values): array {
  if ($values instanceof Array_hx) {
    return $values->arr;
  }
  if (is_array($values)) {
    return $values;
  }
  throw new InvalidArgumentException('Expected PHP array or Array_hx.');
}

function wphx_305_23_sorted_values($values): array {
  $values = wphx_305_23_native_array($values);
  sort($values, SORT_STRING);
  return array_values($values);
}

function wphx_305_23_normalized_value($value): array {
  if (is_array($value)) {
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

$descriptor_class = '\\\\wphx\\\\wp\\\\db\\\\WpdbPublicStateDescriptor';
$reflection = new ReflectionClass('wpdb');

$descriptor = array(
  'declared_public_properties' => wphx_305_23_sorted_values($descriptor_class::declaredPublicProperties()),
  'magic_visible_internal_properties' => wphx_305_23_sorted_values($descriptor_class::magicVisibleInternalProperties()),
  'public_magic_methods' => wphx_305_23_sorted_values($descriptor_class::publicMagicMethods()),
  'protected_write_blocked_properties' => wphx_305_23_sorted_values($descriptor_class::protectedWriteBlockedProperties()),
  'dynamic_properties_allowed' => $descriptor_class::dynamicPropertiesAllowed(),
  'preserves_db_dropin_replacement' => $descriptor_class::preservesDbDropinReplacement(),
  'require_wp_db_returns_when_global_is_set' => $descriptor_class::requireWpDbReturnsWhenGlobalIsSet(),
  'field_types_uses_direct_public_mutation' => $descriptor_class::fieldTypesUsesDirectPublicMutation(),
  'sample_categories' => array(
    'last_result' => $descriptor_class::category('last_result'),
    'field_types' => $descriptor_class::category('field_types'),
    'posts' => $descriptor_class::category('posts'),
    'dbh' => $descriptor_class::category('dbh')
  ),
  'sample_mutation_policies' => array(
    'last_result' => $descriptor_class::mutationPolicy('last_result'),
    'dbh' => $descriptor_class::mutationPolicy('dbh'),
    'col_info' => $descriptor_class::mutationPolicy('col_info'),
    'allow_unsafe_unquoted_parameters' => $descriptor_class::mutationPolicy('allow_unsafe_unquoted_parameters')
  )
);

$public_properties = array();
$magic_visible_internal_properties = array();
foreach ($reflection->getProperties() as $property) {
  if ($property->isPublic()) {
    $public_properties[] = $property->getName();
  } else {
    $magic_visible_internal_properties[] = $property->getName();
  }
}

$magic_methods = array();
foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
  if (in_array($method->getName(), array('__get', '__set', '__isset', '__unset'), true)) {
    $magic_methods[] = $method->getName();
  }
}

$probe_object = $reflection->newInstanceWithoutConstructor();
$write_block_behavior = array();
foreach ($descriptor['protected_write_blocked_properties'] as $name) {
  $before = wphx_305_23_normalized_value($probe_object->__get($name));
  $probe_object->__set($name, '__wphx_mutation__');
  $after = wphx_305_23_normalized_value($probe_object->__get($name));
  $write_block_behavior[$name] = array(
    'before' => $before,
    'after' => $after,
    'blocked' => $before === $after
  );
}

$allowed_probe_object = $reflection->newInstanceWithoutConstructor();
$allowed_probe_object->__set('dbh', '__wphx_mutation__');
$allowed_write_sample = array(
  'name' => 'dbh',
  'isset_after_set' => $allowed_probe_object->__isset('dbh'),
  'value_after_set' => $allowed_probe_object->__get('dbh'),
  'settable' => $allowed_probe_object->__isset('dbh') && '__wphx_mutation__' === $allowed_probe_object->__get('dbh')
);

$oracle = array(
  'declared_public_properties' => wphx_305_23_sorted_values($public_properties),
  'magic_visible_internal_properties' => wphx_305_23_sorted_values($magic_visible_internal_properties),
  'public_magic_methods' => wphx_305_23_sorted_values($magic_methods),
  'protected_write_blocked_properties' => wphx_305_23_sorted_values(array_keys(array_filter($write_block_behavior, function ($entry) {
    return true === $entry['blocked'];
  }))),
  'allow_dynamic_properties' => count($reflection->getAttributes('AllowDynamicProperties')) > 0,
  'write_block_behavior' => $write_block_behavior,
  'allowed_write_sample' => $allowed_write_sample
);

$comparisons = array(
  'declared_public_properties_match' => $descriptor['declared_public_properties'] === $oracle['declared_public_properties'],
  'magic_visible_internal_properties_match' => $descriptor['magic_visible_internal_properties'] === $oracle['magic_visible_internal_properties'],
  'public_magic_methods_match' => $descriptor['public_magic_methods'] === $oracle['public_magic_methods'],
  'protected_write_blocked_properties_match' => $descriptor['protected_write_blocked_properties'] === $oracle['protected_write_blocked_properties'],
  'dynamic_properties_match' => $descriptor['dynamic_properties_allowed'] === $oracle['allow_dynamic_properties'],
  'allowed_magic_write_sample_passed' => true === $oracle['allowed_write_sample']['settable']
);

echo json_encode(
  array(
    'descriptor' => $descriptor,
    'oracle' => $oracle,
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
    'dropin_replacement_preserved' => is_object($wpdb) && 'WPHX_305_23_Dropin_Wpdb' === get_class($wpdb),
    'default_wpdb_constructor_skipped' => is_object($wpdb) && !($wpdb instanceof wpdb)
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function writeProbeFiles() {
  mkdirSync(OUT_ROOT, { recursive: true });
  mkdirSync(DROPIN_DIR, { recursive: true });
  writeFileSync(PROBE, descriptorProbeSource());
  writeFileSync(
    DROPIN,
    "<?php\nclass WPHX_305_23_Dropin_Wpdb {\n\tpublic string $marker = 'dropin';\n}\n$wpdb = new WPHX_305_23_Dropin_Wpdb();\n"
  );
  writeFileSync(DROPIN_PROBE, dropinProbeSource());
}

function runJsonPhp(path) {
  return JSON.parse(command("php", [path]));
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-public-state-descriptor-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "module",
      name: "wpdb public-state descriptor shell proof",
      area: "wp-includes",
      public_contract:
        "WordPress-compatible wpdb remains a PHP-visible class/global object with declared public fields, magic accessors, #[AllowDynamicProperties], and db.php replacement timing intact while typed Haxe owns the public-state inventory and mutation-policy descriptor."
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
      "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbPublicStateDescriptorCandidateEntry.hx",
      "tools/wp-core/run-wpdb-public-state-descriptor-candidate.mjs",
      OUT,
      RECEIPT
    ],
    generated_paths: [HAXE_OUT, OUT, OWNERSHIP, RECEIPT],
    typed_haxe_ownership: {
      descriptor: "wphx.wp.db.WpdbPublicStateDescriptor",
      owns: [
        "declared wpdb public property inventory",
        "magic-visible internal property inventory",
        "public magic accessor inventory",
        "protected __set write-block inventory",
        "public-state category policy",
        "public/magic mutation policy",
        "db.php replacement and direct field_types mutation preservation flags"
      ],
      does_not_yet_own: [
        "wpdb instance storage",
        "wpdb constructor side effects",
        "require_wp_db() bootstrap implementation",
        "db.php drop-in loading"
      ]
    },
    php_abi_shell: {
      preserved: [
        "class wpdb remains PHP-visible",
        "global $wpdb can be supplied by wp-content/db.php",
        "require_wp_db() returns early when $wpdb is already set",
        "plugins can observe declared public wpdb properties",
        "plugins can add dynamic properties",
        "wpdb magic methods remain public"
      ],
      proof: "WPHX-305.23 reflection/drop-in probe compares generated Haxe descriptor output with WordPress 7.0 ReflectionClass and constructor-free __set behavior."
    },
    bridge: {
      kind: "typed_descriptor_php_abi_shell",
      reason:
        "Public wpdb state is both core implementation detail and plugin ABI. This slice moves the inventory and mutation policy into typed Haxe while keeping the executable PHP class/bootstrap shell untouched until reflection and drop-in behavior have a green receipt.",
      bounded_by: [
        "WPHX-305.22 public-state boundary plan",
        "WordPress 7.0 ReflectionClass('wpdb') property/method oracle",
        "constructor-free wpdb::__set write-block behavior probe",
        "isolated require_wp_db() db.php drop-in early-return probe",
        "WPHX-305.21 row materialization live candidate receipt",
        "WPHX-305.20 mysqli @:phpGlobal live candidate receipt"
      ]
    },
    removal_gate: {
      condition:
        "Do not move wpdb instance storage or require_wp_db() bootstrap ownership behind Haxe until the descriptor proof is followed by a state-storage adapter that preserves reflection, dynamic properties, magic access, and drop-in replacement under full bootstrap probes.",
      owner_issue: "WPHX-305.24",
      target_state: "verified_haxe_owned_wpdb_public_state_storage"
    },
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-public-state-descriptor-candidate",
        "npm run wp:core:wphx-305-public-state-descriptor-candidate:check",
        "npm run wp:core:wphx-305-row-materialization-candidate:check",
        "npm run wp:core:wphx-305-mysqli-phpglobal-candidate:check",
        "npm run format:haxe:check",
        "npm run haxe:escape-hatches:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-305-23-wpdb-public-state-descriptor-candidate",
        "receipt:wphx-305-22-wpdb-dropin-public-state-plan",
        "receipt:wphx-305-21-wpdb-row-materialization-candidate",
        "receipt:wphx-305-20-wpdb-mysqli-phpglobal-candidate"
      ],
      manifest_digest: manifestSha
    }
  };
}

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
const descriptorProbe = runJsonPhp(PROBE);
const dropinProbe = runJsonPhp(DROPIN_PROBE);
const generatedDescriptor = analyzeGeneratedDescriptor();
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);

const expectedPublic = publicStatePlan.fixture.public_state.public_properties.map((property) => property.name);
const expectedInternal = publicStatePlan.fixture.public_state.magic_visible_internal_properties.map((property) => property.name);
const expectedMagicMethods = publicStatePlan.fixture.public_state.public_magic_methods.map((method) => method.name);
const expectedBlocked = ["allow_unsafe_unquoted_parameters", "check_current_query", "col_meta", "table_charset"];
const descriptor = descriptorProbe.descriptor;
const oracle = descriptorProbe.oracle;
const descriptorMatchesPlan = {
  public_properties_match_plan: arraysEqual(descriptor.declared_public_properties, sorted(expectedPublic)),
  magic_visible_internal_properties_match_plan: arraysEqual(descriptor.magic_visible_internal_properties, sorted(expectedInternal)),
  public_magic_methods_match_plan: arraysEqual(descriptor.public_magic_methods, sorted(expectedMagicMethods)),
  protected_write_blocked_properties_match_plan: arraysEqual(descriptor.protected_write_blocked_properties, sorted(expectedBlocked))
};
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) => !audit.contains_dynamic && !audit.contains_untyped && !audit.contains_cast && !audit.contains_php_syntax_code
);
const generatedMethodsPresent = Object.values(generatedDescriptor.methods).every(Boolean);
const descriptorProbePassed = descriptorProbe.status === "passed" && Object.values(descriptorProbe.comparisons).every(Boolean);
const dropinProbePassed =
  dropinProbe.class_wpdb_loaded === true &&
  dropinProbe.global_wpdb_set === true &&
  dropinProbe.dropin_replacement_preserved === true &&
  dropinProbe.default_wpdb_constructor_skipped === true;

const validationStatus =
  descriptorProbePassed &&
  dropinProbePassed &&
  Object.values(descriptorMatchesPlan).every(Boolean) &&
  sourceEscapeAuditPassed &&
  generatedMethodsPresent &&
  descriptor.dynamic_properties_allowed === true &&
  descriptor.preserves_db_dropin_replacement === true &&
  descriptor.require_wp_db_returns_when_global_is_set === true &&
  descriptor.field_types_uses_direct_public_mutation === true &&
  descriptor.declared_public_properties.length === 46 &&
  descriptor.magic_visible_internal_properties.length === 16 &&
  descriptor.public_magic_methods.length === 4 &&
  descriptor.protected_write_blocked_properties.length === 4 &&
  rowMaterializationCandidate.validation_result?.status === "passed" &&
  mysqliPhpGlobalCandidate.validation_result?.status === "passed"
    ? "passed"
    : "failed";

const manifest = {
  schema: "wphx.wp-core-wpdb-public-state-descriptor-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-public-state-descriptor-candidate.mjs",
  inputs: {
    public_state_plan_manifest: inputRecord(PUBLIC_STATE_PLAN),
    row_materialization_candidate_manifest: inputRecord(ROW_MATERIALIZATION_CANDIDATE),
    mysqli_phpglobal_candidate_manifest: inputRecord(MYSQLI_PHPGLOBAL_CANDIDATE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "typed_haxe_wpdb_public_state_descriptor_shell_proof",
    selected_strategy: "typed-wpdb-public-state-descriptor-and-shell-contract",
    haxe_version: haxeVersion,
    locked_haxe_version: toolchainLock.tools.haxe.version,
    locked_php_cli: toolchainLock.tools.php_cli.executable,
    generated_haxe_files: filesUnder(HAXE_OUT),
    haxe_descriptor: {
      source: "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
      generated_php: generatedDescriptor,
      source_escape_audits: haxeSourceAudits,
      descriptor_matches_plan: descriptorMatchesPlan,
      descriptor_probe: descriptorProbe,
      dropin_probe: dropinProbe
    },
    public_abi_policy: {
      preserve_class_name_wpdb: true,
      preserve_global_wpdb: true,
      preserve_db_php_dropin_replacement: true,
      preserve_declared_public_properties: true,
      preserve_magic_accessors: true,
      preserve_dynamic_properties: true,
      raw_php_syntax_code_used_in_haxe: false,
      generated_php_postprocessing_required: false
    },
    inherited_public_state_plan: {
      manifest: PUBLIC_STATE_PLAN,
      validation_result: publicStatePlan.validation_result
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
      "wpdb::$field_types",
      "wpdb::$last_result",
      "wpdb::$prefix",
      "wpdb::__get",
      "wpdb::__set",
      "wpdb::__isset",
      "wpdb::__unset",
      "require_wp_db"
    ],
    promoted_decisions: [
      "wpdb declared public property inventory",
      "wpdb magic-visible internal property inventory",
      "wpdb public magic accessor inventory",
      "wpdb protected __set write-block inventory",
      "wpdb public-state category policy",
      "wpdb public/magic mutation policy",
      "wpdb dynamic property preservation requirement",
      "require_wp_db db.php replacement preservation requirement",
      "wp_set_wpdb_vars direct field_types mutation preservation requirement"
    ],
    closes_gaps_from: [
      {
        manifest: PUBLIC_STATE_PLAN,
        gap: "typed-public-state-descriptor-not-yet-implemented",
        resolution:
          "WPHX-305.23 adds typed Haxe WpdbPublicStateDescriptor and verifies it against WordPress 7.0 reflection, constructor-free magic __set behavior, and an isolated require_wp_db() db.php replacement probe."
      }
    ],
    remaining_gaps: [
      {
        id: "wpdb-public-state-storage-not-yet-haxe-owned",
        owner: "WPHX-305.24",
        detail:
          "The descriptor owns inventory and policy, but actual wpdb instance storage remains in the PHP-visible shell until a storage adapter proves reflection, dynamic fields, magic access, and plugin mutation compatibility."
      },
      {
        id: "require-wp-db-bootstrap-not-yet-haxe-owned",
        owner: "future WPHX-305 bootstrap distribution workset",
        detail:
          "require_wp_db(), db.php inclusion, and global $wpdb replacement remain WordPress PHP shell behavior; WPHX-305.23 proves the early-return contract but does not replace bootstrap code."
      },
      {
        id: "full-upstream-phpunit-not-yet-ported",
        owner: "WPHX-305",
        detail:
          "Reflection/drop-in ABI probes and live DB candidate gates cover this slice, but full upstream wpdb/dbDelta/option PHPUnit parity remains a domain closure requirement."
      }
    ]
  },
  validation_result: {
    status: validationStatus,
    selected_strategy: "typed-wpdb-public-state-descriptor-and-shell-contract",
    public_property_count: descriptor.declared_public_properties.length,
    magic_visible_internal_property_count: descriptor.magic_visible_internal_properties.length,
    magic_method_count: descriptor.public_magic_methods.length,
    protected_write_blocked_property_count: descriptor.protected_write_blocked_properties.length,
    descriptor_probe_status: descriptorProbe.status,
    dropin_probe_status: dropinProbePassed ? "passed" : "failed",
    dynamic_properties_required: oracle.allow_dynamic_properties,
    db_dropin_replacement_required: dropinProbe.dropin_replacement_preserved,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    generated_methods_present: generatedMethodsPresent,
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
  id: "receipt:wphx-305-23-wpdb-public-state-descriptor-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "typed Haxe wpdb public-state descriptor candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "Haxe/public PHP ABI ownership manifest"
    },
    {
      path: "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
      role: "typed Haxe wpdb public-state descriptor"
    },
    {
      path: "tools/wp-core/run-wpdb-public-state-descriptor-candidate.mjs",
      role: "descriptor reflection/drop-in proof runner"
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
    "npm run wp:core:wphx-305-public-state-descriptor-candidate",
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
      public_property_count: manifest.validation_result.public_property_count,
      magic_visible_internal_property_count: manifest.validation_result.magic_visible_internal_property_count,
      magic_method_count: manifest.validation_result.magic_method_count,
      protected_write_blocked_property_count: manifest.validation_result.protected_write_blocked_property_count,
      descriptor_probe_status: manifest.validation_result.descriptor_probe_status,
      dropin_probe_status: manifest.validation_result.dropin_probe_status
    },
    null,
    2
  )
);
