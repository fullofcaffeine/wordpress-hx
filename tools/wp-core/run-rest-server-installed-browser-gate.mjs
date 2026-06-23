#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, relative, resolve } from "node:path";
import { chromium } from "playwright";
import { normalizeGeneratedPhpForManifest, walk } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-b3q",
  external_ref: "WPHX-311.09",
  title: "Add installed/browser REST E2E corpus"
};

const RECORDED_AT = "2026-06-22T14:10:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const WEB_RUNNER = "tools/wp-core/run-rest-server-web-e2e-gate.mjs";
const BUILD_ROOT = "build/wp-core/wphx-311-07";
const INSTALLED_BUILD_ROOT = "build/wp-core/wphx-311-09";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const REST_ROUTER = "wphx-rest-web-router.php";
const INSTALLED_ROUTER = "wphx-installed-router.php";
const INDEX_ENTRY = "index.php";
const OUT = "manifests/wp-core/wphx-311-09-rest-server-installed-browser.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-09-rest-server-installed-browser.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-09-rest-server-installed-browser.v1.json";
const RUNNER = "tools/wp-core/run-rest-server-installed-browser-gate.mjs";
const PRIOR_MANIFEST = "manifests/wp-core/wphx-311-08-rest-server-web-e2e.v1.json";
const OWNED_METHODS = ["serve_request", "dispatch", "respond_to_request"];
const SELECTED_HEADERS = [
  "content-type",
  "x-robots-tag",
  "link",
  "x-content-type-options",
  "access-control-expose-headers",
  "access-control-allow-headers",
  "allow"
];
const CASES = [
  {
    id: "rest-browser:get-settings-success",
    method: "GET",
    path: "/wp-json/wp/v2/settings",
    focus: "browser fetch sees installed-entry REST settings JSON, HTTP status, and selected response headers"
  },
  {
    id: "rest-browser:post-settings-update",
    method: "POST",
    path: "/wp-json/wp/v2/settings",
    body: "wphx_rest_text=123&renamed_count=19",
    contentType: "application/x-www-form-urlencoded",
    focus: "browser fetch form POST mutates deterministic settings storage through installed entry routing"
  },
  {
    id: "rest-browser:no-route-404",
    method: "GET",
    path: "/wp-json/wp/v2/missing",
    focus: "browser fetch observes route miss as HTTP 404 and REST error JSON"
  },
  {
    id: "rest-browser:head-no-body",
    method: "HEAD",
    path: "/wp-json/wp/v2/settings",
    focus: "browser HEAD fetch observes status and headers with no response body"
  },
  {
    id: "rest-browser:permission-denied",
    method: "GET",
    path: "/wp-json/wp/v2/settings?deny=1",
    focus: "browser fetch observes permission callback denial as HTTP error response"
  },
  {
    id: "rest-browser:pre-serve-manual",
    method: "GET",
    path: "/wp-json/wp/v2/settings?manual=1",
    focus: "browser fetch observes rest_pre_serve_request manual output"
  },
  {
    id: "rest-browser:options-settings",
    method: "OPTIONS",
    path: "/wp-json/wp/v2/settings",
    focus: "browser fetch observes installed-entry OPTIONS behavior and exposed transport headers"
  },
  {
    id: "rest-browser:get-settings-embed",
    method: "GET",
    path: "/wp-json/wp/v2/settings?_embed=1",
    focus: "browser fetch observes _embed response_to_data() path through installed entry routing"
  }
];

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function stablePackageContent(value) {
  const cwd = process.cwd().replaceAll("\\", "/");
  const upstreamRoot = resolve(UPSTREAM_ROOT).replaceAll("\\", "/");
  return normalizeGeneratedPhpForManifest(value)
    .replaceAll(cwd, "<repo>")
    .replaceAll(upstreamRoot, "../wordpress-develop");
}

function stablePackageFile(root, path) {
  const normalized = stablePackageContent(readFileSync(path, "utf8"));
  return {
    path: `${root}/${relative(root, path)}`,
    bytes: Buffer.byteLength(normalized),
    sha256: sha256(normalized)
  };
}

function normalizePath(value) {
  if (typeof value !== "string") return value;
  const cwd = process.cwd().replaceAll("\\", "/");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  return normalized;
}

