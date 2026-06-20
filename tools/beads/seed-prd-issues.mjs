#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MANIFEST = "manifests/beads/prd-seed.v1.json";
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const check = args.has("--check") || !apply;

function run(commandArgs, options = {}) {
  return execFileSync("bd", commandArgs, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  }).trim();
}

function bd(commandArgs) {
  return JSON.parse(run(commandArgs));
}

function refNumber(ref) {
  const match = /^WPHX-(\d+)$/.exec(ref ?? "");
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function issueMap() {
  const issues = bd(["list", "--all", "--json", "--limit", "0"]);
  return new Map(issues.map((issue) => [issue.external_ref, issue]));
}

function fullIssue(id) {
  return bd(["show", id, "--json"])[0];
}

function addCliArg(args, flag, value) {
  if (value !== null && value !== undefined) {
    args.push(flag, String(value));
  }
}

function desiredParent(seed, byRef) {
  if (!seed.parent) return null;
  return byRef.get(seed.parent)?.id ?? null;
}

function desiredBlockerIds(seed, byRef) {
  return (seed.blocks ?? []).map((ref) => byRef.get(ref)?.id).filter(Boolean);
}

function compareSeed(seed, byRef) {
  const current = byRef.get(seed.external_ref);
  const errors = [];
  if (!current) {
    errors.push(`${seed.external_ref} is missing`);
    return errors;
  }
  const full = fullIssue(current.id);
  if (full.title !== seed.title) errors.push(`${seed.external_ref} title mismatch`);
  if (full.issue_type !== seed.issue_type) errors.push(`${seed.external_ref} type mismatch`);
  if (full.priority !== seed.priority) errors.push(`${seed.external_ref} priority mismatch`);
  if ((full.acceptance_criteria ?? null) !== (seed.acceptance_criteria ?? null)) errors.push(`${seed.external_ref} acceptance mismatch`);
  if ((full.description ?? null) !== (seed.description ?? null)) errors.push(`${seed.external_ref} description mismatch`);
  const parentRef = full.parent ? [...byRef.values()].find((issue) => issue.id === full.parent)?.external_ref ?? null : null;
  if ((seed.parent ?? null) !== parentRef) errors.push(`${seed.external_ref} parent mismatch`);
  const actualBlocks = new Set((full.dependencies ?? []).filter((dep) => dep.dependency_type === "blocks").map((dep) => dep.external_ref));
  for (const ref of seed.blocks ?? []) {
    if (!actualBlocks.has(ref)) errors.push(`${seed.external_ref} missing blocker ${ref}`);
  }
  return errors;
}

function createOrUpdate(seed, byRef) {
  const current = byRef.get(seed.external_ref);
  const parentId = desiredParent(seed, byRef);
  if (!current) {
    const args = ["create", "--title", seed.title, "--type", seed.issue_type, "--priority", String(seed.priority), "--external-ref", seed.external_ref, "--silent"];
    addCliArg(args, "--acceptance", seed.acceptance_criteria);
    addCliArg(args, "--description", seed.description);
    addCliArg(args, "--parent", parentId);
    const id = run(args);
    return { action: "created", ref: seed.external_ref, id };
  }
  const args = ["update", current.id, "--title", seed.title, "--type", seed.issue_type, "--priority", String(seed.priority)];
  addCliArg(args, "--acceptance", seed.acceptance_criteria);
  addCliArg(args, "--description", seed.description);
  addCliArg(args, "--parent", parentId);
  run(args, { stdio: ["ignore", "pipe", "pipe"] });
  return { action: "updated", ref: seed.external_ref, id: current.id };
}

function ensureDependencies(seed, byRef) {
  const current = byRef.get(seed.external_ref);
  if (!current) return [];
  const full = fullIssue(current.id);
  const actual = new Set((full.dependencies ?? []).filter((dep) => dep.dependency_type === "blocks").map((dep) => dep.id));
  const added = [];
  for (const blockerId of desiredBlockerIds(seed, byRef)) {
    if (actual.has(blockerId)) continue;
    run(["dep", "add", current.id, blockerId], { stdio: ["ignore", "pipe", "pipe"] });
    added.push(blockerId);
  }
  return added;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
if (manifest.schema !== "wphx.beads-prd-seed.v1") {
  throw new Error(`Unexpected seed schema in ${MANIFEST}`);
}

const refs = new Set();
const duplicates = [];
for (const seed of manifest.issues) {
  if (refs.has(seed.external_ref)) duplicates.push(seed.external_ref);
  refs.add(seed.external_ref);
}
if (duplicates.length > 0) {
  console.error(JSON.stringify({ status: "failed", duplicates }, null, 2));
  process.exit(1);
}

let byRef = issueMap();
const ordered = [...manifest.issues].sort((a, b) => refNumber(a.external_ref) - refNumber(b.external_ref));
const changes = [];

if (apply) {
  for (const seed of ordered) {
    const before = compareSeed(seed, byRef);
    if (before.length > 0) {
      changes.push(createOrUpdate(seed, byRef));
      byRef = issueMap();
    }
  }
  for (const seed of ordered) {
    const added = ensureDependencies(seed, byRef);
    if (added.length > 0) changes.push({ action: "dependencies_added", ref: seed.external_ref, added });
  }
  byRef = issueMap();
}

const errors = ordered.flatMap((seed) => compareSeed(seed, byRef));
if (errors.length > 0 && check) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: errors.length === 0 ? "passed" : "applied_with_remaining_errors",
      mode: apply ? "apply" : "check",
      seed_issues: ordered.length,
      changes,
      errors
    },
    null,
    2
  )
);
