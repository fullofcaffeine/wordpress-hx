import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export const WPHX_REQUEST_SHELL_HXML = "fixtures/wphx-php/wp-http-request-nonblocking.hxml";

export const REQUEST_SHELL_HAXE_SOURCES = [
  "src/wphx/wp/http/HttpBlockRequestPolicy.hx",
  "src/wphx/wp/http/HttpProcessHeaders.hx",
  "src/wphx/wp/http/HttpRequestBadProtocolStripping.hx",
  "src/wphx/wp/http/HttpRequestBlockedRequest.hx",
  "src/wphx/wp/http/HttpRequestCookieOptions.hx",
  "src/wphx/wp/http/HttpRequestErrorResponse.hx",
  "src/wphx/wp/http/HttpRequestHeadRedirectionDefault.hx",
  "src/wphx/wp/http/HttpRequestHeaderParsing.hx",
  "src/wphx/wp/http/HttpRequestHttpResponseAttachment.hx",
  "src/wphx/wp/http/HttpRequestInvalidUrl.hx",
  "src/wphx/wp/http/HttpRequestMbstringReset.hx",
  "src/wphx/wp/http/HttpRequestMethodOptions.hx",
  "src/wphx/wp/http/HttpRequestNonblocking.hx",
  "src/wphx/wp/http/HttpRequestNullHeaderNormalization.hx",
  "src/wphx/wp/http/HttpRequestPreemptiveResponse.hx",
  "src/wphx/wp/http/HttpRequestProxyAuthentication.hx",
  "src/wphx/wp/http/HttpRequestProxyOptions.hx",
  "src/wphx/wp/http/HttpRequestRedirectOptions.hx",
  "src/wphx/wp/http/HttpRequestRedirectionCopy.hx",
  "src/wphx/wp/http/HttpRequestResponseSizeOptions.hx",
  "src/wphx/wp/http/HttpRequestSafetyOptions.hx",
  "src/wphx/wp/http/HttpRequestSslOptions.hx",
  "src/wphx/wp/http/HttpRequestStreamBlocking.hx",
  "src/wphx/wp/http/HttpRequestStreamDefaultFilename.hx",
  "src/wphx/wp/http/HttpRequestStreamDestinationError.hx",
  "src/wphx/wp/http/HttpRequestStreamFilenameOptions.hx",
  "src/wphx/wp/http/HttpRequestUnsafeUrlValidation.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpBlockRequestPolicy.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HaxeHttpRequestNonblocking.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/HttpRequestNonblockingEntry.hx",
  "fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpRequestNonblockingShell.hx",
  "fixtures/wp-core/src/wphx/fixtures/wp/core/WpHttpRequestCandidateAnchor.hx"
];

export const REQUIRED_REQUEST_SHELL_FEATURES = [
  "stmt.try-catch",
  "stmt.if",
  "stmt.if-else",
  "expr.long-array",
  "expr.method-call",
  "expr.static-call",
  "wp-http.request.bad-protocol-stripping-helper",
  "wp-http.request.blocked-request-helper",
  "wp-http.request.cookie-options-helper",
  "wp-http.request.error-response-helper",
  "wp-http.request.head-redirection-default-helper",
  "wp-http.request.header-parsing-helper",
  "wp-http.request.http-response-attachment-helper",
  "wp-http.request.invalid-url-helper",
  "wp-http.request.mbstring-reset-helper",
  "wp-http.request.method-options-helper",
  "wp-http.request.nonblocking-response",
  "wp-http.request.null-header-normalization-helper",
  "wp-http.request.preemptive-response-helper",
  "wp-http.request.proxy-authentication-helper",
  "wp-http.request.proxy-options-helper",
  "wp-http.request.redirect-options-helper",
  "wp-http.request.redirection-copy-helper",
  "wp-http.request.response-size-options-helper",
  "wp-http.request.safety-options-helper",
  "wp-http.request.ssl-options-helper",
  "wp-http.request.stream-blocking-helper",
  "wp-http.request.stream-default-filename-helper",
  "wp-http.request.stream-destination-error-helper",
  "wp-http.request.stream-filename-options-helper",
  "wp-http.request.unsafe-url-validation-helper"
];

export function wphxRequestShellPaths(outRoot) {
  const root = `${outRoot}/wphx-php`;
  return {
    root,
    manifest: `${root}/wphx-php-emission.v1.json`,
    shell: `${root}/wp-includes/class-wp-http.php`
  };
}

export function compileWphxRequestShell(command, outRoot) {
  const paths = wphxRequestShellPaths(outRoot);
  command("haxe", [
    WPHX_REQUEST_SHELL_HXML,
    "-D",
    `wphx_php_output=${paths.root}`,
    "-D",
    `wphx_php_manifest=${paths.manifest}`
  ]);
  return paths;
}

