#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.13",
  external_ref: "WPHX-306",
  title: "Users, roles, capabilities, auth, cookies, nonces"
};
const RECORDED_AT = "2026-06-23T20:55:00.000Z";
const SURFACE = "manifests/wp-core/wphx-306-01-user-auth-surface.v1.json";
const CANDIDATE = "manifests/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-306-foundation.v1.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-306-foundation`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const surface = readJson(SURFACE);
const candidate = readJson(CANDIDATE);
const ownership = readJson(OWNERSHIP);

if (surface.validation_result.status !== "passed" || candidate.validation_result.status !== "passed") {
  console.error(JSON.stringify({ status: "failed", surface: surface.validation_result, candidate: candidate.validation_result }, null, 2));
  process.exit(1);
}

const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-306-foundation",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: SURFACE, role: "users/auth/capability/cookie/nonce surface inventory" },
    { path: CANDIDATE, role: "first typed Haxe auth semantic/adapter-contract candidate" },
    { path: OWNERSHIP, role: "ownership manifest for the Haxe auth adapter-contract candidate" },
    { path: "src/wphx/wp/auth/AuthAdapterContract.hx", role: "typed Haxe auth semantic and adapter-contract model" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-306-user-auth-surface:check",
    "npm run wp:core:wphx-306-auth-adapter-contract-candidate:check",
    "npm run wp:core:wphx-306-foundation:check",
    "npm run haxe:escape-hatches:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  follow_up: [
    {
      issue: "WPHX-306.03 capability oracle fixture",
      bead: null,
      reason: "Needed for map_meta_cap/current_user_can/user_can behavior against real roles, posts, multisite, filters, and super-admin rules."
    },
    {
      issue: "WPHX-306.04 auth-cookie and nonce oracle fixture",
      bead: null,
      reason: "Needed for raw cookie/header behavior, salts, token/session validation, deterministic time ticks, and pluggable declarations."
    },
    {
      issue: "WPHX-306.07 installed-distribution auth slice",
      bead: null,
      reason: "Needed when public PHP auth/user files are emitted from Haxe-owned adapter contracts and tested without oracle-source fallback."
    }
  ],
  validation_result: {
    status: "passed",
    fixture_domains: [
      "users/auth/capability/cookie/nonce surface inventory",
      "typed Haxe auth semantic and adapter-contract candidate"
    ],
    surface_counts: {
      source_count: surface.validation_result.source_count,
      artifact_count: surface.validation_result.artifact_count,
      abi_entry_count: surface.validation_result.abi_entry_count,
      test_count: surface.validation_result.test_count
    },
    ownership_summary: {
      haxe_parity_candidate: ownership.unit.name,
      external_oracle: [
        "public PHP auth/user files remain oracle-source fixtures",
        "password hashing, cookie signing, nonce verification, sessions, roles, and installed-login flows remain future differential gates"
      ]
    },
    claim_boundaries: {
      public_php_replacement_claimed: false,
      installed_distribution_claimed: false,
      semantic_parity_scope: "surface inventory plus one typed Haxe adapter-contract candidate"
    }
  },
  inputs: [SURFACE, CANDIDATE, OWNERSHIP].map(inputRecord)
};

const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(receipt.validation_result, null, 2));
