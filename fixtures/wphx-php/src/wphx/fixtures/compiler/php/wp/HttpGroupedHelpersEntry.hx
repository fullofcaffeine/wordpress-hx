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
		WpHttpGroupedHelpersShell.is_ip_address("127.0.0.1");
		// WPHX-211: compile anchor only; runtime PHP receives a native by-ref options array from the probe.
		WpHttpGroupedHelpersShell.browser_redirect_compatibility(cast null, cast null, cast null, cast null, cast null);
		WpHttpGroupedHelpersShell.validate_redirects("https://valid.example/path");
		WpHttpGroupedHelpersShell.make_absolute_url("../img/logo.png", "https://example.test/wp-admin/css/edit.css");
		// WPHX-211: compile anchor only; runtime PHP receives a native by-ref request array from the probe.
		WpHttpGroupedHelpersShell.buildCookieHeader(cast null);
	}
}
