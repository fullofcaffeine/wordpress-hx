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
const compilerEvidenceIssue = {
  id: "wordpresshx-p5o",
  external_ref: "WPHX-COMP-PHP-SEGMENT-MODEL-COMPILER-EVIDENCE",
  title: "Link compiler segment plans into model"
};
const runnerPath = "tools/wphx-php/run-template-segment-model.mjs";
const manifestPath = "manifests/wphx-php/template-segment-model.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-template-segment-model.v1.json";
const compilerEvidenceReceiptPath = "receipts/compiler/wphx-comp-php-segment-model-compiler-evidence.v1.json";
const f6ManifestPath = "manifests/php-facade/wphx-107-f6-template-scope.v1.json";
const f6ReceiptPath = "receipts/operations/wphx-107-f6-template-scope.v1.json";
const includeManifestPath = "manifests/wphx-php/include-side-effects.v1.json";
const includeReceiptPath = "receipts/compiler/wphx-comp-php-include-side-effects.v1.json";
const adminStyleManifestPath = "manifests/wphx-php/template-segment-admin-style.v1.json";
const adminStyleReceiptPath = "receipts/compiler/wphx-comp-php-first-segment-shell.v1.json";
const nestedManifestPath = "manifests/wphx-php/template-segment-nested.v1.json";
const nestedReceiptPath = "receipts/compiler/wphx-comp-php-nested-segment-shell.v1.json";
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

function normalizedJson(value) {
  return JSON.stringify(value, null, 2);
}

