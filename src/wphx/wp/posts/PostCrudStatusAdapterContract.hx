package wphx.wp.posts;

using StringTools;

@:keep
class PostCrudStatusAdapterContract
{
	public static inline final WRITE_INSERT = "insert";
	public static inline final WRITE_UPDATE = "update";
	public static inline final WRITE_INVALID_UPDATE = "invalid_update";

	public static inline final DELETE_TRASH = "trash";
	public static inline final DELETE_PERMANENT = "permanent_delete";
	public static inline final DELETE_ATTACHMENT = "attachment_delete";
	public static inline final DELETE_MISSING = "missing_post";
	public static inline final DELETE_INVALID_ID = "invalid_id";

	public static inline final DATE_KEEP_EXISTING = "keep_existing_date";
	public static inline final DATE_CLEAR_DRAFT_GMT = "clear_draft_gmt";
	public static inline final DATE_USE_REQUEST = "use_request_date";

	public static inline final SLUG_KEEP_EXISTING = "keep_existing_slug";
	public static inline final SLUG_EMPTY_ALLOWED = "empty_slug_allowed";
	public static inline final SLUG_FROM_TITLE = "slug_from_title";
	public static inline final SLUG_SANITIZE_PROVIDED = "sanitize_provided_slug";

	public static inline final CATEGORY_DEFAULT = "default_category";
	public static inline final CATEGORY_EMPTY = "empty_category";
	public static inline final CATEGORY_PROVIDED = "provided_category";
	public static inline final CATEGORY_KEEP_EXISTING = "keep_existing_category";

	public static inline final HOOK_INSERT = "insert_post_hooks";
	public static inline final HOOK_UPDATE = "update_post_hooks";
	public static inline final HOOK_DELETE = "delete_post_hooks";
	public static inline final HOOK_TRASH = "trash_post_hooks";
	public static inline final HOOK_UNTRASH = "untrash_post_hooks";
	public static inline final HOOK_TRANSITION = "transition_post_status_hooks";
	public static inline final HOOK_NONE = "no_post_hooks";

	public static inline final CACHE_POST_ONLY = "post_cache_only";
	public static inline final CACHE_POST_AND_TERMS = "post_and_term_cache";
	public static inline final CACHE_POST_TERMS_AND_ARCHIVES = "post_terms_and_archives";
	public static inline final CACHE_NONE = "no_cache_change";

	public static inline final UNTRASH_ATTACHMENT_INHERIT = "restore_attachment_inherit";
	public static inline final UNTRASH_POST_DRAFT = "restore_post_draft";
	public static inline final UNTRASH_NOT_TRASHED = "not_trashed";
	public static inline final UNTRASH_MISSING = "missing_post";

	public static function writeRoute(hasPostId:Bool, existingPostFound:Bool):String
	{
		if (!hasPostId)
		{
			return WRITE_INSERT;
		}
		return existingPostFound ? WRITE_UPDATE : WRITE_INVALID_UPDATE;
	}

	public static function normalizeInsertStatus(postType:String, requestedStatus:String):String
	{
		final status = requestedStatus == "" ? "draft" : requestedStatus;
		if (postType == "attachment" && !isAllowedAttachmentStatus(status))
		{
			return "inherit";
		}
		return status;
	}

	public static function datePlan(currentStatus:String, currentGmtDate:String, editDateRequested:Bool):String
	{
		if (isDraftLike(currentStatus) && !editDateRequested && currentGmtDate == "0000-00-00 00:00:00")
		{
			return DATE_CLEAR_DRAFT_GMT;
		}
		return editDateRequested ? DATE_USE_REQUEST : DATE_KEEP_EXISTING;
	}

	public static function slugPlan(isUpdate:Bool, providedSlug:String, existingSlug:String, status:String):String
	{
		if (providedSlug != "")
		{
			return SLUG_SANITIZE_PROVIDED;
		}
		if (isUpdate && existingSlug != "")
		{
			return SLUG_KEEP_EXISTING;
		}
		return isDraftLike(status) ? SLUG_EMPTY_ALLOWED : SLUG_FROM_TITLE;
	}

	public static function categoryPlan(postType:String, status:String, categoryProvided:Bool, categoryCount:Int, isUpdate:Bool):String
	{
		if (categoryProvided && categoryCount > 0)
		{
			return CATEGORY_PROVIDED;
		}
		if (isUpdate && !categoryProvided)
		{
			return CATEGORY_KEEP_EXISTING;
		}
		return postType == "post" && status != "auto-draft" ? CATEGORY_DEFAULT : CATEGORY_EMPTY;
	}

	public static function deleteRoute(postId:Int, postType:String, currentStatus:String, forceDelete:Bool, trashDaysEnabled:Bool, postExists:Bool):String
	{
		if (postId <= 0)
		{
			return DELETE_INVALID_ID;
		}
		if (!postExists)
		{
			return DELETE_MISSING;
		}
		if (postType == "attachment")
		{
			return DELETE_ATTACHMENT;
		}
		if (!forceDelete && trashDaysEnabled && currentStatus != "trash" && (postType == "post" || postType == "page"))
		{
			return DELETE_TRASH;
		}
		return DELETE_PERMANENT;
	}

	public static function untrashRoute(postType:String, currentStatus:String, previousStatus:String, postExists:Bool):String
	{
		if (!postExists)
		{
			return UNTRASH_MISSING;
		}
		if (currentStatus != "trash")
		{
			return UNTRASH_NOT_TRASHED;
		}
		return postType == "attachment" || previousStatus == "inherit" ? UNTRASH_ATTACHMENT_INHERIT : UNTRASH_POST_DRAFT;
	}

	public static function hookPlan(operation:String, statusChanged:Bool, fireAfterHooks:Bool):String
	{
		if (!fireAfterHooks)
		{
			return HOOK_NONE;
		}
		if (operation == WRITE_INSERT)
		{
			return statusChanged ? HOOK_TRANSITION : HOOK_INSERT;
		}
		if (operation == WRITE_UPDATE)
		{
			return statusChanged ? HOOK_TRANSITION : HOOK_UPDATE;
		}
		if (operation == DELETE_TRASH)
		{
			return HOOK_TRASH;
		}
		if (operation == DELETE_PERMANENT)
		{
			return HOOK_DELETE;
		}
		if (operation == UNTRASH_POST_DRAFT || operation == UNTRASH_ATTACHMENT_INHERIT)
		{
			return HOOK_UNTRASH;
		}
		return HOOK_NONE;
	}

	public static function cachePlan(postChanged:Bool, taxonomyChanged:Bool, statusChanged:Bool, postType:String):String
	{
		if (!postChanged && !taxonomyChanged && !statusChanged)
		{
			return CACHE_NONE;
		}
		if (postType == "page" || statusChanged)
		{
			return CACHE_POST_TERMS_AND_ARCHIVES;
		}
		return taxonomyChanged ? CACHE_POST_AND_TERMS : CACHE_POST_ONLY;
	}

	static function isDraftLike(status:String):Bool
	{
		return status == "draft" || status == "pending" || status == "auto-draft";
	}

	static function isAllowedAttachmentStatus(status:String):Bool
	{
		return status == "inherit" || status == "private" || status == "trash" || status == "auto-draft";
	}
}
