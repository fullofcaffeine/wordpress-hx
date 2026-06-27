#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.3",
  external_ref: "WPHX-312.03",
  title: "WPHX-312.03 — Add HTTP cron mail oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-http-cron-mail-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-03";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-http-cookie.php",
  "src/wp-includes/class-wp-http-encoding.php",
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/class-wp-http.php",
  "src/wp-includes/http.php",
  "src/wp-includes/cron.php",
  "src/wp-includes/pluggable.php"
];
const SUPPORT_PATHS = ["src/wp-includes/Requests", "src/wp-includes/certificates/ca-bundle.crt"];

const COVERED_SYMBOLS = [
  "wp_remote_retrieve_headers",
  "wp_remote_retrieve_header",
  "wp_remote_retrieve_response_code",
  "wp_remote_retrieve_response_message",
  "wp_remote_retrieve_body",
  "wp_remote_retrieve_cookies",
  "wp_remote_retrieve_cookie",
  "wp_remote_retrieve_cookie_value",
  "WP_Http::processResponse",
  "WP_Http::processHeaders",
  "WP_Http::buildCookieHeader",
  "WP_Http::chunkTransferDecode",
  "WP_Http::is_ip_address",
  "WP_Http_Encoding::compress",
  "WP_Http_Encoding::decompress",
  "WP_Http_Encoding::accept_encoding",
  "WP_Http_Cookie::__construct",
  "WP_Http_Cookie::test",
  "WP_Http_Cookie::getHeaderValue",
  "wp_schedule_event",
  "wp_schedule_single_event",
  "wp_get_scheduled_event",
  "wp_next_scheduled",
  "wp_get_schedule",
  "wp_unschedule_event",
  "wp_clear_scheduled_hook",
  "wp_get_ready_cron_jobs",
  "_get_cron_array",
  "_set_cron_array",
  "wp_mail"
];

const FIXTURE_CASES = [
  { id: "http:response-retrieval", focus: "wp_remote_retrieve_* helpers read response status, headers, body, and cookies" },
  { id: "http:headers-cookies", focus: "WP_Http parses raw headers, repeated headers, Set-Cookie values, request cookies, chunks, and IP probes" },
  { id: "http:encoding", focus: "WP_Http_Encoding compress/decompress and accept-encoding helper behavior" },
  { id: "cron:recurring-event", focus: "recurring event schedule, lookup, next timestamp, schedule name, and unschedule behavior" },
  { id: "cron:single-clear-ready", focus: "single event scheduling, ready-cron filtering, and clear_scheduled_hook count behavior" },
  { id: "mail:pre-short-circuit", focus: "wp_mail argument filter flow and pre_wp_mail short-circuit without PHPMailer construction or delivery" },
  { id: "pluggable:declaration-timing", focus: "wp_mail remains pluggable before include and declared after include" }
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

function listFiles(path) {
  const source = upstreamPath(path);
  const stat = statSync(source);
  if (stat.isFile()) return [path];
  return readdirSync(source, { withFileTypes: true })
    .flatMap((entry) => listFiles(`${path}/${entry.name}`))
    .sort();
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/fixture';

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'MINUTE_IN_SECONDS', 60 );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'DAY_IN_SECONDS', 86400 );
define( 'WEEK_IN_SECONDS', 604800 );
define( 'WP_CRON_LOCK_TIMEOUT', 60 );

$GLOBALS['wp_filter'] = array();
$GLOBALS['wphx_312_03_filters'] = array();
$GLOBALS['wphx_312_03_actions'] = array();
$GLOBALS['wphx_312_03_errors'] = array();
$GLOBALS['wphx_312_03_options'] = array( 'cron' => array( 'version' => 2 ) );
$GLOBALS['wphx_312_03_declared_before'] = array(
\t'wp_mail' => function_exists( 'wp_mail' ),
);

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_312_03_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WP_Error {
\tprivate $code;
\tprivate $message;
\tprivate $data;
\tpublic function __construct( $code = '', $message = '', $data = null ) {
\t\t$this->code = $code;
\t\t$this->message = $message;
\t\t$this->data = $data;
\t}
\tpublic function get_error_code() { return $this->code; }
\tpublic function get_error_message() { return $this->message; }
\tpublic function get_error_data() { return $this->data; }
}

