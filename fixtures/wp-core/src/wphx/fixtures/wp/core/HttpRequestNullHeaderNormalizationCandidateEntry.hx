package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestNullHeaderNormalization.shouldNormalizeHeaders;

/**
	Compile entry for the WP_Http request null-header normalization Haxe candidate.
**/
class HttpRequestNullHeaderNormalizationCandidateEntry
{
	public static function main():Void
	{
		shouldNormalizeHeaders(true);
	}
}
