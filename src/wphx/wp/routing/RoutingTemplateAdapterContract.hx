package wphx.wp.routing;

using StringTools;

@:keep
class RoutingTemplateAdapterContract
{
	public static inline final ROUTE_INDEX = "route_index";
	public static inline final ROUTE_REWRITE_RULE = "route_rewrite_rule";
	public static inline final ROUTE_ROOT_PAGE = "route_root_page";
	public static inline final ROUTE_404 = "route_404";
	public static inline final ROUTE_ADMIN = "route_admin";
	public static inline final ROUTE_REST = "route_rest";
	public static inline final ROUTE_FEED = "route_feed";
	public static inline final ROUTE_ROBOTS = "route_robots";
	public static inline final ROUTE_SITEMAP = "route_sitemap";

	public static inline final REQUEST_MAIN_QUERY = "request_main_query";
	public static inline final REQUEST_EMPTY = "request_empty";
	public static inline final REQUEST_REST = "request_rest";
	public static inline final REQUEST_FEED = "request_feed";
	public static inline final REQUEST_404 = "request_404";

	public static inline final CANONICAL_NONE = "canonical_no_redirect";
	public static inline final CANONICAL_SLASH = "canonical_trailing_slash";
	public static inline final CANONICAL_HOST = "canonical_host";
	public static inline final CANONICAL_PAGED = "canonical_paged";
	public static inline final CANONICAL_ATTACHMENT = "canonical_attachment";
	public static inline final CANONICAL_404 = "canonical_404";

	public static inline final LINK_PERMALINK = "link_permalink";
	public static inline final LINK_HOME = "link_home";
	public static inline final LINK_FEED = "link_feed";
	public static inline final LINK_PAGED = "link_paged";
	public static inline final LINK_PREVIEW = "link_preview";
	public static inline final LINK_ATTACHMENT = "link_attachment";

	public static inline final TEMPLATE_FRONT_PAGE = "template_front_page";
	public static inline final TEMPLATE_HOME = "template_home";
	public static inline final TEMPLATE_SINGLE = "template_single";
	public static inline final TEMPLATE_PAGE = "template_page";
	public static inline final TEMPLATE_ARCHIVE = "template_archive";
	public static inline final TEMPLATE_SEARCH = "template_search";
	public static inline final TEMPLATE_404 = "template_404";
	public static inline final TEMPLATE_FEED = "template_feed";

	public static inline final HOOK_NONE = "routing_template_no_hooks";
	public static inline final HOOK_REWRITE = "rewrite_rule_hooks";
	public static inline final HOOK_REQUEST = "request_parse_hooks";
	public static inline final HOOK_CANONICAL = "canonical_redirect_hooks";
	public static inline final HOOK_LINK = "link_template_hooks";
	public static inline final HOOK_TEMPLATE = "template_loader_hooks";

	public static function routeKind(path:String, hasRewriteMatch:Bool, isAdmin:Bool, isRest:Bool, isFeed:Bool, isRobots:Bool, isSitemap:Bool):String
	{
		final normalized = normalizePath(path);
		if (isAdmin || normalized.startsWith("wp-admin"))
		{
			return ROUTE_ADMIN;
		}
		if (isRest || normalized.startsWith("wp-json"))
		{
			return ROUTE_REST;
		}
		if (isFeed || normalized.endsWith("/feed") || normalized == "feed")
		{
			return ROUTE_FEED;
		}
		if (isRobots || normalized == "robots.txt")
		{
			return ROUTE_ROBOTS;
		}
		if (isSitemap || normalized.startsWith("wp-sitemap"))
		{
			return ROUTE_SITEMAP;
		}
		if (normalized == "")
		{
			return ROUTE_INDEX;
		}
		if (hasRewriteMatch)
		{
			return ROUTE_REWRITE_RULE;
		}
		return normalized.indexOf("/") < 0 ? ROUTE_ROOT_PAGE : ROUTE_404;
	}

