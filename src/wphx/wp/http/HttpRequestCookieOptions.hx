package wphx.wp.http;

/**
	WP_Http::request request-cookie option decision for bounded Haxe
	ownership. PHP still owns native parsed args, normalize_cookies semantics,
	WP_Http_Cookie conversion, Requests option arrays, and dispatch.
**/
@:keep
function shouldNormalizeRequestCookies(hasCookies:Bool):Bool
{
	return hasCookies;
}
