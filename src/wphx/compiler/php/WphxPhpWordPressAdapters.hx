package wphx.compiler.php;

#if (macro || reflaxe_runtime)
import wphx.compiler.php.WphxPhpCompiler.PhpCoreArrayEntry;
import wphx.compiler.php.WphxPhpCompiler.PhpCoreExpr;
import wphx.compiler.php.WphxPhpCompiler.PhpCoreStmt;

typedef WordPressAdapterTemplateProvenance =
{
	final adapter:String;
	final path:String;
	final sha256:String;
	final placeholders:Array<String>;
	final ownership:String;
	final upstream_ref:String;
}

typedef WordPressAdapterHelpers =
{
	final primary:Null<String>;
	final named:Map<String, String>;
}

typedef WordPressMethodAdapterPlan =
{
	final features:Array<String>;
	final statements:Array<PhpCoreStmt>;
	final error:Null<String>;
	final templates:Array<WordPressAdapterTemplateProvenance>;
}

/**
	WordPress-profile adapter plans for original-path public PHP compatibility.

	The compiler core owns PHP IR and printing. This profile module owns bounded
	WordPress ABI bodies that cannot yet be expressed as ordinary Haxe lowering
	without losing native PHP arrays, references, globals, or public exceptions.
**/
class WphxPhpWordPressAdapters
{
	public static function methodBody(adapter:String, fieldName:String, helpers:WordPressAdapterHelpers):Null<WordPressMethodAdapterPlan>
	{
		return switch (adapter)
		{
			case "wp-http-process-headers":
				processHeaders(fieldName, primaryHelper(helpers));
			case "wp-http-build-cookie-header":
				buildCookieHeader(fieldName, primaryHelper(helpers));
			case "wp-http-is-ip-address":
				isIpAddress(fieldName, primaryHelper(helpers));
			case "wp-http-browser-redirect-compatibility":
				browserRedirectCompatibility(fieldName, primaryHelper(helpers));
			case "wp-http-validate-redirects":
				validateRedirects(fieldName, primaryHelper(helpers));
			case "wp-http-make-absolute-url":
				makeAbsoluteUrl(fieldName, primaryHelper(helpers));
			case "wp-http-block-request":
				blockRequest(fieldName, primaryHelper(helpers));
			case "wp-http-handle-redirects":
				handleRedirects(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-compress":
				encodingCompress(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-decompress":
				encodingDecompress(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-compatible-gzinflate":
				encodingCompatibleGzinflate(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-accept-encoding":
				encodingAcceptEncoding(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-content-encoding":
				encodingContentEncoding(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-should-decode":
				encodingShouldDecode(fieldName, primaryHelper(helpers));
			case "wp-http-encoding-is-available":
				encodingIsAvailable(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-is-enabled":
				proxyIsEnabled(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-use-authentication":
				proxyUseAuthentication(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-constant":
				proxyConstant(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-authentication":
				proxyAuthentication(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-authentication-header":
				proxyAuthenticationHeader(fieldName, primaryHelper(helpers));
			case "wp-http-proxy-send-through-proxy":
				proxySendThroughProxy(fieldName, primaryHelper(helpers));
			case "wp-http-response-construct":
				responseConstruct(fieldName, primaryHelper(helpers));
			case "wp-http-response-get-data":
				responseGetData(fieldName, primaryHelper(helpers));
			case "wp-http-response-set-data":
				responseSetData(fieldName, primaryHelper(helpers));
			case "wp-http-response-get-headers":
				responseGetHeaders(fieldName, primaryHelper(helpers));
			case "wp-http-response-set-headers":
				responseSetHeaders(fieldName, primaryHelper(helpers));
			case "wp-http-response-header":
				responseHeader(fieldName, primaryHelper(helpers));
			case "wp-http-response-get-status":
				responseGetStatus(fieldName, primaryHelper(helpers));
			case "wp-http-response-set-status":
				responseSetStatus(fieldName, primaryHelper(helpers));
			case "wp-http-response-json-serialize":
				responseJsonSerialize(fieldName, primaryHelper(helpers));
			case "wp-http-cookie-construct":
				cookieConstruct(fieldName, primaryHelper(helpers));
			case "wp-http-cookie-test":
				cookieTest(fieldName, primaryHelper(helpers));
			case "wp-http-cookie-get-header-value":
				cookieGetHeaderValue(fieldName, primaryHelper(helpers));
			case "wp-http-cookie-get-full-header":
				cookieGetFullHeader(fieldName, primaryHelper(helpers));
			case "wp-http-cookie-get-attributes":
				cookieGetAttributes(fieldName, primaryHelper(helpers));
			case "wp-http-normalize-cookies":
				normalizeCookies(fieldName);
			case "wp-http-transport-get-first-available":
				transportGetFirstAvailable(fieldName, primaryHelper(helpers));
			case "wp-http-transport-dispatch-request":
				transportDispatchRequest(fieldName, primaryHelper(helpers));
			case "wp-http-request-nonblocking":
				requestNonblocking(fieldName, helpers);
			case _:
				null;
		}
	}

	static function primaryHelper(helpers:WordPressAdapterHelpers):Null<String>
	{
		return helpers.primary;
	}

	static function namedHelper(helpers:WordPressAdapterHelpers, name:String):Null<String>
	{
		return helpers.named.exists(name) ? helpers.named.get(name) : null;
	}

	static function missingHelper(message:String):WordPressMethodAdapterPlan
	{
		return {
			features: [],
			statements: [],
			error: message,
			templates: []
		};
	}

	static function plan(features:Array<String>, statements:Array<PhpCoreStmt>, ?templates:Array<WordPressAdapterTemplateProvenance>):WordPressMethodAdapterPlan
	{
		return {
			features: features,
			statements: statements,
			error: null,
			templates: templates == null ? [] : templates
		};
	}

	static function item(value:PhpCoreExpr):PhpCoreArrayEntry
	{
		return {key: null, value: value};
	}

	static function entry(key:String, value:PhpCoreExpr):PhpCoreArrayEntry
	{
		return {key: PhpString(key), value: value};
	}

	static function read(base:PhpCoreExpr, key:String):PhpCoreExpr
	{
		return PhpArrayRead(base, PhpString(key));
	}

	static function normalizeCookies(fieldName:String):WordPressMethodAdapterPlan
	{
		final cookies = PhpVar("cookies");
		final cookieJar = PhpVar("cookie_jar");
		final name = PhpVar("name");
		final value = PhpVar("value");

		return plan([
			"stmt.foreach-key-value",
			"stmt.if-else",
			"stmt.var",
			"stmt.assign",
			"stmt.return",
			"expr.instanceof",
			"expr.array-read",
			"expr.long-array",
			"expr.object-property",
			"expr.new",
			"expr.method-call",
			"expr.function-call",
			"expr.static-closure",
			"expr.cast-string"
		], [
			PhpLocal("cookie_jar", PhpNew("WpOrg\\Requests\\Cookie\\Jar", [])),
			PhpForeachKeyValue(cookies, "name", "value", [
				PhpIfElse(PhpInstanceOf(value, "WP_Http_Cookie"), [
					PhpLocal("attributes", PhpFunctionCall("array_filter", [
						PhpMethodCall(value, "get_attributes", []),
						PhpStaticClosure(["attr"], [PhpReturn(PhpBinop("!==", PhpNull, PhpVar("attr")))])
					])),
					PhpAssign(PhpArrayRead(cookieJar, PhpObjectProperty(value, "name")), PhpNew("WpOrg\\Requests\\Cookie", [
						PhpCastString(PhpObjectProperty(value, "name")),
						PhpObjectProperty(value, "value"),
						PhpVar("attributes"),
						PhpLongArray([entry("host-only", PhpObjectProperty(value, "host_only"))])
					]))
				], [
					PhpIf(PhpFunctionCall("is_scalar", [value]), [
						PhpAssign(PhpArrayRead(cookieJar, name), PhpNew("WpOrg\\Requests\\Cookie", [PhpCastString(name), PhpCastString(value)]))
					])
				])
			]),
			PhpReturn(cookieJar)
		]);
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

	static function handleRedirects(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::handle_redirects adapter " + fieldName);
		}

		final url = PhpVar("url");
		final args = PhpVar("args");
		final response = PhpVar("response");
		final responseCode = PhpVar("response_code");
		final redirectLocation = PhpVar("redirect_location");
		final cookies = PhpArrayRead(response, PhpString("cookies"));
		final argsCookies = PhpArrayRead(args, PhpString("cookies"));
		return plan([
			"stmt.if",
			"stmt.foreach",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"expr.array-read",
			"expr.array-append",
			"expr.bool",
			"expr.coerce-int",
			"expr.coerce-string",
			"expr.function-call",
			"expr.method-call",
			"expr.new",
			"expr.static-call",
			"expr.binop"
		], [
			PhpLocal("response_code", PhpCastInt(PhpArrayRead(PhpArrayRead(response, PhpString("response")), PhpString("code")))),
			PhpIf(PhpStaticCall(helper, "shouldShortCircuit", [
				PhpFunctionCall("isset",
					[
						PhpArrayRead(PhpArrayRead(response, PhpString("headers")), PhpString("location"))
					]),
				PhpCastInt(PhpArrayRead(args, PhpString("_redirection"))),
				responseCode
			]),
				[PhpReturn(PhpBool(false))]),
			PhpIf(PhpStaticCall(helper, "isTooManyRedirects", [PhpCastInt(PhpArrayRead(args, PhpString("redirection")))]),
				[
					PhpReturn(PhpNew("WP_Error",
						[
							PhpString("http_request_failed"),
							PhpFunctionCall("__", [PhpString("Too many redirects.")])
						]))
				]),
			PhpAssign(PhpArrayRead(args, PhpString("redirection")), PhpBinop("-", PhpArrayRead(args, PhpString("redirection")), PhpInt(1))),
			PhpLocal("redirect_location", PhpArrayRead(PhpArrayRead(response, PhpString("headers")), PhpString("location"))),
			PhpIf(PhpFunctionCall("is_array", [redirectLocation]), [PhpAssign(redirectLocation, PhpFunctionCall("array_pop", [redirectLocation]))]),
			PhpAssign(redirectLocation, PhpStaticCall("self", "make_absolute_url", [redirectLocation, url])),
			PhpIf(PhpStaticCall(helper, "shouldSwitchPostRedirectToGet", [PhpCastString(PhpArrayRead(args, PhpString("method"))), responseCode]),
				[PhpAssign(PhpArrayRead(args, PhpString("method")), PhpString("GET"))]),
			PhpIf(PhpNot(PhpFunctionCall("empty", [cookies])), [
				PhpForeach(cookies, "cookie", [
					PhpIf(PhpMethodCall(PhpVar("cookie"), "test", [redirectLocation]), [PhpAssign(PhpArrayAppend(argsCookies), PhpVar("cookie"))])
				])
			]),
			PhpReturn(PhpFunctionCall("wp_remote_request", [redirectLocation, args]))
		]);
	}

	static function encodingCompress(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::compress adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.coerce-int", "expr.coerce-string", "expr.static-call"], [
			PhpReturn(PhpStaticCall(helper, "compress", [PhpCastString(PhpVar("raw")), PhpCastInt(PhpVar("level"))]))
		]);
	}

	static function encodingDecompress(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::decompress adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.coerce-string", "expr.static-call"], [
			PhpReturn(PhpStaticCall(helper, "decompress", [PhpCastString(PhpVar("compressed"))]))
		]);
	}

	static function encodingCompatibleGzinflate(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::compatible_gzinflate adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.coerce-string", "expr.static-call"], [
			PhpReturn(PhpStaticCall(helper, "compatibleGzinflate", [PhpCastString(PhpVar("gz_data"))]))
		]);
	}

	static function encodingAcceptEncoding(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::accept_encoding adapter " + fieldName);
		}

		final type = PhpVar("type");
		final args = PhpVar("args");
		final compressionEnabled = PhpVar("compression_enabled");
		return plan([
			"stmt.if",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"expr.array-read",
			"expr.array-append",
			"expr.bool",
			"expr.function-call",
			"expr.long-array",
			"expr.static-call"
		], [
			PhpLocal("type", PhpLongArray([])),
			PhpLocal("compression_enabled", PhpStaticCall(helper, "isAvailable", [])),
			PhpIf(PhpNot(PhpArrayRead(args, PhpString("decompress"))), [PhpAssign(compressionEnabled, PhpBool(false))]),
			PhpIf(PhpArrayRead(args, PhpString("stream")), [PhpAssign(compressionEnabled, PhpBool(false))]),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(args, PhpString("limit_response_size"))]), [PhpAssign(compressionEnabled, PhpBool(false))]),
			PhpIf(compressionEnabled,
				[
					PhpIf(PhpFunctionCall("function_exists", [PhpString("gzinflate")]), [PhpAssign(PhpArrayAppend(type), PhpString("deflate;q=1.0"))]),
					PhpIf(PhpFunctionCall("function_exists", [PhpString("gzuncompress")]), [PhpAssign(PhpArrayAppend(type), PhpString("compress;q=0.5"))]),
					PhpIf(PhpFunctionCall("function_exists", [PhpString("gzdecode")]), [PhpAssign(PhpArrayAppend(type), PhpString("gzip;q=0.5"))])
				]),
			PhpAssign(type, PhpFunctionCall("apply_filters", [PhpString("wp_http_accept_encoding"), type, PhpVar("url"), args])),
			PhpReturn(PhpFunctionCall("implode", [PhpString(", "), type]))
		]);
	}

	static function encodingContentEncoding(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::content_encoding adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.static-call"], [PhpReturn(PhpStaticCall(helper, "contentEncoding", []))]);
	}

	static function encodingShouldDecode(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::should_decode adapter " + fieldName);
		}

		return plan([
			"stmt.if",
			"stmt.return",
			"expr.bool",
			"expr.coerce-string",
			"expr.function-call",
			"expr.static-call"
		], [
			PhpIf(PhpFunctionCall("is_array", [PhpVar("headers")]), [
				PhpReturn(PhpStaticCall(helper, "shouldDecodeFromNativeHeaders", [PhpVar("headers")]))
			]),
			PhpIf(PhpFunctionCall("is_string", [PhpVar("headers")]), [
				PhpReturn(PhpStaticCall(helper, "shouldDecodeFromString", [PhpCastString(PhpVar("headers"))]))
			]),
			PhpReturn(PhpBool(false))
		]);
	}

