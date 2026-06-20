#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.7.1",
  external_ref: "WPHX-303.01",
  title: "Inventory error/formatting/escaping/KSES surface"
};
const OUT = "manifests/wp-core/wphx-303-01-error-format-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-303-01-error-format-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-303-01-error-format-surface.v1.json";
const RECORDED_AT = "2026-06-20T22:10:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_INVENTORY = "manifests/source-inventory.jsonl";
const TEST_INVENTORY = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const BASELINE = "wordpress-7.0.0";
const UPSTREAM_ROOT = "../wordpress-develop";

const PRIMARY_SOURCE_UNITS = [
  {
    path: "src/wp-includes/class-wp-error.php",
    category: "error_object",
    role: "WP_Error public object shape, methods, public properties, and array-backed error data"
  },
  {
    path: "src/wp-includes/load.php",
    category: "error_object",
    role: "is_wp_error helper; cross-domain load-order dependency owned with WPHX-301"
  },
  {
    path: "src/wp-includes/functions.php",
    category: "error_deprecation",
    role: "wp_die handlers, deprecation helpers, _doing_it_wrong, and wp_trigger_error"
  },
  {
    path: "src/wp-includes/formatting.php",
    category: "formatting_escaping",
    role: "formatting, sanitization, escaping, entity, URL, text, and Unicode helpers"
  },
  {
    path: "src/wp-includes/kses.php",
    category: "kses",
    role: "KSES allow-lists, HTML attribute parsing, protocol filtering, and entity normalization"
  },
  {
    path: "src/wp-includes/class-wp-simplepie-sanitize-kses.php",
    category: "kses",
    role: "SimplePie sanitizer bridge that delegates feed HTML through KSES"
  }
];

const DEFERRED_RELATED_SOURCE_UNITS = [
  {
    path: "src/wp-includes/deprecated.php",
    deferred_to: "WPHX-318",
    reason: "Full legacy deprecated API surface is broader than the WPHX-303 deprecation signaling helpers."
  },
  {
    path: "src/wp-includes/pluggable-deprecated.php",
    deferred_to: "WPHX-318",
    reason: "Deprecated pluggable functions depend on later auth/user/mail behavior."
  },
  {
    path: "src/wp-includes/ms-deprecated.php",
    deferred_to: "WPHX-317/WPHX-318",
    reason: "Multisite deprecated API behavior belongs with multisite and legacy closure."
  },
  {
    path: "src/wp-includes/class-wp-fatal-error-handler.php",
    deferred_to: "WPHX-301/WPHX-319",
    reason: "Fatal error handling is tied to bootstrap, recovery mode, and update/install workflows."
  },
  {
    path: "src/wp-includes/error-protection.php",
    deferred_to: "WPHX-301/WPHX-319",
    reason: "Recovery-mode guards are load-order and operational recovery behavior, not this first WPHX-303 surface."
  }
];

const ERROR_DEPRECATION_SYMBOLS = [
  "wp_die",
  "_default_wp_die_handler",
  "_ajax_wp_die_handler",
  "_json_wp_die_handler",
  "_jsonp_wp_die_handler",
  "_xmlrpc_wp_die_handler",
  "_scalar_wp_die_handler",
  "_deprecated_function",
  "_deprecated_constructor",
  "_deprecated_class",
  "_deprecated_file",
  "_deprecated_argument",
  "_deprecated_hook",
  "_doing_it_wrong",
  "wp_trigger_error"
];

