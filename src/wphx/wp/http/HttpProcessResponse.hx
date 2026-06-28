package wphx.wp.http;

/**
	WP_Http::processResponse string-splitting decisions that can be owned in Haxe
	while the public PHP shell preserves the native associative array return shape.
**/
@:keep
function responseHeaders(response:String):String
{
	final splitAt = response.indexOf("\r\n\r\n");
	return splitAt == -1 ? response : response.substr(0, splitAt);
}

@:keep
function responseBody(response:String):String
{
	final delimiter = "\r\n\r\n";
	final splitAt = response.indexOf(delimiter);
	return splitAt == -1 ? "" : response.substr(splitAt + delimiter.length);
}
