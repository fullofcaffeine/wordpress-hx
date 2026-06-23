package wphx.wp.auth;

using StringTools;

@:keep
class AuthAdapterContract
{
	public static inline final SEMANTIC_OWNER_HAXE = "haxe";
	public static inline final ADAPTER_CONTRACT_OWNER_HAXE_TYPED = "haxe_typed";
	public static inline final EMISSION_STRATEGY_STOCK_HAXE_PHP = "stock_haxe_php_private_impl";
	public static inline final EXECUTION_PROVIDER_HAXE_PHP = "haxe_php";
	public static inline final EVIDENCE_TARGETED_SEMANTIC_PARITY = "targeted_semantic_parity";

	public static inline final CAPABILITY_PRIMITIVE = "primitive_capability";
	public static inline final CAPABILITY_META = "meta_capability";
	public static inline final CAPABILITY_SUPER_ADMIN_SENSITIVE = "super_admin_sensitive";
	public static inline final CAPABILITY_UNKNOWN = "unknown_capability";

	public static inline final NONCE_CURRENT_TICK = "current_tick";
	public static inline final NONCE_PREVIOUS_TICK = "previous_tick";
	public static inline final NONCE_INVALID = "invalid";

	public static inline final PASSWORD_PHPASS = "phpass";
	public static inline final PASSWORD_BCRYPT = "bcrypt";
	public static inline final PASSWORD_WORDPRESS_BCRYPT = "wordpress_bcrypt";
	public static inline final PASSWORD_UNKNOWN = "unknown";

	public static inline final COOKIE_AUTH = "auth";
	public static inline final COOKIE_SECURE_AUTH = "secure_auth";
	public static inline final COOKIE_LOGGED_IN = "logged_in";

	public static inline final APPLICATION_PASSWORD_SKIP = "skip";
	public static inline final APPLICATION_PASSWORD_ATTEMPT = "attempt";

	static final META_CAPABILITIES = [
		"delete_post",
		"delete_page",
		"edit_post",
		"edit_page",
		"read_post",
		"read_page",
		"edit_user",
		"delete_user",
		"promote_user",
		"remove_user",
		"add_user",
		"create_app_password",
		"list_app_passwords",
		"read_app_password",
		"edit_app_password",
		"delete_app_password",
		"delete_app_passwords"
	];

	static final SUPER_ADMIN_SENSITIVE_CAPABILITIES = [
		"setup_network",
		"manage_network",
		"manage_sites",
		"manage_network_users",
		"manage_network_plugins",
		"manage_network_themes",
		"manage_network_options",
		"upgrade_network",
		"delete_site"
	];

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

	public static function capabilityKind(capability:String):String
	{
		if (contains(META_CAPABILITIES, capability))
		{
			return CAPABILITY_META;
		}
		if (contains(SUPER_ADMIN_SENSITIVE_CAPABILITIES, capability))
		{
			return CAPABILITY_SUPER_ADMIN_SENSITIVE;
		}
		return capability == "" ? CAPABILITY_UNKNOWN : CAPABILITY_PRIMITIVE;
	}

	public static function shouldMapMetaCapability(capability:String):Bool
	{
		return capabilityKind(capability) == CAPABILITY_META;
	}

	public static function nonceVerificationRoute(currentTickMatches:Bool, previousTickMatches:Bool):String
	{
		if (currentTickMatches)
		{
			return NONCE_CURRENT_TICK;
		}
		return previousTickMatches ? NONCE_PREVIOUS_TICK : NONCE_INVALID;
	}

	public static function passwordHashFamily(hash:String):String
	{
		if (hash.startsWith("$wp$"))
		{
			return PASSWORD_WORDPRESS_BCRYPT;
		}
		if (hash.startsWith("$2y$") || hash.startsWith("$2a$") || hash.startsWith("$2b$"))
		{
			return PASSWORD_BCRYPT;
		}
		if (hash.startsWith("$P$") || hash.startsWith("$H$"))
		{
			return PASSWORD_PHPASS;
		}
		return PASSWORD_UNKNOWN;
	}

	public static function authCookieScheme(secureCookie:Bool):String
	{
		return secureCookie ? COOKIE_SECURE_AUTH : COOKIE_AUTH;
	}

	public static function loggedInCookieScheme():String
	{
		return COOKIE_LOGGED_IN;
	}

	public static function applicationPasswordRoute(inputUserPresent:Bool, credentialsPresent:Bool):String
	{
		return inputUserPresent && credentialsPresent ? APPLICATION_PASSWORD_ATTEMPT : APPLICATION_PASSWORD_SKIP;
	}

	static function contains(values:Array<String>, value:String):Bool
	{
		for (item in values)
		{
			if (item == value)
			{
				return true;
			}
		}
		return false;
	}
}
