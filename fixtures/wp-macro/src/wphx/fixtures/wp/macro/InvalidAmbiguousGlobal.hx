package wphx.fixtures.wp.macro;

import wphx.fixtures.wp.macro.MacroTypes.WpCallback;

@:build(wphx.wp.macros.BindingValidator.build())
class InvalidAmbiguousGlobal
{
	public static function main():Void {}

	@:wp.global("add_filter")
	public static function addFilter(hookName:String, callback:WpCallback, ?priority:Int, ?acceptedArgs:Int):Bool
	{
		return true;
	}
}
