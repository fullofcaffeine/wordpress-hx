#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-5mq",
  external_ref: "WPHX-312.34",
  title: "WPHX-312.34 - Add HTTP IXR client oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-ixr-client-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-34";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-34-http-ixr-client-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-34-http-ixr-client-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-34-http-ixr-client-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_FIXTURE = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const REQUESTS_BRIDGE_FIXTURE = "manifests/wp-core/wphx-312-33-http-requests-bridge-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-IXR.php", "src/wp-includes/class-wp-http-ixr-client.php"];
const CLAIMED_SOURCE_FILES = ["src/wp-includes/class-wp-http-ixr-client.php"];
const SUPPORT_PATHS = ["src/wp-includes/IXR"];
const COVERED_SYMBOLS = [
  "WP_HTTP_IXR_Client::__construct",
  "WP_HTTP_IXR_Client::query",
  "IXR_Client",
  "IXR_Request",
  "IXR_Message",
  "IXR_Error",
  "wp_safe_remote_post",
  "wp_remote_retrieve_response_code",
  "wp_remote_retrieve_body",
  "is_wp_error",
  "wp_http_ixr_client_headers",
  "xmlrpc_element_limit",
  "xmlrpc_chunk_parsing_size"
];
const CASES = [
  { id: "http-ixr:constructor-url-variants", focus: "URL, protocol-relative, relative, empty, and explicit server/path constructor parsing" },
  { id: "http-ixr:query-success", focus: "query builds XML body, merges custom and filtered headers, includes timeout, posts, and parses success response" },
  { id: "http-ixr:query-timeout-omitted", focus: "false timeout omits timeout from wp_safe_remote_post args while still parsing success" },
  { id: "http-ixr:transport-error", focus: "WP_Error from wp_safe_remote_post maps to IXR transport error -32300" },
  { id: "http-ixr:http-status-error", focus: "non-200 HTTP status maps to IXR transport error -32301" },
  { id: "http-ixr:parse-error", focus: "malformed XML response maps to IXR parse error -32700" },
  { id: "http-ixr:fault-response", focus: "XML-RPC fault response maps to IXR_Error fault code and string" }
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function listFiles(path) {
  const source = upstreamPath(path);
  const stat = statSync(source);
  if (stat.isFile()) return [path];
  return readdirSync(source, { withFileTypes: true })
    .flatMap((entry) => listFiles(`${path}/${entry.name}`))
    .sort();
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
  for (const path of SUPPORT_PATHS) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(upstreamPath(path), target, { recursive: true });
  }
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );
$case = $argv[2] ?? '';

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_remote_posts'] = array();

class WP_Error {
\tprivate $code;
\tprivate $message;
\tpublic function __construct( $code = '', $message = '' ) {
\t\t$this->code = $code;
\t\t$this->message = $message;
\t}
\tpublic function get_error_code() { return $this->code; }
\tpublic function get_error_message() { return $this->message; }
}

