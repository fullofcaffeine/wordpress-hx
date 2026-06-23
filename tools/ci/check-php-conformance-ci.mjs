#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const checkOnly = process.argv.includes("--check");
const WORKFLOW = ".github/workflows/php-conformance.yml";
const OUT = "manifests/ci/wphx-208-php-conformance-ci.v1.json";
const RECEIPT = "receipts/ci/wphx-208-php-conformance-ci.v1.json";
const PARITY_GATES_OUT = "manifests/operations/wphx-700-04-ci-parity-gates.v1.json";
const PARITY_GATES_RECEIPT = "receipts/operations/wphx-700-04-ci-parity-gates.v1.json";
const RECORDED_AT = "2026-06-20T19:40:00.000Z";

const REQUIRED_PATHS = [
  ".github/workflows/php-conformance.yml",
  "src/**",
  "fixtures/**",
  "profiles/**",
  "tools/**",
  "scripts/**",
  "manifests/**",
  "receipts/**",
  "package.json",
  "package-lock.json",
  "toolchain.lock.json",
  "hxformat.json"
];

const REQUIRED_COMMANDS = [
  "npm run format:haxe:check",
  "npm run haxe:escape-hatches:check",
  "npm run build:profiles:check",
  "npm run baseline:validate",
  "npm run ci:php-conformance:check",
  "npm run php:smoke:check",
  "npm run php:facade:f1:check",
  "npm run php:facade:f2:check",
  "npm run php:facade:f3:check",
  "npm run php:facade:f4:check",
  "npm run php:facade:f5:check",
  "npm run php:facade:f6:check",
  "npm run php:facade:f7:check",
  "npm run php:abi:check",
  "npm run wp:macro:bindings:check",
  "npm run wp:boundary:check",
  "npm run wp:bootstrap:trace:check",
  "npm run wp:facade:globals:check",
  "npm run wp:hooks:surface:check",
  "npm run wp:hooks:parity-candidate:check",
  "npm run wp:hooks:runtime-boundary:check",
  "npm run wp:hooks:shell-emitter:check",
  "npm run wp:hooks:distribution-surface:check",
  "npm run wp:linker:check",
  "npm run wp:public-types:check",
  "npm run wp:debug:sourcemap:check",
  "npm run generated-php:lowering-snapshots:check",
  "npm run wp:core:wphx-303-wp-error:check",
  "npm run wp:core:wphx-304-option-cache-candidate:check",
  "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
  "npm run wp:core:wphx-305-prepare-escaping-strategy-candidate:check",
  "npm run wp:core:wphx-311-rest-settings-controller:check",
  "npm run wp:core:wphx-311-rest-settings-dispatch:check",
  "npm run wp:core:wphx-311-rest-settings-schema-candidate:check",
  "npm run wp:core:wphx-311-rest-settings-value-candidate:check",
  "npm run wp:core:wphx-311-rest-settings-update-candidate:check",
  "npm run wp:core:wphx-311-rest-server-dispatch-candidate:check",
  "npm run wp:core:wphx-311-rest-server-packaged-http:check",
  "npm run wp:core:wphx-311-rest-server-web-e2e:check",
  "npm run wp:core:wphx-311-rest-server-installed-browser:check",
  "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback:check",
  "npm run wp:core:wphx-307-posts-query-adapter-contract-candidate:check",
  "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate:check",
  "npm run wp:core:wphx-307-post-meta-cache-adapter-contract-candidate:check",
  "npm run wp:core:wphx-307-post-revision-adapter-contract-candidate:check",
  "npm run wp:core:wphx-307-wp-query-runtime-fixture:check",
  "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate:check",
  "npm run wp:core:wphx-308-taxonomy-comment-crud:check",
  "npm run wp:core:wphx-308-taxonomy-comment-count-cache:check",
  "npm run wp:core:wphx-308-taxonomy-comment-query-state:check",
  "npm run php:db-client-images:check",
  "npm run wp:core:wphx-305-live-db:check",
  "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
  "npm run wp:core:wphx-307-wp-query-live-db:check",
  "npm run wp:core:wphx-308-taxonomy-comment-live-db:check",
  "npm run wp:core:wphx-311-rest-server-db-browser:check"
];

const REQUIRED_SUITES = [
  "hygiene-and-manifests",
  "php-feasibility",
  "wp-abi-and-macros",
  "wp-runtime-and-linker",
  "wp-core-deterministic-parity",
  "wp-core-live-db-parity"
];

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function npmScriptName(command) {
  return command.startsWith("npm run ") ? command.slice("npm run ".length) : null;
}

