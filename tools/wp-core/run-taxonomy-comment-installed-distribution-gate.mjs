#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.15.2",
  external_ref: "WPHX-308.09",
  title: "WPHX-308.09 — Add installed-distribution taxonomy/comment behavior gate"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const BUILD_ROOT = "build/wp-core/wphx-308-09";
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const ROUTER = "wphx-taxonomy-comment-installed-router.php";
const OUT = "manifests/wp-core/wphx-308-09-taxonomy-comment-installed-distribution.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-308-09-taxonomy-comment-installed-distribution.v1.json";
const RECEIPT = "receipts/wp-core/wphx-308-09-taxonomy-comment-installed-distribution.v1.json";
const RUNNER = "tools/wp-core/run-taxonomy-comment-installed-distribution-gate.mjs";

const HAXE_OUTPUTS = ["build/wp-core/wphx-308-02/haxe"];
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-308-01-taxonomy-comments-surface.v1.json",
  "manifests/wp-core/wphx-308-02-taxonomy-comment-adapter-contract-candidate.v1.json",
  "manifests/wp-core/wphx-308-03-taxonomy-comment-crud-fixture.v1.json",
  "manifests/wp-core/wphx-308-04-taxonomy-comment-count-cache-fixture.v1.json",
  "manifests/wp-core/wphx-308-05-taxonomy-comment-query-state-fixture.v1.json",
  "manifests/wp-core/wphx-308-06-taxonomy-comment-live-db-fixture.v1.json"
];
const SOURCE_FILES = [
  "src/wp-includes/taxonomy.php",
  "src/wp-includes/class-wp-taxonomy.php",
  "src/wp-includes/class-wp-term.php",
  "src/wp-includes/class-wp-term-query.php",
  "src/wp-includes/class-wp-tax-query.php",
  "src/wp-includes/comment.php",
  "src/wp-includes/class-wp-comment.php",
  "src/wp-includes/class-wp-comment-query.php",
  "src/wp-includes/meta.php",
  "src/wp-includes/class-wp-meta-query.php",
  "src/wp-includes/class-wp-date-query.php"
];
const CASES = [
  { id: "boundary:taxonomy-comment-package", method: "GET", path: "/__wphx/package-boundary", focus: "taxonomy/comment source files are present and candidate Haxe adapter-contract artifacts are attached" },
  { id: "admin:register-taxonomy", method: "POST", path: "/wp-admin/edit-tags.php?action=register", body: "taxonomy=topic&object_type=post&hierarchical=1&show_in_rest=1", focus: "installed-style taxonomy registration records visibility, hierarchy, REST exposure, and hook observations" },
  { id: "admin:insert-term", method: "POST", path: "/wp-admin/term.php?action=insert", body: "taxonomy=category&name=Alpha%20Topic&slug=alpha-topic&parent=7", focus: "term insert route records parent hierarchy and cache cleanup intent" },
  { id: "admin:update-term-meta", method: "POST", path: "/wp-admin/term.php?action=meta", body: "term_id=11&meta_key=color&meta_value=blue", focus: "term metadata update is visible through installed HTTP route and meta cache observations" },
  { id: "admin:assign-object-terms", method: "POST", path: "/wp-admin/term.php?action=assign", body: "object_id=101&taxonomy=category&term_ids=11,12", focus: "object-term assignment updates relationships, counts, and cache intent observations" },
  { id: "comments:insert-pending", method: "POST", path: "/wp-comments-post.php", body: "comment_post_ID=101&comment_author=Reader&comment_content=Needs%20review&comment_approved=0", focus: "front comment submission records pending moderation state" },
  { id: "admin:approve-comment", method: "POST", path: "/wp-admin/comment.php?action=status", body: "comment_ID=501&comment_approved=1", focus: "comment status transition records moderation hooks and count/cache observations" },
  { id: "admin:update-comment-meta", method: "POST", path: "/wp-admin/comment.php?action=meta", body: "comment_ID=501&meta_key=mood&meta_value=curious", focus: "comment metadata update is visible through installed HTTP route and meta cache observations" },
  { id: "front:taxonomy-query", method: "GET", path: "/?taxonomy=category&term=alpha-topic", focus: "front-end taxonomy filter returns matching published posts with term query observations" },
  { id: "front:comment-query", method: "GET", path: "/?comment_status=approve&post_id=101", focus: "front-end comment query observes moderation status and post filtering" }
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
  return {
    path,
    bytes: statSync(path).size,
    sha256: sha256File(path)
  };
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
    const contractDir = `${root}/lib/wphx/wp/taxonomy`;
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

$GLOBALS['wphx_308_09_mode'] = '${mode}';
$GLOBALS['wphx_308_09_actions'] = array();
$GLOBALS['wphx_308_09_cache'] = array();
$GLOBALS['wphx_308_09_taxonomies'] = array(
\t'category' => array( 'name' => 'category', 'object_type' => array( 'post' ), 'hierarchical' => true, 'show_in_rest' => true, 'public' => true ),
);
$GLOBALS['wphx_308_09_terms'] = array(
\t11 => array( 'term_id' => 11, 'taxonomy' => 'category', 'name' => 'Alpha Topic', 'slug' => 'alpha-topic', 'parent' => 7, 'count' => 1 ),
\t12 => array( 'term_id' => 12, 'taxonomy' => 'category', 'name' => 'Beta Topic', 'slug' => 'beta-topic', 'parent' => 0, 'count' => 0 ),
);
$GLOBALS['wphx_308_09_term_meta'] = array(
\t11 => array( 'color' => array( 'blue' ) ),
);
$GLOBALS['wphx_308_09_relationships'] = array(
\t101 => array( 'category' => array( 11 ) ),
);
$GLOBALS['wphx_308_09_posts'] = array(
\t101 => array( 'ID' => 101, 'post_title' => 'Alpha Post', 'post_status' => 'publish' ),
\t102 => array( 'ID' => 102, 'post_title' => 'Beta Draft', 'post_status' => 'draft' ),
\t103 => array( 'ID' => 103, 'post_title' => 'Beta Post', 'post_status' => 'publish' ),
);
$GLOBALS['wphx_308_09_comments'] = array(
\t501 => array( 'comment_ID' => 501, 'comment_post_ID' => 101, 'comment_author' => 'Admin', 'comment_content' => 'Approved seed', 'comment_approved' => '1', 'comment_type' => 'comment' ),
\t502 => array( 'comment_ID' => 502, 'comment_post_ID' => 101, 'comment_author' => 'Queue', 'comment_content' => 'Pending seed', 'comment_approved' => '0', 'comment_type' => 'comment' ),
);
$GLOBALS['wphx_308_09_comment_meta'] = array();

function wphx_308_09_action( $hook, $payload = array() ) {
\t$GLOBALS['wphx_308_09_actions'][] = array( 'hook' => $hook, 'payload' => $payload );
}

function wphx_308_09_json( $status, $payload ) {
\thttp_response_code( $status );
\theader( 'Content-Type: application/json' );
\t$payload['actions'] = array_column( $GLOBALS['wphx_308_09_actions'], 'hook' );
\t$payload['cache'] = array_values( array_unique( $GLOBALS['wphx_308_09_cache'] ) );
\techo json_encode( $payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
\texit;
}

function wphx_308_09_register_taxonomy( $data ) {
\t$name = (string) ( $data['taxonomy'] ?? 'topic' );
\t$GLOBALS['wphx_308_09_taxonomies'][ $name ] = array(
\t\t'name' => $name,
\t\t'object_type' => array_filter( explode( ',', (string) ( $data['object_type'] ?? 'post' ) ) ),
\t\t'hierarchical' => '1' === (string) ( $data['hierarchical'] ?? '0' ),
\t\t'show_in_rest' => '1' === (string) ( $data['show_in_rest'] ?? '0' ),
\t\t'public' => true,
\t);
\twphx_308_09_action( 'registered_taxonomy', array( 'taxonomy' => $name ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'taxonomy:' . $name;
\treturn $GLOBALS['wphx_308_09_taxonomies'][ $name ];
}

function wphx_308_09_insert_term( $data ) {
\t$id = 21;
\t$GLOBALS['wphx_308_09_terms'][ $id ] = array(
\t\t'term_id' => $id,
\t\t'taxonomy' => (string) ( $data['taxonomy'] ?? 'category' ),
\t\t'name' => (string) ( $data['name'] ?? '' ),
\t\t'slug' => (string) ( $data['slug'] ?? '' ),
\t\t'parent' => (int) ( $data['parent'] ?? 0 ),
\t\t'count' => 0,
\t);
\twphx_308_09_action( 'created_term', array( 'term_id' => $id ) );
\twphx_308_09_action( 'created_' . $GLOBALS['wphx_308_09_terms'][ $id ]['taxonomy'], array( 'term_id' => $id ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'term:' . $id;
\t$GLOBALS['wphx_308_09_cache'][] = 'terms:last_changed';
\treturn $GLOBALS['wphx_308_09_terms'][ $id ];
}

function wphx_308_09_update_term_meta( $term_id, $key, $value ) {
\t$GLOBALS['wphx_308_09_term_meta'][ $term_id ][ $key ] = array( $value );
\twphx_308_09_action( 'updated_term_meta', array( 'term_id' => $term_id, 'meta_key' => $key ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'term_meta:' . $term_id;
\treturn array( 'term_id' => $term_id, 'meta_key' => $key, 'values' => $GLOBALS['wphx_308_09_term_meta'][ $term_id ][ $key ] );
}

function wphx_308_09_recount_terms( $taxonomy ) {
\tforeach ( $GLOBALS['wphx_308_09_terms'] as $id => $term ) {
\t\tif ( $taxonomy !== $term['taxonomy'] ) {
\t\t\tcontinue;
\t\t}
\t\t$count = 0;
\t\tforeach ( $GLOBALS['wphx_308_09_relationships'] as $taxonomies ) {
\t\t\t$count += in_array( $id, $taxonomies[ $taxonomy ] ?? array(), true ) ? 1 : 0;
\t\t}
\t\t$GLOBALS['wphx_308_09_terms'][ $id ]['count'] = $count;
\t}
}

function wphx_308_09_assign_terms( $data ) {
\t$object_id = (int) ( $data['object_id'] ?? 0 );
\t$taxonomy = (string) ( $data['taxonomy'] ?? 'category' );
\t$term_ids = array_values( array_filter( array_map( 'intval', explode( ',', (string) ( $data['term_ids'] ?? '' ) ) ) ) );
\t$GLOBALS['wphx_308_09_relationships'][ $object_id ][ $taxonomy ] = $term_ids;
\twphx_308_09_recount_terms( $taxonomy );
\twphx_308_09_action( 'set_object_terms', array( 'object_id' => $object_id, 'taxonomy' => $taxonomy, 'terms' => $term_ids ) );
\twphx_308_09_action( 'edited_terms', array( 'object_id' => $object_id, 'taxonomy' => $taxonomy ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'object_terms:' . $object_id;
\t$GLOBALS['wphx_308_09_cache'][] = 'term_counts:' . $taxonomy;
\treturn array(
\t\t'object_id' => $object_id,
\t\t'taxonomy' => $taxonomy,
\t\t'term_ids' => $term_ids,
\t\t'term_counts' => array_map( fn( $term ) => $term['count'], array_filter( $GLOBALS['wphx_308_09_terms'], fn( $term ) => $taxonomy === $term['taxonomy'] ) ),
\t);
}

function wphx_308_09_insert_comment( $data ) {
\t$id = 601;
\t$GLOBALS['wphx_308_09_comments'][ $id ] = array(
\t\t'comment_ID' => $id,
\t\t'comment_post_ID' => (int) ( $data['comment_post_ID'] ?? 0 ),
\t\t'comment_author' => (string) ( $data['comment_author'] ?? '' ),
\t\t'comment_content' => (string) ( $data['comment_content'] ?? '' ),
\t\t'comment_approved' => (string) ( $data['comment_approved'] ?? '0' ),
\t\t'comment_type' => 'comment',
\t);
\twphx_308_09_action( 'wp_insert_comment', array( 'comment_ID' => $id ) );
\twphx_308_09_action( 'comment_post', array( 'comment_ID' => $id, 'approved' => $GLOBALS['wphx_308_09_comments'][ $id ]['comment_approved'] ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'comment:' . $id;
\t$GLOBALS['wphx_308_09_cache'][] = 'comment_count:' . $GLOBALS['wphx_308_09_comments'][ $id ]['comment_post_ID'];
\treturn $GLOBALS['wphx_308_09_comments'][ $id ];
}

function wphx_308_09_update_comment_status( $comment_id, $approved ) {
\t$old = $GLOBALS['wphx_308_09_comments'][ $comment_id ]['comment_approved'] ?? '0';
\t$GLOBALS['wphx_308_09_comments'][ $comment_id ]['comment_approved'] = (string) $approved;
\twphx_308_09_action( 'transition_comment_status', array( 'old' => $old, 'new' => (string) $approved, 'comment_ID' => $comment_id ) );
\twphx_308_09_action( 'wp_set_comment_status', array( 'comment_ID' => $comment_id, 'status' => (string) $approved ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'comment:' . $comment_id;
\t$GLOBALS['wphx_308_09_cache'][] = 'comments:last_changed';
\treturn $GLOBALS['wphx_308_09_comments'][ $comment_id ];
}

function wphx_308_09_update_comment_meta( $comment_id, $key, $value ) {
\t$GLOBALS['wphx_308_09_comment_meta'][ $comment_id ][ $key ] = array( $value );
\twphx_308_09_action( 'updated_comment_meta', array( 'comment_ID' => $comment_id, 'meta_key' => $key ) );
\t$GLOBALS['wphx_308_09_cache'][] = 'comment_meta:' . $comment_id;
\treturn array( 'comment_ID' => $comment_id, 'meta_key' => $key, 'values' => $GLOBALS['wphx_308_09_comment_meta'][ $comment_id ][ $key ] );
}

function wphx_308_09_query_posts_by_term( $query ) {
\t$taxonomy = (string) ( $query['taxonomy'] ?? 'category' );
\t$slug = (string) ( $query['term'] ?? '' );
\t$term_ids = array_keys( array_filter( $GLOBALS['wphx_308_09_terms'], fn( $term ) => $taxonomy === $term['taxonomy'] && $slug === $term['slug'] ) );
\t$posts = array();
\tforeach ( $GLOBALS['wphx_308_09_relationships'] as $object_id => $taxonomies ) {
\t\tif ( count( array_intersect( $term_ids, $taxonomies[ $taxonomy ] ?? array() ) ) > 0 && 'publish' === ( $GLOBALS['wphx_308_09_posts'][ $object_id ]['post_status'] ?? '' ) ) {
\t\t\t$posts[] = $GLOBALS['wphx_308_09_posts'][ $object_id ];
\t\t}
\t}
\tusort( $posts, fn( $a, $b ) => $a['ID'] <=> $b['ID'] );
\twphx_308_09_action( 'parse_tax_query', array( 'taxonomy' => $taxonomy, 'term' => $slug ) );
\twphx_308_09_action( 'pre_get_posts', array_keys( $query ) );
\treturn array(
\t\t'ids' => array_map( fn( $post ) => $post['ID'], $posts ),
\t\t'titles' => array_map( fn( $post ) => $post['post_title'], $posts ),
\t\t'found_posts' => count( $posts ),
\t\t'query_vars' => $query,
\t\t'sql_shape' => array( 'join' => 'term_relationships+term_taxonomy+terms', 'where' => 'taxonomy+slug+publish' ),
\t);
}

function wphx_308_09_query_comments( $query ) {
\t$status = (string) ( $query['comment_status'] ?? '1' );
\t$post_id = isset( $query['post_id'] ) ? (int) $query['post_id'] : null;
\t$comments = array_values( array_filter( $GLOBALS['wphx_308_09_comments'], fn( $comment ) => $status === (string) $comment['comment_approved'] && ( null === $post_id || $post_id === (int) $comment['comment_post_ID'] ) ) );
\tusort( $comments, fn( $a, $b ) => $a['comment_ID'] <=> $b['comment_ID'] );
\twphx_308_09_action( 'pre_get_comments', array_keys( $query ) );
\twphx_308_09_action( 'comments_clauses', array( 'status' => $status, 'post_id' => $post_id ) );
\treturn array(
\t\t'ids' => array_map( fn( $comment ) => $comment['comment_ID'], $comments ),
\t\t'authors' => array_map( fn( $comment ) => $comment['comment_author'], $comments ),
\t\t'found_comments' => count( $comments ),
\t\t'query_vars' => $query,
\t\t'sql_shape' => array( 'where' => 'comment_approved+comment_post_ID', 'orderby' => 'comment_ID ASC' ),
\t);
}

function wphx_308_09_boundary() {
\t$source_files = array( 'wp-includes/taxonomy.php', 'wp-includes/class-wp-taxonomy.php', 'wp-includes/class-wp-term.php', 'wp-includes/class-wp-term-query.php', 'wp-includes/class-wp-tax-query.php', 'wp-includes/comment.php', 'wp-includes/class-wp-comment.php', 'wp-includes/class-wp-comment-query.php', 'wp-includes/meta.php', 'wp-includes/class-wp-meta-query.php', 'wp-includes/class-wp-date-query.php' );
\t$files = array();
\tforeach ( $source_files as $file ) {
\t\t$files[ $file ] = array( 'present' => file_exists( __DIR__ . '/' . $file ), 'sha1' => file_exists( __DIR__ . '/' . $file ) ? sha1_file( __DIR__ . '/' . $file ) : null );
\t}
\treturn array(
\t\t'mode' => $GLOBALS['wphx_308_09_mode'],
\t\t'files' => $files,
\t\t'haxe_contracts' => array(
\t\t\t'taxonomy_comment' => file_exists( __DIR__ . '/haxe-taxonomy-comment/lib/wphx/wp/taxonomy/TaxonomyCommentAdapterContract.php' ),
\t\t),
\t\t'public_php_files_are_copied_oracle_source' => true,
\t\t'generated_public_taxonomy_comment_replacement_claimed' => false,
\t);
}

if ( '/__wphx/package-boundary' === $request_path ) {
\twphx_308_09_json( 200, array( 'boundary' => wphx_308_09_boundary() ) );
}
if ( '/wp-admin/edit-tags.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\twphx_308_09_json( 200, array( 'route' => 'register-taxonomy', 'taxonomy' => wphx_308_09_register_taxonomy( $body ) ) );
}
if ( '/wp-admin/term.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\tif ( 'meta' === ( $query['action'] ?? '' ) ) {
\t\twphx_308_09_json( 200, array( 'route' => 'term-meta', 'meta' => wphx_308_09_update_term_meta( (int) $body['term_id'], $body['meta_key'] ?? '', $body['meta_value'] ?? '' ) ) );
\t}
\tif ( 'assign' === ( $query['action'] ?? '' ) ) {
\t\twphx_308_09_json( 200, array( 'route' => 'assign-object-terms', 'relationship' => wphx_308_09_assign_terms( $body ) ) );
\t}
\twphx_308_09_json( 200, array( 'route' => 'insert-term', 'term' => wphx_308_09_insert_term( $body ) ) );
}
if ( '/wp-comments-post.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\twphx_308_09_json( 200, array( 'route' => 'insert-comment', 'comment' => wphx_308_09_insert_comment( $body ) ) );
}
if ( '/wp-admin/comment.php' === $request_path && 'POST' === $_SERVER['REQUEST_METHOD'] ) {
\tparse_str( file_get_contents( 'php://input' ), $body );
\tif ( 'meta' === ( $query['action'] ?? '' ) ) {
\t\twphx_308_09_json( 200, array( 'route' => 'comment-meta', 'meta' => wphx_308_09_update_comment_meta( (int) $body['comment_ID'], $body['meta_key'] ?? '', $body['meta_value'] ?? '' ) ) );
\t}
\twphx_308_09_json( 200, array( 'route' => 'comment-status', 'comment' => wphx_308_09_update_comment_status( (int) $body['comment_ID'], $body['comment_approved'] ?? '0' ) ) );
}
if ( '/' === $request_path || '/index.php' === $request_path ) {
\tif ( isset( $query['comment_status'] ) ) {
\t\twphx_308_09_json( 200, array( 'route' => 'comment-query', 'query' => wphx_308_09_query_comments( $query ) ) );
\t}
\twphx_308_09_json( 200, array( 'route' => 'taxonomy-query', 'query' => wphx_308_09_query_posts_by_term( $query ) ) );
}
wphx_308_09_json( 404, array( 'route' => 'missing', 'path' => $request_path ) );
`
  );
}

function writePackage(root, mode) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  mirrorSources(root);
  if (mode === "candidate") {
    copyTree("build/wp-core/wphx-308-02/haxe", `${root}/haxe-taxonomy-comment`);
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
      public_php_files_are_copied_oracle_source: run.boundary.body.boundary.public_php_files_are_copied_oracle_source,
      generated_public_taxonomy_comment_replacement_claimed: run.boundary.body.boundary.generated_public_taxonomy_comment_replacement_claimed
    },
    cases: run.cases.map((testCase) => ({
      id: testCase.id,
      status: testCase.status,
      route: testCase.body.route,
      actions: testCase.body.actions,
      cache: testCase.body.cache,
      taxonomy: testCase.body.taxonomy ?? null,
      term: testCase.body.term ?? null,
      relationship: testCase.body.relationship ?? null,
      comment: testCase.body.comment ?? null,
      meta: testCase.body.meta ?? null,
      query: testCase.body.query ?? null
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
      throw new Error(`${path} is missing; run npm run wp:core:wphx-308-taxonomy-comment-installed`);
    }
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-308-taxonomy-comment-installed`);
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/taxonomy-comment-installed-distribution",
    issue: ISSUE,
    generated_at: RECORDED_AT,
    ownership: {
      kind: "packaged-distribution-installed-http-gate",
      public_contract:
        "The packaged taxonomy/comment surface must match vanilla through installed-style HTTP taxonomy registration, term CRUD/meta/object assignment, comment moderation/meta, front taxonomy query, and comment query cases while keeping public PHP replacement claims explicit."
    },
    files: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_artifacts: [OUT, OWNERSHIP, RECEIPT],
    verification: {
      commands: [
        "npm run wp:core:wphx-308-taxonomy-comment-installed",
        "npm run wp:core:wphx-308-taxonomy-comment-installed:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt: "receipt:wphx-308-09-taxonomy-comment-installed-distribution",
      manifest_sha256: manifestSha
    },
    boundaries: {
      haxe_owned_contracts: ["TaxonomyCommentAdapterContract"],
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
    if (!existsSync(root)) throw new Error(`Missing Haxe output ${root}; run the WPHX-308 adapter-contract generator first`);
  }

  writePackage(ORACLE_ROOT, "oracle");
  writePackage(CANDIDATE_ROOT, "candidate");
  const oracleLint = phpLintPackage(ORACLE_ROOT);
  const candidateLint = phpLintPackage(CANDIDATE_ROOT);
  const oracleRun = await runPackage(ORACLE_ROOT, "oracle");
  const candidateRun = await runPackage(CANDIDATE_ROOT, "candidate");
  const comparison = compareRuns(oracleRun, candidateRun);
  if (comparison.status !== "passed") {
    throw new Error(`Oracle/candidate installed taxonomy/comment comparison failed: ${JSON.stringify(comparison)}`);
  }

  const manifest = {
    schema: "wphx.wp-core-taxonomy-comment-installed-distribution.v1",
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
      generated_public_taxonomy_comment_replacement_claimed: false
    },
    fixture: {
      cases: CASES,
      transport: ["HTTP over PHP built-in server", "installed-style admin/front/comment routes", "JSON observations"]
    },
    lint: {
      oracle: oracleLint,
      candidate: candidateLint
    },
    runs: [
      {
        id: "installed-taxonomy-comment:oracle",
        mode: "oracle",
        command: oracleRun.command,
        normalized_sha256: sha256(JSON.stringify(comparableRun(oracleRun))),
        boundary: oracleRun.boundary.body.boundary,
        cases: oracleRun.cases
      },
      {
        id: "installed-taxonomy-comment:candidate",
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
        id: "generated-public-taxonomy-comment-php-replacement-deferred",
        owner: "WPHX-308/WPHX-322",
        detail:
          "This gate packages copied WordPress public PHP taxonomy/comment files and Haxe adapter-contract artifacts. It does not replace wp-includes/taxonomy.php, comment.php, WP_Term_Query, or WP_Comment_Query with generated public PHP."
      },
      {
        id: "full-database-backed-taxonomy-comment-install-deferred",
        owner: "WPHX-308/WPHX-700",
        detail:
          "This installed-style HTTP gate uses deterministic in-router taxonomy/comment state. Full database-backed installed term/comment behavior remains later distribution work."
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
      generated_public_taxonomy_comment_replacement_claimed: false,
      haxe_contracts_present: comparison.candidate_haxe_contracts
    }
  };

  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  const manifestSha = sha256(manifestText);
  const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
  const receipt = {
    schema: "wphx.verification-receipt.v1",
    id: "receipt:wphx-308-09-taxonomy-comment-installed-distribution",
    issue: ISSUE,
    recorded_at: RECORDED_AT,
    command: "npm run wp:core:wphx-308-taxonomy-comment-installed",
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "packaged_distribution",
    behavior_parity_claimed: false,
    artifacts: [
      { path: OUT, role: "taxonomy/comment installed-distribution manifest" },
      { path: OWNERSHIP, role: "taxonomy/comment installed-distribution ownership manifest" },
      { path: RUNNER, role: "installed taxonomy/comment HTTP gate generator and check-mode validator" }
    ],
    verification_commands: [
      "npm run wp:core:wphx-308-taxonomy-comment-installed",
      "npm run wp:core:wphx-308-taxonomy-comment-installed:check",
      "npm run receipts:validate",
      "npm run beads:validate"
    ],
    related_receipts: [
      "receipt:wphx-308-02-taxonomy-comment-adapter-contract-candidate",
      "receipt:wphx-308-03-taxonomy-comment-crud-fixture",
      "receipt:wphx-308-04-taxonomy-comment-count-cache-fixture",
      "receipt:wphx-308-05-taxonomy-comment-query-state-fixture",
      "receipt:wphx-308-08-taxonomy-comment-live-db-runtime-matrix"
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
