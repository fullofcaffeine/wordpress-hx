#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const F7_MANIFEST = "manifests/php-facade/wphx-108-f7-hook-kernel.v1.json";
const SURFACE_MANIFEST = "manifests/wp-hooks/wphx-302-hook-surface.v1.json";
const CANDIDATE_MANIFEST = "manifests/wp-hooks/wphx-303-hook-parity-candidate.v1.json";
const GENERATED_ROOT = "build/php-hook-kernel/generated";
const GENERATED_PLUGIN = `${GENERATED_ROOT}/wp-includes/plugin.php`;
const GENERATED_HOOK_CLASS = `${GENERATED_ROOT}/wp-includes/class-wp-hook.php`;
const HAXE_RUNTIME = "src/wphx/wp/hooks/HookRuntime.hx";
const FACADE_KERNEL = "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx";
const OUT = "manifests/wp-hooks/wphx-304-hook-runtime-boundary.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-304-hooks-runtime-boundary.v1.json";
const RECEIPT = "receipts/wp-hooks/wphx-304-hook-runtime-boundary.v1.json";
const RECORDED_AT = "2026-06-20T23:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_UNITS = ["src/wp-includes/plugin.php", "src/wp-includes/class-wp-hook.php"];

const BOUNDARY_CALLS = [
  { id: "class:priority-normalization", file: GENERATED_HOOK_CLASS, method: "normalizeKernelPriority", min_count: 2 },
  { id: "class:filter-value-write", file: GENERATED_HOOK_CLASS, method: "shouldWriteFilteredValue", min_count: 1 },
  { id: "class:dispatch-arity", file: GENERATED_HOOK_CLASS, method: "dispatchArgCount", min_count: 1 },
  { id: "plugin:counters", file: GENERATED_PLUGIN, method: "incrementCount", min_count: 4 },
  { id: "plugin:default-action-arg", file: GENERATED_PLUGIN, method: "shouldUseDefaultActionArg", min_count: 1 },
  { id: "plugin:default-action-value", file: GENERATED_PLUGIN, method: "defaultActionArg", min_count: 1 },
  { id: "plugin:basename-trim", file: GENERATED_PLUGIN, method: "pluginBasenameAfterMappings", min_count: 1 },
  { id: "plugin:realpath-registration", file: GENERATED_PLUGIN, method: "shouldRegisterPluginRealpath", min_count: 1 },
  { id: "plugin:realpath-mapping", file: GENERATED_PLUGIN, method: "shouldStorePluginRealpathMapping", min_count: 1 },
  { id: "plugin:lifecycle-hook-names", file: GENERATED_PLUGIN, method: "lifecycleHookName", min_count: 2 }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function sourcePath(unit) {
  return `../wordpress-develop/${unit}`;
}

function sourceRecord(unit) {
  const path = sourcePath(unit);
  return {
    unit,
    repo_path: path,
    bytes: Buffer.byteLength(readFileSync(path)),
    sha256: `sha256:${sha256File(path)}`
  };
}

function inputRecord(path) {
  return {
    path,
    bytes: Buffer.byteLength(readFileSync(path)),
    sha256: `sha256:${sha256File(path)}`
  };
}

function countOccurrences(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count++;
    offset = index + needle.length;
  }
}

