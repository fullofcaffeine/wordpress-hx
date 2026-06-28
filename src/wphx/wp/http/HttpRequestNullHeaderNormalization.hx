package wphx.wp.http;

/**
	WP_Http::request null-header normalization decision for bounded Haxe
	ownership. PHP still owns parsed args, native array mutation, header values,
	header parsing, Requests dispatch, and response filtering.
**/
@:keep
function shouldNormalizeHeaders(headersAreNull:Bool):Bool
{
	return headersAreNull;
}
