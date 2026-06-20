package wphx.fixtures.php.facade;

@:keep
class ClassKernel
{
	public static function describe(name:String, metaCount:Int):String
	{
		return name.toUpperCase() + ":" + metaCount;
	}

	public static function baseLabel(value:String):String
	{
		return "base:" + value;
	}
}
