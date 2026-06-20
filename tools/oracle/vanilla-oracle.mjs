#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const RECORDED_AT = process.env.WPHX_ORACLE_RECORDED_AT ?? "2026-06-20T02:34:00Z";
const WORDPRESS_REPO = "../wordpress-develop";
const WORDPRESS_COMMIT = "26b68024931348d267b70e2a29910e1320d0094f";
const DB_IMAGE = process.env.WPHX_ORACLE_DB_IMAGE ?? "mysql@sha256:563602a18ffd5be220968e8508d84c9dcd80fbffe69e28af51572db29e3285b2";
const DB_NAME = "wordpresshx";
const DB_USER = "root";
const DB_PASSWORD = "wordpresshx";
const RECEIPT_DIR = join(ROOT, "receipts", "oracle");
const MANIFEST_DIR = join(ROOT, "manifests", "oracle");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: options.encoding ?? "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"]
  }).trim();
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function receipt(id, baseline, result) {
  return {
    schema: "wphx.oracle-receipt.v1",
    id,
    issue: "WPHX-008",
    recorded_at: RECORDED_AT,
    upstream: {
      wordpress_repo: WORDPRESS_REPO,
      wordpress_commit: WORDPRESS_COMMIT
    },
    baseline,
    status: "passed",
    result
  };
}

function phpBaseline() {
  const versionProbe = `
    require '${WORDPRESS_REPO}/src/wp-includes/version.php';
    echo json_encode([
      'wp_version' => $wp_version,
      'wp_db_version' => $wp_db_version,
      'required_php_version' => $required_php_version,
      'required_mysql_version' => $required_mysql_version,
      'php_version' => PHP_VERSION,
      'sapi' => PHP_SAPI,
      'extensions' => [
        'mysqli' => extension_loaded('mysqli'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'json' => extension_loaded('json'),
        'mbstring' => extension_loaded('mbstring'),
        'intl' => extension_loaded('intl')
      ]
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  const version = JSON.parse(run("php", ["-r", versionProbe]));
  const lint = run("php", ["-l", `${WORDPRESS_REPO}/src/wp-settings.php`]);

  return receipt("receipt:wphx-008-php-baseline", "php", {
    command: "php -r require ../wordpress-develop/src/wp-includes/version.php",
    version,
    lint: {
      command: "php -l ../wordpress-develop/src/wp-settings.php",
      stdout: lint
    }
  });
}

function dockerImageInfo(image) {
  const raw = run("docker", ["image", "inspect", image]);
  const [info] = JSON.parse(raw);
  return {
    image,
    id: info.Id,
    repo_digests: info.RepoDigests ?? [],
    architecture: info.Architecture,
    os: info.Os,
    created: info.Created
  };
}

function dbProbe(port) {
  const code = `
    mysqli_report(MYSQLI_REPORT_OFF);
    $mysqli = @new mysqli('127.0.0.1', getenv('WPHX_DB_USER'), getenv('WPHX_DB_PASSWORD'), getenv('WPHX_DB_NAME'), intval(getenv('WPHX_DB_PORT')));
    if ($mysqli->connect_errno) {
      fwrite(STDERR, $mysqli->connect_error . PHP_EOL);
      exit(2);
    }
    $result = $mysqli->query("SELECT VERSION() AS version, @@version_comment AS comment, DATABASE() AS db_name");
    $row = $result->fetch_assoc();
    echo json_encode($row, JSON_UNESCAPED_SLASHES) . PHP_EOL;
  `;
  return JSON.parse(
    run("php", ["-r", code], {
      env: {
        WPHX_DB_USER: DB_USER,
        WPHX_DB_PASSWORD: DB_PASSWORD,
        WPHX_DB_NAME: DB_NAME,
        WPHX_DB_PORT: String(port)
      }
    })
  );
}

async function dbBaseline() {
  const name = `wordpresshx-oracle-db-${process.pid}`;
  let containerId = "";
  try {
    containerId = run("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      name,
      "-e",
      `MYSQL_ROOT_PASSWORD=${DB_PASSWORD}`,
      "-e",
      `MYSQL_DATABASE=${DB_NAME}`,
      "-p",
      "127.0.0.1::3306",
      DB_IMAGE
    ]);
    const portOutput = run("docker", ["port", name, "3306/tcp"]);
    const port = Number(portOutput.split(":").at(-1));
    let query = null;
    let lastError = "";
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      try {
        query = dbProbe(port);
        break;
      } catch (error) {
        lastError = error.stderr?.toString?.() || error.message;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (!query) {
      throw new Error(`DB did not become ready: ${lastError}`);
    }
    const image = dockerImageInfo(DB_IMAGE);
    return receipt("receipt:wphx-008-db-baseline", "db", {
      image,
      query,
      connection: {
        client: "php mysqli",
        database: DB_NAME,
        host: "127.0.0.1",
        port: "ephemeral"
      }
    });
  } finally {
    if (containerId) {
      try {
        run("docker", ["stop", name], { stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        // Container cleanup is best-effort after a failed startup.
      }
    }
  }
}

async function browserBaseline() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>WordPressHX Oracle</title><main id=\"oracle\">ready</main>");
    const result = {
      engine: "chromium",
      channel: "chrome",
      browser_version: browser.version(),
      title: await page.title(),
      text: await page.textContent("#oracle"),
      user_agent: await page.evaluate(() => navigator.userAgent)
    };
    return receipt("receipt:wphx-008-browser-baseline", "browser", result);
  } finally {
    await browser.close();
  }
}

mkdirSync(RECEIPT_DIR, { recursive: true });
mkdirSync(MANIFEST_DIR, { recursive: true });

const php = phpBaseline();
const db = await dbBaseline();
const browser = await browserBaseline();

writeJson(join(RECEIPT_DIR, "wphx-008-php-baseline.v1.json"), php);
writeJson(join(RECEIPT_DIR, "wphx-008-db-baseline.v1.json"), db);
writeJson(join(RECEIPT_DIR, "wphx-008-browser-baseline.v1.json"), browser);

const summary = {
  schema: "wphx.oracle-baseline.v1",
  issue: "WPHX-008",
  recorded_at: RECORDED_AT,
  upstream: {
    wordpress_repo: WORDPRESS_REPO,
    wordpress_commit: WORDPRESS_COMMIT
  },
  receipts: [
    "receipts/oracle/wphx-008-php-baseline.v1.json",
    "receipts/oracle/wphx-008-db-baseline.v1.json",
    "receipts/oracle/wphx-008-browser-baseline.v1.json"
  ],
  baselines: {
    php: php.result.version,
    db: db.result.query,
    browser: {
      engine: browser.result.engine,
      channel: browser.result.channel,
      browser_version: browser.result.browser_version
    }
  },
  status: "passed"
};

writeJson(join(MANIFEST_DIR, "vanilla-oracle-baseline.v1.json"), summary);
writeJson(join(RECEIPT_DIR, "wphx-008-vanilla-oracle-summary.v1.json"), summary);

console.log(JSON.stringify(summary, null, 2));
