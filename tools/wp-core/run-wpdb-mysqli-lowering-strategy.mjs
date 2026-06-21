#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.18",
  external_ref: "WPHX-305.18",
  title: "Decide wpdb mysqli global-call lowering path"
};
const OUT_ROOT = "build/wp-core/wphx-305-18";
const PROBE_ROOT = `${OUT_ROOT}/stock-haxe-php-global-call-probes`;
const OUT = "manifests/wp-core/wphx-305-18-wpdb-mysqli-lowering-strategy.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-18-wpdb-mysqli-lowering-strategy.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-18-wpdb-mysqli-lowering-strategy.v1.json";
const PREDECESSOR_MANIFEST = "manifests/wp-core/wphx-305-17-wpdb-mysqli-row-traversal-candidate.v1.json";
const PREDECESSOR_RECEIPT = "receipts/wp-core/wphx-305-17-wpdb-mysqli-row-traversal-candidate.v1.json";
const RECORDED_AT = "2026-06-21T06:20:00.000Z";

const REFERENCE_FILES = [
  {
    id: "reflaxe-readme",
    path: "../haxe.compilerdev.reference/reflaxe/README.md",
    required_patterns: ["typed AST", "target language", "ReflectCompiler.AddCompiler"],
    evidence: "Reflaxe exists to translate Haxe typed AST into target-language output from macros."
  },
  {
    id: "ruby-reflaxe-compiler",
    path: "../haxe.ruby/src/reflaxe/ruby/RubyCompiler.hx",
    required_patterns: ["extends GenericCompiler", "RubyExpr"],
    evidence: "The Ruby target uses a GenericCompiler-backed Reflaxe compiler with a target AST."
  },
  {
    id: "ruby-receiverless-call-printer",
    path: "../haxe.ruby/src/reflaxe/ruby/ast/RubyASTPrinter.hx",
    required_patterns: ["RubyCall(receiver, name, args)", "receiver == null"],
    evidence: "The Ruby AST printer has a receiver-less call representation, the shape needed for PHP global functions."
  },
  {
    id: "elixir-call-builder",
    path: "../haxe.elixir.codex/src/reflaxe/elixir/ast/builders/CallExprBuilder.hx",
    required_patterns: ["buildCall", "TCall"],
    evidence: "The Elixir target centralizes typed call lowering from TCall into target-specific call forms."
  },
  {
    id: "rust-compiler-call-lowering",
    path: "../haxe.rust/src/reflaxe/rust/RustCompiler.hx",
    required_patterns: ["function compileCall", "TCall", "ECall"],
    evidence: "The Rust target keeps call lowering in compiler code instead of source-level string escapes."
  }
];

const LOCAL_CUSTOM_TARGET_PATHS = [
  "src/reflaxe/php",
  "src/reflaxe/wordpressphp",
  "src/wphx/compiler/php",
  "tools/php-target",
  "tools/reflaxe/php",
  "std/php/_std/wphx"
];