	public static function requestPlan(route:String, hasQueryVars:Bool, didMatchRewrite:Bool, isRestRequest:Bool, isFeedRequest:Bool):String
	{
		if (isRestRequest || route == ROUTE_REST)
		{
			return REQUEST_REST;
		}
		if (isFeedRequest || route == ROUTE_FEED)
		{
			return REQUEST_FEED;
		}
		if (route == ROUTE_404)
		{
			return REQUEST_404;
		}
		if (!hasQueryVars && !didMatchRewrite)
		{
			return REQUEST_EMPTY;
		}
		return REQUEST_MAIN_QUERY;
	}

	public static function canonicalPlan(needsRedirect:Bool, is404:Bool, hostChanged:Bool, slashChanged:Bool, pagedChanged:Bool, attachmentRedirect:Bool):String
	{
		if (!needsRedirect)
		{
			return CANONICAL_NONE;
		}
		if (is404)
		{
			return CANONICAL_404;
		}
		if (attachmentRedirect)
		{
			return CANONICAL_ATTACHMENT;
		}
		if (hostChanged)
		{
			return CANONICAL_HOST;
		}
		if (pagedChanged)
		{
			return CANONICAL_PAGED;
		}
		return slashChanged ? CANONICAL_SLASH : CANONICAL_NONE;
	}

	public static function linkPlan(kind:String, prettyPermalinks:Bool, isPreview:Bool, isAttachment:Bool, paged:Int):String
	{
		if (isPreview)
		{
			return LINK_PREVIEW;
		}
		if (isAttachment)
		{
			return LINK_ATTACHMENT;
		}
		if (paged > 1)
		{
			return LINK_PAGED;
		}
		final normalized = kind.trim().toLowerCase();
		return switch normalized
		{
			case "home" | "site":
				LINK_HOME;
			case "feed" | "rss" | "rss2" | "atom":
				LINK_FEED;
			case _:
				prettyPermalinks ? LINK_PERMALINK : LINK_HOME;
		}
	}

	public static function templatePlan(is404:Bool, isFeed:Bool, isSearch:Bool, isFrontPage:Bool, isHome:Bool, isSingle:Bool, isPage:Bool,
			isArchive:Bool):String
	{
		if (is404)
		{
			return TEMPLATE_404;
		}
		if (isFeed)
		{
			return TEMPLATE_FEED;
		}
		if (isSearch)
		{
			return TEMPLATE_SEARCH;
		}
		if (isFrontPage)
		{
			return TEMPLATE_FRONT_PAGE;
		}
		if (isHome)
		{
			return TEMPLATE_HOME;
		}
		if (isSingle)
		{
			return TEMPLATE_SINGLE;
		}
		if (isPage)
		{
			return TEMPLATE_PAGE;
		}
		return isArchive ? TEMPLATE_ARCHIVE : TEMPLATE_404;
	}

	public static function hookPlan(operation:String, succeeded:Bool):String
	{
		if (!succeeded)
		{
			return HOOK_NONE;
		}
		return switch operation.trim().toLowerCase()
		{
			case "rewrite" | "flush_rewrite_rules":
				HOOK_REWRITE;
			case "parse_request" | "query_vars":
				HOOK_REQUEST;
			case "redirect_canonical":
				HOOK_CANONICAL;
			case "link" | "permalink":
				HOOK_LINK;
			case "template" | "template_include":
				HOOK_TEMPLATE;
			case _:
				HOOK_NONE;
		}
	}

	static function normalizePath(path:String):String
	{
		var normalized = path.trim();
		while (normalized.startsWith("/"))
		{
			normalized = normalized.substr(1);
		}
		while (normalized.endsWith("/") && normalized.length > 0)
		{
			normalized = normalized.substr(0, normalized.length - 1);
		}
		return normalized.toLowerCase();
	}
}
