package wphx.fixtures.wp.facade;

class GlobalFacadeEntry
{
	static function main():Void
	{
		GlobalBindings.addFilter("compile_check", null, 10, 1);
		GlobalBindings.applyFilters("compile_check", "value", []);
		GlobalBindings.wpArraySet({}, ["compile_check"], true);
		GlobalKernel.snapshotJson();
	}
}
