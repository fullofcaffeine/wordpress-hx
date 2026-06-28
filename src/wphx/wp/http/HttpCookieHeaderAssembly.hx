package wphx.wp.http;

/**
	WP_Http::buildCookieHeader header-string assembly for bounded Haxe
	ownership. PHP still owns request-array mutation, scalar cookie upgrading,
	object methods, and filter timing.
**/
/**
	Appends one normalized cookie header value using WordPress's "; " separator,
	without leaving a trailing delimiter after the final cookie.
**/
@:keep
function appendCookieHeader(current:String, headerValue:String):String
{
	return current == "" ? headerValue : current + "; " + headerValue;
}
