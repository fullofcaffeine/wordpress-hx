package wphx.wp.db;

@:keep
class WpdbPublicStateDescriptor
{
	public static inline final CATEGORY_BOOTSTRAP_CAPABILITY_STATE = "bootstrap_capability_state";
	public static inline final CATEGORY_MAGIC_VISIBLE_INTERNAL_STATE = "magic_visible_internal_state";
	public static inline final CATEGORY_PUBLIC_EXTENSION_OR_LEGACY_STATE = "public_extension_or_legacy_state";
	public static inline final CATEGORY_QUERY_RESULT_ERROR_STATE = "query_result_error_state";
	public static inline final CATEGORY_TABLE_PREFIX_AND_TABLE_NAME_STATE = "table_prefix_and_table_name_state";
	public static inline final CATEGORY_UNKNOWN = "unknown";

	public static inline final MUTATION_DIRECT_PUBLIC_READ_WRITE = "direct_public_read_write";
	public static inline final MUTATION_MAGIC_READ_WRITE_UNSET_BACKWARD_COMPAT = "magic_read_write_unset_backward_compat";
	public static inline final MUTATION_MAGIC_READABLE_LAZY_LOAD_ON_GET = "magic_readable_lazy_load_on___get";
	public static inline final MUTATION_MAGIC_READABLE_WRITE_BLOCKED_BY_SET = "magic_readable_write_blocked_by_wpdb___set";
	public static inline final MUTATION_UNKNOWN = "unknown";

	public static function declaredPublicProperties():Array<String>
	{
		return [
			"base_prefix",
			"blogid",
			"blogmeta",
			"blogs",
			"charset",
			"collate",
			"commentmeta",
			"comments",
			"error",
			"field_types",
			"func_call",
			"global_tables",
			"insert_id",
			"is_mysql",
			"last_error",
			"last_query",
			"last_result",
			"links",
			"ms_global_tables",
			"num_queries",
			"num_rows",
			"old_ms_global_tables",
			"old_tables",
			"options",
			"postmeta",
			"posts",
			"prefix",
			"queries",
			"ready",
			"registration_log",
			"rows_affected",
			"show_errors",
			"signups",
			"site",
			"sitecategories",
			"siteid",
			"sitemeta",
			"suppress_errors",
			"tables",
			"term_relationships",
			"term_taxonomy",
			"termmeta",
			"terms",
			"time_start",
			"usermeta",
			"users"
		];
	}

	public static function magicVisibleInternalProperties():Array<String>
	{
		return [
			"allow_unsafe_unquoted_parameters",
			"check_current_query",
			"checking_collation",
			"col_info",
			"col_meta",
			"dbh",
			"dbhost",
			"dbname",
			"dbpassword",
			"dbuser",
			"has_connected",
			"incompatible_modes",
			"reconnect_retries",
			"result",
			"table_charset",
			"use_mysqli"
		];
	}

	public static function publicMagicMethods():Array<String>
	{
		return ["__get", "__isset", "__set", "__unset"];
	}

	public static function protectedWriteBlockedProperties():Array<String>
	{
		return [
			"allow_unsafe_unquoted_parameters",
			"check_current_query",
			"col_meta",
			"table_charset"
		];
	}

	public static function dynamicPropertiesAllowed():Bool
	{
		return true;
	}

	public static function preservesDbDropinReplacement():Bool
	{
		return true;
	}

	public static function requireWpDbReturnsWhenGlobalIsSet():Bool
	{
		return true;
	}

	public static function fieldTypesUsesDirectPublicMutation():Bool
	{
		return true;
	}

	public static function hasDeclaredPublicProperty(name:String):Bool
	{
		return contains(declaredPublicProperties(), name);
	}

	public static function hasMagicVisibleInternalProperty(name:String):Bool
	{
		return contains(magicVisibleInternalProperties(), name);
	}

	public static function blocksMagicWrite(name:String):Bool
	{
		return contains(protectedWriteBlockedProperties(), name);
	}

	public static function category(name:String):String
	{
		if (contains(queryResultErrorProperties(), name))
		{
			return CATEGORY_QUERY_RESULT_ERROR_STATE;
		}
		if (contains(tablePrefixAndTableNameProperties(), name))
		{
			return CATEGORY_TABLE_PREFIX_AND_TABLE_NAME_STATE;
		}
		if (contains(bootstrapCapabilityProperties(), name))
		{
			return CATEGORY_BOOTSTRAP_CAPABILITY_STATE;
		}
		if (contains(magicVisibleInternalProperties(), name))
		{
			return CATEGORY_MAGIC_VISIBLE_INTERNAL_STATE;
		}
		if (contains(declaredPublicProperties(), name))
		{
			return CATEGORY_PUBLIC_EXTENSION_OR_LEGACY_STATE;
		}
		return CATEGORY_UNKNOWN;
	}

	public static function mutationPolicy(name:String):String
	{
		if (blocksMagicWrite(name))
		{
			return MUTATION_MAGIC_READABLE_WRITE_BLOCKED_BY_SET;
		}
		if (name == "col_info")
		{
			return MUTATION_MAGIC_READABLE_LAZY_LOAD_ON_GET;
		}
		if (hasMagicVisibleInternalProperty(name))
		{
			return MUTATION_MAGIC_READ_WRITE_UNSET_BACKWARD_COMPAT;
		}
		if (hasDeclaredPublicProperty(name))
		{
			return MUTATION_DIRECT_PUBLIC_READ_WRITE;
		}
		return MUTATION_UNKNOWN;
	}

	static function queryResultErrorProperties():Array<String>
	{
		return [
			"error",
			"func_call",
			"insert_id",
			"last_error",
			"last_query",
			"last_result",
			"num_queries",
			"num_rows",
			"queries",
			"rows_affected",
			"show_errors",
			"suppress_errors",
			"time_start"
		];
	}

	static function tablePrefixAndTableNameProperties():Array<String>
	{
		return [
			"base_prefix",
			"blogid",
			"blogmeta",
			"blogs",
			"commentmeta",
			"comments",
			"global_tables",
			"links",
			"ms_global_tables",
			"old_ms_global_tables",
			"old_tables",
			"options",
			"postmeta",
			"posts",
			"prefix",
			"registration_log",
			"signups",
			"site",
			"sitecategories",
			"siteid",
			"sitemeta",
			"tables",
			"term_relationships",
			"term_taxonomy",
			"termmeta",
			"terms",
			"usermeta",
			"users"
		];
	}

	static function bootstrapCapabilityProperties():Array<String>
	{
		return ["charset", "collate", "field_types", "is_mysql", "ready"];
	}

	static function contains(values:Array<String>, name:String):Bool
	{
		for (value in values)
		{
			if (value == name)
			{
				return true;
			}
		}
		return false;
	}
}
