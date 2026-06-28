package wphx.wp.http;

/**
	WP_Http::request proxy authentication branch decision for bounded Haxe
	ownership. PHP still owns proxy policy, native proxy object construction,
	username/password values, Requests dispatch, and live proxy behavior.
**/
@:keep
function shouldUseProxyAuthentication(useAuthentication:Bool):Bool
{
	return useAuthentication;
}
