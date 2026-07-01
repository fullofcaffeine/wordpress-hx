package wphx.fixtures.wp.core;

import wphx.wp.http.HttpBlockRequestPolicy.isLocalRequest;
import wphx.wp.http.HttpBlockRequestPolicy.shouldBlockExternalHost;
import wphx.wp.http.HttpProcessHeaders.headerKey;
import wphx.wp.http.HttpRequestHeadRedirectionDefault.shouldDisableHeadDefaultRedirection;
import wphx.wp.http.HttpRequestMethodOptions.shouldUseBodyDataFormat;
import wphx.wp.http.HttpRequestNonblocking.nonblockingResponse;
import wphx.wp.http.HttpRequestRedirectOptions.shouldDisableRedirects;
import wphx.wp.http.HttpRequestResponseSizeOptions.shouldSetMaxBytes;
import wphx.wp.http.HttpRequestSafetyOptions.shouldRegisterRedirectValidation;
import wphx.wp.http.HttpRequestSslOptions.shouldDisableSslVerification;
import wphx.wp.http.HttpRequestStreamBlocking.shouldForceBlockingForStream;
import wphx.wp.http.HttpRequestStreamFilenameOptions.shouldSetStreamFilenameOption;

/**
	Compile anchor for the WP_Http::request response-size options Haxe candidate.
**/
class HttpRequestResponseSizeOptionsCandidateEntry
{
	static function main():Void
	{
		nonblockingResponse();
		isLocalRequest("localhost", "example.test");
		shouldBlockExternalHost("blocked.example", "example.test");
		shouldDisableHeadDefaultRedirection(true, "HEAD");
		shouldUseBodyDataFormat("POST");
		shouldDisableRedirects(0);
		shouldSetMaxBytes(12);
		headerKey("X-Test: yes");
		shouldRegisterRedirectValidation(true, true);
		shouldDisableSslVerification(false);
		shouldForceBlockingForStream(true);
		shouldSetStreamFilenameOption(true);
	}
}
