package wphx.fixtures.wp.facade;

import haxe.Json;

@:keep
class GlobalKernel
{
	public static function addFilter(hookName:Dynamic, callback:Dynamic, priority:Dynamic, acceptedArgs:Dynamic):Dynamic
	{
		php.Syntax.code("$GLOBALS['wphx_204_registrations'][] = array('hookName' => {0}, 'priority' => {2}, 'acceptedArgs' => {3}, 'callbackKind' => is_callable({1}) ? 'callable' : gettype({1}))",
			hookName, callback, priority, acceptedArgs);
		return true;
	}

	public static function applyFilters(hookName:Dynamic, value:Dynamic, args:Dynamic):Dynamic
	{
		php.Syntax.code("$GLOBALS['wphx_204_applications'][] = array('hookName' => {0}, 'argCount' => is_array({2}) ? count({2}) : 0)", hookName, value, args);
		return value;
	}

	public static function wpArraySet(inputArray:Dynamic, path:Dynamic, value:Dynamic):Dynamic
	{
		return
			php.Syntax.code("(function ($input, $path, $value) { $target =& $input; foreach ($path as $segment) { if (!is_array($target)) { $target = array(); } if (!array_key_exists($segment, $target) || !is_array($target[$segment])) { $target[$segment] = array(); } $target =& $target[$segment]; } $target = $value; return $input; })({0}, {1}, {2})",
			inputArray, path, value);
	}

	public static function snapshotJson():String
	{
		final snapshot:Dynamic = php.Syntax.code("array('registrations' => $GLOBALS['wphx_204_registrations'] ?? array(), 'applications' => $GLOBALS['wphx_204_applications'] ?? array())");
		return Json.stringify(snapshot);
	}
}
