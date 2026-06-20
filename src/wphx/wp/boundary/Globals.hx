package wphx.wp.boundary;

import wphx.wp.boundary.NativeValue.NativeValue;

@:keep
class Globals
{
	// WPHX-211: $GLOBALS must remain PHP-native for WordPress include/load semantics.
	public static function exists(name:String):Bool
	{
		return php.Syntax.code("array_key_exists({0}, $GLOBALS)", name);
	}

	// WPHX-211: isset on $GLOBALS has PHP-specific null behavior.
	public static function hasValue(name:String):Bool
	{
		return php.Syntax.code("isset($GLOBALS[{0}])", name);
	}

	// WPHX-211: Global values are arbitrary PHP-native values at this boundary.
	public static function get(name:String, defaultValue:NativeValue):NativeValue
	{
		if (exists(name))
		{
			return php.Syntax.code("$GLOBALS[{0}]", name);
		}

		return defaultValue;
	}

	// WPHX-211: Assign through $GLOBALS directly to preserve PHP global state.
	public static function set(name:String, value:NativeValue):NativeValue
	{
		php.Syntax.code("$GLOBALS[{0}] = {1}", name, value);

		return value;
	}

	// WPHX-211: $GLOBALS keys are produced by PHP, not a Haxe map.
	public static function keys():php.NativeIndexedArray<String>
	{
		return php.Syntax.code("array_keys($GLOBALS)");
	}
}
