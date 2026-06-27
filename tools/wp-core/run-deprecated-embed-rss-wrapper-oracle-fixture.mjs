#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.21",
  external_ref: "WPHX-312.21",
  title: "WPHX-312.21 - Add deprecated embed RSS wrapper oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-deprecated-embed-rss-wrapper-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-21";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const FEED_EMBED_FIXTURE = "manifests/wp-core/wphx-312-04-feed-embed-https-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/embed-template.php", "src/wp-includes/rss-functions.php"];
const COVERED_SYMBOLS = [
  "embed-template.php",
  "rss-functions.php",
  "_deprecated_file",
  "basename(__FILE__)",
  "ABSPATH",
  "WPINC",
  "require",
  "require_once",
  "theme-compat/embed.php handoff",
  "rss.php handoff"
];
const CASES = [
  { id: "embed-template:default", path: "/wp-includes/embed-template.php?case=default", focus: "deprecated embed-template wrapper reports the replacement and requires theme-compat/embed.php" },
  { id: "embed-template:custom", path: "/wp-includes/embed-template.php?case=custom", focus: "query state is passed through to the required theme-compat embed boundary" },
  { id: "rss-functions:default", path: "/wp-includes/rss-functions.php?case=default", focus: "deprecated rss-functions wrapper reports the replacement and require_once loads rss.php" },
  { id: "rss-functions:custom", path: "/wp-includes/rss-functions.php?case=custom", focus: "query state is passed through to the required rss.php boundary" }
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function inputRecord(path) {
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function writeBoundaryStubs(root) {
  writeFileSync(
    `${root}/wrapper-prepend.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', __DIR__ . '/' );
define( 'WPINC', 'wp-includes' );

function _deprecated_file( $file, $version, $replacement = '' ) {
\techo '<!-- deprecated:' . $file . ':' . $version . ':' . $replacement . " -->\\n";
}
`
  );
  mkdirSync(`${root}/wp-includes/theme-compat`, { recursive: true });
  writeFileSync(
    `${root}/wp-includes/theme-compat/embed.php`,
    `<?php
echo '<section data-boundary="theme-compat/embed.php" data-case="' . htmlspecialchars( $_GET['case'] ?? 'default', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . '">embed boundary loaded</section>';
`
  );
  writeFileSync(
    `${root}/wp-includes/rss.php`,
    `<?php
echo '<section data-boundary="rss.php" data-case="' . htmlspecialchars( $_GET['case'] ?? 'default', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ) . '">rss boundary loaded</section>';
`
  );
}

function observation(caseDef, response) {
  const body = response.body.replace(/\r\n/g, "\n");
  const wrapper = caseDef.id.split(":")[0];
  return {
    case: caseDef.id,
    request_path: caseDef.path,
    status: response.status,
    content_type: response.headers.get("content-type") ?? "",
    body_sha256: sha256(body),
    body,
    has_deprecated_marker: body.includes("<!-- deprecated:"),
    has_expected_deprecated_file:
      wrapper === "embed-template"
        ? body.includes("deprecated:embed-template.php:4.5.0:wp-includes/theme-compat/embed.php")
        : body.includes("deprecated:rss-functions.php:2.1.0:wp-includes/rss.php"),
    has_required_boundary:
      wrapper === "embed-template"
        ? body.includes('data-boundary="theme-compat/embed.php"')
        : body.includes('data-boundary="rss.php"'),
    has_case_passthrough: body.includes(`data-case="${caseDef.path.includes("custom") ? "custom" : "default"}"`),
    exited_before_require: body.trim() === ""
  };
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function startPhpServer(root) {
  const port = await freePort();
  const prepend = resolve(`${root}/wrapper-prepend.php`);
  const proc = spawn("php", ["-d", `auto_prepend_file=${prepend}`, "-S", `127.0.0.1:${port}`, "-t", root], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (proc.exitCode !== null) throw new Error(`php -S exited early for ${root}: ${stderr}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/wp-includes/embed-template.php?case=default`);
      await response.text();
      return {
        baseUrl: `http://127.0.0.1:${port}`,
        stop: () =>
          new Promise((resolveStop) => {
            proc.once("exit", resolveStop);
            proc.kill("SIGTERM");
          })
      };
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  proc.kill("SIGTERM");
  throw new Error(`php -S did not become ready for ${root}: ${stderr}`);
}

async function runRoot(root) {
  const server = await startPhpServer(root);
  try {
    const entries = [];
    for (const caseDef of CASES) {
      const response = await fetch(`${server.baseUrl}${caseDef.path}`);
      const body = await response.text();
      entries.push([caseDef.id, observation(caseDef, { status: response.status, headers: response.headers, body })]);
    }
    return Object.fromEntries(entries);
  } finally {
    await server.stop();
  }
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-deprecated-embed-rss-wrapper-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/deprecated-embed-rss-wrapper-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "Deprecated embed and RSS wrapper handoff behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/embed-template.php and wp-includes/rss-functions.php through PHP's built-in HTTP server with deterministic required-file stubs. It observes deprecation calls and ABSPATH/WPINC require handoffs without claiming the full embed template, MagpieRSS, installed routing, or SimplePie behavior."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-required-file-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass real theme-compat/embed.php, rss.php/MagpieRSS, installed embed/feed routing, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-deprecated-embed-rss-wrapper-oracle-fixture",
        "npm run wp:core:wphx-312-deprecated-embed-rss-wrapper-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeBoundaryStubs(ORACLE_ROOT);
  writeBoundaryStubs(CANDIDATE_ROOT);

  const oracle = await runRoot(ORACLE_ROOT);
  const candidate = await runRoot(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  if (!observationsMatch) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const manifest = {
    schema: "wphx.wp-core-deprecated-embed-rss-wrapper-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "http_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      feed_embed_fixture_manifest: inputRecord(FEED_EMBED_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_builtin_server: true,
        required_file_stubs:
          "theme-compat/embed.php and rss.php are deterministic stubs; copied embed-template.php and rss-functions.php remain the executed public wrappers."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate))
    },
    remaining_gaps: [
      {
        id: "real-required-files-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture stubs theme-compat/embed.php and rss.php. Full embed template rendering and MagpieRSS/SimplePie behavior remain separate gates."
      },
      {
        id: "installed-routing-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes the wrappers directly through a local PHP server. Installed embed routing, feed routing, template-loader behavior, and browser-observed routing remain later gates."
      },
      {
        id: "public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      observations_match: observationsMatch,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      real_required_files_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-21-deprecated-embed-rss-wrapper-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "deprecated embed/RSS wrapper oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle deprecated wrapper boundary" },
      { path: RUNNER, role: "deterministic HTTP-observed oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-deprecated-embed-rss-wrapper-oracle-fixture",
      "npm run wp:core:wphx-312-deprecated-embed-rss-wrapper-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-04-feed-embed-https-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n");
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  } catch (error) {
    console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        fixture_cases: CASES.length,
        observations_match: observationsMatch
      },
      null,
      2
    )
  );
}

await main();
