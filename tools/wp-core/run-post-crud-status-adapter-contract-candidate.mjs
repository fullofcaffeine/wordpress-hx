#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.14",
  external_ref: "WPHX-307",
  title: "Posts, metadata, revisions, WP_Query"
};
const RECORDED_AT = "2026-06-23T23:05:00.000Z";
const HXML = "fixtures/wp-core/post-crud-status-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-307-03";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const PRIOR_MANIFEST = "manifests/wp-core/wphx-307-02-posts-query-adapter-contract-candidate.v1.json";
const OUT = "manifests/wp-core/wphx-307-03-post-crud-status-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-307-03-post-crud-status-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-307-03-post-crud-status-adapter-contract-candidate.v1.json";
const RUNNER = "tools/wp-core/run-post-crud-status-adapter-contract-candidate.mjs";
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/posts/PostCrudStatusAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/PostCrudStatusAdapterContractCandidateEntry.hx"
];

const EXPECTED = {
  "write:new": "insert",
  "write:update-existing": "update",
  "write:update-missing": "invalid_update",
  "status:empty": "draft",
  "status:attachment-publish": "inherit",
  "status:attachment-private": "private",
  "date:draft-zero": "clear_draft_gmt",
  "date:draft-edit": "use_request_date",
  "date:publish": "keep_existing_date",
  "slug:update-keep": "keep_existing_slug",
  "slug:draft-empty": "empty_slug_allowed",
  "slug:publish-title": "slug_from_title",
  "slug:provided": "sanitize_provided_slug",
  "category:provided": "provided_category",
  "category:update-keep": "keep_existing_category",
  "category:default": "default_category",
  "category:auto-draft": "empty_category",
  "delete:invalid": "invalid_id",
  "delete:missing": "missing_post",
  "delete:trash": "trash",
  "delete:force": "permanent_delete",
  "delete:already-trash": "permanent_delete",
  "delete:attachment": "attachment_delete",
  "untrash:missing": "missing_post",
  "untrash:not-trash": "not_trashed",
  "untrash:post": "restore_post_draft",
  "untrash:attachment": "restore_attachment_inherit",
  "hook:insert": "insert_post_hooks",
  "hook:update-transition": "transition_post_status_hooks",
  "hook:trash": "trash_post_hooks",
  "hook:delete": "delete_post_hooks",
  "hook:suppressed": "no_post_hooks",
  "cache:none": "no_cache_change",
  "cache:post": "post_cache_only",
  "cache:terms": "post_and_term_cache",
  "cache:page": "post_terms_and_archives",
  "cache:status": "post_terms_and_archives"
};

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

function stableGeneratedContents(data) {
  return data
    .toString("utf8")
    .replace(/#(?:[A-Za-z]:)?[^#\r\n]*[/\\](std[/\\][^\r\n]*)/g, "#$HAXE_STD_PATH/$1");
}

function filesUnder(root) {
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      if (entry.isFile()) {
        const stableContents = stableGeneratedContents(readFileSync(child));
        files.push({
          path: relative(root, child),
          bytes: Buffer.byteLength(stableContents),
          sha256: createHash("sha256").update(stableContents).digest("hex")
        });
      }
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source),
    contains_raw_javascript: /\bjs\.Syntax\b/.test(source)
  };
}

function parseOutput(output) {
  const result = {};
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf("=");
    if (separator < 0) throw new Error(`Unexpected output line: ${line}`);
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function generatedPhpLintRecords(paths) {
  return paths
    .filter((record) => record.path.endsWith(".php"))
    .map((record) => ({
      path: `${HAXE_OUT}/${record.path}`,
      relative_path: record.path,
      sha256: `sha256:${record.sha256}`,
      php_lint: command("php", ["-l", `${HAXE_OUT}/${record.path}`])
    }));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/post-crud-status-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "post CRUD, status, slug, date, category, hook, and cache write intent",
      area: "wp-includes/post.php",
      public_contract:
        "Haxe owns a typed post write/status adapter-contract decision model derived from wp_insert_post(), wp_update_post(), wp_delete_post(), wp_trash_post(), wp_untrash_post(), wp_transition_post_status(), and clean_post_cache(). Public PHP ABI replacement, database writes, and installed post behavior are not claimed in this slice."
    },
    ownership_state: "haxe_parity_candidate",
    ownership_axes: {
      semantic_owner: "haxe",
      adapter_contract_owner: "haxe_typed",
      emission_strategy: "stock_haxe_php_private_impl",
      execution_provider: "haxe_php",
      compatibility_evidence: "targeted_semantic_parity"
    },
    bridge: {
      exists: true,
      kind: "adapter-contract-candidate-without-public-php-installation",
      removal_gate:
        "Install these decisions through typed Adapter IR/original-path generation and pass PHP-authored post CRUD/status, metadata, hooks, cache, live database, and upstream PHPUnit oracle fixtures before claiming public PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat([RUNNER, OUT, OWNERSHIP, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate",
        "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-307-03-post-crud-status-adapter-contract-candidate"],
      manifest_digest: manifestSha
    },
    notes:
      "This is a PHP-hosted Haxe candidate. It adds no native provider, no handwritten production PHP shell, and no public WordPress file replacement."
  };
}

