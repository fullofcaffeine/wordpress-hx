import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = join(root, "build/wphx-php/bootstrap-autoload");
const haxeRoot = join(outRoot, "haxe");
const generatedRoot = join(outRoot, "generated");
const shellA = join(generatedRoot, "wp-includes/wphx-bootstrap-a.php");
const shellB = join(generatedRoot, "wp-includes/wphx-bootstrap-b.php");
const emissionManifestPath = join(generatedRoot, "wphx-php-emission.v1.json");
const probe = join(outRoot, "probe.php");
const manifestPath = "manifests/wphx-php/bootstrap-autoload.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-bootstrap-autoload-probe.v1.json";

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

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

run("haxe", ["fixtures/wphx-php/bootstrap-autoload-impl.hxml"]);
run("haxe", ["fixtures/wphx-php/bootstrap-autoload.hxml"]);
run("php", ["-l", shellA]);
run("php", ["-l", shellB]);

const shellASource = readFileSync(shellA, "utf8");
const shellBSource = readFileSync(shellB, "utf8");
const exactPatterns = {
  a: [
    "if (!defined('WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED'))",
    "set_include_path(get_include_path() . PATH_SEPARATOR . $wphx_haxe_lib);",
    "spl_autoload_register(function ($class)",
    "define('HAXE_CUSTOM_ERROR_HANDLER', true);",
    "\\php\\Boot::__hx__init();",
    "function wphx_bootstrap_probe_a($label = 'a')"
  ],
  b: [
    "if (!defined('WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED'))",
    "function wphx_bootstrap_probe_b($label = 'b')"
  ]
};
for (const [id, patterns] of Object.entries(exactPatterns)) {
  const source = id === "a" ? shellASource : shellBSource;
  const missing = patterns.filter((pattern) => !source.includes(pattern));
  if (missing.length > 0) {
    throw new Error(`Generated bootstrap shell ${id} is missing patterns: ${JSON.stringify(missing)}`);
  }
}

mkdirSync(dirname(probe), { recursive: true });
writeFileSync(
  probe,
  `<?php
$shell_a = ${JSON.stringify(shellA)};
$shell_b = ${JSON.stringify(shellB)};
$haxe_lib = ${JSON.stringify(join(haxeRoot, "lib"))};

function wphx_describe_autoloaders() {
  $autoloaders = spl_autoload_functions();
  if (false === $autoloaders) {
    $autoloaders = array();
  }

  $kinds = array();
  foreach ($autoloaders as $autoload) {
    if ($autoload instanceof Closure) {
      $kinds[] = 'closure';
    } elseif (is_array($autoload)) {
      $kinds[] = 'array';
    } elseif (is_string($autoload)) {
      $kinds[] = 'string';
    } else {
      $kinds[] = gettype($autoload);
    }
  }

  return array(
    'count' => count($autoloaders),
    'kinds' => $kinds,
  );
}

function wphx_include_path_count($path) {
  $entries = explode(PATH_SEPARATOR, get_include_path());
  $count = 0;
  foreach ($entries as $entry) {
    if ($entry === $path) {
      $count++;
    }
  }
  return $count;
}

function wphx_state($label, $haxe_lib) {
  return array(
    'label' => $label,
    'haxeLibPathCount' => wphx_include_path_count($haxe_lib),
    'autoloaders' => wphx_describe_autoloaders(),
    'bootstrapConstantDefined' => defined('WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED'),
    'bootClassExists' => class_exists('php\\\\Boot', false),
    'bootInitExists' => class_exists('php\\\\Boot', false) ? method_exists('php\\\\Boot', '__hx__init') : false,
    'functionAExists' => function_exists('wphx_bootstrap_probe_a'),
    'functionBExists' => function_exists('wphx_bootstrap_probe_b'),
  );
}

spl_autoload_register(function ($class) {
  return false;
});

$states = array();
$states[] = wphx_state('before', $haxe_lib);
require $shell_a;
$states[] = wphx_state('after_shell_a', $haxe_lib);
require $shell_a;
$states[] = wphx_state('after_shell_a_second_require', $haxe_lib);
require $shell_b;
$states[] = wphx_state('after_shell_b', $haxe_lib);

$call_a = wphx_bootstrap_probe_a('first');
$call_b = wphx_bootstrap_probe_b('second');
$snapshot = json_decode(\\wphx\\fixtures\\php\\bootstrap\\BootstrapKernel::snapshot(), true);

echo json_encode(
  array(
    'states' => $states,
    'callA' => $call_a,
    'callB' => $call_b,
    'snapshot' => $snapshot,
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`
);

