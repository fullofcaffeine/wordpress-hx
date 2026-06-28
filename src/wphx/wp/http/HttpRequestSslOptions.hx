package wphx.wp.http;

/**
	WP_Http::request SSL option decisions for bounded Haxe ownership. PHP still
	owns certificate paths, filter dispatch, Requests option arrays, transport
	TLS behavior, and response handling.
**/
@:keep
function shouldDisableSslVerification(sslverify:Bool):Bool
{
	return !sslverify;
}
