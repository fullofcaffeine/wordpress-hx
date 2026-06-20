#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, linkOriginalPathTree, sha256File, sha256Text } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/wp-debug/debug-trace.hxml";
const OUT_ROOT = "build/wp-debug";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PROBE = `${OUT_ROOT}/probe.php`;
const DISTRIBUTION_PATH = "wp-includes/load.php";
const GENERATED_SHELL = `${GENERATED_ROOT}/${DISTRIBUTION_PATH}`;
const OUT = "manifests/wp-debug/wphx-207-source-map-traces.v1.json";
const RECEIPT = "receipts/wp-debug/wphx-207-source-map-traces.v1.json";
const RECORDED_AT = "2026-06-20T19:30:00.000Z";
const ORIGINAL_SOURCE_UNIT = {
  id: "source:wordpress-7.0.0:src/wp-includes/load.php",
  repo: "../wordpress-develop",
  path: "src/wp-includes/load.php",
  distribution_path: "wp-includes/load.php",
  start_line: 1
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch {
    return null;
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePath(value) {
  if (typeof value !== "string") return value;
  const cwd = process.cwd().replaceAll("\\", "/");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  if (normalized.startsWith("/work/")) return normalized.slice("/work/".length);
  return normalized;
}

function normalizeHaxeSourcePath(value) {
  const normalized = normalizePath(value);
  const marker = "/std/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex !== -1) {
    return `$HAXE_STD/${normalized.slice(markerIndex + marker.length)}`;
  }
  return normalized;
}

function normalizeRuntime(value) {
  if (Array.isArray(value)) return value.map(normalizeRuntime);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeRuntime(entry)]));
  }
  return normalizePath(value);
}

function lineCount(text) {
  const trimmed = text.trimEnd();
  return trimmed === "" ? 0 : trimmed.split("\n").length;
}

function segment(id, order, kind, source, content, original = null, owner = "wphx-207") {
  return { id, order, kind, owner, source, content, original };
}

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_207_bootstrap_haxe' ) ) {
\tfunction wphx_207_bootstrap_haxe() {
\t\tif ( defined( 'WPHX_207_DEBUG_BOOTSTRAPPED' ) ) {
\t\t\treturn;
\t\t}

\t\tdefine( 'WPHX_207_DEBUG_BOOTSTRAPPED', true );
\t\t$wphx_207_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_207_lib );
\t\tspl_autoload_register(
\t\t\tfunction ( $class ) {
\t\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\t\tif ( $file ) {
\t\t\t\t\tinclude_once $file;
\t\t\t\t}
\t\t\t}
\t\t);
\t\t\\php\\Boot::__hx__init();
\t}
}

wphx_207_bootstrap_haxe();`;
}

function debugShellBlock() {
  return `if ( ! isset( $GLOBALS['wphx_207_trace'] ) ) {
\t$GLOBALS['wphx_207_trace'] = array();
}

if ( ! function_exists( 'wphx_207_trace_marker' ) ) {
\tfunction wphx_207_trace_marker( $event, $line ) {
\t\treturn array(
\t\t\t'event' => $event,
\t\t\t'file' => __FILE__,
\t\t\t'line' => $line,
\t\t);
\t}
}

