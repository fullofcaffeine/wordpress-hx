#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { normalizeGeneratedPhpForManifest, walk } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ys8",
  external_ref: "WPHX-311.10",
  title: "Add DB-backed and cross-origin REST browser matrix"
};
const RECORDED_AT = "2026-06-22T21:30:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const INSTALLED_BROWSER_RUNNER = "tools/wp-core/run-rest-server-installed-browser-gate.mjs";
const BUILD_ROOT = "build/wp-core/wphx-311-07";
const MATRIX_BUILD_ROOT = "build/wp-core/wphx-311-10";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const DB_ROUTER = "wphx-rest-db-browser-router.php";
const OUT = "manifests/wp-core/wphx-311-10-rest-server-db-browser-matrix.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-10-rest-server-db-browser-matrix.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-10-rest-server-db-browser-matrix.v1.json";
const PRIOR_MANIFEST = "manifests/wp-core/wphx-311-09-rest-server-installed-browser.v1.json";
const RUNNER = "tools/wp-core/run-rest-server-db-browser-matrix.mjs";
const UPSTREAM_WPDB = `${UPSTREAM_ROOT}/src/wp-includes/class-wpdb.php`;
const UPSTREAM_HTTP = `${UPSTREAM_ROOT}/src/wp-includes/http.php`;
const UPSTREAM_SERVER = `${UPSTREAM_ROOT}/src/wp-includes/rest-api/class-wp-rest-server.php`;
const DB_PASSWORD = "wordpresshx-live-password";
const BASE_DB_NAME = "wordpresshx_rest_matrix";
const DB_USER = "root";
const OWNED_METHODS = ["serve_request", "dispatch", "respond_to_request"];
const SELECTED_HEADERS = [
  "content-type",
  "x-robots-tag",
  "link",
  "x-content-type-options",
  "access-control-expose-headers",
  "access-control-allow-headers",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-credentials",
  "vary",
  "allow"
];
const SAME_ORIGIN_CASES = [
  {
    id: "db-browser:get-settings-seeded",
    method: "GET",
    path: "/wp-json/wp/v2/settings",
    focus: "browser fetch reads REST settings through real wpdb/wp_options storage"
  },
  {
    id: "db-browser:post-settings-form-update",
    method: "POST",
    path: "/wp-json/wp/v2/settings",
    body: "wphx_rest_text=db-form&renamed_count=31",
    contentType: "application/x-www-form-urlencoded",
    focus: "browser form POST mutates REST settings through real wpdb/wp_options writes"
  },
  {
    id: "db-browser:get-settings-after-update",
    method: "GET",
    path: "/wp-json/wp/v2/settings",
    focus: "browser fetch observes the prior real database-backed settings update"
  },
  {
    id: "db-browser:options-settings",
    method: "OPTIONS",
    path: "/wp-json/wp/v2/settings",
    focus: "browser OPTIONS sees REST allowed methods and exposed headers over DB-backed root"
  }
];
const CROSS_ORIGIN_CASES = [
  {
    id: "cross-origin:get-settings-cors",
    method: "GET",
    path: "/wp-json/wp/v2/settings",
    focus: "cross-origin browser fetch reads CORS-enabled DB-backed settings response"
  },
  {
    id: "cross-origin:post-json-preflight-update",
    method: "POST",
    path: "/wp-json/wp/v2/settings",
    body: JSON.stringify({ wphx_rest_text: "cors-json", renamed_count: 44 }),
    contentType: "application/json",
    extraHeaders: {
      "x-wphx-preflight": "1"
    },
    focus: "cross-origin browser JSON POST triggers preflight and writes settings through real wpdb storage"
  }
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

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function stablePackageContent(value) {
  const cwd = process.cwd().replaceAll("\\", "/");
  const upstreamRoot = resolve(UPSTREAM_ROOT).replaceAll("\\", "/");
  return normalizeGeneratedPhpForManifest(value)
    .replaceAll(cwd, "<repo>")
    .replaceAll(upstreamRoot, "../wordpress-develop");
}

function stablePackageFile(root, path) {
  const normalized = stablePackageContent(readFileSync(path, "utf8"));
  return {
    path: `${root}/${relative(root, path)}`,
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized)
  };
}

function normalizePath(value) {
  if (typeof value !== "string") return value;
  const cwd = process.cwd().replaceAll("\\", "/");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  return normalized;
}

