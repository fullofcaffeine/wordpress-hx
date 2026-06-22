#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-w91.3.9",
  external_ref: "WPHX-700.09",
  title: "WPHX-700.09 — Provision executable upstream PHPUnit candidate ratchet environment"
};
const RECORDED_AT = "2026-06-21T04:45:00.000Z";
const RUNNER = "tools/upstream/provision-phpunit-ratchet-env.mjs";
const RATCHET_RUNNER = "tools/upstream/run-phpunit-ratchet.mjs";
const TOOLCHAIN = "toolchain.lock.json";
const GROUPS = "tests/upstream/phpunit/groups.json";
const KNOWN_DELTAS = "tests/upstream/phpunit/known-deltas.json";
const OUT = "manifests/operations/wphx-700-09-phpunit-ratchet-env.v1.json";
const RECEIPT = "receipts/operations/wphx-700-09-phpunit-ratchet-env.v1.json";
const RATCHET_PROVISIONED_RECEIPT = "receipts/operations/wphx-700-05-upstream-phpunit-ratchet-provisioned.v1.json";
const BUILD_ROOT = "build/upstream-phpunit/wphx-700-09";
const VANILLA_ROOT = `${BUILD_ROOT}/vanilla-root`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-root`;
const LOG_DIR = `${BUILD_ROOT}/logs`;
const REPORT = "build/upstream-phpunit/wphx-700-05/reports/upstream-phpunit-ratchet.json";
const UPSTREAM_ROOT = "../wordpress-develop";
const EXPECTED_UPSTREAM_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const DB_PASSWORD = "wordpresshx-live-password";
const MYSQL_DB = "wordpresshx_phpunit_seed";
const VANILLA_DB = "wordpresshx_phpunit_vanilla";
const CANDIDATE_DB = "wordpresshx_phpunit_candidate";

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 120
  }).trim();
}

function run(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 120
  });
  return {
    command: [commandName, ...commandArgs],
    cwd: options.cwd ?? process.cwd(),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? result.error.message : null
  };
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    if (readFileSync(path, "utf8") !== contents) {
      throw new Error(`${path} is stale; run npm run upstream:phpunit-ratchet:provision`);
    }
    return;
  }

  writeFile(path, contents);
}

function imageRef(image) {
  return `${image.repository}@${image.index_digest}`;
}

function gitRef(root) {
  return command("git", ["rev-parse", "HEAD"], { cwd: root });
}

function worktreeRemove(path) {
  try {
    command("git", ["worktree", "remove", "--force", resolve(path)], { cwd: UPSTREAM_ROOT });
  } catch {
    // A missing or already-removed build worktree is fine.
  }
}

function resetWorktrees() {
  worktreeRemove(VANILLA_ROOT);
  worktreeRemove(CANDIDATE_ROOT);
  rmSync(BUILD_ROOT, { recursive: true, force: true });
  mkdirSync(LOG_DIR, { recursive: true });
  command("git", ["worktree", "add", "--force", "--detach", resolve(VANILLA_ROOT), EXPECTED_UPSTREAM_REF], {
    cwd: UPSTREAM_ROOT
  });
  command("git", ["worktree", "add", "--force", "--detach", resolve(CANDIDATE_ROOT), EXPECTED_UPSTREAM_REF], {
    cwd: UPSTREAM_ROOT
  });
}

function composerInstall(root, side) {
  const result = run("composer", ["install", "--no-interaction", "--no-progress", "--prefer-dist"], { cwd: root });
  writeFile(`${LOG_DIR}/${side}-composer.stdout.txt`, result.stdout);
  writeFile(`${LOG_DIR}/${side}-composer.stderr.txt`, result.stderr);
  if (result.status !== 0) {
    throw new Error(`${side} composer install failed; see ${LOG_DIR}/${side}-composer.stderr.txt`);
  }
  return {
    side,
    status: "passed",
    stdout: inputRecord(`${LOG_DIR}/${side}-composer.stdout.txt`),
    stderr: inputRecord(`${LOG_DIR}/${side}-composer.stderr.txt`)
  };
}

function wpTestsConfig({ root, database, port }) {
  const config = `<?php
