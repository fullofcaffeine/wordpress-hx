package wphx.wp.http;

using StringTools;

@:keep
function isLocalRequest(requestHost:String, siteHost:String):Bool
{
	return requestHost == "localhost" || (siteHost != "" && requestHost == siteHost);
}

@:keep
function shouldBlockExternalHost(requestHost:String, accessibleHosts:String):Bool
{
	final hosts = parseAccessibleHosts(accessibleHosts);
	if (accessibleHosts.indexOf("*") != -1)
	{
		return !matchesWildcardHost(requestHost, hosts);
	}

	return !containsExact(hosts, requestHost);
}

function parseAccessibleHosts(accessibleHosts:String):Array<String>
{
	final result:Array<String> = [];
	for (part in accessibleHosts.split(","))
	{
		final trimmed = trimLeadingWhitespace(part);
		if (trimmed != "")
		{
			result.push(trimmed);
		}
	}
	return result;
}

function matchesWildcardHost(host:String, accessibleHosts:Array<String>):Bool
{
	for (accessibleHost in accessibleHosts)
	{
		if (wildcardPatternMatches(host, accessibleHost))
		{
			return true;
		}
	}
	return false;
}

function wildcardPatternMatches(host:String, pattern:String):Bool
{
	return new EReg("^" + wildcardToRegex(pattern) + "$", "i").match(host);
}

function wildcardToRegex(pattern:String):String
{
	final result = new StringBuf();
	for (index in 0...pattern.length)
	{
		final char = pattern.charAt(index);
		if (char == "*")
		{
			result.add(".+");
		} else
		{
			result.add(escapeRegexChar(char));
		}
	}
	return result.toString();
}

function escapeRegexChar(char:String):String
{
	return switch (char)
	{
		case "\\", "/", ".", "+", "?", "^", "$", "(", ")", "[", "]", "{", "}", "|":
			"\\" + char;
		default:
			char;
	}
}

function containsExact(values:Array<String>, host:String):Bool
{
	for (value in values)
	{
		if (value == host)
		{
			return true;
		}
	}
	return false;
}

function trimLeadingWhitespace(value:String):String
{
	var index = 0;
	while (index < value.length)
	{
		final code = value.charCodeAt(index);
		if (code != " ".code && code != "\t".code && code != "\n".code && code != "\r".code)
		{
			break;
		}
		index++;
	}
	return value.substr(index);
}
