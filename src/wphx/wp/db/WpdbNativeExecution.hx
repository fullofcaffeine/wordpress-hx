package wphx.wp.db;

@:keep
class WpdbNativeExecution
{
	public static inline final MYSQL_SERVER_GONE_AWAY = 2006;

	public static function shouldCaptureQueryLog(saveQueriesEnabled:Bool):Bool
	{
		return saveQueriesEnabled;
	}

	public static function shouldExecuteNativeQuery(dbhPresent:Bool):Bool
	{
		return dbhPresent;
	}

	public static function nextQueryCount(currentCount:Int):Int
	{
		return currentCount + 1;
	}

	public static function shouldAttemptReconnect(dbhIsEmpty:Bool, mysqlErrno:Int):Bool
	{
		return dbhIsEmpty || mysqlErrno == MYSQL_SERVER_GONE_AWAY;
	}
}
