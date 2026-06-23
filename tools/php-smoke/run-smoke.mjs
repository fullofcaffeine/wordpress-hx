#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { normalizeGeneratedPhpForManifest } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-smoke/php-smoke.hxml";
const OUT_DIR = "build/php-smoke";
const OUT = "manifests/php-smoke/wphx-101-stock-php-smoke.v1.json";
const RECORDED_AT = "2026-06-20T05:05:00Z";
const EXPECTED_OUTPUT = "wphx-php-smoke:stock-haxe-php:3:alpha|beta|gamma:alpha=5,gamma=5:enabled";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch (error) {
    return null;
  }
}

function phpVersionFamily(version) {
  return version.split(".").slice(0, 2).join(".");
}

function sha256(path) {
  return createHash("sha256").update(normalizeGeneratedPhpForManifest(readFileSync(path, "utf8"))).digest("hex");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

function generatedFiles() {
  return walk(OUT_DIR)
    .map((path) => ({
      path: relative(OUT_DIR, path),
      bytes: Buffer.byteLength(normalizeGeneratedPhpForManifest(readFileSync(path, "utf8"))),
      sha256: sha256(path)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function runLocalPhp(label, commandPath) {
  const output = command(commandPath, [join(OUT_DIR, "index.php")]);
  if (output !== EXPECTED_OUTPUT) {
    throw new Error(`${label} output mismatch: ${output}`);
  }
  return {
    id: label,
    command: `${commandPath} ${OUT_DIR}/index.php`,
    version_family: phpVersionFamily(command(commandPath, ["-r", "echo PHP_VERSION;"])),
    output
  };
}

function runDockerPhp(id, image) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", `${OUT_DIR}/index.php`]);
  if (output !== EXPECTED_OUTPUT) {
    throw new Error(`${id} output mismatch: ${output}`);
  }
  return {
    id,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${OUT_DIR}/index.php`,
    version_family: phpVersionFamily(command("docker", ["run", "--rm", image, "php", "-r", "echo PHP_VERSION;"])),
    image,
    output
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_DIR, { recursive: true, force: true });
command("haxe", [HXML]);

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const phpRuns = [runLocalPhp("local-php-cli", "php")];

if (dockerVersion) {
  phpRuns.push(
    runDockerPhp(
      "docker-php-8.4-cli",
      `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`
    )
  );
  phpRuns.push(
    runDockerPhp(
      "docker-php-8.5-cli",
      `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`
    )
  );
}

const manifest = {
  schema: "wphx.php-smoke-snapshot.v1",
  issue: "WPHX-101",
  generated_at: RECORDED_AT,
  generator: "tools/php-smoke/run-smoke.mjs",
  fixture: {
    hxml: HXML,
    main: "wphx.fixtures.php.SmokeMain",
    source_paths: ["fixtures/php-smoke/src/wphx/fixtures/php/SmokeMain.hx"]
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version_family: phpVersionFamily(command("php", ["-r", "echo PHP_VERSION;"])),
    docker_available: dockerVersion != null
  },
  build: {
    command: `haxe ${HXML}`,
    output_dir: OUT_DIR,
    entrypoint: `${OUT_DIR}/index.php`,
    generated_file_count: generatedFiles().length,
    generated_files: generatedFiles()
  },
  runtime_matrix: phpRuns,
  expected_output: EXPECTED_OUTPUT,
  validation_result: {
    status: "passed",
    php_run_count: phpRuns.length
  }
};

const serialized = JSON.stringify(manifest, null, 2) + "\n";

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} does not exist` }, null, 2));
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== serialized) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} is stale` }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, php_run_count: phpRuns.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialized);
console.log(JSON.stringify({ status: "passed", output: OUT, php_run_count: phpRuns.length }, null, 2));
