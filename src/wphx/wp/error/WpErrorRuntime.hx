package wphx.wp.error;

@:keep
class WpErrorRuntime
{
	public static function shouldConstruct(codeIsEmpty:Bool):Bool
	{
		return !codeIsEmpty;
	}

	public static function hasErrors(errorCodeCount:Int):Bool
	{
		return errorCodeCount > 0;
	}

	public static function shouldStoreData(dataIsEmpty:Bool):Bool
	{
		return !dataIsEmpty;
	}

	public static function shouldUseDefaultCode(codeIsEmpty:Bool):Bool
	{
		return codeIsEmpty;
	}

	public static function shouldCarryPreviousData(hasCurrentData:Bool):Bool
	{
		return hasCurrentData;
	}

	public static function shouldAppendCurrentData(hasCurrentData:Bool):Bool
	{
		return hasCurrentData;
	}
}
