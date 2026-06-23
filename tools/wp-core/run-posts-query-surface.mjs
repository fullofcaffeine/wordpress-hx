#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.14",
  external_ref: "WPHX-307",
  title: "Posts, metadata, revisions, WP_Query"
};
const RECORDED_AT = "2026-06-23T04:30:00.000Z";
const SOURCE = "manifests/source-inventory.jsonl";
const ARTIFACTS = "manifests/artifact-provenance.jsonl";
const TESTS = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const FIRST_PARTY_CLOSURE = "manifests/wp-core/wphx-322-php-first-party-manifest-closure.v1.json";
const OUT = "manifests/wp-core/wphx-307-01-posts-query-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-307-01-posts-query-surface.v1.json";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function stripSrc(path) {
  return path.startsWith("src/") ? path.slice(4) : path;
}

function isVendorPhpPath(path) {
  const p = stripSrc(path).toLowerCase();
  return (
    p.startsWith("wp-includes/id3/") ||
    p.startsWith("wp-includes/phpmailer/") ||
    p.startsWith("wp-includes/requests/") ||
    p.startsWith("wp-includes/simplepie/") ||
    p.startsWith("wp-includes/sodium_compat/") ||
    p.includes("/paragonie/") ||
    p.includes("/random_compat/") ||
    p.includes("/simplepie/") ||
    p.includes("/phpmailer/")
  );
}

function ownerForPath(path) {
  const p = stripSrc(path).toLowerCase();
  if (isVendorPhpPath(p)) return "WPHX-323";
  if (p.startsWith("wp-content/themes/")) return "WPHX-320";
  if (p.startsWith("wp-content/plugins/")) return "WPHX-318";
  if (p.includes("wpdb") || p.includes("db.php") || p.includes("dbdelta")) return "WPHX-305";
  if (p.includes("ms-") || p.includes("multisite") || p.includes("signup") || (p.includes("site-health") && p.includes("multisite"))) return "WPHX-317";
  if (p.includes("rest-api") || p.includes("class-wp-rest") || p.includes("rest-")) return "WPHX-311";
  if (
    p.includes("user") ||
    p.includes("capabilities") ||
    p.includes("session-token") ||
    p.includes("pluggable") ||
    p.includes("auth") ||
    p.includes("application-password") ||
    p.includes("wp-login.php") ||
    p.includes("wp-activate.php")
  ) {
    return "WPHX-306";
  }
  if (p.includes("post") || p.includes("revision") || p.includes("class-wp-query") || p.includes("query.php") || p.includes("meta.php")) return "WPHX-307";
  if (p.includes("taxonomy") || p.includes("term") || p.includes("comment")) return "WPHX-308";
  if (p.includes("rewrite") || p.includes("canonical") || p.includes("link-template") || p.includes("template-loader") || p.includes("class-wp.php") || p.includes("wp-blog-header.php") || p.includes("index.php")) return "WPHX-309";
  if (p.includes("theme") || p.includes("customize") || p.includes("template") || p.includes("theme-compat") || p.includes("class-wp-theme") || p.includes("global-styles") || p.includes("script-modules")) return "WPHX-310";
  if (p.includes("http") || p.includes("requests") || p.includes("cron") || p.includes("mail") || p.includes("feed") || p.includes("embed") || p.includes("oembed") || p.includes("wp-cron.php") || p.includes("wp-mail.php") || p.includes("wp-links-opml.php") || p.includes("wp-trackback.php")) return "WPHX-312";
  if (p.includes("media") || p.includes("image") || p.includes("upload") || p.includes("filesystem") || p.includes("file.php") || p.includes("class-wp-filesystem") || p.includes("wp-content/index.php")) return "WPHX-313";
  if (p.includes("block") || p.includes("interactivity") || p.includes("style-engine") || p.includes("html-api") || p.includes("fonts") || p.includes("assets")) return "WPHX-314";
  if (p.startsWith("wp-admin/includes/class-wp-list-table") || p.includes("list-table") || p.includes("screen") || p.includes("menu") || p.includes("admin-header") || p.includes("admin-footer")) return "WPHX-315";
  if (p.startsWith("wp-admin/")) {
    if (p.includes("update") || p.includes("install") || p.includes("upgrader") || p.includes("maintenance") || p.includes("recovery")) return "WPHX-319";
    if (p.includes("media") || p.includes("upload")) return "WPHX-313";
    if (p.includes("theme") || p.includes("customize")) return "WPHX-310";
    if (p.includes("ajax") || p.includes("async") || p.includes("network/") || p.includes("options-") || p.includes("tools") || p.includes("edit") || p.includes("post") || p.includes("term") || p.includes("comment")) return "WPHX-316";
    return "WPHX-315";
  }
  if (p.includes("xmlrpc") || p.includes("deprecated") || p.includes("legacy") || p.includes("class-ixr")) return "WPHX-318";
  if (p.includes("update") || p.includes("install") || p.includes("upgrader") || p.includes("recovery") || p.includes("maintenance")) return "WPHX-319";
  if (p.includes("option") || p.includes("transient") || p.includes("cache")) return "WPHX-304";
  if (p.includes("formatting") || p.includes("kses") || p.includes("sanitize") || p.includes("class-wp-error") || p.includes("error") || p.includes("deprecated")) return "WPHX-303";
  if (p.includes("plugin") || p.includes("class-wp-hook") || p.includes("wp-settings.php")) return "WPHX-302";
  if (p === "wp-config-sample.php" || p === "wp-tests-config-sample.php" || p.includes("load.php") || p.includes("default-constants") || p.includes("version.php") || p.includes("compat.php") || p.includes("wp-load.php") || p.includes("wp-settings.php")) return "WPHX-301";
  return "WPHX-301";
}

