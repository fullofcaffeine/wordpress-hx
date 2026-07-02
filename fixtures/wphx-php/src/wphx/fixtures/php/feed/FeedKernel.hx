package wphx.fixtures.php.feed;

/**
	Selected feed helper behavior owned by Haxe behind original-path PHP functions.
**/
@:keep
class FeedKernel
{
	public static function getBloginfoRss(show:String):String
	{
		final info = WpFeedGlobals.stripTags(WpFeedGlobals.getBloginfo(show));
		return WpHooks.applyFilters2("get_bloginfo_rss", WpFeedGlobals.convertChars(info), show);
	}

	public static function defaultFeed():String
	{
		final defaultFeed = WpHooks.applyFilters1("default_feed", "rss2");
		return defaultFeed == "rss" ? "rss2" : defaultFeed;
	}

	public static function getWpTitleRss(deprecated:String):String
	{
		if (deprecated != "&#8211;")
		{
			WpFeedGlobals.deprecatedArgument("get_wp_title_rss", "4.4.0",
				WpFeedGlobals.sprintf(WpFeedGlobals.translate("Use the %s filter instead."), "<code>document_title_separator</code>"));
		}
		return WpHooks.applyFilters2("get_wp_title_rss", WpFeedGlobals.wpGetDocumentTitle(), deprecated);
	}

	public static function getTheTitleRss(post:Int):String
	{
		final title = WpFeedGlobals.getTheTitle(post);
		return WpHooks.applyFilters1("the_title_rss", title);
	}

	public static function getTheContentFeed(feedType:Null<String>):String
	{
		final normalizedFeedType = isPhpEmptyString(feedType) ? defaultFeed() : feedType;
		var content = WpHooks.applyFilters1("the_content", WpFeedGlobals.getTheContent());
		content = WpFeedGlobals.strReplace("]]>", "]]&gt;", content);
		return WpHooks.applyFilters2("the_content_feed", content, normalizedFeedType);
	}

	public static function feedContentType(type:Null<String>):String
	{
		final normalizedType = isPhpEmptyString(type) ? defaultFeed() : type;
		final contentType = switch (normalizedType)
		{
			case "rss" | "rss2":
				"application/rss+xml";
			case "rss-http":
				"text/xml";
			case "atom":
				"application/atom+xml";
			case "rdf":
				"application/rdf+xml";
			case _:
				"application/octet-stream";
		}
		return WpHooks.applyFilters2("feed_content_type", contentType, normalizedType);
	}

	static function isPhpEmptyString(value:Null<String>):Bool
	{
		return value == null || value == "" || value == "0";
	}
}

/**
	Narrow externs for WordPress feed helper calls preserved at the PHP boundary.
**/
@:phpGlobal
extern class WpFeedGlobals
{
	@:native("strip_tags")
	public static function stripTags(value:String):String;

	@:native("get_bloginfo")
	public static function getBloginfo(show:String):String;

	@:native("convert_chars")
	public static function convertChars(value:String):String;

	@:native("_deprecated_argument")
	public static function deprecatedArgument(functionName:String, version:String, message:String):Void;

	@:native("__")
	public static function translate(message:String):String;

	@:native("sprintf")
	public static function sprintf(format:String, arg:String):String;

	@:native("wp_get_document_title")
	public static function wpGetDocumentTitle():String;

	@:native("get_the_title")
	public static function getTheTitle(post:Int):String;

	@:native("get_the_content")
	public static function getTheContent():String;

	@:native("str_replace")
	public static function strReplace(search:String, replace:String, subject:String):String;
}

/**
	Narrow extern for WordPress filter dispatch at the public PHP boundary.
**/
@:phpGlobal
extern class WpHooks
{
	@:native("apply_filters")
	public static function applyFilters1(hookName:String, value:String):String;

	@:native("apply_filters")
	public static function applyFilters2(hookName:String, value:String, arg:String):String;
}
