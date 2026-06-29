import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = "build/wphx-php/bootstrap-debug";
const manifestPath = "manifests/wphx-php/bootstrap-debug.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-bootstrap-debug-probe.v1.json";
const recordedAt = "2026-06-29T00:00:00.000Z";
const haxeSource = "fixtures/wphx-php/src/wphx/fixtures/php/bootstrap/BootstrapKernel.hx";
const shellSource = "fixtures/wphx-php/src/wphx/fixtures/compiler/php/bootstrap/BootstrapDebugShellSurface.hx";
const publicFunction = "wphx_bootstrap_debug_fail";
const expectedMessage = "WPHX-BOOTSTRAP-DEBUG:CORE";

const profiles = [
  {
    id: "debug",
    hxml: {
      impl: "fixtures/wphx-php/bootstrap-debug-impl-debug.hxml",
      shell: "fixtures/wphx-php/bootstrap-debug-shell-debug.hxml"
    },
    source_maps_expected: true
  },
  {
    id: "parity",
    hxml: {
      impl: "fixtures/wphx-php/bootstrap-debug-impl-parity.hxml",
      shell: "fixtures/wphx-php/bootstrap-debug-shell-parity.hxml"
    },
    source_maps_expected: true
  },
  {
    id: "release",
    hxml: {
      impl: "fixtures/wphx-php/bootstrap-debug-impl-release.hxml",
      shell: "fixtures/wphx-php/bootstrap-debug-shell-release.hxml"
    },
    source_maps_expected: false
  }
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Text(readFileSync(path));
}

function writeOrCheck(path, content) {
  if (check) {
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`${path} is stale; run without --check to refresh it`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return [path];
  });
}

function normalizePath(value) {
  if (typeof value !== "string") return value;
  const cwd = root.replaceAll("\\", "/");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  if (normalized.startsWith("/work/")) return normalized.slice("/work/".length);
  return normalized;
}

function normalizeSourcePath(value) {
  const normalized = normalizePath(value);
  const stdMarker = "/std/";
  const stdIndex = normalized.indexOf(stdMarker);
  if (stdIndex !== -1) {
    return `$HAXE_STD/${normalized.slice(stdIndex + stdMarker.length)}`;
  }
  return normalized;
}

function normalizeRuntime(value, key = null) {
  if (Array.isArray(value)) return value.map((entry) => normalizeRuntime(entry, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, normalizeRuntime(entry, entryKey)]));
  }
  if (key === "file" || key === "path") return normalizePath(value);
  return value;
}

function parseHaxeComments(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const pattern = /^\s*#(.+\.hx):(\d+): characters ([0-9]+-[0-9]+)/;
  return lines.flatMap((line, index) => {
    const match = line.match(pattern);
    if (!match) return [];
    return [
      {
        generated_path: normalizePath(file),
        generated_line: index + 1,
        haxe_path: normalizeSourcePath(match[1]),
        haxe_line: Number(match[2]),
        haxe_characters: match[3],
        generated_comment_sha256: sha256Text(line.trim().replace(match[1], normalizeSourcePath(match[1])))
      }
    ];
  });
}

function sourceMapSummary(mapPath) {
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  return {
    path: normalizePath(mapPath),
    sha256: sha256File(mapPath),
    source_count: Array.isArray(map.sources) ? map.sources.length : 0,
    sources: (map.sources ?? []).map(normalizeSourcePath)
  };
}

function resolveHaxeFrame(frame, commentMap) {
  if (!frame?.file || !frame?.line) return null;
  const normalizedFile = normalizePath(frame.file);
  const candidates = commentMap.filter((entry) => entry.generated_path === normalizedFile && entry.generated_line <= frame.line);
  if (candidates.length === 0) return null;
  const nearest = candidates[candidates.length - 1];
  return {
    kind: "haxe-source-comment",
    generated_path: normalizedFile,
    generated_line: frame.line,
    generated_comment_line: nearest.generated_line,
    haxe_path: nearest.haxe_path,
    haxe_line: nearest.haxe_line,
    haxe_characters: nearest.haxe_characters
  };
}

function shellFunctionLine(shellPath) {
  const lines = readFileSync(shellPath, "utf8").split("\n");
  const index = lines.findIndex((line) => line.includes(`function ${publicFunction}(`));
  return index === -1 ? null : index + 1;
}

function resolveShellFrame(frame, shellPath) {
  if (!frame?.file || !frame?.line) return null;
  const normalizedFile = normalizePath(frame.file);
  if (normalizedFile !== normalizePath(shellPath)) return null;
  return {
    kind: "wphx-original-path-shell",
    generated_path: normalizedFile,
    distribution_path: "wp-includes/wphx-bootstrap-debug.php",
    generated_line: frame.line,
    function_line: shellFunctionLine(shellPath),
    haxe_shell_source: shellSource
  };
}

