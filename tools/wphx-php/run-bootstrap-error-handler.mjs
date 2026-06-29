import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const root = process.cwd();
const outRoot = join(root, "build/wphx-php/bootstrap-error-handler");
const generatedRoot = join(outRoot, "generated");
const shell = join(generatedRoot, "wp-includes/wphx-bootstrap-a.php");
const shellB = join(generatedRoot, "wp-includes/wphx-bootstrap-b.php");
const emissionManifestPath = join(generatedRoot, "wphx-php-emission.v1.json");
const stockGeneratedRoot = join(outRoot, "stock/generated");
const stockShell = join(stockGeneratedRoot, "wp-includes/wphx-bootstrap-a.php");
const stockShellB = join(stockGeneratedRoot, "wp-includes/wphx-bootstrap-b.php");
const stockEmissionManifestPath = join(stockGeneratedRoot, "wphx-php-emission.v1.json");
const probe = join(outRoot, "probe.php");
const manifestPath = "manifests/wphx-php/bootstrap-error-handler.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-bootstrap-error-handler-probe.v1.json";
const profileReceiptPath = "receipts/compiler/wphx-comp-php-bootstrap-nonthrowing-profile.v1.json";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`
    );
  }
  return result.stdout ?? "";
}

function runPhpProbe(mode, selectedShell = shell) {
  const result = spawnSync("php", ["-d", "display_errors=stderr", probe, mode, selectedShell], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`php probe ${mode} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    json: JSON.parse(result.stdout)
  };
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

function stderrSummary(stderr) {
  return {
    has_output: stderr.length > 0,
    line_count: stderr.trim() === "" ? 0 : stderr.trim().split("\n").length,
    contains_warning: stderr.includes("Warning"),
    contains_missing_include: stderr.includes("wphx-missing-warning-target.php")
  };
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

run("haxe", ["fixtures/wphx-php/bootstrap-error-handler-impl.hxml"]);
run("haxe", ["fixtures/wphx-php/bootstrap-error-handler.hxml"]);
run("haxe", ["fixtures/wphx-php/bootstrap-error-handler-stock-impl.hxml"]);
run("haxe", ["fixtures/wphx-php/bootstrap-error-handler-stock.hxml"]);
run("php", ["-l", shell]);
run("php", ["-l", shellB]);
run("php", ["-l", stockShell]);
run("php", ["-l", stockShellB]);

const shellSource = readFileSync(shell, "utf8");
const shellBSource = readFileSync(shellB, "utf8");
const stockShellSource = readFileSync(stockShell, "utf8");
const exactPatterns = [
  "if (!defined('WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED'))",
  "if (!defined('HAXE_CUSTOM_ERROR_HANDLER'))",
  "define('HAXE_CUSTOM_ERROR_HANDLER', true);",
  "\\php\\Boot::__hx__init();",
  "function wphx_bootstrap_probe_a($label = 'a')"
];
const missingPatterns = exactPatterns.filter((pattern) => !shellSource.includes(pattern));
if (missingPatterns.length > 0) {
  throw new Error(`Generated bootstrap shell is missing patterns: ${JSON.stringify(missingPatterns)}`);
}
if (!shellBSource.includes("function wphx_bootstrap_probe_b($label = 'b')")) {
  throw new Error("Generated neighboring bootstrap shell is missing wphx_bootstrap_probe_b");
}
if (stockShellSource.includes("HAXE_CUSTOM_ERROR_HANDLER")) {
  throw new Error("Stock-control bootstrap shell should not define HAXE_CUSTOM_ERROR_HANDLER");
}

mkdirSync(dirname(probe), { recursive: true });
writeFileSync(
  probe,
  `<?php
$mode = $argv[1];
$shell = $argv[2];
$missing = dirname($shell) . '/wphx-missing-warning-target.php';

function wphx_handler_kind($handler) {
  if (null === $handler) {
    return 'none';
  }
  if ($handler instanceof Closure) {
    return 'closure';
  }
  if (is_array($handler)) {
    return 'array';
  }
  if (is_string($handler)) {
    return 'string';
  }
  return gettype($handler);
}

function wphx_current_handler_kind() {
  $previous = set_error_handler(function () {
    return false;
  });
  restore_error_handler();
  return wphx_handler_kind($previous);
}

if ('predefined-custom' === $mode) {
  define('HAXE_CUSTOM_ERROR_HANDLER', true);
}

if ('existing-handler' === $mode) {
  set_error_handler(function ($errno, $errstr) {
    return false;
  });
}

error_reporting(E_ALL);
$before_reporting = error_reporting();
$before_handler = wphx_current_handler_kind();
$custom_defined_before = defined('HAXE_CUSTOM_ERROR_HANDLER') ? HAXE_CUSTOM_ERROR_HANDLER : null;

require $shell;

$after_reporting = error_reporting();
$after_handler = wphx_current_handler_kind();
$custom_defined_after = defined('HAXE_CUSTOM_ERROR_HANDLER') ? HAXE_CUSTOM_ERROR_HANDLER : null;

$warning = array(
  'threw' => false,
  'throwableClass' => null,
  'throwableSeverity' => null,
  'returnValue' => null,
);

try {
  $warning['returnValue'] = include $missing;
} catch (Throwable $throwable) {
  $warning['threw'] = true;
  $warning['throwableClass'] = get_class($throwable);
  if ($throwable instanceof ErrorException) {
    $warning['throwableSeverity'] = $throwable->getSeverity();
  }
}

echo json_encode(
  array(
    'mode' => $mode,
    'customDefinedBeforeBootstrap' => $custom_defined_before,
    'customDefinedAfterBootstrap' => $custom_defined_after,
    'before' => array(
      'errorReporting' => $before_reporting,
      'handlerKind' => $before_handler,
    ),
    'after' => array(
      'errorReporting' => $after_reporting,
      'handlerKind' => $after_handler,
      'bootClassExists' => class_exists('php\\\\Boot', false),
      'functionExists' => function_exists('wphx_bootstrap_probe_a'),
    ),
    'warning' => $warning,
    'callReturn' => wphx_bootstrap_probe_a($mode),
  ),
  JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`
);

const emittedProbe = runPhpProbe("emitted");
const predefinedCustomProbe = runPhpProbe("predefined-custom");
const existingHandlerProbe = runPhpProbe("existing-handler");
const stockControlProbe = runPhpProbe("stock-control", stockShell);
const observations = {
  emitted: {...emittedProbe.json, stderr: stderrSummary(emittedProbe.stderr)},
  predefined_custom: {...predefinedCustomProbe.json, stderr: stderrSummary(predefinedCustomProbe.stderr)},
  existing_handler: {...existingHandlerProbe.json, stderr: stderrSummary(existingHandlerProbe.stderr)},
  stock_control: {...stockControlProbe.json, stderr: stderrSummary(stockControlProbe.stderr)}
};

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(`${message}\nobservations:\n${JSON.stringify(observations, null, 2)}`);
  }
}

