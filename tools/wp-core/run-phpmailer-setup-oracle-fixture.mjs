#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const ISSUE = {
  id: "wordpresshx-l76.18.13",
  external_ref: "WPHX-312.13",
  title: "WPHX-312.13 — Add PHPMailer setup oracle fixture"
};
const RECORDED_AT = "2026-06-27T00:00:00.000Z";
const UPSTREAM_ROOT = "../wordpress-develop";
const RUNNER = "tools/wp-core/run-phpmailer-setup-oracle-fixture.mjs";
const OUT_ROOT = "build/wp-core/wphx-312-13";
const ORACLE_ROOT = `${OUT_ROOT}/oracle`;
const CANDIDATE_ROOT = `${OUT_ROOT}/candidate`;
const PROBE = `${OUT_ROOT}/probe.php`;
const OUT = "manifests/wp-core/wphx-312-13-phpmailer-setup-oracle-fixture.v1.json";
const OWNERSHIP = "manifests/ownership/wphx-312-13-phpmailer-setup-oracle-fixture.v1.json";
const RECEIPT = "receipts/wp-core/wphx-312-13-phpmailer-setup-oracle-fixture.v1.json";
const SURFACE = "manifests/wp-core/wphx-312-01-http-cron-mail-feed-embed-surface.v1.json";
const CONTRACT = "manifests/wp-core/wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate.v1.json";
const HTTP_CRON_MAIL_FIXTURE = "manifests/wp-core/wphx-312-03-http-cron-mail-oracle-fixture.v1.json";
const PRIVACY_MAIL_FIXTURE = "manifests/wp-core/wphx-312-07-privacy-request-mail-oracle-fixture.v1.json";

