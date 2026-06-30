package wphx.compiler.php;

#if (macro || reflaxe_runtime)
import haxe.crypto.Sha256;
import sys.io.File;
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

typedef WordPressMethodAdapterPlan =
{
	final features:Array<String>;
	final statements:Array<PhpCoreStmt>;
	final error:Null<String>;
	final templates:Array<WordPressAdapterTemplateProvenance>;
}

private typedef AdapterTemplateReplacement =
{
	final placeholder:String;
	final value:String;
}

private typedef AdapterTemplateRender =
{
	final code:String;
	final provenance:WordPressAdapterTemplateProvenance;
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
			case "wp-http-handle-redirects":
				handleRedirects(fieldName, helper);
			case "wp-http-encoding-compress":
				encodingCompress(fieldName, helper);
			case "wp-http-encoding-decompress":
				encodingDecompress(fieldName, helper);
			case "wp-http-encoding-compatible-gzinflate":
				encodingCompatibleGzinflate(fieldName, helper);
			case "wp-http-encoding-accept-encoding":
				encodingAcceptEncoding(fieldName, helper);
			case "wp-http-encoding-content-encoding":
				encodingContentEncoding(fieldName, helper);
			case "wp-http-encoding-should-decode":
				encodingShouldDecode(fieldName, helper);
			case "wp-http-encoding-is-available":
				encodingIsAvailable(fieldName, helper);
			case "wp-http-proxy-is-enabled":
				proxyIsEnabled(fieldName, helper);
			case "wp-http-proxy-use-authentication":
				proxyUseAuthentication(fieldName, helper);
			case "wp-http-proxy-constant":
				proxyConstant(fieldName, helper);
			case "wp-http-proxy-authentication":
				proxyAuthentication(fieldName, helper);
			case "wp-http-proxy-authentication-header":
				proxyAuthenticationHeader(fieldName, helper);
			case "wp-http-proxy-send-through-proxy":
				proxySendThroughProxy(fieldName, helper);
			case "wp-http-response-construct":
				responseConstruct(fieldName, helper);
			case "wp-http-response-get-data":
				responseGetData(fieldName, helper);
			case "wp-http-response-set-data":
				responseSetData(fieldName, helper);
			case "wp-http-response-get-headers":
				responseGetHeaders(fieldName, helper);
			case "wp-http-response-set-headers":
				responseSetHeaders(fieldName, helper);
			case "wp-http-response-header":
				responseHeader(fieldName, helper);
			case "wp-http-response-get-status":
				responseGetStatus(fieldName, helper);
			case "wp-http-response-set-status":
				responseSetStatus(fieldName, helper);
			case "wp-http-response-json-serialize":
				responseJsonSerialize(fieldName, helper);
			case "wp-http-cookie-construct":
				cookieConstruct(fieldName, helper);
			case "wp-http-cookie-test":
				cookieTest(fieldName, helper);
			case "wp-http-cookie-get-header-value":
				cookieGetHeaderValue(fieldName, helper);
			case "wp-http-cookie-get-full-header":
				cookieGetFullHeader(fieldName, helper);
			case "wp-http-cookie-get-attributes":
				cookieGetAttributes(fieldName, helper);
			case "wp-http-transport-get-first-available":
				transportGetFirstAvailable(fieldName, helper);
			case "wp-http-transport-dispatch-request":
				transportDispatchRequest(fieldName, helper);
			case "wp-http-request-nonblocking":
				requestNonblocking(fieldName, helper);
			case _:
				null;
		}
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

	static function templateError(message:String):WordPressMethodAdapterPlan
	{
		return {
			features: [],
			statements: [],
			error: message,
			templates: []
		};
	}

	static function renderTemplate(adapter:String, path:String, ownership:String, upstreamRef:String,
			replacements:Array<AdapterTemplateReplacement>):AdapterTemplateRender
	{
		final source = try
		{
			File.getContent(path);
		} catch (error:haxe.Exception)
		{
			return {
				code: "",
				provenance: emptyTemplateProvenance(adapter, path, ownership, upstreamRef),
				error: "missing WPHX PHP adapter template " + path + ": " + error.message
			};
		}

		var code = source;
		final placeholders = new Array<String>();
		for (replacement in replacements)
		{
			final token = "{{" + replacement.placeholder + "}}";
			if (code.indexOf(token) == -1)
			{
				return {
					code: "",
					provenance: emptyTemplateProvenance(adapter, path, ownership, upstreamRef),
					error: "WPHX PHP adapter template " + path + " is missing placeholder " + token
				};
			}
			code = StringTools.replace(code, token, replacement.value);
			placeholders.push(replacement.placeholder);
		}
		if (code.indexOf("{{") != -1 || code.indexOf("}}") != -1)
		{
			return {
				code: "",
				provenance: emptyTemplateProvenance(adapter, path, ownership, upstreamRef),
				error: "WPHX PHP adapter template " + path + " has unreplaced placeholders"
			};
		}

		return {
			code: StringTools.rtrim(code),
			provenance: {
				adapter: adapter,
				path: path,
				sha256: "sha256:" + Sha256.encode(source),
				placeholders: placeholders,
				ownership: ownership,
				upstream_ref: upstreamRef
			},
			error: null
		};
	}

	static function emptyTemplateProvenance(adapter:String, path:String, ownership:String, upstreamRef:String):WordPressAdapterTemplateProvenance
	{
		return {
			adapter: adapter,
			path: path,
			sha256: "",
			placeholders: [],
			ownership: ownership,
			upstream_ref: upstreamRef
		};
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
		return plan(["stmt.raw-wordpress-boundary"], [
			PhpRawBlock("if ( $requested_url ) {\n"
				+ "\t$parsed_url = parse_url( $requested_url );\n"
				+ "}\n"
				+ "if ( isset( $parsed_url['host'] ) ) {\n"
				+ "\t$this->domain = $parsed_url['host'];\n"
				+ "}\n"
				+ "$this->path = $parsed_url['path'] ?? '/';\n"
				+ "if ( ! str_ends_with( $this->path, '/' ) ) {\n"
				+ "\t$this->path = dirname( $this->path ) . '/';\n"
				+ "}\n"
				+ "\n"
				+ "if ( is_string( $data ) ) {\n"
				+ "\t$pairs = explode( ';', $data );\n"
				+ "\n"
				+ "\t$name        = trim( substr( $pairs[0], 0, strpos( $pairs[0], '=' ) ) );\n"
				+ "\t$value       = substr( $pairs[0], strpos( $pairs[0], '=' ) + 1 );\n"
				+ "\t$this->name  = $name;\n"
				+ "\t$this->value = urldecode( $value );\n"
				+ "\n"
				+ "\tarray_shift( $pairs );\n"
				+ "\n"
				+ "\tforeach ( $pairs as $pair ) {\n"
				+ "\t\t$pair = rtrim( $pair );\n"
				+ "\n"
				+ "\t\tif ( empty( $pair ) ) {\n"
				+ "\t\t\tcontinue;\n"
				+ "\t\t}\n"
				+ "\n"
				+ "\t\tlist( $key, $val ) = strpos( $pair, '=' ) ? explode( '=', $pair ) : array( $pair, '' );\n"
				+ "\t\t$key               = strtolower( trim( $key ) );\n"
				+ "\t\tif ( 'expires' === $key ) {\n"
				+ "\t\t\t$val = strtotime( $val );\n"
				+ "\t\t}\n"
				+ "\t\t$this->$key = $val;\n"
				+ "\t}\n"
				+ "} else {\n"
				+ "\tif ( ! isset( $data['name'] ) ) {\n"
				+ "\t\treturn;\n"
				+ "\t}\n"
				+ "\n"
				+ "\tforeach ( array( 'name', 'value', 'path', 'domain', 'port', 'host_only' ) as $field ) {\n"
				+ "\t\tif ( isset( $data[ $field ] ) ) {\n"
				+ "\t\t\t$this->$field = $data[ $field ];\n"
				+ "\t\t}\n"
				+ "\t}\n"
				+ "\n"
				+ "\tif ( isset( $data['expires'] ) ) {\n"
				+ "\t\t$this->expires = is_int( $data['expires'] ) ? $data['expires'] : strtotime( $data['expires'] );\n"
				+ "\t} else {\n"
				+ "\t\t$this->expires = null;\n"
				+ "\t}\n"
				+ "}")
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

		return plan(["stmt.raw-wordpress-boundary"], [
			PhpRawBlock("$transports = "
				+ helper
				+ "::defaultTransportTokens();\n"
				+ "\n"
				+ "$request_order = apply_filters_deprecated( 'http_api_transports', array( $transports, $args, $url ), '6.4.0' );\n"
				+ "\n"
				+ "foreach ( $request_order as $transport ) {\n"
				+ "\tif ( "
				+ helper
				+ "::isCoreTransportToken( (string) $transport ) ) {\n"
				+ "\t\t$transport = "
				+ helper
				+ "::coreTransportSuffix( (string) $transport );\n"
				+ "\t}\n"
				+ "\t$class = "
				+ helper
				+ "::transportClassName( (string) $transport );\n"
				+ "\n"
				+ "\tif ( ! call_user_func( array( $class, 'test' ), $args, $url ) ) {\n"
				+ "\t\tcontinue;\n"
				+ "\t}\n"
				+ "\n"
				+ "\treturn $class;\n"
				+ "}\n"
				+ "\n"
				+ "return false;")
		]);
	}

	static function transportDispatchRequest(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		return plan(["stmt.raw-wordpress-boundary"], [
			PhpRawBlock("static $transports = array();\n"
				+ "\n"
				+ "$class = $this->_get_first_available_transport( $args, $url );\n"
				+ "if ( ! $class ) {\n"
				+ "\treturn new WP_Error( 'http_failure', __( 'There are no HTTP transports available which can complete the requested request.' ) );\n"
				+ "}\n"
				+ "\n"
				+ "if ( empty( $transports[ $class ] ) ) {\n"
				+ "\t$transports[ $class ] = new $class();\n"
				+ "}\n"
				+ "\n"
				+ "$response = $transports[ $class ]->request( $url, $args );\n"
				+ "\n"
				+ "do_action( 'http_api_debug', $response, 'response', $class, $args, $url );\n"
				+ "\n"
				+ "if ( is_wp_error( $response ) ) {\n"
				+ "\treturn $response;\n"
				+ "}\n"
				+ "\n"
				+ "return apply_filters( 'http_response', $response, $args, $url );")
		]);
	}

	static function requestNonblocking(fieldName:String, helper:Null<String>):WordPressMethodAdapterPlan
	{
		if (helper == null)
		{
			return missingHelper("missing @:wp.haxeHelper for WP_Http::request nonblocking adapter " + fieldName);
		}

		final rendered = renderTemplate("wp-http-request-nonblocking",
			"src/wphx/compiler/php/templates/wordpress/wp-http-request-nonblocking-body.php.template", "bounded_public_adapter_template",
			"../wordpress-develop/src/wp-includes/class-wp-http.php WP_Http::request", [
			{
				placeholder: "HELPER_CLASS",
				value: helper
			}
		]);
		if (rendered.error != null)
		{
			return templateError(rendered.error);
		}

		return plan([
			"stmt.raw-wordpress-boundary",
			"adapter.template",
			"wp-http.request.nonblocking-response"
		], [PhpRawBlock(rendered.code)], [rendered.provenance]);
	}
}
#end
