package wphx.wp.db;

@:keep
class WpdbMysqliCallGate
{
	public static function shouldCallQuery(shouldExecuteNativeQuery:Bool):Bool
	{
		return shouldExecuteNativeQuery;
	}

	public static function shouldFetchRows(shouldPopulateRows:Bool):Bool
	{
		return shouldPopulateRows;
	}
}