function __( $text ) { return $text; }
function _deprecated_argument( $function_name, $version, $message = '' ) {
\t$GLOBALS['wphx_312_03_errors'][] = array( 'deprecated_argument' => $function_name, 'version' => $version, 'message' => $message );
}
function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_312_03_errors'][] = array( 'doing_it_wrong' => $function_name, 'version' => $version, 'message' => $message );
}
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function wp_parse_args( $args, $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$args = get_object_vars( $args );
\t}
\tif ( ! is_array( $args ) ) {
\t\tparse_str( (string) $args, $args );
\t}
\treturn array_merge( $defaults, $args );
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => $callback, 'accepted_args' => $accepted_args );
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\treturn true;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\treturn add_filter( $hook_name, $callback, $priority, $accepted_args );
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_312_03_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\t$callback_args = array_merge( array( $value ), $args );
\t\t\t$value = call_user_func_array( $record['callback'], array_slice( $callback_args, 0, $record['accepted_args'] ) );
\t\t}
\t}
\treturn $value;
}
function apply_filters_ref_array( $hook_name, $args ) {
\treturn apply_filters( $hook_name, ...$args );
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_312_03_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\tapply_filters( $hook_name, null, ...$args );
}
function do_action_ref_array( $hook_name, $args ) {
\tdo_action( $hook_name, ...$args );
}
function get_option( $name, $default = false ) {
\tif ( 'home' === $name ) {
\t\treturn 'https://example.test';
\t}
\treturn array_key_exists( $name, $GLOBALS['wphx_312_03_options'] ) ? $GLOBALS['wphx_312_03_options'][ $name ] : $default;
}
function update_option( $name, $value, $autoload = null ) {
\t$GLOBALS['wphx_312_03_options'][ $name ] = $value;
\treturn true;
}
function delete_option( $name ) {
\tunset( $GLOBALS['wphx_312_03_options'][ $name ] );
\treturn true;
}
function get_transient( $name ) { return false; }
function set_transient( $name, $value, $expiration = 0 ) { return true; }
function home_url( $path = '' ) { return 'https://example.test' . $path; }
function admin_url( $path = '' ) { return 'https://example.test/wp-admin/' . ltrim( $path, '/' ); }
function site_url( $path = '' ) { return 'https://example.test/' . ltrim( $path, '/' ); }
function network_home_url( $path = '' ) { return home_url( $path ); }
function get_bloginfo( $show = '' ) { return 'charset' === $show ? 'UTF-8' : 'WordPress'; }
function wp_unslash( $value ) { return $value; }
function add_query_arg( $key, $value, $url ) { return $url . ( str_contains( $url, '?' ) ? '&' : '?' ) . rawurlencode( $key ) . '=' . rawurlencode( $value ); }
function wp_redirect( $location, $status = 302 ) { return true; }
function wp_ob_end_flush_all() {}
function status_header( $code ) {}
function wp_kses_bad_protocol( $string, $allowed_protocols ) {
\t$scheme = parse_url( $string, PHP_URL_SCHEME );
\tif ( $scheme && ! in_array( strtolower( $scheme ), $allowed_protocols, true ) ) {
\t\treturn '';
\t}
\treturn $string;
}
function is_email( $email ) { return str_contains( (string) $email, '@' ) ? $email : false; }

require ABSPATH . WPINC . '/class-wp-http-cookie.php';
require ABSPATH . WPINC . '/class-wp-http-encoding.php';
require ABSPATH . WPINC . '/class-wp-http-response.php';
require ABSPATH . WPINC . '/class-wp-http.php';
require ABSPATH . WPINC . '/http.php';
require ABSPATH . WPINC . '/cron.php';
require ABSPATH . WPINC . '/pluggable.php';

