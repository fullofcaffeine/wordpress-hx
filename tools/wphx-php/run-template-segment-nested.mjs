import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const issue = {
  id: "wordpresshx-97t",
  external_ref: "WPHX-COMP-PHP-NESTED-SEGMENT-SHELL",
  title: "Emit nested template segment shell"
};
const recordedAt = "2026-06-30T00:00:00.000Z";
const runnerPath = "tools/wphx-php/run-template-segment-nested.mjs";
const hxmlPath = "fixtures/wphx-php/template-segment-nested.hxml";
const outRoot = "build/wphx-php/template-segment-nested";
const generatedRoot = `${outRoot}/generated`;
const oracleRoot = "fixtures/wphx-php/oracle/template-segment-nested";
const generatedParent = `${generatedRoot}/wp-admin/wphx-template-nested-parent.php`;
const generatedPartial = `${generatedRoot}/wp-admin/includes/wphx-template-nested-partial.php`;
const oracleParent = `${oracleRoot}/wp-admin/wphx-template-nested-parent.php`;
const oraclePartial = `${oracleRoot}/wp-admin/includes/wphx-template-nested-partial.php`;
const emissionManifestPath = `${generatedRoot}/wphx-php-emission.v1.json`;
const probePath = `${outRoot}/probe.php`;
const manifestPath = "manifests/wphx-php/template-segment-nested.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-nested-segment-shell.v1.json";

const expectedPatterns = {
  parent: [
    "if (!defined('ABSPATH'))",
    "function wphx_nested_segment_escape($value)",
    "$partial_marker = 'from-parent';",
    "include __DIR__ . '/includes/wphx-template-nested-partial.php'",
    "<section class=\"wphx-nested\" data-screen=\"<?php echo wphx_nested_segment_escape($screen->id); ?>\">",
    "'marker' => 'segment:NESTED-PARENT'"
  ],
  partial: [
    "$GLOBALS['wphx_nested_segment_trace'][] = array(",
    "$items[] = 'partial-mutated';",
    "$screen->partial = $partial_marker;",
    "<div class=\"wphx-partial\" data-marker=\"<?php echo wphx_nested_segment_escape($partial_marker); ?>\">",
    "'marker' => 'segment:NESTED-PARTIAL'"
  ]
};

const expectedCoreIrFeatures = [
  "segment.caller-scope-local",
  "segment.caller-scope-local-mutation",
  "segment.declaration",
  "segment.global-mutation",
  "segment.guard",
  "segment.include",
  "segment.include-return",
  "segment.literal-output",
  "segment.object-mutation",
  "segment.plan-printer",
  "segment.return",
  "segment.script",
  "segment.template-expression"
];

