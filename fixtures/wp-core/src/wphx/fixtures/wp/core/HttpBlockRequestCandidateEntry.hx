package wphx.fixtures.wp.core;

import wphx.wp.http.HttpBlockRequestPolicy.isLocalRequest;
import wphx.wp.http.HttpBlockRequestPolicy.shouldBlockExternalHost;

class HttpBlockRequestCandidateEntry
{
	static function main():Void
	{
		isLocalRequest("localhost", "site.example.test");
		shouldBlockExternalHost("api.wordpress.org", "*.wordpress.org");
	}
}
