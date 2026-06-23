#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.29",
  external_ref: "WPHX-305.29",
  title: "Move wpdb db_connect native construction beyond the PHP parent shell"
};
const HARDENING_ISSUE = {
  id: "wordpresshx-w91.3.3",
  external_ref: "WPHX-700.03",
  title: "WPHX-700.03 — Isolate oracle/candidate parity processes and distribution ABI checks"
};
const HXML = "fixtures/wp-core/wpdb-db-connect-strategy-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-305-29";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const SHELL = `${OUT_ROOT}/candidate-shell.php`;
const PROBE = `${OUT_ROOT}/db-connect-probe.php`;
const ISOLATED_ORACLE_PROBE = `${OUT_ROOT}/isolated-oracle-probe.php`;
const ISOLATED_CANDIDATE_PROBE = `${OUT_ROOT}/isolated-candidate-probe.php`;
const DIAGNOSTICS_DIR = `${OUT_ROOT}/diagnostics`;
const DROPIN_DIR = `${OUT_ROOT}/wp-content`;
const DROPIN = `${DROPIN_DIR}/db.php`;
const DROPIN_PROBE = `${OUT_ROOT}/dropin-probe.php`;
const STRATEGY_PHP = `${HAXE_OUT}/lib/wphx/wp/db/WpdbDbConnectStrategy.php`;
const ENTRY_PHP = `${HAXE_OUT}/lib/wphx/fixtures/wp/core/WpdbDbConnectStrategyCandidateEntry.php`;
const OUT = "manifests/wp-core/wphx-305-29-wpdb-db-connect-strategy-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-29-wpdb-db-connect-strategy-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-29-wpdb-db-connect-strategy-candidate.v1.json";
const HARDENING_OUT = "manifests/operations/wphx-700-03-isolated-parity-and-linked-abi.v1.json";
const HARDENING_RECEIPT = "receipts/operations/wphx-700-03-isolated-parity-and-linked-abi.v1.json";
const QUERY_EXECUTION_STRATEGY_CANDIDATE = "manifests/wp-core/wphx-305-28-wpdb-query-execution-strategy-candidate.v1.json";
const METHOD_BODY_STRATEGY_CANDIDATE = "manifests/wp-core/wphx-305-27-wpdb-method-body-strategy-candidate.v1.json";
const CLASS_SHELL_RESOURCE_STRATEGY_CANDIDATE =
  "manifests/wp-core/wphx-305-26-wpdb-class-shell-resource-strategy-candidate.v1.json";
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
const ISOLATED_DB_PREFIX = "wordpresshx_iso";

const SOURCE_FILES = ["src/wp-includes/class-wpdb.php", "src/wp-includes/load.php", "src/wp-includes/wp-db.php"];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/db/WpdbPublicStateDescriptor.hx",
  "src/wphx/wp/db/WpdbPublicStateExpandedStorageAdapter.hx",
  "src/wphx/wp/db/WpdbClassShellStrategy.hx",
  "src/wphx/wp/db/WpdbMethodBodyStrategy.hx",
  "src/wphx/wp/db/WpdbQueryState.hx",
  "src/wphx/wp/db/WpdbNativeExecution.hx",
  "src/wphx/wp/db/WpdbResultPopulation.hx",
  "src/wphx/wp/db/WpdbQueryExecutionStrategy.hx",
  "src/wphx/wp/db/WpdbDbConnectStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbDbConnectStrategyCandidateEntry.hx"
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-db-connect-strategy-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function phpString(value) {
  return JSON.stringify(value);
}

function relativeOrNull(path) {
  if (path == null) return null;
  return path.startsWith(process.cwd()) ? path.slice(process.cwd().length + 1) : path;
}

function stableDiagnostics(diagnostics) {
  return Object.fromEntries(
    Object.entries(diagnostics ?? {}).map(([key, value]) => [
      key,
      {
        path: value.path,
        bytes: value.bytes,
        sha256_present: typeof value.sha256 === "string" && value.sha256.startsWith("sha256:")
      }
    ])
  );
}

function stableLinkedCandidateAbi(abi) {
  if (abi == null) return null;
  return {
    class_name: abi.class_name,
    class_file: relativeOrNull(abi.class_file),
    expected_candidate_file: relativeOrNull(abi.expected_candidate_file),
    class_declared_in_candidate_file: abi.class_declared_in_candidate_file,
    parent_class: abi.parent_class,
    parent_file_role: abi.parent_file?.endsWith("src/wp-includes/class-wpdb.php") ? "wordpress-oracle-class-wpdb" : relativeOrNull(abi.parent_file),
    owned_methods: Object.fromEntries(
      Object.entries(abi.owned_methods ?? {}).map(([name, method]) => [
        name,
        {
          declaring_class: method.declaring_class,
          declaring_file: relativeOrNull(method.declaring_file),
          declared_by_candidate_class: method.declared_by_candidate_class,
          declared_in_candidate_file: method.declared_in_candidate_file
        }
      ])
    ),
    all_owned_methods_declared_by_candidate: abi.all_owned_methods_declared_by_candidate
  };
}