$response_cookie = new WP_Http_Cookie(
\tarray(
\t\t'name' => 'session',
\t\t'value' => 'abc123',
\t\t'expires' => 1893456000,
\t\t'path' => '/wp-admin/',
\t\t'domain' => 'example.test',
\t)
);
$response = array(
\t'headers' => array( 'content-type' => 'text/plain', 'x-fixture' => array( 'one', 'two' ) ),
\t'body' => 'fixture-body',
\t'response' => array( 'code' => 201, 'message' => 'Created' ),
\t'cookies' => array( $response_cookie ),
);

$raw_response = "HTTP/1.1 200 OK\\r\\nX-Fixture: one\\r\\nX-Fixture: two\\r\\nSet-Cookie: token=xyz; Path=/wp-admin/; Domain=example.test\\r\\n\\r\\nbody";
$processed_response = WP_Http::processResponse( $raw_response );
$processed_headers = WP_Http::processHeaders( $processed_response['headers'], 'https://example.test/wp-admin/edit.php' );
$request_args = array( 'headers' => array(), 'cookies' => array( 'alpha' => 'one', 'beta' => 'two words' ) );
WP_Http::buildCookieHeader( $request_args );
$chunked = WP_Http::chunkTransferDecode( "4\\r\\nWiki\\r\\n5\\r\\npedia\\r\\n0" );
$compressed = WP_Http_Encoding::compress( 'compress me' );
$decompressed = WP_Http_Encoding::decompress( $compressed );

$recurring_result = wp_schedule_event( 2000000000, 'hourly', 'wphx_recurring', array( 'one' ), true );
$recurring_event = wp_get_scheduled_event( 'wphx_recurring', array( 'one' ) );
$next_recurring = wp_next_scheduled( 'wphx_recurring', array( 'one' ) );
$recurring_schedule = wp_get_schedule( 'wphx_recurring', array( 'one' ) );
$unschedule_result = wp_unschedule_event( 2000000000, 'wphx_recurring', array( 'one' ), true );
$next_after_unschedule = wp_next_scheduled( 'wphx_recurring', array( 'one' ) );

$single_result = wp_schedule_single_event( 1000, 'wphx_single', array( 'two' ), true );
$single_event = wp_get_scheduled_event( 'wphx_single', array( 'two' ) );
$ready_cron = wp_get_ready_cron_jobs();
$clear_count = wp_clear_scheduled_hook( 'wphx_single', array( 'two' ), true );

$mail_observation = array();
add_filter(
\t'wp_mail',
\tfunction ( $atts ) use ( &$mail_observation ) {
\t\t$mail_observation['wp_mail_filter_to_count'] = is_array( $atts['to'] ) ? count( $atts['to'] ) : count( explode( ',', $atts['to'] ) );
\t\t$mail_observation['wp_mail_filter_subject'] = $atts['subject'];
\t\t$atts['subject'] .= ' filtered';
\t\treturn $atts;
\t},
\t10,
\t1
);
add_filter(
\t'pre_wp_mail',
\tfunction ( $pre, $atts ) use ( &$mail_observation ) {
\t\t$mail_observation['pre_wp_mail_subject'] = $atts['subject'];
\t\t$mail_observation['pre_wp_mail_headers_type'] = gettype( $atts['headers'] );
\t\t$mail_observation['pre_wp_mail_embeds_count'] = is_array( $atts['embeds'] ) ? count( $atts['embeds'] ) : -1;
\t\treturn true;
\t},
\t10,
\t2
);
$mail_result = wp_mail(
\t'one@example.test, two@example.test',
\t'Fixture subject',
\t'Fixture body',
\tarray( 'X-Fixture: yes' ),
\t"one.txt\\ntwo.txt",
\tarray( 'logo' => '/tmp/logo.png' )
);

