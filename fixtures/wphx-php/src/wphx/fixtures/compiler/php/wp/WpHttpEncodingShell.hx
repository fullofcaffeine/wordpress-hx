package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

/**
	Compiler-owned public `WP_Http_Encoding` shell.

	The public class preserves WordPress' original-path ABI while delegating
	bounded compression/decompression decisions to Haxe-owned helpers. Native
	PHP zlib availability checks and `wp_http_accept_encoding` filter timing
	remain in the emitted PHP adapter body.
**/
@:wp.file("wp-includes/class-wp-http-encoding.php")
@:wp.haxeBootstrap("WPHX_WP_HTTP_ENCODING_BOOTSTRAPPED")
@:wp.allowDynamicProperties
@:native("WP_Http_Encoding")
@:keep
class WpHttpEncodingShell
{
	@:wp.adapter("wp-http-encoding-compress")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function compress(raw:NativeValue, level:Int = 9, supports:NativeValue = null):NativeValue
	{
		return HaxeHttpEncodingStrategy.compress("", 9);
	}

	@:wp.adapter("wp-http-encoding-decompress")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function decompress(compressed:NativeValue, length:NativeValue = null):NativeValue
	{
		return HaxeHttpEncodingStrategy.decompress("");
	}

	@:wp.adapter("wp-http-encoding-compatible-gzinflate")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function compatible_gzinflate(@:wp.name("gz_data") gzData:NativeValue):NativeValue
	{
		return HaxeHttpEncodingStrategy.compatibleGzinflate("");
	}

	@:wp.adapter("wp-http-encoding-accept-encoding")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function accept_encoding(url:String, args:NativeValue):String
	{
		return HaxeHttpEncodingStrategy.contentEncoding();
	}

	@:wp.adapter("wp-http-encoding-content-encoding")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function content_encoding():String
	{
		return HaxeHttpEncodingStrategy.contentEncoding();
	}

	@:wp.adapter("wp-http-encoding-should-decode")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function should_decode(headers:NativeValue):Bool
	{
		return HaxeHttpEncodingStrategy.shouldDecodeFromString("");
	}

	@:wp.adapter("wp-http-encoding-is-available")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpEncodingStrategy")
	public static function is_available():Bool
	{
		return HaxeHttpEncodingStrategy.isAvailable();
	}
}
