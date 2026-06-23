#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.12",
  external_ref: "WPHX-322",
  title: "PHP first-party manifest closure"
};
const RECORDED_AT = "2026-06-23T07:10:00.000Z";
const SOURCE = "manifests/source-inventory.jsonl";
const ARTIFACTS = "manifests/artifact-provenance.jsonl";
const INVENTORY_SUMMARY = "manifests/inventory-summary.v1.json";
const EVIDENCE_LINKS = "manifests/receipts/evidence-links.v1.json";
const OUT = "manifests/wp-core/wphx-322-php-first-party-manifest-closure.v1.json";
const RECEIPT = "receipts/wp-core/wphx-322-php-first-party-manifest-closure.v1.json";

const OWNER_ISSUES = {
  "WPHX-301": { bead: "wordpresshx-l76.1", status: "closed", domain: "Bootstrap, load order, constants, environment" },
  "WPHX-302": { bead: "wordpresshx-l76.6", status: "closed", domain: "Hooks/plugin API" },
  "WPHX-303": { bead: "wordpresshx-l76.7", status: "closed", domain: "Error, deprecation, formatting, escaping, KSES" },
  "WPHX-304": { bead: "wordpresshx-l76.8", status: "closed", domain: "Options, transients, object cache" },
  "WPHX-305": { bead: "wordpresshx-l76.9", status: "closed", domain: "wpdb and database abstraction" },
  "WPHX-306": { bead: "wordpresshx-l76.13", status: "open_follow_up", domain: "Users, roles, capabilities, auth, cookies, nonces" },
  "WPHX-307": { bead: "wordpresshx-l76.14", status: "open_follow_up", domain: "Posts, metadata, revisions, WP_Query" },
  "WPHX-308": { bead: "wordpresshx-l76.15", status: "open_follow_up", domain: "Taxonomy, terms, comments" },
  "WPHX-309": { bead: "wordpresshx-l76.16", status: "open_follow_up", domain: "Rewrite, routing, canonical URLs, templates" },
  "WPHX-310": { bead: "wordpresshx-l76.17", status: "open_follow_up", domain: "Themes, theme JSON, template hierarchy" },
  "WPHX-311": { bead: "wordpresshx-l76.10", status: "closed", domain: "REST API and schema" },
  "WPHX-312": { bead: "wordpresshx-l76.18", status: "open_follow_up", domain: "HTTP, cron, mail, feeds, embeds" },
  "WPHX-313": { bead: "wordpresshx-l76.19", status: "open_follow_up", domain: "Media, images, filesystem, uploads" },
  "WPHX-314": { bead: "wordpresshx-l76.20", status: "open_follow_up", domain: "Blocks, block parser, render, supports, bindings, interactivity PHP" },
  "WPHX-315": { bead: "wordpresshx-l76.21", status: "open_follow_up", domain: "Admin common and list tables" },
  "WPHX-316": { bead: "wordpresshx-l76.22", status: "open_follow_up", domain: "Admin feature screens and AJAX" },
  "WPHX-317": { bead: "wordpresshx-l76.11", status: "closed", domain: "Multisite and network" },
  "WPHX-318": { bead: "wordpresshx-l76.23", status: "open_follow_up", domain: "XML-RPC, legacy, deprecated APIs" },
  "WPHX-319": { bead: "wordpresshx-l76.24", status: "open_follow_up", domain: "Updates, installers, upgrader, recovery mode" },
  "WPHX-320": { bead: "wordpresshx-l76.25", status: "open_follow_up", domain: "Default theme PHP" },
  "WPHX-323": { bead: "wordpresshx-l76.26", status: "open_follow_up", domain: "PHP vendor manifest closure" }
};

