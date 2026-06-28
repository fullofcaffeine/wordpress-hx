package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestRedirectionCopy.shouldCopyRedirection;

/**
	Compile entry for the WP_Http request redirection-copy Haxe candidate.
**/
class HttpRequestRedirectionCopyCandidateEntry
{
	public static function main():Void
	{
		shouldCopyRedirection(false);
	}
}
