#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.8.4",
  external_ref: "WPHX-304.04",
  title: "Build object cache runtime/drop-in fixture harness"
};
const OUT_ROOT = "build/wp-core/wphx-304-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const RUNTIME_PROBE = `${OUT_ROOT}/runtime-probe.php`;
const COMPAT_PROBE = `${OUT_ROOT}/compat-probe.php`;
const OUT = "manifests/wp-core/wphx-304-04-object-cache-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-304-04-object-cache-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-304-04-object-cache-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-304-01-options-cache-surface.v1.json";
const RECORDED_AT = "2026-06-21T03:45:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/cache-compat.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/option.php",
  "src/wp-includes/functions.php"
];

const COVERED_SYMBOLS = [
  "wp_cache_init",
  "wp_cache_add",
  "wp_cache_add_multiple",
  "wp_cache_replace",
  "wp_cache_set",
  "wp_cache_set_multiple",
  "wp_cache_get",
  "wp_cache_get_multiple",
  "wp_cache_delete",
  "wp_cache_delete_multiple",
  "wp_cache_incr",
  "wp_cache_decr",
  "wp_cache_flush",
  "wp_cache_flush_runtime",
  "wp_cache_flush_group",
  "wp_cache_supports",
  "wp_cache_close",
  "wp_cache_add_global_groups",
  "wp_cache_add_non_persistent_groups",
  "wp_cache_switch_to_blog",
  "wp_cache_reset",
  "wp_cache_get_salted",
  "wp_cache_set_salted",
  "wp_cache_get_multiple_salted",
  "wp_cache_set_multiple_salted",
  "wp_using_ext_object_cache",
  "wp_start_object_cache",
  "WP_Object_Cache",
  "WP_Object_Cache::__construct",
  "WP_Object_Cache::__get",
  "WP_Object_Cache::__set",
  "WP_Object_Cache::__isset",
  "WP_Object_Cache::__unset",
  "WP_Object_Cache::add",
  "WP_Object_Cache::add_multiple",
  "WP_Object_Cache::replace",
  "WP_Object_Cache::set",
  "WP_Object_Cache::set_multiple",
  "WP_Object_Cache::get",
  "WP_Object_Cache::get_multiple",
  "WP_Object_Cache::delete",
  "WP_Object_Cache::delete_multiple",
  "WP_Object_Cache::incr",
  "WP_Object_Cache::decr",
  "WP_Object_Cache::flush",
  "WP_Object_Cache::flush_group",
  "WP_Object_Cache::add_global_groups",
  "WP_Object_Cache::switch_to_blog",
  "WP_Object_Cache::reset"
];

const FIXTURE_CASES = [
  { id: "runtime:add-get-found-false", symbol: "wp_cache_add/wp_cache_get", focus: "stored false values are distinguishable from misses through the found reference" },
  { id: "runtime:set-replace-delete", symbol: "wp_cache_set/wp_cache_replace/wp_cache_delete", focus: "set, replace existing/missing, delete existing/missing, and default group semantics" },
  { id: "runtime:multiple-helpers", symbol: "wp_cache_add_multiple/wp_cache_set_multiple/wp_cache_get_multiple/wp_cache_delete_multiple", focus: "batch helper return maps, false values, and missing keys" },
  { id: "runtime:incr-decr", symbol: "wp_cache_incr/wp_cache_decr", focus: "numeric mutation, missing-key false, nonnumeric coercion, and zero clamping" },
  { id: "runtime:object-clone", symbol: "WP_Object_Cache::set/WP_Object_Cache::get", focus: "object values are cloned on write and on read" },
  { id: "runtime:flush-support", symbol: "wp_cache_supports/wp_cache_flush_group/wp_cache_flush_runtime/wp_cache_flush", focus: "feature reporting, group flush, runtime flush alias, full flush, close, and non-persistent group no-op" },
  { id: "runtime:global-groups-blog-switch", symbol: "wp_cache_add_global_groups/wp_cache_switch_to_blog", focus: "multisite blog prefixes isolate local groups while global groups remain shared" },
  { id: "runtime:suspend-addition", symbol: "wp_suspend_cache_addition/wp_cache_add/wp_cache_set", focus: "cache addition suspension blocks add() while set() still writes" },
  { id: "runtime:reset-and-magic-properties", symbol: "wp_cache_reset/WP_Object_Cache::__get/__set/__isset/__unset", focus: "reset clears non-global groups, keeps globals, emits deprecated hooks, and preserves magic property compatibility" },
  { id: "dropin:bootstrap-compat-surface", symbol: "wp_start_object_cache/wp_using_ext_object_cache/cache-compat.php", focus: "external object-cache drop-in bootstrap, compat function installation, and global group registration" },
  { id: "dropin:multiple-fallbacks", symbol: "wp_cache_add_multiple/wp_cache_set_multiple/wp_cache_get_multiple/wp_cache_delete_multiple", focus: "cache-compat batch helpers delegate to a legacy drop-in's single-key functions" },
  { id: "dropin:supports-and-flush-fallbacks", symbol: "wp_cache_supports/wp_cache_flush_runtime/wp_cache_flush_group", focus: "legacy drop-ins report unsupported features and doing-it-wrong flush fallbacks do not mutate storage" },
  { id: "dropin:salted-helpers", symbol: "wp_cache_get_salted/wp_cache_set_salted/wp_cache_get_multiple_salted/wp_cache_set_multiple_salted", focus: "salted compat helpers store salt/data envelopes and reject stale or malformed cache entries" },
  { id: "dropin:switch-to-blog-compat", symbol: "wp_cache_switch_to_blog", focus: "compat switch delegates to a drop-in method when present and falls back when absent" }
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function command(commandName, commandArgs, options = {}) {
  return execFileSync(commandName, commandArgs, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    maxBuffer: 1024 * 1024 * 50
  }).trim();
}

