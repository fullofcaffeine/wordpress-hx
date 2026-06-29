package wphx.fixtures.compiler.php.bootstrap;

import wphx.fixtures.compiler.php.bootstrap.BootstrapShellSurface.probeA;
import wphx.fixtures.compiler.php.bootstrap.BootstrapShellSurface.probeB;

/**
	Compile anchor for the WPHX PHP bootstrap include-path/autoload probe.
**/
class BootstrapShellEntry
{
	static function main():Void
	{
		probeA("anchor-a");
		probeB("anchor-b");
	}
}
