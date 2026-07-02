package wphx.fixtures.wp.core;

import wphx.fixtures.wp.core.WpHttpRequestCandidateAnchor.compileAllRequestHelpers;
import wphx.wp.http.HttpRequestUnsafeUrlValidation.shouldValidateUnsafeUrl;

/**
	Compile anchor for the WP_Http::request unsafe URL validation candidate.
**/
class HttpRequestUnsafeUrlValidationCandidateEntry
{
	static function main():Void
	{
		compileAllRequestHelpers();
		shouldValidateUnsafeUrl(true, true);
	}
}
