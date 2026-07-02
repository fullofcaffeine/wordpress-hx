#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T22:00:00Z";
const ISSUE = {
  id: "wordpresshx-l76.18.43",
  external_ref: "WPHX-312.95",
  title: "Audit and retire remaining HTTP/feed/embed public PHP shell gaps"
};
const RUNNER = "tools/wp-core/run-wphx-312-public-shell-gap-audit.mjs";
const MANIFEST = "manifests/wp-core/wphx-312-95-public-shell-gap-audit.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-95-public-shell-gap-audit.v1.json";
const OWNERSHIP_DIR = "manifests/ownership";

const DURABLE_STATES = new Set(["compiler_emitted_original_path_shell", "durable_public_adapter", "whole_file_owned"]);
const COPIED_SURFACE_STATES = new Set(["oracle_mirror_behavior_fixture", "installed_style_package_gate_with_copied_oracle_php"]);
const PUBLIC_SHELL_DEBT_STATES = new Set([
  "haxe_parity_candidate",
  "haxe_candidate_with_public_php_shell",
  "haxe_owned_candidate_with_public_php_shell"
]);
const REQUEST_BRANCH_EXTERNAL_REFS = new Set([
  "WPHX-312.77",
  "WPHX-312.78",
  "WPHX-312.79",
  "WPHX-312.80",
  "WPHX-312.81",
  "WPHX-312.82",
  "WPHX-312.84",
  "WPHX-312.85",
  "WPHX-312.86",
  "WPHX-312.87",
  "WPHX-312.88",
  "WPHX-312.89",
  "WPHX-312.90"
]);
const FOLLOWUP_OWNERS = {
  wphx_backed_state_reconciliation: {
    issue_id: "wordpresshx-hh12",
    external_ref: "WPHX-312.98",
    title: "Reconcile WPHX-backed HTTP ownership states"
  },
  remaining_request_branch_shells: {
    issue_id: "wordpresshx-gvzp",
    external_ref: "WPHX-312.99",
    title: "Retire remaining WP_Http::request branch public shells"
  },
  copied_oracle_public_surfaces: {
    issue_id: "wordpresshx-i378",
    external_ref: "WPHX-312.100",
    title: "Plan generated public adapters for copied HTTP feed embed fixtures"
  }
};

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function fileRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sortedWphx312OwnershipPaths() {
  return readdirSync(OWNERSHIP_DIR)
    .filter((name) => name.startsWith("wphx-312-") && name.endsWith(".json"))
    .sort()
    .map((name) => join(OWNERSHIP_DIR, name));
}

function hasWphxPhpFixture(manifest) {
  return [...(manifest.owned_paths ?? []), ...(manifest.generated_paths ?? [])].some(
    (path) => path.includes("fixtures/wphx-php/") || path.includes("/wphx-php/") || path.includes("wphx-php-emission.v1.json")
  );
}

function classify(record) {
  const state = record.ownership_state;
  if (state === "inventory_only") return "inventory_only";
  if (record.external_ref === "WPHX-312.02") return "adapter_contract_only";
  if (DURABLE_STATES.has(state)) return "durable_generated_public_shell";
  if (hasWphxPhpFixture(record.manifest) && PUBLIC_SHELL_DEBT_STATES.has(state)) {
    return "wphx_backed_state_reconciliation";
  }
  if (REQUEST_BRANCH_EXTERNAL_REFS.has(record.external_ref)) return "remaining_request_branch_shell";
  if (COPIED_SURFACE_STATES.has(state)) return "copied_oracle_public_surface";
  if (state === "haxe_parity_candidate") return "adapter_contract_only";
  return "unclassified";
}

