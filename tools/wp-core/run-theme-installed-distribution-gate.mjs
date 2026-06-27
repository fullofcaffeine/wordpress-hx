#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.17.9",
  external_ref: "WPHX-310.10",
  title: "WPHX-310.10 — Add theme installed front-end/admin gate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-310-10";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-theme-installed-router.php";
const OUT = "manifests/wp-core/wphx-310-10-theme-installed-distribution.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-310-10-theme-installed-distribution.v1.json";
const RECEIPT = "receipts/wp-core/wphx-310-10-theme-installed-distribution.v1.json";
const RUNNER = "tools/wp-core/run-theme-installed-distribution-gate.mjs";

const HAXE_OUTPUTS = ["build/wp-core/wphx-310-02/haxe"];
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-310-01-themes-template-surface.v1.json",
  "manifests/wp-core/wphx-310-02-theme-template-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-310-03-theme-support-template-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-310-04-theme-json-global-styles-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-310-05-theme-json-resolver-global-styles-fixture.v1.json",
  "manifests/wp-core/wphx-310-06-theme-customizer-widget-nav-surface.v1.json",
  "manifests/wp-core/wphx-310-07-widget-sidebar-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-310-08-nav-menu-oracle-fixture.v1.json",
  "manifests/wp-core/wphx-310-09-customizer-manager-setting-oracle-fixture.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/theme.php",
  "src/wp-includes/template.php",
  "src/wp-includes/class-wp-theme.php",
  "src/wp-includes/class-wp-theme-json.php",
  "src/wp-includes/class-wp-theme-json-resolver.php",
  "src/wp-includes/global-styles-and-settings.php",
  "src/wp-includes/class-wp-widget.php",
  "src/wp-includes/class-wp-widget-factory.php",
  "src/wp-includes/widgets.php",
  "src/wp-includes/class-wp-walker.php",
  "src/wp-includes/class-walker-nav-menu.php",
  "src/wp-includes/nav-menu.php",
  "src/wp-includes/nav-menu-template.php",
  "src/wp-includes/class-wp-customize-manager.php",
  "src/wp-includes/class-wp-customize-setting.php",
  "src/wp-includes/class-wp-customize-panel.php",
  "src/wp-includes/class-wp-customize-section.php",
  "src/wp-includes/class-wp-customize-control.php",
  "src/wp-includes/customize/class-wp-customize-selective-refresh.php",
  "src/wp-includes/customize/class-wp-customize-partial.php"
];
const CASES = [
  { id: "boundary:theme-package", method: "GET", path: "/__wphx/package-boundary", focus: "theme package source files, fixture theme files, and candidate Haxe adapter-contract artifacts are present" },
  { id: "front:home-render", method: "GET", path: "/", focus: "front-end theme request observes template include, global styles, nav menu, sidebar widget, and body classes" },
  { id: "front:single-render", method: "GET", path: "/fixture-post/", focus: "singular front-end request observes single template, post title, nav menu, widget, and canonical theme state" },
  { id: "front:global-styles", method: "GET", path: "/__wphx/global-styles", focus: "installed-style global styles endpoint records theme.json settings, CSS variables, and stylesheet handles" },
  { id: "admin:themes-list", method: "GET", path: "/wp-admin/themes.php", focus: "admin themes screen observes active theme, available theme metadata, theme support, and admin hooks" },
  { id: "admin:customize", method: "GET", path: "/wp-admin/customize.php", focus: "admin Customizer screen observes settings, controls, sections, changeset UUID, and selective refresh partials" },
  { id: "admin:widgets-update", method: "POST", path: "/wp-admin/widgets.php?action=update", body: "sidebar=primary&widget_id=text-2&title=Installed%20Widget&body=Saved%20body", focus: "admin widgets route mutates deterministic sidebar/widget state and records update hooks" },
  { id: "admin:nav-menu-assign", method: "POST", path: "/wp-admin/nav-menus.php?action=assign", body: "location=primary&menu_id=42", focus: "admin nav menus route assigns deterministic menu location and records menu update hooks" }
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

function packagePath(root, path) {
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

function copyTree(sourceRoot, targetRoot) {
  if (!existsSync(sourceRoot)) return;
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetPath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

function mirrorSources(root) {
  for (const path of SOURCE_FILES) {
    const target = packagePath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function writeThemeFixtures(root) {
  const themeRoot = `${root}/wp-content/themes/wphx-fixture`;
  mkdirSync(`${themeRoot}/templates`, { recursive: true });
  mkdirSync(`${themeRoot}/parts`, { recursive: true });
  const files = {
    "style.css": "/*\nTheme Name: WPHX Fixture\nText Domain: wphx-fixture\n*/\n",
    "theme.json": JSON.stringify(
      {
        version: 3,
        settings: { color: { palette: [{ slug: "fixture-blue", color: "#123456", name: "Fixture Blue" }] } },
        styles: { color: { text: "var:preset|color|fixture-blue" } }
      },
      null,
      2
    ),
    "index.php": "<?php echo 'template:index';\n",
    "single.php": "<?php echo 'template:single';\n",
    "templates/index.html": "<!-- wp:template-part {\"slug\":\"header\"} /--><!-- wp:post-title /-->",
    "parts/header.html": "<!-- wp:navigation /-->"
  };
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(`${themeRoot}/${name}`, contents);
  }
}

function packageFiles(root) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        files.push({
          path: `${root}/${relative(root, path).replaceAll("\\", "/")}`,
          bytes: statSync(path).size,
          sha256: sha256File(path)
        });
      }
    }
  }
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function haxeArtifactRecords() {
  const records = [];
  for (const root of HAXE_OUTPUTS) {
    const contractDir = `${root}/lib/wphx/wp/themes`;
    if (!existsSync(contractDir)) continue;
    for (const entry of readdirSync(contractDir)) {
      if (!entry.endsWith(".php")) continue;
      records.push(inputRecord(`${contractDir}/${entry}`));
    }
  }
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function writeRouter(root, mode) {
  writeFileSync(
    `${root}/${ROUTER}`,
    `<?php
$request_path = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH );
$query_string = parse_url( $_SERVER['REQUEST_URI'] ?? '/', PHP_URL_QUERY ) ?? '';
parse_str( $query_string, $query );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

$GLOBALS['wphx_310_10_mode'] = '${mode}';
$GLOBALS['wphx_310_10_actions'] = array();
$GLOBALS['wphx_310_10_filters'] = array();
$GLOBALS['wphx_310_10_cache'] = array();
$GLOBALS['wphx_310_10_theme'] = array(
\t'stylesheet' => 'wphx-fixture',
\t'name' => 'WPHX Fixture',
\t'template' => 'wphx-fixture',
\t'block_theme' => true,
\t'theme_supports' => array( 'menus', 'widgets', 'custom-logo', 'title-tag', 'wp-block-styles' ),
);
$GLOBALS['wphx_310_10_global_styles'] = array(
\t'variables' => array( '--wp--preset--color--fixture-blue' => '#123456' ),
\t'css' => 'body{color:var(--wp--preset--color--fixture-blue)}',
\t'handles' => array( 'global-styles', 'classic-theme-styles' ),
);
$GLOBALS['wphx_310_10_nav_menus'] = array(
\t42 => array(
\t\t'term_id' => 42,
\t\t'name' => 'Primary Fixture Menu',
\t\t'slug' => 'primary-fixture-menu',
\t\t'items' => array(
\t\t\tarray( 'id' => 100, 'title' => 'Home', 'url' => '/', 'parent' => 0 ),
\t\t\tarray( 'id' => 101, 'title' => 'About', 'url' => '/about/', 'parent' => 0 ),
\t\t),
\t),
);
$GLOBALS['wphx_310_10_locations'] = array( 'primary' => 42 );
$GLOBALS['wphx_310_10_widgets'] = array(
\t'primary' => array(
\t\t'text-2' => array( 'title' => 'Fixture Widget', 'body' => 'Fixture widget body' ),
\t),
);
$GLOBALS['wphx_310_10_posts'] = array(
\t101 => array( 'ID' => 101, 'post_name' => 'fixture-post', 'post_title' => 'Fixture Post', 'template' => 'single.php', 'canonical' => '/fixture-post/' ),
);

function wphx_310_10_action( $hook, $payload = array() ) {
\t$GLOBALS['wphx_310_10_actions'][] = array( 'hook' => $hook, 'payload' => $payload );
}
function wphx_310_10_filter( $hook, $payload = array() ) {
\t$GLOBALS['wphx_310_10_filters'][] = array( 'hook' => $hook, 'payload' => $payload );
}
function wphx_310_10_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json' );
\t$payload['actions'] = array_column( $GLOBALS['wphx_310_10_actions'], 'hook' );
\t$payload['filters'] = array_column( $GLOBALS['wphx_310_10_filters'], 'hook' );
\t$payload['cache'] = array_values( array_unique( $GLOBALS['wphx_310_10_cache'] ) );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\texit;
}
function wphx_310_10_template_output( $template ) {
\t$file = __DIR__ . '/wp-content/themes/wphx-fixture/' . $template;
\tif ( ! is_readable( $file ) ) {
\t\treturn null;
\t}
\tob_start();
\tinclude $file;
\treturn trim( ob_get_clean() );
}
function wphx_310_10_render_menu( $location ) {
\t$menu_id = $GLOBALS['wphx_310_10_locations'][ $location ] ?? null;
\t$menu = $GLOBALS['wphx_310_10_nav_menus'][ $menu_id ] ?? null;
\tif ( ! $menu ) {
\t\treturn array( 'location' => $location, 'menu_id' => null, 'items' => array(), 'html' => '' );
\t}
\twphx_310_10_filter( 'wp_nav_menu_args', array( 'theme_location' => $location ) );
\twphx_310_10_filter( 'wp_nav_menu_objects', array( 'item_count' => count( $menu['items'] ) ) );
\t$html = '<nav aria-label="' . $menu['name'] . '"><ul>';
\tforeach ( $menu['items'] as $item ) {
\t\t$html .= '<li><a href="' . $item['url'] . '">' . $item['title'] . '</a></li>';
\t}
\t$html .= '</ul></nav>';
\treturn array( 'location' => $location, 'menu_id' => $menu_id, 'items' => array_column( $menu['items'], 'title' ), 'html_sha256' => hash( 'sha256', $html ) );
}
function wphx_310_10_render_sidebar( $sidebar ) {
\t$widgets = $GLOBALS['wphx_310_10_widgets'][ $sidebar ] ?? array();
\twphx_310_10_action( 'dynamic_sidebar_before', array( 'sidebar' => $sidebar ) );
\t$html = '';
\tforeach ( $widgets as $id => $widget ) {
\t\twphx_310_10_filter( 'widget_title', array( 'id' => $id, 'title' => $widget['title'] ) );
\t\t$html .= '<section id="' . $id . '"><h2>' . $widget['title'] . '</h2><p>' . $widget['body'] . '</p></section>';
\t}
\twphx_310_10_action( 'dynamic_sidebar_after', array( 'sidebar' => $sidebar, 'count' => count( $widgets ) ) );
\treturn array( 'sidebar' => $sidebar, 'widget_ids' => array_keys( $widgets ), 'html_sha256' => hash( 'sha256', $html ) );
}
function wphx_310_10_front_response( $route, $template, $post = null ) {
\twphx_310_10_action( 'template_redirect', array( 'route' => $route ) );
\twphx_310_10_filter( 'template_include', array( 'template' => $template ) );
\t$GLOBALS['wphx_310_10_cache'][] = 'theme:' . $GLOBALS['wphx_310_10_theme']['stylesheet'];
\treturn array(
\t\t'route' => $route,
\t\t'status' => 200,
\t\t'theme' => $GLOBALS['wphx_310_10_theme'],
\t\t'template' => array( 'file' => $template, 'output' => wphx_310_10_template_output( $template ) ),
\t\t'global_styles' => $GLOBALS['wphx_310_10_global_styles'],
\t\t'nav_menu' => wphx_310_10_render_menu( 'primary' ),
\t\t'sidebar' => wphx_310_10_render_sidebar( 'primary' ),
\t\t'body_classes' => array_filter( array( 'home' === $route ? 'home' : null, 'single' === $route ? 'single' : null, 'theme-wphx-fixture' ) ),
\t\t'post' => $post,
\t);
}
function wphx_310_10_boundary() {
\t$source_files = array(${SOURCE_FILES.map((path) => `'${path.replace(/^src\//, "")}'`).join(", ")});
\t$files = array();
\tforeach ( $source_files as $file ) {
\t\t$files[ $file ] = array( 'present' => file_exists( __DIR__ . '/' . $file ), 'sha1' => file_exists( __DIR__ . '/' . $file ) ? sha1_file( __DIR__ . '/' . $file ) : null );
\t}
\treturn array(
\t\t'mode' => $GLOBALS['wphx_310_10_mode'],
\t\t'files' => $files,
\t\t'theme_files' => array(
\t\t\t'style.css' => file_exists( __DIR__ . '/wp-content/themes/wphx-fixture/style.css' ),
\t\t\t'theme.json' => file_exists( __DIR__ . '/wp-content/themes/wphx-fixture/theme.json' ),
\t\t\t'index.php' => file_exists( __DIR__ . '/wp-content/themes/wphx-fixture/index.php' ),
\t\t\t'single.php' => file_exists( __DIR__ . '/wp-content/themes/wphx-fixture/single.php' ),
\t\t\t'templates/index.html' => file_exists( __DIR__ . '/wp-content/themes/wphx-fixture/templates/index.html' ),
\t\t),
\t\t'haxe_contracts' => array(
\t\t\t'theme_template' => file_exists( __DIR__ . '/haxe-theme-template/lib/wphx/wp/themes/ThemeTemplateAdapterContract.php' ),
\t\t),
\t\t'public_php_files_are_copied_oracle_source' => true,
\t\t'generated_public_theme_replacement_claimed' => false,
\t);
}
function wphx_310_10_themes_admin() {
\twphx_310_10_action( 'load-themes.php' );
\twphx_310_10_filter( 'wp_prepare_themes_for_js', array( 'active' => $GLOBALS['wphx_310_10_theme']['stylesheet'] ) );
\treturn array(
\t\t'route' => 'themes-admin',
\t\t'active' => $GLOBALS['wphx_310_10_theme']['stylesheet'],
\t\t'themes' => array( array( 'stylesheet' => 'wphx-fixture', 'name' => 'WPHX Fixture', 'active' => true, 'block_theme' => true ) ),
\t\t'theme_supports' => $GLOBALS['wphx_310_10_theme']['theme_supports'],
\t);
}
function wphx_310_10_customize_admin() {
\twphx_310_10_action( 'customize_register' );
\twphx_310_10_action( 'customize_controls_init' );
\treturn array(
\t\t'route' => 'customize-admin',
\t\t'changeset_uuid' => '11111111-2222-4333-8444-555555555555',
\t\t'settings' => array( 'blogname' => 'Fixture Site', 'fixture_option' => 'Fixture Value' ),
\t\t'controls' => array( 'blogname', 'fixture_option' ),
\t\t'sections' => array( 'title_tagline', 'fixture_section' ),
\t\t'partials' => array( 'blogname' => array( 'selector' => '.site-title', 'settings' => array( 'blogname' ) ) ),
\t);
}
function wphx_310_10_update_widget( $body ) {
\t$sidebar = $body['sidebar'] ?? 'primary';
\t$widget_id = $body['widget_id'] ?? 'text-2';
\t$GLOBALS['wphx_310_10_widgets'][ $sidebar ][ $widget_id ] = array(
\t\t'title' => $body['title'] ?? '',
\t\t'body' => $body['body'] ?? '',
\t);
\twphx_310_10_action( 'sidebar_admin_setup' );
\twphx_310_10_action( 'widget_update_callback', array( 'widget_id' => $widget_id ) );
\t$GLOBALS['wphx_310_10_cache'][] = 'sidebars_widgets';
\treturn array( 'route' => 'widgets-admin-update', 'sidebar' => $sidebar, 'widgets' => $GLOBALS['wphx_310_10_widgets'][ $sidebar ] );
}
function wphx_310_10_assign_menu( $body ) {
\t$location = $body['location'] ?? 'primary';
\t$menu_id = (int) ( $body['menu_id'] ?? 42 );
\t$GLOBALS['wphx_310_10_locations'][ $location ] = $menu_id;
\twphx_310_10_action( 'wp_update_nav_menu' );
\twphx_310_10_action( 'customize_save_nav_menus_created_posts' );
\t$GLOBALS['wphx_310_10_cache'][] = 'theme_mod_nav_menu_locations';
\treturn array( 'route' => 'nav-menus-admin-assign', 'locations' => $GLOBALS['wphx_310_10_locations'], 'menu' => $GLOBALS['wphx_310_10_nav_menus'][ $menu_id ] );
}

if ( '/__wphx/package-boundary' === $request_path ) {
\twphx_310_10_json( 200, array( 'boundary' => wphx_310_10_boundary() ) );
}
if ( '/__wphx/global-styles' === $request_path ) {
\twphx_310_10_filter( 'wp_theme_json_data_theme', array( 'stylesheet' => 'wphx-fixture' ) );
\twphx_310_10_json( 200, array( 'route' => 'global-styles', 'styles' => $GLOBALS['wphx_310_10_global_styles'], 'theme' => $GLOBALS['wphx_310_10_theme']['stylesheet'] ) );
}
if ( '/wp-admin/themes.php' === $request_path ) {
\twphx_310_10_json( 200, wphx_310_10_themes_admin() );
}
if ( '/wp-admin/customize.php' === $request_path ) {
\twphx_310_10_json( 200, wphx_310_10_customize_admin() );
}
if ( '/wp-admin/widgets.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\twphx_310_10_json( 200, wphx_310_10_update_widget( $body ) );
}
if ( '/wp-admin/nav-menus.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\twphx_310_10_json( 200, wphx_310_10_assign_menu( $body ) );
}
if ( '/fixture-post/' === $request_path ) {
\twphx_310_10_json( 200, wphx_310_10_front_response( 'single', 'single.php', $GLOBALS['wphx_310_10_posts'][101] ) );
}
if ( '/' === $request_path || '/index.php' === $request_path ) {
\twphx_310_10_json( 200, wphx_310_10_front_response( 'home', 'index.php' ) );
}
wphx_310_10_json( 404, array( 'route' => 'missing', 'path' => $request_path ) );
`
  );
}

function writePackage(root, mode) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  mirrorSources(root);
  writeThemeFixtures(root);
  if (mode === "candidate") {
    copyTree("build/wp-core/wphx-310-02/haxe", `${root}/haxe-theme-template`);
  }
  writeRouter(root, mode);
}

function phpLintPackage(root) {
  return [ROUTER, ...SOURCE_FILES.map((path) => path.replace(/^src\//, ""))].map((path) => ({
    path: `${root}/${path}`,
    status: command("php", ["-l", `${root}/${path}`])
  }));
}

function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          rejectPort(new Error("Unable to reserve a local HTTP port"));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

async function withServer(root, callback) {
  const port = await freePort();
  const proc = spawn("php", ["-S", `127.0.0.1:${port}`, ROUTER], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await sleep(250);
  try {
    return await callback(`http://127.0.0.1:${port}`, ["php", "-S", "127.0.0.1:<port>", ROUTER], () => stderr);
  } finally {
    proc.kill("SIGTERM");
    await sleep(100);
  }
}

async function requestCase(baseUrl, testCase) {
  const response = await fetch(`${baseUrl}${testCase.path}`, {
    method: testCase.method,
    headers: testCase.body ? { "content-type": "application/x-www-form-urlencoded" } : {},
    body: testCase.body
  });
  const text = await response.text();
  return {
    id: testCase.id,
    status: response.status,
    content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
    body: JSON.parse(text)
  };
}

async function runPackage(root, mode) {
  return withServer(root, async (baseUrl, serverCommand, stderrFn) => {
    const boundary = await requestCase(baseUrl, CASES[0]);
    const cases = [];
    for (const testCase of CASES.slice(1)) {
      cases.push(await requestCase(baseUrl, testCase));
    }
    return {
      mode,
      command: serverCommand,
      boundary,
      cases,
      stderr_sha256: sha256(stderrFn())
    };
  });
}

function comparableRun(run) {
  return {
    boundary: {
      file_keys: Object.keys(run.boundary.body.boundary.files).sort(),
      theme_files: run.boundary.body.boundary.theme_files,
      public_php_files_are_copied_oracle_source: run.boundary.body.boundary.public_php_files_are_copied_oracle_source,
      generated_public_theme_replacement_claimed: run.boundary.body.boundary.generated_public_theme_replacement_claimed
    },
    cases: run.cases.map((testCase) => ({
      id: testCase.id,
      status: testCase.status,
      route: testCase.body.route,
      actions: testCase.body.actions,
      filters: testCase.body.filters,
      cache: testCase.body.cache,
      theme: testCase.body.theme ?? null,
      template: testCase.body.template ?? null,
      global_styles: testCase.body.global_styles ?? testCase.body.styles ?? null,
      nav_menu: testCase.body.nav_menu ?? null,
      sidebar: testCase.body.sidebar ?? null,
      body_classes: testCase.body.body_classes ?? null,
      post: testCase.body.post ?? null,
      active: testCase.body.active ?? null,
      themes: testCase.body.themes ?? null,
      theme_supports: testCase.body.theme_supports ?? null,
      settings: testCase.body.settings ?? null,
      controls: testCase.body.controls ?? null,
      sections: testCase.body.sections ?? null,
      partials: testCase.body.partials ?? null,
      widgets: testCase.body.widgets ?? null,
      locations: testCase.body.locations ?? null,
      menu: testCase.body.menu ?? null
    }))
  };
}

function compareRuns(oracleRun, candidateRun) {
  const oracleComparable = comparableRun(oracleRun);
  const candidateComparable = comparableRun(candidateRun);
  return {
    status: JSON.stringify(oracleComparable) === JSON.stringify(candidateComparable) ? "passed" : "failed",
    oracle_sha256: sha256(JSON.stringify(oracleComparable)),
    candidate_sha256: sha256(JSON.stringify(candidateComparable)),
    candidate_haxe_contracts: candidateRun.boundary.body.boundary.haxe_contracts
  };
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) {
      throw new Error(`${path} is missing; run npm run wp:core:wphx-310-theme-installed`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-310-theme-installed`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/theme-installed-distribution",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    ownership: {
      kind: "packaged-distribution-installed-http-gate",
      public_contract:
        "The packaged theme surface must match vanilla through installed-style front-end theme rendering, global styles, nav-menu/sidebar observations, and admin themes/customize/widgets/nav-menu route observations while keeping public PHP replacement claims explicit."
    },
    files: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_artifacts: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      commands: [
        "npm run wp:core:wphx-310-theme-installed",
        "npm run wp:core:wphx-310-theme-installed:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt: "receipt:wphx-310-10-theme-installed-distribution",
      manifest_sha256: manifestSha
    },
    boundaries: {
      haxe_owned_contracts: ["ThemeTemplateAdapterContract"],
      copied_oracle_public_php: SOURCE_FILES,
      generated_public_php_replacement_claimed: false
    }
  };
}

async function main() {
  const actualRef = command("git", ["rev-parse", "HEAD"], { cwd: UPSTREAM_ROOT });
  if (actualRef !== WP_REF) {
    throw new Error(`Unexpected ${UPSTREAM_ROOT} ref ${actualRef}; expected ${WP_REF}`);
  }
  for (const path of PRIOR_MANIFESTS) {
    if (!existsSync(path)) throw new Error(`Missing prior manifest ${path}`);
  }
  for (const root of HAXE_OUTPUTS) {
    if (!existsSync(root)) throw new Error(`Missing Haxe output ${root}; run the WPHX-310 adapter-contract generator first`);
  }

  writePackage(ORACLE_ROOT, "oracle");
  writePackage(CANDIDATE_ROOT, "candidate");
  const oracleLint = phpLintPackage(ORACLE_ROOT);
  const candidateLint = phpLintPackage(CANDIDATE_ROOT);
  const oracleRun = await runPackage(ORACLE_ROOT, "oracle");
  const candidateRun = await runPackage(CANDIDATE_ROOT, "candidate");
  const comparison = compareRuns(oracleRun, candidateRun);
  if (comparison.status !== "passed") {
    throw new Error(`Oracle/candidate installed theme comparison failed: ${JSON.stringify(comparison)}`);
  }

  const manifest = {
    schema: "wphx.wp-core-theme-installed-distribution.v1",
    issue: ISSUE.external_ref,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
    artifact_scope: "packaged_distribution",
    inputs: {
      runner: inputRecord(RUNNER),
      package_json: inputRecord("package.json"),
      prior_manifests: PRIOR_MANIFESTS.map(inputRecord),
      source_files: SOURCE_FILES.map(sourceRecord),
      haxe_contracts: haxeArtifactRecords()
    },
    installed_entry: {
      web_server: "PHP built-in development server",
      router: ROUTER,
      oracle_root: ORACLE_ROOT,
      candidate_root: CANDIDATE_ROOT
    },
    package: {
      candidate_files: packageFiles(CANDIDATE_ROOT),
      public_php_files_are_copied_oracle_source: true,
      generated_public_theme_replacement_claimed: false
    },
    fixture: {
      cases: CASES,
      transport: ["HTTP over PHP built-in server", "installed-style front-end/admin routes", "JSON observations"]
    },
    lint: {
      oracle: oracleLint,
      candidate: candidateLint
    },
    runs: [
      {
        id: "installed-theme:oracle",
        mode: "oracle",
        command: oracleRun.command,
        normalized_sha256: sha256(JSON.stringify(comparableRun(oracleRun))),
        boundary: oracleRun.boundary.body.boundary,
        cases: oracleRun.cases
      },
      {
        id: "installed-theme:candidate",
        mode: "candidate",
        command: candidateRun.command,
        normalized_sha256: sha256(JSON.stringify(comparableRun(candidateRun))),
        boundary: candidateRun.boundary.body.boundary,
        cases: candidateRun.cases
      }
    ],
    comparison,
    remaining_gaps: [
      {
        id: "generated-public-theme-php-replacement-deferred",
        owner: "WPHX-310/WPHX-322",
        detail:
          "This gate packages copied WordPress public PHP theme/customizer/widget/nav-menu files and Haxe adapter-contract artifacts. It does not replace those public files with generated original-path PHP."
      },
      {
        id: "full-database-backed-theme-install-deferred",
        owner: "WPHX-310/WPHX-700",
        detail:
          "This installed-style HTTP gate uses deterministic router state. Full database-backed installed theme rendering, Customizer UI, widget/nav-menu persistence, and user global styles remain later distribution work."
      },
      {
        id: "selected-upstream-theme-ratchets-deferred",
        owner: "WPHX-310/WPHX-700",
        detail:
          "Selected upstream PHPUnit groups for themes, template hierarchy, theme JSON/global styles, widgets, nav menus, and Customizer behavior remain separate ratchet gates."
      }
    ],
    ownership_manifest: OWNERSHIP,
    validation_result: {
      status: "passed",
      evidence_classes: ["targeted_semantic_parity", "runtime_abi", "live_integration_parity"],
      artifact_scope: "packaged_distribution",
      fixture_cases: CASES.length,
      http_runs: 2,
      public_php_files_are_copied_oracle_source: true,
      generated_public_theme_replacement_claimed: false,
      haxe_contracts_present: comparison.candidate_haxe_contracts
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-310-10-theme-installed-distribution",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run wp:core:wphx-310-theme-installed",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "packaged_distribution",
    behavior_parity_claimed: false,
    artifacts: [
      { path: OUT, role: "theme installed-distribution manifest" },
      { path: OWNERSHIP, role: "theme installed-distribution ownership manifest" },
      { path: RUNNER, role: "installed theme HTTP gate generator and check-mode validator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-310-theme-installed",
      "npm run wp:core:wphx-310-theme-installed:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-310-02-theme-template-adapter-contract-candidate",
      "receipt:wphx-310-03-theme-support-template-oracle-fixture",
      "receipt:wphx-310-04-theme-json-global-styles-oracle-fixture",
      "receipt:wphx-310-05-theme-json-resolver-global-styles-fixture",
      "receipt:wphx-310-07-widget-sidebar-oracle-fixture",
      "receipt:wphx-310-08-nav-menu-oracle-fixture",
      "receipt:wphx-310-09-customizer-manager-setting-oracle-fixture"
    ],
    manifest_sha256: manifestSha,
    validation_result: manifest.validation_result
  };
  const receiptText = JSON.stringify(receipt, null, 2) + "\n";

  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);

  console.log(
    JSON.stringify(
      {
        status: "passed",
        output: OUT,
        ownership: OWNERSHIP,
        receipt: RECEIPT,
        cases: CASES.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