assertCondition(observations.emitted.before.handlerKind === "none", "Emitted WordPress profile should start without a custom PHP error handler");
assertCondition(observations.emitted.customDefinedBeforeBootstrap === null, "Emitted WordPress profile should not need the caller to define HAXE_CUSTOM_ERROR_HANDLER");
assertCondition(observations.emitted.customDefinedAfterBootstrap === true, "Emitted WordPress profile should define HAXE_CUSTOM_ERROR_HANDLER during bootstrap");
assertCondition(observations.emitted.after.handlerKind === "none", "Emitted WordPress profile should avoid installing Haxe's error handler");
assertCondition(observations.emitted.warning.threw === false, "Emitted WordPress profile should preserve PHP warning return behavior");
assertCondition(observations.emitted.warning.returnValue === false, "Emitted WordPress profile include warning should return false");
assertCondition(observations.emitted.stderr.contains_warning === true, "Emitted WordPress profile should emit a PHP warning to stderr");
assertCondition(observations.emitted.after.errorReporting === observations.emitted.before.errorReporting, "Emitted WordPress profile should preserve error_reporting");
assertCondition(observations.predefined_custom.customDefinedBeforeBootstrap === true, "Predefined-custom mode should define HAXE_CUSTOM_ERROR_HANDLER before bootstrap");
assertCondition(observations.predefined_custom.after.handlerKind === "none", "Predefined-custom mode should avoid installing Haxe's error handler");
assertCondition(observations.predefined_custom.warning.threw === false, "Predefined-custom mode should preserve PHP warning return behavior");
assertCondition(observations.existing_handler.before.handlerKind === "closure", "Existing-handler mode should start with a user handler");
assertCondition(observations.existing_handler.after.handlerKind === "closure", "Existing-handler mode should preserve the existing handler kind");
assertCondition(observations.existing_handler.warning.threw === false, "Existing-handler mode should not install Haxe's throwing handler");
assertCondition(observations.stock_control.before.handlerKind === "none", "Stock-control mode should start without a custom PHP error handler");
assertCondition(observations.stock_control.customDefinedAfterBootstrap === null, "Stock-control mode should not define HAXE_CUSTOM_ERROR_HANDLER");
assertCondition(observations.stock_control.after.handlerKind === "closure", "Stock-control bootstrap should install Haxe's closure error handler");
assertCondition(observations.stock_control.warning.threw === true, "Stock-control bootstrap should convert an unsuppressed include warning into a throwable");
assertCondition(observations.stock_control.warning.throwableClass === "ErrorException", "Stock-control warning throwable should be ErrorException");
assertCondition(observations.stock_control.stderr.has_output === false, "Stock-control converted warning should be caught instead of emitted to stderr");
assertCondition(observations.stock_control.after.errorReporting !== observations.stock_control.before.errorReporting, "Stock-control Haxe bootstrap should mutate error_reporting");

