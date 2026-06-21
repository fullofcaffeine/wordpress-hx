package wphx.wp.db;

@:keep
class WpdbRowTraversal
{
	public static function hasFetchedRow(rowWasFetched:Bool):Bool
	{
		return rowWasFetched;
	}

	public static function assignmentIndex(currentCount:Int):Int
	{
		return currentCount;
	}

	public static function nextFetchedRowCount(currentCount:Int):Int
	{
		return currentCount + 1;
	}
}
