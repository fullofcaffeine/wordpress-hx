package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestMethodOptions.shouldUseBodyDataFormat;

/**
	Compile anchor for the WP_Http::request method options Haxe candidate.
**/
class HttpRequestMethodOptionsCandidateEntry
{
	static function main():Void
	{
		shouldUseBodyDataFormat("POST");
	}
}
