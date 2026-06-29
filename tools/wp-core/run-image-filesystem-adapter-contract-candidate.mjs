#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.19.5",
  external_ref: "WPHX-313.06",
  title: "WPHX-313.06 - Add image/filesystem adapter-contract candidate"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const HXML = "fixtures/wp-core/image-filesystem-adapter-contract-candidate.hxml";
const OUT_ROOT = "build/wp-core/wphx-313-06";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const ENTRY = `${HAXE_OUT}/index.php`;
const OUT = "manifests/wp-core/wphx-313-06-image-filesystem-adapter-contract-candidate.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-313-06-image-filesystem-adapter-contract-candidate.v1.json";
const RECEIPT = "receipts/wp-core/wphx-313-06-image-filesystem-adapter-contract-candidate.v1.json";
const RUNNER = "tools/wp-core/run-image-filesystem-adapter-contract-candidate.mjs";
const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/media/ImageFilesystemAdapterContract.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/ImageFilesystemAdapterContractCandidateEntry.hx"
];
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-313-01-media-filesystem-upload-surface.v1.json",
  "manifests/wp-core/wphx-313-02-media-upload-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-313-04-image-metadata-editor-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-313-05-filesystem-credentials-oracle-fixture.v1.json"
];

const EXPECTED = {
  "editor:none": "editor_no_implementation",
  "editor:mime": "editor_unsupported_mime",
  "editor:method": "editor_missing_method",
  "editor:output": "editor_output_fallback",
  "editor:load": "editor_load_error",
  "editor:selected": "editor_selected",
  "intermediate:no-size": "intermediate_no_size",
  "intermediate:no-editor": "intermediate_no_editor",
  "intermediate:resize-error": "intermediate_resize_error",
  "intermediate:save-error": "intermediate_save_error",
  "intermediate:ready": "intermediate_metadata_ready",
  "subsizes:non-image": "subsizes_non_image",
  "subsizes:all": "subsizes_all_registered",
  "subsizes:missing": "subsizes_missing_some",
  "subsizes:too-large": "subsizes_skip_too_large",
  "metadata:invalid": "metadata_invalid_attachment",
  "metadata:create": "metadata_create_from_file",
  "metadata:return": "metadata_return_existing",
  "metadata:missing": "metadata_make_missing",
  "credentials:filtered": "filesystem_credentials_filtered",
  "credentials:direct": "filesystem_credentials_direct",
  "credentials:password": "filesystem_credentials_accept_password",
  "credentials:ssh": "filesystem_credentials_accept_ssh_keys",
  "credentials:form": "filesystem_credentials_form",
  "credentials:error": "filesystem_credentials_error_form",
  "method:forced": "filesystem_method_forced",
  "method:owner": "filesystem_method_direct_file_owner",
  "method:relaxed": "filesystem_method_direct_relaxed",
  "method:ssh2": "filesystem_method_ssh2",
  "method:ftpext": "filesystem_method_ftpext",
  "method:ftpsockets": "filesystem_method_ftpsockets",
  "method:unavailable": "filesystem_method_unavailable",
  "io:write": "direct_io_write",
  "io:read": "direct_io_read",
  "io:copy": "direct_io_copy",
  "io:copy-reject": "direct_io_reject",
  "io:move-overwrite": "direct_io_move",
  "io:delete": "direct_io_delete",
  "io:dirlist": "direct_io_dirlist",
  "io:unknown": "direct_io_reject"
};

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
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

