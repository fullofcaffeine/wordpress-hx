#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-96t",
  external_ref: "WPHX-314.06",
  title: "WPHX-314.06 - Add block hooks insertion oracle fixture"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-block-hooks-insertion-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-314-06";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-314-06-block-hooks-insertion-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-314-06-block-hooks-insertion-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-314-06-block-hooks-insertion-oracle-fixture.v1.json";
const PRIOR_EVIDENCE = [
  "manifests/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json",
  "manifests/wp-core/wphx-314-02-blocks-interactivity-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-314-03-block-parser-render-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-04-block-supports-bindings-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json"
];

const SOURCE_FILES = [
  "src/wp-includes/class-wp-block-parser-block.php",
  "src/wp-includes/class-wp-block-parser-frame.php",
  "src/wp-includes/class-wp-block-parser.php",
  "src/wp-includes/class-wp-block-type.php",
  "src/wp-includes/class-wp-block-type-registry.php",
  "src/wp-includes/blocks.php"
];
const COVERED_SYMBOLS = [
  "get_hooked_blocks",
  "insert_hooked_blocks",
  "set_ignored_hooked_blocks_metadata",
  "insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata",
  "apply_block_hooks_to_content",
  "apply_block_hooks_to_content_from_post_object",
  "make_before_block_visitor",
  "make_after_block_visitor",
  "traverse_and_serialize_blocks",
  "parse_blocks",
  "serialize_block",
  "serialize_blocks",
  "get_comment_delimited_block_content",
  "remove_serialized_parent_block",
  "extract_serialized_parent_block",
  "has_block",
  "block_has_support",
  "WP_Block_Type",
  "WP_Block_Type_Registry"
];
const CASES = [
  { id: "block-hooks:registry-map", focus: "registered block_hooks grouped by anchor and relative position" },
  { id: "block-hooks:direct-insert-filter-ignore", focus: "direct insert_hooked_blocks filters, suppression, and ignoredHookedBlocks skip" },
  { id: "block-hooks:combined-insert-metadata", focus: "combined insertion and metadata update callback" },
  { id: "block-hooks:content-traversal-positions", focus: "before, after, first_child, and last_child insertion during content traversal" },
  { id: "block-hooks:single-instance-suppression", focus: "supports.multiple=false suppression across repeated anchors and pre-existing content" },
  { id: "block-hooks:post-object-wrapper-meta", focus: "post-object wrapper, post meta ignored hooks, root ignored hook reference, and classic content handling" }
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
$GLOBALS['wphx_case']       = $case;
$GLOBALS['wphx_filters']    = array();
$GLOBALS['wphx_actions']    = array();
$GLOBALS['wphx_wrong']      = array();
$GLOBALS['wphx_filter_map'] = array();
$GLOBALS['wphx_post_meta']  = array();
$GLOBALS['wphx_posts']      = array();

define( 'ABSPATH', __DIR__ . '/' );
define( 'WPINC', 'wp-includes' );
define( 'PHP_INT_MAX_FIXTURE', PHP_INT_MAX );

class WP_Post {
\tpublic $ID = 77;
\tpublic $post_type = 'post';
\tpublic $post_content = '';

\tpublic function __construct( $data = null ) {
\t\tif ( is_array( $data ) || is_object( $data ) ) {
\t\t\tforeach ( (array) $data as $key => $value ) {
\t\t\t\t$this->$key = $value;
\t\t\t}
\t\t}
\t}
}

class WP_Error {
\tprivate $code;
\tprivate $message;

\tpublic function __construct( $code = 'error', $message = 'error' ) {
\t\t$this->code    = $code;
\t\t$this->message = $message;
\t}

\tpublic function get_error_code() {
\t\treturn $this->code;
\t}

\tpublic function get_error_message() {
\t\treturn $this->message;
\t}
}

function __( $value ) {
\treturn $value;
}

function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_wrong'][] = compact( 'function_name', 'message', 'version' );
}