function stableRuntimeValue(value) {
  if (Array.isArray(value)) return value.map(stableRuntimeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stableRuntimeValue(entry)]));
  }
  return normalizePath(value);
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function phpString(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function imageRef(image) {
  return `${image.repository}@${image.index_digest}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          rejectPort(new Error("Unable to reserve a local HTTP port"));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function normalizeHeadersFromObject(headers) {
  const normalized = {};
  for (const header of SELECTED_HEADERS) {
    const value = headers[header] ?? headers[header.toLowerCase()] ?? null;
    if (value !== null) {
      normalized[header] = String(value).replaceAll(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
    }
  }
  return normalized;
}

function ensureDbRoot(root) {
  mkdirSync(`${root}/wp-includes`, { recursive: true });
  copyFileSync(UPSTREAM_WPDB, `${root}/wp-includes/class-wpdb.php`);
  copyFileSync(UPSTREAM_HTTP, `${root}/wp-includes/http.php`);
  writeDbRouter(root);
  command("php", ["-l", `${root}/${DB_ROUTER}`]);
  command("php", ["-l", `${root}/wp-includes/class-wpdb.php`]);
  command("php", ["-l", `${root}/wp-includes/http.php`]);
}

function writeDbRouter(root) {
  const upstreamServer = resolve(UPSTREAM_SERVER);
  const logPath = `${resolve(MATRIX_BUILD_ROOT)}/logs/${root.includes("candidate") ? "candidate" : "oracle"}-requests.jsonl`;
  const router = `<?php
$root = __DIR__;
$wphx_311_10_upstream_server = realpath( ${phpString(upstreamServer)} );
$wphx_311_10_log_path = getenv( 'WPHX_311_10_LOG_PATH' ) ?: ${phpString(logPath)};

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );
mysqli_report( MYSQLI_REPORT_OFF );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );
define( 'WP_DEBUG_DISPLAY', false );
define( 'DB_NAME', getenv( 'WPHX_DB_NAME' ) );
define( 'DB_USER', getenv( 'WPHX_DB_USER' ) );
define( 'DB_PASSWORD', getenv( 'WPHX_DB_PASSWORD' ) );
define( 'DB_HOST', getenv( 'WPHX_DB_HOST' ) . ':' . getenv( 'WPHX_DB_PORT' ) );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', 'utf8mb4_unicode_ci' );
$table_prefix = 'wp_';

$GLOBALS['wphx_311_10_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_10_php_errors'][] = array(
\t\t\t'errno'   => $errno,
\t\t\t'message' => $errstr,
\t\t);
\t\treturn true;
\t}
);

function wphx_311_10_log_request() {
\tglobal $wphx_311_10_log_path;
\t$record = array(
\t\t'method' => $_SERVER['REQUEST_METHOD'] ?? '',
\t\t'path' => parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH ),
\t\t'origin' => $_SERVER['HTTP_ORIGIN'] ?? null,
\t\t'access_control_request_method' => $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'] ?? null,
\t\t'access_control_request_headers' => $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? null,
\t\t'status' => http_response_code(),
\t\t'response_headers' => headers_list(),
\t\t'php_errors' => $GLOBALS['wphx_311_10_php_errors'],
\t);
\tfile_put_contents( $wphx_311_10_log_path, json_encode( $record, JSON_UNESCAPED_SLASHES ) . PHP_EOL, FILE_APPEND );
}
register_shutdown_function( 'wphx_311_10_log_request' );

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_10_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args' => $args,
\t);
\treturn true;
}

