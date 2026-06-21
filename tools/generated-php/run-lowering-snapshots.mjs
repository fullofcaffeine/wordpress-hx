#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import phpParser from "php-parser";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-w91.3.2",
  external_ref: "WPHX-700.02",
  title: "WPHX-700.02 — Add generated-PHP lowering snapshot lane"
};
const RECORDED_AT = "2026-06-21T19:45:00.000Z";
const GENERATOR = "tools/generated-php/run-lowering-snapshots.mjs";
const BUILD_ROOT = "build/generated-php/wphx-700-02";
const MANIFEST = "manifests/generated-php/wphx-700-02-lowering-snapshots.v1.json";
const RECEIPT = "receipts/generated-php/wphx-700-02-lowering-snapshots.v1.json";

const parser = new phpParser.Engine({
  parser: {
    extractDoc: true,
    php7: true,
    suppressErrors: false
  },
  ast: {
    withPositions: true,
    withSource: true
  }
});

const CASES = [
  {
    id: "php-lowering/mysqli-global-call",
    issue: "WPHX-305.19",
    evidence_class: "generated_shape",
    artifact_scope: "minimized_fixture",
    owner: "WPHX-700.02",
    compile: {
      args: [
        "-cp",
        "src",
        "-cp",
        "fixtures/wp-core/src",
        "-main",
        "wphx.fixtures.wp.core.WpdbMysqliGlobalLoweringProofEntry"
      ]
    },
    selected_outputs: [
      {
        generated: "lib/wphx/fixtures/wp/core/WpdbMysqliGlobalLoweringProofEntry.php",
        exact_golden: "tests/lowering/php/mysqli-global-call/expected/WpdbMysqliGlobalLoweringProofEntry.php",
        ast_contract: "tests/lowering/php/mysqli-global-call/expected/contract.ast.json"
      }
    ],
    sources: [
      "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbMysqliGlobalLoweringProofEntry.hx",
      "src/wphx/wp/db/native/MysqliGlobal.hx",
      "src/wphx/wp/db/native/MysqliHandle.hx",
      "src/wphx/wp/db/native/MysqliResult.hx"
    ],
    expectations: {
      required_global_calls: [
        {
          method: "fetchObject",
          function: "\\mysqli_fetch_object",
          arguments: ["$result"]
        },
        {
          method: "nativeQuery",
          function: "\\mysqli_query",
          arguments: ["$handle", "$query"]
        }
      ],
      forbidden_patterns: [
        {
          id: "class-static-mysqli-call",
          pattern: "::\\?mysqli_(query|fetch_object)\\s*\\("
        },
        {
          id: "haxe-mysqli-global-static-call",
          pattern: "MysqliGlobal::(query|fetchObject)\\s*\\("
        }
      ]
    }
  }
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 80
  }).trim();
}

function run(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 80
  });
  return {
    command: [commandName, ...commandArgs].map(quoteCommandArg).join(" "),
    status: result.status,
    signal: result.signal,
    stdout: normalizeOutput(result.stdout),
    stderr: normalizeOutput(result.stderr),
    error: result.error ? result.error.message : null
  };
}

function quoteCommandArg(value) {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function normalizeOutput(value) {
  return (value ?? "").trim().slice(0, 12000);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, text, refreshCommand) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== text) {
      throw new Error(`${path} is stale; run ${refreshCommand}`);
    }
    return { path, status: "passed" };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return { path, status: "passed" };
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(path);
    return [path];
  });
}

function phpFiles(root) {
  return walkFiles(root)
    .filter((path) => path.endsWith(".php"))
    .sort((a, b) => a.localeCompare(b));
}

function relativeFiles(root) {
  return walkFiles(root)
    .map((path) => relative(root, path))
    .sort((a, b) => a.localeCompare(b));
}

function compileCase(testCase, passName) {
  const out = join(BUILD_ROOT, testCase.id, passName);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const compile = run("haxe", [...testCase.compile.args, "-php", out]);
  return { out, compile };
}

