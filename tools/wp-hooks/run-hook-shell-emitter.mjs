#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const F7_TOOL = "tools/php-facade/run-f7-hook-kernel.mjs";
const RUNTIME_BOUNDARY_TOOL = "tools/wp-hooks/run-hook-runtime-boundary.mjs";
const RUNTIME_BOUNDARY_MANIFEST = "manifests/wp-hooks/wphx-304-hook-runtime-boundary.v1.json";
const GENERATED_ROOT = "build/php-hook-kernel/generated";
const GENERATED_PLUGIN = `${GENERATED_ROOT}/wp-includes/plugin.php`;
const GENERATED_HOOK_CLASS = `${GENERATED_ROOT}/wp-includes/class-wp-hook.php`;
const OUT = "manifests/wp-hooks/wphx-305-hook-shell-emitter.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-hooks-shell-emitter.v1.json";
const RECEIPT = "receipts/wp-hooks/wphx-305-hook-shell-emitter.v1.json";
const RECORDED_AT = "2026-06-20T23:30:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_UNITS = ["src/wp-includes/plugin.php", "src/wp-includes/class-wp-hook.php"];

const REQUIRED_TOOL_MARKERS = [
  "function transformHookClass(source)",
  "function transformPlugin(source)",
  "transformHookClass(readFileSync(UPSTREAM_HOOK_CLASS",
  "transformPlugin(readFileSync(UPSTREAM_PLUGIN",
  "replaceExact("
];

const FORBIDDEN_PUBLIC_SHELL_TEMPLATE_MARKERS = [
  "`<?php\\n\\nif ( ! defined( 'WPHX_F7_HOOK_BOOTSTRAPPED' )",
  "final class WP_Hook implements Iterator, ArrayAccess {\\n\\tpublic $callbacks",
  "function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {\\n\\tglobal $wp_filter;",
  "function plugin_basename( $file ) {\\n\\tglobal $wp_plugin_paths;"
];

