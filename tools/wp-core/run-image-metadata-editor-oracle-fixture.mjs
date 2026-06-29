#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-dno",
  external_ref: "WPHX-313.04",
  title: "WPHX-313.04 - Add image metadata/editor oracle fixture"
};
const RECORDED_AT = "2026-06-29T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-image-metadata-editor-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-313-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-313-04-image-metadata-editor-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-313-04-image-metadata-editor-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-313-04-image-metadata-editor-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-313-01-media-filesystem-upload-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-313-02-media-upload-adapter-contract-candidate.v1.json";
const UPLOAD_FIXTURE = "manifests/wp-core/wphx-313-03-media-upload-validation-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-image-editor.php",
  "src/wp-includes/class-wp-image-editor-gd.php",
  "src/wp-includes/class-wp-image-editor-imagick.php",
  "src/wp-includes/class-avif-info.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/media.php",
  "src/wp-admin/includes/image.php"
];
const COVERED_SYMBOLS = [
  "wp_get_image_editor",
  "_wp_image_editor_choose",
  "wp_image_editor_supports",
  "wp_get_image_editor_output_format",
  "image_resize_dimensions",
  "image_make_intermediate_size",
  "wp_get_registered_image_subsizes",
  "wp_get_missing_image_subsizes",
  "wp_update_image_subsizes",
  "wp_generate_attachment_metadata",
  "wp_read_image_metadata",
  "file_is_displayable_image"
];
const FIXTURE_CASES = [
  { id: "editor:no-implementation", focus: "wp_get_image_editor returns image_no_editor when no implementation is available" },
  { id: "editor:selects-filtered-fake", focus: "wp_get_image_editor honors wp_image_editors selection and loads the chosen implementation" },
  { id: "editor:method-requirement", focus: "wp_image_editor_supports enforces requested editor methods" },
  { id: "editor:output-format-default-heic", focus: "wp_get_image_editor_output_format preserves default HEIC/HEIF conversion mapping" },
  { id: "resize-dimensions:soft-and-crop", focus: "image_resize_dimensions soft-resize/crop geometry and filter calls" },
  { id: "intermediate:success", focus: "image_make_intermediate_size delegates resize/save and removes path from returned metadata" },
  { id: "intermediate:resize-error", focus: "image_make_intermediate_size returns false when editor resize returns WP_Error" },
  { id: "metadata:missing-image-subsizes", focus: "wp_get_missing_image_subsizes compares attachment metadata with registered sub-sizes" },
  { id: "metadata:non-image-missing", focus: "wp_get_missing_image_subsizes returns empty for non-image attachments" },
  { id: "metadata:update-invalid-attachment", focus: "wp_update_image_subsizes invalid_attachment error path" },
  { id: "metadata:update-no-missing", focus: "wp_update_image_subsizes returns existing metadata when all possible sizes exist" },
  { id: "metadata:generate-non-image-file", focus: "wp_generate_attachment_metadata returns filesize-only metadata for non-image local files" },
  { id: "metadata:read-missing-image", focus: "wp_read_image_metadata returns false for missing files" },
  { id: "metadata:displayable-text-file", focus: "file_is_displayable_image returns false for a non-image file" }
];

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
  const optionStub = `${root}/wp-includes/option.php`;
  mkdirSync(dirname(optionStub), { recursive: true });
  writeFileSync(
    optionStub,
    `<?php
if ( ! function_exists( 'get_option' ) ) {
function get_option( $name, $default = false ) {
\t$values = array(
\t\t'siteurl' => 'https://example.test',
\t\t'upload_path' => '',
\t\t'upload_url_path' => '',
\t\t'uploads_use_yearmonth_folders' => false,
\t\t'thumbnail_size_w' => 150,
\t\t'thumbnail_size_h' => 150,
\t\t'thumbnail_crop' => true,
\t\t'medium_size_w' => 300,
\t\t'medium_size_h' => 300,
\t\t'medium_crop' => false,
\t\t'medium_large_size_w' => 768,
\t\t'medium_large_size_h' => 0,
\t\t'medium_large_crop' => false,
\t\t'large_size_w' => 1024,
\t\t'large_size_h' => 1024,
\t\t'large_crop' => false,
\t);
\treturn array_key_exists( $name, $values ) ? $values[ $name ] : $default;
}
}
if ( ! function_exists( 'get_site_option' ) ) {
function get_site_option( $name, $default = false ) {
\treturn $default;
}
}
`
  );
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_CONTENT_URL', 'https://example.test/wp-content' );
define( 'DAY_IN_SECONDS', 86400 );
if ( ! defined( 'IMAGETYPE_AVIF' ) ) {
\tdefine( 'IMAGETYPE_AVIF', 19 );
}