function stableRuntimeValue(value) {
  if (Array.isArray(value)) return value.map(stableRuntimeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stableRuntimeValue(entry)]));
  }
  return normalizePath(value);
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          rejectPort(new Error("Unable to reserve a local HTTP port"));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function writeInstalledEntry(root) {
  writeFileSync(
    `${root}/${INDEX_ENTRY}`,
    `<?php
define( 'WPHX_311_09_INDEX_ENTRY', true );
require __DIR__ . '/${REST_ROUTER}';
`
  );
  writeFileSync(
    `${root}/${INSTALLED_ROUTER}`,
    `<?php
$path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
if ( '/__wphx/browser-harness' === $path ) {
\theader( 'Content-Type: text/html; charset=UTF-8' );
\techo '<!doctype html><meta charset="utf-8"><title>WPHX REST Browser Harness</title><main id="wphx-rest-browser-harness">ready</main>';
\treturn true;
}
if ( '/__wphx/package-boundary' === $path || str_starts_with( $path, '/wp-json' ) ) {
\t$_SERVER['SCRIPT_NAME'] = '/index.php';
\t$_SERVER['PHP_SELF']    = '/index.php';
\trequire __DIR__ . '/${INDEX_ENTRY}';
\treturn true;
}
return false;
`
  );
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const header of SELECTED_HEADERS) {
    const value = headers.get(header);
    if (value !== null) {
      normalized[header] = value.replaceAll(/https:\/\/example\.test(?=\/wp-json)/g, "https://example.test");
    }
  }
  return normalized;
}

function normalizeBody(text) {
  if (text.length === 0) {
    return { kind: "empty", value: "" };
  }
  try {
    return { kind: "json", value: JSON.parse(text) };
  } catch {
    return { kind: "raw", value: text };
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  return {
    status: response.status,
    headers: normalizeHeaders(response.headers),
    body: normalizeBody(text)
  };
}

async function startServer(root, mode) {
  const port = await freePort();
  const proc = spawn("php", ["-S", `127.0.0.1:${port}`, INSTALLED_ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const ready = await fetchJson(`${baseUrl}/__wphx/browser-harness`);
      if (ready.status === 200 && ready.body.kind === "raw") {
        return { baseUrl, proc, stdout: () => stdout, stderr: () => stderr };
      }
    } catch {
      if (proc.exitCode !== null) {
        break;
      }
    }
    await sleep(50);
  }
  proc.kill("SIGTERM");
  throw new Error(`Unable to start ${mode} installed PHP server on ${baseUrl}: ${stderr || stdout}`);
}

async function stopServer(server) {
  await new Promise((resolveStop) => {
    if (server.proc.exitCode !== null || server.proc.signalCode !== null) {
      resolveStop();
      return;
    }
    const timeout = setTimeout(() => {
      server.proc.kill("SIGKILL");
      resolveStop();
    }, 2000);
    server.proc.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    server.proc.kill("SIGTERM");
  });
}

async function launchBrowser() {
  try {
    return {
      browser: await chromium.launch({ channel: "chrome", headless: true }),
      engine: "chromium",
      channel: "chrome"
    };
  } catch (chromeError) {
    try {
      return {
        browser: await chromium.launch({ headless: true }),
        engine: "chromium",
        channel: "playwright-bundled"
      };
    } catch (bundledError) {
      bundledError.message = `${bundledError.message}\nChrome channel launch also failed: ${chromeError.message}`;
      throw bundledError;
    }
  }
}

async function runBrowserRoot(browser, mode, root) {
  const server = await startServer(root, mode);
  const page = await browser.newPage();
  try {
    await page.goto(`${server.baseUrl}/__wphx/browser-harness`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(
      async ({ cases, selectedHeaders }) => {
        function normalizeHeaders(headers) {
          const normalized = {};
          for (const header of selectedHeaders) {
            const value = headers.get(header);
            if (value !== null) {
              normalized[header] = value.replace(/https:\/\/example\.test(?=\/wp-json)/g, "https://example.test");
            }
          }
          return normalized;
        }
        function normalizeBody(text) {
          if (text.length === 0) {
            return { kind: "empty", value: "" };
          }
          try {
            return { kind: "json", value: JSON.parse(text) };
          } catch {
            return { kind: "raw", value: text };
          }
        }
        function sleep(ms) {
          return new Promise((resolve) => setTimeout(resolve, ms));
        }
        async function fetchWithRetry(input, init) {
          let lastError;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              return await fetch(input, init);
            } catch (error) {
              lastError = error;
              await sleep(100 * (attempt + 1));
            }
          }
          throw lastError;
        }
        async function fetchCase(testCase) {
          const headers = {};
          if (testCase.contentType) {
            headers["content-type"] = testCase.contentType;
          }
          const response = await fetchWithRetry(testCase.path, {
            method: testCase.method,
            headers,
            body: testCase.body
          });
          const text = await response.text();
          return {
            id: testCase.id,
            method: testCase.method,
            path: testCase.path,
            status: response.status,
            headers: normalizeHeaders(response.headers),
            body: normalizeBody(text)
          };
        }
        const boundaryResponse = await fetchWithRetry("/__wphx/package-boundary");
        const boundary = await boundaryResponse.json();
        const browserCases = [];
        for (const testCase of cases) {
          browserCases.push(await fetchCase(testCase));
        }
        return {
          location: {
            pathname: window.location.pathname,
            originKind: window.location.origin.startsWith("http://127.0.0.1:") ? "local-ephemeral" : "other"
          },
          userAgentFamily: navigator.userAgent.includes("Chrome") ? "chromium" : "other",
          boundary,
          cases: browserCases
        };
      },
      { cases: CASES, selectedHeaders: SELECTED_HEADERS }
    );
    return {
      mode,
      root,
      command: `php -S 127.0.0.1:<ephemeral> ${INSTALLED_ROUTER}`,
      entry: INDEX_ENTRY,
      router: INSTALLED_ROUTER,
      boundary: result.boundary,
      browser: {
        location: result.location,
        user_agent_family: result.userAgentFamily
      },
      cases: result.cases
    };
  } finally {
    await page.close();
    await stopServer(server);
  }
}

