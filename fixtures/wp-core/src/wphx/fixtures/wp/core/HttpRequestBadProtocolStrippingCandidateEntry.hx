package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestBadProtocolStripping.shouldStripBadProtocol;

/**
	Compile anchor for the WP_Http::request bad-protocol stripping candidate.
**/
class HttpRequestBadProtocolStrippingCandidateEntry
{
	static function main():Void
	{
		shouldStripBadProtocol(true);
	}
}
