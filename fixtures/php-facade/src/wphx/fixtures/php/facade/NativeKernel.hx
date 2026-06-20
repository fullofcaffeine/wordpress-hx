package wphx.fixtures.php.facade;

import haxe.Json;

@:keep
class NativeKernel
{
	public static function seedJson():String
	{
		return Json.stringify({
			siteurl: "https://example.test",
			blog_public: "1",
			empty_string: "",
			zero_string: "0",
			false_bool: false,
			null_value: null,
			list: ["first", "second"],
			assoc: {
				alpha: 1,
				beta: 2
			}
		});
	}

	public static function normalizeKey(key:String):String
	{
		return StringTools.trim(key).split(" ").join("_").toLowerCase();
	}
}
