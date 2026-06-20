#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, sha256File } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const SHELL_EMITTER_TOOL = "tools/wp-hooks/run-hook-shell-emitter.mjs";
const GENERATED_ROOT = "build/php-hook-kernel/generated";
const GENERATED_PLUGIN = `${GENERATED_ROOT}/wp-includes/plugin.php`;
const GENERATED_HOOK_CLASS = `${GENERATED_ROOT}/wp-includes/class-wp-hook.php`;
const HAXE_RUNTIME = "src/wphx/wp/hooks/HookRuntime.hx";
const FACADE_KERNEL = "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx";
const F7_TOOL = "tools/php-facade/run-f7-hook-kernel.mjs";
const OUT = "manifests/wp-hooks/wphx-306-hook-distribution-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-hooks-distribution-surface.v1.json";
const RECEIPT = "receipts/wp-hooks/wphx-306-hook-distribution-surface.v1.json";
const RECORDED_AT = "2026-06-21T00:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_UNITS = [
  {
    unit: "src/wp-includes/plugin.php",
    generated_path: GENERATED_PLUGIN,
    source_path: "../wordpress-develop/src/wp-includes/plugin.php"
  },
  {
    unit: "src/wp-includes/class-wp-hook.php",
    generated_path: GENERATED_HOOK_CLASS,
    source_path: "../wordpress-develop/src/wp-includes/class-wp-hook.php"
  }
];

const PRIOR_MANIFESTS = [
  "manifests/wp-hooks/wphx-302-hook-surface.v1.json",
  "manifests/wp-hooks/wphx-303-hook-parity-candidate.v1.json",
  "manifests/wp-hooks/wphx-304-hook-runtime-boundary.v1.json",
  "manifests/wp-hooks/wphx-305-hook-shell-emitter.v1.json"
];
const PRIOR_OWNERSHIP_MANIFESTS = [
  "manifests/ownership/wphx-302-hooks-workset.v1.json",
  "manifests/ownership/wphx-303-hooks-decision-model.v1.json",
  "manifests/ownership/wphx-304-hooks-runtime-boundary.v1.json",
  "manifests/ownership/wphx-305-hooks-shell-emitter.v1.json"
];
const PRIOR_RECEIPTS = [
  "receipt:wphx-302-hook-surface",
  "receipt:wphx-303-hook-parity-candidate",
  "receipt:wphx-304-hook-runtime-boundary",
  "receipt:wphx-305-hook-shell-emitter"
];