define( 'ABSPATH', __DIR__ . '/src/' );
define( 'WP_DEFAULT_THEME', 'default' );
define( 'WP_DEBUG', true );
define( 'DB_NAME', '${database}' );
define( 'DB_USER', 'root' );
define( 'DB_PASSWORD', '${DB_PASSWORD}' );
define( 'DB_HOST', '127.0.0.1:${port}' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );
define( 'AUTH_KEY', 'wphx-phpunit-auth-key' );
define( 'SECURE_AUTH_KEY', 'wphx-phpunit-secure-auth-key' );
define( 'LOGGED_IN_KEY', 'wphx-phpunit-logged-in-key' );
define( 'NONCE_KEY', 'wphx-phpunit-nonce-key' );
define( 'AUTH_SALT', 'wphx-phpunit-auth-salt' );
define( 'SECURE_AUTH_SALT', 'wphx-phpunit-secure-auth-salt' );
define( 'LOGGED_IN_SALT', 'wphx-phpunit-logged-in-salt' );
define( 'NONCE_SALT', 'wphx-phpunit-nonce-salt' );
$table_prefix = 'wptests_';
define( 'WP_TESTS_DOMAIN', 'example.org' );
define( 'WP_TESTS_EMAIL', 'admin@example.org' );
define( 'WP_TESTS_TITLE', 'WordPressHX PHPUnit Ratchet' );
define( 'WP_PHP_BINARY', 'php' );
define( 'WPLANG', '' );
`;
  writeFile(`${root}/wp-tests-config.php`, config);
  return {
    path: `${root}/wp-tests-config.php`,
    database,
    db_host: `127.0.0.1:<redacted-port>`,
    sha256: sha256(config.replace(String(port), "<port>").replace(DB_PASSWORD, "<password>"))
  };
}

function dbProbe(port) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', 'root', getenv('WPHX_DB_PASSWORD'), getenv('WPHX_DB_NAME'), intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $result = $mysqli->query("SELECT VERSION() AS version, @@version_comment AS comment");
    echo json_encode($result->fetch_assoc(), JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    command("php", ["-r", code], {
      env: {
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_NAME: MYSQL_DB,
        WPHX_DB_PORT: String(port)
      }
    })
  );
}

function resetDatabase(port, database) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', 'root', getenv('WPHX_DB_PASSWORD'), '', intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $db = getenv('WPHX_DB_NAME');
    if (!preg_match('/^[A-Za-z0-9_]+$/', $db)) {
      fwrite(STDERR, 'Unsafe database name' . PHP_EOL);
      exit(3);
    }
    $quoted = chr(96) . $db . chr(96);
    $mysqli->query("DROP DATABASE IF EXISTS " . $quoted);
    $mysqli->query("CREATE DATABASE " . $quoted . " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo json_encode(array('database' => $db), JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    command("php", ["-r", code], {
      env: {
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_PORT: String(port),
        WPHX_DB_NAME: database
      }
    })
  );
}

function dockerImageInfo(image) {
  const raw = command("docker", ["image", "inspect", imageRef(image)]);
  const [info] = JSON.parse(raw);
  return {
    image: imageRef(image),
    id: info.Id,
    repo_digests: info.RepoDigests ?? [],
    architecture: info.Architecture,
    os: info.Os,
    created: info.Created
  };
}

async function withMysqlRuntime(callback) {
  const lock = readJson(TOOLCHAIN);
  const image = lock.container_images.mysql_8_4;
  const name = `wordpresshx-wphx-700-09-mysql-${process.pid}`;
  let containerId = "";
  try {
    containerId = command("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      name,
      "-e",
      `MYSQL_ROOT_PASSWORD=${DB_PASSWORD}`,
      "-e",
      `MYSQL_DATABASE=${MYSQL_DB}`,
      "-e",
      "MYSQL_ROOT_HOST=%",
      "-p",
      "127.0.0.1::3306",
      imageRef(image)
    ]);
    const portOutput = command("docker", ["port", name, "3306/tcp"]);
    const port = Number(portOutput.split(":").at(-1));
    let query = null;
    let lastError = "";
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      try {
        query = dbProbe(port);
        break;
      } catch (error) {
        lastError = error.stderr?.toString?.() || error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!query) throw new Error(`MySQL did not become ready: ${lastError}`);
    return await callback({ port, query, image: dockerImageInfo(image), container_id: containerId });
  } finally {
    if (containerId) {
      try {
        command("docker", ["stop", name], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Best-effort cleanup for failed or interrupted runs.
      }
    }
  }
}

function runRatchet() {
  const result = run("node", [RATCHET_RUNNER, "--runtime-report-only"], {
    env: {
      ...process.env,
      WPHX_PHPUNIT_VANILLA_ROOT: resolve(VANILLA_ROOT),
      WPHX_PHPUNIT_CANDIDATE_ROOT: resolve(CANDIDATE_ROOT)
    }
  });
  writeFile(`${LOG_DIR}/ratchet.stdout.txt`, result.stdout);
  writeFile(`${LOG_DIR}/ratchet.stderr.txt`, result.stderr);
  if (result.status !== 0) {
    throw new Error(`PHPUnit ratchet failed; see ${LOG_DIR}/ratchet.stderr.txt`);
  }
  return JSON.parse(readFileSync(REPORT, "utf8"));
}

function buildManifest({ composerRuns, db, configs, ratchetReport }) {
  const allParity = ratchetReport.execution.classifications.every((entry) => entry.classification === "parity_pass");
  return {
    schema: "wphx.upstream-phpunit-ratchet-env.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "upstream_suite_parity",
    artifact_scope: "packaged_distribution",
    behavior_parity_claimed: allParity,
    inputs: {
      provisioner: inputRecord(RUNNER),
      ratchet_runner: inputRecord(RATCHET_RUNNER),
      groups: inputRecord(GROUPS),
      known_deltas: inputRecord(KNOWN_DELTAS),
      toolchain: inputRecord(TOOLCHAIN)
    },
    roots: {
      upstream_root: UPSTREAM_ROOT,
      expected_upstream_ref: EXPECTED_UPSTREAM_REF,
      vanilla_root: VANILLA_ROOT,
      candidate_root: CANDIDATE_ROOT,
      candidate_assembly: {
        base: "pinned WordPress 7.0.0 worktree",
        active_overlays: [],
        note: "This provisions the executable ratchet environment. Future candidate packaging tasks should add generated/Haxe-owned overlays before this gate is used as final distribution parity evidence."
      },
      vanilla_ref: gitRef(VANILLA_ROOT),
      candidate_ref: gitRef(CANDIDATE_ROOT)
    },
    composer: composerRuns,
    database_runtime: db,
    test_configs: configs,
    ratchet_report: {
      path: REPORT,
      sha256: sha256File(REPORT),
      status: ratchetReport.execution.status,
      classifications: ratchetReport.execution.classifications
    },
    validation_result: {
      status: allParity ? "passed" : "failed",
      environment_ready: ratchetReport.prerequisites.status === "ready",
      vanilla_candidate_roots_distinct: resolve(VANILLA_ROOT) !== resolve(CANDIDATE_ROOT),
      isolated_databases: configs.vanilla.database !== configs.candidate.database,
      ratchet_runs_executed: ratchetReport.execution.runs.length,
      all_classifications_parity_pass: allParity,
      rejects_new_vanilla_pass_candidate_fail:
        !ratchetReport.execution.classifications.some((entry) => entry.classification === "unowned_candidate_regression")
    }
  };
}

async function main() {
  if (checkOnly) {
    const manifest = readFileSync(OUT, "utf8");
    const receipt = readFileSync(RECEIPT, "utf8");
    console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, manifest_sha256: sha256(manifest) }, null, 2));
    return;
  }

  resetWorktrees();
  const composerRuns = [composerInstall(VANILLA_ROOT, "vanilla"), composerInstall(CANDIDATE_ROOT, "candidate")];
  const manifest = await withMysqlRuntime(async ({ port, query, image }) => {
    resetDatabase(port, VANILLA_DB);
    resetDatabase(port, CANDIDATE_DB);
    const configs = {
      vanilla: wpTestsConfig({ root: VANILLA_ROOT, database: VANILLA_DB, port }),
      candidate: wpTestsConfig({ root: CANDIDATE_ROOT, database: CANDIDATE_DB, port })
    };
    const ratchetReport = runRatchet();
    return buildManifest({
      composerRuns,
      db: {
        engine: "mysql",
        image,
        query,
        databases: [VANILLA_DB, CANDIDATE_DB]
      },
      configs,
      ratchetReport
    });
  });

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-700-09-phpunit-ratchet-env",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run upstream:phpunit-ratchet:provision",
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    behavior_parity_claimed: manifest.behavior_parity_claimed,
    artifacts: [
      {
        path: OUT,
        role: "executable upstream PHPUnit ratchet environment manifest",
        sha256: sha256(manifestText)
      },
      {
        path: REPORT,
        role: "runtime ratchet report produced by WPHX-700.05 runner",
        sha256: sha256File(REPORT)
      }
    ],
    verification_commands: [
      "npm run upstream:phpunit-ratchet:provision",
      "npm run upstream:phpunit-ratchet:provision:check",
      "npm run receipts:validate"
    ],
    validation_result: manifest.validation_result
  };
  const receiptText = JSON.stringify(receipt, null, 2) + "\n";
  const ratchetProvisionedReceipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-700-05-upstream-phpunit-ratchet-provisioned",
    issue: {
      id: "wordpresshx-w91.3.5",
      external_ref: "WPHX-700.05",
      title: "WPHX-700.05 — Start upstream WordPress PHPUnit parity ratchet"
    },
    recorded_at: RECORDED_AT,
    command: "npm run upstream:phpunit-ratchet:provision",
    evidence_class: manifest.evidence_class,
    artifact_scope: manifest.artifact_scope,
    behavior_parity_claimed: manifest.behavior_parity_claimed,
    artifacts: [
      {
        path: OUT,
        role: "provisioned executable upstream PHPUnit ratchet manifest",
        sha256: sha256(manifestText)
      },
      {
        path: REPORT,
        role: "runtime ratchet report produced by WPHX-700.05 runner",
        sha256: sha256File(REPORT)
      },
      {
        path: "tests/upstream/phpunit/known-deltas.json",
        role: "owned known-deltas ledger"
      }
    ],
    verification_commands: [
      "npm run upstream:phpunit-ratchet",
      "npm run upstream:phpunit-ratchet:provision",
      "npm run upstream:phpunit-ratchet:provision:check",
      "npm run receipts:validate"
    ],
    validation_result: manifest.validation_result
  };
  const ratchetProvisionedReceiptText = JSON.stringify(ratchetProvisionedReceipt, null, 2) + "\n";
  writeOrCheck(OUT, manifestText);
  writeOrCheck(RECEIPT, receiptText);
  writeOrCheck(RATCHET_PROVISIONED_RECEIPT, ratchetProvisionedReceiptText);
  console.log(
    JSON.stringify(
      {
        status: manifest.validation_result.status,
        output: OUT,
        receipt: RECEIPT,
        evidence_class: manifest.evidence_class,
        artifact_scope: manifest.artifact_scope,
        behavior_parity_claimed: manifest.behavior_parity_claimed,
        ratchet_runs_executed: manifest.validation_result.ratchet_runs_executed
      },
      null,
      2
    )
  );
  if (manifest.validation_result.status !== "passed") {
    process.exit(1);
  }
}

await main();
