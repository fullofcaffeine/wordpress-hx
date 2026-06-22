#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { filesUnder, linkOriginalPathTree, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-w91.3.8",
  external_ref: "WPHX-700.08",
  title: "WPHX-700.08 — Add packaged-distribution wpdb ABI no-fallback gate"
};
const RECORDED_AT = "2026-06-21T03:20:00.000Z";
const BUILD_ROOT = "build/wp-core/wphx-700-08";
const PACKAGE_ROOT = `${BUILD_ROOT}/packaged-distribution`;
const PROBE = `${BUILD_ROOT}/probe/wpdb-packaged-abi-probe.php`;
const DIAGNOSTICS = `${BUILD_ROOT}/diagnostics/wpdb-packaged-abi-no-fallback.json`;
const OUT = "manifests/operations/wphx-700-08-wpdb-packaged-abi-no-fallback.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-700-08-wpdb-packaged-abi-no-fallback.v1.json";
const RECEIPT = "receipts/operations/wphx-700-08-wpdb-packaged-abi-no-fallback.v1.json";
const RUNNER = "tools/wp-core/run-wpdb-packaged-abi-no-fallback-gate.mjs";
const UPSTREAM_WPDB = "../wordpress-develop/src/wp-includes/class-wpdb.php";
const PRIOR_MANIFESTS = [
  "manifests/operations/wphx-700-03-isolated-parity-and-linked-abi.v1.json",
  "manifests/wp-core/wphx-305-29-wpdb-db-connect-strategy-candidate.v1.json",
  "manifests/wp-core/wphx-305-30-wpdb-prepare-escaping-strategy-candidate.v1.json"
];
const OWNED_METHODS = [
  "__construct",
  "db_connect",
  "query",
  "flush",
  "get_col_info",
  "prepare",
  "_real_escape",
  "_escape",
  "escape",
  "escape_by_ref",
  "_weak_escape",
  "quote_identifier",
  "_escape_identifier_value",
  "esc_like",
  "placeholder_escape",
  "add_placeholder_escape",
  "remove_placeholder_escape"
];
const PUBLIC_PROPERTY_ORDER = [
  "show_errors",
  "suppress_errors",
  "last_error",
  "num_queries",
  "num_rows",
  "rows_affected",
  "insert_id",
  "last_query",
  "last_result",
  "col_info",
  "queries",
  "prefix",
  "base_prefix",
  "ready",
  "blogid",
  "siteid",
  "tables",
  "old_tables",
  "global_tables",
  "ms_global_tables",
  "comments",
  "commentmeta",
  "links",
  "options",
  "postmeta",
  "posts",
  "terms",
  "term_relationships",
  "term_taxonomy",
  "termmeta",
  "usermeta",
  "users"
];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: `sha256:${sha256File(path)}`
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback`);
    }
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function phpString(value) {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function segment(id, order, kind, source, content, owner = "WPHX-700.08") {
  return { id, order, kind, source, owner, content };
}

function linkedFile(distributionPath, segments) {
  return {
    distribution_path: distributionPath,
    segments: [segment(`${distributionPath}:open`, 0, "php-open", "linker", "<?php"), ...segments]
  };
}

function candidateWpdbSource() {
  return `#[AllowDynamicProperties]
