#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { normalizeGeneratedPhpForManifest } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.19",
  external_ref: "WPHX-305.19",
  title: "Scaffold wpdb PHP target global-function lowering proof"
};
const HXML = "fixtures/wp-core/wpdb-mysqli-global-lowering-proof.hxml";
const OUT_ROOT = "build/wp-core/wphx-305-19";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const PROOF_PHP = `${HAXE_OUT}/lib/wphx/fixtures/wp/core/WpdbMysqliGlobalLoweringProofEntry.php`;
const OUT = "manifests/wp-core/wphx-305-19-wpdb-mysqli-global-lowering-proof.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-19-wpdb-mysqli-global-lowering-proof.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-19-wpdb-mysqli-global-lowering-proof.v1.json";
const PREDECESSOR_MANIFEST = "manifests/wp-core/wphx-305-18-wpdb-mysqli-lowering-strategy.v1.json";
const PREDECESSOR_RECEIPT = "receipts/wp-core/wphx-305-18-wpdb-mysqli-lowering-strategy.v1.json";
const ROW_TRAVERSAL_RECEIPT = "receipts/wp-core/wphx-305-17-wpdb-mysqli-row-traversal-candidate.v1.json";
const RECORDED_AT = "2026-06-21T06:50:00.000Z";

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/db/native/MysqliHandle.hx",
  "src/wphx/wp/db/native/MysqliResult.hx",
  "src/wphx/wp/db/native/MysqliGlobal.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbMysqliGlobalLoweringProofEntry.hx"
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

function phpVersionFamily(value = command("php", ["-r", "echo PHP_VERSION;"])) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
}

function generatedPhpRecord(path) {
  const normalized = normalizeGeneratedPhpForManifest(readFileSync(path, "utf8"));
  return {
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized)
  };
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

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source)
  };
}

