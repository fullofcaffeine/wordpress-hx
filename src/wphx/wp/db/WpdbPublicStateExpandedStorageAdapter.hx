package wphx.wp.db;

@:keep
class WpdbPublicStateExpandedStorageAdapter
{
	public static inline final DEFAULT_KIND_BOOL = "bool";
	public static inline final DEFAULT_KIND_INT = "int";
	public static inline final DEFAULT_KIND_NATIVE_PHP_ARRAY = "native_php_array";
	public static inline final DEFAULT_KIND_NULL = "null";
	public static inline final DEFAULT_KIND_STRING = "string";
	public static inline final DEFAULT_KIND_UNKNOWN = "unknown";

	public static inline final WRITE_ROUTE_DIRECT_PUBLIC_PHP_PROPERTY = "direct_public_php_property";
	public static inline final WRITE_ROUTE_DYNAMIC_PHP_PROPERTY = "dynamic_php_property";
	public static inline final WRITE_ROUTE_MAGIC_STORAGE = "magic_storage";
	public static inline final WRITE_ROUTE_PROTECTED_MAGIC_BLOCK = "protected_magic_write_block";
	public static inline final WRITE_ROUTE_WORDPRESS_LAZY_MAGIC_BOUNDARY = "wordpress_lazy_magic_boundary";
	public static inline final WRITE_ROUTE_UNKNOWN = "unknown";

	public static function expandedPublicStorageProperties():Array<String>
	{
		return WpdbPublicStateDescriptor.declaredPublicProperties();
	}

