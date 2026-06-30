import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const check = process.argv.includes("--check");
const recordedAt = "2026-06-30T00:00:00.000Z";
const issue = {
  id: "wordpresshx-3k6",
  external_ref: "WPHX-COMP-PHP-TEMPLATE-SEGMENT-MODEL",
  title: "Define WPHX PHP file-segment/template model"
};
const runnerPath = "tools/wphx-php/run-template-segment-model.mjs";
const manifestPath = "manifests/wphx-php/template-segment-model.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-template-segment-model.v1.json";
const f6ManifestPath = "manifests/php-facade/wphx-107-f6-template-scope.v1.json";
const f6ReceiptPath = "receipts/operations/wphx-107-f6-template-scope.v1.json";
const includeManifestPath = "manifests/wphx-php/include-side-effects.v1.json";
const includeReceiptPath = "receipts/compiler/wphx-comp-php-include-side-effects.v1.json";
const adrPath = "docs/adr/ADR-005-php-file-segment-template-model.md";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Text(readFileSync(path));
}

function inputRecord(path) {
  return {
    path,
    bytes: readFileSync(path).length,
    sha256: `sha256:${sha256File(path)}`
  };
}

function writeOrCheck(path, content) {
  if (check) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run without --check to generate it`);
    }
    const existing = readFileSync(path, "utf8");
    if (existing !== content) {
      throw new Error(`${path} is stale; run without --check to refresh it`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function requireTrue(value, label) {
  if (!value) {
    throw new Error(`Missing required template segment evidence: ${label}`);
  }
}

const f6Manifest = readJson(f6ManifestPath);
const f6Receipt = readJson(f6ReceiptPath);
const includeManifest = readJson(includeManifestPath);
const includeReceipt = readJson(includeReceiptPath);

requireTrue(f6Receipt.validation_result.status === "passed", "F6 status");
requireTrue(f6Receipt.validation_result.admin_style_template, "F6 admin template");
requireTrue(f6Receipt.validation_result.theme_style_template, "F6 theme template");
requireTrue(f6Receipt.validation_result.mixed_output_order, "F6 mixed output order");
requireTrue(f6Receipt.validation_result.caller_local_mutation, "F6 caller local mutation");
requireTrue(f6Receipt.validation_result.object_local_mutation, "F6 object local mutation");
requireTrue(f6Receipt.validation_result.global_state_mutation, "F6 global state mutation");
requireTrue(f6Receipt.validation_result.nested_partial_include, "F6 nested partial include");
requireTrue(f6Receipt.validation_result.include_return_values, "F6 include return values");
requireTrue(includeReceipt.validation_result.status === "passed", "include side-effect status");
requireTrue(includeReceipt.validation_result.runtime_include_sequence_passed, "include sequence");
requireTrue(includeReceipt.validation_result.runtime_include_once_passed, "include once");
requireTrue(includeReceipt.validation_result.runtime_function_scope_include_passed, "function-scope include");
requireTrue(includeReceipt.validation_result.unsupported_empty, "include unsupported empty");

const segmentKinds = [
  "guard",
  "declaration",
  "bootstrap",
  "script",
  "literal_output",
  "template_expression",
  "control",
  "include",
  "return_exit",
  "raw_compatibility"
];

const adoptionModes = [
  "bridge_original_php_shell",
  "generated_helper_with_temporary_shell",
  "compiler_emitted_segment_shell",
  "context_bridge_template",
  "direct_script_emission",
  "haxe_owned_template_unit",
  "whole_file_owned"
];

const cases = [
  {
    id: "admin-style",
    source: "WPHX-107",
    mode: "context_bridge_template",
    original_path: "wp-admin/admin-fixture.php",
    segment_order: [
      "guard",
      "declaration",
      "script",
      "literal_output",
      "template_expression",
      "control",
      "script",
      "return_exit"
    ],
    caller_scope: {
      reads_locals: ["title", "notice", "items", "screen"],
      mutates_locals: ["notice", "items"],
      mutates_objects: ["screen.rendered"],
      globals: ["wphx_f6_trace"]
    },
    observable_effects: ["mixed_output_order", "escaped_output", "local_array_mutation", "object_mutation", "include_return_value"],
    evidence: {
      oracle_file: f6Manifest.build.oracle_files.find((file) => file.path === "wp-admin/admin-fixture.php"),
      generated_file: f6Manifest.build.generated_shell_files.find((file) => file.path === "wp-admin/admin-fixture.php")
    }
  },
  {
    id: "theme-style",
    source: "WPHX-107",
    mode: "context_bridge_template",
    original_path: "wp-content/themes/wphx-fixture/content.php",
    segment_order: [
      "guard",
      "declaration",
      "script",
      "literal_output",
      "template_expression",
      "include",
      "script",
      "return_exit"
    ],
    caller_scope: {
      reads_locals: ["post", "classes"],
      creates_locals: ["meta_return", "meta_line"],
      mutates_locals: ["post", "classes"],
      globals: ["wp_query", "wphx_f6_trace"],
      nested_includes: ["wp-content/themes/wphx-fixture/template-parts/meta.php"]
    },
    observable_effects: [
      "mixed_output_order",
      "nested_partial_include",
      "local_array_mutation",
      "global_state_mutation",
      "include_return_value"
    ],
    evidence: {
      oracle_file: f6Manifest.build.oracle_files.find((file) => file.path === "wp-content/themes/wphx-fixture/content.php"),
      generated_file: f6Manifest.build.generated_shell_files.find((file) => file.path === "wp-content/themes/wphx-fixture/content.php")
    }
  },
  {
    id: "theme-style-partial",
    source: "WPHX-107",
    mode: "context_bridge_template",
    original_path: "wp-content/themes/wphx-fixture/template-parts/meta.php",
    segment_order: ["script", "return_exit"],
    caller_scope: {
      reads_locals: ["post"],
      creates_locals: ["meta_line"],
      globals: ["wphx_f6_trace"]
    },
    observable_effects: ["partial_created_caller_local", "include_return_value"],
    evidence: {
      oracle_file: f6Manifest.build.oracle_files.find((file) => file.path === "wp-content/themes/wphx-fixture/template-parts/meta.php"),
      generated_file: f6Manifest.build.generated_shell_files.find((file) => file.path === "wp-content/themes/wphx-fixture/template-parts/meta.php")
    }
  },
  {
    id: "direct-script-include-side-effects",
    source: "WPHX-COMP-PHP-INCLUDE-SIDE-EFFECTS",
    mode: "direct_script_emission",
    original_path: "wp-includes/wphx-include-side-effects.php",
    segment_order: ["script", "literal_output", "return_exit"],
    caller_scope: {
      reads_locals: ["wphx_scope_marker", "wphx_local_marker"],
      globals: ["wphx_include_side_effects"]
    },
    observable_effects: ["top_level_side_effect", "output_buffering", "include_return_array", "include_once_idempotence"],
    evidence: {
      generated_file: includeManifest.generated_shell,
      emission_manifest: includeManifest.emission_manifest
    }
  }
];

for (const entry of cases) {
  requireTrue(entry.evidence.generated_file, `${entry.id} generated file evidence`);
  if (entry.source === "WPHX-107") {
    requireTrue(entry.evidence.oracle_file, `${entry.id} oracle file evidence`);
  }
}

const manifest = {
  schema: "wphx.wphx-php-template-segment-model.v1",
  issue,
  generated_at: recordedAt,
  runner: runnerPath,
  evidence_class: "compiler_strategy_model",
  artifact_scope: "file_segment_template_model",
  adr: inputRecord(adrPath),
  prerequisites: {
    f6_template_scope: inputRecord(f6ReceiptPath),
    f6_manifest: inputRecord(f6ManifestPath),
    include_side_effects: inputRecord(includeReceiptPath),
    include_manifest: inputRecord(includeManifestPath)
  },
  segment_kinds: segmentKinds,
  adoption_modes: adoptionModes,
  cases,
  required_manifest_fields: [
    "original_path",
    "upstream_source_hash",
    "segment_order",
    "adoption_mode",
    "caller_scope",
    "globals",
    "output_channels",
    "include_require_edges",
    "return_exit_behavior",
    "bootstrap_requirements",
    "raw_compatibility_segments",
    "unsupported_constructs"
  ],
  gates: [
    "segment manifest with upstream hash",
    "generated original-path shell or accepted backend output",
    "php -l",
    "generated-shape or segment snapshot",
    "oracle/candidate output, locals, globals, include timing, and return/exit probes",
    "source-map/debug policy for operator-facing files",
    "packaged-distribution evidence before installed claims",
    "explicit non-claims for unmodeled effects"
  ],
  claims: [
    "WPHX PHP has a named file-segment/template/caller-scope model before broad mixed PHP/HTML ownership claims.",
    "The model is anchored to F6 admin-style/theme-style caller-scope evidence and the WPHX include-side-effect direct-script evidence.",
    "Future WPHX PHP template work can classify files by segment kinds and adoption mode before deciding whether Adapter IR, direct script emission, HHX/HXX, or a broader backend is appropriate."
  ],
  non_claims: [
    "This does not claim generated ownership of existing WordPress mixed PHP/HTML files.",
    "This does not claim full theme, admin, feed, or block template ownership.",
    "This does not claim HHX/HXX is parity evidence for existing WordPress templates.",
    "This does not claim arbitrary Haxe expression lowering into PHP caller scope.",
    "This does not claim whole-file ownership for any WordPress file."
  ],
  validation_result: {
    status: "passed",
    f6_prerequisites_passed: true,
    include_side_effect_prerequisites_passed: true,
    segment_kinds_count: segmentKinds.length,
    adoption_modes_count: adoptionModes.length,
    classified_cases_count: cases.length,
    unsupported_constructs_block_claims: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-template-segment-model",
  issue,
  recorded_at: recordedAt,
  status: "passed",
  evidence_class: manifest.evidence_class,
  artifact_scope: manifest.artifact_scope,
  commands: ["npm run wphx:php:template-segment-model", "npm run wphx:php:template-segment-model:check"],
  artifacts: [
    { path: manifestPath, role: "WPHX PHP file-segment/template model manifest" },
    { path: adrPath, role: "ADR-005 file-segment/template/caller-scope model" },
    { path: runnerPath, role: "deterministic model runner" }
  ],
  manifest_sha256: `sha256:${sha256Text(manifestText)}`,
  validation_result: manifest.validation_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: manifestPath,
      receipt: receiptPath,
      classified_cases: cases.map((entry) => entry.id)
    },
    null,
    2
  )
);