function boundaryCallRecords() {
  const errors = [];
  const records = BOUNDARY_CALLS.map((call) => {
    const text = readFileSync(call.file, "utf8");
    const needle = `HookKernel::${call.method}`;
    const count = countOccurrences(text, needle);
    if (count < call.min_count) {
      errors.push(`${call.id}: expected at least ${call.min_count} ${needle} calls in ${call.file}, found ${count}`);
    }
    return {
      ...call,
      needle,
      count,
      present: count >= call.min_count
    };
  });
  return { records, errors };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp/hooks-runtime-boundary",
    issue: {
      id: "wordpresshx-l76.4",
      external_ref: "WPHX-304"
    },
    unit: {
      kind: "workset",
      name: "hooks/plugin-api runtime boundary",
      area: "wp-includes",
      public_contract: "plugin.php and class-wp-hook.php public hook API shell with Haxe-owned runtime decisions and PHP-native callback/reference/global boundary"
    },
    ownership_state: "haxe_parity_candidate",
    upstream: {
      repo: "../wordpress-develop",
      ref: WP_REF,
      paths: SOURCE_UNITS,
      digest: upstreamDigest
    },
    owned_paths: [
      HAXE_RUNTIME,
      FACADE_KERNEL,
      "fixtures/php-facade/f7-hook-kernel.hxml",
      "fixtures/wp-hooks/hooks-parity-candidate.hxml",
      "fixtures/wp-hooks/src/wphx/fixtures/wp/hooks/HookCandidateKernel.hx",
      "tools/php-facade/run-f7-hook-kernel.mjs",
      "tools/wp-hooks/run-hook-runtime-boundary.mjs"
    ],
    generated_paths: [
      "build/php-hook-kernel",
      "build/wp-hooks",
      "build/wp-hooks-candidate"
    ],
    bridge: {
      kind: "runtime_delegate",
      reason:
        "PHP callables, by-reference arrays, globals, reflection-visible declarations, and include timing remain PHP-native at the public shell. The Haxe boundary owns scalar/string hook decisions while WPHX-305 moves remaining shell emission into Haxe/compiler-owned output.",
      bounded_by: [
        "npm run php:facade:f7:check",
        "npm run wp:hooks:surface:check",
        "npm run wp:hooks:parity-candidate:check",
        "npm run wp:hooks:runtime-boundary:check"
      ]
    },
    removal_gate: {
      condition: "Move the remaining plugin.php/class-wp-hook.php public shell emission out of the JavaScript PHP template into Haxe-owned source, a macro/emitter, a generic Haxe PHP backend improvement, or ADR-approved Reflaxe/custom PHP target.",
      owner_issue: "WPHX-305",
      target_state: "verified_haxe_owned"
    },
    verification: {
      oracle_commands: [
        "npm run php:facade:f7",
        "npm run wp:hooks:surface",
        "npm run wp:hooks:parity-candidate",
        "npm run wp:hooks:runtime-boundary",
        "npm run wp:hooks:runtime-boundary:check"
      ],
      receipt_refs: [
        "receipt:wphx-302-hook-surface",
        "receipt:wphx-303-hook-parity-candidate",
        "receipt:wphx-304-hook-runtime-boundary"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "WPHX-304 replaces bounded hook shell decisions with typed Haxe runtime calls without using broad php.Syntax.code. The public shell remains PHP-native where WordPress plugin compatibility depends on callables, references, globals, and reflection."
  };
}

for (const [script, tool] of [
  ["php:facade:f7", "tools/php-facade/run-f7-hook-kernel.mjs"],
  ["wp:hooks:parity-candidate", "tools/wp-hooks/run-hook-parity-candidate.mjs"],
  ["wp:hooks:surface", "tools/wp-hooks/run-hook-surface.mjs"]
]) {
  command("node", [tool, ...(checkOnly ? ["--check"] : [])]);
}

const { records: boundary_calls, errors } = boundaryCallRecords();
const generatedRuntimePath = "build/php-hook-kernel/haxe/lib/wphx/wp/hooks/HookRuntime.php";
if (!existsSync(generatedRuntimePath)) {
  errors.push(`${generatedRuntimePath} does not exist`);
}
if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_UNITS.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ unit: unit.unit, sha256: unit.sha256 }))));
const lock = readJson("toolchain.lock.json");
const f7Manifest = readFileSync(F7_MANIFEST, "utf8");
const surfaceManifest = readFileSync(SURFACE_MANIFEST, "utf8");
const candidateManifest = readFileSync(CANDIDATE_MANIFEST, "utf8");
const manifest = {
  schema: "wphx.wp-hook-runtime-boundary.v1",
  issue: "WPHX-304",
  generated_at: RECORDED_AT,
  generator: "tools/wp-hooks/run-hook-runtime-boundary.mjs",
  inputs: {
    haxe_runtime: inputRecord(HAXE_RUNTIME),
    facade_kernel: inputRecord(FACADE_KERNEL),
    f7_manifest: F7_MANIFEST,
    f7_manifest_sha256: sha256(f7Manifest),
    hook_surface_manifest: SURFACE_MANIFEST,
    hook_surface_manifest_sha256: sha256(surfaceManifest),
    hook_candidate_manifest: CANDIDATE_MANIFEST,
    hook_candidate_manifest_sha256: sha256(candidateManifest),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"])
  },
  generated: {
    plugin: {
      path: GENERATED_PLUGIN,
      sha256: `sha256:${sha256File(GENERATED_PLUGIN)}`
    },
    hook_class: {
      path: GENERATED_HOOK_CLASS,
      sha256: `sha256:${sha256File(GENERATED_HOOK_CLASS)}`
    },
    haxe_runtime: {
      path: generatedRuntimePath,
      sha256: `sha256:${sha256File(generatedRuntimePath)}`
    },
    generated_files: filesUnder(GENERATED_ROOT)
  },
  boundary_calls,
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    typed_runtime_boundary_calls_present: true,
    public_php_callbacks_remain_native: true,
    public_php_references_remain_native: true,
    public_php_globals_remain_native: true,
    broad_haxe_php_string_port: false,
    remaining_shell_emission_owner_issue: "WPHX-305"
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-hook-runtime-boundary-receipt.v1",
  id: "receipt:wphx-304-hook-runtime-boundary",
  issue: "WPHX-304",
  recorded_at: RECORDED_AT,
  command: "npm run wp:hooks:runtime-boundary",
  status: "passed",
  manifest: OUT,
  manifest_sha256: manifestSha,
  ownership_manifest: OWNERSHIP,
  ownership_manifest_sha256: sha256(ownershipText),
  boundary_call_count: boundary_calls.reduce((total, call) => total + call.count, 0),
  upstream_digest: upstreamDigest
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [OWNERSHIP, ownershipText],
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, boundary_calls: boundary_calls.length }, null, 2));
  process.exit(0);
}

writeFile(OUT, manifestText);
writeFile(OWNERSHIP, ownershipText);
writeFile(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, boundary_calls: boundary_calls.length }, null, 2));
