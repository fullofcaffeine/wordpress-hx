#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { filesUnder } from "../wp-linker/original-path-linker.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.10.7",
  external_ref: "WPHX-311.07",
  title: "Add packaged REST server distribution and HTTP serving gate"
};

const RECORDED_AT = "2026-06-22T12:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";
const HXML = "fixtures/wp-core/rest-server-packaged-http-candidate.hxml";
const BUILD_ROOT = "build/wp-core/wphx-311-07";
const HAXE_OUT = `${BUILD_ROOT}/haxe`;
const ORACLE_ROOT = `${BUILD_ROOT}/oracle-package`;
const CANDIDATE_ROOT = `${BUILD_ROOT}/candidate-package`;
const PROBE = `${BUILD_ROOT}/probe/rest-server-http-probe.php`;
const OUT = "manifests/wp-core/wphx-311-07-rest-server-packaged-http.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-311-07-rest-server-packaged-http.v1.json";
const RECEIPT = "receipts/wp-core/wphx-311-07-rest-server-packaged-http.v1.json";
const RUNNER = "tools/wp-core/run-rest-server-packaged-http-gate.mjs";
const PRIOR_MANIFESTS = [
  "manifests/wp-core/wphx-311-01-rest-settings-controller-fixture.v1.json",
  "manifests/wp-core/wphx-311-02-rest-settings-dispatch-fixture.v1.json",
  "manifests/wp-core/wphx-311-03-rest-settings-schema-strategy-candidate.v1.json",
  "manifests/wp-core/wphx-311-04-rest-settings-value-strategy-candidate.v1.json",
  "manifests/wp-core/wphx-311-05-rest-settings-update-strategy-candidate.v1.json",
  "manifests/wp-core/wphx-311-06-rest-server-dispatch-strategy-candidate.v1.json"
];

const SOURCE_FILES = [
  "src/wp-includes/class-wp-hook.php",
  "src/wp-includes/plugin.php",
  "src/wp-includes/compat.php",
  "src/wp-includes/utf8.php",
  "src/wp-includes/load.php",
  "src/wp-includes/pomo/plural-forms.php",
  "src/wp-includes/pomo/entry.php",
  "src/wp-includes/pomo/translations.php",
  "src/wp-includes/l10n.php",
  "src/wp-includes/class-wp-list-util.php",
  "src/wp-includes/class-wp-error.php",
  "src/wp-includes/class-wp-http-response.php",
  "src/wp-includes/functions.php",
  "src/wp-includes/cache.php",
  "src/wp-includes/class-wp-object-cache.php",
  "src/wp-includes/kses.php",
  "src/wp-includes/formatting.php",
  "src/wp-includes/option.php",
  "src/wp-includes/link-template.php",
  "src/wp-includes/rest-api.php",
  "src/wp-includes/rest-api/class-wp-rest-request.php",
  "src/wp-includes/rest-api/class-wp-rest-response.php",
  "src/wp-includes/rest-api/class-wp-rest-server.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-controller.php",
  "src/wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php"
];

const HAXE_SOURCES = [
  HXML,
  "src/wphx/wp/rest/RestServerDispatchStrategy.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/RestServerDispatchStrategyCandidateEntry.hx"
];

const OWNED_METHODS = [
  "serve_request",
  "dispatch",
  "respond_to_request",
  "response_to_data",
  "get_response_links",
  "get_target_hints_for_link",
  "get_compact_response_links",
  "embed_links"
];
const CASES = [
  {
    id: "rest-http:get-settings-success",
    focus: "GET /wp/v2/settings emits JSON data, status, REST headers, and matched endpoint output"
  },
  {
    id: "rest-http:post-settings-update",
    focus: "POST /wp/v2/settings reads body params, updates deterministic option storage, and emits refreshed JSON"
  },
  {
    id: "rest-http:no-route-404",
    focus: "unknown route emits REST error JSON and 404 status"
  },
  {
    id: "rest-http:head-no-body",
    focus: "HEAD request runs dispatch/status/header path and returns no body"
  },
  {
    id: "rest-http:pre-serve-manual",
    focus: "rest_pre_serve_request can manually serve output and suppress default JSON emission"
  },
  {
    id: "rest-http:get-settings-embed",
    focus: "_embed request path runs response_to_data() through embed_links() while preserving response shape"
  }
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

function phpVersionFamily(value) {
  const [major, minor] = String(value).split(".");
  return `${major}.${minor}`;
}

function normalizePath(value) {
  if (typeof value !== "string") return value;
  const cwd = process.cwd().replaceAll("\\", "/");
  const upstreamRoot = resolve(UPSTREAM_ROOT).replaceAll("\\", "/");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith(`${cwd}/`)) return normalized.slice(cwd.length + 1);
  if (normalized.startsWith(`${upstreamRoot}/`)) return `../wordpress-develop/${normalized.slice(upstreamRoot.length + 1)}`;
  if (normalized.startsWith("/work/")) return normalized.slice("/work/".length);
  return normalized;
}

function stableCommand(value) {
  return normalizePath(value)
    .replace(resolve(UPSTREAM_ROOT).replaceAll("\\", "/"), "../wordpress-develop")
    .replaceAll(process.cwd().replaceAll("\\", "/"), "$PWD");
}

function stableRuntimeValue(value) {
  if (Array.isArray(value)) return value.map(stableRuntimeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, key === "phpVersion" ? phpVersionFamily(entry) : stableRuntimeValue(entry)])
    );
  }
  return normalizePath(value);
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

function copySources(root) {
  for (const path of SOURCE_FILES) {
    const target = packagePath(root, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(upstreamPath(path), target);
  }
}

function copyTree(sourceRoot, targetRoot) {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = `${sourceRoot}/${entry.name}`;
    const targetPath = `${targetRoot}/${entry.name}`;
    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTree(sourcePath, targetPath);
    } else {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
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

function haxeBootstrapBlock() {
  return `if ( ! function_exists( 'wphx_311_07_bootstrap_haxe' ) ) {
\tfunction wphx_311_07_bootstrap_haxe() {
\t\tstatic $bootstrapped = false;
\t\tif ( $bootstrapped ) {
\t\t\treturn;
\t\t}
\t\t$bootstrapped = true;

\t\t$wphx_311_07_lib = dirname( __DIR__, 3 ) . '/haxe/lib';
\t\tset_include_path( get_include_path() . PATH_SEPARATOR . $wphx_311_07_lib );
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
wphx_311_07_bootstrap_haxe();`;
}

function installBootstrap(source) {
  const marker = "<?php\n";
  if (!source.startsWith(marker)) {
    throw new Error("PHP source did not start with an expected PHP open tag");
  }
  return `${marker}\n${haxeBootstrapBlock()}\n${source.slice(marker.length)}`;
}

function replaceMethod(source, methodName, replacement) {
  const pattern = new RegExp(`((?:public|protected|private)(?:\\s+static)?\\s+function\\s+${methodName}\\s*\\()`, "m");
  const match = pattern.exec(source);
  if (!match) {
    throw new Error(`Unable to locate method ${methodName}`);
  }
  const openBrace = source.indexOf("{", match.index);
  if (openBrace === -1) {
    throw new Error(`Unable to locate opening brace for ${methodName}`);
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return `${source.slice(0, match.index)}${replacement}${source.slice(index + 1)}`;
      }
    }
  }
  throw new Error(`Unable to locate closing brace for ${methodName}`);
}

