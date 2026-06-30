package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

typedef GroupedProcessResponseResult =
{
	final headers:String;
	final body:String;
};

/**
	Compiler-owned grouped public `WP_Http` shell for parser, header, and cookie
	helpers that must coexist in one original-path `class-wp-http.php` adapter.
**/
@:wp.file("wp-includes/class-wp-http.php")
@:wp.haxeBootstrap("WPHX_WP_HTTP_GROUPED_HELPERS_BOOTSTRAPPED")
@:native("WP_Http")
@:keep
class WpHttpGroupedHelpersShell
{
	public static function processResponse(response:String):GroupedProcessResponseResult
	{
		return {
			headers: HaxeHttpProcessResponse.responseHeaders(response),
			body: HaxeHttpProcessResponse.responseBody(response)
		};
	}

	public static function chunkTransferDecode(body:String):String
	{
		return HaxeHttpChunkTransferDecode.decodeChunkTransfer(body);
	}

	@:wp.visibility("protected")
	public static function parse_url(url:String):NativeValue
	{
		PhpHttpGlobals.deprecatedFunction(HaxeHttpDeprecatedParseUrl.deprecatedFunctionName(), HaxeHttpDeprecatedParseUrl.deprecatedVersion(),
			HaxeHttpDeprecatedParseUrl.replacementFunctionName());
		return HaxeHttpDeprecatedParseUrl.parseUrl(url);
	}

	@:wp.adapter("wp-http-build-cookie-header")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpCookieHeaderAssembly\\HttpCookieHeaderAssembly_Fields_")
	public static function buildCookieHeader(@:wp.byRef r:NativeValue):Void
	{
		HaxeHttpCookieHeaderAssembly.appendCookieHeader("", "");
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
}
