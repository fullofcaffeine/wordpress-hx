#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.11.6",
  external_ref: "WPHX-317.07",
  title: "Promote first multisite pure helpers to Haxe parity candidates"
};
const HXML = "fixtures/wp-core/multisite-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-317-07";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const OUT = "manifests/wp-core/wphx-317-07-multisite-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-317-07-multisite-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-317-07-multisite-adapter-contract-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-317-01-multisite-network-surface.v1.json";
const OPTIONS_TRANSIENTS = "manifests/wp-core/wphx-317-02-multisite-options-transients-fixture.v1.json";
const BLOG_SWITCH_CACHE = "manifests/wp-core/wphx-317-03-multisite-blog-switch-cache-fixture.v1.json";
const SITE_NETWORK_QUERY = "manifests/wp-core/wphx-317-04-site-network-query-fixture.v1.json";
const RECORDED_AT = "2026-06-23T00:36:17.000Z";

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/multisite/MultisiteAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/MultisiteAdapterContractCandidateEntry.hx"
];

const EXPECTED = {
  semantic_owner: "haxe",
  adapter_contract_owner: "haxe_typed",
  emission_strategy: "stock_haxe_php_private_impl",
  execution_provider: "haxe_php",
  compatibility_evidence: "targeted_semantic_parity",
  "cookie:plain-www": "alt.example.test",
  "cookie:url-www": "alt.example.test",
  "cookie:preserve-existing": "cookies.example.test",
  "site-get:id": "site_blog_id_int",
  "site-get:network_id": "site_network_id_int",
  "site-get:blogname-before-ms": "null",
  "site-get:blogname-after-ms": "site_details_value",
  "site-get:custom-present": "site_details_value",
  "site-get:custom-missing": "null",
  "site-isset:id": "true",
  "site-isset:home-before-ms": "isset_false",
  "site-isset:home-after-ms": "isset_details_true",
  "site-isset:custom-missing": "isset_details_lookup",
  "site-set:id": "blog_id",
  "site-set:network_id": "site_id",
  "site-set:custom": "dynamic_property",
  "network-get:id": "network_id_int",
  "network-get:blog_id": "network_blog_id_string",
  "network-get:site_id": "network_site_id_int",
  "network-get:missing": "null",
  "network-isset:blog_id": "true",
  "network-isset:missing": "false",
  "network-set:id": "id",
  "network-set:site_id": "blog_id",
  "network-set:custom": "dynamic_property",
  "order:empty": "DESC",
  "order:asc-lower": "ASC",
  "order:desc": "DESC",
  "order:garbage": "DESC"
};

const PROMOTED_CONTRACTS = [
  "WP_Network::_set_cookie_domain decision",
  "WP_Site::__get magic route decision",
  "WP_Site::__isset magic route decision",
  "WP_Site::__set target decision",
  "WP_Network::__get magic route decision",
  "WP_Network::__isset magic route decision",
  "WP_Network::__set target decision",
  "WP_Site_Query::parse_order decision",
  "WP_Network_Query::parse_order decision"
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch {
    return null;
  }
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

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source),
    contains_raw_javascript: /\bjs\.Syntax\b/.test(source)
  };
}

