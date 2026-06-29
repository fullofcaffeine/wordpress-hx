#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-1ky",
  external_ref: "WPHX-314.01",
  title: "WPHX-314.01 - Inventory blocks, block parser, render, supports, bindings, and interactivity PHP surface"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const SOURCE = "manifests/source-inventory.jsonl";
const ARTIFACTS = "manifests/artifact-provenance.jsonl";
const TESTS = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const FIRST_PARTY_CLOSURE = "manifests/wp-core/wphx-322-php-first-party-manifest-closure.v1.json";
const OUT = "manifests/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-314-01-blocks-interactivity-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json";
const RUNNER = "tools/wp-core/run-blocks-interactivity-surface.mjs";

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

function isMultisitePath(path) {
  const p = stripSrc(path).toLowerCase();
  return (
    p.startsWith("wp-admin/network/") ||
    p.startsWith("wp-admin/includes/network.php") ||
    p.startsWith("wp-admin/includes/ms") ||
    p.startsWith("wp-includes/ms-") ||
    p.includes("multisite") ||
    p.includes("signup") ||
    (p.includes("site-health") && p.includes("multisite"))
  );
}

function isMediaPath(path) {
  const p = stripSrc(path).toLowerCase();
  return (
    p.includes("media") ||
    p.includes("image") ||
    p.includes("upload") ||
    p.includes("filesystem") ||
    p.includes("mime") ||
    p.includes("attachment") ||
    p.includes("post-thumbnail") ||
    p.endsWith("/file.php") ||
    p === "wp-admin/includes/file.php" ||
    p.includes("class-wp-filesystem")
  );
}

function isBlockPath(path) {
  const p = stripSrc(path).toLowerCase();
  return (
    p.includes("block") ||
    p.includes("interactivity") ||
    p.includes("style-engine") ||
    p.includes("html-api") ||
    p.includes("font") ||
    p.includes("assets")
  );
}

function ownerForPath(path) {
  const p = stripSrc(path).toLowerCase();
  if (isVendorPhpPath(p)) return "WPHX-323";
  if (p.startsWith("wp-content/themes/")) return "WPHX-320";
  if (p.startsWith("wp-content/plugins/")) return "WPHX-318";
  if (p.includes("wpdb") || p.includes("db.php") || p.includes("dbdelta")) return "WPHX-305";
  if (isMultisitePath(p)) return "WPHX-317";
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
  if (
    p.includes("theme") ||
    p.includes("customize") ||
    p.includes("template") ||
    p.includes("theme-compat") ||
    p.includes("class-wp-theme") ||
    p.includes("global-styles") ||
    p.includes("script-modules")
  ) {
    return "WPHX-310";
  }
  if (
    p.includes("http") ||
    p.includes("requests") ||
    p.includes("cron") ||
    p.includes("mail") ||
    p.includes("feed") ||
    p.includes("embed") ||
    p.includes("oembed") ||
    p.includes("wp-cron.php") ||
    p.includes("wp-mail.php") ||
    p.includes("wp-links-opml.php") ||
    p.includes("wp-trackback.php")
  ) {
    return "WPHX-312";
  }
  if (isMediaPath(p)) return "WPHX-313";
  if (isBlockPath(p)) return "WPHX-314";
  if (p.startsWith("wp-admin/includes/class-wp-list-table") || p.includes("list-table") || p.includes("screen") || p.includes("menu") || p.includes("admin-header") || p.includes("admin-footer")) return "WPHX-315";
  if (p.startsWith("wp-admin/")) {
    if (p.includes("update") || p.includes("install") || p.includes("upgrader") || p.includes("maintenance") || p.includes("recovery")) return "WPHX-319";
    if (isMediaPath(p)) return "WPHX-313";
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
  if (p.includes("interactivity")) return "interactivity_api";
  if (p.includes("block-bindings")) return "block_bindings";
  if (p.includes("block-hooks")) return "block_hooks";
  if (p.includes("block-pattern")) return "block_patterns";
  if (p.includes("block-supports") || p.includes("class-wp-block-supports")) return "block_supports";
  if (p.includes("class-wp-block-parser")) return "block_parser";
  if (p.includes("class-wp-block-type") || p.includes("class-wp-block.php") || p.includes("blocks.php")) return "block_registration_render";
  if (p.startsWith("wp-includes/blocks/") || p.includes("/blocks/")) return "core_block_library";
  if (p.includes("style-engine")) return "style_engine";
  if (p.includes("html-api")) return "html_api";
  if (p.includes("font")) return "fonts_api";
  if (p.includes("assets")) return "block_assets";
  if (p.includes("block")) return "block_related";
  return "blocks_interactivity_related";
}

function isC1Source(entry) {
  return entry.baseline === "wordpress-7.0.0" && entry.language === "php" && entry.kind === "runtime_source" && ownerForPath(entry.path) === "WPHX-314";
}

function isC1Artifact(entry) {
  return entry.baseline === "wordpress-7.0.0-distribution" && entry.language === "php" && ownerForPath(entry.path) === "WPHX-314";
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
    if (entry.kind === "function" && byGroup[group].functions.length < 200) byGroup[group].functions.push(entry.name);
    if (entry.kind === "class" && byGroup[group].classes.length < 100) byGroup[group].classes.push(entry.name);
    if (entry.kind === "method" && byGroup[group].methods.length < 220) byGroup[group].methods.push(entry.qualified_name ?? entry.name);
    if (entry.kind === "property" && byGroup[group].properties.length < 160) byGroup[group].properties.push(entry.qualified_name ?? entry.name);
  }
  return Object.fromEntries(Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)));
}

