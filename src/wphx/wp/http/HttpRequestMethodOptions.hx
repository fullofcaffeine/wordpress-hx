package wphx.wp.http;

/**
	WP_Http::request method-derived option decisions for bounded Haxe ownership.
	PHP still owns method defaults/filters, body values, Requests option arrays,
	dispatch, and response handling.
**/
@:keep
function shouldUseBodyDataFormat(method:String):Bool
{
	return "HEAD" != method && "GET" != method;
}
