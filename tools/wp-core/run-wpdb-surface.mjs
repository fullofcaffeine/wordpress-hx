#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.9.1",
  external_ref: "WPHX-305.01",
  title: "Inventory wpdb/database surface"
};
const OUT = "manifests/wp-core/wphx-305-01-wpdb-surface.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-305-01-wpdb-surface.v1.json";
const RECEIPT = "receipts/wp-core/wphx-305-01-wpdb-surface.v1.json";
const RECORDED_AT = "2026-06-21T00:40:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const SOURCE_INVENTORY = "manifests/source-inventory.jsonl";
const TEST_INVENTORY = "manifests/test-inventory.jsonl";
const ABI = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const DB_BASELINE_RECEIPT = "receipts/oracle/wphx-008-db-baseline.v1.json";
const BASELINE = "wordpress-7.0.0";
const UPSTREAM_ROOT = "../wordpress-develop";

const PRIMARY_SOURCE_UNITS = [
  {
    path: "src/wp-includes/class-wpdb.php",
    category: "wpdb_core",
    role: "WordPress database abstraction class, public state, query execution, escaping, field processing, charset/collation, table-prefix, and native mysqli boundaries"
  },
  {
    path: "src/wp-includes/wp-db.php",
    category: "wpdb_bootstrap",
    role: "Global wpdb bootstrap wrapper that loads class-wpdb.php and instantiates $wpdb"
  },
  {
    path: "src/wp-includes/load.php",
    category: "wpdb_bootstrap",
    role: "Database bootstrap helpers require_wp_db() and wp_set_wpdb_vars()"
  },
  {
    path: "src/wp-includes/formatting.php",
    category: "wpdb_escaping",
    role: "esc_sql() public escaping facade backed by the global wpdb instance"
  },
  {
    path: "src/wp-includes/functions.php",
    category: "wpdb_error_boundary",
    role: "dead_db() unavailable-database display boundary"
  },
  {
    path: "src/wp-admin/includes/upgrade.php",
    category: "schema_upgrade",
    role: "dbDelta(), maybe_create_table(), maybe_add_column(), and make_db_current() schema-upgrade helpers"
  },
  {
    path: "src/wp-admin/install-helper.php",
    category: "schema_upgrade_legacy",
    role: "Legacy guarded maybe_create_table() and maybe_add_column() install helpers"
  },
  {
    path: "src/wp-admin/includes/schema.php",
    category: "schema_upgrade",
    role: "Core schema provider used by make_db_current() and dbDelta() upgrade flows"
  },
  {
    path: "src/wp-includes/option.php",
    category: "wpdb_consumer_integration",
    role: "Option, transient, and site-option storage paths whose WPHX-304 fixtures currently use deterministic wpdb doubles"
  }
];

const NATIVE_BOUNDARIES = [
  {
    id: "mysqli-driver",
    owner: "php-native",
    source_path: "src/wp-includes/class-wpdb.php",
    symbols: [
      "wpdb::db_connect",
      "wpdb::_do_query",
      "wpdb::_real_escape",
      "wpdb::select",
      "wpdb::set_charset",
      "wpdb::db_version",
      "wpdb::db_server_info"
    ],
    reason:
      "Runtime query execution, connection state, escaping, and server capability discovery cross into PHP mysqli and an actual MySQL-compatible server."
  },
  {
    id: "db-dropin",
    owner: "wordpress-plugin-boundary",
    source_path: "src/wp-includes/wp-db.php",
    symbols: ["$wpdb", "wp-content/db.php"],
    reason:
      "WordPress allows a custom wp-content/db.php drop-in or replacement global $wpdb object. Public ABI and generated PHP must preserve that replacement seam."
  },
  {
    id: "fatal-database-template",
    owner: "php-output-boundary",
    source_path: "src/wp-includes/functions.php",
    symbols: ["dead_db"],
    reason:
      "The unavailable-database path emits headers and HTML. Port candidates should isolate display side effects behind a narrow boundary."
  }
];

