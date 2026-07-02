package wphx.fixtures.wp.core;

import wphx.wp.http.HttpBlockRequestPolicy.isLocalRequest;
import wphx.wp.http.HttpBlockRequestPolicy.shouldBlockExternalHost;
import wphx.wp.http.HttpProcessHeaders.headerKey;
import wphx.wp.http.HttpRequestBadProtocolStripping.shouldStripBadProtocol;
import wphx.wp.http.HttpRequestBlockedRequest.shouldReturnBlockedRequestError;
import wphx.wp.http.HttpRequestCookieOptions.shouldNormalizeRequestCookies;
import wphx.wp.http.HttpRequestErrorResponse.shouldReturnErrorResponse;
import wphx.wp.http.HttpRequestHeadRedirectionDefault.shouldDisableHeadDefaultRedirection;
import wphx.wp.http.HttpRequestHeaderParsing.shouldParseHeaders;
import wphx.wp.http.HttpRequestHttpResponseAttachment.shouldAttachHttpResponseObject;
import wphx.wp.http.HttpRequestInvalidUrl.shouldRejectInvalidRequestUrl;
import wphx.wp.http.HttpRequestMbstringReset.shouldResetMbstringEncodingAfterDispatch;
import wphx.wp.http.HttpRequestMethodOptions.shouldUseBodyDataFormat;
import wphx.wp.http.HttpRequestNonblocking.nonblockingResponse;
import wphx.wp.http.HttpRequestNullHeaderNormalization.shouldNormalizeHeaders;
import wphx.wp.http.HttpRequestPreemptiveResponse.shouldReturnPreemptiveResponse;
import wphx.wp.http.HttpRequestProxyAuthentication.shouldUseProxyAuthentication;
import wphx.wp.http.HttpRequestProxyOptions.shouldUseProxy;
import wphx.wp.http.HttpRequestRedirectOptions.shouldDisableRedirects;
import wphx.wp.http.HttpRequestRedirectionCopy.shouldCopyRedirection;
import wphx.wp.http.HttpRequestResponseSizeOptions.shouldSetMaxBytes;
import wphx.wp.http.HttpRequestSafetyOptions.shouldRegisterRedirectValidation;
import wphx.wp.http.HttpRequestSslOptions.shouldDisableSslVerification;
import wphx.wp.http.HttpRequestStreamBlocking.shouldForceBlockingForStream;
import wphx.wp.http.HttpRequestStreamDefaultFilename.shouldUseDefaultStreamFilename;
import wphx.wp.http.HttpRequestStreamDestinationError.shouldReturnStreamDestinationError;
import wphx.wp.http.HttpRequestStreamFilenameOptions.shouldSetStreamFilenameOption;
import wphx.wp.http.HttpRequestUnsafeUrlValidation.shouldValidateUnsafeUrl;

/**
	Compile anchor for every helper currently called by the generated
	`WP_Http::request` public shell.
**/
class WpHttpRequestCandidateAnchor
{
	public static function compileAllRequestHelpers():Void
	{
		nonblockingResponse();
		isLocalRequest("localhost", "example.test");
		shouldBlockExternalHost("blocked.example", "example.test");
		shouldStripBadProtocol(true);
		shouldReturnBlockedRequestError(true);
		shouldNormalizeRequestCookies(true);
		shouldReturnErrorResponse(true);
		shouldDisableHeadDefaultRedirection(true, "HEAD");
		shouldParseHeaders(false);
		shouldAttachHttpResponseObject();
		shouldRejectInvalidRequestUrl("relative/path", null);
		shouldResetMbstringEncodingAfterDispatch();
		shouldUseBodyDataFormat("POST");
		shouldNormalizeHeaders(true);
		shouldReturnPreemptiveResponse(true);
		shouldUseProxyAuthentication(true);
		shouldUseProxy(true, true);
		shouldDisableRedirects(0);
		shouldCopyRedirection(false);
		shouldSetMaxBytes(12);
		shouldRegisterRedirectValidation(true, true);
		shouldDisableSslVerification(false);
		shouldForceBlockingForStream(true);
		shouldUseDefaultStreamFilename(true, false);
		shouldReturnStreamDestinationError(false);
		shouldSetStreamFilenameOption(true);
		shouldValidateUnsafeUrl(true, true);
		headerKey("X-Test: yes");
	}
}
