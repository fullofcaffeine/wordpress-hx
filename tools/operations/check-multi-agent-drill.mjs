#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { normalize } from "node:path";

const MANIFEST = "manifests/operations/multi-agent-drill.v1.json";
const liveReady = process.argv.includes("--live-ready");

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 }));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return new Set(values).size === values.length;
}

function hasPathCollision(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function addDuplicateErrors(errors, label, values) {
  const seen = new Map();
  for (const value of values) {
    if (seen.has(value)) errors.push(`duplicate ${label}: ${value}`);
    seen.set(value, true);
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const errors = [];

if (manifest.schema !== "wphx.multi-agent-drill.v1") {
  errors.push(`Unexpected schema in ${MANIFEST}`);
}

const agents = asArray(manifest.agents);
if (agents.length !== 2) {
  errors.push(`expected exactly two agents, found ${agents.length}`);
}

const allIssues = new Map(bd(["list", "--all", "--json", "--limit", "0"]).map((issue) => [issue.id, issue]));
const readyRefs = new Set(bd(["ready", "--json"]).map((issue) => issue.external_ref));
const issueIds = agents.map((agent) => agent.issue?.id).filter(Boolean);
const externalRefs = agents.map((agent) => agent.issue?.external_ref).filter(Boolean);
const branches = agents.map((agent) => agent.branch).filter(Boolean);
const worktrees = agents.map((agent) => normalize(agent.worktree ?? "")).filter(Boolean);

addDuplicateErrors(errors, "issue id", issueIds);
addDuplicateErrors(errors, "external ref", externalRefs);
addDuplicateErrors(errors, "branch", branches);
addDuplicateErrors(errors, "worktree", worktrees);

for (const agent of agents) {
  const issueId = agent.issue?.id;
  const externalRef = agent.issue?.external_ref;
  const issue = allIssues.get(issueId);

  if (!agent.name) errors.push("agent is missing name");
  if (!issue) {
    errors.push(`${agent.name} references missing issue ${issueId}`);
  } else if (issue.external_ref !== externalRef) {
    errors.push(`${agent.name} issue ${issueId} points to ${issue.external_ref}, expected ${externalRef}`);
  }

  if (liveReady && agent.issue?.observed_ready && !readyRefs.has(externalRef)) {
    errors.push(`${agent.name} marked ${externalRef} as ready, but it is not currently ready`);
  }

  if (agent.claim?.mode !== "atomic") {
    errors.push(`${agent.name} claim mode must be atomic`);
  }
  if (!agent.claim?.command?.includes(issueId) || !agent.claim?.command?.includes("--claim")) {
    errors.push(`${agent.name} claim command must target ${issueId} with --claim`);
  }

  if (!agent.branch?.includes(issueId) || !agent.branch?.includes(externalRef)) {
    errors.push(`${agent.name} branch must include both ${issueId} and ${externalRef}`);
  }
  const normalizedWorktree = normalize(agent.worktree ?? "");
  if (!normalizedWorktree.startsWith("../wordpresshx-worktrees/")) {
    errors.push(`${agent.name} worktree must live under ../wordpresshx-worktrees/`);
  }
  if (!agent.worktree?.includes(issueId) || !agent.worktree?.includes(externalRef)) {
    errors.push(`${agent.name} worktree must include both ${issueId} and ${externalRef}`);
  }

  if (asArray(agent.owned_paths).length === 0) {
    errors.push(`${agent.name} must declare owned_paths`);
  }
  if (asArray(agent.generated_paths).length === 0) {
    errors.push(`${agent.name} must declare generated_paths`);
  }

  const handoffFields = new Set(asArray(agent.handoff?.required_fields));
  for (const field of ["commit", "branch", "worktree", "commands_run", "receipt_paths", "discoveries"]) {
    if (!handoffFields.has(field)) errors.push(`${agent.name} handoff is missing required field ${field}`);
  }
}

const ownedEntries = [];
for (const agent of agents) {
  for (const path of [...asArray(agent.owned_paths), ...asArray(agent.generated_paths), ...asArray(agent.conditional_paths)]) {
    ownedEntries.push({ agent: agent.name, path });
  }
}

for (let i = 0; i < ownedEntries.length; i++) {
  for (let j = i + 1; j < ownedEntries.length; j++) {
    const left = ownedEntries[i];
    const right = ownedEntries[j];
    if (left.agent !== right.agent && hasPathCollision(left.path, right.path)) {
      errors.push(`path collision between ${left.agent}:${left.path} and ${right.agent}:${right.path}`);
    }
  }
}

for (const shared of asArray(manifest.shared_outputs)) {
  if (shared.owner !== "coordinator") errors.push(`${shared.path} must be coordinator-owned`);
  if (!shared.command) errors.push(`${shared.path} must declare a deterministic command`);
}

const discovered = new Set();
for (const agent of agents) {
  for (const discovery of asArray(agent.handoff?.discoveries)) {
    if (!discovery.id) errors.push(`${agent.name} has a discovery without id`);
    discovered.add(discovery.id);
    if (!discovery.command?.includes(agent.issue?.id)) {
      errors.push(`${discovery.id} command must reference source issue ${agent.issue?.id}`);
    }
  }
}

const resolved = new Set(asArray(manifest.discovery_resolution).map((entry) => entry.discovery_id));
for (const discoveryId of discovered) {
  if (!resolved.has(discoveryId)) errors.push(`lost discovery without coordinator resolution: ${discoveryId}`);
}

if (!unique(asArray(manifest.acceptance_checks))) {
  errors.push("acceptance_checks contains duplicates");
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", manifest: MANIFEST, errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      manifest: MANIFEST,
      agent_count: agents.length,
      issue_refs: externalRefs,
      unique_claims: issueIds.length,
      live_ready_checked: liveReady,
      worktree_count: worktrees.length,
      owned_path_count: ownedEntries.length,
      shared_output_count: asArray(manifest.shared_outputs).length,
      resolved_discovery_count: resolved.size
    },
    null,
    2
  )
);
