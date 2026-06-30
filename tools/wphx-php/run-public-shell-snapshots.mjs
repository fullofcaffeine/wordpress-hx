#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import phpParser from "php-parser";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-0c7",
  external_ref: "WPHX-COMP-PHP-SNAPSHOTS",
  title: "Add WPHX-generated public-shell snapshot lane"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const RUNNER = "tools/wphx-php/run-public-shell-snapshots.mjs";
const BUILD_ROOT = "build/wphx-php/public-shell-snapshots";
const MANIFEST = "manifests/wphx-php/public-shell-snapshots.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-public-shell-snapshots.v1.json";

const parser = new phpParser.Engine({
  parser: { php7: true, suppressErrors: false },
  ast: { withPositions: false, withSource: false }
});

const CASES = [
  {
    id: "conditional-global-class-smoke",
    hxml: "fixtures/wphx-php/smoke.hxml",
    selected: "wp-includes/wphx-smoke.php",
    shell_shapes: ["global_function", "public_class", "conditional_declaration"],
    exact_patterns: [
      "if (!function_exists('wphx_smoke_add'))",
      "function wphx_smoke_add($a, $b)",
      "if (!class_exists('WPHX_Smoke_Counter', false))",
      "class WPHX_Smoke_Counter"
    ],
    ast_expect: {
      functions: ["wphx_smoke_add", "wphx_smoke_greeting"],
      classes: ["WPHX_Smoke_Counter"]
    }
  },
  {
    id: "facade-global-function",
    hxml: "fixtures/wphx-php/f1-facade.hxml",
    selected: "wp-includes/plugin.php",
    shell_shapes: ["global_function", "conditional_declaration", "top_level_bootstrap_side_effect"],
    exact_patterns: [
      "if (!defined('WPHX_F1_FACADE_BOOTSTRAPPED'))",
      "spl_autoload_register(function ($class)",
      "define('HAXE_CUSTOM_ERROR_HANDLER', true);",
      "if (!function_exists('add_filter'))",
      "function add_filter($hook_name, $callback, $priority = 10, $accepted_args = 1)"
    ],
    ast_expect: {
      functions: ["add_filter"]
    }
  },
  {
    id: "public-interface-class",
    hxml: "fixtures/wphx-php/f4-public-class.hxml",
    selected: "wp-includes/class-wphx-public-class.php",
    shell_shapes: ["public_interface", "public_class", "conditional_declaration", "top_level_bootstrap_side_effect"],
    exact_patterns: [
      "interface WPHX_Public_Interface",
      "class WPHX_Public_Base",
      "class WPHX_Public_Class extends WPHX_Public_Base implements WPHX_Public_Interface",
      "public static function factory($name)",
      "public function __construct($name, $meta = [])"
    ],
    ast_expect: {
      interfaces: ["WPHX_Public_Interface"],
      classes: ["WPHX_Public_Base", "WPHX_Public_Class"],
      methods: ["factory", "__construct", "describe", "get_meta"]
    }
  },
  {
    id: "by-reference-global-function",
    hxml: "fixtures/wphx-php/byref-arg.hxml",
    selected: "wp-includes/wphx-byref.php",
    shell_shapes: ["global_function", "by_reference_parameter", "conditional_declaration"],
    exact_patterns: [
      "if (!function_exists('wphx_byref_append'))",
      "function wphx_byref_append(&$value, $suffix = '-ref')"
    ],
    ast_expect: {
      functions: ["wphx_byref_append"],
      by_reference_parameters: [{ function: "wphx_byref_append", parameter: "value" }]
    }
  },
  {
    id: "protected-method-shell",
    hxml: "fixtures/wphx-php/wp-http-parser-helpers.hxml",
    selected: "wp-includes/class-wp-http.php",
    shell_shapes: ["public_class", "protected_method"],
    exact_patterns: [
      "class WP_Http",
      "protected static function parse_url($url)",
      "public static function processResponse($response)",
      "public static function chunkTransferDecode($body)"
    ],
    ast_expect: {
      classes: ["WP_Http"],
      methods: ["processResponse", "chunkTransferDecode", "parse_url"],
      protected_methods: ["parse_url"]
    }
  },
  {
    id: "native-array-mutation-shell",
    hxml: "fixtures/wphx-php/wp-http-build-cookie-header.hxml",
    selected: "wp-includes/class-wp-http.php",
    shell_shapes: ["public_class", "by_reference_parameter", "native_array_mutation", "top_level_bootstrap_side_effect"],
    exact_patterns: [
      "public static function buildCookieHeader(&$r)",
      "$r['cookies'][ $name ] = new WP_Http_Cookie(",
      "$r['headers']['cookie'] = $cookies_header;",
      "foreach ( (array) $r['cookies'] as $cookie )"
    ],
    ast_expect: {
      classes: ["WP_Http"],
      methods: ["buildCookieHeader"],
      by_reference_parameters: [{ method: "buildCookieHeader", parameter: "r", owner: "WP_Http" }]
    }
  },
  {
    id: "native-header-cookie-array-shell",
    hxml: "fixtures/wphx-php/wp-http-process-headers.hxml",
    selected: "wp-includes/class-wp-http.php",
    shell_shapes: ["public_class", "native_array_mutation", "top_level_bootstrap_side_effect"],
    exact_patterns: [
      "public static function processHeaders($headers, $url = '')",
      "$headers = array_splice( $headers, $i );",
      "$newheaders[ $key ][] = $value;",
      "$cookies[] = new WP_Http_Cookie( $value, $url );",
      "'response' => $response",
      "'headers'  => $newheaders",
      "'cookies'  => $cookies"
    ],
    ast_expect: {
      classes: ["WP_Http"],
      methods: ["processHeaders"]
    }
  },
  {
    id: "include-side-effect-script",
    hxml: "fixtures/wphx-php/include-side-effects.hxml",
    selected: "wp-includes/wphx-include-side-effects.php",
    shell_shapes: ["include_return_or_direct_file_scope_script", "top_level_include_side_effect", "output"],
    exact_patterns: [
      "$GLOBALS['wphx_include_side_effects'][] = array(",
      "echo 'wphx-include-output:'",
      "return array(",
      "'scope_marker' => isset($wphx_scope_marker) ? $wphx_scope_marker : null",
      "'local_marker' => isset($wphx_local_marker) ? $wphx_local_marker : null"
    ],
    ast_expect: {}
  },
  {
    id: "template-segment-admin-style",
    hxml: "fixtures/wphx-php/template-segment-admin-style.hxml",
    selected: "wp-admin/wphx-template-segment-admin.php",
    shell_shapes: ["template_segment_shell", "guard", "literal_output", "template_expression", "control", "include_return_or_direct_file_scope_script"],
    exact_patterns: [
      "if (!defined('ABSPATH'))",
      "function wphx_segment_escape($value)",
      "$GLOBALS['wphx_segment_trace'][] = array(",
      "<div class=\"wrap\" data-screen=\"<?php echo wphx_segment_escape($screen->id); ?>\">",
      "<?php foreach ($items as $index => $item) : ?>",
      "$items[] = 'admin-mutated';",
      "'marker' => 'segment:ADMIN'"
    ],
    ast_expect: {
      functions: ["wphx_segment_escape", "wphx_segment_row_class"]
    }
  },
  {
    id: "template-segment-nested-parent",
    hxml: "fixtures/wphx-php/template-segment-nested.hxml",
    selected: "wp-admin/wphx-template-nested-parent.php",
    shell_shapes: ["template_segment_shell", "nested_include", "guard", "literal_output", "template_expression", "include_return_or_direct_file_scope_script"],
    exact_patterns: [
      "if (!defined('ABSPATH'))",
      "function wphx_nested_segment_escape($value)",
      "$partial_marker = 'from-parent';",
      "include __DIR__ . '/includes/wphx-template-nested-partial.php'",
      "<section class=\"wphx-nested\" data-screen=\"<?php echo wphx_nested_segment_escape($screen->id); ?>\">",
      "'marker' => 'segment:NESTED-PARENT'"
    ],
    ast_expect: {
      functions: ["wphx_nested_segment_escape"]
    }
  },
  {
    id: "template-segment-nested-partial",
    hxml: "fixtures/wphx-php/template-segment-nested.hxml",
    selected: "wp-admin/includes/wphx-template-nested-partial.php",
    shell_shapes: ["template_segment_shell", "nested_partial", "literal_output", "template_expression", "include_return_or_direct_file_scope_script"],
    exact_patterns: [
      "$GLOBALS['wphx_nested_segment_trace'][] = array(",
      "$items[] = 'partial-mutated';",
      "$screen->partial = $partial_marker;",
      "<div class=\"wphx-partial\" data-marker=\"<?php echo wphx_nested_segment_escape($partial_marker); ?>\">",
      "'marker' => 'segment:NESTED-PARTIAL'"
    ],
    ast_expect: {}
  }
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
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

function readHxmlForRoot(hxml, outputRoot) {
  const lines = readFileSync(hxml, "utf8").split("\n");
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      if (line.startsWith("-D wphx_php_output=")) return `-D wphx_php_output=${outputRoot}`;
      if (line.startsWith("-D wphx_php_manifest=")) return `-D wphx_php_manifest=${outputRoot}/wphx-php-emission.v1.json`;
      return line;
    })
    .flatMap((line) => line.split(/\s+/));
}

