import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = join(root, "build/wphx-php/pluggable-timing");
const generatedRoot = join(outRoot, "generated");
const shell = join(generatedRoot, "wp-includes/pluggable.php");
const emissionManifestPath = join(generatedRoot, "wphx-php-emission.v1.json");
const shellArtifactPath = "build/wphx-php/pluggable-timing/generated/wp-includes/pluggable.php";
const emissionManifestArtifactPath = "build/wphx-php/pluggable-timing/generated/wphx-php-emission.v1.json";
const probe = join(outRoot, "probe.php");
const manifestPath = "manifests/wphx-php/pluggable-timing.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-conditionals.v1.json";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
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

function reflectionSummary(functionName) {
  return `function reflection_${functionName}() {
  $reflection = new ReflectionFunction('${functionName}');
  $params = array();
  foreach ($reflection->getParameters() as $parameter) {
    $params[] = array(
      'name' => $parameter->getName(),
      'position' => $parameter->getPosition(),
      'isOptional' => $parameter->isOptional(),
      'hasDefault' => $parameter->isDefaultValueAvailable(),
      'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
      'hasType' => $parameter->hasType(),
      'isPassedByReference' => $parameter->isPassedByReference(),
      'isVariadic' => $parameter->isVariadic(),
    );
  }
  return array(
    'name' => $reflection->getName(),
    'numberOfParameters' => $reflection->getNumberOfParameters(),
    'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
    'returnsReference' => $reflection->returnsReference(),
    'hasReturnType' => $reflection->hasReturnType(),
    'parameters' => $params,
  );
}`;
}

function runProbe(mode) {
  return JSON.parse(run("php", [probe, mode, shell]));
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

run("haxe", ["fixtures/wphx-php/pluggable-timing.hxml"]);
run("php", ["-l", shell]);

const shellSource = readFileSync(shell, "utf8");
const expectedPatterns = [
  "if (!function_exists('wphx_pluggable_token'))",
  "function wphx_pluggable_token($subject = 'core')",
  "if (!function_exists('wphx_pluggable_user_id'))",
  "function wphx_pluggable_user_id()"
];
const missingPatterns = expectedPatterns.filter((pattern) => !shellSource.includes(pattern));
if (missingPatterns.length > 0) {
  throw new Error(`Generated pluggable shell is missing patterns: ${JSON.stringify(missingPatterns)}`);
}

mkdirSync(dirname(probe), { recursive: true });
writeFileSync(
  probe,
  `<?php
$mode = $argv[1];
$shell = $argv[2];

${reflectionSummary("wphx_pluggable_token")}
${reflectionSummary("wphx_pluggable_user_id")}

if ('override' === $mode) {
  function wphx_pluggable_token($subject = 'override') {
    return 'override:' . $subject;
  }
}

$before_token = function_exists('wphx_pluggable_token');
$before_user = function_exists('wphx_pluggable_user_id');
require $shell;
$after_token = function_exists('wphx_pluggable_token');
$after_user = function_exists('wphx_pluggable_user_id');
require $shell;
$after_second_require_token = function_exists('wphx_pluggable_token');
$after_second_require_user = function_exists('wphx_pluggable_user_id');

echo json_encode(
  array(
    'mode' => $mode,
    'before' => array(
      'token' => $before_token,
      'user_id' => $before_user,
    ),
    'after' => array(
      'token' => $after_token,
      'user_id' => $after_user,
    ),
    'afterSecondRequire' => array(
      'token' => $after_second_require_token,
      'user_id' => $after_second_require_user,
    ),
    'tokenCall' => wphx_pluggable_token('core'),
    'userIdCall' => wphx_pluggable_user_id(),
    'tokenReflection' => reflection_wphx_pluggable_token(),
    'userIdReflection' => reflection_wphx_pluggable_user_id(),
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`
);

const generated = runProbe("generated");
const override = runProbe("override");
const expectedGenerated = {
  mode: "generated",
  before: { token: false, user_id: false },
  after: { token: true, user_id: true },
  afterSecondRequire: { token: true, user_id: true },
  tokenCall: "pluggable:core",
  userIdCall: 123,
  tokenReflection: {
    name: "wphx_pluggable_token",
    numberOfParameters: 1,
    numberOfRequiredParameters: 0,
    returnsReference: false,
    hasReturnType: false,
    parameters: [
      {
        name: "subject",
        position: 0,
        isOptional: true,
        hasDefault: true,
        default: "core",
        hasType: false,
        isPassedByReference: false,
        isVariadic: false
      }
    ]
  },
  userIdReflection: {
    name: "wphx_pluggable_user_id",
    numberOfParameters: 0,
    numberOfRequiredParameters: 0,
    returnsReference: false,
    hasReturnType: false,
    parameters: []
  }
};
const expectedOverride = {
  mode: "override",
  before: { token: true, user_id: false },
  after: { token: true, user_id: true },
  afterSecondRequire: { token: true, user_id: true },
  tokenCall: "override:core",
  userIdCall: 123,
  tokenReflection: {
    name: "wphx_pluggable_token",
    numberOfParameters: 1,
    numberOfRequiredParameters: 0,
    returnsReference: false,
    hasReturnType: false,
    parameters: [
      {
        name: "subject",
        position: 0,
        isOptional: true,
        hasDefault: true,
        default: "override",
        hasType: false,
        isPassedByReference: false,
        isVariadic: false
      }
    ]
  },
  userIdReflection: expectedGenerated.userIdReflection
};

if (JSON.stringify(generated) !== JSON.stringify(expectedGenerated)) {
  throw new Error(`Unexpected generated pluggable timing result:\n${JSON.stringify(generated, null, 2)}`);
}
if (JSON.stringify(override) !== JSON.stringify(expectedOverride)) {
  throw new Error(`Unexpected override pluggable timing result:\n${JSON.stringify(override, null, 2)}`);
}

const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));
const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
const expectedDeclarations = ["global-function:wphx_pluggable_token", "global-function:wphx_pluggable_user_id"];
if (JSON.stringify(declarations) !== JSON.stringify(expectedDeclarations)) {
  throw new Error(`Unexpected pluggable declarations: ${JSON.stringify(declarations)}`);
}
if (emissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected pluggable unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
}