function wp_json_encode( $value, $flags = 0, $depth = 512 ) {
\treturn json_encode( $value, $flags, $depth );
}

function wp_parse_args( $args, $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$parsed = get_object_vars( $args );
\t} elseif ( is_array( $args ) ) {
\t\t$parsed = $args;
\t} else {
\t\tparse_str( (string) $args, $parsed );
\t}
\treturn array_merge( $defaults, $parsed );
}

function _wp_array_get( $array, $path, $default_value = null ) {
\tforeach ( $path as $path_element ) {
\t\tif ( ! is_array( $array ) || ! array_key_exists( $path_element, $array ) ) {
\t\t\treturn $default_value;
\t\t}
\t\t$array = $array[ $path_element ];
\t}
\treturn $array;
}

function rest_validate_value_from_schema( $value, $schema, $param = '' ) {
\treturn true;
}

function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}

function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_filter_map'][ $hook_name ][ $priority ][] = array(
\t\t'callback'      => $callback,
\t\t'accepted_args' => $accepted_args,
\t);
\tksort( $GLOBALS['wphx_filter_map'][ $hook_name ] );
\t$GLOBALS['wphx_actions'][] = array( 'action' => 'add_filter', 'hook' => $hook_name, 'priority' => $priority, 'accepted_args' => $accepted_args );
\treturn true;
}

function remove_filter( $hook_name, $callback, $priority = 10 ) {
\tif ( isset( $GLOBALS['wphx_filter_map'][ $hook_name ][ $priority ] ) ) {
\t\tforeach ( $GLOBALS['wphx_filter_map'][ $hook_name ][ $priority ] as $index => $entry ) {
\t\t\tif ( $entry['callback'] === $callback ) {
\t\t\t\tunset( $GLOBALS['wphx_filter_map'][ $hook_name ][ $priority ][ $index ] );
\t\t\t}
\t\t}
\t}
\t$GLOBALS['wphx_actions'][] = array( 'action' => 'remove_filter', 'hook' => $hook_name, 'priority' => $priority );
\treturn true;
}

function has_filter( $hook_name, $callback = false ) {
\tif ( empty( $GLOBALS['wphx_filter_map'][ $hook_name ] ) ) {
\t\treturn false;
\t}
\tif ( false === $callback ) {
\t\treturn true;
\t}
\tforeach ( $GLOBALS['wphx_filter_map'][ $hook_name ] as $priority => $entries ) {
\t\tforeach ( $entries as $entry ) {
\t\t\tif ( $entry['callback'] === $callback ) {
\t\t\t\treturn $priority;
\t\t\t}
\t\t}
\t}
\treturn false;
}

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array(
\t\t'hook'      => $hook_name,
\t\t'value'     => wphx_summarize( $value ),
\t\t'arg_count' => count( $args ) + 1,
\t);

\tif ( 'block_parser_class' === $hook_name || 'register_block_type_args' === $hook_name || 'get_block_type_variations' === $hook_name || 'get_block_type_uses_context' === $hook_name ) {
\t\treturn $value;
\t}
\tif ( 'hooked_block_types' === $hook_name && 'block-hooks:direct-insert-filter-ignore' === $GLOBALS['wphx_case'] ) {
\t\t$value[] = 'wphx/filter-added';
\t}
\tif ( 'hooked_block_types' === $hook_name && 'block-hooks:content-traversal-positions' === $GLOBALS['wphx_case'] && 'after' === ( $args[0] ?? '' ) ) {
\t\t$value[] = 'wphx/filter-after';
\t}
\tif ( 'hooked_block' === $hook_name ) {
\t\t$hooked_block_type = $args[0] ?? '';
\t\tif ( 'wphx/suppress' === $hooked_block_type ) {
\t\t\treturn null;
\t\t}
\t\tif ( is_array( $value ) ) {
\t\t\t$value['attrs']['source'] = 'generic-filter';
\t\t}
\t\treturn $value;
\t}
\tif ( str_starts_with( $hook_name, 'hooked_block_wphx/' ) && is_array( $value ) ) {
\t\t$value['attrs']['specific'] = str_replace( 'hooked_block_', '', $hook_name );
\t\treturn $value;
\t}

