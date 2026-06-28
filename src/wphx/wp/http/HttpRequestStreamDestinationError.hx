package wphx.wp.http;

/**
	WP_Http::request stream destination error decision for bounded Haxe
	ownership. PHP still owns filename resolution, dirname/wp_is_writable,
	WP_Error construction, debug actions, and Requests dispatch.
**/
@:keep
function shouldReturnStreamDestinationError(destinationIsWritable:Bool):Bool
{
	return !destinationIsWritable;
}
