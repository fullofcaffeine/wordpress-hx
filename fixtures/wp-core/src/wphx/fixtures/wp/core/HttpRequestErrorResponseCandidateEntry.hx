package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestErrorResponse.shouldReturnErrorResponse;

/**
	Compile entry for the WP_Http::request error response Haxe candidate.
**/
final class HttpRequestErrorResponseCandidateEntry
{
	public static function main():Void
	{
		shouldReturnErrorResponse(true);
	}
}
