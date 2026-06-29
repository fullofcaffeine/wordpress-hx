import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = join(root, "build/wphx-php/f1");
const haxeOut = join(outRoot, "haxe");
const generatedRoot = join(outRoot, "generated");
const shell = join(generatedRoot, "wp-includes/plugin.php");
const manifestPath = join(generatedRoot, "wphx-php-emission.v1.json");
const probe = join(outRoot, "probe.php");
const oracle = "fixtures/php-facade/oracle/add-filter.php";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
  }
  return result.stdout ?? "";
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalize(result) {
  return {
    beforeFunctionExists: result.beforeFunctionExists,
    afterFunctionExists: result.afterFunctionExists,
    afterSecondRequireFunctionExists: result.afterSecondRequireFunctionExists,
    name: result.name,
    numberOfParameters: result.numberOfParameters,
    numberOfRequiredParameters: result.numberOfRequiredParameters,
    returnsReference: result.returnsReference,
    hasReturnType: result.hasReturnType,
    parameters: result.parameters,
    callReturn: result.callReturn,
    snapshot: result.snapshot
  };
}

function runProbe(mode, shellPath) {
  return JSON.parse(run("php", [probe, mode, shellPath]));
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

run("haxe", ["-cp", "fixtures/php-facade/src", "-main", "wphx.fixtures.php.facade.FacadeEntry", "-php", haxeOut]);
run("haxe", ["fixtures/wphx-php/f1-facade.hxml"]);
run("php", ["-l", shell]);

mkdirSync(dirname(probe), { recursive: true });
writeFileSync(
  probe,
  `<?php
$mode = $argv[1];
$shell = $argv[2];

$before = function_exists('add_filter');
require $shell;
$after = function_exists('add_filter');
require $shell;
$after_second_require = function_exists('add_filter');

$reflection = new ReflectionFunction('add_filter');
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

$return = add_filter('the_content', function ($value) { return $value; }, 10, 1);
$snapshot = 'generated' === $mode
  ? \\wphx\\fixtures\\php\\facade\\FacadeKernel::snapshot()
  : wphx_f1_snapshot();

echo json_encode(
  array(
    'mode' => $mode,
    'beforeFunctionExists' => $before,
    'afterFunctionExists' => $after,
    'afterSecondRequireFunctionExists' => $after_second_require,
    'name' => $reflection->getName(),
    'numberOfParameters' => $reflection->getNumberOfParameters(),
    'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
    'returnsReference' => $reflection->returnsReference(),
    'hasReturnType' => $reflection->hasReturnType(),
    'parameters' => $params,
    'callReturn' => $return,
    'snapshot' => json_decode($snapshot, true),
  ),
  JSON_UNESCAPED_SLASHES
);
`
);

const oracleResult = normalize(runProbe("oracle", oracle));
const generatedResult = normalize(runProbe("generated", shell));
if (JSON.stringify(oracleResult) !== JSON.stringify(generatedResult)) {
  throw new Error(
    `WPHX PHP F1 facade mismatch\noracle:\n${JSON.stringify(oracleResult, null, 2)}\ngenerated:\n${JSON.stringify(generatedResult, null, 2)}`
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const declarations = manifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
if (JSON.stringify(declarations) !== JSON.stringify(["global-function:add_filter"])) {
  throw new Error(`Unexpected F1 declarations: ${JSON.stringify(declarations)}`);
}

if (!check) {
  console.log(JSON.stringify({ status: "passed", shell, shell_sha256: sha256(shell), manifest: manifestPath }, null, 2));
}
