#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  artifactRecord,
  captureProcessArtifacts,
  jsonText,
  readJson,
  runProcess,
  sha256Text,
  verificationReceipt,
  writeFileRecursive,
  writeOrCheck
} from "../support/wphx-runner-support.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const runtimeReportOnly = args.has("--runtime-report-only");

const ISSUE = {
  id: "wordpresshx-w91.3.5",
  external_ref: "WPHX-700.05",
  title: "WPHX-700.05 — Start upstream WordPress PHPUnit parity ratchet"
};
const RECORDED_AT = "2026-06-21T04:10:00.000Z";
const RUNNER = "tools/upstream/run-phpunit-ratchet.mjs";
const GROUPS = "tests/upstream/phpunit/groups.json";
const KNOWN_DELTAS = "tests/upstream/phpunit/known-deltas.json";
const OUT = "manifests/operations/wphx-700-05-upstream-phpunit-ratchet.v1.json";
const RECEIPT = "receipts/operations/wphx-700-05-upstream-phpunit-ratchet.v1.json";
const BUILD_ROOT = "build/upstream-phpunit/wphx-700-05";
const REPORT = `${BUILD_ROOT}/reports/upstream-phpunit-ratchet.json`;
const VANILLA_ROOT = process.env.WPHX_PHPUNIT_VANILLA_ROOT ?? "../wordpress-develop";
const CANDIDATE_ROOT = process.env.WPHX_PHPUNIT_CANDIDATE_ROOT ?? "";
const EXPECTED_UPSTREAM_REF = "26b68024931348d267b70e2a29910e1320d0094f";

function run(command, commandArgs, options = {}) {
  return runProcess(command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    maxBuffer: 1024 * 1024 * 50
  });
}

function phpunitBinary(root) {
  const local = `${root}/vendor/phpunit/phpunit/phpunit`;
  if (existsSync(local)) return local;
  return null;
}

function gitRef(root) {
  const result = run("git", ["rev-parse", "HEAD"], { cwd: root });
  return result.status === 0 ? result.stdout.trim() : null;
}

function prerequisiteReport(groups, knownDeltas) {
  const vanillaRoot = resolve(VANILLA_ROOT);
  const candidateRoot = CANDIDATE_ROOT === "" ? null : resolve(CANDIDATE_ROOT);
  const vanillaPhpunit = phpunitBinary(vanillaRoot);
  const candidatePhpunit = candidateRoot === null ? null : phpunitBinary(candidateRoot);
  const missing = [];

  if (!existsSync(vanillaRoot)) missing.push("vanilla_root_missing");
  if (gitRef(vanillaRoot) !== EXPECTED_UPSTREAM_REF) missing.push("vanilla_upstream_ref_mismatch");
  if (!vanillaPhpunit) missing.push("vanilla_phpunit_vendor_missing");
  if (!existsSync(`${vanillaRoot}/wp-tests-config.php`)) missing.push("vanilla_wp_tests_config_missing");
  if (candidateRoot === null) missing.push("candidate_root_env_missing");
  if (candidateRoot !== null && !existsSync(candidateRoot)) missing.push("candidate_root_missing");
  if (candidateRoot !== null && !candidatePhpunit) missing.push("candidate_phpunit_vendor_missing");
  if (candidateRoot !== null && !existsSync(`${candidateRoot}/wp-tests-config.php`)) {
    missing.push("candidate_wp_tests_config_missing");
  }

  for (const group of groups.groups) {
    for (const file of group.files) {
      if (!existsSync(`${vanillaRoot}/${file}`)) missing.push(`vanilla_test_file_missing:${file}`);
      if (candidateRoot !== null && !existsSync(`${candidateRoot}/${file}`)) {
        missing.push(`candidate_test_file_missing:${file}`);
      }
    }
  }

  return {
    status: missing.length === 0 ? "ready" : "blocked",
    missing,
    vanilla_root: vanillaRoot,
    candidate_root: candidateRoot,
    vanilla_phpunit: vanillaPhpunit,
    candidate_phpunit: candidatePhpunit,
    selected_group_count: groups.groups.length,
    selected_test_file_count: groups.groups.reduce((count, group) => count + group.files.length, 0),
    known_delta_count: knownDeltas.entries.length
  };
}

