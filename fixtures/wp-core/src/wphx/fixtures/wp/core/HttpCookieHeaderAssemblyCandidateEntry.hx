package wphx.fixtures.wp.core;

import wphx.wp.http.HttpCookieHeaderAssembly.appendCookieHeader;

/**
	Compile anchor for the WP_Http::buildCookieHeader assembly Haxe candidate.
**/
class HttpCookieHeaderAssemblyCandidateEntry
{
	static function main():Void
	{
		appendCookieHeader("", "a=1");
		appendCookieHeader("a=1", "b=2");
	}
}
