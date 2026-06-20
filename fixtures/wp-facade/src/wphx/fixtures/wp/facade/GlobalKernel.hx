package wphx.fixtures.wp.facade;

import haxe.Json;
import wphx.fixtures.wp.facade.GlobalTypes.NativeWpCallable;
import wphx.fixtures.wp.facade.GlobalTypes.NativeWpValue;

@:keep
class GlobalKernel
{
	// WPHX-211: Raw PHP records native callable shape without converting it to Haxe Function.
	public static function addFilter(hookName:String, callback:NativeWpCallable, priority:Int, acceptedArgs:Int):Bool
	{
		php.Syntax.code("$GLOBALS['wphx_204_registrations'][] = array('hookName' => {0}, 'priority' => {2}, 'acceptedArgs' => {3}, 'callbackKind' => is_callable({1}) ? 'callable' : gettype({1}))",
			hookName, callback, priority, acceptedArgs);
		return true;
	}

	// WPHX-211: Raw PHP observes variadic native args while preserving the filtered value.
	public static function applyFilters(hookName:String, value:NativeWpValue, args:php.NativeArray):NativeWpValue
	{
		php.Syntax.code("$GLOBALS['wphx_204_applications'][] = array('hookName' => {0}, 'argCount' => is_array({2}) ? count({2}) : 0)", hookName, value, args);
		return value;
	}

	// WPHX-211: Raw PHP performs by-reference-style nested array mutation on native arrays.
	public static function wpArraySet(inputArray:php.NativeArray, path:php.NativeIndexedArray<String>, value:NativeWpValue):php.NativeArray
	{
		return
			php.Syntax.code("(function ($input, $path, $value) { $target =& $input; foreach ($path as $segment) { if (!is_array($target)) { $target = array(); } if (!array_key_exists($segment, $target) || !is_array($target[$segment])) { $target[$segment] = array(); } $target =& $target[$segment]; } $target = $value; return $input; })({0}, {1}, {2})",
			inputArray, path, value);
	}

	// WPHX-211: Snapshot is a native PHP array for JSON parity with the PHP oracle.
	public static function snapshotJson():String
	{
		final snapshot:php.NativeArray = php.Syntax.code("array('registrations' => $GLOBALS['wphx_204_registrations'] ?? array(), 'applications' => $GLOBALS['wphx_204_applications'] ?? array())");
		return Json.stringify(snapshot);
	}
}