function compileCase(fixtureCase, pass) {
  const outputRoot = `${BUILD_ROOT}/${pass}/${fixtureCase.id}/generated`;
  mkdirSync(outputRoot, { recursive: true });
  command("haxe", readHxmlForRoot(fixtureCase.hxml, outputRoot));
  return {
    outputRoot,
    selectedPath: join(outputRoot, fixtureCase.selected),
    manifestPath: join(outputRoot, "wphx-php-emission.v1.json")
  };
}

function astContract(source) {
  const ast = parser.parseCode(source);
  const contract = {
    functions: [],
    classes: [],
    interfaces: [],
    methods: [],
    protected_methods: [],
    by_reference_parameters: []
  };

  function nameOf(value) {
    if (typeof value === "string") return value;
    return value?.name ?? null;
  }

  function visit(node, owner = null) {
    if (!node || typeof node !== "object") return;
    switch (node.kind) {
      case "function": {
        const functionName = nameOf(node.name);
        if (functionName) contract.functions.push(functionName);
        for (const parameter of node.arguments ?? []) {
          if (parameter.byref) {
            contract.by_reference_parameters.push({ function: functionName, parameter: nameOf(parameter.name) });
          }
        }
        break;
      }
      case "class":
        if (nameOf(node.name)) contract.classes.push(nameOf(node.name));
        owner = { kind: "class", name: nameOf(node.name) };
        break;
      case "interface":
        if (nameOf(node.name)) contract.interfaces.push(nameOf(node.name));
        owner = { kind: "interface", name: nameOf(node.name) };
        break;
      case "method": {
        const methodName = nameOf(node.name);
        if (methodName) contract.methods.push(methodName);
        if (node.visibility === "protected" && methodName) contract.protected_methods.push(methodName);
        for (const parameter of node.arguments ?? []) {
          if (parameter.byref) {
            contract.by_reference_parameters.push({ method: methodName, parameter: nameOf(parameter.name), owner: owner?.name ?? null });
          }
        }
        break;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((item) => visit(item, owner));
      else if (value && typeof value === "object") visit(value, owner);
    }
  }

  visit(ast);
  for (const key of Object.keys(contract)) {
    contract[key].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  return contract;
}

function assertIncludes(actual, expected, label) {
  for (const item of expected ?? []) {
    const found = actual.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item) || candidate === item);
    if (!found) throw new Error(`Missing ${label}: ${JSON.stringify(item)} in ${JSON.stringify(actual)}`);
  }
}

