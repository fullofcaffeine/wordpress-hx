#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-1to",
  external_ref: "WPHX-312.30",
  title: "WPHX-312.30 - Add WP_Embed cache and autoembed oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-wp-embed-cache-autoembed-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-30";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const OUT = "manifests/wp-core/wphx-312-30-wp-embed-cache-autoembed-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-30-wp-embed-cache-autoembed-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-30-wp-embed-cache-autoembed-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const FEED_EMBED_FIXTURE = "manifests/wp-core/wphx-312-04-feed-embed-https-oracle-fixture.v1.json";
const REMOTE_OEMBED_FIXTURE = "manifests/wp-core/wphx-312-08-remote-fetch-oembed-oracle-fixture.v1.json";
const OEMBED_REGISTRY_FIXTURE = "manifests/wp-core/wphx-312-29-oembed-provider-registry-oracle-fixture.v1.json";

const SOURCE_FILES = ["src/wp-includes/class-wp-embed.php"];
const COVERED_SYMBOLS = [
  "class-wp-embed.php",
  "WP_Embed::__construct",
  "WP_Embed::run_shortcode",
  "WP_Embed::shortcode",
  "WP_Embed::autoembed",
  "WP_Embed::autoembed_callback",
  "WP_Embed::maybe_make_link",
  "WP_Embed::cache_oembed",
  "WP_Embed::delete_oembed_caches",
  "WP_Embed::find_oembed_post_id",
  "wp_oembed_get",
  "get_post_meta",
  "update_post_meta",
  "delete_post_meta",
  "WP_Query"
];
const CASES = [
  { id: "wp-embed:constructor-run-shortcode", focus: "constructor hook/shortcode registration and run_shortcode restoration" },
  { id: "wp-embed:shortcode-cache-hit", focus: "shortcode returns recent cached post-meta HTML and applies embed_oembed_html" },
  { id: "wp-embed:shortcode-remote-success", focus: "shortcode fetches remote oEmbed HTML and writes post-meta cache entries" },
  { id: "wp-embed:autoembed-unknown-fallback", focus: "autoembed converts standalone URLs and suppresses links for unknown URL fallback" },
  { id: "wp-embed:cache-maintenance", focus: "cache_oembed primes content caches, delete_oembed_caches removes meta keys, and find_oembed_post_id uses cache/query" }
];

