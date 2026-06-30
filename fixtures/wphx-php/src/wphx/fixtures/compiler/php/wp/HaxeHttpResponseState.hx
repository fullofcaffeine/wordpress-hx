package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

@:native("\\wphx\\wp\\http\\HttpResponseState")
extern class HaxeHttpResponseState
{
	static function initialize(response:NativeValue, data:NativeValue, status:NativeValue, headers:NativeValue):Void;

	static function getData(response:NativeValue):NativeValue;

	static function setData(response:NativeValue, data:NativeValue):Void;

	static function getHeaders(response:NativeValue):NativeValue;

	static function setHeaders(response:NativeValue, headers:NativeValue):Void;

	static function header(response:NativeValue, key:String, value:String, replace:Bool):Void;

	static function getStatus(response:NativeValue):Int;

	static function setStatus(response:NativeValue, code:NativeValue):Void;

	static function jsonSerialize(response:NativeValue):NativeValue;
}