function transformCandidateRestServer() {
  const path = `${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`;
  let source = installBootstrap(readFileSync(path, "utf8"));
  source = replaceMethod(
    source,
    "serve_request",
    `public function serve_request( $path = null ) {
\t/* @var WP_User|null $current_user */
\tglobal $current_user;

\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';

\t$wphx_current_user_is_wp_user = $current_user instanceof WP_User;
\t$wphx_current_user_exists     = $wphx_current_user_is_wp_user && $current_user->exists();
\tif ( $dispatch_strategy::shouldClearUnauthenticatedCurrentUser( $wphx_current_user_is_wp_user, $wphx_current_user_exists ) ) {
\t\t$current_user = null;
\t}

\t$jsonp_enabled = apply_filters( 'rest_jsonp_enabled', true );

\t$jsonp_callback = false;
\tif ( isset( $_GET['_jsonp'] ) ) {
\t\t$jsonp_callback = $_GET['_jsonp'];
\t}

\t$wphx_jsonp_callback_present = false !== $jsonp_callback;
\t$content_type                = $dispatch_strategy::responseContentType( $wphx_jsonp_callback_present, (bool) $jsonp_enabled );
\t$this->send_header( 'Content-Type', $content_type . '; charset=' . get_option( 'blog_charset' ) );
\t$this->send_header( 'X-Robots-Tag', 'noindex' );

\t$api_root = get_rest_url();
\tif ( $dispatch_strategy::shouldSendApiRootLink( empty( $api_root ) ) ) {
\t\t$this->send_header( 'Link', '<' . sanitize_url( $api_root ) . '>; rel="https://api.w.org/"' );
\t}

\t$this->send_header( 'X-Content-Type-Options', 'nosniff' );

\tapply_filters_deprecated(
\t\t'rest_enabled',
\t\tarray( true ),
\t\t'4.7.0',
\t\t'rest_authentication_errors',
\t\tsprintf(
\t\t\t/* translators: %s: rest_authentication_errors */
\t\t\t__( 'The REST API can no longer be completely disabled, the %s filter can be used to restrict access to the API, instead.' ),
\t\t\t'rest_authentication_errors'
\t\t)
\t);

\tif ( $dispatch_strategy::shouldRejectDisabledJsonp( $wphx_jsonp_callback_present, (bool) $jsonp_enabled ) ) {
\t\techo $this->json_error( 'rest_callback_disabled', __( 'JSONP support is disabled on this site.' ), 400 );
\t\treturn false;
\t}

\t$wphx_jsonp_callback_valid = ! $wphx_jsonp_callback_present || wp_check_jsonp_callback( $jsonp_callback );
\tif ( $dispatch_strategy::shouldRejectInvalidJsonp( $wphx_jsonp_callback_present, $wphx_jsonp_callback_valid ) ) {
\t\techo $this->json_error( 'rest_callback_invalid', __( 'Invalid JSONP callback function.' ), 400 );
\t\treturn false;
\t}

\t$path = $dispatch_strategy::requestPath( $path, $_SERVER['PATH_INFO'] ?? null );

\t$request = new WP_REST_Request( $_SERVER['REQUEST_METHOD'], $path );

\t$request->set_query_params( wp_unslash( $_GET ) );
\t$request->set_body_params( wp_unslash( $_POST ) );
\t$request->set_file_params( $_FILES );
\t$request->set_headers( $this->get_headers( wp_unslash( $_SERVER ) ) );
\t$request->set_body( self::get_raw_data() );

\t$method_overridden = false;
\t$wphx_has_query_method_override  = isset( $_GET['_method'] );
\t$wphx_has_header_method_override = isset( $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] );
\tif ( $dispatch_strategy::shouldOverrideMethodFromQuery( $wphx_has_query_method_override ) ) {
\t\t$request->set_method( $_GET['_method'] );
\t} elseif ( $dispatch_strategy::shouldOverrideMethodFromHeader( $wphx_has_query_method_override, $wphx_has_header_method_override ) ) {
\t\t$request->set_method( $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] );
\t\t$method_overridden = true;
\t}

\t$expose_headers = array( 'X-WP-Total', 'X-WP-TotalPages', 'Link' );
\t$expose_headers = apply_filters( 'rest_exposed_cors_headers', $expose_headers, $request );
\t$this->send_header( 'Access-Control-Expose-Headers', implode( ', ', $expose_headers ) );

\t$allow_headers = array(
\t\t'Authorization',
\t\t'X-WP-Nonce',
\t\t'Content-Disposition',
\t\t'Content-MD5',
\t\t'Content-Type',
\t);
\t$allow_headers = apply_filters( 'rest_allowed_cors_headers', $allow_headers, $request );
\t$this->send_header( 'Access-Control-Allow-Headers', implode( ', ', $allow_headers ) );

\t$result = $this->check_authentication();

\tif ( $dispatch_strategy::shouldDispatchAuthenticatedRequest( is_wp_error( $result ) ) ) {
\t\t$result = $this->dispatch( $request );
\t}

\t$result = rest_ensure_response( $result );

\tif ( $dispatch_strategy::shouldConvertServeResultError( is_wp_error( $result ) ) ) {
\t\t$result = $this->error_to_response( $result );
\t}

\t$result = apply_filters( 'rest_post_dispatch', rest_ensure_response( $result ), $this, $request );

\tif ( $dispatch_strategy::shouldEnvelopeResponse( isset( $_GET['_envelope'] ) ) ) {
\t\t$embed  = isset( $_GET['_embed'] ) ? rest_parse_embed_param( $_GET['_embed'] ) : false;
\t\t$result = $this->envelope_response( $result, $embed );
\t}

\t$headers = $result->get_headers();
\t$this->send_headers( $headers );

\t$code = $result->get_status();
\t$this->set_status( $code );

\t$send_no_cache_headers = apply_filters( 'rest_send_nocache_headers', is_user_logged_in() );
\t$wphx_response_code_is_4xx = str_starts_with( (string) $code, '4' );
\tif ( $dispatch_strategy::shouldSendNoCacheHeaders( (bool) $send_no_cache_headers, (bool) $method_overridden, $wphx_response_code_is_4xx ) ) {
\t\tforeach ( wp_get_nocache_headers() as $header => $header_value ) {
\t\t\tif ( empty( $header_value ) ) {
\t\t\t\t$this->remove_header( $header );
\t\t\t} else {
\t\t\t\t$this->send_header( $header, $header_value );
\t\t\t}
\t\t}
\t}

\t$served = apply_filters( 'rest_pre_serve_request', false, $result, $request, $this );

\tif ( $dispatch_strategy::shouldServeDefaultResponse( (bool) $served ) ) {
\t\tif ( $dispatch_strategy::shouldReturnWithoutBodyForHead( 'HEAD' === $request->get_method() ) ) {
\t\t\treturn null;
\t\t}

\t\t$embed  = isset( $_GET['_embed'] ) ? rest_parse_embed_param( $_GET['_embed'] ) : false;
\t\t$result = $this->response_to_data( $result, $embed );

\t\t$result = apply_filters( 'rest_pre_echo_response', $result, $this, $request );

\t\tif ( $dispatch_strategy::shouldReturnWithoutBodyForStatus( (int) $code, null === $result ) ) {
\t\t\treturn null;
\t\t}

\t\t$result = wp_json_encode( $result, $this->get_json_encode_options( $request ) );

\t\t$json_error_message = $this->get_json_last_error();

\t\tif ( $json_error_message ) {
\t\t\t$this->set_status( 500 );
\t\t\t$json_error_obj = new WP_Error(
\t\t\t\t'rest_encode_error',
\t\t\t\t$json_error_message,
\t\t\t\tarray( 'status' => 500 )
\t\t\t);

\t\t\t$result = $this->error_to_response( $json_error_obj );
\t\t\t$result = wp_json_encode( $result->data, $this->get_json_encode_options( $request ) );
\t\t}

\t\tif ( $dispatch_strategy::shouldEchoJsonp( $wphx_jsonp_callback_present ) ) {
\t\t\techo '/**/' . $jsonp_callback . '(' . $result . ')';
\t\t} else {
\t\t\techo $result;
\t\t}
\t}

\treturn null;
}`
  );
  source = replaceMethod(
    source,
    "dispatch",
    `public function dispatch( $request ) {
\t$this->dispatching_requests[] = $request;
\t$dispatch_strategy            = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';

\t$result = apply_filters( 'rest_pre_dispatch', null, $this, $request );

\tif ( $dispatch_strategy::shouldUsePreDispatchResult( empty( $result ) ) ) {
\t\t$result = rest_ensure_response( $result );

\t\tif ( $dispatch_strategy::shouldConvertPreDispatchError( is_wp_error( $result ) ) ) {
\t\t\t$result = $this->error_to_response( $result );
\t\t}

\t\tarray_pop( $this->dispatching_requests );
\t\treturn $result;
\t}

\t$error   = null;
\t$matched = $this->match_request_to_handler( $request );

\tif ( $dispatch_strategy::shouldReturnMatchedError( is_wp_error( $matched ) ) ) {
\t\t$response = $this->error_to_response( $matched );
\t\tarray_pop( $this->dispatching_requests );
\t\treturn $response;
\t}

\tlist( $route, $handler ) = $matched;

\tif ( $dispatch_strategy::shouldCreateInvalidHandlerError( is_callable( $handler['callback'] ) ) ) {
\t\t$error = new WP_Error(
\t\t\t'rest_invalid_handler',
\t\t\t__( 'The handler for the route is invalid.' ),
\t\t\tarray( 'status' => 500 )
\t\t);
\t}

\tif ( $dispatch_strategy::shouldValidateRequest( is_wp_error( $error ) ) ) {
\t\t$check_required = $request->has_valid_params();
\t\tif ( $dispatch_strategy::shouldUseValidationError( is_wp_error( $check_required ) ) ) {
\t\t\t$error = $check_required;
\t\t}
\t}

\tif ( $dispatch_strategy::shouldSanitizeRequest( is_wp_error( $error ) ) ) {
\t\t$check_sanitized = $request->sanitize_params();
\t\tif ( $dispatch_strategy::shouldUseSanitizationError( is_wp_error( $check_sanitized ) ) ) {
\t\t\t$error = $check_sanitized;
\t\t}
\t}

\t$response = $this->respond_to_request( $request, $route, $handler, $error );
\tarray_pop( $this->dispatching_requests );
\treturn $response;
}`
  );
  source = replaceMethod(
    source,
    "respond_to_request",
    `protected function respond_to_request( $request, $route, $handler, $response ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';

\t$response = apply_filters( 'rest_request_before_callbacks', $response, $handler, $request );

\tif ( $dispatch_strategy::shouldRunPermissionCheck( is_wp_error( $response ), ! empty( $handler['permission_callback'] ) ) ) {
\t\t$permission = call_user_func( $handler['permission_callback'], $request );

\t\tif ( $dispatch_strategy::shouldUsePermissionError( is_wp_error( $permission ) ) ) {
\t\t\t$response = $permission;
\t\t} elseif ( $dispatch_strategy::shouldCreateForbiddenError( false === $permission || null === $permission ) ) {
\t\t\t$response = new WP_Error(
\t\t\t\t'rest_forbidden',
\t\t\t\t__( 'Sorry, you are not allowed to do that.' ),
\t\t\t\tarray( 'status' => rest_authorization_required_code() )
\t\t\t);
\t\t}
\t}

\tif ( $dispatch_strategy::shouldRunDispatchRequest( is_wp_error( $response ) ) ) {
\t\t$dispatch_result = apply_filters( 'rest_dispatch_request', null, $request, $route, $handler );

\t\tif ( $dispatch_strategy::shouldUseDispatchFilterResult( null === $dispatch_result ) ) {
\t\t\t$response = $dispatch_result;
\t\t} elseif ( $dispatch_strategy::shouldCallEndpointCallback( null === $dispatch_result ) ) {
\t\t\t$response = call_user_func( $handler['callback'], $request );
\t\t}
\t}

\t$response = apply_filters( 'rest_request_after_callbacks', $response, $handler, $request );

\tif ( $dispatch_strategy::shouldConvertFinalError( is_wp_error( $response ) ) ) {
\t\t$response = $this->error_to_response( $response );
\t} else {
\t\t$response = rest_ensure_response( $response );
\t}

\tif ( $dispatch_strategy::shouldSetMatchedMetadata() ) {
\t\t$response->set_matched_route( $route );
\t\t$response->set_matched_handler( $handler );
\t}

\treturn $response;
}`
  );
  source = replaceMethod(
    source,
    "response_to_data",
    `public function response_to_data( $response, $embed ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';
\t$data              = $response->get_data();
\t$links             = self::get_compact_response_links( $response );

\tif ( $dispatch_strategy::shouldAttachResponseLinks( empty( $links ) ) ) {
\t\t$data['_links'] = $links;
\t}

\tif ( $dispatch_strategy::shouldEmbedResponseData( (bool) $embed ) ) {
\t\t$this->embed_cache = array();
\t\tif ( $dispatch_strategy::shouldEmbedNumericArrayData( wp_is_numeric_array( $data ) ) ) {
\t\t\tforeach ( $data as $key => $item ) {
\t\t\t\t$data[ $key ] = $this->embed_links( $item, $embed );
\t\t\t}
\t\t} else {
\t\t\t$data = $this->embed_links( $data, $embed );
\t\t}
\t\t$this->embed_cache = array();
\t}

\treturn $data;
}`
  );
  source = replaceMethod(
    source,
    "get_response_links",
    `public static function get_response_links( $response ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';
\t$links             = $response->get_links();

\tif ( $dispatch_strategy::shouldReturnEmptyResponseLinks( empty( $links ) ) ) {
\t\treturn array();
\t}

\t$data = array();
\tforeach ( $links as $rel => $items ) {
\t\t$data[ $rel ] = array();

\t\tforeach ( $items as $item ) {
\t\t\t$attributes         = $item['attributes'];
\t\t\t$attributes['href'] = $item['href'];

\t\t\tif ( $dispatch_strategy::shouldSkipTargetHintsForRel( 'self' === $rel ) ) {
\t\t\t\t$data[ $rel ][] = $attributes;
\t\t\t\tcontinue;
\t\t\t}

\t\t\t$target_hints = self::get_target_hints_for_link( $attributes );
\t\t\tif ( $dispatch_strategy::shouldAttachTargetHints( ! empty( $target_hints ) ) ) {
\t\t\t\t$attributes['targetHints'] = $target_hints;
\t\t\t}

\t\t\t$data[ $rel ][] = $attributes;
\t\t}
\t}

\treturn $data;
}`
  );
  source = replaceMethod(
    source,
    "get_target_hints_for_link",
    `protected static function get_target_hints_for_link( $link ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';

\tif ( $dispatch_strategy::shouldReturnNullForExplicitTargetHintsAllow( isset( $link['targetHints']['allow'] ) ) ) {
\t\treturn null;
\t}

\t$request = WP_REST_Request::from_url( $link['href'] );
\tif ( $dispatch_strategy::shouldReturnNullForMissingTargetRequest( (bool) $request ) ) {
\t\treturn null;
\t}

\t$server = rest_get_server();
\t$match  = $server->match_request_to_handler( $request );

\tif ( $dispatch_strategy::shouldReturnNullForTargetMatchError( is_wp_error( $match ) ) ) {
\t\treturn null;
\t}

\tif ( $dispatch_strategy::shouldReturnNullForTargetParamError( is_wp_error( $request->has_valid_params() ) ) ) {
\t\treturn null;
\t}

\tif ( $dispatch_strategy::shouldReturnNullForTargetSanitizeError( is_wp_error( $request->sanitize_params() ) ) ) {
\t\treturn null;
\t}

\t$target_hints = array();

\t$response = new WP_REST_Response();
\t$response->set_matched_route( $match[0] );
\t$response->set_matched_handler( $match[1] );
\t$headers = rest_send_allow_header( $response, $server, $request )->get_headers();

\tforeach ( $headers as $name => $value ) {
\t\t$name = WP_REST_Request::canonicalize_header_name( $name );

\t\t$target_hints[ $name ] = array_map( 'trim', explode( ',', $value ) );
\t}

\treturn $target_hints;
}`
  );
  source = replaceMethod(
    source,
    "get_compact_response_links",
    `public static function get_compact_response_links( $response ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';
\t$links             = self::get_response_links( $response );

\tif ( $dispatch_strategy::shouldReturnEmptyCompactLinks( empty( $links ) ) ) {
\t\treturn array();
\t}

\t$curies      = $response->get_curies();
\t$used_curies = array();

\tforeach ( $links as $rel => $items ) {
\t\tforeach ( $curies as $curie ) {
\t\t\t$href_prefix = substr( $curie['href'], 0, strpos( $curie['href'], '{rel}' ) );
\t\t\tif ( ! $dispatch_strategy::shouldAttemptCurieCompaction( $rel, $href_prefix ) ) {
\t\t\t\tcontinue;
\t\t\t}

\t\t\t$rel_regex = str_replace( '\\\\{rel\\\\}', '(.+)', preg_quote( $curie['href'], '!' ) );
\t\t\t$matches   = array();
\t\t\tpreg_match( '!' . $rel_regex . '!', $rel, $matches );
\t\t\tif ( $dispatch_strategy::shouldInstallCompactedRel( ! empty( $matches ) ) ) {
\t\t\t\t$new_rel                       = $curie['name'] . ':' . $matches[1];
\t\t\t\t$used_curies[ $curie['name'] ] = $curie;
\t\t\t\t$links[ $new_rel ]             = $items;
\t\t\t\tunset( $links[ $rel ] );
\t\t\t\tbreak;
\t\t\t}
\t\t}
\t}

\tif ( $dispatch_strategy::shouldAppendUsedCuries( empty( $used_curies ) ) ) {
\t\t$links['curies'] = array_values( $used_curies );
\t}

\treturn $links;
}`
  );
  source = replaceMethod(
    source,
    "embed_links",
    `protected function embed_links( $data, $embed = true ) {
\t$dispatch_strategy = '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy';

\tif ( $dispatch_strategy::shouldReturnUnembeddedData( empty( $data['_links'] ) ) ) {
\t\treturn $data;
\t}

\t$embedded = array();

\tforeach ( $data['_links'] as $rel => $links ) {
\t\tif ( ! $dispatch_strategy::shouldProcessEmbedRelation( is_array( $embed ), ! is_array( $embed ) || in_array( $rel, $embed, true ) ) ) {
\t\t\tcontinue;
\t\t}

\t\t$embeds = array();

\t\tforeach ( $links as $item ) {
\t\t\tif ( $dispatch_strategy::shouldKeepEmptyEmbedForNonEmbeddable( ! empty( $item['embeddable'] ) ) ) {
\t\t\t\t$embeds[] = array();
\t\t\t\tcontinue;
\t\t\t}

\t\t\tif ( $dispatch_strategy::shouldLoadEmbedCache( array_key_exists( $item['href'], $this->embed_cache ) ) ) {
\t\t\t\t$request = WP_REST_Request::from_url( $item['href'] );
\t\t\t\tif ( $dispatch_strategy::shouldSkipEmbedForMissingRequest( (bool) $request ) ) {
\t\t\t\t\t$embeds[] = array();
\t\t\t\t\tcontinue;
\t\t\t\t}

\t\t\t\tif ( $dispatch_strategy::shouldSetEmbedContext( empty( $request['context'] ) ) ) {
\t\t\t\t\t$request['context'] = 'embed';
\t\t\t\t}

\t\t\t\tif ( $dispatch_strategy::shouldInspectPerPageMaximum( empty( $request['per_page'] ) ) ) {
\t\t\t\t\t$matched = $this->match_request_to_handler( $request );
\t\t\t\t\tif ( $dispatch_strategy::shouldUseMatchedPerPageMaximum( is_wp_error( $matched ), isset( $matched[1]['args']['per_page']['maximum'] ) ) ) {
\t\t\t\t\t\t$request['per_page'] = (int) $matched[1]['args']['per_page']['maximum'];
\t\t\t\t\t}
\t\t\t\t}

\t\t\t\t$response = $this->dispatch( $request );

\t\t\t\t$response = apply_filters( 'rest_post_dispatch', rest_ensure_response( $response ), $this, $request );

\t\t\t\t$this->embed_cache[ $item['href'] ] = $this->response_to_data( $response, false );
\t\t\t}

\t\t\t$embeds[] = $this->embed_cache[ $item['href'] ];
\t\t}

\t\t$has_links = count( array_filter( $embeds ) );

\t\tif ( $dispatch_strategy::shouldAttachEmbeddedRelation( (bool) $has_links ) ) {
\t\t\t$embedded[ $rel ] = $embeds;
\t\t}
\t}

\tif ( $dispatch_strategy::shouldAttachEmbeddedData( empty( $embedded ) ) ) {
\t\t$data['_embedded'] = $embedded;
\t}

\treturn $data;
}`
  );
  writeFileSync(path, source);
}

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$mode = $argv[1];
$root = rtrim( $argv[2], '/\\\\' );
$upstream_server = realpath( $argv[3] );

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );
$GLOBALS['wphx_311_07_php_errors'] = array();
set_error_handler(
\tfunction ( $errno, $errstr ) {
\t\t$GLOBALS['wphx_311_07_php_errors'][] = array(
\t\t\t'errno'   => $errno,
\t\t\t'message' => $errstr,
\t\t);
\t\treturn true;
\t}
);

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_CONTENT_DIR', $root . '/wp-content' );
define( 'WP_DEBUG', false );

