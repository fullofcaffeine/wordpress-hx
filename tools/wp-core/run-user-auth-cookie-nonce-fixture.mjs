#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.13.2",
  external_ref: "WPHX-306.04",
  title: "Auth cookie and nonce oracle fixture"
};
const OUT_ROOT = "build/wp-core/wphx-306-04";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-306-04-auth-cookie-nonce-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-306-04-auth-cookie-nonce-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-306-04-auth-cookie-nonce-fixture.v1.json";
const FOUNDATION = "manifests/wp-core/wphx-306-02-auth-adapter-contract-candidate.v1.json";
const SURFACE = "manifests/wp-core/wphx-306-01-user-auth-surface.v1.json";
const RECORDED_AT = "2026-06-23T22:05:00.000Z";
const WP_REF = "26b68024931348d267b70e2a29910e1320d0094f";
const UPSTREAM_ROOT = "../wordpress-develop";

const SOURCE_FILES = ["src/wp-includes/pluggable.php"];

const COVERED_SYMBOLS = [
  "wp_generate_auth_cookie",
  "wp_parse_auth_cookie",
  "wp_validate_auth_cookie",
  "wp_set_auth_cookie",
  "wp_clear_auth_cookie",
  "wp_nonce_tick",
  "wp_create_nonce",
  "wp_verify_nonce",
  "wp_hash",
  "wp_salt",
  "wp_get_session_token"
];

const FIXTURE_CASES = [
  { id: "auth-cookie:generate-parse-validate", symbol: "wp_generate_auth_cookie/wp_validate_auth_cookie", focus: "valid auth cookie roundtrip with deterministic token and salts" },
  { id: "auth-cookie:bad-hash", symbol: "wp_validate_auth_cookie", focus: "tampered HMAC fails and fires auth_cookie_bad_hash" },
  { id: "auth-cookie:bad-session-token", symbol: "wp_validate_auth_cookie", focus: "valid HMAC with revoked token fails session verification" },
  { id: "auth-cookie:malformed", symbol: "wp_parse_auth_cookie/wp_validate_auth_cookie", focus: "malformed cookie returns false and fires malformed hook" },
  { id: "auth-cookie:set", symbol: "wp_set_auth_cookie", focus: "auth and logged-in cookie generation, scheme selection, expiry deltas, and set-cookie intent" },
  { id: "auth-cookie:clear", symbol: "wp_clear_auth_cookie", focus: "clear-cookie intent and clear_auth_cookie hook" },
  { id: "nonce:current-previous-invalid", symbol: "wp_create_nonce/wp_verify_nonce", focus: "current tick returns 1, previous tick returns 2, invalid nonce returns false and fires failure hook" },
  { id: "nonce:logged-out-filter", symbol: "nonce_user_logged_out", focus: "logged-out nonce UID filter participates in nonce creation and verification" },
  { id: "pluggable:declaration-timing", symbol: "function_exists guards", focus: "selected pluggable functions are declared after include and were not declared before include" }
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
$_SERVER['REQUEST_METHOD'] = 'GET';
$_COOKIE = array();

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );
define( 'WP_DEBUG', false );
define( 'DAY_IN_SECONDS', 86400 );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'YEAR_IN_SECONDS', 31536000 );
define( 'COOKIEHASH', 'wphx-cookiehash' );
define( 'AUTH_COOKIE', 'wordpress_' . COOKIEHASH );
define( 'SECURE_AUTH_COOKIE', 'wordpress_sec_' . COOKIEHASH );
define( 'LOGGED_IN_COOKIE', 'wordpress_logged_in_' . COOKIEHASH );
define( 'USER_COOKIE', 'wordpressuser_' . COOKIEHASH );
define( 'PASS_COOKIE', 'wordpresspass_' . COOKIEHASH );
define( 'COOKIEPATH', '/' );
define( 'SITECOOKIEPATH', '/site/' );
define( 'ADMIN_COOKIE_PATH', '/site/wp-admin' );
define( 'PLUGINS_COOKIE_PATH', '/site/wp-content/plugins' );
define( 'COOKIE_DOMAIN', 'example.test' );
define( 'AUTH_KEY', 'wphx-auth-key' );
define( 'AUTH_SALT', 'wphx-auth-salt' );
define( 'SECURE_AUTH_KEY', 'wphx-secure-auth-key' );
define( 'SECURE_AUTH_SALT', 'wphx-secure-auth-salt' );
define( 'LOGGED_IN_KEY', 'wphx-logged-in-key' );
define( 'LOGGED_IN_SALT', 'wphx-logged-in-salt' );
define( 'NONCE_KEY', 'wphx-nonce-key' );
define( 'NONCE_SALT', 'wphx-nonce-salt' );
define( 'SECRET_KEY', 'wphx-secret-key' );
define( 'SECRET_SALT', 'wphx-secret-salt' );

