package wphx.wp.boundary;

@:keep
class NativeArray
{
	public static function fromJsonObject(json:String):Dynamic
	{
		return php.Syntax.code("json_decode({0}, true)", json);
	}

	public static function isArray(value:Dynamic):Bool
	{
		return php.Syntax.code("is_array({0})", value);
	}

	public static function keyExists(array:Dynamic, key:Dynamic):Bool
	{
		return php.Syntax.code("array_key_exists({0}, {1})", key, array);
	}

	public static function issetKey(array:Dynamic, key:Dynamic):Bool
	{
		return php.Syntax.code("isset({0}[{1}])", array, key);
	}

	public static function get(array:Dynamic, key:Dynamic, defaultValue:Dynamic):Dynamic
	{
		if (keyExists(array, key))
		{
			return php.Syntax.code("{0}[{1}]", array, key);
		}

		return defaultValue;
	}

	public static function keys(array:Dynamic):Dynamic
	{
		return php.Syntax.code("array_keys({0})", array);
	}

	public static function values(array:Dynamic):Dynamic
	{
		return php.Syntax.code("array_values({0})", array);
	}

	public static function count(array:Dynamic):Int
	{
		return php.Syntax.code("count({0})", array);
	}
}
