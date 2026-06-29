import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = join(root, "build/wphx-php/f4");
const haxeOut = join(outRoot, "haxe");
const generatedRoot = join(outRoot, "generated");
const shell = join(generatedRoot, "wp-includes/class-wphx-public-class.php");
const manifestPath = join(generatedRoot, "wphx-php-emission.v1.json");
const probe = join(outRoot, "probe.php");
const oracle = "fixtures/php-facade/oracle/public-class.php";

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
    before: result.before,
    afterSecondRequire: result.afterSecondRequire,
    classReflection: result.classReflection,
    baseReflection: result.baseReflection,
    interfaceReflection: result.interfaceReflection,
    methods: result.methods,
    properties: result.properties,
    objectCases: result.objectCases
  };
}

function runProbe(mode, shellPath) {
  return JSON.parse(run("php", [probe, mode, shellPath]));
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

run("haxe", ["-cp", "fixtures/php-facade/src", "-main", "wphx.fixtures.php.facade.ClassEntry", "-php", haxeOut]);
run("haxe", ["fixtures/wphx-php/f4-public-class.hxml"]);
run("php", ["-l", shell]);

mkdirSync(dirname(probe), { recursive: true });
writeFileSync(
  probe,
  `<?php
$mode = $argv[1];
$shell = $argv[2];

$before = array(
  'interface' => interface_exists('WPHX_Public_Interface', false),
  'base' => class_exists('WPHX_Public_Base', false),
  'class' => class_exists('WPHX_Public_Class', false),
);

require $shell;
require $shell;

$after = array(
  'interface' => interface_exists('WPHX_Public_Interface', false),
  'base' => class_exists('WPHX_Public_Base', false),
  'class' => class_exists('WPHX_Public_Class', false),
);

$instance = new WPHX_Public_Class('core', array('a' => 1, 'b' => 2));
$factory = WPHX_Public_Class::factory('factory');
$class = new ReflectionClass('WPHX_Public_Class');
$base = new ReflectionClass('WPHX_Public_Base');
$interface = new ReflectionClass('WPHX_Public_Interface');

function wphx_f4_params($reflection) {
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

  return $params;
}

$methods = array();
foreach (array('__construct', 'factory', 'describe', 'get_meta', 'base_label') as $method_name) {
  $owner = $class->hasMethod($method_name) ? $class : $base;
  $method = $owner->getMethod($method_name);
  $methods[$method_name] = array(
    'name' => $method->getName(),
    'class' => $method->getDeclaringClass()->getName(),
    'isPublic' => $method->isPublic(),
    'isStatic' => $method->isStatic(),
    'numberOfParameters' => $method->getNumberOfParameters(),
    'numberOfRequiredParameters' => $method->getNumberOfRequiredParameters(),
    'hasReturnType' => $method->hasReturnType(),
    'returnsReference' => $method->returnsReference(),
    'parameters' => wphx_f4_params($method),
  );
}

$properties = array();
foreach (array('instances', 'name', 'meta', 'baseValue') as $property_name) {
  $owner = $class->hasProperty($property_name) ? $class : $base;
  $property = $owner->getProperty($property_name);
  $properties[$property_name] = array(
    'name' => $property->getName(),
    'class' => $property->getDeclaringClass()->getName(),
    'isPublic' => $property->isPublic(),
    'isProtected' => $property->isProtected(),
    'isStatic' => $property->isStatic(),
  );
}

echo json_encode(
  array(
    'mode' => $mode,
    'before' => $before,
    'afterSecondRequire' => $after,
    'classReflection' => array(
      'name' => $class->getName(),
      'isInstantiable' => $class->isInstantiable(),
      'parent' => $class->getParentClass()->getName(),
      'interfaceNames' => $class->getInterfaceNames(),
      'constants' => $class->getConstants(),
      'shortName' => $class->getShortName(),
    ),
    'baseReflection' => array(
      'name' => $base->getName(),
      'constants' => $base->getConstants(),
    ),
    'interfaceReflection' => array(
      'name' => $interface->getName(),
      'isInterface' => $interface->isInterface(),
    ),
    'methods' => $methods,
    'properties' => $properties,
    'objectCases' => array(
      'instanceOfClass' => $instance instanceof WPHX_Public_Class,
      'instanceOfBase' => $instance instanceof WPHX_Public_Base,
      'instanceOfInterface' => $instance instanceof WPHX_Public_Interface,
      'nameProperty' => $instance->name,
      'describe' => $instance->describe(),
      'baseLabel' => $instance->base_label(),
      'metaExisting' => $instance->get_meta('a', 'fallback'),
      'metaMissing' => $instance->get_meta('missing', 'fallback'),
      'factoryClass' => get_class($factory),
      'factoryDescribe' => $factory->describe(),
      'staticInstances' => WPHX_Public_Class::$instances,
    ),
  ),
  JSON_UNESCAPED_SLASHES
);
`
);

const oracleResult = normalize(runProbe("oracle", oracle));
const generatedResult = normalize(runProbe("generated", shell));
if (JSON.stringify(oracleResult) !== JSON.stringify(generatedResult)) {
  throw new Error(
    `WPHX PHP F4 facade mismatch\noracle:\n${JSON.stringify(oracleResult, null, 2)}\ngenerated:\n${JSON.stringify(generatedResult, null, 2)}`
  );
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const declarations = manifest.files.flatMap((file) => file.declarations.map((entry) => `${entry.kind}:${entry.name}`));
const expectedDeclarations = ["interface:WPHX_Public_Interface", "class:WPHX_Public_Base", "class:WPHX_Public_Class"];
if (JSON.stringify(declarations) !== JSON.stringify(expectedDeclarations)) {
  throw new Error(`Unexpected F4 declarations: ${JSON.stringify(declarations)}`);
}

if (manifest.unsupported.length !== 0) {
  throw new Error(`Unexpected F4 unsupported constructs: ${JSON.stringify(manifest.unsupported)}`);
}

if (!check) {
  console.log(JSON.stringify({ status: "passed", shell, shell_sha256: sha256(shell), manifest: manifestPath }, null, 2));
}