$GLOBALS['wphx_306_04_filters'] = array();
$GLOBALS['wphx_306_04_actions'] = array();
$GLOBALS['wphx_306_04_sessions'] = array();
$GLOBALS['wphx_306_04_users'] = array();
$GLOBALS['wphx_306_04_current_user_id'] = 1;
$GLOBALS['wphx_306_04_php_errors'] = array();

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_306_04_php_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WP_User {
\tpublic $ID = 0;
\tpublic $user_login = '';
\tpublic $user_pass = '';
\tpublic function __construct( $id = 0, $login = '', $pass = '' ) {
\t\t$this->ID = (int) $id;
\t\t$this->user_login = $login;
\t\t$this->user_pass = $pass;
\t}
\tpublic function exists() {
\t\treturn $this->ID > 0;
\t}
}

class WP_Session_Tokens {
\tprivate $user_id;
\tpublic static function get_instance( $user_id ) {
\t\treturn new self( $user_id );
\t}
\tpublic function __construct( $user_id ) {
\t\t$this->user_id = (int) $user_id;
\t}
\tpublic function create( $expiration ) {
\t\t$token = 'created-token-' . $this->user_id . '-' . $expiration;
\t\t$GLOBALS['wphx_306_04_sessions'][ $this->user_id ][ $token ] = array( 'expiration' => $expiration );
\t\treturn $token;
\t}
\tpublic function verify( $token ) {
\t\treturn ! empty( $GLOBALS['wphx_306_04_sessions'][ $this->user_id ][ $token ] );
\t}
}

