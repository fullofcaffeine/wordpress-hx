package wphx.fixtures.compiler.php.feed;

import wphx.fixtures.compiler.php.feed.FeedModuleSurface.feedContentType;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.bloginfoRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getBloginfoRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getDefaultFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheContentFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getWpTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.theContentFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.theTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.wpTitleRss;

/**
	Compile anchor for original-path feed module function adapters.
**/
class FeedModuleEntry
{
	static function main():Void
	{
		getBloginfoRss("name");
		bloginfoRss("name");
		getDefaultFeed();
		getWpTitleRss();
		wpTitleRss();
		getTheTitleRss(0);
		theTitleRss();
		getTheContentFeed("rss2");
		theContentFeed("rss2");
		feedContentType("rss2");
	}
}