function __( $text ) { return $text; }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => $value, 'arg_count' => count( $args ) + 1 );
\tif ( 'wp_http_ixr_client_headers' === $hook_name ) {
\t\t$value['X-Filtered'] = 'filtered';
\t}
\treturn $value;
}
function wp_remote_retrieve_response_code( $response ) {
\treturn $response['response']['code'] ?? 0;
}
function wp_remote_retrieve_body( $response ) {
\treturn $response['body'] ?? '';
}
function wphx_success_xml( $value ) {
\treturn '<?xml version="1.0"?><methodResponse><params><param><value><int>' . (int) $value . '</int></value></param></params></methodResponse>';
}
function wphx_fault_xml( $code, $message ) {
\treturn '<?xml version="1.0"?><methodResponse><fault><value><struct><member><name>faultCode</name><value><int>' . (int) $code . '</int></value></member><member><name>faultString</name><value><string>' . htmlspecialchars( $message, ENT_XML1 ) . '</string></value></member></struct></value></fault></methodResponse>';
}
function wp_safe_remote_post( $url, $args ) {
\t$GLOBALS['wphx_remote_posts'][] = array(
\t\t'url' => $url,
\t\t'headers' => $args['headers'] ?? array(),
\t\t'user-agent' => $args['user-agent'] ?? null,
\t\t'timeout' => $args['timeout'] ?? null,
\t\t'timeout_present' => array_key_exists( 'timeout', $args ),
\t\t'body_sha256' => hash( 'sha256', $args['body'] ?? '' ),
\t\t'body_has_method' => str_contains( $args['body'] ?? '', '<methodName>demo.addTwoNumbers</methodName>' ) || str_contains( $args['body'] ?? '', '<methodName>demo.echo</methodName>' ),
\t\t'body_has_int_two' => str_contains( $args['body'] ?? '', '<int>2</int>' ),
\t\t'body_has_string_hello' => str_contains( $args['body'] ?? '', '<string>hello</string>' ),
\t);
\tswitch ( $GLOBALS['wphx_case'] ) {
\t\tcase 'http-ixr:transport-error':
\t\t\treturn new WP_Error( 'http_request_failed', 'network down' );
\t\tcase 'http-ixr:http-status-error':
\t\t\treturn array( 'response' => array( 'code' => 503 ), 'body' => 'Service unavailable' );
\t\tcase 'http-ixr:parse-error':
\t\t\treturn array( 'response' => array( 'code' => 200 ), 'body' => '<not-xml' );
\t\tcase 'http-ixr:fault-response':
\t\t\treturn array( 'response' => array( 'code' => 200 ), 'body' => wphx_fault_xml( 500, 'app fault' ) );
\t\tdefault:
\t\t\treturn array( 'response' => array( 'code' => 200 ), 'body' => wphx_success_xml( 5 ) );
\t}
}
function wphx_error_summary( $error ) {
\tif ( ! $error instanceof IXR_Error ) {
\t\treturn $error;
\t}
\treturn array( 'class' => get_class( $error ), 'code' => $error->code, 'message' => $error->message );
}
function wphx_client_summary( $client ) {
\treturn array(
\t\t'scheme' => $client->scheme,
\t\t'server' => $client->server,
\t\t'port' => $client->port,
\t\t'path' => $client->path,
\t\t'timeout' => $client->timeout,
\t);
}

require ABSPATH . WPINC . '/class-IXR.php';
require ABSPATH . WPINC . '/class-wp-http-ixr-client.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'http-ixr:constructor-url-variants':
\t\t$url = new WP_HTTP_IXR_Client( 'http://example.com/server.php?this-is-needed=true#not-this' );
\t\t$protocol_relative = new WP_HTTP_IXR_Client( '//example.com/server.php' );
\t\t$relative = new WP_HTTP_IXR_Client( '/server.php' );
\t\t$empty = new WP_HTTP_IXR_Client( '' );
\t\t$explicit = new WP_HTTP_IXR_Client( 'rpc.example.test', '/RPC2', 8080, 7 );
\t\t$result['clients'] = array(
\t\t\t'url' => wphx_client_summary( $url ),
\t\t\t'protocol_relative' => wphx_client_summary( $protocol_relative ),
\t\t\t'relative' => wphx_client_summary( $relative ),
\t\t\t'empty' => wphx_client_summary( $empty ),
\t\t\t'explicit' => wphx_client_summary( $explicit ),
\t\t);
\t\t$assertions['query_string_without_fragment'] = 'http' === $url->scheme && 'example.com' === $url->server && false === $url->port && '/server.php?this-is-needed=true' === $url->path;
\t\t$assertions['protocol_relative'] = '' === $protocol_relative->scheme && 'example.com' === $protocol_relative->server && '/server.php' === $protocol_relative->path;
\t\t$assertions['relative'] = '' === $relative->scheme && '' === $relative->server && '/server.php' === $relative->path;
\t\t$assertions['empty'] = '' === $empty->scheme && '' === $empty->server && '/' === $empty->path;
\t\t$assertions['explicit'] = 'http' === $explicit->scheme && 'rpc.example.test' === $explicit->server && 8080 === $explicit->port && '/RPC2' === $explicit->path && 7 === $explicit->timeout;
\t\tbreak;

