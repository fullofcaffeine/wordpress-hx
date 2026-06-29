package wphx.fixtures.compiler.php.facade;

import wphx.fixtures.compiler.php.facade.F1Shell.addFilter;

/**
	Compile anchor for the WPHX PHP F1 global-function facade driver.
**/
class F1Entry
{
	static function main():Void
	{
		addFilter("compile_check", null);
	}
}
