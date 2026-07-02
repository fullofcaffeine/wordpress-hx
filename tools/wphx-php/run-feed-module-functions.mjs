#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const checkOnly = process.argv.includes("--check");
const RECORDED_AT = "2026-07-02T23:58:00Z";
const ISSUE = {
  id: "wordpresshx-a89x",
  external_ref: "WPHX-COMP-PHP-MODULE-FUNCTION-ADAPTERS",
  title: "Add module-function original-path adapters for feed embed HTTPS helpers"
};
const CONTINUATION_ISSUE = {
  id: "wordpresshx-f2w7",
  external_ref: "WPHX-COMP-PHP-FEED-EMBED-HTTPS-REMAINDER",
  title: "Expand feed embed HTTPS original-path adapters"
};
const RUNNER = "tools/wphx-php/run-feed-module-functions.mjs";
const IMPL_HXML = "fixtures/wphx-php/feed-module-functions-impl.hxml";
const SHELL_HXML = "fixtures/wphx-php/feed-module-functions.hxml";
const SOURCE_FILES = [
  "src/wphx/compiler/php/WphxPhpCompiler.hx",
  "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedImplEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedKernel.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleSurface.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/HaxeFeedKernel.hx"
];
const OUT_ROOT = "build/wphx-php/feed-module-functions";
const GENERATED_ROOT = `${OUT_ROOT}/generated`;
const HAXE_ROOT = `${OUT_ROOT}/haxe`;
const GENERATED_SHELL = `${GENERATED_ROOT}/wp-includes/feed.php`;
const EMISSION_MANIFEST = `${GENERATED_ROOT}/wphx-php-emission.v1.json`;
const ORACLE_SHELL = `${OUT_ROOT}/oracle/wp-includes/feed.php`;
const PROBE = `${OUT_ROOT}/probe.php`;
const MANIFEST = "manifests/wphx-php/feed-module-functions.v1.json";
const RECEIPT = "receipts/compiler/wphx-comp-php-module-function-adapters.v1.json";
const EXACT_PATTERNS = [
  "function get_bloginfo_rss($show = '')",
  "FeedKernel::getBloginfoRss($show)",
  "function bloginfo_rss($show = '')",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::bloginfoRss( $show );",
  "function get_default_feed()",
  "function get_wp_title_rss($deprecated = '&#8211;')",
  "FeedKernel::getWpTitleRss($deprecated)",
  "function wp_title_rss($deprecated = '&#8211;')",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::wpTitleRss( $deprecated );",
  "function get_the_title_rss($post = 0)",
  "FeedKernel::getTheTitleRss($post)",
  "function the_title_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::theTitleRss();",
  "function the_excerpt_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::theExcerptRss();",
  "function the_permalink_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::thePermalinkRss();",
  "function comments_link_feed()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::commentsLinkFeed();",
  "function comment_guid($comment_id = null)",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::commentGuid( $comment_id );",
  "function get_comment_guid($comment_id = null)",
  "FeedKernel::getCommentGuid($comment_id)",
  "function comment_link($comment = null)",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::commentLink( $comment );",
  "function get_comment_author_rss()",
  "FeedKernel::getCommentAuthorRss()",
  "function comment_author_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::commentAuthorRss();",
  "function comment_text_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::commentTextRss();",
  "function get_the_content_feed($feed_type = null)",
  "FeedKernel::getTheContentFeed($feed_type)",
  "function the_content_feed($feed_type = null)",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::theContentFeed( $feed_type );",
  "function feed_content_type($type = '')",
  "FeedKernel::defaultFeed()",
  "FeedKernel::feedContentType($type)",
  "function html_type_rss()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::htmlTypeRss();",
  "function atom_site_icon()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::atomSiteIcon();",
  "function rss2_site_icon()",
  "echo \\wphx\\fixtures\\php\\feed\\FeedKernel::rss2SiteIcon();"
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function inputRecord(path) {
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
}

function writeOrCheck(path, content) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing; run without --check to generate it`);
    if (readFileSync(path, "utf8") !== content) throw new Error(`${path} is stale; run without --check to refresh it`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function oracleSource() {
  return `<?php
function get_bloginfo_rss( $show = '' ) {
\t$info = strip_tags( get_bloginfo( $show ) );

\treturn apply_filters( 'get_bloginfo_rss', convert_chars( $info ), $show );
}

function bloginfo_rss( $show = '' ) {
\techo apply_filters( 'bloginfo_rss', get_bloginfo_rss( $show ), $show );
}

function get_default_feed() {
\t$default_feed = apply_filters( 'default_feed', 'rss2' );

\treturn ( 'rss' === $default_feed ) ? 'rss2' : $default_feed;
}

function get_wp_title_rss( $deprecated = '&#8211;' ) {
\tif ( '&#8211;' !== $deprecated ) {
\t\t_deprecated_argument( __FUNCTION__, '4.4.0', sprintf( __( 'Use the %s filter instead.' ), '<code>document_title_separator</code>' ) );
\t}

\treturn apply_filters( 'get_wp_title_rss', wp_get_document_title(), $deprecated );
}

function wp_title_rss( $deprecated = '&#8211;' ) {
\tif ( '&#8211;' !== $deprecated ) {
\t\t_deprecated_argument( __FUNCTION__, '4.4.0', sprintf( __( 'Use the %s filter instead.' ), '<code>document_title_separator</code>' ) );
\t}

\techo apply_filters( 'wp_title_rss', get_wp_title_rss(), $deprecated );
}

function get_the_title_rss( $post = 0 ) {
\t$title = get_the_title( $post );

\treturn apply_filters( 'the_title_rss', $title );
}

function the_title_rss() {
\techo get_the_title_rss();
}

function the_excerpt_rss() {
\t$output = get_the_excerpt();
\techo apply_filters( 'the_excerpt_rss', $output );
}

function the_permalink_rss() {
\techo esc_url( apply_filters( 'the_permalink_rss', get_permalink() ) );
}

function comments_link_feed() {
\techo esc_url( apply_filters( 'comments_link_feed', get_comments_link() ) );
}

function comment_guid( $comment_id = null ) {
\techo esc_url( get_comment_guid( $comment_id ) );
}

function get_comment_guid( $comment_id = null ) {
\t$comment = get_comment( $comment_id );

\tif ( ! is_object( $comment ) ) {
\t\treturn false;
\t}

\treturn get_the_guid( $comment->comment_post_ID ) . '#comment-' . $comment->comment_ID;
}

function comment_link( $comment = null ) {
\techo esc_url( apply_filters( 'comment_link', get_comment_link( $comment ) ) );
}

function get_comment_author_rss() {
\treturn apply_filters( 'comment_author_rss', get_comment_author() );
}

function comment_author_rss() {
\techo get_comment_author_rss();
}

function comment_text_rss() {
\t$comment_text = get_comment_text();
\t$comment_text = apply_filters( 'comment_text_rss', $comment_text );
\techo $comment_text;
}

function get_the_content_feed( $feed_type = null ) {
\tif ( ! $feed_type ) {
\t\t$feed_type = get_default_feed();
\t}

\t$content = apply_filters( 'the_content', get_the_content() );
\t$content = str_replace( ']]>', ']]&gt;', $content );

\treturn apply_filters( 'the_content_feed', $content, $feed_type );
}

function the_content_feed( $feed_type = null ) {
\techo get_the_content_feed( $feed_type );
}

function feed_content_type( $type = '' ) {
\tif ( empty( $type ) ) {
\t\t$type = get_default_feed();
\t}

\t$types = array(
\t\t'rss'      => 'application/rss+xml',
\t\t'rss2'     => 'application/rss+xml',
\t\t'rss-http' => 'text/xml',
\t\t'atom'     => 'application/atom+xml',
\t\t'rdf'      => 'application/rdf+xml',
\t);

\t$content_type = ( ! empty( $types[ $type ] ) ) ? $types[ $type ] : 'application/octet-stream';

\treturn apply_filters( 'feed_content_type', $content_type, $type );
}

function html_type_rss() {
\t$type = get_bloginfo( 'html_type' );
\tif ( str_contains( $type, 'xhtml' ) ) {
\t\t$type = 'xhtml';
\t} else {
\t\t$type = 'html';
\t}
\techo $type;
}

function atom_site_icon() {
\t$url = get_site_icon_url( 32 );
\tif ( $url ) {
\t\techo '<icon>' . convert_chars( $url ) . "</icon>\\n";
\t}
}

function rss2_site_icon() {
\t$rss_title = get_wp_title_rss();
\tif ( empty( $rss_title ) ) {
\t\t$rss_title = get_bloginfo_rss( 'name' );
\t}

\t$url = get_site_icon_url( 32 );
\tif ( $url ) {
\t\techo '
\t<image>
\t\t<url>' . convert_chars( $url ) . '</url>
\t\t<title>' . $rss_title . '</title>
\t\t<link>' . get_bloginfo_rss( 'url' ) . '</link>
\t\t<width>32</width>
\t\t<height>32</height>
\t</image> ' . "\\n";
\t}
}
`;
}

function probeSource() {
  return `<?php
$mode = $argv[1];
$shell = $argv[2];
$GLOBALS['wphx_filter_log'] = array();
$GLOBALS['wphx_filter_overrides'] = array();
$GLOBALS['wphx_deprecated_log'] = array();

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_filter_log'][] = array(
\t\t'hook' => $hook_name,
\t\t'value' => $value,
\t\t'args' => $args,
\t);
\t$key = $hook_name . ':' . $value . ':' . implode( ',', array_map( 'strval', $args ) );
\tif ( array_key_exists( $key, $GLOBALS['wphx_filter_overrides'] ) ) {
\t\treturn $GLOBALS['wphx_filter_overrides'][ $key ];
\t}
\tif ( array_key_exists( $hook_name, $GLOBALS['wphx_filter_overrides'] ) ) {
\t\treturn $GLOBALS['wphx_filter_overrides'][ $hook_name ];
\t}
\treturn $value;
}

