#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "manifests/license-provenance.v1.json";
const RECORDED_AT = "2026-06-20T04:45:00Z";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100
  });
}

function gitShow(repo, rev, path) {
  return git(repo, ["show", `${rev}:${path}`]);
}

function gitFileSha256(repo, rev, path) {
  return createHash("sha256").update(gitShow(repo, rev, path)).digest("hex");
}

function gitFileExists(repo, rev, path) {
  try {
    git(repo, ["cat-file", "-e", `${rev}:${path}`]);
    return true;
  } catch {
    return false;
  }
}

function packageJsonPaths(repo, rev) {
  const output = git(repo, ["ls-tree", "-r", "--name-only", rev]);
  return output
    .trim()
    .split("\n")
    .filter((path) => path.endsWith("package.json"))
    .sort();
}

function grepLicenseEntries(repo, rev) {
  let output = "";
  try {
    output = git(repo, ["grep", "-n", '"license"', rev, "--", "*package.json"]);
  } catch (error) {
    if (error.status !== 1) throw error;
  }

  const entries = [];
  for (const line of output.trim().split("\n").filter(Boolean)) {
    const match = line.match(/^[^:]+:(.+?):\d+:\s*"license"\s*:\s*"([^"]+)"/);
    if (match) entries.push({ path: match[1], license: match[2] });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function licenseSummary(repo, rev) {
  const paths = packageJsonPaths(repo, rev);
  const licenseEntries = grepLicenseEntries(repo, rev);
  const byPath = new Map(licenseEntries.map((entry) => [entry.path, entry.license]));
  const counts = {};
  for (const license of byPath.values()) counts[license] = (counts[license] ?? 0) + 1;
  counts.missing = paths.length - byPath.size;

  const exceptions = licenseEntries
    .filter((entry) => entry.license !== "GPL-2.0-or-later")
    .map((entry) => {
      const pkg = JSON.parse(gitShow(repo, rev, entry.path));
      return {
        path: entry.path,
        name: pkg.name ?? null,
        license: entry.license,
        notice_file: gitFileExists(repo, rev, entry.path.replace(/package\.json$/, "LICENSE"))
          ? entry.path.replace(/package\.json$/, "LICENSE")
          : null
      };
    });

  const missing = paths.filter((path) => !byPath.has(path));
  return {
    total_package_json: paths.length,
    license_counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    non_gpl_package_licenses: exceptions,
    missing_license_field_paths: missing
  };
}

function countJsonl(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean).length;
}

