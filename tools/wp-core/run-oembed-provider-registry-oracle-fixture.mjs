#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-8sz",
  external_ref: "WPHX-312.29",
  title: "WPHX-312.29 - Add oEmbed provider registry oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-oembed-provider-registry-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-29";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-29-oembed-provider-registry-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-29-oembed-provider-registry-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-29-oembed-provider-registry-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const REMOTE_OEMBED_FIXTURE = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const DEPRECATED_OEMBED_FIXTURE = "manifests/wp-core/wphx-312-28-deprecated-oembed-wrapper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-oembed.php"];
const COVERED_SYMBOLS = [
  "class-wp-oembed.php",
  "WP_oEmbed::__construct",
  "WP_oEmbed::$providers",
  "WP_oEmbed::$early_providers",
  "WP_oEmbed::_add_provider_early",
  "WP_oEmbed::_remove_provider_early",
  "WP_oEmbed::get_provider",
  "WP_oEmbed::__call",
  "WP_oEmbed::_parse_json",
  "WP_oEmbed::_parse_xml",
  "WP_oEmbed::_parse_xml_body",
  "WP_oEmbed::data2html",
  "WP_oEmbed::_strip_newlines",
  "oembed_providers",
  "oembed_dataparse"
];
const CASES = [
  { id: "oembed-registry:constructor-defaults", focus: "constructor builds built-in providers and registers newline stripping" },
  { id: "oembed-registry:early-add-remove-filter", focus: "early provider add/remove queues are applied before the provider filter and then reset" },
  { id: "oembed-registry:provider-matching", focus: "regex and wildcard providers resolve through get_provider without discovery" },
  { id: "oembed-registry:compat-parse-bridge", focus: "__call exposes private parse helpers and rejects unknown methods" },
  { id: "oembed-registry:strip-newlines", focus: "data2html runs oembed_dataparse and strips newlines while preserving pre content" }
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

$GLOBALS['wp_filter'] = array();
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_filter_mutations'] = array();

function home_url( $path = '', $scheme = null ) {
\treturn 'https://fixture.example' . $path;
}

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
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array(
\t\t'callback'      => $callback,
\t\t'accepted_args' => $accepted_args,
\t);
\t$GLOBALS['wphx_filters'][] = array(
\t\t'hook'          => $hook_name,
\t\t'priority'      => $priority,
\t\t'accepted_args' => $accepted_args,
\t\t'callback'      => is_array( $callback ) ? array( is_object( $callback[0] ) ? get_class( $callback[0] ) : $callback[0], $callback[1] ) : $callback,
\t);
\treturn true;
}

function apply_filters( $hook_name, $value, ...$args ) {
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $entry ) {
\t\t\t$call_args = array_slice( array_merge( array( $value ), $args ), 0, $entry['accepted_args'] );
\t\t\t$value = call_user_func_array( $entry['callback'], $call_args );
\t\t}
\t}
\treturn $value;
}

function add_query_arg( ...$args ) {
\t$url = array_pop( $args );
\t$query = array();
\tif ( 1 === count( $args ) && is_array( $args[0] ) ) {
\t\t$query = $args[0];
\t} elseif ( 2 === count( $args ) ) {
\t\t$query = array( $args[0] => $args[1] );
\t}
\t$separator = str_contains( $url, '?' ) ? '&' : '?';
\treturn $url . $separator . http_build_query( $query );
}

function esc_url( $value ) {
\treturn (string) $value;
}

function esc_attr( $value ) {
\treturn htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
}

function esc_html( $value ) {
\treturn htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
}

function normalize_provider( $provider ) {
\tif ( false === $provider ) {
\t\treturn false;
\t}
\treturn $provider;
}

require __DIR__ . '/wp-includes/class-wp-oembed.php';

function provider_has_match( $providers, $needle ) {
\tforeach ( $providers as $format => $data ) {
\t\tif ( str_contains( $format, $needle ) ) {
\t\t\treturn array( 'format' => $format, 'provider' => $data[0], 'regex' => $data[1] );
\t\t}
\t}
\treturn false;
}