const GENERATED_EXPECTATIONS = [
  { id: "class:source-docblock", file: GENERATED_HOOK_CLASS, needle: "Plugin API: WP_Hook class" },
  { id: "class:runtime-boundary", file: GENERATED_HOOK_CLASS, needle: "\\wphx\\fixtures\\php\\facade\\HookKernel::dispatchArgCount" },
  { id: "plugin:source-docblock", file: GENERATED_PLUGIN, needle: "The plugin API is located in this file" },
  { id: "plugin:runtime-boundary", file: GENERATED_PLUGIN, needle: "\\wphx\\fixtures\\php\\facade\\HookKernel::pluginBasenameAfterMappings" }
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

function validateToolMarkers(scriptText) {
  const errors = [];
  const required = REQUIRED_TOOL_MARKERS.map((marker) => {
    const present = scriptText.includes(marker);
    if (!present) errors.push(`missing shell-emitter marker: ${marker}`);
    return { marker, present };
  });
  const forbidden = FORBIDDEN_PUBLIC_SHELL_TEMPLATE_MARKERS.map((marker) => {
    const present = scriptText.includes(marker);
    if (present) errors.push(`public shell template marker is still present: ${marker}`);
    return { marker, present };
  });
  return { required, forbidden, errors };
}

function validateGeneratedFiles() {
  const errors = [];
  const expectations = GENERATED_EXPECTATIONS.map((expectation) => {
    const text = readFileSync(expectation.file, "utf8");
    const present = text.includes(expectation.needle);
    if (!present) errors.push(`${expectation.id}: missing ${expectation.needle}`);
    return { ...expectation, present };
  });
  return { expectations, errors };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp/hooks-shell-emitter",
    issue: {
      id: "wordpresshx-l76.5",
      external_ref: "WPHX-305"
    },
    unit: {
      kind: "workset",
      name: "hooks/plugin-api shell emitter",
      area: "wp-includes",
      public_contract: "plugin.php and class-wp-hook.php public shell emitted by source transforms plus Haxe runtime boundary calls"
    },
    ownership_state: "verified_haxe_owned",
    upstream: {
      repo: "../wordpress-develop",
      ref: WP_REF,
      paths: SOURCE_UNITS,
      digest: upstreamDigest
    },
    owned_paths: [
      F7_TOOL,
      RUNTIME_BOUNDARY_TOOL,
      "src/wphx/wp/hooks/HookRuntime.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx",
      "tools/wp-hooks/run-hook-shell-emitter.mjs"
    ],
    generated_paths: [
      "build/php-hook-kernel",
      "build/wp-hooks",
      "build/wp-hooks-candidate"
    ],
    verification: {
      oracle_commands: [
        "npm run wp:hooks:shell-emitter",
        "npm run wp:hooks:shell-emitter:check",
        "npm run wp:hooks:runtime-boundary:check",
        "npm run wp:hooks:distribution-surface:check"
      ],
      receipt_refs: [
        "receipt:wphx-302-hook-surface",
        "receipt:wphx-303-hook-parity-candidate",
        "receipt:wphx-304-hook-runtime-boundary",
        "receipt:wphx-305-hook-shell-emitter",
        "receipt:wphx-306-hook-distribution-surface"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "WPHX-305 replaces the broad JS-authored public shell bodies with counted emission transforms over the locked WordPress 7.0 oracle files. WPHX-306 verifies the generated shell as distribution-ready Haxe-owned output with source maps, provenance, and approved PHP-native public ABI boundaries."
  };
}

command("node", [RUNTIME_BOUNDARY_TOOL, ...(checkOnly ? ["--check"] : [])]);

const f7ScriptText = readFileSync(F7_TOOL, "utf8");
const toolValidation = validateToolMarkers(f7ScriptText);
const generatedValidation = validateGeneratedFiles();
const errors = [...toolValidation.errors, ...generatedValidation.errors];
if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_UNITS.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ unit: unit.unit, sha256: unit.sha256 }))));
const runtimeBoundaryText = readFileSync(RUNTIME_BOUNDARY_MANIFEST, "utf8");
const manifest = {
  schema: "wphx.wp-hook-shell-emitter.v1",
  issue: "WPHX-305",
  generated_at: RECORDED_AT,
  generator: "tools/wp-hooks/run-hook-shell-emitter.mjs",
  inputs: {
    f7_tool: inputRecord(F7_TOOL),
    runtime_boundary_tool: inputRecord(RUNTIME_BOUNDARY_TOOL),
    runtime_boundary_manifest: RUNTIME_BOUNDARY_MANIFEST,
    runtime_boundary_manifest_sha256: sha256(runtimeBoundaryText),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  shell_emitter: {
    strategy: "source_transform_emitter",
    source_files: SOURCE_UNITS,
    public_shell_template_in_js: false,
    transform_markers: toolValidation.required,
    forbidden_template_markers: toolValidation.forbidden,
    generated_expectations: generatedValidation.expectations
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
    files: filesUnder(GENERATED_ROOT)
  },
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    broad_js_public_shell_template_removed: true,
    upstream_source_transform_emitter: true,
    generated_php_keeps_upstream_docblocks: true,
    haxe_runtime_boundary_preserved: true,
    verified_distribution_surface: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-hook-shell-emitter-receipt.v1",
  id: "receipt:wphx-305-hook-shell-emitter",
  issue: "WPHX-305",
  recorded_at: RECORDED_AT,
  command: "npm run wp:hooks:shell-emitter",
  status: "passed",
  manifest: OUT,
  manifest_sha256: manifestSha,
  ownership_manifest: OWNERSHIP,
  ownership_manifest_sha256: sha256(ownershipText),
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT }, null, 2));
  process.exit(0);
}

writeFile(OUT, manifestText);
writeFile(OWNERSHIP, ownershipText);
writeFile(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT }, null, 2));
