package wphx.compiler.php;

#if (macro || reflaxe_runtime)
import wphx.compiler.php.WphxPhpCompiler.PhpCoreExpr;
import wphx.compiler.php.WphxPhpCompiler.PhpCoreStmt;

typedef WordPressMethodAdapterPlan =
{
	final features:Array<String>;
	final statements:Array<PhpCoreStmt>;
	final error:Null<String>;
}

/**
	WordPress-profile adapter plans for original-path public PHP compatibility.

	The compiler core owns PHP IR and printing. This profile module owns bounded
	WordPress ABI bodies that cannot yet be expressed as ordinary Haxe lowering
	without losing native PHP arrays, references, globals, or public exceptions.
**/
class WphxPhpWordPressAdapters
{
	public static function methodBody(adapter:String, fieldName:String, helper:Null<String>):Null<WordPressMethodAdapterPlan>
	{
		return switch (adapter)
		{
			case "wp-http-process-headers":
				processHeaders(fieldName, helper);
			case "wp-http-build-cookie-header":
				buildCookieHeader(fieldName, helper);
			case "wp-http-is-ip-address":
				isIpAddress(fieldName, helper);
			case "wp-http-browser-redirect-compatibility":
				browserRedirectCompatibility(fieldName, helper);
			case "wp-http-validate-redirects":
				validateRedirects(fieldName, helper);
			case "wp-http-make-absolute-url":
				makeAbsoluteUrl(fieldName, helper);
			case "wp-http-block-request":
				blockRequest(fieldName, helper);
			case _:
				null;
		}
	}

	static function missingHelper(message:String):WordPressMethodAdapterPlan
	{
		return {features: [], statements: [], error: message};
	}

	static function plan(features:Array<String>, statements:Array<PhpCoreStmt>):WordPressMethodAdapterPlan
	{
		return {features: features, statements: statements, error: null};
	}

	static function processHeaders(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::processHeaders adapter " + fieldName);
		}

		final headers = PhpVar("headers");
		final response = PhpVar("response");
		final newheaders = PhpVar("newheaders");
		final cookies = PhpVar("cookies");
		final tempheader = PhpVar("tempheader");
		final key = PhpVar("key");
		final value = PhpVar("value");
		final i = PhpVar("i");
		final headersAtI = PhpArrayRead(headers, i);
		final newHeaderAtKey = PhpArrayRead(newheaders, key);

