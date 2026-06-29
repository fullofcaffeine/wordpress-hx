package wphx.wp.http;

/**
	WP_Http::request mbstring reset decision for bounded Haxe ownership.
	PHP still owns mbstring encoding semantics, Requests dispatch, exception
	conversion, debug/filter timing, nonblocking exits, and public method ABI.
**/
@:keep
function shouldResetMbstringEncodingAfterDispatch():Bool
{
	return true;
}
