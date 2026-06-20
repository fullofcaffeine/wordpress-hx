package wphx.wp.boundary;

@:keep
class CallableValue
{
	public static function call(callable:Dynamic, args:Dynamic):Dynamic
	{
		return php.Syntax.code("call_user_func_array({0}, {1})", callable, args);
	}

	public static function call1(callable:Dynamic, value:Dynamic):Dynamic
	{
		return php.Syntax.code("call_user_func({0}, {1})", callable, value);
	}

	public static function call2(callable:Dynamic, first:Dynamic, second:Dynamic):Dynamic
	{
		return php.Syntax.code("call_user_func({0}, {1}, {2})", callable, first, second);
	}
}
