package wphx.fixtures.compiler.php.wp;

/**
	Compile anchor for grouped WP_Http parser/header/cookie public shell emission.
**/
class HttpGroupedHelpersEntry
{
	static function main():Void
	{
		WpHttpGroupedHelpersShell.processResponse("HTTP/1.1 200 OK\r\n\r\nbody");
		WpHttpGroupedHelpersShell.chunkTransferDecode("4\r\nTest\r\n0");
		WpHttpGroupedHelpersShell.processHeaders("", "");
		// WPHX-211: compile anchor only; runtime PHP receives a native by-ref request array from the probe.
		WpHttpGroupedHelpersShell.buildCookieHeader(cast null);
	}
}
