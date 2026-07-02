#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T23:55:00Z";
const ISSUE = {
  id: "wordpresshx-l76.18.45",
  external_ref: "WPHX-312.101",
  title: "Generate adapters for copied HTTP feed embed public surfaces"
};
const RUNNER = "tools/wp-core/run-wphx-312-generated-adapter-coverage.mjs";
const COPIED_PLAN = "manifests/wp-core/wphx-312-100-copied-surface-plan.v1.json";
const OUT = "manifests/wp-core/wphx-312-101-generated-adapter-coverage.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-101-generated-adapter-coverage.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-101-generated-adapter-coverage.v1.json";

const COVERAGE = [
  {
    source_ref: "WPHX-312.04",
    status: "compiler_pressure_blocked",
    blocker: {
      issue_id: "wordpresshx-a89x",
      external_ref: "WPHX-COMP-PHP-MODULE-FUNCTION-ADAPTERS",
      title: "Add module-function original-path adapters for feed embed HTTPS helpers"
    },
    pressure_kind: "module_function_and_mixed_class_original_path_adapters",
    covered_symbols: [
      "get_bloginfo_rss",
      "bloginfo_rss",
      "get_default_feed",
      "get_wp_title_rss",
      "get_the_title_rss",
      "get_the_content_feed",
      "prep_atom_text_construct",
      "get_self_link",
      "feed_content_type",
      "wp_embed_defaults",
      "wp_embed_register_handler",
      "WP_Embed::get_embed_handler_html",
      "WP_Embed::shortcode",
      "wp_oembed_add_provider",
      "WP_oEmbed::get_provider",
      "WP_oEmbed::data2html",
      "WP_oEmbed::_strip_newlines",
      "get_oembed_endpoint_url",
      "wp_oembed_ensure_format",
      "_oembed_create_xml",
      "wp_is_using_https",
      "wp_is_home_url_using_https",
      "wp_is_site_url_using_https",
      "wp_should_replace_insecure_home_url",
      "wp_replace_insecure_home_url",
      "wp_update_urls_to_https",
      "wp_update_https_migration_required",
      "wp_get_https_detection_errors",
      "wp_is_https_supported",
      "wp_is_local_html_output"
    ],
    blocker_reason:
      "The surface mixes module-level public functions, WP_Embed/WP_oEmbed methods, globals, hooks, output helpers, option mutation, and HTTPS detection boundaries across six original WordPress paths. It needs WPHX PHP module-function/class original-path adapter support instead of copied-oracle PHP."
  },
  {
    source_ref: "WPHX-312.38",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.52"],
    successor_manifests: ["manifests/wp-core/wphx-312-52-http-response-candidate.v1.json"],
    promoted_symbols: [
      "WP_HTTP_Response::__construct",
      "WP_HTTP_Response::get_data",
      "WP_HTTP_Response::set_data",
      "WP_HTTP_Response::get_headers",
      "WP_HTTP_Response::set_headers",
      "WP_HTTP_Response::header",
      "WP_HTTP_Response::get_status",
      "WP_HTTP_Response::set_status",
      "WP_HTTP_Response::jsonSerialize"
    ]
  },
  {
    source_ref: "WPHX-312.39",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.53"],
    successor_manifests: ["manifests/wp-core/wphx-312-53-http-cookie-candidate.v1.json"],
    promoted_symbols: [
      "WP_Http_Cookie::test",
      "WP_Http_Cookie::getHeaderValue",
      "WP_Http_Cookie::getFullHeader",
      "WP_Http_Cookie::get_attributes"
    ]
  },
  {
    source_ref: "WPHX-312.40",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.50"],
    successor_manifests: ["manifests/wp-core/wphx-312-50-http-encoding-candidate.v1.json"],
    promoted_symbols: [
      "WP_Http_Encoding::compress",
      "WP_Http_Encoding::decompress",
      "WP_Http_Encoding::compatible_gzinflate",
      "WP_Http_Encoding::content_encoding",
      "WP_Http_Encoding::should_decode",
      "WP_Http_Encoding::is_available"
    ]
  },
  {
    source_ref: "WPHX-312.41",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.55", "WPHX-312.56", "WPHX-312.57", "WPHX-312.58"],
    successor_manifests: [
      "manifests/wp-core/wphx-312-55-wp-http-ip-address-candidate.v1.json",
      "manifests/wp-core/wphx-312-56-wp-http-redirect-compatibility-candidate.v1.json",
      "manifests/wp-core/wphx-312-57-wp-http-redirect-validation-candidate.v1.json",
      "manifests/wp-core/wphx-312-58-wp-http-absolute-url-candidate.v1.json"
    ],
    promoted_symbols: [
      "WP_Http::is_ip_address",
      "WP_Http::browser_redirect_compatibility",
      "WP_Http::validate_redirects",
      "WP_Http::make_absolute_url"
    ]
  },
  {
    source_ref: "WPHX-312.42",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.60", "WPHX-312.61", "WPHX-312.62", "WPHX-312.63", "WPHX-312.64"],
    successor_manifests: [
      "manifests/wp-core/wphx-312-60-wp-http-process-response-candidate.v1.json",
      "manifests/wp-core/wphx-312-61-wp-http-chunk-transfer-decode-candidate.v1.json",
      "manifests/wp-core/wphx-312-62-wp-http-process-headers-candidate.v1.json",
      "manifests/wp-core/wphx-312-63-wp-http-cookie-header-assembly-candidate.v1.json",
      "manifests/wp-core/wphx-312-64-wp-http-deprecated-parse-url-candidate.v1.json"
    ],
    promoted_symbols: [
      "WP_Http::processResponse",
      "WP_Http::chunkTransferDecode",
      "WP_Http::processHeaders",
      "WP_Http::buildCookieHeader",
      "WP_Http::parse_url"
    ]
  },
  {
    source_ref: "WPHX-312.44",
    status: "covered_by_generated_successor",
    successor_refs: ["WPHX-312.64", "WPHX-COMP-PHP-WHOLE-FILE-PILOT"],
    successor_manifests: [
      "manifests/wp-core/wphx-312-64-wp-http-deprecated-parse-url-candidate.v1.json",
      "manifests/wphx-php/whole-file-class-http.v1.json"
    ],
    promoted_symbols: ["WP_Http::parse_url", "wp-includes/class-http.php deprecated shim whole-file emission"]
  }
];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function fileRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function assertGeneratedSuccessor(entry, failures) {
  for (const path of entry.successor_manifests ?? []) {
    if (!existsSync(path)) {
      failures.push(`${entry.source_ref} successor manifest is missing: ${path}`);
      continue;
    }
    const manifest = readJson(path);
    const candidate = manifest.candidate ?? {};
    const publicShell = candidate.compiler_emitted_public_shell ?? candidate.public_shell ?? candidate.compiler ?? null;
    const shellPolicy = candidate.public_shell_policy ?? candidate.public_shell?.shape ?? candidate.public_shell ?? {};
    const wholeFileOwned =
      manifest.validation_result?.whole_file_owned_segment_plan === true && manifest.validation_result?.unsupported_empty === true;
    const compilerEmitted =
      candidate.compiler_emitted_public_shell !== undefined ||
      candidate.compiler !== undefined ||
      shellPolicy.compiler_emitted === true ||
      shellPolicy.compiler_emitted_public_php === true ||
      candidate.public_shell_policy?.compiler_emitted_public_php === true ||
      wholeFileOwned;
    if ((!publicShell && !wholeFileOwned) || !compilerEmitted) {
      failures.push(`${entry.source_ref} successor ${path} does not record a compiler-emitted public shell`);
    }
  }
}

