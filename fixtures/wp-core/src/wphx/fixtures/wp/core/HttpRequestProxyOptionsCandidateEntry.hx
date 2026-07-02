package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestProxyOptions.shouldUseProxy;

/**
	Compile entry for the WP_Http::request proxy options Haxe candidate.
**/
final class HttpRequestProxyOptionsCandidateEntry
{
	public static function main():Void
	{
		compileAllRequestHelpers();
		shouldUseProxy(true, true);
	}
}
