package wphx.fixtures.wp.core;

import wphx.wp.http.HttpBlockRequestPolicy.isLocalRequest;
import wphx.wp.http.HttpBlockRequestPolicy.shouldBlockExternalHost;
import wphx.wp.http.HttpRequestNonblocking.nonblockingResponse;
import wphx.wp.http.HttpRequestSafetyOptions.shouldRegisterRedirectValidation;
import wphx.wp.http.HttpRequestStreamBlocking.shouldForceBlockingForStream;

/**
	Compile anchor for the WP_Http::request URL-safety options Haxe candidate.
**/
class HttpRequestSafetyOptionsCandidateEntry
{
	static function main():Void
	{
		nonblockingResponse();
		isLocalRequest("localhost", "example.test");
		shouldBlockExternalHost("blocked.example", "example.test");
		shouldRegisterRedirectValidation(true, true);
		shouldForceBlockingForStream(true);
	}
}