function get_bloginfo( $show = '' ) {
\t$values = array(
\t\t'name' => 'Fixture <Blog> & Co',
\t\t'description' => 'Fixture <b>Description</b> & More',
\t\t'html_type' => $GLOBALS['wphx_html_type'] ?? 'application/xhtml+xml',
\t\t'url' => 'https://example.test/site?x=1&y=2',
\t);
\treturn array_key_exists( $show, $values ) ? $values[ $show ] : 'Fixture Unknown';
}

function convert_chars( $value ) {
\treturn str_replace( '&', '&amp;', (string) $value );
}

function __( $message ) {
\treturn $message;
}

function _deprecated_argument( $function_name, $version, $message = null ) {
\t$GLOBALS['wphx_deprecated_log'][] = array(
\t\t'function' => $function_name,
\t\t'version' => $version,
\t\t'message' => $message,
\t);
}

function wp_get_document_title() {
\treturn 'Fixture Document Title';
}

function get_the_title( $post = 0 ) {
\treturn 'Title #' . (string) $post . ' <Raw>';
}

function get_the_content() {
\treturn 'Before ]]> After';
}

function get_the_excerpt() {
\treturn 'Fixture Excerpt <Raw>';
}

function get_permalink() {
\treturn 'https://example.test/post?a=1&b=2';
}