class WPHX_311_07_Fake_WPDB {
\tpublic $options = 'wp_options';
\tpublic $queries = array();
\tpublic $last_error = '';
\tprivate $suppress_errors = false;
\tprivate $store = array();

\tpublic function reset() {
\t\t$this->queries = array();
\t\t$this->store   = array();
\t}

\tpublic function set_option( $name, $value, $autoload = 'off' ) {
\t\t$this->store[ $name ] = array(
\t\t\t'option_value' => maybe_serialize( $value ),
\t\t\t'autoload'     => $autoload,
\t\t);
\t}

\tpublic function snapshot() {
\t\t$result = array();
\t\tforeach ( $this->store as $name => $row ) {
\t\t\t$result[ $name ] = array(
\t\t\t\t'value'    => maybe_unserialize( $row['option_value'] ),
\t\t\t\t'autoload' => $row['autoload'],
\t\t\t);
\t\t}
\t\tksort( $result );
\t\treturn $result;
\t}

\tpublic function suppress_errors( $suppress = null ) {
\t\t$previous = $this->suppress_errors;
\t\tif ( null !== $suppress ) {
\t\t\t$this->suppress_errors = (bool) $suppress;
\t\t}
\t\treturn $previous;
\t}

\tpublic function strip_invalid_text_for_column( $table, $column, $value ) {
\t\treturn $value;
\t}

\tpublic function _escape( $data ) {
\t\tif ( is_array( $data ) ) {
\t\t\treturn array_map( array( $this, '_escape' ), $data );
\t\t}
\t\treturn str_replace( \"'\", \"\\\\'\", (string) $data );
\t}

\tpublic function esc_like( $text ) {
\t\treturn addcslashes( $text, '_%\\\\' );
\t}

\tpublic function prepare( $query, ...$args ) {
\t\tif ( 1 === count( $args ) && is_array( $args[0] ) ) {
\t\t\t$args = $args[0];
\t\t}
\t\treturn array(
\t\t\t'query' => $query,
\t\t\t'args'  => array_values( $args ),
\t\t);
\t}

\tprivate function unpack_query( $query ) {
\t\tif ( is_array( $query ) ) {
\t\t\treturn array( $query['query'], $query['args'] );
\t\t}
\t\treturn array( $query, array() );
\t}

\tprivate function record( $operation, $query, $args = array(), $extra = array() ) {
\t\t$this->queries[] = array_merge(
\t\t\tarray(
\t\t\t\t'operation' => $operation,
\t\t\t\t'query'     => preg_replace( '/\\s+/', ' ', trim( (string) $query ) ),
\t\t\t\t'args'      => $args,
\t\t\t),
\t\t\t$extra
\t\t);
\t}

\tpublic function get_results( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_results', $sql, $args );
\t\treturn array();
\t}

\tpublic function get_row( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_row', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\t$row = $this->store[ $option ];
\t\tif ( false !== strpos( $sql, 'autoload' ) && false === strpos( $sql, 'option_value' ) ) {
\t\t\treturn (object) array( 'autoload' => $row['autoload'] );
\t\t}
\t\treturn (object) array(
\t\t\t'option_value' => $row['option_value'],
\t\t\t'autoload'     => $row['autoload'],
\t\t);
\t}

\tpublic function get_var( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'get_var', $sql, $args );
\t\t$option = $args[0] ?? null;
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn null;
\t\t}
\t\tif ( false !== strpos( $sql, 'autoload' ) ) {
\t\t\treturn $this->store[ $option ]['autoload'];
\t\t}
\t\treturn $this->store[ $option ]['option_value'];
\t}