if ( ! function_exists( 'wphx_207_trigger_debug_failure' ) ) {
\tfunction wphx_207_trigger_debug_failure( $token ) {
\t\t$GLOBALS['wphx_207_trace'][] = wphx_207_trace_marker( 'shell:enter', __LINE__ );

\t\treturn \\wphx\\fixtures\\wp\\debug\\DebugKernel::failWithToken( $token );
\t}
}`;
}

function linkedFiles() {
  return [
    {
      distribution_path: DISTRIBUTION_PATH,
      segments: [
        segment(`${DISTRIBUTION_PATH}:open`, 0, "php-open", "debug-source-map", "<?php"),
        segment(`${DISTRIBUTION_PATH}:bootstrap`, 10, "haxe-bootstrap", "WPHX-207", haxeBootstrapBlock(), {
          ...ORIGINAL_SOURCE_UNIT,
          start_line: 1
        }),
        segment(`${DISTRIBUTION_PATH}:debug-shell`, 20, "debug-shell", "WPHX-207", debugShellBlock(), {
          ...ORIGINAL_SOURCE_UNIT,
          start_line: 250
        })
      ]
    }
  ];
}

function shellLineMap(files) {
  const maps = [];
  for (const file of files) {
    const ordered = [...file.segments].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    let line = 1;
    for (const [index, segmentEntry] of ordered.entries()) {
      const count = lineCount(segmentEntry.content);
      const start = line;
      const end = count === 0 ? line : line + count - 1;
      maps.push({
        distribution_path: file.distribution_path,
        generated_path: `${GENERATED_ROOT}/${file.distribution_path}`,
        segment_id: segmentEntry.id,
        segment_kind: segmentEntry.kind,
        owner: segmentEntry.owner,
        source: segmentEntry.source,
        generated_line_start: start,
        generated_line_end: end,
        original: segmentEntry.original
      });
      line = end + (index === ordered.length - 1 ? 1 : 2);
    }
  }
  return maps;
}

function parseHaxeComments(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  const mappings = [];
  const pattern = /^\s*#(.+\.hx):(\d+): characters ([0-9]+-[0-9]+)/;
  for (const [index, line] of lines.entries()) {
    const match = line.match(pattern);
    if (!match) continue;
    mappings.push({
      generated_path: file,
      generated_line: index + 1,
      haxe_path: match[1],
      haxe_line: Number(match[2]),
      haxe_characters: match[3],
      generated_comment_sha256: sha256Text(line.trim())
    });
  }
  return mappings;
}

function haxeSourceMap() {
  return filesUnder(`${HAXE_OUT}/lib`)
    .filter((file) => file.path.endsWith(".php"))
    .flatMap((file) => parseHaxeComments(`${HAXE_OUT}/lib/${file.path}`));
}

function resolveShellLine(path, line, map) {
  const normalized = normalizePath(path);
  const match = map.find(
    (entry) => normalizePath(entry.generated_path) === normalized && line >= entry.generated_line_start && line <= entry.generated_line_end
  );
  if (!match) return null;
  const originalLine = match.original ? match.original.start_line + (line - match.generated_line_start) : null;
  return {
    kind: "wordpress-source-unit",
    generated_path: normalized,
    generated_line: line,
    distribution_path: match.distribution_path,
    segment_id: match.segment_id,
    segment_kind: match.segment_kind,
    original_source_unit: match.original?.id ?? null,
    original_path: match.original?.path ?? null,
    original_line: originalLine
  };
}

function resolveHaxeLine(path, line, map) {
  const normalized = normalizePath(path);
  const candidates = map.filter((entry) => normalizePath(entry.generated_path) === normalized && entry.generated_line <= line);
  if (candidates.length === 0) return null;
  const nearest = candidates[candidates.length - 1];
  return {
    kind: "haxe-source",
    generated_path: normalized,
    generated_line: line,
    generated_comment_line: nearest.generated_line,
    haxe_path: normalizeHaxeSourcePath(nearest.haxe_path),
    haxe_line: nearest.haxe_line,
    haxe_characters: nearest.haxe_characters,
    generated_comment_sha256: nearest.generated_comment_sha256
  };
}

function resolveFrame(frame, maps) {
  if (!frame?.file || !frame?.line) return null;
  return resolveHaxeLine(frame.file, frame.line, maps.haxe) ?? resolveShellLine(frame.file, frame.line, maps.shell);
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php

$shell = $argv[1];
require $shell;

$result = array(
\t'traceMarkers' => array(),
\t'exception' => null,
);

try {
\twphx_207_trigger_debug_failure( 'core' );
} catch ( Throwable $throwable ) {
\t$trace = array();
\tforeach ( $throwable->getTrace() as $frame ) {
\t\t$trace[] = array(
\t\t\t'file' => $frame['file'] ?? null,
\t\t\t'line' => $frame['line'] ?? null,
\t\t\t'function' => $frame['function'] ?? null,
\t\t\t'class' => $frame['class'] ?? null,
\t\t\t'type' => $frame['type'] ?? null,
\t\t);
\t}

\t$result['exception'] = array(
\t\t'class' => get_class( $throwable ),
\t\t'message' => $throwable->getMessage(),
\t\t'file' => $throwable->getFile(),
\t\t'line' => $throwable->getLine(),
\t\t'trace' => $trace,
\t);
}

$result['traceMarkers'] = $GLOBALS['wphx_207_trace'] ?? array();

echo json_encode( $result, JSON_UNESCAPED_SLASHES );
`
  );
}

function runProbe(commandPath, label, shell) {
  const output = command(commandPath, [PROBE, shell]);
  return {
    id: label,
    command: `${commandPath} ${PROBE} ${shell}`,
    result: normalizeRuntime(JSON.parse(output))
  };
}

