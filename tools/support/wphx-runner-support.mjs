import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function sha256Text(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256File(path) {
  return sha256Text(readFileSync(path));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

export function writeFileRecursive(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export function artifactRecord(path, role = undefined) {
  return {
    path,
    ...(role === undefined ? {} : { role }),
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

export function writeOrCheck({ path, contents, checkOnly, updateCommand }) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(`${path} is stale; run ${updateCommand}`);
    }
    return;
  }

  writeFileRecursive(path, contents);
}

export function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 50
  });
  return {
    command: [command, ...args],
    cwd: options.cwd ?? process.cwd(),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? result.error.message : null
  };
}

export function captureProcessArtifacts(result, { stdoutPath, stderrPath }) {
  writeFileRecursive(stdoutPath, result.stdout ?? "");
  writeFileRecursive(stderrPath, result.stderr ?? "");
  return {
    stdout: artifactRecord(stdoutPath),
    stderr: artifactRecord(stderrPath)
  };
}

export function verificationReceipt({
  id,
  issue,
  recordedAt,
  command,
  evidenceClass,
  artifactScope,
  behaviorParityClaimed,
  artifacts,
  verificationCommands,
  validationResult
}) {
  return {
    schema: "wphx.verification-receipt.v1",
    id,
    issue,
    recorded_at: recordedAt,
    command,
    evidence_class: evidenceClass,
    artifact_scope: artifactScope,
    behavior_parity_claimed: behaviorParityClaimed,
    artifacts,
    verification_commands: verificationCommands,
    validation_result: validationResult
  };
}
