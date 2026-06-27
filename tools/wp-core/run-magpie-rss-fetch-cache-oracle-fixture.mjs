#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-ri4",
  external_ref: "WPHX-312.23",
  title: "WPHX-312.23 - Add MagpieRSS fetch cache oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-magpie-rss-fetch-cache-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-23";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-23-magpie-rss-fetch-cache-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-23-magpie-rss-fetch-cache-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-23-magpie-rss-fetch-cache-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const PARSER_FIXTURE = "manifests/wp-core/wphx-312-22-magpie-rss-parser-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/rss.php"];
const COVERED_SYMBOLS = [
  "rss.php",
  "fetch_rss",
  "_fetch_remote_file",
  "_response_to_rss",
  "wp_safe_remote_request",
  "wp_remote_retrieve_headers",
  "wp_remote_retrieve_response_code",
  "wp_remote_retrieve_body",
  "is_wp_error",
  "RSSCache",
  "RSSCache::set",
  "RSSCache::get",
  "RSSCache::check_cache",
  "RSSCache::file_name",
  "set_transient",
  "get_transient",
  "MAGPIE_CACHE_ON",
  "MAGPIE_CACHE_DIR",
  "MAGPIE_CACHE_AGE",
  "MAGPIE_FETCH_TIME_OUT"
];
const CASES = [
  { id: "magpie:fetch-remote-success", focus: "_fetch_remote_file converts WP HTTP success into Snoopy-style headers/body/status" },
  { id: "magpie:fetch-remote-error", focus: "_fetch_remote_file converts WP_Error into Snoopy-compatible 500/error shape" },
  { id: "magpie:fetch-cache-off-success", focus: "fetch_rss with MAGPIE_CACHE_ON disabled fetches and parses without transient writes" },
  { id: "magpie:fetch-cache-miss-success", focus: "fetch_rss cache miss fetches remote feed, parses it, and stores the RSS object in a transient" },
  { id: "magpie:fetch-cache-hit", focus: "fetch_rss cache hit returns the cached object with from_cache and no remote call" },
  { id: "magpie:rsscache-transients", focus: "RSSCache set/get/check_cache maps URLs to rss_ md5 transient keys" }
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

function writeProbe(root) {
  writeFileSync(
    `${root}/probe.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$case = $argv[1] ?? '';

$GLOBALS['wp_version'] = '7.0-fixture';
$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_deprecated'] = array();
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_trigger_errors'] = array();
$GLOBALS['wphx_remote_requests'] = array();
$GLOBALS['wphx_transients'] = array();
$GLOBALS['wphx_set_transients'] = array();
$GLOBALS['wphx_get_transients'] = array();

define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', __DIR__ . '/wp-content' );
define( 'MAGPIE_CACHE_DIR', __DIR__ . '/wp-content/cache' );
define( 'MAGPIE_CACHE_AGE', 123 );

if ( 'magpie:fetch-cache-off-success' === $case ) {
\tdefine( 'MAGPIE_CACHE_ON', 0 );
}

class WP_Error {
\tpublic $errors;

\tpublic function __construct( $code, $message ) {
\t\t$this->errors = array( $code => array( $message ) );
\t}
}

function _deprecated_file( $file, $version, $replacement = '' ) {
\t$GLOBALS['wphx_deprecated'][] = array( $file, $version, $replacement );
}

function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook_name, 'args' => $args );
}

function wp_trigger_error( $function_name, $message, $error_level = E_USER_NOTICE ) {
\t$GLOBALS['wphx_trigger_errors'][] = array( $function_name, $message, $error_level );
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}

function wp_safe_remote_request( $url, $args = array() ) {
\t$GLOBALS['wphx_remote_requests'][] = array(
\t\t'url' => $url,
\t\t'headers' => $args['headers'] ?? null,
\t\t'timeout' => $args['timeout'] ?? null,
\t);

\tif ( 'magpie:fetch-remote-error' === $GLOBALS['wphx_case'] ) {
\t\treturn new WP_Error( 'fixture_error', 'Fixture failure' );
\t}

\treturn array(
\t\t'response' => array( 'code' => 200 ),
\t\t'headers' => array(
\t\t\t'etag' => '"fetch-etag"',
\t\t\t'last-modified' => 'Sat, 27 Jun 2026 00:00:00 GMT',
\t\t\t'x-multi' => array( 'first', 'second' ),
\t\t),
\t\t'body' => $GLOBALS['wphx_rss2_xml'],
\t);
}

function wp_remote_retrieve_headers( $resp ) {
\treturn $resp['headers'] ?? array();
}

function wp_remote_retrieve_response_code( $resp ) {
\treturn $resp['response']['code'] ?? 0;
}

function wp_remote_retrieve_body( $resp ) {
\treturn $resp['body'] ?? '';
}

function set_transient( $key, $value, $expiration ) {
\t$GLOBALS['wphx_transients'][ $key ] = $value;
\t$GLOBALS['wphx_set_transients'][] = array(
\t\t'key' => $key,
\t\t'expiration' => $expiration,
\t\t'is_object' => is_object( $value ),
\t\t'item_count' => is_object( $value ) && isset( $value->items ) ? count( $value->items ) : null,
\t\t'etag' => is_object( $value ) && isset( $value->etag ) ? $value->etag : null,
\t);

\treturn true;
}

function get_transient( $key ) {
\t$GLOBALS['wphx_get_transients'][] = $key;
\treturn $GLOBALS['wphx_transients'][ $key ] ?? false;
}

require __DIR__ . '/wp-includes/rss.php';

$GLOBALS['wphx_rss2_xml'] = <<<'XML'
<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Fetch Fixture RSS</title>
    <description>Fetch description</description>
    <item>
      <title>Fetched item</title>
      <link>https://example.test/fetched-item</link>
      <description>Fetched summary</description>
    </item>
  </channel>
</rss>
XML;

function wphx_cache_key( $url ) {
\treturn 'rss_' . md5( $url );
}

function wphx_base_result() {
\treturn array(
\t\t'case' => $GLOBALS['wphx_case'],
\t\t'include_side_effects' => array(
\t\t\t'deprecated' => $GLOBALS['wphx_deprecated'],
\t\t\t'actions' => $GLOBALS['wphx_actions'],
\t\t),
\t);
}

function wphx_fetch_remote_success() {
\tinit();
\t$resp = _fetch_remote_file( 'https://example.test/feed', array( 'X-Fixture' => '1' ) );
\treturn array_merge( wphx_base_result(), array(
\t\t'response' => array(
\t\t\t'status' => $resp->status,
\t\t\t'response_code' => $resp->response_code,
\t\t\t'headers' => $resp->headers,
\t\t\t'body_sha256' => hash( 'sha256', $resp->results ),
\t\t),
\t\t'remote_requests' => $GLOBALS['wphx_remote_requests'],
\t) );
}

function wphx_fetch_remote_error() {
\tinit();
\t$resp = _fetch_remote_file( 'https://example.test/error' );
\treturn array_merge( wphx_base_result(), array(
\t\t'response' => array(
\t\t\t'status' => $resp->status,
\t\t\t'response_code' => $resp->response_code,
\t\t\t'error' => $resp->error,
\t\t),
\t\t'remote_requests' => $GLOBALS['wphx_remote_requests'],
\t) );
}

function wphx_fetch_cache_off_success() {
\t$rss = fetch_rss( 'https://example.test/feed' );
\treturn array_merge( wphx_base_result(), array(
\t\t'magpie_cache_on' => MAGPIE_CACHE_ON,
\t\t'item_count' => $rss ? count( $rss->items ) : 0,
\t\t'channel_title' => $rss->channel['title'] ?? null,
\t\t'etag' => $rss->etag ?? null,
\t\t'last_modified' => $rss->last_modified ?? null,
\t\t'remote_requests' => $GLOBALS['wphx_remote_requests'],
\t\t'set_transients' => $GLOBALS['wphx_set_transients'],
\t\t'get_transients' => $GLOBALS['wphx_get_transients'],
\t) );
}

function wphx_fetch_cache_miss_success() {
\t$url = 'https://example.test/feed';
\t$rss = fetch_rss( $url );
\treturn array_merge( wphx_base_result(), array(
\t\t'magpie_cache_on' => MAGPIE_CACHE_ON,
\t\t'cache_key' => wphx_cache_key( $url ),
\t\t'item_count' => $rss ? count( $rss->items ) : 0,
\t\t'channel_title' => $rss->channel['title'] ?? null,
\t\t'etag' => $rss->etag ?? null,
\t\t'last_modified' => $rss->last_modified ?? null,
\t\t'remote_requests' => $GLOBALS['wphx_remote_requests'],
\t\t'set_transients' => $GLOBALS['wphx_set_transients'],
\t\t'get_transients' => $GLOBALS['wphx_get_transients'],
\t\t'stored_item_count' => isset( $GLOBALS['wphx_transients'][ wphx_cache_key( $url ) ]->items ) ? count( $GLOBALS['wphx_transients'][ wphx_cache_key( $url ) ]->items ) : 0,
\t) );
}

function wphx_fetch_cache_hit() {
\t$url = 'https://example.test/feed';
\t$cached = (object) array(
\t\t'channel' => array( 'title' => 'Cached Fixture RSS' ),
\t\t'items' => array( array( 'title' => 'Cached item' ) ),
\t\t'etag' => '"cached-etag"',
\t\t'last_modified' => 'Fri, 26 Jun 2026 00:00:00 GMT',
\t);
\t$GLOBALS['wphx_transients'][ wphx_cache_key( $url ) ] = $cached;

\t$rss = fetch_rss( $url );
\treturn array_merge( wphx_base_result(), array(
\t\t'cache_key' => wphx_cache_key( $url ),
\t\t'from_cache' => $rss->from_cache ?? null,
\t\t'channel_title' => $rss->channel['title'] ?? null,
\t\t'item_count' => $rss ? count( $rss->items ) : 0,
\t\t'remote_request_count' => count( $GLOBALS['wphx_remote_requests'] ),
\t\t'set_transients' => $GLOBALS['wphx_set_transients'],
\t\t'get_transients' => $GLOBALS['wphx_get_transients'],
\t) );
}

function wphx_rsscache_transients() {
\t$url = 'https://example.test/cache-only';
\t$cache = new RSSCache( MAGPIE_CACHE_DIR, MAGPIE_CACHE_AGE );
\t$payload = (object) array( 'items' => array( array( 'title' => 'Stored item' ) ) );
\t$status_before = $cache->check_cache( $url );
\t$set_key = $cache->set( $url, $payload );
\t$status_after = $cache->check_cache( $url );
\t$stored = $cache->get( $url );

\treturn array_merge( wphx_base_result(), array(
\t\t'file_name' => $cache->file_name( $url ),
\t\t'set_key' => $set_key,
\t\t'expected_key' => wphx_cache_key( $url ),
\t\t'status_before' => $status_before,
\t\t'status_after' => $status_after,
\t\t'stored_title' => $stored->items[0]['title'] ?? null,
\t\t'set_transients' => $GLOBALS['wphx_set_transients'],
\t\t'get_transients' => $GLOBALS['wphx_get_transients'],
\t) );
}

$handlers = array(
\t'magpie:fetch-remote-success' => 'wphx_fetch_remote_success',
\t'magpie:fetch-remote-error' => 'wphx_fetch_remote_error',
\t'magpie:fetch-cache-off-success' => 'wphx_fetch_cache_off_success',
\t'magpie:fetch-cache-miss-success' => 'wphx_fetch_cache_miss_success',
\t'magpie:fetch-cache-hit' => 'wphx_fetch_cache_hit',
\t'magpie:rsscache-transients' => 'wphx_rsscache_transients',
);

if ( ! isset( $handlers[ $case ] ) ) {
\tfwrite( STDERR, "Unknown case: $case\\n" );
\texit( 2 );
}

echo json_encode( $handlers[ $case ](), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\\n";
`
  );
}

function runProbe(root, caseId) {
  const stdout = command("php", ["probe.php", caseId], { cwd: root });
  return JSON.parse(stdout);
}

function runAllCases(root) {
  return Object.fromEntries(CASES.map((fixtureCase) => [fixtureCase.id, runProbe(root, fixtureCase.id)]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-magpie-rss-fetch-cache-oracle-fixture`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/magpie-rss-fetch-cache-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "MagpieRSS fetch and transient cache behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/rss.php in PHP CLI with deterministic WordPress HTTP and transient stubs. It observes reachable _fetch_remote_file, fetch_rss, and RSSCache transient behavior without live network, widgets, installed feed routes, broad display helpers, or generated public PHP replacement."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded HTTP, transient cache, feed display/widget/routes, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-magpie-rss-fetch-cache-oracle-fixture",
        "npm run wp:core:wphx-312-magpie-rss-fetch-cache-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-23-magpie-rss-fetch-cache-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

function summarize(observations) {
  const cases = observations;
  return {
    remote_header_count: cases["magpie:fetch-remote-success"].response.headers.length,
    remote_error: cases["magpie:fetch-remote-error"].response.error,
    cache_off_item_count: cases["magpie:fetch-cache-off-success"].item_count,
    cache_miss_set_key: cases["magpie:fetch-cache-miss-success"].set_transients[0].key,
    cache_hit_from_cache: cases["magpie:fetch-cache-hit"].from_cache,
    rsscache_statuses: [
      cases["magpie:rsscache-transients"].status_before,
      cases["magpie:rsscache-transients"].status_after
    ]
  };
}

function buildRoot(root) {
  mirrorSources(root);
  writeProbe(root);
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  buildRoot(ORACLE_ROOT);
  buildRoot(CANDIDATE_ROOT);

  const oracle = runAllCases(ORACLE_ROOT);
  const candidate = runAllCases(CANDIDATE_ROOT);
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
  const probeLint = {
    oracle_lint: command("php", ["-l", `${ORACLE_ROOT}/probe.php`]),
    candidate_lint: command("php", ["-l", `${CANDIDATE_ROOT}/probe.php`])
  };

  const manifest = {
    schema: "wphx.wp-core-magpie-rss-fetch-cache-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      parser_fixture_manifest: inputRecord(PARSER_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        transients_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        wordPress_stubs:
          "wp_safe_remote_request, wp_remote_retrieve_headers, wp_remote_retrieve_response_code, wp_remote_retrieve_body, is_wp_error, set_transient, get_transient, _deprecated_file, do_action, and wp_trigger_error are deterministic local stubs; copied rss.php remains the executed fetch/cache source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      },
      unreachable_legacy_branch_note:
        "fetch_rss still contains a STALE/304 conditional-fetch branch from legacy Magpie, but WordPress 7.0 RSSCache::check_cache only returns HIT or MISS against transients. This fixture records the reachable transient-backed behavior and does not synthesize a STALE state."
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint, probe_lint: probeLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      summary: summarize(oracle),
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate))
    },
    remaining_gaps: [
      {
        id: "live-network-conditional-fetch-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses deterministic HTTP stubs. It does not perform live network I/O, recorded external HTTP replay, or an artificial STALE/304 branch because WordPress 7.0 transient-backed RSSCache exposes only HIT/MISS from check_cache."
      },
      {
        id: "feed-display-widget-routes-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture does not claim wp_rss/get_rss display output, widgets, installed feed routes, admin screens, or database-backed feed behavior."
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
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_network_behavior_claimed: false,
      display_widget_route_behavior_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-23-magpie-rss-fetch-cache-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "MagpieRSS fetch/cache oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle MagpieRSS fetch/cache boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-magpie-rss-fetch-cache-oracle-fixture",
      "npm run wp:core:wphx-312-magpie-rss-fetch-cache-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-22-magpie-rss-parser-oracle-fixture"
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
