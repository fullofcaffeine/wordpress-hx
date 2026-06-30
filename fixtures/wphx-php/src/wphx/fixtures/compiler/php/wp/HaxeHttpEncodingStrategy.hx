package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

@:native("\\wphx\\wp\\http\\HttpEncodingStrategy")
extern class HaxeHttpEncodingStrategy
{
	static function compress(raw:String, level:Int):NativeValue;

	static function decompress(compressed:String):NativeValue;

	static function compatibleGzinflate(gzData:String):NativeValue;

	static function contentEncoding():String;

	static function shouldDecodeFromNativeHeaders(headers:NativeValue):Bool;

	static function shouldDecodeFromString(headers:String):Bool;

	static function isAvailable():Bool;
}