function stableGeneratedContents(data) {
  return data.toString("utf8").replace(/#(?:[A-Za-z]:)?[^#\r\n]*[/\\](std[/\\][^\r\n]*)/g, "#$HAXE_STD_PATH/$1");
}

function filesUnder(root) {
  const files = [];
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      if (entry.isFile()) {
        const stableContents = stableGeneratedContents(readFileSync(child));
        files.push({
          path: relative(root, child),
          bytes: Buffer.byteLength(stableContents),
          sha256: createHash("sha256").update(stableContents).digest("hex")
        });
      }
    }
  }
  visit(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sourceEscapeAudit(path) {
  const source = readFileSync(path, "utf8");
  return {
    path,
    contains_dynamic: /\bDynamic\b/.test(source),
    contains_untyped: /\buntyped\b/.test(source),
    contains_cast: /\bcast\b/.test(source),
    contains_php_syntax_code: /php\.Syntax\.code/.test(source),
    contains_raw_javascript: /\bjs\.Syntax\b/.test(source)
  };
}

function parseOutput(output) {
  const result = {};
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const separator = line.indexOf("=");
    if (separator < 0) throw new Error(`Unexpected output line: ${line}`);
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

function generatedPhpLintRecords(paths) {
  return paths
    .filter((record) => record.path.endsWith(".php"))
    .map((record) => ({
      path: `${HAXE_OUT}/${record.path}`,
      relative_path: record.path,
      sha256: `sha256:${record.sha256}`,
      php_lint: command("php", ["-l", `${HAXE_OUT}/${record.path}`])
    }));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-313-image-filesystem-adapter-contract-candidate`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/image-filesystem-adapter-contract-candidate",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "haxe_adapter_contract",
      name: "image metadata/editor and filesystem credentials/direct I/O decisions",
      area: "wp-includes/media.php wp-admin/includes/image.php wp-admin/includes/file.php wp-admin/includes/class-wp-filesystem-direct.php",
      public_contract:
        "Haxe owns a typed adapter-contract decision model for WPHX-313 image metadata/editor and filesystem credential/direct I/O branches. Public PHP ABI replacement, native image libraries, remote filesystem transports, updater/admin orchestration, and installed media behavior are not claimed in this slice."
    },
    ownership_state: "haxe_parity_candidate",
    ownership_axes: {
      semantic_owner: "haxe",
      adapter_contract_owner: "haxe_typed",
      emission_strategy: "stock_haxe_php_private_impl",
      execution_provider: "haxe_php",
      compatibility_evidence: "targeted_semantic_parity"
    },
    bridge: {
      exists: true,
      kind: "adapter-contract-candidate-without-public-php-installation",
      removal_gate:
        "Install these decisions through typed Adapter IR/original-path generation and pass PHP-authored image metadata/editor, filesystem credentials, direct filesystem, remote transport, updater/admin, and installed media fixtures before claiming public PHP ABI ownership."
    },
    owned_paths: HAXE_SOURCES.concat([RUNNER, OUT, OWNERSHIP, RECEIPT]),
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-313-image-filesystem-adapter-contract-candidate",
        "npm run wp:core:wphx-313-image-filesystem-adapter-contract-candidate:check",
        "npm run haxe:escape-hatches:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-313-06-image-filesystem-adapter-contract-candidate"],
      manifest_digest: manifestSha
    },
    notes:
      "This is a PHP-hosted Haxe candidate with module-level Haxe functions. It adds no native provider, no handwritten production PHP shell, and no public WordPress file replacement."
  };
}

const lock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);

const generatedFiles = filesUnder(HAXE_OUT);
const output = command("php", [ENTRY]);
const observations = parseOutput(output);
const matchesExpected = JSON.stringify(observations) === JSON.stringify(EXPECTED);
const haxeSourceAudits = HAXE_SOURCES.filter((path) => path.endsWith(".hx")).map(sourceEscapeAudit);
const sourceEscapeAuditPassed = haxeSourceAudits.every(
  (audit) =>
    !audit.contains_dynamic &&
    !audit.contains_untyped &&
    !audit.contains_cast &&
    !audit.contains_php_syntax_code &&
    !audit.contains_raw_javascript
);

if (!matchesExpected || !sourceEscapeAuditPassed) {
  console.error(JSON.stringify({ status: "failed", matchesExpected, observations, haxeSourceAudits }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-image-filesystem-adapter-contract-candidate.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "generated_shape"],
  artifact_scope: "helper",
  inputs: {
    prior_manifests: PRIOR_MANIFESTS.map(inputRecord),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    hxml: inputRecord(HXML),
    haxe_sources: HAXE_SOURCES.map(inputRecord)
  },
  fixture: {
    candidate_kind: "haxe_image_filesystem_adapter_contract_candidate",
    promoted_contracts: [
      "image editor selection intent for no implementation, MIME rejection, missing methods, output fallback, load error, and selected routes",
      "intermediate image size intent for no requested size, no editor, resize error, save error, and ready metadata routes",
      "missing subsize and metadata update intent for non-image, all-registered, missing, too-large, invalid attachment, create, return existing, and make missing routes",
      "filesystem credential request intent for filter short-circuit, direct, password credentials, SSH key credentials, form output, and error form routes",
      "filesystem method intent for forced, direct file-owner, direct relaxed, SSH2, FTP extension, FTP sockets, and unavailable routes",
      "direct local filesystem I/O intent for write, read, copy, move, delete, dirlist, and reject routes"
    ],
    upstream_reference_functions: [
      "wp_get_image_editor",
      "_wp_image_editor_choose",
      "image_make_intermediate_size",
      "wp_get_missing_image_subsizes",
      "wp_update_image_subsizes",
      "request_filesystem_credentials",
      "get_filesystem_method",
      "WP_Filesystem",
      "WP_Filesystem_Direct"
    ],
    expected_observations: EXPECTED,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed",
      semantic_owner: "haxe",
      native_image_provider_claimed: false,
      remote_filesystem_transport_claimed: false,
      removal_gate:
        "Install through typed Adapter IR/original-path generation and run differential PHP image metadata/editor, filesystem credentials, direct filesystem, remote transport, updater/admin, and installed media fixtures before claiming public PHP ABI ownership."
    },
    source_escape_audits: haxeSourceAudits
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_profile: command("php", ["-r", "echo PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;"])
  },
  build: {
    generated_file_hash_policy: "normalize_haxe_std_source_map_paths",
    generated_haxe_files: generatedFiles,
    php_lint: generatedPhpLintRecords(generatedFiles)
  },
  run: {
    command: `php ${ENTRY}`,
    raw_output_sha256: sha256(output),
    observations,
    matches_expected: matchesExpected
  },
  remaining_gaps: [
    {
      id: "php-authored-fixtures-still-authoritative",
      owner: ISSUE.external_ref,
      detail:
        "The WPHX-313.04 and WPHX-313.05 PHP oracle fixtures remain the behavior authority. This Haxe candidate has not replaced copied oracle PHP or original WordPress public files."
    },
    {
      id: "native-providers-and-installed-flows-not-covered",
      owner: ISSUE.external_ref,
      detail:
        "Native image libraries, EXIF/IPTC parsing, remote FTP/SSH transports, admin/updater orchestration, REST/admin uploads, multisite quotas, and installed media behavior remain unclaimed."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "No original-path image, media, filesystem, updater, REST attachment, or admin upload adapter is claimed in this slice."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "haxe_image_filesystem_adapter_contract_candidate",
    promoted_contracts: 6,
    runtime_runs: 1,
    observation_count: Object.keys(EXPECTED).length,
    source_escape_audit_passed: sourceEscapeAuditPassed,
    public_php_replacement_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-313-06-image-filesystem-adapter-contract-candidate",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "image/filesystem Haxe semantic/adapter-contract candidate manifest" },
    { path: OWNERSHIP, role: "ownership manifest for image/filesystem Haxe candidate" },
    { path: "src/wphx/wp/media/ImageFilesystemAdapterContract.hx", role: "typed Haxe image/filesystem semantic and adapter-contract model" },
    { path: RUNNER, role: "candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-313-image-filesystem-adapter-contract-candidate",
    "npm run wp:core:wphx-313-image-filesystem-adapter-contract-candidate:check",
    "npm run haxe:escape-hatches:check",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-313-01-media-filesystem-upload-surface",
    "receipt:wphx-313-02-media-upload-adapter-contract-candidate",
    "receipt:wphx-313-04-image-metadata-editor-oracle-fixture",
    "receipt:wphx-313-05-filesystem-credentials-oracle-fixture"
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
      observations: Object.keys(EXPECTED).length
    },
    null,
    2
  )
);
