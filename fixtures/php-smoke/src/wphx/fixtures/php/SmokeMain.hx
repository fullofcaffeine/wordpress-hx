package wphx.fixtures.php;

import haxe.ds.Option;

typedef SmokeResult =
{
	final name:String;
	final count:Int;
	final joined:String;
	final assoc:String;
	final maybe:String;
};

class SmokeMain
{
	static final expectedName = "stock-haxe-php";

	static function main():Void
	{
		final result = run();
		Sys.println('wphx-php-smoke:${result.name}:${result.count}:${result.joined}:${result.assoc}:${result.maybe}');
	}

	public static function run():SmokeResult
	{
		final values = ["alpha", "beta", "gamma"];
		final lengths = new Map<String, Int>();

		for (value in values)
		{
			lengths.set(value, value.length);
		}

		final selected = values.filter((value) -> lengths.get(value) >= 5);
		final assoc = [
			for (value in selected)
			{
				'$value=${lengths.get(value)}';
			}
		].join(",");

		return {
			name: expectedName,
			count: values.length,
			joined: values.join("|"),
			assoc: assoc,
			maybe: switch parseWordPressishFlag("1")
			{
				case Some(enabled): enabled ? "enabled" : "disabled";
				case None: "missing";
			}
		};
	}

	static function parseWordPressishFlag(value:Null<String>):Option<Bool>
	{
		return switch value
		{
			case null | "": None;
			case "0" | "false" | "off": Some(false);
			default: Some(true);
		};
	}
}