const DEFERRED_CROSS_DOMAIN_BEHAVIORS = [
  {
    id: "metadata-query-sql-consumers",
    source_paths: ["src/wp-includes/meta.php", "src/wp-includes/class-wp-meta-query.php"],
    deferred_to: "WPHX-307/WPHX-308",
    reason:
      "Meta SQL assembly and cache invalidation consume wpdb but belong with their domain query APIs after the database core fixture harness is stable."
  },
  {
    id: "posts-terms-comments-users-query-consumers",
    source_paths: [
      "src/wp-includes/class-wp-query.php",
      "src/wp-includes/class-wp-term-query.php",
      "src/wp-includes/class-wp-comment-query.php",
      "src/wp-includes/class-wp-user-query.php"
    ],
    deferred_to: "WPHX-309/WPHX-312",
    reason:
      "High-level query builders are database consumers with their own public contracts, SQL clauses, cache behavior, and fixture suites."
  },
  {
    id: "multisite-network-install",
    source_paths: ["src/wp-admin/includes/upgrade.php", "src/wp-includes/ms-load.php", "src/wp-includes/ms-settings.php"],
    deferred_to: "WPHX-317",
    reason:
      "Multisite table creation, network bootstrap, and sitemeta storage depend on the WPHX-305 database core plus multisite routing state."
  }
];

const CORE_STATE_SYMBOLS = [
  "wpdb",
  "__construct",
  "__get",
  "__isset",
  "__set",
  "__unset",
  "flush",
  "show_errors",
  "hide_errors",
  "suppress_errors",
  "print_error",
  "bail",
  "timer_start",
  "timer_stop",
  "get_caller"
];

const STATE_PROPERTIES = [
  "show_errors",
  "suppress_errors",
  "last_error",
  "num_queries",
  "num_rows",
  "rows_affected",
  "insert_id",
  "last_query",
  "last_result",
  "result",
  "col_meta",
  "table_charset",
  "check_current_query",
  "checking_collation",
  "col_info",
  "queries",
  "reconnect_retries",
  "prefix",
  "base_prefix",
  "ready",
  "blogid",
  "siteid",
  "tables",
  "global_tables",
  "ms_global_tables",
  "old_tables",
  "old_ms_global_tables",
  "field_types",
  "charset",
  "collate",
  "dbh",
  "func_call",
  "is_mysql",
  "allow_unsafe_unquoted_parameters"
];

const BOOTSTRAP_SYMBOLS = [
  "require_wp_db",
  "wp_set_wpdb_vars",
  "dead_db",
  "db_connect",
  "select",
  "check_connection",
  "close",
  "init_charset",
  "set_sql_mode",
  "has_cap",
  "check_database_version",
  "db_version",
  "db_server_info",
  "parse_db_host"
];

const PREPARE_ESCAPE_SYMBOLS = [
  "prepare",
  "esc_like",
  "escape",
  "escape_by_ref",
  "_escape",
  "_weak_escape",
  "_real_escape",
  "quote_identifier",
  "_escape_identifier_value",
  "placeholder_escape",
  "add_placeholder_escape",
  "remove_placeholder_escape",
  "esc_sql"
];

const QUERY_RESULT_SYMBOLS = [
  "query",
  "_do_query",
  "log_query",
  "get_var",
  "get_row",
  "get_col",
  "get_results",
  "get_col_info",
  "load_col_info"
];

const WRITE_FIELD_SYMBOLS = [
  "insert",
  "replace",
  "_insert_replace_helper",
  "update",
  "delete",
  "process_fields",
  "process_field_formats",
  "process_field_charsets",
  "process_field_lengths",
  "check_ascii",
  "strip_invalid_text",
  "strip_invalid_text_for_column",
  "strip_invalid_text_from_query",
  "get_col_charset",
  "get_col_length"
];

