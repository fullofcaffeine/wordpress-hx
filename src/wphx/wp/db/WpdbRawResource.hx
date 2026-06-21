package wphx.wp.db;

@:keep
class WpdbRawResource
{
	public static function shouldReadMysqliErrno(dbhIsMysqli:Bool):Bool
	{
		return dbhIsMysqli;
	}

	public static function invalidHandleErrno():Int
	{
		return WpdbNativeExecution.MYSQL_SERVER_GONE_AWAY;
	}

	public static function shouldReadMysqliError(dbhIsMysqli:Bool):Bool
	{
		return dbhIsMysqli;
	}

	public static function shouldReadAffectedRows(dbhIsMysqli:Bool, usesAffectedRows:Bool):Bool
	{
		return dbhIsMysqli && usesAffectedRows;
	}

	public static function shouldReadInsertId(dbhIsMysqli:Bool, storesInsertId:Bool):Bool
	{
		return dbhIsMysqli && storesInsertId;
	}
}