const observed = JSON.parse(run("php", [probe]));
const stateByLabel = Object.fromEntries(observed.states.map((state) => [state.label, state]));
const before = stateByLabel.before;
const afterA = stateByLabel.after_shell_a;
const afterASecond = stateByLabel.after_shell_a_second_require;
const afterB = stateByLabel.after_shell_b;

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(`${message}\nobserved:\n${JSON.stringify(observed, null, 2)}`);
  }
}

assertCondition(before.haxeLibPathCount === 0, "Haxe library path should not be present before bootstrap");
assertCondition(afterA.haxeLibPathCount === 1, "Haxe library path should be appended once after first shell");
assertCondition(afterASecond.haxeLibPathCount === 1, "Repeated require should not duplicate Haxe library path");
assertCondition(afterB.haxeLibPathCount === 1, "Second shell with same bootstrap constant should not duplicate Haxe library path");
assertCondition(afterA.autoloaders.count === before.autoloaders.count + 1, "First shell should register one Haxe autoloader");
assertCondition(afterASecond.autoloaders.count === afterA.autoloaders.count, "Repeated require should not duplicate Haxe autoloader");
assertCondition(afterB.autoloaders.count === afterA.autoloaders.count, "Second shell with same bootstrap constant should not duplicate Haxe autoloader");
assertCondition(before.autoloaders.kinds.at(-1) === "closure", "Sentinel autoloader should be the last pre-bootstrap autoloader");
assertCondition(afterA.autoloaders.kinds.at(-1) === "closure", "WPHX Haxe autoloader should append after existing autoloaders");
assertCondition(afterA.bootstrapConstantDefined === true, "Bootstrap constant should be defined after first shell");
assertCondition(afterA.bootClassExists === true && afterA.bootInitExists === true, "php\\\\Boot should be loaded after bootstrap");
assertCondition(afterB.functionAExists === true && afterB.functionBExists === true, "Both public functions should exist after loading both shells");
assertCondition(observed.callA === "boot:first:1", "Function A should delegate through stock Haxe PHP implementation");
assertCondition(observed.callB === "boot:second:2", "Function B should delegate through stock Haxe PHP implementation");
assertCondition(JSON.stringify(observed.snapshot) === JSON.stringify(["first", "second"]), "Implementation snapshot should preserve call order");

