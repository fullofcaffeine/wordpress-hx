#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-0bj",
  external_ref: "WPHX-308.02",
  title: "Add taxonomy/comment adapter-contract candidate"
};
const RECORDED_AT = "2026-06-23T19:20:00.000Z";
const HXML = "fixtures/wp-core/taxonomy-comment-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-308-02";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const PRIOR_MANIFEST = "manifests/wp-core/wphx-308-01-taxonomy-comments-surface.v1.json";
const OUT = "manifests/wp-core/wphx-308-02-taxonomy-comment-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-308-02-taxonomy-comment-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-308-02-taxonomy-comment-adapter-contract-candidate.v1.json";
const RUNNER = "tools/wp-core/run-taxonomy-comment-adapter-contract-candidate.mjs";
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/taxonomy/TaxonomyCommentAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/TaxonomyCommentAdapterContractCandidateEntry.hx"
];

const EXPECTED = {
  "taxonomy:rest": "taxonomy_rest_visible",
  "taxonomy:public": "taxonomy_public",
  "taxonomy:queryable": "taxonomy_private_queryable",
  "taxonomy:admin": "taxonomy_admin_only",
  "taxonomy:internal": "taxonomy_internal",
  "term:invalid-taxonomy": "term_invalid_request",
  "term:insert": "term_insert",
  "term:duplicate": "term_duplicate",
  "term:update": "term_update",
  "term:update-duplicate": "term_duplicate",
  "term:delete": "term_delete",
  "term:delete-default": "term_default_delete_blocked",
  "term:missing": "term_missing",
  "term:invalid-id": "term_invalid_request",
  "rel:invalid": "relationship_invalid_request",
  "rel:append": "relationship_append",
  "rel:replace": "relationship_replace",
  "rel:remove": "relationship_remove",
  "rel:no-change": "relationship_no_change",
  "count:none": "count_no_change",
  "count:deferred": "count_deferred",
  "count:taxonomy": "clean_taxonomy_cache",
  "count:term": "clean_term_cache",
  "count:update-now": "count_update_now",
  "comment:insert": "comment_insert",
  "comment:invalid": "comment_invalid_request",
  "comment:update": "comment_update",
  "comment:delete": "comment_delete",
  "comment:trash": "comment_trash",
  "comment:approve": "comment_approve",
  "comment:unapprove": "comment_unapprove",
  "comment:spam": "comment_spam",
  "comment:status-trash": "comment_trash",
  "comment:bad-status": "comment_invalid_request",
  "moderation:duplicate": "moderation_duplicate",
  "moderation:flood": "moderation_flood",
  "moderation:disallowed": "moderation_disallowed",
  "moderation:hold": "moderation_hold",
  "moderation:approve": "moderation_approve",
  "query:status": "query_status",
  "query:type": "query_type",
  "query:post": "query_post",
  "query:parent": "query_parent",
  "query:author": "query_author",
  "query:date": "query_date",
  "query:search": "query_search",
  "query:meta": "query_meta",
  "query:taxonomy": "query_taxonomy",
  "query:unknown": "query_unknown",
  "hook:taxonomy": "taxonomy_register_hooks",
  "hook:term": "term_write_hooks",
  "hook:relationship": "term_relationship_hooks",
  "hook:cache": "term_cache_hooks",
  "hook:comment-write": "comment_write_hooks",
  "hook:comment-status": "comment_status_hooks",
  "hook:comment-query": "comment_query_hooks",
  "hook:failed": "no_taxonomy_comment_hooks"
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/taxonomy-comment-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "taxonomy, term, relationship, comment, moderation, query, hook, and cache routing intent",
      area: "wp-includes/taxonomy.php wp-includes/comment.php wp-includes/comment-template.php",
      public_contract:
        "Haxe owns the first typed taxonomy/comment adapter-contract decision model. Public PHP ABI replacement, database writes, query SQL/result parity, and installed taxonomy/comment behavior are not claimed in this slice."
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
        "Install these decisions through typed Adapter IR/original-path generation and pass PHP-authored taxonomy, term, relationship, comment, moderation, query, hook, cache, live database, and upstream PHPUnit oracle fixtures before claiming public PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat([RUNNER, OUT, OWNERSHIP, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate",
        "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-308-02-taxonomy-comment-adapter-contract-candidate"],
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
  schema: "wphx.wp-core-taxonomy-comment-adapter-contract-candidate.v1",
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
    candidate_kind: "haxe_taxonomy_comment_adapter_contract_candidate",
    promoted_contracts: [
      "taxonomy visibility and REST exposure routing",
      "term insert/update/delete/duplicate/default-term routing",
      "object-term relationship append/replace/remove/no-op routing",
      "term count and cache invalidation intent",
      "comment insert/update/delete/trash/status routing",
      "comment moderation duplicate/flood/disallowed/hold/approve routing",
      "comment and taxonomy query filter classification",
      "taxonomy, term, relationship, cache, comment, status, and query hook intent"
    ],
    upstream_reference_functions: [
      "register_taxonomy",
      "wp_insert_term",
      "wp_update_term",
      "wp_delete_term",
      "wp_set_object_terms",
      "wp_update_term_count",
      "clean_term_cache",
      "wp_insert_comment",
      "wp_update_comment",
      "wp_delete_comment",
      "wp_set_comment_status",
      "wp_allow_comment",
      "WP_Comment_Query::parse_query",
      "WP_Term_Query::parse_query"
    ],
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_provider_claimed: false,
      removal_gate:
        "Install through typed Adapter IR/original-path generation and run differential PHP taxonomy/comment fixtures before claiming public PHP ABI ownership."
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
      id: "php-authored-taxonomy-comment-oracle-fixtures-not-yet-built",
      owner: ISSUE.external_ref,
      detail:
        "The candidate has not yet run through vanilla WordPress and packaged candidate public taxonomy/comment APIs, database state, hooks, cache mutation, comment moderation, and query observations."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "No original-path wp-includes/taxonomy.php, wp-includes/comment.php, wp-includes/comment-template.php, WP_Term_Query, or WP_Comment_Query adapter is claimed in this slice."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_taxonomy_comment_adapter_contract_candidate",
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
  id: "receipt:wphx-308-02-taxonomy-comment-adapter-contract-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "taxonomy/comment Haxe semantic/adapter-contract candidate manifest" },
    { path: OWNERSHIP, role: "ADR-004-aware ownership manifest for taxonomy/comment Haxe candidate" },
    { path: "src/wphx/wp/taxonomy/TaxonomyCommentAdapterContract.hx", role: "typed Haxe taxonomy/comment semantic and adapter-contract model" },
    { path: RUNNER, role: "candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate",
    "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate:check",
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
