#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const OUT = "manifests/receipts/evidence-links.v1.json";
const RECORDED_AT = "2026-06-20T03:22:00Z";

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }));
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return path.endsWith(".json") ? [path] : [];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function receiptRef(receipt) {
  if (typeof receipt.issue === "string") return receipt.issue;
  return receipt.issue?.external_ref ?? null;
}

const closedTasks = bd(["list", "--all", "--json", "--limit", "0"])
  .filter((issue) => issue.status === "closed" && issue.issue_type === "task")
  .map((issue) => issue.external_ref)
  .sort();

const byRef = new Map();
for (const path of walk("receipts")) {
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  const ref = receiptRef(receipt);
  if (!ref) continue;
  const entry = byRef.get(ref) ?? { external_ref: ref, receipts: [] };
  entry.receipts.push({
    path,
    sha256: sha256(path),
    id: receipt.id ?? null
  });
  byRef.set(ref, entry);
}

const entries = [...byRef.values()]
  .filter((entry) => closedTasks.includes(entry.external_ref))
  .sort((a, b) => a.external_ref.localeCompare(b.external_ref))
  .map((entry) => ({
    ...entry,
    receipts: entry.receipts.sort((a, b) => a.path.localeCompare(b.path))
  }));

const manifest = {
  schema: "wphx.evidence-links.v1",
  generated_at: RECORDED_AT,
  closed_task_count: closedTasks.length,
  entries
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ status: "passed", output: OUT, closed_task_count: closedTasks.length, linked_task_count: entries.length }, null, 2));
