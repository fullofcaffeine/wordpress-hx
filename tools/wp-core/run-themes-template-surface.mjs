#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.17.1",
  external_ref: "WPHX-310.01",
  title: "WPHX-310.01 — Inventory themes/theme JSON/template hierarchy surface"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const SOURCE = "manifests/source-inventory.jsonl";
const ARTIFACTS = "manifests/artifact-provenance.jsonl";
const TESTS = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const FIRST_PARTY_CLOSURE = "manifests/wp-core/wphx-322-php-first-party-manifest-closure.v1.json";
const OUT = "manifests/wp-core/wphx-310-01-themes-template-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-310-01-themes-template-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-310-01-themes-template-surface.v1.json";
const RUNNER = "tools/wp-core/run-themes-template-surface.mjs";

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
    p.includes("theme-json") ||
    p.includes("duotone") ||
    p.includes("nav-menu") ||
    p.includes("widget") ||
    p.includes("script-modules")
  ) {
    return "WPHX-310";
  }
  if (p.includes("http") || p.includes("requests") || p.includes("cron") || p.includes("mail") || p.includes("feed") || p.includes("embed") || p.includes("oembed") || p.includes("wp-cron.php") || p.includes("wp-mail.php") || p.includes("wp-links-opml.php") || p.includes("wp-trackback.php")) return "WPHX-312";
  if (p.includes("media") || p.includes("image") || p.includes("upload") || p.includes("filesystem") || p.includes("file.php") || p.includes("class-wp-filesystem") || p.includes("wp-content/index.php")) return "WPHX-313";
  if (p.includes("block") || p.includes("interactivity") || p.includes("style-engine") || p.includes("html-api") || p.includes("fonts") || p.includes("assets")) return "WPHX-314";
  if (p.startsWith("wp-admin/includes/class-wp-list-table") || p.includes("list-table") || p.includes("screen") || p.includes("menu") || p.includes("admin-header") || p.includes("admin-footer")) return "WPHX-315";
  if (p.startsWith("wp-admin/")) {
    if (p.includes("update") || p.includes("install") || p.includes("upgrader") || p.includes("maintenance") || p.includes("recovery")) return "WPHX-319";
    if (p.includes("media") || p.includes("upload")) return "WPHX-313";
    if (p.includes("theme") || p.includes("customize") || p.includes("widget") || p.includes("nav-menu")) return "WPHX-310";
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
  if (p.includes("class-wp-theme-json") || p.includes("theme.json") || p.includes("global-styles")) return "theme_json_global_styles";
  if (p.includes("class-wp-theme.php") || p.endsWith("theme.php") || p.includes("theme-previews") || p.includes("theme-i18n")) return "theme_model_supports";
  if (p.includes("customize")) return "customizer";
  if (p.includes("nav-menu")) return "nav_menus";
  if (p.includes("widget") || p.includes("sidebar")) return "widgets_sidebars";
  if (p.includes("block-template") || p.includes("theme-templates") || p.includes("template-canvas") || p.includes("template-part")) return "block_theme_templates";
  if (p.includes("theme-compat")) return "theme_compat";
  if (p.startsWith("wp-admin/")) return "admin_theme_screens";
  if (p.includes("duotone")) return "duotone";
  if (p.includes("script-modules")) return "script_modules";
  return "theme_template_related";
}

function isC1Source(entry) {
  return entry.baseline === "wordpress-7.0.0" && entry.language === "php" && entry.kind === "runtime_source" && ownerForPath(entry.path) === "WPHX-310";
}

function isC1Artifact(entry) {
  return entry.baseline === "wordpress-7.0.0-distribution" && entry.language === "php" && ownerForPath(entry.path) === "WPHX-310";
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
    if (entry.kind === "function" && byGroup[group].functions.length < 140) byGroup[group].functions.push(entry.name);
    if (entry.kind === "class" && byGroup[group].classes.length < 80) byGroup[group].classes.push(entry.name);
    if (entry.kind === "method" && byGroup[group].methods.length < 160) byGroup[group].methods.push(entry.qualified_name ?? entry.name);
    if (entry.kind === "property" && byGroup[group].properties.length < 100) byGroup[group].properties.push(entry.qualified_name ?? entry.name);
  }
  return Object.fromEntries(Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)));
}

