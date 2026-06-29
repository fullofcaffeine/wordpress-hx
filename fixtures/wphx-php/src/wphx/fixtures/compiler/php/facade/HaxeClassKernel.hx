package wphx.fixtures.compiler.php.facade;

/**
	Extern for the stock Haxe PHP implementation used behind compiler-emitted F4 shell PHP.
**/
@:native("\\wphx\\fixtures\\php\\facade\\ClassKernel")
extern class HaxeClassKernel
{
	static function describe(name:String, metaCount:Int):String;

	static function baseLabel(value:String):String;
}
