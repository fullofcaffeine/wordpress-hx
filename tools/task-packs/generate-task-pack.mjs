#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const RECORDED_AT = process.env.WPHX_TASK_PACK_RECORDED_AT ?? "2026-06-20T03:16:00Z";

function usage() {
  console.error("Usage: npm run task-pack -- <WPHX-ref-or-issue-id> [--out path]");
  process.exit(2);
}

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function maybeRead(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseArgs(argv) {
  const args = [...argv];
  const issue = args.shift();
  if (!issue) usage();
  let out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      out = args[++i];
    } else {
      usage();
    }
  }
  return { issue, out };
}

function findIssue(key) {
  if (/^WPHX-\d+$/.test(key)) {
    const all = bd(["list", "--all", "--json", "--limit", "0"]);
    const hit = all.find((issue) => issue.external_ref === key);
    if (!hit) throw new Error(`No Beads issue found for ${key}`);
    return bd(["show", hit.id, "--json"])[0];
  }
  return bd(["show", key, "--json"])[0];
}

function receiptPathsFor(ref) {
  const manifest = readJson("manifests/dashboard/parity-dashboard.v1.json");
  const known = {
    "WPHX-006": ["receipts/inventory/wphx-006-inventory.v1.json"],
    "WPHX-007": ["receipts/inventory/wphx-007-schema-validation.v1.json"],
    "WPHX-008": [
      "receipts/oracle/wphx-008-php-baseline.v1.json",
      "receipts/oracle/wphx-008-db-baseline.v1.json",
      "receipts/oracle/wphx-008-browser-baseline.v1.json",
      "receipts/oracle/wphx-008-vanilla-oracle-summary.v1.json"
    ],
    "WPHX-009": ["receipts/dashboard/wphx-009-parity-dashboard.v1.json"],
    "WPHX-010": ["receipts/operations/wphx-010-beads-graph.v1.json"],
    "WPHX-012": ["receipts/operations/wphx-012-baseline-policy.v1.json"],
    "WPHX-013": ["receipts/operations/wphx-013-gutenberghx-protocol.v1.json"],
    "WPHX-803": ["receipts/operations/wphx-803-prd-seed.v1.json"]
  };
  if (ref === "WPHX-009") return [...known[ref], ...Object.values(manifest.indexes)];
  return known[ref] ?? [];
}

function pathSetFor(ref) {
  const known = {
    "WPHX-009": [
      "docs/operations/parity-dashboard.md",
      "tools/dashboard/build-dashboard.mjs",
      "tools/dashboard/parity-dashboard.mjs",
      "tools/dashboard/check-dashboard.mjs",
      "manifests/dashboard/parity-dashboard.v1.json"
    ],
    "WPHX-803": [
      "docs/operations/beads-seeding.md",
      "manifests/beads/prd-seed.v1.json",
      "tools/beads/export-seed-manifest.mjs",
      "tools/beads/seed-prd-issues.mjs"
    ]
  };
  return known[ref] ?? [];
}

const { issue: key, out } = parseArgs(process.argv.slice(2));
const issue = findIssue(key);
const ref = issue.external_ref;
const paths = pathSetFor(ref);
const receipts = receiptPathsFor(ref).filter(existsSync);
const packageJson = readJson("package.json");
const baselinePolicy = readJson("manifests/baseline-policy.v1.json");
const inventorySummary = readJson("manifests/inventory-summary.v1.json");
const dashboard = readJson("manifests/dashboard/parity-dashboard.v1.json");
const seed = readJson("manifests/beads/prd-seed.v1.json");

const files = paths.map((path) => {
  const content = maybeRead(path);
  return {
    path,
    sha256: content ? sha256(content) : null,
    bytes: content ? Buffer.byteLength(content) : null
  };
});

const receiptSummaries = receipts.map((path) => {
  const content = maybeRead(path);
  const json = content ? JSON.parse(content) : null;
  return {
    path,
    id: json?.id ?? null,
    issue: json?.issue?.external_ref ?? json?.issue ?? null,
    status: json?.status ?? json?.validation_result?.status ?? null,
    sha256: content ? sha256(content) : null
  };
});

const pack = {
  schema: "wphx.task-pack.v1",
  generated_at: RECORDED_AT,
  issue: {
    id: issue.id,
    external_ref: ref,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    issue_type: issue.issue_type,
    acceptance_criteria: issue.acceptance_criteria ?? null,
    notes: issue.notes ?? null
  },
  dependencies: (issue.dependencies ?? []).map((dep) => ({
    id: dep.id,
    external_ref: dep.external_ref,
    title: dep.title,
    status: dep.status,
    dependency_type: dep.dependency_type
  })),
  dependents: (issue.dependents ?? []).map((dep) => ({
    id: dep.id,
    external_ref: dep.external_ref,
    title: dep.title,
    status: dep.status,
    dependency_type: dep.dependency_type
  })),
  files,
  receipts: receiptSummaries,
  manifests: {
    baseline_policy_profiles: Object.keys(baselinePolicy.profiles),
    inventory_counts: inventorySummary.counts,
    dashboard_counts: dashboard.counts,
    seed_issue_count: seed.issues.length
  },
  useful_commands: [
    "npm run baseline:validate",
    "npm run beads:seed",
    "npm run dashboard:check",
    `npm run task-pack -- ${ref}`
  ],
  package_scripts: Object.keys(packageJson.scripts).sort()
};

const text = JSON.stringify(pack, null, 2) + "\n";
const output = out ?? join("build", "task-packs", `${ref}.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, text);
console.log(JSON.stringify({ status: "passed", issue: ref, output, sha256: sha256(text), bytes: Buffer.byteLength(text) }, null, 2));
