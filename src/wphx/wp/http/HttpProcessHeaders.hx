package wphx.wp.http;

using StringTools;

/**
	WP_Http::processHeaders scalar line decisions for bounded Haxe ownership.
	PHP still owns native arrays, duplicate accumulation, cookies, and return shape.
**/
/**
	Identifies the status line that starts the final response header block after
	redirects, matching the upstream "non-empty and no colon" rule.
**/
@:keep
function startsFinalResponseBlock(line:String):Bool
{
	return line != "" && !isHeaderLine(line);
}

@:keep
function isHeaderLine(line:String):Bool
{
	return line.indexOf(":") != -1;
}

@:keep
function responseCode(line:String):Int
{
	final parts = responseParts(line);
	return parts.code == "" ? 0 : Std.parseInt(parts.code);
}

@:keep
function responseMessage(line:String):String
{
	return responseParts(line).message;
}

@:keep
function headerKey(line:String):String
{
	return line.substr(0, line.indexOf(":")).toLowerCase();
}

@:keep
function headerValue(line:String):String
{
	return line.substr(line.indexOf(":") + 1).trim();
}

/**
	Preserves the shape of PHP explode(' ', $line, 3): protocol, code, and the
	remaining message text, with missing fields defaulting to empty strings.
**/
function responseParts(line:String):ResponseLineParts
{
	final first = line.indexOf(" ");
	if (first == -1)
	{
		return {code: "", message: ""};
	}

	final afterProtocol = line.substr(first + 1);
	final second = afterProtocol.indexOf(" ");
	if (second == -1)
	{
		return {code: afterProtocol, message: ""};
	}

	return {
		code: afterProtocol.substr(0, second),
		message: afterProtocol.substr(second + 1)
	};
}

typedef ResponseLineParts =
{
	final code:String;
	final message:String;
};
