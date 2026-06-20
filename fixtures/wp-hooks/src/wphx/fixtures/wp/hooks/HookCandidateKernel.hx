package wphx.fixtures.wp.hooks;

import haxe.Json;
import wphx.wp.hooks.HookRuntime;
import wphx.wp.hooks.HookRuntime.HookCallbackSpec;
import wphx.wp.hooks.HookRuntime.PluginPathMapping;

typedef HookPrioritySnapshot =
{
	final defaultPriority:Int;
	final nullKernelPriority:Int;
	final sortedPriorities:Array<Int>;
	final callbackOrder:Array<String>;
	final afterRemovePriority:Array<Int>;
	final acceptedArgCounts:Array<Int>;
}

typedef HookStackSnapshot =
{
	final currentFilter:String;
	final doingAny:Bool;
	final doingOuter:Bool;
	final doingMissing:Bool;
	final filterCountAfterFirst:Int;
	final filterCountAfterSecond:Int;
	final actionCountAfterFirst:Int;
}

typedef HookDispatchSnapshot =
{
	final noArgsAccepted:Int;
	final limitedArgsAccepted:Int;
	final allArgsAccepted:Int;
	final filterWritesValue:Bool;
	final actionWritesValue:Bool;
	final actionDefaultArgs:Array<String>;
}

typedef PluginPathSnapshot =
{
	final basename:String;
	final muBasename:String;
	final mappedBasename:String;
	final activationHook:String;
	final deactivationHook:String;
}

typedef HookCandidateSnapshot =
{
	final priorities:HookPrioritySnapshot;
	final stack:HookStackSnapshot;
	final dispatch:HookDispatchSnapshot;
	final pluginPaths:PluginPathSnapshot;
}

@:keep
class HookCandidateKernel
{
	public static function snapshotJson():String
	{
		return Json.stringify(snapshot());
	}

	public static function snapshot():HookCandidateSnapshot
	{
		final callbacks:Array<HookCallbackSpec> = [
			{id: "high", priority: 20, acceptedArgs: 1},
			{id: "low", priority: 5, acceptedArgs: 1},
			{id: "middle", priority: 10, acceptedArgs: 2}
		];
		final stack = ["outer_filter", "inner_action"];
		final pluginDir = "/tmp/wphx-303/wp-content/plugins";
		final muPluginDir = "/tmp/wphx-303/wp-content/mu-plugins";
		final pluginFile = pluginDir + "/sample/sample.php";
		final muPluginFile = muPluginDir + "/loader.php";
		final mappedFile = "/tmp/wphx-303/real-plugins/mapped/mapped.php";
		final mappings:Array<PluginPathMapping> = [{dir: pluginDir + "/mapped", realdir: "/tmp/wphx-303/real-plugins/mapped"}];

		return {
			priorities: {
				defaultPriority: defaultFilterPriority(),
				nullKernelPriority: normalizeKernelPriority(null),
				sortedPriorities: HookRuntime.prioritiesFor(callbacks),
				callbackOrder: HookRuntime.callbackOrder(callbacks),
				afterRemovePriority: HookRuntime.prioritiesAfterRemove(callbacks, 10),
				acceptedArgCounts: HookRuntime.acceptedArgCounts(callbacks)
			},
			stack: {
				currentFilter: HookRuntime.currentHook(stack),
				doingAny: HookRuntime.doingHook(stack, null),
				doingOuter: HookRuntime.doingHook(stack, "outer_filter"),
				doingMissing: HookRuntime.doingHook(stack, "missing"),
				filterCountAfterFirst: HookRuntime.incrementCount(0),
				filterCountAfterSecond: HookRuntime.incrementCount(1),
				actionCountAfterFirst: HookRuntime.incrementCount(0)
			},
			dispatch: {
				noArgsAccepted: HookRuntime.dispatchArgCount(3, 0),
				limitedArgsAccepted: HookRuntime.dispatchArgCount(3, 2),
				allArgsAccepted: HookRuntime.dispatchArgCount(3, 5),
				filterWritesValue: HookRuntime.shouldWriteFilteredValue(false),
				actionWritesValue: HookRuntime.shouldWriteFilteredValue(true),
				actionDefaultArgs: HookRuntime.defaultActionArgs([])
			},
			pluginPaths: {
				basename: HookRuntime.pluginBasename(pluginFile, pluginDir, muPluginDir, []),
				muBasename: HookRuntime.pluginBasename(muPluginFile, pluginDir, muPluginDir, []),
				mappedBasename: HookRuntime.pluginBasename(mappedFile, pluginDir, muPluginDir, mappings),
				activationHook: HookRuntime.lifecycleHook("activate_", pluginFile, pluginDir, muPluginDir, []),
				deactivationHook: HookRuntime.lifecycleHook("deactivate_", pluginFile, pluginDir, muPluginDir, [])
			}
		};
	}

	public static function defaultFilterPriority():Int
	{
		return HookRuntime.defaultFilterPriority();
	}

	public static function normalizeKernelPriority(priority:Null<Int>):Int
	{
		return HookRuntime.normalizeKernelPriority(priority);
	}
}