function get_comments_link() {
\treturn 'https://example.test/post#comments?raw=1&x=2';
}

function get_comment( $comment_id = null ) {
\tif ( 'missing' === $comment_id ) {
\t\treturn null;
\t}
\treturn (object) array(
\t\t'comment_post_ID' => 45,
\t\t'comment_ID' => 901,
\t);
}

function get_the_guid( $post_id ) {
\treturn 'post-guid-' . (string) $post_id;
}

function get_comment_link( $comment = null ) {
\treturn 'https://example.test/comment/' . ( null === $comment ? 'current' : (string) $comment ) . '?a=1&b=2';
}

function get_comment_author() {
\treturn 'Fixture Author <Raw>';
}

function get_comment_text() {
\treturn 'Fixture Comment <Raw>';
}

function get_site_icon_url( $size = 512 ) {
\treturn $GLOBALS['wphx_site_icon_url'] ?? 'https://example.test/icon.png?a=1&b=2';
}

function esc_url( $url ) {
\treturn str_replace( '&', '&amp;', (string) $url );
}

require $shell;

function wphx_case( $id, $overrides, $callback ) {
\t$GLOBALS['wphx_filter_log'] = array();
\t$GLOBALS['wphx_filter_overrides'] = $overrides;
\t$GLOBALS['wphx_deprecated_log'] = array();
\t$GLOBALS['wphx_site_icon_url'] = 'https://example.test/icon.png?a=1&b=2';
\t$GLOBALS['wphx_html_type'] = 'application/xhtml+xml';
\tob_start();
\t$value = $callback();
\t$output = ob_get_clean();
\treturn array(
\t\t'id' => $id,
\t\t'value' => $value,
\t\t'output' => $output,
\t\t'filters' => $GLOBALS['wphx_filter_log'],
\t\t'deprecated' => $GLOBALS['wphx_deprecated_log'],
\t);
}