$GLOBALS['wphx_313_04_filters'] = array();
$GLOBALS['wphx_313_04_errors'] = array();
$GLOBALS['wphx_313_04_cache'] = array();
$GLOBALS['wphx_313_04_fake_editor_enabled'] = false;
$GLOBALS['wphx_313_04_fake_editor_mode'] = array();
$GLOBALS['wphx_313_04_fake_editor_calls'] = array();
$GLOBALS['wphx_313_04_posts'] = array();
$GLOBALS['wphx_313_04_attachment_is_image'] = array();
$GLOBALS['wphx_313_04_attachment_metadata'] = array();
$GLOBALS['wphx_313_04_original_paths'] = array();
$GLOBALS['_wp_additional_image_sizes'] = array(
\t'wphx_large_only' => array( 'width' => 1600, 'height' => 1600, 'crop' => false ),
);

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_313_04_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

function __( $text ) { return $text; }
function _x( $text ) { return $text; }
function current_user_can( $capability ) { return false; }
function user_can( $user, $capability ) { return false; }
function is_multisite() { return false; }
function ms_is_switched() { return false; }
function get_current_blog_id() { return 1; }
function get_locale() { return 'en_US'; }

require ABSPATH . WPINC . '/option.php';

function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_313_04_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( 'wp_image_editors' === $hook_name ) {
\t\treturn $GLOBALS['wphx_313_04_fake_editor_enabled'] ? array( 'WPHX_313_04_Fake_Image_Editor' ) : array();
\t}
\treturn $value;
}

function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_313_04_filters'][] = array( 'hook' => 'add_filter:' . $hook_name, 'arg_count' => 4 );
\treturn true;
}

function add_shortcode( $tag, $callback ) {
\t$GLOBALS['wphx_313_04_filters'][] = array( 'hook' => 'add_shortcode:' . $tag, 'arg_count' => 2 );
\treturn true;
}

function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_313_04_filters'][] = array( 'hook' => 'do_action:' . $hook_name, 'arg_count' => count( $args ) );
\treturn null;
}

function wp_cache_get( $key, $group = '', $force = false, &$found = null ) {
\t$cache_key = $group . ':' . $key;
\t$found = array_key_exists( $cache_key, $GLOBALS['wphx_313_04_cache'] );
\treturn $found ? $GLOBALS['wphx_313_04_cache'][ $cache_key ] : false;
}

function wp_cache_set( $key, $data, $group = '', $expire = 0 ) {
\t$GLOBALS['wphx_313_04_cache'][ $group . ':' . $key ] = $data;
\treturn true;
}

function wp_cache_delete( $key, $group = '' ) {
\tunset( $GLOBALS['wphx_313_04_cache'][ $group . ':' . $key ] );
\treturn true;
}

function get_post( $post = null ) {
\t$id = is_object( $post ) && isset( $post->ID ) ? (int) $post->ID : (int) $post;
\treturn $GLOBALS['wphx_313_04_posts'][ $id ] ?? (object) array( 'ID' => $id, 'post_mime_type' => 'application/octet-stream' );
}

function get_post_mime_type( $post = null ) {
\t$post = get_post( $post );
\treturn $post->post_mime_type ?? false;
}