function writeProbe(profileRoot) {
  const probe = join(profileRoot, "probe.php");
  mkdirSync(dirname(probe), { recursive: true });
  writeFileSync(
    probe,
    `<?php
$shell = $argv[1];
require $shell;

$result = array(
  'exception' => null,
);

try {
  ${publicFunction}( 'core' );
} catch ( Throwable $throwable ) {
  $trace = array();
  foreach ( $throwable->getTrace() as $frame ) {
    $trace[] = array(
      'file' => $frame['file'] ?? null,
      'line' => $frame['line'] ?? null,
      'function' => $frame['function'] ?? null,
      'class' => $frame['class'] ?? null,
      'type' => $frame['type'] ?? null,
    );
  }

  $result['exception'] = array(
    'class' => get_class( $throwable ),
    'message' => $throwable->getMessage(),
    'file' => $throwable->getFile(),
    'line' => $throwable->getLine(),
    'trace' => $trace,
  );
}

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\\n";
`
  );
  return probe;
}

function runProfile(profile) {
  const profileRoot = join(outRoot, profile.id);
  const haxeLib = join(profileRoot, "haxe/lib");
  const shell = join(profileRoot, "generated/wp-includes/wphx-bootstrap-debug.php");
  const emissionManifestPath = join(profileRoot, "generated/wphx-php-emission.v1.json");

  run("haxe", [profile.hxml.impl]);
  run("haxe", [profile.hxml.shell]);
  run("php", ["-l", shell]);

  const probe = writeProbe(profileRoot);
  const runtime = JSON.parse(run("php", [probe, shell]));
  const normalizedRuntime = normalizeRuntime(runtime);
  const haxeFile = join(haxeLib, "wphx/fixtures/php/bootstrap/BootstrapKernel.php");
  const haxeCommentMap = parseHaxeComments(haxeFile);
  const mapFiles = filesUnder(haxeLib).filter((file) => file.endsWith(".map")).sort();
  const bootstrapMap = mapFiles.find((file) => normalizePath(file).endsWith("wphx/fixtures/php/bootstrap/BootstrapKernel.php.map"));
  const trace = normalizedRuntime.exception?.trace ?? [];
  const userHaxeTraceFrame = trace.find((frame) => normalizePath(frame.file ?? "").endsWith("wphx/fixtures/php/bootstrap/BootstrapKernel.php"));
  const shellTraceFrame = trace.find((frame) => normalizePath(frame.file ?? "") === normalizePath(shell));
  const resolvedUserHaxeTraceFrame = resolveHaxeFrame(userHaxeTraceFrame, haxeCommentMap);
  const resolvedShellTraceFrame = resolveShellFrame(shellTraceFrame, shell);
  const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));

  return {
    id: profile.id,
    hxml: profile.hxml,
    source_maps_expected: profile.source_maps_expected,
    artifacts: {
      shell: {
        path: normalizePath(shell),
        sha256: sha256File(shell)
      },
      haxe_file: {
        path: normalizePath(haxeFile),
        sha256: sha256File(haxeFile)
      },
      bootstrap_source_map: bootstrapMap ? sourceMapSummary(bootstrapMap) : null,
      source_map_count: mapFiles.length,
      probe: {
        path: normalizePath(probe),
        sha256: sha256File(probe)
      },
      emission_manifest: {
        path: normalizePath(emissionManifestPath),
        sha256: sha256File(emissionManifestPath),
        bootstrap_error_handler_policy: emissionManifest.bootstrap_error_handler_policy,
        unsupported_empty: emissionManifest.unsupported.length === 0
      }
    },
    runtime: normalizedRuntime,
    source_positions: {
      haxe_comment_map_count: haxeCommentMap.length,
      haxe_comment_map_for_kernel: haxeCommentMap.filter((entry) => entry.haxe_path === haxeSource),
      resolved_user_haxe_trace_frame: resolvedUserHaxeTraceFrame,
      resolved_shell_trace_frame: resolvedShellTraceFrame
    },
    validation_result: {
      exception_message_matches: normalizedRuntime.exception?.message === expectedMessage,
      user_haxe_trace_frame_present: userHaxeTraceFrame != null,
      user_haxe_trace_frame_maps_to_haxe_source: resolvedUserHaxeTraceFrame?.haxe_path === haxeSource,
      shell_trace_frame_present: shellTraceFrame != null,
      shell_trace_frame_is_original_path_adapter: resolvedShellTraceFrame?.distribution_path === "wp-includes/wphx-bootstrap-debug.php",
      source_map_presence_matches_profile: profile.source_maps_expected ? bootstrapMap != null : bootstrapMap == null,
      emission_manifest_unsupported_empty: emissionManifest.unsupported.length === 0
    }
  };
}

