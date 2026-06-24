#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-a1g",
  external_ref: "WPHX-309.04",
  title: "Add routing/template adapter-contract candidate"
};
const RECORDED_AT = "2026-06-24T06:30:00.000Z";
const HXML = "fixtures/wp-core/routing-template-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-309-04";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const PRIOR_MANIFEST = "manifests/wp-core/wphx-309-01-routing-template-surface.v1.json";
const OUT = "manifests/wp-core/wphx-309-04-routing-template-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-309-04-routing-template-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-309-04-routing-template-adapter-contract-candidate.v1.json";
const RUNNER = "tools/wp-core/run-routing-template-adapter-contract-candidate.mjs";
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/routing/RoutingTemplateAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/RoutingTemplateAdapterContractCandidateEntry.hx"
];

const EXPECTED = {
  "route:index": "route_index",
  "route:rewrite": "route_rewrite_rule",
  "route:root-page": "route_root_page",
  "route:404": "route_404",
  "route:admin": "route_admin",
  "route:rest": "route_rest",
  "route:feed": "route_feed",
  "route:robots": "route_robots",
  "route:sitemap": "route_sitemap",
  "request:main": "request_main_query",
  "request:empty": "request_empty",
  "request:rest": "request_rest",
  "request:feed": "request_feed",
  "request:404": "request_404",
  "canonical:none": "canonical_no_redirect",
  "canonical:slash": "canonical_trailing_slash",
  "canonical:host": "canonical_host",
  "canonical:paged": "canonical_paged",
  "canonical:attachment": "canonical_attachment",
  "canonical:404": "canonical_404",
  "link:permalink": "link_permalink",
  "link:home": "link_home",
  "link:feed": "link_feed",
  "link:paged": "link_paged",
  "link:preview": "link_preview",
  "link:attachment": "link_attachment",
  "template:front-page": "template_front_page",
  "template:home": "template_home",
  "template:single": "template_single",
  "template:page": "template_page",
  "template:archive": "template_archive",
  "template:search": "template_search",
  "template:feed": "template_feed",
  "template:404": "template_404",
  "hook:rewrite": "rewrite_rule_hooks",
  "hook:request": "request_parse_hooks",
  "hook:canonical": "canonical_redirect_hooks",
  "hook:link": "link_template_hooks",
  "hook:template": "template_loader_hooks",
  "hook:failed": "routing_template_no_hooks"
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-309-routing-template-adapter-contract-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/routing-template-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "rewrite, routing, canonical, link-template, request, hook, and template-loader intent",
      area: "wp-includes/class-wp.php wp-includes/class-wp-rewrite.php wp-includes/rewrite.php wp-includes/canonical.php wp-includes/link-template.php wp-includes/template-loader.php",
      public_contract:
        "Haxe owns the first typed routing/template adapter-contract decision model. Public PHP ABI replacement, rewrite-rule storage, front-end HTTP behavior, canonical redirect output, template includes, and installed routing behavior are not claimed in this slice."
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
        "Install these decisions through typed Adapter IR/original-path generation and pass PHP-authored rewrite, parse_request, canonical, link-template, template-loader, installed HTTP, and upstream PHPUnit oracle fixtures before claiming public PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat([RUNNER, OUT, OWNERSHIP, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-309-routing-template-adapter-contract-candidate",
        "npm run wp:core:wphx-309-routing-template-adapter-contract-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-309-04-routing-template-adapter-contract-candidate"],
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
  schema: "wphx.wp-core-routing-template-adapter-contract-candidate.v1",
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
    candidate_kind: "haxe_routing_template_adapter_contract_candidate",
    promoted_contracts: [
      "route entrypoint classification for index, rewrite, root page, 404, admin, REST, feed, robots, and sitemap paths",
      "request parsing outcome intent for main query, empty request, REST, feed, and 404 routes",
      "canonical redirect intent for no-op, trailing slash, host, paged, attachment, and 404 cases",
      "link-template routing intent for permalink, home, feed, paged, preview, and attachment URLs",
      "template-loader hierarchy intent for front-page, home, single, page, archive, search, feed, and 404 templates",
      "rewrite, parse_request, canonical, link-template, and template-loader hook intent"
    ],
    upstream_reference_functions: [
      "WP::parse_request",
      "WP::query_posts",
      "WP_Rewrite::rewrite_rules",
      "flush_rewrite_rules",
      "redirect_canonical",
      "get_permalink",
      "home_url",
      "get_feed_link",
      "get_pagenum_link",
      "template-loader.php",
      "get_query_template"
    ],
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_provider_claimed: false,
      removal_gate:
        "Install through typed Adapter IR/original-path generation and run differential PHP routing/template fixtures before claiming public PHP ABI ownership."
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
      id: "php-authored-routing-template-oracle-fixtures-not-yet-built",
      owner: ISSUE.external_ref,
      detail:
        "The candidate has not yet run through vanilla WordPress and packaged candidate public rewrite, parse_request, canonical, link-template, template-loader, HTTP output, include, hook, and query observations."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "No original-path wp-includes/class-wp.php, class-wp-rewrite.php, rewrite.php, canonical.php, link-template.php, or template-loader.php adapter is claimed in this slice."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_routing_template_adapter_contract_candidate",
    promoted_contracts: 6,
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
  id: "receipt:wphx-309-04-routing-template-adapter-contract-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "routing/template Haxe semantic/adapter-contract candidate manifest" },
    { path: OWNERSHIP, role: "ADR-004-aware ownership manifest for routing/template Haxe candidate" },
    { path: "src/wphx/wp/routing/RoutingTemplateAdapterContract.hx", role: "typed Haxe routing/template semantic and adapter-contract model" },
    { path: RUNNER, role: "candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-309-routing-template-adapter-contract-candidate",
    "npm run wp:core:wphx-309-routing-template-adapter-contract-candidate:check",
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