const manifest = {
  schema: "wphx.wphx-php-pluggable-timing.v1",
  issue: "WPHX-COMP-PHP-CONDITIONALS",
  evidence_class: "generated_shape_and_runtime_timing",
  generated_at: "2026-06-29T00:00:00.000Z",
  runner: "tools/wphx-php/run-pluggable-timing.mjs",
  hxml: "fixtures/wphx-php/pluggable-timing.hxml",
  generated_shell: {
    path: shellArtifactPath,
    sha256: sha256File(shell),
    exact_patterns: expectedPatterns
  },
  emission_manifest: {
    path: emissionManifestArtifactPath,
    sha256: sha256File(emissionManifestPath),
    unsupported_empty: true,
    declarations: expectedDeclarations
  },
  probes: {
    generated,
    override
  },
  claims: [
    "WPHX PHP emits pluggable-style guarded global declarations at an original wp-includes/pluggable.php load point.",
    "function_exists is false before normal load and true after require.",
    "A repeated require of the generated shell is safe because each generated function is guarded.",
    "A pre-defined function wins over the generated guarded declaration while neighboring generated declarations still load.",
    "Reflection-visible parameter defaults and by-reference/variadic flags match the minimized fixture ABI."
  ],
  non_claims: [
    "This fixture does not claim WordPress Core pluggable.php ownership.",
    "This fixture does not claim all WordPress pluggable functions or authentication/session behavior.",
    "This fixture does not claim arbitrary include-return or direct file-scope script emission."
  ]
};
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-receipt.v1",
  id: "receipt:wphx-comp-php-conditionals",
  issue: "WPHX-COMP-PHP-CONDITIONALS",
  recorded_at: "2026-06-29T00:00:00.000Z",
  status: "passed",
  artifacts: [
    { path: manifestPath, role: "pluggable timing manifest" },
    { path: receiptPath, role: "compiler fixture receipt" },
    { path: "fixtures/wphx-php/src/wphx/fixtures/compiler/php/pluggable/PluggableSurface.hx", role: "typed Haxe pluggable surface" },
    { path: "fixtures/wphx-php/pluggable-timing.hxml", role: "WPHX PHP pluggable timing hxml" }
  ],
  commands: ["npm run wphx:php:pluggable-timing", "npm run wphx:php:pluggable-timing:check"],
  manifest_sha256: sha256Text(manifestText),
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

if (!check) {
  console.log(JSON.stringify({ status: "passed", shell, manifest: manifestPath, receipt: receiptPath }, null, 2));
}
