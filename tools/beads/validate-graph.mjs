#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function bd(args) {
  return JSON.parse(execFileSync("bd", args, { encoding: "utf8" }));
}

const all = bd(["list", "--all", "--json", "--limit", "0"]);
const ready = bd(["ready", "--json"]);
const blocked = bd(["blocked", "--json"]);
const refs = new Map();
const errors = [];

for (const issue of all) {
  if (!/^WPHX-[0-9]+$/.test(issue.external_ref ?? "")) {
    errors.push(`${issue.id} has invalid external_ref ${issue.external_ref}`);
  }
  if (refs.has(issue.external_ref)) {
    errors.push(`duplicate ${issue.external_ref}: ${refs.get(issue.external_ref)} and ${issue.id}`);
  }
  refs.set(issue.external_ref, issue.id);
}

for (const issue of ready) {
  if (!["open", "in_progress"].includes(issue.status)) {
    errors.push(`ready issue ${issue.id} has non-ready status ${issue.status}`);
  }
  if (issue.blocked_by_count || issue.blocked_by?.length) {
    errors.push(`ready issue ${issue.id} is blocked`);
  }
  if (!/^WPHX-[0-9]+$/.test(issue.external_ref ?? "")) {
    errors.push(`ready issue ${issue.id} has invalid external_ref ${issue.external_ref}`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      issue_count: all.length,
      ready_count: ready.length,
      blocked_count: blocked.length,
      unique_external_refs: refs.size
    },
    null,
    2
  )
);
