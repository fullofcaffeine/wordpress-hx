package wphx.fixtures.wp.core;

import wphx.wp.http.HttpProcessHeaders.headerKey;
import wphx.wp.http.HttpProcessHeaders.headerValue;
import wphx.wp.http.HttpProcessHeaders.responseCode;
import wphx.wp.http.HttpProcessHeaders.responseMessage;
import wphx.wp.http.HttpProcessHeaders.startsFinalResponseBlock;

/**
	Compile anchor for the WP_Http::processHeaders line-decision Haxe candidate.
**/
class HttpProcessHeadersCandidateEntry
{
	static function main():Void
	{
		startsFinalResponseBlock("HTTP/1.1 200 OK");
		responseCode("HTTP/1.1 200 OK");
		responseMessage("HTTP/1.1 200 OK");
		headerKey("X-Test: yes");
		headerValue("X-Test: yes");
	}
}
