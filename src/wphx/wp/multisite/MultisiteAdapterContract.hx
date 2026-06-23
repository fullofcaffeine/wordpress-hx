package wphx.wp.multisite;

using StringTools;

@:keep
class MultisiteAdapterContract
{
	public static inline final SEMANTIC_OWNER_HAXE = "haxe";
	public static inline final ADAPTER_CONTRACT_OWNER_HAXE_TYPED = "haxe_typed";
	public static inline final EMISSION_STRATEGY_STOCK_HAXE_PHP = "stock_haxe_php_private_impl";
	public static inline final EXECUTION_PROVIDER_HAXE_PHP = "haxe_php";
	public static inline final EVIDENCE_TARGETED_SEMANTIC_PARITY = "targeted_semantic_parity";

	public static inline final ROUTE_SITE_BLOG_ID_INT = "site_blog_id_int";
	public static inline final ROUTE_SITE_NETWORK_ID_INT = "site_network_id_int";
	public static inline final ROUTE_SITE_DETAILS_VALUE = "site_details_value";
	public static inline final ROUTE_NULL = "null";

	public static inline final ROUTE_ISSET_TRUE = "isset_true";
	public static inline final ROUTE_ISSET_DETAILS_TRUE = "isset_details_true";
	public static inline final ROUTE_ISSET_DETAILS_LOOKUP = "isset_details_lookup";
	public static inline final ROUTE_ISSET_FALSE = "isset_false";

	public static inline final TARGET_BLOG_ID = "blog_id";
	public static inline final TARGET_SITE_ID = "site_id";
	public static inline final TARGET_ID = "id";
	public static inline final TARGET_DYNAMIC_PROPERTY = "dynamic_property";

	public static inline final ROUTE_NETWORK_ID_INT = "network_id_int";
	public static inline final ROUTE_NETWORK_BLOG_ID_STRING = "network_blog_id_string";
	public static inline final ROUTE_NETWORK_SITE_ID_INT = "network_site_id_int";

	public static function semanticOwner():String
	{
		return SEMANTIC_OWNER_HAXE;
	}

	public static function adapterContractOwner():String
	{
		return ADAPTER_CONTRACT_OWNER_HAXE_TYPED;
	}

	public static function emissionStrategy():String
	{
		return EMISSION_STRATEGY_STOCK_HAXE_PHP;
	}

	public static function executionProvider():String
	{
		return EXECUTION_PROVIDER_HAXE_PHP;
	}

	public static function compatibilityEvidence():String
	{
		return EVIDENCE_TARGETED_SEMANTIC_PARITY;
	}

	public static function deriveCookieDomain(domain:String, existingCookieDomain:String):String
	{
		return existingCookieDomain == "" ? stripWwwPrefix(hostFromDomainValue(domain)) : existingCookieDomain;
	}

	public static function hostFromDomainValue(domain:String):String
	{
		final schemeIndex = domain.indexOf("://");
		if (schemeIndex < 0)
		{
			return domain;
		}

		var host = domain.substr(schemeIndex + 3);
		host = beforeSeparator(host, "/");
		host = beforeSeparator(host, "?");
		host = beforeSeparator(host, "#");

		final portIndex = host.indexOf(":");
		if (portIndex > 0)
		{
			host = host.substr(0, portIndex);
		}

		return host == "" ? domain : host;
	}

	public static function stripWwwPrefix(domain:String):String
	{
		return domain.startsWith("www.") ? domain.substr(4) : domain;
	}

	public static function siteMagicGetRoute(key:String, msLoaded:Bool, detailKeyAvailable:Bool):String
	{
		return switch key
		{
			case "id":
				ROUTE_SITE_BLOG_ID_INT;
			case "network_id":
				ROUTE_SITE_NETWORK_ID_INT;
			case "blogname" | "siteurl" | "post_count" | "home":
				msLoaded ? ROUTE_SITE_DETAILS_VALUE : ROUTE_NULL;
			case _: msLoaded && detailKeyAvailable ? ROUTE_SITE_DETAILS_VALUE : ROUTE_NULL;
		}
	}

	public static function siteMagicIssetRoute(key:String, msLoaded:Bool, detailKeyAvailable:Bool):String
	{
		return switch key
		{
			case "id" | "network_id":
				ROUTE_ISSET_TRUE;
			case "blogname" | "siteurl" | "post_count" | "home":
				msLoaded ? ROUTE_ISSET_DETAILS_TRUE : ROUTE_ISSET_FALSE;
			case _:
				if (!msLoaded)
				{
					ROUTE_ISSET_FALSE;
				} else if (detailKeyAvailable)
				{
					ROUTE_ISSET_DETAILS_TRUE;
				} else
				{
					ROUTE_ISSET_DETAILS_LOOKUP;
				}
		}
	}

	public static function siteMagicSetTarget(key:String):String
	{
		return switch key
		{
			case "id":
				TARGET_BLOG_ID;
			case "network_id":
				TARGET_SITE_ID;
			case _:
				TARGET_DYNAMIC_PROPERTY;
		}
	}

	public static function networkMagicGetRoute(key:String):String
	{
		return switch key
		{
			case "id":
				ROUTE_NETWORK_ID_INT;
			case "blog_id":
				ROUTE_NETWORK_BLOG_ID_STRING;
			case "site_id":
				ROUTE_NETWORK_SITE_ID_INT;
			case _:
				ROUTE_NULL;
		}
	}

	public static function networkMagicIsset(key:String):Bool
	{
		return key == "id" || key == "blog_id" || key == "site_id";
	}

	public static function networkMagicSetTarget(key:String):String
	{
		return switch key
		{
			case "id":
				TARGET_ID;
			case "blog_id" | "site_id":
				TARGET_BLOG_ID;
			case _:
				TARGET_DYNAMIC_PROPERTY;
		}
	}

	public static function parseQueryOrder(order:String):String
	{
		return order != "" && order.toUpperCase() == "ASC" ? "ASC" : "DESC";
	}

	static function beforeSeparator(value:String, separator:String):String
	{
		final index = value.indexOf(separator);
		return index >= 0 ? value.substr(0, index) : value;
	}
}
