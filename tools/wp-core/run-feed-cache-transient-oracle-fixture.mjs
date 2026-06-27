#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-5tf",
  external_ref: "WPHX-312.35",
  title: "WPHX-312.35 - Add feed cache transient oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-feed-cache-transient-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-35";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-35-feed-cache-transient-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-35-feed-cache-transient-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-35-feed-cache-transient-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const REMOTE_FEED_FIXTURE = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const MAGPIE_FETCH_FIXTURE = "manifests/wp-core/wphx-312-23-magpie-rss-fetch-cache-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-feed-cache-transient.php"];
const SUPPORT_FILES = ["src/wp-includes/SimplePie/src/Cache/Base.php"];
const COVERED_SYMBOLS = [
  "WP_Feed_Cache_Transient::__construct",
  "WP_Feed_Cache_Transient::save",
  "WP_Feed_Cache_Transient::load",
  "WP_Feed_Cache_Transient::mtime",
  "WP_Feed_Cache_Transient::touch",
  "WP_Feed_Cache_Transient::unlink",
  "SimplePie\\Cache\\Base::TYPE_FEED",
  "SimplePie\\SimplePie",
  "wp_feed_cache_transient_lifetime",
  "set_site_transient",
  "get_site_transient",
  "delete_site_transient"
];
const CASES = [
  { id: "feed-cache:constructor-lifetime", focus: "constructor derives feed/mod transient names and filters lifetime by cache key" },
  { id: "feed-cache:save-load-array", focus: "array data save writes data and mod transients with filtered expiration, then load and mtime read them back" },
  { id: "feed-cache:save-simplepie-object", focus: "saving a SimplePie object extracts only the data property before persistence" },
  { id: "feed-cache:touch", focus: "touch updates only the mod transient with current time and filtered lifetime" },
  { id: "feed-cache:unlink", focus: "unlink deletes both data and mod transients and returns true" }
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

function mirrorSources(root) {
  for (const path of [...SOURCE_FILES, ...SUPPORT_FILES]) {
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
namespace SimplePie {
\tclass SimplePie {
\t\tpublic $data;
\t\tpublic function __construct( $data ) {
\t\t\t$this->data = $data;
\t\t}
\t}
}

namespace {
$root = rtrim( $argv[1], '/\\\\' );
$case = $argv[2] ?? '';

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wphx_case'] = $case;
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_transients'] = array();
$GLOBALS['wphx_sets'] = array();
$GLOBALS['wphx_gets'] = array();
$GLOBALS['wphx_deletes'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'hook' => $hook_name, 'value' => $value, 'args' => $args );
\tif ( 'wp_feed_cache_transient_lifetime' === $hook_name ) {
\t\t$name = $args[0] ?? '';
\t\treturn match ( $name ) {
\t\t\t'constructor-key' => 321,
\t\t\t'array-key' => 222,
\t\t\t'object-key' => 333,
\t\t\t'touch-key' => 444,
\t\t\t'unlink-key' => 555,
\t\t\tdefault => $value,
\t\t};
\t}
\treturn $value;
}
function wphx_normalize_transient_value( $name, $value ) {
\tif ( str_starts_with( $name, 'feed_mod_' ) ) {
\t\treturn array( 'timestamp' => is_int( $value ) && $value > 0 ? '__time__' : $value );
\t}
\treturn $value;
}
function set_site_transient( $name, $value, $expiration = 0 ) {
\t$GLOBALS['wphx_transients'][ $name ] = array( 'value' => $value, 'expiration' => $expiration );
\t$GLOBALS['wphx_sets'][] = array( 'name' => $name, 'value' => wphx_normalize_transient_value( $name, $value ), 'expiration' => $expiration );
\treturn true;
}
function get_site_transient( $name ) {
\t$GLOBALS['wphx_gets'][] = $name;
\treturn $GLOBALS['wphx_transients'][ $name ]['value'] ?? false;
}
function delete_site_transient( $name ) {
\t$GLOBALS['wphx_deletes'][] = $name;
\tunset( $GLOBALS['wphx_transients'][ $name ] );
\treturn true;
}
function wphx_transient_summary() {
\t$out = array();
\tforeach ( $GLOBALS['wphx_transients'] as $name => $record ) {
\t\t$out[ $name ] = array(
\t\t\t'value' => wphx_normalize_transient_value( $name, $record['value'] ),
\t\t\t'expiration' => $record['expiration'],
\t\t);
\t}
\tksort( $out );
\treturn $out;
}

require ABSPATH . WPINC . '/SimplePie/src/Cache/Base.php';
require ABSPATH . WPINC . '/class-wp-feed-cache-transient.php';

$assertions = array();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'feed-cache:constructor-lifetime':
\t\t$cache = new WP_Feed_Cache_Transient( 'wp_transient', 'constructor-key', SimplePie\\Cache\\Base::TYPE_FEED );
\t\t$result['state'] = array( 'name' => $cache->name, 'mod_name' => $cache->mod_name, 'lifetime' => $cache->lifetime );
\t\t$result['filters'] = $GLOBALS['wphx_filters'];
\t\t$assertions['names'] = 'feed_constructor-key' === $cache->name && 'feed_mod_constructor-key' === $cache->mod_name;
\t\t$assertions['lifetime_filtered'] = 321 === $cache->lifetime;
\t\t$assertions['filter_args'] = 'wp_feed_cache_transient_lifetime' === $GLOBALS['wphx_filters'][0]['hook'] && 43200 === $GLOBALS['wphx_filters'][0]['value'] && 'constructor-key' === $GLOBALS['wphx_filters'][0]['args'][0];
\t\tbreak;

\tcase 'feed-cache:save-load-array':
\t\t$cache = new WP_Feed_Cache_Transient( 'wp_transient', 'array-key', SimplePie\\Cache\\Base::TYPE_FEED );
\t\t$data = array( 'items' => array( 'alpha', 'beta' ), 'meta' => array( 'source' => 'fixture' ) );
\t\t$save = $cache->save( $data );
\t\t$load = $cache->load();
\t\t$mtime = $cache->mtime();
\t\t$result['save'] = $save;
\t\t$result['load'] = $load;
\t\t$result['mtime_is_int'] = is_int( $mtime ) && $mtime > 0;
\t\t$result['sets'] = $GLOBALS['wphx_sets'];
\t\t$result['gets'] = $GLOBALS['wphx_gets'];
\t\t$result['transients'] = wphx_transient_summary();
\t\t$assertions['save_true'] = true === $save;
\t\t$assertions['load_roundtrip'] = $data === $load;
\t\t$assertions['mtime_timestamp'] = true === $result['mtime_is_int'];
\t\t$assertions['set_names_expiration'] = 'feed_array-key' === $GLOBALS['wphx_sets'][0]['name'] && 'feed_mod_array-key' === $GLOBALS['wphx_sets'][1]['name'] && 222 === $GLOBALS['wphx_sets'][0]['expiration'] && 222 === $GLOBALS['wphx_sets'][1]['expiration'];
\t\t$assertions['get_order'] = array( 'feed_array-key', 'feed_mod_array-key' ) === $GLOBALS['wphx_gets'];
\t\tbreak;

\tcase 'feed-cache:save-simplepie-object':
\t\t$cache = new WP_Feed_Cache_Transient( 'wp_transient', 'object-key', SimplePie\\Cache\\Base::TYPE_FEED );
\t\t$object = new SimplePie\\SimplePie( array( 'cached' => 'from-object', 'count' => 2 ) );
\t\t$save = $cache->save( $object );
\t\t$result['save'] = $save;
\t\t$result['sets'] = $GLOBALS['wphx_sets'];
\t\t$result['transients'] = wphx_transient_summary();
\t\t$assertions['save_true'] = true === $save;
\t\t$assertions['object_data_extracted'] = array( 'cached' => 'from-object', 'count' => 2 ) === $GLOBALS['wphx_transients']['feed_object-key']['value'];
\t\t$assertions['expiration'] = 333 === $GLOBALS['wphx_sets'][0]['expiration'] && 333 === $GLOBALS['wphx_sets'][1]['expiration'];
\t\tbreak;

\tcase 'feed-cache:touch':
\t\t$cache = new WP_Feed_Cache_Transient( 'wp_transient', 'touch-key', SimplePie\\Cache\\Base::TYPE_FEED );
\t\t$touch = $cache->touch();
\t\t$result['touch'] = $touch;
\t\t$result['sets'] = $GLOBALS['wphx_sets'];
\t\t$result['transients'] = wphx_transient_summary();
\t\t$assertions['touch_true'] = true === $touch;
\t\t$assertions['only_mod_set'] = 1 === count( $GLOBALS['wphx_sets'] ) && 'feed_mod_touch-key' === $GLOBALS['wphx_sets'][0]['name'];
\t\t$assertions['expiration'] = 444 === $GLOBALS['wphx_sets'][0]['expiration'];
\t\tbreak;

\tcase 'feed-cache:unlink':
\t\t$cache = new WP_Feed_Cache_Transient( 'wp_transient', 'unlink-key', SimplePie\\Cache\\Base::TYPE_FEED );
\t\t$cache->save( array( 'temporary' => true ) );
\t\t$unlink = $cache->unlink();
\t\t$result['unlink'] = $unlink;
\t\t$result['deletes'] = $GLOBALS['wphx_deletes'];
\t\t$result['transients_after_unlink'] = wphx_transient_summary();
\t\t$assertions['unlink_true'] = true === $unlink;
\t\t$assertions['deleted_both'] = array( 'feed_unlink-key', 'feed_mod_unlink-key' ) === $GLOBALS['wphx_deletes'];
\t\t$assertions['empty_store'] = array() === $GLOBALS['wphx_transients'];
\t\tbreak;
}

$result['assertions'] = $assertions;
echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
}
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
    manifest_id: "ownership:wp-core/feed-cache-transient-oracle-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Feed_Cache_Transient site-transient adapter behavior",
      area: "src/wp-includes/class-wp-feed-cache-transient.php",
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-feed-cache-transient.php in isolated PHP CLI probes with deterministic site-transient, filter, and SimplePie object stubs. It observes transient name derivation, wp_feed_cache_transient_lifetime filtering, save/load/mtime/touch/unlink behavior, array persistence, SimplePie object data extraction, expiration handoff, and paired transient deletion without claiming live SimplePie feed parsing, remote feed fetching, object-cache backend behavior, multisite cache persistence, installed distribution behavior, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-site-transient-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded feed fetching, SimplePie parser/cache registration, persistent object-cache/multisite behavior, selected upstream feed PHPUnit, installed distribution routes, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-feed-cache-transient-oracle-fixture",
        "npm run wp:core:wphx-312-feed-cache-transient-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-35-feed-cache-transient-oracle-fixture"],
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

  const phpLint = [...SOURCE_FILES, ...SUPPORT_FILES].map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const manifest = {
    schema: "wphx.wp-core-feed-cache-transient-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      remote_feed_fixture_manifest: inputRecord(REMOTE_FEED_FIXTURE),
      magpie_fetch_fixture_manifest: inputRecord(MAGPIE_FETCH_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord),
      support_sources: SUPPORT_FILES.map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      support_files: SUPPORT_FILES,
      probe: { path: PROBE, sha256: sha256File(PROBE) },
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "set_site_transient, get_site_transient, delete_site_transient, apply_filters, and a tiny SimplePie object are deterministic stubs; copied class-wp-feed-cache-transient.php remains the executed public feed-cache source."
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
        id: "live-simplepie-feed-fetch-and-parse-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture exercises the transient cache adapter directly. Remote feed fetching, SimplePie parser state, cache registration from fetch_feed, and feed XML parsing remain later WPHX-312 gates."
      },
      {
        id: "persistent-object-cache-and-multisite-storage-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "Site transient functions are deterministic in-memory stubs. Persistent object-cache backends, multisite/global cache behavior, expiration races, and database-backed transients are not claimed."
      },
      {
        id: "installed-distribution-behavior-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture uses PHP CLI with deterministic stubs rather than an installed WordPress distribution, plugin/theme filters, real feeds, or production cache configuration."
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
      live_feed_fetch_claimed: false,
      persistent_cache_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-35-feed-cache-transient-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Feed_Cache_Transient oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle feed cache transient boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-feed-cache-transient-oracle-fixture",
      "npm run wp:core:wphx-312-feed-cache-transient-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
      "receipt:wphx-312-23-magpie-rss-fetch-cache-oracle-fixture"
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
