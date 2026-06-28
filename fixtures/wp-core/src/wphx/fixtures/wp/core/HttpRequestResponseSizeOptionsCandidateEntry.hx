package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestResponseSizeOptions.shouldSetMaxBytes;

/**
	Compile anchor for the WP_Http::request response-size options Haxe candidate.
**/
class HttpRequestResponseSizeOptionsCandidateEntry
{
	static function main():Void
	{
		shouldSetMaxBytes(12);
	}
}