function groupForPath(path) {
  const p = stripSrc(path).toLowerCase();
  if (p.includes("class-wp-query.php") || p.endsWith("wp-includes/query.php")) return "wp_query";
  if (p.includes("class-wp-meta-query.php") || p.endsWith("wp-includes/meta.php")) return "metadata";
  if (p.includes("revision")) return "revisions";
  if (p.includes("class-wp-post-type.php") || p.includes("class-wp-post-status.php") || p.includes("post-formats.php")) return "post_types_statuses_formats";
  if (p.includes("class-wp-post.php") || p.endsWith("wp-includes/post.php")) return "post_model_crud";
  if (p.startsWith("wp-admin/")) return "admin_post_screens";
  if (p.includes("blocks/") || p.includes("block-bindings/") || p.includes("block-patterns/")) return "block_post_query_bridges";
  if (p.includes("rest-api/")) return "rest_post_bridges";
  if (p.includes("sitemaps/") || p.includes("widgets/")) return "presentation_bridges";
  return "posts_query_related";
}

function isC1Source(entry) {
  return entry.baseline === "wordpress-7.0.0" && entry.language === "php" && entry.kind === "runtime_source" && ownerForPath(entry.path) === "WPHX-307";
}

function isC1Artifact(entry) {
  return entry.baseline === "wordpress-7.0.0-distribution" && entry.language === "php" && ownerForPath(entry.path) === "WPHX-307";
}

function summarizeByGroup(entries) {
  const groups = {};
  for (const entry of entries) {
    const group = groupForPath(entry.path);
    groups[group] ??= { count: 0, paths: [] };
    groups[group].count++;
    groups[group].paths.push(entry.path);
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}

function symbolSummary(entries) {
  const byGroup = {};
  for (const entry of entries) {
    const group = groupForPath(entry.path);
    byGroup[group] ??= { count: 0, functions: [], classes: [], methods: [], properties: [] };
    byGroup[group].count++;
    if (entry.kind === "function" && byGroup[group].functions.length < 100) byGroup[group].functions.push(entry.name);
    if (entry.kind === "class" && byGroup[group].classes.length < 40) byGroup[group].classes.push(entry.name);
    if (entry.kind === "method" && byGroup[group].methods.length < 100) byGroup[group].methods.push(entry.qualified_name ?? entry.name);
    if (entry.kind === "property" && byGroup[group].properties.length < 80) byGroup[group].properties.push(entry.qualified_name ?? entry.name);
  }
  return Object.fromEntries(Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)));
}