function assertProfile(profileRun) {
  const result = profileRun.validation_result;
  const failures = Object.entries(result).filter(([, value]) => value !== true);
  if (failures.length > 0) {
    throw new Error(`${profileRun.id} bootstrap debug validation failed: ${JSON.stringify(failures)}\n${JSON.stringify(profileRun, null, 2)}`);
  }
}

rmSync(outRoot, { recursive: true, force: true });
const profileRuns = profiles.map(runProfile);
profileRuns.forEach(assertProfile);

const manifest = {
  schema: "wphx.wphx-php-bootstrap-debug.v1",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-DEBUG-PROBE",
  evidence_class: "runtime_bootstrap_debug_probe",
  generated_at: recordedAt,
  runner: "tools/wphx-php/run-bootstrap-debug.mjs",
  fixture: {
    haxe_source: haxeSource,
    shell_source: shellSource,
    public_function: publicFunction
  },
  profiles: profileRuns,
  validation_result: {
    status: "passed",
    debug_profile_has_source_map: profileRuns.find((profile) => profile.id === "debug").validation_result.source_map_presence_matches_profile,
    parity_profile_has_source_map: profileRuns.find((profile) => profile.id === "parity").validation_result.source_map_presence_matches_profile,
    release_profile_omits_source_map: profileRuns.find((profile) => profile.id === "release").validation_result.source_map_presence_matches_profile,
    all_profiles_map_user_haxe_frame_from_comments: profileRuns.every((profile) => profile.validation_result.user_haxe_trace_frame_maps_to_haxe_source),
    all_profiles_preserve_original_path_shell_frame: profileRuns.every((profile) => profile.validation_result.shell_trace_frame_is_original_path_adapter),
    all_profiles_have_empty_unsupported_manifests: profileRuns.every((profile) => profile.validation_result.emission_manifest_unsupported_empty)
  },
  policy_result: {
    debug: "debug profile keeps .map files and inline Haxe source-position comments for stock Haxe PHP implementation frames",
    parity: "parity profile keeps .map files and inline Haxe source-position comments for differential evidence",
    release: "release profile omits .map files but still keeps Haxe-generated inline source-position comments in this bounded fixture",
    shell_frames: "WPHX original-path public shell frames remain visible as wp-includes/wphx-bootstrap-debug.php and map to the typed shell source by manifest policy"
  },
  claims: [
    "A controlled exception through a WPHX original-path public shell reaches stock Haxe PHP implementation code in debug, parity, and release profiles.",
    "Debug and parity profiles emit BootstrapKernel.php.map for the Haxe implementation file.",
    "Release omits BootstrapKernel.php.map while preserving PHP stack frames and inline Haxe source-position comments in this fixture.",
    "The PHP stack includes both the stock Haxe PHP implementation frame and the WPHX original-path public shell frame.",
    "Paths in the recorded runtime and source-map evidence are normalized for deterministic receipts."
  ],
  non_claims: [
    "This fixture does not prove operator-facing stack-frame rewriting in a packaged WordPress distribution.",
    "This fixture does not remove Haxe runtime frames from PHP Throwable output.",
    "This fixture does not prove mixed PHP/HTML template source mapping."
  ]
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-runtime-receipt.v1",
  id: "receipt:wphx-comp-php-bootstrap-debug-probe",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-DEBUG-PROBE",
  recorded_at: recordedAt,
  status: "passed",
  artifacts: [
    { path: manifestPath, role: "bootstrap stack-trace/source-map probe manifest" },
    { path: receiptPath, role: "compiler runtime bootstrap debug receipt" },
    { path: haxeSource, role: "stock Haxe PHP implementation fixture source" },
    { path: shellSource, role: "WPHX original-path public shell fixture source" },
    { path: "tools/wphx-php/run-bootstrap-debug.mjs", role: "bootstrap debug probe runner" }
  ],
  commands: ["npm run wphx:php:bootstrap-debug", "npm run wphx:php:bootstrap-debug:check"],
  manifest_sha256: sha256Text(manifestText),
  validation_result: manifest.validation_result,
  policy_result: manifest.policy_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

if (!check) {
  console.log(JSON.stringify({ status: "passed", manifest: manifestPath, receipt: receiptPath, profiles: profileRuns.length }, null, 2));
}
