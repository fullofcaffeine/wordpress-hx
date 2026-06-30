import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const issue = {
  id: "wordpresshx-8bu",
  external_ref: "WPHX-COMP-PHP-FIRST-SEGMENT-SHELL",
  title: "Emit first generated template segment shell"
};
const recordedAt = "2026-06-30T00:00:00.000Z";
const runnerPath = "tools/wphx-php/run-template-segment-admin-style.mjs";
const hxmlPath = "fixtures/wphx-php/template-segment-admin-style.hxml";
const outRoot = "build/wphx-php/template-segment-admin-style";
const generatedRoot = `${outRoot}/generated`;
const oracleRoot = "fixtures/wphx-php/oracle/template-segment";
const generatedShell = `${generatedRoot}/wp-admin/wphx-template-segment-admin.php`;
const oracleShell = `${oracleRoot}/wp-admin/wphx-template-segment-admin.php`;
const emissionManifestPath = `${generatedRoot}/wphx-php-emission.v1.json`;
const probePath = `${outRoot}/probe.php`;
const manifestPath = "manifests/wphx-php/template-segment-admin-style.v1.json";
const receiptPath = "receipts/compiler/wphx-comp-php-first-segment-shell.v1.json";

const expectedPatterns = [
  "if (!defined('ABSPATH'))",
  "function wphx_segment_escape($value)",
  "$GLOBALS['wphx_segment_trace'][] = array(",
  "<div class=\"wrap\" data-screen=\"<?php echo wphx_segment_escape($screen->id); ?>\">",
  "<?php foreach ($items as $index => $item) : ?>",
  "$items[] = 'admin-mutated';",
  "'marker' => 'segment:ADMIN'"
];

const expectedCoreIrFeatures = [
  "segment.caller-scope-local",
  "segment.control",
  "segment.declaration",
  "segment.global-mutation",
  "segment.guard",
  "segment.literal-output",
  "segment.object-mutation",
  "segment.return",
  "segment.script",
  "segment.template-expression"
];

const segmentOrder = [
  "guard",
  "declaration",
  "script",
  "literal_output",
  "template_expression",
  "control",
  "script",
  "return_exit"
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256Text(readFileSync(path));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run without --check to generate it`);
    }
    if (readFileSync(path, "utf8") !== content) {
      throw new Error(`${path} is stale; run without --check to refresh it`);
    }
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

function writeProbe() {
  mkdirSync(dirname(probePath), { recursive: true });
  writeFileSync(
    probePath,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );
$mode = $argv[2] ?? 'normal';
$file = $root . '/wp-admin/wphx-template-segment-admin.php';

function wphx_run_template_segment_admin( $file, $define_abspath ) {
\tif ( $define_abspath && ! defined( 'ABSPATH' ) ) {
\t\tdefine( 'ABSPATH', dirname( $file, 2 ) . '/' );
\t}

\t$title = 'Posts & Pages';
\t$notice = 'saved';
\t$items = array( 'alpha', 'beta <two>' );
\t$screen = (object) array( 'id' => 'edit-post', 'rendered' => false );
\t$GLOBALS['wphx_segment_trace'] = array();

\tob_start();
\t$return = include $file;
\t$output = ob_get_clean();

\treturn array(
\t\t'returnValue' => $return,
\t\t'output' => $output,
\t\t'locals' => array(
\t\t\t'title' => $title,
\t\t\t'notice' => $notice,
\t\t\t'items' => $items,
\t\t\t'screen' => array( 'id' => $screen->id, 'rendered' => $screen->rendered ),
\t\t),
\t\t'trace' => $GLOBALS['wphx_segment_trace'],
\t\t'functions' => array(
\t\t\t'escape' => function_exists( 'wphx_segment_escape' ),
\t\t\t'row_class' => function_exists( 'wphx_segment_row_class' ),
\t\t),
\t);
}

if ( 'guard' === $mode ) {
\t$result = wphx_run_template_segment_admin( $file, false );
} else {
\t$result = wphx_run_template_segment_admin( $file, true );
}

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\\n";
`
  );
}

function runProbe(root, mode) {
  return JSON.parse(command("php", [probePath, root, mode]));
}

