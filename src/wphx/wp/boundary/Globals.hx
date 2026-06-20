package wphx.wp.boundary;

@:keep
class Globals
{
	public static function exists(name:String):Bool
	{
		return php.Syntax.code("array_key_exists({0}, $GLOBALS)", name);
	}

	public static function hasValue(name:String):Bool
	{
		return php.Syntax.code("isset($GLOBALS[{0}])", name);
	}

	public static function get(name:String, defaultValue:Dynamic):Dynamic
	{
		if (exists(name))
		{
			return php.Syntax.code("$GLOBALS[{0}]", name);
		}

		return defaultValue;
	}

	public static function set(name:String, value:Dynamic):Dynamic
	{
		php.Syntax.code("$GLOBALS[{0}] = {1}", name, value);

		return value;
	}

	public static function keys():Dynamic
	{
		return php.Syntax.code("array_keys($GLOBALS)");
	}
}
