#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const ROOT = process.cwd();
const OUT = join(ROOT, "manifests");
const RECORDED_AT = process.env.WPHX_INVENTORY_RECORDED_AT ?? "2026-06-20T02:16:00.000Z";

const SOURCES = [
  {
    baseline: "wordpress-7.0.0",
    repo: "../wordpress-develop",
    commit: "26b68024931348d267b70e2a29910e1320d0094f",
    tree: "f3ad96f2357d2309f64a8d42a5808be502639c70"
  },
  {
    baseline: "wordpress-7.0-gutenberg-source",
    repo: "../gutenberg",
    commit: "a2a354cf35e5b69c3330d6c1cfd42d8dc2efb9fd",
    tree: "8bd91d6b490d79ef991d388409705b5cd06fdc94"
  },
  {
    baseline: "gutenberg-forward-23.4.0",
    repo: "../gutenberg",
    commit: "98a796c8780c480ef7bcfe03c42302d9564d785c",
    tree: "ca453617695fda86c57c4a731475f4ae1c5aad9f"
  }
];

const ARTIFACTS = [
  {
    baseline: "wordpress-7.0.0-distribution",
    kind: "zip",
    path: "/tmp/wordpresshx-upstream/wordpress-7.0.zip",
    digest: "sha256:b2b6827eb7b2b51f4610893e1a6ad02466e76fe0a307bd40ca2a8ba821c40d0b",
    stripPrefix: "wordpress/"
  },
  {
    baseline: "wordpress-7.0-gutenberg-build",
    kind: "tar.gz",
    path: "/tmp/wordpresshx-upstream/gutenberg-core-a2a354cf35e5.tar.gz",
    digest: "sha256:4670ed1cdc0f2a1b799ce41815b16f37bd60314e22af293fb4981a321c530764",
    stripPrefix: "./"
  }
];

const EXECUTABLE_EXTENSIONS = new Set([
  ".php",
  ".inc",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".wasm"
]);

const EXECUTABLE_NAMES = new Set([
  ".eslintrc.js",
  ".prettierrc.js",
  ".stylelintrc.js",
  "commitlint.config.js",
  "eslint.config.js",
  "Makefile",
  "Gruntfile.js",
  "gulpfile.js",
  "webpack.config.js",
  "babel.config.js",
  "jest.config.js",
  "playwright.config.js",
  "playwright.config.ts",
  "phpunit.xml",
  "phpunit.xml.dist"
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 200
  });
}