\tcase 'http-ixr:query-success':
\t\t$client = new WP_HTTP_IXR_Client( 'https://rpc.example.test/xmlrpc.php?token=abc', false, false, 12 );
\t\t$client->headers['X-Custom'] = 'custom';
\t\t$query_result = $client->query( 'demo.addTwoNumbers', 2, 3 );
\t\t$result['query_result'] = $query_result;
\t\t$result['remote_posts'] = $GLOBALS['wphx_remote_posts'];
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$result['params'] = $client->message ? $client->message->params : null;
\t\t$result['error'] = wphx_error_summary( $client->error );
\t\t$post = $GLOBALS['wphx_remote_posts'][0];
\t\t$assertions['query_true'] = true === $query_result;
\t\t$assertions['url'] = 'https://rpc.example.test/xmlrpc.php?token=abc' === $post['url'];
\t\t$assertions['headers'] = 'text/xml' === $post['headers']['Content-Type'] && 'custom' === $post['headers']['X-Custom'] && 'filtered' === $post['headers']['X-Filtered'];
\t\t$assertions['timeout_and_user_agent'] = 12 === $post['timeout'] && 'The Incutio XML-RPC PHP Library' === $post['user-agent'];
\t\t$assertions['body_and_params'] = true === $post['body_has_method'] && true === $post['body_has_int_two'] && array( 5 ) === $client->message->params;
\t\tbreak;

\tcase 'http-ixr:query-timeout-omitted':
\t\t$client = new WP_HTTP_IXR_Client( 'http://rpc.example.test/xmlrpc.php', false, false, false );
\t\t$query_result = $client->query( 'demo.echo', 'hello' );
\t\t$post = $GLOBALS['wphx_remote_posts'][0];
\t\t$result['query_result'] = $query_result;
\t\t$result['remote_posts'] = $GLOBALS['wphx_remote_posts'];
\t\t$assertions['query_true'] = true === $query_result;
\t\t$assertions['timeout_omitted'] = false === $post['timeout_present'] && null === $post['timeout'];
\t\t$assertions['string_body'] = true === $post['body_has_method'] && true === $post['body_has_string_hello'];
\t\tbreak;

\tcase 'http-ixr:transport-error':
\t\t$client = new WP_HTTP_IXR_Client( 'https://rpc.example.test/xmlrpc.php' );
\t\t$query_result = $client->query( 'demo.addTwoNumbers', 2, 3 );
\t\t$result['query_result'] = $query_result;
\t\t$result['error'] = wphx_error_summary( $client->error );
\t\t$assertions['query_false'] = false === $query_result;
\t\t$assertions['error_code_message'] = -32300 === $client->error->code && 'transport error: http_request_failed network down' === $client->error->message;
\t\tbreak;

\tcase 'http-ixr:http-status-error':
\t\t$client = new WP_HTTP_IXR_Client( 'https://rpc.example.test/xmlrpc.php' );
\t\t$query_result = $client->query( 'demo.addTwoNumbers', 2, 3 );
\t\t$result['query_result'] = $query_result;
\t\t$result['error'] = wphx_error_summary( $client->error );
\t\t$assertions['query_false'] = false === $query_result;
\t\t$assertions['error_code_message'] = -32301 === $client->error->code && 'transport error - HTTP status code was not 200 (503)' === $client->error->message;
\t\tbreak;

\tcase 'http-ixr:parse-error':
\t\t$client = new WP_HTTP_IXR_Client( 'https://rpc.example.test/xmlrpc.php' );
\t\t$query_result = $client->query( 'demo.addTwoNumbers', 2, 3 );
\t\t$result['query_result'] = $query_result;
\t\t$result['error'] = wphx_error_summary( $client->error );
\t\t$assertions['query_false'] = false === $query_result;
\t\t$assertions['error_code_message'] = -32700 === $client->error->code && 'parse error. not well formed' === $client->error->message;
\t\tbreak;

\tcase 'http-ixr:fault-response':
\t\t$client = new WP_HTTP_IXR_Client( 'https://rpc.example.test/xmlrpc.php' );
\t\t$query_result = $client->query( 'demo.addTwoNumbers', 2, 3 );
\t\t$result['query_result'] = $query_result;
\t\t$result['error'] = wphx_error_summary( $client->error );
\t\t$result['message_type'] = $client->message ? $client->message->messageType : null;
\t\t$assertions['query_false'] = false === $query_result;
\t\t$assertions['fault_error'] = 500 === $client->error->code && 'app fault' === $client->error->message && 'fault' === $client->message->messageType;
\t\tbreak;
}

