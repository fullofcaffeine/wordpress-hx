package wphx.wp.http;

/**
	WP_Http::request redirection-loop counter preservation decision.
	PHP still owns parsed args, filters, redirect handling, Requests dispatch,
	and native array mutation.
**/
@:keep
function shouldCopyRedirection(hasStoredRedirection:Bool):Bool
{
	return !hasStoredRedirection;
}
