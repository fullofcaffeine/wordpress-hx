package wphx.fixtures.compiler.php.wp;

import wphx.wp.boundary.NativeValue.NativeValue;

/**
	Compiler-owned public `WP_HTTP_Response` shell.

	The public class preserves WordPress' original-path response ABI, including
	mutable public properties and `#[AllowDynamicProperties]`, while delegating
	bounded state transitions to Haxe-owned helpers. PHP still exposes the
	public object shape, native `absint` boundary, and `json_encode` property
	serialization behavior.
**/
@:wp.file("wp-includes/class-wp-http-response.php")
@:wp.haxeBootstrap("WPHX_WP_HTTP_RESPONSE_BOOTSTRAPPED")
@:wp.allowDynamicProperties
@:native("WP_HTTP_Response")
@:keep
class WpHttpResponseShell
{
	public var data:NativeValue;
	public var headers:NativeValue;
	public var status:NativeValue;

	@:wp.adapter("wp-http-response-construct")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function new(data:NativeValue = null, status:NativeValue = 200, @:wp.defaultArray headers:NativeValue = null):Void
	{
		HaxeHttpResponseState.initialize(null, data, status, headers);
	}

	@:wp.adapter("wp-http-response-get-headers")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function get_headers():NativeValue
	{
		return HaxeHttpResponseState.getHeaders(null);
	}

	@:wp.adapter("wp-http-response-set-headers")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function set_headers(headers:NativeValue):Void
	{
		HaxeHttpResponseState.setHeaders(null, headers);
	}

	@:wp.adapter("wp-http-response-header")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function header(key:NativeValue, value:NativeValue, replace:Bool = true):Void
	{
		HaxeHttpResponseState.header(null, "", "", replace);
	}

	@:wp.adapter("wp-http-response-get-status")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function get_status():Int
	{
		return HaxeHttpResponseState.getStatus(null);
	}

	@:wp.adapter("wp-http-response-set-status")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function set_status(code:NativeValue):Void
	{
		HaxeHttpResponseState.setStatus(null, code);
	}

	@:wp.adapter("wp-http-response-get-data")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function get_data():NativeValue
	{
		return HaxeHttpResponseState.getData(null);
	}

	@:wp.adapter("wp-http-response-set-data")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function set_data(data:NativeValue):Void
	{
		HaxeHttpResponseState.setData(null, data);
	}

	@:wp.adapter("wp-http-response-json-serialize")
	@:wp.haxeHelper("\\wphx\\wp\\http\\HttpResponseState")
	public function jsonSerialize():NativeValue
	{
		return HaxeHttpResponseState.jsonSerialize(null);
	}
}