function command(commandName, commandArgs) {
  return execFileSync(commandName, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

define( 'DAY_IN_SECONDS', 86400 );

$GLOBALS['wp_filter'] = array();
$GLOBALS['shortcode_tags'] = array( 'gallery' => 'wphx_gallery_shortcode' );
$GLOBALS['wphx_filters'] = array();
$GLOBALS['wphx_actions'] = array();
$GLOBALS['wphx_shortcodes'] = array();
$GLOBALS['wphx_oembed_gets'] = array();
$GLOBALS['wphx_meta_updates'] = array();
$GLOBALS['wphx_meta_deletes'] = array();
$GLOBALS['wphx_cache_sets'] = array();
$GLOBALS['wphx_cache_gets'] = array();
$GLOBALS['wphx_post_inserts'] = array();
$GLOBALS['wphx_post_updates'] = array();
$GLOBALS['wphx_kses'] = array();
$GLOBALS['wphx_meta'] = array();
$GLOBALS['wphx_object_cache'] = array();
$GLOBALS['wphx_oembed_cache_posts'] = array(
\t'cached-query-key' => (object) array(
\t\t'ID' => 88,
\t\t'post_type' => 'oembed_cache',
\t\t'post_status' => 'publish',
\t\t'post_name' => 'cached-query-key',
\t\t'post_content' => '<iframe data-cache-post=\"query\"></iframe>',
\t\t'post_modified_gmt' => '2026-06-01 00:00:00',
\t),
);
$GLOBALS['wphx_posts'] = array(
\t7 => (object) array(
\t\t'ID' => 7,
\t\t'post_type' => 'post',
\t\t'post_status' => 'publish',
\t\t'post_content' => '[embed]https://success.example/cache-oembed[/embed]' . \"\\n\" . 'https://success.example/auto-cache',
\t),
\t9 => (object) array(
\t\t'ID' => 9,
\t\t'post_type' => 'attachment',
\t\t'post_status' => 'publish',
\t\t'post_content' => 'https://success.example/ignored',
\t),
);
$GLOBALS['wphx_current_post_id'] = 7;

function wphx_gallery_shortcode() { return '<gallery />'; }
function __return_false() { return false; }
function esc_url( $value ) { return (string) $value; }
function esc_html( $value ) { return htmlspecialchars( (string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' ); }
function wp_slash( $value ) { return $value; }
function wp_parse_args( $args, $defaults = array() ) {
\tif ( is_object( $args ) ) {
\t\t$args = get_object_vars( $args );
\t}
\tif ( ! is_array( $args ) ) {
\t\tparse_str( (string) $args, $args );
\t}
\treturn array_merge( $defaults, $args );
}
function wp_embed_defaults( $url = '' ) {
\treturn array( 'width' => 500, 'height' => 281 );
}
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => $callback, 'accepted_args' => $accepted_args );
\t$GLOBALS['wphx_filters'][] = array(
\t\t'hook' => $hook_name,
\t\t'priority' => $priority,
\t\t'accepted_args' => $accepted_args,
\t\t'callback' => is_array( $callback ) ? array( is_object( $callback[0] ) ? get_class( $callback[0] ) : $callback[0], $callback[1] ) : $callback,
\t);
\treturn true;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_actions'][] = array( 'hook' => $hook_name, 'priority' => $priority );
\treturn add_filter( $hook_name, $callback, $priority, $accepted_args );
}
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filters'][] = array( 'applied' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( 'oembed_ttl' === $hook_name ) {
\t\treturn 300;
\t}
\tif ( 'embed_oembed_html' === $hook_name ) {
\t\treturn $value . '<!-- filtered:' . $hook_name . ' -->';
\t}
\tif ( 'embed_maybe_make_link' === $hook_name ) {
\t\treturn $value . '<!-- maybe-link-filtered -->';
\t}
\tif ( 'embed_cache_oembed_types' === $hook_name ) {
\t\treturn $value;
\t}
\tif ( 'embed_oembed_discover' === $hook_name ) {
\t\treturn $value;
\t}
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $entry ) {
\t\t\t$call_args = array_slice( array_merge( array( $value ), $args ), 0, $entry['accepted_args'] );
\t\t\t$value = call_user_func_array( $entry['callback'], $call_args );
\t\t}
\t}
\treturn $value;
}
function has_filter( $hook_name, $callback = false ) {
\tif ( 'content_save_pre' === $hook_name && 'wp_filter_post_kses' === $callback ) {
\t\treturn 10;
\t}
\treturn ! empty( $GLOBALS['wp_filter'][ $hook_name ] );
}
function kses_remove_filters() { $GLOBALS['wphx_kses'][] = 'remove'; }
function kses_init_filters() { $GLOBALS['wphx_kses'][] = 'init'; }
function add_shortcode( $tag, $callback ) {
\t$GLOBALS['shortcode_tags'][ $tag ] = $callback;
\t$GLOBALS['wphx_shortcodes'][] = array( 'add' => $tag );
}
function remove_all_shortcodes() {
\t$GLOBALS['shortcode_tags'] = array();
\t$GLOBALS['wphx_shortcodes'][] = array( 'remove_all' => true );
}
function do_shortcode( $content, $ignore_html = false ) {
\treturn preg_replace_callback(
\t\t'/\\\\[embed(?:[^\\\\]]*)\\\\](.*?)\\\\[\\\\/embed\\\\]/s',
\t\tfunction ( $matches ) {
\t\t\t$callback = $GLOBALS['shortcode_tags']['embed'] ?? null;
\t\t\tif ( is_callable( $callback ) ) {
\t\t\t\treturn call_user_func( $callback, array(), trim( $matches[1] ) );
\t\t\t}
\t\t\treturn $matches[0];
\t\t},
\t\t$content
\t);
}
function get_post( $post = null ) {
\tif ( null === $post ) {
\t\t$post = $GLOBALS['wphx_current_post_id'];
\t}
\tif ( is_object( $post ) ) {
\t\treturn $post;
\t}
\treturn $GLOBALS['wphx_posts'][ (int) $post ] ?? $GLOBALS['wphx_oembed_cache_posts'][ $post ] ?? null;
}
function get_post_type( $post = null ) {
\t$post = get_post( $post );
\treturn $post ? $post->post_type : false;
}
function get_post_types( $args = array(), $output = 'names', $operator = 'and' ) {
\treturn array( 'post', 'page' );
}
function get_post_meta( $post_id, $key = '', $single = false ) {
\treturn $GLOBALS['wphx_meta'][ $post_id ][ $key ] ?? '';
}
function update_post_meta( $post_id, $key, $value ) {
\t$GLOBALS['wphx_meta'][ $post_id ][ $key ] = $value;
\t$GLOBALS['wphx_meta_updates'][] = array( 'post_id' => $post_id, 'key' => $key, 'value' => $value );
\treturn true;
}
function get_post_custom_keys( $post_id ) {
\treturn array_keys( $GLOBALS['wphx_meta'][ $post_id ] ?? array() );
}
function delete_post_meta( $post_id, $key ) {
\tunset( $GLOBALS['wphx_meta'][ $post_id ][ $key ] );
\t$GLOBALS['wphx_meta_deletes'][] = array( 'post_id' => $post_id, 'key' => $key );
\treturn true;
}
function wp_cache_get( $key, $group = '' ) {
\t$GLOBALS['wphx_cache_gets'][] = array( 'key' => $key, 'group' => $group );
\treturn $GLOBALS['wphx_object_cache'][ $group ][ $key ] ?? false;
}
function wp_cache_set( $key, $value, $group = '' ) {
\t$GLOBALS['wphx_object_cache'][ $group ][ $key ] = $value;
\t$GLOBALS['wphx_cache_sets'][] = array( 'key' => $key, 'value' => $value, 'group' => $group );
\treturn true;
}
class WP_Query {
\tpublic $posts = array();
\tpublic function __construct( $args = array() ) {
\t\t$name = $args['name'] ?? '';
\t\tif ( isset( $GLOBALS['wphx_oembed_cache_posts'][ $name ] ) ) {
\t\t\t$this->posts = array( $GLOBALS['wphx_oembed_cache_posts'][ $name ] );
\t\t}
\t}
}
function wp_insert_post( $postarr ) {
\t$id = 200 + count( $GLOBALS['wphx_post_inserts'] );
\t$post = (object) array_merge( array( 'ID' => $id, 'post_modified_gmt' => gmdate( 'Y-m-d H:i:s' ) ), $postarr );
\t$GLOBALS['wphx_oembed_cache_posts'][ $post->post_name ] = $post;
\t$GLOBALS['wphx_post_inserts'][] = $postarr;
\treturn $id;
}
function wp_update_post( $postarr ) {
\t$GLOBALS['wphx_post_updates'][] = $postarr;
\tforeach ( $GLOBALS['wphx_oembed_cache_posts'] as $name => $post ) {
\t\tif ( (int) $post->ID === (int) $postarr['ID'] ) {
\t\t\t$GLOBALS['wphx_oembed_cache_posts'][ $name ]->post_content = $postarr['post_content'];
\t\t}
\t}
\treturn $postarr['ID'];
}
function wp_replace_in_html_tags( $haystack, $replace_pairs ) {
\treturn preg_replace_callback(
\t\t'/<[^>]+>/',
\t\tfunction ( $matches ) use ( $replace_pairs ) {
\t\t\treturn strtr( $matches[0], $replace_pairs );
\t\t},
\t\t$haystack
\t);
}
function wp_oembed_get( $url, $attr = array() ) {
\t$GLOBALS['wphx_oembed_gets'][] = array( 'url' => $url, 'attr' => $attr );
\tif ( str_contains( $url, 'success.example' ) ) {
\t\treturn '<iframe data-url=\"' . esc_html( $url ) . '\" data-width=\"' . esc_html( $attr['width'] ?? '' ) . '\"></iframe>';
\t}
\treturn false;
}
function wphx_cache_keys( $url, $attr = array() ) {
\t$attr = wp_parse_args( $attr, wp_embed_defaults( $url ) );
\t$key_suffix = md5( str_replace( '&amp;', '&', $url ) . serialize( $attr ) );
\treturn array( '_oembed_' . $key_suffix, '_oembed_time_' . $key_suffix, $key_suffix );
}

