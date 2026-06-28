package wphx.wp.http;

/**
	WP_Http::request bad-protocol stripping decision for bounded Haxe
	ownership. PHP still owns URL values, validation, wp_kses_bad_protocol
	semantics, error/debug handling, and dispatch.
**/
@:keep
function shouldStripBadProtocol(hasUrl:Bool):Bool
{
	return hasUrl;
}