function analyzeProofPhp(path) {
  const source = readFileSync(path, "utf8");
  const evidenceLines = sourceLinesWithNeedles(source, ["mysqli_query", "mysqli_fetch_object"]);
  const directQuery = /return\s+\\mysqli_query\(\$handle,\s*\$query\);/.test(source);
  const directFetch = /return\s+\\mysqli_fetch_object\(\$result\);/.test(source);
  const classStaticCallDetected = /::\\?mysqli_(query|fetch_object)\s*\(/.test(source);
  const generatedRecord = generatedPhpRecord(path);
  return {
    path,
    bytes: generatedRecord.bytes,
    sha256: generatedRecord.sha256,
    evidence_lines: evidenceLines,
    direct_query_call_detected: directQuery,
    direct_fetch_object_call_detected: directFetch,
    class_static_call_detected: classStaticCallDetected,
    generated_php_shapes: {
      query: "\\mysqli_query($handle, $query)",
      fetch_object: "\\mysqli_fetch_object($result)"
    }
  };
}

function semverFromPath(path) {
  const match = /\/versions\/([0-9]+)\.([0-9]+)\.([0-9]+)\//.exec(path);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemverDesc(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return right.major - left.major || right.minor - left.minor || right.patch - left.patch;
}

function findHaxeStdPhpGlobal(preferredVersions) {
  const home = process.env.HOME ?? "/Users/fullofcaffeine";
  const searchRoots = [process.env.HAXE_STD_PATH, `${home}/haxe`].filter((path) => path && existsSync(path));
  if (searchRoots.length === 0) return null;
  const found = searchRoots
    .flatMap((searchRoot) => command("find", [searchRoot, "-path", "*/std/php/Global.hx"]).split("\n"))
    .filter(Boolean)
    .sort((left, right) => {
      const preferredLeft = preferredVersions.findIndex((version) => left.includes(`/versions/${version}/`));
      const preferredRight = preferredVersions.findIndex((version) => right.includes(`/versions/${version}/`));
      if (preferredLeft !== -1 || preferredRight !== -1) {
        if (preferredLeft === -1) return 1;
        if (preferredRight === -1) return -1;
        return preferredLeft - preferredRight;
      }
      return compareSemverDesc(semverFromPath(left), semverFromPath(right)) || left.localeCompare(right);
    });
  for (const path of found) {
    const source = readFileSync(path, "utf8");
    if (source.includes("@:phpGlobal") && source.includes("extern class Global")) {
      return {
        path,
        bytes: statSync(path).size,
        sha256: sha256File(path),
        contains_php_global_meta: true,
        contains_extern_global_class: true
      };
    }
  }
  return null;
}

function writeOrCheck(path, text) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== text) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-mysqli-global-lowering-proof`);
    }
    return;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-mysqli-global-lowering-proof",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "compiler-backend-proof",
      name: "wpdb mysqli @:phpGlobal receiver-less call proof",
      area: "wp-includes/class-wpdb.php and Haxe PHP target extern metadata",
      public_contract:
        "Typed Haxe mysqli externs can lower through the stock PHP target to reflection-friendly global PHP calls: mysqli_query($handle, $query) and mysqli_fetch_object($result). The committed WPHX-305.17 live candidate still uses WPHX_305_17_MysqliBoundary until the next wpdb candidate integrates these externs and reruns the live database gates."
    },
    ownership_state: "stock_haxe_php_global_extern_proven",
    upstream: {
      repo: "../wordpress-develop",
      paths: ["src/wp-includes/class-wpdb.php"],
      inherited_manifest: PREDECESSOR_MANIFEST
    },
    owned_paths: [...HAXE_SOURCES, "tools/wp-core/run-wpdb-mysqli-global-lowering-proof.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT_ROOT, OUT, OWNERSHIP, RECEIPT],
    bridge: {
      kind: "stock_haxe_php_target_metadata",
      reason:
        "The official PHP stdlib uses @:phpGlobal for global native functions. Applying the same metadata to a typed mysqli extern class emits receiver-less PHP globals and avoids Dynamic, untyped, raw php.Syntax.code, broad casts, and generated PHP postprocessing.",
      bounded_by: [
        "typed MysqliHandle/MysqliResult externs",
        "@:phpGlobal MysqliGlobal extern class",
        "generated PHP lint and call-shape proof",
        "WPHX-305.17 live database row-traversal receipt"
      ]
    },
    removal_gate: {
      condition:
        "Replace WPHX_305_17_MysqliBoundary in a live wpdb candidate by calling MysqliGlobal.query()/MysqliGlobal.fetchObject() from typed Haxe-owned/native-shell code, then rerun WPHX-305 live MySQL/MariaDB gates.",
      owner_issue: "WPHX-305.20",
      target_state: "verified_haxe_owned_php_global_mysqli_calls"
    },
    smell_fixes: [
      {
        description:
          "Reframed the WPHX-305.18 custom-target assumption: no custom PHP target is needed for this specific mysqli global-call shape because stock @:phpGlobal extern metadata emits idiomatic global calls.",
        behavior_policy: "no_observable_change"
      }
    ],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-mysqli-global-lowering-proof",
        "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
        "npm run wp:core:wphx-305-mysqli-lowering-strategy:check",
        "npm run wp:core:wphx-305-mysqli-row-traversal-candidate:check",
        "npm run format:haxe:check",
        "npm run haxe:escape-hatches:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-305-19-wpdb-mysqli-global-lowering-proof",
        "receipt:wphx-305-18-wpdb-mysqli-lowering-strategy",
        "receipt:wphx-305-17-wpdb-mysqli-row-traversal-candidate"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This is a compiler/backend proof and typed extern scaffold, not yet the live wpdb candidate integration. WPHX-305.20 owns replacing the generated boundary in the live candidate."
  };
}

rmSync(HAXE_OUT, { recursive: true, force: true });
mkdirSync(HAXE_OUT, { recursive: true });

const predecessorManifest = readJson(PREDECESSOR_MANIFEST);
const predecessorReceipt = readJson(PREDECESSOR_RECEIPT);
const rowTraversalReceipt = readJson(ROW_TRAVERSAL_RECEIPT);
const toolchainLock = readJson("toolchain.lock.json");
const haxeVersion = command("haxe", ["--version"]);
const compile = run("haxe", [HXML]);
const generatedPhpFiles = phpFiles(HAXE_OUT);
const phpLint = generatedPhpFiles.map((path) => ({
  path: relative(".", path),
  ...run("php", ["-l", path])
}));
const proof = analyzeProofPhp(PROOF_PHP);
const haxeStdPhpGlobal = findHaxeStdPhpGlobal([haxeVersion, toolchainLock.tools.haxe.version]);
const escapeAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const noEscapeHatches = escapeAudits.every((audit) => !audit.contains_dynamic && !audit.contains_untyped && !audit.contains_cast && !audit.contains_php_syntax_code);
const lintPassed = phpLint.every((entry) => entry.status === 0);
const predecessorPassed = predecessorReceipt.validation_result?.status === "passed";
const rowTraversalPassed = rowTraversalReceipt.validation_result?.status === "passed";
const directGlobalProofPassed =
  compile.status === 0 &&
  lintPassed &&
  proof.direct_query_call_detected &&
  proof.direct_fetch_object_call_detected &&
  !proof.class_static_call_detected &&
  noEscapeHatches &&
  haxeStdPhpGlobal != null;

const manifest = {
  schema: "wphx.wp-core-wpdb-mysqli-global-lowering-proof.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-mysqli-global-lowering-proof.mjs",
  inputs: {
    predecessor_manifest: inputRecord(PREDECESSOR_MANIFEST),
    predecessor_receipt: inputRecord(PREDECESSOR_RECEIPT),
    row_traversal_receipt: inputRecord(ROW_TRAVERSAL_RECEIPT),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    haxe_std_php_global: haxeStdPhpGlobal
  },
  inherited_context: {
    wphx_305_18_selected_strategy: predecessorManifest.selected_strategy,
    wphx_305_18_selected_lowering_spec: predecessorManifest.selected_lowering_spec,
    wphx_305_18_validation_result: predecessorReceipt.validation_result,
    wphx_305_17_validation_result: rowTraversalReceipt.validation_result
  },
  toolchain: {
    haxe_version: haxeVersion,
    locked_haxe_version: toolchainLock.tools.haxe.version,
    php_cli_version_family: phpVersionFamily(),
    php_cli_executable: toolchainLock.tools.php_cli.executable
  },
  proof: {
    compile,
    generated_php_files: generatedPhpFiles.map((path) => ({
      path: relative(".", path),
      ...generatedPhpRecord(path)
    })),
    php_lint: phpLint,
    proof_file: proof,
    source_escape_audit: escapeAudits
  },
  selected_integration_path: {
    id: "stock-haxe-php-global-externs",
    status: "proven_for_mysqli_query_and_fetch_object",
    decision:
      "Use @:phpGlobal typed externs on the stock Haxe PHP target for mysqli_query()/mysqli_fetch_object(). Reflaxe/custom PHP target work is not required for this specific global-call lowering gap unless later ABI surfaces expose target shapes the stock PHP backend cannot express."
  },
  boundary_decision: {
    current_boundary: "WPHX_305_17_MysqliBoundary",
    decision: "removable_in_next_live_wpdb_candidate",
    reason:
      "The proof emits direct global mysqli calls from typed Haxe externs, but the committed live wpdb candidate still needs a scoped integration slice and live database comparison before the generated PHP boundary can be removed."
  },
  remaining_gaps: [
    {
      id: "integrate-phpglobal-mysqli-externs-into-live-wpdb-candidate",
      owner: "WPHX-305.20",
      detail:
        "Replace WPHX_305_17_MysqliBoundary::native_query()/fetch_object() with typed @:phpGlobal MysqliGlobal.query()/fetchObject() integration in the live wpdb candidate shell and rerun live MySQL/MariaDB gates."
    },
    {
      id: "broader-php-target-idiom-audit-still-open",
      owner: "WPHX-305 and future PHP target worksets",
      detail:
        "This proof covers mysqli global functions only. Other WordPress ABI surfaces such as by-reference globals, conditional declarations, templates, and plugin reflection still need their own target-shape evidence."
    }
  ],
  validation_result: {
    status: directGlobalProofPassed && predecessorPassed && rowTraversalPassed ? "passed" : "failed",
    candidate_kind: "stock_haxe_php_global_extern_lowering_proof",
    selected_strategy: "stock-haxe-php-global-externs",
    direct_query_call_detected: proof.direct_query_call_detected,
    direct_fetch_object_call_detected: proof.direct_fetch_object_call_detected,
    class_static_call_detected: proof.class_static_call_detected,
    php_lint_passed: lintPassed,
    source_escape_hatches_found: !noEscapeHatches,
    predecessor_passed: predecessorPassed,
    row_traversal_passed: rowTraversalPassed
  },
  ownership_manifest: OWNERSHIP
};

if (manifest.validation_result.status !== "passed") {
  throw new Error(`WPHX-305.19 validation failed: ${JSON.stringify(manifest.validation_result)}`);
}

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-305-19-wpdb-mysqli-global-lowering-proof",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "wpdb mysqli @:phpGlobal lowering proof manifest"
    },
    {
      path: OWNERSHIP,
      role: "stock Haxe PHP global extern proof ownership manifest"
    },
    {
      path: "tools/wp-core/run-wpdb-mysqli-global-lowering-proof.mjs",
      role: "runnable compiler/backend proof generator and check-mode validator"
    },
    {
      path: "src/wphx/wp/db/native/MysqliGlobal.hx",
      role: "typed @:phpGlobal mysqli extern scaffold"
    },
    {
      path: "fixtures/wp-core/src/wphx/fixtures/wp/core/WpdbMysqliGlobalLoweringProofEntry.hx",
      role: "typed Haxe call-site proof fixture"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-mysqli-global-lowering-proof",
    "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
    "npm run wp:core:wphx-305-mysqli-lowering-strategy:check",
    "npm run wp:core:wphx-305-mysqli-row-traversal-candidate:check",
    "npm run format:haxe:check",
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
      selected_strategy: manifest.selected_integration_path.id,
      direct_query_call_detected: proof.direct_query_call_detected,
      direct_fetch_object_call_detected: proof.direct_fetch_object_call_detected,
      php_lint_passed: lintPassed
    },
    null,
    2
  )
);
