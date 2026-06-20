package wphx.fixtures.wp.debug;

@:keep
class DebugKernel
{
	public static function describe(token:String):String
	{
		return "debug:" + token;
	}

	public static function failWithToken(token:String):String
	{
		final decorated = token.toUpperCase();
		throw "WPHX-207:" + decorated;
	}
}