function testMatches(path) {
  const p = path.toLowerCase();
  return (
    p.includes("/blocks") ||
    p.includes("/block-") ||
    p.includes("/block_") ||
    p.includes("/block ") ||
    p.includes("blockhooks") ||
    p.includes("block_hooks") ||
    p.includes("blockbindings") ||
    p.includes("block_bindings") ||
    p.includes("interactivity") ||
    p.includes("style-engine") ||
    p.includes("html-api") ||
    p.includes("font") ||
    p.includes("theme-json") ||
    p.includes("global-styles")
  );
}

function semanticKeywordPath(path) {
  const p = stripSrc(path).toLowerCase();
  return isBlockPath(p) || p.includes("global-styles") || p.includes("template");
}

function handoffReason(owner) {
  if (owner === "WPHX-307") return "Query, post, navigation, and content blocks read posts or metadata; WPHX-314 owns block semantics without taking broad post/query ownership.";
  if (owner === "WPHX-308") return "Term and comment blocks exercise taxonomy/comment primitives that remain owned by WPHX-308.";
  if (owner === "WPHX-310") return "Block templates, theme.json, global styles, and template hierarchy remain theme/template ownership while block rendering must coordinate with them.";
  if (owner === "WPHX-311") return "REST block endpoints and editor settings need REST schema/transport evidence before installed API claims.";
  if (owner === "WPHX-312") return "RSS/embed/feed blocks use HTTP/feed/embed behavior that remains WPHX-312 ownership beneath block renderers.";
  if (owner === "WPHX-313") return "Image, gallery, cover, file, and media-text blocks depend on media/attachment contracts owned by WPHX-313.";
  if (owner === "WPHX-315" || owner === "WPHX-316") return "Editor/admin screens and AJAX flows expose block behavior but need later admin and browser evidence.";
  if (owner === "WPHX-400") return "Browser/editor package behavior belongs to the genes-ts/Gutenberg platform track, not the PHP block runtime slice.";
  return "Current owner rules assign this path to another domain; WPHX-314 must coordinate behavior without changing ownership here.";
}