function gitLsTree(repo, commit) {
  const raw = run("git", ["-C", repo, "ls-tree", "-rz", "--full-tree", commit]);
  return raw
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const meta = entry.slice(0, tab).split(" ");
      return {
        mode: meta[0],
        type: meta[1],
        gitObject: meta[2],
        path: entry.slice(tab + 1)
      };
    })
    .filter((entry) => entry.type === "blob")
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeArtifactPath(path, stripPrefix) {
  if (stripPrefix && path.startsWith(stripPrefix)) {
    return path.slice(stripPrefix.length);
  }
  return path.replace(/^\.\//, "");
}

function extensionOf(path) {
  return extname(path).toLowerCase();
}

function languageOf(path) {
  const ext = extensionOf(path);
  if (ext === ".php" || ext === ".inc") return "php";
  if (ext === ".ts") return "typescript";
  if (ext === ".tsx") return "tsx";
  if (ext === ".jsx") return "jsx";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return "javascript";
  if (ext === ".sh" || ext === ".bash" || ext === ".zsh") return "shell";
  if (ext === ".ps1") return "powershell";
  if (ext === ".wasm") return "wasm";
  if (basename(path).startsWith("Makefile")) return "make";
  if (basename(path).startsWith("phpunit.xml")) return "phpunit-config";
  return "unknown";
}

function isExecutablePath(path) {
  return EXECUTABLE_EXTENSIONS.has(extensionOf(path)) || EXECUTABLE_NAMES.has(basename(path));
}

function isTestPath(path) {
  const p = path.toLowerCase();
  return (
    p.includes("/test/") ||
    p.includes("/tests/") ||
    p.includes("/__tests__/") ||
    p.includes("/spec/") ||
    p.includes("/fixtures/") ||
    p.includes("phpunit") ||
    p.includes("playwright.config") ||
    p.endsWith(".test.js") ||
    p.endsWith(".test.ts") ||
    p.endsWith(".test.tsx") ||
    p.endsWith(".spec.js") ||
    p.endsWith(".spec.ts") ||
    p.endsWith(".spec.tsx")
  );
}

function isVendorPath(path) {
  const p = path.toLowerCase();
  return (
    p.includes("/vendor/") ||
    p.includes("/vendors/") ||
    p.includes("/node_modules/") ||
    p.startsWith("src/wp-includes/requests/") ||
    p.startsWith("src/wp-includes/sodium_compat/") ||
    p.startsWith("src/wp-includes/phpmailer/") ||
    p.startsWith("src/wp-includes/simplepie/") ||
    p.startsWith("src/wp-includes/ixr/") ||
    p.startsWith("src/wp-includes/id3/") ||
    p.startsWith("src/wp-includes/random_compat/") ||
    p.startsWith("src/wp-includes/text/")
  );
}

function isBuildToolingPath(path) {
  const p = path.toLowerCase();
  const name = basename(path);
  return (
    p.startsWith("tools/") ||
    p.startsWith("bin/") ||
    p.startsWith("scripts/") ||
    p.startsWith(".github/") ||
    p.includes("/bin/") ||
    p.includes("/scripts/") ||
    EXECUTABLE_NAMES.has(name) ||
    name.endsWith(".config.js") ||
    name.endsWith(".config.cjs") ||
    name.endsWith(".config.mjs") ||
    name.endsWith(".config.ts")
  );
}

function sourceKind(path) {
  if (isTestPath(path)) return "test_source";
  if (isVendorPath(path)) return "vendor_source";
  if (isBuildToolingPath(path)) return "build_tooling_source";
  return "runtime_source";
}

function areaOf(path) {
  if (path.startsWith("src/wp-admin/") || path.startsWith("wp-admin/")) return "admin";
  if (path.startsWith("src/wp-includes/") || path.startsWith("wp-includes/")) return "core";
  if (path.startsWith("src/wp-content/themes/") || path.startsWith("wp-content/themes/")) return "themes";
  if (path.startsWith("src/wp-content/plugins/") || path.startsWith("wp-content/plugins/")) return "plugins";
  if (path.startsWith("packages/")) return "gutenberg-packages";
  if (path.startsWith("lib/")) return "gutenberg-lib";
  if (path.startsWith("build/")) return "gutenberg-build";
  if (isTestPath(path)) return "tests";
  if (isBuildToolingPath(path)) return "tooling";
  if (isVendorPath(path)) return "vendor";
  return path.split("/")[0] || "root";
}

function testFramework(path, language) {
  const p = path.toLowerCase();
  if (p.includes("phpunit")) return "phpunit";
  if (p.includes("playwright") || p.includes("/e2e/")) return "playwright";
  if (p.includes("qunit")) return "qunit";
  if (p.includes("jest") || p.endsWith(".test.js") || p.endsWith(".test.ts") || p.endsWith(".test.tsx")) return "jest";
  if (language === "php") return "php-test";
  if (language === "javascript" || language === "typescript" || language === "tsx" || language === "jsx") return "js-test";
  return "test";
}

function inventorySourceEntries() {
  const sourceEntries = [];
  const testEntries = [];

  for (const source of SOURCES) {
    for (const file of gitLsTree(source.repo, source.commit)) {
      if (!isExecutablePath(file.path)) continue;
      const language = languageOf(file.path);
      const kind = sourceKind(file.path);
      const record = {
        schema: "wphx.source-unit.v1alpha",
        id: `source:${source.baseline}:${file.path}`,
        baseline: source.baseline,
        repo: source.repo,
        commit: source.commit,
        tree: source.tree,
        path: file.path,
        language,
        area: areaOf(file.path),
        kind,
        gitObject: file.gitObject,
        mode: file.mode,
        status: "upstream_oracle_unported",
        haxeOwners: [],
        generatedArtifacts: [],
        taskExternalRef: null,
        classified: true,
        exceptions: []
      };
      sourceEntries.push(record);

      if (isTestPath(file.path)) {
        testEntries.push({
          schema: "wphx.test-unit.v1alpha",
          id: `test:${source.baseline}:${file.path}`,
          baseline: source.baseline,
          repo: source.repo,
          commit: source.commit,
          path: file.path,
          language,
          framework: testFramework(file.path, language),
          sourceUnit: record.id,
          classified: true
        });
      }
    }
  }

  return { sourceEntries, testEntries };
}

function artifactList(artifact) {
  if (artifact.kind === "zip") {
    return run("unzip", ["-Z1", artifact.path])
      .split("\n")
      .filter(Boolean);
  }
  if (artifact.kind === "tar.gz") {
    return run("tar", ["-tzf", artifact.path])
      .split("\n")
      .filter(Boolean);
  }
  throw new Error(`Unsupported artifact kind: ${artifact.kind}`);
}

function inventoryArtifactEntries() {
  const entries = [];
  for (const artifact of ARTIFACTS) {
    for (const rawPath of artifactList(artifact)) {
      const path = normalizeArtifactPath(rawPath, artifact.stripPrefix);
      if (!path || path.endsWith("/") || !isExecutablePath(path)) continue;
      const language = languageOf(path);
      entries.push({
        schema: "wphx.artifact-provenance.v1alpha",
        id: `artifact:${artifact.baseline}:${path}`,
        baseline: artifact.baseline,
        artifact: artifact.path,
        artifactKind: artifact.kind,
        artifactDigest: artifact.digest,
        rawPath,
        path,
        language,
        area: areaOf(path),
        kind: "shipped_executable_artifact",
        origin: "upstream_oracle",
        migrationStatus: "pending_haxe_generation_or_approved_exception",
        classified: true,
        exceptions: []
      });
    }
  }
  return entries.sort((a, b) => `${a.baseline}:${a.path}`.localeCompare(`${b.baseline}:${b.path}`));
}

function countBy(entries, key) {
  return entries.reduce((counts, entry) => {
    const value = entry[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function writeJsonl(path, entries) {
  writeFileSync(path, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

mkdirSync(OUT, { recursive: true });

const { sourceEntries, testEntries } = inventorySourceEntries();
const artifactEntries = inventoryArtifactEntries();

sourceEntries.sort((a, b) => `${a.baseline}:${a.path}`.localeCompare(`${b.baseline}:${b.path}`));
testEntries.sort((a, b) => `${a.baseline}:${a.path}`.localeCompare(`${b.baseline}:${b.path}`));

writeJsonl(join(OUT, "source-inventory.jsonl"), sourceEntries);
writeJsonl(join(OUT, "artifact-provenance.jsonl"), artifactEntries);
writeJsonl(join(OUT, "test-inventory.jsonl"), testEntries);

const summary = {
  schema: "wphx.inventory-summary.v1alpha",
  issue: "WPHX-006",
  generated_at: RECORDED_AT,
  generator: "tools/inventory/wphx-inventory.mjs",
  inputs: {
    sources: SOURCES,
    artifacts: ARTIFACTS
  },
  outputs: {
    source_inventory: "manifests/source-inventory.jsonl",
    artifact_provenance: "manifests/artifact-provenance.jsonl",
    test_inventory: "manifests/test-inventory.jsonl"
  },
  counts: {
    executable_source_units: sourceEntries.length,
    shipped_executable_artifacts: artifactEntries.length,
    test_units: testEntries.length,
    source_by_baseline: countBy(sourceEntries, "baseline"),
    source_by_language: countBy(sourceEntries, "language"),
    source_by_kind: countBy(sourceEntries, "kind"),
    artifact_by_baseline: countBy(artifactEntries, "baseline"),
    artifact_by_language: countBy(artifactEntries, "language"),
    tests_by_baseline: countBy(testEntries, "baseline"),
    tests_by_framework: countBy(testEntries, "framework")
  },
  closure: {
    unclassified_executable_source_units: sourceEntries.filter((entry) => !entry.classified).length,
    unclassified_shipped_executable_artifacts: artifactEntries.filter((entry) => !entry.classified).length,
    unclassified_test_units: testEntries.filter((entry) => !entry.classified).length
  }
};

writeFileSync(join(OUT, "inventory-summary.v1.json"), JSON.stringify(summary, null, 2) + "\n");

const receipt = {
  schema: 1,
  issue: "WPHX-006",
  recorded_at: summary.generated_at,
  command: "npm run inventory",
  outputs: summary.outputs,
  counts: summary.counts,
  closure: summary.closure,
  status:
    summary.closure.unclassified_executable_source_units === 0 &&
    summary.closure.unclassified_shipped_executable_artifacts === 0 &&
    summary.closure.unclassified_test_units === 0
      ? "passed"
      : "failed"
};

mkdirSync(join(ROOT, "receipts", "inventory"), { recursive: true });
writeFileSync(
  join(ROOT, "receipts", "inventory", "wphx-006-inventory.v1.json"),
  JSON.stringify(receipt, null, 2) + "\n"
);

console.log(JSON.stringify(receipt, null, 2));