function runDockerProbe(id, image, shell) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, shell]);
  return {
    id,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${shell}`,
    image,
    result: normalizeRuntime(JSON.parse(output))
  };
}

function enrichRun(run, maps) {
  const exceptionFrame = {
    file: run.result.exception?.file,
    line: run.result.exception?.line
  };
  const resolvedException = resolveFrame(exceptionFrame, maps);
  const resolvedTrace = (run.result.exception?.trace ?? []).map((frame) => ({
    frame,
    resolved: resolveFrame(frame, maps)
  }));
  const resolvedMarkers = (run.result.traceMarkers ?? []).map((marker) => ({
    marker,
    resolved: resolveShellLine(marker.file, marker.line, maps.shell)
  }));
  const userHaxeFrame = resolvedTrace.find((entry) =>
    entry.resolved?.kind === "haxe-source" && entry.resolved.haxe_path.endsWith("fixtures/wp-debug/src/wphx/fixtures/wp/debug/DebugKernel.hx")
  );
  return {
    ...run,
    resolved: {
      exception: resolvedException,
      trace: resolvedTrace,
      traceMarkers: resolvedMarkers,
      userHaxeFrame: userHaxeFrame ?? null
    }
  };
}

function validateRuns(runs) {
  const errors = [];
  for (const run of runs) {
    if (run.result.exception?.message !== "WPHX-207:CORE") {
      errors.push(`${run.id}: unexpected exception message ${run.result.exception?.message}`);
    }
    if (run.resolved.exception?.kind !== "haxe-source") {
      errors.push(`${run.id}: top exception did not map to Haxe source`);
    }
    if (!run.resolved.userHaxeFrame) {
      errors.push(`${run.id}: trace did not map to fixture Haxe source`);
    }
    const shellFrame = run.resolved.trace.find((entry) => entry.resolved?.kind === "wordpress-source-unit");
    if (shellFrame?.resolved?.original_source_unit !== ORIGINAL_SOURCE_UNIT.id) {
      errors.push(`${run.id}: PHP trace did not map to ${ORIGINAL_SOURCE_UNIT.id}`);
    }
    const marker = run.resolved.traceMarkers.find((entry) => entry.resolved?.original_source_unit === ORIGINAL_SOURCE_UNIT.id);
    if (!marker) {
      errors.push(`${run.id}: trace marker did not map to original source unit`);
    }
  }
  return errors;
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
const files = linkedFiles();
const generatedFiles = linkOriginalPathTree({ root: GENERATED_ROOT, files });
writeProbe();

const maps = {
  shell: shellLineMap(files),
  haxe: haxeSourceMap()
};

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [enrichRun(runProbe("php", "local-php-cli", GENERATED_SHELL), maps)];

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    runs.push(enrichRun(runDockerProbe(id, image, GENERATED_SHELL), maps));
  }
}

const errors = validateRuns(runs);
if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors, runs }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-debug-source-map-traces.v1",
  issue: "WPHX-207",
  generated_at: RECORDED_AT,
  generator: "tools/wp-debug/run-source-map-traces.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/wp-debug/src/wphx/fixtures/wp/debug/DebugEntry.hx",
      "fixtures/wp-debug/src/wphx/fixtures/wp/debug/DebugKernel.hx"
    ],
    generated_root: GENERATED_ROOT,
    probe: PROBE
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    command: `haxe ${HXML}`,
    haxe_output_dir: HAXE_OUT,
    generated_haxe_file_count: filesUnder(HAXE_OUT).length,
    generated_haxe_files: filesUnder(HAXE_OUT),
    generated_shell_files: generatedFiles,
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    }
  },
  source_maps: {
    shell_line_map: maps.shell,
    haxe_comment_map_count: maps.haxe.length,
    haxe_comment_map: maps.haxe
      .filter((entry) => entry.haxe_path.includes("fixtures/wp-debug/src"))
      .map((entry) => ({
        ...entry,
        generated_path: normalizePath(entry.generated_path),
        haxe_path: normalizeHaxeSourcePath(entry.haxe_path)
      }))
  },
  runtime_runs: runs,
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    top_exception_frame_maps_to_haxe_source: true,
    user_haxe_trace_frame_maps_to_fixture_source: true,
    php_shell_frame_maps_to_original_source_unit: true,
    trace_marker_maps_to_original_source_unit: true,
    normalized_paths_are_deterministic: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-debug-source-map-traces-receipt.v1",
  id: "receipt:wphx-207-source-map-traces",
  issue: "WPHX-207",
  recorded_at: RECORDED_AT,
  command: "npm run wp:debug:sourcemap",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  runtime_run_count: runs.length,
  generated_shell: DISTRIBUTION_PATH,
  original_source_unit: ORIGINAL_SOURCE_UNIT.id
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText]
  ]) {
    if (!existsSync(path)) {
      console.error(JSON.stringify({ status: "failed", error: `${path} does not exist` }, null, 2));
      process.exit(1);
    }
    if (readFileSync(path, "utf8") !== text) {
      console.error(JSON.stringify({ status: "failed", error: `${path} is stale` }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, runtime_run_count: runs.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, runtime_run_count: runs.length }, null, 2));
