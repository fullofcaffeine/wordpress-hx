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
	@:wp.haxeHelper("headRedirectionDefault", "\\wphx\\wp\\http\\_HttpRequestHeadRedirectionDefault\\HttpRequestHeadRedirectionDefault_Fields_")
	@:wp.haxeHelper("methodOptions", "\\wphx\\wp\\http\\_HttpRequestMethodOptions\\HttpRequestMethodOptions_Fields_")
	@:wp.haxeHelper("safetyOptions", "\\wphx\\wp\\http\\_HttpRequestSafetyOptions\\HttpRequestSafetyOptions_Fields_")
	@:wp.haxeHelper("streamBlocking", "\\wphx\\wp\\http\\_HttpRequestStreamBlocking\\HttpRequestStreamBlocking_Fields_")
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