const CHARSET_COLLATION_SYMBOLS = [
  "determine_charset",
  "set_charset",
  "get_charset_collate",
  "supports_collation",
  "get_table_charset",
  "check_safe_collation",
  "check_ascii",
  "strip_invalid_text",
  "strip_invalid_text_for_column",
  "strip_invalid_text_from_query"
];

const PREFIX_TABLE_SYMBOLS = [
  "set_prefix",
  "set_blog_id",
  "get_blog_prefix",
  "tables",
  "posts",
  "comments",
  "links",
  "options",
  "postmeta",
  "terms",
  "term_taxonomy",
  "term_relationships",
  "termmeta",
  "users",
  "usermeta",
  "blogs",
  "blogmeta",
  "registration_log",
  "signups",
  "site",
  "sitemeta"
];

const SCHEMA_UPGRADE_SYMBOLS = [
  "dbDelta",
  "maybe_create_table",
  "maybe_add_column",
  "make_db_current",
  "make_db_current_silent",
  "wp_get_db_schema"
];

const OPTION_STORAGE_SYMBOLS = [
  "get_option",
  "get_options",
  "wp_prime_option_caches",
  "wp_prime_option_caches_by_group",
  "wp_set_option_autoload_values",
  "wp_set_options_autoload",
  "wp_set_option_autoload",
  "wp_load_alloptions",
  "add_option",
  "update_option",
  "delete_option",
  "get_site_option",
  "add_site_option",
  "update_site_option",
  "delete_site_option",
  "get_network_option",
  "add_network_option",
  "update_network_option",
  "delete_network_option",
  "get_transient",
  "set_transient",
  "delete_transient",
  "get_site_transient",
  "set_site_transient",
  "delete_site_transient"
];