function commandFor(root, phpunit, group, side) {
  const junit = `${BUILD_ROOT}/junit/${side}-${group.id}.xml`;
  return {
    command: "php",
    args: [
      phpunit,
      "--configuration",
      "phpunit.xml.dist",
      "--log-junit",
      resolve(junit),
      ...group.files
    ],
    cwd: root,
    junit
  };
}

function runGroup(side, root, phpunit, group) {
  const spec = commandFor(root, phpunit, group, side);
  mkdirSync(dirname(spec.junit), { recursive: true });
  const result = run(spec.command, spec.args, { cwd: spec.cwd });
  const stdoutPath = `${BUILD_ROOT}/logs/${side}-${group.id}.stdout.txt`;
  const stderrPath = `${BUILD_ROOT}/logs/${side}-${group.id}.stderr.txt`;
  const captured = captureProcessArtifacts(result, { stdoutPath, stderrPath });
  return {
    side,
    group: group.id,
    command: [spec.command, ...spec.args],
    cwd: spec.cwd,
    exit_code: result.status,
    signal: result.signal,
    status: result.status === 0 ? "pass" : "fail",
    junit: existsSync(spec.junit) ? artifactRecord(spec.junit) : null,
    stdout: captured.stdout,
    stderr: captured.stderr
  };
}

function deltaKey(groupId) {
  return `${groupId}:vanilla-pass-candidate-fail`;
}

function classify(vanilla, candidate, knownDeltas) {
  const known = new Set(knownDeltas.entries.map((entry) => entry.test ?? entry.group ?? entry.id));
  if (vanilla.status === "pass" && candidate.status === "pass") return { classification: "parity_pass" };
  if (vanilla.status === "fail" && candidate.status === "fail") return { classification: "environment_or_upstream_baseline_failure" };
  if (vanilla.status === "fail" && candidate.status === "pass") return { classification: "candidate_divergence_investigate" };
  if (vanilla.status === "pass" && candidate.status === "fail") {
    const key = deltaKey(vanilla.group);
    return {
      classification: known.has(key) ? "known_candidate_failure" : "unowned_candidate_regression",
      known_delta_key: key
    };
  }
  return { classification: "unknown" };
}

function executeRatchet(prerequisites, groups, knownDeltas) {
  const runs = [];
  const classifications = [];
  for (const group of groups.groups) {
    const vanilla = runGroup("vanilla", prerequisites.vanilla_root, prerequisites.vanilla_phpunit, group);
    const candidate = runGroup("candidate", prerequisites.candidate_root, prerequisites.candidate_phpunit, group);
    runs.push(vanilla, candidate);
    classifications.push({
      group: group.id,
      owner: group.owner,
      vanilla_status: vanilla.status,
      candidate_status: candidate.status,
      ...classify(vanilla, candidate, knownDeltas)
    });
  }

  return {
    status: classifications.some((entry) => entry.classification === "unowned_candidate_regression") ? "failed" : "passed",
    runs,
    classifications
  };
}

const groups = readJson(GROUPS);
const knownDeltas = readJson(KNOWN_DELTAS);
const prerequisites = prerequisiteReport(groups, knownDeltas);
const execution =
  prerequisites.status === "ready"
    ? executeRatchet(prerequisites, groups, knownDeltas)
    : {
        status: "blocked",
        runs: [],
        classifications: [],
        blocked_reason: "Required upstream PHPUnit runtime inputs are missing; no upstream suite parity is claimed."
      };
