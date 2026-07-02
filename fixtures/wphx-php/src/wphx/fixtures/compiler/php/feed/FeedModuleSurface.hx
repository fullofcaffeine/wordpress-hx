package wphx.fixtures.compiler.php.feed;

/**
	Selected unguarded WordPress feed.php module functions emitted at the original path.
**/
@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("get_bloginfo_rss")
@:keep
function getBloginfoRss(@:wp.name("show") show:String = ""):String
{
	return HaxeFeedKernel.getBloginfoRss(show);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("bloginfo_rss")
@:wp.echo
@:keep
function bloginfoRss(@:wp.name("show") show:String = ""):String
{
	return HaxeFeedKernel.bloginfoRss(show);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("get_default_feed")
@:keep
function getDefaultFeed():String
{
	return HaxeFeedKernel.defaultFeed();
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("get_wp_title_rss")
@:keep
function getWpTitleRss(@:wp.name("deprecated") deprecated:String = "&#8211;"):String
{
	return HaxeFeedKernel.getWpTitleRss(deprecated);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("wp_title_rss")
@:wp.echo
@:keep
function wpTitleRss(@:wp.name("deprecated") deprecated:String = "&#8211;"):String
{
	return HaxeFeedKernel.wpTitleRss(deprecated);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("get_the_title_rss")
@:keep
function getTheTitleRss(@:wp.name("post") post:Int = 0):String
{
	return HaxeFeedKernel.getTheTitleRss(post);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("the_title_rss")
@:wp.echo
@:keep
function theTitleRss():String
{
	return HaxeFeedKernel.theTitleRss();
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("get_the_content_feed")
@:keep
function getTheContentFeed(@:wp.name("feed_type") feedType:Null<String> = null):String
{
	return HaxeFeedKernel.getTheContentFeed(feedType);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("the_content_feed")
@:wp.echo
@:keep
function theContentFeed(@:wp.name("feed_type") feedType:Null<String> = null):String
{
	return HaxeFeedKernel.theContentFeed(feedType);
}

@:wp.file("wp-includes/feed.php")
@:wp.haxeBootstrap("WPHX_FEED_MODULE_BOOTSTRAPPED")
@:wp.global("feed_content_type")
@:keep
function feedContentType(@:wp.name("type") type:Null<String> = ""):String
{
	return HaxeFeedKernel.feedContentType(type);
}
