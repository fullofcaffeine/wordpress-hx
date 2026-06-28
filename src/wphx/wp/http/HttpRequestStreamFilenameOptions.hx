package wphx.wp.http;

/**
	WP_Http::request stream filename option decisions for bounded Haxe ownership.
	PHP still owns filename defaults, writable-directory checks, option-array
	mutation, Requests dispatch, transport execution, and response handling.
**/
@:keep
function shouldSetStreamFilenameOption(stream:Bool):Bool
{
	return stream;
}