const segmentOrder = [
  "parent.guard",
  "parent.declaration",
  "parent.script",
  "parent.literal_output",
  "parent.template_expression",
  "parent.include",
  "partial.script",
  "partial.literal_output",
  "partial.template_expression",
  "partial.return_exit",
  "parent.script",
  "parent.return_exit"
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256Text(readFileSync(path));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run without --check to generate it`);
    }
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`${path} is stale; run without --check to refresh it`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function assertValue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeProbe() {
  mkdirSync(dirname(probePath), { recursive: true });
  writeFileSync(
    probePath,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );
$mode = $argv[2] ?? 'parent-normal';
$parent = $root . '/wp-admin/wphx-template-nested-parent.php';
$partial = $root . '/wp-admin/includes/wphx-template-nested-partial.php';

function wphx_prepare_nested_segment_root( $parent ) {
\tif ( ! defined( 'ABSPATH' ) ) {
\t\tdefine( 'ABSPATH', dirname( $parent, 2 ) . '/' );
\t}
}

function wphx_nested_segment_state( $title_value = 'Nested & Parent' ) {
\t$GLOBALS['wphx_nested_segment_trace'] = array();
\treturn array(
\t\t'title' => $title_value,
\t\t'items' => array( 'alpha', 'beta <two>' ),
\t\t'screen' => (object) array( 'id' => 'dashboard', 'partial' => false ),
\t);
}

function wphx_parent_observation( $parent, $title_value = 'Nested & Parent' ) {
\twphx_prepare_nested_segment_root( $parent );
\t$state = wphx_nested_segment_state( $title_value );
\t$title = $state['title'];
\t$items = $state['items'];
\t$screen = $state['screen'];

\tob_start();
\t$return = include $parent;
\t$output = ob_get_clean();

\treturn array(
\t\t'returnValue' => $return,
\t\t'output' => $output,
\t\t'locals' => array(
\t\t\t'title' => $title,
\t\t\t'items' => $items,
\t\t\t'screen' => array( 'id' => $screen->id, 'partial' => $screen->partial ),
\t\t),
\t\t'trace' => $GLOBALS['wphx_nested_segment_trace'],
\t\t'functions' => array(
\t\t\t'escape' => function_exists( 'wphx_nested_segment_escape' ),
\t\t),
\t);
}

function wphx_parent_include_once_observation( $parent ) {
\twphx_prepare_nested_segment_root( $parent );
\t$state = wphx_nested_segment_state();
\t$title = $state['title'];
\t$items = $state['items'];
\t$screen = $state['screen'];

\tob_start();
\t$first = include_once $parent;
\t$first_output = ob_get_clean();
\tob_start();
\t$second = include_once $parent;
\t$second_output = ob_get_clean();

\treturn array(
\t\t'firstReturn' => $first,
\t\t'secondReturn' => $second,
\t\t'firstOutput' => $first_output,
\t\t'secondOutput' => $second_output,
\t\t'locals' => array(
\t\t\t'items' => $items,
\t\t\t'screen' => array( 'id' => $screen->id, 'partial' => $screen->partial ),
\t\t),
\t\t'trace' => $GLOBALS['wphx_nested_segment_trace'],
\t);
}

function wphx_partial_observation( $partial, $mode ) {
\tif ( ! function_exists( 'wphx_nested_segment_escape' ) ) {
\t\tfunction wphx_nested_segment_escape( $value ) {
\t\t\treturn htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
\t\t}
\t}
\t$GLOBALS['wphx_nested_segment_trace'] = array();
\t$items = array( 'direct' );
\t$screen = (object) array( 'id' => 'partial-only', 'partial' => false );
\t$partial_marker = 'direct-marker';

\tif ( 'partial-include-once' === $mode ) {
\t\tob_start();
\t\t$first = include_once $partial;
\t\t$first_output = ob_get_clean();
\t\tob_start();
\t\t$second = include_once $partial;
\t\t$second_output = ob_get_clean();
\t\treturn array(
\t\t\t'firstReturn' => $first,
\t\t\t'secondReturn' => $second,
\t\t\t'firstOutput' => $first_output,
\t\t\t'secondOutput' => $second_output,
\t\t\t'locals' => array( 'items' => $items, 'screen' => array( 'id' => $screen->id, 'partial' => $screen->partial ) ),
\t\t\t'trace' => $GLOBALS['wphx_nested_segment_trace'],
\t\t);
\t}

\tob_start();
\t$first = include $partial;
\t$first_output = ob_get_clean();
\tob_start();
\t$second = include $partial;
\t$second_output = ob_get_clean();

\treturn array(
\t\t'firstReturn' => $first,
\t\t'secondReturn' => $second,
\t\t'firstOutput' => $first_output,
\t\t'secondOutput' => $second_output,
\t\t'locals' => array( 'items' => $items, 'screen' => array( 'id' => $screen->id, 'partial' => $screen->partial ) ),
\t\t'trace' => $GLOBALS['wphx_nested_segment_trace'],
\t);
}

switch ( $mode ) {
\tcase 'guard':
\t\tob_start();
\t\t$return = include $parent;
\t\t$output = ob_get_clean();
\t\t$result = array( 'returnValue' => $return, 'output' => $output );
\t\tbreak;
\tcase 'parent-normal':
\t\t$result = wphx_parent_observation( $parent );
\t\tbreak;
\tcase 'parent-repeated':
\t\t$result = array(
\t\t\t'first' => wphx_parent_observation( $parent ),
\t\t\t'second' => wphx_parent_observation( $parent ),
\t\t);
\t\tbreak;
\tcase 'parent-include-once':
\t\t$result = wphx_parent_include_once_observation( $parent );
\t\tbreak;
\tcase 'function-scope':
\t\t$result = wphx_parent_observation( $parent, 'Function Scope' );
\t\tbreak;
\tcase 'partial-repeated':
\tcase 'partial-include-once':
\t\t$result = wphx_partial_observation( $partial, $mode );
\t\tbreak;
\tdefault:
\t\tthrow new RuntimeException( 'Unknown mode ' . $mode );
}

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\\n";
`
  );
}

function runProbe(root, mode) {
  return JSON.parse(command("php", [probePath, root, mode]));
}

