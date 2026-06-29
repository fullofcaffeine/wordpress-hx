package wphx.fixtures.compiler.php.pluggable;

import wphx.fixtures.compiler.php.pluggable.PluggableSurface.token;
import wphx.fixtures.compiler.php.pluggable.PluggableSurface.userId;

/**
	Compile anchor for the WPHX PHP pluggable timing fixture.
**/
class PluggableEntry
{
	static function main():Void
	{
		token("anchor");
		userId();
	}
}
