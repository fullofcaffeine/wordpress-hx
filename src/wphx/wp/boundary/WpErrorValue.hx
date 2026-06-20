package wphx.wp.boundary;

@:keep
class WpErrorValue
{
	public static function isWpError(value:Dynamic):Bool
	{
		return php.Syntax.code("is_object({0}) && method_exists({0}, 'get_error_code') && method_exists({0}, 'get_error_message')", value);
	}

	public static function code(error:Dynamic):Dynamic
	{
		return php.Syntax.code("{0}->get_error_code()", error);
	}

	public static function message(error:Dynamic):Dynamic
	{
		return php.Syntax.code("{0}->get_error_message()", error);
	}

	public static function data(error:Dynamic):Dynamic
	{
		return php.Syntax.code("method_exists({0}, 'get_error_data') ? {0}->get_error_data() : null", error);
	}

	public static function snapshot(error:Dynamic):Dynamic
	{
		return
			php.Syntax.code("array('isWpError' => is_object({0}) && method_exists({0}, 'get_error_code'), 'hasErrors' => method_exists({0}, 'has_errors') ? {0}->has_errors() : false, 'code' => {0}->get_error_code(), 'message' => {0}->get_error_message(), 'data' => method_exists({0}, 'get_error_data') ? {0}->get_error_data() : null)",
			error);
	}
}
