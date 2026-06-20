#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILES = {
  source: "manifests/source-inventory.jsonl",
  artifact: "manifests/artifact-provenance.jsonl",
  test: "manifests/test-inventory.jsonl",
  summary: "manifests/inventory-summary.v1.json",
  receipt006: "receipts/inventory/wphx-006-inventory.v1.json",
  schema: "manifests/schemas/inventory-manifests.schema.json"
};

const ENUMS = {
  sourceBaseline: new Set(["wordpress-7.0.0", "wordpress-7.0-gutenberg-source", "gutenberg-forward-23.4.0"]),
  artifactBaseline: new Set(["wordpress-7.0.0-distribution", "wordpress-7.0-gutenberg-build"]),
  language: new Set([
    "php",
    "phpunit-config",
    "javascript",
    "typescript",
    "tsx",
    "jsx",
    "shell",
    "powershell",
    "wasm",
    "make",
    "unknown"
  ]),
  sourceKind: new Set(["runtime_source", "build_tooling_source", "test_source", "vendor_source"]),
  testFramework: new Set(["phpunit", "playwright", "qunit", "jest", "php-test", "js-test", "test"])
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  const text = readFileSync(path, "utf8");
  assert(text.endsWith("\n"), `${path} must end with a newline`);
  return text
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        fail(`${path}:${index + 1} is invalid JSON: ${error.message}`);
      }
    });
}

function assertString(record, field, context) {
  assert(typeof record[field] === "string" && record[field].length > 0, `${context}.${field} must be a non-empty string`);
}

function assertArray(record, field, context) {
  assert(Array.isArray(record[field]), `${context}.${field} must be an array`);
}

function assertHex40(value, context) {
  assert(/^[0-9a-f]{40}$/.test(value), `${context} must be a 40-character lowercase hex string`);
}

function assertSha256(value, context) {
  assert(/^sha256:[0-9a-f]{64}$/.test(value), `${context} must be a sha256 digest`);
}

function assertSortedUnique(entries, path) {
  const ids = new Set();
  let previous = "";
  for (const entry of entries) {
    assertString(entry, "id", path);
    assert(!ids.has(entry.id), `${path} has duplicate id ${entry.id}`);
    assert(entry.id >= previous, `${path} is not sorted by id at ${entry.id}`);
    ids.add(entry.id);
    previous = entry.id;
  }
  return ids;
}

