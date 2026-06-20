#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function usage() {
  console.error("Usage: npm run dashboard -- <summary|file|api|package|task|gate> [query]");
  process.exit(2);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8" }));
}

function emit(value) {
  console.log(JSON.stringify(value, null, 2));
}

function includes(value, query) {
  return String(value ?? "").toLowerCase().includes(query.toLowerCase());
}

const [mode, ...rest] = process.argv.slice(2);
const query = rest.join(" ");
if (!mode) usage();

const dashboard = readJson("manifests/dashboard/parity-dashboard.v1.json");

if (mode === "summary") {
  emit({ status: "ok", dashboard });
} else if (mode === "file") {
  if (!query) usage();
  const source = readJsonl("manifests/source-inventory.jsonl").filter((entry) => includes(entry.path, query));
  const artifact = readJsonl("manifests/artifact-provenance.jsonl").filter((entry) => includes(entry.path, query));
  const test = readJsonl("manifests/test-inventory.jsonl").filter((entry) => includes(entry.path, query));
  emit({ status: "ok", query, counts: { source: source.length, artifact: artifact.length, test: test.length }, source: source.slice(0, 20), artifact: artifact.slice(0, 20), test: test.slice(0, 20) });
} else if (mode === "api") {
  if (!query) usage();
  const index = readJson("manifests/dashboard/api-index.v1.json");
  const php = index.php.filter((entry) => includes(entry.name, query));
  const javascript_packages = index.javascript_packages.filter((entry) => includes(entry.name, query));
  emit({ status: "ok", query, counts: { php: php.length, javascript_packages: javascript_packages.length }, php: php.slice(0, 40), javascript_packages: javascript_packages.slice(0, 40) });
} else if (mode === "package") {
  if (!query) usage();
  const packages = readJson("manifests/dashboard/package-index.v1.json").packages.filter((entry) => includes(entry.name, query) || includes(entry.display, query));
  emit({ status: "ok", query, count: packages.length, packages: packages.slice(0, 40) });
} else if (mode === "task") {
  if (!query) usage();
  const tasks = bd(["list", "--all", "--json", "--limit", "0"]).filter((task) => includes(task.external_ref, query) || includes(task.id, query) || includes(task.title, query));
  emit({ status: "ok", query, count: tasks.length, tasks: tasks.slice(0, 20) });
} else if (mode === "gate") {
  if (!query) usage();
  const gates = readJson("manifests/dashboard/gate-index.v1.json").gates.filter((entry) => includes(entry.gate, query));
  emit({ status: "ok", query, count: gates.length, gates });
} else {
  usage();
}
