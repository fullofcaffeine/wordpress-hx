#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.10.8",
  external_ref: "WPHX-311.08",
  title: "Add REST web-server E2E and upstream PHPUnit ratchet"
};

const RECORDED_AT = "2026-06-22T13:20:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const PACKAGED_RUNNER = "tools/wp-core/run-rest-server-packaged-http-gate.mjs";
const BUILD_ROOT = "build/wp-core/wphx-311-07";
const WEB_BUILD_ROOT = "build/wp-core/wphx-311-08";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-rest-web-router.php";
const OUT = "manifests/wp-core/wphx-311-08-rest-server-web-e2e.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-08-rest-server-web-e2e.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-08-rest-server-web-e2e.v1.json";
const RUNNER = "tools/wp-core/run-rest-server-web-e2e-gate.mjs";
const PRIOR_MANIFEST = "manifests/wp-core/wphx-311-07-rest-server-packaged-http.v1.json";
const UPSTREAM_SERVER = `${UPSTREAM_ROOT}/src/wp-includes/rest-api/class-wp-rest-server.php`;
const OWNED_METHODS = ["serve_request", "dispatch", "respond_to_request"];
const SELECTED_HEADERS = [
  "content-type",
  "x-robots-tag",
  "link",
  "x-content-type-options",
  "access-control-expose-headers",
  "access-control-allow-headers"
];
const CASES = [
  {
    id: "rest-web:get-settings-success",
    method: "GET",
    path: "/wp-json/wp/v2/settings",
    focus: "real HTTP GET returns REST settings JSON plus transport headers"
  },
  {
    id: "rest-web:post-settings-update",
    method: "POST",
    path: "/wp-json/wp/v2/settings",
    body: "wphx_rest_text=123&renamed_count=19",
    contentType: "application/x-www-form-urlencoded",
    focus: "real HTTP POST body params update deterministic option storage"
  },
  {
    id: "rest-web:no-route-404",
    method: "GET",
    path: "/wp-json/wp/v2/missing",
    focus: "unknown REST route returns HTTP 404 and JSON error body"
  },
  {
    id: "rest-web:head-no-body",
    method: "HEAD",
    path: "/wp-json/wp/v2/settings",
    focus: "HEAD request carries status and headers without a body"
  },
  {
    id: "rest-web:permission-denied",
    method: "GET",
    path: "/wp-json/wp/v2/settings?deny=1",
    focus: "permission callback denial is visible as HTTP error response"
  },
  {
    id: "rest-web:pre-serve-manual",
    method: "GET",
    path: "/wp-json/wp/v2/settings?manual=1",
    focus: "rest_pre_serve_request can manually serve transport output"
  },
  {
    id: "rest-web:get-settings-embed",
    method: "GET",
    path: "/wp-json/wp/v2/settings?_embed=1",
    focus: "_embed request path runs response_to_data() through embed_links() over HTTP transport"
  }
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
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

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
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

function writeRouter(root) {
  const upstreamServer = resolve(UPSTREAM_SERVER);
  const router = `<?php
$root = __DIR__;
$wphx_311_08_upstream_server = realpath( ${phpString(upstreamServer)} );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );
$GLOBALS['wphx_311_08_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_08_php_errors'][] = array(
\t\t\t'errno'   => $errno,
\t\t\t'message' => $errstr,
\t\t);
\t\treturn true;
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

class WPHX_311_08_Fake_WPDB {
\tpublic $options = 'wp_options';
\tpublic $queries = array();
\tpublic $last_error = '';
\tprivate $suppress_errors = false;
\tprivate $store = array();

\tpublic function reset() {
\t\t$this->queries = array();
\t\t$this->store   = array();
\t}

\tpublic function set_option( $name, $value, $autoload = 'off' ) {
\t\t$this->store[ $name ] = array(
\t\t\t'option_value' => maybe_serialize( $value ),
\t\t\t'autoload'     => $autoload,
\t\t);
\t}

\tpublic function snapshot() {
\t\t$result = array();
\t\tforeach ( $this->store as $name => $row ) {
\t\t\t$result[ $name ] = array(
\t\t\t\t'value'    => maybe_unserialize( $row['option_value'] ),
\t\t\t\t'autoload' => $row['autoload'],
\t\t\t);
\t\t}
\t\tksort( $result );
\t\treturn $result;
\t}

\tpublic function suppress_errors( $suppress = null ) {
\t\t$previous = $this->suppress_errors;
\t\tif ( null !== $suppress ) {
\t\t\t$this->suppress_errors = (bool) $suppress;
\t\t}
\t\treturn $previous;
\t}

\tpublic function strip_invalid_text_for_column( $table, $column, $value ) {
\t\treturn $value;
\t}

\tpublic function _escape( $data ) {
\t\tif ( is_array( $data ) ) {
\t\t\treturn array_map( array( $this, '_escape' ), $data );
\t\t}
\t\treturn str_replace( \"'\", \"\\\\'\", (string) $data );
\t}

\tpublic function esc_like( $text ) {
\t\treturn addcslashes( $text, '_%\\\\' );
\t}

\tpublic function prepare( $query, ...$args ) {
\t\tif ( 1 === count( $args ) && is_array( $args[0] ) ) {
\t\t\t$args = $args[0];
\t\t}
\t\treturn array(
\t\t\t'query' => $query,
\t\t\t'args'  => array_values( $args ),
\t\t);
\t}

\tprivate function unpack_query( $query ) {
\t\tif ( is_array( $query ) ) {
\t\t\treturn array( $query['query'], $query['args'] );
\t\t}
\t\treturn array( $query, array() );
\t}

\tprivate function record( $operation, $query, $args = array(), $extra = array() ) {
\t\t$this->queries[] = array_merge(
\t\t\tarray(
\t\t\t\t'operation' => $operation,
\t\t\t\t'query'     => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ),
\t\t\t\t'args'      => $args,
\t\t\t),
\t\t\t$extra
\t\t);
\t}

\tpublic function get_results( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_results', $sql, $args );
\t\treturn array();
\t}

\tpublic function get_row( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_row', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\t$row = $this->store[ $option ];
\t\tif ( false !== strpos( $sql, 'autoload' ) && false === strpos( $sql, 'option_value' ) ) {
\t\t\treturn (object) array( 'autoload' => $row['autoload'] );
\t\t}
\t\treturn (object) array(
\t\t\t'option_value' => $row['option_value'],
\t\t\t'autoload'     => $row['autoload'],
\t\t);
\t}

\tpublic function get_var( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_var', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\tif ( false !== strpos( $sql, 'autoload' ) ) {
\t\t\treturn $this->store[ $option ]['autoload'];
\t\t}
\t\treturn $this->store[ $option ]['option_value'];
\t}

\tpublic function update( $table, $data, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'update', 'UPDATE ' . $table, array(), array( 'data' => $data, 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tif ( array_key_exists( 'option_value', $data ) ) {
\t\t\t$this->store[ $option ]['option_value'] = $data['option_value'];
\t\t}
\t\tif ( array_key_exists( 'autoload', $data ) ) {
\t\t\t$this->store[ $option ]['autoload'] = $data['autoload'];
\t\t}
\t\treturn 1;
\t}

\tpublic function delete( $table, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'delete', 'DELETE ' . $table, array(), array( 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tunset( $this->store[ $option ] );
\t\treturn 1;
\t}

\tpublic function query( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'query', $sql, $args );
\t\tif ( false !== strpos( $sql, 'INSERT INTO' ) && count( $args ) >= 3 ) {
\t\t\t$this->store[ $args[0] ] = array(
\t\t\t\t'option_value' => $args[1],
\t\t\t\t'autoload'     => $args[2],
\t\t\t);
\t\t\treturn 1;
\t\t}
\t\treturn true;
\t}
}

global $wpdb;
$wpdb = new WPHX_311_08_Fake_WPDB();

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_08_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args'       => $args,
\t);
\treturn (bool) $GLOBALS['wphx_311_08_can_manage_options'];
}

function is_user_logged_in() {
\treturn (bool) $GLOBALS['wphx_311_08_logged_in'];
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
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/kses.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . WPINC . '/link-template.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-request.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-response.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-server.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-controller.php';
require_once ABSPATH . WPINC . '/rest-api.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-settings-controller.php';

wp_cache_init();

function wphx_311_08_reset_state() {
\tglobal $wpdb, $wp_filter, $wp_actions, $wp_filters, $wp_current_filter, $wp_registered_settings, $new_allowed_options, $wp_rest_server;
\t$wpdb->reset();
\t$wpdb->set_option( 'home', 'https://example.test', 'on' );
\t$wpdb->set_option( 'siteurl', 'https://example.test', 'on' );
\t$wpdb->set_option( 'blog_charset', 'UTF-8', 'on' );
\t$wpdb->set_option( 'permalink_structure', '', 'on' );
\twp_cache_flush();
\t$wp_filter              = array();
\t$wp_actions             = array();
\t$wp_filters             = array();
\t$wp_current_filter      = array();
\t$wp_registered_settings = array();
\t$new_allowed_options    = array();
\t$GLOBALS['new_whitelist_options']          = &$new_allowed_options;
\t$GLOBALS['wp_rest_additional_fields']      = array();
\t$GLOBALS['wphx_311_08_events']             = array();
\t$GLOBALS['wphx_311_08_capability_checks']  = array();
\t$GLOBALS['wphx_311_08_can_manage_options'] = empty( $_GET['deny'] );
\t$GLOBALS['wphx_311_08_logged_in']          = true;
\t$wp_rest_server = new WP_REST_Server();
\tdo_action( 'rest_api_init', $wp_rest_server );
}

function wphx_311_08_register_settings() {
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_text',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'label'        => 'REST text',
\t\t\t'description'  => 'REST-visible text setting',
\t\t\t'show_in_rest' => true,
\t\t\t'default'      => 'fallback-text',
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_named',
\t\tarray(
\t\t\t'type'         => 'integer',
\t\t\t'label'        => 'Named count',
\t\t\t'description'  => 'REST-visible renamed integer',
\t\t\t'default'      => 7,
\t\t\t'show_in_rest' => array(
\t\t\t\t'name'   => 'renamed_count',
\t\t\t\t'schema' => array(
\t\t\t\t\t'minimum' => 0,
\t\t\t\t\t'context' => array( 'view', 'edit' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
}

function wphx_311_08_seed_options() {
\tglobal $wpdb;
\t$wpdb->set_option( 'wphx_rest_text', ' stored text ', 'off' );
\t$wpdb->set_option( 'wphx_rest_named', '12', 'off' );
}

function wphx_311_08_package_boundary() {
\tglobal $wphx_311_08_upstream_server;
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
\t\t'upstreamServerIncluded' => $wphx_311_08_upstream_server !== false && in_array( $wphx_311_08_upstream_server, $included, true ),
\t\t'ownedMethods' => $owned_methods,
\t\t'haxeStrategyLoaded' => class_exists( '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy' ),
\t\t'phpErrors' => $GLOBALS['wphx_311_08_php_errors'],
\t);
}

$request_path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
if ( '/__wphx/package-boundary' === $request_path ) {
\theader( 'Content-Type: application/json; charset=UTF-8' );
\techo json_encode( wphx_311_08_package_boundary(), JSON_UNESCAPED_SLASHES );
\treturn true;
}

wphx_311_08_reset_state();
wphx_311_08_register_settings();
wphx_311_08_seed_options();
$server = rest_get_server();
$controller = new WP_REST_Settings_Controller();
$controller->register_routes();

if ( ! empty( $_GET['manual'] ) ) {
\tadd_filter(
\t\t'rest_pre_serve_request',
\t\tfunction ( $served, $result, $request, $server ) {
\t\t\t$GLOBALS['wphx_311_08_events'][] = array(
\t\t\t\t'hook' => 'rest_pre_serve_request',
\t\t\t\t'route' => $request->get_route(),
\t\t\t\t'status' => $result->get_status(),
\t\t\t);
\t\t\techo 'manual-rest-output';
\t\t\treturn true;
\t\t},
\t\t10,
\t\t4
\t);
}

$rest_path = $request_path;
if ( str_starts_with( $rest_path, '/wp-json' ) ) {
\t$rest_path = substr( $rest_path, strlen( '/wp-json' ) );
}
if ( '' === $rest_path ) {
\t$rest_path = '/';
}

$server->serve_request( $rest_path );
return true;
`;
  writeFileSync(`${root}/${ROUTER}`, router);
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const header of SELECTED_HEADERS) {
    const value = headers.get(header);
    if (value !== null) {
      normalized[header] = value.replaceAll(/https:\/\/example\.test(?=\/wp-json)/g, "https://example.test");
    }
  }
  return normalized;
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

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  return {
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body: normalizeBody(text)
  };
}

