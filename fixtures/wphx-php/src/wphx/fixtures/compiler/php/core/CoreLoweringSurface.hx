package wphx.fixtures.compiler.php.core;

/**
	Minimized public shell surface for reusable WPHX PHP statement lowering.
**/
@:wp.file("wp-includes/wphx-core-lowering.php")
@:native("WPHX_Core_Lowering")
@:wp.ifMissing
@:keep
class CoreLoweringSurface
{
	public function new() {}

	public function sumUntil(limit:Int, skip:Int):Int
	{
		var total = 0;
		var index = 0;
		while (index < limit)
		{
			index += 1;
			if (index == skip)
			{
				continue;
			}
			if (index > 5)
			{
				break;
			}
			total += index;
		}
		return total;
	}

	public static function describe(value:Int):String
	{
		if (value > 10)
		{
			return "large";
		}
		return "small";
	}
}

@:wp.file("wp-includes/wphx-core-lowering.php")
@:wp.global("wphx_core_lowering_count_until")
@:wp.ifMissing
@:keep
function countUntil(limit:Int):Int
{
	var count = 0;
	while (count < limit)
	{
		count += 1;
	}
	return count;
}