function compareGeneratedTrees(firstRoot, secondRoot) {
  const firstFiles = relativeFiles(firstRoot);
  const secondFiles = relativeFiles(secondRoot);
  const missingInSecond = firstFiles.filter((path) => !secondFiles.includes(path));
  const missingInFirst = secondFiles.filter((path) => !firstFiles.includes(path));
  const changed = firstFiles
    .filter((path) => secondFiles.includes(path))
    .map((path) => {
      const first = readFileSync(join(firstRoot, path));
      const second = readFileSync(join(secondRoot, path));
      return {
        path,
        first_sha256: `sha256:${createHash("sha256").update(first).digest("hex")}`,
        second_sha256: `sha256:${createHash("sha256").update(second).digest("hex")}`,
        equal: first.equals(second)
      };
    })
    .filter((entry) => !entry.equal);
  return {
    deterministic: missingInSecond.length === 0 && missingInFirst.length === 0 && changed.length === 0,
    first_file_count: firstFiles.length,
    second_file_count: secondFiles.length,
    missing_in_second: missingInSecond,
    missing_in_first: missingInFirst,
    changed
  };
}

function lintPhp(root) {
  return phpFiles(root).map((path) => ({
    path: relative(".", path),
    ...run("php", ["-l", path])
  }));
}

function identifierName(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.name ?? value.loc?.source ?? null;
}

function sourceOf(node) {
  return node?.loc?.source ?? null;
}

function expressionSource(node) {
  if (!node) return null;
  if (node.kind === "variable") return `$${node.name}`;
  if (node.kind === "string") return node.raw ?? JSON.stringify(node.value);
  if (node.kind === "name") return node.loc?.source ?? node.name;
  if (node.kind === "staticlookup") {
    return `${expressionSource(node.what)}::${identifierName(node.offset)}`;
  }
  return sourceOf(node);
}

function callTarget(node) {
  if (node?.kind === "name") {
    const source = node.loc?.source ?? node.name;
    return {
      kind: source.startsWith("\\") ? "global_function" : "function",
      name: source,
      resolution: node.resolution ?? null
    };
  }
  if (node?.kind === "staticlookup") {
    return {
      kind: "static_method",
      name: `${expressionSource(node.what)}::${identifierName(node.offset)}`,
      resolution: null
    };
  }
  return {
    kind: node?.kind ?? null,
    name: sourceOf(node),
    resolution: null
  };
}

function projectReturnCall(method) {
  const statement = (method.body?.children ?? []).find((entry) => entry.kind === "return");
  if (!statement) return null;
  const expr = statement.expr;
  if (expr?.kind !== "call") {
    return {
      kind: expr?.kind ?? null,
      source: sourceOf(expr)
    };
  }
  return {
    kind: "call",
    target: callTarget(expr.what),
    arguments: (expr.arguments ?? []).map(expressionSource)
  };
}

function projectMethod(method) {
  return {
    name: identifierName(method.name),
    visibility: method.visibility ?? "public",
    static: method.isStatic === true,
    final: method.isFinal === true,
    abstract: method.isAbstract === true,
    returns_by_reference: method.byref === true,
    parameters: (method.arguments ?? []).map((param, index) => ({
      name: identifierName(param.name),
      position: index,
      by_reference: param.byref === true,
      variadic: param.variadic === true,
      type: sourceOf(param.type),
      default: sourceOf(param.value)
    })),
    return_statement: projectReturnCall(method)
  };
}

function projectBootRegistration(statement) {
  const expression = statement.expression;
  if (expression?.kind !== "call") return null;
  const target = callTarget(expression.what);
  if (target.name !== "Boot::registerClass") return null;
  return {
    target: target.name,
    arguments: (expression.arguments ?? []).map(expressionSource)
  };
}