function countBy(entries, key) {
  return entries.reduce((counts, entry) => {
    const value = entry[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function assertObjectEqual(actual, expected, context) {
  const a = JSON.stringify(actual, Object.keys(actual).sort());
  const e = JSON.stringify(expected, Object.keys(expected).sort());
  assert(a === e, `${context} mismatch: expected ${e}, got ${a}`);
}

function validateSource(entries) {
  const ids = assertSortedUnique(entries, FILES.source);
  for (const entry of entries) {
    const context = `${FILES.source}:${entry.id}`;
    assert(entry.schema === "wphx.source-unit.v1alpha", `${context}.schema mismatch`);
    assert(ENUMS.sourceBaseline.has(entry.baseline), `${context}.baseline is invalid`);
    assertString(entry, "repo", context);
    assertHex40(entry.commit, `${context}.commit`);
    assertHex40(entry.tree, `${context}.tree`);
    assertString(entry, "path", context);
    assert(ENUMS.language.has(entry.language), `${context}.language is invalid`);
    assertString(entry, "area", context);
    assert(ENUMS.sourceKind.has(entry.kind), `${context}.kind is invalid`);
    assertHex40(entry.gitObject, `${context}.gitObject`);
    assert(/^[0-9]{6}$/.test(entry.mode), `${context}.mode is invalid`);
    assert(entry.status === "upstream_oracle_unported", `${context}.status mismatch`);
    assertArray(entry, "haxeOwners", context);
    assertArray(entry, "generatedArtifacts", context);
    assert(entry.taskExternalRef === null || /^WPHX-[0-9]+$/.test(entry.taskExternalRef), `${context}.taskExternalRef is invalid`);
    assert(entry.classified === true, `${context}.classified must be true`);
    assertArray(entry, "exceptions", context);
  }
  return ids;
}

function validateArtifacts(entries) {
  assertSortedUnique(entries, FILES.artifact);
  for (const entry of entries) {
    const context = `${FILES.artifact}:${entry.id}`;
    assert(entry.schema === "wphx.artifact-provenance.v1alpha", `${context}.schema mismatch`);
    assert(ENUMS.artifactBaseline.has(entry.baseline), `${context}.baseline is invalid`);
    assertString(entry, "artifact", context);
    assert(entry.artifactKind === "zip" || entry.artifactKind === "tar.gz", `${context}.artifactKind is invalid`);
    assertSha256(entry.artifactDigest, `${context}.artifactDigest`);
    assertString(entry, "rawPath", context);
    assertString(entry, "path", context);
    assert(ENUMS.language.has(entry.language), `${context}.language is invalid`);
    assertString(entry, "area", context);
    assert(entry.kind === "shipped_executable_artifact", `${context}.kind mismatch`);
    assert(entry.origin === "upstream_oracle", `${context}.origin mismatch`);
    assert(entry.migrationStatus === "pending_haxe_generation_or_approved_exception", `${context}.migrationStatus mismatch`);
    assert(entry.classified === true, `${context}.classified must be true`);
    assertArray(entry, "exceptions", context);
  }
}

function validateTests(entries, sourceIds) {
  assertSortedUnique(entries, FILES.test);
  for (const entry of entries) {
    const context = `${FILES.test}:${entry.id}`;
    assert(entry.schema === "wphx.test-unit.v1alpha", `${context}.schema mismatch`);
    assert(ENUMS.sourceBaseline.has(entry.baseline), `${context}.baseline is invalid`);
    assertString(entry, "repo", context);
    assertHex40(entry.commit, `${context}.commit`);
    assertString(entry, "path", context);
    assert(ENUMS.language.has(entry.language), `${context}.language is invalid`);
    assert(ENUMS.testFramework.has(entry.framework), `${context}.framework is invalid`);
    assert(sourceIds.has(entry.sourceUnit), `${context}.sourceUnit does not reference a source inventory record`);
    assert(entry.classified === true, `${context}.classified must be true`);
  }
}

function validateSummary(summary, receipt, source, artifact, test) {
  assert(summary.schema === "wphx.inventory-summary.v1alpha", "summary.schema mismatch");
  assert(summary.issue === "WPHX-006", "summary.issue mismatch");
  assert(summary.generator === "tools/inventory/wphx-inventory.mjs", "summary.generator mismatch");
  assert(summary.outputs.source_inventory === FILES.source, "summary source path mismatch");
  assert(summary.outputs.artifact_provenance === FILES.artifact, "summary artifact path mismatch");
  assert(summary.outputs.test_inventory === FILES.test, "summary test path mismatch");
  assert(summary.closure.unclassified_executable_source_units === 0, "source closure is not zero");
  assert(summary.closure.unclassified_shipped_executable_artifacts === 0, "artifact closure is not zero");
  assert(summary.closure.unclassified_test_units === 0, "test closure is not zero");
  assert(summary.counts.executable_source_units === source.length, "source count mismatch");
  assert(summary.counts.shipped_executable_artifacts === artifact.length, "artifact count mismatch");
  assert(summary.counts.test_units === test.length, "test count mismatch");
  assertObjectEqual(summary.counts.source_by_baseline, countBy(source, "baseline"), "source_by_baseline");
  assertObjectEqual(summary.counts.source_by_language, countBy(source, "language"), "source_by_language");
  assertObjectEqual(summary.counts.source_by_kind, countBy(source, "kind"), "source_by_kind");
  assertObjectEqual(summary.counts.artifact_by_baseline, countBy(artifact, "baseline"), "artifact_by_baseline");
  assertObjectEqual(summary.counts.artifact_by_language, countBy(artifact, "language"), "artifact_by_language");
  assertObjectEqual(summary.counts.tests_by_baseline, countBy(test, "baseline"), "tests_by_baseline");
  assertObjectEqual(summary.counts.tests_by_framework, countBy(test, "framework"), "tests_by_framework");

  assert(receipt.status === "passed", "WPHX-006 receipt status must be passed");
  assertObjectEqual(receipt.counts, summary.counts, "receipt counts");
  assertObjectEqual(receipt.closure, summary.closure, "receipt closure");
}

const schema = readJson(FILES.schema);
assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "inventory schema must declare draft 2020-12");
assert(schema.$defs.sourceUnit && schema.$defs.artifactProvenance && schema.$defs.testUnit && schema.$defs.inventorySummary, "inventory schema defs are incomplete");

const source = readJsonl(FILES.source);
const artifact = readJsonl(FILES.artifact);
const test = readJsonl(FILES.test);
const summary = readJson(FILES.summary);
const receipt = readJson(FILES.receipt006);

const sourceIds = validateSource(source);
validateArtifacts(artifact);
validateTests(test, sourceIds);
validateSummary(summary, receipt, source, artifact, test);

console.log(
  JSON.stringify(
    {
      status: "passed",
      schemas: [FILES.schema],
      validated: {
        source_units: source.length,
        shipped_executable_artifacts: artifact.length,
        test_units: test.length
      }
    },
    null,
    2
  )
);
