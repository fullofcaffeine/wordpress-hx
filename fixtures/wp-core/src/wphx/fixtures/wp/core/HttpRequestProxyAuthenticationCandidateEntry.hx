package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestProxyAuthentication.shouldUseProxyAuthentication;

/**
	Compile entry for the WP_Http::request proxy authentication Haxe candidate.
**/
final class HttpRequestProxyAuthenticationCandidateEntry
{
	public static function main():Void
	{
		shouldUseProxyAuthentication(true);
	}
}