require __DIR__ . '/wp-includes/class-wp-embed.php';

$wp_embed = new WP_Embed();
$result = array( 'case' => $case );

switch ( $case ) {
\tcase 'wp-embed:constructor-run-shortcode':
\t\t$GLOBALS['shortcode_tags']['gallery'] = 'wphx_gallery_shortcode';
\t\t$content = 'Before [embed]https://success.example/run-shortcode[/embed] After [gallery]';
\t\t$output = $wp_embed->run_shortcode( $content );
\t\t$result += array(
\t\t\t'constructor_filters' => array_values( array_filter( $GLOBALS['wphx_filters'], fn( $entry ) => isset( $entry['hook'] ) ) ),
\t\t\t'shortcode_events' => $GLOBALS['wphx_shortcodes'],
\t\t\t'output' => $output,
\t\t\t'gallery_restored' => isset( $GLOBALS['shortcode_tags']['gallery'] ),
\t\t\t'embed_placeholder_after_restore' => $GLOBALS['shortcode_tags']['embed'] ?? null,
\t\t);
\t\tbreak;
\tcase 'wp-embed:shortcode-cache-hit':
\t\tlist( $cachekey, $cachekey_time ) = wphx_cache_keys( 'https://success.example/cached', array( 'width' => 320 ) );
\t\t$GLOBALS['wphx_meta'][7][ $cachekey ] = '<iframe data-cache=\"hit\"></iframe>';
\t\t$GLOBALS['wphx_meta'][7][ $cachekey_time ] = time();
\t\t$html = $wp_embed->shortcode( array( 'width' => 320 ), 'https://success.example/cached' );
\t\t$result += array(
\t\t\t'html' => $html,
\t\t\t'oembed_gets' => $GLOBALS['wphx_oembed_gets'],
\t\t\t'meta_updates' => $GLOBALS['wphx_meta_updates'],
\t\t\t'last_url' => $wp_embed->last_url,
\t\t\t'last_attr' => $wp_embed->last_attr,
\t\t);
\t\tbreak;
\tcase 'wp-embed:shortcode-remote-success':
\t\t$html = $wp_embed->shortcode( array( 'height' => 111 ), 'https://success.example/fresh' );
\t\t$result += array(
\t\t\t'html' => $html,
\t\t\t'oembed_gets' => $GLOBALS['wphx_oembed_gets'],
\t\t\t'meta_update_keys' => array_map( fn( $entry ) => $entry['key'], $GLOBALS['wphx_meta_updates'] ),
\t\t\t'meta_update_values' => array_map( fn( $entry ) => is_string( $entry['value'] ) && str_contains( $entry['value'], 'success.example/fresh' ) ? 'html' : ( is_int( $entry['value'] ) ? 'time' : $entry['value'] ), $GLOBALS['wphx_meta_updates'] ),
\t\t);
\t\tbreak;
\tcase 'wp-embed:autoembed-unknown-fallback':
\t\t$content = \"Lead\\nhttps://success.example/standalone\\n<p>https://fail.example/paragraph</p>\\n<span data-url=\\\"https://success.example/inside-tag\\\">Keep</span>\";
\t\t$output = $wp_embed->autoembed( $content );
\t\t$wp_embed->return_false_on_fail = true;
\t\t$return_false = $wp_embed->maybe_make_link( 'https://fail.example/no-link' );
\t\t$result += array(
\t\t\t'output' => $output,
\t\t\t'oembed_gets' => $GLOBALS['wphx_oembed_gets'],
\t\t\t'linkifunknown_after' => $wp_embed->linkifunknown,
\t\t\t'return_false_on_fail' => $return_false,
\t\t);
\t\tbreak;
\tcase 'wp-embed:cache-maintenance':
\t\t$GLOBALS['wphx_meta'][7]['_oembed_alpha'] = 'alpha';
\t\t$GLOBALS['wphx_meta'][7]['_oembed_time_alpha'] = time();
\t\t$GLOBALS['wphx_meta'][7]['unrelated'] = 'keep';
\t\t$wp_embed->delete_oembed_caches( 7 );
\t\t$wp_embed->cache_oembed( 7 );
\t\t$found_query = $wp_embed->find_oembed_post_id( 'cached-query-key' );
\t\t$found_cached = $wp_embed->find_oembed_post_id( 'cached-query-key' );
\t\t$wp_embed->cache_oembed( 9 );
\t\t$result += array(
\t\t\t'deleted_meta' => $GLOBALS['wphx_meta_deletes'],
\t\t\t'remaining_meta_keys' => array_keys( $GLOBALS['wphx_meta'][7] ?? array() ),
\t\t\t'oembed_gets' => $GLOBALS['wphx_oembed_gets'],
\t\t\t'post_id_after_cache' => $wp_embed->post_ID,
\t\t\t'usecache_after_cache' => $wp_embed->usecache,
\t\t\t'found_query' => $found_query,
\t\t\t'found_cached' => $found_cached,
\t\t\t'cache_sets' => $GLOBALS['wphx_cache_sets'],
\t\t\t'cache_gets' => $GLOBALS['wphx_cache_gets'],
\t\t);
\t\tbreak;
\tdefault:
\t\tfwrite( STDERR, 'Unknown case: ' . $case . PHP_EOL );
\t\texit( 2 );
}

