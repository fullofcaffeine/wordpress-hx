package wphx.fixtures.compiler.php.feed;

import wphx.fixtures.compiler.php.feed.FeedModuleSurface.feedContentType;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.atomSiteIcon;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.bloginfoRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.commentAuthorRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.commentGuid;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.commentLink;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.commentTextRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.commentsLinkFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getBloginfoRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getCommentAuthorRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getCommentGuid;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getDefaultFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheContentFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getTheTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.getWpTitleRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.htmlTypeRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.rss2SiteIcon;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.theContentFeed;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.theExcerptRss;
import wphx.fixtures.compiler.php.feed.FeedModuleSurface.thePermalinkRss;
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
		theExcerptRss();
		thePermalinkRss();
		commentsLinkFeed();
		commentGuid(null);
		getCommentGuid(null);
		commentLink(null);
		getCommentAuthorRss();
		commentAuthorRss();
		commentTextRss();
		getTheContentFeed("rss2");
		theContentFeed("rss2");
		feedContentType("rss2");
		htmlTypeRss();
		atomSiteIcon();
		rss2SiteIcon();
	}
}
