package wphx.fixtures.wp.core;

import wphx.wp.auth.AuthAdapterContract;

@:keep
class AuthAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("semantic_owner", AuthAdapterContract.semanticOwner());
		emit("adapter_contract_owner", AuthAdapterContract.adapterContractOwner());
		emit("emission_strategy", AuthAdapterContract.emissionStrategy());
		emit("execution_provider", AuthAdapterContract.executionProvider());
		emit("compatibility_evidence", AuthAdapterContract.compatibilityEvidence());
		emit("cap:edit_post", AuthAdapterContract.capabilityKind("edit_post"));
		emit("cap:manage_options", AuthAdapterContract.capabilityKind("manage_options"));
		emit("cap:manage_network", AuthAdapterContract.capabilityKind("manage_network"));
		emit("cap:empty", AuthAdapterContract.capabilityKind(""));
		emit("map-meta:edit_post", boolText(AuthAdapterContract.shouldMapMetaCapability("edit_post")));
		emit("map-meta:manage_options", boolText(AuthAdapterContract.shouldMapMetaCapability("manage_options")));
		emit("nonce:current", AuthAdapterContract.nonceVerificationRoute(true, true));
		emit("nonce:previous", AuthAdapterContract.nonceVerificationRoute(false, true));
		emit("nonce:invalid", AuthAdapterContract.nonceVerificationRoute(false, false));
		emit("password:wp", AuthAdapterContract.passwordHashFamily("$wp$2y$10$abcdefghijklmnopqrstuv"));
		emit("password:bcrypt", AuthAdapterContract.passwordHashFamily("$2y$10$abcdefghijklmnopqrstuv"));
		emit("password:phpass", AuthAdapterContract.passwordHashFamily("$P$abcdefghijklmnopqrstuv"));
		emit("password:unknown", AuthAdapterContract.passwordHashFamily("not-a-known-hash"));
		emit("cookie:auth", AuthAdapterContract.authCookieScheme(false));
		emit("cookie:secure-auth", AuthAdapterContract.authCookieScheme(true));
		emit("cookie:logged-in", AuthAdapterContract.loggedInCookieScheme());
		emit("app-password:attempt", AuthAdapterContract.applicationPasswordRoute(true, true));
		emit("app-password:skip-missing-user", AuthAdapterContract.applicationPasswordRoute(false, true));
		emit("app-password:skip-missing-credentials", AuthAdapterContract.applicationPasswordRoute(true, false));
	}

	static function emit(key:String, value:String):Void
	{
		Sys.println(key + "=" + value);
	}

	static function boolText(value:Bool):String
	{
		return value ? "true" : "false";
	}
}
