package wphx.fixtures.wp.core;

import wphx.wp.http.HttpRequestUnsafeUrlValidation.shouldValidateUnsafeUrl;

/**
	Compile anchor for the WP_Http::request unsafe URL validation candidate.
**/
class HttpRequestUnsafeUrlValidationCandidateEntry
{
	static function main():Void
	{
		shouldValidateUnsafeUrl(true, true);
	}
}