const workflowText = readFileSync(WORKFLOW, "utf8");
const packageJson = readJson("package.json");
const toolchain = readJson("toolchain.lock.json");
const errors = [];
const lockedPhpCliVersion = toolchain.tools.php_cli.version;

for (const path of REQUIRED_PATHS) {
  if (!workflowText.includes(`"${path}"`)) {
    errors.push(`workflow missing trigger path ${path}`);
  }
}

for (const suite of REQUIRED_SUITES) {
  if (!workflowText.includes(`suite: ${suite}`)) {
    errors.push(`workflow missing matrix suite ${suite}`);
  }
}

for (const command of REQUIRED_COMMANDS) {
  if (!workflowText.includes(command)) {
    errors.push(`workflow missing command ${command}`);
  }
  const script = npmScriptName(command);
  if (script && !packageJson.scripts?.[script]) {
    errors.push(`package.json missing script ${script}`);
  }
}

const requiredText = [
  "pull_request:",
  "push:",
  "workflow_dispatch:",
  "branches:",
  "main",
  "runs-on: ubuntu-24.04",
  "fail-fast: false",
  "actions/checkout@v4",
  "actions/setup-node@v4",
  "actions/upload-artifact@v4",
  "shivammathur/setup-php@v2",
  "krdlab/setup-haxe@v2",
  'node-version: "20.19.3"',
  `php-version: "${lockedPhpCliVersion}"`,
  'haxe-version: "4.3.7"',
  "npm ci",
  "haxelib setup",
  "haxelib install formatter 1.18.0 --quiet",
  "git clone --depth 1 --branch 7.0.0 https://github.com/WordPress/wordpress-develop.git ../wordpress-develop",
  "26b68024931348d267b70e2a29910e1320d0094f",
  "docker pull",
  "if-no-files-found: ignore",
  "build/**",
  "manifests/wp-core/**",
  "receipts/wp-core/**"
];

for (const needle of requiredText) {
  if (!workflowText.includes(needle)) {
    errors.push(`workflow missing required text ${needle}`);
  }
}

for (const image of [
  toolchain.container_images.php_8_4_cli,
  toolchain.container_images.php_8_5_cli,
  toolchain.container_images.php_8_4_db_client,
  toolchain.container_images.php_8_5_db_client,
  toolchain.container_images.mysql_8_4,
  toolchain.container_images.mariadb_11_8
]) {
  const reference = image.registry === "local" ? `${image.repository}:${image.tag}` : `${image.repository}@${image.index_digest}`;
  if (!workflowText.includes(reference)) {
    errors.push(`workflow missing pinned Docker image ${reference}`);
  }
}

if (errors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors }, null, 2));
  process.exit(1);
}

