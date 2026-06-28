package wphx.wp.http;

/**
	WP_Http::request stream default-filename decision for bounded Haxe
	ownership. PHP still owns temp-dir lookup, basename/path semantics,
	native array mutation, writable checks, Requests dispatch, and file I/O.
**/
@:keep
function shouldUseDefaultStreamFilename(isStreaming:Bool, hasFilename:Bool):Bool
{
	return isStreaming && !hasFilename;
}