\tif ( ! empty( $GLOBALS['wphx_filter_map'][ $hook_name ] ) ) {
\t\tforeach ( $GLOBALS['wphx_filter_map'][ $hook_name ] as $entries ) {
\t\t\tforeach ( $entries as $entry ) {
\t\t\t\t$accepted = max( 1, (int) $entry['accepted_args'] );
\t\t\t\t$call_args = array_slice( array_merge( array( $value ), $args ), 0, $accepted );
\t\t\t\t$value = call_user_func_array( $entry['callback'], $call_args );
\t\t\t}
\t\t}
\t}
\treturn $value;
}

function get_post( $post = null ) {
\tif ( $post instanceof WP_Post ) {
\t\treturn $post;
\t}
\tif ( is_numeric( $post ) && isset( $GLOBALS['wphx_posts'][ (int) $post ] ) ) {
\t\treturn $GLOBALS['wphx_posts'][ (int) $post ];
\t}
\treturn $GLOBALS['wphx_posts'][77] ?? null;
}

function get_post_meta( $post_id, $key, $single = false ) {
\treturn $GLOBALS['wphx_post_meta'][ $post_id ][ $key ] ?? '';
}

function _inject_theme_attribute_in_template_part_block( &$block ) {
\tif ( 'core/template-part' === ( $block['blockName'] ?? null ) && empty( $block['attrs']['theme'] ) ) {
\t\t$block['attrs']['theme'] = 'fixture-theme';
\t}
}

