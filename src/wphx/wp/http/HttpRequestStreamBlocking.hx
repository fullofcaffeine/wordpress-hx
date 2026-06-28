package wphx.wp.http;

/**
	WP_Http::request stream/blocking option decisions for bounded Haxe ownership.
	PHP still owns filename defaults, writable-directory checks, Requests
	dispatch, transport execution, and response handling.
**/
@:keep
function shouldForceBlockingForStream(stream:Bool):Bool
{
	return stream;
}
