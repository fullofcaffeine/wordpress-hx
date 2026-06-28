package wphx.wp.http;

/**
	WP_Http::request header parsing branch decision for bounded Haxe
	ownership. PHP still owns native header arrays, null normalization,
	processHeaders semantics, Set-Cookie handling, and Requests dispatch.
**/
@:keep
function shouldParseHeaders(headersAreArray:Bool):Bool
{
	return !headersAreArray;
}
