#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  artifactRecord,
  jsonText,
  readJson,
  sha256Text,
  verificationReceipt,
  writeOrCheck
} from "./wphx-runner-support.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-w91.3.6",
  external_ref: "WPHX-700.06",
  title: "WPHX-700.06 — Centralize parity runner reports with evidence metadata"
};
const RECORDED_AT = "2026-06-21T05:20:00.000Z";
const SUPPORT = "tools/support/wphx-runner-support.mjs";
const ADOPTED_RUNNER = "tools/upstream/run-phpunit-ratchet.mjs";
const OUT = "manifests/operations/wphx-700-06-runner-support.v1.json";
const RECEIPT = "receipts/operations/wphx-700-06-runner-support.v1.json";
const RUNNER = "tools/support/check-runner-support.mjs";

function requireText(path, needle) {
  return readFileSync(path, "utf8").includes(needle);
}

const supportExports = [
  "artifactRecord",
  "captureProcessArtifacts",
  "jsonText",
  "readJson",
  "runProcess",
  "sha256File",
  "sha256Text",
  "verificationReceipt",
  "writeFileRecursive",
  "writeOrCheck"
];
const adoptionChecks = [
  "from \"../support/wphx-runner-support.mjs\"",
  "captureProcessArtifacts",
  "artifactRecord",
  "verificationReceipt",
  "writeOrCheck"
];
const packageJson = readJson("package.json");
const errors = [];

for (const symbol of supportExports) {
  if (!requireText(SUPPORT, `export function ${symbol}`)) {
    errors.push(`support module does not export ${symbol}`);
  }
}

for (const needle of adoptionChecks) {
  if (!requireText(ADOPTED_RUNNER, needle)) {
    errors.push(`adopted runner missing ${needle}`);
  }
}

for (const script of ["operations:runner-support", "operations:runner-support:check"]) {
  if (!packageJson.scripts?.[script]) {
    errors.push(`package.json missing script ${script}`);
  }
}

if (!existsSync("manifests/operations/wphx-700-05-upstream-phpunit-ratchet.v1.json")) {
  errors.push("adopted runner manifest is missing");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.runner-support.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_class: "provenance",
  artifact_scope: "helper",
  behavior_parity_claimed: false,
  inputs: {
    checker: artifactRecord(RUNNER),
    support_module: artifactRecord(SUPPORT),
    adopted_runner: artifactRecord(ADOPTED_RUNNER),
    package_json: artifactRecord("package.json")
  },
  shared_capabilities: {
    artifact_records: true,
    deterministic_write_or_check: true,
    process_stdout_stderr_capture: true,
    receipt_builder: true,
    evidence_metadata_fields: ["evidence_class", "artifact_scope", "behavior_parity_claimed"],
    junit_supported_as_artifact_record: true
  },
  adopted_by: [
    {
      runner: ADOPTED_RUNNER,
      command: "npm run upstream:phpunit-ratchet",
      check_command: "npm run upstream:phpunit-ratchet:check",
      evidence_class: "upstream_suite_parity",
      artifact_scope: "packaged_distribution",
      preserves_stdout_stderr_by_digest: true,
      optional_junit_by_digest: true
    }
  ],
  validation_result: {
    status: "passed",
    support_module_exists: true,
    expected_exports_present: true,
    adopted_runner_uses_support: true,
    deterministic_check_mode_supported: true,
    stdout_stderr_capture_supported: true,
    receipt_metadata_supported: true
  }
};
const manifestText = jsonText(manifest);
const receipt = verificationReceipt({
  id: "receipt:wphx-700-06-runner-support",
  issue: ISSUE,
  recordedAt: RECORDED_AT,
  command: "npm run operations:runner-support",
  evidenceClass: manifest.evidence_class,
  artifactScope: manifest.artifact_scope,
  behaviorParityClaimed: false,
  artifacts: [
    {
      path: OUT,
      role: "shared runner support manifest",
      sha256: sha256Text(manifestText)
    },
    {
      path: SUPPORT,
      role: "shared runner support utilities"
    },
    {
      path: ADOPTED_RUNNER,
      role: "first adopted runner"
    }
  ],
  verificationCommands: [
    "npm run operations:runner-support",
    "npm run operations:runner-support:check",
    "npm run upstream:phpunit-ratchet:check",
    "npm run receipts:validate"
  ],
  validationResult: manifest.validation_result
});
const receiptText = jsonText(receipt);

writeOrCheck({
  path: OUT,
  contents: manifestText,
  checkOnly,
  updateCommand: "npm run operations:runner-support"
});
writeOrCheck({
  path: RECEIPT,
  contents: receiptText,
  checkOnly,
  updateCommand: "npm run operations:runner-support"
});

console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT }, null, 2));
