#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const WORKFLOW = ".github/workflows/php-conformance.yml";
const OUT = "manifests/ci/wphx-208-php-conformance-ci.v1.json";
const RECEIPT = "receipts/ci/wphx-208-php-conformance-ci.v1.json";
const RECORDED_AT = "2026-06-20T19:40:00.000Z";

const REQUIRED_PATHS = [
  ".github/workflows/php-conformance.yml",
  "src/**",
  "fixtures/**",
  "profiles/**",
  "tools/**",
  "scripts/**",
  "manifests/**",
  "receipts/**",
  "package.json",
  "package-lock.json",
  "toolchain.lock.json",
  "hxformat.json"
];

const REQUIRED_COMMANDS = [
  "npm run format:haxe:check",
  "npm run haxe:escape-hatches:check",
  "npm run build:profiles:check",
  "npm run baseline:validate",
  "npm run ci:php-conformance:check",
  "npm run php:smoke:check",
  "npm run php:facade:f1:check",
  "npm run php:facade:f2:check",
  "npm run php:facade:f3:check",
  "npm run php:facade:f4:check",
  "npm run php:facade:f5:check",
  "npm run php:facade:f6:check",
  "npm run php:facade:f7:check",
  "npm run php:abi:check",
  "npm run wp:macro:bindings:check",
  "npm run wp:boundary:check",
  "npm run wp:bootstrap:trace:check",
  "npm run wp:facade:globals:check",
  "npm run wp:hooks:surface:check",
  "npm run wp:hooks:parity-candidate:check",
  "npm run wp:hooks:runtime-boundary:check",
  "npm run wp:hooks:shell-emitter:check",
  "npm run wp:linker:check",
  "npm run wp:public-types:check",
  "npm run wp:debug:sourcemap:check"
];

const REQUIRED_SUITES = ["hygiene-and-manifests", "php-feasibility", "wp-abi-and-macros", "wp-runtime-and-linker"];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function npmScriptName(command) {
  return command.startsWith("npm run ") ? command.slice("npm run ".length) : null;
}

const workflowText = readFileSync(WORKFLOW, "utf8");
const packageJson = readJson("package.json");
const toolchain = readJson("toolchain.lock.json");
const errors = [];

for (const path of REQUIRED_PATHS) {
  if (!workflowText.includes(`"${path}"`)) {
    errors.push(`workflow missing trigger path ${path}`);
  }
}

for (const suite of REQUIRED_SUITES) {
  if (!workflowText.includes(`suite: ${suite}`)) {
    errors.push(`workflow missing matrix suite ${suite}`);
  }
}

for (const command of REQUIRED_COMMANDS) {
  if (!workflowText.includes(command)) {
    errors.push(`workflow missing command ${command}`);
  }
  const script = npmScriptName(command);
  if (script && !packageJson.scripts?.[script]) {
    errors.push(`package.json missing script ${script}`);
  }
}

const requiredText = [
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "branches:",
  "main",
  "runs-on: ubuntu-24.04",
  "fail-fast: false",
  "actions/checkout@v4",
  "actions/setup-node@v4",
  "shivammathur/setup-php@v2",
  "krdlab/setup-haxe@v2",
  'node-version: "20.19.3"',
  'php-version: "8.4"',
  'haxe-version: "4.3.7"',
  "npm ci",
  "haxelib setup",
  "haxelib install formatter 1.18.0 --quiet",
  "git clone --depth 1 --branch 7.0.0 https://github.com/WordPress/wordpress-develop.git ../wordpress-develop",
  "26b68024931348d267b70e2a29910e1320d0094f",
  "docker pull"
];

for (const needle of requiredText) {
  if (!workflowText.includes(needle)) {
    errors.push(`workflow missing required text ${needle}`);
  }
}

for (const image of [toolchain.container_images.php_8_4_cli, toolchain.container_images.php_8_5_cli]) {
  const reference = `${image.repository}@${image.index_digest}`;
  if (!workflowText.includes(reference)) {
    errors.push(`workflow missing pinned Docker image ${reference}`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const workflowSha = sha256(workflowText);
const manifest = {
  schema: "wphx.php-conformance-ci.v1",
  issue: "WPHX-208",
  generated_at: RECORDED_AT,
  generator: "tools/ci/check-php-conformance-ci.mjs",
  workflow: {
    path: WORKFLOW,
    sha256: workflowSha,
    triggers: ["pull_request", "push:main", "workflow_dispatch"],
    path_filters: REQUIRED_PATHS,
    matrix_suites: REQUIRED_SUITES,
    required_commands: REQUIRED_COMMANDS
  },
  toolchain: {
    node_version: "20.19.3",
    php_version: "8.4",
    haxe_version: toolchain.tools.haxe.version,
    haxe_formatter_version: toolchain.tools.haxe_formatter.version,
    docker_images: [
      {
        id: "php_8_4_cli",
        reference: `${toolchain.container_images.php_8_4_cli.repository}@${toolchain.container_images.php_8_4_cli.index_digest}`
      },
      {
        id: "php_8_5_cli",
        reference: `${toolchain.container_images.php_8_5_cli.repository}@${toolchain.container_images.php_8_5_cli.index_digest}`
      }
    ]
  },
  validation_result: {
    status: "passed",
    workflow_exists: true,
    target_runtime_path_filters: true,
    conformance_matrix: true,
    required_commands_present: true,
    locked_toolchain_versions_present: true,
    pinned_php_docker_images_present: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.php-conformance-ci-receipt.v1",
  id: "receipt:wphx-208-php-conformance-ci",
  issue: "WPHX-208",
  recorded_at: RECORDED_AT,
  command: "npm run ci:php-conformance",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  workflow: WORKFLOW,
  workflow_sha256: workflowSha,
  matrix_suites: REQUIRED_SUITES.length,
  required_commands: REQUIRED_COMMANDS.length
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, suites: REQUIRED_SUITES.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, suites: REQUIRED_SUITES.length }, null, 2));
