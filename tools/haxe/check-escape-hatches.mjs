#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const OUT = "manifests/haxe/wphx-211-escape-hatches.v1.json";
const RECEIPT = "receipts/haxe/wphx-211-escape-hatches.v1.json";
const RECORDED_AT = "2026-06-20T19:05:00.000Z";
const LOOKBACK_LINES = 6;

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 20
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function trackedHaxeFiles() {
  return command("git", ["ls-files", "*.hx", ":!build/*", ":!dist/*", ":!src-gen/*", ":!vendor/*"])
    .split("\n")
    .filter(Boolean)
    .sort();
}

function uncommentedLines(lines) {
  const result = [];
  let inBlock = false;
  for (const [index, line] of lines.entries()) {
    let code = line;
    if (inBlock) {
      const end = code.indexOf("*/");
      if (end === -1) {
        result.push("");
        continue;
      }
      code = code.slice(end + 2);
      inBlock = false;
    }

    while (code.includes("/*")) {
      const start = code.indexOf("/*");
      const end = code.indexOf("*/", start + 2);
      if (end === -1) {
        code = code.slice(0, start);
        inBlock = true;
        break;
      }
      code = `${code.slice(0, start)}${code.slice(end + 2)}`;
    }

    const trimmed = code.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      result.push("");
      continue;
    }

    const lineComment = code.indexOf("//");
    result.push(lineComment === -1 ? code : code.slice(0, lineComment));
  }
  return result;
}

function escapeKinds(code) {
  const kinds = [];
  if (/\bDynamic\b/.test(code)) kinds.push("Dynamic");
  if (/\buntyped\b/.test(code)) kinds.push("untyped");
  if (/php\.Syntax\.code/.test(code)) kinds.push("php.Syntax.code");
  if (/\bcast\b/.test(code)) kinds.push("cast");
  if (/\bAny\b/.test(code)) kinds.push("Any");
  return kinds;
}

function justificationFor(lines, index) {
  const start = Math.max(0, index - LOOKBACK_LINES);
  for (let current = index; current >= start; current--) {
    const line = lines[current] ?? "";
    if (line.includes("WPHX-211:")) {
      return line.trim().replace(/^[/\s*]+/, "").trim();
    }
  }
  return null;
}

function scanFile(path) {
  const lines = readFileSync(path, "utf8").split("\n");
  const codeLines = uncommentedLines(lines);
  const occurrences = [];
  const missing = [];

  for (const [index, code] of codeLines.entries()) {
    const kinds = escapeKinds(code);
    if (kinds.length === 0) continue;

    const justification = justificationFor(lines, index);
    const occurrence = {
      path,
      line: index + 1,
      kinds,
      source: lines[index].trim(),
      source_sha256: sha256(lines[index].trim()),
      justification
    };
    occurrences.push(occurrence);
    if (justification == null) {
      missing.push(occurrence);
    }
  }

  return { occurrences, missing };
}

const files = trackedHaxeFiles();
const scans = files.map(scanFile);
const occurrences = scans.flatMap((scan) => scan.occurrences);
const missing = scans.flatMap((scan) => scan.missing);

if (missing.length > 0) {
  console.error(JSON.stringify({ status: "failed", missing }, null, 2));
  process.exit(1);
}

const byKind = {};
for (const occurrence of occurrences) {
  for (const kind of occurrence.kinds) {
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
}

const manifest = {
  schema: "wphx.haxe-escape-hatch-audit.v1",
  issue: "WPHX-211",
  generated_at: RECORDED_AT,
  generator: "tools/haxe/check-escape-hatches.mjs",
  scanned_file_count: files.length,
  scanned_files: files,
  lookback_lines: LOOKBACK_LINES,
  occurrence_count: occurrences.length,
  occurrences,
  by_kind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
  validation_result: {
    status: "passed",
    all_escape_hatches_have_wphx_211_justification: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.haxe-escape-hatch-audit-receipt.v1",
  id: "receipt:wphx-211-escape-hatches",
  issue: "WPHX-211",
  recorded_at: RECORDED_AT,
  command: "npm run haxe:escape-hatches",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  scanned_file_count: files.length,
  occurrence_count: occurrences.length,
  by_kind: manifest.by_kind
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText]
  ]) {
    if (!existsSync(path)) {
      console.error(JSON.stringify({ status: "failed", error: `${path} does not exist` }, null, 2));
      process.exit(1);
    }
    if (readFileSync(path, "utf8") !== text) {
      console.error(JSON.stringify({ status: "failed", error: `${path} is stale` }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, occurrence_count: occurrences.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, occurrence_count: occurrences.length }, null, 2));