function handoffCandidates(entries) {
  return entries
    .filter((entry) => semanticKeywordPath(entry.path) && ownerForPath(entry.path) !== "WPHX-314")
    .map((entry) => ({
      path: entry.path,
      owner: ownerForPath(entry.path),
      reason: handoffReason(ownerForPath(entry.path))
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 160);
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-314-blocks-interactivity-surface`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const allSource = readJsonl(SOURCE).filter((entry) => entry.baseline === "wordpress-7.0.0" && entry.language === "php" && entry.kind === "runtime_source");
const source = allSource.filter(isC1Source);
const artifacts = readJsonl(ARTIFACTS).filter(isC1Artifact);
const tests = readJsonl(TESTS).filter((entry) => entry.baseline === "wordpress-7.0.0" && testMatches(entry.path));
const abi = readJson(ABI);
const sourcePaths = new Set(source.map((entry) => entry.path));
const abiEntries = abi.entries.filter((entry) => sourcePaths.has(entry.path));
const functionsWithReferences = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.by_reference));
const methodsWithReferences = abiEntries.filter((entry) => entry.kind === "method" && entry.parameters?.some((parameter) => parameter.by_reference));
const variadicFunctions = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.variadic));
const conditionalFunctions = abiEntries.filter((entry) => entry.kind === "function" && entry.declaration_timing !== "top_level");
const classEntries = abiEntries.filter((entry) => entry.kind === "class");
const namedClasses = classEntries.filter((entry) => !entry.flags?.anonymous).map((entry) => entry.qualified_name ?? entry.name).sort();
const anonymousClasses = classEntries
  .filter((entry) => entry.flags?.anonymous)
  .map((entry) => ({
    path: entry.path,
    location: entry.location,
    extends: entry.extends,
    implements: entry.implements ?? []
  }));

const manifest = {
  schema: "wphx.wp-core-blocks-interactivity-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  inputs: {
    source_inventory: inputRecord(SOURCE),
    artifact_provenance: inputRecord(ARTIFACTS),
    test_inventory: inputRecord(TESTS),
    php_abi: inputRecord(ABI),
    first_party_closure: inputRecord(FIRST_PARTY_CLOSURE)
  },
  scope: {
    owner: "WPHX-314",
    included:
      "C1 WordPress 7.0 PHP source and distribution artifacts classified to blocks, block parser, block registration/rendering, supports, bindings, block hooks, patterns, interactivity, style engine, HTML API, fonts, and block asset helpers by the WPHX-322 owner rules.",
    cross_domain_notes: [
      {
        owner: "WPHX-307/WPHX-308",
        reason:
          "Post, query, navigation, term, and comment blocks consume post/query/taxonomy/comment primitives without moving those storage/query domains into WPHX-314."
      },
      {
        owner: "WPHX-310",
        reason:
          "Block templates, template parts, theme.json, global styles, and template hierarchy remain theme/template gates that block rendering must coordinate with."
      },
      {
        owner: "WPHX-311",
        reason:
          "REST block endpoints, editor settings, and block directory/schema behavior need REST transport/schema evidence before installed API claims."
      },
      {
        owner: "WPHX-312/WPHX-313",
        reason:
          "RSS/embed/feed/media blocks exercise HTTP/feed/embed/media primitives that stay owned by their source domains beneath block renderer fixtures."
      },
      {
        owner: "WPHX-315/WPHX-316/WPHX-400",
        reason:
          "Admin/editor screens, AJAX, browser package exports, React behavior, and Gutenberg packages remain separate admin/browser tracks even when they expose block PHP behavior."
      }
    ],
    semantic_handoff_candidates: handoffCandidates(allSource)
  },
  coverage: {
    source_count: source.length,
    artifact_count: artifacts.length,
    abi_entry_count: abiEntries.length,
    class_count: classEntries.length,
    named_class_count: namedClasses.length,
    anonymous_class_count: anonymousClasses.length,
    test_count: tests.length,
    source_by_group: summarizeByGroup(source),
    artifact_by_group: summarizeByGroup(artifacts),
    abi_by_group: symbolSummary(abiEntries),
    classes: namedClasses,
    abi_risks: {
      functions_with_reference_parameters: functionsWithReferences.map((entry) => entry.qualified_name ?? entry.name),
      methods_with_reference_parameters: methodsWithReferences.map((entry) => entry.qualified_name ?? entry.name),
      variadic_functions: variadicFunctions.map((entry) => entry.qualified_name ?? entry.name),
      conditional_functions: conditionalFunctions.map((entry) => entry.qualified_name ?? entry.name),
      anonymous_classes: anonymousClasses
    },
    test_paths: tests.map((entry) => entry.path).sort()
  },
  evidence_plan: {
    first_haxe_candidate:
      "A typed blocks/interactivity adapter-contract model for parser state, parsed block trees, block type registration, render context, support serialization, binding resolution, block hooks insertion, style engine output, HTML tag processing, interactivity state, and hook intent.",
    required_next_fixtures: [
      "block parser and serialize/parse roundtrip oracle fixture",
      "block registration, render callback, context, and do_blocks oracle fixture",
      "block supports attributes/style/class serialization fixture",
      "block bindings source registration and resolution fixture",
      "block hooks insertion/ignored-hooked-blocks fixture",
      "block pattern/style registration and lookup fixture",
      "style engine and HTML API tag-processing fixture",
      "interactivity API state, directive processing, and hydration-data fixture",
      "selected core block renderer fixture spanning post/query/media/feed handoffs",
      "selected upstream PHPUnit blocks/style-engine/html-api/interactivity ratchet"
    ],
    claim:
      "This surface manifest bounds WPHX-314 and names fixture gates. It does not claim public PHP replacement, Haxe-owned runtime logic, editor/browser ownership, installed-distribution block parity, or Gutenberg package ownership."
  },
  validation_result: {
    status: "passed",
    source_count: source.length,
    artifact_count: artifacts.length,
    abi_entry_count: abiEntries.length,
    class_count: classEntries.length,
    test_count: tests.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const ownership = {
  schema: "wphx.ownership-manifest.v1",
  manifest_id: "ownership:wp-core/blocks-interactivity-surface",
  issue: {
    id: ISSUE.id,
    external_ref: ISSUE.external_ref
  },
  unit: {
    kind: "surface_inventory",
    name: "blocks, block parser, block rendering, supports, bindings, hooks, style engine, HTML API, fonts, assets, and interactivity surface",
    area: "wp-includes/blocks.php wp-includes/blocks/ wp-includes/class-wp-block*.php wp-includes/block-*.php wp-includes/interactivity-api/ wp-includes/style-engine/ wp-includes/html-api/",
    public_contract:
      "This slice inventories WordPress block/interactivity runtime boundaries and fixture targets. It does not claim migrated runtime behavior, editor/browser ownership, or public PHP ABI replacement."
  },
  ownership_state: "oracle_surface_inventory",
  ownership_axes: {
    semantic_owner: "upstream_oracle_described",
    adapter_contract_owner: "not_yet_started",
    emission_strategy: "none",
    execution_provider: "upstream_php_oracle",
    compatibility_evidence: "surface_inventory"
  },
  bridge: {
    exists: false,
    kind: "not_applicable",
    removal_gate:
      "Promote bounded block/interactivity decisions to typed Haxe adapter contracts, then later to typed Adapter IR/original-path PHP with parser/render/support/bindings/style/interactivity, installed distribution, upstream PHPUnit, and browser/Gutenberg handoff evidence."
  },
  owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
  generated_paths: [OUT, OWNERSHIP, RECEIPT],
  verification: {
    oracle_commands: [
      "npm run wp:core:wphx-314-blocks-interactivity-surface",
      "npm run wp:core:wphx-314-blocks-interactivity-surface:check",
      "npm run receipts:validate"
    ],
    receipt_refs: ["receipt:wphx-314-01-blocks-interactivity-surface"],
    manifest_digest: sha256(manifestText)
  }
};
const ownershipText = JSON.stringify(ownership, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-314-01-blocks-interactivity-surface",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "blocks/interactivity surface inventory" },
    { path: OWNERSHIP, role: "blocks/interactivity surface ownership manifest" },
    { path: RUNNER, role: "deterministic surface generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-314-blocks-interactivity-surface",
    "npm run wp:core:wphx-314-blocks-interactivity-surface:check"
  ],
  validation_result: manifest.validation_result,
  manifest_sha256: sha256(manifestText),
  ownership_sha256: sha256(ownershipText)
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

console.log(JSON.stringify(manifest.validation_result, null, 2));