$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'oembed-registry:constructor-defaults':
\t\t$oembed = new WP_oEmbed();
\t\t$result += array(
\t\t\t'provider_count' => count( $oembed->providers ),
\t\t\t'has_youtube_watch' => false !== provider_has_match( $oembed->providers, 'youtube\\\\.com/watch' ),
\t\t\t'has_canva' => false !== provider_has_match( $oembed->providers, 'canva\\\\.com/design' ),
\t\t\t'videopress_provider' => provider_has_match( $oembed->providers, 'videopress\\\\.com/v' ),
\t\t\t'early_providers_after_construct' => WP_oEmbed::$early_providers,
\t\t\t'registered_filters' => $GLOBALS['wphx_filters'],
\t\t);
\t\tbreak;
\tcase 'oembed-registry:early-add-remove-filter':
\t\tWP_oEmbed::_add_provider_early( 'https://early.example/*', 'https://early.example/oembed', false );
\t\tWP_oEmbed::_remove_provider_early( '#https?://((m|www)\\\\.)?youtube\\\\.com/watch.*#i' );
\t\tadd_filter(
\t\t\t'oembed_providers',
\t\t\tfunction ( $providers ) {
\t\t\t\t$GLOBALS['wphx_filter_mutations'][] = array(
\t\t\t\t\t'hook' => 'oembed_providers',
\t\t\t\t\t'had_early' => isset( $providers['https://early.example/*'] ),
\t\t\t\t\t'had_removed_youtube' => ! isset( $providers['#https?://((m|www)\\\\.)?youtube\\\\.com/watch.*#i'] ),
\t\t\t\t);
\t\t\t\t$providers['#https://filtered.example/.+#i'] = array( 'https://filtered.example/oembed.{format}', true );
\t\t\t\treturn $providers;
\t\t\t},
\t\t\t10,
\t\t\t1
\t\t);
\t\t$oembed = new WP_oEmbed();
\t\t$result += array(
\t\t\t'early_provider_match' => normalize_provider( $oembed->get_provider( 'https://early.example/post/one', array( 'discover' => false ) ) ),
\t\t\t'filtered_provider_match' => normalize_provider( $oembed->get_provider( 'https://filtered.example/post/one', array( 'discover' => false ) ) ),
\t\t\t'removed_youtube_match' => normalize_provider( $oembed->get_provider( 'https://www.youtube.com/watch?v=fixture', array( 'discover' => false ) ) ),
\t\t\t'filter_mutations' => $GLOBALS['wphx_filter_mutations'],
\t\t\t'early_providers_after_construct' => WP_oEmbed::$early_providers,
\t\t);
\t\tbreak;
\tcase 'oembed-registry:provider-matching':
\t\tWP_oEmbed::_add_provider_early( 'https://wild.example/*/clip', 'https://wild.example/oembed.{format}', false );
\t\tWP_oEmbed::_add_provider_early( '#https://regex.example/[0-9]+#i', 'https://regex.example/oembed.{format}', true );
\t\t$oembed = new WP_oEmbed();
\t\t$result += array(
\t\t\t'wildcard_match' => normalize_provider( $oembed->get_provider( 'https://wild.example/path/clip', array( 'discover' => false ) ) ),
\t\t\t'wildcard_miss' => normalize_provider( $oembed->get_provider( 'https://wild.example/path/not-clip', array( 'discover' => false ) ) ),
\t\t\t'regex_match' => normalize_provider( $oembed->get_provider( 'https://regex.example/123', array( 'discover' => false ) ) ),
\t\t\t'regex_miss' => normalize_provider( $oembed->get_provider( 'https://regex.example/not-a-number', array( 'discover' => false ) ) ),
\t\t);
\t\tbreak;
\tcase 'oembed-registry:compat-parse-bridge':
\t\t$oembed = new WP_oEmbed();
\t\t$json = $oembed->_parse_json( ' { \"type\": \"rich\", \"html\": \"<b>Fixture</b>\" } ' );
\t\t$xml = $oembed->_parse_xml( '<oembed><type>photo</type><url>https://cdn.example/photo.jpg</url><width>640</width></oembed>' );
\t\t$xml_doctype = $oembed->_parse_xml_body( '<!DOCTYPE oembed><oembed><type>photo</type></oembed>' );
\t\t$result += array(
\t\t\t'json_type' => is_object( $json ) ? $json->type : false,
\t\t\t'json_html' => is_object( $json ) ? $json->html : false,
\t\t\t'xml_type' => is_object( $xml ) ? $xml->type : false,
\t\t\t'xml_url' => is_object( $xml ) ? $xml->url : false,
\t\t\t'xml_doctype_rejected' => false === $xml_doctype,
\t\t\t'unknown_method' => $oembed->not_a_compat_method( 'x' ),
\t\t);
\t\tbreak;
\tcase 'oembed-registry:strip-newlines':
\t\t$oembed = new WP_oEmbed();
\t\t$data = (object) array(
\t\t\t'type' => 'rich',
\t\t\t'html' => \"<div>Alpha\\n<span>Beta</span>\\r\\n<pre>Keep\\nPre</pre>\\nGamma</div>\",
\t\t);
\t\t$html = $oembed->data2html( $data, 'https://rich.example/post' );
\t\t$result += array(
\t\t\t'html' => $html,
\t\t\t'contains_outer_newline' => str_contains( str_replace( \"Keep\\nPre\", '', $html ), \"\\n\" ),
\t\t\t'pre_preserved' => str_contains( $html, \"<pre>Keep\\nPre</pre>\" ),
\t\t\t'registered_filters' => $GLOBALS['wphx_filters'],
\t\t);
\t\tbreak;
\tdefault:
\t\tfwrite( STDERR, 'Unknown case: ' . $case . PHP_EOL );
\t\texit( 2 );
}

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
`
  );
}

function observation(caseDef, root) {
  const raw = command("php", [`${root}/probe.php`, caseDef.id]);
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    assertions: {
      constructor_filter_registered:
        caseDef.id !== "oembed-registry:constructor-defaults" ||
        parsed.registered_filters.some((entry) => entry.hook === "oembed_dataparse" && entry.callback[1] === "_strip_newlines"),
      early_queue_reset:
        !Object.prototype.hasOwnProperty.call(parsed, "early_providers_after_construct") ||
        Object.keys(parsed.early_providers_after_construct).length === 0,
      provider_lookup_deterministic:
        caseDef.id !== "oembed-registry:early-add-remove-filter" ||
        (parsed.early_provider_match === "https://early.example/oembed" &&
          parsed.filtered_provider_match === "https://filtered.example/oembed.json" &&
          parsed.removed_youtube_match === false),
      compat_bridge_deterministic:
        caseDef.id !== "oembed-registry:compat-parse-bridge" ||
        (parsed.json_type === "rich" &&
          parsed.xml_type === "photo" &&
          parsed.xml_doctype_rejected === true &&
          parsed.unknown_method === false),
      newline_strip_deterministic:
        caseDef.id !== "oembed-registry:strip-newlines" ||
        (parsed.contains_outer_newline === false && parsed.pre_preserved === true)
    }
  };
}

function runRoot(root) {
  return Object.fromEntries(CASES.map((caseDef) => [caseDef.id, observation(caseDef, root)]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents)
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-oembed-provider-registry-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/oembed-provider-registry-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_oEmbed provider registry and compatibility behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-oembed.php in isolated PHP CLI probes with deterministic WordPress hook/escaping stubs. It observes built-in provider construction, early provider add/remove queues, oembed_providers filtering, provider regex/wildcard matching, __call compatibility access to private parse helpers, and oembed_dataparse newline stripping without claiming live remote fetch, discovery transport, REST controller behavior, installed routing, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-runtime-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded remote oEmbed fetch, REST oEmbed controller behavior, installed post embed routes, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-oembed-provider-registry-oracle-fixture",
        "npm run wp:core:wphx-312-oembed-provider-registry-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-29-oembed-provider-registry-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeProbe(ORACLE_ROOT);
  writeProbe(CANDIDATE_ROOT);

  const oracle = runRoot(ORACLE_ROOT);
  const candidate = runRoot(CANDIDATE_ROOT);
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
    schema: "wphx.wp-core-oembed-provider-registry-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      remote_oembed_fixture_manifest: inputRecord(REMOTE_OEMBED_FIXTURE),
      deprecated_oembed_fixture_manifest: inputRecord(DEPRECATED_OEMBED_FIXTURE),
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
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "WordPress hooks, URL helpers, escaping helpers, and home_url are deterministic stubs; copied class-wp-oembed.php remains the executed public class source."
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
      candidate_sha256: sha256(JSON.stringify(candidate))
    },
    remaining_gaps: [
      {
        id: "live-oembed-fetch-discovery-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture does not call wp_safe_remote_get or perform live/provider-recorded discovery. Remote fetch and discovery behavior remain covered only by bounded fake-transport fixtures until later live/recorded gates."
      },
      {
        id: "installed-oembed-routes-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes WP_oEmbed directly through PHP CLI probes. REST oEmbed controller dispatch, post embed rendering, and browser-observed installed routing remain later gates."
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
      live_oembed_fetch_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-29-oembed-provider-registry-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_oEmbed provider registry oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle WP_oEmbed provider registry boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-oembed-provider-registry-oracle-fixture",
      "npm run wp:core:wphx-312-oembed-provider-registry-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
      "receipt:wphx-312-28-deprecated-oembed-wrapper-oracle-fixture"
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