const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));
const declarations = emissionManifest.files
  .flatMap((file) => file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`))
  .sort();
const expectedDeclarations = [
  "wp-includes/wphx-bootstrap-a.php:global-function:wphx_bootstrap_probe_a",
  "wp-includes/wphx-bootstrap-b.php:global-function:wphx_bootstrap_probe_b"
];
if (JSON.stringify(declarations) !== JSON.stringify(expectedDeclarations)) {
  throw new Error(`Unexpected bootstrap autoload declarations: ${JSON.stringify(declarations)}`);
}
if (emissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected bootstrap autoload unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
}

const normalizedObservations = {
  states: observed.states.map((state) => ({
    label: state.label,
    haxeLibPathCount: state.haxeLibPathCount,
    autoloaderCount: state.autoloaders.count,
    autoloaderKinds: state.autoloaders.kinds,
    bootstrapConstantDefined: state.bootstrapConstantDefined,
    bootClassExists: state.bootClassExists,
    bootInitExists: state.bootInitExists,
    functionAExists: state.functionAExists,
    functionBExists: state.functionBExists
  })),
  callA: observed.callA,
  callB: observed.callB,
  snapshot: observed.snapshot
};
const manifest = {
  schema: "wphx.wphx-php-bootstrap-autoload.v1",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-AUTOLOAD-PROBE",
  evidence_class: "runtime_bootstrap_probe",
  generated_at: "2026-06-29T00:00:00.000Z",
  runner: "tools/wphx-php/run-bootstrap-autoload.mjs",
  hxml: {
    implementation: "fixtures/wphx-php/bootstrap-autoload-impl.hxml",
    public_shell: "fixtures/wphx-php/bootstrap-autoload.hxml"
  },
  artifacts: {
    haxe_lib: "build/wphx-php/bootstrap-autoload/haxe/lib",
    shell_a: {
      path: "build/wphx-php/bootstrap-autoload/generated/wp-includes/wphx-bootstrap-a.php",
      sha256: sha256File(shellA),
      exact_patterns: exactPatterns.a
    },
    shell_b: {
      path: "build/wphx-php/bootstrap-autoload/generated/wp-includes/wphx-bootstrap-b.php",
      sha256: sha256File(shellB),
      exact_patterns: exactPatterns.b
    },
    emission_manifest: {
      path: "build/wphx-php/bootstrap-autoload/generated/wphx-php-emission.v1.json",
      sha256: sha256File(emissionManifestPath),
      unsupported_empty: true,
      declarations: expectedDeclarations
    }
  },
  observations: normalizedObservations,
  validation_result: {
    status: "passed",
    haxe_lib_path_appended_once: true,
    repeated_require_idempotent: true,
    shared_bootstrap_constant_idempotent_across_shells: true,
    autoloader_appended_after_existing_loader: true,
    php_boot_loaded_after_bootstrap: true,
    implementation_delegation_worked: true
  },
  claims: [
    "The current WPHX per-shell Haxe bootstrap appends the Haxe library path once when two original-path shells share one bootstrap constant.",
    "Repeated require of the first shell does not duplicate the Haxe library path or SPL autoloader.",
    "A second original-path shell with the same bootstrap constant does not duplicate the Haxe library path or SPL autoloader.",
    "The generated Haxe autoloader is appended after an existing probe autoloader.",
    "php\\\\Boot is available after bootstrap and public shell calls delegate into stock Haxe PHP implementation code."
  ],
  non_claims: [
    "This fixture does not prove behavior for multiple different bootstrap constants or profiles.",
    "This fixture does not prove Haxe PHP warning/error-handler compatibility.",
    "This fixture does not prove stack-trace or source-map behavior.",
    "This fixture does not claim broad WordPress distribution bootstrap ownership."
  ]
};
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-runtime-receipt.v1",
  id: "receipt:wphx-comp-php-bootstrap-autoload-probe",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-AUTOLOAD-PROBE",
  recorded_at: "2026-06-29T00:00:00.000Z",
  status: "passed",
  artifacts: [
    { path: manifestPath, role: "bootstrap include-path/autoload probe manifest" },
    { path: receiptPath, role: "compiler runtime bootstrap receipt" },
    { path: "fixtures/wphx-php/src/wphx/fixtures/compiler/php/bootstrap/BootstrapShellSurface.hx", role: "typed WPHX public shell surface" },
    { path: "fixtures/wphx-php/src/wphx/fixtures/php/bootstrap/BootstrapKernel.hx", role: "stock Haxe PHP implementation kernel" }
  ],
  commands: ["npm run wphx:php:bootstrap-autoload", "npm run wphx:php:bootstrap-autoload:check"],
  manifest_sha256: sha256Text(manifestText),
  validation_result: manifest.validation_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

if (!check) {
  console.log(JSON.stringify({ status: "passed", manifest: manifestPath, receipt: receiptPath }, null, 2));
}
