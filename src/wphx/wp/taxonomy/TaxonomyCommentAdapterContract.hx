package wphx.wp.taxonomy;

using StringTools;

@:keep
class TaxonomyCommentAdapterContract
{
	public static inline final TAXONOMY_PUBLIC = "taxonomy_public";
	public static inline final TAXONOMY_PRIVATE_QUERYABLE = "taxonomy_private_queryable";
	public static inline final TAXONOMY_ADMIN_ONLY = "taxonomy_admin_only";
	public static inline final TAXONOMY_INTERNAL = "taxonomy_internal";
	public static inline final TAXONOMY_REST_VISIBLE = "taxonomy_rest_visible";

	public static inline final TERM_INVALID = "term_invalid_request";
	public static inline final TERM_INSERT = "term_insert";
	public static inline final TERM_UPDATE = "term_update";
	public static inline final TERM_DELETE = "term_delete";
	public static inline final TERM_DUPLICATE = "term_duplicate";
	public static inline final TERM_MISSING = "term_missing";
	public static inline final TERM_DEFAULT_BLOCKED = "term_default_delete_blocked";

	public static inline final REL_INVALID = "relationship_invalid_request";
	public static inline final REL_APPEND = "relationship_append";
	public static inline final REL_REPLACE = "relationship_replace";
	public static inline final REL_REMOVE = "relationship_remove";
	public static inline final REL_NO_CHANGE = "relationship_no_change";

	public static inline final COUNT_NONE = "count_no_change";
	public static inline final COUNT_DEFERRED = "count_deferred";
	public static inline final COUNT_UPDATE_NOW = "count_update_now";
	public static inline final COUNT_CLEAN_TAXONOMY = "clean_taxonomy_cache";
	public static inline final COUNT_CLEAN_TERM = "clean_term_cache";

	public static inline final COMMENT_INVALID = "comment_invalid_request";
	public static inline final COMMENT_INSERT = "comment_insert";
	public static inline final COMMENT_UPDATE = "comment_update";
	public static inline final COMMENT_DELETE = "comment_delete";
	public static inline final COMMENT_TRASH = "comment_trash";
	public static inline final COMMENT_SPAM = "comment_spam";
	public static inline final COMMENT_APPROVE = "comment_approve";
	public static inline final COMMENT_UNAPPROVE = "comment_unapprove";

	public static inline final MODERATION_DUPLICATE = "moderation_duplicate";
	public static inline final MODERATION_FLOOD = "moderation_flood";
	public static inline final MODERATION_DISALLOWED = "moderation_disallowed";
	public static inline final MODERATION_HOLD = "moderation_hold";
	public static inline final MODERATION_APPROVE = "moderation_approve";

	public static inline final QUERY_STATUS = "query_status";
	public static inline final QUERY_TYPE = "query_type";
	public static inline final QUERY_POST = "query_post";
	public static inline final QUERY_PARENT = "query_parent";
	public static inline final QUERY_AUTHOR = "query_author";
	public static inline final QUERY_DATE = "query_date";
	public static inline final QUERY_SEARCH = "query_search";
	public static inline final QUERY_META = "query_meta";
	public static inline final QUERY_TAXONOMY = "query_taxonomy";
	public static inline final QUERY_UNKNOWN = "query_unknown";

	public static inline final HOOK_NONE = "no_taxonomy_comment_hooks";
	public static inline final HOOK_TAXONOMY_REGISTER = "taxonomy_register_hooks";
	public static inline final HOOK_TERM_WRITE = "term_write_hooks";
	public static inline final HOOK_RELATIONSHIP = "term_relationship_hooks";
	public static inline final HOOK_TERM_CACHE = "term_cache_hooks";
	public static inline final HOOK_COMMENT_WRITE = "comment_write_hooks";
	public static inline final HOOK_COMMENT_STATUS = "comment_status_hooks";
	public static inline final HOOK_COMMENT_QUERY = "comment_query_hooks";

	public static function taxonomyVisibility(publicFlag:Bool, publiclyQueryable:Bool, showUi:Bool, showInRest:Bool):String
	{
		if (showInRest)
		{
			return TAXONOMY_REST_VISIBLE;
		}
		if (publicFlag)
		{
			return TAXONOMY_PUBLIC;
		}
		if (publiclyQueryable)
		{
			return TAXONOMY_PRIVATE_QUERYABLE;
		}
		return showUi ? TAXONOMY_ADMIN_ONLY : TAXONOMY_INTERNAL;
	}

