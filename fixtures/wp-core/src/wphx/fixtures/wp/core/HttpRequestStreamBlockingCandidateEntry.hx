package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestStreamBlocking.shouldForceBlockingForStream;

/**
	Compile anchor for the WP_Http::request stream blocking Haxe candidate.
**/
class HttpRequestStreamBlockingCandidateEntry
{
	static function main():Void
	{
		shouldForceBlockingForStream(true);
	}
}
