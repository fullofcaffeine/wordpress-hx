package wphx.fixtures.compiler.php.feed;

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

	static function getTheContentFeed(feedType:Null<String>):String;

	static function theContentFeed(feedType:Null<String>):String;

	static function feedContentType(type:Null<String>):String;
}
