package wphx.wp.db;

using StringTools;

@:keep
class WpdbResultSelector
{
	public static inline final OUTPUT_OBJECT = "object";
	public static inline final OUTPUT_OBJECT_K = "object_k";
	public static inline final OUTPUT_ARRAY_A = "array_a";
	public static inline final OUTPUT_ARRAY_N = "array_n";
	public static inline final OUTPUT_INVALID = "invalid";

	public static function shouldReturnVarValue(valueIsSet:Bool, valueIsEmptyString:Bool):Bool
	{
		return valueIsSet && !valueIsEmptyString;
	}

	public static function rowOutputKind(output:String):String
	{
		if (isObjectOutput(output))
		{
			return OUTPUT_OBJECT;
		}
		if (output == "ARRAY_A")
		{
			return OUTPUT_ARRAY_A;
		}
		if (output == "ARRAY_N")
		{
			return OUTPUT_ARRAY_N;
		}
		return OUTPUT_INVALID;
	}

	public static function resultsOutputKind(output:String):String
	{
		if (output == "OBJECT")
		{
			return OUTPUT_OBJECT;
		}
		if (output == "OBJECT_K")
		{
			return OUTPUT_OBJECT_K;
		}
		if (output == "ARRAY_A")
		{
			return OUTPUT_ARRAY_A;
		}
		if (output == "ARRAY_N")
		{
			return OUTPUT_ARRAY_N;
		}
		if (isObjectOutput(output))
		{
			return OUTPUT_OBJECT;
		}
		return OUTPUT_INVALID;
	}

	public static function shouldKeepObjectKey(keyAlreadyExists:Bool):Bool
	{
		return !keyAlreadyExists;
	}

	static function isObjectOutput(output:String):Bool
	{
		return output == "OBJECT" || output.toUpperCase() == "OBJECT";
	}
}