function maybeCommand(commandName, commandArgs) {
  try {
    return command(commandName, commandArgs);
  } catch {
    return null;
  }
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

function upstreamPath(path) {
  return `${UPSTREAM_ROOT}/${path}`;
}

function mirrorPath(root, path) {
  return `${root}/${path.replace(/^src\//, "")}`;
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = mirrorPath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function sourceRecord(path) {
  return {
    path,
    repo_path: upstreamPath(path),
    bytes: statSync(upstreamPath(path)).size,
    sha256: sha256File(upstreamPath(path))
  };
}

function writeObjectCacheDropin(root) {
  const target = `${root}/wp-content/object-cache.php`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    `<?php

class WPHX_304_04_Dropin_Object_Cache {
\tpublic $store = array();
\tpublic $events = array();
\tpublic $global_groups = array();
\tpublic $non_persistent_groups = array();
\tpublic $blog_id = null;

\tprivate function group_name( $group ) {
\t\treturn '' === $group ? 'default' : $group;
\t}

\tpublic function add( $key, $data, $group = '', $expire = 0 ) {
\t\t$group = $this->group_name( $group );
\t\tif ( isset( $this->store[ $group ] ) && array_key_exists( $key, $this->store[ $group ] ) ) {
\t\t\treturn false;
\t\t}
\t\treturn $this->set( $key, $data, $group, $expire );
\t}

\tpublic function set( $key, $data, $group = '', $expire = 0 ) {
\t\t$group = $this->group_name( $group );
\t\t$this->store[ $group ][ $key ] = $data;
\t\t$this->events[] = array( 'op' => 'set', 'key' => $key, 'group' => $group, 'expire' => (int) $expire );
\t\treturn true;
\t}

\tpublic function get( $key, $group = '', $force = false, &$found = null ) {
\t\t$group = $this->group_name( $group );
\t\tif ( isset( $this->store[ $group ] ) && array_key_exists( $key, $this->store[ $group ] ) ) {
\t\t\t$found = true;
\t\t\treturn $this->store[ $group ][ $key ];
\t\t}
\t\t$found = false;
\t\treturn false;
\t}

\tpublic function delete( $key, $group = '' ) {
\t\t$group = $this->group_name( $group );
\t\tif ( ! isset( $this->store[ $group ] ) || ! array_key_exists( $key, $this->store[ $group ] ) ) {
\t\t\treturn false;
\t\t}
\t\tunset( $this->store[ $group ][ $key ] );
\t\t$this->events[] = array( 'op' => 'delete', 'key' => $key, 'group' => $group );
\t\treturn true;
\t}

\tpublic function flush() {
\t\t$this->store = array();
\t\t$this->events[] = array( 'op' => 'flush' );
\t\treturn true;
\t}

\tpublic function add_global_groups( $groups ) {
\t\tforeach ( (array) $groups as $group ) {
\t\t\t$this->global_groups[ $group ] = true;
\t\t}
\t}

\tpublic function add_non_persistent_groups( $groups ) {
\t\tforeach ( (array) $groups as $group ) {
\t\t\t$this->non_persistent_groups[ $group ] = true;
\t\t}
\t}

\tpublic function switch_to_blog( $blog_id ) {
\t\t$this->blog_id = (int) $blog_id;
\t\t$this->events[] = array( 'op' => 'switch_to_blog', 'blogId' => $this->blog_id );
\t}
}

function wp_cache_init() {
\t$GLOBALS['wp_object_cache'] = new WPHX_304_04_Dropin_Object_Cache();
}

function wp_cache_add( $key, $data, $group = '', $expire = 0 ) {
\tglobal $wp_object_cache;
\treturn $wp_object_cache->add( $key, $data, $group, (int) $expire );
}

function wp_cache_set( $key, $data, $group = '', $expire = 0 ) {
\tglobal $wp_object_cache;
\treturn $wp_object_cache->set( $key, $data, $group, (int) $expire );
}

function wp_cache_get( $key, $group = '', $force = false, &$found = null ) {
\tglobal $wp_object_cache;
\treturn $wp_object_cache->get( $key, $group, $force, $found );
}

function wp_cache_delete( $key, $group = '' ) {
\tglobal $wp_object_cache;
\treturn $wp_object_cache->delete( $key, $group );
}

function wp_cache_flush() {
\tglobal $wp_object_cache;
\treturn $wp_object_cache->flush();
}

function wp_cache_add_global_groups( $groups ) {
\tglobal $wp_object_cache;
\t$wp_object_cache->add_global_groups( $groups );
}

function wp_cache_add_non_persistent_groups( $groups ) {
\tglobal $wp_object_cache;
\t$wp_object_cache->add_non_persistent_groups( $groups );
}
`
  );
}

function writeRuntimeProbe() {
  mkdirSync(dirname(RUNTIME_PROBE), { recursive: true });
  writeFileSync(
    RUNTIME_PROBE,
    `<?php

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );
define( 'MULTISITE', true );

$GLOBALS['blog_id'] = 1;

require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/functions.php';

wp_cache_init();

function wphx_304_04_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
\t}
\tif ( is_float( $value ) ) {
\t\treturn array( 'type' => 'float', 'value' => $value );
\t}
\tif ( is_bool( $value ) ) {
\t\treturn array( 'type' => 'bool', 'value' => $value );
\t}
\tif ( null === $value ) {
\t\treturn array( 'type' => 'null', 'value' => null );
\t}
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => (string) $value,
\t\t'hex'    => bin2hex( (string) $value ),
\t\t'bytes'  => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_304_04_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_304_04_scalar( $key ),
\t\t\t\t'value' => wphx_304_04_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_304_04_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_304_04_scalar( $value );
}

function wphx_304_04_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_304_04_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_304_04_sort_deep( $value ) {
\tif ( ! is_array( $value ) ) {
\t\treturn $value;
\t}
\tforeach ( $value as $key => $entry ) {
\t\t$value[ $key ] = wphx_304_04_sort_deep( $entry );
\t}
\tksort( $value );
\treturn $value;
}

function wphx_304_04_cache_snapshot() {
\tglobal $wp_object_cache;
\t$global_groups = $wp_object_cache->global_groups;
\tksort( $global_groups );
\treturn array(
\t\t'class'        => get_class( $wp_object_cache ),
\t\t'cache'        => wphx_304_04_sort_deep( $wp_object_cache->cache ),
\t\t'cacheHits'    => $wp_object_cache->cache_hits,
\t\t'cacheMisses'  => $wp_object_cache->cache_misses,
\t\t'globalGroups' => $global_groups,
\t\t'blogPrefix'   => $wp_object_cache->blog_prefix,
\t\t'multisite'    => $wp_object_cache->multisite,
\t\t'cacheIsset'   => isset( $wp_object_cache->cache ),
\t);
}

function wphx_304_04_reset_state() {
\tglobal $blog_id, $wp_filter;
\t$blog_id   = 1;
\t$wp_filter = array();
\twp_suspend_cache_addition( false );
\twp_cache_init();
}

function wphx_304_04_run_cases() {
\tglobal $wp_object_cache;
\t$cases = array();

\twphx_304_04_reset_state();
\t$found_false = null;
\t$found_missing = null;
\t$cases[] = wphx_304_04_case(
\t\t'runtime:add-get-found-false',
\t\t'wp_cache_add/wp_cache_get',
\t\tarray(
\t\t\t'addFalse'      => wp_cache_add( 'falsey', false, 'group-a' ),
\t\t\t'valueFalse'    => wp_cache_get( 'falsey', 'group-a', false, $found_false ),
\t\t\t'foundFalse'    => $found_false,
\t\t\t'duplicateAdd'  => wp_cache_add( 'falsey', 'again', 'group-a' ),
\t\t\t'missingValue'  => wp_cache_get( 'missing', 'group-a', false, $found_missing ),
\t\t\t'foundMissing'  => $found_missing,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\t$set = wp_cache_set( 'alpha', 'one', '' );
\t$replace_existing = wp_cache_replace( 'alpha', 'two', '' );
\t$replace_missing = wp_cache_replace( 'missing', 'unused', '' );
\t$after_replace = wp_cache_get( 'alpha', '' );
\t$delete_existing = wp_cache_delete( 'alpha', '' );
\t$delete_again = wp_cache_delete( 'alpha', '' );
\t$found_after_delete = null;
\t$after_delete = wp_cache_get( 'alpha', '', false, $found_after_delete );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:set-replace-delete',
\t\t'wp_cache_set/wp_cache_replace/wp_cache_delete',
\t\tarray(
\t\t\t'set'              => $set,
\t\t\t'replaceExisting'  => $replace_existing,
\t\t\t'replaceMissing'   => $replace_missing,
\t\t\t'afterReplace'     => $after_replace,
\t\t\t'deleteExisting'   => $delete_existing,
\t\t\t'deleteAgain'      => $delete_again,
\t\t\t'afterDelete'      => $after_delete,
\t\t\t'foundAfterDelete' => $found_after_delete,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\t$add_multiple = wp_cache_add_multiple( array( 'a' => 'A', 'b' => false ), 'multi' );
\t$add_duplicate = wp_cache_add_multiple( array( 'a' => 'again', 'b' => true, 'c' => 'C' ), 'multi' );
\t$set_multiple = wp_cache_set_multiple( array( 'b' => 'B', 'd' => 'D' ), 'multi' );
\t$get_multiple = wp_cache_get_multiple( array( 'a', 'b', 'c', 'd', 'z' ), 'multi' );
\t$delete_multiple = wp_cache_delete_multiple( array( 'a', 'z', 'd' ), 'multi' );
\t$after_multiple_delete = wp_cache_get_multiple( array( 'a', 'b', 'c', 'd' ), 'multi' );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:multiple-helpers',
\t\t'wp_cache_add_multiple/wp_cache_set_multiple/wp_cache_get_multiple/wp_cache_delete_multiple',
\t\tarray(
\t\t\t'add'         => $add_multiple,
\t\t\t'duplicate'   => $add_duplicate,
\t\t\t'set'         => $set_multiple,
\t\t\t'get'         => $get_multiple,
\t\t\t'delete'      => $delete_multiple,
\t\t\t'afterDelete' => $after_multiple_delete,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\twp_cache_set( 'count', 4, 'numbers' );
\twp_cache_set( 'text', 'abc', 'numbers' );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:incr-decr',
\t\t'wp_cache_incr/wp_cache_decr',
\t\tarray(
\t\t\t'incr'        => wp_cache_incr( 'count', 3, 'numbers' ),
\t\t\t'decr'        => wp_cache_decr( 'count', 2, 'numbers' ),
\t\t\t'clamp'       => wp_cache_decr( 'count', 99, 'numbers' ),
\t\t\t'missingIncr' => wp_cache_incr( 'missing', 1, 'numbers' ),
\t\t\t'textIncr'    => wp_cache_incr( 'text', 2, 'numbers' ),
\t\t\t'textDecr'    => wp_cache_decr( 'text', 5, 'numbers' ),
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\t$object = (object) array( 'name' => 'original', 'flag' => true );
\twp_cache_set( 'object', $object, 'objects' );
\t$object->name = 'mutated-original';
\t$first = wp_cache_get( 'object', 'objects' );
\t$first->name = 'mutated-read';
\t$second = wp_cache_get( 'object', 'objects' );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:object-clone',
\t\t'WP_Object_Cache::set/WP_Object_Cache::get',
\t\tarray(
\t\t\t'first'              => $first,
\t\t\t'second'             => $second,
\t\t\t'firstIsOriginal'    => $first === $object,
\t\t\t'firstIsSecond'      => $first === $second,
\t\t\t'originalAfterWrite' => $object,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\twp_cache_set( 'one', 'group-one', 'flush-one' );
\twp_cache_set( 'two', 'group-two', 'flush-two' );
\t$supports = array();
\tforeach ( array( 'add_multiple', 'set_multiple', 'get_multiple', 'delete_multiple', 'flush_runtime', 'flush_group', 'unknown' ) as $feature ) {
\t\t$supports[ $feature ] = wp_cache_supports( $feature );
\t}
\t$flush_group = wp_cache_flush_group( 'flush-one' );
\t$after_group = wp_cache_get_multiple( array( 'one' ), 'flush-one' );
\t$survivor = wp_cache_get( 'two', 'flush-two' );
\t$runtime_flush = wp_cache_flush_runtime();
\t$after_runtime = wp_cache_get( 'two', 'flush-two' );
\twp_cache_set( 'three', 'group-three', 'flush-three' );
\t$full_flush = wp_cache_flush();
\t$after_full = wp_cache_get( 'three', 'flush-three' );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:flush-support',
\t\t'wp_cache_supports/wp_cache_flush_group/wp_cache_flush_runtime/wp_cache_flush',
\t\tarray(
\t\t\t'supports'               => $supports,
\t\t\t'flushGroup'             => $flush_group,
\t\t\t'afterGroupFlush'        => $after_group,
\t\t\t'survivorBeforeRuntime'  => $survivor,
\t\t\t'flushRuntime'           => $runtime_flush,
\t\t\t'afterRuntimeFlush'      => $after_runtime,
\t\t\t'flush'                  => $full_flush,
\t\t\t'afterFullFlush'         => $after_full,
\t\t\t'close'                  => wp_cache_close(),
\t\t\t'nonPersistentGroupCall' => wp_cache_add_non_persistent_groups( array( 'counts', 'plugins' ) ),
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\twp_cache_add_global_groups( array( 'global-cache', 'another-global' ) );
\twp_cache_set( 'shared', 'blog-one-global', 'global-cache' );
\twp_cache_set( 'local', 'blog-one-local', 'local-cache' );
\t$blog_one_prefix = $wp_object_cache->blog_prefix;
\twp_cache_switch_to_blog( 2 );
\t$blog_two_prefix = $wp_object_cache->blog_prefix;
\t$global_on_two = wp_cache_get( 'shared', 'global-cache' );
\t$local_on_two_before = wp_cache_get( 'local', 'local-cache' );
\twp_cache_set( 'local', 'blog-two-local', 'local-cache' );
\twp_cache_switch_to_blog( 1 );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:global-groups-blog-switch',
\t\t'wp_cache_add_global_groups/wp_cache_switch_to_blog',
\t\tarray(
\t\t\t'blogOnePrefix'      => $blog_one_prefix,
\t\t\t'blogTwoPrefix'      => $blog_two_prefix,
\t\t\t'globalOnTwo'        => $global_on_two,
\t\t\t'localOnTwoBefore'   => $local_on_two_before,
\t\t\t'localOnOneAfter'    => wp_cache_get( 'local', 'local-cache' ),
\t\t\t'localOnTwoAfter'    => ( wp_cache_switch_to_blog( 2 ) || true ) ? wp_cache_get( 'local', 'local-cache' ) : null,
\t\t\t'globalGroups'       => $wp_object_cache->global_groups,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\t$previous = wp_suspend_cache_addition( true );
\t$add_suspended = wp_cache_add( 'suspended', 'blocked', 'suspend' );
\t$set_suspended = wp_cache_set( 'suspended', 'allowed-set', 'suspend' );
\t$read_suspended = wp_cache_get( 'suspended', 'suspend' );
\t$restored = wp_suspend_cache_addition( false );
\t$add_after_restore = wp_cache_add( 'after-restore', 'allowed-add', 'suspend' );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:suspend-addition',
\t\t'wp_suspend_cache_addition/wp_cache_add/wp_cache_set',
\t\tarray(
\t\t\t'previous'        => $previous,
\t\t\t'addSuspended'    => $add_suspended,
\t\t\t'setSuspended'    => $set_suspended,
\t\t\t'readSuspended'   => $read_suspended,
\t\t\t'restoredValue'   => $restored,
\t\t\t'addAfterRestore' => $add_after_restore,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\twphx_304_04_reset_state();
\t$deprecated_events = array();
\tadd_action(
\t\t'deprecated_function_run',
\t\tfunction ( $function_name, $replacement, $version ) use ( &$deprecated_events ) {
\t\t\t$deprecated_events[] = array( 'function' => $function_name, 'replacement' => $replacement, 'version' => $version );
\t\t},
\t\t10,
\t\t3
\t);
\twp_cache_add_global_groups( 'global-cache' );
\twp_cache_set( 'global', 'keep', 'global-cache' );
\twp_cache_set( 'local', 'drop', 'local-cache' );
\t$reset = wp_cache_reset();
\t$manual_cache = new WP_Object_Cache();
\t$manual_cache->cache = array( 'manual' => array( 'key' => 'value' ) );
\t$manual_before_unset = array(
\t\t'isset' => isset( $manual_cache->cache ),
\t\t'cache' => $manual_cache->cache,
\t);
\tunset( $manual_cache->cache );
\t$manual_after_unset = isset( $manual_cache->cache );
\t$cases[] = wphx_304_04_case(
\t\t'runtime:reset-and-magic-properties',
\t\t'wp_cache_reset/WP_Object_Cache::__get/__set/__isset/__unset',
\t\tarray(
\t\t\t'resetReturn'       => $reset,
\t\t\t'globalAfterReset'  => wp_cache_get( 'global', 'global-cache' ),
\t\t\t'localAfterReset'   => wp_cache_get( 'local', 'local-cache' ),
\t\t\t'deprecatedEvents'  => $deprecated_events,
\t\t\t'manualBeforeUnset' => $manual_before_unset,
\t\t\t'manualAfterUnset'  => $manual_after_unset,
\t\t),
\t\twphx_304_04_cache_snapshot()
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredFunctionExists' => array(
\t\t'wp_cache_init'                      => function_exists( 'wp_cache_init' ),
\t\t'wp_cache_add'                       => function_exists( 'wp_cache_add' ),
\t\t'wp_cache_add_multiple'              => function_exists( 'wp_cache_add_multiple' ),
\t\t'wp_cache_replace'                   => function_exists( 'wp_cache_replace' ),
\t\t'wp_cache_set'                       => function_exists( 'wp_cache_set' ),
\t\t'wp_cache_set_multiple'              => function_exists( 'wp_cache_set_multiple' ),
\t\t'wp_cache_get'                       => function_exists( 'wp_cache_get' ),
\t\t'wp_cache_get_multiple'              => function_exists( 'wp_cache_get_multiple' ),
\t\t'wp_cache_delete'                    => function_exists( 'wp_cache_delete' ),
\t\t'wp_cache_delete_multiple'           => function_exists( 'wp_cache_delete_multiple' ),
\t\t'wp_cache_incr'                      => function_exists( 'wp_cache_incr' ),
\t\t'wp_cache_decr'                      => function_exists( 'wp_cache_decr' ),
\t\t'wp_cache_flush'                     => function_exists( 'wp_cache_flush' ),
\t\t'wp_cache_flush_runtime'             => function_exists( 'wp_cache_flush_runtime' ),
\t\t'wp_cache_flush_group'               => function_exists( 'wp_cache_flush_group' ),
\t\t'wp_cache_supports'                  => function_exists( 'wp_cache_supports' ),
\t\t'wp_cache_close'                     => function_exists( 'wp_cache_close' ),
\t\t'wp_cache_add_global_groups'         => function_exists( 'wp_cache_add_global_groups' ),
\t\t'wp_cache_add_non_persistent_groups' => function_exists( 'wp_cache_add_non_persistent_groups' ),
\t\t'wp_cache_switch_to_blog'            => function_exists( 'wp_cache_switch_to_blog' ),
\t\t'wp_cache_reset'                     => function_exists( 'wp_cache_reset' ),
\t\t'WP_Object_Cache'                    => class_exists( 'WP_Object_Cache' ),
\t),
\t'wpObjectCacheShape'    => array(
\t\t'publicProperties'       => array( 'cache_hits', 'cache_misses' ),
\t\t'magicExposedProperties' => array( 'cache', 'global_groups', 'blog_prefix', 'multisite' ),
\t\t'methods'                => array_values( array_filter( get_class_methods( 'WP_Object_Cache' ), fn( $method ) => 0 !== strpos( $method, '__' ) ) ),
\t),
\t'cases'                 => wphx_304_04_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function writeCompatProbe() {
  mkdirSync(dirname(COMPAT_PROBE), { recursive: true });
  writeFileSync(
    COMPAT_PROBE,
    `<?php

$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );

error_reporting( E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED );
ini_set( 'display_errors', '0' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );
define( 'MULTISITE', true );

$GLOBALS['blog_id'] = 7;
$GLOBALS['wphx_304_04_doing_it_wrong'] = array();
$GLOBALS['wphx_304_04_switch_fallbacks'] = array();

function __( $text, $domain = 'default' ) {
\treturn $text;
}

function _doing_it_wrong( $function_name, $message, $version ) {
\t$GLOBALS['wphx_304_04_doing_it_wrong'][] = array(
\t\t'function' => $function_name,
\t\t'message'  => $message,
\t\t'version'  => $version,
\t);
}

function wp_cache_switch_to_blog_fallback() {
\t$GLOBALS['wphx_304_04_switch_fallbacks'][] = array( 'blogId' => $GLOBALS['blog_id'] ?? null );
}

require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/plugin.php';

wp_start_object_cache();

function wphx_304_04_compat_scalar( $value ) {
\tif ( is_int( $value ) ) {
\t\treturn array( 'type' => 'int', 'value' => $value );
\t}
\tif ( is_float( $value ) ) {
\t\treturn array( 'type' => 'float', 'value' => $value );
\t}
\tif ( is_bool( $value ) ) {
\t\treturn array( 'type' => 'bool', 'value' => $value );
\t}
\tif ( null === $value ) {
\t\treturn array( 'type' => 'null', 'value' => null );
\t}
\treturn array(
\t\t'type'   => 'string',
\t\t'value'  => (string) $value,
\t\t'hex'    => bin2hex( (string) $value ),
\t\t'bytes'  => strlen( (string) $value ),
\t\t'sha256' => hash( 'sha256', (string) $value ),
\t);
}

function wphx_304_04_compat_value( $value ) {
\tif ( is_array( $value ) ) {
\t\t$entries = array();
\t\tforeach ( $value as $key => $entry_value ) {
\t\t\t$entries[] = array(
\t\t\t\t'key'   => wphx_304_04_compat_scalar( $key ),
\t\t\t\t'value' => wphx_304_04_compat_value( $entry_value ),
\t\t\t);
\t\t}
\t\treturn array(
\t\t\t'type'    => 'array',
\t\t\t'count'   => count( $value ),
\t\t\t'entries' => $entries,
\t\t);
\t}
\tif ( is_object( $value ) ) {
\t\treturn array(
\t\t\t'type'       => 'object',
\t\t\t'class'      => get_class( $value ),
\t\t\t'properties' => wphx_304_04_compat_value( get_object_vars( $value ) ),
\t\t);
\t}
\treturn wphx_304_04_compat_scalar( $value );
}

function wphx_304_04_compat_case( $id, $symbol, $value, $meta = array() ) {
\treturn array(
\t\t'id'     => $id,
\t\t'symbol' => $symbol,
\t\t'value'  => wphx_304_04_compat_value( $value ),
\t\t'meta'   => $meta,
\t);
}

function wphx_304_04_compat_sort( $value ) {
\tif ( ! is_array( $value ) ) {
\t\treturn $value;
\t}
\tforeach ( $value as $key => $entry ) {
\t\t$value[ $key ] = wphx_304_04_compat_sort( $entry );
\t}
\tksort( $value );
\treturn $value;
}

function wphx_304_04_compat_snapshot() {
\tglobal $wp_object_cache;
\tif ( ! $wp_object_cache instanceof WPHX_304_04_Dropin_Object_Cache ) {
\t\treturn array(
\t\t\t'class' => is_object( $wp_object_cache ) ? get_class( $wp_object_cache ) : gettype( $wp_object_cache ),
\t\t);
\t}
\t$global_groups = $wp_object_cache->global_groups;
\t$non_persistent_groups = $wp_object_cache->non_persistent_groups;
\tksort( $global_groups );
\tksort( $non_persistent_groups );
\treturn array(
\t\t'class'               => get_class( $wp_object_cache ),
\t\t'store'               => wphx_304_04_compat_sort( $wp_object_cache->store ),
\t\t'events'              => $wp_object_cache->events,
\t\t'globalGroups'        => $global_groups,
\t\t'nonPersistentGroups' => $non_persistent_groups,
\t\t'blogId'              => $wp_object_cache->blog_id,
\t\t'usingExtObjectCache' => wp_using_ext_object_cache(),
\t);
}

function wphx_304_04_compat_reset_state() {
\tglobal $wp_object_cache;
\tif ( ! $wp_object_cache instanceof WPHX_304_04_Dropin_Object_Cache ) {
\t\twp_cache_init();
\t}
\twp_cache_flush();
\t$GLOBALS['wphx_304_04_doing_it_wrong'] = array();
\t$GLOBALS['wphx_304_04_switch_fallbacks'] = array();
}

function wphx_304_04_compat_run_cases() {
\tglobal $wp_object_cache;
\t$cases = array();

\t$cases[] = wphx_304_04_compat_case(
\t\t'dropin:bootstrap-compat-surface',
\t\t'wp_start_object_cache/wp_using_ext_object_cache/cache-compat.php',
\t\tarray(
\t\t\t'usingExtObjectCache' => wp_using_ext_object_cache(),
\t\t\t'functionExists'      => array(
\t\t\t\t'wp_cache_add_multiple'         => function_exists( 'wp_cache_add_multiple' ),
\t\t\t\t'wp_cache_set_multiple'         => function_exists( 'wp_cache_set_multiple' ),
\t\t\t\t'wp_cache_get_multiple'         => function_exists( 'wp_cache_get_multiple' ),
\t\t\t\t'wp_cache_delete_multiple'      => function_exists( 'wp_cache_delete_multiple' ),
\t\t\t\t'wp_cache_flush_runtime'        => function_exists( 'wp_cache_flush_runtime' ),
\t\t\t\t'wp_cache_flush_group'          => function_exists( 'wp_cache_flush_group' ),
\t\t\t\t'wp_cache_supports'             => function_exists( 'wp_cache_supports' ),
\t\t\t\t'wp_cache_get_salted'           => function_exists( 'wp_cache_get_salted' ),
\t\t\t\t'wp_cache_set_salted'           => function_exists( 'wp_cache_set_salted' ),
\t\t\t\t'wp_cache_get_multiple_salted'  => function_exists( 'wp_cache_get_multiple_salted' ),
\t\t\t\t'wp_cache_set_multiple_salted'  => function_exists( 'wp_cache_set_multiple_salted' ),
\t\t\t\t'wp_cache_switch_to_blog'       => function_exists( 'wp_cache_switch_to_blog' ),
\t\t\t),
\t\t),
\t\twphx_304_04_compat_snapshot()
\t);

\twphx_304_04_compat_reset_state();
\t$add = wp_cache_add_multiple( array( 'a' => 'A', 'b' => false ), 'compat' );
\t$add_duplicate = wp_cache_add_multiple( array( 'a' => 'again', 'c' => 'C' ), 'compat' );
\t$set = wp_cache_set_multiple( array( 'b' => 'B', 'd' => 'D' ), 'compat', 12 );
\t$get = wp_cache_get_multiple( array( 'a', 'b', 'c', 'd', 'missing' ), 'compat' );
\t$delete = wp_cache_delete_multiple( array( 'a', 'missing', 'd' ), 'compat' );
\t$after_delete = wp_cache_get_multiple( array( 'a', 'b', 'c', 'd' ), 'compat' );
\t$cases[] = wphx_304_04_compat_case(
\t\t'dropin:multiple-fallbacks',
\t\t'wp_cache_add_multiple/wp_cache_set_multiple/wp_cache_get_multiple/wp_cache_delete_multiple',
\t\tarray(
\t\t\t'add'         => $add,
\t\t\t'duplicate'   => $add_duplicate,
\t\t\t'set'         => $set,
\t\t\t'get'         => $get,
\t\t\t'delete'      => $delete,
\t\t\t'afterDelete' => $after_delete,
\t\t),
\t\twphx_304_04_compat_snapshot()
\t);

\twphx_304_04_compat_reset_state();
\twp_cache_set( 'keep', 'still-here', 'compat-flush' );
\t$supports = array();
\tforeach ( array( 'add_multiple', 'set_multiple', 'get_multiple', 'delete_multiple', 'flush_runtime', 'flush_group', 'unknown' ) as $feature ) {
\t\t$supports[ $feature ] = wp_cache_supports( $feature );
\t}
\t$flush_runtime = wp_cache_flush_runtime();
\t$after_runtime = wp_cache_get( 'keep', 'compat-flush' );
\t$flush_group = wp_cache_flush_group( 'compat-flush' );
\t$after_group = wp_cache_get( 'keep', 'compat-flush' );
\t$cases[] = wphx_304_04_compat_case(
\t\t'dropin:supports-and-flush-fallbacks',
\t\t'wp_cache_supports/wp_cache_flush_runtime/wp_cache_flush_group',
\t\tarray(
\t\t\t'supports'     => $supports,
\t\t\t'flushRuntime' => $flush_runtime,
\t\t\t'afterRuntime' => $after_runtime,
\t\t\t'flushGroup'   => $flush_group,
\t\t\t'afterGroup'   => $after_group,
\t\t\t'doingItWrong' => $GLOBALS['wphx_304_04_doing_it_wrong'],
\t\t),
\t\twphx_304_04_compat_snapshot()
\t);

\twphx_304_04_compat_reset_state();
\t$set_salted = wp_cache_set_salted( 'single', array( 'payload' => true ), 'salted', 'salt-one', 30 );
\t$single_fresh = wp_cache_get_salted( 'single', 'salted', 'salt-one' );
\t$single_stale = wp_cache_get_salted( 'single', 'salted', 'salt-two' );
\twp_cache_set( 'malformed', array( 'data' => 'missing-salt' ), 'salted' );
\t$malformed = wp_cache_get_salted( 'malformed', 'salted', 'salt-one' );
\t$set_multiple_salted = wp_cache_set_multiple_salted( array( 'one' => 'first', 'two' => 'second' ), 'salted', array( 'salt', 'array' ), 45 );
\t$multiple_fresh = wp_cache_get_multiple_salted( array( 'one', 'two', 'missing' ), 'salted', array( 'salt', 'array' ) );
\t$multiple_stale = wp_cache_get_multiple_salted( array( 'one', 'two' ), 'salted', 'salt:other' );
\t$cases[] = wphx_304_04_compat_case(
\t\t'dropin:salted-helpers',
\t\t'wp_cache_get_salted/wp_cache_set_salted/wp_cache_get_multiple_salted/wp_cache_set_multiple_salted',
\t\tarray(
\t\t\t'setSingle'   => $set_salted,
\t\t\t'freshSingle' => $single_fresh,
\t\t\t'staleSingle' => $single_stale,
\t\t\t'malformed'   => $malformed,
\t\t\t'setMultiple' => $set_multiple_salted,
\t\t\t'freshMany'   => $multiple_fresh,
\t\t\t'staleMany'   => $multiple_stale,
\t\t),
\t\twphx_304_04_compat_snapshot()
\t);

\twphx_304_04_compat_reset_state();
\twp_cache_switch_to_blog( 11 );
\t$method_snapshot = wphx_304_04_compat_snapshot();
\t$wp_object_cache = new stdClass();
\t$GLOBALS['blog_id'] = 12;
\twp_cache_switch_to_blog( 12 );
\t$cases[] = wphx_304_04_compat_case(
\t\t'dropin:switch-to-blog-compat',
\t\t'wp_cache_switch_to_blog',
\t\tarray(
\t\t\t'methodSnapshot' => $method_snapshot,
\t\t\t'fallbacks'      => $GLOBALS['wphx_304_04_switch_fallbacks'],
\t\t),
\t\twphx_304_04_compat_snapshot()
\t);

\treturn $cases;
}

$snapshot = array(
\t'mode'                  => $mode,
\t'phpVersion'            => PHP_VERSION,
\t'coveredFunctionExists' => array(
\t\t'wp_start_object_cache'            => function_exists( 'wp_start_object_cache' ),
\t\t'wp_using_ext_object_cache'        => function_exists( 'wp_using_ext_object_cache' ),
\t\t'wp_cache_init'                    => function_exists( 'wp_cache_init' ),
\t\t'wp_cache_add'                     => function_exists( 'wp_cache_add' ),
\t\t'wp_cache_add_multiple'            => function_exists( 'wp_cache_add_multiple' ),
\t\t'wp_cache_set'                     => function_exists( 'wp_cache_set' ),
\t\t'wp_cache_set_multiple'            => function_exists( 'wp_cache_set_multiple' ),
\t\t'wp_cache_get'                     => function_exists( 'wp_cache_get' ),
\t\t'wp_cache_get_multiple'            => function_exists( 'wp_cache_get_multiple' ),
\t\t'wp_cache_delete'                  => function_exists( 'wp_cache_delete' ),
\t\t'wp_cache_delete_multiple'         => function_exists( 'wp_cache_delete_multiple' ),
\t\t'wp_cache_flush'                   => function_exists( 'wp_cache_flush' ),
\t\t'wp_cache_flush_runtime'           => function_exists( 'wp_cache_flush_runtime' ),
\t\t'wp_cache_flush_group'             => function_exists( 'wp_cache_flush_group' ),
\t\t'wp_cache_supports'                => function_exists( 'wp_cache_supports' ),
\t\t'wp_cache_get_salted'              => function_exists( 'wp_cache_get_salted' ),
\t\t'wp_cache_set_salted'              => function_exists( 'wp_cache_set_salted' ),
\t\t'wp_cache_get_multiple_salted'     => function_exists( 'wp_cache_get_multiple_salted' ),
\t\t'wp_cache_set_multiple_salted'     => function_exists( 'wp_cache_set_multiple_salted' ),
\t\t'wp_cache_switch_to_blog'          => function_exists( 'wp_cache_switch_to_blog' ),
\t\t'WPHX_304_04_Dropin_Object_Cache' => class_exists( 'WPHX_304_04_Dropin_Object_Cache' ),
\t),
\t'dropinShape'           => array(
\t\t'class'                     => 'WPHX_304_04_Dropin_Object_Cache',
\t\t'legacyProvidedFunctions'   => array( 'wp_cache_init', 'wp_cache_add', 'wp_cache_set', 'wp_cache_get', 'wp_cache_delete', 'wp_cache_flush', 'wp_cache_add_global_groups', 'wp_cache_add_non_persistent_groups' ),
\t\t'compatInstalledFunctions'  => array( 'wp_cache_add_multiple', 'wp_cache_set_multiple', 'wp_cache_get_multiple', 'wp_cache_delete_multiple', 'wp_cache_flush_runtime', 'wp_cache_flush_group', 'wp_cache_supports', 'wp_cache_get_salted', 'wp_cache_set_salted', 'wp_cache_get_multiple_salted', 'wp_cache_set_multiple_salted', 'wp_cache_switch_to_blog' ),
\t),
\t'cases'                 => wphx_304_04_compat_run_cases(),
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    runtime: {
      coveredFunctionExists: result.runtime.coveredFunctionExists,
      wpObjectCacheShape: result.runtime.wpObjectCacheShape,
      cases: result.runtime.cases
    },
    dropinCompat: {
      coveredFunctionExists: result.dropinCompat.coveredFunctionExists,
      dropinShape: result.dropinCompat.dropinShape,
      cases: result.dropinCompat.cases
    }
  };
}

function runProbe(commandPath, runtimeId, mode, root) {
  const runtimeOutput = command(commandPath, [RUNTIME_PROBE, mode, root]);
  const compatOutput = command(commandPath, [COMPAT_PROBE, mode, root]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    commands: [
      `${commandPath} ${RUNTIME_PROBE} ${mode} ${root}`,
      `${commandPath} ${COMPAT_PROBE} ${mode} ${root}`
    ],
    result: {
      runtime: JSON.parse(runtimeOutput),
      dropinCompat: JSON.parse(compatOutput)
    }
  };
}

function runDockerProbe(runtimeId, image, mode, root) {
  const dockerRoot = `/work/${root}`;
  const runtimeOutput = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", RUNTIME_PROBE, mode, dockerRoot]);
  const compatOutput = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", COMPAT_PROBE, mode, dockerRoot]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    commands: [
      `docker run --rm -v $PWD:/work -w /work ${image} php ${RUNTIME_PROBE} ${mode} ${dockerRoot}`,
      `docker run --rm -v $PWD:/work -w /work ${image} php ${COMPAT_PROBE} ${mode} ${dockerRoot}`
    ],
    image,
    result: {
      runtime: JSON.parse(runtimeOutput),
      dropinCompat: JSON.parse(compatOutput)
    }
  };
}

