package wphx.fixtures.compiler.php.wp;

@:native("\\wphx\\wp\\http\\_HttpAbsoluteUrl\\HttpAbsoluteUrl_Fields_")
extern class HaxeHttpAbsoluteUrl
{
	static function makeAbsoluteUrl(maybeRelativePath:String, baseScheme:String, baseHost:String, basePort:Null<Int>, basePath:String,
		basePathIsNonEmpty:Bool, relativeHasScheme:Bool, relativeHost:Null<String>, relativePort:Null<Int>, relativePath:String, relativePathIsNonEmpty:Bool,
		relativeQuery:String, relativeQueryIsNonEmpty:Bool, relativeFragment:String, relativeFragmentIsNonEmpty:Bool):String;
}
