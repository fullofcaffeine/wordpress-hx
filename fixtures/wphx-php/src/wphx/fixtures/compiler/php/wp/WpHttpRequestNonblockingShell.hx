package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

/**
	Compiler-owned bounded `WP_Http::request` public shell for the nonblocking
	response shape. PHP keeps request orchestration; Haxe owns only the
	`blocking=false` response array helper for this slice.
**/
@:wp.file("wp-includes/class-wp-http.php")
@:wp.haxeBootstrap("WPHX_WP_HTTP_REQUEST_NONBLOCKING_BOOTSTRAPPED")
@:native("WP_Http")
@:keep
class WpHttpRequestNonblockingShell
{
	public function new():Void {}

	@:wp.adapter("wp-http-request-nonblocking")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpRequestNonblocking\\HttpRequestNonblocking_Fields_")
	@:wp.haxeHelper("blockedRequest", "\\wphx\\wp\\http\\_HttpRequestBlockedRequest\\HttpRequestBlockedRequest_Fields_")
	@:wp.haxeHelper("badProtocolStripping", "\\wphx\\wp\\http\\_HttpRequestBadProtocolStripping\\HttpRequestBadProtocolStripping_Fields_")
	@:wp.haxeHelper("cookieOptions", "\\wphx\\wp\\http\\_HttpRequestCookieOptions\\HttpRequestCookieOptions_Fields_")
	@:wp.haxeHelper("errorResponse", "\\wphx\\wp\\http\\_HttpRequestErrorResponse\\HttpRequestErrorResponse_Fields_")
	@:wp.haxeHelper("headRedirectionDefault", "\\wphx\\wp\\http\\_HttpRequestHeadRedirectionDefault\\HttpRequestHeadRedirectionDefault_Fields_")
	@:wp.haxeHelper("headerParsing", "\\wphx\\wp\\http\\_HttpRequestHeaderParsing\\HttpRequestHeaderParsing_Fields_")
	@:wp.haxeHelper("httpResponseAttachment", "\\wphx\\wp\\http\\_HttpRequestHttpResponseAttachment\\HttpRequestHttpResponseAttachment_Fields_")
	@:wp.haxeHelper("invalidUrl", "\\wphx\\wp\\http\\_HttpRequestInvalidUrl\\HttpRequestInvalidUrl_Fields_")
	@:wp.haxeHelper("methodOptions", "\\wphx\\wp\\http\\_HttpRequestMethodOptions\\HttpRequestMethodOptions_Fields_")
	@:wp.haxeHelper("mbstringReset", "\\wphx\\wp\\http\\_HttpRequestMbstringReset\\HttpRequestMbstringReset_Fields_")
	@:wp.haxeHelper("nullHeaderNormalization", "\\wphx\\wp\\http\\_HttpRequestNullHeaderNormalization\\HttpRequestNullHeaderNormalization_Fields_")
	@:wp.haxeHelper("preemptiveResponse", "\\wphx\\wp\\http\\_HttpRequestPreemptiveResponse\\HttpRequestPreemptiveResponse_Fields_")
	@:wp.haxeHelper("proxyAuthentication", "\\wphx\\wp\\http\\_HttpRequestProxyAuthentication\\HttpRequestProxyAuthentication_Fields_")
	@:wp.haxeHelper("proxyOptions", "\\wphx\\wp\\http\\_HttpRequestProxyOptions\\HttpRequestProxyOptions_Fields_")
	@:wp.haxeHelper("redirectOptions", "\\wphx\\wp\\http\\_HttpRequestRedirectOptions\\HttpRequestRedirectOptions_Fields_")
	@:wp.haxeHelper("redirectionCopy", "\\wphx\\wp\\http\\_HttpRequestRedirectionCopy\\HttpRequestRedirectionCopy_Fields_")
	@:wp.haxeHelper("responseSizeOptions", "\\wphx\\wp\\http\\_HttpRequestResponseSizeOptions\\HttpRequestResponseSizeOptions_Fields_")
	@:wp.haxeHelper("safetyOptions", "\\wphx\\wp\\http\\_HttpRequestSafetyOptions\\HttpRequestSafetyOptions_Fields_")
	@:wp.haxeHelper("sslOptions", "\\wphx\\wp\\http\\_HttpRequestSslOptions\\HttpRequestSslOptions_Fields_")
	@:wp.haxeHelper("streamBlocking", "\\wphx\\wp\\http\\_HttpRequestStreamBlocking\\HttpRequestStreamBlocking_Fields_")
	@:wp.haxeHelper("streamDefaultFilename", "\\wphx\\wp\\http\\_HttpRequestStreamDefaultFilename\\HttpRequestStreamDefaultFilename_Fields_")
	@:wp.haxeHelper("streamDestinationError", "\\wphx\\wp\\http\\_HttpRequestStreamDestinationError\\HttpRequestStreamDestinationError_Fields_")
	@:wp.haxeHelper("streamFilenameOptions", "\\wphx\\wp\\http\\_HttpRequestStreamFilenameOptions\\HttpRequestStreamFilenameOptions_Fields_")
	@:wp.haxeHelper("unsafeUrlValidation", "\\wphx\\wp\\http\\_HttpRequestUnsafeUrlValidation\\HttpRequestUnsafeUrlValidation_Fields_")
	public function request(url:String, @:wp.defaultArray args:NativeValue = null):NativeValue
	{
		return HaxeHttpRequestNonblocking.nonblockingResponse();
	}

	@:wp.adapter("wp-http-process-headers")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpProcessHeaders\\HttpProcessHeaders_Fields_")
	public static function processHeaders(headers:NativeValue, url:String = ""):NativeValue
	{
		HaxeHttpProcessHeaders.startsFinalResponseBlock("");
		HaxeHttpProcessHeaders.isHeaderLine("");
		HaxeHttpProcessHeaders.responseCode("");
		HaxeHttpProcessHeaders.responseMessage("");
		HaxeHttpProcessHeaders.headerKey("X-Test: yes");
		HaxeHttpProcessHeaders.headerValue("X-Test: yes");
		return headers;
	}

	@:wp.adapter("wp-http-normalize-cookies")
	public static function normalize_cookies(cookies:NativeValue):NativeValue
	{
		return cookies;
	}

	@:wp.adapter("wp-http-block-request")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpBlockRequestPolicy\\HttpBlockRequestPolicy_Fields_")
	public function block_request(uri:String):NativeValue
	{
		return HaxeHttpBlockRequestPolicy.isLocalRequest(uri, "");
	}
}