const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));
const stockEmissionManifest = JSON.parse(readFileSync(stockEmissionManifestPath, "utf8"));
const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`));
const stockDeclarations = stockEmissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`));
if (!declarations.includes("wp-includes/wphx-bootstrap-a.php:global-function:wphx_bootstrap_probe_a")) {
  throw new Error(`Missing bootstrap error-handler declaration: ${JSON.stringify(declarations)}`);
}
if (emissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected bootstrap error-handler unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
}
if (emissionManifest.bootstrap_error_handler_policy !== "wordpress") {
  throw new Error(`Unexpected WordPress bootstrap error-handler policy: ${emissionManifest.bootstrap_error_handler_policy}`);
}
if (stockEmissionManifest.bootstrap_error_handler_policy !== "stock") {
  throw new Error(`Unexpected stock-control bootstrap error-handler policy: ${stockEmissionManifest.bootstrap_error_handler_policy}`);
}
if (stockEmissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected stock-control unsupported constructs: ${JSON.stringify(stockEmissionManifest.unsupported)}`);
}

const manifest = {
  schema: "wphx.wphx-php-bootstrap-error-handler.v1",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-ERROR-HANDLER-PROBE",
  evidence_class: "runtime_bootstrap_probe",
  generated_at: "2026-06-29T00:00:00.000Z",
  runner: "tools/wphx-php/run-bootstrap-error-handler.mjs",
  hxml: {
    implementation: "fixtures/wphx-php/bootstrap-error-handler-impl.hxml",
    stock_control_implementation: "fixtures/wphx-php/bootstrap-error-handler-stock-impl.hxml",
    public_shell: "fixtures/wphx-php/bootstrap-error-handler.hxml",
    stock_control_public_shell: "fixtures/wphx-php/bootstrap-error-handler-stock.hxml"
  },
  artifacts: {
    shell: {
      path: "build/wphx-php/bootstrap-error-handler/generated/wp-includes/wphx-bootstrap-a.php",
      sha256: sha256File(shell),
      exact_patterns: exactPatterns
    },
    neighboring_shell: {
      path: "build/wphx-php/bootstrap-error-handler/generated/wp-includes/wphx-bootstrap-b.php",
      sha256: sha256File(shellB),
      exact_patterns: ["function wphx_bootstrap_probe_b($label = 'b')"]
    },
    emission_manifest: {
      path: "build/wphx-php/bootstrap-error-handler/generated/wphx-php-emission.v1.json",
      sha256: sha256File(emissionManifestPath),
      unsupported_empty: true,
      bootstrap_error_handler_policy: emissionManifest.bootstrap_error_handler_policy,
      declarations: declarations.sort()
    },
    stock_control_shell: {
      path: "build/wphx-php/bootstrap-error-handler/stock/generated/wp-includes/wphx-bootstrap-a.php",
      sha256: sha256File(stockShell),
      exact_absent_patterns: ["HAXE_CUSTOM_ERROR_HANDLER"]
    },
    stock_control_emission_manifest: {
      path: "build/wphx-php/bootstrap-error-handler/stock/generated/wphx-php-emission.v1.json",
      sha256: sha256File(stockEmissionManifestPath),
      unsupported_empty: true,
      bootstrap_error_handler_policy: stockEmissionManifest.bootstrap_error_handler_policy,
      declarations: stockDeclarations.sort()
    }
  },
  observations,
  validation_result: {
    status: "passed",
    emitted_wordpress_profile_defines_custom_error_handler: true,
    emitted_wordpress_profile_preserves_php_warning_behavior: true,
    existing_handler_is_preserved: true,
    emitted_wordpress_profile_preserves_error_reporting: true,
    stock_control_installs_throwing_handler: true,
    stock_control_mutates_error_reporting: true
  },
  policy_result: {
    broad_distribution_default: "WPHX WordPress-profile bootstrap emits HAXE_CUSTOM_ERROR_HANDLER=true before php.Boot::__hx__init()",
    stock_control: "wphx_php_bootstrap_error_handler=stock intentionally keeps stock Haxe PHP throwing-handler behavior",
    reason: "WordPress-compatible public shells must not silently convert unsuppressed warnings/notices into ErrorException during normal request lifecycle."
  },
  claims: [
    "The WPHX PHP WordPress profile now emits HAXE_CUSTOM_ERROR_HANDLER=true before php.Boot::__hx__init().",
    "The emitted WordPress-profile bootstrap prevents Haxe's error handler from being installed and preserves PHP warning return behavior.",
    "The emitted WordPress-profile bootstrap preserves error_reporting across php.Boot initialization.",
    "If a user error handler already exists, the emitted WordPress-profile bootstrap preserves it.",
    "The explicit stock-control policy keeps stock Haxe PHP behavior and still installs a throwing handler."
  ],
  non_claims: [
    "This fixture does not prove stack-trace or source-map behavior.",
    "This fixture does not claim all PHP warning, notice, deprecation, or fatal-error branches."
  ]
};
const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-runtime-receipt.v1",
  id: "receipt:wphx-comp-php-bootstrap-error-handler-probe",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-ERROR-HANDLER-PROBE",
  recorded_at: "2026-06-29T00:00:00.000Z",
  status: "passed",
  artifacts: [
    { path: manifestPath, role: "bootstrap warning/error-handler probe manifest" },
    { path: receiptPath, role: "compiler runtime bootstrap receipt" },
    { path: "fixtures/wphx-php/bootstrap-error-handler.hxml", role: "WPHX PHP public-shell fixture" },
    { path: "fixtures/wphx-php/bootstrap-error-handler-stock.hxml", role: "WPHX PHP stock-control public-shell fixture" },
    { path: "fixtures/wphx-php/bootstrap-error-handler-stock-impl.hxml", role: "stock-control Haxe PHP implementation fixture" },
    { path: "fixtures/wphx-php/bootstrap-error-handler-impl.hxml", role: "stock Haxe PHP implementation fixture" }
  ],
  commands: ["npm run wphx:php:bootstrap-error-handler", "npm run wphx:php:bootstrap-error-handler:check"],
  manifest_sha256: sha256Text(manifestText),
  validation_result: manifest.validation_result,
  policy_result: manifest.policy_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};
const profileReceipt = {
  schema: "wphx.compiler-runtime-receipt.v1",
  id: "receipt:wphx-comp-php-bootstrap-nonthrowing-profile",
  issue: "WPHX-COMP-PHP-BOOTSTRAP-NONTHROWING-PROFILE",
  recorded_at: "2026-06-29T00:00:00.000Z",
  status: "passed",
  artifacts: [
    { path: manifestPath, role: "bootstrap warning/error-handler emitted-profile manifest" },
    { path: profileReceiptPath, role: "compiler runtime bootstrap emitted-profile receipt" },
    { path: "src/wphx/compiler/php/WphxPhpCompiler.hx", role: "WPHX PHP bootstrap policy implementation" },
    { path: "fixtures/wphx-php/bootstrap-error-handler.hxml", role: "WPHX PHP WordPress-profile public-shell fixture" },
    { path: "fixtures/wphx-php/bootstrap-error-handler-stock.hxml", role: "WPHX PHP stock-control public-shell fixture" },
    { path: "fixtures/wphx-php/bootstrap-error-handler-impl.hxml", role: "stock Haxe PHP implementation fixture" }
  ],
  commands: ["npm run wphx:php:bootstrap-error-handler", "npm run wphx:php:bootstrap-error-handler:check"],
  manifest_sha256: sha256Text(manifestText),
  validation_result: manifest.validation_result,
  policy_result: manifest.policy_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
writeOrCheck(profileReceiptPath, JSON.stringify(profileReceipt, null, 2) + "\n");

if (!check) {
  console.log(JSON.stringify({ status: "passed", manifest: manifestPath, receipt: receiptPath }, null, 2));
}
