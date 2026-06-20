#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.8.1",
  external_ref: "WPHX-304.01",
  title: "Inventory options/transients/object-cache surface"
};
const OUT = "manifests/wp-core/wphx-304-01-options-cache-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-304-01-options-cache-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-304-01-options-cache-surface.v1.json";
const RECORDED_AT = "2026-06-20T23:08:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_INVENTORY = "manifests/source-inventory.jsonl";
const TEST_INVENTORY = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const BASELINE = "wordpress-7.0.0";
const UPSTREAM_ROOT = "../wordpress-develop";

const PRIMARY_SOURCE_UNITS = [
  {
    path: "src/wp-includes/option.php",
    category: "options_transients",
    role: "Option, site option, network option, transient, site transient, settings registry, autoload, and alloptions/notoptions behavior"
  },
  {
    path: "src/wp-includes/cache.php",
    category: "object_cache",
    role: "Public object-cache function API delegating to the global WP_Object_Cache instance"
  },
  {
    path: "src/wp-includes/cache-compat.php",
    category: "object_cache_dropin_compat",
    role: "Compatibility shims loaded when a persistent object-cache drop-in omits newer public cache APIs"
  },
  {
    path: "src/wp-includes/class-wp-object-cache.php",
    category: "object_cache",
    role: "Default runtime WP_Object_Cache data structure, public properties, group handling, and mutation semantics"
  },
  {
    path: "src/wp-includes/load.php",
    category: "object_cache_bootstrap",
    role: "External object-cache flag and object-cache bootstrap/drop-in loading boundary"
  },
  {
    path: "src/wp-includes/functions.php",
    category: "serialization_cache_flags",
    role: "Serialization helpers, cache suspension flags, and last_changed cache salts used by option/cache behavior"
  },
  {
    path: "src/wp-includes/class-wp-feed-cache-transient.php",
    category: "transient_feed_bridge",
    role: "SimplePie feed-cache bridge backed by site transients"
  },
  {
    path: "src/wp-includes/class-wp-feed-cache.php",
    category: "transient_feed_bridge",
    role: "SimplePie feed-cache factory that creates transient-backed cache instances"
  }
];

const DEFERRED_CROSS_DOMAIN_BEHAVIORS = [
  {
    id: "user-settings",
    source_path: "src/wp-includes/option.php",
    symbols: [
      "wp_user_settings",
      "get_user_setting",
      "set_user_setting",
      "delete_user_setting",
      "get_all_user_settings",
      "wp_set_all_user_settings",
      "delete_all_user_settings"
    ],
    deferred_to: "WPHX-306",
    reason: "User settings are stored through option.php but depend on current-user, auth, cookies, and capability behavior."
  },
  {
    id: "theme-mods",
    source_path: "src/wp-includes/theme.php",
    related_tests: ["tests/phpunit/tests/option/themeMods.php", "tests/phpunit/tests/theme/autoloadThemeMods.php"],
    deferred_to: "WPHX-310",
    reason: "Theme mods are option-backed, but their public behavior belongs with themes/template loading rather than the first storage/cache slice."
  },
  {
    id: "metadata-cache-invalidation",
    source_path: "src/wp-includes/meta.php",
    deferred_to: "WPHX-307/WPHX-308",
    reason: "Post, comment, term, and user meta cache invalidation should be verified with their domain query and mutation APIs."
  }
];

const OPTION_STORAGE_SYMBOLS = [
  "get_option",
  "get_options",
  "wp_prime_option_caches",
  "wp_prime_option_caches_by_group",
  "wp_set_option_autoload_values",
  "wp_set_options_autoload",
  "wp_set_option_autoload",
  "wp_protect_special_option",
  "form_option",
  "wp_load_alloptions",
  "update_option",
  "add_option",
  "delete_option",
  "wp_determine_option_autoload_value",
  "wp_filter_default_autoload_value_via_option_size",
  "wp_autoload_values_to_autoload"
];

const SETTINGS_DEFAULT_SYMBOLS = [
  "register_initial_settings",
  "register_setting",
  "unregister_setting",
  "get_registered_settings",
  "filter_default_option"
];

const MULTISITE_OPTION_SYMBOLS = [
  "wp_prime_site_option_caches",
  "wp_prime_network_option_caches",
  "wp_load_core_site_options",
  "get_site_option",
  "add_site_option",
  "delete_site_option",
  "update_site_option",
  "get_network_option",
  "add_network_option",
  "delete_network_option",
  "update_network_option"
];

