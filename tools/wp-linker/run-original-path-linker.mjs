#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { filesUnder, linkOriginalPathTree, sha256File } from "./original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const HXML = "fixtures/wp-linker/original-path-linker.hxml";
const OUT_ROOT = "build/wp-linker";
const HAXE_OUT = `${OUT_ROOT}/haxe`;
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const PROBE = `${OUT_ROOT}/probe.php`;
const INCLUDE_ORACLE_ROOT = "fixtures/php-facade/oracle/include-load";
const TEMPLATE_ORACLE_ROOT = "fixtures/php-facade/oracle/template-scope";
const OUT = "manifests/wp-linker/wphx-205-original-path-linker.v1.json";
const RECEIPT = "receipts/wp-linker/wphx-205-original-path-linker.v1.json";
const RECORDED_AT = "2026-06-20T18:50:00.000Z";
const INCLUDE_SCENARIOS = ["entry-default", "entry-pluggable-override", "direct-guard", "scope-include"];
const TEMPLATE_SCENARIOS = ["admin-style", "theme-style"];

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

function phpVersionFamily(value = command("php", ["-r", "echo PHP_VERSION;"])) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  if (typeof value === "string") {
    return value.replaceAll(process.cwd(), "$WORKSPACE").replaceAll("/work/", "$WORKSPACE/");
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function haxeBootstrapBlock(depthFromFileDir) {
  return `if ( ! function_exists( 'wphx_205_bootstrap_haxe' ) ) {
\tfunction wphx_205_bootstrap_haxe() {
\t\tif ( defined( 'WPHX_205_LINKER_BOOTSTRAPPED' ) ) {
\t\t\treturn;
\t\t}

\t\tdefine( 'WPHX_205_LINKER_BOOTSTRAPPED', true );
\t\t$wphx_205_lib = dirname( __DIR__, ${depthFromFileDir} ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_205_lib );
\t\tspl_autoload_register(
\t\t\tfunction ( $class ) {
\t\t\t\t$file = stream_resolve_include_path( str_replace( '\\\\', '/', $class ) . '.php' );
\t\t\t\tif ( $file ) {
\t\t\t\t\tinclude_once $file;
\t\t\t\t}
\t\t\t}
\t\t);
\t\t\\php\\Boot::__hx__init();
\t}
}

wphx_205_bootstrap_haxe();`;
}

function segment(id, order, kind, source, content, owner = "wphx-205") {
  return { id, order, kind, owner, source, content };
}

function linkedFile(distributionPath, segments) {
  return {
    distribution_path: distributionPath,
    segments: [segment(`${distributionPath}:open`, 0, "php-open", "linker", "<?php"), ...segments]
  };
}

function linkerFiles() {
  return [
    linkedFile("wp-settings.php", [
      segment(
        "settings:bootstrap-constants",
        10,
        "include-shell",
        "WPHX-106",
        `if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}

if ( ! defined( 'WPINC' ) ) {
\tdefine( 'WPINC', 'wp-includes' );
}

if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
\t$GLOBALS['wphx_f5_trace'] = array();
}

if ( ! isset( $GLOBALS['wphx_f5_settings_count'] ) ) {
\t$GLOBALS['wphx_f5_settings_count'] = 0;
}

$GLOBALS['wphx_f5_settings_count']++;
$GLOBALS['wphx_f5_trace'][] = array(
\t'event' => 'settings:begin',
\t'file' => __FILE__,
\t'detail' => 'count:' . $GLOBALS['wphx_f5_settings_count'],
);`
      ),
      segment(
        "settings:ordered-load",
        20,
        "include-order",
        "WPHX-106",
        `$wphx_f5_load_return = require_once ABSPATH . WPINC . '/load.php';
$wphx_f5_repeated_return = include ABSPATH . WPINC . '/repeated.php';
$wphx_f5_value_return = require ABSPATH . WPINC . '/return-value.php';
$wphx_f5_pluggable_return = require_once ABSPATH . WPINC . '/pluggable.php';

$GLOBALS['wphx_f5_load_returns'][] = array(
\t'load' => $wphx_f5_load_return,
\t'repeated' => $wphx_f5_repeated_return,
\t'returnValue' => $wphx_f5_value_return,
\t'pluggable' => $wphx_f5_pluggable_return,
);

$GLOBALS['wphx_f5_trace'][] = array(
\t'event' => 'settings:end',
\t'file' => __FILE__,
\t'detail' => 'trace:' . count( $GLOBALS['wphx_f5_trace'] ),
);

return 'settings:' . $GLOBALS['wphx_f5_settings_count'];`
      )
    ]),
    linkedFile("wp-includes/load.php", [
      segment(
        "load:guard-bootstrap",
        10,
        "include-shell",
        "WPHX-106",
        `if ( ! defined( 'ABSPATH' ) ) {
\treturn 'ABSPATH_REQUIRED';
}

${haxeBootstrapBlock(2)}

if ( ! function_exists( 'wphx_f5_generated_event' ) ) {
\tfunction wphx_f5_generated_event( $event, $file, $detail ) {
\t\treturn json_decode( \\wphx\\fixtures\\php\\facade\\LoadKernel::eventJson( $event, $file, $detail ), true );
\t}
}`
      ),
      segment(
        "load:body",
        20,
        "include-side-effect",
        "WPHX-106",
        `if ( ! isset( $GLOBALS['wphx_f5_trace'] ) ) {
\t$GLOBALS['wphx_f5_trace'] = array();
}

$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'load:included', __FILE__, 'require_once' );

if ( ! function_exists( 'wphx_f5_load_marker' ) ) {
\tfunction wphx_f5_load_marker() {
\t\treturn \\wphx\\fixtures\\php\\facade\\LoadKernel::marker( 'load' );
\t}
}

return 'load:included';`
      )
    ]),
    linkedFile("wp-includes/repeated.php", [
      segment(
        "repeated:body",
        10,
        "include-side-effect",
        "WPHX-106",
        `if ( ! isset( $GLOBALS['wphx_f5_repeated_count'] ) ) {
\t$GLOBALS['wphx_f5_repeated_count'] = 0;
}

$GLOBALS['wphx_f5_repeated_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'repeated:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_repeated_count'] );

return \\wphx\\fixtures\\php\\facade\\LoadKernel::returnValue( 'repeated', $GLOBALS['wphx_f5_repeated_count'] );`
      )
    ]),
    linkedFile("wp-includes/return-value.php", [
      segment(
        "return-value:body",
        10,
        "include-return",
        "WPHX-106",
        `if ( ! isset( $GLOBALS['wphx_f5_return_count'] ) ) {
\t$GLOBALS['wphx_f5_return_count'] = 0;
}

$GLOBALS['wphx_f5_return_count']++;
$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'return-value:included', __FILE__, 'count:' . $GLOBALS['wphx_f5_return_count'] );

return \\wphx\\fixtures\\php\\facade\\LoadKernel::returnValue( 'return-value', $GLOBALS['wphx_f5_return_count'] );`
      )
    ]),
    linkedFile("wp-includes/pluggable.php", [
      segment(
        "pluggable:conditional",
        10,
        "conditional-declaration",
        "WPHX-106",
        `$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'pluggable:included', __FILE__, 'conditional' );

if ( ! function_exists( 'wphx_f5_pluggable' ) ) {
\tfunction wphx_f5_pluggable() {
\t\treturn \\wphx\\fixtures\\php\\facade\\LoadKernel::marker( 'pluggable' );
\t}
}

return 'pluggable:available';`
      )
    ]),
    linkedFile("wp-includes/scope.php", [
      segment(
        "scope:caller-local",
        10,
        "caller-scope",
        "WPHX-106",
        `$GLOBALS['wphx_f5_trace'][] = wphx_f5_generated_event( 'scope:included', __FILE__, isset( $existing ) ? $existing : 'missing' );
$scoped_value = \\wphx\\fixtures\\php\\facade\\LoadKernel::scopeValue( isset( $existing ) ? $existing : 'missing' );

return 'scope:return:' . $scoped_value;`
      )
    ]),
    linkedFile("wp-admin/admin-fixture.php", [
      segment(
        "admin:guard-bootstrap",
        10,
        "template-shell",
        "WPHX-107",
        `if ( ! defined( 'ABSPATH' ) ) {
\treturn 'ABSPATH_REQUIRED';
}

${haxeBootstrapBlock(2)}

if ( ! function_exists( 'wphx_f6_generated_escape' ) ) {
\tfunction wphx_f6_generated_escape( $value ) {
\t\treturn htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
\t}
}`
      ),
      segment(
        "admin:template",
        20,
        "mixed-template",
        "WPHX-107",
        `$GLOBALS['wphx_f6_trace'][] = array(
\t'event' => 'admin:begin',
\t'title' => $title,
\t'itemCount' => count( $items ),
);

$notice = \\wphx\\fixtures\\php\\facade\\TemplateKernel::notice( $notice );
$screen->rendered = true;
?>
<div class="wrap" data-screen="<?php echo wphx_f6_generated_escape( $screen->id ); ?>">
\t<h1><?php echo wphx_f6_generated_escape( $title ); ?></h1>
\t<div class="notice"><?php echo wphx_f6_generated_escape( $notice ); ?></div>
\t<ul class="wp-list-table">
\t\t<?php foreach ( $items as $index => $item ) : ?>
\t\t\t<li class="<?php echo wphx_f6_generated_escape( \\wphx\\fixtures\\php\\facade\\TemplateKernel::rowClass( $index ) ); ?>" data-index="<?php echo wphx_f6_generated_escape( $index ); ?>"><?php echo wphx_f6_generated_escape( $item ); ?></li>
\t\t<?php endforeach; ?>
\t</ul>
</div>
<?php
$items[] = 'admin-mutated';
$GLOBALS['wphx_f6_trace'][] = array(
\t'event' => 'admin:end',
\t'notice' => $notice,
\t'itemCount' => count( $items ),
);

return array(
\t'kind' => 'admin',
\t'notice' => $notice,
\t'itemCount' => count( $items ),
\t'marker' => \\wphx\\fixtures\\php\\facade\\TemplateKernel::marker( 'admin' ),
);`
      )
    ]),
    linkedFile("wp-content/themes/wphx-fixture/content.php", [
      segment(
        "content:guard-bootstrap",
        10,
        "template-shell",
        "WPHX-107",
        `if ( ! defined( 'ABSPATH' ) ) {
\treturn 'ABSPATH_REQUIRED';
}

${haxeBootstrapBlock(4)}

if ( ! function_exists( 'wphx_f6_generated_escape' ) ) {
\tfunction wphx_f6_generated_escape( $value ) {
\t\treturn htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' );
\t}
}`
      ),
      segment(
        "content:template",
        20,
        "mixed-template",
        "WPHX-107",
        `$GLOBALS['wphx_f6_trace'][] = array(
\t'event' => 'theme:begin',
\t'postId' => $post['ID'],
);

$classes[] = 'rendered';
$post['rendered'] = true;
$GLOBALS['wp_query']['seen'][] = $post['ID'];
?>
<article id="post-<?php echo wphx_f6_generated_escape( $post['ID'] ); ?>" class="<?php echo wphx_f6_generated_escape( implode( ' ', $classes ) ); ?>">
\t<h2><?php echo wphx_f6_generated_escape( $post['title'] ); ?></h2>
\t<?php $meta_return = include __DIR__ . '/template-parts/meta.php'; ?>
\t<p class="entry-meta"><?php echo wphx_f6_generated_escape( $meta_line ); ?></p>
\t<div class="entry-summary"><?php echo wphx_f6_generated_escape( \\wphx\\fixtures\\php\\facade\\TemplateKernel::excerpt( $post['content'], 24 ) ); ?></div>
</article>
<?php
$GLOBALS['wphx_f6_trace'][] = array(
\t'event' => 'theme:end',
\t'postId' => $post['ID'],
\t'classes' => $classes,
);

return array(
\t'kind' => 'theme',
\t'metaReturn' => $meta_return,
\t'classCount' => count( $classes ),
\t'postRendered' => $post['rendered'],
);`
      )
    ]),
    linkedFile("wp-content/themes/wphx-fixture/template-parts/meta.php", [
      segment(
        "meta:partial",
        10,
        "nested-template",
        "WPHX-107",
        `$meta_line = \\wphx\\fixtures\\php\\facade\\TemplateKernel::metaLine( $post['author'], $post['date'] );
$GLOBALS['wphx_f6_trace'][] = array(
\t'event' => 'theme:meta',
\t'postId' => $post['ID'],
\t'meta' => $meta_line,
);

return 'meta:' . $post['ID'];`
      )
    ])
  ];
}

function writeProbe() {
  writeFile(
    PROBE,
    `<?php

$mode = $argv[1];
$suite = $argv[2];
$scenario = $argv[3];
$root = rtrim( $argv[4], '/' );

function wphx_205_normalize_value( $value, $root ) {
\t$real_root = str_replace( '\\\\', '/', realpath( $root ) );

\tif ( is_array( $value ) ) {
\t\t$normalized = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$normalized[ $key ] = wphx_205_normalize_value( $item, $root );
\t\t}
\t\treturn $normalized;
\t}

\tif ( is_string( $value ) ) {
\t\t$value = str_replace( '\\\\', '/', $value );
\t\treturn str_replace( $real_root, '<root>', $value );
\t}

\treturn $value;
}

function wphx_205_normalize_output( $output ) {
\t$output = str_replace( array( "\\r\\n", "\\r" ), "\\n", $output );
\treturn trim( $output );
}

function wphx_205_include_state( $root ) {
\t$state = array(
\t\t'defined' => array(
\t\t\t'ABSPATH' => defined( 'ABSPATH' ),
\t\t\t'WPINC' => defined( 'WPINC' ),
\t\t),
\t\t'constants' => array(
\t\t\t'ABSPATH' => defined( 'ABSPATH' ) ? ABSPATH : null,
\t\t\t'WPINC' => defined( 'WPINC' ) ? WPINC : null,
\t\t),
\t\t'functions' => array(
\t\t\t'loadMarker' => function_exists( 'wphx_f5_load_marker' ),
\t\t\t'pluggable' => function_exists( 'wphx_f5_pluggable' ),
\t\t),
\t\t'functionValues' => array(
\t\t\t'loadMarker' => function_exists( 'wphx_f5_load_marker' ) ? wphx_f5_load_marker() : null,
\t\t\t'pluggable' => function_exists( 'wphx_f5_pluggable' ) ? wphx_f5_pluggable() : null,
\t\t),
\t\t'counts' => array(
\t\t\t'settings' => $GLOBALS['wphx_f5_settings_count'] ?? null,
\t\t\t'repeated' => $GLOBALS['wphx_f5_repeated_count'] ?? null,
\t\t\t'returnValue' => $GLOBALS['wphx_f5_return_count'] ?? null,
\t\t),
\t\t'trace' => $GLOBALS['wphx_f5_trace'] ?? array(),
\t\t'loadReturns' => $GLOBALS['wphx_f5_load_returns'] ?? array(),
\t);

\treturn wphx_205_normalize_value( $state, $root );
}

function wphx_205_scope_case( $path ) {
\t$existing = 'caller-local';
\t$scope_return = include $path;

\treturn array(
\t\t'existingAfterInclude' => $existing,
\t\t'scopedValue' => $scoped_value ?? null,
\t\t'returnValue' => $scope_return,
\t);
}

function wphx_205_include_case( $scenario, $root ) {
\t$entry = $root . '/wp-settings.php';
\t$before = wphx_205_include_state( $root );
\t$result = array();

\tif ( 'entry-default' === $scenario ) {
\t\t$first = require $entry;
\t\t$second = require $entry;
\t\t$result = array(
\t\t\t'entryReturns' => array( $first, $second ),
\t\t\t'state' => wphx_205_include_state( $root ),
\t\t);
\t} elseif ( 'entry-pluggable-override' === $scenario ) {
\t\tfunction wphx_f5_pluggable() {
\t\t\treturn 'plugin-override';
\t\t}

\t\t$first = require $entry;
\t\t$result = array(
\t\t\t'entryReturns' => array( $first ),
\t\t\t'state' => wphx_205_include_state( $root ),
\t\t);
\t} elseif ( 'direct-guard' === $scenario ) {
\t\t$direct = require $root . '/wp-includes/load.php';
\t\t$result = array(
\t\t\t'directReturn' => $direct,
\t\t\t'state' => wphx_205_include_state( $root ),
\t\t);
\t} elseif ( 'scope-include' === $scenario ) {
\t\t$first = require $entry;
\t\t$scope = wphx_205_scope_case( $root . '/wp-includes/scope.php' );
\t\t$result = array(
\t\t\t'entryReturns' => array( $first ),
\t\t\t'scope' => wphx_205_normalize_value( $scope, $root ),
\t\t\t'state' => wphx_205_include_state( $root ),
\t\t);
\t} else {
\t\tfwrite( STDERR, 'Unknown include scenario: ' . $scenario . PHP_EOL );
\t\texit( 2 );
\t}

\treturn array(
\t\t'scenario' => $scenario,
\t\t'before' => $before,
\t\t'result' => $result,
\t);
}

function wphx_205_admin_case( $root ) {
\tif ( ! defined( 'ABSPATH' ) ) {
\t\tdefine( 'ABSPATH', $root . '/' );
\t}

\t$GLOBALS['wphx_f6_trace'] = array();
\t$title = 'Posts & Pages';
\t$notice = 'saved';
\t$items = array( 'alpha', 'beta <two>' );
\t$screen = (object) array( 'id' => 'edit-post' );

\tob_start();
\t$return = include $root . '/wp-admin/admin-fixture.php';
\t$output = ob_get_clean();

\treturn array(
\t\t'returnValue' => $return,
\t\t'output' => wphx_205_normalize_output( $output ),
\t\t'locals' => array(
\t\t\t'title' => $title,
\t\t\t'notice' => $notice,
\t\t\t'items' => $items,
\t\t\t'screen' => array(
\t\t\t\t'id' => $screen->id,
\t\t\t\t'rendered' => $screen->rendered ?? false,
\t\t\t),
\t\t),
\t\t'trace' => $GLOBALS['wphx_f6_trace'],
\t);
}

function wphx_205_theme_case( $root ) {
\tif ( ! defined( 'ABSPATH' ) ) {
\t\tdefine( 'ABSPATH', $root . '/' );
\t}

\t$GLOBALS['wphx_f6_trace'] = array();
\t$GLOBALS['wp_query'] = array( 'seen' => array() );
\t$post = array(
\t\t'ID' => 42,
\t\t'title' => 'Hello <World>',
\t\t'author' => 'Ada',
\t\t'date' => '2026-06-20',
\t\t'content' => 'This is the content body for a theme template fixture.',
\t);
\t$classes = array( 'post', 'type-post' );

\tob_start();
\t$return = include $root . '/wp-content/themes/wphx-fixture/content.php';
\t$output = ob_get_clean();

\treturn array(
\t\t'returnValue' => $return,
\t\t'output' => wphx_205_normalize_output( $output ),
\t\t'locals' => array(
\t\t\t'post' => $post,
\t\t\t'classes' => $classes,
\t\t\t'metaLine' => $meta_line ?? null,
\t\t),
\t\t'globals' => array(
\t\t\t'wpQuery' => $GLOBALS['wp_query'],
\t\t),
\t\t'trace' => $GLOBALS['wphx_f6_trace'],
\t);
}

function wphx_205_template_case( $scenario, $root ) {
\tif ( 'admin-style' === $scenario ) {
\t\t$result = wphx_205_admin_case( $root );
\t} elseif ( 'theme-style' === $scenario ) {
\t\t$result = wphx_205_theme_case( $root );
\t} else {
\t\tfwrite( STDERR, 'Unknown template scenario: ' . $scenario . PHP_EOL );
\t\texit( 2 );
\t}

\treturn array(
\t\t'scenario' => $scenario,
\t\t'result' => $result,
\t);
}

if ( 'include-load' === $suite ) {
\t$result = wphx_205_include_case( $scenario, $root );
} elseif ( 'template-scope' === $suite ) {
\t$result = wphx_205_template_case( $scenario, $root );
} else {
\tfwrite( STDERR, 'Unknown suite: ' . $suite . PHP_EOL );
\texit( 2 );
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'suite' => $suite,
\t\t'scenario' => $scenario,
\t\t'result' => $result,
\t),
\tJSON_UNESCAPED_SLASHES
);
`
  );
}

function normalizeProbe(result) {
  return {
    suite: result.suite,
    scenario: result.scenario,
    result: result.result
  };
}

function runProbe(commandPath, label, suite, scenario, root) {
  const output = command(commandPath, [PROBE, label, suite, scenario, root]);
  return {
    id: `${label}:${suite}:${scenario}`,
    command: `${commandPath} ${PROBE} ${label} ${suite} ${scenario} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(id, image, label, suite, scenario, root) {
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-w", "/work", image, "php", PROBE, label, suite, scenario, root]);
  return {
    id: `${id}:${label}:${suite}:${scenario}`,
    command: `docker run --rm -v $PWD:/work -w /work ${image} php ${PROBE} ${label} ${suite} ${scenario} ${root}`,
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

function scenarioMatrix() {
  return [
    ...INCLUDE_SCENARIOS.map((scenario) => ({
      suite: "include-load",
      scenario,
      oracleRoot: INCLUDE_ORACLE_ROOT
    })),
    ...TEMPLATE_SCENARIOS.map((scenario) => ({
      suite: "template-scope",
      scenario,
      oracleRoot: TEMPLATE_ORACLE_ROOT
    }))
  ];
}

const lock = readJson("toolchain.lock.json");
rmSync(OUT_ROOT, { recursive: true, force: true });
command("haxe", [HXML]);
const linkedFiles = linkOriginalPathTree({ root: GENERATED_ROOT, files: linkerFiles() });
writeProbe();

const dockerVersion = maybeCommand("docker", ["info", "--format", "{{.ServerVersion}}"]);
const runs = [];
const comparisons = [];

for (const item of scenarioMatrix()) {
  const oracle = runProbe("php", "oracle", item.suite, item.scenario, item.oracleRoot);
  const generated = runProbe("php", "generated", item.suite, item.scenario, GENERATED_ROOT);
  runs.push(oracle, generated);
  comparisons.push({
    id: `local-php-cli:${item.suite}:${item.scenario}`,
    ...compareResults(oracle.result, generated.result)
  });
}

if (dockerVersion) {
  for (const [id, image] of [
    ["docker-php-8.4-cli", `${lock.container_images.php_8_4_cli.repository}@${lock.container_images.php_8_4_cli.index_digest}`],
    ["docker-php-8.5-cli", `${lock.container_images.php_8_5_cli.repository}@${lock.container_images.php_8_5_cli.index_digest}`]
  ]) {
    for (const item of scenarioMatrix()) {
      const oracle = runDockerProbe(id, image, "oracle", item.suite, item.scenario, item.oracleRoot);
      const generated = runDockerProbe(id, image, "generated", item.suite, item.scenario, GENERATED_ROOT);
      runs.push(oracle, generated);
      comparisons.push({
        id: `${id}:${item.suite}:${item.scenario}`,
        ...compareResults(oracle.result, generated.result)
      });
    }
  }
}

const failures = comparisons.filter((comparison) => !comparison.matches);
if (failures.length > 0) {
  console.error(JSON.stringify({ status: "failed", failures }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-original-path-linker.v1",
  issue: "WPHX-205",
  generated_at: RECORDED_AT,
  generator: "tools/wp-linker/run-original-path-linker.mjs",
  linker: "tools/wp-linker/original-path-linker.mjs",
  fixture: {
    hxml: HXML,
    haxe_sources: [
      "fixtures/wp-linker/src/wphx/fixtures/wp/linker/LinkerEntry.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/LoadKernel.hx",
      "fixtures/php-facade/src/wphx/fixtures/php/facade/TemplateKernel.hx"
    ],
    oracle_roots: {
      include_load: INCLUDE_ORACLE_ROOT,
      template_scope: TEMPLATE_ORACLE_ROOT
    },
    generated_root: GENERATED_ROOT,
    probe: PROBE,
    include_scenarios: INCLUDE_SCENARIOS,
    template_scenarios: TEMPLATE_SCENARIOS
  },
  toolchain: {
    haxe_version: command("haxe", ["--version"]),
    locked_haxe_version: lock.tools.haxe.version,
    php_cli_version_family: phpVersionFamily(),
    docker_available: dockerVersion != null
  },
  build: {
    command: `haxe ${HXML}`,
    haxe_output_dir: HAXE_OUT,
    generated_haxe_file_count: filesUnder(HAXE_OUT).length,
    generated_haxe_files: filesUnder(HAXE_OUT),
    linked_shell_file_count: linkedFiles.length,
    linked_shell_files: linkedFiles,
    generated_root_files: filesUnder(GENERATED_ROOT),
    oracle_include_files: filesUnder(INCLUDE_ORACLE_ROOT),
    oracle_template_files: filesUnder(TEMPLATE_ORACLE_ROOT),
    probe: {
      path: PROBE,
      sha256: sha256File(PROBE)
    }
  },
  runtime_runs: runs.map(stableValue),
  comparisons,
  linker_strategy: {
    deterministic_segment_order: true,
    original_distribution_paths: true,
    combined_generated_root: true,
    haxe_payloads_are_loaded_from_shared_runtime_dir: true,
    boundary_note: "The linker writes original WordPress distribution paths from ordered source segments. PHP shells own include timing, template caller scope, mixed output, and conditional declarations while delegating bounded payload helpers to Haxe."
  },
  validation_result: {
    status: "passed",
    runtime_run_count: runs.length,
    comparison_count: comparisons.length,
    include_load_fixtures: true,
    template_scope_fixtures: true,
    original_path_shells: true,
    file_segment_linking: true
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const receipt = {
  schema: "wphx.wp-original-path-linker-receipt.v1",
  id: "receipt:wphx-205-original-path-linker",
  issue: "WPHX-205",
  recorded_at: RECORDED_AT,
  command: "npm run wp:linker",
  status: "passed",
  manifest: OUT,
  manifest_sha256: sha256(manifestText),
  linked_shell_file_count: linkedFiles.length,
  runtime_run_count: runs.length,
  comparison_count: comparisons.length,
  suites: ["include-load", "template-scope"]
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

if (checkOnly) {
  for (const [path, text] of [
    [OUT, manifestText],
    [RECEIPT, receiptText]
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
  console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, linked_shell_file_count: linkedFiles.length }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(OUT, manifestText);
writeFileSync(RECEIPT, receiptText);
console.log(JSON.stringify({ status: "passed", output: OUT, receipt: RECEIPT, linked_shell_file_count: linkedFiles.length }, null, 2));
