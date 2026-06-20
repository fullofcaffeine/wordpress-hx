#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/php-facade/f7-hook-kernel.hxml";
const OUT_ROOT = "build/php-hook-kernel";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const GENERATED_PLUGIN = `${GENERATED_ROOT}/wp-includes/plugin.php`;
const GENERATED_HOOK_CLASS = `${GENERATED_ROOT}/wp-includes/class-wp-hook.php`;
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const ORACLE_PLUGIN = `${ORACLE_ROOT}/wp-includes/plugin.php`;
const ORACLE_HOOK_CLASS = `${ORACLE_ROOT}/wp-includes/class-wp-hook.php`;
const UPSTREAM_PLUGIN = "../wordpress-develop/src/wp-includes/plugin.php";
const UPSTREAM_HOOK_CLASS = "../wordpress-develop/src/wp-includes/class-wp-hook.php";
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/php-facade/wphx-108-f7-hook-kernel.v1.json";
const RECORDED_AT = "2026-06-20T07:30:00Z";

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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return [path];
  });
}

function filesUnder(dir) {
  return walk(dir)
    .map((path) => ({
      path: relative(dir, path),
      bytes: statSync(path).size,
      sha256: sha256(path)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function copyOracleTree() {
  mkdirSync(dirname(ORACLE_PLUGIN), { recursive: true });
  copyFileSync(UPSTREAM_PLUGIN, ORACLE_PLUGIN);
  copyFileSync(UPSTREAM_HOOK_CLASS, ORACLE_HOOK_CLASS);
}

function writeGeneratedClass() {
  writeFile(
    GENERATED_HOOK_CLASS,
    `<?php

if ( ! defined( 'WPHX_F7_HOOK_BOOTSTRAPPED' ) ) {
\tdefine( 'WPHX_F7_HOOK_BOOTSTRAPPED', true );
\t$wphx_f7_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f7_lib );
\tspl_autoload_register(
\t\tfunction ( $class ) {
\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\tif ( $file ) {
\t\t\t\tinclude_once $file;
\t\t\t}
\t\t}
\t);
\t\\php\\Boot::__hx__init();
}

#[AllowDynamicProperties]
final class WP_Hook implements Iterator, ArrayAccess {
\tpublic $callbacks = array();
\tprotected $priorities = array();
\tprivate $iterations = array();
\tprivate $current_priority = array();
\tprivate $nesting_level = 0;
\tprivate $doing_action = false;

\tpublic function add_filter( $hook_name, $callback, $priority, $accepted_args ) {
\t\t$priority = \\wphx\\fixtures\\php\\facade\\HookKernel::normalizeKernelPriority( $priority );

\t\t$idx = _wp_filter_build_unique_id( $hook_name, $callback, $priority );
\t\t$priority_existed = isset( $this->callbacks[ $priority ] );
\t\t$this->callbacks[ $priority ][ $idx ] = array(
\t\t\t'function' => $callback,
\t\t\t'accepted_args' => (int) $accepted_args,
\t\t);

\t\tif ( ! $priority_existed && count( $this->callbacks ) > 1 ) {
\t\t\tksort( $this->callbacks, SORT_NUMERIC );
\t\t}

\t\t$this->priorities = array_keys( $this->callbacks );

\t\tif ( $this->nesting_level > 0 ) {
\t\t\t$this->resort_active_iterations( $priority, $priority_existed );
\t\t}
\t}

\tprivate function resort_active_iterations( $new_priority = false, $priority_existed = false ) {
\t\t$new_priorities = $this->priorities;

\t\tif ( ! $new_priorities ) {
\t\t\tforeach ( $this->iterations as $index => $iteration ) {
\t\t\t\t$this->iterations[ $index ] = $new_priorities;
\t\t\t}

\t\t\treturn;
\t\t}

\t\t$min = min( $new_priorities );

\t\tforeach ( $this->iterations as $index => &$iteration ) {
\t\t\t$current = current( $iteration );

\t\t\tif ( false === $current ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\t$iteration = $new_priorities;

\t\t\tif ( $current < $min ) {
\t\t\t\tarray_unshift( $iteration, $current );
\t\t\t\tcontinue;
\t\t\t}

\t\t\twhile ( current( $iteration ) < $current ) {
\t\t\t\tif ( false === next( $iteration ) ) {
\t\t\t\t\tbreak;
\t\t\t\t}
\t\t\t}

\t\t\tif ( $new_priority === $this->current_priority[ $index ] && ! $priority_existed ) {
\t\t\t\tif ( false === current( $iteration ) ) {
\t\t\t\t\t$prev = end( $iteration );
\t\t\t\t} else {
\t\t\t\t\t$prev = prev( $iteration );
\t\t\t\t}

\t\t\t\tif ( false === $prev ) {
\t\t\t\t\treset( $iteration );
\t\t\t\t} elseif ( $new_priority !== $prev ) {
\t\t\t\t\tnext( $iteration );
\t\t\t\t}
\t\t\t}
\t\t}

\t\tunset( $iteration );
\t}

\tpublic function remove_filter( $hook_name, $callback, $priority ) {
\t\t$priority = \\wphx\\fixtures\\php\\facade\\HookKernel::normalizeKernelPriority( $priority );

\t\t$function_key = _wp_filter_build_unique_id( $hook_name, $callback, $priority );
\t\t$exists = isset( $function_key, $this->callbacks[ $priority ][ $function_key ] );

\t\tif ( $exists ) {
\t\t\tunset( $this->callbacks[ $priority ][ $function_key ] );
\t\t\tif ( ! $this->callbacks[ $priority ] ) {
\t\t\t\tunset( $this->callbacks[ $priority ] );
\t\t\t\t$this->priorities = array_keys( $this->callbacks );
\t\t\t\tif ( $this->nesting_level > 0 ) {
\t\t\t\t\t$this->resort_active_iterations();
\t\t\t\t}
\t\t\t}
\t\t}

\t\treturn $exists;
\t}

\tpublic function has_filter( $hook_name = '', $callback = false, $priority = false ) {
\t\tif ( false === $callback ) {
\t\t\treturn $this->has_filters();
\t\t}

\t\t$function_key = _wp_filter_build_unique_id( $hook_name, $callback, false );
\t\tif ( ! $function_key ) {
\t\t\treturn false;
\t\t}

\t\tif ( is_int( $priority ) ) {
\t\t\treturn isset( $this->callbacks[ $priority ][ $function_key ] );
\t\t}

\t\tforeach ( $this->callbacks as $callback_priority => $callbacks ) {
\t\t\tif ( isset( $callbacks[ $function_key ] ) ) {
\t\t\t\treturn $callback_priority;
\t\t\t}
\t\t}

\t\treturn false;
\t}

\tpublic function has_filters() {
\t\tforeach ( $this->callbacks as $callbacks ) {
\t\t\tif ( $callbacks ) {
\t\t\t\treturn true;
\t\t\t}
\t\t}

\t\treturn false;
\t}

\tpublic function remove_all_filters( $priority = false ) {
\t\tif ( false === $priority ) {
\t\t\t$this->callbacks = array();
\t\t\t$this->priorities = array();
\t\t\tif ( $this->nesting_level > 0 ) {
\t\t\t\t$this->resort_active_iterations();
\t\t\t}
\t\t} elseif ( isset( $this->callbacks[ $priority ] ) ) {
\t\t\tunset( $this->callbacks[ $priority ] );
\t\t\t$this->priorities = array_keys( $this->callbacks );
\t\t\tif ( $this->nesting_level > 0 ) {
\t\t\t\t$this->resort_active_iterations();
\t\t\t}
\t\t}
\t}

\tpublic function apply_filters( $value, $args ) {
\t\tif ( ! $this->callbacks ) {
\t\t\treturn $value;
\t\t}

\t\t$nesting_level = $this->nesting_level++;
\t\t$this->iterations[ $nesting_level ] = $this->priorities;
\t\t$num_args = count( $args );

\t\tdo {
\t\t\t$this->current_priority[ $nesting_level ] = current( $this->iterations[ $nesting_level ] );
\t\t\t$priority = $this->current_priority[ $nesting_level ];

\t\t\tforeach ( $this->callbacks[ $priority ] as $the_ ) {
\t\t\t\tif ( \\wphx\\fixtures\\php\\facade\\HookKernel::shouldWriteFilteredValue( $this->doing_action ) ) {
\t\t\t\t\t$args[0] = $value;
\t\t\t\t}

\t\t\t\t$accepted_args = \\wphx\\fixtures\\php\\facade\\HookKernel::dispatchArgCount( $num_args, $the_['accepted_args'] );
\t\t\t\tif ( 0 === $accepted_args ) {
\t\t\t\t\t$value = call_user_func( $the_['function'] );
\t\t\t\t} elseif ( $accepted_args === $num_args ) {
\t\t\t\t\t$value = call_user_func_array( $the_['function'], $args );
\t\t\t\t} else {
\t\t\t\t\t$value = call_user_func_array( $the_['function'], array_slice( $args, 0, $accepted_args ) );
\t\t\t\t}
\t\t\t}
\t\t} while ( false !== next( $this->iterations[ $nesting_level ] ) );

\t\tunset( $this->iterations[ $nesting_level ] );
\t\tunset( $this->current_priority[ $nesting_level ] );
\t\t--$this->nesting_level;

\t\treturn $value;
\t}

\tpublic function do_action( $args ) {
\t\t$this->doing_action = true;
\t\t$this->apply_filters( '', $args );
\t\tif ( ! $this->nesting_level ) {
\t\t\t$this->doing_action = false;
\t\t}
\t}

\tpublic function do_all_hook( &$args ) {
\t\t$nesting_level = $this->nesting_level++;
\t\t$this->iterations[ $nesting_level ] = $this->priorities;

\t\tdo {
\t\t\t$priority = current( $this->iterations[ $nesting_level ] );
\t\t\tforeach ( $this->callbacks[ $priority ] as $the_ ) {
\t\t\t\tcall_user_func_array( $the_['function'], $args );
\t\t\t}
\t\t} while ( false !== next( $this->iterations[ $nesting_level ] ) );

\t\tunset( $this->iterations[ $nesting_level ] );
\t\t--$this->nesting_level;
\t}

\tpublic function current_priority() {
\t\tif ( false === current( $this->iterations ) ) {
\t\t\treturn false;
\t\t}

\t\treturn current( current( $this->iterations ) );
\t}

\tpublic static function build_preinitialized_hooks( $filters ) {
\t\t$normalized = array();
\t\tforeach ( $filters as $hook_name => $callback_groups ) {
\t\t\tif ( $callback_groups instanceof WP_Hook ) {
\t\t\t\t$normalized[ $hook_name ] = $callback_groups;
\t\t\t\tcontinue;
\t\t\t}

\t\t\t$hook = new WP_Hook();
\t\t\tforeach ( $callback_groups as $priority => $callbacks ) {
\t\t\t\tforeach ( $callbacks as $cb ) {
\t\t\t\t\t$hook->add_filter( $hook_name, $cb['function'], $priority, $cb['accepted_args'] );
\t\t\t\t}
\t\t\t}
\t\t\t$normalized[ $hook_name ] = $hook;
\t\t}

\t\treturn $normalized;
\t}

\t#[ReturnTypeWillChange]
\tpublic function offsetExists( $offset ) { return isset( $this->callbacks[ $offset ] ); }
\t#[ReturnTypeWillChange]
\tpublic function offsetGet( $offset ) { return $this->callbacks[ $offset ] ?? null; }
\t#[ReturnTypeWillChange]
\tpublic function offsetSet( $offset, $value ) { $this->callbacks[ $offset ] = $value; $this->priorities = array_keys( $this->callbacks ); }
\t#[ReturnTypeWillChange]
\tpublic function offsetUnset( $offset ) { unset( $this->callbacks[ $offset ] ); $this->priorities = array_keys( $this->callbacks ); }
\t#[ReturnTypeWillChange]
\tpublic function current() { return current( $this->callbacks ); }
\t#[ReturnTypeWillChange]
\tpublic function next() { return next( $this->callbacks ); }
\t#[ReturnTypeWillChange]
\tpublic function key() { return key( $this->callbacks ); }
\t#[ReturnTypeWillChange]
\tpublic function valid() { return key( $this->callbacks ) !== null; }
\t#[ReturnTypeWillChange]
\tpublic function rewind() { reset( $this->callbacks ); }
}
`
  );
}

function writeGeneratedPlugin() {
  writeFile(
    GENERATED_PLUGIN,
    `<?php

require __DIR__ . '/class-wp-hook.php';

if ( ! defined( 'WPHX_F7_HOOK_BOOTSTRAPPED' ) ) {
\tdefine( 'WPHX_F7_HOOK_BOOTSTRAPPED', true );
\t$wphx_f7_lib = dirname( __DIR__, 2 ) . '/haxe/lib';
\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_f7_lib );
\tspl_autoload_register(
\t\tfunction ( $class ) {
\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\tif ( $file ) {
\t\t\t\tinclude_once $file;
\t\t\t}
\t\t}
\t);
\t\\php\\Boot::__hx__init();
}

global $wp_filter, $wp_actions, $wp_filters, $wp_current_filter, $wp_plugin_paths;

if ( $wp_filter ) {
\t$wp_filter = WP_Hook::build_preinitialized_hooks( $wp_filter );
} else {
\t$wp_filter = array();
}

if ( ! isset( $wp_actions ) ) {
\t$wp_actions = array();
}
if ( ! isset( $wp_filters ) ) {
\t$wp_filters = array();
}
if ( ! isset( $wp_current_filter ) ) {
\t$wp_current_filter = array();
}
if ( ! isset( $wp_plugin_paths ) ) {
\t$wp_plugin_paths = array();
}

function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\tglobal $wp_filter;
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\t$wp_filter[ $hook_name ] = new WP_Hook();
\t}
\t$wp_filter[ $hook_name ]->add_filter( $hook_name, $callback, $priority, $accepted_args );
\treturn true;
}

function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\treturn add_filter( $hook_name, $callback, $priority, $accepted_args );
}

function apply_filters( $hook_name, $value, ...$args ) {
\tglobal $wp_filter, $wp_filters, $wp_current_filter;
\t$wp_filters[ $hook_name ] = \\wphx\\fixtures\\php\\facade\\HookKernel::incrementCount( $wp_filters[ $hook_name ] ?? 0 );
\tif ( isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t\t$all_args = func_get_args();
\t\t_wp_call_all_hook( $all_args );
\t}
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\tif ( isset( $wp_filter['all'] ) ) {
\t\t\tarray_pop( $wp_current_filter );
\t\t}
\t\treturn $value;
\t}
\tif ( ! isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t}
\tarray_unshift( $args, $value );
\t$filtered = $wp_filter[ $hook_name ]->apply_filters( $value, $args );
\tarray_pop( $wp_current_filter );
\treturn $filtered;
}

function apply_filters_ref_array( $hook_name, $args ) {
\tglobal $wp_filter, $wp_filters, $wp_current_filter;
\t$wp_filters[ $hook_name ] = \\wphx\\fixtures\\php\\facade\\HookKernel::incrementCount( $wp_filters[ $hook_name ] ?? 0 );
\tif ( isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t\t$all_args = func_get_args();
\t\t_wp_call_all_hook( $all_args );
\t}
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\tif ( isset( $wp_filter['all'] ) ) {
\t\t\tarray_pop( $wp_current_filter );
\t\t}
\t\treturn $args[0];
\t}
\tif ( ! isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t}
\t$filtered = $wp_filter[ $hook_name ]->apply_filters( $args[0], $args );
\tarray_pop( $wp_current_filter );
\treturn $filtered;
}

function do_action( $hook_name, ...$arg ) {
\tglobal $wp_filter, $wp_actions, $wp_current_filter;
\t$wp_actions[ $hook_name ] = \\wphx\\fixtures\\php\\facade\\HookKernel::incrementCount( $wp_actions[ $hook_name ] ?? 0 );
\tif ( isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t\t$all_args = func_get_args();
\t\t_wp_call_all_hook( $all_args );
\t}
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\tif ( isset( $wp_filter['all'] ) ) {
\t\t\tarray_pop( $wp_current_filter );
\t\t}
\t\treturn;
\t}
\tif ( ! isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t}
\tif ( \\wphx\\fixtures\\php\\facade\\HookKernel::shouldUseDefaultActionArg( count( $arg ) ) ) {
\t\t$arg[] = \\wphx\\fixtures\\php\\facade\\HookKernel::defaultActionArg();
\t} elseif ( is_array( $arg[0] ) && 1 === count( $arg[0] ) && isset( $arg[0][0] ) && is_object( $arg[0][0] ) ) {
\t\t$arg[0] = $arg[0][0];
\t}
\t$wp_filter[ $hook_name ]->do_action( $arg );
\tarray_pop( $wp_current_filter );
}

function do_action_ref_array( $hook_name, $args ) {
\tglobal $wp_filter, $wp_actions, $wp_current_filter;
\t$wp_actions[ $hook_name ] = \\wphx\\fixtures\\php\\facade\\HookKernel::incrementCount( $wp_actions[ $hook_name ] ?? 0 );
\tif ( isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t\t$all_args = func_get_args();
\t\t_wp_call_all_hook( $all_args );
\t}
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\tif ( isset( $wp_filter['all'] ) ) {
\t\t\tarray_pop( $wp_current_filter );
\t\t}
\t\treturn;
\t}
\tif ( ! isset( $wp_filter['all'] ) ) {
\t\t$wp_current_filter[] = $hook_name;
\t}
\t$wp_filter[ $hook_name ]->do_action( $args );
\tarray_pop( $wp_current_filter );
}

function has_filter( $hook_name, $callback = false, $priority = false ) {
\tglobal $wp_filter;
\tif ( ! isset( $wp_filter[ $hook_name ] ) ) {
\t\treturn false;
\t}
\treturn $wp_filter[ $hook_name ]->has_filter( $hook_name, $callback, $priority );
}

function has_action( $hook_name, $callback = false, $priority = false ) {
\treturn has_filter( $hook_name, $callback, $priority );
}

function remove_filter( $hook_name, $callback, $priority = 10 ) {
\tglobal $wp_filter;
\t$r = false;
\tif ( isset( $wp_filter[ $hook_name ] ) ) {
\t\t$r = $wp_filter[ $hook_name ]->remove_filter( $hook_name, $callback, $priority );
\t\tif ( ! $wp_filter[ $hook_name ]->callbacks ) {
\t\t\tunset( $wp_filter[ $hook_name ] );
\t\t}
\t}
\treturn $r;
}

function remove_all_filters( $hook_name, $priority = false ) {
\tglobal $wp_filter;
\tif ( isset( $wp_filter[ $hook_name ] ) ) {
\t\t$wp_filter[ $hook_name ]->remove_all_filters( $priority );
\t\tif ( ! $wp_filter[ $hook_name ]->has_filters() ) {
\t\t\tunset( $wp_filter[ $hook_name ] );
\t\t}
\t}
\treturn true;
}

function remove_action( $hook_name, $callback, $priority = 10 ) {
\treturn remove_filter( $hook_name, $callback, $priority );
}

function remove_all_actions( $hook_name, $priority = false ) {
\treturn remove_all_filters( $hook_name, $priority );
}

function current_filter() {
\tglobal $wp_current_filter;
\treturn end( $wp_current_filter );
}

function current_action() {
\treturn current_filter();
}

function doing_filter( $hook_name = null ) {
\tglobal $wp_current_filter;
\tif ( null === $hook_name ) {
\t\treturn ! empty( $wp_current_filter );
\t}
\treturn in_array( $hook_name, $wp_current_filter, true );
}

function doing_action( $hook_name = null ) {
\treturn doing_filter( $hook_name );
}

function did_filter( $hook_name ) {
\tglobal $wp_filters;
\treturn $wp_filters[ $hook_name ] ?? 0;
}

function did_action( $hook_name ) {
\tglobal $wp_actions;
\treturn $wp_actions[ $hook_name ] ?? 0;
}

function apply_filters_deprecated( $hook_name, $args, $version, $replacement = '', $message = '' ) {
\tif ( ! has_filter( $hook_name ) ) {
\t\treturn $args[0];
\t}
\t_deprecated_hook( $hook_name, $version, $replacement, $message );
\treturn apply_filters_ref_array( $hook_name, $args );
}

function do_action_deprecated( $hook_name, $args, $version, $replacement = '', $message = '' ) {
\tif ( ! has_action( $hook_name ) ) {
\t\treturn;
\t}
\t_deprecated_hook( $hook_name, $version, $replacement, $message );
\tdo_action_ref_array( $hook_name, $args );
}

function plugin_basename( $file ) {
\tglobal $wp_plugin_paths;
\t$file = wp_normalize_path( $file );
\tarsort( $wp_plugin_paths );
\tforeach ( $wp_plugin_paths as $dir => $realdir ) {
\t\tif ( str_starts_with( $file, $realdir ) ) {
\t\t\t$file = $dir . substr( $file, strlen( $realdir ) );
\t\t}
\t}
\t$plugin_dir = wp_normalize_path( WP_PLUGIN_DIR );
\t$mu_plugin_dir = wp_normalize_path( WPMU_PLUGIN_DIR );
\treturn \\wphx\\fixtures\\php\\facade\\HookKernel::pluginBasenameAfterMappings( $file, $plugin_dir, $mu_plugin_dir );
}

function wp_register_plugin_realpath( $file ) {
\tglobal $wp_plugin_paths;
\tstatic $wp_plugin_path = null, $wpmu_plugin_path = null;
\tif ( ! isset( $wp_plugin_path ) ) {
\t\t$wp_plugin_path = wp_normalize_path( WP_PLUGIN_DIR );
\t\t$wpmu_plugin_path = wp_normalize_path( WPMU_PLUGIN_DIR );
\t}
\t$plugin_path = wp_normalize_path( dirname( $file ) );
\t$realpath = realpath( $file );
\t$plugin_realpath = wp_normalize_path( dirname( false === $realpath ? $file : $realpath ) );
\tif ( ! \\wphx\\fixtures\\php\\facade\\HookKernel::shouldRegisterPluginRealpath( $plugin_path, $wp_plugin_path, $wpmu_plugin_path ) ) {
\t\treturn false;
\t}
\tif ( \\wphx\\fixtures\\php\\facade\\HookKernel::shouldStorePluginRealpathMapping( $plugin_path, $plugin_realpath ) ) {
\t\t$wp_plugin_paths[ $plugin_path ] = $plugin_realpath;
\t}
\treturn true;
}

function plugin_dir_path( $file ) {
\treturn trailingslashit( dirname( $file ) );
}

function plugin_dir_url( $file ) {
\treturn trailingslashit( plugins_url( '', $file ) );
}

function register_activation_hook( $file, $callback ) {
\t$file = plugin_basename( $file );
\tadd_action( \\wphx\\fixtures\\php\\facade\\HookKernel::lifecycleHookName( 'activate_', $file ), $callback );
}

function register_deactivation_hook( $file, $callback ) {
\t$file = plugin_basename( $file );
\tadd_action( \\wphx\\fixtures\\php\\facade\\HookKernel::lifecycleHookName( 'deactivate_', $file ), $callback );
}

function register_uninstall_hook( $file, $callback ) {
\tif ( is_array( $callback ) && is_object( $callback[0] ) ) {
\t\t_doing_it_wrong( __FUNCTION__, __( 'Only a static class method or function can be used in an uninstall hook.' ), '3.1.0' );
\t\treturn;
\t}
\t$uninstallable_plugins = (array) get_option( 'uninstall_plugins' );
\t$plugin_basename = plugin_basename( $file );
\tif ( ! isset( $uninstallable_plugins[ $plugin_basename ] ) || $uninstallable_plugins[ $plugin_basename ] !== $callback ) {
\t\t$uninstallable_plugins[ $plugin_basename ] = $callback;
\t\tupdate_option( 'uninstall_plugins', $uninstallable_plugins );
\t}
}

function _wp_call_all_hook( $args ) {
\tglobal $wp_filter;
\t$wp_filter['all']->do_all_hook( $args );
}

function _wp_filter_build_unique_id( $hook_name, $callback, $priority ) {
\tif ( is_string( $callback ) ) {
\t\treturn $callback;
\t}
\tif ( is_object( $callback ) ) {
\t\t$callback = array( $callback, '' );
\t} else {
\t\t$callback = (array) $callback;
\t}
\tif ( is_object( $callback[0] ) ) {
\t\treturn spl_object_hash( $callback[0] ) . $callback[1];
\t}
\tif ( is_string( $callback[0] ) ) {
\t\treturn $callback[0] . '::' . $callback[1];
\t}
\treturn null;
}
`
  );
}

function writeProbe() {
  writeFile(
    PROBE,
    `<?php

$mode = $argv[1];
$plugin = $argv[2];

$GLOBALS['wphx_f7_trace'] = array();

function wphx_f7_record( $event, $hook_name, $detail ) {
\t$GLOBALS['wphx_f7_trace'][] = array(
\t\t'event' => $event,
\t\t'hookName' => $hook_name,
\t\t'detail' => $detail,
\t\t'current' => function_exists( 'current_filter' ) ? current_filter() : false,
\t\t'doing' => function_exists( 'doing_filter' ) ? doing_filter( $hook_name ) : false,
\t);
}

function wphx_f7_all() {
\t$args = func_get_args();
\twphx_f7_record( 'all', $args[0], count( $args ) . ':' . json_encode( array_slice( $args, 1 ), JSON_UNESCAPED_SLASHES ) );
}

function wphx_f7_filter_low( $value, $suffix ) {
\twphx_f7_record( 'filter-low', 'title', $value . ':' . $suffix );
\treturn $value . '|low-' . $suffix;
}

function wphx_f7_filter_mid( $value ) {
\twphx_f7_record( 'filter-mid', 'title', $value );
\treturn $value . '|mid';
}

function wphx_f7_filter_high( $value, $suffix ) {
\twphx_f7_record( 'filter-high', 'title', $value . ':' . $suffix );
\treturn $value . '|high-' . $suffix;
}

function wphx_f7_action( $post, $id ) {
\twphx_f7_record( 'action', 'save_post', $post . ':' . $id );
}

function wphx_f7_ref( &$value ) {
\twphx_f7_record( 'ref-filter', 'ref_hook', $value );
\t$value .= '|ref-mutated';
\treturn $value;
}

$before = array(
\t'add_filter' => function_exists( 'add_filter' ),
\t'WP_Hook' => class_exists( 'WP_Hook', false ),
);

require $plugin;

$after = array(
\t'add_filter' => function_exists( 'add_filter' ),
\t'WP_Hook' => class_exists( 'WP_Hook', false ),
);

$reflections = array();
foreach (
\tarray(
\t\t'_wp_call_all_hook',
\t\t'_wp_filter_build_unique_id',
\t\t'add_action',
\t\t'add_filter',
\t\t'apply_filters',
\t\t'apply_filters_deprecated',
\t\t'apply_filters_ref_array',
\t\t'current_action',
\t\t'current_filter',
\t\t'did_action',
\t\t'did_filter',
\t\t'do_action',
\t\t'do_action_deprecated',
\t\t'do_action_ref_array',
\t\t'doing_action',
\t\t'doing_filter',
\t\t'has_action',
\t\t'has_filter',
\t\t'plugin_basename',
\t\t'plugin_dir_path',
\t\t'plugin_dir_url',
\t\t'register_activation_hook',
\t\t'register_deactivation_hook',
\t\t'register_uninstall_hook',
\t\t'remove_action',
\t\t'remove_all_actions',
\t\t'remove_all_filters',
\t\t'remove_filter',
\t\t'wp_register_plugin_realpath',
\t)
\tas $function_name
) {
\t$reflection = new ReflectionFunction( $function_name );
\t$params = array();
\tforeach ( $reflection->getParameters() as $parameter ) {
\t\t$params[] = array(
\t\t\t'name' => $parameter->getName(),
\t\t\t'position' => $parameter->getPosition(),
\t\t\t'isOptional' => $parameter->isOptional(),
\t\t\t'hasDefault' => $parameter->isDefaultValueAvailable(),
\t\t\t'default' => $parameter->isDefaultValueAvailable() ? $parameter->getDefaultValue() : null,
\t\t\t'hasType' => $parameter->hasType(),
\t\t\t'isPassedByReference' => $parameter->isPassedByReference(),
\t\t\t'isVariadic' => $parameter->isVariadic(),
\t\t);
\t}
\t$reflections[ $function_name ] = array(
\t\t'name' => $reflection->getName(),
\t\t'numberOfParameters' => $reflection->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $reflection->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $reflection->returnsReference(),
\t\t'hasReturnType' => $reflection->hasReturnType(),
\t\t'parameters' => $params,
\t);
}

$add_all = add_filter( 'all', 'wphx_f7_all', 1, 99 );
$add_low = add_filter( 'title', 'wphx_f7_filter_low', 5, 2 );
$add_mid = add_filter( 'title', 'wphx_f7_filter_mid', 10, 1 );
$add_high = add_filter( 'title', 'wphx_f7_filter_high', 20, 2 );
$has_mid_before = has_filter( 'title', 'wphx_f7_filter_mid' );
$has_high_exact = has_filter( 'title', 'wphx_f7_filter_high', 20 );
$first = apply_filters( 'title', 'start', 'x' );
$removed_mid = remove_filter( 'title', 'wphx_f7_filter_mid', 10 );
$has_mid_after = has_filter( 'title', 'wphx_f7_filter_mid' );
$second = apply_filters_ref_array( 'title', array( 'again', 'y' ) );

add_action( 'save_post', 'wphx_f7_action', 10, 2 );
do_action( 'save_post', 'post', 42 );

add_filter( 'ref_hook', 'wphx_f7_ref', 10, 1 );
$ref_value = 'seed';
$ref_args = array( &$ref_value );
$ref_return = apply_filters_ref_array( 'ref_hook', $ref_args );

$globals = array(
\t'wp_filter_type' => gettype( $GLOBALS['wp_filter'] ),
\t'wp_filter_keys' => array_keys( $GLOBALS['wp_filter'] ),
\t'wp_filter_title_class' => get_class( $GLOBALS['wp_filter']['title'] ),
\t'wp_filter_title_priorities' => array_map( 'intval', array_keys( $GLOBALS['wp_filter']['title']->callbacks ) ),
\t'wp_filters' => $GLOBALS['wp_filters'],
\t'wp_actions' => $GLOBALS['wp_actions'],
\t'wp_current_filter' => $GLOBALS['wp_current_filter'],
);

$class_reflection = new ReflectionClass( 'WP_Hook' );

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'before' => $before,
\t\t'after' => $after,
\t\t'reflections' => $reflections,
\t\t'classReflection' => array(
\t\t\t'name' => $class_reflection->getName(),
\t\t\t'isFinal' => $class_reflection->isFinal(),
\t\t\t'interfaceNames' => $class_reflection->getInterfaceNames(),
\t\t\t'hasCallbacksProperty' => $class_reflection->hasProperty( 'callbacks' ),
\t\t),
\t\t'addReturns' => array( $add_all, $add_low, $add_mid, $add_high ),
\t\t'filterResults' => array(
\t\t\t'hasMidBefore' => $has_mid_before,
\t\t\t'hasHighExact' => $has_high_exact,
\t\t\t'first' => $first,
\t\t\t'removedMid' => $removed_mid,
\t\t\t'hasMidAfter' => $has_mid_after,
\t\t\t'second' => $second,
\t\t),
\t\t'actionResults' => array(
\t\t\t'didSavePost' => did_action( 'save_post' ),
\t\t),
\t\t'referenceResults' => array(
\t\t\t'refReturn' => $ref_return,
\t\t\t'refValue' => $ref_value,
\t\t),
\t\t'globals' => $globals,
\t\t'trace' => $GLOBALS['wphx_f7_trace'],
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function normalizeProbe(result) {
  return {
    before: result.before,
    after: result.after,
    reflections: result.reflections,
    classReflection: result.classReflection,
    addReturns: result.addReturns,
    filterResults: result.filterResults,
    actionResults: result.actionResults,
    referenceResults: result.referenceResults,
    globals: result.globals,
    trace: result.trace
  };
}

function runProbe(commandPath, label, mode, plugin) {
  const output = command(commandPath, [PROBE, mode, plugin]);
  return {
    id: `${label}:${mode}`,
    command: `${commandPath} ${PROBE} ${mode} ${plugin}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, mode, plugin) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, mode, plugin]);
  return {
    id: `${id}:${mode}`,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${mode} ${plugin}`,
    image,
    result: JSON.parse(output)
  };
}

function compareResults(oracleResult, generatedResult) {
  const oracle = normalizeProbe(oracleResult);
  const generated = normalizeProbe(generatedResult);
  return {
    matches: JSON.stringify(oracle) === JSON.stringify(generated),
    oracle,
    generated
  };
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
copyOracleTree();
writeGeneratedClass();
writeGeneratedPlugin();
writeProbe();

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

const localOracle = runProbe("php", "local-php-cli", "oracle", ORACLE_PLUGIN);
const localGenerated = runProbe("php", "local-php-cli", "generated", GENERATED_PLUGIN);
runs.push(localOracle, localGenerated);
comparisons.push({
  id: "local-php-cli",
  ...compareResults(localOracle.result, localGenerated.result)
});

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    const oracle = runDockerProbe(id, image, "oracle", ORACLE_PLUGIN);
    const generated = runDockerProbe(id, image, "generated", GENERATED_PLUGIN);
    runs.push(oracle, generated);
    comparisons.push({
      id,
      ...compareResults(oracle.result, generated.result)
    });
  }
}

const failures = comparisons.filter((comparison) => !comparison.matches);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.php-facade-f7-hook-kernel.v1",
  issue: "WPHX-108",
  generated_at: RECORDED_AT,
  generator: "tools/php-facade/run-f7-hook-kernel.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/HookKernel.hx"
    ],
    upstream_oracle_sources: [UPSTREAM_PLUGIN, UPSTREAM_HOOK_CLASS],
    oracle_plugin: ORACLE_PLUGIN,
    generated_plugin: GENERATED_PLUGIN,
    generated_hook_class: GENERATED_HOOK_CLASS,
    probe: PROBE
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version: command("php", ["-r", "echo PHP_VERSION;"]),
    docker_server_version: dockerVersion
  },
  build: {
    command: `haxe ${HXML}`,
    haxe_output_dir: HAXE_OUT,
    generated_haxe_file_count: filesUnder(HAXE_OUT).length,
    generated_haxe_files: filesUnder(HAXE_OUT),
    oracle_files: filesUnder(ORACLE_ROOT),
    generated_files: filesUnder(GENERATED_ROOT),
    probe: {
      path: PROBE,
      sha256: sha256(PROBE)
    }
  },
  runtime_runs: runs,
  comparisons,
  hook_strategy: {
    php_globals_remain_native: true,
    php_callbacks_remain_native: true,
    haxe_owns_bounded_trace_helpers: true,
    boundary_note: "The hook public ABI and callback execution remain original-path PHP because PHP callables, references, and globals are observable. Haxe can own typed helper payloads behind that boundary while later work ports a larger WP_Hook kernel deliberately."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    upstream_oracle: true,
    reflected_signatures: true,
    callback_ordering: true,
    callback_removal: true,
    accepted_args: true,
    all_hook_trace: true,
    action_trace: true,
    reference_filter: true,
    current_filter_stack: true,
    native_hook_globals: true
  }
};

const serialized = JSON.stringify(manifest, null, 2) + "\n";

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} does not exist` }, null, 2));
    process.exit(1);
  }
  if (readFileSync(OUT, "utf8") !== serialized) {
    console.error(JSON.stringify({ status: "failed", error: `${OUT} is stale` }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ status: "passed", output: OUT, comparison_count: comparisons.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, serialized);
console.log(JSON.stringify({ status: "passed", output: OUT, comparison_count: comparisons.length }, null, 2));