function is_user_logged_in() {
\treturn true;
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/pomo/translations.php';
require_once ABSPATH . WPINC . '/l10n.php';
require_once ABSPATH . WPINC . '/class-wp-list-util.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wp-http-response.php';
require_once ABSPATH . WPINC . '/functions.php';
require_once ABSPATH . WPINC . '/class-wpdb.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/kses.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/http.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . WPINC . '/link-template.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-request.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-response.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-server.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-controller.php';
require_once ABSPATH . WPINC . '/rest-api.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-settings-controller.php';

global $wpdb;
$wpdb = new wpdb( DB_USER, DB_PASSWORD, DB_NAME, DB_HOST );
$wpdb->set_prefix( $table_prefix );
wp_cache_init();

function wphx_311_10_setup_db() {
\tglobal $wpdb;
\t$charset_collate = 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
\t$wpdb->query( "CREATE TABLE IF NOT EXISTS {$wpdb->options} (option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT, option_name varchar(191) NOT NULL DEFAULT '', option_value longtext NOT NULL, autoload varchar(20) NOT NULL DEFAULT 'yes', PRIMARY KEY  (option_id), UNIQUE KEY option_name (option_name), KEY autoload (autoload)) $charset_collate" );
\t$seeds = array(
\t\t'home' => array( 'https://example.test', 'on' ),
\t\t'siteurl' => array( 'https://example.test', 'on' ),
\t\t'blog_charset' => array( 'UTF-8', 'on' ),
\t\t'permalink_structure' => array( '', 'on' ),
\t\t'wphx_rest_text' => array( 'stored-db-text', 'off' ),
\t\t'wphx_rest_named' => array( '12', 'off' ),
\t);
\tforeach ( $seeds as $name => $seed ) {
\t\t$exists = $wpdb->get_var( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name = %s LIMIT 1", $name ) );
\t\tif ( null === $exists ) {
\t\t\t$wpdb->query( $wpdb->prepare( "INSERT INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, %s)", $name, maybe_serialize( $seed[0] ), $seed[1] ) );
\t\t}
\t}
}

function wphx_311_10_register_settings() {
\tglobal $wp_registered_settings, $new_allowed_options;
\t$wp_registered_settings = array();
\t$new_allowed_options = array();
\t$GLOBALS['new_whitelist_options'] = &$new_allowed_options;
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_text',
\t\tarray(
\t\t\t'type' => 'string',
\t\t\t'label' => 'REST text',
\t\t\t'description' => 'REST-visible text setting',
\t\t\t'show_in_rest' => true,
\t\t\t'default' => 'fallback-text',
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_named',
\t\tarray(
\t\t\t'type' => 'integer',
\t\t\t'label' => 'Named count',
\t\t\t'description' => 'REST-visible renamed integer',
\t\t\t'default' => 7,
\t\t\t'show_in_rest' => array(
\t\t\t\t'name' => 'renamed_count',
\t\t\t\t'schema' => array(
\t\t\t\t\t'minimum' => 0,
\t\t\t\t\t'context' => array( 'view', 'edit' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
}

function wphx_311_10_package_boundary() {
\tglobal $wphx_311_10_upstream_server, $wpdb;
\t$reflection = new ReflectionClass( 'WP_REST_Server' );
\t$class_file = realpath( $reflection->getFileName() );
\t$expected_class_file = realpath( ABSPATH . 'wp-includes/rest-api/class-wp-rest-server.php' );
\t$included = array_map( 'realpath', get_included_files() );
\t$included = array_values( array_filter( $included, static fn( $file ) => is_string( $file ) ) );
\t$owned_methods = array();
\tforeach ( array( 'serve_request', 'dispatch', 'respond_to_request' ) as $method_name ) {
\t\t$method = $reflection->getMethod( $method_name );
\t\t$owned_methods[ $method_name ] = array(
\t\t\t'declaring_class' => $method->getDeclaringClass()->getName(),
\t\t\t'declaring_file' => realpath( $method->getFileName() ),
\t\t\t'declared_in_package_file' => realpath( $method->getFileName() ) === $expected_class_file,
\t\t);
\t}
\treturn array(
\t\t'classFile' => $class_file,
\t\t'expectedClassFile' => $expected_class_file,
\t\t'classDeclaredInPackage' => $class_file === $expected_class_file,
\t\t'upstreamServerIncluded' => $wphx_311_10_upstream_server !== false && in_array( $wphx_311_10_upstream_server, $included, true ),
\t\t'ownedMethods' => $owned_methods,
\t\t'haxeStrategyLoaded' => class_exists( '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy' ),
\t\t'wpdbClassFile' => realpath( ( new ReflectionClass( $wpdb ) )->getFileName() ),
\t\t'dbName' => DB_NAME,
\t\t'phpErrors' => $GLOBALS['wphx_311_10_php_errors'],
\t);
}

function wphx_311_10_db_snapshot() {
\tglobal $wpdb;
\t$rows = $wpdb->get_results( "SELECT option_name, option_value, autoload FROM {$wpdb->options} WHERE option_name IN ('wphx_rest_text', 'wphx_rest_named') ORDER BY option_name ASC", ARRAY_A );
\t$result = array();
\tforeach ( $rows as $row ) {
\t\t$result[ $row['option_name'] ] = array(
\t\t\t'value' => maybe_unserialize( $row['option_value'] ),
\t\t\t'autoload' => $row['autoload'],
\t\t);
\t}
\treturn $result;
}

$path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
wphx_311_10_setup_db();

if ( '/__wphx/browser-harness' === $path ) {
\theader( 'Content-Type: text/html; charset=UTF-8' );
\techo '<!doctype html><meta charset="utf-8"><title>WPHX REST DB Browser Matrix</title><main id="wphx-rest-db-browser-matrix">ready</main>';
\treturn true;
}
if ( '/__wphx/package-boundary' === $path ) {
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( wphx_311_10_package_boundary(), JSON_UNESCAPED_SLASHES );
\treturn true;
}
if ( '/__wphx/db-snapshot' === $path ) {
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( wphx_311_10_db_snapshot(), JSON_UNESCAPED_SLASHES );
\treturn true;
}

wp_cache_flush();
rest_api_default_filters();
add_filter(
\t'rest_allowed_cors_headers',
\tfunction ( $headers ) {
\t\t$headers[] = 'X-WPHX-Preflight';
\t\treturn $headers;
\t}
);
$GLOBALS['wp_rest_additional_fields'] = array();
$GLOBALS['wphx_311_10_capability_checks'] = array();
$GLOBALS['wp_rest_server'] = new WP_REST_Server();
do_action( 'rest_api_init', $GLOBALS['wp_rest_server'] );
wphx_311_10_register_settings();
$controller = new WP_REST_Settings_Controller();
$controller->register_routes();

$rest_path = $path;
if ( str_starts_with( $rest_path, '/wp-json' ) ) {
\t$rest_path = substr( $rest_path, strlen( '/wp-json' ) );
}
if ( '' === $rest_path ) {
\t$rest_path = '/';
}

$GLOBALS['wp_rest_server']->serve_request( $rest_path );
return true;
`;
  writeFileSync(`${root}/${DB_ROUTER}`, router);
}

function dockerImageInfo(image) {
  return {
    reference: imageRef(image),
    repository: image.repository,
    index_digest: image.index_digest
  };
}

function dbProbe(port, dbName = BASE_DB_NAME) {
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
        WPHX_DB_NAME: dbName,
        WPHX_DB_PORT: String(port)
      }
    })
  );
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

async function withDbRuntime(runtime, callback) {
  const name = `wordpresshx-wphx-311-10-${runtime.id}-${process.pid}`;
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
        await sleep(2000);
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

function dbRuntimeRecords(lock) {
  return [
    {
      id: "mysql-8.4",
      engine: "mysql",
      image_lock: lock.container_images.mysql_8_4,
      cost_tier: "pr-live-db",
      env: {
        MYSQL_ROOT_PASSWORD: DB_PASSWORD,
        MYSQL_DATABASE: BASE_DB_NAME,
        MYSQL_ROOT_HOST: "%"
      }
    }
  ];
}

async function startPhpServer(root, mode, db, port) {
  const serverPort = await freePort();
  const logPath = `${MATRIX_BUILD_ROOT}/logs/${mode}-${db.name}.jsonl`;
  mkdirSync(dirname(logPath), { recursive: true });
  rmSync(logPath, { force: true });
  const proc = spawn("php", ["-S", `127.0.0.1:${serverPort}`, DB_ROUTER], {
    cwd: root,
    env: {
      ...process.env,
      WPHX_DB_HOST: "127.0.0.1",
      WPHX_DB_PORT: String(port),
      WPHX_DB_USER: DB_USER,
      WPHX_DB_PASSWORD: DB_PASSWORD,
      WPHX_DB_NAME: db.name,
      WPHX_311_10_LOG_PATH: resolve(logPath)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const ready = await fetch(`${baseUrl}/__wphx/browser-harness`);
      if (ready.status === 200) {
        return { baseUrl, proc, stdout: () => stdout, stderr: () => stderr, logPath };
      }
    } catch {
      if (proc.exitCode !== null) {
        break;
      }
    }
    await sleep(50);
  }
  proc.kill("SIGTERM");
  throw new Error(`Unable to start ${mode} DB-backed PHP server on ${baseUrl}: ${stderr || stdout}`);
}

async function startHarnessServer() {
  const port = await freePort();
  const server = createHttpServer((request, response) => {
    if (request.url === "/__wphx/cross-origin-harness") {
      response.writeHead(200, { "content-type": "text/html; charset=UTF-8" });
      response.end("<!doctype html><meta charset=\"utf-8\"><title>WPHX Cross Origin Harness</title>");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=UTF-8" });
    response.end("not found");
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolveClose) => {
        server.close(resolveClose);
      })
  };
}

async function stopPhpServer(server) {
  await new Promise((resolveStop) => {
    if (server.proc.exitCode !== null || server.proc.signalCode !== null) {
      resolveStop();
      return;
    }
    const timeout = setTimeout(() => {
      server.proc.kill("SIGKILL");
      resolveStop();
    }, 2000);
    server.proc.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    server.proc.kill("SIGTERM");
  });
}

async function launchBrowser() {
  try {
    return {
      browser: await chromium.launch({ channel: "chrome", headless: true }),
      engine: "chromium",
      channel: "chrome"
    };
  } catch (chromeError) {
    try {
      return {
        browser: await chromium.launch({ headless: true }),
        engine: "chromium",
        channel: "playwright-bundled"
      };
    } catch (bundledError) {
      bundledError.message = `${bundledError.message}\nChrome channel launch also failed: ${chromeError.message}`;
      throw bundledError;
    }
  }
}

function readRequestLog(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry) => ({
      method: entry.method,
      path: entry.path,
      origin_kind: typeof entry.origin === "string" && entry.origin.startsWith("http://127.0.0.1:") ? "local-cross-origin" : entry.origin,
      access_control_request_method: entry.access_control_request_method,
      access_control_request_headers: entry.access_control_request_headers,
      status: entry.status,
      response_headers: entry.response_headers.map((header) => header.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>")),
      php_error_count: Array.isArray(entry.php_errors) ? entry.php_errors.length : null
    }));
}

function normalizeBody(text) {
  if (text.length === 0) {
    return { kind: "empty", value: "" };
  }
  try {
    return { kind: "json", value: JSON.parse(text) };
  } catch {
    return { kind: "raw", value: text };
  }
}

async function runBrowserCases(browser, server, mode, db) {
  const page = await browser.newPage();
  const harness = await startHarnessServer();
  try {
    await page.goto(`${server.baseUrl}/__wphx/browser-harness`, { waitUntil: "domcontentloaded" });
    const sameOrigin = await page.evaluate(
      async ({ cases, selectedHeaders }) => {
        function headersFrom(response) {
          const result = {};
          for (const header of selectedHeaders) {
            const value = response.headers.get(header);
            if (value !== null) result[header] = value.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
          }
          return result;
        }
        async function runCase(testCase) {
          const headers = {};
          if (testCase.contentType) headers["content-type"] = testCase.contentType;
          const response = await fetch(testCase.path, { method: testCase.method, headers, body: testCase.body });
          const text = await response.text();
          return {
            id: testCase.id,
            method: testCase.method,
            path: testCase.path,
            status: response.status,
            headers: headersFrom(response),
            body: text.length === 0 ? { kind: "empty", value: "" } : { kind: "raw-or-json", value: text }
          };
        }
        const results = [];
        for (const testCase of cases) results.push(await runCase(testCase));
        return results;
      },
      { cases: SAME_ORIGIN_CASES, selectedHeaders: SELECTED_HEADERS }
    );

    await page.goto(`${harness.baseUrl}/__wphx/cross-origin-harness`, { waitUntil: "domcontentloaded" });
    const crossOrigin = await page.evaluate(
      async ({ apiBase, cases, selectedHeaders }) => {
        function headersFrom(response) {
          const result = {};
          for (const header of selectedHeaders) {
            const value = response.headers.get(header);
            if (value !== null) result[header] = value.replace(/http:\/\/127\.0\.0\.1:\d+/g, "http://127.0.0.1:<port>");
          }
          return result;
        }
        async function runCase(testCase) {
          const headers = {};
          if (testCase.contentType) headers["content-type"] = testCase.contentType;
          for (const [key, value] of Object.entries(testCase.extraHeaders || {})) {
            headers[key] = value;
          }
          const response = await fetch(`${apiBase}${testCase.path}`, {
            method: testCase.method,
            mode: "cors",
            credentials: "include",
            headers,
            body: testCase.body
          });
          const text = await response.text();
          return {
            id: testCase.id,
            method: testCase.method,
            path: testCase.path,
            status: response.status,
            headers: headersFrom(response),
            body: text.length === 0 ? { kind: "empty", value: "" } : { kind: "raw-or-json", value: text }
          };
        }
        const results = [];
        for (const testCase of cases) results.push(await runCase(testCase));
        return {
          harness_origin_kind: window.location.origin.startsWith("http://127.0.0.1:") ? "local-ephemeral" : "other",
          results
        };
      },
      { apiBase: server.baseUrl, cases: CROSS_ORIGIN_CASES, selectedHeaders: SELECTED_HEADERS }
    );

    const boundaryResponse = await fetch(`${server.baseUrl}/__wphx/package-boundary`);
    const boundary = await boundaryResponse.json();
    const snapshotResponse = await fetch(`${server.baseUrl}/__wphx/db-snapshot`);
    const snapshot = await snapshotResponse.json();
    return {
      mode,
      root: server.root,
      db_name: db.name,
      command: `php -S 127.0.0.1:<ephemeral> ${DB_ROUTER}`,
      same_origin: normalizeBrowserCases(sameOrigin),
      cross_origin: normalizeBrowserCases(crossOrigin.results),
      cross_origin_harness: {
        origin_kind: crossOrigin.harness_origin_kind
      },
      package_boundary: boundary,
      db_snapshot: snapshot,
      request_log: readRequestLog(server.logPath)
    };
  } finally {
    await page.close();
    await harness.close();
  }
}

function normalizeBrowserCases(cases) {
  return cases.map((entry) => ({
    id: entry.id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    headers: normalizeHeadersFromObject(entry.headers),
    body: normalizeBody(entry.body?.value ?? "")
  }));
}

function comparableRun(run) {
  return {
    same_origin: run.same_origin,
    cross_origin: run.cross_origin,
    db_snapshot: run.db_snapshot,
    preflight_count: run.request_log.filter((entry) => entry.method === "OPTIONS" && entry.origin_kind === "local-cross-origin").length,
    cross_origin_actual_count: run.request_log.filter((entry) => entry.origin_kind === "local-cross-origin" && entry.method !== "OPTIONS").length
  };
}

function compare(oracleRun, candidateRun) {
  const oracle = comparableRun(oracleRun);
  const candidate = comparableRun(candidateRun);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function assertPackageBoundary(result) {
  const checks = {
    class_declared_in_package: result.classDeclaredInPackage,
    upstream_server_not_included: !result.upstreamServerIncluded,
    owned_methods_declared_in_package: Object.values(result.ownedMethods).every((method) => method.declared_in_package_file),
    haxe_strategy_loaded: result.haxeStrategyLoaded,
    wpdb_loaded_for_db_plumbing: typeof result.wpdbClassFile === "string" && result.wpdbClassFile.endsWith("wp-includes/class-wpdb.php")
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks
  };
}

function assertCorsPreflight(run) {
  const preflights = run.request_log.filter((entry) => entry.method === "OPTIONS" && entry.origin_kind === "local-cross-origin");
  const actuals = run.request_log.filter((entry) => entry.origin_kind === "local-cross-origin" && entry.method !== "OPTIONS");
  const headerLines = preflights.flatMap((entry) => entry.response_headers);
  const checks = {
    saw_browser_preflight: preflights.length >= 1,
    saw_cross_origin_actual_request: actuals.length >= 2,
    preflight_requested_post: preflights.some((entry) => entry.access_control_request_method === "POST"),
    preflight_requested_custom_header: preflights.some((entry) => String(entry.access_control_request_headers || "").includes("x-wphx-preflight")),
    preflight_response_allowed_origin: headerLines.some((header) => /^Access-Control-Allow-Origin:/i.test(header)),
    preflight_response_allowed_methods: headerLines.some((header) => /^Access-Control-Allow-Methods:/i.test(header)),
    preflight_response_allowed_headers: headerLines.some((header) => /^Access-Control-Allow-Headers:/i.test(header))
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks,
    preflight_count: preflights.length,
    cross_origin_actual_count: actuals.length
  };
}

async function runRoot(browser, mode, root, runtime, port) {
  const db = {
    name: `wordpresshx_rest_${runtime.id.replace(/[^A-Za-z0-9_]+/g, "_")}_${mode}`
  };
  const reset = resetDatabase(port, db.name);
  const server = await startPhpServer(root, mode, db, port);
  server.root = root;
  try {
    const run = await runBrowserCases(browser, server, mode, db);
    run.database_reset = reset;
    return run;
  } finally {
    await stopPhpServer(server);
  }
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-server-db-browser`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-server-db-browser-matrix",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-distribution-db-backed-browser-matrix",
      name: "WP_REST_Server DB-backed installed browser and cross-origin CORS matrix",
      area: "wp-includes/rest-api/class-wp-rest-server.php",
      public_contract:
        "The packaged REST server candidate must match vanilla through browser fetches against isolated database-backed installed roots, including cross-origin CORS/preflight behavior and no upstream WP_REST_Server fallback."
    },
    ownership_state: "packaged_distribution_candidate",
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT, ".github/workflows/php-conformance.yml", "tools/ci/check-php-conformance-ci.mjs"],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, MATRIX_BUILD_ROOT, `${ORACLE_ROOT}/${DB_ROUTER}`, `${CANDIDATE_ROOT}/${DB_ROUTER}`],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-server-db-browser",
        "npm run wp:core:wphx-311-rest-server-db-browser:check",
        "npm run wp:core:wphx-311-rest-server-installed-browser:check",
        "npm run ci:php-conformance:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-10-rest-server-db-browser-matrix",
        "receipt:wphx-311-09-rest-server-installed-browser",
        "receipt:wphx-311-08-rest-server-web-e2e"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This matrix uses upstream wpdb as DB plumbing for the focused REST server slice. It does not claim wpdb ownership; WPHX-305 remains the database abstraction authority."
  };
}

command("node", [INSTALLED_BROWSER_RUNNER, ...(checkOnly ? ["--check"] : [])]);
mkdirSync(MATRIX_BUILD_ROOT, { recursive: true });
ensureDbRoot(ORACLE_ROOT);
ensureDbRoot(CANDIDATE_ROOT);

const toolchain = readJson("toolchain.lock.json");
const runtimes = dbRuntimeRecords(toolchain);
const launched = await launchBrowser();
const runtimeReports = [];
try {
  for (const runtime of runtimes) {
    const report = await withDbRuntime(runtime, async ({ port, query, image }) => {
      const oracleRun = await runRoot(launched.browser, "oracle", ORACLE_ROOT, runtime, port);
      const candidateRun = await runRoot(launched.browser, "candidate", CANDIDATE_ROOT, runtime, port);
      const comparison = compare(oracleRun, candidateRun);
      const candidateBoundary = assertPackageBoundary(candidateRun.package_boundary);
      const candidateCors = assertCorsPreflight(candidateRun);
      if (!comparison.matches || candidateBoundary.status !== "passed" || candidateCors.status !== "passed") {
        console.error(JSON.stringify({ status: "failed", runtime: runtime.id, comparison, candidateBoundary, candidateCors }, null, 2));
        process.exit(1);
      }
      return {
        runtime: {
          id: runtime.id,
          engine: runtime.engine,
          cost_tier: runtime.cost_tier,
          image,
          readiness_query: query
        },
        oracle: {
          command: oracleRun.command,
          db_name: oracleRun.db_name,
          normalized_sha256: sha256(JSON.stringify(comparableRun(oracleRun))),
          package_boundary: stableRuntimeValue(oracleRun.package_boundary),
          request_log_sha256: sha256(JSON.stringify(oracleRun.request_log))
        },
        candidate: {
          command: candidateRun.command,
          db_name: candidateRun.db_name,
          normalized_sha256: sha256(JSON.stringify(comparableRun(candidateRun))),
          package_boundary: stableRuntimeValue(candidateRun.package_boundary),
          request_log_sha256: sha256(JSON.stringify(candidateRun.request_log))
        },
        comparison,
        package_boundary: candidateBoundary,
        cors_preflight: candidateCors
      };
    });
    runtimeReports.push(report);
  }
} finally {
  await launched.browser.close();
}

const packageFiles = walk(CANDIDATE_ROOT)
  .map((path) => stablePackageFile(CANDIDATE_ROOT, path))
  .sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schema: "wphx.wp-core-rest-server-db-browser-matrix.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
  artifact_scope: "packaged_distribution",
  inputs: {
    runner: inputRecord(RUNNER),
    installed_browser_runner: inputRecord(INSTALLED_BROWSER_RUNNER),
    package_json: inputRecord("package.json"),
    prior_manifest: inputRecord(PRIOR_MANIFEST),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    upstream_wpdb: inputRecord(UPSTREAM_WPDB),
    upstream_http: inputRecord(UPSTREAM_HTTP)
  },
  browser: {
    engine: launched.engine,
    channel: launched.channel,
    launch: "headless",
    driver: "playwright"
  },
  matrix_tiers: [
    {
      tier: "pr-live-db",
      command: "npm run wp:core:wphx-311-rest-server-db-browser:check",
      runtimes: ["mysql-8.4"],
      reason: "Covers browser, REST, CORS/preflight, and real wpdb/wp_options storage without adding the full nightly DB/browser matrix cost."
    },
    {
      tier: "nightly-future",
      runtimes: ["mariadb-11.8", "additional PHP minors", "full installed WordPress roots"],
      reason: "Broader runtime matrix remains distribution/nightly work after the focused WPHX-311 REST server slice."
    }
  ],
  package: {
    candidate_files: packageFiles,
    candidate_rest_server: inputRecord(`${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`),
    candidate_wpdb_plumbing: inputRecord(`${CANDIDATE_ROOT}/wp-includes/class-wpdb.php`),
    owned_methods: OWNED_METHODS
  },
  fixture: {
    same_origin_cases: SAME_ORIGIN_CASES,
    cross_origin_cases: CROSS_ORIGIN_CASES,
    selected_headers: SELECTED_HEADERS,
    database: {
      isolated_per_side: true,
      table: "wp_options",
      storage_owner: "upstream wpdb plumbing for this REST matrix; not a WPHX-305 ownership claim"
    }
  },
  runtimes: runtimeReports,
  known_candidate_deltas: [],
  remaining_gaps: [
    {
      id: "full-installed-wordpress-db-root-deferred",
      owner: "WPHX-322/WPHX-700",
      detail:
        "This matrix uses focused installed-style roots with real wpdb/wp_options storage. A complete WordPress installer root, auth cookies, permalink routing, and external plugin corpus remain distribution work."
    },
    {
      id: "mariadb-and-php-version-browser-matrix-deferred",
      owner: "WPHX-700",
      detail:
        "The PR live-DB tier uses MySQL 8.4 with local PHP/browser execution. MariaDB and extra PHP/browser dimensions belong in a later nightly matrix."
    },
    {
      id: "complete-rest-server-haxe-class-deferred",
      owner: "WPHX-311",
      detail:
        "The package owns the class file and typed dispatch decisions, but many WP_REST_Server method bodies still mirror WordPress PHP source."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
    artifact_scope: "packaged_distribution",
    same_origin_cases: SAME_ORIGIN_CASES.length,
    cross_origin_cases: CROSS_ORIGIN_CASES.length,
    selected_headers: SELECTED_HEADERS,
    runtime_count: runtimeReports.length,
    package_boundaries: runtimeReports.map((report) => report.package_boundary),
    cors_preflight: runtimeReports.map((report) => report.cors_preflight)
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-10-rest-server-db-browser-matrix",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST server DB-backed installed browser and cross-origin CORS/preflight matrix"
    },
    {
      path: OWNERSHIP,
      role: "REST server DB-backed browser matrix ownership manifest"
    },
    {
      path: RUNNER,
      role: "Playwright/browser, live MySQL, and packaged REST matrix generator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-server-db-browser",
    "npm run wp:core:wphx-311-rest-server-db-browser:check",
    "npm run wp:core:wphx-311-rest-server-installed-browser:check",
    "npm run ci:php-conformance:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-311-09-rest-server-installed-browser",
    "receipt:wphx-311-08-rest-server-web-e2e",
    "receipt:wphx-311-07-rest-server-packaged-http",
    "receipt:wphx-305-domain-closure"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      browser_channel: launched.channel,
      runtime_count: runtimeReports.length,
      same_origin_cases: SAME_ORIGIN_CASES.length,
      cross_origin_cases: CROSS_ORIGIN_CASES.length
    },
    null,
    2
  )
);