$result['assertions'] = $assertions;
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
`
  );
}

function runProbe(root) {
  const observations = {};
  for (const fixtureCase of CASES) {
    const output = command("php", [PROBE, root, fixtureCase.id]);
    observations[fixtureCase.id] = JSON.parse(output);
  }
  return observations;
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    const existing = readFileSync(path, "utf8");
    if (existing !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/http-ixr-client-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_HTTP_IXR_Client XML-RPC HTTP handoff behavior",
      area: "src/wp-includes/class-wp-http-ixr-client.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-http-ixr-client.php with copied IXR support classes in isolated PHP CLI probes. It observes constructor URL parsing, XML-RPC request body construction, custom and filtered headers, timeout inclusion and omission, wp_safe_remote_post handoff, WP_Error and non-200 transport failures, malformed XML parse failures, XML-RPC fault mapping, and successful methodResponse parsing without claiming live HTTP transport, XML-RPC server behavior, pingback/comment integration, Requests/cURL/fsockopen behavior, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-http-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded XML-RPC HTTP client transport, pingback/comment integration, WP_Http transport routing, selected upstream XML-RPC PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-ixr-client-oracle-fixture",
        "npm run wp:core:wphx-312-http-ixr-client-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-34-http-ixr-client-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeProbe();

  const oracle = runProbe(ORACLE_ROOT);
  const candidate = runProbe(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const observationsAssert = Object.values(oracle).every((entry) => Object.values(entry.assertions).every(Boolean));
  if (!observationsMatch) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
    process.exit(1);
  }
  if (!observationsAssert) {
    console.error(JSON.stringify({ status: "failed", reason: "fixture assertions failed", oracle }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const manifest = {
    schema: "wphx.wp-core-http-ixr-client-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      http_cron_mail_fixture_manifest: inputRecord(HTTP_FIXTURE),
      http_requests_bridge_fixture_manifest: inputRecord(REQUESTS_BRIDGE_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      claimed_source_files: CLAIMED_SOURCE_FILES,
      support_sources: SUPPORT_PATHS.flatMap(listFiles).map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: CLAIMED_SOURCE_FILES,
      support_files: SOURCE_FILES.filter((path) => !CLAIMED_SOURCE_FILES.includes(path)),
      support_paths: SUPPORT_PATHS,
      probe: { path: PROBE, sha256: sha256File(PROBE) },
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "wp_safe_remote_post, response helpers, WP_Error, translation, and filters are deterministic stubs; copied IXR support classes are executed; copied class-wp-http-ixr-client.php remains the executed public client source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate)),
      assertions_pass: observationsAssert
    },
    remaining_gaps: [
      {
        id: "live-xmlrpc-http-transport-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture stubs wp_safe_remote_post and response helpers. Live or recorded XML-RPC HTTP transport, DNS/TLS, redirects, timeout enforcement, and WP_Http Requests/cURL/fsockopen routing remain later gates."
      },
      {
        id: "xmlrpc-server-and-pingback-integration-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture covers only the client handoff. wp_xmlrpc_server methods, pingback/comment integration, authentication, database writes, and XML-RPC endpoint routing remain WPHX-318 or later installed distribution work."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic WordPress stubs rather than an installed WordPress distribution, web server, plugin/theme filters, or real XML-RPC endpoint."
      },
      {
        id: "public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_http_transport_claimed: false,
      xmlrpc_server_behavior_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-34-http-ixr-client-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_HTTP_IXR_Client oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle HTTP IXR client boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-http-ixr-client-oracle-fixture",
      "npm run wp:core:wphx-312-http-ixr-client-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
      "receipt:wphx-312-33-http-requests-bridge-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n");
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
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
        fixture_cases: CASES.length,
        observations_match: observationsMatch
      },
      null,
      2
    )
  );
}

await main();
