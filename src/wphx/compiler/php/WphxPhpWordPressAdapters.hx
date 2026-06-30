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
}
#end
