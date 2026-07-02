package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestStreamDestinationError.shouldReturnStreamDestinationError;

/**
	Compile anchor for the WP_Http::request stream destination error candidate.
**/
class HttpRequestStreamDestinationErrorCandidateEntry
{
	static function main():Void
	{
		compileAllRequestHelpers();
		shouldReturnStreamDestinationError(false);
	}
}