const APPROVED_TRANSFORMS = [
  {
    id: "class:bootstrap",
    unit: "src/wp-includes/class-wp-hook.php",
    source_marker: "<?php",
    source_count: 1,
    generated_marker: "WordPressHX generated shell bootstrap.",
    generated_count: 1,
    owner: "php_bootstrap_boundary"
  },
  {
    id: "class:priority-normalization",
    unit: "src/wp-includes/class-wp-hook.php",
    source_marker: "if ( null === $priority )",
    source_count: 2,
    generated_marker: "HookKernel::normalizeKernelPriority( $priority )",
    generated_count: 2,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "class:filter-value-write",
    unit: "src/wp-includes/class-wp-hook.php",
    source_marker: "if ( ! $this->doing_action )",
    source_count: 1,
    generated_marker: "HookKernel::shouldWriteFilteredValue( $this->doing_action )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "class:dispatch-arity",
    unit: "src/wp-includes/class-wp-hook.php",
    source_marker: "$the_['accepted_args'] >= $num_args",
    source_count: 1,
    generated_marker: "HookKernel::dispatchArgCount( $num_args, $the_['accepted_args'] )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:filter-counters",
    unit: "src/wp-includes/plugin.php",
    source_marker: "$wp_filters[ $hook_name ] = 1",
    source_count: 2,
    generated_marker: "HookKernel::incrementCount( $wp_filters[ $hook_name ] ?? 0 )",
    generated_count: 2,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:action-counters",
    unit: "src/wp-includes/plugin.php",
    source_marker: "$wp_actions[ $hook_name ] = 1",
    source_count: 2,
    generated_marker: "HookKernel::incrementCount( $wp_actions[ $hook_name ] ?? 0 )",
    generated_count: 2,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:default-action-arg",
    unit: "src/wp-includes/plugin.php",
    source_marker: "if ( empty( $arg ) )",
    source_count: 1,
    generated_marker: "HookKernel::shouldUseDefaultActionArg( count( $arg ) )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:basename-trim",
    unit: "src/wp-includes/plugin.php",
    source_marker: "preg_replace( '#^' . preg_quote( $plugin_dir",
    source_count: 1,
    generated_marker: "HookKernel::pluginBasenameAfterMappings( $file, $plugin_dir, $mu_plugin_dir )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:realpath-registration",
    unit: "src/wp-includes/plugin.php",
    source_marker: "$plugin_path === $wp_plugin_path || $plugin_path === $wpmu_plugin_path",
    source_count: 1,
    generated_marker: "HookKernel::shouldRegisterPluginRealpath( $plugin_path, $wp_plugin_path, $wpmu_plugin_path )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:lifecycle-hooks",
    unit: "src/wp-includes/plugin.php",
    source_marker: "add_action( 'activate_' . $file, $callback );",
    source_count: 1,
    generated_marker: "HookKernel::lifecycleHookName( 'activate_', $file )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  },
  {
    id: "plugin:lifecycle-hooks-deactivate",
    unit: "src/wp-includes/plugin.php",
    source_marker: "add_action( 'deactivate_' . $file, $callback );",
    source_count: 1,
    generated_marker: "HookKernel::lifecycleHookName( 'deactivate_', $file )",
    generated_count: 1,
    owner: "haxe_runtime_boundary"
  }
];

const APPROVED_ABI_BOUNDARIES = [
  {
    id: "php-native-callbacks",
    status: "approved_public_abi_boundary",
    reason: "WordPress plugins pass PHP callables, closures, object methods, and static methods directly into hook APIs; callback identity and invocation remain PHP-observable.",
    evidence: ["receipt:wphx-302-hook-surface", "receipt:wphx-304-hook-runtime-boundary"]
  },
  {
    id: "php-reference-arguments",
    status: "approved_public_abi_boundary",
    reason: "apply_filters_ref_array() and do_action_ref_array() expose PHP by-reference array semantics that must remain native for plugin compatibility.",
    evidence: ["receipt:wphx-302-hook-surface", "receipt:wphx-305-hook-shell-emitter"]
  },
  {
    id: "php-hook-globals",
    status: "approved_public_abi_boundary",
    reason: "$wp_filter, $wp_filters, $wp_actions, and $wp_current_filter are public PHP globals observed by plugins and by reflection/debug tooling.",
    evidence: ["receipt:wphx-302-hook-surface", "receipt:wphx-303-hook-parity-candidate"]
  },
  {
    id: "reflection-visible-declarations",
    status: "approved_public_abi_boundary",
    reason: "plugin.php functions and WP_Hook declarations must keep WordPress-compatible names, parameters, defaults, class interfaces, and declaration timing.",
    evidence: ["receipt:wphx-302-hook-surface", "receipt:wphx-305-hook-shell-emitter"]
  },
  {
    id: "include-and-bootstrap-timing",
    status: "approved_public_abi_boundary",
    reason: "The shell must initialize the Haxe runtime without changing when plugin.php functions and WP_Hook become available to PHP includes.",
    evidence: ["receipt:wphx-304-hook-runtime-boundary", "receipt:wphx-305-hook-shell-emitter"]
  }
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function inputRecord(path) {
  return {
    path,
    bytes: Buffer.byteLength(readFileSync(path)),
    sha256: `sha256:${sha256File(path)}`
  };
}

function sourceRecord(source) {
  return {
    unit: source.unit,
    repo_path: source.source_path,
    distribution_path: source.unit.replace(/^src\//, ""),
    bytes: Buffer.byteLength(readFileSync(source.source_path)),
    sha256: `sha256:${sha256File(source.source_path)}`
  };
}

function countText(text, needle) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(needle, offset);
    if (index === -1) return count;
    count++;
    offset = index + needle.length;
  }
}

function splitLines(text) {
  const normalized = text.replace(/\r\n/g, "\n").trimEnd();
  return normalized === "" ? [] : normalized.split("\n");
}

function lcsMatches(sourceLines, generatedLines) {
  const rows = sourceLines.length + 1;
  const cols = generatedLines.length + 1;
  const table = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = sourceLines.length - 1; i >= 0; i--) {
    for (let j = generatedLines.length - 1; j >= 0; j--) {
      table[i][j] =
        sourceLines[i] === generatedLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const generatedToSource = new Map();
  const matchedSourceLines = new Set();
  let i = 0;
  let j = 0;
  while (i < sourceLines.length && j < generatedLines.length) {
    if (sourceLines[i] === generatedLines[j]) {
      generatedToSource.set(j + 1, i + 1);
      matchedSourceLines.add(i + 1);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { generatedToSource, matchedSourceLines };
}

function classifyGeneratedBoundary(line) {
  if (line.includes("WordPressHX generated shell bootstrap") || line.includes("WPHX_F7_HOOK_BOOTSTRAPPED")) {
    return {
      origin_kind: "approved_php_bootstrap_boundary",
      owner: "WPHX-306",
      source: F7_TOOL
    };
  }
  if (line.includes("\\php\\Boot") || line.includes("spl_autoload_register") || line.includes("set_include_path")) {
    return {
      origin_kind: "approved_php_bootstrap_boundary",
      owner: "WPHX-306",
      source: F7_TOOL
    };
  }
  if (line.includes("HookKernel::")) {
    return {
      origin_kind: "haxe_runtime_boundary_call",
      owner: "WPHX-304",
      source: `${HAXE_RUNTIME} via ${FACADE_KERNEL}`
    };
  }
  if (line.trim() === "") {
    return {
      origin_kind: "generated_spacing",
      owner: "WPHX-306",
      source: F7_TOOL
    };
  }
  return {
    origin_kind: "generated_shell_glue",
    owner: "WPHX-306",
    source: F7_TOOL
  };
}

function appendRange(ranges, entry) {
  const last = ranges.at(-1);
  const sameGeneratedKind =
    last &&
    last.origin_kind === entry.origin_kind &&
    last.owner === entry.owner &&
    last.source === entry.source &&
    last.generated_line_end + 1 === entry.generated_line_start;
  const sameSourceRun =
    entry.origin_kind === "upstream_oracle" &&
    last?.original_line_end != null &&
    entry.original_line_start === last.original_line_end + 1;
  const sameGeneratedRun = entry.origin_kind !== "upstream_oracle";
  if (sameGeneratedKind && (sameSourceRun || sameGeneratedRun)) {
    last.generated_line_end = entry.generated_line_end;
    if (entry.original_line_end != null) last.original_line_end = entry.original_line_end;
    return;
  }
  ranges.push(entry);
}

function lineSourceMap(source) {
  const sourceText = readFileSync(source.source_path, "utf8");
  const generatedText = readFileSync(source.generated_path, "utf8");
  const sourceLines = splitLines(sourceText);
  const generatedLines = splitLines(generatedText);
  const { generatedToSource, matchedSourceLines } = lcsMatches(sourceLines, generatedLines);
  const ranges = [];

  for (let index = 0; index < generatedLines.length; index++) {
    const generatedLine = index + 1;
    const sourceLine = generatedToSource.get(generatedLine);
    if (sourceLine) {
      appendRange(ranges, {
        generated_path: source.generated_path,
        generated_line_start: generatedLine,
        generated_line_end: generatedLine,
        origin_kind: "upstream_oracle",
        owner: "WordPress 7.0 oracle",
        source: source.source_path,
        original_source_unit: source.unit,
        original_line_start: sourceLine,
        original_line_end: sourceLine
      });
    } else {
      const classified = classifyGeneratedBoundary(generatedLines[index]);
      appendRange(ranges, {
        generated_path: source.generated_path,
        generated_line_start: generatedLine,
        generated_line_end: generatedLine,
        ...classified
      });
    }
  }

  const replacedSourceRanges = [];
  for (let line = 1; line <= sourceLines.length; line++) {
    if (matchedSourceLines.has(line)) continue;
    appendRange(replacedSourceRanges, {
      source: source.source_path,
      original_source_unit: source.unit,
      original_line_start: line,
      original_line_end: line,
      origin_kind: "replaced_by_haxe_boundary",
      owner: "WPHX-306"
    });
  }

  return {
    unit: source.unit,
    generated_path: source.generated_path,
    generated_sha256: `sha256:${sha256File(source.generated_path)}`,
    source_sha256: `sha256:${sha256File(source.source_path)}`,
    summary: {
      source_line_count: sourceLines.length,
      generated_line_count: generatedLines.length,
      matched_source_line_count: matchedSourceLines.size,
      generated_boundary_line_count: generatedLines.length - generatedToSource.size,
      replaced_source_line_count: sourceLines.length - matchedSourceLines.size
    },
    ranges,
    replaced_source_ranges: replacedSourceRanges
  };
}

function validateApprovedTransforms() {
  const errors = [];
  const records = APPROVED_TRANSFORMS.map((transform) => {
    const source = SOURCE_UNITS.find((entry) => entry.unit === transform.unit);
    const sourceText = readFileSync(source.source_path, "utf8");
    const generatedText = readFileSync(source.generated_path, "utf8");
    const sourceCount = countText(sourceText, transform.source_marker);
    const generatedCount = countText(generatedText, transform.generated_marker);
    if (sourceCount !== transform.source_count) {
      errors.push(`${transform.id}: expected source marker count ${transform.source_count}, found ${sourceCount}`);
    }
    if (generatedCount !== transform.generated_count) {
      errors.push(`${transform.id}: expected generated marker count ${transform.generated_count}, found ${generatedCount}`);
    }
    return {
      ...transform,
      source_count_observed: sourceCount,
      generated_count_observed: generatedCount,
      approved: sourceCount === transform.source_count && generatedCount === transform.generated_count
    };
  });
  return { records, errors };
}

function validatePriorOwnership() {
  const errors = [];
  const records = PRIOR_OWNERSHIP_MANIFESTS.map((path) => {
    const manifest = readJson(path);
    const hasBridge = Object.hasOwn(manifest, "bridge");
    const hasRemovalGate = Object.hasOwn(manifest, "removal_gate");
    const receiptRefs = manifest.verification?.receipt_refs ?? [];
    if (manifest.ownership_state !== "verified_haxe_owned") {
      errors.push(`${path}: ownership_state is ${manifest.ownership_state}`);
    }
    if (hasBridge) errors.push(`${path}: still has bridge block`);
    if (hasRemovalGate) errors.push(`${path}: still has removal_gate block`);
    if (!receiptRefs.includes("receipt:wphx-306-hook-distribution-surface")) {
      errors.push(`${path}: missing WPHX-306 receipt ref`);
    }
    return {
      path,
      manifest_id: manifest.manifest_id,
      issue: manifest.issue?.external_ref,
      ownership_state: manifest.ownership_state,
      has_bridge: hasBridge,
      has_removal_gate: hasRemovalGate,
      sha256: `sha256:${sha256File(path)}`
    };
  });
  return { records, errors };
}

function validateGeneratedShells() {
  const errors = [];
  const checks = [
    {
      id: "plugin:docblock",
      path: GENERATED_PLUGIN,
      needle: "The plugin API is located in this file"
    },
    {
      id: "plugin:haxe-boundary",
      path: GENERATED_PLUGIN,
      needle: "\\wphx\\fixtures\\php\\facade\\HookKernel::pluginBasenameAfterMappings"
    },
    {
      id: "class:docblock",
      path: GENERATED_HOOK_CLASS,
      needle: "Plugin API: WP_Hook class"
    },
    {
      id: "class:haxe-boundary",
      path: GENERATED_HOOK_CLASS,
      needle: "\\wphx\\fixtures\\php\\facade\\HookKernel::dispatchArgCount"
    }
  ].map((check) => {
    const text = readFileSync(check.path, "utf8");
    const present = text.includes(check.needle);
    if (!present) errors.push(`${check.id}: missing ${check.needle}`);
    return { ...check, present };
  });
  return { checks, errors };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp/hooks-distribution-surface",
    issue: {
      id: "wordpresshx-l76.6",
      external_ref: "WPHX-306"
    },
    unit: {
      kind: "workset",
      name: "hooks/plugin-api distribution surface",
      area: "wp-includes",
      public_contract: "distribution-ready plugin.php and class-wp-hook.php shells backed by Haxe-owned hook decisions and approved PHP public ABI boundaries"
    },
    ownership_state: "verified_haxe_owned",
    upstream: {
      repo: "../wordpress-develop",
      ref: WP_REF,
      paths: SOURCE_UNITS.map((source) => source.unit),
      digest: upstreamDigest
    },
    owned_paths: [
      HAXE_RUNTIME,
      FACADE_KERNEL,
      F7_TOOL,
      "tools/wp-hooks/run-hook-surface.mjs",
      "tools/wp-hooks/run-hook-parity-candidate.mjs",
      "tools/wp-hooks/run-hook-runtime-boundary.mjs",
      "tools/wp-hooks/run-hook-shell-emitter.mjs",
      "tools/wp-hooks/run-hook-distribution-surface.mjs"
    ],
    generated_paths: [
      "build/php-hook-kernel",
      "build/wp-hooks",
      "build/wp-hooks-candidate"
    ],
    verification: {
      oracle_commands: [
        "npm run wp:hooks:surface:check",
        "npm run wp:hooks:parity-candidate:check",
        "npm run wp:hooks:runtime-boundary:check",
        "npm run wp:hooks:shell-emitter:check",
        "npm run wp:hooks:distribution-surface:check"
      ],
      receipt_refs: [...PRIOR_RECEIPTS, "receipt:wphx-306-hook-distribution-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "WPHX-306 closes the hook/plugin API bridge removal gate. Upstream plugin.php and class-wp-hook.php are now source/provenance oracles for generated distribution shells; executable hook decisions are owned by Haxe HookRuntime/HookKernel, and remaining PHP-native callables, references, globals, reflection-visible declarations, and include timing are approved public ABI boundaries."
  };
}

command("node", [SHELL_EMITTER_TOOL, ...(checkOnly ? ["--check"] : [])]);

const sourceUnits = SOURCE_UNITS.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ unit: unit.unit, sha256: unit.sha256 }))));
const transformValidation = validateApprovedTransforms();
const priorOwnership = validatePriorOwnership();
const generatedShells = validateGeneratedShells();
const errors = [...transformValidation.errors, ...priorOwnership.errors, ...generatedShells.errors];
if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const shellSourceMaps = SOURCE_UNITS.map(lineSourceMap);
const priorManifestInputs = PRIOR_MANIFESTS.map(inputRecord);
const priorOwnershipInputs = PRIOR_OWNERSHIP_MANIFESTS.map(inputRecord);
const generatedFiles = filesUnder(GENERATED_ROOT);
const manifest = {
  schema: "wphx.wp-hook-distribution-surface.v1",
  issue: "WPHX-306",
  generated_at: RECORDED_AT,
  generator: "tools/wp-hooks/run-hook-distribution-surface.mjs",
  inputs: {
    source_units: sourceUnits,
    upstream_digest: upstreamDigest,
    haxe_runtime: inputRecord(HAXE_RUNTIME),
    facade_kernel: inputRecord(FACADE_KERNEL),
    f7_tool: inputRecord(F7_TOOL),
    prior_manifests: priorManifestInputs,
    prior_ownership_manifests: priorOwnershipInputs
  },
  ownership: {
    promoted_manifests: priorOwnership.records,
    ownership_state: "verified_haxe_owned",
    temporary_bridge_blocks_removed: true,
    removal_gates_closed: true
  },
  generated_distribution_shells: {
    root: GENERATED_ROOT,
    files: generatedFiles,
    expectations: generatedShells.checks
  },
  approved_public_abi_boundaries: APPROVED_ABI_BOUNDARIES,
  approved_transforms: transformValidation.records,
  source_maps: shellSourceMaps,
  validation_result: {
    status: "passed",
    prior_hook_gates_passed: true,
    ownership_manifests_verified_haxe_owned: true,
    source_maps_recorded: true,
    artifact_provenance_recorded: true,
    approved_public_abi_boundaries_recorded: true,
    broad_js_public_shell_template_removed: true,
    broad_source_transform_bridge: false,
    distribution_ready: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-hook-distribution-surface-receipt.v1",
  id: "receipt:wphx-306-hook-distribution-surface",
  issue: "WPHX-306",
  recorded_at: RECORDED_AT,
  command: "npm run wp:hooks:distribution-surface",
  status: "passed",
  manifest: OUT,
  manifest_sha256: manifestSha,
  ownership_manifest: OWNERSHIP,
  ownership_manifest_sha256: sha256(ownershipText),
  upstream_digest: upstreamDigest,
  approved_public_abi_boundary_count: APPROVED_ABI_BOUNDARIES.length
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