function validateAstContract(contract, expected) {
  assertIncludes(contract.functions, expected.functions, "function");
  assertIncludes(contract.classes, expected.classes, "class");
  assertIncludes(contract.interfaces, expected.interfaces, "interface");
  assertIncludes(contract.methods, expected.methods, "method");
  assertIncludes(contract.protected_methods, expected.protected_methods, "protected method");
  assertIncludes(contract.by_reference_parameters, expected.by_reference_parameters, "by-reference parameter");
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

function main() {
  rmSync(BUILD_ROOT, { recursive: true, force: true });
  const results = [];

  for (const fixtureCase of CASES) {
    const first = compileCase(fixtureCase, "first");
    const second = compileCase(fixtureCase, "second");
    command("php", ["-l", first.selectedPath]);
    command("php", ["-l", second.selectedPath]);

    const firstSource = readFileSync(first.selectedPath, "utf8");
    const secondSource = readFileSync(second.selectedPath, "utf8");
    if (firstSource !== secondSource) {
      throw new Error(`Generated shell is not byte-stable for ${fixtureCase.id}`);
    }

    const missingPatterns = fixtureCase.exact_patterns.filter((pattern) => !firstSource.includes(pattern));
    if (missingPatterns.length > 0) {
      throw new Error(`Generated shell ${fixtureCase.id} is missing exact patterns: ${JSON.stringify(missingPatterns)}`);
    }

    const contract = astContract(firstSource);
    validateAstContract(contract, fixtureCase.ast_expect);
    const manifest = JSON.parse(readFileSync(first.manifestPath, "utf8"));
    if (manifest.unsupported.length !== 0) {
      throw new Error(`Generated shell ${fixtureCase.id} has unsupported constructs: ${JSON.stringify(manifest.unsupported)}`);
    }

    results.push({
      id: fixtureCase.id,
      evidence_class: "generated_shape",
      artifact_scope: fixtureCase.id.startsWith("native-") ? "linked_candidate" : "minimized_fixture",
      shell_shapes: fixtureCase.shell_shapes,
      hxml: fixtureCase.hxml,
      selected_file: first.selectedPath,
      bytes: firstSource.length,
      sha256: sha256Text(firstSource),
      byte_stable_across_clean_compiles: true,
      php_lint: "passed",
      exact_patterns: fixtureCase.exact_patterns,
      ast_contract: contract,
      manifest: inputRecord(first.manifestPath)
    });
  }

  const manifest = {
    schema: "wphx.wphx-php-public-shell-snapshots.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "generated_shape",
    artifact_scope: "minimized_fixture_and_linked_candidate",
    scope:
      "WPHX PHP public adapter shell generated-shape snapshots. These prove deterministic source shape, php -l validity, exact selected shell excerpts, and AST-normalized declarations; they do not prove WordPress behavior parity.",
    cases: results,
    shell_shape_coverage: {
      global_function: results.some((item) => item.shell_shapes.includes("global_function")),
      public_class: results.some((item) => item.shell_shapes.includes("public_class")),
      public_interface: results.some((item) => item.shell_shapes.includes("public_interface")),
      protected_method: results.some((item) => item.shell_shapes.includes("protected_method")),
      by_reference_parameter: results.some((item) => item.shell_shapes.includes("by_reference_parameter")),
      conditional_declaration: results.some((item) => item.shell_shapes.includes("conditional_declaration")),
      native_array_mutation: results.some((item) => item.shell_shapes.includes("native_array_mutation")),
      top_level_bootstrap_side_effect: results.some((item) => item.shell_shapes.includes("top_level_bootstrap_side_effect")),
      include_return_or_direct_file_scope_script: results.some((item) =>
        item.shell_shapes.includes("include_return_or_direct_file_scope_script")
      ),
      template_segment_shell: results.some((item) => item.shell_shapes.includes("template_segment_shell")),
      nested_template_segment_shell: results.some((item) => item.shell_shapes.includes("template_segment_shell") && item.shell_shapes.includes("nested_include"))
    },
    pending_shell_shape_gaps: [],
    validation_result: {
      status: "passed",
      clean_compile_passes: 2,
      case_count: results.length,
      all_selected_outputs_byte_stable: true,
      php_lint_passed: true,
      exact_contracts_passed: true,
      ast_contracts_passed: true,
      unsupported_empty: true
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-public-shell-snapshots",
    issue: ISSUE.external_ref,
    recorded_at: RECORDED_AT,
    status: "passed",
    artifacts: [
      { path: MANIFEST, role: "WPHX PHP public-shell generated-shape snapshot manifest" },
      { path: RUNNER, role: "deterministic WPHX PHP public-shell snapshot runner" }
    ],
    commands: [
      "npm run wphx:php:public-shell-snapshots",
      "npm run wphx:php:public-shell-snapshots:check"
    ],
    manifest_sha256: sha256Text(manifestText),
    validation_result: manifest.validation_result,
    claims: [
      "WPHX PHP public-shell generated shapes are compiled twice from clean roots and checked for byte stability.",
      "The snapshot lane covers current generated global function, public class/interface, protected method, by-reference parameter, conditional declaration, native array mutation, top-level bootstrap side-effect, and include-return/direct file-scope script shell shapes.",
      "Selected exact PHP excerpts and AST-normalized declarations are checked without treating generated shape as behavior parity."
    ],
    non_claims: [
      "This does not prove WordPress behavior parity.",
      "This does not claim arbitrary include-return or direct file-scope script emission beyond the bounded include side-effect fixture.",
      "This does not claim whole-file WP_Http ownership or broad template ownership."
    ]
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ status: "passed", output: MANIFEST, receipt: RECEIPT, cases: results.length }, null, 2));
}

main();
