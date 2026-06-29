package wphx.fixtures.php.bootstrap;

import haxe.Json;

/**
	Stock Haxe PHP implementation used by WPHX bootstrap lifecycle probes.
**/
@:keep
class BootstrapKernel
{
	static final calls:Array<String> = [];

	public static function mark(label:String):String
	{
		calls.push(label);
		return "boot:" + label + ":" + calls.length;
	}

	public static function snapshot():String
	{
		return Json.stringify(calls);
	}
}