const DOMAINS = [
  {
    id: "wpdb_public_state",
    label: "wpdb class, constants, public state, magic access, errors, and timing",
    source_paths: ["src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/class-wpdb.php" &&
      (entry.kind === "constant" ||
        CORE_STATE_SYMBOLS.includes(entry.local_name ?? entry.name) ||
        (entry.kind === "property" && STATE_PROPERTIES.includes(entry.local_name ?? entry.name))),
    test_paths: ["tests/phpunit/tests/db.php"],
    risk_tags: ["public-mutable-state", "dynamic-properties", "magic-access", "error-reporting", "query-timing"],
    fixture_seeds: ["wpdb::__construct", "wpdb::__get", "wpdb::show_errors", "wpdb::print_error", "wpdb::flush"]
  },
  {
    id: "bootstrap_connection",
    label: "Database bootstrap, connection, server capability, and unavailable database boundaries",
    source_paths: ["src/wp-includes/wp-db.php", "src/wp-includes/load.php", "src/wp-includes/functions.php", "src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) =>
      ["src/wp-includes/wp-db.php", "src/wp-includes/load.php", "src/wp-includes/functions.php", "src/wp-includes/class-wpdb.php"].includes(
        entry.path
      ) && BOOTSTRAP_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db.php"],
    risk_tags: ["global-wpdb", "db-dropin", "mysqli-connection", "server-capabilities", "fatal-output-boundary"],
    fixture_seeds: ["require_wp_db", "wp_set_wpdb_vars", "wpdb::db_connect", "wpdb::parse_db_host", "dead_db"]
  },
  {
    id: "prepare_escaping",
    label: "SQL preparation, placeholders, identifier quoting, and escaping",
    source_paths: ["src/wp-includes/class-wpdb.php", "src/wp-includes/formatting.php"],
    symbol_filter: (entry) =>
      (entry.path === "src/wp-includes/class-wpdb.php" || entry.path === "src/wp-includes/formatting.php") &&
      PREPARE_ESCAPE_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db.php", "tests/phpunit/tests/db/realEscape.php"],
    risk_tags: ["sql-injection", "placeholder-parsing", "identifier-quoting", "by-reference-escaping", "mysqli-native-escape"],
    fixture_seeds: ["wpdb::prepare", "wpdb::quote_identifier", "wpdb::esc_like", "esc_sql", "wpdb::escape_by_ref"]
  },
  {
    id: "query_execution_results",
    label: "Query execution, result retrieval, public result state, and query logging",
    source_paths: ["src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/class-wpdb.php" && QUERY_RESULT_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db.php"],
    related_test_paths: ["tests/phpunit/tests/query/cacheResults.php", "tests/phpunit/tests/query/noFoundRows.php"],
    risk_tags: ["mysqli-result-shape", "object-array-output", "last-result-state", "rows-affected", "error-state", "query-logging"],
    fixture_seeds: ["wpdb::query", "wpdb::get_var", "wpdb::get_row", "wpdb::get_col", "wpdb::get_results"]
  },
  {
    id: "write_process_fields",
    label: "Insert, replace, update, delete, field formats, and invalid text guards",
    source_paths: ["src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/class-wpdb.php" && WRITE_FIELD_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db.php", "tests/phpunit/tests/db/charset.php"],
    risk_tags: ["write-sql-shape", "format-coercion", "null-handling", "charset-length-guards", "insert-id", "affected-rows"],
    fixture_seeds: ["wpdb::insert", "wpdb::replace", "wpdb::update", "wpdb::delete", "wpdb::process_fields"]
  },
  {
    id: "charset_collation",
    label: "Charset, collation, safe-collation checks, and invalid text stripping",
    source_paths: ["src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) => entry.path === "src/wp-includes/class-wpdb.php" && CHARSET_COLLATION_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db/charset.php", "tests/phpunit/tests/db.php"],
    risk_tags: ["charset-negotiation", "collation-safety", "text-stripping", "table-metadata", "mysql-server-capability"],
    fixture_seeds: ["wpdb::determine_charset", "wpdb::set_charset", "wpdb::get_charset_collate", "wpdb::get_table_charset"]
  },
  {
    id: "tables_prefix_multisite",
    label: "Table lists, prefixes, blog switching, and multisite table state",
    source_paths: ["src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/class-wpdb.php" &&
      (PREFIX_TABLE_SYMBOLS.includes(entry.local_name ?? entry.name) ||
        (entry.kind === "property" && PREFIX_TABLE_SYMBOLS.includes((entry.local_name ?? entry.name).replace(/^\$/, "")))),
    test_paths: ["tests/phpunit/tests/db.php", "tests/phpunit/tests/option/multisite.php"],
    risk_tags: ["table-prefix", "blog-switch", "multisite", "global-tables", "sitemeta"],
    fixture_seeds: ["wpdb::set_prefix", "wpdb::set_blog_id", "wpdb::get_blog_prefix", "wpdb::tables"]
  },
  {
    id: "schema_upgrade_helpers",
    label: "dbDelta, table creation, column creation, and current schema helpers",
    source_paths: ["src/wp-admin/includes/upgrade.php", "src/wp-admin/install-helper.php", "src/wp-admin/includes/schema.php"],
    symbol_filter: (entry) =>
      ["src/wp-admin/includes/upgrade.php", "src/wp-admin/install-helper.php", "src/wp-admin/includes/schema.php"].includes(entry.path) &&
      SCHEMA_UPGRADE_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: ["tests/phpunit/tests/db/dbDelta.php"],
    related_test_paths: ["tests/phpunit/tests/db.php"],
    risk_tags: ["schema-diff", "ddl-parsing", "table-creation", "column-creation", "upgrade-path"],
    fixture_seeds: ["dbDelta", "maybe_create_table", "maybe_add_column", "make_db_current"]
  },
  {
    id: "option_storage_database_paths",
    label: "Option, transient, and site-option storage paths that consume wpdb",
    source_paths: ["src/wp-includes/option.php", "src/wp-includes/class-wpdb.php"],
    symbol_filter: (entry) =>
      entry.path === "src/wp-includes/option.php" && OPTION_STORAGE_SYMBOLS.includes(entry.local_name ?? entry.name),
    test_paths: [
      "tests/phpunit/tests/option/option.php",
      "tests/phpunit/tests/option/updateOption.php",
      "tests/phpunit/tests/option/getOptions.php",
      "tests/phpunit/tests/option/transient.php",
      "tests/phpunit/tests/option/siteTransient.php"
    ],
    risk_tags: ["wphx-304-gap", "database-storage", "autoload-cache", "site-options", "transient-timeouts"],
    fixture_seeds: ["get_option", "add_option", "update_option", "delete_option", "set_transient", "get_site_option"]
  }
];

const FIRST_FIXTURE_TARGETS = [
  {
    id: "prepare-escaping",
    issue_external_ref: "WPHX-305.02",
    symbols: ["wpdb::prepare", "wpdb::quote_identifier", "wpdb::esc_like", "esc_sql", "wpdb::escape_by_ref"],
    oracle_focus:
      "Placeholder parsing, %i identifier quoting, by-reference mutation, esc_sql facade behavior, and mysqli-native escape boundaries"
  },
  {
    id: "query-read-results",
    issue_external_ref: "WPHX-305.03",
    symbols: ["wpdb::query", "wpdb::get_var", "wpdb::get_row", "wpdb::get_col", "wpdb::get_results"],
    oracle_focus:
      "SELECT and non-SELECT query state, object/array result shapes, last_result/num_rows/rows_affected mutation, and error reporting"
  },
  {
    id: "write-process-fields",
    issue_external_ref: "WPHX-305.04",
    symbols: ["wpdb::insert", "wpdb::replace", "wpdb::update", "wpdb::delete", "wpdb::process_fields"],
    oracle_focus: "Write SQL generation, format coercion, NULL handling, invalid text guards, affected rows, and insert_id state"
  },
  {
    id: "charset-collation-prefix",
    issue_external_ref: "WPHX-305.05",
    symbols: ["wpdb::determine_charset", "wpdb::get_charset_collate", "wpdb::set_prefix", "wpdb::tables"],
    oracle_focus: "Charset/collation negotiation, server capability probes, table metadata, prefix mutation, and multisite table lists"
  },
  {
    id: "schema-option-storage-integration",
    issue_external_ref: "WPHX-305.06",
    symbols: ["dbDelta", "maybe_create_table", "get_option", "update_option", "set_transient"],
    oracle_focus:
      "Schema upgrade helpers plus real database-backed option/transient paths that WPHX-304 isolated behind deterministic wpdb doubles"
  }
];

const FOLLOW_UP_SLICES = [
  {
    external_ref: "WPHX-305.02",
    title: "Build prepare and escaping fixture harness",
    depends_on: ["WPHX-305.01"],
    fixture_focus: ["prepare placeholders", "identifier quoting", "esc_like", "esc_sql", "escape_by_ref"]
  },
  {
    external_ref: "WPHX-305.03",
    title: "Build query and read-result fixture harness",
    depends_on: ["WPHX-305.01"],
    fixture_focus: ["query", "get_var", "get_row", "get_col", "get_results", "result state"]
  },
  {
    external_ref: "WPHX-305.04",
    title: "Build write/process-field fixture harness",
    depends_on: ["WPHX-305.01"],
    fixture_focus: ["insert", "replace", "update", "delete", "process_fields", "invalid text"]
  },
  {
    external_ref: "WPHX-305.05",
    title: "Build charset/collation and prefix fixture harness",
    depends_on: ["WPHX-305.01"],
    fixture_focus: ["charset", "collation", "table charset", "prefixes", "multisite table lists"]
  },
  {
    external_ref: "WPHX-305.06",
    title: "Build dbDelta and option-storage database integration harness",
    depends_on: ["WPHX-305.01", "WPHX-305.02", "WPHX-305.03", "WPHX-305.04", "WPHX-305.05"],
    fixture_focus: ["dbDelta", "maybe_create_table", "maybe_add_column", "database-backed options", "transients"]
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
    signature_hash: entry.signature_hash ?? null,
    source_hash: entry.source_hash ?? null,
    parameter_count: entry.parameters?.length ?? 0,
    return_type: entry.return_type ?? null,
    visibility: entry.visibility ?? null
  };
}

function collectSymbols(abi, domain) {
  return abi.entries
    .filter((entry) => ["constant", "function", "class", "method", "property"].includes(entry.kind))
    .filter(domain.symbol_filter)
    .map((entry) => abiSymbol(entry, domain.id))
    .sort((a, b) => a.path.localeCompare(b.path) || (a.start_line ?? 0) - (b.start_line ?? 0) || a.name.localeCompare(b.name));
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-305-surface`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wpdb-surface",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "wpdb/database surface",
      area: "wp-includes/wp-admin",
      public_contract:
        "WordPress 7.0 wpdb public class, global $wpdb bootstrap, query/escaping/read/write/charset/table/schema APIs, and database-backed option storage paths remain oracle-owned until per-slice Haxe parity candidates replace them."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: PRIMARY_SOURCE_UNITS.map((unit) => unit.path),
      digest: upstreamDigest
    },
    native_boundaries: NATIVE_BOUNDARIES,
    owned_paths: ["tools/wp-core/run-wpdb-surface.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-305-surface",
        "npm run wp:core:wphx-305-surface:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-305-01-wpdb-surface"],
      manifest_digest: manifestSha
    },
    notes:
      "This first WPHX-305 slice inventories the oracle surface and fixture entry points only. Runtime database execution remains external_oracle and PHP-native until later WPHX-305.x slices add differential fixtures and Haxe promotion gates."
  };
}

const sourceInventory = readJsonl(SOURCE_INVENTORY);
const testInventory = readJsonl(TEST_INVENTORY);
const abi = readJson(ABI);
const dbBaseline = readJson(DB_BASELINE_RECEIPT);
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
  schema: "wphx.wp-core-wpdb-surface.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-wpdb-surface.mjs",
  inputs: {
    source_inventory: inputRecord(SOURCE_INVENTORY),
    test_inventory: inputRecord(TEST_INVENTORY),
    php_abi: inputRecord(ABI),
    db_baseline_receipt: inputRecord(DB_BASELINE_RECEIPT),
    db_baseline: {
      image: dbBaseline.result?.image?.image ?? null,
      mysql_version: dbBaseline.result?.query?.version ?? null,
      mysql_comment: dbBaseline.result?.query?.comment ?? null
    },
    upstream_repo: UPSTREAM_ROOT,
    upstream_ref: WP_REF,
    upstream_digest: upstreamDigest
  },
  source_units: sourceUnits,
  native_boundaries: NATIVE_BOUNDARIES,
  deferred_cross_domain_behaviors: DEFERRED_CROSS_DOMAIN_BEHAVIORS,
  domains,
  public_symbol_count: publicSymbols.length,
  public_symbol_names: uniqueSorted(publicSymbols.map((symbol) => symbol.name)),
  upstream_test_count: domains.reduce((total, domain) => total + domain.test_count, 0),
  first_fixture_targets: FIRST_FIXTURE_TARGETS,
  follow_up_slices: FOLLOW_UP_SLICES,
  validation_result: {
    status: "passed",
    source_units: sourceUnits.length,
    native_boundaries: NATIVE_BOUNDARIES.length,
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
  id: "receipt:wphx-305-01-wpdb-surface",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "WPHX-305.01 generated database surface manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for this first database surface"
    },
    {
      path: "tools/wp-core/run-wpdb-surface.mjs",
      role: "deterministic generator and drift check"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-305-surface",
    "npm run wp:core:wphx-305-surface:check",
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