function wphx_summarize( $value ) {
\tif ( $value instanceof WP_Post ) {
\t\treturn array( 'class' => 'WP_Post', 'ID' => $value->ID, 'post_type' => $value->post_type );
\t}
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

function wphx_register_anchor_and_hooks() {
\tregister_block_type( 'core/paragraph', array( 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'core/group', array( 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'core/post-content', array( 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'core/freeform', array( 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/before', array( 'block_hooks' => array( 'core/paragraph' => 'before' ), 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/after', array( 'block_hooks' => array( 'core/paragraph' => 'after' ), 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/first', array( 'block_hooks' => array( 'core/group' => 'first_child' ), 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/last', array( 'block_hooks' => array( 'core/group' => 'last_child' ), 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/single', array( 'block_hooks' => array( 'core/paragraph' => 'after' ), 'supports' => array( 'multiple' => false ) ) );
\tregister_block_type( 'wphx/root-first', array( 'block_hooks' => array( 'core/post-content' => 'first_child' ), 'supports' => array( 'multiple' => true ) ) );
\tregister_block_type( 'wphx/root-last', array( 'block_hooks' => array( 'core/post-content' => 'last_child' ), 'supports' => array( 'multiple' => true ) ) );
}

require ABSPATH . WPINC . '/class-wp-block-parser-block.php';
require ABSPATH . WPINC . '/class-wp-block-parser-frame.php';
require ABSPATH . WPINC . '/class-wp-block-parser.php';
require ABSPATH . WPINC . '/class-wp-block-type.php';
require ABSPATH . WPINC . '/class-wp-block-type-registry.php';
require ABSPATH . WPINC . '/blocks.php';

$result = array(
\t'case'    => $case,
\t'output'  => null,
\t'filters' => array(),
\t'actions' => array(),
\t'wrong'   => array(),
);

switch ( $case ) {
\tcase 'block-hooks:registry-map':
\t\twphx_register_anchor_and_hooks();
\t\t$result['output'] = get_hooked_blocks();
\t\tbreak;

\tcase 'block-hooks:direct-insert-filter-ignore':
\t\t$anchor = array(
\t\t\t'blockName'    => 'core/paragraph',
\t\t\t'attrs'        => array( 'metadata' => array( 'ignoredHookedBlocks' => array( 'wphx/ignored' ) ) ),
\t\t\t'innerBlocks'  => array(),
\t\t\t'innerHTML'    => '<p>Anchor</p>',
\t\t\t'innerContent' => array( '<p>Anchor</p>' ),
\t\t);
\t\t$hooked = array(
\t\t\t'core/paragraph' => array(
\t\t\t\t'before' => array( 'wphx/before', 'wphx/ignored', 'wphx/suppress' ),
\t\t\t),
\t\t);
\t\t$markup = insert_hooked_blocks( $anchor, 'before', $hooked, array( 'kind' => 'direct' ) );
\t\t$meta   = set_ignored_hooked_blocks_metadata( $anchor, 'before', $hooked, array( 'kind' => 'direct' ) );
\t\t$result['output'] = array(
\t\t\t'inserted' => $markup,
\t\t\t'meta'     => $meta,
\t\t\t'anchor'   => $anchor,
\t\t);
\t\tbreak;

\tcase 'block-hooks:combined-insert-metadata':
\t\t$anchor = array(
\t\t\t'blockName'    => 'core/paragraph',
\t\t\t'attrs'        => array(),
\t\t\t'innerBlocks'  => array(),
\t\t\t'innerHTML'    => '<p>Anchor</p>',
\t\t\t'innerContent' => array( '<p>Anchor</p>' ),
\t\t);
\t\t$hooked = array(
\t\t\t'core/paragraph' => array(
\t\t\t\t'after' => array( 'wphx/after', 'wphx/suppress' ),
\t\t\t),
\t\t);
\t\t$result['output'] = array(
\t\t\t'combined' => insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata( $anchor, 'after', $hooked, array( 'kind' => 'combined' ) ),
\t\t\t'anchor'   => $anchor,
\t\t);
\t\tbreak;

\tcase 'block-hooks:content-traversal-positions':
\t\twphx_register_anchor_and_hooks();
\t\t$content = '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph --><p>One</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Two</p><!-- /wp:paragraph --></div><!-- /wp:group -->';
\t\t$result['output'] = array(
\t\t\t'content' => apply_block_hooks_to_content( $content, array( 'kind' => 'content' ) ),
\t\t);
\t\tbreak;

\tcase 'block-hooks:single-instance-suppression':
\t\tregister_block_type( 'core/paragraph', array( 'supports' => array( 'multiple' => true ) ) );
\t\tregister_block_type( 'wphx/single', array( 'block_hooks' => array( 'core/paragraph' => 'after' ), 'supports' => array( 'multiple' => false ) ) );
\t\t$content_without_single = '<!-- wp:paragraph --><p>One</p><!-- /wp:paragraph --><!-- wp:paragraph --><p>Two</p><!-- /wp:paragraph -->';
\t\t$content_with_single    = '<!-- wp:paragraph --><p>One</p><!-- /wp:paragraph --><!-- wp:wphx/single /--><!-- wp:paragraph --><p>Two</p><!-- /wp:paragraph -->';
\t\t$result['output'] = array(
\t\t\t'without_existing' => apply_block_hooks_to_content( $content_without_single, array( 'kind' => 'single' ) ),
\t\t\t'with_existing'    => apply_block_hooks_to_content( $content_with_single, array( 'kind' => 'single' ) ),
\t\t);
\t\tbreak;

\tcase 'block-hooks:post-object-wrapper-meta':
\t\twphx_register_anchor_and_hooks();
\t\t$post = new WP_Post(
\t\t\tarray(
\t\t\t\t'ID'           => 77,
\t\t\t\t'post_type'    => 'post',
\t\t\t\t'post_content' => 'Classic text',
\t\t\t)
\t\t);
\t\t$GLOBALS['wphx_posts'][77] = $post;
\t\t$GLOBALS['wphx_post_meta'][77]['_wp_ignored_hooked_blocks'] = wp_json_encode( array( 'wphx/root-last' ) );
\t\t$ignored_at_root = array();
\t\t$result['output'] = array(
\t\t\t'content'         => apply_block_hooks_to_content_from_post_object( 'Classic text', $post, 'insert_hooked_blocks_and_set_ignored_hooked_blocks_metadata', $ignored_at_root ),
\t\t\t'ignored_at_root' => $ignored_at_root,
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
    throw new Error("Oracle and candidate block hooks insertion observations diverged");
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
    schema: "wphx.wp_core.block_hooks_insertion_oracle_fixture.v1",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    generator: {
      path: RUNNER,
      sha256: sha256File(RUNNER),
      check_command: "npm run wp:core:wphx-314-block-hooks-insertion-oracle-fixture:check"
    },
    evidence_class: "copied_oracle_candidate_php_fixture",
    artifact_scope: {
      domain: "blocks_hooks_insertion",
      public_php_replacement_claimed: false,
      haxe_runtime_logic_claimed: false,
      installed_block_parity_claimed: false,
      upstream_phpunit_pass_pass_claimed: false,
      browser_gutenberg_ownership_claimed: false
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
        "WordPress 7.0 PHP block parser, block type registry, and blocks.php sources are mirrored into oracle and candidate roots.",
        "A minimal deterministic filter system is provided so apply_block_hooks_to_content can exercise its own temporary suppression filters.",
        "Template-part theme injection, post lookup, post meta lookup, JSON, schema validation, and translation are deterministic stubs.",
        "The fixture observes serialized block markup and parsed metadata rather than replacing WordPress hook insertion logic."
      ]
    },
    runs: {
      oracle,
      candidate,
      comparable_sha256: sha256(JSON.stringify(oracleComparable))
    },
    remaining_gaps: [
      "Haxe-owned runtime implementation for block hooks insertion is not claimed.",
      "Generated original-path public PHP adapter replacement is not claimed.",
      "Installed block rendering, selected upstream PHPUnit pass/pass, REST response insertion, template/theme integration, editor/browser, and Gutenberg package ownership remain later gates.",
      "Full style engine/global styles/layout/HTML API/interactivity ownership remains outside this fixture."
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: validationResult
  };

  const ownership = {
    schema: "wphx.ownership_manifest.v1",
    manifest_id: "wphx-314-06-block-hooks-insertion-oracle-fixture",
    issue: ISSUE,
    unit: {
      kind: "wp_core_oracle_fixture",
      domain: "blocks_hooks_insertion",
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
      removal_gate: "Replace the copied public PHP fixture with typed Haxe-owned block hooks decisions plus WPHX Adapter IR/generated original-path public PHP evidence, or explicitly supersede this bridge with an accepted backend/custom-target improvement.",
      non_claims: manifest.remaining_gaps
    },
    owned_paths: [],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, `${ORACLE_ROOT}/probe.php`, `${CANDIDATE_ROOT}/probe.php`],
    verification: validationResult,
    notes: [
      "This fixture is a behavior target for future Haxe ownership. It records hook map construction, filter-sensitive insertion, ignored metadata, traversal positions, single-instance suppression, and post-object wrapper handling.",
      "The fixture-owned filter system is part of the test harness, not WordPress hook API replacement evidence."
    ]
  };

  const receipt = {
    schema: "wphx.receipt.v1",
    id: "wphx-314-06-block-hooks-insertion-oracle-fixture",
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
      "npm run wp:core:wphx-314-block-hooks-insertion-oracle-fixture",
      "npm run wp:core:wphx-314-block-hooks-insertion-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate",
      "npm run precommit"
    ],
    related_receipts: [
      "receipts/wp-core/wphx-314-01-blocks-interactivity-surface.v1.json",
      "receipts/wp-core/wphx-314-02-blocks-interactivity-adapter-contract-candidate.v1.json",
      "receipts/wp-core/wphx-314-03-block-parser-render-oracle-fixture.v1.json",
      "receipts/wp-core/wphx-314-04-block-supports-bindings-oracle-fixture.v1.json",
      "receipts/wp-core/wphx-314-05-block-patterns-registry-oracle-fixture.v1.json"
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