function wp_attachment_is( $type, $post = null ) {
\t$mime = get_post_mime_type( $post );
\treturn is_string( $mime ) && str_starts_with( $mime, $type . '/' );
}

function wp_attachment_is_image( $post = null ) {
\t$id = is_object( $post ) && isset( $post->ID ) ? (int) $post->ID : (int) $post;
\treturn ! empty( $GLOBALS['wphx_313_04_attachment_is_image'][ $id ] );
}

function wp_get_attachment_metadata( $attachment_id = 0, $unfiltered = false ) {
\treturn $GLOBALS['wphx_313_04_attachment_metadata'][ (int) $attachment_id ] ?? false;
}

function wp_update_attachment_metadata( $attachment_id, $data ) {
\t$GLOBALS['wphx_313_04_attachment_metadata'][ (int) $attachment_id ] = $data;
\treturn true;
}

function wp_get_original_image_path( $attachment_id, $unfiltered = false ) {
\treturn $GLOBALS['wphx_313_04_original_paths'][ (int) $attachment_id ] ?? '';
}

function update_attached_file( $attachment_id, $file ) {
\t$GLOBALS['wphx_313_04_original_paths'][ (int) $attachment_id ] = $file;
\treturn true;
}

function _wp_relative_upload_path( $path ) {
\t$path = str_replace( '\\\\', '/', $path );
\t$uploads = str_replace( '\\\\', '/', WP_CONTENT_DIR . '/uploads' );
\treturn str_starts_with( $path, $uploads . '/' ) ? substr( $path, strlen( $uploads ) + 1 ) : basename( $path );
}

function current_theme_supports( $feature, ...$args ) { return false; }
function post_type_supports( $post_type, $feature ) { return false; }
function wp_read_video_metadata( $file ) { return false; }
function wp_read_audio_metadata( $file ) { return false; }
function get_posts( $args = array() ) { return array(); }
function update_post_meta( $post_id, $meta_key, $meta_value ) { return true; }
function add_post_meta( $post_id, $meta_key, $meta_value, $unique = false ) { return true; }
function wp_insert_attachment( $args, $file = false, $parent = 0, $wp_error = false, $fire_after_hooks = true ) { return 9901; }

function wphx_reset_state() {
\t$GLOBALS['wphx_313_04_filters'] = array();
\t$GLOBALS['wphx_313_04_errors'] = array();
\t$GLOBALS['wphx_313_04_cache'] = array();
\t$GLOBALS['wphx_313_04_fake_editor_calls'] = array();
\t$GLOBALS['wphx_313_04_fake_editor_enabled'] = false;
\t$GLOBALS['wphx_313_04_fake_editor_mode'] = array();
}

function wphx_rel( $value ) {
\tif ( is_array( $value ) ) {
\t\t$result = array();
\t\tforeach ( $value as $key => $item ) {
\t\t\t$result[ $key ] = wphx_rel( $item );
\t\t}
\t\treturn $result;
\t}
\tif ( is_object( $value ) ) {
\t\tif ( is_wp_error( $value ) ) {
\t\t\treturn array(
\t\t\t\t'wp_error' => true,
\t\t\t\t'codes' => $value->get_error_codes(),
\t\t\t\t'messages' => $value->get_error_messages(),
\t\t\t);
\t\t}
\t\treturn array( 'object_class' => get_class( $value ) );
\t}
\tif ( ! is_string( $value ) ) {
\t\treturn $value;
\t}
\t$value = str_replace( '\\\\', '/', $value );
\t$root = str_replace( '\\\\', '/', ABSPATH );
\treturn str_starts_with( $value, $root ) ? '$ROOT/' . substr( $value, strlen( $root ) ) : $value;
}

function wphx_tmp_file( $name, $contents ) {
\t$path = ABSPATH . 'tmp/' . $name;
\tif ( ! is_dir( dirname( $path ) ) ) {
\t\tmkdir( dirname( $path ), 0777, true );
\t}
\tfile_put_contents( $path, $contents );
\treturn $path;
}

