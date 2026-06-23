package wphx.fixtures.wp.core;

import wphx.wp.taxonomy.TaxonomyCommentAdapterContract;

@:keep
class TaxonomyCommentAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("taxonomy:rest", TaxonomyCommentAdapterContract.taxonomyVisibility(false, false, false, true));
		emit("taxonomy:public", TaxonomyCommentAdapterContract.taxonomyVisibility(true, false, false, false));
		emit("taxonomy:queryable", TaxonomyCommentAdapterContract.taxonomyVisibility(false, true, false, false));
		emit("taxonomy:admin", TaxonomyCommentAdapterContract.taxonomyVisibility(false, false, true, false));
		emit("taxonomy:internal", TaxonomyCommentAdapterContract.taxonomyVisibility(false, false, false, false));

		emit("term:invalid-taxonomy", TaxonomyCommentAdapterContract.termWriteRoute("insert", false, 0, false, false));
		emit("term:insert", TaxonomyCommentAdapterContract.termWriteRoute("insert", true, 0, false, false));
		emit("term:duplicate", TaxonomyCommentAdapterContract.termWriteRoute("insert", true, 0, true, false));
		emit("term:update", TaxonomyCommentAdapterContract.termWriteRoute("update", true, 12, false, false));
		emit("term:update-duplicate", TaxonomyCommentAdapterContract.termWriteRoute("update", true, 12, true, false));
		emit("term:delete", TaxonomyCommentAdapterContract.termWriteRoute("delete", true, 12, false, false));
		emit("term:delete-default", TaxonomyCommentAdapterContract.termWriteRoute("delete", true, 12, false, true));
		emit("term:missing", TaxonomyCommentAdapterContract.termWriteRoute("get", true, 12, false, false));
		emit("term:invalid-id", TaxonomyCommentAdapterContract.termWriteRoute("update", true, 0, false, false));

		emit("rel:invalid", TaxonomyCommentAdapterContract.relationshipRoute(0, true, 1, false, false, true));
		emit("rel:append", TaxonomyCommentAdapterContract.relationshipRoute(7, true, 2, true, false, true));
		emit("rel:replace", TaxonomyCommentAdapterContract.relationshipRoute(7, true, 2, false, false, true));
		emit("rel:remove", TaxonomyCommentAdapterContract.relationshipRoute(7, true, 0, false, true, true));
		emit("rel:no-change", TaxonomyCommentAdapterContract.relationshipRoute(7, true, 2, false, false, false));

		emit("count:none", TaxonomyCommentAdapterContract.countCachePlan(false, false, false, 1));
		emit("count:deferred", TaxonomyCommentAdapterContract.countCachePlan(true, true, false, 1));
		emit("count:taxonomy", TaxonomyCommentAdapterContract.countCachePlan(true, false, true, 1));
		emit("count:term", TaxonomyCommentAdapterContract.countCachePlan(true, false, false, 1));
		emit("count:update-now", TaxonomyCommentAdapterContract.countCachePlan(true, false, false, 3));

		emit("comment:insert", TaxonomyCommentAdapterContract.commentWriteRoute("insert", 0, false, "", false));
		emit("comment:invalid", TaxonomyCommentAdapterContract.commentWriteRoute("update", 0, false, "", false));
		emit("comment:update", TaxonomyCommentAdapterContract.commentWriteRoute("update", 2, true, "", false));
		emit("comment:delete", TaxonomyCommentAdapterContract.commentWriteRoute("delete", 2, true, "", true));
		emit("comment:trash", TaxonomyCommentAdapterContract.commentWriteRoute("delete", 2, true, "", false));
		emit("comment:approve", TaxonomyCommentAdapterContract.commentWriteRoute("status", 2, true, "approve", false));
		emit("comment:unapprove", TaxonomyCommentAdapterContract.commentWriteRoute("status", 2, true, "0", false));
		emit("comment:spam", TaxonomyCommentAdapterContract.commentWriteRoute("status", 2, true, "spam", false));
		emit("comment:status-trash", TaxonomyCommentAdapterContract.commentWriteRoute("status", 2, true, "post-trashed", false));
		emit("comment:bad-status", TaxonomyCommentAdapterContract.commentWriteRoute("status", 2, true, "unknown", false));

		emit("moderation:duplicate", TaxonomyCommentAdapterContract.moderationRoute(true, false, false, false));
		emit("moderation:flood", TaxonomyCommentAdapterContract.moderationRoute(false, true, false, false));
		emit("moderation:disallowed", TaxonomyCommentAdapterContract.moderationRoute(false, false, true, false));
		emit("moderation:hold", TaxonomyCommentAdapterContract.moderationRoute(false, false, false, true));
		emit("moderation:approve", TaxonomyCommentAdapterContract.moderationRoute(false, false, false, false));

		emit("query:status", TaxonomyCommentAdapterContract.queryFilterKind("comment_status"));
		emit("query:type", TaxonomyCommentAdapterContract.queryFilterKind("type__in"));
		emit("query:post", TaxonomyCommentAdapterContract.queryFilterKind("post__in"));
		emit("query:parent", TaxonomyCommentAdapterContract.queryFilterKind("parent__not_in"));
		emit("query:author", TaxonomyCommentAdapterContract.queryFilterKind("author_email"));
		emit("query:date", TaxonomyCommentAdapterContract.queryFilterKind("date_query"));
		emit("query:search", TaxonomyCommentAdapterContract.queryFilterKind("s"));
		emit("query:meta", TaxonomyCommentAdapterContract.queryFilterKind("meta_query"));
		emit("query:taxonomy", TaxonomyCommentAdapterContract.queryFilterKind("term_id"));
		emit("query:unknown", TaxonomyCommentAdapterContract.queryFilterKind("unexpected"));

		emit("hook:taxonomy", TaxonomyCommentAdapterContract.hookPlan("register_taxonomy", true));
		emit("hook:term", TaxonomyCommentAdapterContract.hookPlan("term_write", true));
		emit("hook:relationship", TaxonomyCommentAdapterContract.hookPlan("relationship", true));
		emit("hook:cache", TaxonomyCommentAdapterContract.hookPlan("term_cache", true));
		emit("hook:comment-write", TaxonomyCommentAdapterContract.hookPlan("comment_write", true));
		emit("hook:comment-status", TaxonomyCommentAdapterContract.hookPlan("comment_status", true));
		emit("hook:comment-query", TaxonomyCommentAdapterContract.hookPlan("comment_query", true));
		emit("hook:failed", TaxonomyCommentAdapterContract.hookPlan("term_write", false));
	}

	static function emit(key:String, value:String):Void
	{
		Sys.println(key + "=" + value);
	}
}
