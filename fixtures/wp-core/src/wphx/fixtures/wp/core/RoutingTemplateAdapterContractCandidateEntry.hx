package wphx.fixtures.wp.core;

import wphx.wp.routing.RoutingTemplateAdapterContract;

@:keep
class RoutingTemplateAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("route:index", RoutingTemplateAdapterContract.routeKind("/", false, false, false, false, false, false));
		emit("route:rewrite", RoutingTemplateAdapterContract.routeKind("/2026/06/sample-post/", true, false, false, false, false, false));
		emit("route:root-page", RoutingTemplateAdapterContract.routeKind("/about/", false, false, false, false, false, false));
		emit("route:404", RoutingTemplateAdapterContract.routeKind("/missing/deep/path/", false, false, false, false, false, false));
		emit("route:admin", RoutingTemplateAdapterContract.routeKind("/wp-admin/edit.php", false, false, false, false, false, false));
		emit("route:rest", RoutingTemplateAdapterContract.routeKind("/wp-json/wp/v2/posts", false, false, false, false, false, false));
		emit("route:feed", RoutingTemplateAdapterContract.routeKind("/category/news/feed", false, false, false, false, false, false));
		emit("route:robots", RoutingTemplateAdapterContract.routeKind("/robots.txt", false, false, false, false, false, false));
		emit("route:sitemap", RoutingTemplateAdapterContract.routeKind("/wp-sitemap-posts-post-1.xml", false, false, false, false, false, false));

		emit("request:main", RoutingTemplateAdapterContract.requestPlan(RoutingTemplateAdapterContract.ROUTE_REWRITE_RULE, true, true, false, false));
		emit("request:empty", RoutingTemplateAdapterContract.requestPlan(RoutingTemplateAdapterContract.ROUTE_INDEX, false, false, false, false));
		emit("request:rest", RoutingTemplateAdapterContract.requestPlan(RoutingTemplateAdapterContract.ROUTE_REST, true, false, false, false));
		emit("request:feed", RoutingTemplateAdapterContract.requestPlan(RoutingTemplateAdapterContract.ROUTE_FEED, true, false, false, false));
		emit("request:404", RoutingTemplateAdapterContract.requestPlan(RoutingTemplateAdapterContract.ROUTE_404, true, false, false, false));

		emit("canonical:none", RoutingTemplateAdapterContract.canonicalPlan(false, false, false, false, false, false));
		emit("canonical:slash", RoutingTemplateAdapterContract.canonicalPlan(true, false, false, true, false, false));
		emit("canonical:host", RoutingTemplateAdapterContract.canonicalPlan(true, false, true, false, false, false));
		emit("canonical:paged", RoutingTemplateAdapterContract.canonicalPlan(true, false, false, false, true, false));
		emit("canonical:attachment", RoutingTemplateAdapterContract.canonicalPlan(true, false, false, false, false, true));
		emit("canonical:404", RoutingTemplateAdapterContract.canonicalPlan(true, true, true, true, true, true));

		emit("link:permalink", RoutingTemplateAdapterContract.linkPlan("post", true, false, false, 1));
		emit("link:home", RoutingTemplateAdapterContract.linkPlan("home", true, false, false, 1));
		emit("link:feed", RoutingTemplateAdapterContract.linkPlan("rss2", true, false, false, 1));
		emit("link:paged", RoutingTemplateAdapterContract.linkPlan("post", true, false, false, 3));
		emit("link:preview", RoutingTemplateAdapterContract.linkPlan("post", true, true, false, 1));
		emit("link:attachment", RoutingTemplateAdapterContract.linkPlan("post", true, false, true, 1));

		emit("template:front-page", RoutingTemplateAdapterContract.templatePlan(false, false, false, true, true, false, false, false));
		emit("template:home", RoutingTemplateAdapterContract.templatePlan(false, false, false, false, true, false, false, false));
		emit("template:single", RoutingTemplateAdapterContract.templatePlan(false, false, false, false, false, true, false, false));
		emit("template:page", RoutingTemplateAdapterContract.templatePlan(false, false, false, false, false, false, true, false));
		emit("template:archive", RoutingTemplateAdapterContract.templatePlan(false, false, false, false, false, false, false, true));
		emit("template:search", RoutingTemplateAdapterContract.templatePlan(false, false, true, false, false, false, false, false));
		emit("template:feed", RoutingTemplateAdapterContract.templatePlan(false, true, false, false, false, false, false, false));
		emit("template:404", RoutingTemplateAdapterContract.templatePlan(true, false, false, false, false, false, false, false));

		emit("hook:rewrite", RoutingTemplateAdapterContract.hookPlan("flush_rewrite_rules", true));
		emit("hook:request", RoutingTemplateAdapterContract.hookPlan("parse_request", true));
		emit("hook:canonical", RoutingTemplateAdapterContract.hookPlan("redirect_canonical", true));
		emit("hook:link", RoutingTemplateAdapterContract.hookPlan("permalink", true));
		emit("hook:template", RoutingTemplateAdapterContract.hookPlan("template_include", true));
		emit("hook:failed", RoutingTemplateAdapterContract.hookPlan("template_include", false));
	}

	static function emit(key:String, value:String):Void
	{
		Sys.println(key + "=" + value);
	}
}
