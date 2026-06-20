package wphx.fixtures.wp.facade;

@:build(wphx.wp.macros.BindingValidator.build())
@:keep
class GlobalBindings
{
	@:wp.global("add_filter", "src/wp-includes/plugin.php")
	public static function addFilter(hookName:Dynamic, callback:Dynamic, priority:Dynamic, acceptedArgs:Dynamic):Dynamic
	{
		return GlobalKernel.addFilter(hookName, callback, priority, acceptedArgs);
	}

	@:wp.global("apply_filters", "src/wp-includes/plugin.php")
	public static function applyFilters(hookName:Dynamic, value:Dynamic, args:Dynamic):Dynamic
	{
		return GlobalKernel.applyFilters(hookName, value, args);
	}

	@:wp.global("_wp_array_set", "src/wp-includes/functions.php")
	public static function wpArraySet(inputArray:Dynamic, path:Dynamic, value:Dynamic):Dynamic
	{
		return GlobalKernel.wpArraySet(inputArray, path, value);
	}
}
