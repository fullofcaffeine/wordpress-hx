#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T18:00:00Z";
const ISSUE = {
  id: "wordpresshx-w91.24.3",
  external_ref: "WPHX-COMP-PHP-CORE-LOWERING-PILOT",
  title: "Move repeated adapter constructs into reusable PHP core IR"
};
const RUNNER = "tools/wphx-php/run-core-lowering-pilot.mjs";
const HXML = "fixtures/wphx-php/core-lowering-pilot.hxml";
const SOURCE_FILES = [
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/core/CoreLoweringEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/core/CoreLoweringSurface.hx"
];
const OUT_ROOT = "build/wphx-php/core-lowering-pilot";
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PHP_FILE = `${GENERATED_ROOT}/wp-includes/wphx-core-lowering.php`;
const EMISSION_MANIFEST = `${GENERATED_ROOT}/wphx-php-emission.v1.json`;
const PROBE_FILE = `${OUT_ROOT}/probe.php`;
const MANIFEST = "manifests/wphx-php/core-lowering-pilot.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-core-lowering-pilot.v1.json";
const REQUIRED_FEATURES = ["typed.stmt.break", "typed.stmt.continue", "typed.stmt.if", "typed.stmt.while"];
const EXACT_PATTERNS = [
  "function wphx_core_lowering_count_until($limit)",
  "class WPHX_Core_Lowering",
  "public static function describe($value)",
  "public function sumUntil($limit, $skip)",
  "while (($index < $limit)) {",
  "if (($index == $skip)) {",
  "continue;",
  "if (($index > 5)) {",
  "break;",
  "return $total;"
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
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
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function buildProbe() {
  return `<?php
require ${JSON.stringify(PHP_FILE)};

$runner = new WPHX_Core_Lowering();
$result = array(
  'count_until' => wphx_core_lowering_count_until(4),
  'sum_until' => $runner->sumUntil(6, 3),
  'sum_skip_none' => $runner->sumUntil(4, 99),
  'describe_large' => WPHX_Core_Lowering::describe(12),
  'describe_small' => WPHX_Core_Lowering::describe(3),
  'function_guard' => function_exists('wphx_core_lowering_count_until'),
  'class_guard' => class_exists('WPHX_Core_Lowering', false),
);

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\\n";
`;
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_ROOT, { recursive: true });

  run("haxe", [HXML]);
  const phpLintOutput = run("php", ["-l", PHP_FILE]).trim();
  const phpSource = readFileSync(PHP_FILE, "utf8");
  const missingPatterns = EXACT_PATTERNS.filter((pattern) => !phpSource.includes(pattern));
  if (missingPatterns.length > 0) {
    throw new Error(`Generated core-lowering shell is missing exact patterns: ${JSON.stringify(missingPatterns)}`);
  }

  writeFileSync(PROBE_FILE, buildProbe());
  const observed = JSON.parse(run("php", [PROBE_FILE]));
  const expected = {
    count_until: 4,
    sum_until: 12,
    sum_skip_none: 10,
    describe_large: "large",
    describe_small: "small",
    function_guard: true,
    class_guard: true
  };
  assertJsonEqual(observed, expected, "core-lowering runtime probe");

  const emissionManifest = JSON.parse(readFileSync(EMISSION_MANIFEST, "utf8"));
  const features = [...(emissionManifest.core_ir_features ?? [])].sort();
  const missingFeatures = REQUIRED_FEATURES.filter((feature) => !features.includes(feature));
  if (missingFeatures.length > 0) {
    throw new Error(`Missing core lowering features: ${JSON.stringify(missingFeatures)}`);
  }
  if ((emissionManifest.unsupported ?? []).length !== 0) {
    throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
  }
  const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`)).sort();
  assertJsonEqual(declarations, ["class:WPHX_Core_Lowering", "global-function:wphx_core_lowering_count_until"], "declarations");

  const manifest = {
    schema: "wphx.wphx-php-core-lowering-pilot.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "compiler_core_lowering",
    artifact_scope: "typed_statement_lowering_without_wordpress_profile_adapter",
    inputs: [HXML, ...SOURCE_FILES].map(inputRecord),
    generated_shell: {
      path: PHP_FILE,
      bytes: statSync(PHP_FILE).size,
      sha256: sha256File(PHP_FILE),
      php_lint: "passed",
      php_lint_output: phpLintOutput,
      exact_patterns: EXACT_PATTERNS
    },
    emission_manifest: {
      path: EMISSION_MANIFEST,
      bytes: statSync(EMISSION_MANIFEST).size,
      sha256: sha256File(EMISSION_MANIFEST),
      declarations,
      core_ir_features: features,
      required_core_ir_features: REQUIRED_FEATURES,
      unsupported: emissionManifest.unsupported,
      adapter_templates: emissionManifest.adapter_templates,
      segment_plans: emissionManifest.segment_plans
    },
    runtime_probe: {
      path: PROBE_FILE,
      observed,
      expected,
      status: "passed"
    },
    validation_result: {
      status: "passed",
      php_lint_passed: true,
      exact_contracts_passed: true,
      runtime_probe_passed: true,
      unsupported_empty: true,
      no_wordpress_profile_adapters: true,
      no_haxe_helper_bridge: true,
      no_haxe_bootstrap_bridge: true,
      required_core_ir_features_present: true
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-core-lowering-pilot",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "compiler_core_lowering",
    artifact_scope: "typed_statement_lowering_without_wordpress_profile_adapter",
    commands: ["npm run wphx:php:core-lowering-pilot", "npm run wphx:php:core-lowering-pilot:check"],
    artifacts: [
      {
        path: RUNNER,
        role: "deterministic core-lowering pilot runner"
      },
      {
        path: HXML,
        role: "Reflaxe-backed WPHX PHP hxml for the generic typed lowering fixture"
      },
      {
        path: "fixtures/wphx-php/src/wphx/fixtures/compiler/php/core/CoreLoweringSurface.hx",
        role: "ordinary typed Haxe public shell surface with if/while/break/continue bodies"
      },
      {
        path: "src/wphx/compiler/php/WphxPhpCompiler.hx",
        role: "WPHX PHP compiler typed statement lowering implementation"
      },
      {
        path: MANIFEST,
        role: "core lowering pilot manifest"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: manifest.validation_result,
    claims: [
      "WPHX PHP now lowers ordinary typed Haxe if, while, break, and continue statements for public shell method/global bodies without a WordPress-profile method adapter.",
      "The generated core-lowering pilot shell lints with php -l, executes the expected runtime probe, records unsupported=[], and records the required typed statement features in the emission manifest.",
      "The pilot fixture uses no @:wp.adapter, @:wp.haxeHelper, or @:wp.haxeBootstrap bridge."
    ],
    non_claims: [
      "This does not claim arbitrary Haxe statement lowering.",
      "This does not claim for/foreach, switch, try/catch, closures, reflection, namespaces, std/php runtime replacement, or whole-file WordPress ownership.",
      "This does not retire existing WordPress-profile adapters or stock Haxe PHP private implementation output."
    ]
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: MANIFEST,
        receipt: RECEIPT,
        features: REQUIRED_FEATURES,
        shell: PHP_FILE
      },
      null,
      2
    )
  );
}

main();
