package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestStreamDefaultFilename.shouldUseDefaultStreamFilename;

/**
	Compile entry for the WP_Http request stream default-filename Haxe candidate.
**/
class HttpRequestStreamDefaultFilenameCandidateEntry
{
	public static function main():Void
	{
		compileAllRequestHelpers();
		shouldUseDefaultStreamFilename(true, false);
	}
}
