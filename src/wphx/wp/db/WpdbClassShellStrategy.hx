package wphx.wp.db;

@:keep
class WpdbClassShellStrategy
{
	public static inline final CLASS_SHELL_PHP_ABI_SUBCLASS = "php_abi_subclass_shell";
	public static inline final NATIVE_ROUTE_PARENT_VISIBLE_PHP_PROPERTY = "parent_visible_php_property";
	public static inline final LAZY_ROUTE_WORDPRESS_PARENT_LOADER = "wordpress_parent_lazy_loader";
	public static inline final BOOTSTRAP_ROUTE_DB_DROPIN_GLOBAL = "db_php_dropin_global";
	public static inline final ROUTE_UNKNOWN = "unknown";

	public static function classShellKind():String
	{
		return CLASS_SHELL_PHP_ABI_SUBCLASS;
	}

	public static function constructorArgumentProperties():Array<String>
	{
		return ["dbuser", "dbpassword", "dbname", "dbhost"];
	}

	public static function constructorSideEffectProperties():Array<String>
	{
		return ["dbh", "has_connected", "is_mysql", "ready", "use_mysqli"];
	}

	public static function parentVisibleNativeResourceProperties():Array<String>
	{
		return ["dbh", "result"];
	}

	public static function lazyParentLoadedProperties():Array<String>
	{
		return ["col_info"];
	}

	public static function pluginAbiCompatibilityProperties():Array<String>
	{
		return [
			"declared_public_reflection_shape",
			"dynamic_properties",
			"magic_accessors",
			"protected_magic_write_blocks"
		];
	}

	public static function bootstrapEntryPoints():Array<String>
	{
		return ["require_wp_db", "wp-content/db.php"];
	}

	public static function nativeResourceWriteRoute(name:String):String
	{
		if (contains(parentVisibleNativeResourceProperties(), name))
		{
			return NATIVE_ROUTE_PARENT_VISIBLE_PHP_PROPERTY;
		}
		return ROUTE_UNKNOWN;
	}

	public static function lazyReadRoute(name:String):String
	{
		if (contains(lazyParentLoadedProperties(), name))
		{
			return LAZY_ROUTE_WORDPRESS_PARENT_LOADER;
		}
		return ROUTE_UNKNOWN;
	}

	public static function bootstrapRoute(name:String):String
	{
		if (contains(bootstrapEntryPoints(), name))
		{
			return BOOTSTRAP_ROUTE_DB_DROPIN_GLOBAL;
		}
		return ROUTE_UNKNOWN;
	}

	public static function shouldStoreNativeResourceInParentVisibleSlot(name:String):Bool
	{
		return nativeResourceWriteRoute(name) == NATIVE_ROUTE_PARENT_VISIBLE_PHP_PROPERTY;
	}

	public static function shouldDelegateLazyReadToParentLoader(name:String):Bool
	{
		return lazyReadRoute(name) == LAZY_ROUTE_WORDPRESS_PARENT_LOADER;
	}

	public static function preservesPluginAbiCompatibility():Bool
	{
		return true;
	}

	public static function preservesRequireWpDbDropinReplacement():Bool
	{
		return WpdbPublicStateDescriptor.preservesDbDropinReplacement() && WpdbPublicStateDescriptor.requireWpDbReturnsWhenGlobalIsSet();
	}

	public static function usesExpandedPublicStateAdapter():Bool
	{
		return WpdbPublicStateExpandedStorageAdapter.completeDeclaredPublicStateCoverage();
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
