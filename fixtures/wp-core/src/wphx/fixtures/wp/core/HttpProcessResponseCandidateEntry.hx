package wphx.fixtures.wp.core;

import wphx.wp.http.HttpProcessResponse.responseBody;
import wphx.wp.http.HttpProcessResponse.responseHeaders;

/**
	Compile anchor for the WP_Http::processResponse Haxe parity candidate.
**/
class HttpProcessResponseCandidateEntry
{
	static function main():Void
	{
		responseHeaders("HTTP/1.1 200 OK\r\n\r\nbody");
		responseBody("HTTP/1.1 200 OK\r\n\r\nbody");
	}
}