require ABSPATH . WPINC . '/class-wp-error.php';
function is_wp_error( $thing ) {
\treturn $thing instanceof WP_Error;
}
require ABSPATH . WPINC . '/compat.php';
require ABSPATH . WPINC . '/utf8.php';
require ABSPATH . WPINC . '/formatting.php';
require ABSPATH . WPINC . '/functions.php';
require ABSPATH . WPINC . '/media.php';
require ABSPATH . 'wp-admin/includes/image.php';

class WPHX_313_04_Fake_Image_Editor {
\tpublic $file;
\tprivate $width = 640;
\tprivate $height = 480;

\tpublic function __construct( $file ) {
\t\t$this->file = $file;
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array( 'method' => '__construct', 'file' => wphx_rel( $file ) );
\t}

\tpublic static function test( $args = array() ) {
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array( 'method' => 'test', 'args' => wphx_rel( $args ) );
\t\treturn empty( $GLOBALS['wphx_313_04_fake_editor_mode']['test_error'] );
\t}

\tpublic static function supports_mime_type( $mime_type ) {
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array( 'method' => 'supports_mime_type', 'mime_type' => $mime_type );
\t\treturn in_array( $mime_type, array( 'image/jpeg', 'image/png', 'image/webp' ), true );
\t}

\tpublic function load() {
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array( 'method' => 'load', 'file' => wphx_rel( $this->file ) );
\t\tif ( ! empty( $GLOBALS['wphx_313_04_fake_editor_mode']['load_error'] ) ) {
\t\t\treturn new WP_Error( 'fake_load_error', 'Fake image load error.' );
\t\t}
\t\treturn true;
\t}

\tpublic function resize( $max_w, $max_h, $crop = false ) {
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array( 'method' => 'resize', 'width' => $max_w, 'height' => $max_h, 'crop' => $crop );
\t\tif ( ! empty( $GLOBALS['wphx_313_04_fake_editor_mode']['resize_error'] ) ) {
\t\t\treturn new WP_Error( 'fake_resize_error', 'Fake image resize error.' );
\t\t}
\t\t$this->width = (int) $max_w;
\t\t$this->height = (int) $max_h;
\t\treturn true;
\t}

\tpublic function save( $destfilename = null, $mime_type = null ) {
\t\t$GLOBALS['wphx_313_04_fake_editor_calls'][] = array(
\t\t\t'method' => 'save',
\t\t\t'destfilename' => wphx_rel( $destfilename ),
\t\t\t'mime_type' => $mime_type,
\t\t);
\t\tif ( ! empty( $GLOBALS['wphx_313_04_fake_editor_mode']['save_error'] ) ) {
\t\t\treturn new WP_Error( 'fake_save_error', 'Fake image save error.' );
\t\t}
\t\t$path = $destfilename ?: dirname( $this->file ) . '/generated-' . wp_basename( $this->file );
\t\tif ( ! is_dir( dirname( $path ) ) ) {
\t\t\tmkdir( dirname( $path ), 0777, true );
\t\t}
\t\tfile_put_contents( $path, 'fake-image-output' );
\t\treturn array(
\t\t\t'path' => $path,
\t\t\t'file' => wp_basename( $path ),
\t\t\t'width' => $this->width,
\t\t\t'height' => $this->height,
\t\t\t'mime-type' => $mime_type ?: 'image/jpeg',
\t\t\t'filesize' => filesize( $path ),
\t\t);
\t}

\tpublic function maybe_exif_rotate() { return true; }
\tpublic function generate_filename( $suffix = null, $dest_path = null, $extension = null ) {
\t\t$suffix = null === $suffix ? 'generated' : $suffix;
\t\t$extension = $extension ?: pathinfo( $this->file, PATHINFO_EXTENSION );
\t\t$name = pathinfo( $this->file, PATHINFO_FILENAME );
\t\treturn ( $dest_path ?: dirname( $this->file ) ) . '/' . $name . ( '' === $suffix ? '' : '-' . $suffix ) . '.' . $extension;
\t}
}