const CLOSED_RECEIPTS = {
  "WPHX-301": ["receipt:wphx-301-bootstrap-traces"],
  "WPHX-302": ["receipt:wphx-302-hook-surface"],
  "WPHX-303": ["receipt:wphx-303-domain-closure"],
  "WPHX-304": ["receipt:wphx-304-domain-closure"],
  "WPHX-305": ["receipt:wphx-305-domain-closure"],
  "WPHX-311": ["receipt:wphx-311-domain-closure"],
  "WPHX-317": ["receipt:wphx-317-domain-closure"]
};

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

function isC1Source(entry) {
  if (entry.baseline !== "wordpress-7.0.0" || entry.language !== "php" || entry.kind !== "runtime_source") return false;
  if (entry.path.startsWith("tests/") || entry.path.startsWith("tools/")) return false;
  if (isVendorPhpPath(entry.path)) return false;
  return true;
}

function isC3VendorSource(entry) {
  return entry.baseline === "wordpress-7.0.0" && entry.language === "php" && (entry.kind === "vendor_source" || isVendorPhpPath(entry.path));
}

function isC1Artifact(entry) {
  return entry.baseline === "wordpress-7.0.0-distribution" && entry.language === "php" && !isVendorPhpPath(entry.path);
}

function isC3VendorArtifact(entry) {
  return entry.baseline === "wordpress-7.0.0-distribution" && entry.language === "php" && isVendorPhpPath(entry.path);
}