function normalizeCases(run) {
  return run.cases.map((entry) => ({
    id: entry.id,
    method: entry.method,
    path: entry.path,
    status: entry.status,
    headers: entry.headers,
    body: entry.body
  }));
}

function compare(oracleRun, candidateRun) {
  const oracle = normalizeCases(oracleRun);
  const candidate = normalizeCases(candidateRun);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function assertPackageBoundary(result) {
  const checks = {
    class_declared_in_package: result.classDeclaredInPackage,
    upstream_server_not_included: !result.upstreamServerIncluded,
    owned_methods_declared_in_package: Object.values(result.ownedMethods).every((method) => method.declared_in_package_file),
    haxe_strategy_loaded: result.haxeStrategyLoaded
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-server-installed-browser`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-server-installed-browser",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-distribution-installed-browser-gate",
      name: "WP_REST_Server installed entry and browser fetch gate",
      area: "wp-includes/rest-api/class-wp-rest-server.php",
      public_contract:
        "The packaged REST server candidate must match vanilla through an installed-style index.php entry and same-origin browser fetch for settings success, mutation, error, permission, HEAD, OPTIONS, and rest_pre_serve_request cases."
    },
    ownership_state: "packaged_distribution_candidate",
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, INSTALLED_BUILD_ROOT, `${ORACLE_ROOT}/${INDEX_ENTRY}`, `${CANDIDATE_ROOT}/${INDEX_ENTRY}`],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-server-installed-browser",
        "npm run wp:core:wphx-311-rest-server-installed-browser:check",
        "npm run wp:core:wphx-311-rest-server-web-e2e:check",
        "npm run ci:php-conformance:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-09-rest-server-installed-browser",
        "receipt:wphx-311-08-rest-server-web-e2e",
        "receipt:wphx-311-07-rest-server-packaged-http"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This gate validates browser-visible REST transport through an installed-style entry file. It still uses deterministic settings/wpdb fixtures instead of a full database-backed WordPress install."
  };
}

command("node", [WEB_RUNNER, ...(checkOnly ? ["--check"] : [])]);
mkdirSync(INSTALLED_BUILD_ROOT, { recursive: true });
writeInstalledEntry(ORACLE_ROOT);
writeInstalledEntry(CANDIDATE_ROOT);
command("php", ["-l", `${ORACLE_ROOT}/${INDEX_ENTRY}`]);
command("php", ["-l", `${CANDIDATE_ROOT}/${INDEX_ENTRY}`]);
command("php", ["-l", `${ORACLE_ROOT}/${INSTALLED_ROUTER}`]);
command("php", ["-l", `${CANDIDATE_ROOT}/${INSTALLED_ROUTER}`]);

const launched = await launchBrowser();
let oracleRun;
let candidateRun;
try {
  oracleRun = await runBrowserRoot(launched.browser, "oracle", ORACLE_ROOT);
  candidateRun = await runBrowserRoot(launched.browser, "candidate", CANDIDATE_ROOT);
} finally {
  await launched.browser.close();
}

const comparison = compare(oracleRun, candidateRun);
const candidateBoundary = assertPackageBoundary(candidateRun.boundary);
if (!comparison.matches || candidateBoundary.status !== "passed") {
  console.error(JSON.stringify({ status: "failed", comparison, candidateBoundary }, null, 2));
  process.exit(1);
}

const packageFiles = walk(CANDIDATE_ROOT)
  .map((path) => stablePackageFile(CANDIDATE_ROOT, path))
  .sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  schema: "wphx.wp-core-rest-server-installed-browser.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
  artifact_scope: "packaged_distribution",
  inputs: {
    runner: inputRecord(RUNNER),
    web_runner: inputRecord(WEB_RUNNER),
    package_json: inputRecord("package.json"),
    prior_manifest: inputRecord(PRIOR_MANIFEST)
  },
  browser: {
    engine: launched.engine,
    channel: launched.channel,
    launch: "headless",
    driver: "playwright"
  },
  installed_entry: {
    web_server: "PHP built-in development server",
    entry_file: INDEX_ENTRY,
    router: INSTALLED_ROUTER,
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT
  },
  package: {
    candidate_files: packageFiles,
    candidate_rest_server: inputRecord(`${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`),
    owned_methods: OWNED_METHODS
  },
  fixture: {
    cases: CASES,
    selected_headers: SELECTED_HEADERS,
    browser_transport: [
      "same-origin fetch",
      "browser-visible response status",
      "browser-visible selected headers",
      "browser-visible JSON/raw response body",
      "installed-style index.php entry routing"
    ]
  },
  runs: [
    {
      id: "installed-browser:oracle",
      mode: "oracle",
      command: oracleRun.command,
      normalized_sha256: sha256(JSON.stringify(normalizeCases(oracleRun))),
      browser: oracleRun.browser,
      package_boundary: stableRuntimeValue(oracleRun.boundary)
    },
    {
      id: "installed-browser:candidate",
      mode: "candidate",
      command: candidateRun.command,
      normalized_sha256: sha256(JSON.stringify(normalizeCases(candidateRun))),
      browser: candidateRun.browser,
      package_boundary: stableRuntimeValue(candidateRun.boundary)
    }
  ],
  comparison,
  package_boundaries: [
    {
      id: "installed-browser:candidate",
      runtime: "chromium-fetch-over-php-web-server",
      ...candidateBoundary
    }
  ],
  remaining_gaps: [
    {
      id: "full-database-backed-install-deferred",
      owner: "WPHX-311/WPHX-322",
      detail:
        "This browser gate uses deterministic REST/settings fixtures. A database-backed installed WordPress root with permalink routing remains broader distribution work."
    },
    {
      id: "cross-origin-cors-preflight-deferred",
      owner: "WPHX-311/WPHX-322",
      detail:
        "This gate captures browser-visible REST headers and OPTIONS through same-origin fetch. Cross-origin CORS preflight remains a separate browser/network matrix."
    },
    {
      id: "complete-rest-server-haxe-class-deferred",
      owner: "WPHX-311",
      detail:
        "The package owns the class file and typed dispatch decisions, but many WP_REST_Server method bodies still mirror WordPress PHP source."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
    artifact_scope: "packaged_distribution",
    fixture_cases: CASES.length,
    selected_headers: SELECTED_HEADERS,
    browser_runs: 2,
    package_boundary: candidateBoundary
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-09-rest-server-installed-browser",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST server installed browser parity and no-fallback manifest"
    },
    {
      path: OWNERSHIP,
      role: "REST server installed browser ownership manifest"
    },
    {
      path: RUNNER,
      role: "installed-entry Playwright/browser E2E generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-server-installed-browser",
    "npm run wp:core:wphx-311-rest-server-installed-browser:check",
    "npm run wp:core:wphx-311-rest-server-web-e2e:check",
    "npm run ci:php-conformance:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-311-08-rest-server-web-e2e",
    "receipt:wphx-311-07-rest-server-packaged-http",
    "receipt:wphx-311-06-rest-server-dispatch-strategy-candidate"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      browser_channel: launched.channel,
      cases: CASES.length,
      selected_headers: SELECTED_HEADERS.length
    },
    null,
    2
  )
);