$upload_dir = WP_CONTENT_DIR . '/uploads';
if ( ! is_dir( $upload_dir ) ) {
\tmkdir( $upload_dir, 0777, true );
}
$text_file = wphx_tmp_file( 'not-image.txt', "plain text\\n" );
$jpeg_file = $upload_dir . '/sample.jpg';
file_put_contents( $jpeg_file, 'not-real-jpeg-but-editor-is-faked' );

$cases = array();

wphx_reset_state();
$cases['editor:no-implementation'] = array(
\t'result' => wphx_rel( wp_get_image_editor( $jpeg_file, array( 'mime_type' => 'image/jpeg' ) ) ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_fake_editor_enabled'] = true;
$editor = wp_get_image_editor( $jpeg_file, array( 'mime_type' => 'image/jpeg' ) );
$cases['editor:selects-filtered-fake'] = array(
\t'result' => wphx_rel( $editor ),
\t'calls' => $GLOBALS['wphx_313_04_fake_editor_calls'],
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_fake_editor_enabled'] = true;
$cases['editor:method-requirement'] = array(
\t'supports_resize_save' => wp_image_editor_supports( array( 'mime_type' => 'image/jpeg', 'methods' => array( 'resize', 'save' ) ) ),
\t'supports_missing_method' => wp_image_editor_supports( array( 'mime_type' => 'image/jpeg', 'methods' => array( 'method_that_does_not_exist' ) ) ),
\t'calls' => $GLOBALS['wphx_313_04_fake_editor_calls'],
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$cases['editor:output-format-default-heic'] = array(
\t'result' => wp_get_image_editor_output_format( $upload_dir . '/photo.heic', 'image/heic' ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$cases['resize-dimensions:soft-and-crop'] = array(
\t'soft' => image_resize_dimensions( 1200, 800, 300, 300, false ),
\t'crop' => image_resize_dimensions( 1200, 800, 300, 300, array( 'left', 'top' ) ),
\t'too_large' => image_resize_dimensions( 1200, 800, 1600, 1600, false ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_fake_editor_enabled'] = true;
$cases['intermediate:success'] = array(
\t'result' => wphx_rel( image_make_intermediate_size( $jpeg_file, 150, 100, array( 'left', 'top' ) ) ),
\t'calls' => $GLOBALS['wphx_313_04_fake_editor_calls'],
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_fake_editor_enabled'] = true;
$GLOBALS['wphx_313_04_fake_editor_mode']['resize_error'] = true;
$cases['intermediate:resize-error'] = array(
\t'result' => image_make_intermediate_size( $jpeg_file, 150, 100, false ),
\t'calls' => $GLOBALS['wphx_313_04_fake_editor_calls'],
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_attachment_is_image'][101] = true;
$GLOBALS['wphx_313_04_attachment_metadata'][101] = array(
\t'width' => 1200,
\t'height' => 800,
\t'file' => 'sample.jpg',
\t'sizes' => array(
\t\t'thumbnail' => array( 'file' => 'sample-150x150.jpg', 'width' => 150, 'height' => 150, 'mime-type' => 'image/jpeg' ),
\t),
);
$cases['metadata:missing-image-subsizes'] = array(
\t'result' => wp_get_missing_image_subsizes( 101 ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_attachment_is_image'][102] = false;
$cases['metadata:non-image-missing'] = array(
\t'result' => wp_get_missing_image_subsizes( 102 ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$cases['metadata:update-invalid-attachment'] = array(
\t'result' => wphx_rel( wp_update_image_subsizes( 202 ) ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_attachment_is_image'][103] = true;
$GLOBALS['wphx_313_04_attachment_metadata'][103] = array(
\t'width' => 1200,
\t'height' => 800,
\t'file' => 'complete.jpg',
\t'sizes' => array(
\t\t'thumbnail' => array( 'file' => 'complete-150x150.jpg', 'width' => 150, 'height' => 150 ),
\t\t'medium' => array( 'file' => 'complete-300x200.jpg', 'width' => 300, 'height' => 200 ),
\t\t'medium_large' => array( 'file' => 'complete-768x512.jpg', 'width' => 768, 'height' => 512 ),
\t\t'large' => array( 'file' => 'complete-1024x683.jpg', 'width' => 1024, 'height' => 683 ),
\t),
);
$GLOBALS['wphx_313_04_original_paths'][103] = $jpeg_file;
$cases['metadata:update-no-missing'] = array(
\t'result' => wp_update_image_subsizes( 103 ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$GLOBALS['wphx_313_04_posts'][301] = (object) array( 'ID' => 301, 'post_mime_type' => 'application/octet-stream' );
$cases['metadata:generate-non-image-file'] = array(
\t'result' => wphx_rel( wp_generate_attachment_metadata( 301, $text_file ) ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$cases['metadata:read-missing-image'] = array(
\t'result' => wp_read_image_metadata( ABSPATH . 'tmp/missing-image.jpg' ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

wphx_reset_state();
$cases['metadata:displayable-text-file'] = array(
\t'result' => file_is_displayable_image( $text_file ),
\t'filters' => $GLOBALS['wphx_313_04_filters'],
);

ksort( $cases );
echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'cases' => wphx_rel( $cases ),
\t\t'php_errors' => $GLOBALS['wphx_313_04_errors'],
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
) . "\\n";
`
  );
}

function normalizeRun(run) {
  const parsed = JSON.parse(run);
  parsed.mode = "$MODE";
  return parsed;
}

function runProbe(mode, root) {
  return normalizeRun(command("php", [PROBE, mode, root]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) {
      throw new Error(`${path} is stale; run npm run wp:core:wphx-313-image-metadata-editor-oracle-fixture`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function validationSummary(oracle, candidate) {
  return {
    status: JSON.stringify(oracle.cases) === JSON.stringify(candidate.cases) ? "passed" : "failed",
    fixture_cases: Object.keys(oracle.cases).length,
    covered_symbols: COVERED_SYMBOLS.length,
    oracle_php_errors: oracle.php_errors.length,
    candidate_php_errors: candidate.php_errors.length
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const oracle = runProbe("oracle", ORACLE_ROOT);
const candidate = runProbe("candidate", CANDIDATE_ROOT);
const validation = validationSummary(oracle, candidate);

if (validation.status !== "passed") {
  console.error(JSON.stringify({ status: "failed", validation, oracle, candidate }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-image-metadata-editor-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_candidate_behavior", "copied_oracle_source", "hook_injected_test_double"],
  artifact_scope: "helper",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    upload_validation_fixture_manifest: inputRecord(UPLOAD_FIXTURE),
    upstream_sources: SOURCE_FILES.map(sourceRecord),
    runner: inputRecord(RUNNER)
  },
  fixture: {
    copied_source_policy:
      "Oracle and candidate roots both mirror the same locked upstream WordPress PHP source. This is bridge evidence for image metadata/editor behavior and does not claim Haxe-owned public PHP replacement.",
    fake_editor_policy:
      "The fake editor is injected only through the public wp_image_editors filter so WordPress still owns editor selection, method checks, WP_Error propagation, image_make_intermediate_size return shaping, and metadata helper control flow.",
    upstream_reference_commit: maybeCommand("git", ["-C", UPSTREAM_ROOT, "rev-parse", "HEAD"]),
    source_files: SOURCE_FILES,
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    public_abi_policy: {
      public_php_replacement_claimed: false,
      handwritten_php_shells_added: false,
      adapter_contract_owner: "haxe_typed_prior_candidate",
      semantic_owner: "upstream_php_oracle_observed",
      native_image_library_claimed: false,
      installed_media_claimed: false,
      removal_gate:
        "Promote the covered image metadata/editor decisions to generated original-path PHP adapters or Haxe-owned helpers, keep the fake editor only as a hook-level provider fixture, and rerun these probes against generated candidate artifacts."
    }
  },
  runs: {
    oracle,
    candidate,
    match: JSON.stringify(oracle.cases) === JSON.stringify(candidate.cases),
    normalized_output_sha256: {
      oracle: sha256(JSON.stringify(oracle)),
      candidate: sha256(JSON.stringify(candidate))
    }
  },
  remaining_gaps: [
    {
      id: "native-image-library-execution-not-covered",
      owner: ISSUE.external_ref,
      detail:
        "The fixture injects a fake editor through wp_image_editors. It does not claim GD, Imagick, AVIF/HEIC decoding, EXIF/IPTC extraction on real images, PDF previews, or real image file writes."
    },
    {
      id: "subsize-generation-not-owned",
      owner: ISSUE.external_ref,
      detail:
        "The fixture observes missing-subsize decisions and image_make_intermediate_size return shaping. It does not claim durable Haxe ownership of _wp_make_subsizes, real editor resize behavior, or installed media regeneration."
    },
    {
      id: "public-php-adapter-not-yet-generated",
      owner: ISSUE.external_ref,
      detail:
        "Candidate behavior still comes from copied upstream PHP. Generated original-path public PHP adapter ownership is not claimed."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: validation
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const ownership = {
  schema: "wphx.ownership-manifest.v1",
  manifest_id: "ownership:wp-core/image-metadata-editor-oracle-fixture",
  issue: {
    id: ISSUE.id,
    external_ref: ISSUE.external_ref
  },
  unit: {
    kind: "oracle_candidate_fixture",
    name: "image metadata helpers and editor selection behavior",
    area: "wp-includes/media.php wp-admin/includes/image.php",
    public_contract:
      "This slice observes upstream WordPress image metadata/editor behavior in mirrored oracle/candidate roots using public hook-level fake editor injection. It does not claim Haxe-owned runtime behavior, native image-library execution, or public PHP ABI replacement."
  },
  ownership_state: "bridge_shell",
  ownership_axes: {
    semantic_owner: "upstream_oracle_observed",
    adapter_contract_owner: "haxe_typed_prior_candidate",
    emission_strategy: "copied_oracle_php_fixture",
    execution_provider: "upstream_php_oracle_with_hook_test_double",
    compatibility_evidence: "oracle_candidate_behavior"
  },
  bridge: {
    exists: true,
    kind: "copied_oracle_source_fixture",
    removal_gate:
      "Replace candidate copied PHP with Haxe-owned/generated image metadata helpers or original-path Adapter IR output, then rerun this oracle fixture with equal behavior."
  },
  owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
  generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
  verification: {
    oracle_commands: [
      "npm run wp:core:wphx-313-image-metadata-editor-oracle-fixture",
      "npm run wp:core:wphx-313-image-metadata-editor-oracle-fixture:check",
      "npm run receipts:validate"
    ],
    receipt_refs: ["receipt:wphx-313-04-image-metadata-editor-oracle-fixture"],
    manifest_digest: sha256(manifestText)
  }
};
const ownershipText = JSON.stringify(ownership, null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-313-04-image-metadata-editor-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "image metadata/editor oracle/candidate fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for image metadata/editor bridge fixture" },
    { path: RUNNER, role: "deterministic oracle/candidate generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-313-image-metadata-editor-oracle-fixture",
    "npm run wp:core:wphx-313-image-metadata-editor-oracle-fixture:check"
  ],
  related_receipts: [
    "receipt:wphx-313-01-media-filesystem-upload-surface",
    "receipt:wphx-313-02-media-upload-adapter-contract-candidate",
    "receipt:wphx-313-03-media-upload-validation-oracle-fixture"
  ],
  validation_result: validation,
  manifest_sha256: sha256(manifestText),
  ownership_sha256: sha256(ownershipText)
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
      fixture_cases: validation.fixture_cases,
      covered_symbols: validation.covered_symbols
    },
    null,
    2
  )
);