\tpublic function update( $table, $data, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'update', 'UPDATE ' . $table, array(), array( 'data' => $data, 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tif ( array_key_exists( 'option_value', $data ) ) {
\t\t\t$this->store[ $option ]['option_value'] = $data['option_value'];
\t\t}
\t\tif ( array_key_exists( 'autoload', $data ) ) {
\t\t\t$this->store[ $option ]['autoload'] = $data['autoload'];
\t\t}
\t\treturn 1;
\t}

\tpublic function delete( $table, $where ) {
\t\t$option = $where['option_name'] ?? null;
\t\t$this->record( 'delete', 'DELETE ' . $table, array(), array( 'where' => $where ) );
\t\tif ( null === $option || ! isset( $this->store[ $option ] ) ) {
\t\t\treturn false;
\t\t}
\t\tunset( $this->store[ $option ] );
\t\treturn 1;
\t}

\tpublic function query( $query ) {
\t\tlist( $sql, $args ) = $this->unpack_query( $query );
\t\t$this->record( 'query', $sql, $args );
\t\tif ( false !== strpos( $sql, 'INSERT INTO' ) && count( $args ) >= 3 ) {
\t\t\t$this->store[ $args[0] ] = array(
\t\t\t\t'option_value' => $args[1],
\t\t\t\t'autoload'     => $args[2],
\t\t\t);
\t\t\treturn 1;
\t\t}
\t\treturn true;
\t}
}

