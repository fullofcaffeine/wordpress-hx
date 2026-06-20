#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const MANIFEST = "manifests/receipts/evidence-links.v1.json";

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function receiptRef(receipt) {
  if (typeof receipt.issue === "string") return receipt.issue;
  return receipt.issue?.external_ref ?? null;
}

const errors = [];
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (manifest.schema !== "wphx.evidence-links.v1") {
  errors.push(`Unexpected schema in ${MANIFEST}`);
}

const closedTasks = bd(["list", "--all", "--json", "--limit", "0"]).filter((issue) => issue.status === "closed" && issue.issue_type === "task");
const entries = new Map((manifest.entries ?? []).map((entry) => [entry.external_ref, entry]));

for (const issue of closedTasks) {
  const entry = entries.get(issue.external_ref);
  if (!entry) {
    errors.push(`${issue.external_ref} is closed but has no evidence-link entry`);
    continue;
  }
  if (!entry.receipts?.length) {
    errors.push(`${issue.external_ref} evidence-link entry has no receipts`);
  }
}

for (const entry of manifest.entries ?? []) {
  for (const receiptLink of entry.receipts ?? []) {
    if (!existsSync(receiptLink.path)) {
      errors.push(`${entry.external_ref} missing receipt ${receiptLink.path}`);
      continue;
    }
    const currentSha = sha256(receiptLink.path);
    if (currentSha !== receiptLink.sha256) {
      errors.push(`${entry.external_ref} stale receipt digest for ${receiptLink.path}`);
    }
    const receipt = JSON.parse(readFileSync(receiptLink.path, "utf8"));
    const ref = receiptRef(receipt);
    if (ref !== entry.external_ref) {
      errors.push(`${receiptLink.path} points to ${ref}, expected ${entry.external_ref}`);
    }
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      closed_task_count: closedTasks.length,
      linked_task_count: manifest.entries.length
    },
    null,
    2
  )
);