function projectAst(source) {
  const ast = parser.parseCode(source);
  const namespaceNode = ast.children.find((node) => node.kind === "namespace") ?? ast;
  const children = namespaceNode.children ?? ast.children;
  const useItems = children
    .filter((node) => node.kind === "usegroup")
    .flatMap((node) => node.items ?? [])
    .map((item) => item.name);
  const classes = children
    .filter((node) => node.kind === "class")
    .map((classNode) => ({
      name: identifierName(classNode.name),
      final: classNode.isFinal === true,
      abstract: classNode.isAbstract === true,
      extends: sourceOf(classNode.extends),
      implements: (classNode.implements ?? []).map(sourceOf).filter(Boolean),
      methods: (classNode.body ?? []).filter((node) => node.kind === "method").map(projectMethod)
    }));
  const bootRegistrations = children
    .filter((node) => node.kind === "expressionstatement")
    .map(projectBootRegistration)
    .filter(Boolean);

  return {
    schema: "wphx.php-ast-contract.v1",
    namespace: namespaceNode.kind === "namespace" ? namespaceNode.name : null,
    uses: useItems,
    classes,
    boot_registrations: bootRegistrations
  };
}

function findMethodContract(contract, methodName) {
  for (const classContract of contract.classes ?? []) {
    const method = (classContract.methods ?? []).find((entry) => entry.name === methodName);
    if (method) return method;
  }
  return null;
}

function evaluateCallExpectations(contract, expectations) {
  return expectations.required_global_calls.map((required) => {
    const method = findMethodContract(contract, required.method);
    const target = method?.return_statement?.target;
    const actualArguments = method?.return_statement?.arguments ?? [];
    const passed =
      method != null &&
      method.return_statement?.kind === "call" &&
      target?.kind === "global_function" &&
      target.name === required.function &&
      JSON.stringify(actualArguments) === JSON.stringify(required.arguments);
    return {
      ...required,
      observed: {
        target_kind: target?.kind ?? null,
        function: target?.name ?? null,
        arguments: actualArguments
      },
      passed
    };
  });
}

function evaluateForbiddenPatterns(source, expectations) {
  return expectations.forbidden_patterns.map((forbidden) => {
    const regex = new RegExp(forbidden.pattern);
    return {
      id: forbidden.id,
      pattern: forbidden.pattern,
      detected: regex.test(source)
    };
  });
}

