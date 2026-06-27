package wphx.wp.http;

import wphx.wp.boundary.NativeValue.NativeValue;

@:keep
class HttpResponseState
{
	public static function initialize(response:NativeValue, data:NativeValue, status:NativeValue, headers:php.NativeArray):Void
	{
		setData(response, data);
		setStatus(response, status);
		setHeaders(response, headers);
	}

	public static function getData(response:NativeValue):NativeValue
	{
		return PhpObject.getProperty(response, "data");
	}

	public static function setData(response:NativeValue, data:NativeValue):Void
	{
		PhpObject.setProperty(response, "data", data);
	}

	public static function getHeaders(response:NativeValue):php.NativeArray
	{
		return PhpObject.getProperty(response, "headers");
	}

	public static function setHeaders(response:NativeValue, headers:php.NativeArray):Void
	{
		PhpObject.setProperty(response, "headers", headers);
	}

	public static function header(response:NativeValue, key:String, value:String, replace:Bool):Void
	{
		if (replace || !PhpObject.issetPropertyArrayKey(response, "headers", key))
		{
			PhpObject.setPropertyArrayValue(response, "headers", key, value);
		} else
		{
			PhpObject.setPropertyArrayValue(response, "headers", key,
				PhpString.concatWithComma(PhpObject.getPropertyArrayString(response, "headers", key), value));
		}
	}

	public static function getStatus(response:NativeValue):Int
	{
		return PhpObject.getProperty(response, "status");
	}

	public static function setStatus(response:NativeValue, code:NativeValue):Void
	{
		PhpObject.setProperty(response, "status", PhpValue.absint(code));
	}

	public static function jsonSerialize(response:NativeValue):NativeValue
	{
		return getData(response);
	}
}

@:keep
class PhpObject
{
	// WPHX-211: WP_HTTP_Response exposes mutable public PHP properties.
	public static function getProperty(object:NativeValue, property:String):NativeValue
	{
		return php.Syntax.code("{0}->{1}", object, property);
	}

	// WPHX-211: public property writes are part of the PHP-visible response ABI.
	public static function setProperty(object:NativeValue, property:String, value:NativeValue):Void
	{
		php.Syntax.code("{0}->{1} = {2}", object, property, value);
	}

	// WPHX-211: isset on a public PHP array property preserves null-aware header existence semantics.
	public static function issetPropertyArrayKey(object:NativeValue, property:String, key:String):Bool
	{
		return php.Syntax.code("isset({0}->{1}[{2}])", object, property, key);
	}

	// WPHX-211: native PHP array indexing preserves associative header keys on public properties.
	public static function getPropertyArrayString(object:NativeValue, property:String, key:String):String
	{
		return php.Syntax.code("{0}->{1}[{2}]", object, property, key);
	}

	// WPHX-211: header mutation must write into the native PHP associative array property.
	public static function setPropertyArrayValue(object:NativeValue, property:String, key:String, value:NativeValue):Void
	{
		php.Syntax.code("{0}->{1}[{2}] = {3}", object, property, key, value);
	}
}

@:keep
class PhpString
{
	public static function concatWithComma(left:String, right:String):String
	{
		return left + ", " + right;
	}
}

@:keep
class PhpValue
{
	// WPHX-211: WP_HTTP_Response status coercion delegates to WordPress absint().
	public static function absint(value:NativeValue):Int
	{
		return php.Syntax.code("absint({0})", value);
	}
}
