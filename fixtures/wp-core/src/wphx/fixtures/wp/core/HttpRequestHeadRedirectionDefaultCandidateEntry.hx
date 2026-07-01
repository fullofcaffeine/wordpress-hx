package wphx.fixtures.wp.core;

import wphx.wp.http.HttpBlockRequestPolicy.isLocalRequest;
import wphx.wp.http.HttpBlockRequestPolicy.shouldBlockExternalHost;
import wphx.wp.http.HttpRequestBlockedRequest.shouldReturnBlockedRequestError;
import wphx.wp.http.HttpRequestInvalidUrl.shouldRejectInvalidRequestUrl;
import wphx.wp.http.HttpRequestHeadRedirectionDefault.shouldDisableHeadDefaultRedirection;
import wphx.wp.http.HttpRequestMethodOptions.shouldUseBodyDataFormat;
import wphx.wp.http.HttpRequestNonblocking.nonblockingResponse;
import wphx.wp.http.HttpRequestPreemptiveResponse.shouldReturnPreemptiveResponse;
import wphx.wp.http.HttpRequestRedirectOptions.shouldDisableRedirects;
import wphx.wp.http.HttpRequestResponseSizeOptions.shouldSetMaxBytes;
import wphx.wp.http.HttpRequestSafetyOptions.shouldRegisterRedirectValidation;
import wphx.wp.http.HttpRequestSslOptions.shouldDisableSslVerification;
import wphx.wp.http.HttpRequestStreamBlocking.shouldForceBlockingForStream;
import wphx.wp.http.HttpRequestStreamFilenameOptions.shouldSetStreamFilenameOption;
import wphx.wp.http.HttpProcessHeaders.headerKey;

/**
	Compile anchor for the WP_Http::request HEAD redirection default candidate.
**/
class HttpRequestHeadRedirectionDefaultCandidateEntry
{
	static function main():Void
	{
		nonblockingResponse();
		isLocalRequest("localhost", "example.test");
		shouldBlockExternalHost("blocked.example", "example.test");
		shouldReturnBlockedRequestError(true);
		shouldRejectInvalidRequestUrl("relative/path", null);
		shouldDisableHeadDefaultRedirection(true, "HEAD");
		shouldUseBodyDataFormat("POST");
		shouldReturnPreemptiveResponse(true);
		shouldDisableRedirects(0);
		shouldSetMaxBytes(12);
		headerKey("X-Test: yes");
		shouldRegisterRedirectValidation(true, true);
		shouldDisableSslVerification(false);
		shouldForceBlockingForStream(true);
		shouldSetStreamFilenameOption(true);
	}
}
