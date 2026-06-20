package wphx.fixtures.wp.macro;

import wphx.fixtures.wp.macro.MacroTypes.WpCallback;

@:build(wphx.wp.macros.BindingValidator.build())
@:wp.class("WP_Hook")
class ValidBindings
{
	public static function main():Void
	{
		Sys.println("wphx-wp-macro-valid");
	}

	@:wp.global("add_filter", "src/wp-includes/plugin.php")
	public static function addFilter(hookName:String, callback:WpCallback, ?priority:Int, ?acceptedArgs:Int):Bool
	{
		return true;
	}

	@:wp.method("WP_Hook::add_filter")
	public function add_filter(hookName:String, callback:WpCallback, priority:Int, acceptedArgs:Int):Void {}

	@:wp.constant("ABSPATH", "src/index.php")
	public static final abspath:String = "";
}
