#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T19:00:00Z";
const ISSUE = {
  id: "wordpresshx-w91.24.2",
  external_ref: "WPHX-COMP-PHP-RUNTIME-STDLIB-STRATEGY",
  title: "Borrow or adapt Haxe PHP runtime/std behavior"
};
const RUNNER = "tools/wphx-php/run-runtime-stdlib-strategy.mjs";
const OUT_ROOT = "build/wphx-php/runtime-stdlib-strategy";
const SRC_ROOT = `${OUT_ROOT}/src`;
const SOURCE = `${SRC_ROOT}/RuntimeStdlibProbe.hx`;
const RELEASE_ROOT = `${OUT_ROOT}/release/php`;
const DEBUG_ROOT = `${OUT_ROOT}/debug/php`;
const MANIFEST = "manifests/wphx-php/runtime-stdlib-strategy.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-runtime-stdlib-strategy.v1.json";
const EXPECTED = {
  joined: "6|12",
  mapSum: 18,
  keys: "first,second",
  closure: 11,
  exception: "runtime-boom",
  stringValue: "hello",
  arrayLength: 4
};
const REQUIRED_RELEASE_FILES = [
  "index.php",
  "lib/Array_hx.php",
  "lib/RuntimeStdlibProbe.php",
  "lib/StringTools.php",
  "lib/haxe/Exception.php",
  "lib/haxe/Json.php",
  "lib/haxe/ValueException.php",
  "lib/haxe/ds/StringMap.php",
  "lib/php/Boot.php",
  "lib/php/_Boot/HxAnon.php"
];
const REQUIRED_REFERENCE_FILES = [
  "../haxe.compilerdev.reference/haxe/src/generators/genphp7.ml",
  "../haxe.compilerdev.reference/haxe/std/php/Boot.hx",
  "../haxe.compilerdev.reference/haxe/std/php/Closure.hx",
  "../haxe.compilerdev.reference/haxe/std/php/NativeArray.hx",
  "../haxe.compilerdev.reference/haxe/std/php/NativeAssocArray.hx",
  "../haxe.compilerdev.reference/haxe/std/php/Global.hx",
  "../haxe.compilerdev.reference/haxe/std/php/Lib.hx",
  "../haxe.compilerdev.reference/haxe/std/haxe/Exception.hx",
  "../haxe.compilerdev.reference/haxe/std/haxe/ds/StringMap.hx",
  "../haxe.compilerdev.reference/haxe/std/StringTools.hx"
];
const SOURCE_TEXT = `using StringTools;

class RuntimeStdlibProbe {
  static function main():Void {
    var values = [1, 2, 3, 4];
    var filtered = values.filter(function(value) return value % 2 == 0);
    var mapped = filtered.map(function(value) return value * 3);
    var map = new Map<String, Int>();
    map.set("first", mapped[0]);
    map.set("second", mapped[1]);
    var keys = [];
    for (key in map.keys()) {
      keys.push(key);
    }
    keys.sort(Reflect.compare);
    var message = "none";
    try {
      throw "runtime-boom";
    } catch (error:String) {
      message = error;
    }
    var offset = map.get("first");
    var closure = function(value:Int):Int {
      return value + offset;
    };
    var result = {
      joined: mapped.join("|"),
      mapSum: map.get("first") + map.get("second"),
      keys: keys.join(","),
      closure: closure(5),
      exception: message,
      stringValue: "  HeLLo  ".trim().toLowerCase(),
      arrayLength: values.length
    };
    Sys.println(haxe.Json.stringify(result));
  }
}
`;

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

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    })
    .sort();
}