async function fetchCase(baseUrl, testCase) {
  const headers = {};
  if (testCase.contentType) {
    headers["content-type"] = testCase.contentType;
  }
  const response = await fetch(`${baseUrl}${testCase.path}`, {
    method: testCase.method,
    headers,
    body: testCase.body
  });
  const text = await response.text();
  return {
    id: testCase.id,
    method: testCase.method,
    path: testCase.path,
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body: normalizeBody(text)
  };
}

async function startServer(root, mode) {
  const port = await freePort();
  const proc = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
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
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const boundary = await fetchJson(`${baseUrl}/__wphx/package-boundary`);
      if (boundary.status === 200 && boundary.body.kind === "json") {
        return { baseUrl, proc, stdout: () => stdout, stderr: () => stderr };
      }
    } catch {
      if (proc.exitCode !== null) {
        break;
      }
    }
    await sleep(50);
  }
  proc.kill("SIGTERM");
  throw new Error(`Unable to start ${mode} PHP web server on ${baseUrl}: ${stderr || stdout}`);
}

async function stopServer(server) {
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

async function runWebRoot(mode, root) {
  const server = await startServer(root, mode);
  try {
    const boundary = await fetchJson(`${server.baseUrl}/__wphx/package-boundary`);
    const cases = [];
    for (const testCase of CASES) {
      cases.push(await fetchCase(server.baseUrl, testCase));
    }
    return {
      mode,
      root,
      command: `php -S 127.0.0.1:<ephemeral> ${ROUTER}`,
      boundary: boundary.body.value,
      cases
    };
  } finally {
    await stopServer(server);
  }
}

function normalizeCases(run) {
  return run.cases.map((entry) => ({
    id: entry.id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    headers: entry.headers,
    body: entry.body
  }));
}

function compare(oracleRun, candidateRun) {
  const oracle = normalizeCases(oracleRun);
  const candidate = normalizeCases(candidateRun);
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
    haxe_strategy_loaded: result.haxeStrategyLoaded
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-server-web-e2e`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-server-web-e2e",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-distribution-web-e2e-gate",
      name: "WP_REST_Server packaged web transport gate",
      area: "wp-includes/rest-api/class-wp-rest-server.php",
      public_contract:
        "The REST server candidate must own the packaged WP_REST_Server class file and match vanilla behavior through real HTTP transport for settings success, update, error, permission, HEAD, and rest_pre_serve_request cases."
    },
    ownership_state: "packaged_distribution_candidate",
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT, "tests/upstream/phpunit/groups.json"],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, WEB_BUILD_ROOT, `${ORACLE_ROOT}/${ROUTER}`, `${CANDIDATE_ROOT}/${ROUTER}`],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-server-web-e2e",
        "npm run wp:core:wphx-311-rest-server-web-e2e:check",
        "npm run wp:core:wphx-311-rest-server-packaged-http:check",
        "npm run upstream:phpunit-ratchet:check",
        "npm run ci:php-conformance:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-08-rest-server-web-e2e",
        "receipt:wphx-311-07-rest-server-packaged-http",
        "receipt:wphx-700-05-upstream-phpunit-ratchet"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This gate uses PHP's built-in web server over packaged oracle/candidate roots. The candidate package still mirrors many WP_REST_Server methods from upstream PHP while owned dispatch/serve_request/respond_to_request methods are declared from the candidate package file."
  };
}

command("node", [PACKAGED_RUNNER, ...(checkOnly ? ["--check"] : [])]);
mkdirSync(WEB_BUILD_ROOT, { recursive: true });
writeRouter(ORACLE_ROOT);
writeRouter(CANDIDATE_ROOT);
command("php", ["-l", `${ORACLE_ROOT}/${ROUTER}`]);
command("php", ["-l", `${CANDIDATE_ROOT}/${ROUTER}`]);

const oracleRun = await runWebRoot("oracle", ORACLE_ROOT);
const candidateRun = await runWebRoot("candidate", CANDIDATE_ROOT);
const comparison = compare(oracleRun, candidateRun);
const candidateBoundary = assertPackageBoundary(candidateRun.boundary);
if (!comparison.matches || candidateBoundary.status !== "passed") {
  console.error(JSON.stringify({ status: "failed", comparison, candidateBoundary }, null, 2));
  process.exit(1);
}

const packageFiles = filesUnder(CANDIDATE_ROOT).map((file) => ({
  path: `${CANDIDATE_ROOT}/${file.path}`,
  bytes: file.bytes,
  sha256: `sha256:${file.sha256}`
}));
const manifest = {
  schema: "wphx.wp-core-rest-server-web-e2e.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
  artifact_scope: "packaged_distribution",
  inputs: {
    runner: inputRecord(RUNNER),
    packaged_runner: inputRecord(PACKAGED_RUNNER),
    package_json: inputRecord("package.json"),
    prior_manifest: inputRecord(PRIOR_MANIFEST),
    upstream_phpunit_groups: inputRecord("tests/upstream/phpunit/groups.json")
  },
  web_server: {
    executable: "php",
    server: "PHP built-in development server",
    router: ROUTER,
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT
  },
  package: {
    candidate_files: packageFiles,
    candidate_rest_server: inputRecord(`${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`),
    owned_methods: OWNED_METHODS
  },
  fixture: {
    cases: CASES,
    selected_headers: SELECTED_HEADERS,
    native_boundaries: [
      {
        id: "php-web-server-transport",
        reason: "serve_request() emits status, headers, and body through PHP's HTTP transport instead of a CLI capture subclass."
      },
      {
        id: "deterministic-wpdb-option-store",
        reason: "The settings endpoint runs through real REST/settings/option code while deterministic wpdb storage replaces a live database for this web gate."
      }
    ]
  },
  runs: [
    {
      id: "local-web-server:oracle",
      mode: "oracle",
      command: oracleRun.command,
      normalized_sha256: sha256(JSON.stringify(normalizeCases(oracleRun))),
      package_boundary: oracleRun.boundary
    },
    {
      id: "local-web-server:candidate",
      mode: "candidate",
      command: candidateRun.command,
      normalized_sha256: sha256(JSON.stringify(normalizeCases(candidateRun))),
      package_boundary: candidateRun.boundary
    }
  ],
  comparison,
  package_boundaries: [
    {
      id: "local-web-server:candidate",
      runtime: "local-php-web-server",
      ...candidateBoundary
    }
  ],
  upstream_phpunit_ratchet: {
    groups_file: "tests/upstream/phpunit/groups.json",
    command: "npm run upstream:phpunit-ratchet:check",
    expected_rest_groups: ["rest-settings-controller", "rest-server-core"]
  },
  remaining_gaps: [
    {
      id: "full-browser-fetch-corpus-deferred",
      owner: "WPHX-311/WPHX-322",
      detail:
        "This gate uses real HTTP transport from Node fetch. Browser automation, installed permalink routing through index.php, and broader REST endpoint corpus remain follow-up work."
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
    fixture_cases: CASES.length,
    selected_headers: SELECTED_HEADERS,
    web_server_runs: 2,
    package_boundary: candidateBoundary
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-08-rest-server-web-e2e",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST server web transport parity and no-fallback manifest"
    },
    {
      path: OWNERSHIP,
      role: "REST server web E2E ownership manifest"
    },
    {
      path: RUNNER,
      role: "PHP built-in web-server E2E generator and check-mode validator"
    },
    {
      path: "tests/upstream/phpunit/groups.json",
      role: "upstream REST PHPUnit ratchet group declaration"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-server-web-e2e",
    "npm run wp:core:wphx-311-rest-server-web-e2e:check",
    "npm run wp:core:wphx-311-rest-server-packaged-http:check",
    "npm run upstream:phpunit-ratchet:check",
    "npm run ci:php-conformance:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-311-07-rest-server-packaged-http",
    "receipt:wphx-311-06-rest-server-dispatch-strategy-candidate",
    "receipt:wphx-700-05-upstream-phpunit-ratchet"
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
      cases: CASES.length,
      selected_headers: SELECTED_HEADERS.length
    },
    null,
    2
  )
);
