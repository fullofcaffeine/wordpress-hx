#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "manifests", "dashboard");
const RECORDED_AT = process.env.WPHX_DASHBOARD_RECORDED_AT ?? "2026-06-20T03:00:00Z";

const FILES = {
  source: "manifests/source-inventory.jsonl",
  artifact: "manifests/artifact-provenance.jsonl",
  test: "manifests/test-inventory.jsonl",
  inventorySummary: "manifests/inventory-summary.v1.json",
  oracle: "manifests/oracle/vanilla-oracle-baseline.v1.json",
  baselinePolicy: "manifests/baseline-policy.v1.json"
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 200
  }).trim();
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

function writeJson(path, value, options = {}) {
  const indent = options.compact ? undefined : 2;
  writeFileSync(path, JSON.stringify(value, null, indent) + "\n");
}

function countBy(entries, fn) {
  const out = {};
  for (const entry of entries) {
    const value = fn(entry);
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function sourceBlob(entry) {
  if (entry.baseline === "wordpress-7.0.0" || entry.baseline === "gutenberg-forward-23.4.0") {
    const localPath = join(ROOT, entry.repo, entry.path);
    if (existsSync(localPath)) return readFileSync(localPath, "utf8");
  }
  try {
    return run("git", ["-C", entry.repo, "show", `${entry.commit}:${entry.path}`]);
  } catch {
    return "";
  }
}

function addApi(api, record) {
  const id = `${record.kind}:${record.name}:${record.baseline}:${record.path}`;
  if (api.ids.has(id)) return;
  api.ids.add(id);
  api.entries.push(record);
}

function extractPhpApis(sourceEntries) {
  const api = { ids: new Set(), entries: [] };
  const phpEntries = sourceEntries.filter((entry) => entry.baseline === "wordpress-7.0.0" && entry.language === "php" && entry.kind !== "test_source");
  for (const entry of phpEntries) {
    const content = sourceBlob(entry);
    if (!content) continue;
    const patterns = [
      { kind: "php_function", regex: /(?:^|\n)\s*function\s+&?\s*([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\s*\(/g },
      { kind: "php_class", regex: /(?:^|\n)\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g },
      { kind: "php_interface", regex: /(?:^|\n)\s*interface\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g },
      { kind: "php_trait", regex: /(?:^|\n)\s*trait\s+([A-Za-z_\x80-\xff][A-Za-z0-9_\x80-\xff]*)\b/g },
      { kind: "php_define", regex: /define\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g },
      { kind: "php_const", regex: /(?:^|\n)\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g }
    ];
    for (const { kind, regex } of patterns) {
      for (const match of content.matchAll(regex)) {
        addApi(api, {
          name: match[1],
          kind,
          baseline: entry.baseline,
          path: entry.path,
          sourceUnit: entry.id
        });
      }
    }
  }
  return api.entries.sort((a, b) => `${a.name}:${a.kind}:${a.path}`.localeCompare(`${b.name}:${b.kind}:${b.path}`));
}

function packageFromPath(path) {
  const parts = path.split("/");
  const index = parts.indexOf("packages");
  if (index === -1 || !parts[index + 1]) return null;
  return parts[index + 1];
}

function extractJsPackageApis(sourceEntries) {
  const api = { ids: new Set(), entries: [] };
  const entries = sourceEntries.filter((entry) => {
    if (entry.baseline !== "gutenberg-forward-23.4.0") return false;
    if (!["javascript", "typescript", "tsx", "jsx"].includes(entry.language)) return false;
    if (!entry.path.includes("/src/")) return false;
    return /(?:^|\/)(index|index\.native|store|actions|selectors|controls|reducer)\.(js|jsx|ts|tsx)$/.test(entry.path);
  });
  for (const entry of entries) {
    const pkg = packageFromPath(entry.path);
    if (!pkg) continue;
    const content = sourceBlob(entry);
    if (!content) continue;
    const patterns = [
      { kind: "js_export_function", regex: /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g },
      { kind: "js_export_class", regex: /export\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g },
      { kind: "js_export_const", regex: /export\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g }
    ];
    for (const { kind, regex } of patterns) {
      for (const match of content.matchAll(regex)) {
        addApi(api, {
          name: match[1],
          kind,
          package: pkg,
          baseline: entry.baseline,
          path: entry.path,
          sourceUnit: entry.id
        });
      }
    }
    for (const match of content.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const part of match[1].split(",")) {
        const cleaned = part.trim().split(/\s+as\s+/i).at(-1)?.trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cleaned ?? "")) {
          addApi(api, {
            name: cleaned,
            kind: "js_named_export",
            package: pkg,
            baseline: entry.baseline,
            path: entry.path,
            sourceUnit: entry.id
          });
        }
      }
    }
  }
  return api.entries.sort((a, b) => `${a.package}:${a.name}:${a.path}`.localeCompare(`${b.package}:${b.name}:${b.path}`));
}

function buildPackageIndex(sourceEntries, testEntries) {
  const packages = new Map();
  for (const entry of sourceEntries) {
    const pkg = packageFromPath(entry.path);
    if (!pkg) continue;
    const current = packages.get(pkg) ?? {
      name: pkg,
      display: `@wordpress/${pkg}`,
      baselines: {},
      source_units: 0,
      test_units: 0,
      languages: {}
    };
    current.source_units += 1;
    current.baselines[entry.baseline] = (current.baselines[entry.baseline] ?? 0) + 1;
    current.languages[entry.language] = (current.languages[entry.language] ?? 0) + 1;
    packages.set(pkg, current);
  }
  for (const entry of testEntries) {
    const pkg = packageFromPath(entry.path);
    if (!pkg || !packages.has(pkg)) continue;
    packages.get(pkg).test_units += 1;
  }
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildGateIndex(tasks) {
  const gateTasks = {
    G0: ["WPHX-001", "WPHX-002", "WPHX-003", "WPHX-004", "WPHX-005", "WPHX-006", "WPHX-007", "WPHX-008", "WPHX-010", "WPHX-012", "WPHX-013"],
    "php-feasibility": ["WPHX-100", "WPHX-101", "WPHX-102", "WPHX-103", "WPHX-104", "WPHX-105", "WPHX-106", "WPHX-107", "WPHX-108", "WPHX-109"],
    "genes-ts-browser": ["WPHX-400"],
    operations: ["WPHX-800", "WPHX-803", "WPHX-804", "WPHX-805", "WPHX-806", "WPHX-807"],
    parity: ["WPHX-700", "WPHX-009", "WPHX-011"]
  };
  const byRef = new Map(tasks.map((task) => [task.external_ref, task]));
  return Object.entries(gateTasks).map(([gate, refs]) => {
    const linked = refs.map((ref) => byRef.get(ref)).filter(Boolean);
    return {
      gate,
      tasks: linked.map((task) => ({
        id: task.id,
        external_ref: task.external_ref,
        title: task.title,
        status: task.status,
        priority: task.priority
      })),
      counts: countBy(linked, (task) => task.status)
    };
  });
}

mkdirSync(OUT, { recursive: true });

const source = readJsonl(FILES.source);
const artifact = readJsonl(FILES.artifact);
const test = readJsonl(FILES.test);
const tasks = JSON.parse(run("bd", ["list", "--all", "--json", "--limit", "0"]));
const inventorySummary = readJson(FILES.inventorySummary);
const oracle = readJson(FILES.oracle);
const baselinePolicy = readJson(FILES.baselinePolicy);
const phpApis = extractPhpApis(source);
const jsPackageApis = extractJsPackageApis(source);
const packages = buildPackageIndex(source, test);
const gates = buildGateIndex(tasks);

const dashboard = {
  schema: "wphx.parity-dashboard.v1",
  issue: "WPHX-009",
  generated_at: RECORDED_AT,
  inputs: FILES,
  capabilities: ["summary", "file", "api", "package", "task", "gate"],
  counts: {
    source_units: source.length,
    artifacts: artifact.length,
    tests: test.length,
    tasks: tasks.length,
    php_api_symbols: phpApis.length,
    js_package_api_symbols: jsPackageApis.length,
    packages: packages.length,
    gates: gates.length
  },
  baselines: {
    source: inventorySummary.counts.source_by_baseline,
    artifacts: inventorySummary.counts.artifact_by_baseline,
    oracle: oracle.baselines,
    profiles: Object.keys(baselinePolicy.profiles)
  },
  indexes: {
    api: "manifests/dashboard/api-index.v1.json",
    packages: "manifests/dashboard/package-index.v1.json",
    gates: "manifests/dashboard/gate-index.v1.json"
  }
};

writeJson(join(OUT, "api-index.v1.json"), {
  schema: "wphx.dashboard-api-index.v1",
  generated_at: RECORDED_AT,
  php: phpApis,
  javascript_packages: jsPackageApis
}, { compact: true });
writeJson(join(OUT, "package-index.v1.json"), {
  schema: "wphx.dashboard-package-index.v1",
  generated_at: RECORDED_AT,
  packages
}, { compact: true });
writeJson(join(OUT, "gate-index.v1.json"), {
  schema: "wphx.dashboard-gate-index.v1",
  generated_at: RECORDED_AT,
  gates
}, { compact: true });
writeJson(join(OUT, "parity-dashboard.v1.json"), dashboard);

console.log(JSON.stringify(dashboard, null, 2));
