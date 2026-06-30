package wphx.fixtures.compiler.php.wp;

class HttpResponseEntry
{
	static function main():Void
	{
		final response = new WpHttpResponseShell();
		response.get_data();
		response.set_data(null);
		response.get_headers();
		response.set_headers(null);
		response.header("X-Test", "yes");
		response.get_status();
		response.set_status(200);
		response.jsonSerialize();
	}
}