echo json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . PHP_EOL;
`
  );
}

function observation(caseDef, root) {
  const raw = command("php", [`${root}/probe.php`, caseDef.id]);
  const parsed = JSON.parse(raw);
  return {
    ...parsed,
    assertions: {
      constructor_restores_shortcodes:
        caseDef.id !== "wp-embed:constructor-run-shortcode" ||
        (parsed.gallery_restored === true && parsed.output.includes("success.example/run-shortcode")),
      cache_hit_skips_remote:
        caseDef.id !== "wp-embed:shortcode-cache-hit" ||
        (parsed.html.includes('data-cache="hit"') && parsed.oembed_gets.length === 0 && parsed.meta_updates.length === 0),
      remote_success_writes_cache:
        caseDef.id !== "wp-embed:shortcode-remote-success" ||
        (parsed.html.includes("success.example/fresh") &&
          parsed.oembed_gets.length === 1 &&
          parsed.meta_update_values.includes("html") &&
          parsed.meta_update_values.includes("time")),
      autoembed_suppresses_unknown_link:
        caseDef.id !== "wp-embed:autoembed-unknown-fallback" ||
        (parsed.output.includes("success.example/standalone") &&
          parsed.output.includes("https://fail.example/paragraph") &&
          !parsed.output.includes('<a href="https://fail.example/paragraph"') &&
          parsed.linkifunknown_after === true &&
          parsed.return_false_on_fail === false),
      cache_maintenance_deterministic:
        caseDef.id !== "wp-embed:cache-maintenance" ||
        (parsed.deleted_meta.length === 2 &&
          parsed.remaining_meta_keys.includes("unrelated") &&
          parsed.usecache_after_cache === true &&
          parsed.found_query === 88 &&
          parsed.found_cached === 88)
    }
  };
}

function runRoot(root) {
  return Object.fromEntries(CASES.map((caseDef) => [caseDef.id, observation(caseDef, root)]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents)
      throw new Error(`${path} is stale; run npm run wp:core:wphx-312-wp-embed-cache-autoembed-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/wp-embed-cache-autoembed-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "WP_Embed cache, shortcode, and autoembed behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 wp-includes/class-wp-embed.php in isolated PHP CLI probes with deterministic hooks, shortcodes, post/meta, object-cache, WP_Query, KSES, and wp_oembed_get stubs. It observes constructor registrations, shortcode cache hits, remote-success cache writes, unknown fallback handling, autoembed replacement, cache_oembed priming, delete_oembed_caches, and find_oembed_post_id without claiming live oEmbed network/discovery, installed editor/admin Ajax, REST controller behavior, browser rendering, database-backed storage, or generated public PHP ownership."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-stubbed-wordpress-runtime-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass live/recorded oEmbed fetch, database-backed post/meta cache storage, installed editor/admin Ajax, REST oEmbed controller behavior, browser rendering, selected upstream PHPUnit, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-wp-embed-cache-autoembed-oracle-fixture",
        "npm run wp:core:wphx-312-wp-embed-cache-autoembed-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-30-wp-embed-cache-autoembed-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