export function installWphxRequestShell(candidateRoot, outRoot) {
  const paths = wphxRequestShellPaths(outRoot);
  const target = `${candidateRoot}/wp-includes/class-wp-http.php`;
  if (!existsSync(paths.shell)) throw new Error(`Missing WPHX PHP emitted request shell: ${paths.shell}`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(paths.shell, target);
  return target;
}

export function requestShellShape(candidateRoot, outRoot) {
  const paths = wphxRequestShellPaths(outRoot);
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  const generatedShell = readFileSync(`${candidateRoot}/wp-includes/class-wp-http.php`, "utf8");
  const coreIrFeatures = new Set(manifest.core_ir_features ?? []);
  const missingFeatures = REQUIRED_REQUEST_SHELL_FEATURES.filter((feature) => !coreIrFeatures.has(feature));

  return {
    manifest_declares_wp_http: manifest.files.some((file) =>
      file.path === "wp-includes/class-wp-http.php" &&
      file.declarations.some((declaration) => declaration.kind === "class" && declaration.name === "WP_Http")
    ),
    unsupported_empty: Array.isArray(manifest.unsupported) && manifest.unsupported.length === 0,
    request_signature: generatedShell.includes("public function request($url, $args = [])"),
    process_headers_signature: generatedShell.includes("public static function processHeaders($headers, $url = '')"),
    normalize_cookies_signature: generatedShell.includes("public static function normalize_cookies($cookies)"),
    block_request_signature: generatedShell.includes("public function block_request($uri)"),
    bad_protocol_stripping_haxe_call: generatedShell.includes("HttpRequestBadProtocolStripping_Fields_::shouldStripBadProtocol"),
    blocked_request_haxe_call: generatedShell.includes("HttpRequestBlockedRequest_Fields_::shouldReturnBlockedRequestError"),
    cookie_options_haxe_call: generatedShell.includes("HttpRequestCookieOptions_Fields_::shouldNormalizeRequestCookies"),
    error_response_haxe_call: generatedShell.includes("HttpRequestErrorResponse_Fields_::shouldReturnErrorResponse"),
    head_redirection_haxe_call: generatedShell.includes("HttpRequestHeadRedirectionDefault_Fields_::shouldDisableHeadDefaultRedirection"),
    header_parsing_haxe_call: generatedShell.includes("HttpRequestHeaderParsing_Fields_::shouldParseHeaders"),
    http_response_attachment_haxe_call: generatedShell.includes("HttpRequestHttpResponseAttachment_Fields_::shouldAttachHttpResponseObject"),
    invalid_url_haxe_call: generatedShell.includes("HttpRequestInvalidUrl_Fields_::shouldRejectInvalidRequestUrl"),
    mbstring_reset_haxe_call: generatedShell.includes("HttpRequestMbstringReset_Fields_::shouldResetMbstringEncodingAfterDispatch"),
    method_options_haxe_call: generatedShell.includes("HttpRequestMethodOptions_Fields_::shouldUseBodyDataFormat"),
    nonblocking_haxe_call: generatedShell.includes("HttpRequestNonblocking_Fields_::nonblockingResponse"),
    null_header_normalization_haxe_call: generatedShell.includes("HttpRequestNullHeaderNormalization_Fields_::shouldNormalizeHeaders"),
    preemptive_response_haxe_call: generatedShell.includes("HttpRequestPreemptiveResponse_Fields_::shouldReturnPreemptiveResponse"),
    proxy_authentication_haxe_call: generatedShell.includes("HttpRequestProxyAuthentication_Fields_::shouldUseProxyAuthentication"),
    proxy_options_haxe_call: generatedShell.includes("HttpRequestProxyOptions_Fields_::shouldUseProxy"),
    redirect_options_haxe_call: generatedShell.includes("HttpRequestRedirectOptions_Fields_::shouldDisableRedirects"),
    redirection_copy_haxe_call: generatedShell.includes("HttpRequestRedirectionCopy_Fields_::shouldCopyRedirection"),
    response_size_options_haxe_call: generatedShell.includes("HttpRequestResponseSizeOptions_Fields_::shouldSetMaxBytes"),
    safety_options_haxe_call: generatedShell.includes("HttpRequestSafetyOptions_Fields_::shouldRegisterRedirectValidation"),
    ssl_options_haxe_call: generatedShell.includes("HttpRequestSslOptions_Fields_::shouldDisableSslVerification"),
    stream_blocking_haxe_call: generatedShell.includes("HttpRequestStreamBlocking_Fields_::shouldForceBlockingForStream"),
    stream_default_filename_haxe_call: generatedShell.includes("HttpRequestStreamDefaultFilename_Fields_::shouldUseDefaultStreamFilename"),
    stream_destination_error_haxe_call: generatedShell.includes("HttpRequestStreamDestinationError_Fields_::shouldReturnStreamDestinationError"),
    stream_filename_options_haxe_call: generatedShell.includes("HttpRequestStreamFilenameOptions_Fields_::shouldSetStreamFilenameOption"),
    unsafe_url_validation_haxe_call: generatedShell.includes("HttpRequestUnsafeUrlValidation_Fields_::shouldValidateUnsafeUrl"),
    requests_dispatch: generatedShell.includes("WpOrg\\Requests\\Requests::request"),
    request_ir_features_present: missingFeatures.length === 0,
    missing_request_ir_features: missingFeatures
  };
}