function parseOutput(output) {
  const result = {};
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf("=");
    if (separator < 0) {
      throw new Error(`Unexpected output line: ${line}`);
    }
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function runEntry(commandPath, runtimeId) {
  const output = command(commandPath, [ENTRY]);
  const observations = parseOutput(output);
  return {
    id: runtimeId,
    runtime: runtimeId,
    command: `${commandPath} ${ENTRY}`,
    raw_output_sha256: sha256(output),
    observations,
    matches_expected: JSON.stringify(observations) === JSON.stringify(EXPECTED)
  };
}

function runDockerEntry(runtimeId, image) {
  const dockerEntry = `/work/${ENTRY}`;
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", dockerEntry]);
  const observations = parseOutput(output);
  return {
    id: runtimeId,
    runtime: runtimeId,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${dockerEntry}`,
    image,
    raw_output_sha256: sha256(output),
    observations,
    matches_expected: JSON.stringify(observations) === JSON.stringify(EXPECTED)
  };
}

function generatedPhpLintRecords(paths) {
  return paths
    .filter((record) => record.path.endsWith(".php"))
    .map((record) => ({
      path: `${HAXE_OUT}/${record.path}`,
      relative_path: record.path,
      sha256: `sha256:${record.sha256}`,
      php_lint: command("php", ["-l", `${HAXE_OUT}/${record.path}`])
    }));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-317-multisite-adapter-contract-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/multisite-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "multisite pure semantic and adapter-contract decisions",
      area: "wp-includes/class-wp-site.php wp-includes/class-wp-network.php wp-includes/class-wp-site-query.php wp-includes/class-wp-network-query.php",
      public_contract:
        "Haxe owns the first typed multisite decision model for magic property routing, cookie-domain derivation, and query order parsing. Public PHP ABI replacement is not claimed in this slice."
    },
    ownership_state: "haxe_parity_candidate",
    ownership_axes: {
      semantic_owner: "haxe",
      adapter_contract_owner: "haxe_typed",
      emission_strategy: "stock_haxe_php_private_impl",
      execution_provider: "haxe_php",
      compatibility_evidence: "targeted_semantic_parity"
    },
    bridge: {
      exists: true,
      kind: "adapter-contract-candidate-without-public-php-installation",
      removal_gate:
        "Move the typed contract into the Adapter IR/original-path emitter before claiming public WP_Site/WP_Network/WP_*_Query PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat(["tools/wp-core/run-multisite-adapter-contract-candidate.mjs", OUT, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-317-multisite-adapter-contract-candidate",
        "npm run wp:core:wphx-317-multisite-adapter-contract-candidate:check",
        "npm run wp:core:wphx-317-multisite-options-transients:check",
        "npm run wp:core:wphx-317-blog-switch-cache:check",
        "npm run wp:core:wphx-317-site-network-query:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-317-07-multisite-adapter-contract-candidate",
        "receipt:wphx-317-02-multisite-options-transients-fixture",
        "receipt:wphx-317-03-multisite-blog-switch-cache-fixture",
        "receipt:wphx-317-04-site-network-query-fixture"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "ADR-004 applies: this is not a Rust/native provider and not a public PHP shell replacement. It is the first Haxe-owned multisite semantic/adapter-contract model, bounded by existing WPHX-317 oracle fixtures."
  };
}

const lock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);

const generatedFiles = filesUnder(HAXE_OUT);
const localRun = runEntry("php", "local-php-cli");
const runs = [localRun];
const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const dockerImages = [
  ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
  ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
];
const skippedRuntimes = [];

if (dockerVersion) {
  for (const [runtimeId, image] of dockerImages) {
    runs.push(runDockerEntry(runtimeId, image));
  }
} else {
  for (const [runtimeId, image] of dockerImages) {
    skippedRuntimes.push({ id: runtimeId, image, reason: "docker server unavailable" });
  }
}

const failedRuns = runs.filter((run) => !run.matches_expected);
if (failedRuns.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedRuns }, null, 2));
  process.exit(1);
}

const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) =>
    !audit.contains_dynamic &&
    !audit.contains_untyped &&
    !audit.contains_cast &&
    !audit.contains_php_syntax_code &&
    !audit.contains_raw_javascript
);

const lintRecords = generatedPhpLintRecords(generatedFiles);
const manifest = {
  schema: "wphx.wp-core-multisite-adapter-contract-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-multisite-adapter-contract-candidate.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    oracle_fixture_manifests: [OPTIONS_TRANSIENTS, BLOG_SWITCH_CACHE, SITE_NETWORK_QUERY].map(inputRecord),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord)
  },
  fixture: {
    candidate_kind: "haxe_multisite_adapter_contract_candidate",
    promoted_contracts: PROMOTED_CONTRACTS,
    hxml: HXML,
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_provider_claimed: false,
      rust_core_claimed: false,
      removal_gate:
        "Install this contract through typed Adapter IR/original-path generation before claiming public PHP ABI ownership for the affected classes."
    },
    native_boundaries: [
      {
        id: "no-native-provider",
        reason: "ADR-004 makes Rust/native optional future providers only. This slice stays in Haxe-generated PHP and crosses no native boundary."
      },
      {
        id: "public-php-abi-not-installed",
        reason:
          "Existing WPHX-317 PHP fixtures remain the oracle for plugin-visible behavior. This candidate proves the typed Haxe decision model first, without adding durable hand-written PHP shells."
      }
    ],
    source_escape_audits: haxeSourceAudits
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    generated_haxe_files: generatedFiles,
    php_lint: lintRecords
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      executable: lock.tools.php_cli.executable
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs,
  remaining_gaps: [
    {
      id: "public-php-adapter-not-yet-generated",
      owner: "WPHX-317",
      detail:
        "The candidate has not replaced WP_Site, WP_Network, WP_Site_Query, or WP_Network_Query public PHP bodies. Adapter IR/original-path generation remains required before public ABI ownership can be claimed."
    },
    {
      id: "source-transform-bridge-not-used-here",
      owner: "WPHX-317",
      detail:
        "This slice avoids adding new handwritten public PHP shell bodies. Existing upstream PHP fixtures remain oracle evidence, not installed candidate implementation."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: sourceEscapeAuditPassed ? "passed" : "failed",
    candidate_kind: "haxe_multisite_adapter_contract_candidate",
    promoted_contracts: PROMOTED_CONTRACTS.length,
    runtime_runs: runs.length,
    skipped_runtimes: skippedRuntimes.length,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    public_php_replacement_claimed: false
  }
};

if (!sourceEscapeAuditPassed) {
  console.error(JSON.stringify({ status: "failed", haxeSourceAudits }, null, 2));
  process.exit(1);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-317-07-multisite-adapter-contract-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "multisite Haxe semantic/adapter-contract candidate manifest"
    },
    {
      path: OWNERSHIP,
      role: "ADR-004-aware ownership manifest for multisite Haxe candidate"
    },
    {
      path: "src/wphx/wp/multisite/MultisiteAdapterContract.hx",
      role: "typed Haxe multisite semantic and adapter-contract model"
    },
    {
      path: "tools/wp-core/run-multisite-adapter-contract-candidate.mjs",
      role: "candidate generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-317-multisite-adapter-contract-candidate",
    "npm run wp:core:wphx-317-multisite-adapter-contract-candidate:check",
    "npm run wp:core:wphx-317-multisite-options-transients:check",
    "npm run wp:core:wphx-317-blog-switch-cache:check",
    "npm run wp:core:wphx-317-site-network-query:check",
    "npm run haxe:escape-hatches:check",
    "npm run receipts:validate"
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
      promoted_contracts: PROMOTED_CONTRACTS.length,
      runtime_runs: runs.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
