package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;

/**
	Compile entry for the recorded WP_Http transport parity gate.
**/
class HttpRequestTransportParityGateEntry
{
	public static function main():Void
	{
		compileAllRequestHelpers();
	}
}
