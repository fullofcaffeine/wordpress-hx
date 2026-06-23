package wphx.fixtures.wp.core;

import wphx.wp.multisite.MultisiteAdapterContract;

@:keep
class MultisiteAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("semantic_owner", MultisiteAdapterContract.semanticOwner());
		emit("adapter_contract_owner", MultisiteAdapterContract.adapterContractOwner());
		emit("emission_strategy", MultisiteAdapterContract.emissionStrategy());
		emit("execution_provider", MultisiteAdapterContract.executionProvider());
		emit("compatibility_evidence", MultisiteAdapterContract.compatibilityEvidence());
		emit("cookie:plain-www", MultisiteAdapterContract.deriveCookieDomain("www.alt.example.test", ""));
		emit("cookie:url-www", MultisiteAdapterContract.deriveCookieDomain("https://www.alt.example.test/path", ""));
		emit("cookie:preserve-existing", MultisiteAdapterContract.deriveCookieDomain("www.alt.example.test", "cookies.example.test"));
		emit("site-get:id", MultisiteAdapterContract.siteMagicGetRoute("id", false, false));
		emit("site-get:network_id", MultisiteAdapterContract.siteMagicGetRoute("network_id", false, false));
		emit("site-get:blogname-before-ms", MultisiteAdapterContract.siteMagicGetRoute("blogname", false, false));
		emit("site-get:blogname-after-ms", MultisiteAdapterContract.siteMagicGetRoute("blogname", true, false));
		emit("site-get:custom-present", MultisiteAdapterContract.siteMagicGetRoute("custom_probe", true, true));
		emit("site-get:custom-missing", MultisiteAdapterContract.siteMagicGetRoute("custom_probe", true, false));
		emit("site-isset:id", boolText(MultisiteAdapterContract.siteMagicIssetRoute("id", false, false) == MultisiteAdapterContract.ROUTE_ISSET_TRUE));
		emit("site-isset:home-before-ms", MultisiteAdapterContract.siteMagicIssetRoute("home", false, false));
		emit("site-isset:home-after-ms", MultisiteAdapterContract.siteMagicIssetRoute("home", true, false));
		emit("site-isset:custom-missing", MultisiteAdapterContract.siteMagicIssetRoute("custom_probe", true, false));
		emit("site-set:id", MultisiteAdapterContract.siteMagicSetTarget("id"));
		emit("site-set:network_id", MultisiteAdapterContract.siteMagicSetTarget("network_id"));
		emit("site-set:custom", MultisiteAdapterContract.siteMagicSetTarget("custom_probe"));
		emit("network-get:id", MultisiteAdapterContract.networkMagicGetRoute("id"));
		emit("network-get:blog_id", MultisiteAdapterContract.networkMagicGetRoute("blog_id"));
		emit("network-get:site_id", MultisiteAdapterContract.networkMagicGetRoute("site_id"));
		emit("network-get:missing", MultisiteAdapterContract.networkMagicGetRoute("missing"));
		emit("network-isset:blog_id", boolText(MultisiteAdapterContract.networkMagicIsset("blog_id")));
		emit("network-isset:missing", boolText(MultisiteAdapterContract.networkMagicIsset("missing")));
		emit("network-set:id", MultisiteAdapterContract.networkMagicSetTarget("id"));
		emit("network-set:site_id", MultisiteAdapterContract.networkMagicSetTarget("site_id"));
		emit("network-set:custom", MultisiteAdapterContract.networkMagicSetTarget("custom_probe"));
		emit("order:empty", MultisiteAdapterContract.parseQueryOrder(""));
		emit("order:asc-lower", MultisiteAdapterContract.parseQueryOrder("asc"));
		emit("order:desc", MultisiteAdapterContract.parseQueryOrder("DESC"));
		emit("order:garbage", MultisiteAdapterContract.parseQueryOrder("sideways"));
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
