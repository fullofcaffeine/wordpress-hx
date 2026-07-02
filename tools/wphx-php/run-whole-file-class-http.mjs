#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T20:00:00Z";
const ISSUE = {
  id: "wordpresshx-w91.24.4",
  external_ref: "WPHX-COMP-PHP-WHOLE-FILE-PILOT",
  title: "Emit a small WordPress file without stock public shape fallback"
};
const RUNNER = "tools/wphx-php/run-whole-file-class-http.mjs";
const HXML = "fixtures/wphx-php/whole-file-class-http.hxml";
const OUT_ROOT = "build/wphx-php/whole-file-class-http";
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PHP_FILE = `${GENERATED_ROOT}/wp-includes/class-http.php`;
const EMISSION_MANIFEST = `${GENERATED_ROOT}/wphx-php-emission.v1.json`;
const ORACLE_FILE = "../wordpress-develop/src/wp-includes/class-http.php";
const ORACLE_ROOT = `${OUT_ROOT}/oracle-root`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate-root`;
const PROBE_FILE = "probe.php";
const MANIFEST = "manifests/wphx-php/whole-file-class-http.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-whole-file-pilot.v1.json";
const REQUIRED_FEATURES = ["script.constant-concat", "script.deprecated-file-call", "script.magic-file", "script.require-once"];
const EXACT_PATTERNS = [
  "_deprecated_file( basename( __FILE__ ), '5.9.0', WPINC . '/class-wp-http.php' );",
  "require_once ABSPATH . WPINC . '/class-wp-http.php';"
];
const EXPECTED_SEGMENT_PLAN = {
  path: "wp-includes/class-http.php",
  adapter: "deprecated-class-http",
  adoption_mode: "whole_file_owned",
  segments: ["script", "require_once"],
  caller_scope: [
    { kind: "constants", names: ["ABSPATH", "WPINC"] },
    { kind: "functions", names: ["_deprecated_file", "basename"] }
  ],
  include_semantics: ["require_once_original_path", "include_once_idempotence"],
  observable_effects: ["deprecated_file_call", "required_class_wp_http"],
  unsupported: []
};

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

function fileRecord(path) {
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

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function prepareRoot(root, classHttpSource) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(`${root}/wp-includes`, { recursive: true });
  writeFileSync(`${root}/wp-includes/class-http.php`, classHttpSource);
  writeFileSync(
    `${root}/wp-includes/class-wp-http.php`,
    `<?php
$GLOBALS['wphx_required_wp_http'][] = basename(__FILE__);
if (!class_exists('WP_Http', false)) {
	class WP_Http {}
}
return 'required-wp-http';
`
  );
  writeFileSync(`${root}/${PROBE_FILE}`, probeSource(root));
}

function probeSource(root) {
  return `<?php
define('ABSPATH', ${JSON.stringify(`${process.cwd()}/${root}/`)});
define('WPINC', 'wp-includes');

function __($text) {
	return $text;
}

function _deprecated_file($file, $version, $replacement = '', $message = '') {
	$GLOBALS['wphx_deprecated_file'][] = array(
		'file' => $file,
		'version' => $version,
		'replacement' => $replacement,
		'message' => $message,
	);
}

$first = include ABSPATH . WPINC . '/class-http.php';
$second = include ABSPATH . WPINC . '/class-http.php';

