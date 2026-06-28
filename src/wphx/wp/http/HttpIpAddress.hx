package wphx.wp.http;

import haxe.extern.EitherType;

typedef IpAddressVersion = EitherType<Int, Bool>;

@:keep
function ipAddressVersion(maybeIp:String):IpAddressVersion
{
	if (matchesPhpRegex("/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/", maybeIp))
	{
		return 4;
	}

	if (maybeIp.indexOf(":") != -1
		&& matchesPhpRegex("/^(((?=.*(::))(?!.*\\3.+\\3))\\3?|([\\dA-F]{1,4}(\\3|:\\b|$)|\\2))(?4){5}((?4){2}|(((2[0-4]|1\\d|[1-9])?\\d|25[0-5])\\.?\\b){4})$/i",
			trimIpLiteral(maybeIp)))
	{
		return 6;
	}

	return false;
}

function trimIpLiteral(value:String):String
{
	var start = 0;
	var end = value.length;
	while (start < end && isIpTrimChar(value.charAt(start)))
	{
		start++;
	}
	while (end > start && isIpTrimChar(value.charAt(end - 1)))
	{
		end--;
	}
	return value.substring(start, end);
}

function isIpTrimChar(char:String):Bool
{
	return char == " " || char == "[" || char == "]";
}

function matchesPhpRegex(pattern:String, value:String):Bool
{
	// WPHX-211: WordPress' IPv6 helper uses PHP PCRE subroutine/backreference syntax that Haxe EReg does not model.
	return php.Syntax.code("1 === preg_match({0}, {1})", pattern, value);
}