const SOURCE_FILES = [
  "src/wp-includes/pluggable.php",
  "src/wp-includes/class-wp-phpmailer.php",
  "src/wp-includes/PHPMailer/PHPMailer.php",
  "src/wp-includes/PHPMailer/SMTP.php",
  "src/wp-includes/PHPMailer/Exception.php"
];
const COVERED_SYMBOLS = [
  "wp_mail",
  "PHPMailer\\PHPMailer\\PHPMailer::send",
  "PHPMailer\\PHPMailer\\PHPMailer::preSend",
  "PHPMailer\\PHPMailer\\PHPMailer::postSend",
  "PHPMailer\\PHPMailer\\PHPMailer::addAddress",
  "PHPMailer\\PHPMailer\\PHPMailer::addCC",
  "PHPMailer\\PHPMailer\\PHPMailer::addBCC",
  "PHPMailer\\PHPMailer\\PHPMailer::addReplyTo",
  "PHPMailer\\PHPMailer\\PHPMailer::addAttachment",
  "PHPMailer\\PHPMailer\\PHPMailer::addEmbeddedImage",
  "PHPMailer\\PHPMailer\\PHPMailer::addCustomHeader",
  "WP_PHPMailer::setLanguage",
  "wp_mail_embed_args",
  "phpmailer_init",
  "wp_mail_succeeded",
  "wp_mail_failed"
];
const FIXTURE_CASES = [
  { id: "mail:html-headers-attachments-embeds", focus: "wp_mail parses From/CC/BCC/Reply-To/custom headers, content type, charset, attachment, embed, and phpmailer_init state without delivery" },
  { id: "mail:array-headers-default-from", focus: "wp_mail handles array recipients/headers, default wordpress@site From, and custom header filtering" },
  { id: "mail:embed-args-filter", focus: "wp_mail_embed_args customizes CID, name, encoding, MIME type, and disposition before addEmbeddedImage" },
  { id: "mail:recipient-validation-failure", focus: "invalid recipients are skipped and PHPMailer failure is surfaced through wp_mail_failed" },
  { id: "mail:reuse-clears-state", focus: "global PHPMailer reuse clears previous recipients, attachments, headers, reply-tos, and embeds between sends" }
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

function writeProbe() {
  mkdirSync(dirname(PROBE), { recursive: true });
  writeFileSync(
    PROBE,
    `<?php
$root = rtrim( $argv[1], '/\\\\' );
$case = $argv[2];

error_reporting( E_ALL );
ini_set( 'display_errors', 'stderr' );
ini_set( 'log_errors', '0' );

define( 'ABSPATH', $root . '/' );
define( 'WPINC', 'wp-includes' );

$GLOBALS['wp_filter'] = array();
$GLOBALS['wphx_312_13_actions'] = array();
$GLOBALS['wphx_312_13_filters'] = array();
$GLOBALS['wphx_312_13_errors'] = array();
$GLOBALS['wphx_312_13_fixture_dir'] = dirname( __FILE__ ) . '/mail-assets';

set_error_handler(
\tfunction ( $errno, $errstr, $errfile, $errline ) {
\t\t$GLOBALS['wphx_312_13_errors'][] = array(
\t\t\t'errno' => $errno,
\t\t\t'message' => $errstr,
\t\t\t'file' => basename( $errfile ),
\t\t\t'line' => $errline,
\t\t);
\t\treturn true;
\t}
);

class WP_Error {
\tprivate $code;
\tprivate $message;
\tprivate $data;
\tpublic function __construct( $code = '', $message = '', $data = null ) {
\t\t$this->code = $code;
\t\t$this->message = $message;
\t\t$this->data = $data;
\t}
\tpublic function get_error_code() { return $this->code; }
\tpublic function get_error_message() { return $this->message; }
\tpublic function get_error_data() { return $this->data; }
}

function __( $text ) { return $text; }
function is_wp_error( $thing ) { return $thing instanceof WP_Error; }
function is_email( $email ) { return false !== filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : false; }
function wp_parse_url( $url, $component = -1 ) { return parse_url( $url, $component ); }
function network_home_url( $path = '' ) { return 'https://www.example.test' . $path; }
function get_bloginfo( $show = '' ) { return 'charset' === $show ? 'UTF-8' : 'WordPress'; }
function add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) {
\t$GLOBALS['wp_filter'][ $hook_name ][ $priority ][] = array( 'callback' => $callback, 'accepted_args' => $accepted_args );
\tksort( $GLOBALS['wp_filter'][ $hook_name ] );
\treturn true;
}
function add_action( $hook_name, $callback, $priority = 10, $accepted_args = 1 ) { return add_filter( $hook_name, $callback, $priority, $accepted_args ); }
function apply_filters( $hook_name, $value, ...$args ) {
\t$GLOBALS['wphx_312_13_filters'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ) + 1 );
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn $value;
\t}
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\t$callback_args = array_merge( array( $value ), $args );
\t\t\t$value = call_user_func_array( $record['callback'], array_slice( $callback_args, 0, $record['accepted_args'] ) );
\t\t}
\t}
\treturn $value;
}
function do_action( $hook_name, ...$args ) {
\t$GLOBALS['wphx_312_13_actions'][] = array( 'hook' => $hook_name, 'arg_count' => count( $args ), 'error_code' => isset( $args[0] ) && $args[0] instanceof WP_Error ? $args[0]->get_error_code() : null );
\tif ( empty( $GLOBALS['wp_filter'][ $hook_name ] ) ) {
\t\treturn;
\t}
\tforeach ( $GLOBALS['wp_filter'][ $hook_name ] as $callbacks ) {
\t\tforeach ( $callbacks as $record ) {
\t\t\tcall_user_func_array( $record['callback'], array_slice( $args, 0, $record['accepted_args'] ) );
\t\t}
\t}
}
function do_action_ref_array( $hook_name, $args ) { do_action( $hook_name, ...$args ); }

mkdir( $GLOBALS['wphx_312_13_fixture_dir'], 0777, true );
file_put_contents( $GLOBALS['wphx_312_13_fixture_dir'] . '/report.txt', 'attachment report' );
file_put_contents( $GLOBALS['wphx_312_13_fixture_dir'] . '/logo.png', 'fake-png' );
file_put_contents( $GLOBALS['wphx_312_13_fixture_dir'] . '/chart.svg', '<svg></svg>' );

require ABSPATH . WPINC . '/PHPMailer/Exception.php';
require ABSPATH . WPINC . '/PHPMailer/SMTP.php';
require ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
require ABSPATH . WPINC . '/class-wp-phpmailer.php';

class WPHX_Test_PHPMailer extends WP_PHPMailer {
\tpublic $snapshots = array();
\tpublic function postSend() {
\t\t$this->snapshots[] = wphx_312_13_mailer_snapshot( $this );
\t\treturn true;
\t}
}

$GLOBALS['phpmailer'] = new WPHX_Test_PHPMailer( true );
$GLOBALS['phpmailer']::$validator = static function ( $email ) {
\treturn (bool) is_email( $email );
};

require ABSPATH . WPINC . '/pluggable.php';

function wphx_312_13_normalize_address_list( $list ) {
\treturn array_map(
\t\tfunction ( $entry ) {
\t\t\treturn array( 'email' => $entry[0] ?? '', 'name' => trim( $entry[1] ?? '' ) );
\t\t},
\t\t$list
\t);
}
function wphx_312_13_attachment_summary( $attachments ) {
\treturn array_map(
\t\tfunction ( $entry ) {
\t\t\treturn array(
\t\t\t\t'basename' => basename( $entry[0] ?? '' ),
\t\t\t\t'name' => $entry[2] ?? '',
\t\t\t\t'encoding' => $entry[3] ?? '',
\t\t\t\t'type' => $entry[4] ?? '',
\t\t\t\t'disposition' => $entry[6] ?? '',
\t\t\t\t'cid' => $entry[7] ?? '',
\t\t\t);
\t\t},
\t\t$attachments
\t);
}
function wphx_312_13_normalize_mime_header( $value ) {
\treturn preg_replace( '/boundary="[^"]+"/', 'boundary="<generated-boundary>"', $value );
}
function wphx_312_13_mailer_snapshot( $mailer ) {
\treturn array(
\t\t'from' => $mailer->From,
\t\t'from_name' => $mailer->FromName,
\t\t'subject' => $mailer->Subject,
\t\t'body_sha256' => hash( 'sha256', $mailer->Body ),
\t\t'alt_body_sha256' => hash( 'sha256', $mailer->AltBody ),
\t\t'content_type' => $mailer->ContentType,
\t\t'charset' => $mailer->CharSet,
\t\t'encoding' => $mailer->Encoding,
\t\t'mailer' => $mailer->Mailer,
\t\t'to' => wphx_312_13_normalize_address_list( $mailer->getToAddresses() ),
\t\t'cc' => wphx_312_13_normalize_address_list( $mailer->getCcAddresses() ),
\t\t'bcc' => wphx_312_13_normalize_address_list( $mailer->getBccAddresses() ),
\t\t'reply_to' => wphx_312_13_normalize_address_list( array_values( $mailer->getReplyToAddresses() ) ),
\t\t'custom_headers' => $mailer->getCustomHeaders(),
\t\t'attachments' => wphx_312_13_attachment_summary( $mailer->getAttachments() ),
\t\t'message_type' => wphx_312_13_normalize_mime_header( $mailer->getMailMIME() ),
\t);
}
function wphx_312_13_reset_hooks() {
\t$GLOBALS['wp_filter'] = array();
\t$GLOBALS['wphx_312_13_actions'] = array();
\t$GLOBALS['wphx_312_13_filters'] = array();
\t$GLOBALS['wphx_312_13_errors'] = array();
}
function wphx_312_13_result( $case, $result, $extra = array() ) {
\tglobal $phpmailer;
\treturn array_merge(
\t\tarray(
\t\t\t'case' => $case,
\t\t\t'result' => $result,
\t\t\t'snapshots' => $phpmailer->snapshots,
\t\t\t'actions' => $GLOBALS['wphx_312_13_actions'],
\t\t\t'filters' => $GLOBALS['wphx_312_13_filters'],
\t\t\t'php_errors' => $GLOBALS['wphx_312_13_errors'],
\t\t),
\t\t$extra
\t);
}

switch ( $case ) {
\tcase 'html-headers-attachments-embeds':
\t\twphx_312_13_reset_hooks();
\t\tadd_filter( 'wp_mail_from', fn( $from ) => 'filtered@example.test' );
\t\tadd_filter( 'wp_mail_from_name', fn( $name ) => 'Filtered Sender' );
\t\tadd_filter( 'wp_mail_content_type', fn( $type ) => $type );
\t\tadd_filter( 'wp_mail_charset', fn( $charset ) => 'ISO-8859-1' );
\t\tadd_action(
\t\t\t'phpmailer_init',
\t\t\tfunction ( $mailer ) {
\t\t\t\t$mailer->AltBody = 'Plain fixture body';
\t\t\t\t$mailer->addCustomHeader( 'X-Init: yes' );
\t\t\t},
\t\t\t10,
\t\t\t1
\t\t);
\t\t$result = wp_mail(
\t\t\t'Recipient One <one@example.test>, two@example.test',
\t\t\t' Fixture HTML ',
\t\t\t'<p>Hello <img src=\"cid:logo\"></p>',
\t\t\tarray(
\t\t\t\t'From: Header Sender <header@example.test>',
\t\t\t\t'Content-Type: text/html; charset=UTF-8',
\t\t\t\t'Cc: Copy One <copy@example.test>',
\t\t\t\t'Bcc: hidden@example.test',
\t\t\t\t'Reply-To: Reply Person <reply@example.test>',
\t\t\t\t'X-Custom: custom-value',
\t\t\t),
\t\t\tarray( 'report.txt' => $GLOBALS['wphx_312_13_fixture_dir'] . '/report.txt' ),
\t\t\tarray( 'logo' => $GLOBALS['wphx_312_13_fixture_dir'] . '/logo.png' )
\t\t);
\t\t$output = wphx_312_13_result( $case, $result );
\t\tbreak;
\tcase 'array-headers-default-from':
\t\twphx_312_13_reset_hooks();
\t\t$result = wp_mail(
\t\t\tarray( 'array-one@example.test', 'Array Two <array-two@example.test>' ),
\t\t\t'Array Headers',
\t\t\t'Body',
\t\t\tarray( 'X-Array' => 'yes', 'MIME-Version' => '1.0' )
\t\t);
\t\t$output = wphx_312_13_result( $case, $result );
\t\tbreak;
\tcase 'embed-args-filter':
\t\twphx_312_13_reset_hooks();
\t\tadd_filter(
\t\t\t'wp_mail_embed_args',
\t\t\tfunction ( $args ) {
\t\t\t\t$args['cid'] = 'custom-cid';
\t\t\t\t$args['name'] = 'custom-chart.svg';
\t\t\t\t$args['encoding'] = 'quoted-printable';
\t\t\t\t$args['type'] = 'image/svg+xml';
\t\t\t\treturn $args;
\t\t\t},
\t\t\t10,
\t\t\t1
\t\t);
\t\t$result = wp_mail( 'embed@example.test', 'Embed Args', '<img src=\"cid:custom-cid\">', 'Content-Type: text/html', array(), array( 'chart' => $GLOBALS['wphx_312_13_fixture_dir'] . '/chart.svg' ) );
\t\t$output = wphx_312_13_result( $case, $result );
\t\tbreak;
\tcase 'recipient-validation-failure':
\t\twphx_312_13_reset_hooks();
\t\t$result = wp_mail( array( 'not-an-email' ), 'Bad Recipient', 'Body' );
\t\t$output = wphx_312_13_result( $case, $result );
\t\tbreak;
\tcase 'reuse-clears-state':
\t\twphx_312_13_reset_hooks();
\t\t$first = wp_mail( 'first@example.test', 'First', 'Body', 'X-First: yes', $GLOBALS['wphx_312_13_fixture_dir'] . '/report.txt', array( 'logo' => $GLOBALS['wphx_312_13_fixture_dir'] . '/logo.png' ) );
\t\t$second = wp_mail( 'second@example.test', 'Second', 'Body' );
\t\t$output = wphx_312_13_result( $case, array( 'first' => $first, 'second' => $second ) );
\t\tbreak;
\tdefault:
\t\t$output = wphx_312_13_result( $case, false, array( 'unknown_case' => true ) );
}

echo json_encode( $output, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
`
  );
}

function runProbe(root, mode) {
  return JSON.parse(command("php", [PROBE, root, mode]));
}

function writeOrCheck(path, contents) {
  if (checkOnly) {
    if (!existsSync(path)) throw new Error(`${path} is missing`);
    const current = readFileSync(path, "utf8");
    if (current !== contents) throw new Error(`${path} is stale; run npm run wp:core:wphx-312-phpmailer-setup-oracle-fixture`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function ownershipManifest(manifestSha) {
  return {
    schema: "wphx.ownership-manifest.v1",
    manifest_id: "ownership:wp-core/phpmailer-setup-oracle-fixture",
    issue: { id: ISSUE.id, external_ref: ISSUE.external_ref },
    unit: {
      kind: "oracle_source_mirror_fixture",
      name: "wp_mail PHPMailer setup, header, attachment, embed, init-hook, and failure behavior",
      area: SOURCE_FILES.join(" "),
      public_contract:
        "This fixture executes copied WordPress 7.0 pluggable wp_mail, WP_PHPMailer, and PHPMailer source against deterministic hooks and a no-delivery PHPMailer subclass. It observes message setup and failure actions without using PHP mail, SMTP, DNS, or external delivery."
    },
    ownership_state: "oracle_mirror_behavior_fixture",
    bridge: {
      exists: true,
      kind: "copied-oracle-public-php-with-no-delivery-phpmailer-boundary",
      removal_gate:
        "Replace copied public PHP with generated original-path adapters and pass PHPMailer/SMTP/PHP-mail transport, selected upstream PHPUnit, installed distribution, privacy mail, recovery mail, and ecosystem fixtures before claiming public PHP ownership."
    },
    owned_paths: [RUNNER, OUT, OWNERSHIP, RECEIPT],
    generated_paths: [OUT, OWNERSHIP, RECEIPT, OUT_ROOT],
    verification: {
      oracle_commands: [
        "npm run wp:core:wphx-312-phpmailer-setup-oracle-fixture",
        "npm run wp:core:wphx-312-phpmailer-setup-oracle-fixture:check",
        "npm run receipts:validate",
        "npm run beads:validate"
      ],
      receipt_refs: ["receipt:wphx-312-13-phpmailer-setup-oracle-fixture"],
      manifest_digest: manifestSha
    }
  };
}

rmSync(OUT_ROOT, { recursive: true, force: true });
mirrorSources(ORACLE_ROOT);
mirrorSources(CANDIDATE_ROOT);
writeProbe();

const caseIds = ["html-headers-attachments-embeds", "array-headers-default-from", "embed-args-filter", "recipient-validation-failure", "reuse-clears-state"];
const oracle = Object.fromEntries(caseIds.map((id) => [id, runProbe(ORACLE_ROOT, id)]));
const candidate = Object.fromEntries(caseIds.map((id) => [id, runProbe(CANDIDATE_ROOT, id)]));
const observationsMatch = JSON.stringify(oracle) === JSON.stringify(candidate);

if (!observationsMatch) {
  console.error(JSON.stringify({ status: "failed", oracle, candidate }, null, 2));
  process.exit(1);
}

const phpLint = SOURCE_FILES.map((path) => ({
  path,
  oracle_lint: command("php", ["-l", mirrorPath(ORACLE_ROOT, path)]),
  candidate_lint: command("php", ["-l", mirrorPath(CANDIDATE_ROOT, path)])
}));

const manifest = {
  schema: "wphx.wp-core-phpmailer-setup-oracle-fixture.v1",
  issue: ISSUE.external_ref,
  generated_at: RECORDED_AT,
  generator: RUNNER,
  evidence_classes: ["oracle_source_mirror", "candidate_package_mirror"],
  artifact_scope: "fixture",
  inputs: {
    surface_manifest: inputRecord(SURFACE),
    adapter_contract_manifest: inputRecord(CONTRACT),
    http_cron_mail_fixture_manifest: inputRecord(HTTP_CRON_MAIL_FIXTURE),
    privacy_mail_fixture_manifest: inputRecord(PRIVACY_MAIL_FIXTURE),
    runner: inputRecord(RUNNER),
    upstream_sources: SOURCE_FILES.map(sourceRecord)
  },
  fixture: {
    cases: FIXTURE_CASES,
    covered_symbols: COVERED_SYMBOLS,
    source_files: SOURCE_FILES,
    probe: { path: PROBE, sha256: sha256File(PROBE) },
    side_effect_policy: {
      php_mail_delivery: false,
      smtp_delivery: false,
      external_network_io: false,
      phpmailer_send_boundary: "WPHX_Test_PHPMailer::postSend returns true after preSend setup"
    },
    public_abi_policy: {
      public_php_replacement_claimed: false,
      copied_oracle_public_php: true,
      adapter_contract_foundation: CONTRACT,
      installed_wordpress_behavior_claimed: false
    }
  },
  build: {
    oracle_root: ORACLE_ROOT,
    candidate_root: CANDIDATE_ROOT,
    php_lint: phpLint
  },
  observations: {
    oracle,
    candidate,
    match: observationsMatch,
    oracle_sha256: sha256(JSON.stringify(oracle)),
    candidate_sha256: sha256(JSON.stringify(candidate))
  },
  remaining_gaps: [
    {
      id: "real-mail-transport-not-executed",
      owner: ISSUE.external_ref,
      detail: "The fixture records PHPMailer setup through a no-delivery subclass. PHP mail(), SMTP, DNS, TLS, authentication, remote server errors, and operational delivery remain later gates."
    },
    {
      id: "recovery-and-privacy-installed-mail-not-executed",
      owner: ISSUE.external_ref,
      detail: "The fixture focuses on wp_mail setup primitives. Installed recovery mode mail and database-backed privacy request mail flows remain later distribution gates."
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
    fixture_cases: FIXTURE_CASES.length,
    covered_symbols: COVERED_SYMBOLS.length,
    observations_match: observationsMatch,
    public_php_replacement_claimed: false,
    real_mail_transport_claimed: false
  }
};

const manifestText = JSON.stringify(manifest, null, 2) + "\n";
const manifestSha = sha256(manifestText);
const ownershipText = JSON.stringify(ownershipManifest(manifestSha), null, 2) + "\n";
const receipt = {
  schema: "wphx.verification-receipt.v1",
  id: "receipt:wphx-312-13-phpmailer-setup-oracle-fixture",
  issue: ISSUE,
  recorded_at: RECORDED_AT,
  artifacts: [
    { path: OUT, role: "PHPMailer setup oracle-source-mirror fixture manifest" },
    { path: OWNERSHIP, role: "ownership manifest for copied-oracle no-delivery mail boundary" },
    { path: RUNNER, role: "deterministic oracle/candidate fixture generator" }
  ],
  verification_commands: [
    "npm run wp:core:wphx-312-phpmailer-setup-oracle-fixture",
    "npm run wp:core:wphx-312-phpmailer-setup-oracle-fixture:check",
    "npm run receipts:validate",
    "npm run beads:validate"
  ],
  related_receipts: [
    "receipt:wphx-312-01-http-cron-mail-feed-embed-surface",
    "receipt:wphx-312-02-http-cron-mail-feed-embed-adapter-contract-candidate",
    "receipt:wphx-312-03-http-cron-mail-oracle-fixture",
    "receipt:wphx-312-07-privacy-request-mail-oracle-fixture"
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
      fixture_cases: FIXTURE_CASES.length,
      observations_match: observationsMatch
    },
    null,
    2
  )
);