function expectedNormalObservation() {
  return {
    returnValue: {
      kind: "admin-segment",
      notice: "SAVED",
      itemCount: 3,
      marker: "segment:ADMIN"
    },
    output:
      '<div class="wrap" data-screen="edit-post">\n' +
      "\t<h1>Posts &amp; Pages</h1>\n" +
      '\t<div class="notice">SAVED</div>\n' +
      '\t<ul class="wp-list-table">\n' +
      '\t\t\t\t\t<li class="row even" data-index="0">alpha</li>\n' +
      '\t\t\t\t\t<li class="row odd" data-index="1">beta &lt;two&gt;</li>\n' +
      "\t\t\t</ul>\n" +
      "</div>\n",
    locals: {
      title: "Posts & Pages",
      notice: "SAVED",
      items: ["alpha", "beta <two>", "admin-mutated"],
      screen: {
        id: "edit-post",
        rendered: true
      }
    },
    trace: [
      {
        event: "admin:begin",
        title: "Posts & Pages",
        itemCount: 2
      },
      {
        event: "admin:end",
        notice: "SAVED",
        itemCount: 3
      }
    ],
    functions: {
      escape: true,
      row_class: true
    }
  };
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
command("haxe", [hxmlPath]);
command("php", ["-l", generatedShell]);
command("php", ["-l", oracleShell]);
writeProbe();

const generatedSource = readFileSync(generatedShell, "utf8");
const missingPatterns = expectedPatterns.filter((pattern) => !generatedSource.includes(pattern));
if (missingPatterns.length > 0) {
  throw new Error(`Generated segment shell is missing patterns: ${JSON.stringify(missingPatterns)}`);
}

const emissionManifest = JSON.parse(readFileSync(emissionManifestPath, "utf8"));
const declarations = emissionManifest.files.flatMap((file) =>
  file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`)
);
const expectedDeclarations = ["wp-admin/wphx-template-segment-admin.php:script:template-segment-admin-style"];
assertJsonEqual(declarations, expectedDeclarations, "emission declarations");
assertJsonEqual([...emissionManifest.core_ir_features].sort(), expectedCoreIrFeatures, "core IR features");
if (emissionManifest.unsupported.length !== 0) {
  throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
}

const observations = {
  oracle: {
    normal: runProbe(oracleRoot, "normal"),
    guard: runProbe(oracleRoot, "guard")
  },
  candidate: {
    normal: runProbe(generatedRoot, "normal"),
    guard: runProbe(generatedRoot, "guard")
  }
};

assertJsonEqual(observations.oracle.normal, expectedNormalObservation(), "oracle normal observation");
assertJsonEqual(observations.candidate.normal, expectedNormalObservation(), "candidate normal observation");
assertJsonEqual(observations.candidate.normal, observations.oracle.normal, "oracle/candidate normal behavior");
assertJsonEqual(observations.oracle.guard.returnValue, "ABSPATH_REQUIRED", "oracle guard return");
assertJsonEqual(observations.candidate.guard.returnValue, "ABSPATH_REQUIRED", "candidate guard return");

const manifest = {
  schema: "wphx.wphx-php-template-segment-admin-style.v1",
  issue,
  generated_at: recordedAt,
  runner: runnerPath,
  hxml: hxmlPath,
  evidence_class: "compiler_emitted_segment_shell",
  artifact_scope: "minimized_admin_style_template_segment_fixture",
  generated_shell: inputRecord(generatedShell),
  oracle_shell: inputRecord(oracleShell),
  emission_manifest: {
    ...inputRecord(emissionManifestPath),
    declarations: expectedDeclarations,
    core_ir_features: expectedCoreIrFeatures,
    unsupported_empty: true
  },
  segment_plan: {
    original_path: "wp-admin/wphx-template-segment-admin.php",
    adoption_mode: "compiler_emitted_segment_shell",
    segment_order: segmentOrder,
    caller_scope: {
      reads_locals: ["title", "notice", "items", "screen"],
      mutates_locals: ["notice", "items"],
      mutates_objects: ["screen.rendered"],
      globals: ["wphx_segment_trace"]
    },
    observable_effects: ["guard_return", "mixed_output_order", "escaped_output", "local_array_mutation", "object_mutation", "global_trace", "include_return_value"]
  },
  generated_shape: {
    exact_patterns: expectedPatterns,
    php_lint: "passed"
  },
  observations,
  claims: [
    "WPHX PHP emits the first compiler-generated original-path admin-style template segment shell from a script adapter.",
    "The generated shell covers guard, declaration, script, literal output, template expression, control, caller-scope local mutation, object mutation, global trace, and return behavior in a minimized fixture.",
    "Oracle and candidate behavior match for rendered output, caller locals, object mutation, global trace, function declarations, include return value, and direct-load guard return."
  ],
  non_claims: [
    "This does not claim generated ownership of existing WordPress mixed PHP/HTML files.",
    "This does not claim broad theme, admin, feed, or block template ownership.",
    "This does not claim HHX/HXX parity for existing Core templates.",
    "This does not claim arbitrary Haxe expression lowering into PHP caller scope.",
    "This does not claim whole-file ownership for any WordPress file."
  ],
  validation_result: {
    status: "passed",
    php_lint: "passed",
    exact_shape_patterns_passed: true,
    core_ir_features_passed: true,
    unsupported_empty: true,
    oracle_candidate_behavior_match: true,
    guard_behavior_passed: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-first-segment-shell",
  issue,
  recorded_at: recordedAt,
  status: "passed",
  evidence_class: manifest.evidence_class,
  artifact_scope: manifest.artifact_scope,
  commands: ["npm run wphx:php:template-segment-admin-style", "npm run wphx:php:template-segment-admin-style:check"],
  artifacts: [
    { path: manifestPath, role: "WPHX PHP first template segment shell manifest" },
    { path: runnerPath, role: "deterministic template segment shell runner" },
    { path: "src/wphx/compiler/php/WphxPhpCompiler.hx", role: "WPHX PHP compiler script adapter implementation" }
  ],
  manifest_sha256: sha256Text(manifestText),
  validation_result: manifest.validation_result,
  claims: manifest.claims,
  non_claims: manifest.non_claims
};

writeOrCheck(manifestPath, manifestText);
writeOrCheck(receiptPath, JSON.stringify(receipt, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: manifestPath,
      receipt: receiptPath,
      declarations: expectedDeclarations,
      segment_order: segmentOrder
    },
    null,
    2
  )
);
