package wphx.fixtures.wp.hooks;

import haxe.Json;
import haxe.ds.ArraySort;

using StringTools;

typedef HookCallbackSpec =
{
	final id:String;
	final priority:Int;
	final acceptedArgs:Int;
}

typedef PluginPathMapping =
{
	final dir:String;
	final realdir:String;
}

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
	static inline var DEFAULT_FILTER_PRIORITY:Int = 10;
	static inline var NULL_KERNEL_PRIORITY:Int = 0;

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
				sortedPriorities: prioritiesFor(callbacks),
				callbackOrder: callbackOrder(callbacks),
				afterRemovePriority: prioritiesAfterRemove(callbacks, 10),
				acceptedArgCounts: acceptedArgCounts(callbacks)
			},
			stack: {
				currentFilter: currentHook(stack),
				doingAny: doingHook(stack, null),
				doingOuter: doingHook(stack, "outer_filter"),
				doingMissing: doingHook(stack, "missing"),
				filterCountAfterFirst: incrementCount(0),
				filterCountAfterSecond: incrementCount(1),
				actionCountAfterFirst: incrementCount(0)
			},
			dispatch: {
				noArgsAccepted: dispatchArgCount(3, 0),
				limitedArgsAccepted: dispatchArgCount(3, 2),
				allArgsAccepted: dispatchArgCount(3, 5),
				filterWritesValue: shouldWriteFilteredValue(false),
				actionWritesValue: shouldWriteFilteredValue(true),
				actionDefaultArgs: defaultActionArgs([])
			},
			pluginPaths: {
				basename: pluginBasename(pluginFile, pluginDir, muPluginDir, []),
				muBasename: pluginBasename(muPluginFile, pluginDir, muPluginDir, []),
				mappedBasename: pluginBasename(mappedFile, pluginDir, muPluginDir, mappings),
				activationHook: lifecycleHook("activate_", pluginFile, pluginDir, muPluginDir, []),
				deactivationHook: lifecycleHook("deactivate_", pluginFile, pluginDir, muPluginDir, [])
			}
		};
	}

	public static function defaultFilterPriority():Int
	{
		return DEFAULT_FILTER_PRIORITY;
	}

	public static function normalizeKernelPriority(priority:Null<Int>):Int
	{
		return priority == null ? NULL_KERNEL_PRIORITY : priority;
	}

	public static function prioritiesFor(callbacks:Array<HookCallbackSpec>):Array<Int>
	{
		var priorities:Array<Int> = [];
		for (callback in callbacks)
		{
			priorities = insertPriority(priorities, callback.priority);
		}
		return priorities;
	}

	public static function insertPriority(priorities:Array<Int>, priority:Int):Array<Int>
	{
		final result = priorities.copy();
		for (index in 0...result.length)
		{
			final current = result[index];
			if (priority == current)
			{
				return result;
			}
			if (priority < current)
			{
				result.insert(index, priority);
				return result;
			}
		}
		result.push(priority);
		return result;
	}

	public static function callbackOrder(callbacks:Array<HookCallbackSpec>):Array<String>
	{
		final ordered:Array<String> = [];
		for (priority in prioritiesFor(callbacks))
		{
			for (callback in callbacks)
			{
				if (callback.priority == priority)
				{
					ordered.push(callback.id);
				}
			}
		}
		return ordered;
	}

	public static function prioritiesAfterRemove(callbacks:Array<HookCallbackSpec>, priority:Int):Array<Int>
	{
		var priorities:Array<Int> = [];
		for (callback in callbacks)
		{
			if (callback.priority != priority)
			{
				priorities = insertPriority(priorities, callback.priority);
			}
		}
		return priorities;
	}

	public static function acceptedArgCounts(callbacks:Array<HookCallbackSpec>):Array<Int>
	{
		final counts:Array<Int> = [];
		for (priority in prioritiesFor(callbacks))
		{
			for (callback in callbacks)
			{
				if (callback.priority == priority)
				{
					counts.push(callback.acceptedArgs);
				}
			}
		}
		return counts;
	}

	public static function currentHook(stack:Array<String>):String
	{
		if (stack.length == 0)
		{
			return "";
		}
		return stack[stack.length - 1];
	}

	public static function doingHook(stack:Array<String>, hookName:Null<String>):Bool
	{
		if (hookName == null)
		{
			return stack.length > 0;
		}
		return stack.indexOf(hookName) != -1;
	}

	public static function incrementCount(current:Int):Int
	{
		return current + 1;
	}

	public static function dispatchArgCount(totalArgs:Int, acceptedArgs:Int):Int
	{
		if (acceptedArgs == 0)
		{
			return 0;
		}
		if (acceptedArgs >= totalArgs)
		{
			return totalArgs;
		}
		return acceptedArgs;
	}

	public static function shouldWriteFilteredValue(doingAction:Bool):Bool
	{
		return !doingAction;
	}

	public static function defaultActionArgs(args:Array<String>):Array<String>
	{
		if (args.length > 0)
		{
			return args.copy();
		}
		return [""];
	}

	public static function lifecycleHook(prefix:String, file:String, pluginDir:String, muPluginDir:String, mappings:Array<PluginPathMapping>):String
	{
		return prefix + pluginBasename(file, pluginDir, muPluginDir, mappings);
	}

	public static function pluginBasename(file:String, pluginDir:String, muPluginDir:String, mappings:Array<PluginPathMapping>):String
	{
		var normalized = normalizePath(file);
		final sorted = mappings.copy();
		ArraySort.sort(sorted, compareMappingByRealpathDesc);
		for (mapping in sorted)
		{
			final realdir = normalizePath(mapping.realdir);
			if (normalized.startsWith(realdir))
			{
				normalized = normalizePath(mapping.dir) + normalized.substr(realdir.length);
			}
		}

		normalized = removePathPrefix(normalized, normalizePath(pluginDir));
		normalized = removePathPrefix(normalized, normalizePath(muPluginDir));
		return trimSlashes(normalized);
	}

	static function compareMappingByRealpathDesc(left:PluginPathMapping, right:PluginPathMapping):Int
	{
		final leftPath = normalizePath(left.realdir);
		final rightPath = normalizePath(right.realdir);
		if (leftPath == rightPath)
		{
			return 0;
		}
		return leftPath < rightPath ? 1 : -1;
	}

	static function normalizePath(path:String):String
	{
		return path.replace("\\", "/");
	}

	static function removePathPrefix(path:String, base:String):String
	{
		final prefix = trimTrailingSlashes(base) + "/";
		if (path.startsWith(prefix))
		{
			return path.substr(prefix.length);
		}
		return path;
	}

	static function trimTrailingSlashes(value:String):String
	{
		var end = value.length;
		while (end > 0 && isSlash(value.charAt(end - 1)))
		{
			end--;
		}
		return value.substring(0, end);
	}

	static function trimSlashes(value:String):String
	{
		var start = 0;
		var end = value.length;
		while (start < end && isSlash(value.charAt(start)))
		{
			start++;
		}
		while (end > start && isSlash(value.charAt(end - 1)))
		{
			end--;
		}
		return value.substring(start, end);
	}

	static function isSlash(value:String):Bool
	{
		return value == "/" || value == "\\";
	}
}
