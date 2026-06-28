package wphx.wp.http;

using StringTools;

@:keep
function makeAbsoluteUrl(maybeRelativePath:String, baseScheme:String, baseHost:String, basePort:Null<Int>, basePath:String, basePathIsNonEmpty:Bool,
		relativeHasScheme:Bool, relativeHost:Null<String>, relativePort:Null<Int>, relativePath:String, relativePathIsNonEmpty:Bool, relativeQuery:String,
		relativeQueryIsNonEmpty:Bool, relativeFragment:String, relativeFragmentIsNonEmpty:Bool):String
{
	if (relativeHasScheme)
	{
		return maybeRelativePath;
	}

	var absolutePath = baseScheme + "://";
	if (relativeHost != null)
	{
		absolutePath += relativeHost;
		if (relativePort != null)
		{
			absolutePath += ":" + relativePort;
		}
	} else
	{
		absolutePath += baseHost;
		if (basePort != null)
		{
			absolutePath += ":" + basePort;
		}
	}

	var path = basePathIsNonEmpty ? basePath : "/";
	if (relativePathIsNonEmpty && relativePath.charAt(0) == "/")
	{
		path = relativePath;
	} else if (relativePathIsNonEmpty)
	{
		path = path.substr(0, path.lastIndexOf("/") + 1);
		path += relativePath;
		while (path.indexOf("../") > 1)
		{
			path = new EReg("[^/]+/\\.\\./", "").replace(path, "");
		}
		path = new EReg("^/(\\.\\./)+", "").replace(path, "");
	}

	if (relativeQueryIsNonEmpty)
	{
		path += "?" + relativeQuery;
	}
	if (relativeFragmentIsNonEmpty)
	{
		path += "#" + relativeFragment;
	}

	return absolutePath + "/" + trimLeadingSlashes(path);
}

function trimLeadingSlashes(value:String):String
{
	var index = 0;
	while (index < value.length && value.charAt(index) == "/")
	{
		index++;
	}
	return value.substr(index);
}