function sourceBaselines() {
  const counts = {};
  for (const line of readFileSync("manifests/source-inventory.jsonl", "utf8").trim().split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line);
    counts[entry.baseline] = (counts[entry.baseline] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function artifactBaselinesAndOrigins() {
  const byBaseline = {};
  const byOrigin = {};
  for (const line of readFileSync("manifests/artifact-provenance.jsonl", "utf8").trim().split("\n")) {
    if (!line) continue;
    const entry = JSON.parse(line);
    byBaseline[entry.baseline] = (byBaseline[entry.baseline] ?? 0) + 1;
    byOrigin[entry.origin] = (byOrigin[entry.origin] ?? 0) + 1;
  }
  return {
    by_baseline: Object.fromEntries(Object.entries(byBaseline).sort(([a], [b]) => a.localeCompare(b))),
    by_origin: Object.fromEntries(Object.entries(byOrigin).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function readRootPackage(repo, rev) {
  return JSON.parse(gitShow(repo, rev, "package.json"));
}

const wordpress = readJson("manifests/upstream/wordpress-7.0-baseline.v1.json");
const wordpressGutenberg = readJson("manifests/upstream/wordpress-7.0-gutenberg-baseline.v1.json");
const gutenbergForward = readJson("manifests/upstream/gutenberg-forward-baseline.v1.json");
const inventory = readJson("manifests/inventory-summary.v1.json");

const wordpressRepo = wordpress.repository.relative_path;
const wordpressRev = wordpress.repository.commit;
const embeddedGutenbergRepo = wordpressGutenberg.gutenberg_source.repo;
const embeddedGutenbergRev = wordpressGutenberg.gutenberg_source.commit;
const forwardGutenbergRepo = gutenbergForward.repository.relative_path;
const forwardGutenbergRev = gutenbergForward.repository.commit;

const wordpressPackage = readRootPackage(wordpressRepo, wordpressRev);
const wordpressComposer = JSON.parse(gitShow(wordpressRepo, wordpressRev, "composer.json"));
const embeddedGutenbergPackage = readRootPackage(embeddedGutenbergRepo, embeddedGutenbergRev);
const forwardGutenbergPackage = readRootPackage(forwardGutenbergRepo, forwardGutenbergRev);
const artifactCounts = artifactBaselinesAndOrigins();

const manifest = {
  schema: "wphx.license-provenance.v1",
  issue: "WPHX-011",
  generated_at: RECORDED_AT,
  generator: "tools/license/audit-provenance.mjs",
  upstreams: [
    {
      id: wordpress.id,
      role: "WordPress 7.0 source and official distribution oracle",
      repo: wordpress.repository.relative_path,
      commit: wordpress.repository.commit,
      tag: wordpress.repository.tag,
      package_name: wordpressPackage.name,
      package_version: wordpressPackage.version,
      package_license: wordpressPackage.license,
      composer_license: wordpressComposer.license,
      project_license_file: {
        path: "src/license.txt",
        sha256: gitFileSha256(wordpressRepo, wordpressRev, "src/license.txt")
      },
      notice_origins: [
        "WordPress contributors",
        "b2/cafelog lineage retained in src/license.txt"
      ],
      bundled_notice_files: [
        "src/wp-includes/ID3/license.txt",
        "src/wp-includes/ID3/readme.txt",
        "src/wp-includes/images/crystal/license.txt",
        "src/wp-includes/sodium_compat/LICENSE"
      ].map((path) => ({
        path,
        sha256: gitFileSha256(wordpressRepo, wordpressRev, path)
      }))
    },
    {
      id: wordpressGutenberg.id,
      role: "Gutenberg build artifact consumed by WordPress 7.0",
      source_repo: embeddedGutenbergRepo,
      source_commit: embeddedGutenbergRev,
      artifact_origin: "GHCR OCI artifact",
      artifact_source_annotation: wordpressGutenberg.ghcr_artifact.source_annotation,
      artifact_revision_annotation: wordpressGutenberg.ghcr_artifact.revision_annotation,
      artifact_digest: wordpressGutenberg.ghcr_artifact.layer_digest,
      package_name: embeddedGutenbergPackage.name,
      package_version: embeddedGutenbergPackage.version,
      package_license: embeddedGutenbergPackage.license,
      project_license_file: {
        path: "LICENSE.md",
        sha256: gitFileSha256(embeddedGutenbergRepo, embeddedGutenbergRev, "LICENSE.md")
      },
      contribution_license_note: "Gutenberg records GPL-2.0-or-later project licensing, with post-2021 contributions also available under MPL-2.0.",
      notice_origins: [
        "WordPress contributors",
        "b2/cafelog lineage retained in LICENSE.md"
      ]
    },
    {
      id: gutenbergForward.id,
      role: "Forward Gutenberg package oracle",
      repo: forwardGutenbergRepo,
      commit: forwardGutenbergRev,
      tag: gutenbergForward.baseline.tag,
      package_name: forwardGutenbergPackage.name,
      package_version: forwardGutenbergPackage.version,
      package_license: forwardGutenbergPackage.license,
      project_license_file: {
        path: "LICENSE.md",
        sha256: gitFileSha256(forwardGutenbergRepo, forwardGutenbergRev, "LICENSE.md")
      },
      contribution_license_note: "Gutenberg records GPL-2.0-or-later project licensing, with post-2021 contributions also available under MPL-2.0.",
      package_license_summary: licenseSummary(forwardGutenbergRepo, forwardGutenbergRev)
    }
  ],
  inventory_coverage: {
    executable_source_units: countJsonl("manifests/source-inventory.jsonl"),
    shipped_executable_artifacts: countJsonl("manifests/artifact-provenance.jsonl"),
    test_units: countJsonl("manifests/test-inventory.jsonl"),
    source_by_baseline: sourceBaselines(),
    artifact_by_baseline: artifactCounts.by_baseline,
    artifact_by_origin: artifactCounts.by_origin,
    unclassified_executable_source_units: inventory.closure.unclassified_executable_source_units,
    unclassified_shipped_executable_artifacts: inventory.closure.unclassified_shipped_executable_artifacts,
    unclassified_test_units: inventory.closure.unclassified_test_units
  },
  notice_requirements: [
    "Preserve WordPress src/license.txt or equivalent notice text in distributions derived from WordPress 7.0.",
    "Preserve Gutenberg LICENSE.md or equivalent notice text in distributions derived from Gutenberg source or build artifacts.",
    "Preserve package-specific license files for non-GPL package-level exceptions, including packages/stylelint-config/LICENSE.",
    "Preserve bundled third-party notice files recorded under upstreams[].bundled_notice_files.",
    "Record generated Haxe outputs with source provenance before treating them as distributable replacements."
  ],
  audit_warnings: [
    {
      code: "gutenberg-package-json-missing-license",
      severity: "needs-review-before-package-port",
      detail: "Some route/widget package.json files omit a package-level license field; inherit the repository license unless package-specific evidence is added.",
      paths: licenseSummary(forwardGutenbergRepo, forwardGutenbergRev).missing_license_field_paths
    }
  ]
};

const serialized = JSON.stringify(manifest, null, 2) + "\n";

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} does not exist` }, null, 2));
    process.exit(1);
  }
  const current = readFileSync(OUT, "utf8");
  if (current !== serialized) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} is stale` }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", output: OUT }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialized);
console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      upstream_count: manifest.upstreams.length,
      executable_source_units: manifest.inventory_coverage.executable_source_units,
      shipped_executable_artifacts: manifest.inventory_coverage.shipped_executable_artifacts
    },
    null,
    2
  )
);
