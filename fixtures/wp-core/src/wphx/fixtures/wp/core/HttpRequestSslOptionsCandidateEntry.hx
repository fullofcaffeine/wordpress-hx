package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestSslOptions.shouldDisableSslVerification;

/**
	Compile anchor for the WP_Http::request SSL options Haxe candidate.
**/
class HttpRequestSslOptionsCandidateEntry
{
	static function main():Void
	{
		shouldDisableSslVerification(false);
	}
}
