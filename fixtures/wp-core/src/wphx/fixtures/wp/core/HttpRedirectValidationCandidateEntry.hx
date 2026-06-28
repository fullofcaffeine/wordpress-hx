package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRedirectValidation.shouldRejectRedirect;

class HttpRedirectValidationCandidateEntry
{
	static function main():Void
	{
		shouldRejectRedirect(false);
	}
}