function requireJsonEqual(actual, expected, label) {
  const actualJson = normalizedJson(actual);
  const expectedJson = normalizedJson(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch\nExpected:\n${expectedJson}\nActual:\n${actualJson}`);
  }
}

function normalizeCompilerSegmentPlan(plan) {
  return {
    path: plan.path,
    adapter: plan.adapter,
    adoption_mode: plan.adoption_mode,
    segments: plan.segments,
    caller_scope: plan.caller_scope,
    include_semantics: plan.include_semantics,
    observable_effects: plan.observable_effects,
    unsupported: plan.unsupported
  };
}

function emittedPlansFrom(manifest) {
  return (manifest.emission_manifest.segment_plans ?? []).map(normalizeCompilerSegmentPlan);
}

function generatedShellByOriginalPath(manifest, originalPath) {
  const suffix = `/${originalPath}`;
  const shells = manifest.generated_shells ?? [manifest.generated_shell];
  return shells.find((file) => file?.path.endsWith(suffix));
}

const f6Manifest = readJson(f6ManifestPath);
const f6Receipt = readJson(f6ReceiptPath);
const includeManifest = readJson(includeManifestPath);
const includeReceipt = readJson(includeReceiptPath);
const adminStyleManifest = readJson(adminStyleManifestPath);
const adminStyleReceipt = readJson(adminStyleReceiptPath);
const nestedManifest = readJson(nestedManifestPath);
const nestedReceipt = readJson(nestedReceiptPath);

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
requireTrue(adminStyleReceipt.validation_result.status === "passed", "admin segment shell status");
requireTrue(adminStyleReceipt.validation_result.unsupported_empty, "admin segment shell unsupported empty");
requireTrue(nestedReceipt.validation_result.status === "passed", "nested segment shell status");
requireTrue(nestedReceipt.validation_result.unsupported_empty, "nested segment shell unsupported empty");

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

const expectedCompilerSegmentPlans = [
  {
    path: "wp-includes/wphx-include-side-effects.php",
    adapter: "include-side-effects",
    adoption_mode: "direct_script_emission",
    segments: ["script", "literal_output", "return_exit"],
    caller_scope: [
      {
        kind: "reads_locals",
        names: ["wphx_scope_marker", "wphx_local_marker"]
      },
      {
        kind: "globals",
        names: ["wphx_include_side_effects"]
      }
    ],
    include_semantics: ["repeated_include", "include_once_second_return_true", "function_scope_include_locals"],
    observable_effects: ["top_level_side_effect", "output_buffering", "include_return_array", "include_once_idempotence"],
    unsupported: []
  },
  {
    path: "wp-admin/wphx-template-segment-admin.php",
    adapter: "template-segment-admin-style",
    adoption_mode: "compiler_emitted_segment_shell",
    segments: [
      "guard",
      "declaration",
      "script",
      "literal_output",
      "template_expression",
      "control",
      "script",
      "return_exit"
    ],
    caller_scope: [
      {
        kind: "reads_locals",
        names: ["title", "notice", "items", "screen"]
      },
      {
        kind: "mutates_locals",
        names: ["notice", "items"]
      },
      {
        kind: "mutates_objects",
        names: ["screen.rendered"]
      },
      {
        kind: "globals",
        names: ["wphx_segment_trace"]
      }
    ],
    include_semantics: [],
    observable_effects: [
      "guard_return",
      "mixed_output_order",
      "escaped_output",
      "local_array_mutation",
      "object_mutation",
      "global_trace",
      "include_return_value"
    ],
    unsupported: []
  },
  {
    path: "wp-admin/includes/wphx-template-nested-partial.php",
    adapter: "template-segment-nested-partial",
    adoption_mode: "compiler_emitted_segment_shell",
    segments: ["script", "literal_output", "template_expression", "return_exit"],
    caller_scope: [
      {
        kind: "reads_locals",
        names: ["items", "screen", "partial_marker"]
      },
      {
        kind: "mutates_locals",
        names: ["items"]
      },
      {
        kind: "mutates_objects",
        names: ["screen.partial"]
      },
      {
        kind: "globals",
        names: ["wphx_nested_segment_trace"]
      }
    ],
    include_semantics: [
      "nested_include",
      "include_return_value",
      "repeated_include",
      "include_once_second_return_true",
      "function_scope_include_locals"
    ],
    observable_effects: [
      "mixed_output_order",
      "escaped_output",
      "local_array_mutation",
      "object_mutation",
      "global_trace",
      "include_return_value"
    ],
    unsupported: []
  },
  {
    path: "wp-admin/wphx-template-nested-parent.php",
    adapter: "template-segment-nested-parent",
    adoption_mode: "compiler_emitted_segment_shell",
    segments: [
      "guard",
      "declaration",
      "script",
      "literal_output",
      "template_expression",
      "include",
      "script",
      "return_exit"
    ],
    caller_scope: [
      {
        kind: "reads_locals",
        names: ["title", "items", "screen"]
      },
      {
        kind: "creates_locals",
        names: ["partial_marker", "partial_return"]
      },
      {
        kind: "globals",
        names: ["wphx_nested_segment_trace"]
      }
    ],
    include_semantics: [
      "nested_include",
      "include_return_value",
      "repeated_include",
      "include_once_second_return_true",
      "function_scope_include_locals"
    ],
    observable_effects: ["guard_return", "mixed_output_order", "escaped_output", "global_trace", "include_return_value"],
    unsupported: []
  }
];

const compilerSegmentPlans = [
  ...emittedPlansFrom(includeManifest),
  ...emittedPlansFrom(adminStyleManifest),
  ...emittedPlansFrom(nestedManifest)
];

requireJsonEqual(compilerSegmentPlans, expectedCompilerSegmentPlans, "compiler-emitted segment plans");

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
      emission_manifest: includeManifest.emission_manifest,
      compiler_segment_plan: expectedCompilerSegmentPlans.find((plan) => plan.path === "wp-includes/wphx-include-side-effects.php")
    }
  },
  {
    id: "compiler-admin-style-segment-shell",
    source: "WPHX-COMP-PHP-FIRST-SEGMENT-SHELL",
    mode: "compiler_emitted_segment_shell",
    original_path: "wp-admin/wphx-template-segment-admin.php",
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
    caller_scope_facts: expectedCompilerSegmentPlans.find((plan) => plan.path === "wp-admin/wphx-template-segment-admin.php")
      .caller_scope,
    include_semantics: [],
    observable_effects: [
      "guard_return",
      "mixed_output_order",
      "escaped_output",
      "local_array_mutation",
      "object_mutation",
      "global_trace",
      "include_return_value"
    ],
    evidence: {
      generated_file: generatedShellByOriginalPath(adminStyleManifest, "wp-admin/wphx-template-segment-admin.php"),
      emission_manifest: adminStyleManifest.emission_manifest,
      compiler_segment_plan: expectedCompilerSegmentPlans.find((plan) => plan.path === "wp-admin/wphx-template-segment-admin.php")
    }
  },
  {
    id: "compiler-nested-partial-segment-shell",
    source: "WPHX-COMP-PHP-NESTED-SEGMENT-SHELL",
    mode: "compiler_emitted_segment_shell",
    original_path: "wp-admin/includes/wphx-template-nested-partial.php",
    segment_order: ["script", "literal_output", "template_expression", "return_exit"],
    caller_scope_facts: expectedCompilerSegmentPlans.find(
      (plan) => plan.path === "wp-admin/includes/wphx-template-nested-partial.php"
    ).caller_scope,
    include_semantics: [
      "nested_include",
      "include_return_value",
      "repeated_include",
      "include_once_second_return_true",
      "function_scope_include_locals"
    ],
    observable_effects: [
      "mixed_output_order",
      "escaped_output",
      "local_array_mutation",
      "object_mutation",
      "global_trace",
      "include_return_value"
    ],
    evidence: {
      generated_file: generatedShellByOriginalPath(nestedManifest, "wp-admin/includes/wphx-template-nested-partial.php"),
      emission_manifest: nestedManifest.emission_manifest,
      compiler_segment_plan: expectedCompilerSegmentPlans.find(
        (plan) => plan.path === "wp-admin/includes/wphx-template-nested-partial.php"
      )
    }
  },
  {
    id: "compiler-nested-parent-segment-shell",
    source: "WPHX-COMP-PHP-NESTED-SEGMENT-SHELL",
    mode: "compiler_emitted_segment_shell",
    original_path: "wp-admin/wphx-template-nested-parent.php",
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
    caller_scope_facts: expectedCompilerSegmentPlans.find((plan) => plan.path === "wp-admin/wphx-template-nested-parent.php")
      .caller_scope,
    include_semantics: [
      "nested_include",
      "include_return_value",
      "repeated_include",
      "include_once_second_return_true",
      "function_scope_include_locals"
    ],
    observable_effects: ["guard_return", "mixed_output_order", "escaped_output", "global_trace", "include_return_value"],
    evidence: {
      generated_file: generatedShellByOriginalPath(nestedManifest, "wp-admin/wphx-template-nested-parent.php"),
      emission_manifest: nestedManifest.emission_manifest,
      compiler_segment_plan: expectedCompilerSegmentPlans.find((plan) => plan.path === "wp-admin/wphx-template-nested-parent.php")
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
    include_manifest: inputRecord(includeManifestPath),
    admin_style_segment_shell: inputRecord(adminStyleReceiptPath),
    admin_style_manifest: inputRecord(adminStyleManifestPath),
    nested_segment_shell: inputRecord(nestedReceiptPath),
    nested_manifest: inputRecord(nestedManifestPath)
  },
  segment_kinds: segmentKinds,
  adoption_modes: adoptionModes,
  compiler_emitted_segment_plans: compilerSegmentPlans,
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
    "The model now consumes compiler-emitted segment plans for the direct-script include adapter, admin-style segment shell, nested parent shell, and nested partial shell.",
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
    compiler_segment_plan_evidence_count: compilerSegmentPlans.length,
    compiler_segment_plans_match_model: true,
    compiler_segment_plans_unsupported_empty: compilerSegmentPlans.every((plan) => plan.unsupported.length === 0),
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

const compilerEvidenceReceipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-segment-model-compiler-evidence",
  issue: compilerEvidenceIssue,
  recorded_at: recordedAt,
  status: "passed",
  evidence_class: "compiler_segment_plan_model_link",
  artifact_scope: "file_segment_template_model_compiler_evidence",
  commands: [
    "npm run wphx:php:template-segment-model",
    "npm run wphx:php:template-segment-model:check",
    "npm run wphx:php:include-side-effects:check",
    "npm run wphx:php:template-segment-admin-style:check",
    "npm run wphx:php:template-segment-nested:check",
    "npm run wphx:php:public-shell-snapshots:check"
  ],
  artifacts: [
    { path: manifestPath, role: "segment model manifest with compiler-emitted segment plans linked into cases" },
    { path: runnerPath, role: "model runner comparing emitted segment_plans against the expected model ledger" },
    { path: includeManifestPath, role: "direct-script include segment_plans evidence source" },
    { path: adminStyleManifestPath, role: "admin-style segment-shell segment_plans evidence source" },
    { path: nestedManifestPath, role: "nested parent and partial segment_plans evidence source" },
    { path: adrPath, role: "ADR-005 checkpoint note for compiler segment-plan evidence" },
    { path: "docs/operations/wphx-php-compiler.md", role: "compiler operations note for model-linked segment plans" },
    { path: "docs/operations/progress-matrix.md", role: "program progress checkpoint" }
  ],
  manifest_sha256: `sha256:${sha256Text(manifestText)}`,
  validation_result: {
    status: "passed",
    compiler_segment_plan_evidence_count: compilerSegmentPlans.length,
    compiler_segment_plans_match_model: true,
    compiler_segment_plans_unsupported_empty: true,
    classified_cases_count: cases.length,
    include_side_effect_prerequisites_passed: true,
    admin_style_prerequisites_passed: true,
    nested_prerequisites_passed: true,
    public_shell_snapshot_cases: 11
  },
  claims: [
    "The template-segment model consumes compiler-emitted segment_plans evidence for the include-side-effect direct script, admin-style segment shell, nested parent shell, and nested partial shell.",
    "The model runner validates original path, adapter, adoption mode, segment order, caller-scope facts, include semantics, observable effects, and unsupported=[] for all four compiler-emitted plans.",
    "The model distinguishes older bridge/context classifications from compiler-emitted segment metadata without broadening mixed-template or whole-file ownership claims."
  ],
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
writeOrCheck(compilerEvidenceReceiptPath, JSON.stringify(compilerEvidenceReceipt, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: manifestPath,
      receipt: receiptPath,
      compiler_evidence_receipt: compilerEvidenceReceiptPath,
      classified_cases: cases.map((entry) => entry.id)
    },
    null,
    2
  )
);
