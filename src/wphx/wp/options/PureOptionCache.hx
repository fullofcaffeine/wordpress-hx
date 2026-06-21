package wphx.wp.options;

@:keep
class PureOptionCache
{
	public static function determineOptionAutoloadValue(explicitAutoloadToken:String, defaultAutoload:Null<Bool>):String
	{
		return switch explicitAutoloadToken
		{
			case "bool:true" | "string:on" | "string:yes":
				"on";
			case "bool:false" | "string:off" | "string:no":
				"off";
			case _:
				if (defaultAutoload == null)
				{
					"auto";
				} else if (defaultAutoload)
				{
					"auto-on";
				} else
				{
					"auto-off";
				}
		}
	}

	public static function hasExplicitAutoloadValue(explicitAutoloadToken:String):Bool
	{
		return switch explicitAutoloadToken
		{
			case "bool:true" | "string:on" | "string:yes" | "bool:false" | "string:off" | "string:no":
				true;
			case _:
				false;
		}
	}

	public static function filterDefaultAutoloadValueViaOptionSize(current:Null<Bool>, serializedValue:String, serializedValueEmpty:Bool,
			maxOptionSize:Int):Null<Bool>
	{
		return serializedOptionExceedsSize(serializedValue, serializedValueEmpty, maxOptionSize) ? false : current;
	}

	public static function serializedOptionExceedsSize(serializedValue:String, serializedValueEmpty:Bool, maxOptionSize:Int):Bool
	{
		final size = serializedValueEmpty ? 0 : serializedValue.length;
		return size > maxOptionSize;
	}

	public static function cacheSupports(feature:String):Bool
	{
		return switch feature
		{
			case "add_multiple" | "set_multiple" | "get_multiple" | "delete_multiple" | "flush_runtime" | "flush_group":
				true;
			case _:
				false;
		}
	}
}