const TRANSIENT_SYMBOLS = [
  "delete_transient",
  "get_transient",
  "set_transient",
  "delete_expired_transients",
  "delete_site_transient",
  "get_site_transient",
  "set_site_transient"
];

const SERIALIZATION_CACHE_SYMBOLS = [
  "maybe_serialize",
  "maybe_unserialize",
  "is_serialized",
  "is_serialized_string",
  "wp_suspend_cache_addition",
  "wp_suspend_cache_invalidation",
  "wp_cache_get_last_changed",
  "wp_cache_set_last_changed"
];

const OBJECT_CACHE_BOOTSTRAP_SYMBOLS = ["wp_using_ext_object_cache", "wp_start_object_cache"];

const DOMAINS = [
  {
    id: "option_storage_autoload",
    label: "Options, alloptions/notoptions, and autoload decisions",
    source_paths: ["src/wp-includes/option.php", "src/wp-includes/functions.php"],
    symbol_filter: (entry) =>
      (entry.path === "src/wp-includes/option.php" && OPTION_STORAGE_SYMBOLS.includes(entry.name)) ||
      (entry.path === "src/wp-includes/functions.php" &&
        ["maybe_serialize", "maybe_unserialize", "is_serialized"].includes(entry.name)),
    test_paths: [
      "tests/phpunit/tests/option/option.php",
      "tests/phpunit/tests/option/updateOption.php",
      "tests/phpunit/tests/option/getOptions.php",
      "tests/phpunit/tests/option/slashes.php",
      "tests/phpunit/tests/option/wpPrimeOptionCaches.php",
      "tests/phpunit/tests/option/wpPrimeOptionCachesByGroup.php",
      "tests/phpunit/tests/option/wpLoadAlloptions.php",
      "tests/phpunit/tests/option/wpSetOptionAutoload.php",
      "tests/phpunit/tests/option/wpSetOptionAutoloadValues.php",
      "tests/phpunit/tests/option/wpSetOptionsAutoload.php",
      "tests/phpunit/tests/option/wpDetermineOptionAutoloadValue.php",
      "tests/phpunit/tests/option/wpAutoloadValuesToAutoload.php"
    ],
    risk_tags: ["database-storage", "autoload-cache", "alloptions", "notoptions", "serialization", "filter-hooks"],
    fixture_seeds: ["get_option", "add_option", "update_option", "delete_option", "wp_load_alloptions"]
  },
  {
    id: "settings_defaults",
    label: "Settings registry and default option filters",
    source_paths: ["src/wp-includes/option.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/option.php" && SETTINGS_DEFAULT_SYMBOLS.includes(entry.name),
    test_paths: ["tests/phpunit/tests/option/registration.php", "tests/phpunit/tests/option/sanitizeOption.php"],
    risk_tags: ["global-registry", "default-filters", "sanitization-callbacks", "rest-schema-bridge"],
    fixture_seeds: ["register_setting", "unregister_setting", "get_registered_settings", "filter_default_option"]
  },
  {
    id: "site_network_options",
    label: "Site and network options",
    source_paths: ["src/wp-includes/option.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/option.php" && MULTISITE_OPTION_SYMBOLS.includes(entry.name),
    test_paths: [
      "tests/phpunit/tests/option/siteOption.php",
      "tests/phpunit/tests/option/networkOption.php",
      "tests/phpunit/tests/option/multisite.php",
      "tests/phpunit/tests/option/wpPrimeNetworkOptionCaches.php"
    ],
    risk_tags: ["multisite", "network-id", "global-cache-groups", "site-options", "database-storage"],
    fixture_seeds: ["get_site_option", "update_site_option", "get_network_option", "wp_prime_network_option_caches"]
  },
  {
    id: "transients",
    label: "Transients, site transients, expiration, and feed cache bridge",
    source_paths: [
      "src/wp-includes/option.php",
      "src/wp-includes/class-wp-feed-cache-transient.php",
      "src/wp-includes/class-wp-feed-cache.php"
    ],
    symbol_filter: (entry) =>
      (entry.path === "src/wp-includes/option.php" && TRANSIENT_SYMBOLS.includes(entry.name)) ||
      entry.path === "src/wp-includes/class-wp-feed-cache-transient.php" ||
      entry.path === "src/wp-includes/class-wp-feed-cache.php",
    test_paths: ["tests/phpunit/tests/option/transient.php", "tests/phpunit/tests/option/siteTransient.php"],
    risk_tags: ["timeout-value-pairing", "expiration", "cron-cleanup", "site-transients", "feed-cache", "filter-hooks"],
    fixture_seeds: ["set_transient", "get_transient", "delete_expired_transients", "set_site_transient", "WP_Feed_Cache_Transient::save"]
  },
  {
    id: "object_cache_runtime",
    label: "Default object cache runtime and public cache API",
    source_paths: ["src/wp-includes/cache.php", "src/wp-includes/class-wp-object-cache.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/cache.php" || entry.path === "src/wp-includes/class-wp-object-cache.php",
    test_paths: ["tests/phpunit/tests/cache.php"],
    risk_tags: ["global-state", "cache-groups", "by-reference-found-flag", "increment-decrement", "runtime-flush", "blog-switch"],
    fixture_seeds: ["wp_cache_add", "wp_cache_get", "wp_cache_set", "wp_cache_delete", "WP_Object_Cache::switch_to_blog"]
  },
  {
    id: "object_cache_dropin_compat",
    label: "Object-cache drop-in compatibility shims and bootstrap",
    source_paths: ["src/wp-includes/cache-compat.php", "src/wp-includes/load.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/cache-compat.php" ||
      (entry.path === "src/wp-includes/load.php" && OBJECT_CACHE_BOOTSTRAP_SYMBOLS.includes(entry.name)),
    test_paths: [
      "tests/phpunit/tests/cache.php",
      "tests/phpunit/tests/functions/wpCacheGetSalted.php",
      "tests/phpunit/tests/functions/wpCacheSetSalted.php",
      "tests/phpunit/tests/functions/wpCacheGetMultipleSalted.php",
      "tests/phpunit/tests/functions/wpCacheSetMultipleSalted.php"
    ],
    risk_tags: ["persistent-dropin", "function-exists-compat", "salted-cache", "bootstrap-order", "doing-it-wrong"],
    fixture_seeds: ["wp_using_ext_object_cache", "wp_start_object_cache", "wp_cache_supports", "wp_cache_get_salted", "wp_cache_set_salted"]
  },
  {
    id: "serialization_cache_flags",
    label: "Serialization helpers, cache suspension flags, and last_changed salts",
    source_paths: ["src/wp-includes/functions.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/functions.php" && SERIALIZATION_CACHE_SYMBOLS.includes(entry.name),
    test_paths: [
      "tests/phpunit/tests/functions/maybeSerialize.php",
      "tests/phpunit/tests/functions/isSerialized.php",
      "tests/phpunit/tests/functions/isSerializedString.php",
      "tests/phpunit/tests/functions/wpCacheSetLastChanged.php"
    ],
    related_test_paths: ["tests/phpunit/tests/term/cache.php"],
    risk_tags: ["php-serialization", "native-unserialize", "cache-invalidation", "last-changed-salt", "global-flags"],
    fixture_seeds: ["maybe_serialize", "maybe_unserialize", "wp_cache_set_last_changed", "wp_suspend_cache_invalidation"]
  }
];

const FOLLOW_UP_SLICES = [
  {
    external_ref: "WPHX-304.02",
    title: "Build option storage/autoload differential fixture harness",
    depends_on: ["WPHX-304.01"],
    fixture_focus: ["get_option", "add_option", "update_option", "delete_option", "alloptions/notoptions", "autoload decisions"]
  },
  {
    external_ref: "WPHX-304.03",
    title: "Build transient and site-transient expiration fixture harness",
    depends_on: ["WPHX-304.01"],
    fixture_focus: ["set_transient", "get_transient", "timeout/value pairing", "site transients", "feed cache bridge"]
  },
  {
    external_ref: "WPHX-304.04",
    title: "Build object cache runtime/drop-in fixture harness",
    depends_on: ["WPHX-304.01"],
    fixture_focus: ["wp_cache_add/set/get/delete", "groups", "found references", "flush runtime/group", "drop-in compatibility"]
  },
  {
    external_ref: "WPHX-304.05",
    title: "Build serialization, cache salt, and invalidation fixture harness",
    depends_on: ["WPHX-304.01"],
    fixture_focus: ["maybe_serialize", "maybe_unserialize", "wp_cache_set_last_changed", "salted cache helpers", "cache suspension"]
  },
  {
    external_ref: "WPHX-304.06",
    title: "Build settings/default-option registry fixture harness",
    depends_on: ["WPHX-304.01"],
    fixture_focus: ["register_setting", "unregister_setting", "get_registered_settings", "filter_default_option"]
  },
  {
    external_ref: "WPHX-304.07",
    title: "Promote first pure options/cache helpers to Haxe parity candidates",
    depends_on: ["WPHX-304.02", "WPHX-304.04", "WPHX-304.05"],
    fixture_focus: ["autoload value normalization", "serialization predicates", "cache key validation", "object-cache pure branches"]
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-304-surface`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/options-cache-surface",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "options/transients/object-cache surface",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 option, transient, site/network option, object-cache, drop-in compatibility, serialization, and cache invalidation PHP ABI remain oracle-owned until per-slice Haxe parity candidates replace them."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: PRIMARY_SOURCE_UNITS.map((unit) => unit.path),
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-options-cache-surface.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-304-surface",
        "npm run wp:core:wphx-304-surface:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-304-01-options-cache-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "This first WPHX-304 slice inventories the oracle surface and fixture entry points only. Runtime storage/cache logic remains external_oracle until later WPHX-304.x slices create Haxe parity candidates and replacement gates."
  };
}

const sourceInventory = readJsonl(SOURCE_INVENTORY);
const testInventory = readJsonl(TEST_INVENTORY);
const abi = readJson(ABI);
const sourceUnits = PRIMARY_SOURCE_UNITS.map((unit) => sourceRecord(sourceInventory, unit));
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
  schema: "wphx.wp-core-options-cache-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-options-cache-surface.mjs",
  inputs: {
    source_inventory: inputRecord(SOURCE_INVENTORY),
    test_inventory: inputRecord(TEST_INVENTORY),
    php_abi: inputRecord(ABI),
    upstream_repo: UPSTREAM_ROOT,
    upstream_ref: WP_REF,
    upstream_digest: upstreamDigest
  },
  source_units: sourceUnits,
  deferred_cross_domain_behaviors: DEFERRED_CROSS_DOMAIN_BEHAVIORS,
  domains,
  public_symbol_count: publicSymbols.length,
  public_symbol_names: uniqueSorted(publicSymbols.map((symbol) => symbol.name)),
  upstream_test_count: domains.reduce((total, domain) => total + domain.test_count, 0),
  first_fixture_targets: [
    {
      id: "option-storage-autoload",
      issue_external_ref: "WPHX-304.02",
      symbols: ["get_option", "add_option", "update_option", "delete_option", "wp_load_alloptions"],
      oracle_focus: "Database storage, false/default contracts, serialization, alloptions/notoptions cache state, and autoload decisions"
    },
    {
      id: "transient-expiration",
      issue_external_ref: "WPHX-304.03",
      symbols: ["set_transient", "get_transient", "delete_transient", "set_site_transient"],
      oracle_focus: "Timeout/value pairing, expiration behavior, no-timeout updates, site transient cache groups, and feed-cache transient bridge"
    },
    {
      id: "object-cache-runtime-dropin",
      issue_external_ref: "WPHX-304.04",
      symbols: ["wp_cache_add", "wp_cache_get", "wp_cache_set", "wp_cache_delete", "wp_cache_supports"],
      oracle_focus: "Default runtime cache mutations, group scoping, found-reference behavior, flush semantics, persistent drop-in compatibility, and bootstrap order"
    },
    {
      id: "serialization-cache-salt",
      issue_external_ref: "WPHX-304.05",
      symbols: ["maybe_serialize", "maybe_unserialize", "wp_cache_get_last_changed", "wp_cache_get_salted"],
      oracle_focus: "PHP-native serialization boundaries, cache salt freshness, last_changed action hooks, and cache suspension globals"
    },
    {
      id: "settings-defaults",
      issue_external_ref: "WPHX-304.06",
      symbols: ["register_setting", "unregister_setting", "get_registered_settings", "filter_default_option"],
      oracle_focus: "Settings registry globals, default option filters, sanitization callbacks, and REST-schema bridge boundaries"
    }
  ],
  follow_up_slices: FOLLOW_UP_SLICES,
  validation_result: {
    status: "passed",
    source_units: sourceUnits.length,
    deferred_cross_domain_behaviors: DEFERRED_CROSS_DOMAIN_BEHAVIORS.length,
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
  id: "receipt:wphx-304-01-options-cache-surface",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WPHX-304.01 generated domain surface manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for this first domain surface"
    },
    {
      path: "tools/wp-core/run-options-cache-surface.mjs",
      role: "deterministic generator and drift check"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-304-surface",
    "npm run wp:core:wphx-304-surface:check",
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