const workflowSha = sha256(workflowText);
const manifest = {
  schema: "wphx.php-conformance-ci.v1",
  issue: "WPHX-208",
  generated_at: RECORDED_AT,
  generator: "tools/ci/check-php-conformance-ci.mjs",
  workflow: {
    path: WORKFLOW,
    sha256: workflowSha,
    triggers: ["pull_request", "push:main", "workflow_dispatch"],
    path_filters: REQUIRED_PATHS,
    matrix_suites: REQUIRED_SUITES,
    required_commands: REQUIRED_COMMANDS
  },
  toolchain: {
    node_version: "20.19.3",
    php_version: "8.4",
    haxe_version: toolchain.tools.haxe.version,
    haxe_formatter_version: toolchain.tools.haxe_formatter.version,
    docker_images: [
      {
        id: "php_8_4_cli",
        reference: `${toolchain.container_images.php_8_4_cli.repository}@${toolchain.container_images.php_8_4_cli.index_digest}`
      },
      {
        id: "php_8_5_cli",
        reference: `${toolchain.container_images.php_8_5_cli.repository}@${toolchain.container_images.php_8_5_cli.index_digest}`
      },
      {
        id: "php_8_4_db_client",
        reference: `${toolchain.container_images.php_8_4_db_client.repository}:${toolchain.container_images.php_8_4_db_client.tag}`,
        base_reference: `${toolchain.container_images.php_8_4_cli.repository}@${toolchain.container_images.php_8_4_cli.index_digest}`,
        dockerfile: toolchain.container_images.php_8_4_db_client.dockerfile
      },
      {
        id: "php_8_5_db_client",
        reference: `${toolchain.container_images.php_8_5_db_client.repository}:${toolchain.container_images.php_8_5_db_client.tag}`,
        base_reference: `${toolchain.container_images.php_8_5_cli.repository}@${toolchain.container_images.php_8_5_cli.index_digest}`,
        dockerfile: toolchain.container_images.php_8_5_db_client.dockerfile
      },
      {
        id: "mysql_8_4",
        reference: `${toolchain.container_images.mysql_8_4.repository}@${toolchain.container_images.mysql_8_4.index_digest}`
      },
      {
        id: "mariadb_11_8",
        reference: `${toolchain.container_images.mariadb_11_8.repository}@${toolchain.container_images.mariadb_11_8.index_digest}`
      }
    ]
  },
  validation_result: {
    status: "passed",
    workflow_exists: true,
    target_runtime_path_filters: true,
    conformance_matrix: true,
    required_commands_present: true,
    locked_toolchain_versions_present: true,
    pinned_php_docker_images_present: true,
    pinned_database_docker_images_present: true,
    conformance_artifacts_uploaded: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.php-conformance-ci-receipt.v1",
  id: "receipt:wphx-208-php-conformance-ci",
  issue: "WPHX-208",
  recorded_at: RECORDED_AT,
  command: "npm run ci:php-conformance",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  workflow: WORKFLOW,
  workflow_sha256: workflowSha,
  matrix_suites: REQUIRED_SUITES.length,
  required_commands: REQUIRED_COMMANDS.length
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";
const parityGatesManifest = {
  schema: "wphx.operation-ci-parity-gates.v1",
  issue: "WPHX-700.04",
  generated_at: RECORDED_AT,
  generator: "tools/ci/check-php-conformance-ci.mjs",
  source_manifest: {
    path: OUT,
    sha256: sha256(manifestText)
  },
  workflow: {
    path: WORKFLOW,
    sha256: workflowSha,
    deterministic_suite: "wp-core-deterministic-parity",
    live_db_suite: "wp-core-live-db-parity",
    artifact_upload: "actions/upload-artifact@v4"
  },
  evidence_classes: ["generated_shape", "targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
  artifact_scopes: ["helper", "minimized_fixture", "bridge_shell", "linked_candidate", "packaged_distribution"],
  required_parity_commands: [
    "npm run generated-php:lowering-snapshots:check",
    "npm run wp:core:wphx-303-wp-error:check",
    "npm run wp:core:wphx-304-option-cache-candidate:check",
    "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
    "npm run wp:core:wphx-305-prepare-escaping-strategy-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-controller:check",
    "npm run wp:core:wphx-311-rest-settings-dispatch:check",
    "npm run wp:core:wphx-311-rest-settings-schema-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-value-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-update-candidate:check",
    "npm run wp:core:wphx-311-rest-server-dispatch-candidate:check",
    "npm run wp:core:wphx-311-rest-server-packaged-http:check",
    "npm run wp:core:wphx-311-rest-server-web-e2e:check",
    "npm run wp:core:wphx-311-rest-server-installed-browser:check",
    "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback:check",
    "npm run wp:core:wphx-307-posts-query-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-meta-cache-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-revision-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-wp-query-runtime-fixture:check",
    "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate:check",
    "npm run wp:core:wphx-308-taxonomy-comment-crud:check",
    "npm run wp:core:wphx-308-taxonomy-comment-count-cache:check",
    "npm run wp:core:wphx-308-taxonomy-comment-query-state:check",
    "npm run wp:core:wphx-305-live-db:check",
    "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
    "npm run wp:core:wphx-307-wp-query-live-db:check",
    "npm run wp:core:wphx-308-taxonomy-comment-live-db:check",
    "npm run wp:core:wphx-311-rest-server-db-browser:check"
  ],
  validation_result: {
    status: "passed",
    deterministic_wordpress_core_suite_present: true,
    live_db_wordpress_core_suite_present: true,
    generated_php_lowering_gate_required: true,
    wphx_303_candidate_gate_required: true,
    wphx_304_candidate_gate_required: true,
    wphx_305_generated_shape_gate_required: true,
    wphx_305_prepare_escaping_strategy_gate_required: true,
    wphx_311_rest_settings_controller_gate_required: true,
    wphx_311_rest_settings_dispatch_gate_required: true,
    wphx_311_rest_settings_schema_candidate_gate_required: true,
    wphx_311_rest_settings_value_candidate_gate_required: true,
    wphx_311_rest_settings_update_candidate_gate_required: true,
    wphx_311_rest_server_dispatch_candidate_gate_required: true,
    wphx_311_rest_server_packaged_http_gate_required: true,
    wphx_311_rest_server_web_e2e_gate_required: true,
    wphx_311_rest_server_installed_browser_gate_required: true,
    wphx_311_rest_server_db_browser_gate_required: true,
    wphx_700_08_packaged_distribution_abi_gate_required: true,
    wphx_305_live_db_candidate_gate_required: true,
    wphx_307_wp_query_live_db_gate_required: true,
    wphx_308_taxonomy_comment_adapter_contract_gate_required: true,
    wphx_308_taxonomy_comment_crud_gate_required: true,
    wphx_308_taxonomy_comment_count_cache_gate_required: true,
    wphx_308_taxonomy_comment_query_state_gate_required: true,
    wphx_308_taxonomy_comment_live_db_gate_required: true,
    mysql_mariadb_images_pinned: true,
    conformance_artifacts_uploaded: true
  }
};
const parityGatesManifestText = JSON.stringify(parityGatesManifest, null, 2) + "\n";
const parityGatesReceipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-700-04-ci-parity-gates",
  issue: {
    id: "wordpresshx-w91.3.4",
    external_ref: "WPHX-700.04",
    title: "WPHX-700.04 — Add WPHX parity gates to required CI"
  },
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: PARITY_GATES_OUT,
      role: "CI parity gate hardening manifest"
    },
    {
      path: OUT,
      role: "PHP conformance workflow manifest with required WPHX parity suites"
    },
    {
      path: ".github/workflows/php-conformance.yml",
      role: "GitHub Actions workflow requiring deterministic and live WordPress core parity gates"
    },
    {
      path: "tools/ci/check-php-conformance-ci.mjs",
      role: "workflow validator that rejects missing parity gates and artifact uploads"
    }
  ],
  verification_commands: [
    "npm run ci:php-conformance",
    "npm run ci:php-conformance:check",
    "npm run generated-php:lowering-snapshots:check",
    "npm run wp:core:wphx-303-wp-error:check",
    "npm run wp:core:wphx-304-option-cache-candidate:check",
    "npm run wp:core:wphx-305-mysqli-global-lowering-proof:check",
    "npm run wp:core:wphx-311-rest-settings-controller:check",
    "npm run wp:core:wphx-311-rest-settings-dispatch:check",
    "npm run wp:core:wphx-311-rest-settings-schema-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-value-candidate:check",
    "npm run wp:core:wphx-311-rest-settings-update-candidate:check",
    "npm run wp:core:wphx-311-rest-server-dispatch-candidate:check",
    "npm run wp:core:wphx-311-rest-server-packaged-http:check",
    "npm run wp:core:wphx-311-rest-server-web-e2e:check",
    "npm run wp:core:wphx-311-rest-server-installed-browser:check",
    "npm run wp:core:wphx-311-rest-server-db-browser:check",
    "npm run wp:core:wphx-307-posts-query-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-crud-status-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-meta-cache-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-post-revision-adapter-contract-candidate:check",
    "npm run wp:core:wphx-307-wp-query-runtime-fixture:check",
    "npm run wp:core:wphx-307-wp-query-live-db:check",
    "npm run wp:core:wphx-308-taxonomy-comment-adapter-contract-candidate:check",
    "npm run wp:core:wphx-308-taxonomy-comment-crud:check",
    "npm run wp:core:wphx-308-taxonomy-comment-count-cache:check",
    "npm run wp:core:wphx-308-taxonomy-comment-query-state:check",
    "npm run wp:core:wphx-308-taxonomy-comment-live-db:check",
    "npm run wp:core:wphx-700-wpdb-packaged-abi-no-fallback:check",
    "npm run wp:core:wphx-305-db-connect-strategy-candidate:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  validation_result: parityGatesManifest.validation_result
};
const parityGatesReceiptText = JSON.stringify(parityGatesReceipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText],
    [PARITY_GATES_OUT, parityGatesManifestText],
    [PARITY_GATES_RECEIPT, parityGatesReceiptText]
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, suites: REQUIRED_SUITES.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
mkdirSync(dirname(PARITY_GATES_OUT), { recursive: true });
mkdirSync(dirname(PARITY_GATES_RECEIPT), { recursive: true });
writeFileSync(PARITY_GATES_OUT, parityGatesManifestText);
writeFileSync(PARITY_GATES_RECEIPT, parityGatesReceiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, suites: REQUIRED_SUITES.length }, null, 2));
