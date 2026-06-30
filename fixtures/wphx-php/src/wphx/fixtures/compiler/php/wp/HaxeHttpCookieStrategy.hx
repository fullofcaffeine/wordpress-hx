package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

@:native("\\wphx\\wp\\http\\_HttpCookieStrategy\\HttpCookieStrategy_Fields_")
extern class HaxeHttpCookieStrategy
{
	static function test(cookie:NativeValue, url:String):Bool;

	static function hasHeaderFields(cookie:NativeValue):Bool;

	static function headerValue(cookie:NativeValue, filteredValue:NativeValue):String;

	static function fullHeader(headerValue:String):String;

	static function attributes(cookie:NativeValue):NativeValue;
}