const behaviorParityClaimed =
  execution.status === "passed" &&
  execution.classifications.length > 0 &&
  execution.classifications.every((entry) => entry.classification === "parity_pass");
const report = {
  schema: "wphx.upstream-phpunit-ratchet-report.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  evidence_class: "upstream_suite_parity",
  artifact_scope: "packaged_distribution",
  behavior_parity_claimed: behaviorParityClaimed,
  prerequisites,
  execution
};
writeFileRecursive(REPORT, jsonText(report));

if (runtimeReportOnly) {
  console.log(
    JSON.stringify(
      {
        status: execution.status,
        report: REPORT,
        evidence_class: report.evidence_class,
        artifact_scope: report.artifact_scope,
        behavior_parity_claimed: report.behavior_parity_claimed,
        environment_ready: prerequisites.status === "ready",
        blocked_inputs: prerequisites.missing
      },
      null,
      2
    )
  );
  if (execution.status === "failed") {
    process.exit(1);
  }
  process.exit(0);
}

const manifest = {
  schema: "wphx.upstream-phpunit-ratchet.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_class: "upstream_suite_parity",
  artifact_scope: "packaged_distribution",
  behavior_parity_claimed: behaviorParityClaimed,
  inputs: {
    runner: artifactRecord(RUNNER),
    groups: artifactRecord(GROUPS),
    known_deltas: artifactRecord(KNOWN_DELTAS)
  },
  upstream: {
    expected_ref: EXPECTED_UPSTREAM_REF,
    vanilla_root: prerequisites.vanilla_root,
    candidate_root: prerequisites.candidate_root
  },
  selected_groups: groups.groups,
  known_deltas: knownDeltas,
  report: {
    path: REPORT,
    sha256: artifactRecord(REPORT).sha256
  },
  validation_result: {
    status: execution.status,
    environment_ready: prerequisites.status === "ready",
    selected_upstream_groups_declared: groups.groups.length > 0,
    known_deltas_ledger_present: true,
    runs_executed: execution.runs.length,
    classifications_recorded: execution.classifications.length,
    rejects_new_vanilla_pass_candidate_fail:
      execution.status === "blocked" ||
      !execution.classifications.some((entry) => entry.classification === "unowned_candidate_regression"),
    blocked_inputs: prerequisites.missing
  }
};
const manifestText = jsonText(manifest);
const receipt = verificationReceipt({
  id: "receipt:wphx-700-05-upstream-phpunit-ratchet",
  issue: ISSUE,
  recordedAt: RECORDED_AT,
  command: "npm run upstream:phpunit-ratchet",
  evidenceClass: manifest.evidence_class,
  artifactScope: manifest.artifact_scope,
  behaviorParityClaimed: manifest.behavior_parity_claimed,
  artifacts: [
    {
      path: OUT,
      role: "upstream PHPUnit ratchet manifest",
      sha256: sha256Text(manifestText)
    },
    {
      path: REPORT,
      role: "complete upstream PHPUnit ratchet report",
      sha256: artifactRecord(REPORT).sha256
    },
    {
      path: KNOWN_DELTAS,
      role: "owned known-deltas ledger"
    }
  ],
  verification_commands: [
    "npm run upstream:phpunit-ratchet",
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
  updateCommand: "npm run upstream:phpunit-ratchet"
});
writeOrCheck({
  path: RECEIPT,
  contents: receiptText,
  checkOnly,
  updateCommand: "npm run upstream:phpunit-ratchet"
});

console.log(
  JSON.stringify(
    {
      status: execution.status,
      output: OUT,
      receipt: RECEIPT,
      evidence_class: manifest.evidence_class,
      artifact_scope: manifest.artifact_scope,
      behavior_parity_claimed: manifest.behavior_parity_claimed,
      environment_ready: prerequisites.status === "ready",
      blocked_inputs: prerequisites.missing
    },
    null,
    2
  )
);

if (execution.status === "failed") {
  process.exit(1);
}