	static function encodingIsAvailable(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Encoding::is_available adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.static-call"], [PhpReturn(PhpStaticCall(helper, "isAvailable", []))]);
	}

	static function proxyIsEnabled(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return plan(["stmt.return", "expr.bool", "expr.function-call"], [
			PhpReturn(PhpBinop("&&", PhpFunctionCall("defined", [PhpString("WP_PROXY_HOST")]), PhpFunctionCall("defined", [PhpString("WP_PROXY_PORT")])))
		]);
	}

	static function proxyUseAuthentication(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return plan(["stmt.return", "expr.bool", "expr.function-call"], [
			PhpReturn(PhpBinop("&&", PhpFunctionCall("defined", [PhpString("WP_PROXY_USERNAME")]),
				PhpFunctionCall("defined", [PhpString("WP_PROXY_PASSWORD")])))
		]);
	}

	static function proxyConstant(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		final constantName = switch (fieldName)
		{
			case "host":
				"WP_PROXY_HOST";
			case "port":
				"WP_PROXY_PORT";
			case "username":
				"WP_PROXY_USERNAME";
			case "password":
				"WP_PROXY_PASSWORD";
			case _:
				return missingHelper("unsupported WP_HTTP_Proxy constant adapter field " + fieldName);
		}

		return plan(["stmt.if", "stmt.return", "expr.coerce-string", "expr.function-call"], [
			PhpIf(PhpFunctionCall("defined", [PhpString(constantName)]), [PhpReturn(PhpCastString(PhpFunctionCall("constant", [PhpString(constantName)])))]),
			PhpReturn(PhpString(""))
		]);
	}

