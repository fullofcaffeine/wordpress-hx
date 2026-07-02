package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestHeaderParsing.shouldParseHeaders;

/**
	Compile entry for the WP_Http::request header parsing Haxe candidate.
**/
final class HttpRequestHeaderParsingCandidateEntry
{
	public static function main():Void
	{
		compileAllRequestHelpers();
		shouldParseHeaders(false);
	}
}
