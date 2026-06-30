package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

/**
	Compiler-owned public `WP_Http_Cookie` shell.

	The public class preserves WordPress' original-path cookie ABI, including
	mutable public properties, `#[AllowDynamicProperties]`, dynamic Set-Cookie
	attributes, and PHP-native constructor parsing/defaults. Haxe owns the
	bounded post-construction matching, header formatting, and attribute shape
	already promoted by WPHX-312.53.
**/
@:wp.file("wp-includes/class-wp-http-cookie.php")
@:wp.haxeBootstrap("WPHX_WP_HTTP_COOKIE_BOOTSTRAPPED")
@:wp.allowDynamicProperties
@:native("WP_Http_Cookie")
@:keep
class WpHttpCookieShell
{
	public var name:NativeValue;
	public var value:NativeValue;
	public var expires:NativeValue;
	public var path:NativeValue;
	public var domain:NativeValue;
	public var port:NativeValue;
	public var host_only:NativeValue;

	@:wp.adapter("wp-http-cookie-construct")
	public function new(data:NativeValue, requested_url:String = ""):Void
	{
		data;
		requested_url;
	}

	@:wp.adapter("wp-http-cookie-test")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_")
	public function test(url:String):Bool
	{
		return HaxeHttpCookieStrategy.test(null, url);
	}

	@:wp.adapter("wp-http-cookie-get-header-value")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_")
	public function getHeaderValue():String
	{
		return HaxeHttpCookieStrategy.headerValue(null, null);
	}

	@:wp.adapter("wp-http-cookie-get-full-header")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_")
	public function getFullHeader():String
	{
		return HaxeHttpCookieStrategy.fullHeader("");
	}

	@:wp.adapter("wp-http-cookie-get-attributes")
	@:wp.haxeHelper("\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_")
	public function get_attributes():NativeValue
	{
		return HaxeHttpCookieStrategy.attributes(null);
	}
}