class wpdb {
\tpublic $show_errors = false;
\tpublic $suppress_errors = false;
\tpublic $last_error = '';
\tpublic $num_queries = 0;
\tpublic $num_rows = 0;
\tpublic $rows_affected = 0;
\tpublic $insert_id = 0;
\tpublic $last_query;
\tpublic $last_result = array();
\tpublic $col_info;
\tpublic $queries;
\tpublic $prefix = '';
\tpublic $base_prefix = '';
\tpublic $ready = false;
\tpublic $blogid = 0;
\tpublic $siteid = 0;
\tpublic $tables = array();
\tpublic $old_tables = array();
\tpublic $global_tables = array();
\tpublic $ms_global_tables = array();
\tpublic $comments;
\tpublic $commentmeta;
\tpublic $links;
\tpublic $options;
\tpublic $postmeta;
\tpublic $posts;
\tpublic $terms;
\tpublic $term_relationships;
\tpublic $term_taxonomy;
\tpublic $termmeta;
\tpublic $usermeta;
\tpublic $users;

\tprotected $dbuser;
\tprotected $dbpassword;
\tprotected $dbname;
\tprotected $dbhost;

\tpublic function __construct( $dbuser, $dbpassword, $dbname, $dbhost ) {
\t\t$this->dbuser = $dbuser;
\t\t$this->dbpassword = $dbpassword;
\t\t$this->dbname = $dbname;
\t\t$this->dbhost = $dbhost;
\t}

\tpublic function db_connect( $allow_bail = true ) {
\t\t$this->ready = false;
\t\treturn false;
\t}

\tpublic function query( $query ) {
\t\t$this->last_query = $query;
\t\treturn false;
\t}

\tpublic function flush() {
\t\t$this->last_result = array();
\t\t$this->col_info = null;
\t\t$this->last_query = null;
\t}

\tpublic function get_col_info( $info_type = 'name', $col_offset = -1 ) {
\t\treturn false;
\t}

\tpublic function prepare( $query, ...$args ) {
\t\treturn $query;
\t}

\tpublic function _real_escape( $data ) {
\t\treturn addslashes( (string) $data );
\t}

\tpublic function _escape( $data ) {
\t\tif ( is_array( $data ) ) {
\t\t\treturn array_map( array( $this, '_escape' ), $data );
\t\t}
\t\treturn $this->_real_escape( $data );
\t}

\tpublic function escape( $data ) {
\t\treturn $this->_escape( $data );
\t}

\tpublic function escape_by_ref( &$data ) {
\t\t$data = $this->_real_escape( $data );
\t}

\tpublic function _weak_escape( $string ) {
\t\treturn addslashes( (string) $string );
\t}

\tpublic function quote_identifier( $identifier ) {
\t\treturn chr( 96 ) . $this->_escape_identifier_value( $identifier ) . chr( 96 );
\t}

\tprivate function _escape_identifier_value( $identifier ) {
\t\treturn str_replace( chr( 96 ), chr( 96 ) . chr( 96 ), (string) $identifier );
\t}

\tpublic function esc_like( $text ) {
\t\treturn addcslashes( (string) $text, '_%\\\\' );
\t}

\tpublic function placeholder_escape() {
\t\treturn '{wphx-placeholder-escape}';
\t}

\tpublic function add_placeholder_escape( $query ) {
\t\treturn str_replace( '%', $this->placeholder_escape(), (string) $query );
\t}

\tpublic function remove_placeholder_escape( $query ) {
\t\treturn str_replace( $this->placeholder_escape(), '%', (string) $query );
\t}

\tpublic function __get( $name ) {
\t\treturn null;
\t}

\tpublic function __set( $name, $value ) {
\t\t$this->$name = $value;
\t}

\tpublic function __isset( $name ) {
\t\treturn isset( $this->$name );
\t}

\tpublic function __unset( $name ) {
\t\tunset( $this->$name );
\t}
}`;
}

function linkerFiles() {
  return [
    linkedFile("wp-includes/class-wpdb.php", [
      segment(
        "wpdb:candidate-class",
        10,
        "candidate-owned-public-class",
        "packaged-distribution-gate",
        candidateWpdbSource()
      )
    ]),
    linkedFile("wp-includes/wp-db.php", [
      segment(
        "wp-db:require-candidate-class",
        10,
        "bootstrap-wrapper",
        "WordPress wp-db.php surface",
        "require_once __DIR__ . '/class-wpdb.php';"
      )
    ]),
    linkedFile("wp-settings.php", [
      segment(
        "settings:bootstrap-candidate-wpdb",
        10,
        "candidate-bootstrap",
        "packaged-distribution-gate",
        `if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'WPINC' ) ) {
\tdefine( 'WPINC', 'wp-includes' );
}

