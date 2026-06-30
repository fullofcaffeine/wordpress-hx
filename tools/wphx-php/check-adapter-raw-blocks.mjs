#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const checkOnly = process.argv.includes("--check");
const OUT = "manifests/wphx-php/adapter-raw-block-policy.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-adapter-raw-block-policy.v1.json";
const REFERENCE_RECEIPT = "receipts/compiler/wphx-comp-php-adapter-template-reference-policy.v1.json";
const CONTENT_RECEIPT = "receipts/compiler/wphx-comp-php-adapter-template-content-policy.v1.json";
const RECORDED_AT = "2026-06-30T00:00:00Z";
const PROFILE = "src/wphx/compiler/php/WphxPhpWordPressAdapters.hx";
const TEMPLATE_DIR = "src/wphx/compiler/php/templates/wordpress";
const ISSUE = {
  id: "wordpresshx-msp",
  external_ref: "WPHX-COMP-PHP-ADAPTER-RAW-BLOCK-GUARD",
  title: "Guard WordPress adapter raw blocks"
};
const REFERENCE_ISSUE = {
  id: "wordpresshx-65c",
  external_ref: "WPHX-COMP-PHP-ADAPTER-TEMPLATE-REFERENCE-GUARD",
  title: "Guard adapter template references"
};
const CONTENT_ISSUE = {
  id: "wordpresshx-ssb",
  external_ref: "WPHX-COMP-PHP-ADAPTER-TEMPLATE-CONTENT-GUARD",
  title: "Guard adapter template contents"
};

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return path.endsWith(".php.template") ? [path] : [];
  });
}

function rawBlockOccurrences() {
  const lines = readFileSync(PROFILE, "utf8").split("\n");
  const occurrences = [];
  for (const [index, line] of lines.entries()) {
    if (!line.includes("PhpRawBlock(")) continue;
    const allowed = /\bPhpRawBlock\s*\(\s*rendered\.code\s*\)/.test(line);
    occurrences.push({
      path: PROFILE,
      line: index + 1,
      source: line.trim(),
      source_sha256: sha256(line.trim()),
      allowed,
      policy: allowed ? "rendered-template-body" : "inline-raw-php-body"
    });
  }
  return occurrences;
}

function templateRecords() {
  return walk(TEMPLATE_DIR)
    .sort()
    .map((path) => ({
      path,
      bytes: statSync(path).size,
      sha256: sha256File(path)
    }));
}

function lineNumberForOffset(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function templateReferences() {
  const source = readFileSync(PROFILE, "utf8");
  const references = [];
  const renderTemplate = /renderTemplate\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g;
  let match;
  while ((match = renderTemplate.exec(source)) !== null) {
    const path = match[2];
    const exists = existsSync(path);
    const callEnd = source.indexOf("]);", match.index);
    const callSource = callEnd === -1 ? source.slice(match.index) : source.slice(match.index, callEnd + 3);
    const declaredPlaceholders = [];
    const declaredPlaceholder = /placeholder:\s*"([^"]+)"/g;
    let placeholderMatch;
    while ((placeholderMatch = declaredPlaceholder.exec(callSource)) !== null) {
      declaredPlaceholders.push(placeholderMatch[1]);
    }
    references.push({
      adapter: match[1],
      path,
      line: lineNumberForOffset(source, match.index),
      exists,
      sha256: exists ? sha256File(path) : null,
      declared_placeholders: declaredPlaceholders.sort()
    });
  }
  return references.sort((a, b) => a.path.localeCompare(b.path) || a.adapter.localeCompare(b.adapter));
}

function renderTemplateCallSites() {
  return readFileSync(PROFILE, "utf8")
    .split("\n")
    .flatMap((line, index) => {
      if (!line.includes("renderTemplate(") || line.includes("function renderTemplate")) return [];
      return [
        {
          path: PROFILE,
          line: index + 1,
          source: line.trim()
        }
      ];
    });
}

function placeholderInspection(path) {
  const source = readFileSync(path, "utf8");
  const tokenRanges = [];
  const placeholders = [];
  const placeholder = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
  let match;
  while ((match = placeholder.exec(source)) !== null) {
    tokenRanges.push({
      start: match.index,
      end: match.index + match[0].length
    });
    placeholders.push(match[1]);
  }

  const malformed = [];
  for (const token of ["{{", "}}"]) {
    let offset = source.indexOf(token);
    while (offset !== -1) {
      const inRecognizedToken = tokenRanges.some((range) => offset >= range.start && offset < range.end);
      if (!inRecognizedToken) {
        malformed.push({
          token,
          line: lineNumberForOffset(source, offset)
        });
      }
      offset = source.indexOf(token, offset + token.length);
    }
  }

  return {
    placeholders: [...new Set(placeholders)].sort(),
    malformed
  };
}