const lock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);

const generatedFiles = filesUnder(HAXE_OUT);
const output = command("php", [ENTRY]);
const observations = parseOutput(output);
const matchesExpected = JSON.stringify(observations) === JSON.stringify(EXPECTED);
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) =>
    !audit.contains_dynamic &&
    !audit.contains_untyped &&
    !audit.contains_cast &&
    !audit.contains_php_syntax_code &&
    !audit.contains_raw_javascript
);

if (!matchesExpected || !sourceEscapeAuditPassed) {
  console.error(JSON.stringify({ status: "failed", matchesExpected, observations, haxeSourceAudits }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-post-crud-status-adapter-contract-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "generated_shape"],
  artifact_scope: "helper",
  inputs: {
    prior_manifest: inputRecord(PRIOR_MANIFEST),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord)
  },
  fixture: {
    candidate_kind: "haxe_post_crud_status_adapter_contract_candidate",
    promoted_contracts: [
      "post insert versus update routing",
      "attachment status normalization",
      "draft date clearing intent",
      "slug generation/sanitization intent",
      "post category defaulting intent",
      "trash, untrash, attachment delete, and permanent delete routing",
      "post transition, CRUD, trash, untrash, and delete hook intent",
      "post, term, archive, and page cache invalidation intent"
    ],
    upstream_reference_functions: [
      "wp_insert_post",
      "wp_update_post",
      "wp_delete_post",
      "wp_trash_post",
      "wp_untrash_post",
      "wp_transition_post_status",
      "clean_post_cache"
    ],
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_provider_claimed: false,
      removal_gate:
        "Install through typed Adapter IR/original-path generation and run differential PHP post CRUD/status fixtures before claiming public PHP ABI ownership."
    },
    source_escape_audits: haxeSourceAudits
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_profile: command("php", ["-r", "echo PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;"])
  },
  build: {
    generated_file_hash_policy: "normalize_haxe_std_source_map_paths",
    generated_haxe_files: generatedFiles,
    php_lint: generatedPhpLintRecords(generatedFiles)
  },
  run: {
    command: `php ${ENTRY}`,
    raw_output_sha256: sha256(output),
    observations,
    matches_expected: matchesExpected
  },
  remaining_gaps: [
    {
      id: "php-authored-post-crud-oracle-fixture-not-yet-built",
      owner: ISSUE.external_ref,
      detail:
        "The candidate has not yet run against vanilla WordPress and a packaged candidate through public wp_insert_post(), wp_update_post(), wp_delete_post(), wp_trash_post(), wp_untrash_post(), hook, cache, and database observations."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "No original-path wp-includes/post.php adapter or installed distribution replacement is claimed in this slice."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_post_crud_status_adapter_contract_candidate",
    promoted_contracts: 8,
    runtime_runs: 1,
    observation_count: Object.keys(EXPECTED).length,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-307-03-post-crud-status-adapter-contract-candidate",
  issue: { ...ISSUE, title: "Promote post CRUD/status write intent to Haxe parity candidate" },
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "post CRUD/status Haxe semantic/adapter-contract candidate manifest" },
    { path: OWNERSHIP, role: "ADR-004-aware ownership manifest for post CRUD/status Haxe candidate" },
    { path: "src/wphx/wp/posts/PostCrudStatusAdapterContract.hx", role: "typed Haxe post CRUD/status semantic and adapter-contract model" },
    { path: RUNNER, role: "candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate",
    "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate:check",
    "npm run haxe:escape-hatches:check",
    "npm run receipts:validate"
  ],
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", output: OUT, ownership: OWNERSHIP, receipt: RECEIPT }, null, 2));
