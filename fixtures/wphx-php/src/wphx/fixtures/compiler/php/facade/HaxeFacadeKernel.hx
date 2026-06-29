package wphx.fixtures.compiler.php.facade;

import wphx.fixtures.php.facade.FacadeKernel.FacadeCallback;

/**
	Extern for the stock Haxe PHP implementation used behind compiler-emitted F1 shell PHP.
**/
@:native("\\wphx\\fixtures\\php\\facade\\FacadeKernel")
extern class HaxeFacadeKernel
{
	static function addFilter(hookName:String, callback:FacadeCallback, priority:Int = 10, acceptedArgs:Int = 1):Bool;
}
