package wphx.wp.rest;

@:keep
class RestSettingsSchemaStrategy
{
	public static inline final ROUTE_TYPED_HAXE_SCHEMA_PLAN = "typed_haxe_rest_settings_schema_plan";
	public static inline final ROUTE_UNKNOWN = "unknown";

	public static function ownedControllerBodies():Array<String>
	{
		return ["get_registered_options"];
	}

	public static function controllerBodyRoute(methodName:String):String
	{
		return contains(ownedControllerBodies(), methodName) ? ROUTE_TYPED_HAXE_SCHEMA_PLAN : ROUTE_UNKNOWN;
	}

	public static function ownsControllerBody(methodName:String):Bool
	{
		return controllerBodyRoute(methodName) == ROUTE_TYPED_HAXE_SCHEMA_PLAN;
	}

	public static function shouldExposeInRest(showInRestEmpty:Bool):Bool
	{
		return !showInRestEmpty;
	}

	public static function shouldUseRestArgs(showInRestIsArray:Bool):Bool
	{
		return showInRestIsArray;
	}

	public static function restName(customRestName:String, optionName:String):String
	{
		return customRestName == "" ? optionName : customRestName;
	}

	public static function schemaType(optionType:String):String
	{
		return optionType == "" ? "" : optionType;
	}

	public static function shouldSkipSchemaType(schemaType:String):Bool
	{
		return schemaType == "";
	}

	public static function isSupportedSchemaType(schemaType:String):Bool
	{
		return switch schemaType
		{
			case "number" | "integer" | "string" | "boolean" | "array" | "object":
				true;
			case _:
				false;
		}
	}

	public static function shouldDefaultAdditionalPropertiesToFalse(schemaType:String):Bool
	{
		return isSupportedSchemaType(schemaType);
	}

	public static function shouldReturnNullFromSanitize(isNullValue:Bool):Bool
	{
		return isNullValue;
	}

	public static function requiredCapability():String
	{
		return "manage_options";
	}

	static function contains(values:Array<String>, value:String):Bool
	{
		for (entry in values)
		{
			if (entry == value)
			{
				return true;
			}
		}
		return false;
	}
}