function testMatches(path) {
  const p = path.toLowerCase();
  return (
    p.includes("/post") ||
    p.includes("/query") ||
    p.includes("/meta") ||
    p.includes("/revision") ||
    p.includes("posttype") ||
    p.includes("post-status") ||
    p.includes("post_status") ||
    p.includes("wpquery") ||
    p.includes("wp-query")
  );
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-307-posts-query-surface`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const source = readJsonl(SOURCE).filter(isC1Source);
const artifacts = readJsonl(ARTIFACTS).filter(isC1Artifact);
const tests = readJsonl(TESTS).filter((entry) => entry.baseline === "wordpress-7.0.0" && testMatches(entry.path));
const abi = readJson(ABI);
const sourcePaths = new Set(source.map((entry) => entry.path));
const abiEntries = abi.entries.filter((entry) => sourcePaths.has(entry.path));
const functionsWithReferences = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.by_reference));
const methodsWithReferences = abiEntries.filter((entry) => entry.kind === "method" && entry.parameters?.some((parameter) => parameter.by_reference));
const variadicFunctions = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.variadic));
const classes = abiEntries.filter((entry) => entry.kind === "class").map((entry) => entry.qualified_name ?? entry.name).sort();

const manifest = {
  schema: "wphx.wp-core-posts-query-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-posts-query-surface.mjs",
  inputs: {
    source_inventory: inputRecord(SOURCE),
    artifact_provenance: inputRecord(ARTIFACTS),
    test_inventory: inputRecord(TESTS),
    php_abi: inputRecord(ABI),
    first_party_closure: inputRecord(FIRST_PARTY_CLOSURE)
  },
  scope: {
    owner: "WPHX-307",
    included: "C1 WordPress 7.0 PHP source and distribution artifacts classified to posts, post metadata, revisions, statuses, post type APIs, and WP_Query by the WPHX-322 owner rules.",
    cross_domain_notes: [
      {
        owner: "WPHX-314",
        reason: "Post and query block render files are classified here by current WPHX-322 path precedence, but block package/render behavior still needs WPHX-314 coordination."
      },
      {
        owner: "WPHX-311",
        reason: "REST posts, revisions, post-statuses, post-types, and post-meta controllers remain REST transport/domain work even when they exercise post semantics."
      },
      {
        owner: "WPHX-316",
        reason: "Admin post screens and AJAX flows depend on posts but should not be treated as final admin parity evidence."
      },
      {
        owner: "WPHX-308",
        reason: "Taxonomy, term, comment, and cross-object meta behavior require later domain fixtures."
      },
      {
        owner: "WPHX-304/WPHX-305",
        reason: "Post CRUD and WP_Query behavior depend on cache invalidation and wpdb SQL/result behavior that must remain separately evidenced."
      }
    ]
  },
  coverage: {
    source_count: source.length,
    artifact_count: artifacts.length,
    abi_entry_count: abiEntries.length,
    class_count: classes.length,
    test_count: tests.length,
    source_by_group: summarizeByGroup(source),
    artifact_by_group: summarizeByGroup(artifacts),
    abi_by_group: symbolSummary(abiEntries),
    classes,
    abi_risks: {
      functions_with_reference_parameters: functionsWithReferences.map((entry) => entry.qualified_name ?? entry.name),
      methods_with_reference_parameters: methodsWithReferences.map((entry) => entry.qualified_name ?? entry.name),
      variadic_functions: variadicFunctions.map((entry) => entry.qualified_name ?? entry.name)
    },
    test_paths: tests.map((entry) => entry.path).sort()
  },
  evidence_plan: {
    first_haxe_candidate: "A typed posts/query adapter-contract model for query-var normalization, post state transitions, metadata routing, and cache-invalidation intent.",
    required_next_fixtures: [
      "post CRUD and status transition oracle fixture",
      "post metadata add/update/delete/cache invalidation oracle fixture",
      "revision/autosave oracle fixture",
      "WP_Query parse/query-state/loop runtime ABI fixture",
      "post type and post status registration fixture",
      "live database WP_Query SQL/result parity fixture",
      "selected upstream PHPUnit posts/query/meta/revisions ratchet"
    ],
    claim:
      "This surface manifest bounds WPHX-307 and names fixture gates. It does not claim public PHP replacement, Haxe-owned runtime logic, live database parity, or installed-distribution post/query parity."
  },
  validation_result: {
    status: "passed",
    source_count: source.length,
    artifact_count: artifacts.length,
    abi_entry_count: abiEntries.length,
    class_count: classes.length,
    test_count: tests.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-307-01-posts-query-surface",
  issue: { ...ISSUE, title: "Inventory posts/query/revisions/metadata surface" },
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "posts/query/revisions/metadata surface inventory" },
    { path: "tools/wp-core/run-posts-query-surface.mjs", role: "deterministic surface generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-307-posts-query-surface",
    "npm run wp:core:wphx-307-posts-query-surface:check"
  ],
  validation_result: manifest.validation_result,
  manifest_sha256: sha256(manifestText)
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(manifest.validation_result, null, 2));