function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wphx_306_04_filters'][ $hook_name ][ $priority ][] = array( $callback, $accepted_args );
\tksort( $GLOBALS['wphx_306_04_filters'][ $hook_name ] );
\treturn true;
}
function apply_filters( $hook_name, $value, ...$args ) {
\tif ( empty( $GLOBALS['wphx_306_04_filters'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tforeach ( $GLOBALS['wphx_306_04_filters'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\t$callback_args = array_merge( array( $value ), $args );
\t\t\t$value = call_user_func_array( $record[0], array_slice( $callback_args, 0, $record[1] ) );
\t\t}
\t}
\treturn $value;
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_306_04_actions'][] = array(
\t\t'hook' => $hook_name,
\t\t'args' => wphx_306_04_normalize_action_args( $args ),
\t);
\tapply_filters( $hook_name, null, ...$args );
}
function __( $text ) { return $text; }
function wp_prime_site_option_caches( $options ) { return null; }
function get_site_option( $name, $default = false ) {
\t$values = array(
\t\t'siteurl' => 'https://example.test/site',
\t\t'auth_key' => AUTH_KEY,
\t\t'auth_salt' => AUTH_SALT,
\t\t'secure_auth_key' => SECURE_AUTH_KEY,
\t\t'secure_auth_salt' => SECURE_AUTH_SALT,
\t\t'logged_in_key' => LOGGED_IN_KEY,
\t\t'logged_in_salt' => LOGGED_IN_SALT,
\t\t'nonce_key' => NONCE_KEY,
\t\t'nonce_salt' => NONCE_SALT,
\t\t'secret_key' => SECRET_KEY,
\t);
\treturn array_key_exists( $name, $values ) ? $values[ $name ] : $default;
}
function update_site_option( $name, $value ) { return true; }
function wp_generate_password( $length = 12, $special_chars = true, $extra_special_chars = false ) {
\treturn str_repeat( 'x', (int) $length );
}
function get_option( $name, $default = false ) {
\tif ( 'home' === $name ) {
\t\treturn 'https://example.test';
\t}
\tif ( 'siteurl' === $name ) {
\t\treturn 'https://example.test/site';
\t}
\treturn $default;
}
function is_ssl() { return false; }
function wp_doing_ajax() { return false; }
function get_userdata( $user_id ) {
\treturn $GLOBALS['wphx_306_04_users'][ (int) $user_id ] ?? false;
}
function get_user_by( $field, $value ) {
\tforeach ( $GLOBALS['wphx_306_04_users'] as $user ) {
\t\tif ( 'login' === $field && $user->user_login === $value ) {
\t\t\treturn $user;
\t\t}
\t}
\treturn false;
}
function wp_get_current_user() {
\treturn get_userdata( $GLOBALS['wphx_306_04_current_user_id'] ) ?: new WP_User();
}
function get_current_user_id() {
\t$user = wp_get_current_user();
\treturn $user->ID;
}
function wp_get_session_token() {
\treturn 'session-token-current';
}

$declared_before = array(
\t'wp_validate_auth_cookie' => function_exists( 'wp_validate_auth_cookie' ),
\t'wp_generate_auth_cookie' => function_exists( 'wp_generate_auth_cookie' ),
\t'wp_create_nonce' => function_exists( 'wp_create_nonce' ),
\t'wp_verify_nonce' => function_exists( 'wp_verify_nonce' ),
);

require $root . '/wp-includes/pluggable.php';

function wphx_306_04_normalize_action_args( $args ) {
\t$result = array();
\t$now = time();
\tforeach ( $args as $arg ) {
\t\tif ( $arg instanceof WP_User ) {
\t\t\t$result[] = array( 'WP_User' => array( 'ID' => $arg->ID, 'user_login' => $arg->user_login ) );
\t\t} elseif ( is_array( $arg ) ) {
\t\t\t$result[] = wphx_306_04_normalize_action_args( $arg );
\t\t} elseif ( is_int( $arg ) && $arg > $now - YEAR_IN_SECONDS && $arg < $now + 20 * DAY_IN_SECONDS ) {
\t\t\t$result[] = array( 'time_delta_kind' => wphx_306_04_time_delta_kind( $arg - $now ) );
\t\t} elseif ( is_string( $arg ) && strlen( $arg ) > 40 && false !== strpos( $arg, '|' ) ) {
\t\t\t$result[] = wphx_306_04_dynamic_cookie_summary( $arg, $now );
\t\t} else {
\t\t\t$result[] = $arg;
\t\t}
\t}
\treturn $result;
}

function wphx_306_04_time_delta_kind( $delta ) {
\tif ( $delta > 1220000 ) {
\t\treturn 'remember_browser_expire';
\t}
\tif ( $delta > 1200000 ) {
\t\treturn 'remember_expiration';
\t}
\tif ( 0 === $delta ) {
\t\treturn 'session_cookie_expire';
\t}
\tif ( $delta < 0 ) {
\t\treturn 'past_expiration';
\t}
\treturn 'relative_' . round( $delta / HOUR_IN_SECONDS ) . 'h';
}

function wphx_306_04_dynamic_cookie_summary( $cookie, $now ) {
\t$parts = explode( '|', $cookie );
\t$expiration = isset( $parts[1] ) && is_numeric( $parts[1] ) ? (int) $parts[1] : 0;
\treturn array(
\t\t'parts' => count( $parts ),
\t\t'username' => $parts[0] ?? null,
\t\t'expiration_delta_kind' => $expiration ? wphx_306_04_time_delta_kind( $expiration - $now ) : null,
\t\t'token' => $parts[2] ?? null,
\t\t'hmac_length' => isset( $parts[3] ) ? strlen( $parts[3] ) : null,
\t);
}

function wphx_306_04_cookie_summary( $cookie ) {
\t$parts = explode( '|', $cookie );
\treturn array(
\t\t'sha256' => hash( 'sha256', $cookie ),
\t\t'parts' => count( $parts ),
\t\t'username' => $parts[0] ?? null,
\t\t'expiration_is_expected' => isset( $parts[1] ) && '2000000000' === $parts[1],
\t\t'token' => $parts[2] ?? null,
\t\t'hmac_length' => isset( $parts[3] ) ? strlen( $parts[3] ) : null,
\t);
}

function wphx_306_04_recent_actions( $hook_name ) {
\treturn array_values(
\t\tarray_filter(
\t\t\t$GLOBALS['wphx_306_04_actions'],
\t\t\tfunction ( $action ) use ( $hook_name ) {
\t\t\t\treturn $action['hook'] === $hook_name;
\t\t\t}
\t\t)
\t);
}

$GLOBALS['wphx_306_04_users'][1] = new WP_User( 1, 'admin', '$wp$2y$10$abcdefghijklmnopqrstuvLAST' );
$GLOBALS['wphx_306_04_sessions'][1] = array( 'session-token-current' => array( 'expiration' => 2000000000 ) );
add_filter( 'nonce_life', function ( $lifespan, $action ) { return 4102444800; }, 10, 2 );
add_filter( 'nonce_user_logged_out', function ( $uid, $action ) { return 'logged-out-action' === $action ? 77 : $uid; }, 10, 2 );

$observations = array();
$observations['pluggable:declared-before'] = $declared_before;
$observations['pluggable:declared-after'] = array(
\t'wp_validate_auth_cookie' => function_exists( 'wp_validate_auth_cookie' ),
\t'wp_generate_auth_cookie' => function_exists( 'wp_generate_auth_cookie' ),
\t'wp_create_nonce' => function_exists( 'wp_create_nonce' ),
\t'wp_verify_nonce' => function_exists( 'wp_verify_nonce' ),
);

$cookie = wp_generate_auth_cookie( 1, 2000000000, 'auth', 'session-token-current' );
$observations['auth-cookie:generated'] = wphx_306_04_cookie_summary( $cookie );
$observations['auth-cookie:parsed'] = wp_parse_auth_cookie( $cookie, 'auth' );
$observations['auth-cookie:validated'] = wp_validate_auth_cookie( $cookie, 'auth' );

$bad_hash_cookie = preg_replace( '/[^|]+$/', 'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb', $cookie );
$observations['auth-cookie:bad-hash'] = wp_validate_auth_cookie( $bad_hash_cookie, 'auth' );
$observations['auth-cookie:bad-hash-actions'] = wphx_306_04_recent_actions( 'auth_cookie_bad_hash' );

$bad_token_cookie = wp_generate_auth_cookie( 1, 2000000000, 'auth', 'revoked-token' );
$observations['auth-cookie:bad-session-token'] = wp_validate_auth_cookie( $bad_token_cookie, 'auth' );
$observations['auth-cookie:bad-session-actions'] = wphx_306_04_recent_actions( 'auth_cookie_bad_session_token' );

$observations['auth-cookie:malformed'] = wp_validate_auth_cookie( 'not|enough|parts', 'auth' );
$observations['auth-cookie:malformed-actions'] = wphx_306_04_recent_actions( 'auth_cookie_malformed' );

wp_set_auth_cookie( 1, true, false, 'session-token-current' );
$observations['auth-cookie:set-actions'] = array(
\t'set_auth_cookie' => wphx_306_04_recent_actions( 'set_auth_cookie' ),
\t'set_logged_in_cookie' => wphx_306_04_recent_actions( 'set_logged_in_cookie' ),
);
$observations['auth-cookie:set-headers'] = headers_list();

wp_clear_auth_cookie();
$observations['auth-cookie:clear-actions'] = wphx_306_04_recent_actions( 'clear_auth_cookie' );
$observations['auth-cookie:clear-headers-count'] = count( headers_list() );

$nonce = wp_create_nonce( 'save-post' );
$observations['nonce:created-length'] = strlen( $nonce );
$observations['nonce:verify-current'] = wp_verify_nonce( $nonce, 'save-post' );
$tick = wp_nonce_tick( 'save-post' );
$previous_nonce = substr( wp_hash( ( $tick - 1 ) . '|save-post|1|session-token-current', 'nonce' ), -12, 10 );
$observations['nonce:verify-previous'] = wp_verify_nonce( $previous_nonce, 'save-post' );
$observations['nonce:verify-invalid'] = wp_verify_nonce( 'invalidnonce', 'save-post' );
$observations['nonce:failure-actions'] = wphx_306_04_recent_actions( 'wp_verify_nonce_failed' );

$GLOBALS['wphx_306_04_current_user_id'] = 0;
$logged_out_nonce = wp_create_nonce( 'logged-out-action' );
$observations['nonce:logged-out-current'] = wp_verify_nonce( $logged_out_nonce, 'logged-out-action' );

$observations['errors'] = $GLOBALS['wphx_306_04_php_errors'];
ksort( $observations );
echo json_encode(
\tarray(
\t\t'mode' => $mode,
\t\t'observations' => $observations,
\t),
\tJSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
);
`
  );
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-306-auth-cookie-nonce`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function runProbe(mode, root) {
  const output = command("php", [PROBE, mode, root]);
  return {
    mode,
    command: `php ${PROBE} ${mode} ${root}`,
    raw_output_sha256: sha256(output),
    result: JSON.parse(output)
  };
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/user-auth-cookie-nonce-fixture",
    issue: {
      id: ISSUE.id,
      external_ref: ISSUE.external_ref
    },
    unit: {
      kind: "oracle_fixture",
      name: "users/auth cookie and nonce differential fixture",
      area: "wp-includes/pluggable.php auth-cookie and nonce functions",
      public_contract:
        "This fixture records vanilla WordPress auth-cookie, session-token, pluggable declaration, and nonce behavior that the Haxe auth adapter must satisfy. It does not claim Haxe-owned public PHP replacement."
    },
    ownership_state: "oracle_fixture",
    ownership_axes: {
      semantic_owner: "upstream_oracle",
      adapter_contract_owner: "not_claimed",
      emission_strategy: "upstream_source_mirror_fixture",
      execution_provider: "php_oracle_process",
      compatibility_evidence: "targeted_semantic_parity"
    },
    bridge: {
      exists: true,
      kind: "oracle-source-mirror-fixture",
      removal_gate:
        "Replace candidate mirror with generated original-path PHP once WPHX-306 public adapter contracts exist."
    },
    owned_paths: ["tools/wp-core/run-user-auth-cookie-nonce-fixture.mjs", OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-306-auth-cookie-nonce",
        "npm run wp:core:wphx-306-auth-cookie-nonce:check",
        "npm run receipts:validate"
      ],
      receipt_refs: ["receipt:wphx-306-04-auth-cookie-nonce-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const oracleRun = runProbe("oracle", ORACLE_ROOT);
const candidateRun = runProbe("candidate", CANDIDATE_ROOT);
const observationsEqual = JSON.stringify(oracleRun.result.observations) === JSON.stringify(candidateRun.result.observations);

if (!observationsEqual) {
  console.error(JSON.stringify({ status: "failed", oracle: oracleRun.result, candidate: candidateRun.result }, null, 2));
  process.exit(1);
}

const manifest = {
  schema: "wphx.wp-core-user-auth-cookie-nonce-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: "tools/wp-core/run-user-auth-cookie-nonce-fixture.mjs",
  upstream: {
    repo: UPSTREAM_ROOT,
    commit: WP_REF,
    source_files: SOURCE_FILES.map(sourceRecord)
  },
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    foundation_manifest: inputRecord(FOUNDATION)
  },
  fixture: {
    evidence_class: "targeted_semantic_parity",
    artifact_scope: "oracle_source_mirror_fixture",
    source_files: SOURCE_FILES,
    covered_symbols: COVERED_SYMBOLS,
    cases: FIXTURE_CASES,
    normalization: [
      "Cookie values are summarized by SHA-256 and structural fields rather than committed raw secrets.",
      "Hook arguments containing cookie values are summarized by digest and part count.",
      "Auth-cookie expiration hook arguments are recorded as deltas from current process time.",
      "Nonce lifetime is filtered to a large value so the tick is stable across routine check runs."
    ],
    candidate_policy: {
      public_php_replacement_claimed: false,
      haxe_semantic_ownership_claimed: false,
      handwritten_production_php_added: false,
      note:
        "The candidate side currently mirrors locked upstream source to establish a stable differential fixture. A later WPHX-306 slice must replace the candidate mirror with generated original-path PHP before ownership can be upgraded."
    }
  },
  runs: {
    oracle: oracleRun,
    candidate: candidateRun,
    observations_equal: observationsEqual
  },
  parity: {
    status: observationsEqual ? "passed" : "failed",
    oracle_observation_sha256: sha256(JSON.stringify(oracleRun.result.observations)),
    candidate_observation_sha256: sha256(JSON.stringify(candidateRun.result.observations))
  },
  remaining_gaps: [
    {
      id: "generated-auth-adapter-not-installed",
      owner: "WPHX-306",
      detail:
        "Auth-cookie and nonce behavior is only proven between upstream mirrors. Generated public PHP and typed Adapter IR are not yet installed."
    },
    {
      id: "native-setcookie-not-fully-observable-in-cli",
      owner: "WPHX-306",
      detail:
        "The fixture records hook-level cookie intent and CLI headers_list. Installed HTTP/E2E gates must later validate real Set-Cookie headers through a web SAPI."
    }
  ],
  ownership_manifest: OWNERSHIP,
  validation_result: {
    status: observationsEqual ? "passed" : "failed",
    cases: FIXTURE_CASES.length,
    covered_symbols: COVERED_SYMBOLS.length,
    public_php_replacement_claimed: false,
    artifact_scope: "oracle_source_mirror_fixture"
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-306-04-auth-cookie-nonce-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "auth-cookie and nonce differential fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for auth-cookie and nonce fixture" },
    { path: "tools/wp-core/run-user-auth-cookie-nonce-fixture.mjs", role: "fixture generator and check-mode validator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-306-auth-cookie-nonce",
    "npm run wp:core:wphx-306-auth-cookie-nonce:check",
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

console.log(JSON.stringify({ status: "passed", output: OUT, ownership: OWNERSHIP, receipt: RECEIPT }, null, 2));
