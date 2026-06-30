package wphx.fixtures.compiler.php.wp;

class HttpCookieEntry
{
	static function main():Void
	{
		final cookie = new WpHttpCookieShell("name=value");
		cookie.test("https://example.test/");
		cookie.getHeaderValue();
		cookie.getFullHeader();
		cookie.get_attributes();
	}
}
