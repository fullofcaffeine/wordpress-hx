package wphx.fixtures.compiler.php.feed;

import wphx.fixtures.compiler.php.feed.FeedModuleSurface.feedContentType;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getBloginfoRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getDefaultFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheContentFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getWpTitleRss;

/**
	Compile anchor for original-path feed module function adapters.
**/
class FeedModuleEntry
{
	static function main():Void
	{
		getBloginfoRss("name");
		getDefaultFeed();
		getWpTitleRss();
		getTheTitleRss(0);
		getTheContentFeed("rss2");
		feedContentType("rss2");
	}
}
