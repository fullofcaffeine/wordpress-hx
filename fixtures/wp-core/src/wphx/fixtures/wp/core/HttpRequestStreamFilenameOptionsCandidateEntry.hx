package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestStreamFilenameOptions.shouldSetStreamFilenameOption;

/**
	Compile anchor for the WP_Http::request stream filename options Haxe candidate.
**/
class HttpRequestStreamFilenameOptionsCandidateEntry
{
	static function main():Void
	{
		shouldSetStreamFilenameOption(true);
	}
}
