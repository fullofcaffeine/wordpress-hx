package wphx.wp.boundary;

import wphx.wp.boundary.NativeValue.NativeCallable;
import wphx.wp.boundary.NativeValue.NativeValue;

@:keep
class CallableValue
{
	// WPHX-211: Raw PHP dispatch preserves every callable shape accepted by WordPress.
	public static function call(callable:NativeCallable, args:php.NativeArray):NativeValue
	{
		return php.Syntax.code("call_user_func_array({0}, {1})", callable, args);
	}

	// WPHX-211: Raw PHP dispatch keeps callback invocation native at the ABI edge.
	public static function call1(callable:NativeCallable, value:NativeValue):NativeValue
	{
		return php.Syntax.code("call_user_func({0}, {1})", callable, value);
	}

	// WPHX-211: Raw PHP dispatch keeps callback invocation native at the ABI edge.
	public static function call2(callable:NativeCallable, first:NativeValue, second:NativeValue):NativeValue
	{
		return php.Syntax.code("call_user_func({0}, {1}, {2})", callable, first, second);
	}
}
