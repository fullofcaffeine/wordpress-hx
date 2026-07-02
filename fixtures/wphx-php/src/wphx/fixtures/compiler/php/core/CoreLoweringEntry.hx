package wphx.fixtures.compiler.php.core;

import wphx.fixtures.compiler.php.core.CoreLoweringSurface.countUntil;

/**
	Compile anchor for the generic WPHX PHP typed statement-lowering fixture.
**/
class CoreLoweringEntry
{
	static function main():Void
	{
		final runner = new CoreLoweringSurface();
		runner.sumUntil(6, 3);
		countUntil(4);
	}
}
