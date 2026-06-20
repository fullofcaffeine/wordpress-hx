#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILES = [
  "manifests/source-inventory.jsonl",
  "manifests/artifact-provenance.jsonl",
  "manifests/test-inventory.jsonl",
  "manifests/inventory-summary.v1.json",
  "receipts/inventory/wphx-006-inventory.v1.json"
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const before = Object.fromEntries(FILES.map((path) => [path, sha256(path)]));

execFileSync("node", ["tools/inventory/wphx-inventory.mjs"], {
  stdio: ["ignore", "pipe", "inherit"],
  maxBuffer: 1024 * 1024 * 10
});

const after = Object.fromEntries(FILES.map((path) => [path, sha256(path)]));
const changed = FILES.filter((path) => before[path] !== after[path]);

if (changed.length > 0) {
  console.error(JSON.stringify({ status: "failed", changed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checked: FILES }, null, 2));
