#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-u5p",
  external_ref: "WPHX-314.05",
  title: "WPHX-314.05 - Add block patterns registry oracle fixture"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-block-patterns-registry-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-314-05";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json";
const PRIOR_EVIDENCE = [
  "manifests/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json",
  "manifests/wp-core/wphx-314-02-blocks-interactivity-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-314-03-block-parser-render-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-04-block-supports-bindings-oracle-fixture.v1.json"
];

const SOURCE_FILES = [
  "src/wp-includes/class-wp-block-patterns-registry.php",
  "src/wp-includes/class-wp-block-pattern-categories-registry.php",
  "src/wp-includes/block-patterns.php"
];
const COVERED_SYMBOLS = [
  "register_block_pattern",
  "unregister_block_pattern",
  "register_block_pattern_category",
  "unregister_block_pattern_category",
  "_register_core_block_patterns_and_categories",
  "wp_normalize_remote_block_pattern",
  "WP_Block_Patterns_Registry",
  "WP_Block_Patterns_Registry::register",
  "WP_Block_Patterns_Registry::unregister",
  "WP_Block_Patterns_Registry::get_registered",
  "WP_Block_Patterns_Registry::get_all_registered",
  "WP_Block_Patterns_Registry::is_registered",
  "WP_Block_Pattern_Categories_Registry",
  "WP_Block_Pattern_Categories_Registry::register",
  "WP_Block_Pattern_Categories_Registry::unregister",
  "WP_Block_Pattern_Categories_Registry::get_registered",
  "WP_Block_Pattern_Categories_Registry::get_all_registered",
  "WP_Block_Pattern_Categories_Registry::is_registered",
  "apply_block_hooks_to_content"
];
const CASES = [
  { id: "block-patterns:register-get-content", focus: "content-backed pattern registration, get_registered, get_all_registered, and hook insertion boundary" },
  { id: "block-patterns:file-path-lazy-content", focus: "filePath-backed pattern lazy include and content caching" },
  { id: "block-patterns:outside-init-tracking", focus: "registration outside init tracked separately for patterns" },
  { id: "block-patterns:validation-unregister", focus: "invalid pattern registration and unregister failure/success contracts" },
  { id: "block-patterns:categories", focus: "category registration, outside-init tracking, get/unregister contracts" },
  { id: "block-patterns:normalize-remote", focus: "remote pattern snake_case to camelCase normalization" }
];

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
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function writeProbe(root) {
  writeFileSync(
    `${root}/probe.php`,
    `<?php
error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$case = $argv[1] ?? '';
$GLOBALS['wphx_case']          = $case;
$GLOBALS['wphx_theme_support'] = array();
$GLOBALS['wphx_filters']       = array();
$GLOBALS['wphx_actions']       = array();
$GLOBALS['wphx_wrong']         = array();
$GLOBALS['wphx_current_action'] = '';

define( 'ABSPATH', __DIR__ . '/' );
define( 'WPINC', 'wp-includes' );

function __( $value ) {
\treturn $value;
}

function _x( $value, $context ) {
\treturn $value;
}

function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_wrong'][] = array(
\t\t'function' => $function_name,
\t\t'message'  => preg_replace( '/\\s+/', ' ', (string) $message ),
\t\t'version'  => $version,
\t);
}

function wp_json_encode( $value, $flags = 0, $depth = 512 ) {
\treturn json_encode( $value, $flags, $depth );
}

function current_action() {
\treturn $GLOBALS['wphx_current_action'];
}

function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_actions'][] = compact( 'hook_name', 'priority', 'accepted_args' ) + array( 'callback' => is_string( $callback ) ? $callback : 'callable' );
\treturn true;
}

function add_theme_support( $feature ) {
\t$GLOBALS['wphx_theme_support'][ $feature ] = true;
\treturn true;
}

function get_theme_support( $feature ) {
\treturn $GLOBALS['wphx_theme_support'][ $feature ] ?? false;
}

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array(
\t\t'hook'      => $hook_name,
\t\t'value'     => wphx_summarize( $value ),
\t\t'arg_count' => count( $args ) + 1,
\t);
\treturn $value;
}

function sanitize_title( $value ) {
\t$value = strtolower( (string) $value );
\t$value = preg_replace( '/[^a-z0-9]+/', '-', $value );
\treturn trim( $value, '-' );
}

function get_hooked_blocks() {
\treturn array( 'wphx/hooked' => array( 'after' => 'core/paragraph' ) );
}

function apply_block_hooks_to_content( $content, $context, $callback ) {
\t$GLOBALS['wphx_actions'][] = array(
\t\t'hook_name' => 'apply_block_hooks_to_content',
\t\t'callback'  => $callback,
\t\t'pattern'   => is_array( $context ) ? ( $context['name'] ?? null ) : null,
\t);
\treturn 'HOOKED[' . ( is_array( $context ) ? ( $context['name'] ?? 'unknown' ) : 'unknown' ) . ']:' . $content;
}

function wphx_summarize( $value ) {
\tif ( is_array( $value ) ) {
\t\t$out = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$out[ $key ] = wphx_summarize( $item );
\t\t}
\t\treturn $out;
\t}
\tif ( is_object( $value ) ) {
\t\treturn array( 'class' => get_class( $value ) );
\t}
\treturn $value;
}

function wphx_pattern_summary( $pattern ) {
\tif ( null === $pattern ) {
\t\treturn null;
\t}
\t$copy = $pattern;
\tif ( isset( $copy['filePath'] ) ) {
\t\t$copy['filePath'] = basename( (string) $copy['filePath'] );
\t}
\tksort( $copy );
\treturn $copy;
}

require ABSPATH . WPINC . '/class-wp-block-patterns-registry.php';
require ABSPATH . WPINC . '/class-wp-block-pattern-categories-registry.php';
require ABSPATH . WPINC . '/block-patterns.php';

$result = array(
\t'case'          => $case,
\t'theme_support' => $GLOBALS['wphx_theme_support'],
\t'output'        => null,
\t'filters'       => array(),
\t'actions'       => array(),
\t'wrong'         => array(),
);

switch ( $case ) {
\tcase 'block-patterns:register-get-content':
\t\t$registered = register_block_pattern(
\t\t\t'wphx/hero',
\t\t\tarray(
\t\t\t\t'title'         => 'Hero',
\t\t\t\t'content'       => '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->',
\t\t\t\t'description'   => 'Fixture hero',
\t\t\t\t'categories'    => array( 'featured', 'text' ),
\t\t\t\t'keywords'      => array( 'alpha', 'beta' ),
\t\t\t\t'blockTypes'    => array( 'core/paragraph' ),
\t\t\t\t'postTypes'     => array( 'post' ),
\t\t\t\t'templateTypes' => array( 'single' ),
\t\t\t\t'viewportWidth' => 960,
\t\t\t\t'inserter'      => false,
\t\t\t)
\t\t);
\t\t$registry = WP_Block_Patterns_Registry::get_instance();
\t\t$result['output'] = array(
\t\t\t'registered'      => $registered,
\t\t\t'is_registered'   => $registry->is_registered( 'wphx/hero' ),
\t\t\t'get_registered'  => wphx_pattern_summary( $registry->get_registered( 'wphx/hero' ) ),
\t\t\t'all_registered'  => array_map( 'wphx_pattern_summary', $registry->get_all_registered() ),
\t\t\t'missing_pattern' => $registry->get_registered( 'wphx/missing' ),
\t\t);
\t\tbreak;

\tcase 'block-patterns:file-path-lazy-content':
\t\t$file = __DIR__ . '/fixture-pattern.php';
\t\tfile_put_contents( $file, '<?php echo \"FILE-CONTENT:\" . basename(__FILE__);' );
\t\t$registered = register_block_pattern(
\t\t\t'wphx/file-pattern',
\t\t\tarray(
\t\t\t\t'title'    => 'File pattern',
\t\t\t\t'filePath' => $file,
\t\t\t)
\t\t);
\t\t$registry = WP_Block_Patterns_Registry::get_instance();
\t\t$first    = $registry->get_registered( 'wphx/file-pattern' );
\t\t$second   = $registry->get_registered( 'wphx/file-pattern' );
\t\t$result['output'] = array(
\t\t\t'registered'        => $registered,
\t\t\t'first'             => wphx_pattern_summary( $first ),
\t\t\t'second'            => wphx_pattern_summary( $second ),
\t\t\t'file_path_removed' => ! array_key_exists( 'filePath', $second ),
\t\t);
\t\tbreak;

\tcase 'block-patterns:outside-init-tracking':
\t\t$GLOBALS['wphx_current_action'] = 'admin_init';
\t\tregister_block_pattern(
\t\t\t'wphx/outside',
\t\t\tarray(
\t\t\t\t'title'   => 'Outside',
\t\t\t\t'content' => '<p>outside</p>',
\t\t\t)
\t\t);
\t\t$GLOBALS['wphx_current_action'] = 'init';
\t\tregister_block_pattern(
\t\t\t'wphx/inside',
\t\t\tarray(
\t\t\t\t'title'   => 'Inside',
\t\t\t\t'content' => '<p>inside</p>',
\t\t\t)
\t\t);
\t\t$registry = WP_Block_Patterns_Registry::get_instance();
\t\t$result['output'] = array(
\t\t\t'all'          => array_map( 'wphx_pattern_summary', $registry->get_all_registered() ),
\t\t\t'outside_only' => array_map( 'wphx_pattern_summary', $registry->get_all_registered( true ) ),
\t\t);
\t\tbreak;

\tcase 'block-patterns:validation-unregister':
\t\t$invalid_name    = register_block_pattern( array( 'bad' ), array( 'title' => 'Bad', 'content' => '<p>bad</p>' ) );
\t\t$missing_title   = register_block_pattern( 'wphx/missing-title', array( 'content' => '<p>bad</p>' ) );
\t\t$missing_content = register_block_pattern( 'wphx/missing-content', array( 'title' => 'Bad' ) );
\t\t$valid           = register_block_pattern( 'wphx/remove-me', array( 'title' => 'Remove', 'content' => '<p>remove</p>' ) );
\t\t$removed         = unregister_block_pattern( 'wphx/remove-me' );
\t\t$missing_remove  = unregister_block_pattern( 'wphx/remove-me' );
\t\t$result['output'] = array(
\t\t\t'invalid_name'    => $invalid_name,
\t\t\t'missing_title'   => $missing_title,
\t\t\t'missing_content' => $missing_content,
\t\t\t'valid'           => $valid,
\t\t\t'removed'         => $removed,
\t\t\t'missing_remove'  => $missing_remove,
\t\t);
\t\tbreak;

\tcase 'block-patterns:categories':
\t\t$GLOBALS['wphx_current_action'] = 'current_screen';
\t\t$outside = register_block_pattern_category( 'wphx/outside-cat', array( 'label' => 'Outside Cat', 'description' => 'Outside category' ) );
\t\t$GLOBALS['wphx_current_action'] = 'init';
\t\t$inside  = register_block_pattern_category( 'wphx/inside-cat', array( 'label' => 'Inside Cat' ) );
\t\t$invalid = register_block_pattern_category( array( 'bad' ), array( 'label' => 'Bad' ) );
\t\t$registry = WP_Block_Pattern_Categories_Registry::get_instance();
\t\t$removed  = unregister_block_pattern_category( 'wphx/inside-cat' );
\t\t$missing  = unregister_block_pattern_category( 'wphx/inside-cat' );
\t\t$result['output'] = array(
\t\t\t'outside'      => $outside,
\t\t\t'inside'       => $inside,
\t\t\t'invalid'      => $invalid,
\t\t\t'outside_get'  => $registry->get_registered( 'wphx/outside-cat' ),
\t\t\t'all'          => $registry->get_all_registered(),
\t\t\t'outside_only' => $registry->get_all_registered( true ),
\t\t\t'removed'      => $removed,
\t\t\t'missing'      => $missing,
\t\t);
\t\tbreak;

\tcase 'block-patterns:normalize-remote':
\t\t$result['output'] = array(
\t\t\t'normalized_full' => wp_normalize_remote_block_pattern(
\t\t\t\tarray(
\t\t\t\t\t'title'          => 'Remote',
\t\t\t\t\t'content'        => '<p>remote</p>',
\t\t\t\t\t'block_types'    => array( 'core/paragraph' ),
\t\t\t\t\t'viewport_width' => 480,
\t\t\t\t)
\t\t\t),
\t\t\t'normalized_partial' => wp_normalize_remote_block_pattern(
\t\t\t\tarray(
\t\t\t\t\t'title'   => 'Partial',
\t\t\t\t\t'content' => '<p>partial</p>',
\t\t\t\t)
\t\t\t),
\t\t);
\t\tbreak;

\tdefault:
\t\tthrow new RuntimeException( 'Unknown case ' . $case );
}

$result['filters'] = $GLOBALS['wphx_filters'];
$result['actions'] = $GLOBALS['wphx_actions'];
$result['wrong']   = $GLOBALS['wphx_wrong'];
echo wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
`
  );
}

