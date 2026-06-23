#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.13",
  external_ref: "WPHX-306",
  title: "Users, roles, capabilities, auth, cookies, nonces"
};
const RECORDED_AT = "2026-06-23T20:50:00.000Z";
const HXML = "fixtures/wp-core/auth-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-306-02";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const SURFACE = "manifests/wp-core/wphx-306-01-user-auth-surface.v1.json";
const OUT = "manifests/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/auth/AuthAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/AuthAdapterContractCandidateEntry.hx"
];

const EXPECTED = {
  semantic_owner: "haxe",
  adapter_contract_owner: "haxe_typed",
  emission_strategy: "stock_haxe_php_private_impl",
  execution_provider: "haxe_php",
  compatibility_evidence: "targeted_semantic_parity",
  "cap:edit_post": "meta_capability",
  "cap:manage_options": "primitive_capability",
  "cap:manage_network": "super_admin_sensitive",
  "cap:empty": "unknown_capability",
  "map-meta:edit_post": "true",
  "map-meta:manage_options": "false",
  "nonce:current": "current_tick",
  "nonce:previous": "previous_tick",
  "nonce:invalid": "invalid",
  "password:wp": "wordpress_bcrypt",
  "password:bcrypt": "bcrypt",
  "password:phpass": "phpass",
  "password:unknown": "unknown",
  "cookie:auth": "auth",
  "cookie:secure-auth": "secure_auth",
  "cookie:logged-in": "logged_in",
  "app-password:attempt": "attempt",
  "app-password:skip-missing-user": "skip",
  "app-password:skip-missing-credentials": "skip"
};

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

function filesUnder(root) {
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      if (entry.isFile()) {
        const data = readFileSync(child);
        files.push({
          path: relative(root, child),
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex")
        });
      }
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
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
    if (separator < 0) throw new Error(`Unexpected output line: ${line}`);
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
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
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-306-auth-adapter-contract-candidate`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/auth-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "users/auth capability, nonce, cookie, password-family, and application-password routing decisions",
      area: "wp-includes/capabilities.php wp-includes/pluggable.php wp-includes/user.php wp-includes/class-wp-user.php",
      public_contract:
        "Haxe owns the first typed auth adapter-contract decision model. Public PHP ABI replacement, password hashing, cookie signing, and installed authentication parity are not claimed in this slice."
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
        "Move these contracts into typed Adapter IR/original-path generation and pass auth/capability/cookie/nonce oracle fixtures before claiming public PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat(["tools/wp-core/run-user-auth-adapter-contract-candidate.mjs", OUT, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-306-auth-adapter-contract-candidate",
        "npm run wp:core:wphx-306-auth-adapter-contract-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-306-02-auth-adapter-contract-candidate"],
      manifest_digest: manifestSha
    },
    notes:
      "This is a PHP-hosted Haxe candidate. It adds no native provider and no handwritten production PHP shell."
  };
}

const lock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);

const generatedFiles = filesUnder(HAXE_OUT);
const output = command("php", [ENTRY]);
const observations = parseOutput(output);
const matchesExpected = JSON.stringify(observations) === JSON.stringify(EXPECTED);
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) =>
    !audit.contains_dynamic &&
    !audit.contains_untyped &&
    !audit.contains_cast &&
    !audit.contains_php_syntax_code &&
    !audit.contains_raw_javascript
);

if (!matchesExpected || !sourceEscapeAuditPassed) {
  console.error(JSON.stringify({ status: "failed", matchesExpected, observations, haxeSourceAudits }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-auth-adapter-contract-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-user-auth-adapter-contract-candidate.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord)
  },
  fixture: {
    candidate_kind: "haxe_auth_adapter_contract_candidate",
    promoted_contracts: [
      "capability kind classification for meta-cap mapping",
      "nonce verification tick route",
      "password hash family route",
      "auth/logged-in cookie scheme route",
      "application-password authentication route"
    ],
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_provider_claimed: false,
      removal_gate:
        "Install through typed Adapter IR/original-path generation and run differential auth fixtures before claiming public PHP ABI ownership."
    },
    source_escape_audits: haxeSourceAudits
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"])
  },
  build: {
    generated_haxe_files: generatedFiles,
    php_lint: generatedPhpLintRecords(generatedFiles)
  },
  run: {
    command: `php ${ENTRY}`,
    raw_output_sha256: sha256(output),
    observations,
    matches_expected: matchesExpected
  },
  remaining_gaps: [
    {
      id: "public-php-adapter-not-yet-generated",
      owner: "WPHX-306",
      detail:
        "The candidate has not replaced wp-includes/capabilities.php, wp-includes/pluggable.php, wp-includes/user.php, WP_User, WP_Roles, WP_Role, or WP_User_Query public PHP bodies."
    },
    {
      id: "security-fixtures-not-yet-installed",
      owner: "WPHX-306",
      detail:
        "Password hashing/checking, auth-cookie signing/validation, nonce salt/time behavior, and application-password authentication still require separate oracle fixtures."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_auth_adapter_contract_candidate",
    promoted_contracts: 5,
    runtime_runs: 1,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-306-02-auth-adapter-contract-candidate",
  issue: { ...ISSUE, title: "Promote first auth pure helpers to Haxe parity candidates" },
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "auth Haxe semantic/adapter-contract candidate manifest" },
    { path: OWNERSHIP, role: "ADR-004-aware ownership manifest for auth Haxe candidate" },
    { path: "src/wphx/wp/auth/AuthAdapterContract.hx", role: "typed Haxe auth semantic and adapter-contract model" },
    { path: "tools/wp-core/run-user-auth-adapter-contract-candidate.mjs", role: "candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-306-auth-adapter-contract-candidate",
    "npm run wp:core:wphx-306-auth-adapter-contract-candidate:check",
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

console.log(JSON.stringify({ status: "passed", output: OUT, ownership: OWNERSHIP, receipt: RECEIPT }, null, 2));
