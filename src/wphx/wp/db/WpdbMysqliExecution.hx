package wphx.wp.db;

import haxe.extern.EitherType;
import wphx.wp.db.native.MysqliGlobal;
import wphx.wp.db.native.MysqliHandle;
import wphx.wp.db.native.MysqliResult;

@:keep
class WpdbMysqliExecution
{
	public static function query(handle:MysqliHandle, query:String):EitherType<MysqliResult, Bool>
	{
		return MysqliGlobal.query(handle, query);
	}

	public static function fetchObject(result:MysqliResult):Null<php.StdClass>
	{
		return MysqliGlobal.fetchObject(result);
	}
}