function prepareRoot(root) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  mirrorSources(root);
  writeProbe(root);
}

function runCase(root, testCase) {
  command("php", ["-l", `${root}/probe.php`], { stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(command("php", [`${root}/probe.php`, testCase.id]));
}

function buildRun(root, label) {
  const observations = CASES.map((testCase) => ({
    id: testCase.id,
    focus: testCase.focus,
    observation: runCase(root, testCase)
  }));

  return {
    label,
    root,
    php_version: command("php", ["-r", "echo PHP_VERSION;"]),
    source_files: SOURCE_FILES.map((path) => inputRecord(mirrorPath(root, path))),
    probe: inputRecord(`${root}/probe.php`),
    observations,
    output_sha256: sha256(JSON.stringify(observations))
  };
}

function comparable(run) {
  return run.observations.map((caseResult) => caseResult.observation);
}

function writeJsonChecked(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} does not exist`);
    }
    if (readFileSync(path, "utf8") !== text) {
      throw new Error(`${path} is stale; run ${RUNNER}`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function main() {
  prepareRoot(ORACLE_ROOT);
  prepareRoot(CANDIDATE_ROOT);

  const oracle = buildRun(ORACLE_ROOT, "oracle");
  const candidate = buildRun(CANDIDATE_ROOT, "candidate");
  const oracleComparable = comparable(oracle);
  const candidateComparable = comparable(candidate);
  if (JSON.stringify(oracleComparable) !== JSON.stringify(candidateComparable)) {
    throw new Error("Oracle and candidate block pattern registry observations diverged");
  }

  const validationResult = {
    status: "passed",
    case_count: CASES.length,
    covered_symbol_count: COVERED_SYMBOLS.length,
    source_file_count: SOURCE_FILES.length,
    oracle_candidate_match: true,
    public_php_replacement_claimed: false
  };

  const manifest = {
    schema: "wphx.wp_core.block_patterns_registry_oracle_fixture.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: {
      path: RUNNER,
      sha256: sha256File(RUNNER),
      check_command: "npm run wp:core:wphx-314-block-patterns-registry-oracle-fixture:check"
    },
    evidence_class: "copied_oracle_candidate_php_fixture",
    artifact_scope: {
      domain: "blocks_patterns_registry",
      public_php_replacement_claimed: false,
      haxe_runtime_logic_claimed: false,
      installed_block_parity_claimed: false,
      upstream_phpunit_pass_pass_claimed: false,
      browser_gutenberg_ownership_claimed: false,
      block_hooks_insertion_claimed: false
    },
    inputs: {
      upstream_root: UPSTREAM_ROOT,
      source_files: SOURCE_FILES.map(sourceRecord),
      prior_evidence: PRIOR_EVIDENCE.filter(existsSync).map(inputRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      deterministic_boundaries: [
        "WordPress 7.0 PHP pattern registry, category registry, and block-patterns helper source files are mirrored into oracle and candidate roots.",
        "Hook dispatch, theme support, translation, sanitize_title, and block hook insertion are deterministic stubs.",
        "apply_block_hooks_to_content is observed as a boundary during get_registered/get_all_registered, but real block hook insertion is not claimed in this slice.",
        "The filePath case writes a deterministic local PHP pattern file inside the build root and verifies lazy include/caching behavior."
      ]
    },
    runs: {
      oracle,
      candidate,
      comparable_sha256: sha256(JSON.stringify(oracleComparable))
    },
    remaining_gaps: [
      "Haxe-owned runtime implementation for block pattern registries is not claimed.",
      "Generated original-path public PHP adapter replacement is not claimed.",
      "Real block hook insertion, theme directory scanning, remote pattern REST loading, installed pattern behavior, selected upstream PHPUnit pass/pass, editor/browser, and Gutenberg package ownership remain later gates.",
      "Full style engine/global styles/layout/HTML API/interactivity ownership remains outside this fixture."
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: validationResult
  };

  const ownership = {
    schema: "wphx.ownership_manifest.v1",
    manifest_id: "wphx-314-05-block-patterns-registry-oracle-fixture",
    issue: ISSUE,
    unit: {
      kind: "wp_core_oracle_fixture",
      domain: "blocks_patterns_registry",
      source_files: SOURCE_FILES
    },
    ownership_state: "bridge_shell",
    ownership_axes: {
      semantic_behavior: "upstream_wordpress_php_oracle",
      haxe_source: "not_claimed",
      public_php_abi: "copied_oracle_candidate_fixture_only",
      installed_distribution: "not_claimed",
      browser_gutenberg: "not_claimed"
    },
    bridge: {
      kind: "copied_oracle_candidate_php_fixture",
      removal_gate: "Replace the copied public PHP fixture with typed Haxe-owned pattern registry decisions plus WPHX Adapter IR/generated original-path public PHP evidence, or explicitly supersede this bridge with an accepted backend/custom-target improvement.",
      non_claims: manifest.remaining_gaps
    },
    owned_paths: [],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, `${ORACLE_ROOT}/probe.php`, `${CANDIDATE_ROOT}/probe.php`],
    verification: validationResult,
    notes: [
      "This fixture is a behavior target for future Haxe ownership. It records pattern registry validation, lazy content loading, outside-init tracking, category registry behavior, and remote key normalization.",
      "Block hook insertion is intentionally reduced to a deterministic boundary stub."
    ]
  };

  const receipt = {
    schema: "wphx.receipt.v1",
    id: "wphx-314-05-block-patterns-registry-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: {
      manifest: OUT,
      ownership,
      runner: RUNNER,
      generated_oracle_probe: `${ORACLE_ROOT}/probe.php`,
      generated_candidate_probe: `${CANDIDATE_ROOT}/probe.php`
    },
    verification_commands: [
      "npm run wp:core:wphx-314-block-patterns-registry-oracle-fixture",
      "npm run wp:core:wphx-314-block-patterns-registry-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate",
      "npm run precommit"
    ],
    related_receipts: [
      "receipts/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json",
      "receipts/wp-core/wphx-314-02-blocks-interactivity-adapter-contract-candidate.v1.json",
      "receipts/wp-core/wphx-314-03-block-parser-render-oracle-fixture.v1.json",
      "receipts/wp-core/wphx-314-04-block-supports-bindings-oracle-fixture.v1.json"
    ].filter(existsSync),
    validation_result: validationResult,
    manifest_sha256: sha256(JSON.stringify(manifest)),
    ownership_sha256: sha256(JSON.stringify(ownership))
  };

  writeJsonChecked(OUT, manifest);
  writeJsonChecked(OWNERSHIP, ownership);
  writeJsonChecked(RECEIPT, receipt);

  console.log(JSON.stringify(validationResult, null, 2));
}

main();
