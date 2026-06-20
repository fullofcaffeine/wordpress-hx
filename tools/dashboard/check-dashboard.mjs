#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function run(args) {
  return JSON.parse(execFileSync("node", ["tools/dashboard/parity-dashboard.mjs", ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 }));
}

const checks = [
  ["summary"],
  ["file", "wp-includes/plugin.php"],
  ["api", "add_filter"],
  ["package", "block-editor"],
  ["task", "WPHX-009"],
  ["gate", "G0"]
];

const results = {};
for (const check of checks) {
  const result = run(check);
  if (result.status !== "ok") {
    throw new Error(`${check.join(" ")} did not return ok`);
  }
  results[check.join(" ")] = result.count ?? result.counts ?? result.dashboard?.counts;
}

if (results["file wp-includes/plugin.php"].source < 1) throw new Error("file query did not find source");
if (results["api add_filter"].php < 1) throw new Error("api query did not find PHP symbol");
if (results["package block-editor"] < 1) throw new Error("package query did not find block-editor");
if (results["task WPHX-009"] < 1) throw new Error("task query did not find WPHX-009");
if (results["gate G0"] < 1) throw new Error("gate query did not find G0");

console.log(JSON.stringify({ status: "passed", checks: results }, null, 2));