function ownerForPath(path) {
  const p = stripSrc(path).toLowerCase();
  if (isVendorPhpPath(p)) return "WPHX-323";
  if (p.startsWith("wp-content/themes/")) return "WPHX-320";
  if (p.startsWith("wp-content/plugins/")) return "WPHX-318";
  if (p.includes("wpdb") || p.includes("db.php") || p.includes("dbdelta")) return "WPHX-305";
  if (p.includes("ms-") || p.includes("multisite") || p.includes("signup") || p.includes("site-health") && p.includes("multisite")) return "WPHX-317";
  if (p.includes("rest-api") || p.includes("class-wp-rest") || p.includes("rest-")) return "WPHX-311";
  if (p.includes("user") || p.includes("capabilities") || p.includes("session-token") || p.includes("pluggable") || p.includes("auth") || p.includes("application-password") || p.includes("wp-login.php") || p.includes("wp-activate.php")) return "WPHX-306";
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

function classify(entries, predicate, kind) {
  return entries.filter(predicate).map((entry) => ({
    id: entry.id,
    path: entry.path,
    area: entry.area,
    owner: ownerForPath(entry.path),
    kind
  }));
}

function summarize(assignments) {
  const byOwner = {};
  const byArea = {};
  for (const entry of assignments) {
    byOwner[entry.owner] ??= { count: 0, areas: {}, samples: [] };
    byOwner[entry.owner].count++;
    byOwner[entry.owner].areas[entry.area] = (byOwner[entry.owner].areas[entry.area] ?? 0) + 1;
    if (byOwner[entry.owner].samples.length < 10) byOwner[entry.owner].samples.push(entry.path);
    byArea[entry.area] = (byArea[entry.area] ?? 0) + 1;
  }
  return { byOwner, byArea };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-322-php-first-party-closure`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const source = readJsonl(SOURCE);
const artifacts = readJsonl(ARTIFACTS);
const summary = readJson(INVENTORY_SUMMARY);
const evidence = readJson(EVIDENCE_LINKS);
const linkedRefs = new Set(evidence.entries.map((entry) => entry.external_ref));

const sourceAssignments = classify(source, isC1Source, "source");
const artifactAssignments = classify(artifacts, isC1Artifact, "artifact");
const vendorSources = source.filter(isC3VendorSource);
const vendorArtifacts = artifacts.filter(isC3VendorArtifact);
const allAssignments = [...sourceAssignments, ...artifactAssignments];
const unassigned = allAssignments.filter((entry) => !OWNER_ISSUES[entry.owner]);
const closedOwnerRefs = Object.entries(OWNER_ISSUES).filter(([, issue]) => issue.status === "closed").map(([ref]) => ref);
const missingClosedLinks = closedOwnerRefs.filter((ref) => !linkedRefs.has(ref));

if (unassigned.length > 0 || missingClosedLinks.length > 0) {
  console.error(JSON.stringify({ status: "failed", unassigned: unassigned.slice(0, 20), missingClosedLinks }, null, 2));
  process.exit(1);
}

const sourceSummary = summarize(sourceAssignments);
const artifactSummary = summarize(artifactAssignments);
const ownerCoverage = Object.fromEntries(
  Object.entries(OWNER_ISSUES).map(([ref, issue]) => [
    ref,
    {
      ...issue,
      source_count: sourceSummary.byOwner[ref]?.count ?? 0,
      artifact_count: artifactSummary.byOwner[ref]?.count ?? 0,
      receipt_refs: CLOSED_RECEIPTS[ref] ?? []
    }
  ])
);

const manifest = {
  schema: "wphx.wp-core-php-first-party-manifest-closure.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-php-first-party-manifest-closure.mjs",
  inputs: {
    source_inventory: inputRecord(SOURCE),
    artifact_provenance: inputRecord(ARTIFACTS),
    inventory_summary: inputRecord(INVENTORY_SUMMARY),
    evidence_links: inputRecord(EVIDENCE_LINKS)
  },
  scope: {
    included: {
      source: "wordpress-7.0.0 PHP runtime_source entries, excluding tests, tooling, and vendor-owned paths",
      artifacts: "wordpress-7.0.0-distribution PHP shipped artifacts, excluding vendor-owned paths"
    },
    excluded_to_follow_up: {
      php_vendor_owner: "WPHX-323",
      vendor_source_count: vendorSources.length,
      vendor_artifact_count: vendorArtifacts.length,
      vendor_path_samples: [...vendorSources, ...vendorArtifacts].slice(0, 20).map((entry) => entry.path)
    }
  },
  coverage: {
    c1_source_count: sourceAssignments.length,
    c1_artifact_count: artifactAssignments.length,
    assigned_count: allAssignments.length,
    unassigned_count: unassigned.length,
    source_by_owner: sourceSummary.byOwner,
    artifact_by_owner: artifactSummary.byOwner,
    source_by_area: sourceSummary.byArea,
    artifact_by_area: artifactSummary.byArea,
    owner_coverage: ownerCoverage
  },
  closure_policy: {
    closed_receipt_backed_domains: closedOwnerRefs,
    open_split_follow_ups: Object.entries(OWNER_ISSUES).filter(([, issue]) => issue.status !== "closed").map(([ref, issue]) => ({ external_ref: ref, bead: issue.bead, domain: issue.domain })),
    claim: "Every C1 WordPress 7.0 PHP runtime source and distribution artifact in the current inventory is assigned to a closed receipt-backed domain or an explicit follow-up owner. This is manifest closure, not a claim that every assigned domain is Haxe-owned or installed-distribution complete."
  },
  validation_result: {
    status: "passed",
    inventory_closure: summary.closure,
    c1_source_count: sourceAssignments.length,
    c1_artifact_count: artifactAssignments.length,
    unassigned_count: unassigned.length,
    missing_closed_evidence_links: missingClosedLinks.length,
    vendor_follow_up: "WPHX-323"
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-322-php-first-party-manifest-closure",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WordPress 7.0 PHP first-party source/artifact closure and split manifest"
    },
    {
      path: "tools/wp-core/run-php-first-party-manifest-closure.mjs",
      role: "deterministic closure generator and check-mode validator"
    },
    {
      path: SOURCE,
      role: "source inventory input"
    },
    {
      path: ARTIFACTS,
      role: "distribution artifact provenance input"
    }
  ],
  verification_commands: [
    "npm run inventory:check",
    "npm run wp:core:wphx-322-php-first-party-closure",
    "npm run wp:core:wphx-322-php-first-party-closure:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  validation_result: manifest.validation_result
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
