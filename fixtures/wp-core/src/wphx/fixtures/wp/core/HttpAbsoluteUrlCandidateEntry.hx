package wphx.fixtures.wp.core;

import wphx.wp.http.HttpAbsoluteUrl.makeAbsoluteUrl;

class HttpAbsoluteUrlCandidateEntry
{
	static function main():Void
	{
		makeAbsoluteUrl("../img/logo.png", "https", "example.test", null, "/wp-admin/css/edit.css", true, false, null, null, "../img/logo.png", true, "",
			false, "", false);
	}
}
