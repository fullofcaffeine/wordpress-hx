package wphx.fixtures.php.facade;

import haxe.Json;
import wphx.wp.hooks.HookRuntime;

@:keep
class HookKernel
{
	public static function marker(name:String):String
	{
		return "hook:" + name.toUpperCase();
	}

	public static function eventJson(event:String, hookName:String, detail:String):String
	{
		return Json.stringify({
			event: event,
			hookName: hookName,
			detail: detail
		});
	}

	public static function normalizeKernelPriority(priority:Null<Int>):Int
	{
		return HookRuntime.normalizeKernelPriority(priority);
	}

	public static function incrementCount(current:Int):Int
	{
		return HookRuntime.incrementCount(current);
	}

	public static function dispatchArgCount(totalArgs:Int, acceptedArgs:Int):Int
	{
		return HookRuntime.dispatchArgCount(totalArgs, acceptedArgs);
	}

	public static function shouldWriteFilteredValue(doingAction:Bool):Bool
	{
		return HookRuntime.shouldWriteFilteredValue(doingAction);
	}

	public static function shouldUseDefaultActionArg(argCount:Int):Bool
	{
		return HookRuntime.shouldUseDefaultActionArg(argCount);
	}

	public static function defaultActionArg():String
	{
		return HookRuntime.defaultActionArg();
	}

	public static function pluginBasenameAfterMappings(file:String, pluginDir:String, muPluginDir:String):String
	{
		return HookRuntime.pluginBasenameAfterMappings(file, pluginDir, muPluginDir);
	}

	public static function lifecycleHookName(prefix:String, basename:String):String
	{
		return HookRuntime.lifecycleHookName(prefix, basename);
	}

	public static function shouldRegisterPluginRealpath(pluginPath:String, wpPluginPath:String, wpmuPluginPath:String):Bool
	{
		return HookRuntime.shouldRegisterPluginRealpath(pluginPath, wpPluginPath, wpmuPluginPath);
	}

	public static function shouldStorePluginRealpathMapping(pluginPath:String, pluginRealpath:String):Bool
	{
		return HookRuntime.shouldStorePluginRealpathMapping(pluginPath, pluginRealpath);
	}
}