const DOMAINS = [
  {
    id: "error_object",
    label: "WP_Error and is_wp_error",
    source_paths: ["src/wp-includes/class-wp-error.php", "src/wp-includes/load.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/class-wp-error.php" ||
      (entry.path === "src/wp-includes/load.php" && entry.name === "is_wp_error"),
    test_paths: ["tests/phpunit/tests/general/wpError.php"],
    risk_tags: ["native-object-shape", "public-properties", "array-ordering", "false-or-error-contract"],
    fixture_seeds: ["WP_Error::__construct", "WP_Error::add", "WP_Error::get_error_data", "is_wp_error"]
  },
  {
    id: "error_deprecation",
    label: "wp_die, deprecation helpers, and native error signaling",
    source_paths: ["src/wp-includes/functions.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/functions.php" && ERROR_DEPRECATION_SYMBOLS.includes(entry.name),
    test_paths: ["tests/phpunit/tests/functions/wpTriggerError.php", "tests/phpunit/tests/includes/helpers.php"],
    risk_tags: ["native-warning", "native-deprecation", "exit-die", "headers", "output-buffering", "hooks"],
    fixture_seeds: ["wp_trigger_error", "_deprecated_function", "_doing_it_wrong", "wp_die"]
  },
  {
    id: "formatting_escaping",
    label: "formatting, sanitization, escaping, and text helpers",
    source_paths: ["src/wp-includes/formatting.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/formatting.php" && entry.kind === "function",
    test_prefixes: ["tests/phpunit/tests/formatting/"],
    related_test_paths: ["tests/phpunit/tests/option/sanitizeOption.php", "tests/phpunit/tests/term/sanitizeTerm.php"],
    risk_tags: ["security-boundary", "unicode", "entities", "regex-parser", "locale-sensitive", "filter-hooks"],
    fixture_seeds: ["esc_html", "esc_attr", "esc_url", "sanitize_text_field", "wp_parse_str", "wptexturize"]
  },
  {
    id: "kses",
    label: "KSES HTML filtering and protocol/entity handling",
    source_paths: ["src/wp-includes/kses.php", "src/wp-includes/class-wp-simplepie-sanitize-kses.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/kses.php" || entry.path === "src/wp-includes/class-wp-simplepie-sanitize-kses.php",
    test_paths: ["tests/phpunit/tests/kses.php"],
    test_prefixes: ["tests/phpunit/tests/kses/"],
    risk_tags: ["security-boundary", "html-parser", "protocol-filtering", "global-allow-list", "entity-normalization"],
    fixture_seeds: ["wp_kses", "wp_kses_post", "wp_kses_bad_protocol", "wp_kses_hair", "WP_SimplePie_Sanitize_KSES::sanitize"]
  }
];

const FOLLOW_UP_SLICES = [
  {
    external_ref: "WPHX-303.02",
    title: "Build escaping/sanitization differential fixture harness",
    depends_on: ["WPHX-303.01"],
    fixture_focus: ["esc_html", "esc_attr", "esc_url", "esc_js", "sanitize_text_field", "sanitize_title_with_dashes"]
  },
  {
    external_ref: "WPHX-303.03",
    title: "Build WP_Error parity fixture and typed source candidate",
    depends_on: ["WPHX-303.01"],
    fixture_focus: ["WP_Error public properties", "message/data ordering", "is_wp_error"]
  },
  {
    external_ref: "WPHX-303.04",
    title: "Build deprecation and native error signaling fixture harness",
    depends_on: ["WPHX-303.01"],
    fixture_focus: ["wp_trigger_error", "_deprecated_function", "_doing_it_wrong", "wp_die"]
  },
  {
    external_ref: "WPHX-303.05",
    title: "Build KSES differential fixture harness",
    depends_on: ["WPHX-303.01"],
    fixture_focus: ["wp_kses", "allowed HTML contexts", "bad protocol handling", "attribute parsing"]
  },
  {
    external_ref: "WPHX-303.06",
    title: "Promote first pure formatting helpers to Haxe parity candidates",
    depends_on: ["WPHX-303.02"],
    fixture_focus: ["zeroise", "sanitize_key", "sanitize_hex_color", "wp_basename"]
  }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trim()
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

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function byBaselinePath(records, path) {
  return records.find((record) => record.baseline === BASELINE && record.path === path);
}

function sourceRecord(sourceInventory, unit) {
  const inventory = byBaselinePath(sourceInventory, unit.path);
  if (!inventory) throw new Error(`Missing source inventory record for ${unit.path}`);
  return {
    ...unit,
    id: inventory.id,
    baseline: inventory.baseline,
    repo: inventory.repo,
    commit: inventory.commit,
    language: inventory.language,
    inventory_status: inventory.status,
    classified: inventory.classified,
    bytes: statSync(upstreamPath(unit.path)).size,
    sha256: sha256File(upstreamPath(unit.path)),
    git_object: inventory.gitObject
  };
}

function deferredSourceRecord(sourceInventory, unit) {
  const inventory = byBaselinePath(sourceInventory, unit.path);
  if (!inventory) throw new Error(`Missing source inventory record for ${unit.path}`);
  return {
    ...unit,
    id: inventory.id,
    repo: inventory.repo,
    commit: inventory.commit,
    inventory_status: inventory.status,
    sha256: sha256File(upstreamPath(unit.path))
  };
}

function testRecord(testInventory, path, category, relation = "primary") {
  const inventory = byBaselinePath(testInventory, path);
  if (!inventory) throw new Error(`Missing test inventory record for ${path}`);
  return {
    category,
    relation,
    id: inventory.id,
    path: inventory.path,
    repo: inventory.repo,
    commit: inventory.commit,
    framework: inventory.framework,
    sha256: sha256File(upstreamPath(path))
  };
}

function collectTests(testInventory, domain) {
  const tests = [];
  for (const path of domain.test_paths ?? []) {
    tests.push(testRecord(testInventory, path, domain.id));
  }
  for (const prefix of domain.test_prefixes ?? []) {
    for (const record of testInventory.filter((entry) => entry.baseline === BASELINE && entry.path.startsWith(prefix))) {
      tests.push(testRecord(testInventory, record.path, domain.id));
    }
  }
  for (const path of domain.related_test_paths ?? []) {
    tests.push(testRecord(testInventory, path, domain.id, "related"));
  }
  const seen = new Set();
  return tests
    .filter((test) => {
      if (seen.has(test.path)) return false;
      seen.add(test.path);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function abiSymbol(entry, category) {
  return {
    category,
    kind: entry.kind,
    name: entry.qualified_name ?? entry.name,
    local_name: entry.local_name ?? entry.name,
    path: entry.path,
    distribution_path: entry.distribution_path,
    start_line: entry.location?.start_line ?? null,
    declaration_timing: entry.declaration_timing,
    signature_hash: entry.signature_hash,
    source_hash: entry.source_hash,
    parameter_count: entry.parameters?.length ?? 0,
    return_type: entry.return_type ?? null
  };
}

function collectSymbols(abi, domain) {
  return abi.entries
    .filter((entry) => ["function", "class", "method", "property"].includes(entry.kind))
    .filter(domain.symbol_filter)
    .map((entry) => abiSymbol(entry, domain.id))
    .sort((a, b) => a.path.localeCompare(b.path) || a.start_line - b.start_line || a.name.localeCompare(b.name));
}

function buildDomainRecords(abi, testInventory) {
  return DOMAINS.map((domain) => {
    const symbols = collectSymbols(abi, domain);
    const tests = collectTests(testInventory, domain);
    if (symbols.length === 0) throw new Error(`${domain.id} selected no ABI symbols`);
    if (tests.length === 0) throw new Error(`${domain.id} selected no tests`);
    return {
      id: domain.id,
      label: domain.label,
      source_paths: domain.source_paths,
      risk_tags: domain.risk_tags,
      fixture_seeds: domain.fixture_seeds,
      symbol_count: symbols.length,
      test_count: tests.length,
      symbols,
      tests
    };
  });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-303-surface`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/error-format-surface",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "error/deprecation/formatting/escaping/KSES surface",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 WP_Error, wp_die/deprecation helpers, formatting/escaping/sanitization helpers, and KSES public PHP ABI remain oracle-owned until per-slice Haxe parity candidates replace them."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: PRIMARY_SOURCE_UNITS.map((unit) => unit.path),
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-error-format-surface.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-303-surface",
        "npm run wp:core:wphx-303-surface:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-303-01-error-format-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "This first WPHX-303 slice inventories the oracle surface and fixture entry points only. Runtime logic remains external_oracle until later WPHX-303.x slices create Haxe parity candidates and replacement gates."
  };
}

const sourceInventory = readJsonl(SOURCE_INVENTORY);
const testInventory = readJsonl(TEST_INVENTORY);
const abi = readJson(ABI);
const sourceUnits = PRIMARY_SOURCE_UNITS.map((unit) => sourceRecord(sourceInventory, unit));
const deferredSourceUnits = DEFERRED_RELATED_SOURCE_UNITS.map((unit) => deferredSourceRecord(sourceInventory, unit));
const domains = buildDomainRecords(abi, testInventory);
const publicSymbols = domains.flatMap((domain) => domain.symbols);
const upstreamDigest = sha256(
  JSON.stringify(
    sourceUnits.map((unit) => ({
      path: unit.path,
      sha256: unit.sha256
    }))
  )
);
const manifest = {
  schema: "wphx.wp-core-error-format-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-error-format-surface.mjs",
  inputs: {
    source_inventory: inputRecord(SOURCE_INVENTORY),
    test_inventory: inputRecord(TEST_INVENTORY),
    php_abi: inputRecord(ABI),
    upstream_repo: UPSTREAM_ROOT,
    upstream_ref: WP_REF,
    upstream_digest: upstreamDigest
  },
  source_units: sourceUnits,
  deferred_related_source_units: deferredSourceUnits,
  domains,
  public_symbol_count: publicSymbols.length,
  public_symbol_names: uniqueSorted(publicSymbols.map((symbol) => symbol.name)),
  upstream_test_count: domains.reduce((total, domain) => total + domain.test_count, 0),
  first_fixture_targets: [
    {
      id: "escaping-core",
      issue_external_ref: "WPHX-303.02",
      symbols: ["esc_html", "esc_attr", "esc_url", "esc_js", "sanitize_text_field"],
      oracle_focus: "HTML/attribute/URL/JS escaping, invalid UTF-8, entities, filter hooks, and false/string boundary behavior"
    },
    {
      id: "wp-error-object",
      issue_external_ref: "WPHX-303.03",
      symbols: ["WP_Error", "is_wp_error"],
      oracle_focus: "Public property shape, code/message/data ordering, additional_data history, and false-or-error public contracts"
    },
    {
      id: "native-error-signaling",
      issue_external_ref: "WPHX-303.04",
      symbols: ["wp_trigger_error", "_deprecated_function", "_doing_it_wrong", "wp_die"],
      oracle_focus: "Native PHP warning/notice/deprecation/error levels, hooks, output, and die handler selection"
    },
    {
      id: "kses-security-filter",
      issue_external_ref: "WPHX-303.05",
      symbols: ["wp_kses", "wp_kses_post", "wp_kses_bad_protocol", "wp_kses_hair"],
      oracle_focus: "Allowed HTML contexts, protocol stripping, entity normalization, malformed attribute parsing, and feed sanitizer bridge"
    }
  ],
  follow_up_slices: FOLLOW_UP_SLICES,
  validation_result: {
    status: "passed",
    source_units: sourceUnits.length,
    deferred_related_source_units: deferredSourceUnits.length,
    domains: domains.length,
    public_symbols: publicSymbols.length,
    upstream_tests: domains.reduce((total, domain) => total + domain.test_count, 0),
    ownership_state: "external_oracle"
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-303-01-error-format-surface",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WPHX-303.01 generated domain surface manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for this first domain surface"
    },
    {
      path: "tools/wp-core/run-error-format-surface.mjs",
      role: "deterministic generator and drift check"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-303-surface",
    "npm run wp:core:wphx-303-surface:check",
    "npm run beads:validate",
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

console.log(
  JSON.stringify(
    {
      status: "passed",
      output: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      public_symbol_count: manifest.public_symbol_count,
      upstream_test_count: manifest.upstream_test_count
    },
    null,
    2
  )
);