function renderForLint(path, placeholders) {
  let code = readFileSync(path, "utf8");
  for (const placeholder of placeholders) {
    code = code.split(`{{${placeholder}}}`).join("WPHX_TemplateLintHelper");
  }
  return code;
}

function normalizePhpLintOutput(output, tempDir) {
  return output.trim().split(tempDir).join("<wphx-template-lint>");
}

function lintWrappedTemplate(reference) {
  const rendered = renderForLint(reference.path, reference.template_placeholders);
  const wrapped = `<?php
class WPHX_TemplateLintHelper {
\tpublic static function defaultTransportTokens() { return array(); }
\tpublic static function isCoreTransportToken( $transport ) { return false; }
\tpublic static function coreTransportSuffix( $transport ) { return $transport; }
\tpublic static function transportClassName( $transport ) { return 'WPHX_TemplateLintTransport'; }
\tpublic static function nonblockingResponse( $url, $parsed_args ) { return array(); }
}
class WPHX_TemplateLintTransport {
\tpublic static function test( $args, $url ) { return true; }
\tpublic function request( $url, $args ) { return array(); }
}
class WPHX_TemplateLintScope {
\tpublic function block_request( $url ) { return false; }
\tpublic function _get_first_available_transport( $args, $url ) { return 'WPHX_TemplateLintTransport'; }
\tpublic function __wphx_lint( $data = array(), $requested_url = '', $args = array(), $url = '' ) {
${rendered}
\t}
}
`;
  const tempDir = mkdtempSync(join(tmpdir(), "wphx-template-lint-"));
  const lintPath = join(tempDir, `${reference.adapter}.php`);
  try {
    writeFileSync(lintPath, wrapped);
    const output = execFileSync("php", ["-l", lintPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return {
      adapter: reference.adapter,
      path: reference.path,
      status: "passed",
      rendered_sha256: sha256(rendered),
      wrapped_sha256: sha256(wrapped),
      php_lint_output: normalizePhpLintOutput(output, tempDir)
    };
  } catch (error) {
    return {
      adapter: reference.adapter,
      path: reference.path,
      status: "failed",
      rendered_sha256: sha256(rendered),
      wrapped_sha256: sha256(wrapped),
      php_lint_output: normalizePhpLintOutput(`${error.stdout ?? ""}${error.stderr ?? ""}`, tempDir)
    };
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
}

const occurrences = rawBlockOccurrences();
const violations = occurrences.filter((occurrence) => !occurrence.allowed);
if (violations.length > 0) {
  console.error(JSON.stringify({ status: "failed", violations }, null, 2));
  process.exit(1);
}

const templates = templateRecords();
const references = templateReferences();
const renderTemplateCalls = renderTemplateCallSites();
const unparsedTemplateReferences = renderTemplateCalls.filter(
  (call) => !references.some((reference) => reference.line === call.line)
);
const referencedPaths = new Set(references.map((reference) => reference.path));
const missingTemplateReferences = references.filter((reference) => !reference.exists);
const orphanTemplates = templates.filter((template) => !referencedPaths.has(template.path));
const externalTemplateReferences = references.filter((reference) => !reference.path.startsWith(`${TEMPLATE_DIR}/`));
const duplicateAdapters = references
  .map((reference) => reference.adapter)
  .filter((adapter, index, adapters) => adapters.indexOf(adapter) !== index)
  .filter((adapter, index, adapters) => adapters.indexOf(adapter) === index)
  .sort();

const existingReferences = references
  .filter((reference) => reference.exists)
  .map((reference) => {
    const inspection = placeholderInspection(reference.path);
    return {
      ...reference,
      template_placeholders: inspection.placeholders,
      malformed_placeholders: inspection.malformed,
      placeholder_contract_matches:
        JSON.stringify(reference.declared_placeholders) === JSON.stringify(inspection.placeholders)
    };
  });
const malformedTemplatePlaceholders = existingReferences.filter((reference) => reference.malformed_placeholders.length > 0);
const placeholderContractMismatches = existingReferences.filter((reference) => !reference.placeholder_contract_matches);
const templateLintResults = existingReferences.map(lintWrappedTemplate);
const templateLintFailures = templateLintResults.filter((result) => result.status !== "passed");
if (
  unparsedTemplateReferences.length > 0 ||
  missingTemplateReferences.length > 0 ||
  orphanTemplates.length > 0 ||
  externalTemplateReferences.length > 0 ||
  duplicateAdapters.length > 0 ||
  malformedTemplatePlaceholders.length > 0 ||
  placeholderContractMismatches.length > 0 ||
  templateLintFailures.length > 0
) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        unparsed_template_references: unparsedTemplateReferences,
        missing_template_references: missingTemplateReferences,
        orphan_templates: orphanTemplates,
        external_template_references: externalTemplateReferences,
        duplicate_adapters: duplicateAdapters,
        malformed_template_placeholders: malformedTemplatePlaceholders,
        placeholder_contract_mismatches: placeholderContractMismatches,
        template_lint_failures: templateLintFailures
      },
      null,
      2
    )
  );
  process.exit(1);
}

