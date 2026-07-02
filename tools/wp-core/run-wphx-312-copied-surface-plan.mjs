#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T23:45:00Z";
const ISSUE = {
  id: "wordpresshx-i378",
  external_ref: "WPHX-312.100",
  title: "Plan generated public adapters for copied HTTP feed embed fixtures"
};
const RUNNER = "tools/wp-core/run-wphx-312-copied-surface-plan.mjs";
const AUDIT = "manifests/wp-core/wphx-312-95-public-shell-gap-audit.v1.json";
const OUT = "manifests/wp-core/wphx-312-100-copied-surface-plan.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-100-copied-surface-plan.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-100-copied-surface-plan.v1.json";

const OWNER_ISSUES = {
  generated_adapter: {
    issue_id: "wordpresshx-l76.18.45",
    external_ref: "WPHX-312.101",
    title: "Generate adapters for copied HTTP feed embed public surfaces"
  },
  preserved_vendor: {
    issue_id: "wordpresshx-l76.26",
    external_ref: "WPHX-323",
    title: "PHP vendor manifest closure"
  },
  installed_route: {
    issue_id: "wordpresshx-l76.18.41",
    external_ref: "WPHX-312.94",
    title: "Expand installed feed, embed, widget, and privacy routes"
  },
  live_transport: {
    issue_id: "wordpresshx-l76.18.40",
    external_ref: "WPHX-312.92",
    title: "Add live or recorded HTTP transport parity gate"
  },
  cron_mail_transport: {
    issue_id: "wordpresshx-l76.18.39",
    external_ref: "WPHX-312.93",
    title: "Add real cron and mail transport installed gate"
  },
  upstream_phpunit: {
    issue_id: "wordpresshx-l76.18.42",
    external_ref: "WPHX-312.97",
    title: "Unblock HTTP/cron/mail/feed/embed upstream PHPUnit ratchet"
  }
};

const PRIMARY_GATE_REFS = {
  generated_adapter: ["WPHX-312.04", "WPHX-312.38", "WPHX-312.39", "WPHX-312.40", "WPHX-312.41", "WPHX-312.42", "WPHX-312.44"],
  preserved_vendor: ["WPHX-312.05", "WPHX-312.13", "WPHX-312.22", "WPHX-312.23", "WPHX-312.24", "WPHX-312.37"],
  installed_route: [
    "WPHX-312.06",
    "WPHX-312.07",
    "WPHX-312.09",
    "WPHX-312.11",
    "WPHX-312.14",
    "WPHX-312.15",
    "WPHX-312.16",
    "WPHX-312.17",
    "WPHX-312.18",
    "WPHX-312.19",
    "WPHX-312.20",
    "WPHX-312.21",
    "WPHX-312.25",
    "WPHX-312.26",
    "WPHX-312.27",
    "WPHX-312.28",
    "WPHX-312.29",
    "WPHX-312.30",
    "WPHX-312.31"
  ],
  live_transport: [
    "WPHX-312.03",
    "WPHX-312.08",
    "WPHX-312.12",
    "WPHX-312.32",
    "WPHX-312.33",
    "WPHX-312.34",
    "WPHX-312.35",
    "WPHX-312.36",
    "WPHX-312.43",
    "WPHX-312.45",
    "WPHX-312.46",
    "WPHX-312.47",
    "WPHX-312.48",
    "WPHX-312.49"
  ]
};