require_once ABSPATH . WPINC . '/wp-db.php';

$GLOBALS['wpdb'] = new wpdb(
\tdefined( 'DB_USER' ) ? DB_USER : '',
\tdefined( 'DB_PASSWORD' ) ? DB_PASSWORD : '',
\tdefined( 'DB_NAME' ) ? DB_NAME : '',
\tdefined( 'DB_HOST' ) ? DB_HOST : ''
);`
      )
    ])
  ];
}

function probeSource() {
  return `<?php
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

$root = realpath($argv[1]);
$expected_class_file = realpath($root . '/wp-includes/class-wpdb.php');
$upstream_wpdb = realpath($argv[2]);
$owned_methods = json_decode($argv[3], true);
$expected_property_order = json_decode($argv[4], true);

if (!is_dir($root)) {
  throw new RuntimeException('Candidate package root does not exist.');
}

define('DB_USER', 'wphx_user');
define('DB_PASSWORD', 'wphx_password');
define('DB_NAME', 'wphx_database');
define('DB_HOST', 'localhost');
require $root . '/wp-settings.php';

$reflection = new ReflectionClass('wpdb');
$class_file = realpath($reflection->getFileName());
$parent = $reflection->getParentClass();
$included = array_map('realpath', get_included_files());
$included = array_values(array_filter($included, static fn($file) => is_string($file)));
$included_upstream_wpdb = $upstream_wpdb !== false && in_array($upstream_wpdb, $included, true);
$class_file_under_package = $class_file !== false && str_starts_with($class_file, $root . DIRECTORY_SEPARATOR);

$owned = array();
foreach ($owned_methods as $method_name) {
  $method = $reflection->getMethod($method_name);
  $declaring = $method->getDeclaringClass();
  $declaring_file = realpath($method->getFileName());
  $owned[$method_name] = array(
    'declaring_class' => $declaring->getName(),
    'declaring_file' => $declaring_file,
    'visibility' => $method->isPublic() ? 'public' : ($method->isProtected() ? 'protected' : 'private'),
    'declares_by_reference_return' => $method->returnsReference(),
    'parameter_count' => $method->getNumberOfParameters(),
    'declared_by_candidate_class' => $declaring->getName() === 'wpdb',
    'declared_in_candidate_file' => $declaring_file === $expected_class_file
  );
}

$all_owned_methods_declared_by_candidate = true;
foreach ($owned as $method) {
  $all_owned_methods_declared_by_candidate = $all_owned_methods_declared_by_candidate
    && $method['declared_by_candidate_class']
    && $method['declared_in_candidate_file'];
}

$wpdb = $GLOBALS['wpdb'] ?? null;
$wpdb->wphx_plugin_extension = 'plugin-value';
$object_vars = get_object_vars($wpdb);
$observed_property_order = array_values(array_intersect(array_keys($object_vars), $expected_property_order));

$checks = array(
  'class_name_is_wpdb' => $reflection->getName() === 'wpdb',
  'class_declared_in_candidate_package' => $class_file === $expected_class_file && $class_file_under_package,
  'class_has_no_parent' => $parent === false,
  'global_wpdb_is_candidate_instance' => $wpdb instanceof wpdb && get_class($wpdb) === 'wpdb',
  'dynamic_plugin_property_visible' => ($wpdb->wphx_plugin_extension ?? null) === 'plugin-value' && array_key_exists('wphx_plugin_extension', $object_vars),
  'public_property_order_prefix_preserved' => $observed_property_order === $expected_property_order,
  'all_owned_methods_declared_by_candidate' => $all_owned_methods_declared_by_candidate,
  'upstream_wpdb_file_not_included' => !$included_upstream_wpdb
);