global $wpdb;
$wpdb = new WPHX_311_07_Fake_WPDB();

function current_user_can( $capability, ...$args ) {
\t$GLOBALS['wphx_311_07_capability_checks'][] = array(
\t\t'capability' => $capability,
\t\t'args'       => $args,
\t);
\treturn (bool) $GLOBALS['wphx_311_07_can_manage_options'];
}

function is_user_logged_in() {
\treturn (bool) $GLOBALS['wphx_311_07_logged_in'];
}

require_once ABSPATH . WPINC . '/plugin.php';
require_once ABSPATH . WPINC . '/compat.php';
require_once ABSPATH . WPINC . '/utf8.php';
require_once ABSPATH . WPINC . '/load.php';
require_once ABSPATH . WPINC . '/pomo/translations.php';
require_once ABSPATH . WPINC . '/l10n.php';
require_once ABSPATH . WPINC . '/class-wp-list-util.php';
require_once ABSPATH . WPINC . '/class-wp-error.php';
require_once ABSPATH . WPINC . '/class-wp-http-response.php';
require_once ABSPATH . WPINC . '/functions.php';
require_once ABSPATH . WPINC . '/cache.php';
require_once ABSPATH . WPINC . '/kses.php';
require_once ABSPATH . WPINC . '/formatting.php';
require_once ABSPATH . WPINC . '/option.php';
require_once ABSPATH . WPINC . '/link-template.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-request.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-response.php';
require_once ABSPATH . WPINC . '/rest-api/class-wp-rest-server.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-controller.php';
require_once ABSPATH . WPINC . '/rest-api.php';
require_once ABSPATH . WPINC . '/rest-api/endpoints/class-wp-rest-settings-controller.php';

