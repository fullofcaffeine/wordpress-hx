package wphx.wp.http;

/**
	WP_Http::request unsafe URL validation decision for bounded Haxe
	ownership. PHP still owns filter values, function availability,
	wp_http_validate_url semantics, URL mutation, and error/debug handling.
**/
@:keep
function shouldValidateUnsafeUrl(canValidateProtocol:Bool, rejectUnsafeUrls:Bool):Bool
{
	return canValidateProtocol && rejectUnsafeUrls;
}
