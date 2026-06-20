#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILES = ["manifests/php-abi/wordpress-7.0-core-abi.v1.json", "receipts/php-abi/wphx-201-php-abi-extractor.v1.json"];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const before = Object.fromEntries(FILES.map((path) => [path, sha256(path)]));

execFileSync("node", ["tools/php-abi/extract-wordpress-abi.mjs"], {
  stdio: ["ignore", "pipe", "inherit"],
  maxBuffer: 1024 * 1024 * 100
});

const after = Object.fromEntries(FILES.map((path) => [path, sha256(path)]));
const changed = FILES.filter((path) => before[path] !== after[path]);

if (changed.length > 0) {
  console.error(JSON.stringify({ status: "failed", changed }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checked: FILES }, null, 2));
