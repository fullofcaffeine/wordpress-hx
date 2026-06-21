package wphx.wp.db;

using StringTools;

@:keep
class WpdbQueryState
{
	public static inline final KIND_DDL = "ddl";
	public static inline final KIND_WRITE = "write";
	public static inline final KIND_INSERT_OR_REPLACE = "insert_or_replace";
	public static inline final KIND_READ = "read";

	public static function shouldRunQuery(query:String):Bool
	{
		return query != "" && query != "0";
	}

	public static function queryKind(query:String):String
	{
		final keyword = firstKeyword(query);
		return switch keyword
		{
			case "create" | "alter" | "truncate" | "drop":
				KIND_DDL;
			case "insert" | "replace":
				KIND_INSERT_OR_REPLACE;
			case "delete" | "update":
				KIND_WRITE;
			case _:
				KIND_READ;
		}
	}

	public static function shouldReturnNativeResult(kind:String):Bool
	{
		return kind == KIND_DDL;
	}

	public static function shouldUseAffectedRows(kind:String):Bool
	{
		return kind == KIND_WRITE || kind == KIND_INSERT_OR_REPLACE;
	}

	public static function shouldStoreInsertId(kind:String):Bool
	{
		return kind == KIND_INSERT_OR_REPLACE;
	}

	public static function shouldClearInsertIdAfterError(currentInsertId:Int, kind:String):Bool
	{
		return currentInsertId != 0 && kind == KIND_INSERT_OR_REPLACE;
	}

	static function firstKeyword(query:String):String
	{
		final trimmed = query.ltrim();
		final end = keywordEnd(trimmed);
		return trimmed.substring(0, end).toLowerCase();
	}

	static function keywordEnd(value:String):Int
	{
		var end = 0;
		while (end < value.length)
		{
			final code = value.charCodeAt(end);
			final isLetter = (code >= "A".code && code <= "Z".code) || (code >= "a".code && code <= "z".code);
			if (!isLetter)
			{
				break;
			}
			end++;
		}
		return end;
	}
}
