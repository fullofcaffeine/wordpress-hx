package wphx.fixtures.php.facade;

import haxe.Json;

@:keep
class LoadKernel
{
	public static function eventJson(event:String, file:String, detail:String):String
	{
		return Json.stringify({
			event: event,
			file: file,
			detail: detail
		});
	}

	public static function marker(name:String):String
	{
		return "haxe:" + name.toUpperCase();
	}

	public static function returnValue(name:String, count:Int):String
	{
		return name + ":" + count;
	}

	public static function scopeValue(existing:String):String
	{
		return "scoped:" + existing;
	}
}