function normalizePhpSource(source) {
  return source.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

function runCase(testCase) {
  const first = compileCase(testCase, "first");
  const second = compileCase(testCase, "second");
  const compilePassed = first.compile.status === 0 && second.compile.status === 0;
  const determinism = compareGeneratedTrees(first.out, second.out);
  const lint = lintPhp(first.out);
  const lintPassed = lint.every((entry) => entry.status === 0);
  const selectedOutputs = testCase.selected_outputs.map((selected) => {
    const generatedPath = join(first.out, selected.generated);
    const source = normalizePhpSource(readFileSync(generatedPath, "utf8"));
    const contract = projectAst(source);
    const contractText = JSON.stringify(contract, null, 2) + "\n";
    const exactText = source.endsWith("\n") ? source : `${source}\n`;
    const callExpectations = evaluateCallExpectations(contract, testCase.expectations);
    const forbiddenPatterns = evaluateForbiddenPatterns(source, testCase.expectations);
    const exactGolden = writeOrCheck(selected.exact_golden, exactText, "npm run generated-php:lowering-snapshots");
    const astContract = writeOrCheck(selected.ast_contract, contractText, "npm run generated-php:lowering-snapshots");
    return {
      generated: relative(".", generatedPath),
      bytes: statSync(generatedPath).size,
      sha256: sha256File(generatedPath),
      exact_golden: exactGolden,
      ast_contract: astContract,
      required_global_calls: callExpectations,
      forbidden_patterns: forbiddenPatterns,
      passed:
        callExpectations.every((entry) => entry.passed) &&
        forbiddenPatterns.every((entry) => !entry.detected)
    };
  });
  return {
    id: testCase.id,
    issue: testCase.issue,
    evidence_class: testCase.evidence_class,
    artifact_scope: testCase.artifact_scope,
    owner: testCase.owner,
    compile: {
      first: first.compile,
      second: second.compile,
      passed: compilePassed
    },
    compile_twice: determinism,
    php_lint: lint,
    selected_outputs: selectedOutputs,
    sources: testCase.sources.map(inputRecord),
    validation_result: {
      status:
        compilePassed &&
        determinism.deterministic &&
        lintPassed &&
        selectedOutputs.every((entry) => entry.passed)
          ? "passed"
          : "failed",
      compile_passed: compilePassed,
      compile_twice_deterministic: determinism.deterministic,
      php_lint_passed: lintPassed,
      exact_goldens_passed: selectedOutputs.every((entry) => entry.exact_golden.status === "passed"),
      ast_contracts_passed: selectedOutputs.every((entry) => entry.ast_contract.status === "passed"),
      call_shape_contracts_passed: selectedOutputs.every((entry) =>
        entry.required_global_calls.every((call) => call.passed)
      ),
      forbidden_patterns_absent: selectedOutputs.every((entry) =>
        entry.forbidden_patterns.every((pattern) => !pattern.detected)
      )
    }
  };
}

function buildManifest(results) {
  const toolchainLock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
  const selectedArtifacts = results.flatMap((result) =>
    result.selected_outputs.flatMap((output) => [output.exact_golden.path, output.ast_contract.path])
  );
  return {
    schema: "wphx.generated-php-lowering-snapshots.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: GENERATOR,
    evidence_class: "generated_shape",
    artifact_scope: "minimized_fixture",
    scope:
      "T0b generated-PHP lowering contracts. These snapshots prove generated PHP shape only; WordPress behavior parity remains owned by differential, ABI, plugin/drop-in, live database, and upstream PHPUnit lanes.",
    inputs: {
      toolchain_lock: inputRecord("toolchain.lock.json"),
      generator: inputRecord(GENERATOR),
      selected_snapshot_artifacts: selectedArtifacts.map(inputRecord)
    },
    toolchain: {
      haxe_version: command("haxe", ["--version"]),
      locked_haxe_version: toolchainLock.tools.haxe.version,
      php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
      php_cli_executable: toolchainLock.tools.php_cli.executable,
      node_version: process.version,
      php_parser: "php-parser"
    },
    cases: results,
    validation_result: {
      status: results.every((result) => result.validation_result.status === "passed") ? "passed" : "failed",
      case_count: results.length,
      generated_shape_cases: results.length,
      artifact_scope: "minimized_fixture",
      compile_twice_deterministic: results.every((result) => result.compile_twice.deterministic),
      php_lint_passed: results.every((result) => result.validation_result.php_lint_passed),
      exact_goldens_passed: results.every((result) => result.validation_result.exact_goldens_passed),
      ast_contracts_passed: results.every((result) => result.validation_result.ast_contracts_passed)
    }
  };
}

function buildReceipt(manifest) {
  return {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-700-02-generated-php-lowering-snapshots",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      {
        path: MANIFEST,
        role: "generated-PHP lowering snapshot manifest"
      },
      {
        path: RECEIPT,
        role: "generated-PHP lowering snapshot verification receipt"
      },
      {
        path: GENERATOR,
        role: "reusable generated-PHP snapshot runner"
      },
      {
        path: "tests/lowering/php/mysqli-global-call/expected/WpdbMysqliGlobalLoweringProofEntry.php",
        role: "exact generated-PHP golden for mysqli global-call lowering"
      },
      {
        path: "tests/lowering/php/mysqli-global-call/expected/contract.ast.json",
        role: "stable AST-normalized contract for mysqli global-call lowering"
      }
    ],
    verification_commands: [
      "npm run generated-php:lowering-snapshots",
      "npm run generated-php:lowering-snapshots:check",
      "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
      "npm run beads:validate",
      "npm run receipts:validate"
    ],
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    validation_result: manifest.validation_result
  };
}

try {
  const results = CASES.map(runCase);
  const manifest = buildManifest(results);
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receiptText = JSON.stringify(buildReceipt(manifest), null, 2) + "\n";

  if (manifest.validation_result.status !== "passed") {
    throw new Error(`Generated-PHP lowering snapshots failed: ${JSON.stringify(manifest.validation_result)}`);
  }

  writeOrCheck(MANIFEST, manifestText, "npm run generated-php:lowering-snapshots");
  writeOrCheck(RECEIPT, receiptText, "npm run generated-php:lowering-snapshots");

  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: MANIFEST,
        receipt: RECEIPT,
        case_count: manifest.validation_result.case_count,
        evidence_class: manifest.evidence_class,
        artifact_scope: manifest.artifact_scope,
        check_mode: checkOnly
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exit(1);
}