function compare(oracleResult, candidateResult) {
  const oracle = normalize(oracleResult);
  const candidate = normalize(candidateResult);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(candidate),
    oracle,
    candidate
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-304-object-cache`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/object-cache-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "workset",
      name: "object cache runtime/drop-in differential fixture harness",
      area: "wp-includes",
      public_contract:
        "WordPress 7.0 default WP_Object_Cache runtime APIs, found-reference behavior, group/blog-prefix semantics, reset behavior, and cache-compat drop-in shims stay observable while the candidate side is still an oracle source mirror."
    },
    ownership_state: "external_oracle",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: ["tools/wp-core/run-object-cache-fixture.mjs", OUT, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-304-object-cache",
        "npm run wp:core:wphx-304-object-cache:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-304-04-object-cache-fixture"],
      manifest_digest: manifestSha
    },
    notes:
      "The candidate fixture root is an oracle source mirror for WPHX-304.04. The drop-in probe intentionally supplies a tiny legacy object-cache.php implementation so WordPress's cache-compat.php installs the missing APIs under real bootstrap order."
  };
}

const lock = readJson("toolchain.lock.json");
const surface = readJson(SURFACE);
rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeObjectCacheDropin(ORACLE_ROOT);
writeObjectCacheDropin(CANDIDATE_ROOT);
writeRuntimeProbe();
writeCompatProbe();

const runs = [];
const comparisons = [];
const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_ROOT);
const localCandidate = runProbe("php", "local-php-cli", "candidate", CANDIDATE_ROOT);
runs.push(localOracle, localCandidate);
comparisons.push({
  id: "local-php-cli",
  ...compare(localOracle.result, localCandidate.result)
});

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const dockerImages = [
  ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
  ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
];
const skippedRuntimes = [];

if (dockerVersion) {
  for (const [runtimeId, image] of dockerImages) {
    const oracle = runDockerProbe(runtimeId, image, "oracle", ORACLE_ROOT);
    const candidate = runDockerProbe(runtimeId, image, "candidate", CANDIDATE_ROOT);
    runs.push(oracle, candidate);
    comparisons.push({
      id: runtimeId,
      ...compare(oracle.result, candidate.result)
    });
  }
} else {
  for (const [runtimeId, image] of dockerImages) {
    skippedRuntimes.push({
      id: runtimeId,
      image,
      reason: "docker server unavailable"
    });
  }
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
if (failedComparisons.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const objectCacheDomains = surface.domains.filter((domain) => domain.id === "object_cache_runtime" || domain.id === "object_cache_dropin_compat");
const manifest = {
  schema: "wphx.wp-core-object-cache-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-object-cache-fixture.mjs",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  fixture: {
    candidate_kind: "oracle_source_mirror",
    source_domains: objectCacheDomains.map((domain) => ({
      id: domain.id,
      label: domain.label,
      symbol_count: domain.symbol_count,
      test_count: domain.test_count
    })),
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    native_boundaries: [
      {
        id: "default-runtime-in-memory-cache",
        reason:
          "The runtime probe exercises WordPress's default request-local WP_Object_Cache implementation. Real persistent backends remain behind the object-cache.php drop-in boundary."
      },
      {
        id: "multisite-blog-prefix",
        reason:
          "The probe defines MULTISITE and a deterministic blog ID so local group prefixes, global groups, and switch_to_blog behavior are observable without a full multisite bootstrap."
      },
      {
        id: "legacy-dropin-test-double",
        reason:
          "The drop-in probe supplies a deliberately small object-cache.php that implements legacy single-key APIs while omitting newer batch, feature, salted, flush, and switch functions so cache-compat.php installs its shims."
      },
      {
        id: "doing-it-wrong-and-deprecated-hooks",
        reason:
          "Unsupported flush compat paths and reset deprecations are captured through deterministic PHP hook/test-double loggers rather than emitting runtime notices."
      },
      {
        id: "php-native-reference-output",
        reason:
          "wp_cache_get() found-reference behavior is retained as native PHP reference output; a Haxe port must model this at the WordPress-facing PHP ABI boundary."
      },
      {
        id: "php-object-clone-semantics",
        reason:
          "WP_Object_Cache clones object values on write and read. This fixture records the PHP-visible behavior; deeper Haxe object identity lowering remains a PHP target/runtime concern."
      }
    ],
    follow_up_owner: "WPHX-304.07"
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version: localOracle.result.runtime.phpVersion,
      executable: lock.tools.php_cli.executable
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs,
  comparisons,
  remaining_gaps: [
    {
      id: "haxe-candidate-not-yet-installed",
      owner: "WPHX-304.07",
      detail: "The candidate side is a copied WordPress oracle source tree until selected pure option/cache helpers move to Haxe parity candidates."
    },
    {
      id: "full-persistent-cache-backend-matrix-deferred",
      owner: "WPHX-304/WPHX-317",
      detail: "The drop-in probe uses a deterministic legacy object-cache.php test double. Redis/Memcached-like backends, eviction, TTL persistence, and networked cache failures remain later compatibility matrices."
    },
    {
      id: "invalid-key-l10n-path-deferred",
      owner: "WPHX-303/WPHX-304",
      detail: "Invalid cache-key _doing_it_wrong branches trigger early translation loading and are deferred to avoid mixing l10n bootstrap coverage into this storage/cache fixture."
    },
    {
      id: "full-upstream-phpunit-not-yet-ported",
      owner: "WPHX-304",
      detail: "This fixture covers seed traces. Full upstream cache PHPUnit parity remains a domain-level closure requirement."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    candidate_kind: "oracle_source_mirror",
    covered_symbols: COVERED_SYMBOLS.length,
    fixture_cases: FIXTURE_CASES.length,
    runtime_cases: FIXTURE_CASES.filter((entry) => entry.id.startsWith("runtime:")).length,
    dropin_cases: FIXTURE_CASES.filter((entry) => entry.id.startsWith("dropin:")).length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-304-04-object-cache-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "object cache runtime/drop-in differential fixture manifest"
    },
    {
      path: OWNERSHIP,
      role: "external-oracle ownership manifest for the fixture harness"
    },
    {
      path: "tools/wp-core/run-object-cache-fixture.mjs",
      role: "fixture generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-304-object-cache",
    "npm run wp:core:wphx-304-object-cache:check",
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
      covered_symbols: COVERED_SYMBOLS.length,
      fixture_cases: FIXTURE_CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
