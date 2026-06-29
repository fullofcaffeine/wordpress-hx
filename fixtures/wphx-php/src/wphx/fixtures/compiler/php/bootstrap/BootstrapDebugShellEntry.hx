package wphx.fixtures.compiler.php.bootstrap;

import wphx.fixtures.compiler.php.bootstrap.BootstrapDebugShellSurface.fail;

/**
	Compile anchor for the WPHX PHP bootstrap debug/stack-trace probe.
**/
class BootstrapDebugShellEntry
{
	static function main():Void
	{
		fail("entry");
	}
}