	public static function termWriteRoute(operation:String, taxonomyExists:Bool, termId:Int, duplicateFound:Bool, isDefaultTerm:Bool):String
	{
		if (!taxonomyExists)
		{
			return TERM_INVALID;
		}
		if (operation == "insert")
		{
			return duplicateFound ? TERM_DUPLICATE : TERM_INSERT;
		}
		if (termId <= 0)
		{
			return TERM_INVALID;
		}
		return switch operation
		{
			case "update":
				duplicateFound ? TERM_DUPLICATE : TERM_UPDATE;
			case "delete":
				isDefaultTerm ? TERM_DEFAULT_BLOCKED : TERM_DELETE;
			case "get":
				TERM_MISSING;
			case _:
				TERM_INVALID;
		}
	}

	public static function relationshipRoute(objectId:Int, taxonomyExists:Bool, termCount:Int, append:Bool, removeOnly:Bool, changed:Bool):String
	{
		if (objectId <= 0 || !taxonomyExists)
		{
			return REL_INVALID;
		}
		if (termCount <= 0 || removeOnly)
		{
			return changed ? REL_REMOVE : REL_NO_CHANGE;
		}
		if (!changed)
		{
			return REL_NO_CHANGE;
		}
		return append ? REL_APPEND : REL_REPLACE;
	}

	public static function countCachePlan(changed:Bool, deferredCounting:Bool, cleanWholeTaxonomy:Bool, termCount:Int):String
	{
		if (!changed)
		{
			return COUNT_NONE;
		}
		if (deferredCounting)
		{
			return COUNT_DEFERRED;
		}
		if (cleanWholeTaxonomy)
		{
			return COUNT_CLEAN_TAXONOMY;
		}
		return termCount > 1 ? COUNT_UPDATE_NOW : COUNT_CLEAN_TERM;
	}

	public static function commentWriteRoute(operation:String, commentId:Int, commentExists:Bool, targetStatus:String, forceDelete:Bool):String
	{
		if (operation == "insert")
		{
			return COMMENT_INSERT;
		}
		if (commentId <= 0 || !commentExists)
		{
			return COMMENT_INVALID;
		}
		if (operation == "delete")
		{
			return forceDelete ? COMMENT_DELETE : COMMENT_TRASH;
		}
		if (operation == "status")
		{
			return commentStatusRoute(targetStatus);
		}
		return operation == "update" ? COMMENT_UPDATE : COMMENT_INVALID;
	}

	public static function moderationRoute(duplicate:Bool, flood:Bool, disallowed:Bool, requiresModeration:Bool):String
	{
		if (duplicate)
		{
			return MODERATION_DUPLICATE;
		}
		if (flood)
		{
			return MODERATION_FLOOD;
		}
		if (disallowed)
		{
			return MODERATION_DISALLOWED;
		}
		return requiresModeration ? MODERATION_HOLD : MODERATION_APPROVE;
	}

	public static function queryFilterKind(queryVar:String):String
	{
		final normalized = queryVar.trim().toLowerCase();
		return switch normalized
		{
			case "status" | "comment_status" | "comment__in" | "comment__not_in":
				QUERY_STATUS;
			case "type" | "type__in" | "type__not_in":
				QUERY_TYPE;
			case "post_id" | "post__in" | "post__not_in":
				QUERY_POST;
			case "parent" | "parent__in" | "parent__not_in":
				QUERY_PARENT;
			case "user_id" | "author_email" | "author__in" | "author__not_in":
				QUERY_AUTHOR;
			case "date_query":
				QUERY_DATE;
			case "search" | "s":
				QUERY_SEARCH;
			case "meta_query" | "meta_key" | "meta_value":
				QUERY_META;
			case "taxonomy" | "term" | "term_id":
				QUERY_TAXONOMY;
			case _:
				QUERY_UNKNOWN;
		}
	}

	public static function hookPlan(operation:String, succeeded:Bool):String
	{
		if (!succeeded)
		{
			return HOOK_NONE;
		}
		return switch operation
		{
			case "register_taxonomy":
				HOOK_TAXONOMY_REGISTER;
			case "term_write":
				HOOK_TERM_WRITE;
			case "relationship":
				HOOK_RELATIONSHIP;
			case "term_cache":
				HOOK_TERM_CACHE;
			case "comment_write":
				HOOK_COMMENT_WRITE;
			case "comment_status":
				HOOK_COMMENT_STATUS;
			case "comment_query":
				HOOK_COMMENT_QUERY;
			case _:
				HOOK_NONE;
		}
	}

	static function commentStatusRoute(status:String):String
	{
		return switch status
		{
			case "1" | "approve" | "approved":
				COMMENT_APPROVE;
			case "0" | "hold" | "unapprove" | "unapproved":
				COMMENT_UNAPPROVE;
			case "spam":
				COMMENT_SPAM;
			case "trash" | "post-trashed":
				COMMENT_TRASH;
			case _:
				COMMENT_INVALID;
		}
	}
}