function testMatches(path) {
  const p = path.toLowerCase();
  return (
    p.includes("/theme") ||
    p.includes("/template") ||
    p.includes("/customize") ||
    p.includes("/widgets") ||
    p.includes("/widget") ||
    p.includes("/nav-menu") ||
    p.includes("/menus") ||
    p.includes("themejson") ||
    p.includes("theme-json") ||
    p.includes("global-styles") ||
    p.includes("duotone") ||
    p.includes("block-template")
  );
}

function semanticKeywordPath(path) {
  const p = stripSrc(path).toLowerCase();
  return (
    p.includes("theme") ||
    p.includes("template") ||
    p.includes("customize") ||
    p.includes("widget") ||
    p.includes("nav-menu") ||
    p.includes("global-styles") ||
    p.includes("duotone")
  );
}

function handoffCandidates(entries) {
  return entries
    .filter((entry) => semanticKeywordPath(entry.path) && ownerForPath(entry.path) !== "WPHX-310")
    .map((entry) => {
      const owner = ownerForPath(entry.path);
      return {
        path: entry.path,
        owner,
        reason:
          owner === "WPHX-309"
            ? "Template-loader and routing decide which theme/template surfaces are reached, but request routing remains WPHX-309 evidence."
            : owner === "WPHX-314"
              ? "Block rendering, supports, style engine, and font internals are block-domain behavior that consume theme.json/theme state."
              : owner === "WPHX-320"
                ? "Default bundled theme PHP is release/theme-package content, not core theme API implementation."
                : owner === "WPHX-315" || owner === "WPHX-316"
                  ? "Admin screens expose theme/customizer state but remain admin-domain implementation."
                  : "Current owner rules assign this path to another domain; WPHX-310 must coordinate observable behavior without changing ownership here."
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 140);
}

function closureSnapshot(closure) {
  const source = closure.coverage?.source_by_owner?.["WPHX-310"] ?? null;
  const artifacts = closure.coverage?.artifact_by_owner?.["WPHX-310"] ?? null;
  return {
    source_count: source?.count ?? null,
    artifact_count: artifacts?.count ?? null,
    source_samples: source?.samples ?? [],
    artifact_samples: artifacts?.samples ?? []
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-310-themes-template-surface`);
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
const closure = readJson(FIRST_PARTY_CLOSURE);
const sourcePaths = new Set(source.map((entry) => entry.path));
const abiEntries = abi.entries.filter((entry) => sourcePaths.has(entry.path));
const functionsWithReferences = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.by_reference));
const methodsWithReferences = abiEntries.filter((entry) => entry.kind === "method" && entry.parameters?.some((parameter) => parameter.by_reference));
const variadicFunctions = abiEntries.filter((entry) => entry.kind === "function" && entry.parameters?.some((parameter) => parameter.variadic));
const variadicMethods = abiEntries.filter((entry) => entry.kind === "method" && entry.parameters?.some((parameter) => parameter.variadic));

const manifest = {
  schema: "wphx.wp-core-themes-template-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  inputs: {
    runner: inputRecord(RUNNER),
    source_inventory: inputRecord(SOURCE),
    artifact_inventory: inputRecord(ARTIFACTS),
    test_inventory: inputRecord(TESTS),
    abi_manifest: inputRecord(ABI),
    first_party_closure: inputRecord(FIRST_PARTY_CLOSURE)
  },
  scope: {
    source_files: {
      count: source.length,
      by_group: summarizeByGroup(source)
    },
    distribution_artifacts: {
      count: artifacts.length,
      by_group: summarizeByGroup(artifacts)
    },
    abi: {
      count: abiEntries.length,
      by_group: symbolSummary(abiEntries),
      functions_with_reference_parameters: functionsWithReferences.map((entry) => entry.name),
      methods_with_reference_parameters: methodsWithReferences.map((entry) => entry.qualified_name ?? entry.name),
      variadic_functions: variadicFunctions.map((entry) => entry.name),
      variadic_methods: variadicMethods.map((entry) => entry.qualified_name ?? entry.name)
    },
    upstream_tests: {
      count: tests.length,
      paths: tests.map((entry) => entry.path).sort()
    },
    first_party_closure: closureSnapshot(closure),
    cross_domain_handoffs: handoffCandidates(allSource)
  },
  coverage: {
    feature_groups: [
      "theme_model_supports",
      "theme_json_global_styles",
      "block_theme_templates",
      "customizer",
      "nav_menus",
      "widgets_sidebars",
      "theme_compat",
      "admin_theme_screens"
    ],
    expected_followup_gates: [
      "typed_haxe_theme_template_adapter_contract",
      "classic_theme_template_hierarchy_fixture",
      "theme_json_global_styles_fixture",
      "theme_supports_customizer_widget_fixture",
      "installed_theme_frontend_admin_gate",
      "selected_upstream_theme_template_phpunit_ratchets"
    ]
  },
  evidence_plan: {
    current_claim: "surface_inventory_only",
    behavior_parity_claimed: false,
    haxe_runtime_ownership_claimed: false,
    public_php_replacement_claimed: false,
    next: [
      "Add typed Haxe adapter-contract candidate for theme supports, theme.json, template selection, customizer/widget/nav-menu intent.",
      "Add deterministic fixtures for classic and block theme template hierarchy plus theme.json/global styles behavior.",
      "Add installed-style front-end/admin observations and selected upstream PHPUnit ratchets before domain closure."
    ]
  },
  validation_result: {
    status: "passed",
    source_files: source.length,
    distribution_artifacts: artifacts.length,
    abi_entries: abiEntries.length,
    upstream_tests: tests.length,
    behavior_parity_claimed: false
  }
};

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/themes-template-surface",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "source_surface_inventory",
      name: "themes, theme JSON, template hierarchy, customizer, widgets, nav menus",
      area: "wp-includes theme APIs, theme.json/global styles, template hierarchy, customizer, widgets/nav menus, theme admin surfaces",
      public_contract:
        "This inventory maps the WPHX-310 source, distribution, ABI, test, and handoff surface. It does not claim Haxe runtime ownership or generated public PHP replacement."
    },
    ownership_state: "inventory_only",
    ownership_axes: {
      semantic_owner: "upstream_wordpress_oracle",
      adapter_contract_owner: "not_claimed",
      emission_strategy: "not_claimed",
      execution_provider: "not_claimed",
      compatibility_evidence: "surface_inventory"
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      commands: [
        "npm run wp:core:wphx-310-themes-template-surface",
        "npm run wp:core:wphx-310-themes-template-surface:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-310-01-themes-template-surface"],
      manifest_digest: manifestSha
    }
  };
}

function receipt(manifestSha) {
  return {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-310-01-themes-template-surface",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref,
      title: ISSUE.title
    },
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "themes/theme-json/template hierarchy surface manifest" },
      { path: OWNERSHIP, role: "themes/template surface ownership manifest" },
      { path: RUNNER, role: "deterministic surface inventory generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-310-themes-template-surface",
      "npm run wp:core:wphx-310-themes-template-surface:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-322-php-first-party-manifest-closure",
      "receipt:wphx-309-domain-closure"
    ],
    manifest_sha256: manifestSha,
    validation_result: manifest.validation_result
  };
}

const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestSha = sha256(manifestContents);
writeOrCheck(OUT, manifestContents);
writeOrCheck(OWNERSHIP, `${JSON.stringify(ownershipManifest(manifestSha), null, 2)}\n`);
writeOrCheck(RECEIPT, `${JSON.stringify(receipt(manifestSha), null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      source_files: source.length,
      distribution_artifacts: artifacts.length,
      abi_entries: abiEntries.length,
      upstream_tests: tests.length
    },
    null,
    2
  )
);
