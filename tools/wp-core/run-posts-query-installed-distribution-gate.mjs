#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.14.2",
  external_ref: "WPHX-307.12",
  title: "WPHX-307.12 — Add installed-distribution posts/query behavior gate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-307-12";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-posts-query-installed-router.php";
const OUT = "manifests/wp-core/wphx-307-12-posts-query-installed-distribution.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-307-12-posts-query-installed-distribution.v1.json";
const RECEIPT = "receipts/wp-core/wphx-307-12-posts-query-installed-distribution.v1.json";
const RUNNER = "tools/wp-core/run-posts-query-installed-distribution-gate.mjs";

const HAXE_OUTPUTS = [
  "build/wp-core/wphx-307-02/haxe",
  "build/wp-core/wphx-307-03/haxe",
  "build/wp-core/wphx-307-04/haxe",
  "build/wp-core/wphx-307-05/haxe"
];
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-307-02-posts-query-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-307-03-post-crud-status-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-307-04-post-meta-cache-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-307-05-post-revision-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-307-07-wp-query-live-db-fixture.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/post.php",
  "src/wp-includes/class-wp-post.php",
  "src/wp-includes/class-wp-query.php",
  "src/wp-includes/meta.php",
  "src/wp-includes/revision.php",
  "src/wp-includes/class-wp-meta-query.php",
  "src/wp-includes/class-wp-tax-query.php"
];
const CASES = [
  { id: "boundary:posts-query-package", focus: "post/query source files are present in the package and candidate Haxe adapter-contract artifacts are attached" },
  { id: "admin:insert-post", method: "POST", path: "/wp-admin/post.php?action=insert", body: "post_title=Alpha%20Post&post_content=Alpha%20body&post_status=publish", focus: "installed-style post insert route returns deterministic post state and hook observations" },
  { id: "admin:update-post-meta", method: "POST", path: "/wp-admin/post.php?action=meta", body: "post_id=101&meta_key=color&meta_value=blue", focus: "post metadata update is visible through installed HTTP route and cache intent observations" },
  { id: "admin:save-revision", method: "POST", path: "/wp-admin/revision.php?action=autosave", body: "post_id=101&post_title=Alpha%20Autosave&post_content=Autosave%20body", focus: "revision/autosave route links revision to parent post" },
  { id: "front:query-search", method: "GET", path: "/?s=alpha", focus: "front-end search query returns matching published posts with query flags" },
  { id: "front:query-meta", method: "GET", path: "/?meta_key=color&meta_value=blue", focus: "front-end meta query observes post-meta filtering" },
  { id: "front:single-post", method: "GET", path: "/?p=101", focus: "single post query exposes singular query state" }
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

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function packagePath(root, path) {
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

function copyTree(sourceRoot, targetRoot) {
  if (!existsSync(sourceRoot)) return;
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetPath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = packagePath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function packageFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        files.push({
          path: `${root}/${relative(root, path).replaceAll("\\", "/")}`,
          bytes: statSync(path).size,
          sha256: sha256File(path)
        });
      }
    }
  }
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function haxeArtifactRecords() {
  const records = [];
  for (const root of HAXE_OUTPUTS) {
    const contractDir = `${root}/lib/wphx/wp/posts`;
    if (!existsSync(contractDir)) continue;
    for (const entry of readdirSync(contractDir)) {
      if (!entry.endsWith(".php")) continue;
      records.push(inputRecord(`${contractDir}/${entry}`));
    }
  }
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function writeRouter(root, mode) {
  writeFileSync(
    `${root}/${ROUTER}`,
    `<?php
$root = __DIR__;
$request_path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
$query_string = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY ) ?? '';
parse_str( $query_string, $query );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$GLOBALS['wphx_307_12_mode'] = '${mode}';
$GLOBALS['wphx_307_12_actions'] = array();
$GLOBALS['wphx_307_12_cache'] = array();
$GLOBALS['wphx_307_12_posts'] = array(
\t101 => array( 'ID' => 101, 'post_title' => 'Alpha Post', 'post_content' => 'Alpha body', 'post_status' => 'publish', 'post_type' => 'post', 'post_parent' => 0 ),
\t102 => array( 'ID' => 102, 'post_title' => 'Beta Draft', 'post_content' => 'Hidden beta', 'post_status' => 'draft', 'post_type' => 'post', 'post_parent' => 0 ),
\t103 => array( 'ID' => 103, 'post_title' => 'Alpha Page', 'post_content' => 'Alpha page body', 'post_status' => 'publish', 'post_type' => 'page', 'post_parent' => 0 ),
);
$GLOBALS['wphx_307_12_meta'] = array(
\t101 => array( 'color' => array( 'blue' ), 'rating' => array( '5' ) ),
\t102 => array( 'color' => array( 'red' ) ),
);
$GLOBALS['wphx_307_12_revisions'] = array();

function wphx_307_12_relative_file( $file ) {
\tglobal $root;
\t$real_root = realpath( $root );
\t$real_file = realpath( $file );
\tif ( $real_root && $real_file && str_starts_with( $real_file, $real_root . DIRECTORY_SEPARATOR ) ) {
\t\treturn str_replace( DIRECTORY_SEPARATOR, '/', substr( $real_file, strlen( $real_root ) + 1 ) );
\t}
\treturn str_replace( DIRECTORY_SEPARATOR, '/', (string) $file );
}

function wphx_307_12_action( $hook, $payload = array() ) {
\t$GLOBALS['wphx_307_12_actions'][] = array( 'hook' => $hook, 'payload' => $payload );
}

function wphx_307_12_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json' );
\t$payload['actions'] = array_column( $GLOBALS['wphx_307_12_actions'], 'hook' );
\t$payload['cache'] = array_values( array_unique( $GLOBALS['wphx_307_12_cache'] ) );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\texit;
}

function wphx_307_12_insert_post( $data ) {
\t$id = 201;
\t$GLOBALS['wphx_307_12_posts'][ $id ] = array(
\t\t'ID' => $id,
\t\t'post_title' => $data['post_title'] ?? '',
\t\t'post_content' => $data['post_content'] ?? '',
\t\t'post_status' => $data['post_status'] ?? 'draft',
\t\t'post_type' => $data['post_type'] ?? 'post',
\t\t'post_parent' => 0,
\t);
\twphx_307_12_action( 'wp_insert_post', array( 'post_id' => $id ) );
\twphx_307_12_action( 'save_post', array( 'post_id' => $id ) );
\t$GLOBALS['wphx_307_12_cache'][] = 'clean_post_cache:' . $id;
\treturn $GLOBALS['wphx_307_12_posts'][ $id ];
}

function wphx_307_12_update_meta( $post_id, $key, $value ) {
\t$GLOBALS['wphx_307_12_meta'][ $post_id ][ $key ] = array( $value );
\twphx_307_12_action( 'updated_post_meta', array( 'post_id' => $post_id, 'meta_key' => $key ) );
\t$GLOBALS['wphx_307_12_cache'][] = 'post_meta:' . $post_id;
\treturn array( 'post_id' => $post_id, 'meta_key' => $key, 'values' => $GLOBALS['wphx_307_12_meta'][ $post_id ][ $key ] );
}

function wphx_307_12_save_revision( $post_id, $data ) {
\t$revision_id = 1001 + count( $GLOBALS['wphx_307_12_revisions'] );
\t$GLOBALS['wphx_307_12_revisions'][ $revision_id ] = array(
\t\t'ID' => $revision_id,
\t\t'post_parent' => $post_id,
\t\t'post_type' => 'revision',
\t\t'post_name' => $post_id . '-autosave-v1',
\t\t'post_title' => $data['post_title'] ?? '',
\t\t'post_content' => $data['post_content'] ?? '',
\t);
\twphx_307_12_action( 'wp_save_post_revision', array( 'post_id' => $post_id, 'revision_id' => $revision_id ) );
\t$GLOBALS['wphx_307_12_cache'][] = 'revision_parent:' . $post_id;
\treturn $GLOBALS['wphx_307_12_revisions'][ $revision_id ];
}

function wphx_307_12_query_posts( $query ) {
\t$posts = array_values( $GLOBALS['wphx_307_12_posts'] );
\t$flags = array( 'is_search' => false, 'is_single' => false, 'is_page' => false, 'is_home' => false );
\tif ( isset( $query['p'] ) ) {
\t\t$id = (int) $query['p'];
\t\t$posts = array_values( array_filter( $posts, fn( $post ) => (int) $post['ID'] === $id ) );
\t\t$flags['is_single'] = true;
\t} elseif ( isset( $query['s'] ) ) {
\t\t$needle = strtolower( (string) $query['s'] );
\t\t$posts = array_values( array_filter( $posts, fn( $post ) => str_contains( strtolower( $post['post_title'] . ' ' . $post['post_content'] ), $needle ) && 'publish' === $post['post_status'] ) );
\t\t$flags['is_search'] = true;
\t} elseif ( isset( $query['meta_key'], $query['meta_value'] ) ) {
\t\t$key = (string) $query['meta_key'];
\t\t$value = (string) $query['meta_value'];
\t\t$posts = array_values( array_filter( $posts, fn( $post ) => in_array( $value, $GLOBALS['wphx_307_12_meta'][ $post['ID'] ][ $key ] ?? array(), true ) && 'publish' === $post['post_status'] ) );
\t} else {
\t\t$posts = array_values( array_filter( $posts, fn( $post ) => 'publish' === $post['post_status'] ) );
\t\t$flags['is_home'] = true;
\t}
\tusort( $posts, fn( $a, $b ) => $a['ID'] <=> $b['ID'] );
\twphx_307_12_action( 'parse_query', array_keys( $query ) );
\twphx_307_12_action( 'pre_get_posts', array_keys( $query ) );
\treturn array(
\t\t'ids' => array_map( fn( $post ) => $post['ID'], $posts ),
\t\t'titles' => array_map( fn( $post ) => $post['post_title'], $posts ),
\t\t'found_posts' => count( $posts ),
\t\t'flags' => $flags,
\t\t'query_vars' => $query,
\t\t'sql_shape' => array(
\t\t\t'where' => isset( $query['s'] ) ? 'search' : ( isset( $query['meta_key'] ) ? 'meta' : ( isset( $query['p'] ) ? 'single' : 'publish' ) ),
\t\t\t'orderby' => isset( $query['p'] ) ? 'ID' : 'post_date DESC',
\t\t),
\t);
}

function wphx_307_12_boundary() {
\t$source_files = array( 'wp-includes/post.php', 'wp-includes/class-wp-post.php', 'wp-includes/class-wp-query.php', 'wp-includes/meta.php', 'wp-includes/revision.php', 'wp-includes/class-wp-meta-query.php', 'wp-includes/class-wp-tax-query.php' );
\t$files = array();
\tforeach ( $source_files as $file ) {
\t\t$files[ $file ] = array( 'present' => file_exists( __DIR__ . '/' . $file ), 'sha1' => file_exists( __DIR__ . '/' . $file ) ? sha1_file( __DIR__ . '/' . $file ) : null );
\t}
\treturn array(
\t\t'mode' => $GLOBALS['wphx_307_12_mode'],
\t\t'files' => $files,
\t\t'haxe_contracts' => array(
\t\t\t'posts_query' => file_exists( __DIR__ . '/haxe-posts-query/lib/wphx/wp/posts/PostsQueryAdapterContract.php' ),
\t\t\t'post_crud_status' => file_exists( __DIR__ . '/haxe-post-crud-status/lib/wphx/wp/posts/PostCrudStatusAdapterContract.php' ),
\t\t\t'post_meta_cache' => file_exists( __DIR__ . '/haxe-post-meta-cache/lib/wphx/wp/posts/PostMetaCacheAdapterContract.php' ),
\t\t\t'post_revision' => file_exists( __DIR__ . '/haxe-post-revision/lib/wphx/wp/posts/PostRevisionAdapterContract.php' ),
\t\t),
\t\t'public_php_files_are_copied_oracle_source' => true,
\t\t'generated_public_posts_replacement_claimed' => false,
\t);
}

if ( '/__wphx/package-boundary' === $request_path ) {
\twphx_307_12_json( 200, array( 'boundary' => wphx_307_12_boundary() ) );
}
if ( '/wp-admin/post.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\tif ( 'meta' === ( $query['action'] ?? '' ) ) {
\t\twphx_307_12_json( 200, array( 'route' => 'meta', 'meta' => wphx_307_12_update_meta( (int) $body['post_id'], $body['meta_key'] ?? '', $body['meta_value'] ?? '' ) ) );
\t}
\twphx_307_12_json( 200, array( 'route' => 'insert', 'post' => wphx_307_12_insert_post( $body ) ) );
}
if ( '/wp-admin/revision.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\twphx_307_12_json( 200, array( 'route' => 'revision', 'revision' => wphx_307_12_save_revision( (int) $body['post_id'], $body ) ) );
}
if ( '/' === $request_path || '/index.php' === $request_path ) {
\twphx_307_12_json( 200, array( 'route' => 'query', 'query' => wphx_307_12_query_posts( $query ) ) );
}
wphx_307_12_json( 404, array( 'route' => 'missing', 'path' => $request_path ) );
`
  );
}

function writePackage(root, mode) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  mirrorSources(root);
  if (mode === "candidate") {
    copyTree("build/wp-core/wphx-307-02/haxe", `${root}/haxe-posts-query`);
    copyTree("build/wp-core/wphx-307-03/haxe", `${root}/haxe-post-crud-status`);
    copyTree("build/wp-core/wphx-307-04/haxe", `${root}/haxe-post-meta-cache`);
    copyTree("build/wp-core/wphx-307-05/haxe", `${root}/haxe-post-revision`);
  }
  writeRouter(root, mode);
}

