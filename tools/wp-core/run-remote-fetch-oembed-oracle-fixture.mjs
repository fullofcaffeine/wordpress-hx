#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.8",
  external_ref: "WPHX-312.08",
  title: "WPHX-312.08 — Add remote fetch oEmbed oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-remote-fetch-oembed-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-08";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const PRIVACY_FIXTURE = "manifests/wp-core/wphx-312-07-privacy-request-mail-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/feed.php",
  "src/wp-includes/class-wp-feed-cache-transient.php",
  "src/wp-includes/class-wp-simplepie-file.php",
  "src/wp-includes/class-wp-simplepie-sanitize-kses.php",
  "src/wp-includes/class-wp-oembed.php",
  "src/wp-includes/embed.php"
];
const COVERED_SYMBOLS = [
  "fetch_feed",
  "WP_Feed_Cache_Transient::__construct",
  "WP_Feed_Cache_Transient::save",
  "WP_Feed_Cache_Transient::load",
  "WP_SimplePie_File::__construct",
  "wp_safe_remote_request",
  "wp_oembed_add_provider",
  "_wp_oembed_get_object",
  "wp_oembed_get",
  "WP_oEmbed::get_provider",
  "WP_oEmbed::get_data",
  "WP_oEmbed::get_html",
  "WP_oEmbed::discover",
  "WP_oEmbed::fetch",
  "WP_oEmbed::_fetch_with_format",
  "WP_oEmbed::data2html",
  "oembed_remote_get_args",
  "oembed_fetch_url",
  "oembed_result",
  "oembed_dataparse"
];
const FIXTURE_CASES = [
  { id: "feed:fetch-success", focus: "fetch_feed configures SimplePie registry/cache/file classes and records a successful fake remote feed URL" },
  { id: "feed:fetch-error", focus: "fetch_feed converts SimplePie errors into WP_Error(simplepie-error)" },
  { id: "feed:remote-file", focus: "WP_SimplePie_File reads fake HTTP status, body, and repeated headers through Core HTTP helpers" },
  { id: "oembed:known-provider-json", focus: "known provider fetch builds provider URL, retrieves JSON, converts rich payload to HTML, and runs result filters" },
  { id: "oembed:discover-json", focus: "provider discovery reads fake HTML link tags then fetches discovered JSON oEmbed data" },
  { id: "oembed:xml-fallback", focus: "JSON 501 not-implemented response falls through to XML provider parsing" }
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
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
namespace SimplePie\\Cache {
\tinterface Base {
\t\tpublic const TYPE_FEED = 'spc';
\t\tpublic const TYPE_IMAGE = 'spi';
\t}
}

namespace SimplePie {
\tclass Registry {
\t\tpublic $records = array();
\t\tpublic function register( $class, $implementation, $override = false ) {
\t\t\t$this->records[] = array( 'class' => $class, 'implementation' => $implementation, 'override' => $override );
\t\t}
\t}
\tclass Sanitize {}
\tclass File {}
\tclass Misc {
\t\tpublic static function get_default_useragent() { return 'fixture-agent'; }
\t}
\tclass SimplePie {
\t\tpublic const FILE_SOURCE_REMOTE = 1;
\t\tpublic const CONSTRUCT_MAYBE_HTML = 1;
\t\tpublic const CONSTRUCT_HTML = 2;
\t\tpublic const CONSTRUCT_XHTML = 4;
\t\tpublic const CONSTRUCT_BASE64 = 8;
\t\tpublic const CONSTRUCT_TEXT = 16;
\t\tpublic $sanitize;
\t\tpublic $data = array( 'items' => array() );
\t\tpublic $feed_url = null;
\t\tpublic $cache_location = null;
\t\tpublic $cache_class = null;
\t\tpublic $cache_duration = null;
\t\tpublic $output_encoding = null;
\t\tprivate $registry;
\t\tprivate $error = '';
\t\tpublic function __construct() { $this->registry = new Registry(); }
\t\tpublic function get_registry() { return $this->registry; }
\t\tpublic function set_cache_location( $location ) { $this->cache_location = $location; }
\t\tpublic function set_cache_class( $class ) { $this->cache_class = $class; }
\t\tpublic function set_cache_duration( $duration ) { $this->cache_duration = $duration; }
\t\tpublic function set_feed_url( $url ) { $this->feed_url = $url; }
\t\tpublic function init() {
\t\t\t$GLOBALS['wphx_312_08_simplepie_init'][] = array(
\t\t\t\t'feed_url' => $this->feed_url,
\t\t\t\t'cache_location' => $this->cache_location,
\t\t\t\t'cache_duration' => $this->cache_duration,
\t\t\t\t'registry' => $this->registry->records,
\t\t\t);
\t\t\tif ( 'https://feeds.example/error.xml' === $this->feed_url ) {
\t\t\t\t$this->error = 'fixture feed error';
\t\t\t}
\t\t\t$this->data['items'][] = array( 'url' => $this->feed_url, 'title' => 'Fixture item' );
\t\t}
\t\tpublic function set_output_encoding( $encoding ) { $this->output_encoding = $encoding; }
\t\tpublic function error() { return $this->error; }
\t\tpublic static function merge_items( $feeds ) {
\t\t\t$items = array();
\t\t\tforeach ( $feeds as $feed ) {
\t\t\t\t$items = array_merge( $items, $feed->data['items'] );
\t\t\t}
\t\t\treturn $items;
\t\t}
\t}
}

namespace {
\tclass SimplePie_Cache {
\t\tpublic static $registered = array();
\t\tpublic static function register( $scheme, $class ) {
\t\t\tself::$registered[] = array( 'scheme' => $scheme, 'class' => $class );
\t\t}
\t}

\t$root = rtrim( $argv[1], '/\\\\' );
\t$case = $argv[2];

\terror_reporting( E_ALL );
\tini_set( 'display_errors', 'stderr' );
\tini_set( 'log_errors', '0' );
\t$_SERVER['REQUEST_METHOD'] = 'GET';
\t$_SERVER['REQUEST_URI'] = '/fixture';

\tdefine( 'ABSPATH', $root . '/' );
\tdefine( 'WPINC', 'wp-includes' );
\tdefine( 'WP_DEBUG', false );
\tdefine( 'HOUR_IN_SECONDS', 3600 );
\tdefine( 'DAY_IN_SECONDS', 86400 );
\tif ( ! defined( 'SIMPLEPIE_PCRE_HTML_ATTRIBUTE' ) ) {
\t\tdefine( 'SIMPLEPIE_PCRE_HTML_ATTRIBUTE', '' );
\t}

\t$GLOBALS['wp_filter'] = array();
\t$GLOBALS['wp_actions'] = array();
\t$GLOBALS['content_width'] = 640;
\t$GLOBALS['wphx_312_08_case'] = $case;
\t$GLOBALS['wphx_312_08_filters'] = array();
\t$GLOBALS['wphx_312_08_actions'] = array();
\t$GLOBALS['wphx_312_08_errors'] = array();
\t$GLOBALS['wphx_312_08_http'] = array();
\t$GLOBALS['wphx_312_08_transients'] = array();
\t$GLOBALS['wphx_312_08_simplepie_init'] = array();

\tset_error_handler(
\t\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t\t$GLOBALS['wphx_312_08_errors'][] = array(
\t\t\t\t'errno' => $errno,
\t\t\t\t'message' => $errstr,
\t\t\t\t'file' => basename( $errfile ),
\t\t\t\t'line' => $errline,
\t\t\t);
\t\t\treturn true;
\t\t}
\t);

\tclass WP_Error {
\t\tprivate $code;
\t\tprivate $message;
\t\tpublic function __construct( $code = '', $message = '' ) {
\t\t\t$this->code = $code;
\t\t\t$this->message = $message;
\t\t}
\t\tpublic function get_error_code() { return $this->code; }
\t\tpublic function get_error_message() { return $this->message; }
\t}
\tclass WP_Http_Response {}

\tfunction __( $text ) { return $text; }
\tfunction is_wp_error( $thing ) { return $thing instanceof WP_Error; }
\tfunction get_bloginfo( $show = '', $filter = 'raw' ) { return 'charset' === $show ? 'UTF-8' : 'Fixture Site'; }
\tfunction esc_url( $value ) { return (string) $value; }
\tfunction esc_attr( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); }
\tfunction esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); }
\tfunction home_url( $path = '', $scheme = null ) { return 'https://example.test' . $path; }
\tfunction absint( $value ) { return abs( (int) $value ); }
\tfunction wp_parse_args( $args, $defaults = array() ) {
\t\tif ( is_object( $args ) ) {
\t\t\t$args = get_object_vars( $args );
\t\t}
\t\tif ( ! is_array( $args ) ) {
\t\t\tparse_str( (string) $args, $args );
\t\t}
\t\treturn array_merge( $defaults, $args );
\t}
\tfunction add_query_arg( ...$args ) {
\t\tif ( 3 === count( $args ) ) {
\t\t\t$key = $args[0];
\t\t\t$value = $args[1];
\t\t\t$url = $args[2];
\t\t\t$parts = parse_url( $url );
\t\t\t$query = array();
\t\t\tif ( ! empty( $parts['query'] ) ) {
\t\t\t\tparse_str( $parts['query'], $query );
\t\t\t}
\t\t\t$query[ $key ] = $value;
\t\t\t$scheme = isset( $parts['scheme'] ) ? $parts['scheme'] . '://' : '';
\t\t\t$host = $parts['host'] ?? '';
\t\t\t$path = $parts['path'] ?? '';
\t\t\treturn $scheme . $host . $path . '?' . http_build_query( $query );
\t\t}
\t\treturn (string) end( $args );
\t}
\tfunction wp_allowed_protocols() { return array( 'http', 'https' ); }
\tfunction shortcode_parse_atts( $text ) {
\t\t$atts = array();
\t\tif ( preg_match_all( '/([a-zA-Z0-9_-]+)=[\"\\']([^\"\\']*)[\"\\']/', $text, $matches, PREG_SET_ORDER ) ) {
\t\t\tforeach ( $matches as $match ) {
\t\t\t\t$atts[ strtolower( $match[1] ) ] = $match[2];
\t\t\t}
\t\t}
\t\treturn $atts;
\t}
\tfunction did_action( $hook_name ) { return 'plugins_loaded' === $hook_name ? 1 : 0; }
\tfunction add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => is_array( $callback ) ? 'array-callback' : (string) $callback, 'accepted_args' => $accepted_args );
\t\treturn true;
\t}
\tfunction apply_filters( $hook_name, $value, ...$args ) {
\t\t$GLOBALS['wphx_312_08_filters'][] = array( 'hook' => $hook_name, 'value_type' => gettype( $value ), 'arg_count' => count( $args ) );
\t\tif ( 'wp_feed_cache_transient_lifetime' === $hook_name ) {
\t\t\treturn 321;
\t\t}
\t\treturn $value;
\t}
\tfunction do_action_ref_array( $hook_name, $args ) {
\t\t$GLOBALS['wphx_312_08_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) );
\t}
\tfunction wp_kses_post( $data ) { return $data; }
\tfunction set_site_transient( $name, $value, $expiration = 0 ) {
\t\t$GLOBALS['wphx_312_08_transients'][ $name ] = array( 'value' => $value, 'expiration' => $expiration );
\t\treturn true;
\t}
\tfunction get_site_transient( $name ) {
\t\treturn $GLOBALS['wphx_312_08_transients'][ $name ]['value'] ?? false;
\t}
\tfunction delete_site_transient( $name ) {
\t\tunset( $GLOBALS['wphx_312_08_transients'][ $name ] );
\t\treturn true;
\t}
\tfunction wp_safe_remote_request( $url, $args = array() ) {
\t\treturn wphx_312_08_fake_response( $url, $args, 'request' );
\t}
\tfunction wp_safe_remote_get( $url, $args = array() ) {
\t\treturn wphx_312_08_fake_response( $url, $args, 'get' );
\t}
\tfunction wphx_312_08_fake_response( $url, $args, $method ) {
\t\t$GLOBALS['wphx_312_08_http'][] = array( 'method' => $method, 'url' => $url, 'args' => $args );
\t\t$body = '';
\t\t$code = 200;
\t\t$headers = array( 'content-type' => 'text/plain' );
\t\tif ( str_contains( $url, 'feed-success.xml' ) ) {
\t\t\t$body = '<rss><channel><title>Fixture Feed</title></channel></rss>';
\t\t\t$headers = array( 'content-type' => array( 'application/rss+xml', 'text/xml' ), 'x-feed' => array( 'one', 'two' ) );
\t\t} elseif ( str_contains( $url, 'provider.example/oembed' ) && str_contains( $url, 'format=json' ) && 'oembed-xml-fallback' === $GLOBALS['wphx_312_08_case'] ) {
\t\t\t$code = 501;
\t\t} elseif ( str_contains( $url, 'provider.example/oembed' ) && str_contains( $url, 'format=json' ) ) {
\t\t\t$body = '{\"type\":\"rich\",\"html\":\"<iframe src=\\\\\"https://embed.example/rich\\\\\"></iframe>\",\"width\":640,\"height\":360}';
\t\t\t$headers = array( 'content-type' => 'application/json' );
\t\t} elseif ( str_contains( $url, 'provider.example/oembed' ) && str_contains( $url, 'format=xml' ) ) {
\t\t\t$body = '<oembed><type>photo</type><url>https://cdn.example/photo.jpg</url><width>320</width><height>180</height><title>Fixture Photo</title></oembed>';
\t\t\t$headers = array( 'content-type' => 'text/xml' );
\t\t} elseif ( 'https://discover.example/post' === $url ) {
\t\t\t$body = '<html><head><link rel=\"alternate\" type=\"application/json+oembed\" href=\"https://provider.example/oembed\" /></head><body>Fixture</body></html>';
\t\t\t$headers = array( 'content-type' => 'text/html' );
\t\t}
\t\treturn array(
\t\t\t'headers' => $headers,
\t\t\t'body' => $body,
\t\t\t'response' => array( 'code' => $code, 'message' => 200 === $code ? 'OK' : 'Not Implemented' ),
\t\t);
\t}
\tfunction wp_remote_retrieve_headers( $response ) { return $response['headers'] ?? array(); }
\tfunction wp_remote_retrieve_body( $response ) { return $response['body'] ?? ''; }
\tfunction wp_remote_retrieve_response_code( $response ) { return $response['response']['code'] ?? null; }

\trequire ABSPATH . WPINC . '/feed.php';
\trequire ABSPATH . WPINC . '/class-wp-feed-cache-transient.php';
\trequire ABSPATH . WPINC . '/class-wp-simplepie-file.php';
\trequire ABSPATH . WPINC . '/class-wp-simplepie-sanitize-kses.php';
\trequire ABSPATH . WPINC . '/class-wp-oembed.php';
\trequire ABSPATH . WPINC . '/embed.php';

\tswitch ( $case ) {
\t\tcase 'feed-fetch-success':
\t\t\t$result = fetch_feed( 'https://feeds.example/feed-success.xml' );
\t\t\t$summary = array(
\t\t\t\t'class' => is_object( $result ) ? get_class( $result ) : gettype( $result ),
\t\t\t\t'error' => is_wp_error( $result ) ? $result->get_error_message() : null,
\t\t\t\t'feed_url' => is_object( $result ) && isset( $result->feed_url ) ? $result->feed_url : null,
\t\t\t\t'cache_duration' => is_object( $result ) && isset( $result->cache_duration ) ? $result->cache_duration : null,
\t\t\t\t'output_encoding' => is_object( $result ) && isset( $result->output_encoding ) ? $result->output_encoding : null,
\t\t\t);
\t\t\tbreak;
\t\tcase 'feed-fetch-error':
\t\t\t$result = fetch_feed( 'https://feeds.example/error.xml' );
\t\t\t$summary = array( 'wp_error' => $result->get_error_code(), 'message' => $result->get_error_message() );
\t\t\tbreak;
\t\tcase 'feed-remote-file':
\t\t\t$file = new WP_SimplePie_File( 'https://feeds.example/feed-success.xml', 5, 2, array( 'Accept' => 'application/rss+xml' ), 'custom-agent' );
\t\t\t$summary = array(
\t\t\t\t'success' => $file->success ?? null,
\t\t\t\t'status_code' => $file->status_code ?? null,
\t\t\t\t'body_sha256' => hash( 'sha256', $file->body ?? '' ),
\t\t\t\t'headers' => $file->headers ?? array(),
\t\t\t);
\t\t\tbreak;
\t\tcase 'oembed-known-provider-json':
\t\t\twp_oembed_add_provider( '#https://known.example/.+#i', 'https://provider.example/oembed', true );
\t\t\t$html = wp_oembed_get( 'https://known.example/post/1', array( 'width' => 400, 'height' => 225, 'discover' => false ) );
\t\t\t$summary = array( 'html' => $html, 'html_sha256' => hash( 'sha256', (string) $html ) );
\t\t\tbreak;
\t\tcase 'oembed-discover-json':
\t\t\t$oembed = _wp_oembed_get_object();
\t\t\t$provider = $oembed->discover( 'https://discover.example/post' );
\t\t\t$html = $oembed->get_html( 'https://discover.example/post', array( 'width' => 300, 'height' => 150, 'discover' => true ) );
\t\t\t$summary = array( 'provider' => $provider, 'html' => $html, 'html_sha256' => hash( 'sha256', (string) $html ) );
\t\t\tbreak;
\t\tcase 'oembed-xml-fallback':
\t\t\twp_oembed_add_provider( '#https://known.example/.+#i', 'https://provider.example/oembed', true );
\t\t\t$html = wp_oembed_get( 'https://known.example/post/2', array( 'width' => 320, 'height' => 180, 'discover' => false ) );
\t\t\t$summary = array( 'html' => $html, 'html_sha256' => hash( 'sha256', (string) $html ) );
\t\t\tbreak;
\t\tdefault:
\t\t\t$summary = array( 'unknown_case' => $case );
\t}

\techo json_encode(
\t\tarray(
\t\t\t'case' => $case,
\t\t\t'summary' => $summary,
\t\t\t'http' => $GLOBALS['wphx_312_08_http'],
\t\t\t'filters' => $GLOBALS['wphx_312_08_filters'],
\t\t\t'actions' => $GLOBALS['wphx_312_08_actions'],
\t\t\t'simplepie_init' => $GLOBALS['wphx_312_08_simplepie_init'],
\t\t\t'transients' => $GLOBALS['wphx_312_08_transients'],
\t\t\t'simplepie_cache_registered' => SimplePie_Cache::$registered,
\t\t\t'php_errors' => $GLOBALS['wphx_312_08_errors'],
\t\t),
\t\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
\t);
}
`
  );
}

function runProbe(root, mode) {
  return JSON.parse(command("php", [PROBE, root, mode]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-remote-fetch-oembed-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/remote-fetch-oembed-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "remote feed fetch, SimplePie wrapper, and oEmbed HTTP discovery/fetch behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 feed and oEmbed source against deterministic SimplePie and HTTP stubs. It does not perform live network requests, installed embed rendering, feed template rendering, upstream PHPUnit parity, or generated public PHP replacement."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-haxe-adapter-contract-foundation",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass installed feed/oEmbed rendering, live-network or recorded-network parity, selected upstream tests, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-remote-fetch-oembed-oracle-fixture",
        "npm run wp:core:wphx-312-remote-fetch-oembed-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const caseIds = [
  "feed-fetch-success",
  "feed-fetch-error",
  "feed-remote-file",
  "oembed-known-provider-json",
  "oembed-discover-json",
  "oembed-xml-fallback"
];
const oracle = Object.fromEntries(caseIds.map((id) => [id, runProbe(ORACLE_ROOT, id)]));
const candidate = Object.fromEntries(caseIds.map((id) => [id, runProbe(CANDIDATE_ROOT, id)]));
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
  schema: "wphx.wp-core-remote-fetch-oembed-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    privacy_fixture_manifest: inputRecord(PRIVACY_FIXTURE),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord)
  },
  fixture: {
    cases: FIXTURE_CASES,
    covered_symbols: COVERED_SYMBOLS,
    source_files: SOURCE_FILES,
    probe: { path: PROBE, sha256: sha256File(PROBE) },
    side_effect_policy: {
      live_network_requests: false,
      installed_embed_rendering: false,
      feed_template_rendering: false,
      persistent_cache_writes: false
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
      id: "live-network-requests-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture uses deterministic fake wp_safe_remote_request/wp_safe_remote_get responses. Live HTTP, TLS, redirects, provider availability, and recorded-network replay remain later gates."
    },
    {
      id: "installed-feed-oembed-rendering-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture calls helper/API functions in process. Installed feed templates, post embed rendering, REST oEmbed controller dispatch, and shortcode integration remain later distribution work."
    },
    {
      id: "full-simplepie-stack-not-executed",
      owner: ISSUE.external_ref,
      detail:
        "The fixture stubs SimplePie internals to observe WordPress wrapper behavior. Full SimplePie parsing/cache/network behavior remains vendor/reference scope."
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
  id: "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "remote feed/oEmbed oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle remote feed/oEmbed boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-312-remote-fetch-oembed-oracle-fixture",
    "npm run wp:core:wphx-312-remote-fetch-oembed-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
    "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
    "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
    "receipt:wphx-312-04-feed-embed-https-oracle-fixture",
    "receipt:wphx-312-05-ai-http-oracle-fixture",
    "receipt:wphx-312-06-trackback-oracle-fixture",
    "receipt:wphx-312-07-privacy-request-mail-oracle-fixture"
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