		return plan([
			"stmt.if",
			"stmt.if-else",
			"stmt.for",
			"stmt.foreach",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"stmt.break",
			"stmt.continue",
			"expr.array-read",
			"expr.array-append",
			"expr.array-coerce",
			"expr.coerce-int",
			"expr.coerce-string",
			"expr.long-array",
			"expr.new",
			"expr.function-call",
			"expr.static-call",
			"expr.binop",
			"expr.assign"
		], [
			PhpIf(PhpFunctionCall("is_string", [headers]), [
				PhpAssign(headers, PhpFunctionCall("str_replace", [PhpString("\r\n"), PhpString("\n"), headers])),
				PhpAssign(headers, PhpFunctionCall("preg_replace", [PhpString("/\n[ \t]/"), PhpString(" "), headers])),
				PhpAssign(headers, PhpFunctionCall("explode", [PhpString("\n"), headers]))
			]),
			PhpLocal("response", PhpLongArray([
				{
					key: PhpString("code"),
					value: PhpInt(0)
				},
				{key: PhpString("message"), value: PhpString("")}
			])),
			PhpFor(PhpAssignExpr(i, PhpBinop("-", PhpFunctionCall("count", [headers]), PhpInt(1))), PhpBinop(">=", i, PhpInt(0)), PhpPostDecrement(i), [
				PhpIf(PhpBinop("&&", PhpNot(PhpFunctionCall("empty", [headersAtI])),
					PhpStaticCall(helper, "startsFinalResponseBlock", [PhpCastString(headersAtI)])),
					[PhpAssign(headers, PhpFunctionCall("array_splice", [headers, i])), PhpBreak])
			]),
			PhpLocal("cookies", PhpLongArray([])),
			PhpLocal("newheaders", PhpLongArray([])),
			PhpForeach(PhpCastArray(headers), "tempheader", [
				PhpIf(PhpFunctionCall("empty", [tempheader]), [PhpContinue]),
				PhpIf(PhpNot(PhpStaticCall(helper, "isHeaderLine", [PhpCastString(tempheader)])),
					[
						PhpAssign(PhpArrayRead(response, PhpString("code")), PhpStaticCall(helper, "responseCode", [PhpCastString(tempheader)])),
						PhpAssign(PhpArrayRead(response, PhpString("message")), PhpStaticCall(helper, "responseMessage", [PhpCastString(tempheader)])),
						PhpContinue
					]),
				PhpLocal("key", PhpStaticCall(helper, "headerKey", [PhpCastString(tempheader)])),
				PhpLocal("value", PhpStaticCall(helper, "headerValue", [PhpCastString(tempheader)])),
				PhpIfElse(PhpFunctionCall("isset", [newHeaderAtKey]), [
					PhpIf(PhpNot(PhpFunctionCall("is_array", [newHeaderAtKey])), [
						PhpAssign(newHeaderAtKey, PhpLongArray([
							{
								key: null,
								value: newHeaderAtKey
							}
						]))
					]),
					PhpAssign(PhpArrayAppend(newHeaderAtKey), value)
				], [PhpAssign(newHeaderAtKey, value)]),
				PhpIf(PhpBinop("===", PhpString("set-cookie"), key), [
					PhpAssign(PhpArrayAppend(cookies), PhpNew("WP_Http_Cookie", [value, PhpVar("url")]))
				])
			]),
			PhpAssign(PhpArrayRead(response, PhpString("code")), PhpCastInt(PhpArrayRead(response, PhpString("code")))),
			PhpReturn(PhpLongArray([
				{
					key: PhpString("response"),
					value: response
				},
				{key: PhpString("headers"), value: newheaders},
				{key: PhpString("cookies"), value: cookies}
			]))
		]);
	}

	static function buildCookieHeader(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::buildCookieHeader adapter " + fieldName);
		}

		final cookies = PhpArrayRead(PhpVar("r"), PhpString("cookies"));
		final headerTarget = PhpArrayRead(PhpArrayRead(PhpVar("r"), PhpString("headers")), PhpString("cookie"));
		return plan([
			"stmt.if",
			"stmt.foreach",
			"stmt.foreach-key-value",
			"stmt.assign",
			"stmt.var",
			"expr.array-read",
			"expr.array-write-target",
			"expr.array-coerce",
			"expr.long-array",
			"expr.new",
			"expr.function-call",
			"expr.method-call",
			"expr.static-call"
		], [
			PhpIf(PhpNot(PhpFunctionCall("empty", [cookies])), [
				PhpForeachKeyValue(cookies, "name", "value", [
					PhpIf(PhpNot(PhpFunctionCall("is_object", [PhpVar("value")])), [
						PhpAssign(PhpArrayRead(cookies, PhpVar("name")), PhpNew("WP_Http_Cookie", [
							PhpLongArray([
								{
									key: PhpString("name"),
									value: PhpVar("name")
								},
								{key: PhpString("value"), value: PhpVar("value")}
							])
						]))
					])
				]),
				PhpLocal("cookies_header", PhpString("")),
				PhpForeach(PhpCastArray(cookies), "cookie", [
					PhpAssign(PhpVar("cookies_header"),
						PhpStaticCall(helper, "appendCookieHeader", [PhpVar("cookies_header"), PhpMethodCall(PhpVar("cookie"), "getHeaderValue", [])]))
				]),
				PhpAssign(headerTarget, PhpVar("cookies_header"))
			])
		]);
	}

	static function browserRedirectCompatibility(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::browser_redirect_compatibility adapter " + fieldName);
		}

		return plan([
			"stmt.if",
			"stmt.assign",
			"expr.array-write-target",
			"expr.object-property",
			"expr.class-const",
			"expr.static-call",
			"expr.coerce-int"
		], [
			PhpIf(PhpStaticCall(helper, "shouldUseBrowserGet", [PhpCastInt(PhpObjectProperty(PhpVar("original"), "status_code"))]), [
				PhpAssign(PhpArrayRead(PhpVar("options"), PhpString("type")), PhpClassConst("\\WpOrg\\Requests\\Requests", "GET"))
			])
		]);
	}

	static function isIpAddress(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::is_ip_address adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.static-call", "expr.coerce-string"], [
			PhpReturn(PhpStaticCall(helper, "ipAddressVersion", [PhpCastString(PhpVar("maybe_ip"))]))
		]);
	}

	static function validateRedirects(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::validate_redirects adapter " + fieldName);
		}

		return plan([
			"stmt.if",
			"stmt.throw",
			"expr.coerce-bool",
			"expr.function-call",
			"expr.new",
			"expr.static-call"
		], [
			PhpIf(PhpStaticCall(helper, "shouldRejectRedirect", [PhpCastBool(PhpFunctionCall("wp_http_validate_url", [PhpVar("location")]))]), [
				PhpThrow(PhpNew("\\WpOrg\\Requests\\Exception", [
					PhpFunctionCall("__", [PhpString("A valid URL was not provided.")]),
					PhpString("wp_http.redirect_failed_validation")
				]))
			])
		]);
	}

	static function makeAbsoluteUrl(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::make_absolute_url adapter " + fieldName);
		}

		final maybeRelativePath = PhpVar("maybe_relative_path");
		final url = PhpVar("url");
		final urlParts = PhpVar("url_parts");
		final relativeUrlParts = PhpVar("relative_url_parts");
		final basePort = PhpVar("base_port");
		final relativeHost = PhpVar("relative_host");
		final relativePort = PhpVar("relative_port");
		return plan([
			"stmt.if",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"expr.array-read",
			"expr.coerce-bool",
			"expr.coerce-int",
			"expr.coerce-string",
			"expr.function-call",
			"expr.null",
			"expr.static-call"
		], [
			PhpIf(PhpFunctionCall("empty", [url]), [PhpReturn(maybeRelativePath)]),
			PhpLocal("url_parts", PhpFunctionCall("wp_parse_url", [url])),
			PhpIf(PhpNot(urlParts), [PhpReturn(maybeRelativePath)]),
			PhpLocal("relative_url_parts", PhpFunctionCall("wp_parse_url", [maybeRelativePath])),
			PhpIf(PhpNot(relativeUrlParts), [PhpReturn(maybeRelativePath)]),
			PhpLocal("base_scheme", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(urlParts, PhpString("scheme"))]), [
				PhpAssign(PhpVar("base_scheme"), PhpCastString(PhpArrayRead(urlParts, PhpString("scheme"))))
			]),
			PhpLocal("base_host", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(urlParts, PhpString("host"))]),
				[
					PhpAssign(PhpVar("base_host"), PhpCastString(PhpArrayRead(urlParts, PhpString("host"))))
				]),
			PhpLocal("base_port", PhpNull),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(urlParts, PhpString("port"))]),
				[PhpAssign(basePort, PhpCastInt(PhpArrayRead(urlParts, PhpString("port"))))]),
			PhpLocal("base_path", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(urlParts, PhpString("path"))]),
				[
					PhpAssign(PhpVar("base_path"), PhpCastString(PhpArrayRead(urlParts, PhpString("path"))))
				]),
			PhpLocal("base_path_present", PhpFunctionCall("empty", [PhpArrayRead(urlParts, PhpString("path"))])),
			PhpAssign(PhpVar("base_path_present"), PhpNot(PhpVar("base_path_present"))),
			PhpLocal("relative_has_scheme", PhpFunctionCall("empty", [PhpArrayRead(relativeUrlParts, PhpString("scheme"))])),
			PhpAssign(PhpVar("relative_has_scheme"), PhpNot(PhpVar("relative_has_scheme"))),
			PhpLocal("relative_host", PhpNull),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(relativeUrlParts, PhpString("host"))]), [
				PhpAssign(relativeHost, PhpCastString(PhpArrayRead(relativeUrlParts, PhpString("host"))))
			]),
			PhpLocal("relative_port", PhpNull),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(relativeUrlParts, PhpString("port"))]), [
				PhpAssign(relativePort, PhpCastInt(PhpArrayRead(relativeUrlParts, PhpString("port"))))
			]),
			PhpLocal("relative_path", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(relativeUrlParts, PhpString("path"))]),
				[
					PhpAssign(PhpVar("relative_path"), PhpCastString(PhpArrayRead(relativeUrlParts, PhpString("path"))))
				]),
			PhpLocal("relative_path_present", PhpFunctionCall("empty", [PhpArrayRead(relativeUrlParts, PhpString("path"))])),
			PhpAssign(PhpVar("relative_path_present"), PhpNot(PhpVar("relative_path_present"))),
			PhpLocal("relative_query", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(relativeUrlParts, PhpString("query"))]),
				[
					PhpAssign(PhpVar("relative_query"), PhpCastString(PhpArrayRead(relativeUrlParts, PhpString("query"))))
				]),
			PhpLocal("relative_query_present", PhpFunctionCall("empty", [PhpArrayRead(relativeUrlParts, PhpString("query"))])),
			PhpAssign(PhpVar("relative_query_present"), PhpNot(PhpVar("relative_query_present"))),
			PhpLocal("relative_fragment", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(relativeUrlParts, PhpString("fragment"))]),
				[
					PhpAssign(PhpVar("relative_fragment"), PhpCastString(PhpArrayRead(relativeUrlParts, PhpString("fragment"))))
				]),
			PhpLocal("relative_fragment_present", PhpFunctionCall("empty", [PhpArrayRead(relativeUrlParts, PhpString("fragment"))])),
			PhpAssign(PhpVar("relative_fragment_present"), PhpNot(PhpVar("relative_fragment_present"))),
			PhpReturn(PhpStaticCall(helper, "makeAbsoluteUrl", [
				PhpCastString(maybeRelativePath),
				PhpVar("base_scheme"),
				PhpVar("base_host"),
				basePort,
				PhpVar("base_path"),
				PhpCastBool(PhpVar("base_path_present")),
				PhpCastBool(PhpVar("relative_has_scheme")),
				relativeHost,
				relativePort,
				PhpVar("relative_path"),
				PhpCastBool(PhpVar("relative_path_present")),
				PhpVar("relative_query"),
				PhpCastBool(PhpVar("relative_query_present")),
				PhpVar("relative_fragment"),
				PhpCastBool(PhpVar("relative_fragment_present"))
			]))
		]);
	}

	static function blockRequest(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::block_request adapter " + fieldName);
		}

		final uri = PhpVar("uri");
		final check = PhpVar("check");
		final home = PhpVar("home");
		final requestHost = PhpVar("request_host");
		final siteHost = PhpVar("site_host");
		return plan([
			"stmt.if",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"expr.array-read",
			"expr.bool",
			"expr.coerce-string",
			"expr.function-call",
			"expr.static-call",
			"expr.binop"
		], [
			PhpIf(PhpBinop("||", PhpNot(PhpFunctionCall("defined", [PhpString("WP_HTTP_BLOCK_EXTERNAL")])),
				PhpNot(PhpFunctionCall("constant", [PhpString("WP_HTTP_BLOCK_EXTERNAL")]))),
				[PhpReturn(PhpBool(false))]),
			PhpLocal("check", PhpFunctionCall("parse_url", [uri])),
			PhpIf(PhpNot(check), [PhpReturn(PhpBool(true))]),
			PhpLocal("home", PhpFunctionCall("parse_url", [PhpFunctionCall("get_option", [PhpString("siteurl")])])),
			PhpLocal("request_host", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(check, PhpString("host"))]),
				[PhpAssign(requestHost, PhpCastString(PhpArrayRead(check, PhpString("host"))))]),
			PhpLocal("site_host", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(home, PhpString("host"))]),
				[PhpAssign(siteHost, PhpCastString(PhpArrayRead(home, PhpString("host"))))]),
			PhpIf(PhpStaticCall(helper, "isLocalRequest", [requestHost, siteHost]),
				[
					PhpReturn(PhpFunctionCall("apply_filters", [PhpString("block_local_requests"), PhpBool(false)]))
				]),
			PhpIf(PhpNot(PhpFunctionCall("defined", [PhpString("WP_ACCESSIBLE_HOSTS")])), [PhpReturn(PhpBool(true))]),
			PhpReturn(PhpStaticCall(helper, "shouldBlockExternalHost", [
				requestHost,
				PhpCastString(PhpFunctionCall("constant", [PhpString("WP_ACCESSIBLE_HOSTS")]))
			]))
		]);
	}
}
#end
