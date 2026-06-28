package wphx.wp.http;

/**
	WP_Http::request error response early-return decision for bounded Haxe
	ownership. PHP still owns WP_Error construction, is_wp_error evaluation,
	debug timing, nonblocking shape, response filtering, and Requests dispatch.
**/
@:keep
function shouldReturnErrorResponse(isErrorResponse:Bool):Bool
{
	return isErrorResponse;
}