	static function proxyAuthentication(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		final self = PhpVar("this");
		return plan(["stmt.return", "expr.method-call", "expr.string"], [
			PhpReturn(PhpBinop(".", PhpBinop(".", PhpMethodCall(self, "username", []), PhpString(":")), PhpMethodCall(self, "password", [])))
		]);
	}

	static function proxyAuthenticationHeader(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return plan(["stmt.return", "expr.function-call", "expr.method-call", "expr.string"], [
			PhpReturn(PhpBinop(".", PhpString("Proxy-Authorization: Basic "),
				PhpFunctionCall("base64_encode", [PhpMethodCall(PhpVar("this"), "authentication", [])])))
		]);
	}

	static function proxySendThroughProxy(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_HTTP_Proxy::send_through_proxy adapter " + fieldName);
		}

		final check = PhpVar("check");
		final home = PhpVar("home");
		final result = PhpVar("result");
		final requestHost = PhpVar("request_host");
		final siteHost = PhpVar("site_host");
		final bypassHosts = PhpVar("bypass_hosts");
		return plan([
			"stmt.if",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"expr.array-read",
			"expr.bool",
			"expr.coerce-string",
			"expr.function-call",
			"expr.static-call"
		], [
			PhpLocal("check", PhpFunctionCall("parse_url", [PhpVar("uri")])),
			PhpIf(PhpBinop("===", PhpBool(false), check), [PhpReturn(PhpBool(true))]),
			PhpLocal("home", PhpFunctionCall("parse_url", [PhpFunctionCall("get_option", [PhpString("siteurl")])])),
			PhpLocal("result", PhpFunctionCall("apply_filters", [PhpString("pre_http_send_through_proxy"), PhpNull, PhpVar("uri"), check, home])),
			PhpIf(PhpNot(PhpFunctionCall("is_null", [result])), [PhpReturn(result)]),
			PhpLocal("request_host", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(check, PhpString("host"))]),
				[PhpAssign(requestHost, PhpCastString(PhpArrayRead(check, PhpString("host"))))]),
			PhpLocal("site_host", PhpString("")),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(home, PhpString("host"))]),
				[PhpAssign(siteHost, PhpCastString(PhpArrayRead(home, PhpString("host"))))]),
			PhpLocal("bypass_hosts", PhpString("")),
			PhpIf(PhpFunctionCall("defined", [PhpString("WP_PROXY_BYPASS_HOSTS")]), [
				PhpAssign(bypassHosts, PhpCastString(PhpFunctionCall("constant", [PhpString("WP_PROXY_BYPASS_HOSTS")])))
			]),
			PhpReturn(PhpStaticCall(helper, "shouldSendThroughProxy", [requestHost, siteHost, bypassHosts]))
		]);
	}

	static function responseConstruct(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_HTTP_Response::__construct adapter " + fieldName);
		}

		return plan(["stmt.expr", "expr.static-call"], [
			PhpExprStmt(PhpStaticCall(helper, "initialize", [PhpVar("this"), PhpVar("data"), PhpVar("status"), PhpVar("headers")]))
		]);
	}

	static function responseGetData(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseReturnHelper(fieldName, helper, "getData");
	}

	static function responseSetData(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseSetHelper(fieldName, helper, "setData", PhpVar("data"));
	}

	static function responseGetHeaders(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseReturnHelper(fieldName, helper, "getHeaders");
	}

	static function responseSetHeaders(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseSetHelper(fieldName, helper, "setHeaders", PhpVar("headers"));
	}

	static function responseHeader(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_HTTP_Response::header adapter " + fieldName);
		}

		return plan(["stmt.expr", "expr.coerce-bool", "expr.coerce-string", "expr.static-call"], [
			PhpExprStmt(PhpStaticCall(helper, "header", [
				PhpVar("this"),
				PhpCastString(PhpVar("key")),
				PhpCastString(PhpVar("value")),
				PhpCastBool(PhpVar("replace"))
			]))
		]);
	}

	static function responseGetStatus(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseReturnHelper(fieldName, helper, "getStatus");
	}

	static function responseSetStatus(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseSetHelper(fieldName, helper, "setStatus", PhpVar("code"));
	}

	static function responseJsonSerialize(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return responseReturnHelper(fieldName, helper, "jsonSerialize");
	}

	static function responseReturnHelper(fieldName:String, helper:Null<String>, method:String):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_HTTP_Response::" + fieldName + " adapter");
		}

		return plan(["stmt.return", "expr.static-call"], [PhpReturn(PhpStaticCall(helper, method, [PhpVar("this")]))]);
	}

	static function responseSetHelper(fieldName:String, helper:Null<String>, method:String, value:PhpCoreExpr):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_HTTP_Response::" + fieldName + " adapter");
		}

		return plan(["stmt.expr", "expr.static-call"], [PhpExprStmt(PhpStaticCall(helper, method, [PhpVar("this"), value]))]);
	}

	static function cookieConstruct(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		final data = PhpVar("data");
		final requestedUrl = PhpVar("requested_url");
		final parsedUrl = PhpVar("parsed_url");
		final pairs = PhpVar("pairs");
		final pair = PhpVar("pair");
		final key = PhpVar("key");
		final val = PhpVar("val");
		final field = PhpVar("field");
		final thisValue = PhpVar("this");
		final path = PhpObjectProperty(thisValue, "path");
		final expires = PhpObjectProperty(thisValue, "expires");
		final dataName = PhpArrayRead(data, PhpString("name"));
		final dataExpires = PhpArrayRead(data, PhpString("expires"));

		return plan([
			"stmt.if",
			"stmt.if-else",
			"stmt.foreach",
			"stmt.assign",
			"stmt.list-assign",
			"stmt.var",
			"stmt.return-void",
			"expr.array-read",
			"expr.long-array",
			"expr.object-property",
			"expr.dynamic-object-property",
			"expr.null-coalesce",
			"expr.ternary",
			"expr.function-call",
			"expr.binop"
		], [
			PhpIf(requestedUrl, [PhpLocal("parsed_url", PhpFunctionCall("parse_url", [requestedUrl]))]),
			PhpIf(PhpFunctionCall("isset", [PhpArrayRead(parsedUrl, PhpString("host"))]),
				[
					PhpAssign(PhpObjectProperty(thisValue, "domain"), PhpArrayRead(parsedUrl, PhpString("host")))
				]),
			PhpAssign(path, PhpNullCoalesce(PhpArrayRead(parsedUrl, PhpString("path")), PhpString("/"))),
			PhpIf(PhpNot(PhpFunctionCall("str_ends_with", [path, PhpString("/")])), [
				PhpAssign(path, PhpBinop(".", PhpFunctionCall("dirname", [path]), PhpString("/")))
			]),
			PhpIfElse(PhpFunctionCall("is_string", [data]), [
				PhpLocal("pairs", PhpFunctionCall("explode", [PhpString(";"), data])),
				PhpLocal("name", PhpFunctionCall("trim", [
					PhpFunctionCall("substr", [
						PhpArrayRead(pairs, PhpInt(0)),
						PhpInt(0),
						PhpFunctionCall("strpos", [PhpArrayRead(pairs, PhpInt(0)), PhpString("=")])
					])
				])),
				PhpLocal("value",
					PhpFunctionCall("substr",
						[
							PhpArrayRead(pairs, PhpInt(0)),
							PhpBinop("+", PhpFunctionCall("strpos", [PhpArrayRead(pairs, PhpInt(0)), PhpString("=")]), PhpInt(1))
						])),
				PhpAssign(PhpObjectProperty(thisValue, "name"), PhpVar("name")),
				PhpAssign(PhpObjectProperty(thisValue, "value"), PhpFunctionCall("urldecode", [PhpVar("value")])),
				PhpExprStmt(PhpFunctionCall("array_shift", [pairs])),
				PhpForeach(pairs, "pair", [
					PhpAssign(pair, PhpFunctionCall("rtrim", [pair])),
					PhpIf(PhpFunctionCall("empty", [pair]), [PhpContinue]),
					PhpListAssign(["key", "val"],
						PhpTernary(PhpFunctionCall("strpos", [pair, PhpString("=")]), PhpFunctionCall("explode", [PhpString("="), pair]),
							PhpLongArray([
								{
									key: null,
									value: pair
								},
								{key: null, value: PhpString("")}
							]))),
					PhpAssign(key, PhpFunctionCall("strtolower", [PhpFunctionCall("trim", [key])])),
					PhpIf(PhpBinop("===", PhpString("expires"), key), [PhpAssign(val, PhpFunctionCall("strtotime", [val]))]),
					PhpAssign(PhpDynamicObjectProperty(thisValue, key), val)
				])
			], [
				PhpIf(PhpNot(PhpFunctionCall("isset", [dataName])), [PhpReturnVoid]),
				PhpForeach(PhpLongArray([
					{
						key: null,
						value: PhpString("name")
					},
					{key: null, value: PhpString("value")},
					{key: null, value: PhpString("path")},
					{key: null, value: PhpString("domain")},
					{key: null, value: PhpString("port")},
					{key: null, value: PhpString("host_only")}
				]), "field", [
					PhpIf(PhpFunctionCall("isset", [PhpArrayRead(data, field)]),
						[PhpAssign(PhpDynamicObjectProperty(thisValue, field), PhpArrayRead(data, field))])
				]),
				PhpIfElse(PhpFunctionCall("isset", [dataExpires]), [
					PhpAssign(expires, PhpTernary(PhpFunctionCall("is_int", [dataExpires]), dataExpires, PhpFunctionCall("strtotime", [dataExpires])))
				], [PhpAssign(expires, PhpNull)])
			])
		]);
	}

	static function cookieTest(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Cookie::test adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.coerce-string", "expr.static-call"], [
			PhpReturn(PhpStaticCall(helper, "test", [PhpVar("this"), PhpCastString(PhpVar("url"))]))
		]);
	}

	static function cookieGetHeaderValue(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Cookie::getHeaderValue adapter " + fieldName);
		}

		return plan([
			"stmt.if",
			"stmt.var",
			"stmt.return",
			"expr.object-property",
			"expr.static-call",
			"expr.function-call",
			"expr.string"
		], [
			PhpIf(PhpNot(PhpStaticCall(helper, "hasHeaderFields", [PhpVar("this")])), [PhpReturn(PhpString(""))]),
			PhpLocal("filtered", PhpFunctionCall("apply_filters", [
				PhpString("wp_http_cookie_value"),
				PhpObjectProperty(PhpVar("this"), "value"),
				PhpObjectProperty(PhpVar("this"), "name")
			])),
			PhpReturn(PhpStaticCall(helper, "headerValue", [PhpVar("this"), PhpVar("filtered")]))
		]);
	}

	static function cookieGetFullHeader(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Cookie::getFullHeader adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.method-call", "expr.static-call"], [
			PhpReturn(PhpStaticCall(helper, "fullHeader", [PhpMethodCall(PhpVar("this"), "getHeaderValue", [])]))
		]);
	}

	static function cookieGetAttributes(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http_Cookie::get_attributes adapter " + fieldName);
		}

		return plan(["stmt.return", "expr.static-call"], [PhpReturn(PhpStaticCall(helper, "attributes", [PhpVar("this")]))]);
	}

	static function transportGetFirstAvailable(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::_get_first_available_transport adapter " + fieldName);
		}

		return plan([
			"stmt.var",
			"stmt.foreach",
			"stmt.if",
			"stmt.assign",
			"stmt.continue",
			"stmt.return",
			"expr.static-call",
			"expr.function-call",
			"expr.long-array",
			"wp-http.transport.get-first-available"
		], [
			PhpLocal("transports", PhpStaticCall(helper, "defaultTransportTokens", [])),
			PhpLocal("request_order", PhpFunctionCall("apply_filters_deprecated", [
				PhpString("http_api_transports"),
				PhpLongArray([
					{
						key: null,
						value: PhpVar("transports")
					},
					{
						key: null,
						value: PhpVar("args")
					},
					{
						key: null,
						value: PhpVar("url")
					}
				]),
				PhpString("6.4.0")
			])),
			PhpForeach(PhpVar("request_order"), "transport", [
				PhpIf(PhpStaticCall(helper, "isCoreTransportToken", [PhpCastString(PhpVar("transport"))]), [
					PhpAssign(PhpVar("transport"), PhpStaticCall(helper, "coreTransportSuffix", [PhpCastString(PhpVar("transport"))]))
				]),
				PhpLocal("class", PhpStaticCall(helper, "transportClassName", [PhpCastString(PhpVar("transport"))])),
				PhpIf(PhpNot(PhpFunctionCall("call_user_func", [
					PhpLongArray([
						{
							key: null,
							value: PhpVar("class")
						},
						{
							key: null,
							value: PhpString("test")
						}
					]),
					PhpVar("args"),
					PhpVar("url")
				])), [PhpContinue]),
				PhpReturn(PhpVar("class"))
			]),
			PhpReturn(PhpBool(false))
		]);
	}

	static function transportDispatchRequest(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return plan([
			"stmt.static-local",
			"stmt.var",
			"stmt.if",
			"stmt.assign",
			"stmt.expr",
			"stmt.return",
			"expr.method-call",
			"expr.function-call",
			"expr.dynamic-new",
			"expr.native-array-read",
			"wp-http.transport.dispatch-request"
		], [
			PhpStaticLocal("transports", PhpLongArray([])),
			PhpLocal("class", PhpMethodCall(PhpVar("this"), "_get_first_available_transport", [PhpVar("args"), PhpVar("url")])),
			PhpIf(PhpNot(PhpVar("class")), [
				PhpReturn(PhpNew("WP_Error", [
					PhpString("http_failure"),
					PhpFunctionCall("__", [
						PhpString("There are no HTTP transports available which can complete the requested request.")
					])
				]))
			]),
			PhpIf(PhpFunctionCall("empty", [PhpArrayRead(PhpVar("transports"), PhpVar("class"))]),
				[
					PhpAssign(PhpArrayRead(PhpVar("transports"), PhpVar("class")), PhpNewDynamic(PhpVar("class"), []))
				]),
			PhpLocal("response", PhpMethodCall(PhpArrayRead(PhpVar("transports"), PhpVar("class")), "request", [PhpVar("url"), PhpVar("args")])),
			PhpExprStmt(PhpFunctionCall("do_action",
				[
					PhpString("http_api_debug"),
					PhpVar("response"),
					PhpString("response"),
					PhpVar("class"),
					PhpVar("args"),
					PhpVar("url")
				])),
			PhpIf(PhpFunctionCall("is_wp_error", [PhpVar("response")]), [PhpReturn(PhpVar("response"))]),
			PhpReturn(PhpFunctionCall("apply_filters", [PhpString("http_response"), PhpVar("response"), PhpVar("args"), PhpVar("url")]))
		]);
	}

	static function requestNonblocking(fieldName:String, helpers:WordPressAdapterHelpers):WordPressMethodAdapterPlan
	{
		final helper = primaryHelper(helpers);
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::request nonblocking adapter " + fieldName);
		}

		final headRedirectionDefaultHelper = namedHelper(helpers, "headRedirectionDefault");
		final safetyOptionsHelper = namedHelper(helpers, "safetyOptions");
		final streamBlockingHelper = namedHelper(helpers, "streamBlocking");
		final url = PhpVar("url");
		final args = PhpVar("args");
		final defaults = PhpVar("defaults");
		final parsedArgs = PhpVar("parsed_args");
		final parsedUrl = PhpVar("parsed_url");
		final response = PhpVar("response");
		final headers = PhpVar("headers");
		final data = PhpVar("data");
		final type = PhpVar("type");
		final options = PhpVar("options");
		final proxy = PhpVar("proxy");
		final requestsResponse = PhpVar("requests_response");
		final httpResponse = PhpVar("http_response");
		final exception = PhpVar("e");
		final requestsClass = "WpOrg\\Requests\\Requests";
		final features = [
			"stmt.if",
			"stmt.if-else",
			"stmt.assign",
			"stmt.var",
			"stmt.return",
			"stmt.try-catch",
			"expr.array-read",
			"expr.long-array",
			"expr.object-property",
			"expr.new",
			"expr.const",
			"expr.static-call",
			"expr.method-call",
			"expr.function-call",
			"expr.binop",
			"wp-http.request.nonblocking-response"
		];
		if (safetyOptionsHelper != null)
		{
			features.push("wp-http.request.safety-options-helper");
		}
		if (headRedirectionDefaultHelper != null)
		{
			features.push("wp-http.request.head-redirection-default-helper");
		}
		if (streamBlockingHelper != null)
		{
			features.push("wp-http.request.stream-blocking-helper");
		}
		final headRedirectionDefaultCondition = headRedirectionDefaultHelper == null ? PhpBinop("&&", PhpFunctionCall("isset", [read(args, "method")]),
			PhpBinop("===", PhpString("HEAD"), read(args, "method"))) : PhpStaticCall(headRedirectionDefaultHelper, "shouldDisableHeadDefaultRedirection", [
				PhpFunctionCall("isset", [read(args, "method")]),
				PhpTernary(PhpFunctionCall("isset", [read(args, "method")]), PhpCastString(read(args, "method")), PhpString(""))
			]);
		final redirectValidationCondition = safetyOptionsHelper == null ? PhpBinop("&&",
			PhpFunctionCall("function_exists", [PhpString("wp_kses_bad_protocol")]),
			read(parsedArgs, "reject_unsafe_urls")) : PhpStaticCall(safetyOptionsHelper, "shouldRegisterRedirectValidation", [
				PhpFunctionCall("function_exists", [PhpString("wp_kses_bad_protocol")]),
				PhpCastBool(read(parsedArgs, "reject_unsafe_urls"))
			]);
		final streamBlockingStatement = streamBlockingHelper == null ? PhpAssign(read(parsedArgs, "blocking"),
			PhpBool(true)) : PhpIf(PhpStaticCall(streamBlockingHelper, "shouldForceBlockingForStream", [PhpCastBool(read(parsedArgs, "stream"))]),
				[PhpAssign(read(parsedArgs, "blocking"), PhpBool(true))]);

		return plan(features, [
			PhpLocal("defaults",
				PhpLongArray([
					entry("method", PhpString("GET")),
					entry("timeout", PhpFunctionCall("apply_filters", [PhpString("http_request_timeout"), PhpInt(5), url])),
					entry("redirection", PhpFunctionCall("apply_filters", [PhpString("http_request_redirection_count"), PhpInt(5), url])),
					entry("httpversion", PhpFunctionCall("apply_filters", [PhpString("http_request_version"), PhpString("1.0"), url])),
					entry("user-agent",
						PhpFunctionCall("apply_filters",
							[
								PhpString("http_headers_useragent"),
								PhpBinop(".",
									PhpBinop(".", PhpBinop(".", PhpString("WordPress/"), PhpFunctionCall("get_bloginfo", [PhpString("version")])),
										PhpString("; ")),
									PhpFunctionCall("get_bloginfo", [PhpString("url")])),
								url
							])),
					entry("reject_unsafe_urls", PhpFunctionCall("apply_filters", [PhpString("http_request_reject_unsafe_urls"), PhpBool(false), url])),
					entry("blocking", PhpBool(true)),
					entry("headers", PhpLongArray([])),
					entry("cookies", PhpLongArray([])),
					entry("body", PhpNull),
					entry("compress", PhpBool(false)),
					entry("decompress", PhpBool(true)),
					entry("sslverify", PhpBool(true)),
					entry("sslcertificates", PhpBinop(".", PhpBinop(".", PhpConst("ABSPATH"), PhpConst("WPINC")), PhpString("/certificates/ca-bundle.crt"))),
					entry("stream", PhpBool(false)),
					entry("filename", PhpNull),
					entry("limit_response_size", PhpNull)
				])),
			PhpAssign(args, PhpFunctionCall("wp_parse_args", [args])),
			PhpIf(headRedirectionDefaultCondition, [PhpAssign(read(defaults, "redirection"), PhpInt(0))]),
			PhpLocal("parsed_args", PhpFunctionCall("wp_parse_args", [args, defaults])),
			PhpAssign(parsedArgs, PhpFunctionCall("apply_filters", [PhpString("http_request_args"), parsedArgs, url])),
			PhpIf(PhpNot(PhpFunctionCall("isset", [read(parsedArgs, "_redirection")])),
				[PhpAssign(read(parsedArgs, "_redirection"), read(parsedArgs, "redirection"))]),
			PhpLocal("pre", PhpFunctionCall("apply_filters", [PhpString("pre_http_request"), PhpBool(false), parsedArgs, url])),
			PhpIf(PhpBinop("!==", PhpBool(false), PhpVar("pre")), [PhpReturn(PhpVar("pre"))]),
			PhpIf(PhpFunctionCall("function_exists", [PhpString("wp_kses_bad_protocol")]),
				[
					PhpIf(read(parsedArgs, "reject_unsafe_urls"), [PhpAssign(url, PhpFunctionCall("wp_http_validate_url", [url]))]),
					PhpIf(url,
						[
							PhpAssign(url,
								PhpFunctionCall("wp_kses_bad_protocol",
									[
										url,
										PhpLongArray([item(PhpString("http")), item(PhpString("https")), item(PhpString("ssl"))])
									]))
						])
				]),
			PhpLocal("parsed_url", PhpFunctionCall("parse_url", [url])),
			PhpIf(PhpBinop("||", PhpFunctionCall("empty", [url]), PhpFunctionCall("empty", [read(parsedUrl, "scheme")])), [
				PhpAssign(response, PhpNew("WP_Error", [
					PhpString("http_request_failed"),
					PhpFunctionCall("__", [PhpString("A valid URL was not provided.")])
				])),
				httpApiDebug(response, parsedArgs, url),
				PhpReturn(response)
			]),
			PhpIf(PhpMethodCall(PhpVar("this"), "block_request", [url]), [
				PhpAssign(response, PhpNew("WP_Error", [
					PhpString("http_request_not_executed"),
					PhpFunctionCall("sprintf", [
						PhpFunctionCall("__", [PhpString("User has blocked requests through HTTP to the URL: %s.")]),
						url
					])
				])),
				httpApiDebug(response, parsedArgs, url),
				PhpReturn(response)
			]),
			PhpIf(read(parsedArgs, "stream"),
				[
					PhpIf(PhpFunctionCall("empty", [read(parsedArgs, "filename")]), [
						PhpAssign(read(parsedArgs, "filename"), PhpBinop(".", PhpFunctionCall("get_temp_dir", []), PhpFunctionCall("basename", [url])))
					]),
					streamBlockingStatement,
					PhpIf(PhpNot(PhpFunctionCall("wp_is_writable", [PhpFunctionCall("dirname", [read(parsedArgs, "filename")])])),
						[
							PhpAssign(response,
								PhpNew("WP_Error",
									[
										PhpString("http_request_failed"),
										PhpFunctionCall("__",
											[
												PhpString("Destination directory for file streaming does not exist or is not writable.")
											])
									])),
							httpApiDebug(response, parsedArgs, url),
							PhpReturn(response)
						])
				]),
			PhpIf(PhpFunctionCall("is_null", [read(parsedArgs, "headers")]), [PhpAssign(read(parsedArgs, "headers"), PhpLongArray([]))]),
			PhpIf(PhpNot(PhpFunctionCall("is_array", [read(parsedArgs, "headers")])),
				[
					PhpLocal("processed_headers", PhpStaticCall("self", "processHeaders", [read(parsedArgs, "headers")])),
					PhpAssign(read(parsedArgs, "headers"), read(PhpVar("processed_headers"), "headers"))
				]),
			PhpLocal("headers", read(parsedArgs, "headers")),
			PhpLocal("data", read(parsedArgs, "body")),
			PhpLocal("type", read(parsedArgs, "method")),
			PhpLocal("options", PhpLongArray([
				entry("timeout", read(parsedArgs, "timeout")),
				entry("useragent", read(parsedArgs, "user-agent")),
				entry("blocking", read(parsedArgs, "blocking")),
				entry("hooks", PhpNew("WP_HTTP_Requests_Hooks", [url, parsedArgs]))
			])),
			PhpExprStmt(PhpMethodCall(read(options, "hooks"), "register", [
				PhpString("requests.before_redirect"),
				PhpLongArray([
					item(PhpClassConst("static", "class")),
					item(PhpString("browser_redirect_compatibility"))
				])
			])),
			PhpIf(redirectValidationCondition,
				[
					PhpExprStmt(PhpMethodCall(read(options, "hooks"), "register",
						[
							PhpString("requests.before_redirect"),
							PhpLongArray([item(PhpClassConst("static", "class")), item(PhpString("validate_redirects"))])
						]))
				]),
			PhpIf(read(parsedArgs, "stream"), [PhpAssign(read(options, "filename"), read(parsedArgs, "filename"))]),
			PhpIfElse(PhpFunctionCall("empty", [read(parsedArgs, "redirection")]), [PhpAssign(read(options, "follow_redirects"), PhpBool(false))],
				[PhpAssign(read(options, "redirects"), read(parsedArgs, "redirection"))]),
			PhpIf(PhpFunctionCall("isset", [read(parsedArgs, "limit_response_size")]),
				[PhpAssign(read(options, "max_bytes"), read(parsedArgs, "limit_response_size"))]),
			PhpIf(PhpNot(PhpFunctionCall("empty", [read(parsedArgs, "cookies")])), [
				PhpAssign(read(options, "cookies"), PhpStaticCall("self", "normalize_cookies", [read(parsedArgs, "cookies")]))
			]),
			PhpIfElse(PhpNot(read(parsedArgs, "sslverify")), [
				PhpAssign(read(options, "verify"), PhpBool(false)),
				PhpAssign(read(options, "verifyname"), PhpBool(false))
			],
				[PhpAssign(read(options, "verify"), read(parsedArgs, "sslcertificates"))]),
			PhpIf(PhpBinop("&&", PhpBinop("!==", PhpString("HEAD"), type), PhpBinop("!==", PhpString("GET"), type)),
				[PhpAssign(read(options, "data_format"), PhpString("body"))]),
			PhpAssign(read(options, "verify"), PhpFunctionCall("apply_filters", [PhpString("https_ssl_verify"), read(options, "verify"), url])),
			PhpLocal("proxy", PhpNew("WP_HTTP_Proxy", [])),
			PhpIf(PhpBinop("&&", PhpMethodCall(proxy, "is_enabled", []), PhpMethodCall(proxy, "send_through_proxy", [url])), [
				PhpAssign(read(options, "proxy"), PhpNew("WpOrg\\Requests\\Proxy\\Http", [
					PhpBinop(".", PhpBinop(".", PhpMethodCall(proxy, "host", []), PhpString(":")), PhpMethodCall(proxy, "port", []))
				])),
				PhpIf(PhpMethodCall(proxy, "use_authentication", []), [
					PhpAssign(PhpObjectProperty(read(options, "proxy"), "use_authentication"), PhpBool(true)),
					PhpAssign(PhpObjectProperty(read(options, "proxy"), "user"), PhpMethodCall(proxy, "username", [])),
					PhpAssign(PhpObjectProperty(read(options, "proxy"), "pass"), PhpMethodCall(proxy, "password", []))
				])
			]),
			PhpExprStmt(PhpFunctionCall("mbstring_binary_safe_encoding", [])),
			PhpTryCatch([
				PhpLocal("requests_response", PhpStaticCall(requestsClass, "request", [url, headers, data, type, options])),
				PhpLocal("http_response", PhpNew("WP_HTTP_Requests_Response", [requestsResponse, read(parsedArgs, "filename")])),
				PhpAssign(response, PhpMethodCall(httpResponse, "to_array", [])),
				PhpAssign(read(response, "http_response"), httpResponse)
			], "WpOrg\\Requests\\Exception", "e",
				[
					PhpAssign(response, PhpNew("WP_Error", [PhpString("http_request_failed"), PhpMethodCall(exception, "getMessage", [])]))
				]),
			PhpExprStmt(PhpFunctionCall("reset_mbstring_encoding", [])),
			httpApiDebug(response, parsedArgs, url),
			PhpIf(PhpFunctionCall("is_wp_error", [response]), [PhpReturn(response)]),
			PhpIf(PhpNot(read(parsedArgs, "blocking")), [PhpReturn(PhpStaticCall(helper, "nonblockingResponse", []))]),
			PhpReturn(PhpFunctionCall("apply_filters", [PhpString("http_response"), response, parsedArgs, url]))
		]);
	}

	static function httpApiDebug(response:PhpCoreExpr, parsedArgs:PhpCoreExpr, url:PhpCoreExpr):PhpCoreStmt
	{
		return PhpExprStmt(PhpFunctionCall("do_action", [
			PhpString("http_api_debug"),
			response,
			PhpString("response"),
			PhpString("WpOrg\\Requests\\Requests"),
			parsedArgs,
			url
		]));
	}
}
#end