function stableIsolatedParity(parity) {
  return {
    evidence_class: parity.evidence_class,
    artifact_scope: parity.artifact_scope,
    process_model: parity.process_model,
    database_model: parity.database_model,
    databases: parity.databases,
    oracle: {
      process_isolation: parity.oracle?.process_isolation,
      diagnostics: stableDiagnostics(parity.oracle?.diagnostics)
    },
    candidate: {
      process_isolation: parity.candidate?.process_isolation,
      diagnostics: stableDiagnostics(parity.candidate?.diagnostics),
      linked_candidate_abi: stableLinkedCandidateAbi(parity.candidate?.linked_candidate_abi)
    },
    comparisons: parity.comparisons,
    status: parity.status
  };
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

function isolatedDbName(runtime, side) {
  const runtimeId = runtime.id.replace(/[^A-Za-z0-9_]+/g, "_");
  return `${ISOLATED_DB_PREFIX}_${runtimeId}_${side}`;
}

function resetDatabase(port, dbName) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), '', intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $db = getenv('WPHX_DB_NAME');
    if (!preg_match('/^[A-Za-z0-9_]+$/', $db)) {
      fwrite(STDERR, 'Unsafe database name' . PHP_EOL);
      exit(3);
    }
    $quoted = chr(96) . $db . chr(96);
    $mysqli->query("DROP DATABASE IF EXISTS " . $quoted);
    if ($mysqli->errno) {
      fwrite(STDERR, $mysqli->error . PHP_EOL);
      exit(4);
    }
    $mysqli->query("CREATE DATABASE " . $quoted . " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    if ($mysqli->errno) {
      fwrite(STDERR, $mysqli->error . PHP_EOL);
      exit(5);
    }
    echo json_encode(array('database' => $db), JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    command("php", ["-r", code], {
      env: {
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_PORT: String(port),
        WPHX_DB_NAME: dbName
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
  const name = `wordpresshx-wphx-305-29-${runtime.id}-${process.pid}`;
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
  define('AUTH_SALT', 'wphx-305-29-auth-salt');
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
if (!function_exists('wp_debug_backtrace_summary')) {
  function wp_debug_backtrace_summary($ignore_class = null, $skip_frames = 0, $pretty = true): string {
    return 'wphx-probe';
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

if (!function_exists('wphx_305_29_native_array')) {
  function wphx_305_29_native_array($values): array {
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
class WPHX_305_29_Wpdb_Db_Connect_Shell extends wpdb {
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

  public function wphx_set_dbpassword_for_probe(string $dbpassword): void {
    $this->dbpassword = $dbpassword;
  }

  public function wphx_set_dbhost_for_probe(string $dbhost): void {
    $this->dbhost = $dbhost;
  }

  public function db_connect($allow_bail = true) {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbDbConnectStrategy';

    if ($strategy::shouldMarkIsMysql()) {
      $this->is_mysql = true;
    }

    $client_flags = $strategy::clientFlags(defined('MYSQL_CLIENT_FLAGS'), defined('MYSQL_CLIENT_FLAGS') ? MYSQL_CLIENT_FLAGS : 0);

    if ($strategy::shouldDisableMysqliReport()) {
      mysqli_report(MYSQLI_REPORT_OFF);
    }

    $this->dbh = mysqli_init();

    $host = $this->dbhost;
    $port = null;
    $socket = null;
    $is_ipv6 = false;

    $host_data = $this->parse_db_host($this->dbhost);
    if ($strategy::shouldUseParsedDbHostData(is_array($host_data))) {
      list($host, $port, $socket, $is_ipv6) = $host_data;
    }

    if ($strategy::shouldBracketIpv6Host((bool) $is_ipv6, extension_loaded('mysqlnd'))) {
      $host = $strategy::bracketIpv6Host((string) $host);
    }

    if ($strategy::shouldUseDebugRealConnect(WP_DEBUG)) {
      mysqli_real_connect($this->dbh, $host, $this->dbuser, $this->dbpassword, null, $port, $socket, $client_flags);
    } else {
      @mysqli_real_connect($this->dbh, $host, $this->dbuser, $this->dbpassword, null, $port, $socket, $client_flags);
    }

    $connect_errno = $this->dbh instanceof mysqli ? (int) $this->dbh->connect_errno : 0;
    if ($strategy::shouldClearDbhOnConnectError($connect_errno)) {
      $this->dbh = null;
    }

    if ($strategy::shouldBailOnConnectionFailure(!empty($this->dbh), (bool) $allow_bail)) {
      wp_load_translations_early();

      if (file_exists(WP_CONTENT_DIR . '/db-error.php')) {
        require_once WP_CONTENT_DIR . '/db-error.php';
        die();
      }

      $message = '<h1>' . __('Error establishing a database connection') . "</h1>\\n";
      $message .= '<p>' . sprintf(
        __('This either means that the username and password information in your %1$s file is incorrect or that contact with the database server at %2$s could not be established. This could mean your host&#8217;s database server is down.'),
        '<code>wp-config.php</code>',
        '<code>' . htmlspecialchars($this->dbhost, ENT_QUOTES) . '</code>'
      ) . "</p>\\n";
      $message .= "<ul>\\n";
      $message .= '<li>' . __('Are you sure you have the correct username and password?') . "</li>\\n";
      $message .= '<li>' . __('Are you sure you have typed the correct hostname?') . "</li>\\n";
      $message .= '<li>' . __('Are you sure the database server is running?') . "</li>\\n";
      $message .= "</ul>\\n";
      $message .= '<p>' . sprintf(
        __('If you are unsure what these terms mean you should probably contact your host. If you still need help you can always visit the <a href="%s">WordPress support forums</a>.'),
        __('https://wordpress.org/support/forums/')
      ) . "</p>\\n";

      $this->bail($message, 'db_connect_fail');

      return false;
    }

    if ($strategy::shouldReturnFalseOnConnectionFailure(!empty($this->dbh))) {
      return false;
    }

    if ($strategy::shouldRunConnectionSuccess(!empty($this->dbh))) {
      if ($strategy::shouldInitializeCharsetOnDbConnect((bool) $this->has_connected)) {
        $this->init_charset();
      }

      if ($strategy::shouldSetHasConnected(!empty($this->dbh))) {
        $this->has_connected = true;
      }

      $this->set_charset($this->dbh);

      if ($strategy::shouldMarkReady(!empty($this->dbh))) {
        $this->ready = true;
      }

      if ($strategy::shouldSetSqlModeAfterReady((bool) $this->ready)) {
        $this->set_sql_mode();
      }

      if ($strategy::shouldSelectDatabaseAfterReady((bool) $this->ready)) {
        $this->select($this->dbname, $this->dbh);
      }

      return true;
    }

    return false;
  }

  public function flush() {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbMethodBodyStrategy';
    $this->last_result = array();
    $this->col_info = null;
    $this->last_query = null;
    $this->rows_affected = 0;
    $this->num_rows = 0;
    $this->last_error = '';

    $result_was_mysqli_result = $this->result instanceof mysqli_result;
    if ($strategy::shouldFreeMysqliResult($result_was_mysqli_result)) {
      mysqli_free_result($this->result);
      $this->result = null;

      if (!$strategy::shouldDrainMysqliConnection($result_was_mysqli_result, $this->dbh instanceof mysqli)) {
        return;
      }

      while (mysqli_more_results($this->dbh)) {
        mysqli_next_result($this->dbh);
      }
    }
  }

  public function get_col_info($info_type = 'name', $col_offset = -1) {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbMethodBodyStrategy';
    $this->load_col_info();

    if ($this->col_info) {
      if ($strategy::shouldReturnAllColumnInfo((int) $col_offset)) {
        $i = 0;
        $new_array = array();
        foreach ((array) $this->col_info as $col) {
          $new_array[$i] = $col->{$info_type};
          ++$i;
        }
        return $new_array;
      }

      if ($strategy::shouldReturnSingleColumnInfo((int) $col_offset)) {
        return $this->col_info[$col_offset]->{$info_type};
      }
    }
  }

  public function wphx_do_native_query($query): void {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbQueryExecutionStrategy';
    $save_queries_enabled = defined('SAVEQUERIES') && SAVEQUERIES;
    if ($strategy::shouldCaptureQueryLog($save_queries_enabled)) {
      $this->timer_start();
    }

    if ($strategy::shouldExecuteNativeQuery(!empty($this->dbh))) {
      $this->result = mysqli_query($this->dbh, $query);
    }

    $this->num_queries = $strategy::nextQueryCount((int) $this->num_queries);

    if ($strategy::shouldCaptureQueryLog($save_queries_enabled)) {
      $this->log_query($query, $this->timer_stop(), $this->get_caller(), $this->time_start, array());
    }
  }

  public function query($query) {
    $strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbQueryExecutionStrategy';
    if ($strategy::shouldShortCircuitNotReady((bool) $this->ready)) {
      $this->check_current_query = true;
      return false;
    }

    $query = apply_filters('query', $query);
    $query_should_run = $strategy::shouldRunFilteredQuery((string) $query);
    if (!$query_should_run) {
      if ($strategy::shouldResetInsertIdForEmptyQuery($query_should_run)) {
        $this->insert_id = 0;
      }
      return false;
    }

    $this->flush();
    $this->func_call = $strategy::funcCallValue((string) $query);

    if ($strategy::shouldRunInvalidTextCheck((bool) $this->check_current_query, $this->check_ascii($query))) {
      $stripped_query = $this->strip_invalid_text_from_query($query);
      $this->flush();
      if ($strategy::shouldRejectStrippedQuery($stripped_query === $query)) {
        $this->insert_id = 0;
        $this->last_query = $query;
        wp_load_translations_early();
        $this->last_error = __('WordPress database error: Could not perform query because it contains invalid data.');
        return false;
      }
    }

    if ($strategy::shouldResetCheckCurrentQueryAfterValidation()) {
      $this->check_current_query = true;
    }

    $this->last_query = $query;
    $this->wphx_do_native_query($query);

    $mysql_errno = 0;
    if ($this->dbh instanceof mysqli) {
      $mysql_errno = mysqli_errno($this->dbh);
    } else {
      $mysql_errno = 2006;
    }

    if ($strategy::shouldAttemptReconnect(empty($this->dbh), (int) $mysql_errno)) {
      if ($this->check_connection()) {
        $this->wphx_do_native_query($query);
      } else {
        $this->insert_id = 0;
        return false;
      }
    }

    if ($this->dbh instanceof mysqli) {
      $this->last_error = mysqli_error($this->dbh);
    } else {
      $this->last_error = __('Unable to retrieve the error message from the database server');
    }

    $query_kind = $strategy::queryKind((string) $query);
    if ($this->last_error) {
      if ($strategy::shouldClearInsertIdAfterError((int) $this->insert_id, $query_kind)) {
        $this->insert_id = 0;
      }
      $this->print_error();
      return false;
    }

    if ($strategy::shouldReturnNativeResult($query_kind)) {
      return $this->result;
    }

    if ($strategy::shouldUseAffectedRows($query_kind)) {
      $this->rows_affected = mysqli_affected_rows($this->dbh);
      if ($strategy::shouldStoreInsertId($query_kind)) {
        $this->insert_id = mysqli_insert_id($this->dbh);
      }
      return $this->rows_affected;
    }

    $num_rows = $strategy::initialSelectedRowCount();
    if ($strategy::shouldPopulateSelectedRows($this->result instanceof mysqli_result)) {
      while ($row = mysqli_fetch_object($this->result)) {
        $this->last_result[$num_rows] = $row;
        $num_rows = $strategy::nextSelectedRowCount((int) $num_rows);
      }
    }

    $this->num_rows = $num_rows;
    return $strategy::selectedRowsReturnValue((int) $num_rows);
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

function wphx_305_29_normalize_host($value): string {
  return preg_replace('/:\\\\d+$/', ':<port>', (string) $value);
}

function wphx_305_29_value_shape($value): array {
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

function wphx_305_29_constructor_snapshot($object): array {
  return array(
    'dbuser' => $object->__get('dbuser'),
    'dbpassword_set' => is_string($object->__get('dbpassword')) && '' !== $object->__get('dbpassword'),
    'dbname' => $object->__get('dbname'),
    'dbhost' => wphx_305_29_normalize_host($object->__get('dbhost')),
    'dbh_type' => get_debug_type($object->__get('dbh')),
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'use_mysqli' => $object->__get('use_mysqli'),
    'charset' => $object->charset,
    'collate' => $object->collate,
    'result_initial' => wphx_305_29_value_shape($object->__get('result'))
  );
}

function wphx_305_29_col_info_names($col_info): array {
  $names = array();
  foreach ((array) $col_info as $column) {
    $names[] = $column->name;
  }
  return $names;
}

function wphx_305_29_query_snapshot($object): array {
  $return_value = $object->query("SELECT 1 AS alpha, 'two' AS beta");
  $result = $object->__get('result');
  $col_info = $object->__get('col_info');
  $get_col_info_names = $object->get_col_info('name');
  $get_col_info_types = $object->get_col_info('type');
  return array(
    'return_value' => $return_value,
    'result_type' => get_debug_type($result),
    'result_is_mysqli_result' => $result instanceof mysqli_result,
    'col_info_count' => count((array) $col_info),
    'col_info_names' => wphx_305_29_col_info_names($col_info),
    'get_col_info_names' => $get_col_info_names,
    'get_col_info_types' => $get_col_info_types,
    'get_col_info_default' => $object->get_col_info(),
    'get_col_info_single_name' => $object->get_col_info('name', 1),
    'num_rows' => $object->num_rows,
    'last_result_count' => is_array($object->last_result) ? count($object->last_result) : null,
    'last_result_first_row' => is_array($object->last_result) && isset($object->last_result[0])
      ? array('alpha' => (string) $object->last_result[0]->alpha, 'beta' => (string) $object->last_result[0]->beta)
      : null
  );
}

function wphx_305_29_db_connect_success_snapshot($object): array {
  $return_value = $object->db_connect(false);
  $database_return = $object->query('SELECT DATABASE() AS db_name');
  $database_name = is_array($object->last_result) && isset($object->last_result[0])
    ? (string) $object->last_result[0]->db_name
    : null;
  return array(
    'return_value' => $return_value,
    'dbh_type' => get_debug_type($object->__get('dbh')),
    'dbh_is_mysqli' => $object->__get('dbh') instanceof mysqli,
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'use_mysqli' => $object->__get('use_mysqli'),
    'charset' => $object->charset,
    'collate' => $object->collate,
    'database_query_return' => $database_return,
    'database_name' => $database_name
  );
}

function wphx_305_29_db_connect_failure_snapshot($object, string $bad_password): array {
  $object->wphx_set_dbpassword_for_probe($bad_password);
  $return_value = $object->db_connect(false);
  return array(
    'return_value' => $return_value,
    'dbh_shape' => wphx_305_29_value_shape($object->__get('dbh')),
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'last_error' => $object->last_error
  );
}

function wphx_305_29_parse_db_host_snapshot($object): array {
  $hosts = array(
    'ipv4_port' => '127.0.0.1:3306',
    'localhost_socket' => 'localhost:/tmp/mysql.sock',
    'ipv6_bracketed_port' => '[::1]:3306',
    'ipv6_plain' => '::1'
  );
  $parsed = array();
  foreach ($hosts as $name => $host) {
    $parsed[$name] = $object->parse_db_host($host);
  }
  return $parsed;
}

function wphx_305_29_col_info_after_flush_read($object): array {
  try {
    $value = $object->__get('col_info');
    return array('threw' => false, 'shape' => wphx_305_29_value_shape($value));
  } catch (Throwable $throwable) {
    return array('threw' => true, 'class' => get_class($throwable));
  }
}

function wphx_305_29_flush_snapshot($object): array {
  $object->query("SELECT 3 AS flush_alpha, 'four' AS flush_beta");
  $result_before = $object->__get('result');
  $col_info_before = $object->__get('col_info');
  $before = array(
    'result_is_mysqli_result' => $result_before instanceof mysqli_result,
    'col_info_names' => wphx_305_29_col_info_names($col_info_before),
    'last_result_count' => is_array($object->last_result) ? count($object->last_result) : null,
    'last_query_is_string' => is_string($object->last_query),
    'rows_affected' => $object->rows_affected,
    'num_rows' => $object->num_rows,
    'last_error' => $object->last_error
  );
  $object->flush();
  $after = array(
    'last_result_is_array' => is_array($object->last_result),
    'last_result_count' => is_array($object->last_result) ? count($object->last_result) : null,
    'last_query_is_null' => null === $object->last_query,
    'rows_affected' => $object->rows_affected,
    'num_rows' => $object->num_rows,
    'last_error' => $object->last_error,
    'result_shape' => wphx_305_29_value_shape($object->__get('result')),
    'result_is_null' => null === $object->__get('result'),
    'col_info_after_flush_read' => wphx_305_29_col_info_after_flush_read($object)
  );
  return array('before' => $before, 'after' => $after);
}

function wphx_305_29_query_table_name($runtime_id, $class_name): string {
  return 'wphx_305_29_' . preg_replace('/[^a-z0-9_]+/i', '_', strtolower($runtime_id . '_' . $class_name));
}

function wphx_305_29_identifier($name): string {
  return chr(96) . str_replace(chr(96), chr(96) . chr(96), $name) . chr(96);
}

function wphx_305_29_query_execution_snapshot($object, string $runtime_id): array {
  $table = wphx_305_29_identifier(wphx_305_29_query_table_name($runtime_id, get_class($object)));
  $starting_num_queries = (int) $object->num_queries;

  $ready_before = $object->ready;
  $check_current_query_before = $object->check_current_query;
  $object->ready = false;
  $object->check_current_query = false;
  $not_ready_return = $object->query('SELECT 999 AS not_ready_value');
  $not_ready_check_current_query = $object->check_current_query;
  $object->ready = $ready_before;
  $object->check_current_query = $check_current_query_before;

  $object->insert_id = 123;
  $empty_return = $object->query('');
  $empty_insert_id = $object->insert_id;

  $drop_return = $object->query("DROP TABLE IF EXISTS $table");
  $create_return = $object->query("CREATE TABLE $table (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(32) NOT NULL UNIQUE, value VARCHAR(32) NOT NULL)");
  $insert_alpha_return = $object->query("INSERT INTO $table (name, value) VALUES ('alpha', 'one')");
  $insert_alpha_id_is_positive = $object->insert_id > 0;
  $insert_beta_return = $object->query("INSERT INTO $table (name, value) VALUES ('beta', 'two')");
  $insert_beta_id_is_positive = $object->insert_id > 0;
  $update_return = $object->query("UPDATE $table SET value = 'two-updated' WHERE name = 'beta'");
  $select_return = $object->query("SELECT name, value FROM $table ORDER BY id ASC");
  $select_num_rows = $object->num_rows;
  $selected_rows = array();
  foreach ((array) $object->last_result as $row) {
    $selected_rows[] = array('name' => (string) $row->name, 'value' => (string) $row->value);
  }

  $duplicate_return = $object->query("INSERT INTO $table (name, value) VALUES ('alpha', 'duplicate')");
  $duplicate_last_error_is_string = is_string($object->last_error) && '' !== $object->last_error;
  $duplicate_insert_id = $object->insert_id;
  $duplicate_last_query_mentions_insert = str_starts_with(strtolower(ltrim((string) $object->last_query)), 'insert');
  $delete_return = $object->query("DELETE FROM $table WHERE name = 'alpha'");
  $drop_after_return = $object->query("DROP TABLE IF EXISTS $table");

  return array(
    'not_ready_return' => $not_ready_return,
    'not_ready_check_current_query' => $not_ready_check_current_query,
    'empty_return' => $empty_return,
    'empty_insert_id' => $empty_insert_id,
    'drop_return' => $drop_return,
    'create_return' => $create_return,
    'insert_alpha_return' => $insert_alpha_return,
    'insert_alpha_id_is_positive' => $insert_alpha_id_is_positive,
    'insert_beta_return' => $insert_beta_return,
    'insert_beta_id_is_positive' => $insert_beta_id_is_positive,
    'update_return' => $update_return,
    'select_return' => $select_return,
    'select_num_rows' => $select_num_rows,
    'selected_rows' => $selected_rows,
    'duplicate_return' => $duplicate_return,
    'duplicate_last_error_is_string' => $duplicate_last_error_is_string,
    'duplicate_insert_id' => $duplicate_insert_id,
    'duplicate_last_query_mentions_insert' => $duplicate_last_query_mentions_insert,
    'delete_return' => $delete_return,
    'drop_after_return' => $drop_after_return,
    'num_queries_increased' => $object->num_queries > $starting_num_queries
  );
}

function wphx_305_29_bridge_snapshot($object): array {
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
    'col_info_names' => wphx_305_29_col_info_names($col_info),
    'strategy_result_route' => $strategy::nativeResourceWriteRoute('result'),
    'strategy_col_info_route' => $strategy::lazyReadRoute('col_info')
  );
}

function wphx_305_29_plugin_snapshot($object): array {
  $object->wphx_plugin_extension = 'plugin-value';
  $before_col_meta = wphx_305_29_value_shape($object->__get('col_meta'));
  $object->__set('col_meta', array('blocked' => true));
  $after_col_meta = wphx_305_29_value_shape($object->__get('col_meta'));
  $before_table_charset = wphx_305_29_value_shape($object->__get('table_charset'));
  $object->__set('table_charset', array('blocked' => true));
  $after_table_charset = wphx_305_29_value_shape($object->__get('table_charset'));
  return array(
    'dynamic_property_added' => isset($object->wphx_plugin_extension) && 'plugin-value' === $object->wphx_plugin_extension,
    'dynamic_property_in_object_vars' => array_key_exists('wphx_plugin_extension', get_object_vars($object)),
    'col_meta_write_blocked' => $before_col_meta === $after_col_meta,
    'table_charset_write_blocked' => $before_table_charset === $after_table_charset
  );
}

function wphx_305_29_reflection_shape(string $class_name): array {
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

#[AllowDynamicProperties]
class WPHX_305_29_Oracle_Db_Connect_Shell extends wpdb {
  public function wphx_set_dbpassword_for_probe(string $dbpassword): void {
    $this->dbpassword = $dbpassword;
  }
}

$oracle = new WPHX_305_29_Oracle_Db_Connect_Shell($db_user, $db_password, $db_name, $db_host_with_port);
$candidate = new WPHX_305_29_Wpdb_Db_Connect_Shell($db_user, $db_password, $db_name, $db_host_with_port);

$db_connect_strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbDbConnectStrategy';
$query_strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbQueryExecutionStrategy';
$method_strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbMethodBodyStrategy';
$class_shell_strategy = '\\\\wphx\\\\wp\\\\db\\\\WpdbClassShellStrategy';
$strategy_contract = array(
  'class_shell_kind' => $class_shell_strategy::classShellKind(),
  'owned_connection_bodies' => wphx_305_29_native_array($db_connect_strategy::ownedConnectionBodies()),
  'db_connect_route' => $db_connect_strategy::connectionBodyRoute('db_connect'),
  'parse_db_host_handoff_route' => $db_connect_strategy::connectionBodyRoute('parse_db_host_handoff'),
  'native_real_connect_route' => $db_connect_strategy::connectionBodyRoute('native_real_connect'),
  'connection_failure_route' => $db_connect_strategy::connectionBodyRoute('connection_failure'),
  'connection_success_route' => $db_connect_strategy::connectionBodyRoute('connection_success'),
  'connection_unknown_route' => $db_connect_strategy::connectionBodyRoute('prepare'),
  'owns_db_connect' => $db_connect_strategy::ownsConnectionBody('db_connect'),
  'owns_parse_db_host_handoff' => $db_connect_strategy::ownsConnectionBody('parse_db_host_handoff'),
  'owns_native_real_connect' => $db_connect_strategy::ownsConnectionBody('native_real_connect'),
  'owns_connection_failure' => $db_connect_strategy::ownsConnectionBody('connection_failure'),
  'owns_connection_success' => $db_connect_strategy::ownsConnectionBody('connection_success'),
  'mark_is_mysql' => $db_connect_strategy::shouldMarkIsMysql(),
  'client_flags_default' => $db_connect_strategy::clientFlags(false, 128),
  'client_flags_defined' => $db_connect_strategy::clientFlags(true, 128),
  'disable_mysqli_report' => $db_connect_strategy::shouldDisableMysqliReport(),
  'use_parsed_db_host_data_true' => $db_connect_strategy::shouldUseParsedDbHostData(true),
  'use_parsed_db_host_data_false' => $db_connect_strategy::shouldUseParsedDbHostData(false),
  'bracket_ipv6_with_mysqlnd' => $db_connect_strategy::shouldBracketIpv6Host(true, true),
  'bracket_ipv6_without_mysqlnd' => $db_connect_strategy::shouldBracketIpv6Host(true, false),
  'bracket_ipv4_with_mysqlnd' => $db_connect_strategy::shouldBracketIpv6Host(false, true),
  'bracket_ipv6_host' => $db_connect_strategy::bracketIpv6Host('::1'),
  'debug_real_connect_true' => $db_connect_strategy::shouldUseDebugRealConnect(true),
  'debug_real_connect_false' => $db_connect_strategy::shouldUseDebugRealConnect(false),
  'clear_dbh_on_connect_error' => $db_connect_strategy::shouldClearDbhOnConnectError(1045),
  'keep_dbh_on_no_connect_error' => $db_connect_strategy::shouldClearDbhOnConnectError(0),
  'bail_on_connection_failure' => $db_connect_strategy::shouldBailOnConnectionFailure(false, true),
  'skip_bail_when_not_allowed' => $db_connect_strategy::shouldBailOnConnectionFailure(false, false),
  'skip_bail_when_dbh_present' => $db_connect_strategy::shouldBailOnConnectionFailure(true, true),
  'return_false_on_connection_failure' => $db_connect_strategy::shouldReturnFalseOnConnectionFailure(false),
  'run_connection_success' => $db_connect_strategy::shouldRunConnectionSuccess(true),
  'initialize_charset_on_first_db_connect' => $db_connect_strategy::shouldInitializeCharsetOnDbConnect(false),
  'skip_charset_initialize_after_first_connect' => $db_connect_strategy::shouldInitializeCharsetOnDbConnect(true),
  'set_has_connected_when_dbh_present' => $db_connect_strategy::shouldSetHasConnected(true),
  'mark_ready_when_dbh_present' => $db_connect_strategy::shouldMarkReady(true),
  'set_sql_mode_after_ready' => $db_connect_strategy::shouldSetSqlModeAfterReady(true),
  'select_database_after_ready' => $db_connect_strategy::shouldSelectDatabaseAfterReady(true),
  'preserves_query_execution_strategy' => $db_connect_strategy::preservesQueryExecutionStrategy(),
  'preserves_method_body_strategy' => $db_connect_strategy::preservesMethodBodyStrategy(),
  'preserves_class_shell_strategy' => $db_connect_strategy::preservesClassShellStrategy(),
  'owned_execution_bodies' => wphx_305_29_native_array($query_strategy::ownedExecutionBodies()),
  'query_route' => $query_strategy::executionBodyRoute('query'),
  'do_native_query_route' => $query_strategy::executionBodyRoute('do_native_query'),
  'db_connect_success_route' => $query_strategy::executionBodyRoute('db_connect_success'),
  'check_connection_reconnect_route' => $query_strategy::executionBodyRoute('check_connection_reconnect'),
  'unknown_route' => $query_strategy::executionBodyRoute('prepare'),
  'owns_query' => $query_strategy::ownsExecutionBody('query'),
  'owns_do_native_query' => $query_strategy::ownsExecutionBody('do_native_query'),
  'not_ready_short_circuit_true' => $query_strategy::shouldShortCircuitNotReady(false),
  'not_ready_short_circuit_false' => $query_strategy::shouldShortCircuitNotReady(true),
  'run_filtered_query_true' => $query_strategy::shouldRunFilteredQuery('SELECT 1'),
  'run_filtered_query_false_empty' => $query_strategy::shouldRunFilteredQuery(''),
  'run_filtered_query_false_zero' => $query_strategy::shouldRunFilteredQuery('0'),
  'reset_insert_id_for_empty_query' => $query_strategy::shouldResetInsertIdForEmptyQuery(false),
  'invalid_text_check_true' => $query_strategy::shouldRunInvalidTextCheck(true, false),
  'invalid_text_check_false_when_ascii' => $query_strategy::shouldRunInvalidTextCheck(true, true),
  'reject_stripped_query_true' => $query_strategy::shouldRejectStrippedQuery(false),
  'reset_check_current_query_after_validation' => $query_strategy::shouldResetCheckCurrentQueryAfterValidation(),
  'func_call_value' => $query_strategy::funcCallValue('SELECT 1'),
  'ddl_kind' => $query_strategy::queryKind('CREATE TABLE wphx (id int)'),
  'insert_kind' => $query_strategy::queryKind('INSERT INTO wphx VALUES (1)'),
  'write_kind' => $query_strategy::queryKind('UPDATE wphx SET id = 2'),
  'read_kind' => $query_strategy::queryKind('SELECT 1'),
  'return_native_result_for_ddl' => $query_strategy::shouldReturnNativeResult('ddl'),
  'use_affected_rows_for_insert' => $query_strategy::shouldUseAffectedRows('insert_or_replace'),
  'store_insert_id_for_insert' => $query_strategy::shouldStoreInsertId('insert_or_replace'),
  'clear_insert_id_after_insert_error' => $query_strategy::shouldClearInsertIdAfterError(12, 'insert_or_replace'),
  'attempt_reconnect_for_2006' => $query_strategy::shouldAttemptReconnect(false, 2006),
  'execute_native_query_when_dbh_present' => $query_strategy::shouldExecuteNativeQuery(true),
  'capture_query_log_false' => $query_strategy::shouldCaptureQueryLog(false),
  'next_query_count' => $query_strategy::nextQueryCount(3),
  'populate_selected_rows_for_native_result' => $query_strategy::shouldPopulateSelectedRows(true),
  'initial_selected_row_count' => $query_strategy::initialSelectedRowCount(),
  'next_selected_row_count' => $query_strategy::nextSelectedRowCount(3),
  'selected_rows_return_value' => $query_strategy::selectedRowsReturnValue(4),
  'query_initialize_charset_on_first_db_connect' => $query_strategy::shouldInitializeCharsetOnDbConnect(false),
  'query_mark_db_connection_ready_when_dbh_present' => $query_strategy::shouldMarkDbConnectionReady(true),
  'query_preserves_flush_and_column_info_strategy' => $query_strategy::preservesFlushAndColumnInfoStrategy(),
  'query_preserves_class_shell_strategy' => $query_strategy::preservesClassShellStrategy(),
  'method_body_flush_route' => $method_strategy::methodBodyRoute('flush'),
  'method_body_get_col_info_route' => $method_strategy::methodBodyRoute('get_col_info')
);

$oracle_constructor = wphx_305_29_constructor_snapshot($oracle);
$candidate_constructor = wphx_305_29_constructor_snapshot($candidate);
$oracle_db_connect_success = wphx_305_29_db_connect_success_snapshot($oracle);
$candidate_db_connect_success = wphx_305_29_db_connect_success_snapshot($candidate);
$oracle_db_connect_failure_subject = new WPHX_305_29_Oracle_Db_Connect_Shell($db_user, $db_password, $db_name, $db_host_with_port);
$candidate_db_connect_failure_subject = new WPHX_305_29_Wpdb_Db_Connect_Shell($db_user, $db_password, $db_name, $db_host_with_port);
$bad_password = $db_password . '-wphx-bad';
$oracle_db_connect_failure = wphx_305_29_db_connect_failure_snapshot($oracle_db_connect_failure_subject, $bad_password);
$candidate_db_connect_failure = wphx_305_29_db_connect_failure_snapshot($candidate_db_connect_failure_subject, $bad_password);
$oracle_parse_db_host = wphx_305_29_parse_db_host_snapshot($oracle);
$candidate_parse_db_host = wphx_305_29_parse_db_host_snapshot($candidate);
$oracle_query = wphx_305_29_query_snapshot($oracle);
$candidate_query = wphx_305_29_query_snapshot($candidate);
$oracle_flush = wphx_305_29_flush_snapshot($oracle);
$candidate_flush = wphx_305_29_flush_snapshot($candidate);
$oracle_query_execution = wphx_305_29_query_execution_snapshot($oracle, $runtime_id);
$candidate_query_execution = wphx_305_29_query_execution_snapshot($candidate, $runtime_id);
$candidate_bridge = wphx_305_29_bridge_snapshot($candidate);
$oracle_plugin = wphx_305_29_plugin_snapshot($oracle);
$candidate_plugin = wphx_305_29_plugin_snapshot($candidate);
$oracle_reflection = wphx_305_29_reflection_shape('wpdb');
$candidate_reflection = wphx_305_29_reflection_shape('WPHX_305_29_Wpdb_Db_Connect_Shell');

$comparisons = array(
  'constructor_side_effects_preserved' => $oracle_constructor === $candidate_constructor,
  'db_connect_success_side_effects_preserved' => $oracle_db_connect_success === $candidate_db_connect_success && true === $candidate_db_connect_success['return_value'] && true === $candidate_db_connect_success['dbh_is_mysqli'] && true === $candidate_db_connect_success['ready'] && true === $candidate_db_connect_success['has_connected'] && $candidate_db_connect_success['database_name'] === $db_name,
  'db_connect_failure_path_preserved' => $oracle_db_connect_failure === $candidate_db_connect_failure && false === $candidate_db_connect_failure['return_value'] && 'null' === $candidate_db_connect_failure['dbh_shape']['type'],
  'db_host_parse_handoff_preserved' => $oracle_parse_db_host === $candidate_parse_db_host,
  'actual_mysqli_query_result_preserved' => $oracle_query === $candidate_query,
  'query_execution_paths_preserved' => $oracle_query_execution === $candidate_query_execution,
  'query_not_ready_and_empty_paths_preserved' => false === $candidate_query_execution['not_ready_return'] && true === $candidate_query_execution['not_ready_check_current_query'] && false === $candidate_query_execution['empty_return'] && 0 === $candidate_query_execution['empty_insert_id'],
  'query_write_and_insert_id_paths_preserved' => 1 === $candidate_query_execution['insert_alpha_return'] && true === $candidate_query_execution['insert_alpha_id_is_positive'] && 1 === $candidate_query_execution['insert_beta_return'] && true === $candidate_query_execution['insert_beta_id_is_positive'] && 1 === $candidate_query_execution['update_return'],
  'query_selected_row_population_preserved' => 2 === $candidate_query_execution['select_return'] && 2 === $candidate_query_execution['select_num_rows'] && $candidate_query_execution['selected_rows'] === array(array('name' => 'alpha', 'value' => 'one'), array('name' => 'beta', 'value' => 'two-updated')),
  'query_error_insert_id_clearing_preserved' => false === $candidate_query_execution['duplicate_return'] && true === $candidate_query_execution['duplicate_last_error_is_string'] && 0 === $candidate_query_execution['duplicate_insert_id'] && true === $candidate_query_execution['duplicate_last_query_mentions_insert'],
  'get_col_info_all_columns_preserved' => $oracle_query['get_col_info_names'] === $candidate_query['get_col_info_names'] && $candidate_query['get_col_info_names'] === array('alpha', 'beta'),
  'get_col_info_single_column_preserved' => $oracle_query['get_col_info_single_name'] === $candidate_query['get_col_info_single_name'] && 'beta' === $candidate_query['get_col_info_single_name'],
  'flush_resource_lifecycle_preserved' => $oracle_flush === $candidate_flush && $candidate_flush['before']['result_is_mysqli_result'] && $candidate_flush['after']['result_is_null'] && 0 === $candidate_flush['after']['last_result_count'],
  'lazy_col_info_materialization_preserved' => $candidate_query['col_info_names'] === array('alpha', 'beta') && $candidate_query['get_col_info_names'] === array('alpha', 'beta'),
  'parent_visible_native_resource_bridge_preserved' => $candidate_bridge['dbh_is_mysqli'] && $candidate_bridge['result_is_mysqli_result'] && $candidate_bridge['col_info_names'] === array('bridge_alpha', 'bridge_beta'),
  'plugin_dynamic_property_preserved' => $oracle_plugin['dynamic_property_added'] === $candidate_plugin['dynamic_property_added'] && $candidate_plugin['dynamic_property_in_object_vars'],
  'protected_magic_write_blocks_preserved' => $oracle_plugin['col_meta_write_blocked'] && $candidate_plugin['col_meta_write_blocked'] && $oracle_plugin['table_charset_write_blocked'] && $candidate_plugin['table_charset_write_blocked'],
  'reflection_public_properties_preserved' => $oracle_reflection['public_properties'] === $candidate_reflection['public_properties'],
  'reflection_public_magic_methods_preserved' => $oracle_reflection['public_magic_methods'] === $candidate_reflection['public_magic_methods'],
  'reflection_dynamic_properties_preserved' => $candidate_reflection['allows_dynamic_properties'] === true,
  'db_connect_routes_present' => $strategy_contract['owns_db_connect'] && $strategy_contract['owns_parse_db_host_handoff'] && $strategy_contract['owns_native_real_connect'] && $strategy_contract['owns_connection_failure'] && $strategy_contract['owns_connection_success'] && 'typed_haxe_db_connect_decision_php_abi_body' === $strategy_contract['db_connect_route'] && 'typed_haxe_db_connect_decision_php_abi_body' === $strategy_contract['native_real_connect_route'],
  'db_connect_decisions_preserved' => $strategy_contract['mark_is_mysql'] && 0 === $strategy_contract['client_flags_default'] && 128 === $strategy_contract['client_flags_defined'] && $strategy_contract['disable_mysqli_report'] && $strategy_contract['use_parsed_db_host_data_true'] && !$strategy_contract['use_parsed_db_host_data_false'] && $strategy_contract['bracket_ipv6_with_mysqlnd'] && !$strategy_contract['bracket_ipv6_without_mysqlnd'] && !$strategy_contract['bracket_ipv4_with_mysqlnd'] && '[::1]' === $strategy_contract['bracket_ipv6_host'] && $strategy_contract['debug_real_connect_true'] && !$strategy_contract['debug_real_connect_false'] && $strategy_contract['clear_dbh_on_connect_error'] && !$strategy_contract['keep_dbh_on_no_connect_error'] && $strategy_contract['bail_on_connection_failure'] && !$strategy_contract['skip_bail_when_not_allowed'] && !$strategy_contract['skip_bail_when_dbh_present'] && $strategy_contract['return_false_on_connection_failure'] && $strategy_contract['run_connection_success'] && $strategy_contract['initialize_charset_on_first_db_connect'] && !$strategy_contract['skip_charset_initialize_after_first_connect'] && $strategy_contract['set_has_connected_when_dbh_present'] && $strategy_contract['mark_ready_when_dbh_present'] && $strategy_contract['set_sql_mode_after_ready'] && $strategy_contract['select_database_after_ready'],
  'query_execution_routes_present' => $strategy_contract['owns_query'] && $strategy_contract['owns_do_native_query'] && 'typed_haxe_execution_decision_php_abi_body' === $strategy_contract['query_route'] && 'typed_haxe_execution_decision_php_abi_body' === $strategy_contract['do_native_query_route'],
  'query_execution_decisions_preserved' => $strategy_contract['not_ready_short_circuit_true'] && !$strategy_contract['not_ready_short_circuit_false'] && $strategy_contract['run_filtered_query_true'] && !$strategy_contract['run_filtered_query_false_empty'] && !$strategy_contract['run_filtered_query_false_zero'] && $strategy_contract['attempt_reconnect_for_2006'],
  'query_execution_dependency_preserved' => $strategy_contract['preserves_query_execution_strategy'] && $strategy_contract['query_initialize_charset_on_first_db_connect'] && $strategy_contract['query_mark_db_connection_ready_when_dbh_present'],
  'strategy_preserves_method_body_and_class_shell_dependencies' => $strategy_contract['preserves_method_body_strategy'] && $strategy_contract['preserves_class_shell_strategy'] && $strategy_contract['query_preserves_flush_and_column_info_strategy'] && $strategy_contract['query_preserves_class_shell_strategy'] && 'typed_haxe_decision_php_abi_body' === $strategy_contract['method_body_flush_route'] && 'typed_haxe_decision_php_abi_body' === $strategy_contract['method_body_get_col_info_route']
);

echo json_encode(
  array(
    'runtime' => $runtime_id,
    'strategy_contract' => $strategy_contract,
    'oracle' => array(
      'constructor' => $oracle_constructor,
      'db_connect_success' => $oracle_db_connect_success,
      'db_connect_failure' => $oracle_db_connect_failure,
      'parse_db_host' => $oracle_parse_db_host,
      'query' => $oracle_query,
      'flush' => $oracle_flush,
      'query_execution' => $oracle_query_execution,
      'plugin' => $oracle_plugin,
      'reflection' => $oracle_reflection
    ),
    'candidate' => array(
      'constructor' => $candidate_constructor,
      'db_connect_success' => $candidate_db_connect_success,
      'db_connect_failure' => $candidate_db_connect_failure,
      'parse_db_host' => $candidate_parse_db_host,
      'query' => $candidate_query,
      'flush' => $candidate_flush,
      'query_execution' => $candidate_query_execution,
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

function isolatedProbeSource(kind) {
  const isCandidate = kind === "candidate";
  const bootstrap = isCandidate
    ? `require_once ${phpString(resolve(SHELL))};
$class_name = 'WPHX_305_29_Wpdb_Db_Connect_Shell';
$expected_candidate_file = realpath(${phpString(resolve(SHELL))});
`
    : `${wordpressProbeStubs()}
require_once ${phpString(resolve(upstreamPath("src/wp-includes/class-wpdb.php")))};
#[AllowDynamicProperties]
class WPHX_305_29_Isolated_Oracle_Wpdb extends wpdb {
  public function wphx_set_dbpassword_for_probe(string $dbpassword): void {
    $this->dbpassword = $dbpassword;
  }
}
$class_name = 'WPHX_305_29_Isolated_Oracle_Wpdb';
$expected_candidate_file = null;
`;

  return `<?php
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');
mysqli_report(MYSQLI_REPORT_OFF);

${bootstrap}

$db_host = $argv[1];
$db_port = (int) $argv[2];
$db_user = $argv[3];
$db_password = $argv[4];
$db_name = $argv[5];
$runtime_id = $argv[6];
$side = $argv[7];
$db_host_with_port = $db_host . ':' . $db_port;

function wphx_700_03_normalize_host($value): string {
  return preg_replace('/:\\\\d+$/', ':<port>', (string) $value);
}

function wphx_700_03_value_shape($value): array {
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

function wphx_700_03_constructor_snapshot($object): array {
  return array(
    'dbuser' => $object->__get('dbuser'),
    'dbpassword_set' => is_string($object->__get('dbpassword')) && '' !== $object->__get('dbpassword'),
    'dbname_set' => is_string($object->__get('dbname')) && '' !== $object->__get('dbname'),
    'dbhost' => wphx_700_03_normalize_host($object->__get('dbhost')),
    'dbh_type' => get_debug_type($object->__get('dbh')),
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'use_mysqli' => $object->__get('use_mysqli'),
    'charset' => $object->charset,
    'collate' => $object->collate
  );
}

function wphx_700_03_db_connect_success_snapshot($object): array {
  $return_value = $object->db_connect(false);
  $database_return = $object->query('SELECT DATABASE() AS db_name');
  $database_name = is_array($object->last_result) && isset($object->last_result[0])
    ? (string) $object->last_result[0]->db_name
    : null;
  return array(
    'return_value' => $return_value,
    'dbh_type' => get_debug_type($object->__get('dbh')),
    'dbh_is_mysqli' => $object->__get('dbh') instanceof mysqli,
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'use_mysqli' => $object->__get('use_mysqli'),
    'charset' => $object->charset,
    'collate' => $object->collate,
    'database_query_return' => $database_return,
    'database_name_matches_input' => $database_name === $object->__get('dbname')
  );
}

function wphx_700_03_db_connect_failure_snapshot($object, string $bad_password): array {
  $object->wphx_set_dbpassword_for_probe($bad_password);
  $return_value = $object->db_connect(false);
  return array(
    'return_value' => $return_value,
    'dbh_shape' => wphx_700_03_value_shape($object->__get('dbh')),
    'ready' => $object->ready,
    'has_connected' => $object->__get('has_connected'),
    'is_mysql' => $object->is_mysql,
    'last_error_is_string' => is_string($object->last_error)
  );
}

function wphx_700_03_parse_db_host_snapshot($object): array {
  $hosts = array(
    'ipv4_port' => '127.0.0.1:3306',
    'localhost_socket' => 'localhost:/tmp/mysql.sock',
    'ipv6_bracketed_port' => '[::1]:3306',
    'ipv6_plain' => '::1'
  );
  $parsed = array();
  foreach ($hosts as $name => $host) {
    $parsed[$name] = $object->parse_db_host($host);
  }
  return $parsed;
}

function wphx_700_03_query_snapshot($object): array {
  $return_value = $object->query("SELECT 1 AS alpha, 'two' AS beta");
  return array(
    'return_value' => $return_value,
    'result_is_mysqli_result' => $object->__get('result') instanceof mysqli_result,
    'num_rows' => $object->num_rows,
    'last_result_count' => is_array($object->last_result) ? count($object->last_result) : null,
    'last_result_first_row' => is_array($object->last_result) && isset($object->last_result[0])
      ? array('alpha' => (string) $object->last_result[0]->alpha, 'beta' => (string) $object->last_result[0]->beta)
      : null
  );
}

function wphx_700_03_identifier($name): string {
  return chr(96) . str_replace(chr(96), chr(96) . chr(96), $name) . chr(96);
}

function wphx_700_03_query_execution_snapshot($object, string $runtime_id): array {
  $table = wphx_700_03_identifier('wphx_700_03_' . preg_replace('/[^a-z0-9_]+/i', '_', strtolower($runtime_id)));
  $drop_return = $object->query("DROP TABLE IF EXISTS $table");
  $create_return = $object->query("CREATE TABLE $table (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(32) NOT NULL UNIQUE, value VARCHAR(32) NOT NULL)");
  $insert_alpha_return = $object->query("INSERT INTO $table (name, value) VALUES ('alpha', 'one')");
  $insert_beta_return = $object->query("INSERT INTO $table (name, value) VALUES ('beta', 'two')");
  $update_return = $object->query("UPDATE $table SET value = 'two-updated' WHERE name = 'beta'");
  $select_return = $object->query("SELECT name, value FROM $table ORDER BY id ASC");
  $selected_rows = array();
  foreach ((array) $object->last_result as $row) {
    $selected_rows[] = array('name' => (string) $row->name, 'value' => (string) $row->value);
  }
  $duplicate_return = $object->query("INSERT INTO $table (name, value) VALUES ('alpha', 'duplicate')");
  $duplicate_insert_id = $object->insert_id;
  $duplicate_last_error_is_string = is_string($object->last_error) && '' !== $object->last_error;
  $drop_after_return = $object->query("DROP TABLE IF EXISTS $table");

  return array(
    'drop_return' => $drop_return,
    'create_return' => $create_return,
    'insert_alpha_return' => $insert_alpha_return,
    'insert_beta_return' => $insert_beta_return,
    'update_return' => $update_return,
    'select_return' => $select_return,
    'selected_rows' => $selected_rows,
    'duplicate_return' => $duplicate_return,
    'duplicate_insert_id' => $duplicate_insert_id,
    'duplicate_last_error_is_string' => $duplicate_last_error_is_string,
    'drop_after_return' => $drop_after_return
  );
}

function wphx_700_03_plugin_snapshot($object): array {
  $object->wphx_plugin_extension = 'plugin-value';
  return array(
    'dynamic_property_added' => isset($object->wphx_plugin_extension) && 'plugin-value' === $object->wphx_plugin_extension,
    'dynamic_property_in_object_vars' => array_key_exists('wphx_plugin_extension', get_object_vars($object))
  );
}

function wphx_700_03_linked_candidate_abi(string $class_name, ?string $expected_candidate_file): array {
  $reflection = new ReflectionClass($class_name);
  $class_file = realpath($reflection->getFileName());
  $parent = $reflection->getParentClass();
  $owned_methods = array();
  foreach (array('db_connect', 'query', 'flush', 'get_col_info') as $method_name) {
    $method = $reflection->getMethod($method_name);
    $declaring_class = $method->getDeclaringClass();
    $declaring_file = realpath($method->getFileName());
    $owned_methods[$method_name] = array(
      'declaring_class' => $declaring_class->getName(),
      'declaring_file' => $declaring_file,
      'declared_by_candidate_class' => $declaring_class->getName() === $class_name,
      'declared_in_candidate_file' => $expected_candidate_file !== null && $declaring_file === $expected_candidate_file
    );
  }
  $all_owned_methods_declared_by_candidate = true;
  foreach ($owned_methods as $method) {
    $all_owned_methods_declared_by_candidate = $all_owned_methods_declared_by_candidate
      && $method['declared_by_candidate_class']
      && $method['declared_in_candidate_file'];
  }
  return array(
    'class_name' => $reflection->getName(),
    'class_file' => $class_file,
    'expected_candidate_file' => $expected_candidate_file,
    'class_declared_in_candidate_file' => $expected_candidate_file !== null && $class_file === $expected_candidate_file,
    'parent_class' => $parent ? $parent->getName() : null,
    'parent_file' => $parent ? realpath($parent->getFileName()) : null,
    'owned_methods' => $owned_methods,
    'all_owned_methods_declared_by_candidate' => $all_owned_methods_declared_by_candidate
  );
}

$subject = new $class_name($db_user, $db_password, $db_name, $db_host_with_port);
$failure_subject = new $class_name($db_user, $db_password, $db_name, $db_host_with_port);
$bad_password = $db_password . '-wphx-bad';

$observations = array(
  'constructor' => wphx_700_03_constructor_snapshot($subject),
  'db_connect_success' => wphx_700_03_db_connect_success_snapshot($subject),
  'db_connect_failure' => wphx_700_03_db_connect_failure_snapshot($failure_subject, $bad_password),
  'parse_db_host' => wphx_700_03_parse_db_host_snapshot($subject),
  'query' => wphx_700_03_query_snapshot($subject),
  'query_execution' => wphx_700_03_query_execution_snapshot($subject, $runtime_id),
  'plugin' => wphx_700_03_plugin_snapshot($subject)
);
$abi = ${isCandidate ? "wphx_700_03_linked_candidate_abi($class_name, $expected_candidate_file)" : "null"};

echo json_encode(
  array(
    'runtime' => $runtime_id,
    'side' => $side,
    'database' => $db_name,
    'process_isolation' => true,
    'observations' => $observations,
    'linked_candidate_abi' => $abi,
    'status' => 'passed'
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

$dropin_db_connect_return = $wpdb->db_connect(false);
$query_return = $wpdb->query("SELECT 11 AS dropin_alpha, 'twelve' AS dropin_beta");
$result = $wpdb->__get('result');
$col_info = $wpdb->__get('col_info');
$get_col_info_names = $wpdb->get_col_info('name');
$get_col_info_single_name = $wpdb->get_col_info('name', 1);
$col_names = array();
foreach ((array) $col_info as $column) {
  $col_names[] = $column->name;
}
$wpdb->flush();
$flush_result_is_null = null === $wpdb->__get('result');
$flush_last_result_count = is_array($wpdb->last_result) ? count($wpdb->last_result) : null;
$flush_last_query_is_null = null === $wpdb->last_query;
$flush_num_rows = $wpdb->num_rows;
$dropin_table = chr(96) . 'wphx_305_29_dropin_' . preg_replace('/[^a-z0-9_]+/i', '_', strtolower($runtime_id)) . chr(96);
$dropin_drop_return = $wpdb->query("DROP TABLE IF EXISTS $dropin_table");
$dropin_create_return = $wpdb->query("CREATE TABLE $dropin_table (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(32) NOT NULL UNIQUE, value VARCHAR(32) NOT NULL)");
$dropin_insert_return = $wpdb->query("INSERT INTO $dropin_table (name, value) VALUES ('dropin', 'query-body')");
$dropin_insert_id_is_positive = $wpdb->insert_id > 0;
$dropin_select_return = $wpdb->query("SELECT name, value FROM $dropin_table ORDER BY id ASC");
$dropin_selected_row = isset($wpdb->last_result[0])
  ? array('name' => (string) $wpdb->last_result[0]->name, 'value' => (string) $wpdb->last_result[0]->value)
  : null;
$dropin_duplicate_return = $wpdb->query("INSERT INTO $dropin_table (name, value) VALUES ('dropin', 'duplicate')");
$dropin_duplicate_insert_id = $wpdb->insert_id;
$dropin_duplicate_last_error_is_string = is_string($wpdb->last_error) && '' !== $wpdb->last_error;
$dropin_drop_after_return = $wpdb->query("DROP TABLE IF EXISTS $dropin_table");
$wpdb->wphx_dropin_plugin_property = 'dropin-plugin';

echo json_encode(
  array(
    'runtime' => $runtime_id,
    'class_wpdb_loaded' => class_exists('wpdb'),
    'global_wpdb_set' => isset($wpdb),
    'global_wpdb_class' => is_object($wpdb) ? get_class($wpdb) : null,
    'dropin_replacement_preserved' => is_object($wpdb) && 'WPHX_305_29_Dropin_Wpdb' === get_class($wpdb),
    'constructor_side_effects_available' => is_object($wpdb) && true === $wpdb->ready && true === $wpdb->__get('has_connected') && $wpdb->__get('dbh') instanceof mysqli,
    'db_connect_body_available' => true === $dropin_db_connect_return && true === $wpdb->ready && true === $wpdb->__get('has_connected') && $wpdb->__get('dbh') instanceof mysqli,
    'actual_result_available' => $result instanceof mysqli_result && 1 === $query_return,
    'lazy_col_info_available' => $col_names === array('dropin_alpha', 'dropin_beta'),
    'method_body_get_col_info_available' => $get_col_info_names === array('dropin_alpha', 'dropin_beta') && 'dropin_beta' === $get_col_info_single_name,
    'method_body_flush_available' => $flush_result_is_null && 0 === $flush_last_result_count && $flush_last_query_is_null && 0 === $flush_num_rows,
    'query_execution_body_available' => true === $dropin_drop_return && true === $dropin_create_return && 1 === $dropin_insert_return && true === $dropin_insert_id_is_positive && 1 === $dropin_select_return && $dropin_selected_row === array('name' => 'dropin', 'value' => 'query-body') && false === $dropin_duplicate_return && 0 === $dropin_duplicate_insert_id && true === $dropin_duplicate_last_error_is_string && true === $dropin_drop_after_return,
    'dynamic_plugin_property_available' => is_object($wpdb) && 'dropin-plugin' === ($wpdb->wphx_dropin_plugin_property ?? null)
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`;
}

function writeProbeFiles() {
  mkdirSync(OUT_ROOT, { recursive: true });
  mkdirSync(DROPIN_DIR, { recursive: true });
  mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  writeFileSync(SHELL, shellSource());
  writeFileSync(PROBE, classShellProbeSource());
  writeFileSync(ISOLATED_ORACLE_PROBE, isolatedProbeSource("oracle"));
  writeFileSync(ISOLATED_CANDIDATE_PROBE, isolatedProbeSource("candidate"));
  writeFileSync(
    DROPIN,
    `<?php
require_once ${phpString(resolve(SHELL))};
#[AllowDynamicProperties]
class WPHX_305_29_Dropin_Wpdb extends WPHX_305_29_Wpdb_Db_Connect_Shell {
}
$wpdb = new WPHX_305_29_Dropin_Wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST);
`
  );
  writeFileSync(DROPIN_PROBE, dropinProbeSource());
}

function runJsonPhp(path, runtime, port) {
  return JSON.parse(command("php", [path, "127.0.0.1", String(port), DB_USER, DB_PASSWORD, DB_NAME, runtime.id]));
}

function artifactRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function runJsonPhpWithArtifacts(path, args, artifactPrefix) {
  const result = spawnSync("php", [path, ...args], {
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 1024 * 1024 * 80
  });
  const stdoutPath = `${DIAGNOSTICS_DIR}/${artifactPrefix}.stdout.json`;
  const stderrPath = `${DIAGNOSTICS_DIR}/${artifactPrefix}.stderr.txt`;
  const processPath = `${DIAGNOSTICS_DIR}/${artifactPrefix}.process.json`;
  mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  writeFileSync(stdoutPath, result.stdout ?? "");
  writeFileSync(stderrPath, result.stderr ?? "");
  const processRecord = {
    command: ["php", path, ...args]
      .map((value, index) => (index === 3 || index === 5 ? "<redacted>" : value))
      .join(" "),
    status: result.status,
    signal: result.signal,
    error: result.error ? result.error.message : null
  };
  writeFileSync(processPath, JSON.stringify(processRecord, null, 2) + "\n");
  if (result.status !== 0) {
    throw new Error(`${path} failed with status ${result.status}; see ${processPath}`);
  }
  return {
    json: JSON.parse(result.stdout),
    diagnostics: {
      stdout: artifactRecord(stdoutPath),
      stderr: artifactRecord(stderrPath),
      process: artifactRecord(processPath)
    }
  };
}

function runIsolatedParity(runtime, port) {
  const oracleDb = isolatedDbName(runtime, "oracle");
  const candidateDb = isolatedDbName(runtime, "candidate");
  const oracleDbReset = resetDatabase(port, oracleDb);
  const candidateDbReset = resetDatabase(port, candidateDb);
  const oracleRun = runJsonPhpWithArtifacts(
    ISOLATED_ORACLE_PROBE,
    ["127.0.0.1", String(port), DB_USER, DB_PASSWORD, oracleDb, runtime.id, "oracle"],
    `${runtime.id}-isolated-oracle`
  );
  const candidateRun = runJsonPhpWithArtifacts(
    ISOLATED_CANDIDATE_PROBE,
    ["127.0.0.1", String(port), DB_USER, DB_PASSWORD, candidateDb, runtime.id, "candidate"],
    `${runtime.id}-isolated-candidate`
  );
  const observationsMatch =
    JSON.stringify(oracleRun.json.observations) === JSON.stringify(candidateRun.json.observations);
  const abi = candidateRun.json.linked_candidate_abi;
  const linkedCandidateAbiPassed =
    abi?.class_declared_in_candidate_file === true && abi?.all_owned_methods_declared_by_candidate === true;
  return {
    evidence_class: "live_integration_parity",
    artifact_scope: "linked_candidate",
    process_model: "separate_php_processes",
    database_model: "separate_schemas",
    databases: {
      oracle: oracleDbReset.database,
      candidate: candidateDbReset.database
    },
    oracle: {
      process_isolation: oracleRun.json.process_isolation,
      diagnostics: oracleRun.diagnostics
    },
    candidate: {
      process_isolation: candidateRun.json.process_isolation,
      diagnostics: candidateRun.diagnostics,
      linked_candidate_abi: abi
    },
    comparisons: {
      isolated_observations_match: observationsMatch,
      linked_candidate_abi_passed: linkedCandidateAbiPassed,
      separate_database_names: oracleDb !== candidateDb,
      separate_processes_recorded:
        oracleRun.json.process_isolation === true && candidateRun.json.process_isolation === true
    },
    status: observationsMatch && linkedCandidateAbiPassed && oracleDb !== candidateDb ? "passed" : "failed"
  };
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
      owned_connection_bodies: /function ownedConnectionBodies\s*\(/.test(source),
      connection_body_route: /function connectionBodyRoute\s*\(/.test(source),
      owns_connection_body: /function ownsConnectionBody\s*\(/.test(source),
      should_mark_is_mysql: /function shouldMarkIsMysql\s*\(/.test(source),
      client_flags: /function clientFlags\s*\(/.test(source),
      should_disable_mysqli_report: /function shouldDisableMysqliReport\s*\(/.test(source),
      should_use_parsed_db_host_data: /function shouldUseParsedDbHostData\s*\(/.test(source),
      should_bracket_ipv6_host: /function shouldBracketIpv6Host\s*\(/.test(source),
      bracket_ipv6_host: /function bracketIpv6Host\s*\(/.test(source),
      should_use_debug_real_connect: /function shouldUseDebugRealConnect\s*\(/.test(source),
      should_clear_dbh_on_connect_error: /function shouldClearDbhOnConnectError\s*\(/.test(source),
      should_bail_on_connection_failure: /function shouldBailOnConnectionFailure\s*\(/.test(source),
      should_return_false_on_connection_failure: /function shouldReturnFalseOnConnectionFailure\s*\(/.test(source),
      should_run_connection_success: /function shouldRunConnectionSuccess\s*\(/.test(source),
      should_initialize_charset_on_db_connect: /function shouldInitializeCharsetOnDbConnect\s*\(/.test(source),
      should_set_has_connected: /function shouldSetHasConnected\s*\(/.test(source),
      should_mark_ready: /function shouldMarkReady\s*\(/.test(source),
      should_set_sql_mode_after_ready: /function shouldSetSqlModeAfterReady\s*\(/.test(source),
      should_select_database_after_ready: /function shouldSelectDatabaseAfterReady\s*\(/.test(source),
      preserves_query_execution_strategy: /function preservesQueryExecutionStrategy\s*\(/.test(source),
      preserves_method_body_strategy: /function preservesMethodBodyStrategy\s*\(/.test(source),
      preserves_class_shell_strategy: /function preservesClassShellStrategy\s*\(/.test(source)
    }
  };
}

function runtimeSummary(runtime, probe, dropinProbe, isolatedParity, image, query) {
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
    isolated_parity: isolatedParity,
    passed:
      probe.status === "passed" &&
      Object.values(probe.comparisons).every(Boolean) &&
      dropinProbe.dropin_replacement_preserved === true &&
      dropinProbe.constructor_side_effects_available === true &&
      dropinProbe.db_connect_body_available === true &&
      dropinProbe.actual_result_available === true &&
      dropinProbe.lazy_col_info_available === true &&
      dropinProbe.method_body_get_col_info_available === true &&
      dropinProbe.method_body_flush_available === true &&
      dropinProbe.query_execution_body_available === true &&
      dropinProbe.dynamic_plugin_property_available === true &&
      isolatedParity.status === "passed"
  };
}

function sanitizedRunCommand(path, runtime) {
  return `php ${path} 127.0.0.1 <port> ${DB_USER} <password> ${DB_NAME} ${runtime.id}`;
}

function ownershipManifest(manifestSha, upstreamDigest, runtimes) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-db-connect-strategy-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "module",
      name: "wpdb db connect strategy",
      area: "wp-includes",
      public_contract:
        "WordPress-compatible wpdb remains a PHP-visible class/global while typed Haxe owns the decision model for db_connect() construction, DB_HOST parse handoff, native mysqli connection, failure, and success paths. WPHX-305.29 proves constructor/db_connect side effects, db_connect(false) success and failure paths, parse_db_host handoff, inherited WPHX-305.28 query execution behavior, WPHX-305.27 flush()/get_col_info() behavior, declared public properties, dynamic plugin properties, magic accessors, native mysqli handles/results, lazy col_info materialization, and require_wp_db()/db.php replacement behavior."
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
      "src/wphx/wp/db/WpdbDbConnectStrategy.hx",
      "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbDbConnectStrategyCandidateEntry.hx",
      "tools/wp-core/run-wpdb-db-connect-strategy-candidate.mjs",
      OUT,
      HARDENING_OUT,
      RECEIPT
    ],
    generated_paths: [
      HAXE_OUT,
      SHELL,
      PROBE,
      ISOLATED_ORACLE_PROBE,
      ISOLATED_CANDIDATE_PROBE,
      DIAGNOSTICS_DIR,
      DROPIN,
      DROPIN_PROBE,
      OUT,
      OWNERSHIP,
      RECEIPT,
      HARDENING_OUT,
      HARDENING_RECEIPT
    ],
    typed_haxe_ownership: {
      strategy: "wphx.wp.db.WpdbDbConnectStrategy",
      owns: [
        "owned wpdb connection-body list for db_connect(), DB_HOST parse handoff, native mysqli connection, connection failure, and connection success decisions",
        "db_connect() is_mysql/client-flags/mysqli-report setup decisions",
        "db_connect() DB_HOST parse handoff and IPv6 mysqlnd bracket decisions",
        "db_connect() debug versus silenced real-connect decision",
        "db_connect() connect-error, allow_bail, and return-false decisions",
        "db_connect() charset initialization, has_connected, ready, SQL mode, and database selection decisions",
        "WPHX-305.28 query execution dependency checks",
        "WPHX-305.27 flush()/get_col_info() dependency checks",
        "class-shell/plugin ABI dependency checks"
      ],
      does_not_yet_own: [
        "prepare(), dbDelta(), and other broad wpdb method bodies",
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
        `WPHX-305.29 provisions ${runtimes.map((runtime) => runtime.id).join(" and ")} from locked images and compares a WPHX_305_29_Wpdb_Db_Connect_Shell subclass against WordPress wpdb for db_connect() success/failure paths, parse_db_host handoff, inherited query() execution paths, get_col_info() paths, flush() resource cleanup, constructor side effects, mysqli_result, lazy col_info, plugin mutation, reflection shape, protected magic write blocks, and db.php replacement. WPHX-700.03 adds separate oracle/candidate PHP processes with separate schemas plus linked-candidate ABI reflection for candidate-owned method declarations.`
    },
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-db-connect-strategy-candidate",
        "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
        "npm run wp:core:wphx-305-query-execution-strategy-candidate:check",
        "npm run wp:core:wphx-305-method-body-strategy-candidate:check",
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
        "receipt:wphx-305-29-wpdb-db-connect-strategy-candidate",
        "receipt:wphx-700-03-isolated-parity-and-linked-abi",
        "receipt:wphx-305-28-wpdb-query-execution-strategy-candidate",
        "receipt:wphx-305-27-wpdb-method-body-strategy-candidate",
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

const queryExecutionStrategyCandidate = readJson(QUERY_EXECUTION_STRATEGY_CANDIDATE);
const methodBodyStrategyCandidate = readJson(METHOD_BODY_STRATEGY_CANDIDATE);
const classShellResourceStrategyCandidate = readJson(CLASS_SHELL_RESOURCE_STRATEGY_CANDIDATE);
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
  console.error(JSON.stringify({ status: "failed", error: "docker server unavailable; WPHX-305.29 requires live DB containers" }, null, 2));
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
    const isolatedParity = runIsolatedParity(runtime, port);
    return runtimeSummary(runtime, classShellProbe, dropinProbe, isolatedParity, image, query);
  });
  runtimeResults.push(result);
}

const strategyContract = runtimeResults[0]?.class_shell_probe?.strategy_contract ?? {};
const expectedOwnedConnectionBodies = ["connection_failure", "connection_success", "db_connect", "native_real_connect", "parse_db_host_handoff"];
const expectedOwnedExecutionBodies = ["check_connection_reconnect", "db_connect_success", "do_native_query", "query"];
const strategyMatchesPlan = {
  class_shell_kind_is_php_abi_subclass: strategyContract.class_shell_kind === "php_abi_subclass_shell",
  owned_connection_bodies_match_expected: arraysEqual(sorted(strategyContract.owned_connection_bodies ?? []), sorted(expectedOwnedConnectionBodies)),
  connection_body_routes_match_expected:
    strategyContract.db_connect_route === "typed_haxe_db_connect_decision_php_abi_body" &&
    strategyContract.parse_db_host_handoff_route === "typed_haxe_db_connect_decision_php_abi_body" &&
    strategyContract.native_real_connect_route === "typed_haxe_db_connect_decision_php_abi_body" &&
    strategyContract.connection_failure_route === "typed_haxe_db_connect_decision_php_abi_body" &&
    strategyContract.connection_success_route === "typed_haxe_db_connect_decision_php_abi_body" &&
    strategyContract.connection_unknown_route === "unknown",
  owns_expected_connection_bodies:
    strategyContract.owns_db_connect === true &&
    strategyContract.owns_parse_db_host_handoff === true &&
    strategyContract.owns_native_real_connect === true &&
    strategyContract.owns_connection_failure === true &&
    strategyContract.owns_connection_success === true,
  connection_decisions_match_expected:
    strategyContract.mark_is_mysql === true &&
    strategyContract.client_flags_default === 0 &&
    strategyContract.client_flags_defined === 128 &&
    strategyContract.disable_mysqli_report === true &&
    strategyContract.use_parsed_db_host_data_true === true &&
    strategyContract.use_parsed_db_host_data_false === false &&
    strategyContract.bracket_ipv6_with_mysqlnd === true &&
    strategyContract.bracket_ipv6_without_mysqlnd === false &&
    strategyContract.bracket_ipv4_with_mysqlnd === false &&
    strategyContract.bracket_ipv6_host === "[::1]" &&
    strategyContract.debug_real_connect_true === true &&
    strategyContract.debug_real_connect_false === false &&
    strategyContract.clear_dbh_on_connect_error === true &&
    strategyContract.keep_dbh_on_no_connect_error === false &&
    strategyContract.bail_on_connection_failure === true &&
    strategyContract.skip_bail_when_not_allowed === false &&
    strategyContract.skip_bail_when_dbh_present === false &&
    strategyContract.return_false_on_connection_failure === true &&
    strategyContract.run_connection_success === true &&
    strategyContract.initialize_charset_on_first_db_connect === true &&
    strategyContract.skip_charset_initialize_after_first_connect === false &&
    strategyContract.set_has_connected_when_dbh_present === true &&
    strategyContract.mark_ready_when_dbh_present === true &&
    strategyContract.set_sql_mode_after_ready === true &&
    strategyContract.select_database_after_ready === true,
  inherited_owned_execution_bodies_match_expected: arraysEqual(sorted(strategyContract.owned_execution_bodies ?? []), sorted(expectedOwnedExecutionBodies)),
  inherited_execution_body_routes_match_expected:
    strategyContract.query_route === "typed_haxe_execution_decision_php_abi_body" &&
    strategyContract.do_native_query_route === "typed_haxe_execution_decision_php_abi_body" &&
    strategyContract.db_connect_success_route === "typed_haxe_execution_decision_php_abi_body" &&
    strategyContract.check_connection_reconnect_route === "typed_haxe_execution_decision_php_abi_body" &&
    strategyContract.unknown_route === "unknown",
  owns_expected_execution_bodies: strategyContract.owns_query === true && strategyContract.owns_do_native_query === true,
  early_query_decisions_match_expected:
    strategyContract.not_ready_short_circuit_true === true &&
    strategyContract.not_ready_short_circuit_false === false &&
    strategyContract.run_filtered_query_true === true &&
    strategyContract.run_filtered_query_false_empty === false &&
    strategyContract.run_filtered_query_false_zero === false &&
    strategyContract.reset_insert_id_for_empty_query === true,
  invalid_text_decisions_match_expected:
    strategyContract.invalid_text_check_true === true &&
    strategyContract.invalid_text_check_false_when_ascii === false &&
    strategyContract.reject_stripped_query_true === true &&
    strategyContract.reset_check_current_query_after_validation === true,
  query_kind_decisions_match_expected:
    strategyContract.ddl_kind === "ddl" &&
    strategyContract.insert_kind === "insert_or_replace" &&
    strategyContract.write_kind === "write" &&
    strategyContract.read_kind === "read" &&
    strategyContract.return_native_result_for_ddl === true &&
    strategyContract.use_affected_rows_for_insert === true &&
    strategyContract.store_insert_id_for_insert === true &&
    strategyContract.clear_insert_id_after_insert_error === true,
  native_execution_decisions_match_expected:
    strategyContract.attempt_reconnect_for_2006 === true &&
    strategyContract.execute_native_query_when_dbh_present === true &&
    strategyContract.capture_query_log_false === false &&
    strategyContract.next_query_count === 4,
  selected_row_decisions_match_expected:
    strategyContract.populate_selected_rows_for_native_result === true &&
    strategyContract.initial_selected_row_count === 0 &&
    strategyContract.next_selected_row_count === 4 &&
    strategyContract.selected_rows_return_value === 4,
  preserves_query_execution_dependency:
    strategyContract.preserves_query_execution_strategy === true &&
    strategyContract.query_initialize_charset_on_first_db_connect === true &&
    strategyContract.query_mark_db_connection_ready_when_dbh_present === true,
  preserves_method_body_and_class_shell_dependencies:
    strategyContract.preserves_method_body_strategy === true &&
    strategyContract.preserves_class_shell_strategy === true &&
    strategyContract.query_preserves_flush_and_column_info_strategy === true &&
    strategyContract.query_preserves_class_shell_strategy === true &&
    strategyContract.method_body_flush_route === "typed_haxe_decision_php_abi_body" &&
    strategyContract.method_body_get_col_info_route === "typed_haxe_decision_php_abi_body"
};

const runtimeResultsPassed = runtimeResults.every((result) => result.passed);
const predecessorStatuses = {
  query_execution_strategy: queryExecutionStrategyCandidate.validation_result?.status ?? null,
  method_body_strategy: methodBodyStrategyCandidate.validation_result?.status ?? null,
  class_shell_resource_strategy: classShellResourceStrategyCandidate.validation_result?.status ?? null,
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
  schema: "wphx.wp-core-wpdb-db-connect-strategy-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-db-connect-strategy-candidate.mjs",
  evidence_class: "live_integration_parity",
  artifact_scope: "bridge_shell_with_linked_candidate_isolation",
  artifact_scope_notes:
    "The historical class-shell/drop-in probes remain bridge_shell evidence. WPHX-700.03 adds isolated oracle/candidate PHP processes with separate schemas and a linked_candidate ABI check for candidate-owned method declarations.",
  inputs: {
    query_execution_strategy_candidate_manifest: inputRecord(QUERY_EXECUTION_STRATEGY_CANDIDATE),
    method_body_strategy_candidate_manifest: inputRecord(METHOD_BODY_STRATEGY_CANDIDATE),
    public_state_expanded_storage_adapter_candidate_manifest: inputRecord(PUBLIC_STATE_EXPANDED_STORAGE_ADAPTER_CANDIDATE),
    class_shell_resource_strategy_candidate_manifest: inputRecord(CLASS_SHELL_RESOURCE_STRATEGY_CANDIDATE),
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
    candidate_kind: "typed_haxe_wpdb_db_connect_strategy",
    selected_strategy: "typed-wpdb-db-connect-strategy-and-live-php-abi-shell",
    haxe_version: haxeVersion,
    locked_haxe_version: toolchainLock.tools.haxe.version,
    locked_php_cli: toolchainLock.tools.php_cli.executable,
    generated_haxe_files: filesUnder(HAXE_OUT),
    haxe_db_connect_strategy: {
      source: "src/wphx/wp/db/WpdbDbConnectStrategy.hx",
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
        isolated_parity_status: result.isolated_parity.status,
        isolated_parity: stableIsolatedParity(result.isolated_parity),
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
      query_execution_strategy: {
        manifest: QUERY_EXECUTION_STRATEGY_CANDIDATE,
        validation_result: queryExecutionStrategyCandidate.validation_result
      },
      method_body_strategy: {
        manifest: METHOD_BODY_STRATEGY_CANDIDATE,
        validation_result: methodBodyStrategyCandidate.validation_result
      },
      class_shell_resource_strategy: {
        manifest: CLASS_SHELL_RESOURCE_STRATEGY_CANDIDATE,
        validation_result: classShellResourceStrategyCandidate.validation_result
      },
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
        manifest: QUERY_EXECUTION_STRATEGY_CANDIDATE,
        gap: "full-db-connect-native-construction-not-yet-haxe-owned",
        resolution:
          "WPHX-305.29 builds on WPHX-305.28 by moving db_connect() construction, DB_HOST parse handoff, native mysqli connection, failure, and success decisions into a typed Haxe strategy while preserving the live PHP ABI shell."
      },
      {
        manifest: METHOD_BODY_STRATEGY_CANDIDATE,
        gap: "query-and-db-connect-method-bodies-not-yet-haxe-owned",
        resolution:
          "WPHX-305.29 keeps the WPHX-305.27 method-body proof green and adds typed Haxe-owned db_connect() construction decisions on top of the WPHX-305.28 query execution strategy."
      },
      {
        manifest: ROW_MATERIALIZATION_CANDIDATE,
        gap: "full-wpdb-replacement-dropin-behavior-not-yet-proven",
        resolution:
          "WPHX-305.29 keeps the row materialization/live mysqli gates green and proves db.php replacement/global $wpdb behavior reaches the Haxe-owned db_connect(), query(), get_col_info(), and flush() decisions."
      }
    ],
    remaining_gaps: [
      {
        id: "prepare-and-escaping-method-bodies-not-yet-haxe-owned",
        owner: "WPHX-305.30",
        detail:
          "WPHX-305.29 owns db_connect() construction decisions and keeps query execution green, but prepare(), placeholder escaping, esc_like(), and adjacent escaping/sanitization wpdb methods remain future typed Haxe ownership work."
      },
      {
        id: "packaged-distribution-bootstrap-not-yet-owned",
        owner: "future packaged-distribution WPHX-305 workset",
        detail:
          "WPHX-700.03 adds linked-candidate ABI proof that owned methods are declared by candidate-owned files instead of inherited upstream fallbacks. Packaging the replacement into a distributable WordPress core layout remains future distribution work."
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
    selected_strategy: "typed-wpdb-db-connect-strategy-and-live-php-abi-shell",
    db_runtimes: runtimeResults.length,
    runtime_results_passed: runtimeResultsPassed,
    constructor_side_effects_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.constructor_side_effects_preserved),
    db_connect_success_side_effects_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.db_connect_success_side_effects_preserved
    ),
    db_connect_failure_path_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.db_connect_failure_path_preserved),
    db_host_parse_handoff_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.db_host_parse_handoff_preserved),
    actual_mysqli_query_result_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.actual_mysqli_query_result_preserved),
    query_execution_paths_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.query_execution_paths_preserved),
    query_not_ready_and_empty_paths_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.query_not_ready_and_empty_paths_preserved
    ),
    query_write_and_insert_id_paths_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.query_write_and_insert_id_paths_preserved
    ),
    query_selected_row_population_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.query_selected_row_population_preserved
    ),
    query_error_insert_id_clearing_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.query_error_insert_id_clearing_preserved
    ),
    get_col_info_all_columns_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.get_col_info_all_columns_preserved),
    get_col_info_single_column_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.get_col_info_single_column_preserved),
    flush_resource_lifecycle_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.flush_resource_lifecycle_preserved),
    lazy_col_info_materialization_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.lazy_col_info_materialization_preserved),
    parent_visible_native_resource_bridge_preserved: runtimeResults.every(
      (result) => result.class_shell_probe.comparisons.parent_visible_native_resource_bridge_preserved
    ),
    plugin_dynamic_property_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.plugin_dynamic_property_preserved),
    protected_magic_write_blocks_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.protected_magic_write_blocks_preserved),
    reflection_public_properties_preserved: runtimeResults.every((result) => result.class_shell_probe.comparisons.reflection_public_properties_preserved),
    require_wp_db_dropin_replacement_preserved: runtimeResults.every((result) => result.dropin_probe.dropin_replacement_preserved),
    isolated_oracle_candidate_processes_preserved: runtimeResults.every(
      (result) => result.isolated_parity.comparisons.separate_processes_recorded
    ),
    isolated_oracle_candidate_databases_preserved: runtimeResults.every(
      (result) => result.isolated_parity.comparisons.separate_database_names
    ),
    isolated_oracle_candidate_observations_preserved: runtimeResults.every(
      (result) => result.isolated_parity.comparisons.isolated_observations_match
    ),
    linked_candidate_abi_declares_owned_methods: runtimeResults.every(
      (result) => result.isolated_parity.comparisons.linked_candidate_abi_passed
    ),
    dropin_db_connect_body_preserved: runtimeResults.every((result) => result.dropin_probe.db_connect_body_available),
    dropin_method_body_get_col_info_preserved: runtimeResults.every((result) => result.dropin_probe.method_body_get_col_info_available),
    dropin_method_body_flush_preserved: runtimeResults.every((result) => result.dropin_probe.method_body_flush_available),
    dropin_query_execution_body_preserved: runtimeResults.every((result) => result.dropin_probe.query_execution_body_available),
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
const hardeningManifest = {
  schema: "wphx.operation-isolated-parity-and-linked-abi.v1",
  issue: HARDENING_ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-db-connect-strategy-candidate.mjs",
  source_manifest: {
    path: OUT,
    sha256: manifestSha
  },
  evidence_class: "live_integration_parity",
  artifact_scope: "linked_candidate",
  claim:
    "WPHX-305.29 now includes isolated oracle/candidate PHP processes with separate database schemas and linked-candidate ABI reflection proving owned wpdb methods are declared by candidate-owned files.",
  runtime_results: runtimeResults.map((result) => ({
    id: result.id,
    engine: result.engine,
    isolated_parity: stableIsolatedParity(result.isolated_parity)
  })),
  validation_result: {
    status:
      runtimeResults.every((result) => result.isolated_parity.status === "passed") &&
      manifest.validation_result.linked_candidate_abi_declares_owned_methods
        ? "passed"
        : "failed",
    db_runtimes: runtimeResults.length,
    isolated_oracle_candidate_processes_preserved: manifest.validation_result.isolated_oracle_candidate_processes_preserved,
    isolated_oracle_candidate_databases_preserved: manifest.validation_result.isolated_oracle_candidate_databases_preserved,
    isolated_oracle_candidate_observations_preserved: manifest.validation_result.isolated_oracle_candidate_observations_preserved,
    linked_candidate_abi_declares_owned_methods: manifest.validation_result.linked_candidate_abi_declares_owned_methods,
    full_diagnostics_preserved_by_digest: runtimeResults.every(
      (result) =>
        result.isolated_parity.oracle.diagnostics.stdout.sha256.startsWith("sha256:") &&
        result.isolated_parity.oracle.diagnostics.stderr.sha256.startsWith("sha256:") &&
        result.isolated_parity.candidate.diagnostics.stdout.sha256.startsWith("sha256:") &&
        result.isolated_parity.candidate.diagnostics.stderr.sha256.startsWith("sha256:")
    )
  }
};
const hardeningManifestText = JSON.stringify(hardeningManifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-29-wpdb-db-connect-strategy-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "typed Haxe wpdb db connect strategy candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "db connect strategy ownership manifest"
    },
    {
      path: "src/wphx/wp/db/WpdbDbConnectStrategy.hx",
      role: "typed Haxe wpdb db_connect decision policy"
    },
    {
      path: "src/wphx/wp/db/WpdbQueryExecutionStrategy.hx",
      role: "predecessor typed Haxe wpdb query execution strategy kept green"
    },
    {
      path: "src/wphx/wp/db/WpdbClassShellStrategy.hx",
      role: "predecessor class-shell/native-resource boundary used by the db connect strategy"
    },
    {
      path: "tools/wp-core/run-wpdb-db-connect-strategy-candidate.mjs",
      role: "live db_connect/resource/drop-in proof runner with WPHX-700.03 isolated process/schema lane"
    },
    {
      path: HARDENING_OUT,
      role: "WPHX-700.03 isolated oracle/candidate and linked-candidate ABI hardening manifest"
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
    "npm run wp:core:wphx-305-db-connect-strategy-candidate",
    "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
    "npm run wp:core:wphx-305-query-execution-strategy-candidate:check",
    "npm run wp:core:wphx-305-method-body-strategy-candidate:check",
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
const hardeningReceipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-700-03-isolated-parity-and-linked-abi",
  issue: HARDENING_ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: HARDENING_OUT,
      role: "isolated oracle/candidate process and linked-candidate ABI manifest"
    },
    {
      path: OUT,
      role: "strengthened WPHX-305.29 db_connect live parity manifest"
    },
    {
      path: "tools/wp-core/run-wpdb-db-connect-strategy-candidate.mjs",
      role: "runner that emits isolated PHP process diagnostics and linked-candidate ABI checks"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-db-connect-strategy-candidate",
    "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  evidence_class: hardeningManifest.evidence_class,
  artifact_scope: hardeningManifest.artifact_scope,
  validation_result: hardeningManifest.validation_result
};
const hardeningReceiptText = JSON.stringify(hardeningReceipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
  writeOrCheck(HARDENING_OUT, hardeningManifestText);
  writeOrCheck(HARDENING_RECEIPT, hardeningReceiptText);
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
      hardening_output: HARDENING_OUT,
      hardening_receipt: HARDENING_RECEIPT,
      selected_strategy: manifest.validation_result.selected_strategy,
      db_runtimes: manifest.validation_result.db_runtimes,
      constructor_side_effects_preserved: manifest.validation_result.constructor_side_effects_preserved,
      db_connect_success_side_effects_preserved: manifest.validation_result.db_connect_success_side_effects_preserved,
      db_connect_failure_path_preserved: manifest.validation_result.db_connect_failure_path_preserved,
      db_host_parse_handoff_preserved: manifest.validation_result.db_host_parse_handoff_preserved,
      actual_mysqli_query_result_preserved: manifest.validation_result.actual_mysqli_query_result_preserved,
      query_execution_paths_preserved: manifest.validation_result.query_execution_paths_preserved,
      query_write_and_insert_id_paths_preserved: manifest.validation_result.query_write_and_insert_id_paths_preserved,
      query_selected_row_population_preserved: manifest.validation_result.query_selected_row_population_preserved,
      query_error_insert_id_clearing_preserved: manifest.validation_result.query_error_insert_id_clearing_preserved,
      get_col_info_all_columns_preserved: manifest.validation_result.get_col_info_all_columns_preserved,
      get_col_info_single_column_preserved: manifest.validation_result.get_col_info_single_column_preserved,
      flush_resource_lifecycle_preserved: manifest.validation_result.flush_resource_lifecycle_preserved,
      lazy_col_info_materialization_preserved: manifest.validation_result.lazy_col_info_materialization_preserved,
      parent_visible_native_resource_bridge_preserved: manifest.validation_result.parent_visible_native_resource_bridge_preserved,
      require_wp_db_dropin_replacement_preserved: manifest.validation_result.require_wp_db_dropin_replacement_preserved,
      isolated_oracle_candidate_processes_preserved: manifest.validation_result.isolated_oracle_candidate_processes_preserved,
      isolated_oracle_candidate_databases_preserved: manifest.validation_result.isolated_oracle_candidate_databases_preserved,
      isolated_oracle_candidate_observations_preserved: manifest.validation_result.isolated_oracle_candidate_observations_preserved,
      linked_candidate_abi_declares_owned_methods: manifest.validation_result.linked_candidate_abi_declares_owned_methods,
      dropin_db_connect_body_preserved: manifest.validation_result.dropin_db_connect_body_preserved
    },
    null,
    2
  )
);
