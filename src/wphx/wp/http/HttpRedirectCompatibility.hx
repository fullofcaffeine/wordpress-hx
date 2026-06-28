package wphx.wp.http;

@:keep
function shouldUseBrowserGet(statusCode:Int):Bool
{
	return statusCode == 302;
}
