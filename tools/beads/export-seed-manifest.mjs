#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "manifests/beads/prd-seed.v1.json";

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }));
}

function refNumber(ref) {
  const match = /^WPHX-(\d+)$/.exec(ref ?? "");
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

const list = bd(["list", "--all", "--json", "--limit", "0"]);
const byId = new Map(list.map((issue) => [issue.id, issue]));
const records = [];

for (const issue of list.sort((a, b) => refNumber(a.external_ref) - refNumber(b.external_ref))) {
  const [full] = bd(["show", issue.id, "--json"]);
  const dependencies = full.dependencies ?? [];
  const parent = full.parent ? byId.get(full.parent)?.external_ref ?? null : null;
  const blocks = dependencies
    .filter((dep) => dep.dependency_type === "blocks")
    .map((dep) => dep.external_ref)
    .filter(Boolean)
    .sort((a, b) => refNumber(a) - refNumber(b));
  records.push({
    external_ref: full.external_ref,
    title: full.title,
    issue_type: full.issue_type,
    priority: full.priority,
    parent,
    blocks,
    description: full.description ?? null,
    acceptance_criteria: full.acceptance_criteria ?? null
  });
}

const manifest = {
  schema: "wphx.beads-prd-seed.v1",
  generated_at: "2026-06-20T03:08:00Z",
  source: "Current Beads graph after WPHX-013 baseline/bootstrap decisions",
  key: "external_ref",
  issues: records
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: "passed", output: OUT, issues: records.length }, null, 2));
