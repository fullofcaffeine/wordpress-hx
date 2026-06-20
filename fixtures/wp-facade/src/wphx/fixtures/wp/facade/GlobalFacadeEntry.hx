package wphx.fixtures.wp.facade;

class GlobalFacadeEntry
{
	static function main():Void
	{
		GlobalBindings.addFilter("compile_check", null, 10, 1);
		// WPHX-211: Native PHP arrays are required to exercise variadic facade forwarding.
		GlobalBindings.applyFilters("compile_check", "value", php.Syntax.code("array()"));
		// WPHX-211: Native PHP arrays are required to exercise by-reference array wrappers.
		GlobalBindings.wpArraySet(php.Syntax.code("array()"), php.Syntax.code("array('compile_check')"), true);
		GlobalKernel.snapshotJson();
	}
}