echo json_encode(
  array(
    'status' => in_array(false, $checks, true) ? 'failed' : 'passed',
    'evidence_class' => 'runtime_abi',
    'artifact_scope' => 'packaged_distribution',
    'behavior_parity_claimed' => false,
    'package_root' => $root,
    'expected_class_file' => $expected_class_file,
    'upstream_wpdb' => $upstream_wpdb,
    'reflection' => array(
      'class_name' => $reflection->getName(),
      'class_file' => $class_file,
      'parent_class' => $parent ? $parent->getName() : null,
      'parent_file' => $parent ? realpath($parent->getFileName()) : null,
      'owned_methods' => $owned,
      'object_vars_order_prefix' => $observed_property_order
    ),
    'load_order' => array(
      'included_files' => $included,
      'included_upstream_wpdb' => $included_upstream_wpdb
    ),
    'checks' => $checks
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function runProbe() {
  const result = spawnSync(
    "php",
    [PROBE, resolve(PACKAGE_ROOT), resolve(UPSTREAM_WPDB), JSON.stringify(OWNED_METHODS), JSON.stringify(PUBLIC_PROPERTY_ORDER)],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 50
    }
  );
  const diagnostics = {
    command: ["php", PROBE, resolve(PACKAGE_ROOT), resolve(UPSTREAM_WPDB), "<owned-methods>", "<property-order>"],
    exit_code: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr
  };
  writeFile(DIAGNOSTICS, JSON.stringify(diagnostics, null, 2) + "\n");

  if (result.status !== 0) {
    throw new Error(`Packaged wpdb ABI probe failed with exit ${result.status}: ${result.stderr}`);
  }

  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "passed") {
    throw new Error(`Packaged wpdb ABI probe reported ${parsed.status}`);
  }

  return { parsed, diagnostics };
}

function assertLint(paths) {
  return paths.map((path) => {
    const output = command("php", ["-l", path]);
    return {
      path,
      output,
      status: output.includes("No syntax errors detected") ? "passed" : "failed"
    };
  });
}

function resetBuildRoot() {
  if (existsSync(BUILD_ROOT)) rmSync(BUILD_ROOT, { recursive: true, force: true });
  mkdirSync(PACKAGE_ROOT, { recursive: true });
}

resetBuildRoot();
const linkedFiles = linkOriginalPathTree({ root: PACKAGE_ROOT, files: linkerFiles() });
writeFile(PROBE, probeSource());
const lint = assertLint([...linkedFiles.map((file) => file.path), PROBE]);
const probe = runProbe();