function validateParentObservation(observation, label, title = "Nested & Parent") {
  assertJsonEqual(
    observation.returnValue,
    {
      kind: "nested-parent",
      partial: {
        kind: "nested-partial",
        marker: "segment:NESTED-PARTIAL",
        localMarker: "from-parent",
        itemCount: 3
      },
      itemCount: 3,
      marker: "segment:NESTED-PARENT"
    },
    `${label} return value`
  );
  assertValue(observation.output.includes("<section class=\"wphx-nested\""), `${label} missing parent output`);
  assertValue(observation.output.includes("<div class=\"wphx-partial\""), `${label} missing partial output`);
  assertValue(observation.output.includes("segment:NESTED-PARTIAL"), `${label} missing partial marker output`);
  assertJsonEqual(observation.locals.title, title, `${label} title local`);
  assertJsonEqual(observation.locals.items, ["alpha", "beta <two>", "partial-mutated"], `${label} mutated items`);
  assertJsonEqual(observation.locals.screen, { id: "dashboard", partial: "from-parent" }, `${label} mutated screen`);
  assertJsonEqual(
    observation.trace.map((entry) => entry.event),
    ["parent:begin", "partial:begin", "partial:end", "parent:end"],
    `${label} trace order`
  );
  assertJsonEqual(observation.functions, { escape: true }, `${label} functions`);
}