$result = array(
	'first_include_return' => $first,
	'second_include_return' => $second,
	'deprecated_calls' => $GLOBALS['wphx_deprecated_file'],
	'required_wp_http' => $GLOBALS['wphx_required_wp_http'],
	'wp_http_class_loaded' => class_exists('WP_Http', false),
);

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\\n";
`;
}

function runProbe(root) {
  return JSON.parse(run("php", [`${root}/${PROBE_FILE}`]));
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_ROOT, { recursive: true });

  run("haxe", [HXML]);
  const phpLintOutput = run("php", ["-l", PHP_FILE]).trim();
  const generatedSource = readFileSync(PHP_FILE, "utf8");
  const missingPatterns = EXACT_PATTERNS.filter((pattern) => !generatedSource.includes(pattern));
  if (missingPatterns.length > 0) {
    throw new Error(`Generated whole-file pilot is missing exact patterns: ${JSON.stringify(missingPatterns)}`);
  }

  const emissionManifest = JSON.parse(readFileSync(EMISSION_MANIFEST, "utf8"));
  if ((emissionManifest.unsupported ?? []).length !== 0) {
    throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
  }
  const features = [...(emissionManifest.core_ir_features ?? [])].sort();
  const missingFeatures = REQUIRED_FEATURES.filter((feature) => !features.includes(feature));
  if (missingFeatures.length > 0) {
    throw new Error(`Missing whole-file pilot features: ${JSON.stringify(missingFeatures)}`);
  }
  const segmentPlan = (emissionManifest.segment_plans ?? []).find((plan) => plan.path === EXPECTED_SEGMENT_PLAN.path);
  assertJsonEqual(segmentPlan, EXPECTED_SEGMENT_PLAN, "segment plan");
  const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`)).sort();
  assertJsonEqual(declarations, ["script:deprecated-class-http"], "declarations");

  prepareRoot(ORACLE_ROOT, readFileSync(ORACLE_FILE, "utf8"));
  prepareRoot(CANDIDATE_ROOT, generatedSource);
  const oracleObserved = runProbe(ORACLE_ROOT);
  const candidateObserved = runProbe(CANDIDATE_ROOT);
  assertJsonEqual(candidateObserved, oracleObserved, "oracle/candidate whole-file behavior");

  const manifest = {
    schema: "wphx.wphx-php-whole-file-class-http.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "whole_file_pilot",
    artifact_scope: "wordpress_original_path_whole_file_owned_minimized",
    selected_wordpress_file: {
      path: "wp-includes/class-http.php",
      oracle: fileRecord(ORACLE_FILE),
      rationale: "Small deprecated compatibility include with file-scope _deprecated_file call and require_once timing."
    },
    inputs: [
      HXML,
      RUNNER,
      "src/wphx/compiler/php/WphxPhpCompiler.hx",
      "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wholefile/ClassHttpEntry.hx",
      "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wholefile/ClassHttpScript.hx"
    ].map(fileRecord),
    generated_file: {
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
      segment_plan: segmentPlan,
      unsupported: emissionManifest.unsupported,
      adapter_templates: emissionManifest.adapter_templates
    },
    behavior_probe: {
      oracle_root: ORACLE_ROOT,
      candidate_root: CANDIDATE_ROOT,
      probe_file: PROBE_FILE,
      oracle_observed: oracleObserved,
      candidate_observed: candidateObserved,
      status: "passed"
    },
    ownership: {
      state: "whole_file_owned",
      haxe_owned_semantics: ["deprecated compatibility include contract", "replacement path selection"],
      php_public_boundary_behavior: ["basename(__FILE__)", "_deprecated_file call payload", "ABSPATH/WPINC require_once path", "require_once idempotence"],
      fallbacks: [],
      non_claims: [
        "This does not claim whole-file ownership of wp-includes/class-wp-http.php or WP_Http.",
        "This does not claim live HTTP transport behavior, Requests integration, installed WordPress behavior, or broad deprecated-file ownership.",
        "This does not remove stock Haxe PHP private implementation fallbacks."
      ]
    },
    validation_result: {
      status: "passed",
      php_lint_passed: true,
      exact_contracts_passed: true,
      oracle_candidate_behavior_matched: true,
      unsupported_empty: true,
      no_haxe_bootstrap_bridge: true,
      no_haxe_helper_bridge: true,
      whole_file_owned_segment_plan: true,
      require_once_timing_observed: true
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-whole-file-pilot",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "whole_file_pilot",
    artifact_scope: "wordpress_original_path_whole_file_owned_minimized",
    commands: ["npm run wphx:php:whole-file-class-http", "npm run wphx:php:whole-file-class-http:check"],
    artifacts: [
      {
        path: RUNNER,
        role: "deterministic whole-file class-http oracle/candidate runner"
      },
      {
        path: HXML,
        role: "Reflaxe-backed WPHX PHP hxml for the whole-file pilot"
      },
      {
        path: MANIFEST,
        role: "whole-file pilot manifest"
      },
      {
        path: ORACLE_FILE,
        role: "WordPress 7.0 oracle source file"
      },
      {
        path: "src/wphx/compiler/php/WphxPhpCompiler.hx",
        role: "WPHX PHP compiler script adapter and generic require_once/magic-constant printer"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: manifest.validation_result,
    claims: [
      "WPHX PHP emits the complete original-path WordPress wp-includes/class-http.php file without stock Haxe PHP public shape fallback, helper bridge, or Haxe bootstrap.",
      "The generated file lints with php -l, records unsupported=[], records a whole_file_owned segment plan, and matches the WordPress 7.0 oracle for deprecated-file payload and require_once timing in the minimized probe.",
      "The compiler core now has bounded generic PHP-core support for require_once statements and magic constants used by this file-scope pilot."
    ],
    non_claims: manifest.ownership.non_claims
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: MANIFEST,
        receipt: RECEIPT,
        generated_file: PHP_FILE,
        observed: candidateObserved
      },
      null,
      2
    )
  );
}

main();
