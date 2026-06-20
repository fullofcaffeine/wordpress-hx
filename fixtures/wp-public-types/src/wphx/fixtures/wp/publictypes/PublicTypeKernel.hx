package wphx.fixtures.wp.publictypes;

@:keep
class PublicTypeKernel
{
	public static function describe(prefix:String, name:String, metaCount:Int):String
	{
		final head = prefix == "" ? "" : prefix + ":";
		return head + name.toUpperCase() + ":" + metaCount;
	}

	public static function baseLabel(value:String):String
	{
		return "base:" + value;
	}

	public static function traitLabel(name:String, suffix:String):String
	{
		return "trait:" + name + optionalSuffix(suffix);
	}

	public static function namespacedDescribe(prefix:String, name:String):String
	{
		return prefix + ":" + name.toLowerCase();
	}

	public static function namespacedTraitLabel(name:String, suffix:String):String
	{
		return "ns-trait:" + name + optionalSuffix(suffix);
	}

	static function optionalSuffix(suffix:String):String
	{
		return suffix == "" ? "" : ":" + suffix;
	}
}
