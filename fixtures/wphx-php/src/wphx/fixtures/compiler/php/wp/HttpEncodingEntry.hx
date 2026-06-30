package wphx.fixtures.compiler.php.wp;

class HttpEncodingEntry
{
	static function main():Void
	{
		WpHttpEncodingShell.compress("fixture");
		WpHttpEncodingShell.decompress("");
		WpHttpEncodingShell.compatible_gzinflate("");
		WpHttpEncodingShell.accept_encoding("https://example.test/", []);
		WpHttpEncodingShell.content_encoding();
		WpHttpEncodingShell.should_decode("");
		WpHttpEncodingShell.is_available();
	}
}