$declared_after = array(
\t'wp_mail' => function_exists( 'wp_mail' ),
);

$cases = array(
\t'http:response-retrieval' => array(
\t\t'code' => wp_remote_retrieve_response_code( $response ),
\t\t'message' => wp_remote_retrieve_response_message( $response ),
\t\t'body' => wp_remote_retrieve_body( $response ),
\t\t'content_type' => wp_remote_retrieve_header( $response, 'content-type' ),
\t\t'x_fixture_count' => count( wp_remote_retrieve_header( $response, 'x-fixture' ) ),
\t\t'cookie_count' => count( wp_remote_retrieve_cookies( $response ) ),
\t\t'cookie_name' => wp_remote_retrieve_cookie( $response, 'session' )->name,
\t\t'cookie_value' => wp_remote_retrieve_cookie_value( $response, 'session' ),
\t\t'missing_cookie' => wp_remote_retrieve_cookie_value( $response, 'missing' ),
\t),
\t'http:headers-cookies' => array(
\t\t'processed_code' => $processed_headers['response']['code'],
\t\t'processed_message' => $processed_headers['response']['message'],
\t\t'processed_header_values' => $processed_headers['headers']['x-fixture'],
\t\t'processed_cookie_name' => $processed_headers['cookies'][0]->name,
\t\t'processed_cookie_value' => $processed_headers['cookies'][0]->value,
\t\t'processed_cookie_test_admin' => $processed_headers['cookies'][0]->test( 'https://example.test/wp-admin/post.php' ),
\t\t'processed_cookie_test_public' => $processed_headers['cookies'][0]->test( 'https://example.test/about/' ),
\t\t'request_cookie_header' => $request_args['headers']['cookie'],
\t\t'chunked_body' => $chunked,
\t\t'ip_address_true' => WP_Http::is_ip_address( '192.0.2.10' ),
\t\t'ip_address_false' => WP_Http::is_ip_address( 'example.test' ),
\t),
\t'http:encoding' => array(
\t\t'compressed_is_string' => is_string( $compressed ),
\t\t'decompressed' => $decompressed,
\t\t'accept_encoding' => WP_Http_Encoding::accept_encoding( 'https://example.test/', array( 'decompress' => true, 'stream' => false ) ),
\t\t'should_decode' => WP_Http_Encoding::should_decode( array( 'content-encoding' => 'gzip' ) ),
\t),
\t'cron:recurring-event' => array(
\t\t'schedule_result' => $recurring_result,
\t\t'event_hook' => $recurring_event ? $recurring_event->hook : null,
\t\t'event_schedule' => $recurring_event ? $recurring_event->schedule : null,
\t\t'event_interval' => $recurring_event ? $recurring_event->interval : null,
\t\t'next' => $next_recurring,
\t\t'schedule_name' => $recurring_schedule,
\t\t'unschedule_result' => $unschedule_result,
\t\t'next_after_unschedule' => $next_after_unschedule,
\t),
\t'cron:single-clear-ready' => array(
\t\t'single_result' => $single_result,
\t\t'single_hook' => $single_event ? $single_event->hook : null,
\t\t'single_schedule' => $single_event ? $single_event->schedule : null,
\t\t'ready_timestamps' => array_keys( $ready_cron ),
\t\t'clear_count' => $clear_count,
\t\t'cron_after_clear' => _get_cron_array(),
\t),
\t'mail:pre-short-circuit' => array(
\t\t'result' => $mail_result,
\t\t'observation' => $mail_observation,
\t),
\t'pluggable:declaration-timing' => array(
\t\t'before' => $GLOBALS['wphx_312_03_declared_before'],
\t\t'after' => $declared_after,
\t),
);