const GROUP_DEFINITIONS = {
  generated_adapter: {
    gate_kind: "generated_adapter",
    owner_issue: OWNER_ISSUES.generated_adapter,
    removal_gate:
      "Replace the copied public PHP surface with a WPHX PHP compiler-emitted original-path adapter or file a minimized compiler-pressure blocker; keep the existing oracle fixture green and keep public-shell snapshots/adoption CI green.",
    non_claims: [
      "Planning a generated adapter does not claim installed WordPress behavior.",
      "Planning a generated adapter does not claim live network, cron, mail, feed, or oEmbed side effects.",
      "Copied oracle fixtures remain behavior evidence until the generated adapter gate passes."
    ]
  },
  preserved_vendor: {
    gate_kind: "preserved_vendor",
    owner_issue: OWNER_ISSUES.preserved_vendor,
    removal_gate:
      "Classify the surface under the PHP vendor manifest as preserved upstream/vendor code, approved exception, or separate generated WordPress wrapper before claiming durable ownership.",
    non_claims: [
      "Preserved-vendor routing does not claim Haxe ownership of third-party library internals.",
      "WordPress wrapper behavior still needs separate generated-adapter or installed-route evidence where applicable."
    ]
  },
  installed_route: {
    gate_kind: "installed_route",
    owner_issue: OWNER_ISSUES.installed_route,
    removal_gate:
      "Exercise representative installed feed, embed, RSS widget/block, trackback, and privacy/admin routes against vanilla and candidate packages, then record covered versus deferred public behavior.",
    non_claims: [
      "Installed-route routing does not claim generated PHP replacement by itself.",
      "Installed-route routing does not claim upstream PHPUnit pass/pass parity."
    ]
  },
  live_transport: {
    gate_kind: "live_transport",
    owner_issue: OWNER_ISSUES.live_transport,
    removal_gate:
      "Add live or recorded HTTP transport parity for representative requests, redirects, headers/cookies, proxy/TLS options, streaming, response-size, and Requests bridge paths before claiming transport behavior.",
    non_claims: [
      "Live-transport routing does not claim whole-file WP_Http ownership.",
      "Live-transport routing does not claim cron or mail delivery side effects."
    ]
  },
  cron_mail_transport: {
    gate_kind: "live_transport",
    owner_issue: OWNER_ISSUES.cron_mail_transport,
    removal_gate:
      "Add controlled installed-style cron loopback/dispatch and wp_mail/PHPMailer transport observations before claiming real cron or mail side effects.",
    non_claims: [
      "Cron/mail transport routing does not claim general HTTP transport parity.",
      "Cron/mail transport routing does not claim generated PHP replacement by itself."
    ]
  },
  upstream_phpunit: {
    gate_kind: "upstream_phpunit",
    owner_issue: OWNER_ISSUES.upstream_phpunit,
    removal_gate:
      "Provision non-blocked WPHX-312 upstream PHPUnit ratchet inputs and record pass/pass or known deltas for HTTP, feed/SimplePie, oEmbed/embed, HTTPS, and privacy request groups.",
    non_claims: [
      "Upstream PHPUnit routing does not replace focused oracle fixtures.",
      "Blocked PHPUnit input provisioning is not pass/pass parity."
    ]
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

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function primaryGateFor(ref) {
  const matches = Object.entries(PRIMARY_GATE_REFS)
    .filter(([, refs]) => refs.includes(ref))
    .map(([gate]) => gate);
  if (matches.length !== 1) {
    throw new Error(`${ref} must have exactly one primary copied-surface gate, found ${matches.length}`);
  }
  return matches[0];
}

function secondaryGates(primaryGate, ref) {
  const gates = ["upstream_phpunit"];
  if (primaryGate !== "generated_adapter" && !["WPHX-312.09"].includes(ref)) gates.unshift("generated_adapter");
  if (["WPHX-312.03", "WPHX-312.07", "WPHX-312.12", "WPHX-312.13"].includes(ref)) gates.unshift("cron_mail_transport");
  if (["WPHX-312.06", "WPHX-312.07", "WPHX-312.09", "WPHX-312.11"].includes(ref)) gates.unshift("installed_route");
  if (["WPHX-312.08", "WPHX-312.32", "WPHX-312.33", "WPHX-312.34", "WPHX-312.35", "WPHX-312.36"].includes(ref)) {
    gates.unshift("live_transport");
  }
  return [...new Set(gates)].filter((gate) => gate !== primaryGate);
}

function main() {
  const audit = readJson(AUDIT);
  const copied = audit.boundaries.filter((boundary) => boundary.shell_gap_classification === "copied_oracle_public_surface");
  const copiedRefs = copied.map((boundary) => boundary.external_ref).sort();
  const primaryRefs = Object.values(PRIMARY_GATE_REFS).flat().sort();
  const missing = copiedRefs.filter((ref) => !primaryRefs.includes(ref));
  const extra = primaryRefs.filter((ref) => !copiedRefs.includes(ref));
  const duplicatePrimaryRefs = primaryRefs.filter((ref, index) => primaryRefs.indexOf(ref) !== index);
  const failures = [];

  if (copied.length !== 46) failures.push(`expected 46 copied-oracle public surfaces, found ${copied.length}`);
  if (missing.length > 0) failures.push(`copied surfaces missing primary gate: ${missing.join(", ")}`);
  if (extra.length > 0) failures.push(`primary gate refs not in copied audit surfaces: ${extra.join(", ")}`);
  if (duplicatePrimaryRefs.length > 0) failures.push(`duplicate primary gate refs: ${[...new Set(duplicatePrimaryRefs)].join(", ")}`);

  const boundaryPlan = copied.map((boundary) => {
    const primaryGate = primaryGateFor(boundary.external_ref);
    const secondary = secondaryGates(primaryGate, boundary.external_ref);
    return {
      external_ref: boundary.external_ref,
      issue_id: boundary.issue_id,
      unit_name: boundary.unit_name,
      unit_kind: boundary.unit_kind,
      ownership_manifest: boundary.ownership_manifest,
      ownership_manifest_sha256: boundary.ownership_manifest_sha256,
      current_ownership_state: boundary.ownership_state,
      current_bridge_kind: boundary.bridge_kind,
      primary_gate: {
        id: primaryGate,
        gate_kind: GROUP_DEFINITIONS[primaryGate].gate_kind,
        owner_issue: GROUP_DEFINITIONS[primaryGate].owner_issue,
        removal_gate: GROUP_DEFINITIONS[primaryGate].removal_gate
      },
      secondary_gates: secondary.map((gate) => ({
        id: gate,
        gate_kind: GROUP_DEFINITIONS[gate].gate_kind,
        owner_issue: GROUP_DEFINITIONS[gate].owner_issue,
        removal_gate: GROUP_DEFINITIONS[gate].removal_gate
      })),
      non_claims: [
        "This copied oracle surface remains behavior evidence, not durable generated public PHP ownership.",
        "Do not broaden to installed behavior, live transport, upstream PHPUnit pass/pass parity, or preserved-vendor ownership unless the named gate passes."
      ]
    };
  });

  const groups = Object.entries(GROUP_DEFINITIONS).map(([id, definition]) => ({
    id,
    ...definition,
    primary_boundary_refs: boundaryPlan.filter((entry) => entry.primary_gate.id === id).map((entry) => entry.external_ref).sort(),
    secondary_boundary_refs: boundaryPlan
      .filter((entry) => entry.secondary_gates.some((gate) => gate.id === id))
      .map((entry) => entry.external_ref)
      .sort()
  }));

  const emptyPrimaryGroups = groups.filter((group) => group.primary_boundary_refs.length === 0 && group.secondary_boundary_refs.length === 0);
  if (emptyPrimaryGroups.length > 0) failures.push(`empty copied-surface groups: ${emptyPrimaryGroups.map((group) => group.id).join(", ")}`);

  const validationResult = {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    copied_surface_count: copied.length,
    primary_gate_counts: Object.fromEntries(groups.map((group) => [group.id, group.primary_boundary_refs.length])),
    all_copied_surfaces_have_primary_gate: missing.length === 0 && duplicatePrimaryRefs.length === 0,
    all_groups_have_owner_issue: groups.every((group) => Boolean(group.owner_issue?.issue_id && group.owner_issue?.external_ref))
  };

  if (failures.length > 0) {
    throw new Error(`WPHX-312 copied-surface plan failed:\n${failures.join("\n")}`);
  }

  const manifest = {
    schema: "wphx.wp-core-copied-surface-plan.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "copied_public_surface_followup_plan",
    artifact_scope: "wphx_312_http_cron_mail_feed_embed_copied_public_surfaces",
    inputs: {
      public_shell_gap_audit: fileRecord(AUDIT)
    },
    owner_issues: OWNER_ISSUES,
    summary: {
      copied_surface_count: copied.length,
      gate_count: groups.length,
      primary_gate_counts: validationResult.primary_gate_counts,
      generated_adapter_owner: OWNER_ISSUES.generated_adapter,
      remaining_domain_closure_blocker_after_plan: null
    },
    groups,
    boundary_plan: boundaryPlan.sort((a, b) => a.external_ref.localeCompare(b.external_ref)),
    validation_result: validationResult,
    decision: {
      status: "passed",
      close_wphx_312_100: true,
      copied_surface_debt_planned: true,
      notes: [
        "The plan routes copied public surfaces to explicit owner gates instead of treating copied oracle fixtures as durable public PHP ownership.",
        "WPHX-312.96 may use this plan as closure evidence while preserving non-claims and linking later generated-adapter, vendor, installed-route, live-transport, cron/mail, and upstream-PHPUnit work."
      ]
    },
    non_claims: [
      "This plan does not itself replace copied public PHP with generated adapters.",
      "This plan does not claim installed WordPress behavior, live HTTP transport, real cron/mail transport, upstream PHPUnit pass/pass parity, whole-file WP_Http ownership, or full feed/embed/widget/privacy routing.",
      "This plan does not classify third-party vendor internals as Haxe-owned runtime logic."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const ownership = {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wphx-312-copied-surface-plan",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "design_receipt",
      name: "WPHX-312 copied public surface follow-up plan",
      area: "HTTP, cron, mail, feeds, embeds, RSS widgets, SimplePie/Magpie wrappers, oEmbed, and HTTP wrapper copied oracle public surfaces",
      public_contract:
        "This plan owns classification and follow-up routing only. Copied oracle fixtures remain evidence until the named generated-adapter, preserved-vendor, installed-route, live-transport, cron/mail, or upstream-PHPUnit gates pass."
    },
    ownership_state: "design_plan",
    bridge: {
      exists: true,
      kind: "copied-public-surface-followup-plan",
      removal_gate:
        "Close or supersede the owner issue for each copied-surface group before claiming durable generated public PHP, preserved-vendor, installed-route, live-transport, cron/mail, or upstream-PHPUnit closure for that group."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-copied-surface-plan",
        "npm run wp:core:wphx-312-copied-surface-plan:check",
        "npm run wp:core:wphx-312-public-shell-gap-audit:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-100-copied-surface-plan"],
      manifest_digest: sha256(manifestText)
    }
  };

  const receipt = {
    schema: "wphx.wp-core-receipt.v1",
    id: "receipt:wphx-312-100-copied-surface-plan",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "copied_public_surface_followup_plan",
    artifact_scope: "wphx_312_http_cron_mail_feed_embed_copied_public_surfaces",
    commands: [
      "npm run wp:core:wphx-312-copied-surface-plan",
      "npm run wp:core:wphx-312-copied-surface-plan:check",
      "npm run wp:core:wphx-312-public-shell-gap-audit:check"
    ],
    artifacts: [
      {
        path: OUT,
        role: "machine-readable copied public surface follow-up plan"
      },
      {
        path: OWNERSHIP,
        role: "ownership manifest for the design plan"
      },
      {
        path: RUNNER,
        role: "deterministic copied public surface plan generator"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: validationResult,
    claims: [
      "All 46 WPHX-312 copied-oracle public surfaces have a primary follow-up gate.",
      "Each copied-surface gate has an owner issue, removal gate, and non-claims.",
      "The copied public surface plan distinguishes generated adapters from preserved-vendor, installed-route, live-transport, cron/mail, and upstream-PHPUnit gates."
    ],
    non_claims: manifest.non_claims
  };

  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, JSON.stringify(ownership, null, 2) + "\n");
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        copied_surface_count: copied.length,
        primary_gate_counts: validationResult.primary_gate_counts
      },
      null,
      2
    )
  );
}

main();
