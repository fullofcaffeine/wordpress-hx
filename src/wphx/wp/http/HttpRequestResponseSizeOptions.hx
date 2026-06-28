package wphx.wp.http;

/**
	WP_Http::request response-size option decisions for bounded Haxe ownership.
	PHP still owns request defaults, option-array mutation, Requests transfer
	behavior, transport execution, and response handling.
**/
@:keep
function shouldSetMaxBytes(limitResponseSize:Null<Int>):Bool
{
	return limitResponseSize != null;
}