wp_cache_init();

class WPHX_311_07_Capturing_REST_Server extends WP_REST_Server {
\tpublic $captured_headers = array();
\tpublic $removed_headers = array();
\tpublic $captured_status = null;

\tpublic function send_header( $key, $value ) {
\t\t$value = preg_replace( '/\\s+/', ' ', $value );
\t\t$this->captured_headers[ $key ] = $value;
\t}

\tpublic function remove_header( $key ) {
\t\t$this->removed_headers[] = $key;
\t\tunset( $this->captured_headers[ $key ] );
\t}

\tprotected function set_status( $code ) {
\t\t$this->captured_status = (int) $code;
\t}
}

function wphx_311_07_reset_state() {
\tglobal $wpdb, $wp_filter, $wp_actions, $wp_filters, $wp_current_filter, $wp_registered_settings, $new_allowed_options, $wp_rest_server;
\t$wpdb->reset();
\t$wpdb->set_option( 'home', 'https://example.test', 'on' );
\t$wpdb->set_option( 'siteurl', 'https://example.test', 'on' );
\t$wpdb->set_option( 'blog_charset', 'UTF-8', 'on' );
\t$wpdb->set_option( 'permalink_structure', '', 'on' );
\twp_cache_flush();
\t$wp_filter              = array();
\t$wp_actions             = array();
\t$wp_filters             = array();
\t$wp_current_filter      = array();
\t$wp_registered_settings = array();
\t$new_allowed_options    = array();
\t$GLOBALS['new_whitelist_options']          = &$new_allowed_options;
\t$GLOBALS['wp_rest_additional_fields']      = array();
\t$GLOBALS['wphx_311_07_events']             = array();
\t$GLOBALS['wphx_311_07_capability_checks']  = array();
\t$GLOBALS['wphx_311_07_can_manage_options'] = true;
\t$GLOBALS['wphx_311_07_logged_in']          = true;
\t$_GET = array();
\t$_POST = array();
\t$_FILES = array();
\t$_SERVER = array(
\t\t'REQUEST_METHOD' => 'GET',
\t\t'SERVER_PROTOCOL' => 'HTTP/1.1',
\t\t'HTTP_HOST' => 'example.test',
\t\t'SERVER_NAME' => 'example.test',
\t);
\t$wp_rest_server = new WPHX_311_07_Capturing_REST_Server();
\tdo_action( 'rest_api_init', $wp_rest_server );
}

function wphx_311_07_register_settings() {
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_text',
\t\tarray(
\t\t\t'type'         => 'string',
\t\t\t'label'        => 'REST text',
\t\t\t'description'  => 'REST-visible text setting',
\t\t\t'show_in_rest' => true,
\t\t\t'default'      => 'fallback-text',
\t\t)
\t);
\tregister_setting(
\t\t'wphx_rest_group',
\t\t'wphx_rest_named',
\t\tarray(
\t\t\t'type'         => 'integer',
\t\t\t'label'        => 'Named count',
\t\t\t'description'  => 'REST-visible renamed integer',
\t\t\t'default'      => 7,
\t\t\t'show_in_rest' => array(
\t\t\t\t'name'   => 'renamed_count',
\t\t\t\t'schema' => array(
\t\t\t\t\t'minimum' => 0,
\t\t\t\t\t'context' => array( 'view', 'edit' ),
\t\t\t\t),
\t\t\t),
\t\t)
\t);
}

function wphx_311_07_seed_options() {
\tglobal $wpdb;
\t$wpdb->set_option( 'wphx_rest_text', ' stored text ', 'off' );
\t$wpdb->set_option( 'wphx_rest_named', '12', 'off' );
}

function wphx_311_07_server() {
\t$controller = new WP_REST_Settings_Controller();
\t$controller->register_routes();
\treturn rest_get_server();
}

function wphx_311_07_normalize_body( $body ) {
\t$decoded = json_decode( $body, true );
\tif ( JSON_ERROR_NONE === json_last_error() ) {
\t\treturn array( 'kind' => 'json', 'value' => $decoded );
\t}
\treturn array( 'kind' => 'raw', 'value' => $body );
}

function wphx_311_07_run_http_case( $id, $method, $path, $query = array(), $body = array(), $setup = null ) {
\twphx_311_07_reset_state();
\twphx_311_07_register_settings();
\twphx_311_07_seed_options();
\t$server = wphx_311_07_server();
\t$_SERVER['REQUEST_METHOD'] = $method;
\t$_GET = $query;
\t$_POST = $body;
\tif ( is_callable( $setup ) ) {
\t\t$setup( $server );
\t}
\tob_start();
\t$return = $server->serve_request( $path );
\t$output = ob_get_clean();
\tglobal $wpdb;
\treturn array(
\t\t'id' => $id,
\t\t'return' => $return,
\t\t'status' => $server->captured_status,
\t\t'headers' => $server->captured_headers,
\t\t'removedHeaders' => $server->removed_headers,
\t\t'body' => wphx_311_07_normalize_body( $output ),
\t\t'events' => $GLOBALS['wphx_311_07_events'],
\t\t'capabilityChecks' => $GLOBALS['wphx_311_07_capability_checks'],
\t\t'options' => $wpdb->snapshot(),
\t);
}

