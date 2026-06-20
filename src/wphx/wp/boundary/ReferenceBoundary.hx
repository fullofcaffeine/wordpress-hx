package wphx.wp.boundary;

@:keep
class ReferenceBoundary
{
	public static function transformString(value:String, suffix:String):String
	{
		return value.toUpperCase() + suffix;
	}

	public static function initialStore():String
	{
		return "seed";
	}
}