const generatedClassPath = `${PACKAGE_ROOT}/wp-includes/class-wpdb.php`;
const generatedWpDbPath = `${PACKAGE_ROOT}/wp-includes/wp-db.php`;
const generatedSettingsPath = `${PACKAGE_ROOT}/wp-settings.php`;
const diagnosticsRecord = inputRecord(DIAGNOSTICS);
const packageFiles = filesUnder(PACKAGE_ROOT).map((file) => ({
  ...file,
  sha256: `sha256:${file.sha256}`
}));
const priorManifests = PRIOR_MANIFESTS.filter((path) => existsSync(path)).map(inputRecord);
const manifest = {
  schema: "wphx.wpdb-packaged-abi-no-fallback.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_class: "runtime_abi",
  artifact_scope: "packaged_distribution",
  behavior_parity_claimed: false,
  inputs: {
    runner: inputRecord(RUNNER),
    package_json: inputRecord("package.json"),
    upstream_wpdb: existsSync(UPSTREAM_WPDB) ? inputRecord(UPSTREAM_WPDB) : null,
    prior_manifests: priorManifests
  },
  package: {
    root: PACKAGE_ROOT,
    files: packageFiles,
    linked_files: linkedFiles.map((file) => ({
      distribution_path: file.distribution_path,
      bytes: file.bytes,
      sha256: `sha256:${file.sha256}`,
      segments: file.segments.map((segmentRecord) => ({
        ...segmentRecord,
        sha256: `sha256:${segmentRecord.sha256}`
      }))
    }))
  },
  php_lint: lint,
  probe: {
    path: PROBE,
    sha256: `sha256:${sha256File(PROBE)}`,
    diagnostics: diagnosticsRecord,
    diagnostics_digest: sha256(readFileSync(DIAGNOSTICS, "utf8")),
    result_digest: sha256(JSON.stringify(probe.parsed)),
    result: probe.parsed
  },
  no_fallback_contract: {
    candidate_class_file: generatedClassPath,
    bootstrap_files: [generatedWpDbPath, generatedSettingsPath],
    upstream_wpdb_path_rejected: UPSTREAM_WPDB,
    owned_methods: OWNED_METHODS,
    public_property_order_prefix: PUBLIC_PROPERTY_ORDER
  },
  validation_result: {
    status: "passed",
    packaged_distribution_root_built: true,
    class_wpdb_declared_by_candidate_package: probe.parsed.checks.class_declared_in_candidate_package,
    class_wpdb_has_no_parent: probe.parsed.checks.class_has_no_parent,
    global_wpdb_is_candidate_instance: probe.parsed.checks.global_wpdb_is_candidate_instance,
    owned_methods_declared_in_candidate_file: probe.parsed.checks.all_owned_methods_declared_by_candidate,
    upstream_wpdb_file_not_included: probe.parsed.checks.upstream_wpdb_file_not_included,
    dynamic_plugin_property_visible: probe.parsed.checks.dynamic_plugin_property_visible,
    public_property_order_prefix_preserved: probe.parsed.checks.public_property_order_prefix_preserved,
    full_diagnostics_recorded: existsSync(DIAGNOSTICS)
  }
};

const ownershipManifest = {
  schema: "wphx.ownership.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_class: "runtime_abi",
  artifact_scope: "packaged_distribution",
  owned_units: [
    {
      path: "wp-includes/class-wpdb.php",
      owner: "WPHX-700.08",
      status: "candidate_owned_packaged_abi_shell",
      evidence: OUT,
      note: "This packaged shell proves no-fallback ABI ownership for selected wpdb methods; it is not a behavior-complete wpdb port."
    },
    {
      path: "wp-includes/wp-db.php",
      owner: "WPHX-700.08",
      status: "candidate_bootstrap_wrapper",
      evidence: OUT
    },
    {
      path: "wp-settings.php",
      owner: "WPHX-700.08",
      status: "candidate_bootstrap_probe_root",
      evidence: OUT
    }
  ],
  validation_result: manifest.validation_result
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const ownershipText = JSON.stringify(ownershipManifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-700-08-wpdb-packaged-abi-no-fallback",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  command: "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback",
  evidence_class: manifest.evidence_class,
  artifact_scope: manifest.artifact_scope,
  behavior_parity_claimed: false,
  artifacts: [
    {
      path: OUT,
      role: "packaged-distribution wpdb runtime ABI no-fallback manifest",
      sha256: sha256(manifestText)
    },
    {
      path: OWNERSHIP,
      role: "packaged-distribution ownership manifest",
      sha256: sha256(ownershipText)
    },
    {
      path: DIAGNOSTICS,
      role: "full PHP probe stdout/stderr diagnostics",
      sha256: `sha256:${sha256File(DIAGNOSTICS)}`
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback",
    "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback:check",
    "npm run ci:php-conformance:check",
    "npm run receipts:validate"
  ],
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

writeOrCheck(OUT, manifestText);
writeOrCheck(OWNERSHIP, ownershipText);
writeOrCheck(RECEIPT, receiptText);

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      evidence_class: manifest.evidence_class,
      artifact_scope: manifest.artifact_scope,
      behavior_parity_claimed: false
    },
    null,
    2
  )
);
