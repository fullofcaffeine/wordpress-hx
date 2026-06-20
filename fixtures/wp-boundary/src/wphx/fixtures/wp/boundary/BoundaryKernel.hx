package wphx.fixtures.wp.boundary;

import haxe.Json;
import wphx.wp.boundary.CallableValue;
import wphx.wp.boundary.Globals;
import wphx.wp.boundary.NativeArray;
import wphx.wp.boundary.ReferenceBoundary;
import wphx.wp.boundary.WpErrorValue;

@:keep
class BoundaryKernel
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
			},
			numeric_keys: {
				"0": "zero",
				"2": "two",
				"10": "ten"
			},
			nested: {
				theme: {
					active: true,
					name: "twentytwentyseven"
				}
			}
		});
	}

	public static function normalizeKey(key:String):String
	{
		return StringTools.trim(key).split(" ").join("_").toLowerCase();
	}

	public static function exerciseForCompiler():Void
	{
		var values = NativeArray.fromJsonObject(seedJson());
		NativeArray.isArray(values);
		NativeArray.keyExists(values, "siteurl");
		NativeArray.issetKey(values, "null_value");
		NativeArray.get(values, "missing", "fallback");
		NativeArray.keys(values);
		NativeArray.values(values);
		NativeArray.count(values);
		Globals.exists("wphx_boundary_options");
		Globals.hasValue("wphx_boundary_options");
		Globals.get("wphx_boundary_options", null);
		Globals.keys();
		ReferenceBoundary.transformString("core", "-tail");
		CallableValue.call1(function(value:String):String
		{
			return value.toUpperCase();
		}, "core");
		WpErrorValue.isWpError(values);
	}
}
