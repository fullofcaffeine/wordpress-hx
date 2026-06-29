package wphx.fixtures.compiler.php.facade;

import haxe.extern.EitherType;

/**
	Target-neutral source model for PHP associative arrays at the F4 shell ABI.
**/
abstract F4PhpArray({}) from {}
	to {} {}

/**
	Bounded scalar value model returned by the F4 metadata fixture.
**/
typedef F4NativeValue = EitherType<Int, String>;

/**
	Typed source handles for PHP-native array operations lowered by the WPHX PHP emitter.
**/
class HaxeClassArray
{
	@:wp.phpFunction("count")
	public static function count(array:Null<F4PhpArray>):Int
	{
		return 0;
	}

	@:wp.phpArrayGet
	public static function get(array:Null<F4PhpArray>, key:String, defaultValue:Null<F4NativeValue>):Null<F4NativeValue>
	{
		return defaultValue;
	}
}
