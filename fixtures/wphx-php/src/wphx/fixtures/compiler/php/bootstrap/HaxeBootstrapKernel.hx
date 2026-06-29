package wphx.fixtures.compiler.php.bootstrap;

/**
	Extern for the stock Haxe PHP implementation behind bootstrap probe shells.
**/
@:native("\\wphx\\fixtures\\php\\bootstrap\\BootstrapKernel")
extern class HaxeBootstrapKernel
{
	static function mark(label:String):String;
	static function snapshot():String;
}