ksort( $cases );
echo json_encode(
\tarray(
\t\t'cases' => $cases,
\t\t'actions' => $GLOBALS['wphx_312_03_actions'],
\t\t'filters' => $GLOBALS['wphx_312_03_filters'],
\t\t'php_errors' => $GLOBALS['wphx_312_03_errors'],
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function runProbe(root) {
  return JSON.parse(command("php", [PROBE, root]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-http-cron-mail-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/http-cron-mail-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "HTTP response helpers, cron scheduling helpers, and wp_mail pre-send filter behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 HTTP, cron, and pluggable mail source against deterministic in-process hooks/options. It does not perform live network I/O, spawn real cron, construct PHPMailer, deliver mail, claim generated public PHP replacement, feed rendering parity, embed/oEmbed parity, installed behavior, or upstream PHPUnit parity."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-haxe-adapter-contract-foundation",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live-network-off HTTP, cron spawn, mail transport, feed/embed/oEmbed, installed distribution, and selected upstream PHPUnit gates before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-http-cron-mail-oracle-fixture",
        "npm run wp:core:wphx-312-http-cron-mail-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-03-http-cron-mail-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const oracle = runProbe(ORACLE_ROOT);
const candidate = runProbe(CANDIDATE_ROOT);
const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);

if (!observationsMatch) {
  console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
  process.exit(1);
}

const phpLint = SOURCE_FILES.map((path) => ({
  path,
  oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
  candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
}));

const manifest = {
  schema: "wphx.wp-core-http-cron-mail-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord),
    support_sources: SUPPORT_PATHS.flatMap(listFiles).map(sourceRecord)
  },
  fixture: {
    cases: FIXTURE_CASES,
    covered_symbols: COVERED_SYMBOLS,
    source_files: SOURCE_FILES,
    probe: { path: PROBE, sha256: sha256File(PROBE) },
    side_effect_policy: {
      live_network_io: false,
      real_cron_spawn: false,
      real_mail_delivery: false,
      phpmailer_constructed: false,
      feed_rendering_executed: false,
      embed_oembed_executed: false
    },
    public_abi_policy: {
      public_php_replacement_claimed: false,
      copied_oracle_public_php: true,
      adapter_contract_foundation: CONTRACT,
      installed_wordpress_behavior_claimed: false
    }
  },
  build: {
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    php_lint: phpLint
  },
  observations: {
    oracle,
    candidate,
    match: observationsMatch,
    oracle_sha256: sha256(JSON.stringify(oracle)),
    candidate_sha256: sha256(JSON.stringify(candidate))
  },
  remaining_gaps: [
    {
      id: "live-http-network-and-requests-transports-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture covers deterministic response helper, header/cookie, and encoding behavior only. Live transports, Requests integration, redirect handling, proxy behavior, and TLS/certificate details remain later WPHX-312 gates."
    },
    {
      id: "cron-spawn-and-real-time-dispatch-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture uses in-memory options and selected scheduling helpers. wp_cron execution, spawn_cron HTTP loopback, locks, due task callbacks, and persistence races remain later gates."
    },
    {
      id: "mail-transport-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture observes wp_mail filters and pre_wp_mail short-circuit behavior without constructing PHPMailer or sending mail. Header parsing, attachments, embeds, transport success/failure hooks, and PHPMailer language details remain later gates."
    },
    {
      id: "feed-embed-https-ai-trackback-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "This first side-effect-safe oracle fixture does not execute feed rendering, oEmbed/embed discovery, HTTPS migration, AI-client HTTP, or trackback behavior; those stay in the WPHX-312 follow-up queue."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    fixture_cases: FIXTURE_CASES.length,
    covered_symbols: COVERED_SYMBOLS.length,
    observations_match: observationsMatch,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "HTTP/cron/mail oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle HTTP/cron/mail boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-312-http-cron-mail-oracle-fixture",
    "npm run wp:core:wphx-312-http-cron-mail-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
    "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate"
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
      fixture_cases: FIXTURE_CASES.length,
      observations_match: observationsMatch
    },
    null,
    2
  )
);
