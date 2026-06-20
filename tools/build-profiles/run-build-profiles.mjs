#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const CONFIG = "profiles/wp70-build-profiles.v1.json";
const OUT = "manifests/build-profiles/wphx-210-build-profiles.v1.json";
const RECEIPT = "receipts/build-profiles/wphx-210-build-profiles.v1.json";
const RECORDED_AT = "2026-06-20T20:10:00.000Z";
const REQUIRED_PROFILES = ["wp70-debug", "wp70-parity", "wp70-release"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function jsonText(value) {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function npmScriptName(command) {
  return command.startsWith("npm run ") ? command.slice("npm run ".length) : null;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function profilePairKey(from, to) {
  return `${from}->${to}`;
}

function validateConfig(config, packageJson, toolchain) {
  const errors = [];
  if (config.schema !== "wphx.wp70-build-profiles.config.v1") {
    errors.push(`Unexpected schema in ${CONFIG}`);
  }
  if (config.issue !== "WPHX-210") {
    errors.push(`${CONFIG} must belong to WPHX-210`);
  }
  if (config.common?.haxe_version !== toolchain.tools?.haxe?.version) {
    errors.push(`Profile Haxe version ${config.common?.haxe_version} does not match toolchain.lock.json`);
  }

  const profiles = config.profiles ?? [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const required of REQUIRED_PROFILES) {
    if (!byId.has(required)) {
      errors.push(`Missing required profile ${required}`);
    }
  }
  if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length) {
    errors.push("Profile ids must be unique");
  }
  if (new Set(profiles.map((profile) => profile.build_root)).size !== profiles.length) {
    errors.push("Profile build roots must be unique");
  }

  for (const profile of profiles) {
    if (!profile.id || !profile.role || !profile.purpose || !profile.build_root) {
      errors.push(`Profile ${profile.id ?? "<unknown>"} is missing id, role, purpose, or build_root`);
    }
    if (!profile.build_root?.startsWith("build/")) {
      errors.push(`Profile ${profile.id} build_root must stay under build/`);
    }
    if (!profile.haxe?.hxml || !existsSync(profile.haxe.hxml)) {
      errors.push(`Profile ${profile.id} hxml does not exist: ${profile.haxe?.hxml}`);
    }
    if (profile.linker?.mode !== "original-path-shell") {
      errors.push(`Profile ${profile.id} must use original-path-shell linker mode`);
    }
    if (profile.linker?.preserve_original_paths !== true) {
      errors.push(`Profile ${profile.id} must preserve original WordPress paths`);
    }
    for (const path of profile.source_inputs ?? []) {
      if (!existsSync(path)) {
        errors.push(`Profile ${profile.id} source input does not exist: ${path}`);
      }
    }
    for (const command of profile.validation?.commands ?? []) {
      const script = npmScriptName(command);
      if (!script || !packageJson.scripts?.[script]) {
        errors.push(`Profile ${profile.id} validation command lacks a package.json script: ${command}`);
      }
    }
  }

  const debug = byId.get("wp70-debug");
  const parity = byId.get("wp70-parity");
  const release = byId.get("wp70-release");
  if (debug && !debug.haxe?.flags?.includes("-debug")) {
    errors.push("wp70-debug must enable -debug");
  }
  if (debug && debug.haxe?.source_maps !== true) {
    errors.push("wp70-debug must retain source maps");
  }
  if (parity && parity.haxe?.source_maps !== true) {
    errors.push("wp70-parity must retain source maps for parity traces");
  }
  if (release && release.haxe?.source_maps !== false) {
    errors.push("wp70-release must disable source maps");
  }
  if (release && !release.haxe?.defines?.includes("no-traces")) {
    errors.push("wp70-release must define no-traces");
  }
  if (release && release.artifact_policy?.release_candidate !== true) {
    errors.push("wp70-release must be the release-candidate profile");
  }

  const differencePairs = new Set((config.intentional_differences ?? []).map((entry) => profilePairKey(entry.from, entry.to)));
  for (const pair of [
    profilePairKey("wp70-debug", "wp70-parity"),
    profilePairKey("wp70-parity", "wp70-release"),
    profilePairKey("wp70-debug", "wp70-release")
  ]) {
    if (!differencePairs.has(pair)) {
      errors.push(`Missing intentional difference record for ${pair}`);
    }
  }
  for (const entry of config.intentional_differences ?? []) {
    if (!entry.reason || !entry.fields?.length) {
      errors.push(`Intentional difference ${profilePairKey(entry.from, entry.to)} must record fields and reason`);
    }
  }

  return errors;
}

function lockedDockerImages(toolchain) {
  return ["php_8_4_cli", "php_8_5_cli"].map((id) => {
    const image = toolchain.container_images[id];
    return {
      id,
      reference: `${image.repository}@${image.index_digest}`
    };
  });
}

function sourceInputRecords(paths) {
  return [...paths].sort().map((path) => ({
    path,
    sha256: sha256File(path)
  }));
}

function effectiveProfile(config, profile, packageJson, toolchain, configSha) {
  const commands = Object.fromEntries(
    [...(profile.validation?.commands ?? [])].sort().map((command) => {
      const script = npmScriptName(command);
      return [command, packageJson.scripts[script]];
    })
  );

  return {
    schema: "wphx.effective-build-profile.v1",
    generated_by: "tools/build-profiles/run-build-profiles.mjs",
    config: {
      path: CONFIG,
      sha256: configSha
    },
    baseline: config.baseline,
    common: config.common,
    profile,
    validation_scripts: commands,
    locked_inputs: sourceInputRecords(profile.source_inputs ?? []),
    toolchain: {
      haxe: toolchain.tools.haxe.version,
      haxe_formatter: toolchain.tools.haxe_formatter.version,
      node: toolchain.tools.node.version,
      npm: toolchain.tools.npm.version,
      local_php_cli: toolchain.tools.php_cli.version,
      docker_images: lockedDockerImages(toolchain)
    }
  };
}

const configText = readFileSync(CONFIG, "utf8");
const config = JSON.parse(configText);
const packageJson = readJson("package.json");
const toolchain = readJson("toolchain.lock.json");
const configSha = sha256(configText);
const errors = validateConfig(config, packageJson, toolchain);

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const profileOutputs = config.profiles
  .map((profile) => {
    const outputPath = `${profile.build_root}/effective-profile.json`;
    const firstText = jsonText(effectiveProfile(config, profile, packageJson, toolchain, configSha));
    const secondText = jsonText(effectiveProfile(config, profile, packageJson, toolchain, configSha));
    const deterministic = firstText === secondText;
    if (!deterministic) {
      console.error(JSON.stringify({ status: "failed", error: `${profile.id} effective profile is not deterministic` }, null, 2));
      process.exit(1);
    }
    writeFile(outputPath, firstText);
    return {
      id: profile.id,
      role: profile.role,
      purpose: profile.purpose,
      build_root: profile.build_root,
      output: {
        path: outputPath,
        sha256: sha256(firstText),
        bytes: Buffer.byteLength(firstText)
      },
      haxe: profile.haxe,
      linker: profile.linker,
      validation_commands: profile.validation.commands,
      artifact_policy: profile.artifact_policy,
      deterministic
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const combinedOutputSha = sha256(jsonText(profileOutputs.map((profile) => ({ id: profile.id, output: profile.output }))));
const manifest = {
  schema: "wphx.build-profiles.v1",
  issue: "WPHX-210",
  generated_at: RECORDED_AT,
  generator: "tools/build-profiles/run-build-profiles.mjs",
  config: {
    path: CONFIG,
    sha256: configSha
  },
  required_profiles: REQUIRED_PROFILES,
  profiles: profileOutputs,
  intentional_differences: config.intentional_differences,
  toolchain: {
    haxe_version: toolchain.tools.haxe.version,
    haxe_formatter_version: toolchain.tools.haxe_formatter.version,
    node_version: toolchain.tools.node.version,
    php_cli_version: toolchain.tools.php_cli.version,
    docker_images: lockedDockerImages(toolchain)
  },
  validation_result: {
    status: "passed",
    required_profiles_present: true,
    deterministic_profile_outputs: true,
    validation_commands_resolve_to_package_scripts: true,
    intentional_differences_recorded: true,
    original_path_policy_preserved: true
  }
};

const manifestText = jsonText(manifest);
const receipt = {
  schema: "wphx.build-profiles-receipt.v1",
  id: "receipt:wphx-210-build-profiles",
  issue: "WPHX-210",
  recorded_at: RECORDED_AT,
  command: "npm run build:profiles",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  config: CONFIG,
  config_sha256: configSha,
  profile_count: profileOutputs.length,
  profile_output_sha256: combinedOutputSha
};
const receiptText = jsonText(receipt);

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText]
  ]) {
    if (!existsSync(path)) {
      console.error(JSON.stringify({ status: "failed", error: `${path} does not exist` }, null, 2));
      process.exit(1);
    }
    if (readFileSync(path, "utf8") !== text) {
      console.error(JSON.stringify({ status: "failed", error: `${path} is stale` }, null, 2));
      process.exit(1);
    }
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, profiles: profileOutputs.length }, null, 2));
  process.exit(0);
}

writeFile(OUT, manifestText);
writeFile(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, profiles: profileOutputs.length }, null, 2));