function wphx_311_07_run_cases() {
\t$cases = array();
\t$cases[] = wphx_311_07_run_http_case( 'rest-http:get-settings-success', 'GET', '/wp/v2/settings' );
\t$cases[] = wphx_311_07_run_http_case(
\t\t'rest-http:post-settings-update',
\t\t'POST',
\t\t'/wp/v2/settings',
\t\tarray(),
\t\tarray( 'wphx_rest_text' => 123, 'renamed_count' => '19' )
\t);
\t$cases[] = wphx_311_07_run_http_case( 'rest-http:no-route-404', 'GET', '/wp/v2/missing' );
\t$cases[] = wphx_311_07_run_http_case( 'rest-http:head-no-body', 'HEAD', '/wp/v2/settings' );
\t$cases[] = wphx_311_07_run_http_case(
\t\t'rest-http:pre-serve-manual',
\t\t'GET',
\t\t'/wp/v2/settings',
\t\tarray(),
\t\tarray(),
\t\tfunction () {
\t\t\tadd_filter(
\t\t\t\t'rest_pre_serve_request',
\t\t\t\tfunction ( $served, $result, $request, $server ) {
\t\t\t\t\t$GLOBALS['wphx_311_07_events'][] = array(
\t\t\t\t\t\t'hook' => 'rest_pre_serve_request',
\t\t\t\t\t\t'route' => $request->get_route(),
\t\t\t\t\t\t'status' => $result->get_status(),
\t\t\t\t\t);
\t\t\t\t\techo 'manual-rest-output';
\t\t\t\t\treturn true;
\t\t\t\t},
\t\t\t\t10,
\t\t\t\t4
\t\t\t);
\t\t}
\t);
\t$cases[] = wphx_311_07_run_http_case(
\t\t'rest-http:get-settings-embed',
\t\t'GET',
\t\t'/wp/v2/settings',
\t\tarray( '_embed' => '1' )
\t);
\treturn $cases;
}

$reflection = new ReflectionClass( 'WP_REST_Server' );
$class_file = realpath( $reflection->getFileName() );
$expected_class_file = realpath( $root . '/wp-includes/rest-api/class-wp-rest-server.php' );
$included = array_map( 'realpath', get_included_files() );
$included = array_values( array_filter( $included, static fn( $file ) => is_string( $file ) ) );
$owned_methods = array();
foreach ( array( 'serve_request', 'dispatch', 'respond_to_request' ) as $method_name ) {
\t$method = $reflection->getMethod( $method_name );
\t$owned_methods[ $method_name ] = array(
\t\t'declaring_class' => $method->getDeclaringClass()->getName(),
\t\t'declaring_file' => realpath( $method->getFileName() ),
\t\t'declared_in_package_file' => realpath( $method->getFileName() ) === $expected_class_file,
\t);
}

$snapshot = array(
\t'mode' => $mode,
\t'phpVersion' => PHP_VERSION,
\t'haxeStrategyLoaded' => class_exists( '\\\\wphx\\\\wp\\\\rest\\\\RestServerDispatchStrategy' ),
\t'packageBoundary' => array(
\t\t'classFile' => $class_file,
\t\t'expectedClassFile' => $expected_class_file,
\t\t'classDeclaredInPackage' => $class_file === $expected_class_file,
\t\t'upstreamServerIncluded' => $upstream_server !== false && in_array( $upstream_server, $included, true ),
\t\t'ownedMethods' => $owned_methods,
\t),
\t'cases' => wphx_311_07_run_cases(),
\t'phpErrors' => $GLOBALS['wphx_311_07_php_errors'],
);

