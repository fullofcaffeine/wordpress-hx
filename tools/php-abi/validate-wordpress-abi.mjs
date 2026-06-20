#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const RECEIPT = "receipts/php-abi/wphx-201-php-abi-extractor.v1.json";
const SCHEMA = "manifests/schemas/php-abi-manifest.schema.json";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function countBy(entries, key) {
  return entries.reduce((counts, entry) => {
    counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
    return counts;
  }, {});
}

function assertSha(value, context) {
  assert(/^sha256:[0-9a-f]{64}$/.test(value), `${context} must be a sha256 digest`);
}

function assertLocation(location, context) {
  assert(location && Number.isInteger(location.start_line), `${context}.location.start_line is required`);
  assert(Number.isInteger(location.start_column), `${context}.location.start_column is required`);
  assert(Number.isInteger(location.start_offset), `${context}.location.start_offset is required`);
  assert(Number.isInteger(location.end_line), `${context}.location.end_line is required`);
  assert(Number.isInteger(location.end_column), `${context}.location.end_column is required`);
  assert(Number.isInteger(location.end_offset), `${context}.location.end_offset is required`);
}

function assertEntry(entry, previousId, ids) {
  const context = `${ABI}:${entry.id}`;
  assert(entry.schema === "wphx.php-abi-entry.v1", `${context}.schema mismatch`);
  assert(typeof entry.id === "string" && entry.id.startsWith("php-abi:wordpress-7.0.0:"), `${context}.id mismatch`);
  assert(!ids.has(entry.id), `${context} duplicate id`);
  assert(compareText(previousId, entry.id) <= 0, `${ABI} is not sorted at ${entry.id}`);
  assert(entry.baseline === "wordpress-7.0.0", `${context}.baseline mismatch`);
  assert(entry.repo === "../wordpress-develop", `${context}.repo mismatch`);
  assert(/^[0-9a-f]{40}$/.test(entry.commit), `${context}.commit must be a git hash`);
  assert(typeof entry.path === "string" && entry.path.startsWith("src/"), `${context}.path must be a src PHP path`);
  assert(typeof entry.distribution_path === "string" && !entry.distribution_path.startsWith("src/"), `${context}.distribution_path mismatch`);
  assertLocation(entry.location, context);
  assertSha(entry.source_hash, `${context}.source_hash`);
  assertSha(entry.signature_hash, `${context}.signature_hash`);
  assert(Array.isArray(entry.load_segments), `${context}.load_segments must be an array`);
  assert(["top_level", "conditional_or_segmented", "nested_function", "class_member"].includes(entry.declaration_timing), `${context}.declaration_timing invalid`);
  assert(
    ["function", "class", "interface", "trait", "method", "class_constant", "property", "constant"].includes(entry.kind),
    `${context}.kind invalid`
  );
  if (entry.parameters) {
    assert(Array.isArray(entry.parameters), `${context}.parameters must be an array`);
    entry.parameters.forEach((param, index) => {
      assert(param.position === index, `${context}.parameters[${index}].position mismatch`);
      assert(typeof param.name === "string" && param.name.length > 0, `${context}.parameters[${index}].name required`);
      assert(typeof param.by_reference === "boolean", `${context}.parameters[${index}].by_reference required`);
      assert(typeof param.variadic === "boolean", `${context}.parameters[${index}].variadic required`);
    });
  }
}

assert(existsSync(SCHEMA), `${SCHEMA} is missing`);
const schema = readJson(SCHEMA);
assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", `${SCHEMA} must declare draft 2020-12`);
assert(schema.$defs?.phpAbiEntry, `${SCHEMA} must define phpAbiEntry`);

const abiText = readFileSync(ABI, "utf8");
assert(abiText.endsWith("\n"), `${ABI} must end with a newline`);
const manifest = JSON.parse(abiText);
const receipt = readJson(RECEIPT);

assert(manifest.schema === "wphx.php-abi-manifest.v1", `${ABI}.schema mismatch`);
assert(manifest.issue === "WPHX-201", `${ABI}.issue mismatch`);
assert(manifest.generator === "tools/php-abi/extract-wordpress-abi.mjs", `${ABI}.generator mismatch`);
assert(manifest.parser?.package === "php-parser", `${ABI}.parser.package mismatch`);
assert(manifest.parser?.version === "3.7.0", `${ABI}.parser.version mismatch`);
assert(manifest.inputs?.baseline === "wordpress-7.0.0", `${ABI}.inputs.baseline mismatch`);
assert(manifest.inputs?.repo === "../wordpress-develop", `${ABI}.inputs.repo mismatch`);
assert(manifest.outputs?.abi_manifest === ABI, `${ABI}.outputs.abi_manifest mismatch`);
assert(manifest.outputs?.receipt === RECEIPT, `${ABI}.outputs.receipt mismatch`);
assert(Array.isArray(manifest.entries), `${ABI}.entries must be an array`);
assert(Array.isArray(manifest.parse_errors), `${ABI}.parse_errors must be an array`);
assert(Array.isArray(manifest.parser_recoveries), `${ABI}.parser_recoveries must be an array`);
assert(manifest.parse_errors.length === 0, `${ABI} has parse errors`);
assert(manifest.entries.length > 0, `${ABI} has no entries`);

const ids = new Set();
let previousId = "";
for (const entry of manifest.entries) {
  assertEntry(entry, previousId, ids);
  ids.add(entry.id);
  previousId = entry.id;
}

const byKind = Object.fromEntries(Object.entries(countBy(manifest.entries, "kind")).sort(([a], [b]) => compareText(a, b)));
assert(JSON.stringify(byKind) === JSON.stringify(manifest.counts.by_kind), `${ABI}.counts.by_kind mismatch`);
assert(manifest.counts.abi_entries === manifest.entries.length, `${ABI}.counts.abi_entries mismatch`);
assert(manifest.counts.source_files === manifest.inputs.source_files.length, `${ABI}.counts.source_files mismatch`);
assert(manifest.counts.parse_errors === 0, `${ABI}.counts.parse_errors mismatch`);
assert(manifest.counts.parser_recoveries === manifest.parser_recoveries.length, `${ABI}.counts.parser_recoveries mismatch`);
assert(manifest.counts.by_kind.function > 0, `${ABI} must contain functions`);
assert(manifest.counts.by_kind.class > 0, `${ABI} must contain classes`);
assert(manifest.counts.by_kind.method > 0, `${ABI} must contain methods`);
assert(manifest.counts.by_reference_parameters > 0, `${ABI} must count by-reference parameters`);
assert(manifest.counts.conditional_or_segmented_entries > 0, `${ABI} must count conditional/load-segmented declarations`);

assert(receipt.schema === "wphx.php-abi-extractor-receipt.v1", `${RECEIPT}.schema mismatch`);
assert(receipt.issue === "WPHX-201", `${RECEIPT}.issue mismatch`);
assert(receipt.status === "passed", `${RECEIPT}.status must be passed`);
assert(receipt.manifest_sha256 === sha256(abiText), `${RECEIPT}.manifest_sha256 stale`);
assert(JSON.stringify(receipt.counts) === JSON.stringify(manifest.counts), `${RECEIPT}.counts mismatch`);

console.log(
  JSON.stringify(
    {
      status: "passed",
      manifest: ABI,
      receipt: RECEIPT,
      source_files: manifest.counts.source_files,
      abi_entries: manifest.counts.abi_entries,
      by_kind: manifest.counts.by_kind
    },
    null,
    2
  )
);
