package wphx.fixtures.compiler.php.wp;

@:native("\\wphx\\wp\\http\\_HttpBlockRequestPolicy\\HttpBlockRequestPolicy_Fields_")
extern class HaxeHttpBlockRequestPolicy
{
	static function isLocalRequest(requestHost:String, siteHost:String):Bool;

	static function shouldBlockExternalHost(requestHost:String, accessibleHosts:String):Bool;
}
