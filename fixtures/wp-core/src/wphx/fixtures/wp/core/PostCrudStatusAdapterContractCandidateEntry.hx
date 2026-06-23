package wphx.fixtures.wp.core;

import wphx.wp.posts.PostCrudStatusAdapterContract;

@:keep
class PostCrudStatusAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("write:new", PostCrudStatusAdapterContract.writeRoute(false, false));
		emit("write:update-existing", PostCrudStatusAdapterContract.writeRoute(true, true));
		emit("write:update-missing", PostCrudStatusAdapterContract.writeRoute(true, false));
		emit("status:empty", PostCrudStatusAdapterContract.normalizeInsertStatus("post", ""));
		emit("status:attachment-publish", PostCrudStatusAdapterContract.normalizeInsertStatus("attachment", "publish"));
		emit("status:attachment-private", PostCrudStatusAdapterContract.normalizeInsertStatus("attachment", "private"));
		emit("date:draft-zero", PostCrudStatusAdapterContract.datePlan("draft", "0000-00-00 00:00:00", false));
		emit("date:draft-edit", PostCrudStatusAdapterContract.datePlan("draft", "0000-00-00 00:00:00", true));
		emit("date:publish", PostCrudStatusAdapterContract.datePlan("publish", "2026-06-23 09:00:00", false));
		emit("slug:update-keep", PostCrudStatusAdapterContract.slugPlan(true, "", "existing-slug", "publish"));
		emit("slug:draft-empty", PostCrudStatusAdapterContract.slugPlan(false, "", "", "draft"));
		emit("slug:publish-title", PostCrudStatusAdapterContract.slugPlan(false, "", "", "publish"));
		emit("slug:provided", PostCrudStatusAdapterContract.slugPlan(false, "Given Slug", "", "publish"));
		emit("category:provided", PostCrudStatusAdapterContract.categoryPlan("post", "publish", true, 2, false));
		emit("category:update-keep", PostCrudStatusAdapterContract.categoryPlan("post", "publish", false, 0, true));
		emit("category:default", PostCrudStatusAdapterContract.categoryPlan("post", "publish", false, 0, false));
		emit("category:auto-draft", PostCrudStatusAdapterContract.categoryPlan("post", "auto-draft", false, 0, false));
		emit("delete:invalid", PostCrudStatusAdapterContract.deleteRoute(0, "post", "publish", false, true, true));
		emit("delete:missing", PostCrudStatusAdapterContract.deleteRoute(10, "post", "publish", false, true, false));
		emit("delete:trash", PostCrudStatusAdapterContract.deleteRoute(10, "post", "publish", false, true, true));
		emit("delete:force", PostCrudStatusAdapterContract.deleteRoute(10, "post", "publish", true, true, true));
		emit("delete:already-trash", PostCrudStatusAdapterContract.deleteRoute(10, "post", "trash", false, true, true));
		emit("delete:attachment", PostCrudStatusAdapterContract.deleteRoute(10, "attachment", "inherit", false, true, true));
		emit("untrash:missing", PostCrudStatusAdapterContract.untrashRoute("post", "trash", "publish", false));
		emit("untrash:not-trash", PostCrudStatusAdapterContract.untrashRoute("post", "publish", "publish", true));
		emit("untrash:post", PostCrudStatusAdapterContract.untrashRoute("post", "trash", "publish", true));
		emit("untrash:attachment", PostCrudStatusAdapterContract.untrashRoute("attachment", "trash", "inherit", true));
		emit("hook:insert", PostCrudStatusAdapterContract.hookPlan(PostCrudStatusAdapterContract.WRITE_INSERT, false, true));
		emit("hook:update-transition", PostCrudStatusAdapterContract.hookPlan(PostCrudStatusAdapterContract.WRITE_UPDATE, true, true));
		emit("hook:trash", PostCrudStatusAdapterContract.hookPlan(PostCrudStatusAdapterContract.DELETE_TRASH, false, true));
		emit("hook:delete", PostCrudStatusAdapterContract.hookPlan(PostCrudStatusAdapterContract.DELETE_PERMANENT, false, true));
		emit("hook:suppressed", PostCrudStatusAdapterContract.hookPlan(PostCrudStatusAdapterContract.WRITE_UPDATE, true, false));
		emit("cache:none", PostCrudStatusAdapterContract.cachePlan(false, false, false, "post"));
		emit("cache:post", PostCrudStatusAdapterContract.cachePlan(true, false, false, "post"));
		emit("cache:terms", PostCrudStatusAdapterContract.cachePlan(true, true, false, "post"));
		emit("cache:page", PostCrudStatusAdapterContract.cachePlan(true, false, false, "page"));
		emit("cache:status", PostCrudStatusAdapterContract.cachePlan(true, false, true, "post"));
	}

	static function emit(key:String, value:String):Void
	{
		Sys.println(key + "=" + value);
	}
}