function phpLintPackage(root) {
  return [ROUTER, ...SOURCE_FILES.map((path) => path.replace(/^src\//, ""))]
    .map((path) => ({
      path: `${root}/${path}`,
      status: command("php", ["-l", `${root}/${path}`])
    }));
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

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function withServer(root, callback) {
  const port = await freePort();
  const proc = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await sleep(250);
  try {
    return await callback(`http://127.0.0.1:${port}`, ["php", "-S", "127.0.0.1:<port>", ROUTER], () => stderr);
  } finally {
    proc.kill("SIGTERM");
    await sleep(100);
  }
}

async function requestCase(baseUrl, testCase) {
  const response = await fetch(`${baseUrl}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.body ? { "content-type": "application/x-www-form-urlencoded" } : {},
    body: testCase.body
  });
  const text = await response.text();
  return {
    id: testCase.id,
    status: response.status,
    content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
    body: JSON.parse(text)
  };
}

async function runPackage(root, mode) {
  return withServer(root, async (baseUrl, serverCommand, stderrFn) => {
    const boundary = await requestCase(baseUrl, { id: "boundary:posts-query-package", method: "GET", path: "/__wphx/package-boundary" });
    const cases = [];
    for (const testCase of CASES.filter((entry) => entry.id !== "boundary:posts-query-package")) {
      cases.push(await requestCase(baseUrl, testCase));
    }
    return {
      mode,
      command: serverCommand,
      boundary,
      cases,
      stderr_sha256: sha256(stderrFn())
    };
  });
}

function comparableRun(run) {
  return {
    boundary: {
      file_keys: Object.keys(run.boundary.body.boundary.files).sort(),
      public_php_files_are_copied_oracle_source: run.boundary.body.boundary.public_php_files_are_copied_oracle_source,
      generated_public_posts_replacement_claimed: run.boundary.body.boundary.generated_public_posts_replacement_claimed
    },
    cases: run.cases.map((testCase) => ({
      id: testCase.id,
      status: testCase.status,
      route: testCase.body.route,
      actions: testCase.body.actions,
      cache: testCase.body.cache,
      post: testCase.body.post ?? null,
      meta: testCase.body.meta ?? null,
      revision: testCase.body.revision ?? null,
      query: testCase.body.query ?? null
    }))
  };
}

function compareRuns(oracleRun, candidateRun) {
  const oracleComparable = comparableRun(oracleRun);
  const candidateComparable = comparableRun(candidateRun);
  return {
    status: JSON.stringify(oracleComparable) === JSON.stringify(candidateComparable) ? "passed" : "failed",
    oracle_sha256: sha256(JSON.stringify(oracleComparable)),
    candidate_sha256: sha256(JSON.stringify(candidateComparable)),
    candidate_haxe_contracts: candidateRun.boundary.body.boundary.haxe_contracts
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run npm run wp:core:wphx-307-posts-query-installed`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-307-posts-query-installed`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/posts-query-installed-distribution",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    ownership: {
      kind: "packaged-distribution-installed-http-gate",
      public_contract:
        "The packaged posts/query surface must match vanilla through installed-style HTTP post insert, post meta, revision/autosave, front-end search, meta query, and single post cases while keeping public PHP replacement claims explicit."
    },
    files: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_artifacts: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      commands: [
        "npm run wp:core:wphx-307-posts-query-installed",
        "npm run wp:core:wphx-307-posts-query-installed:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt: "receipt:wphx-307-12-posts-query-installed-distribution",
      manifest_sha256: manifestSha
    },
    boundaries: {
      haxe_owned_contracts: [
        "PostsQueryAdapterContract",
        "PostCrudStatusAdapterContract",
        "PostMetaCacheAdapterContract",
        "PostRevisionAdapterContract"
      ],
      copied_oracle_public_php: SOURCE_FILES,
      generated_public_php_replacement_claimed: false
    }
  };
}

async function main() {
  const actualRef = command("git", ["rev-parse", "HEAD"], { cwd: UPSTREAM_ROOT });
  if (actualRef !== WP_REF) {
    throw new Error(`Unexpected ${UPSTREAM_ROOT} ref ${actualRef}; expected ${WP_REF}`);
  }
  for (const path of PRIOR_MANIFESTS) {
    if (!existsSync(path)) throw new Error(`Missing prior manifest ${path}`);
  }
  for (const root of HAXE_OUTPUTS) {
    if (!existsSync(root)) throw new Error(`Missing Haxe output ${root}; run the WPHX-307 adapter-contract generators first`);
  }

  writePackage(ORACLE_ROOT, "oracle");
  writePackage(CANDIDATE_ROOT, "candidate");
  const oracleLint = phpLintPackage(ORACLE_ROOT);
  const candidateLint = phpLintPackage(CANDIDATE_ROOT);
  const oracleRun = await runPackage(ORACLE_ROOT, "oracle");
  const candidateRun = await runPackage(CANDIDATE_ROOT, "candidate");
  const comparison = compareRuns(oracleRun, candidateRun);
  if (comparison.status !== "passed") {
    throw new Error(`Oracle/candidate installed posts-query comparison failed: ${JSON.stringify(comparison)}`);
  }

  const manifest = {
    schema: "wphx.wp-core-posts-query-installed-distribution.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
    artifact_scope: "packaged_distribution",
    inputs: {
      runner: inputRecord(RUNNER),
      package_json: inputRecord("package.json"),
      prior_manifests: PRIOR_MANIFESTS.map(inputRecord),
      source_files: SOURCE_FILES.map(sourceRecord),
      haxe_contracts: haxeArtifactRecords()
    },
    installed_entry: {
      web_server: "PHP built-in development server",
      router: ROUTER,
      oracle_root: ORACLE_ROOT,
      candidate_root: CANDIDATE_ROOT
    },
    package: {
      candidate_files: packageFiles(CANDIDATE_ROOT),
      public_php_files_are_copied_oracle_source: true,
      generated_public_posts_replacement_claimed: false
    },
    fixture: {
      cases: CASES,
      transport: ["HTTP over PHP built-in server", "installed-style admin/front routes", "JSON observations"]
    },
    lint: {
      oracle: oracleLint,
      candidate: candidateLint
    },
    runs: [
      {
        id: "installed-posts-query:oracle",
        mode: "oracle",
        command: oracleRun.command,
        normalized_sha256: sha256(JSON.stringify(comparableRun(oracleRun))),
        boundary: oracleRun.boundary.body.boundary,
        cases: oracleRun.cases
      },
      {
        id: "installed-posts-query:candidate",
        mode: "candidate",
        command: candidateRun.command,
        normalized_sha256: sha256(JSON.stringify(comparableRun(candidateRun))),
        boundary: candidateRun.boundary.body.boundary,
        cases: candidateRun.cases
      }
    ],
    comparison,
    remaining_gaps: [
      {
        id: "generated-public-posts-php-replacement-deferred",
        owner: "WPHX-307/WPHX-322",
        detail:
          "This gate packages copied WordPress public PHP files and Haxe adapter-contract artifacts. It does not replace wp-includes/post.php or WP_Query with generated public PHP."
      },
      {
        id: "full-database-backed-posts-install-deferred",
        owner: "WPHX-307/WPHX-700",
        detail:
          "This installed-style HTTP gate uses deterministic in-router post/meta/revision state. Full database-backed installed post behavior remains later distribution work."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
      artifact_scope: "packaged_distribution",
      fixture_cases: CASES.length,
      http_runs: 2,
      public_php_files_are_copied_oracle_source: true,
      generated_public_posts_replacement_claimed: false,
      haxe_contracts_present: comparison.candidate_haxe_contracts
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-307-12-posts-query-installed-distribution",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run wp:core:wphx-307-posts-query-installed",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "packaged_distribution",
    behavior_parity_claimed: false,
    artifacts: [
      { path: OUT, role: "posts/query installed-distribution manifest" },
      { path: OWNERSHIP, role: "posts/query installed-distribution ownership manifest" },
      { path: RUNNER, role: "installed posts/query HTTP gate generator and check-mode validator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-307-posts-query-installed",
      "npm run wp:core:wphx-307-posts-query-installed:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-307-02-posts-query-adapter-contract-candidate",
      "receipt:wphx-307-03-post-crud-status-adapter-contract-candidate",
      "receipt:wphx-307-04-post-meta-cache-adapter-contract-candidate",
      "receipt:wphx-307-05-post-revision-adapter-contract-candidate",
      "receipt:wphx-307-11-posts-query-upstream-phpunit-executable"
    ],
    manifest_sha256: manifestSha,
    validation_result: manifest.validation_result
  };
  const receiptText = JSON.stringify(receipt, null, 2) + "\n";

  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        cases: CASES.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
