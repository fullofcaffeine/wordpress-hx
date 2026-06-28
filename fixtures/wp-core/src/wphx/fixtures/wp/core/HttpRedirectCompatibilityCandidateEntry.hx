package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRedirectCompatibility.shouldUseBrowserGet;

class HttpRedirectCompatibilityCandidateEntry
{
	static function main():Void
	{
		shouldUseBrowserGet(302);
	}
}
