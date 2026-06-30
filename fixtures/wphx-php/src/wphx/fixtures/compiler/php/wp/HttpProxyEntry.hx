package wphx.fixtures.compiler.php.wp;

class HttpProxyEntry
{
	static function main():Void
	{
		// WPHX-211: compile anchor only; runtime PHP constructs the public proxy object in the probe.
		final proxy:WpHttpProxyShell = cast null;
		proxy.is_enabled();
		proxy.use_authentication();
		proxy.host();
		proxy.port();
		proxy.username();
		proxy.password();
		proxy.authentication();
		proxy.authentication_header();
		proxy.send_through_proxy("https://example.test/");
	}
}
