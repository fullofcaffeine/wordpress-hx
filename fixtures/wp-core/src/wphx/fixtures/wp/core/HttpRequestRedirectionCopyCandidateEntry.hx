package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestRedirectionCopy.shouldCopyRedirection;

/**
	Compile entry for the WP_Http request redirection-copy Haxe candidate.
**/
class HttpRequestRedirectionCopyCandidateEntry
{
	public static function main():Void
	{
		compileAllRequestHelpers();
		shouldCopyRedirection(false);
	}
}
