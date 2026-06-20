package wphx.fixtures.php.facade;

import haxe.Json;

typedef FilterRegistration =
{
	final hookName:String;
	final priority:Int;
	final acceptedArgs:Int;
	final callbackKind:String;
};

/**
	WPHX-211: This fixture models WordPress PHP callables, which can be closure,
	string, or method-array shapes. Dynamic is isolated to the callable boundary.
**/
typedef FacadeCallback = Dynamic;

@:keep
class FacadeKernel
{
	static final registrations:Array<FilterRegistration> = [];

	public static function addFilter(hookName:String, callback:FacadeCallback, priority:Int = 10, acceptedArgs:Int = 1):Bool
	{
		registrations.push({
			hookName: hookName,
			priority: priority,
			acceptedArgs: acceptedArgs,
			callbackKind: callback == null ? "null" : "callable"
		});

		return true;
	}

	public static function snapshot():String
	{
		return Json.stringify(registrations);
	}
}