async function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mirrorSources(ORACLE_ROOT);
  mirrorSources(CANDIDATE_ROOT);
  writeProbe(ORACLE_ROOT);
  writeProbe(CANDIDATE_ROOT);

  const oracle = runRoot(ORACLE_ROOT);
  const candidate = runRoot(CANDIDATE_ROOT);
  const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);
  const observationsAssert = Object.values(oracle).every((entry) => Object.values(entry.assertions).every(Boolean));
  if (!observationsMatch) {
    console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
    process.exit(1);
  }
  if (!observationsAssert) {
    console.error(JSON.stringify({ status: "failed", reason: "fixture assertions failed", oracle }, null, 2));
    process.exit(1);
  }

  const phpLint = SOURCE_FILES.map((path) => ({
    path,
    oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
    candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
  }));
  const manifest = {
    schema: "wphx.wp-core-wp-embed-cache-autoembed-oracle-fixture.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["oracle_source_mirror", "candidate_package_mirror", "php_cli_observed_fixture"],
    artifact_scope: "fixture",
    inputs: {
      surface_manifest: inputRecord(SURFACE),
      adapter_contract_manifest: inputRecord(CONTRACT),
      feed_embed_fixture_manifest: inputRecord(FEED_EMBED_FIXTURE),
      remote_oembed_fixture_manifest: inputRecord(REMOTE_OEMBED_FIXTURE),
      oembed_registry_fixture_manifest: inputRecord(OEMBED_REGISTRY_FIXTURE),
      runner: inputRecord(RUNNER),
      upstream_sources: SOURCE_FILES.map(sourceRecord)
    },
    fixture: {
      cases: CASES,
      covered_symbols: COVERED_SYMBOLS,
      source_files: SOURCE_FILES,
      side_effect_policy: {
        external_network_io: false,
        database_io: false,
        live_installed_wordpress: false,
        php_cli: true,
        runtime_stubs:
          "WordPress hooks, shortcodes, post/meta storage, object cache, WP_Query, KSES, and wp_oembed_get are deterministic stubs; copied class-wp-embed.php remains the executed public class source."
      },
      public_abi_policy: {
        public_php_replacement_claimed: false,
        copied_oracle_public_php: true,
        adapter_contract_foundation: CONTRACT,
        installed_wordpress_behavior_claimed: false
      }
    },
    build: { oracle_root: ORACLE_ROOT, candidate_root: CANDIDATE_ROOT, php_lint: phpLint },
    observations: {
      oracle,
      candidate,
      match: observationsMatch,
      oracle_sha256: sha256(JSON.stringify(oracle)),
      candidate_sha256: sha256(JSON.stringify(candidate)),
      assertions_pass: observationsAssert
    },
    remaining_gaps: [
      {
        id: "live-oembed-network-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "wp_oembed_get is a deterministic stub. Live/recorded provider discovery and remote fetch remain later WPHX-312 gates."
      },
      {
        id: "installed-editor-admin-ajax-not-executed",
        owner: ISSUE.external_ref,
        detail:
          "The fixture executes WP_Embed directly through PHP CLI probes. maybe_run_ajax_cache, installed editor/admin screens, browser rendering, and REST oEmbed controller dispatch remain later gates."
      },
      {
        id: "public-php-adapter-not-yet-generated",
        owner: ISSUE.external_ref,
        detail: "The fixture compares copied oracle PHP in both roots; generated original-path PHP replacement remains a later cross-domain gate."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      fixture_cases: CASES.length,
      covered_symbols: COVERED_SYMBOLS.length,
      observations_match: observationsMatch,
      observations_assert: observationsAssert,
      public_php_replacement_claimed: false,
      installed_wordpress_behavior_claimed: false,
      live_oembed_fetch_claimed: false
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-312-30-wp-embed-cache-autoembed-oracle-fixture",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    artifacts: [
      { path: OUT, role: "WP_Embed cache/autoembed oracle-source-mirror fixture manifest" },
      { path: OWNERSHIP, role: "ownership manifest for copied-oracle WP_Embed cache/autoembed boundary" },
      { path: RUNNER, role: "deterministic PHP CLI oracle/candidate fixture generator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-312-wp-embed-cache-autoembed-oracle-fixture",
      "npm run wp:core:wphx-312-wp-embed-cache-autoembed-oracle-fixture:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
      "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
      "receipt:wphx-312-04-feed-embed-https-oracle-fixture",
      "receipt:wphx-312-08-remote-fetch-oembed-oracle-fixture",
      "receipt:wphx-312-29-oembed-provider-registry-oracle-fixture"
    ],
    validation_result: manifest.validation_result
  };

  try {
    writeOrCheck(OUT, manifestText);
    writeOrCheck(OWNERSHIP, JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n");
    writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
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
        fixture_cases: CASES.length,
        observations_match: observationsMatch
      },
      null,
      2
    )
  );
}

await main();
