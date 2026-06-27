#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-1te",
  external_ref: "WPHX-312.28",
  title: "WPHX-312.28 - Add deprecated oEmbed wrapper oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-deprecated-oembed-wrapper-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-28";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-28-deprecated-oembed-wrapper-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-28-deprecated-oembed-wrapper-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-28-deprecated-oembed-wrapper-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const FEED_EMBED_FIXTURE = "manifests/wp-core/wphx-312-04-feed-embed-https-oracle-fixture.v1.json";
const REMOTE_OEMBED_FIXTURE = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const DEPRECATED_WRAPPER_FIXTURE = "manifests/wp-core/wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-oembed.php"];
const COVERED_SYMBOLS = [
  "class-oembed.php",
  "_deprecated_file",
  "basename(__FILE__)",
  "ABSPATH",
  "WPINC",
  "require_once",
  "class-wp-oembed.php handoff",
  "WP_oEmbed"
];
const CASES = [
  { id: "deprecated-oembed:single-include", focus: "include wrapper once and record one deprecation plus one class handoff" },
  { id: "deprecated-oembed:double-include", focus: "include wrapper twice and observe require_once idempotency for class-wp-oembed.php" },
  { id: "deprecated-oembed:require-once-wrapper", focus: "require_once wrapper twice and observe wrapper-level idempotency" }
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

function writeBoundaryStub(root) {
  mkdirSync(`${root}/wp-includes`, { recursive: true });
  writeFileSync(
    `${root}/wp-includes/class-wp-oembed.php`,
    `<?php
$key = 'wp-includes/class-wp-oembed.php';
$count = ( $GLOBALS['wphx_required_counts'][ $key ] ?? 0 ) + 1;
$GLOBALS['wphx_required_counts'][ $key ] = $count;
$GLOBALS['wphx_required_files'][] = array(
\t'file'  => $key,
\t'count' => $count,
);

if ( ! class_exists( 'WP_oEmbed', false ) ) {
\tclass WP_oEmbed {
\t\tpublic static $fixture_loaded = true;
\t}
}
`
  );
}

function writeProbe(root) {
  writeFileSync(
    `${root}/probe.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$case = $argv[1] ?? '';

$GLOBALS['wphx_deprecated']      = array();
$GLOBALS['wphx_required_files']  = array();
$GLOBALS['wphx_required_counts'] = array();

define( 'ABSPATH', __DIR__ . '/' );
define( 'WPINC', 'wp-includes' );

function _deprecated_file( $file, $version, $replacement = '' ) {
\t$GLOBALS['wphx_deprecated'][] = array(
\t\t'file'        => $file,
\t\t'version'     => $version,
\t\t'replacement' => $replacement,
\t);
}

$wrapper = __DIR__ . '/wp-includes/class-oembed.php';

switch ( $case ) {
\tcase 'deprecated-oembed:single-include':
\t\tinclude $wrapper;
\t\tbreak;
\tcase 'deprecated-oembed:double-include':
\t\tinclude $wrapper;
\t\tinclude $wrapper;
\t\tbreak;
\tcase 'deprecated-oembed:require-once-wrapper':
\t\trequire_once $wrapper;
\t\trequire_once $wrapper;
\t\tbreak;
\tdefault:
\t\tfwrite( STDERR, 'Unknown case: ' . $case . PHP_EOL );
\t\texit( 2 );
}

echo json_encode(
\tarray(
\t\t'case'                 => $case,
\t\t'deprecated'           => $GLOBALS['wphx_deprecated'],
\t\t'required_files'        => $GLOBALS['wphx_required_files'],
\t\t'required_counts'       => $GLOBALS['wphx_required_counts'],
\t\t'class_exists'          => class_exists( 'WP_oEmbed', false ),
\t\t'class_fixture_loaded'  => class_exists( 'WP_oEmbed', false ) ? WP_oEmbed::$fixture_loaded : false,
\t\t'constants'             => array(
\t\t\t'ABSPATH' => 'fixture-root/',
\t\t\t'WPINC'   => WPINC,
\t\t),
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . PHP_EOL;
`
  );
}

function expectedCounts(caseId) {
  if (caseId === "deprecated-oembed:double-include") return { deprecated: 2, required: 1 };
  return { deprecated: 1, required: 1 };
}

function observation(caseDef, root) {
  const raw = command("php", [`${root}/probe.php`, caseDef.id]);
  const parsed = JSON.parse(raw);
  const counts = expectedCounts(caseDef.id);
  return {
    ...parsed,
    deprecated_count: parsed.deprecated.length,
    required_file_count: parsed.required_files.length,
    has_expected_deprecated_file: parsed.deprecated.every(
      (entry) =>
        entry.file === "class-oembed.php" &&
        entry.version === "5.3.0" &&
        entry.replacement === "wp-includes/class-wp-oembed.php"
    ),
    has_expected_required_file:
      parsed.required_files.length === counts.required &&
      parsed.required_files.every((entry) => entry.file === "wp-includes/class-wp-oembed.php"),
    class_handoff_idempotent: parsed.required_counts["wp-includes/class-wp-oembed.php"] === 1,
    wrapper_deprecation_count_matches: parsed.deprecated.length === counts.deprecated
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-deprecated-oembed-wrapper-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/deprecated-oembed-wrapper-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Deprecated oEmbed wrapper handoff behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-oembed.php in isolated PHP CLI probes with a deterministic class-wp-oembed.php required-file stub. It observes deprecation metadata, basename(__FILE__) handoff, ABSPATH/WPINC require_once resolution, WP_oEmbed class handoff, and include/require_once idempotency without claiming WP_oEmbed provider internals or installed oEmbed routes."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-required-file-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass real WP_oEmbed provider internals, REST oEmbed controller behavior, installed oEmbed routes, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-deprecated-oembed-wrapper-oracle-fixture",
        "npm run wp:core:wphx-312-deprecated-oembed-wrapper-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-28-deprecated-oembed-wrapper-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeBoundaryStub(ORACLE_ROOT);
  writeBoundaryStub(CANDIDATE_ROOT);
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
    schema: "wphx.wp-core-deprecated-oembed-wrapper-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      feed_embed_fixture_manifest: inputRecord(FEED_EMBED_FIXTURE),
      remote_oembed_fixture_manifest: inputRecord(REMOTE_OEMBED_FIXTURE),
      deprecated_wrapper_fixture_manifest: inputRecord(DEPRECATED_WRAPPER_FIXTURE),
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
        required_file_stubs:
          "class-wp-oembed.php is a deterministic stub; copied class-oembed.php remains the executed public deprecated wrapper."
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
        id: "real-wp-oembed-provider-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture stubs class-wp-oembed.php. Full WP_oEmbed provider registration, discovery, cache, data2html, and fetch behavior remain separate WPHX-312 gates."
      },
      {
        id: "installed-oembed-routes-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes the deprecated wrapper directly through PHP CLI probes. Installed REST oEmbed controller behavior, post embed rendering, and browser-observed routing remain later gates."
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
      real_wp_oembed_provider_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-28-deprecated-oembed-wrapper-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "deprecated oEmbed wrapper oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle deprecated oEmbed wrapper boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-deprecated-oembed-wrapper-oracle-fixture",
      "npm run wp:core:wphx-312-deprecated-oembed-wrapper-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-04-feed-embed-https-oracle-fixture",
      "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
      "receipt:wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture"
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