function validatePartialRepeated(observation, label, includeOnce) {
  assertJsonEqual(observation.firstReturn.kind, "nested-partial", `${label} first return kind`);
  assertJsonEqual(observation.firstReturn.itemCount, 2, `${label} first item count`);
  assertValue(observation.firstOutput.includes("<div class=\"wphx-partial\""), `${label} missing first output`);
  if (includeOnce) {
    assertJsonEqual(observation.secondReturn, true, `${label} second include_once return`);
    assertJsonEqual(observation.secondOutput, "", `${label} second include_once output`);
    assertJsonEqual(observation.locals.items, ["direct", "partial-mutated"], `${label} include_once items`);
    assertJsonEqual(observation.trace.map((entry) => entry.event), ["partial:begin", "partial:end"], `${label} include_once trace`);
  } else {
    assertJsonEqual(observation.secondReturn.kind, "nested-partial", `${label} second return kind`);
    assertJsonEqual(observation.secondReturn.itemCount, 3, `${label} second item count`);
    assertValue(observation.secondOutput.includes("<div class=\"wphx-partial\""), `${label} missing second output`);
    assertJsonEqual(observation.locals.items, ["direct", "partial-mutated", "partial-mutated"], `${label} repeated items`);
    assertJsonEqual(
      observation.trace.map((entry) => entry.event),
      ["partial:begin", "partial:end", "partial:begin", "partial:end"],
      `${label} repeated trace`
    );
  }
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
command("haxe", [hxmlPath]);
command("php", ["-l", generatedParent]);
command("php", ["-l", generatedPartial]);
command("php", ["-l", oracleParent]);
command("php", ["-l", oraclePartial]);
writeProbe();

const generatedParentSource = readFileSync(generatedParent, "utf8");
const generatedPartialSource = readFileSync(generatedPartial, "utf8");
const missingParentPatterns = expectedPatterns.parent.filter((pattern) => !generatedParentSource.includes(pattern));
const missingPartialPatterns = expectedPatterns.partial.filter((pattern) => !generatedPartialSource.includes(pattern));
if (missingParentPatterns.length > 0 || missingPartialPatterns.length > 0) {
  throw new Error(`Generated nested segment shell is missing patterns: ${JSON.stringify({ parent: missingParentPatterns, partial: missingPartialPatterns })}`);
}

const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));
const declarations = emissionManifest.files.flatMap((file) =>
  file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`)
);
const expectedDeclarations = [
  "wp-admin/includes/wphx-template-nested-partial.php:script:template-segment-nested-partial",
  "wp-admin/wphx-template-nested-parent.php:script:template-segment-nested-parent"
];
assertJsonEqual(declarations, expectedDeclarations, "emission declarations");
assertJsonEqual([...emissionManifest.core_ir_features].sort(), expectedCoreIrFeatures, "core IR features");
if (emissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
}

const modes = ["guard", "parent-normal", "parent-repeated", "parent-include-once", "function-scope", "partial-repeated", "partial-include-once"];
const observations = {
  oracle: Object.fromEntries(modes.map((mode) => [mode, runProbe(oracleRoot, mode)])),
  candidate: Object.fromEntries(modes.map((mode) => [mode, runProbe(generatedRoot, mode)]))
};

for (const mode of modes) {
  assertJsonEqual(observations.candidate[mode], observations.oracle[mode], `oracle/candidate ${mode} behavior`);
}

assertJsonEqual(observations.oracle.guard, { returnValue: "ABSPATH_REQUIRED", output: "" }, "oracle guard");
validateParentObservation(observations.oracle["parent-normal"], "oracle parent-normal");
validateParentObservation(observations.oracle["parent-repeated"].first, "oracle parent-repeated first");
validateParentObservation(observations.oracle["parent-repeated"].second, "oracle parent-repeated second");
validateParentObservation(observations.oracle["function-scope"], "oracle function-scope", "Function Scope");
assertJsonEqual(observations.oracle["parent-include-once"].secondReturn, true, "oracle parent include_once second return");
assertJsonEqual(observations.oracle["parent-include-once"].secondOutput, "", "oracle parent include_once second output");
assertJsonEqual(observations.oracle["parent-include-once"].locals.items, ["alpha", "beta <two>", "partial-mutated"], "oracle parent include_once locals");
validatePartialRepeated(observations.oracle["partial-repeated"], "oracle partial-repeated", false);
validatePartialRepeated(observations.oracle["partial-include-once"], "oracle partial-include-once", true);

const manifest = {
  schema: "wphx.wphx-php-template-segment-nested.v1",
  issue,
  generated_at: recordedAt,
  runner: runnerPath,
  hxml: hxmlPath,
  evidence_class: "compiler_emitted_nested_segment_shell",
  artifact_scope: "minimized_nested_admin_style_template_segment_fixture",
  generated_shells: [inputRecord(generatedParent), inputRecord(generatedPartial)],
  oracle_shells: [inputRecord(oracleParent), inputRecord(oraclePartial)],
  emission_manifest: {
    ...inputRecord(emissionManifestPath),
    declarations: expectedDeclarations,
    core_ir_features: expectedCoreIrFeatures,
    unsupported_empty: true
  },
  segment_plan: {
    original_paths: [
      "wp-admin/wphx-template-nested-parent.php",
      "wp-admin/includes/wphx-template-nested-partial.php"
    ],
    adoption_mode: "compiler_emitted_segment_shell",
    segment_order: segmentOrder,
    caller_scope: {
      parent_reads_locals: ["title", "items", "screen"],
      parent_creates_locals: ["partial_marker", "partial_return"],
      partial_reads_locals: ["items", "screen", "partial_marker"],
      partial_mutates_locals: ["items"],
      partial_mutates_objects: ["screen.partial"],
      globals: ["wphx_nested_segment_trace"]
    },
    include_semantics: ["nested_include", "repeated_include", "include_once_second_return_true", "function_scope_include_locals"],
    observable_effects: ["guard_return", "mixed_output_order", "escaped_output", "local_array_mutation", "object_mutation", "global_trace", "include_return_value"]
  },
  generated_shape: {
    exact_patterns: expectedPatterns,
    php_lint: "passed"
  },
  observations,
  claims: [
    "WPHX PHP emits a compiler-generated original-path parent template segment shell plus generated nested partial shell.",
    "The generated parent includes the generated partial through the original-path directory relationship and preserves caller-scope locals.",
    "Oracle and candidate behavior match for ordered output, nested include return values, repeated include, include_once second return behavior, caller local mutation, object mutation, global trace order, and function-scope include locals."
  ],
  non_claims: [
    "This does not claim generated ownership of existing WordPress mixed PHP/HTML files.",
    "This does not claim broad theme, admin, feed, or block template ownership.",
    "This does not claim HHX/HXX parity for existing Core templates.",
    "This does not claim arbitrary Haxe expression lowering into PHP caller scope.",
    "This does not claim whole-file ownership for any WordPress file."
  ],
  validation_result: {
    status: "passed",
    php_lint: "passed",
    exact_shape_patterns_passed: true,
    core_ir_features_passed: true,
    unsupported_empty: true,
    oracle_candidate_behavior_match: true,
    guard_behavior_passed: true,
    nested_include_behavior_passed: true,
    include_once_behavior_passed: true,
    function_scope_include_behavior_passed: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-nested-segment-shell",
  issue,
  recorded_at: recordedAt,
  status: "passed",
  evidence_class: manifest.evidence_class,
  artifact_scope: manifest.artifact_scope,
  commands: ["npm run wphx:php:template-segment-nested", "npm run wphx:php:template-segment-nested:check"],
  artifacts: [
    { path: manifestPath, role: "WPHX PHP nested template segment shell manifest" },
    { path: runnerPath, role: "deterministic nested template segment shell runner" },
    { path: "src/wphx/compiler/php/WphxPhpCompiler.hx", role: "WPHX PHP compiler script adapter implementation" }
  ],
  manifest_sha256: sha256Text(manifestText),
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
      declarations: expectedDeclarations,
      segment_order: segmentOrder
    },
    null,
    2
  )
);
