package wphx.wp.boundary;

import wphx.wp.boundary.NativeValue.NativeArrayKey;
import wphx.wp.boundary.NativeValue.NativeValue;

@:keep
class NativeArray
{
	// WPHX-211: json_decode(..., true) must stay a native PHP array, not a Haxe Array.
	public static function fromJsonObject(json:String):php.NativeArray
	{
		return php.Syntax.code("json_decode({0}, true)", json);
	}

	// WPHX-211: PHP array detection is target-native and includes associative arrays.
	public static function isArray(value:NativeValue):Bool
	{
		return php.Syntax.code("is_array({0})", value);
	}

	// WPHX-211: array_key_exists and isset differ for null values; keep PHP semantics.
	public static function keyExists(array:php.NativeArray, key:NativeArrayKey):Bool
	{
		return php.Syntax.code("array_key_exists({0}, {1})", key, array);
	}

	// WPHX-211: isset has PHP-specific null behavior required by WordPress globals.
	public static function issetKey(array:php.NativeArray, key:NativeArrayKey):Bool
	{
		return php.Syntax.code("isset({0}[{1}])", array, key);
	}

	// WPHX-211: Native PHP array indexing preserves associative key coercion.
	public static function get(array:php.NativeArray, key:NativeArrayKey, defaultValue:NativeValue):NativeValue
	{
		if (keyExists(array, key))
		{
			return php.Syntax.code("{0}[{1}]", array, key);
		}

		return defaultValue;
	}

	// WPHX-211: array_keys returns PHP-native int/string keys.
	public static function keys(array:php.NativeArray):php.NativeIndexedArray<NativeArrayKey>
	{
		return php.Syntax.code("array_keys({0})", array);
	}

	// WPHX-211: array_values returns a PHP-native indexed array.
	public static function values(array:php.NativeArray):php.NativeIndexedArray<NativeValue>
	{
		return php.Syntax.code("array_values({0})", array);
	}

	// WPHX-211: PHP count operates on native arrays at the shell boundary.
	public static function count(array:php.NativeArray):Int
	{
		return php.Syntax.code("count({0})", array);
	}
}