const manifest = {
  schema: "wphx.wphx-php-adapter-raw-block-policy.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wphx-php/check-adapter-raw-blocks.mjs",
  scanned_profile: {
    path: PROFILE,
    bytes: statSync(PROFILE).size,
    sha256: sha256File(PROFILE)
  },
  template_directory: TEMPLATE_DIR,
  templates,
  template_references: existingReferences,
  template_lints: templateLintResults,
  php_raw_block_count: occurrences.length,
  inline_raw_block_count: violations.length,
  occurrences,
  policy: {
    allowed_raw_block_argument: "rendered.code",
    requirement:
      "WordPress-profile public adapter PHP bodies must be structured IR or compiler-owned templates with manifest provenance; inline PhpRawBlock string bodies are forbidden."
  },
  validation_result: {
    status: "passed",
    only_rendered_template_raw_blocks: true,
    inline_raw_blocks_forbidden: true,
    template_count: templates.length,
    render_template_call_count: renderTemplateCalls.length,
    template_reference_count: references.length,
    every_render_template_call_is_static: unparsedTemplateReferences.length === 0,
    every_template_reference_exists: missingTemplateReferences.length === 0,
    every_template_file_is_referenced: orphanTemplates.length === 0,
    every_template_reference_under_template_directory: externalTemplateReferences.length === 0,
    adapter_template_names_unique: duplicateAdapters.length === 0,
    every_template_placeholder_contract_matches: placeholderContractMismatches.length === 0,
    every_template_placeholder_token_is_valid: malformedTemplatePlaceholders.length === 0,
    every_rendered_template_php_lints: templateLintFailures.length === 0
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-adapter-raw-block-policy",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  status: "passed",
  evidence_class: "compiler_policy_guard",
  artifact_scope: "wordpress_profile_php_raw_block_policy",
  commands: [
    "npm run wphx:php:adapter-raw-blocks",
    "npm run wphx:php:adapter-raw-blocks:check",
    "npm run precommit"
  ],
  artifacts: [
    {
      path: "tools/wphx-php/check-adapter-raw-blocks.mjs",
      role: "policy guard for WordPress-profile PhpRawBlock usage"
    },
    {
      path: PROFILE,
      role: "WordPress-profile adapter source scanned by the guard"
    },
    {
      path: OUT,
      role: "manifest recording allowed rendered-template raw block occurrences"
    }
  ],
  validation_result: manifest.validation_result,
  claims: [
    "The WordPress adapter profile no longer permits inline PhpRawBlock PHP string bodies.",
    "The current WordPress adapter profile scan records zero PhpRawBlock occurrences.",
    "If future compiler-owned templates are admitted, the only allowed PhpRawBlock form remains PhpRawBlock(rendered.code) with template provenance.",
    "The policy guard is wired into npm precommit checks."
  ],
  non_claims: [
    "This does not claim future adapter templates are forbidden when backed by a Beads task, provenance, and parity gates.",
    "This does not claim WPHX PHP is a complete arbitrary-Haxe PHP backend.",
    "This does not claim additional WordPress runtime behavior parity."
  ]
};
const referenceReceipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-adapter-template-reference-policy",
  issue: REFERENCE_ISSUE,
  recorded_at: RECORDED_AT,
  status: "passed",
  evidence_class: "compiler_policy_guard",
  artifact_scope: "wordpress_profile_adapter_template_references",
  commands: [
    "npm run wphx:php:adapter-raw-blocks",
    "npm run wphx:php:adapter-raw-blocks:check",
    "npm run precommit"
  ],
  artifacts: [
    {
      path: "tools/wphx-php/check-adapter-raw-blocks.mjs",
      role: "policy guard for WordPress-profile adapter template references"
    },
    {
      path: PROFILE,
      role: "WordPress-profile adapter source containing renderTemplate references"
    },
    {
      path: OUT,
      role: "manifest recording renderTemplate references and compiler-owned template files"
    }
  ],
  validation_result: {
    status: "passed",
    template_count: templates.length,
    render_template_call_count: renderTemplateCalls.length,
    template_reference_count: references.length,
    every_render_template_call_is_static: true,
    every_template_reference_exists: true,
    every_template_file_is_referenced: true,
    every_template_reference_under_template_directory: true,
    adapter_template_names_unique: true,
    every_template_placeholder_contract_matches: true,
    every_template_placeholder_token_is_valid: true,
    every_rendered_template_php_lints: true
  },
  claims: [
    "The current WordPress adapter profile scan records zero renderTemplate references.",
    "Any future WordPress-profile renderTemplate call must use static adapter and template-path arguments that the guard can scan.",
    "Any future compiler-owned WordPress adapter template file must be referenced by WphxPhpWordPressAdapters.hx.",
    "Adapter template names used by the WordPress profile must be unique."
  ],
  non_claims: [
    "This does not claim future adapter templates are forbidden when backed by a Beads task, provenance, and parity gates.",
    "This does not claim additional WordPress runtime behavior parity.",
    "This does not claim WPHX PHP is a complete arbitrary-Haxe PHP backend."
  ]
};
const contentReceipt = {
  schema: "wphx.compiler-core-driver-receipt.v1",
  id: "receipt:wphx-comp-php-adapter-template-content-policy",
  issue: CONTENT_ISSUE,
  recorded_at: RECORDED_AT,
  status: "passed",
  evidence_class: "compiler_policy_guard",
  artifact_scope: "wordpress_profile_adapter_template_contents",
  commands: [
    "npm run wphx:php:adapter-raw-blocks",
    "npm run wphx:php:adapter-raw-blocks:check",
    "npm run precommit"
  ],
  artifacts: [
    {
      path: "tools/wphx-php/check-adapter-raw-blocks.mjs",
      role: "policy guard for WordPress-profile adapter template contents"
    },
    {
      path: TEMPLATE_DIR,
      role: "compiler-owned WordPress adapter template directory"
    },
    {
      path: OUT,
      role: "manifest recording template placeholder contracts and php -l results"
    }
  ],
  validation_result: {
    status: "passed",
    template_count: templates.length,
    template_lint_count: templateLintResults.length,
    every_template_placeholder_contract_matches: true,
    every_template_placeholder_token_is_valid: true,
    every_rendered_template_php_lints: true
  },
  claims: [
    "The current compiler-owned WordPress adapter template set is empty.",
    "Any future compiler-owned WordPress adapter template must use only valid {{PLACEHOLDER}} tokens.",
    "Any future template placeholder set must match the static renderTemplate replacement metadata and lint after deterministic rendering."
  ],
  non_claims: [
    "This does not claim future adapter templates are forbidden when backed by a Beads task, provenance, and parity gates.",
    "This does not claim additional WordPress runtime behavior parity."
  ]
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";
const referenceReceiptText = JSON.stringify(referenceReceipt, null, 2) + "\n";
const contentReceiptText = JSON.stringify(contentReceipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText],
    [REFERENCE_RECEIPT, referenceReceiptText],
    [CONTENT_RECEIPT, contentReceiptText]
  ]) {
    if (!existsSync(path)) {
      console.error(JSON.stringify({ status: "failed", error: `${path} does not exist` }, null, 2));
      process.exit(1);
    }
    if (readFileSync(path, "utf8") !== text) {
      console.error(JSON.stringify({ status: "failed", error: `${path} is stale` }, null, 2));
      process.exit(1);
    }
  }
  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        receipt: RECEIPT,
        reference_receipt: REFERENCE_RECEIPT,
        content_receipt: CONTENT_RECEIPT,
        php_raw_block_count: occurrences.length,
        template_reference_count: references.length,
        template_lint_count: templateLintResults.length
      },
      null,
      2
    )
  );
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
mkdirSync(dirname(REFERENCE_RECEIPT), { recursive: true });
mkdirSync(dirname(CONTENT_RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
writeFileSync(REFERENCE_RECEIPT, referenceReceiptText);
writeFileSync(CONTENT_RECEIPT, contentReceiptText);
console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      receipt: RECEIPT,
      reference_receipt: REFERENCE_RECEIPT,
      content_receipt: CONTENT_RECEIPT,
      php_raw_block_count: occurrences.length,
      template_reference_count: references.length,
      template_lint_count: templateLintResults.length
    },
    null,
    2
  )
);