function main() {
  const copiedPlan = readJson(COPIED_PLAN);
  const generatedPlan = copiedPlan.boundary_plan.filter((entry) => entry.primary_gate?.id === "generated_adapter");
  const expectedRefs = generatedPlan.map((entry) => entry.external_ref).sort();
  const coverageRefs = COVERAGE.map((entry) => entry.source_ref).sort();
  const failures = [];
  const missing = expectedRefs.filter((ref) => !coverageRefs.includes(ref));
  const extra = coverageRefs.filter((ref) => !expectedRefs.includes(ref));
  const duplicateRefs = coverageRefs.filter((ref, index) => coverageRefs.indexOf(ref) !== index);

  if (generatedPlan.length !== 7) failures.push(`expected 7 generated-adapter copied surfaces, found ${generatedPlan.length}`);
  if (missing.length > 0) failures.push(`generated-adapter copied surfaces missing coverage: ${missing.join(", ")}`);
  if (extra.length > 0) failures.push(`coverage entries not in generated-adapter copied-surface plan: ${extra.join(", ")}`);
  if (duplicateRefs.length > 0) failures.push(`duplicate coverage refs: ${[...new Set(duplicateRefs)].join(", ")}`);

  const boundaries = COVERAGE.map((entry) => {
    const planEntry = generatedPlan.find((candidate) => candidate.external_ref === entry.source_ref);
    if (!planEntry) return entry;
    if (entry.status === "covered_by_generated_successor") assertGeneratedSuccessor(entry, failures);
    if (entry.status === "compiler_pressure_blocked" && !entry.blocker?.issue_id) {
      failures.push(`${entry.source_ref} compiler-pressure blocker is missing an issue id`);
    }
    return {
      ...entry,
      source_issue_id: planEntry.issue_id,
      source_unit_name: planEntry.unit_name,
      source_unit_kind: planEntry.unit_kind,
      source_ownership_manifest: planEntry.ownership_manifest,
      source_ownership_manifest_sha256: planEntry.ownership_manifest_sha256,
      source_bridge_kind: planEntry.current_bridge_kind,
      source_primary_gate: planEntry.primary_gate
    };
  }).sort((a, b) => a.source_ref.localeCompare(b.source_ref));

  const coveredCount = boundaries.filter((entry) => entry.status === "covered_by_generated_successor").length;
  const blockedCount = boundaries.filter((entry) => entry.status === "compiler_pressure_blocked").length;
  if (coveredCount !== 6) failures.push(`expected 6 generated-successor surfaces, found ${coveredCount}`);
  if (blockedCount !== 1) failures.push(`expected 1 compiler-pressure blocker, found ${blockedCount}`);

  const validationResult = {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    generated_adapter_surface_count: generatedPlan.length,
    covered_by_generated_successor_count: coveredCount,
    compiler_pressure_blocked_count: blockedCount,
    all_generated_adapter_surfaces_accounted_for: missing.length === 0 && extra.length === 0 && duplicateRefs.length === 0,
    copied_oracle_fixtures_retained_as_behavior_evidence: true
  };

  if (failures.length > 0) {
    throw new Error(`WPHX-312 generated-adapter coverage failed:\n${failures.join("\n")}`);
  }

  const manifest = {
    schema: "wphx.wp-core-generated-adapter-coverage.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "generated_adapter_coverage_gate",
    artifact_scope: "wphx_312_generated_adapter_copied_public_surfaces",
    inputs: {
      copied_surface_plan: fileRecord(COPIED_PLAN),
      successor_manifests: [
        ...new Set(COVERAGE.flatMap((entry) => entry.successor_manifests ?? []).filter((path) => existsSync(path)))
      ].map(fileRecord)
    },
    summary: {
      generated_adapter_surface_count: generatedPlan.length,
      covered_by_generated_successor_count: coveredCount,
      compiler_pressure_blocked_count: blockedCount,
      blocker_refs: boundaries.filter((entry) => entry.blocker).map((entry) => entry.blocker),
      close_wphx_312_101: true
    },
    boundaries,
    validation_result: validationResult,
    decision: {
      status: "passed",
      close_wphx_312_101: true,
      notes: [
        "Six copied-oracle WPHX-312 generated-adapter surfaces already have WPHX PHP compiler-emitted original-path successor candidates.",
        "WPHX-312.04 remains copied-oracle behavior evidence and is routed to an explicit WPHX PHP compiler-pressure blocker for module-level feed/embed/HTTPS original-path adapter support.",
        "No copied public PHP fixture is promoted to durable ownership by this coverage gate."
      ]
    },
    non_claims: [
      "This coverage gate does not retire WPHX-312.04 copied public PHP.",
      "This coverage gate does not claim full feed/embed/oEmbed/HTTPS public PHP replacement, installed WordPress behavior, live network/provider behavior, upstream PHPUnit pass/pass beyond existing ratchets, or complete WP_Http whole-file ownership.",
      "Generated successors remain bounded to their recorded promoted symbols and receipts."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const ownership = {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wphx-312-generated-adapter-coverage",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "evidence_gate",
      name: "WPHX-312 generated-adapter copied public surface coverage",
      area: "HTTP response/cookie/encoding helpers, WP_Http helpers/parser/shim, and feed/embed/HTTPS copied public surfaces",
      public_contract:
        "This gate accounts for copied public surfaces routed to generated adapters. It maps existing generated successor candidates and records explicit compiler-pressure blockers; copied oracle fixtures remain behavior evidence until replacement gates pass."
    },
    ownership_state: "design_plan",
    bridge: {
      exists: true,
      kind: "generated-adapter-coverage-gate",
      removal_gate:
        "Retire this coverage-only gate after all generated-adapter copied surfaces either have durable compiler-emitted original-path replacement evidence or are superseded by a broader WPHX PHP backend/public-shell ownership gate."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-generated-adapter-coverage",
        "npm run wp:core:wphx-312-generated-adapter-coverage:check",
        "npm run wp:core:wphx-312-copied-surface-plan:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-101-generated-adapter-coverage"],
      manifest_digest: sha256(manifestText)
    }
  };

  const receipt = {
    schema: "wphx.wp-core-receipt.v1",
    id: "receipt:wphx-312-101-generated-adapter-coverage",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "generated_adapter_coverage_gate",
    artifact_scope: "wphx_312_generated_adapter_copied_public_surfaces",
    commands: [
      "npm run wp:core:wphx-312-generated-adapter-coverage",
      "npm run wp:core:wphx-312-generated-adapter-coverage:check",
      "npm run wp:core:wphx-312-copied-surface-plan:check"
    ],
    artifacts: [
      {
        path: OUT,
        role: "machine-readable generated-adapter copied-surface coverage"
      },
      {
        path: OWNERSHIP,
        role: "ownership manifest for generated-adapter coverage gate"
      },
      {
        path: RUNNER,
        role: "deterministic generated-adapter coverage generator"
      }
    ],
    manifest_sha256: sha256(manifestText),
    validation_result: validationResult,
    claims: [
      "All seven WPHX-312 copied surfaces routed to generated_adapter are accounted for.",
      "Six generated-adapter copied surfaces map to existing WPHX PHP compiler-emitted original-path successor candidates.",
      "The remaining feed/embed/HTTPS surface maps to an explicit WPHX PHP compiler-pressure blocker."
    ],
    non_claims: manifest.non_claims
  };

  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, JSON.stringify(ownership, null, 2) + "\n");
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        covered_by_generated_successor_count: coveredCount,
        compiler_pressure_blocked_count: blockedCount
      },
      null,
      2
    )
  );
}

main();