function followupForClassification(classification) {
  switch (classification) {
    case "wphx_backed_state_reconciliation":
      return FOLLOWUP_OWNERS.wphx_backed_state_reconciliation;
    case "remaining_request_branch_shell":
      return FOLLOWUP_OWNERS.remaining_request_branch_shells;
    case "copied_oracle_public_surface":
      return FOLLOWUP_OWNERS.copied_oracle_public_surfaces;
    default:
      return null;
  }
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function main() {
  const paths = sortedWphx312OwnershipPaths();
  const records = paths.map((path) => {
    const manifest = readJson(path);
    return {
      external_ref: manifest.issue?.external_ref ?? null,
      issue_id: manifest.issue?.id ?? null,
      ownership_manifest: path,
      ownership_manifest_sha256: sha256File(path),
      ownership_state: manifest.ownership_state,
      unit_kind: manifest.unit?.kind ?? null,
      unit_name: manifest.unit?.name ?? null,
      bridge_kind: manifest.bridge?.kind ?? null,
      removal_gate: manifest.bridge?.removal_gate ?? null,
      has_wphx_php_fixture: hasWphxPhpFixture(manifest),
      manifest
    };
  });

  const boundaries = records.map((record) => {
    const classification = classify(record);
    return {
      external_ref: record.external_ref,
      issue_id: record.issue_id,
      unit_name: record.unit_name,
      unit_kind: record.unit_kind,
      ownership_state: record.ownership_state,
      shell_gap_classification: classification,
      has_wphx_php_fixture: record.has_wphx_php_fixture,
      bridge_kind: record.bridge_kind,
      followup_owner: followupForClassification(classification),
      ownership_manifest: record.ownership_manifest,
      ownership_manifest_sha256: record.ownership_manifest_sha256,
      removal_gate: record.removal_gate
    };
  });

  const byClassification = Object.fromEntries(
    [...new Set(boundaries.map((boundary) => boundary.shell_gap_classification))]
      .sort()
      .map((classification) => [classification, boundaries.filter((boundary) => boundary.shell_gap_classification === classification).length])
  );
  const failures = [];
  const unclassified = boundaries.filter((boundary) => boundary.shell_gap_classification === "unclassified");
  const unownedDebt = boundaries.filter(
    (boundary) =>
      ["wphx_backed_state_reconciliation", "remaining_request_branch_shell", "copied_oracle_public_surface"].includes(
        boundary.shell_gap_classification
      ) && boundary.followup_owner === null
  );

  if (boundaries.length < 89) failures.push(`expected at least 89 WPHX-312 ownership manifests, found ${boundaries.length}`);
  if (unclassified.length > 0) failures.push(`unclassified boundaries: ${unclassified.map((boundary) => boundary.external_ref).join(", ")}`);
  if (unownedDebt.length > 0) failures.push(`shell debt without follow-up owner: ${unownedDebt.map((boundary) => boundary.external_ref).join(", ")}`);
  if ((byClassification.durable_generated_public_shell ?? 0) < 12) failures.push("expected at least 12 durable generated public shell boundaries");
  if ((byClassification.wphx_backed_state_reconciliation ?? 0) < 16) {
    failures.push("expected at least 16 WPHX-backed boundaries needing ownership-state reconciliation");
  }
  if ((byClassification.remaining_request_branch_shell ?? 0) !== REQUEST_BRANCH_EXTERNAL_REFS.size) {
    failures.push(`expected ${REQUEST_BRANCH_EXTERNAL_REFS.size} remaining request branch shell gaps`);
  }
  if ((byClassification.copied_oracle_public_surface ?? 0) < 46) {
    failures.push("expected at least 46 copied-oracle public surface gaps");
  }

  const validationResult = {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    boundary_count: boundaries.length,
    classification_counts: byClassification,
    unclassified_count: unclassified.length,
    shell_debt_without_followup_count: unownedDebt.length,
    all_non_durable_public_shell_debt_linked_to_followup: unownedDebt.length === 0 && unclassified.length === 0,
    durable_generated_public_shell_count: byClassification.durable_generated_public_shell ?? 0,
    wphx_backed_state_reconciliation_count: byClassification.wphx_backed_state_reconciliation ?? 0,
    remaining_request_branch_shell_count: byClassification.remaining_request_branch_shell ?? 0,
    copied_oracle_public_surface_count: byClassification.copied_oracle_public_surface ?? 0
  };

  if (failures.length > 0) {
    throw new Error(`WPHX-312 public shell gap audit failed:\n${failures.join("\n")}`);
  }

  const manifest = {
    schema: "wphx.wp-core-public-shell-gap-audit.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "public_php_shell_gap_audit",
    artifact_scope: "wphx_312_http_cron_mail_feed_embed_public_php_boundaries",
    ownership_inputs: paths.map(fileRecord),
    followup_owners: FOLLOWUP_OWNERS,
    summary: {
      boundary_count: boundaries.length,
      classification_counts: byClassification,
      durable_generated_public_shell_count: validationResult.durable_generated_public_shell_count,
      wphx_backed_state_reconciliation_count: validationResult.wphx_backed_state_reconciliation_count,
      remaining_request_branch_shell_count: validationResult.remaining_request_branch_shell_count,
      copied_oracle_public_surface_count: validationResult.copied_oracle_public_surface_count
    },
    boundaries,
    decision: {
      status: "passed",
      public_shell_debt_audited: true,
      bounded_retirements_already_evidenced: [
        "Existing WPHX PHP fixtures and receipts cover the first HTTP object/helper class adapters, grouped WP_Http helpers, transport selection, and selected WP_Http::request branches.",
        "Those boundaries remain bounded generated shell claims, not whole-file WP_Http, live transport, installed distribution, or broad feed/embed ownership claims."
      ],
      required_next_actions: [
        "WPHX-312.98 reconciles stale ownership-state wording for WPHX-backed HTTP candidates.",
        "WPHX-312.99 retires remaining WP_Http::request branch public shells or files minimized compiler-pressure blockers.",
        "WPHX-312.100 groups copied oracle feed/embed/cron/mail public surfaces into generated-adapter, preserved-vendor, installed-route, live-transport, or upstream-PHPUnit gates."
      ]
    },
    validation_result: validationResult,
    non_claims: [
      "This audit does not itself promote copied oracle fixtures to durable public PHP ownership.",
      "This audit does not claim full WP_Http::request, whole-file WP_Http, live HTTP transport, real cron/mail transport, installed feed/embed/widget/privacy routing, or upstream PHPUnit parity.",
      "This audit does not claim mature arbitrary-Haxe PHP backend scope beyond the existing WPHX PHP adoption gate."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.wp-core-receipt.v1",
    id: "receipt:wphx-312-95-public-shell-gap-audit",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "public_php_shell_gap_audit",
    artifact_scope: "wphx_312_http_cron_mail_feed_embed_public_php_boundaries",
    commands: [
      "npm run wp:core:wphx-312-public-shell-gap-audit",
      "npm run wp:core:wphx-312-public-shell-gap-audit:check"
    ],
    artifacts: [
      {
        path: RUNNER,
        role: "deterministic WPHX-312 public PHP shell gap audit runner"
      },
      {
        path: MANIFEST,
        role: "machine-readable WPHX-312 public PHP shell gap audit"
      },
      {
        path: "docs/operations/progress-matrix.md",
        role: "program matrix updated with WPHX-312 public shell debt split"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: validationResult,
    claims: [
      "Every WPHX-312 ownership manifest is classified for public PHP shell ownership state.",
      "Non-durable public shell debt is linked to explicit follow-up owners.",
      "Existing WPHX PHP-backed HTTP candidates are distinguished from remaining copied shell gaps."
    ],
    non_claims: manifest.non_claims
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: MANIFEST,
        receipt: RECEIPT,
        boundary_count: boundaries.length,
        classification_counts: byClassification
      },
      null,
      2
    )
  );
}

main();
