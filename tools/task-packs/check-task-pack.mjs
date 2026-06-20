#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OUT = "build/task-packs/WPHX-009.json";
const raw = execFileSync("node", ["tools/task-packs/generate-task-pack.mjs", "WPHX-009", "--out", OUT], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 10
});
const result = JSON.parse(raw);
const pack = JSON.parse(readFileSync(OUT, "utf8"));

const required = ["file", "api", "package", "task", "gate"];
const dashboardCommands = pack.useful_commands.some((command) => command.includes("dashboard:check"));

if (result.status !== "passed") throw new Error("task pack generation did not pass");
if (pack.issue.external_ref !== "WPHX-009") throw new Error("task pack issue mismatch");
if (!dashboardCommands) throw new Error("task pack missing dashboard check command");
for (const word of required) {
  const serialized = JSON.stringify(pack);
  if (!serialized.includes(word)) throw new Error(`task pack missing query word ${word}`);
}

console.log(JSON.stringify({ status: "passed", output: OUT, sha256: result.sha256, bytes: result.bytes }, null, 2));
