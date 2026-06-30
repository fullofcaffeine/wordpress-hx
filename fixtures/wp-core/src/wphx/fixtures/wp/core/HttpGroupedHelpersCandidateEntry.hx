package wphx.fixtures.wp.core;

import wphx.wp.http.HttpChunkTransferDecode.decodeChunkTransfer;
import wphx.wp.http.HttpCookieHeaderAssembly.appendCookieHeader;
import wphx.wp.http.HttpDeprecatedParseUrl.deprecatedFunctionName;
import wphx.wp.http.HttpDeprecatedParseUrl.deprecatedVersion;
import wphx.wp.http.HttpDeprecatedParseUrl.parseUrl;
import wphx.wp.http.HttpDeprecatedParseUrl.replacementFunctionName;
import wphx.wp.http.HttpAbsoluteUrl.makeAbsoluteUrl;
import wphx.wp.http.HttpIpAddress.ipAddressVersion;
import wphx.wp.http.HttpProcessHeaders.headerKey;
import wphx.wp.http.HttpProcessHeaders.headerValue;
import wphx.wp.http.HttpProcessHeaders.isHeaderLine;
import wphx.wp.http.HttpProcessHeaders.responseCode;
import wphx.wp.http.HttpProcessHeaders.responseMessage;
import wphx.wp.http.HttpProcessHeaders.startsFinalResponseBlock;
import wphx.wp.http.HttpProcessResponse.responseBody;
import wphx.wp.http.HttpProcessResponse.responseHeaders;
import wphx.wp.http.HttpRedirectCompatibility.shouldUseBrowserGet;
import wphx.wp.http.HttpRedirectValidation.shouldRejectRedirect;

/**
	Compile anchor for grouped WP_Http parser/header/cookie Haxe helpers.
**/
class HttpGroupedHelpersCandidateEntry
{
	static function main():Void
	{
		responseHeaders("HTTP/1.1 200 OK\r\n\r\nbody");
		responseBody("HTTP/1.1 200 OK\r\n\r\nbody");
		decodeChunkTransfer("4\r\nTest\r\n0");
		deprecatedFunctionName();
		deprecatedVersion();
		replacementFunctionName();
		parseUrl("https://example.test/");
		ipAddressVersion("127.0.0.1");
		appendCookieHeader("", "a=1");
		startsFinalResponseBlock("HTTP/1.1 200 OK");
		isHeaderLine("X-Test: yes");
		responseCode("HTTP/1.1 200 OK");
		responseMessage("HTTP/1.1 200 OK");
		headerKey("X-Test: yes");
		headerValue("X-Test: yes");
		shouldUseBrowserGet(302);
		shouldRejectRedirect(false);
		makeAbsoluteUrl("../img/logo.png", "https", "example.test", null, "/wp-admin/css/edit.css", true, false, null, null, "../img/logo.png", true, "",
			false, "", false);
	}
}