const PROBES = [
  {
    id: "stock-static-native-extern",
    description: "Stock Haxe PHP static extern functions with @:native global PHP names.",
    expected_shape: "Haxe should compile, but current stock PHP output qualifies calls through the extern class instead of emitting receiver-less PHP global calls.",
    source: `package probe;

class Main {
\tstatic function main():Void {
\t\tvar handle = new Mysqli();
\t\tvar result = MysqliFunctions.query(handle, "SELECT 1");
\t\tMysqliFunctions.fetchObject(result);
\t}
}

@:native("mysqli")
extern class Mysqli {
\tfunction new();
}

@:native("mysqli_result")
extern class MysqliResult {}

extern class MysqliFunctions {
\t@:native("mysqli_query")
\tstatic function query(handle:Mysqli, sql:String):MysqliResult;

\t@:native("mysqli_fetch_object")
\tstatic function fetchObject(result:MysqliResult):Null<NativeRow>;
}

typedef NativeRow = {};
`
  },
  {
    id: "stock-leading-backslash-native-extern",
    description: "Stock Haxe PHP static extern functions with leading-backslash @:native names.",
    expected_shape: "A leading PHP namespace slash still must not require an extern class receiver, and current stock output does not prove the needed direct global-call shape.",
    source: `package probe;

class Main {
\tstatic function main():Void {
\t\tvar handle = new Mysqli();
\t\tvar result = DirectMysqliFunctions.query(handle, "SELECT 1");
\t\tDirectMysqliFunctions.fetchObject(result);
\t}
}

@:native("mysqli")
extern class Mysqli {
\tfunction new();
}

@:native("mysqli_result")
extern class MysqliResult {}

extern class DirectMysqliFunctions {
\t@:native("\\\\mysqli_query")
\tstatic function query(handle:Mysqli, sql:String):MysqliResult;

\t@:native("\\\\mysqli_fetch_object")
\tstatic function fetchObject(result:MysqliResult):Null<NativeRow>;
}

typedef NativeRow = {};
`
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
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

function sourceLinesWithNeedles(source, needles) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((entry) => needles.some((needle) => entry.text.includes(needle)));
}

function analyzePhpSource(source) {
  const lines = sourceLinesWithNeedles(source, [
    "mysqli_query",
    "mysqli_fetch_object",
    "MysqliFunctions",
    "DirectMysqliFunctions"
  ]);
  const joinedLines = lines.map((entry) => entry.text).join("\n");
  const classStaticCallDetected = /::\\?mysqli_(query|fetch_object)\s*\(/.test(joinedLines);
  const directGlobalCallDetected = lines.some((entry) => {
    const compact = entry.text.replace(/\s+/g, " ");
    return /\bmysqli_(query|fetch_object)\s*\(/.test(compact) && !/::\\?mysqli_(query|fetch_object)\s*\(/.test(compact);
  });
  return {
    evidence_lines: lines,
    class_static_call_detected: classStaticCallDetected,
    direct_global_call_detected: directGlobalCallDetected
  };
}

function compileProbe(probe) {
  const root = `${PROBE_ROOT}/${probe.id}`;
  const sourcePath = `${root}/src/probe/Main.hx`;
  const outRoot = `${root}/out`;
  mkdirSync(dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, probe.source);

  const compile = run("haxe", ["-cp", `${root}/src`, "-main", "probe.Main", "-php", outRoot]);
  const generatedPhpFiles = phpFiles(outRoot);
  const combinedPhp = generatedPhpFiles.map((path) => readFileSync(path, "utf8")).join("\n");
  const lint = generatedPhpFiles.map((path) => ({
    path: relative(".", path),
    ...run("php", ["-l", path])
  }));
  const analysis = analyzePhpSource(combinedPhp);

  return {
    id: probe.id,
    description: probe.description,
    expected_shape: probe.expected_shape,
    source: {
      path: relative(".", sourcePath),
      bytes: statSync(sourcePath).size,
      sha256: sha256File(sourcePath),
      contains_dynamic: /\bDynamic\b/.test(probe.source),
      contains_untyped: /\buntyped\b/.test(probe.source),
      contains_php_syntax_code: /php\.Syntax\.code/.test(probe.source)
    },
    compile,
    generated_php_files: generatedPhpFiles.map((path) => ({
      path: relative(".", path),
      bytes: statSync(path).size,
      sha256: sha256File(path)
    })),
    php_lint: lint,
    ...analysis,
    verdict:
      compile.status === 0 && analysis.direct_global_call_detected && lint.every((entry) => entry.status === 0)
        ? "stock_target_emits_direct_global_calls"
        : "stock_target_does_not_prove_direct_global_calls"
  };
}

function referenceRecord(reference) {
  const source = readFileSync(reference.path, "utf8");
  const patternChecks = reference.required_patterns.map((pattern) => ({
    pattern,
    present: source.includes(pattern)
  }));
  return {
    id: reference.id,
    path: reference.path,
    bytes: statSync(reference.path).size,
    sha256: sha256File(reference.path),
    evidence: reference.evidence,
    pattern_checks: patternChecks,
    status: patternChecks.every((check) => check.present) ? "passed" : "failed"
  };
}

function inventoryPath(path) {
  return {
    path,
    exists: existsSync(path)
  };
}

function writeOrCheck(path, text) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== text) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-mysqli-lowering-strategy`);
    }
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-mysqli-lowering-strategy",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "compiler-strategy",
      name: "wpdb mysqli global PHP call lowering strategy",
      area: "wp-includes/class-wpdb.php and PHP target generation",
      public_contract:
        "WordPress-compatible wpdb PHP methods keep their reflection-visible public interface while typed Haxe owns query/fetch decision logic. Until a PHP target/reflaxe lowering emits receiver-less mysqli_query()/mysqli_fetch_object() calls directly, WPHX_305_17_MysqliBoundary remains the narrow generated PHP target-native boundary for those two native operations."
    },
    ownership_state: "compiler_strategy_selected_deferred",
    upstream: {
      repo: "../wordpress-develop",
      paths: ["src/wp-includes/class-wpdb.php"],
      inherited_manifest: PREDECESSOR_MANIFEST
    },
    owned_paths: [
      "tools/wp-core/run-wpdb-mysqli-lowering-strategy.mjs",
      OUT,
      OWNERSHIP,
      RECEIPT
    ],
    generated_paths: [OUT_ROOT, OUT, OWNERSHIP, RECEIPT],
    bridge: {
      kind: "compiler_pressure_record",
      reason:
        "The stock Haxe PHP target can type the mysqli handle/result values but currently lowers static extern calls through an extern-class receiver. That is not idiomatic WordPress PHP for mysqli_query()/mysqli_fetch_object(), and source-level PHP string escapes would violate the typed ownership boundary.",
      bounded_by: [
        "stock Haxe PHP extern probes",
        "Reflaxe/custom target references from sibling compiler repos",
        "WPHX_305_17_MysqliBoundary generated PHP target-native boundary",
        "WPHX-305.17 live MySQL/MariaDB row-traversal receipt"
      ]
    },
    removal_gate: {
      condition:
        "Replace WPHX_305_17_MysqliBoundary only after a PHP target/backend proof emits direct receiver-less mysqli_query()/mysqli_fetch_object() calls from typed Haxe and the WPHX-305 live database gates continue to pass.",
      owner_issue: "WPHX-305.19",
      target_state: "verified_haxe_owned_php_global_lowering"
    },
    smell_fixes: [
      {
        description:
          "Chose a compiler/backend fix over broader Dynamic, untyped, raw php.Syntax.code, or PHP postprocessing. This keeps the port as a real Haxe-owned implementation while preserving WordPress plugin-facing PHP.",
        behavior_policy: "no_observable_change"
      }
    ],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-mysqli-lowering-strategy",
        "npm run wp:core:wphx-305-mysqli-lowering-strategy:check",
        "npm run wp:core:wphx-305-mysqli-row-traversal-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-305-18-wpdb-mysqli-lowering-strategy",
        "receipt:wphx-305-17-wpdb-mysqli-row-traversal-candidate"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This artifact records a decision and proof path, not a generated wpdb behavior change. The next slice should scaffold the actual PHP target/reflaxe lowering proof."
  };
}

rmSync(PROBE_ROOT, { recursive: true, force: true });
mkdirSync(PROBE_ROOT, { recursive: true });

const predecessorManifest = readJson(PREDECESSOR_MANIFEST);
const predecessorReceipt = readJson(PREDECESSOR_RECEIPT);
const toolchainLock = readJson("toolchain.lock.json");
const probeResults = PROBES.map(compileProbe);
const referenceRecords = REFERENCE_FILES.map(referenceRecord);
const customTargetInventory = LOCAL_CUSTOM_TARGET_PATHS.map(inventoryPath);
const stockDirectLoweringProbe = probeResults.find((probe) => probe.id === "stock-static-native-extern");
const stockCanEmitDirectGlobalCalls =
  stockDirectLoweringProbe?.compile.status === 0 &&
  stockDirectLoweringProbe.direct_global_call_detected &&
  stockDirectLoweringProbe.php_lint.every((entry) => entry.status === 0);
const referenceEvidencePassed = referenceRecords.every((record) => record.status === "passed");
const predecessorPassed = predecessorReceipt.validation_result?.status === "passed";

const selectedStrategy = stockCanEmitDirectGlobalCalls
  ? {
      id: "stock-haxe-php-native-extern-global-call-lowering",
      status: "selected_available",
      decision:
        "The local stock Haxe PHP target emitted direct receiver-less mysqli global calls for the static extern probe; use the stock target path and remove the temporary boundary once live gates pass."
    }
  : {
      id: "reflaxe-or-custom-php-global-function-intrinsic",
      status: "selected_deferred",
      decision:
        "The stock Haxe PHP target does not prove direct receiver-less global mysqli_query()/mysqli_fetch_object() lowering. Select a narrow PHP target/reflaxe intrinsic for typed target-AST calls and keep WPHX_305_17_MysqliBoundary as the temporary ABI-safe boundary."
    };

const selectedLoweringSpec = {
  id: "typed-php-global-function-intrinsic-spec",
  status: stockCanEmitDirectGlobalCalls ? "satisfied_by_stock_probe" : "selected_for_custom_target_proof",
  typed_call_shape: [
    {
      haxe_owner: "wpdb::_do_query typed native execution path",
      callee: "mysqli_query",
      receiver: null,
      args: ["dbh:MysqliHandle", "query:String"],
      return_type: "MysqliResult"
    },
    {
      haxe_owner: "wpdb::query selected-row traversal path",
      callee: "mysqli_fetch_object",
      receiver: null,
      args: ["result:MysqliResult"],
      return_type: "Null<NativeRowObject>"
    }
  ],
  required_php_shape: ["mysqli_query( $dbh, $query )", "mysqli_fetch_object( $result )"],
  target_ast_requirement:
    "Represent PHP native functions as receiver-less calls in the PHP target AST, not as class-static extern method calls and not as source-level php.Syntax.code strings.",
  target_compatibility_requirement:
    "Emit idiomatic PHP globals so existing plugins, themes, reflection, stack traces, mysqli behavior, and wpdb replacement/drop-in expectations continue to observe WordPress-compatible PHP."
};

const rejectedOptions = [
  {
    id: "stock-static-externs",
    status: stockCanEmitDirectGlobalCalls ? "not_rejected_in_this_toolchain" : "rejected_for_now",
    reason:
      "The stock static extern probe compiles but does not prove direct receiver-less mysqli_query()/mysqli_fetch_object() global calls on the locked toolchain."
  },
  {
    id: "leading-backslash-native-name",
    status: "rejected_for_now",
    reason:
      "Adding a leading PHP namespace slash to @:native still does not create an owned receiver-less global function call representation."
  },
  {
    id: "php-syntax-code",
    status: "rejected",
    reason:
      "Raw php.Syntax.code would paste target PHP into Haxe strings and bypass typed Haxe ownership. It may only appear in a narrow documented boundary, not as the selected porting strategy."
  },
  {
    id: "ad-hoc-generated-php-postprocessor",
    status: "rejected",
    reason:
      "A text postprocessor would be fragile around namespaces, stack traces, source maps, and plugin-visible PHP; the lowering belongs in a typed target/backend layer."
  },
  {
    id: "broaden-types-with-dynamic-or-untyped",
    status: "rejected",
    reason:
      "The issue is target call shape, not Haxe type expressiveness. Dynamic or untyped would hide the boundary rather than prove safe PHP emission."
  }
];

const manifest = {
  schema: "wphx.wp-core-wpdb-mysqli-lowering-strategy.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-mysqli-lowering-strategy.mjs",
  inputs: {
    predecessor_manifest: inputRecord(PREDECESSOR_MANIFEST),
    predecessor_receipt: inputRecord(PREDECESSOR_RECEIPT),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    reference_repos: referenceRecords
  },
  inherited_context: {
    predecessor: {
      issue: predecessorManifest.issue,
      candidate_kind: predecessorManifest.validation_result?.candidate_kind ?? null,
      validation_result: predecessorManifest.validation_result,
      remaining_gap_ids: (predecessorManifest.remaining_gaps ?? []).map((gap) => gap.id)
    },
    predecessor_receipt_result: predecessorReceipt.validation_result
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: toolchainLock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    php_cli_executable: toolchainLock.tools.php_cli.executable
  },
  probes: probeResults,
  custom_target_inventory: customTargetInventory,
  selected_strategy: selectedStrategy,
  selected_lowering_spec: selectedLoweringSpec,
  rejected_options: rejectedOptions,
  remaining_gaps: [
    {
      id: "php-target-global-function-intrinsic-not-yet-implemented",
      owner: "WPHX-305.19",
      detail:
        "Scaffold or improve a PHP target path that lowers typed receiver-less calls to idiomatic mysqli_query()/mysqli_fetch_object() PHP without Dynamic, untyped, raw php.Syntax.code, broad casts, or postprocessing."
    },
    {
      id: "wpdb-generated-mysqli-boundary-still-temporary",
      owner: "WPHX-305",
      detail:
        "WPHX_305_17_MysqliBoundary remains the explicit two-method target-native boundary until direct global-call lowering is implemented and live database gates pass."
    },
    {
      id: "full-wpdb-and-dbdelta-ownership-not-yet-complete",
      owner: "WPHX-305",
      detail:
        "The query/fetch call shape is one compiler gap inside the broader wpdb/dbDelta/storage ownership track."
    }
  ],
  validation_result: {
    status:
      referenceEvidencePassed && predecessorPassed && probeResults.every((probe) => probe.source.contains_dynamic === false && probe.source.contains_untyped === false && probe.source.contains_php_syntax_code === false)
        ? "passed"
        : "failed",
    candidate_kind: "compiler_strategy_decision",
    selected_strategy: selectedStrategy.id,
    stock_direct_global_lowering_available: stockCanEmitDirectGlobalCalls,
    probes: probeResults.length,
    reference_records: referenceRecords.length,
    reference_evidence_passed: referenceEvidencePassed,
    predecessor_passed: predecessorPassed
  },
  ownership_manifest: OWNERSHIP
};

if (manifest.validation_result.status !== "passed") {
  throw new Error(`WPHX-305.18 validation failed: ${JSON.stringify(manifest.validation_result)}`);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-18-wpdb-mysqli-lowering-strategy",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "wpdb mysqli global-call lowering strategy manifest"
    },
    {
      path: OWNERSHIP,
      role: "compiler-strategy ownership manifest"
    },
    {
      path: "tools/wp-core/run-wpdb-mysqli-lowering-strategy.mjs",
      role: "runnable stock Haxe PHP lowering probe and strategy-decision generator"
    },
    {
      path: PREDECESSOR_MANIFEST,
      role: "inherited WPHX-305.17 mysqli row traversal candidate manifest"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-mysqli-lowering-strategy",
    "npm run wp:core:wphx-305-mysqli-lowering-strategy:check",
    "npm run wp:core:wphx-305-mysqli-row-traversal-candidate:check",
    "npm run haxe:escape-hatches:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      selected_strategy: selectedStrategy.id,
      stock_direct_global_lowering_available: stockCanEmitDirectGlobalCalls,
      probes: probeResults.length,
      reference_records: referenceRecords.length
    },
    null,
    2
  )
);
