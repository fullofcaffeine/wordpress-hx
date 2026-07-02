package wphx.fixtures.compiler.php.feed;

import wphx.wp.boundary.NativeValue.NativeValue;

/**
	Extern for the stock Haxe PHP implementation behind generated feed.php functions.
**/
@:native("\\wphx\\fixtures\\php\\feed\\FeedKernel")
extern class HaxeFeedKernel
{
	static function getBloginfoRss(show:String):String;

	static function bloginfoRss(show:String):String;

	static function defaultFeed():String;

	static function getWpTitleRss(deprecated:String):String;

	static function wpTitleRss(deprecated:String):String;

	static function getTheTitleRss(post:Int):String;

	static function theTitleRss():String;

	static function theExcerptRss():String;

	static function thePermalinkRss():String;

	static function commentsLinkFeed():String;

	static function getCommentGuid(commentId:NativeValue):NativeValue;

	static function commentGuid(commentId:NativeValue):String;

	static function commentLink(comment:NativeValue):String;

	static function getCommentAuthorRss():String;

	static function commentAuthorRss():String;

	static function commentTextRss():String;

	static function getTheContentFeed(feedType:Null<String>):String;

	static function theContentFeed(feedType:Null<String>):String;

	static function feedContentType(type:Null<String>):String;

	static function htmlTypeRss():String;

	static function atomSiteIcon():String;

	static function rss2SiteIcon():String;
}