function relative(root, path) {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
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
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function compileStock(profile, outputRoot, debug) {
  const args = ["-cp", SRC_ROOT];
  if (debug) {
    args.push("-lib", "sourcemap", "-D", "source-map", "-debug");
  }
  args.push("-main", "RuntimeStdlibProbe", "-php", outputRoot);
  run("haxe", args);
  const stdout = run("php", [`${outputRoot}/index.php`]).trim();
  const observed = JSON.parse(stdout);
  assertJsonEqual(observed, EXPECTED, `${profile} runtime/std probe`);
  return {
    profile,
    output_root: outputRoot,
    stdout,
    observed,
    index: fileRecord(`${outputRoot}/index.php`),
    generated_probe: fileRecord(`${outputRoot}/lib/RuntimeStdlibProbe.php`)
  };
}

function exactPatternPresence(path, patterns) {
  const source = readFileSync(path, "utf8");
  return patterns.map((pattern) => ({
    pattern,
    present: source.includes(pattern)
  }));
}

function sourceMapRecords(root) {
  return walk(root)
    .filter((path) => path.endsWith(".map"))
    .map((path) => {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      return {
        path,
        relative_path: relative(root, path),
        bytes: statSync(path).size,
        sha256: sha256File(path),
        source_count: Array.isArray(parsed.sources) ? parsed.sources.length : null,
        has_runtime_probe_source: Array.isArray(parsed.sources) && parsed.sources.some((source) => source.endsWith("RuntimeStdlibProbe.hx"))
      };
    });
}

function strategyMatrix(stockFiles) {
  return [
    {
      area: "boot_autoload",
      near_term_route: "borrow_stock_shape_with_wordpress_profile_guard",
      oracle_files: ["std/php/Boot.hx", "src/generators/genphp7.ml"],
      current_evidence: ["bootstrap-autoload", "bootstrap-error-handler", "runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP implementation output behind ADR-014 bootstrap"
    },
    {
      area: "arrays_maps_iterators",
      near_term_route: "adapt_stock_array_map_iterator_lowering_before_custom_runtime",
      oracle_files: ["std/php/NativeArray.hx", "std/haxe/ds/StringMap.hx"],
      current_evidence: ["runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP private output for implementation bodies needing broad std behavior"
    },
    {
      area: "closures",
      near_term_route: "borrow stock closure and captured-variable semantics",
      oracle_files: ["std/php/Closure.hx", "std/php/_Boot helpers via generated output"],
      current_evidence: ["runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP private output until WPHX PHP has closure fixtures"
    },
    {
      area: "exceptions",
      near_term_route: "borrow haxe.Exception and ValueException wrapping/catching behavior",
      oracle_files: ["std/haxe/Exception.hx", "std/php/Boot.hx"],
      current_evidence: ["bootstrap-debug", "runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP exception runtime for delegated implementation code"
    },
    {
      area: "strings_json",
      near_term_route: "adapt stock string helper and JSON lowering where public WPHX bodies need it",
      oracle_files: ["std/StringTools.hx", "std/php/Global.hx"],
      current_evidence: ["runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP private output for broad stdlib string/JSON behavior"
    },
    {
      area: "source_debug",
      near_term_route: "preserve stock source comments/source maps for implementation output and design WPHX equivalents deliberately",
      oracle_files: ["src/generators/genphp7.ml"],
      current_evidence: ["bootstrap-debug", "runtime-stdlib-strategy"],
      fallback: "stock Haxe PHP debug/parity output while WPHX PHP source mapping matures"
    }
  ].map((entry) => ({
    ...entry,
    stock_reference_available: entry.oracle_files.every((suffix) => stockFiles.some((path) => path.endsWith(suffix)))
  }));
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(SRC_ROOT, { recursive: true });
  writeFileSync(SOURCE, SOURCE_TEXT);

  const release = compileStock("release", RELEASE_ROOT, false);
  const debug = compileStock("debug", DEBUG_ROOT, true);
  const releaseFiles = walk(RELEASE_ROOT).map((path) => relative(RELEASE_ROOT, path));
  const missingReleaseFiles = REQUIRED_RELEASE_FILES.filter((path) => !releaseFiles.includes(path));
  if (missingReleaseFiles.length > 0) {
    throw new Error(`Stock Haxe PHP output is missing required files: ${JSON.stringify(missingReleaseFiles)}`);
  }

  const indexPatterns = exactPatternPresence(`${RELEASE_ROOT}/index.php`, [
    "set_include_path(get_include_path().PATH_SEPARATOR.__DIR__.'/lib');",
    "spl_autoload_register(",
    "\\php\\Boot::__hx__init();",
    "\\RuntimeStdlibProbe::main();"
  ]);
  const probePatterns = exactPatternPresence(`${RELEASE_ROOT}/lib/RuntimeStdlibProbe.php`, [
    "\\Array_hx::wrap",
    "array_values(array_map(\"strval\", array_keys($map_data)))",
    "HaxeException::thrown(\"runtime-boom\")",
    "HaxeException::caught($_g)->unwrap()",
    "function ($value) use (&$offset)",
    "mb_strtolower(trim(\"  HeLLo  \"))",
    "Json::phpJsonEncode"
  ]);
  const missingPatterns = indexPatterns.concat(probePatterns).filter((entry) => !entry.present);
  if (missingPatterns.length > 0) {
    throw new Error(`Stock Haxe PHP output is missing exact runtime/std patterns: ${JSON.stringify(missingPatterns)}`);
  }

  const debugMaps = sourceMapRecords(DEBUG_ROOT);
  if (!debugMaps.some((record) => record.relative_path === "lib/RuntimeStdlibProbe.php.map" && record.has_runtime_probe_source)) {
    throw new Error("Debug stock Haxe PHP output is missing RuntimeStdlibProbe.php.map source evidence");
  }
  const debugProbeSource = readFileSync(`${DEBUG_ROOT}/lib/RuntimeStdlibProbe.php`, "utf8");
  const debugSourceCommentCount = debugProbeSource.split("\n").filter((line) => line.includes("RuntimeStdlibProbe.hx")).length;
  if (debugSourceCommentCount === 0) {
    throw new Error("Debug stock Haxe PHP output is missing inline source comments");
  }

  const stockReferenceFiles = REQUIRED_REFERENCE_FILES.map((path) => ({
    path,
    exists: existsSync(path),
    bytes: existsSync(path) ? statSync(path).size : null,
    sha256: existsSync(path) ? sha256File(path) : null
  }));
  const missingReferences = stockReferenceFiles.filter((record) => !record.exists);
  if (missingReferences.length > 0) {
    throw new Error(`Missing stock Haxe PHP reference files: ${JSON.stringify(missingReferences)}`);
  }

  const manifest = {
    schema: "wphx.wphx-php-runtime-stdlib-strategy.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "runtime_stdlib_strategy",
    artifact_scope: "stock_haxe_php_runtime_std_behavior_oracle",
    adr: "docs/adr/ADR-017-wphx-php-runtime-stdlib-strategy.md",
    temporary_haxe_source: {
      path: SOURCE,
      sha256: sha256(SOURCE_TEXT),
      line_count: SOURCE_TEXT.trimEnd().split("\n").length
    },
    stock_reference_files: stockReferenceFiles,
    stock_release_probe: {
      ...release,
      required_files: REQUIRED_RELEASE_FILES,
      generated_file_count: releaseFiles.length,
      index_patterns: indexPatterns,
      runtime_std_patterns: probePatterns
    },
    stock_debug_probe: {
      ...debug,
      source_map_count: debugMaps.length,
      source_maps: debugMaps,
      runtime_probe_source_comment_count: debugSourceCommentCount
    },
    strategy_matrix: strategyMatrix(stockReferenceFiles.map((record) => record.path)),
    fallback_policy: {
      stock_haxe_php_private_output_remains_admitted: true,
      current_stock_haxe_php_hxml_count_from_gap_inventory: 9,
      wphx_public_files_without_stock_runtime_should_not_bootstrap: true,
      broad_backend_promotion_requires_later_adr: true
    },
    validation_result: {
      status: "passed",
      release_probe_passed: true,
      debug_probe_passed: true,
      stock_reference_files_available: true,
      boot_shape_observed: true,
      arrays_maps_iterators_observed: true,
      closures_observed: true,
      exceptions_observed: true,
      strings_json_observed: true,
      source_debug_observed: true
    },
    non_claims: [
      "This records stock Haxe PHP runtime/std oracle behavior; it does not claim WPHX PHP owns that behavior.",
      "This does not claim stock Haxe PHP public output is acceptable for WordPress distribution files.",
      "This does not remove stock Haxe PHP private implementation fallbacks.",
      "This does not prove full reflection, dynamic dispatch, Unicode/string, iterator, or exception coverage."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-core-driver-receipt.v1",
    id: "receipt:wphx-comp-php-runtime-stdlib-strategy",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "runtime_stdlib_strategy",
    artifact_scope: "stock_haxe_php_runtime_std_behavior_oracle",
    commands: ["npm run wphx:php:runtime-stdlib-strategy", "npm run wphx:php:runtime-stdlib-strategy:check"],
    artifacts: [
      {
        path: RUNNER,
        role: "deterministic stock Haxe PHP runtime/std strategy probe runner"
      },
      {
        path: "docs/adr/ADR-017-wphx-php-runtime-stdlib-strategy.md",
        role: "accepted WPHX PHP runtime/std strategy ADR"
      },
      {
        path: MANIFEST,
        role: "runtime/std strategy manifest with stock-target executable probe observations"
      },
      {
        path: "docs/operations/wphx-php-compiler.md",
        role: "compiler operations documentation updated with runtime/std strategy lane"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: manifest.validation_result,
    claims: [
      "Stock Haxe PHP remains the runtime/std behavior oracle and borrowing source for WPHX PHP until a later backend-promotion ADR moves that ownership.",
      "The executable probe records stock boot shape, arrays/maps/iterators, closures, exceptions, StringTools/JSON behavior, and debug source-map/source-comment behavior.",
      "WPHX PHP public files that do not need stock implementation/runtime behavior should avoid stock Haxe bootstrap; delegated implementation shells remain governed by ADR-014."
    ],
    non_claims: manifest.non_claims
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: MANIFEST,
        receipt: RECEIPT,
        release_observed: release.observed,
        debug_source_map_count: debugMaps.length
      },
      null,
      2
    )
  );
}

main();
