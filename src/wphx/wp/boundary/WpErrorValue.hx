package wphx.wp.boundary;

import wphx.wp.boundary.NativeValue.NativeValue;
import wphx.wp.boundary.NativeValue.NativeWpError;

@:keep
class WpErrorValue
{
	// WPHX-211: WP_Error may be a native PHP object before a typed extern exists.
	public static function isWpError(value:NativeValue):Bool
	{
		return php.Syntax.code("is_object({0}) && method_exists({0}, 'get_error_code') && method_exists({0}, 'get_error_message')", value);
	}

	// WPHX-211: Native WP_Error method dispatch preserves plugin-provided objects.
	public static function code(error:NativeWpError):NativeValue
	{
		return php.Syntax.code("{0}->get_error_code()", error);
	}

	// WPHX-211: Native WP_Error method dispatch preserves plugin-provided objects.
	public static function message(error:NativeWpError):String
	{
		return php.Syntax.code("{0}->get_error_message()", error);
	}

	// WPHX-211: Error data can be any PHP-native value.
	public static function data(error:NativeWpError):NativeValue
	{
		return php.Syntax.code("method_exists({0}, 'get_error_data') ? {0}->get_error_data() : null", error);
	}

	// WPHX-211: Snapshot shape is a PHP-native array for oracle comparison.
	public static function snapshot(error:NativeWpError):php.NativeArray
	{
		return
			php.Syntax.code("array('isWpError' => is_object({0}) && method_exists({0}, 'get_error_code'), 'hasErrors' => method_exists({0}, 'has_errors') ? {0}->has_errors() : false, 'code' => {0}->get_error_code(), 'message' => {0}->get_error_message(), 'data' => method_exists({0}, 'get_error_data') ? {0}->get_error_data() : null)",
			error);
	}
}
