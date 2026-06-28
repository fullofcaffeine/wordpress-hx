package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestCookieOptions.shouldNormalizeRequestCookies;

/**
	Compile anchor for the WP_Http::request cookie options Haxe candidate.
**/
class HttpRequestCookieOptionsCandidateEntry
{
	static function main():Void
	{
		shouldNormalizeRequestCookies(true);
	}
}