	public static function expandedMagicStorageProperties():Array<String>
	{
		return [
			"allow_unsafe_unquoted_parameters",
			"check_current_query",
			"checking_collation",
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

	public static function lazyMagicNativeBoundaryProperties():Array<String>
	{
		return ["col_info"];
	}

	public static function nativeResourceBoundaryProperties():Array<String>
	{
		return ["dbh", "result"];
	}

	public static function nativeArrayPublicProperties():Array<String>
	{
		return [
			"field_types",
			"global_tables",
			"ms_global_tables",
			"old_ms_global_tables",
			"old_tables",
			"tables"
		];
	}

	public static function nativeArrayMagicProperties():Array<String>
	{
		return ["col_meta", "incompatible_modes", "table_charset"];
	}

	public static function shouldInitializePublicProperty(name:String):Bool
	{
		return contains(expandedPublicStorageProperties(), name);
	}

	public static function shouldInitializeMagicStorageProperty(name:String):Bool
	{
		return contains(expandedMagicStorageProperties(), name);
	}

	public static function shouldDeferMagicReadToWordPressLazyBoundary(name:String):Bool
	{
		return contains(lazyMagicNativeBoundaryProperties(), name);
	}

	public static function shouldRoutePublicWriteToPhpProperty(name:String):Bool
	{
		return WpdbPublicStateDescriptor.hasDeclaredPublicProperty(name);
	}

	public static function shouldRouteDynamicWriteToPhpProperty(name:String):Bool
	{
		return WpdbPublicStateDescriptor.dynamicPropertiesAllowed()
			&& !WpdbPublicStateDescriptor.hasDeclaredPublicProperty(name)
			&& !WpdbPublicStateDescriptor.hasMagicVisibleInternalProperty(name);
	}

	public static function shouldRouteMagicReadToStorage(name:String):Bool
	{
		return contains(expandedMagicStorageProperties(), name);
	}

	public static function shouldRouteMagicWriteToStorage(name:String):Bool
	{
		return shouldRouteMagicReadToStorage(name) && !shouldBlockMagicWrite(name);
	}

	public static function shouldBlockMagicWrite(name:String):Bool
	{
		return WpdbPublicStateDescriptor.blocksMagicWrite(name);
	}

	public static function writeRoute(name:String):String
	{
		if (shouldBlockMagicWrite(name))
		{
			return WRITE_ROUTE_PROTECTED_MAGIC_BLOCK;
		}
		if (shouldRouteMagicWriteToStorage(name))
		{
			return WRITE_ROUTE_MAGIC_STORAGE;
		}
		if (shouldDeferMagicReadToWordPressLazyBoundary(name))
		{
			return WRITE_ROUTE_WORDPRESS_LAZY_MAGIC_BOUNDARY;
		}
		if (shouldRoutePublicWriteToPhpProperty(name))
		{
			return WRITE_ROUTE_DIRECT_PUBLIC_PHP_PROPERTY;
		}
		if (shouldRouteDynamicWriteToPhpProperty(name))
		{
			return WRITE_ROUTE_DYNAMIC_PHP_PROPERTY;
		}
		return WRITE_ROUTE_UNKNOWN;
	}

	public static function publicDefaultKind(name:String):String
	{
		return switch name
		{
			case "field_types" | "global_tables" | "ms_global_tables" | "old_ms_global_tables" | "old_tables" | "tables":
				DEFAULT_KIND_NATIVE_PHP_ARRAY;
			case "blogid" | "insert_id" | "num_queries" | "num_rows" | "rows_affected" | "siteid":
				DEFAULT_KIND_INT;
			case "last_error" | "prefix":
				DEFAULT_KIND_STRING;
			case "ready" | "show_errors" | "suppress_errors":
				DEFAULT_KIND_BOOL;
			case "base_prefix" | "blogmeta" | "blogs" | "charset" | "collate" | "commentmeta" | "comments" | "error" | "func_call" | "is_mysql" |
				"last_query" | "last_result" | "links" | "options" | "postmeta" | "posts" | "queries" | "registration_log" | "signups" | "site" |
				"sitecategories" | "sitemeta" | "term_relationships" | "term_taxonomy" | "termmeta" | "terms" | "time_start" | "usermeta" | "users":
				DEFAULT_KIND_NULL;
			case _:
				DEFAULT_KIND_UNKNOWN;
		}
	}

	public static function publicStringDefault(name:String):Null<String>
	{
		return switch name
		{
			case "last_error" | "prefix":
				"";
			case _:
				null;
		}
	}

	public static function publicIntDefault(name:String):Null<Int>
	{
		return switch name
		{
			case "blogid" | "insert_id" | "num_queries" | "num_rows" | "rows_affected" | "siteid":
				0;
			case _:
				null;
		}
	}

	public static function publicBoolDefault(name:String):Null<Bool>
	{
		return switch name
		{
			case "ready" | "show_errors" | "suppress_errors":
				false;
			case _:
				null;
		}
	}

	public static function publicNativeArrayDefaultValues(name:String):Array<String>
	{
		return switch name
		{
			case "field_types":
				[];
			case "global_tables":
				["users", "usermeta"];
			case "ms_global_tables":
				["blogs", "blogmeta", "signups", "site", "sitemeta", "registration_log"];
			case "old_ms_global_tables":
				["sitecategories"];
			case "old_tables":
				["categories", "post2cat", "link2cat"];
			case "tables":
				[
					"posts",
					"comments",
					"links",
					"options",
					"postmeta",
					"terms",
					"term_taxonomy",
					"term_relationships",
					"termmeta",
					"commentmeta"
				];
			case _:
				[];
		}
	}

	public static function magicDefaultKind(name:String):String
	{
		return switch name
		{
			case "allow_unsafe_unquoted_parameters" | "check_current_query" | "checking_collation" | "has_connected" | "use_mysqli":
				DEFAULT_KIND_BOOL;
			case "reconnect_retries":
				DEFAULT_KIND_INT;
			case "col_meta" | "incompatible_modes" | "table_charset":
				DEFAULT_KIND_NATIVE_PHP_ARRAY;
			case "dbh" | "dbhost" | "dbname" | "dbpassword" | "dbuser" | "result":
				DEFAULT_KIND_NULL;
			case _:
				DEFAULT_KIND_UNKNOWN;
		}
	}

	public static function magicStringDefault(name:String):Null<String>
	{
		return null;
	}

	public static function magicIntDefault(name:String):Null<Int>
	{
		return switch name
		{
			case "reconnect_retries":
				5;
			case _:
				null;
		}
	}

	public static function magicBoolDefault(name:String):Null<Bool>
	{
		return switch name
		{
			case "allow_unsafe_unquoted_parameters" | "check_current_query" | "use_mysqli":
				true;
			case "checking_collation" | "has_connected":
				false;
			case _:
				null;
		}
	}

	public static function magicNativeArrayDefaultValues(name:String):Array<String>
	{
		return switch name
		{
			case "col_meta" | "table_charset":
				[];
			case "incompatible_modes":
				[
					"NO_ZERO_DATE",
					"ONLY_FULL_GROUP_BY",
					"STRICT_TRANS_TABLES",
					"STRICT_ALL_TABLES",
					"TRADITIONAL",
					"ANSI"
				];
			case _:
				[];
		}
	}

	public static function fieldTypesDirectMutationAllowed():Bool
	{
		return shouldRoutePublicWriteToPhpProperty("field_types");
	}

	public static function tablePrefixMutationAllowed():Bool
	{
		return shouldRoutePublicWriteToPhpProperty("prefix") && shouldRoutePublicWriteToPhpProperty("base_prefix");
	}

	public static function dynamicPluginPropertyAllowed():Bool
	{
		return shouldRouteDynamicWriteToPhpProperty("wphx_plugin_extension");
	}

	public static function preservesDbDropinReplacement():Bool
	{
		return WpdbPublicStateDescriptor.preservesDbDropinReplacement() && WpdbPublicStateDescriptor.requireWpDbReturnsWhenGlobalIsSet();
	}

	public static function completeDeclaredPublicStateCoverage():Bool
	{
		return expandedPublicStorageProperties().length == WpdbPublicStateDescriptor.declaredPublicProperties().length;
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