$cases = array();
$cases[] = wphx_case( 'bloginfo-rss:name', array(), function () {
\treturn get_bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'bloginfo-rss:description', array(), function () {
\treturn get_bloginfo_rss( 'description' );
} );
$cases[] = wphx_case( 'bloginfo-rss:filtered', array( 'get_bloginfo_rss' => 'Filtered Blog' ), function () {
\treturn get_bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'bloginfo-rss:display', array(), function () {
\treturn bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'bloginfo-rss:display-filtered', array( 'bloginfo_rss' => 'Display Blog' ), function () {
\treturn bloginfo_rss( 'name' );
} );
$cases[] = wphx_case( 'default-feed:default', array(), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'default-feed:rss-normalized', array( 'default_feed' => 'rss' ), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'default-feed:atom-filter', array( 'default_feed' => 'atom' ), function () {
\treturn get_default_feed();
} );
$cases[] = wphx_case( 'wp-title-rss:default', array(), function () {
\treturn get_wp_title_rss();
} );
$cases[] = wphx_case( 'wp-title-rss:deprecated-argument', array(), function () {
\treturn get_wp_title_rss( '-' );
} );
$cases[] = wphx_case( 'wp-title-rss:filtered', array( 'get_wp_title_rss' => 'Filtered Document Title' ), function () {
\treturn get_wp_title_rss();
} );
$cases[] = wphx_case( 'wp-title-rss:display', array(), function () {
\treturn wp_title_rss();
} );
$cases[] = wphx_case( 'wp-title-rss:display-deprecated-argument', array(), function () {
\treturn wp_title_rss( '-' );
} );
$cases[] = wphx_case( 'wp-title-rss:display-filtered', array( 'wp_title_rss' => 'Displayed Document Title' ), function () {
\treturn wp_title_rss();
} );
$cases[] = wphx_case( 'feed-content-type:empty-uses-default', array( 'default_feed' => 'atom' ), function () {
\treturn feed_content_type( '' );
} );
$cases[] = wphx_case( 'feed-content-type:zero-uses-default', array( 'default_feed' => 'rss-http' ), function () {
\treturn feed_content_type( '0' );
} );
$cases[] = wphx_case( 'feed-content-type:rss-http', array(), function () {
\treturn feed_content_type( 'rss-http' );
} );
$cases[] = wphx_case( 'feed-content-type:unknown', array(), function () {
\treturn feed_content_type( 'custom' );
} );
$cases[] = wphx_case( 'feed-content-type:filtered', array( 'feed_content_type:application/atom+xml:atom' => 'custom/atom' ), function () {
\treturn feed_content_type( 'atom' );
} );
$cases[] = wphx_case( 'title-rss:default', array(), function () {
\treturn get_the_title_rss();
} );
$cases[] = wphx_case( 'title-rss:post', array(), function () {
\treturn get_the_title_rss( 7 );
} );
$cases[] = wphx_case( 'title-rss:filtered', array( 'the_title_rss' => 'Filtered Title' ), function () {
\treturn get_the_title_rss( 7 );
} );
$cases[] = wphx_case( 'title-rss:display', array(), function () {
\treturn the_title_rss();
} );
$cases[] = wphx_case( 'title-rss:display-filtered', array( 'the_title_rss' => 'Displayed Title' ), function () {
\treturn the_title_rss();
} );
$cases[] = wphx_case( 'excerpt-rss:display', array(), function () {
\treturn the_excerpt_rss();
} );
$cases[] = wphx_case( 'excerpt-rss:display-filtered', array( 'the_excerpt_rss' => 'Displayed Excerpt' ), function () {
\treturn the_excerpt_rss();
} );
$cases[] = wphx_case( 'permalink-rss:display', array(), function () {
\treturn the_permalink_rss();
} );
$cases[] = wphx_case( 'permalink-rss:display-filtered', array( 'the_permalink_rss' => 'https://filtered.test/post?x=1&y=2' ), function () {
\treturn the_permalink_rss();
} );
$cases[] = wphx_case( 'comments-link-feed:display', array(), function () {
\treturn comments_link_feed();
} );
$cases[] = wphx_case( 'comments-link-feed:display-filtered', array( 'comments_link_feed' => 'https://filtered.test/comments?x=1&y=2' ), function () {
\treturn comments_link_feed();
} );
$cases[] = wphx_case( 'comment-guid:get-default', array(), function () {
\treturn get_comment_guid();
} );
$cases[] = wphx_case( 'comment-guid:get-missing', array(), function () {
\treturn get_comment_guid( 'missing' );
} );
$cases[] = wphx_case( 'comment-guid:display-default', array(), function () {
\treturn comment_guid();
} );
$cases[] = wphx_case( 'comment-guid:display-missing', array(), function () {
\treturn comment_guid( 'missing' );
} );
$cases[] = wphx_case( 'comment-link:display-default', array(), function () {
\treturn comment_link();
} );
$cases[] = wphx_case( 'comment-link:display-explicit', array(), function () {
\treturn comment_link( 17 );
} );
$cases[] = wphx_case( 'comment-link:display-filtered', array( 'comment_link' => 'https://filtered.test/comment?x=1&y=2' ), function () {
\treturn comment_link();
} );
$cases[] = wphx_case( 'comment-author-rss:get', array(), function () {
\treturn get_comment_author_rss();
} );
$cases[] = wphx_case( 'comment-author-rss:get-filtered', array( 'comment_author_rss' => 'Filtered Author' ), function () {
\treturn get_comment_author_rss();
} );
$cases[] = wphx_case( 'comment-author-rss:display-filtered', array( 'comment_author_rss' => 'Displayed Author' ), function () {
\treturn comment_author_rss();
} );
$cases[] = wphx_case( 'comment-text-rss:display', array(), function () {
\treturn comment_text_rss();
} );
$cases[] = wphx_case( 'comment-text-rss:display-filtered', array( 'comment_text_rss' => 'Displayed Comment' ), function () {
\treturn comment_text_rss();
} );
$cases[] = wphx_case( 'content-feed:default-feed', array( 'default_feed' => 'atom' ), function () {
\treturn get_the_content_feed();
} );
$cases[] = wphx_case( 'content-feed:zero-uses-default', array( 'default_feed' => 'rss-http' ), function () {
\treturn get_the_content_feed( '0' );
} );
$cases[] = wphx_case( 'content-feed:explicit-type', array(), function () {
\treturn get_the_content_feed( 'rdf' );
} );
$cases[] = wphx_case( 'content-feed:content-filtered', array( 'the_content' => 'Filtered ]]> Content' ), function () {
\treturn get_the_content_feed( 'rss2' );
} );
$cases[] = wphx_case( 'content-feed:feed-filtered', array( 'the_content_feed' => 'Filtered Feed Content' ), function () {
\treturn get_the_content_feed( 'atom' );
} );
$cases[] = wphx_case( 'content-feed:display', array(), function () {
\treturn the_content_feed( 'rdf' );
} );
$cases[] = wphx_case( 'content-feed:display-filtered', array( 'the_content_feed' => 'Displayed Feed Content' ), function () {
\treturn the_content_feed( 'atom' );
} );
$cases[] = wphx_case( 'html-type-rss:xhtml', array(), function () {
\treturn html_type_rss();
} );
$cases[] = wphx_case( 'html-type-rss:html', array(), function () {
\t$GLOBALS['wphx_html_type'] = 'text/html';
\treturn html_type_rss();
} );
$cases[] = wphx_case( 'atom-site-icon:display', array(), function () {
\treturn atom_site_icon();
} );
$cases[] = wphx_case( 'atom-site-icon:empty', array(), function () {
\t$GLOBALS['wphx_site_icon_url'] = '';
\treturn atom_site_icon();
} );
$cases[] = wphx_case( 'rss2-site-icon:display', array(), function () {
\treturn rss2_site_icon();
} );
$cases[] = wphx_case( 'rss2-site-icon:title-fallback', array( 'get_wp_title_rss' => '' ), function () {
\treturn rss2_site_icon();
} );
$cases[] = wphx_case( 'rss2-site-icon:empty', array(), function () {
\t$GLOBALS['wphx_site_icon_url'] = '';
\treturn rss2_site_icon();
} );

$reflection = array();
foreach ( array( 'get_bloginfo_rss', 'bloginfo_rss', 'get_default_feed', 'get_wp_title_rss', 'wp_title_rss', 'get_the_title_rss', 'the_title_rss', 'the_excerpt_rss', 'the_permalink_rss', 'comments_link_feed', 'comment_guid', 'get_comment_guid', 'comment_link', 'get_comment_author_rss', 'comment_author_rss', 'comment_text_rss', 'get_the_content_feed', 'the_content_feed', 'feed_content_type', 'html_type_rss', 'atom_site_icon', 'rss2_site_icon' ) as $function_name ) {
\t$function = new ReflectionFunction( $function_name );
\t$params = array();
\tforeach ( $function->getParameters() as $parameter ) {
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
\t$reflection[ $function_name ] = array(
\t\t'name' => $function->getName(),
\t\t'numberOfParameters' => $function->getNumberOfParameters(),
\t\t'numberOfRequiredParameters' => $function->getNumberOfRequiredParameters(),
\t\t'returnsReference' => $function->returnsReference(),
\t\t'hasReturnType' => $function->hasReturnType(),
\t\t'parameters' => $params,
\t);
}

echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'cases' => $cases,
\t\t'reflection' => $reflection,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`;
}

function normalizeProbe(result) {
  return {
    cases: result.cases,
    reflection: result.reflection
  };
}

function assertJsonEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected ${label}:\nactual=${JSON.stringify(actual, null, 2)}\nexpected=${JSON.stringify(expected, null, 2)}`);
  }
}

function main() {
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(dirname(ORACLE_SHELL), { recursive: true });
  writeFileSync(ORACLE_SHELL, oracleSource());
  writeFileSync(PROBE, probeSource());

  run("haxe", [IMPL_HXML]);
  run("haxe", [SHELL_HXML]);
  const oracleLint = run("php", ["-l", ORACLE_SHELL]).trim();
  const generatedLint = run("php", ["-l", GENERATED_SHELL]).trim();
  const generatedSource = readFileSync(GENERATED_SHELL, "utf8");
  const missingPatterns = EXACT_PATTERNS.filter((pattern) => !generatedSource.includes(pattern));
  if (missingPatterns.length > 0) {
    throw new Error(`Generated feed module shell is missing exact patterns: ${JSON.stringify(missingPatterns)}`);
  }

  const oracle = JSON.parse(run("php", [PROBE, "oracle", ORACLE_SHELL]));
  const generated = JSON.parse(run("php", [PROBE, "generated", GENERATED_SHELL]));
  assertJsonEqual(normalizeProbe(generated), normalizeProbe(oracle), "feed module oracle/candidate probe");

  const emissionManifest = JSON.parse(readFileSync(EMISSION_MANIFEST, "utf8"));
  const declarations = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => `${file.path}:${entry.kind}:${entry.name}`)).sort();
  const expectedDeclarations = [
    "wp-includes/feed.php:global-function:atom_site_icon",
    "wp-includes/feed.php:global-function:bloginfo_rss",
    "wp-includes/feed.php:global-function:comment_author_rss",
    "wp-includes/feed.php:global-function:comment_guid",
    "wp-includes/feed.php:global-function:comment_link",
    "wp-includes/feed.php:global-function:comment_text_rss",
    "wp-includes/feed.php:global-function:comments_link_feed",
    "wp-includes/feed.php:global-function:feed_content_type",
    "wp-includes/feed.php:global-function:get_bloginfo_rss",
    "wp-includes/feed.php:global-function:get_comment_author_rss",
    "wp-includes/feed.php:global-function:get_comment_guid",
    "wp-includes/feed.php:global-function:get_default_feed",
    "wp-includes/feed.php:global-function:get_the_content_feed",
    "wp-includes/feed.php:global-function:get_the_title_rss",
    "wp-includes/feed.php:global-function:get_wp_title_rss",
    "wp-includes/feed.php:global-function:html_type_rss",
    "wp-includes/feed.php:global-function:rss2_site_icon",
    "wp-includes/feed.php:global-function:the_content_feed",
    "wp-includes/feed.php:global-function:the_excerpt_rss",
    "wp-includes/feed.php:global-function:the_permalink_rss",
    "wp-includes/feed.php:global-function:the_title_rss",
    "wp-includes/feed.php:global-function:wp_title_rss"
  ];
  assertJsonEqual(declarations, expectedDeclarations, "feed module declarations");
  if ((emissionManifest.unsupported ?? []).length !== 0) {
    throw new Error(`Unexpected unsupported constructs: ${JSON.stringify(emissionManifest.unsupported)}`);
  }
  const guardedValues = emissionManifest.files.flatMap((file) => file.declarations.map((entry) => entry.guarded));
  if (guardedValues.some(Boolean)) {
    throw new Error(`Feed module functions must be unguarded WordPress module declarations: ${JSON.stringify(guardedValues)}`);
  }

  const manifest = {
    schema: "wphx.wphx-php-feed-module-functions.v1",
    issue: ISSUE,
    continuation_issue: CONTINUATION_ISSUE,
    generated_at: RECORDED_AT,
    generator: RUNNER,
    evidence_class: "module_function_original_path_adapter",
    artifact_scope: "selected_wphx_312_04_feed_module_functions",
    inputs: [IMPL_HXML, SHELL_HXML, ...SOURCE_FILES].map(inputRecord),
    upstream_oracle: {
      repo_path: "../wordpress-develop/src/wp-includes/feed.php",
      selected_symbols: [
        "get_bloginfo_rss",
        "bloginfo_rss",
        "get_default_feed",
        "get_wp_title_rss",
        "wp_title_rss",
        "get_the_title_rss",
        "the_title_rss",
        "the_excerpt_rss",
        "the_permalink_rss",
        "comments_link_feed",
        "comment_guid",
        "get_comment_guid",
        "comment_link",
        "get_comment_author_rss",
        "comment_author_rss",
        "comment_text_rss",
        "get_the_content_feed",
        "the_content_feed",
        "feed_content_type",
        "html_type_rss",
        "atom_site_icon",
        "rss2_site_icon"
      ],
      selected_source_lines: ["27-41", "56-68", "80-91", "103-119", "129-147", "158-169", "176-178", "227-237", "244-253", "260-270", "279-299", "309-320", "329-349", "356-367", "190-209", "218-220", "768-791", "451-459", "632-637", "644-661"]
    },
    generated_shell: {
      path: GENERATED_SHELL,
      bytes: statSync(GENERATED_SHELL).size,
      sha256: sha256File(GENERATED_SHELL),
      php_lint: "passed",
      php_lint_output: generatedLint,
      exact_patterns: EXACT_PATTERNS
    },
    oracle_shell: {
      path: ORACLE_SHELL,
      bytes: statSync(ORACLE_SHELL).size,
      sha256: sha256File(ORACLE_SHELL),
      php_lint: "passed",
      php_lint_output: oracleLint
    },
    emission_manifest: {
      path: EMISSION_MANIFEST,
      bytes: statSync(EMISSION_MANIFEST).size,
      sha256: sha256File(EMISSION_MANIFEST),
      declarations,
      unsupported: emissionManifest.unsupported,
      core_ir_features: emissionManifest.core_ir_features,
      segment_plans: emissionManifest.segment_plans,
      adapter_templates: emissionManifest.adapter_templates
    },
    observations: {
      oracle,
      generated,
      match: true
    },
    validation_result: {
      status: "passed",
      php_lint_passed: true,
      exact_contracts_passed: true,
      oracle_candidate_behavior_matched: true,
      reflection_abi_matched: true,
      unsupported_empty: true,
      unguarded_module_functions: true,
      original_path_feed_php: true,
      haxe_bootstrap_delegation: true
    },
    claims: [
      "WPHX PHP emits selected unguarded module-level public functions at original path wp-includes/feed.php.",
      "The generated selected getter and display feed helpers preserve reflection-visible parameters/defaults for the selected fixture.",
      "The WPHX PHP core IR emits selected public display wrappers with idiomatic PHP echo statements via @:wp.echo metadata.",
      "The generated functions delegate selected behavior to a stock Haxe PHP implementation through the WPHX PHP bootstrap while preserving native apply_filters timing at the public PHP boundary.",
      "The minimized oracle/candidate probe matches WordPress 7.0 behavior for bloginfo RSS sanitization/conversion/display, default feed normalization, feed title deprecation/filtering/display, title RSS filtering/display, excerpt display filtering, permalink/comment display URL escaping, comment GUID string-or-false behavior, comment author/text filtering/display, feed content filtering/escaping/display, feed content-type mapping, HTML type display, Atom/RSS2 site-icon output, PHP empty('0') behavior, output capture, and filter payloads."
    ],
    non_claims: [
      "This fixture does not claim full wp-includes/feed.php ownership.",
      "This fixture does not retire the WPHX-312.04 copied feed/embed/HTTPS oracle fixture.",
      "This fixture does not claim feed template rendering, installed WordPress feed behavior, remote feed/oEmbed behavior, class-wp-oembed.php, class-wp-embed.php, embed.php, https-detection.php, or https-migration.php ownership.",
      "This fixture does not claim arbitrary module-function lowering beyond the selected original-path feed helpers."
    ]
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const receipt = {
    schema: "wphx.compiler-receipt.v1",
    id: "receipt:wphx-comp-php-module-function-adapters",
    issue: ISSUE,
    continuation_issue: CONTINUATION_ISSUE,
    recorded_at: RECORDED_AT,
    status: "passed",
    evidence_class: "module_function_original_path_adapter",
    artifact_scope: "selected_wphx_312_04_feed_module_functions",
    commands: ["npm run wphx:php:feed-module-functions", "npm run wphx:php:feed-module-functions:check"],
    artifacts: [
      { path: RUNNER, role: "deterministic feed module function adapter runner" },
      { path: SHELL_HXML, role: "WPHX PHP original-path feed module shell hxml" },
      { path: IMPL_HXML, role: "stock Haxe PHP feed helper implementation hxml" },
      { path: "fixtures/wphx-php/src/wphx/fixtures/compiler/php/feed/FeedModuleSurface.hx", role: "typed Haxe public feed.php module-function shell metadata" },
      { path: "fixtures/wphx-php/src/wphx/fixtures/php/feed/FeedKernel.hx", role: "typed Haxe feed helper behavior" },
      { path: MANIFEST, role: "feed module function adapter manifest" }
    ],
    manifest_sha256: sha256(manifestText),
    claims: manifest.claims,
    non_claims: manifest.non_claims
  };

  writeOrCheck(MANIFEST, manifestText);
  writeOrCheck(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        manifest: MANIFEST,
        receipt: RECEIPT,
        generated_shell: GENERATED_SHELL,
        selected_symbols: manifest.upstream_oracle.selected_symbols
      },
      null,
      2
    )
  );
}

main();
