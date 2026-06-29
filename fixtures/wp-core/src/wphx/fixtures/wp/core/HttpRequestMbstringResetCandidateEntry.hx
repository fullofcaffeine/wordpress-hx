package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestMbstringReset.shouldResetMbstringEncodingAfterDispatch;

/**
	Compile entry for the WP_Http request mbstring reset Haxe candidate.
**/
class HttpRequestMbstringResetCandidateEntry
{
	public static function main():Void
	{
		shouldResetMbstringEncodingAfterDispatch();
	}
}
