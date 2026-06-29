package wphx.fixtures.compiler.php.facade;

/**
	Compile anchor for the WPHX PHP F4 public-class facade driver.
**/
class F4Entry
{
	static function main():Void
	{
		F4PublicClass.factory("compile_check").describe();
	}
}