echo json_encode( $snapshot, JSON_UNESCAPED_SLASHES );
`
  );
}

function normalize(result) {
  return {
    cases: result.cases,
    phpErrors: result.phpErrors
  };
}

function runProbe(commandPath, runtimeId, mode, root) {
  const output = command(commandPath, [PROBE, mode, root, `${UPSTREAM_ROOT}/src/wp-includes/rest-api/class-wp-rest-server.php`]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `${commandPath} ${PROBE} ${mode} ${root}`,
    result: JSON.parse(output)
  };
}

function runDockerProbe(runtimeId, image, mode, root) {
  const dockerRoot = `/work/${root}`;
  const upstreamServer = "/work/../wordpress-develop/src/wp-includes/rest-api/class-wp-rest-server.php";
  const output = command("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "-v", `${resolve(UPSTREAM_ROOT)}:/wordpress-develop`, "-w", "/work", image, "php", PROBE, mode, dockerRoot, upstreamServer]);
  return {
    id: `${runtimeId}:${mode}`,
    runtime: runtimeId,
    mode,
    command: `docker run --rm -v $PWD:/work -v ${resolve(UPSTREAM_ROOT)}:/wordpress-develop -w /work ${image} php ${PROBE} ${mode} ${dockerRoot}`,
    image,
    result: JSON.parse(output)
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
      throw new Error(`${path} is stale; run npm run wp:core:wphx-311-rest-server-packaged-http`);
    }
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function assertPackageBoundary(result) {
  const checks = {
    class_declared_in_package: result.packageBoundary.classDeclaredInPackage,
    upstream_server_not_included: !result.packageBoundary.upstreamServerIncluded,
    owned_methods_declared_in_package: Object.values(result.packageBoundary.ownedMethods).every((method) => method.declared_in_package_file),
    haxe_strategy_loaded: result.haxeStrategyLoaded
  };
  return {
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    checks
  };
}

function ownershipManifest(manifestSha, upstreamDigest) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/rest-server-packaged-http",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "packaged-distribution-http-gate",
      name: "WP_REST_Server packaged dispatch and serve_request gate",
      area: "wp-includes/rest-api/class-wp-rest-server.php",
      public_contract:
        "The packaged REST server candidate must own the WP_REST_Server class file without upstream fallback while preserving serve_request() output, status, header intent, CORS header filters, rest_pre_serve_request, and settings endpoint behavior."
    },
    ownership_state: "packaged_distribution_candidate",
    upstream: {
      repo: UPSTREAM_ROOT,
      ref: WP_REF,
      paths: SOURCE_FILES,
      digest: upstreamDigest
    },
    owned_paths: [HXML, RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, BUILD_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-311-rest-server-packaged-http",
        "npm run wp:core:wphx-311-rest-server-packaged-http:check",
        "npm run wp:core:wphx-311-rest-server-dispatch-candidate:check",
        "npm run ci:php-conformance:check",
        "npm run beads:validate",
        "npm run receipts:validate"
      ],
      receipt_refs: [
        "receipt:wphx-311-07-rest-server-packaged-http",
        "receipt:wphx-311-06-rest-server-dispatch-strategy-candidate"
      ],
      manifest_digest: manifestSha
    },
    notes:
      "This gate proves a packaged source-root boundary and CLI-safe HTTP serving traces. Browser/web-server E2E, upstream PHPUnit ratcheting, full auth/capability behavior, and a complete REST server Haxe class port remain separate work."
  };
}

const lock = JSON.parse(readFileSync("toolchain.lock.json", "utf8"));
rmSync(BUILD_ROOT, { recursive: true, force: true });
copySources(ORACLE_ROOT);
copySources(CANDIDATE_ROOT);
command("haxe", [HXML]);
mkdirSync(`${CANDIDATE_ROOT}/haxe`, { recursive: true });
copyTree(HAXE_OUT, `${CANDIDATE_ROOT}/haxe`);
transformCandidateRestServer();
writeProbe();
command("php", ["-l", `${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`]);
command("php", ["-l", PROBE]);

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
    skippedRuntimes.push({ id: runtimeId, image, reason: "docker server unavailable" });
  }
}

const failedComparisons = comparisons.filter((entry) => !entry.matches);
const candidateBoundaries = runs
  .filter((run) => run.mode === "candidate")
  .map((run) => ({
    id: run.id,
    runtime: run.runtime,
    ...assertPackageBoundary(run.result)
  }));
const failedPackageBoundaries = candidateBoundaries.filter((entry) => entry.status !== "passed");
if (failedComparisons.length > 0 || failedPackageBoundaries.length > 0) {
  console.error(JSON.stringify({ status: "failed", failedComparisons, failedPackageBoundaries }, null, 2));
  process.exit(1);
}

const sourceUnits = SOURCE_FILES.map(sourceRecord);
const upstreamDigest = sha256(JSON.stringify(sourceUnits.map((unit) => ({ path: unit.path, sha256: unit.sha256 }))));
const packageFiles = filesUnder(CANDIDATE_ROOT).map((file) => ({
  path: `${CANDIDATE_ROOT}/${file.path}`,
  bytes: file.bytes,
  sha256: `sha256:${file.sha256}`
}));
const manifest = {
  schema: "wphx.wp-core-rest-server-packaged-http.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["targeted_semantic_parity", "runtime_abi"],
  artifact_scope: "packaged_distribution",
  inputs: {
    runner: inputRecord(RUNNER),
    haxe_sources: HAXE_SOURCES.map(inputRecord),
    prior_manifests: PRIOR_MANIFESTS.filter((path) => existsSync(path)).map(inputRecord),
    toolchain_lock: inputRecord("toolchain.lock.json"),
    source_units: sourceUnits,
    upstream_digest: upstreamDigest
  },
  package: {
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    candidate_files: packageFiles,
    haxe_out: HAXE_OUT,
    candidate_rest_server: inputRecord(`${CANDIDATE_ROOT}/wp-includes/rest-api/class-wp-rest-server.php`)
  },
  fixture: {
    cases: CASES,
    owned_methods: OWNED_METHODS,
    native_boundaries: [
      {
        id: "http-side-effects-captured-in-php",
        reason:
          "serve_request() uses PHP-native header/status/output effects. The probe captures these through a subclass override while preserving the WordPress-facing methods."
      },
      {
        id: "deterministic-wpdb-option-store",
        reason:
          "The settings endpoint runs through real REST/settings/option code, but deterministic wpdb storage replaces a live database for this HTTP-serving gate."
      },
      {
        id: "cli-safe-http-harness",
        reason:
          "This gate executes serve_request() in PHP CLI processes. Full web-server/browser REST behavior remains an E2E follow-up."
      }
    ]
  },
  runtimes: {
    local: {
      id: "local-php-cli",
      php_version_family: phpVersionFamily(localOracle.result.phpVersion),
      executable: "php"
    },
    docker: dockerImages.map(([id, image]) => ({ id, image })),
    skipped: skippedRuntimes
  },
  runs: runs.map((run) => ({
    id: run.id,
    runtime: run.runtime,
    mode: run.mode,
    command: stableCommand(run.command),
    image: run.image ?? null,
    normalized_sha256: sha256(JSON.stringify(normalize(run.result))),
    php_version_family: phpVersionFamily(run.result.phpVersion),
    package_boundary: stableRuntimeValue(run.result.packageBoundary)
  })),
  comparisons,
  package_boundaries: candidateBoundaries,
  remaining_gaps: [
    {
      id: "full-web-server-e2e-deferred",
      owner: "WPHX-311/WPHX-322",
      detail:
        "This gate captures serve_request() output/status/header intent in CLI. Web-server transport, real headers, REST URL routing, and browser fetch behavior remain later E2E closure."
    },
    {
      id: "full-auth-capability-deferred",
      owner: "WPHX-312/WPHX-322",
      detail:
        "Capability and logged-in state are deterministic PHP boundaries here. Full roles/users/authentication behavior remains outside this REST server gate."
    },
    {
      id: "complete-rest-server-haxe-class-deferred",
      owner: "WPHX-311",
      detail:
        "The package owns the class file and dispatch decisions, but most WP_REST_Server method bodies still come from mirrored WordPress PHP source."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: "passed",
    evidence_classes: ["targeted_semantic_parity", "runtime_abi"],
    artifact_scope: "packaged_distribution",
    package_boundaries: candidateBoundaries,
    package_boundary_runtimes: candidateBoundaries.length,
    fixture_cases: CASES.length,
    comparisons: comparisons.length,
    skipped_runtimes: skippedRuntimes.length
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha, upstreamDigest), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-311-07-rest-server-packaged-http",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    {
      path: OUT,
      role: "REST server packaged HTTP parity and no-fallback manifest"
    },
    {
      path: OWNERSHIP,
      role: "packaged REST server ownership manifest"
    },
    {
      path: RUNNER,
      role: "packaged HTTP gate generator and check-mode validator"
    }
  ],
  verification_commands: [
    "npm run wp:core:wphx-311-rest-server-packaged-http",
    "npm run wp:core:wphx-311-rest-server-packaged-http:check",
    "npm run wp:core:wphx-311-rest-server-dispatch-candidate:check",
    "npm run ci:php-conformance:check",
    "npm run beads:validate",
    "npm run receipts:validate"
  ],
  related_receipts: [
    "receipt:wphx-311-06-rest-server-dispatch-strategy-candidate",
    "receipt:wphx-311-05-rest-settings-update-strategy-candidate",
    "receipt:wphx-311-02-rest-settings-dispatch-fixture"
  ],
  manifest_sha256: manifestSha,
  validation_result: manifest.validation_result
};
const receiptText = JSON.stringify(receipt, null, 2) + "\n";

try {
  writeOrCheck(OUT, manifestText);
  writeOrCheck(OWNERSHIP, ownershipText);
  writeOrCheck(RECEIPT, receiptText);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      manifest: OUT,
      ownership: OWNERSHIP,
      receipt: RECEIPT,
      cases: CASES.length,
      comparisons: comparisons.length,
      skipped_runtimes: skippedRuntimes.length
    },
    null,
    2
  )
);
