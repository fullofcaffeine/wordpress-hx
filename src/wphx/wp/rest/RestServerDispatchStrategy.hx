package wphx.wp.rest;

@:keep
class RestServerDispatchStrategy
{
	public static inline final ROUTE_TYPED_HAXE_DISPATCH_PLAN = "typed_haxe_rest_server_dispatch_plan";
	public static inline final ROUTE_UNKNOWN = "unknown";

	public static function ownedServerBodies():Array<String>
	{
		return ["dispatch", "respond_to_request"];
	}

	public static function serverBodyRoute(methodName:String):String
	{
		return contains(ownedServerBodies(), methodName) ? ROUTE_TYPED_HAXE_DISPATCH_PLAN : ROUTE_UNKNOWN;
	}

	public static function ownsServerBody(methodName:String):Bool
	{
		return serverBodyRoute(methodName) == ROUTE_TYPED_HAXE_DISPATCH_PLAN;
	}

	public static function shouldUsePreDispatchResult(resultIsEmpty:Bool):Bool
	{
		return !resultIsEmpty;
	}

	public static function shouldConvertPreDispatchError(resultIsWpError:Bool):Bool
	{
		return resultIsWpError;
	}

	public static function shouldReturnMatchedError(matchedIsWpError:Bool):Bool
	{
		return matchedIsWpError;
	}

	public static function shouldCreateInvalidHandlerError(callbackIsCallable:Bool):Bool
	{
		return !callbackIsCallable;
	}

	public static function shouldValidateRequest(hasError:Bool):Bool
	{
		return !hasError;
	}

	public static function shouldUseValidationError(validationFailed:Bool):Bool
	{
		return validationFailed;
	}

	public static function shouldSanitizeRequest(hasError:Bool):Bool
	{
		return !hasError;
	}

	public static function shouldUseSanitizationError(sanitizationFailed:Bool):Bool
	{
		return sanitizationFailed;
	}

	public static function shouldRunPermissionCheck(responseIsWpError:Bool, hasPermissionCallback:Bool):Bool
	{
		return !responseIsWpError && hasPermissionCallback;
	}

	public static function shouldUsePermissionError(permissionIsWpError:Bool):Bool
	{
		return permissionIsWpError;
	}

	public static function shouldCreateForbiddenError(permissionDenied:Bool):Bool
	{
		return permissionDenied;
	}

	public static function shouldRunDispatchRequest(responseIsWpError:Bool):Bool
	{
		return !responseIsWpError;
	}

	public static function shouldUseDispatchFilterResult(dispatchResultIsNull:Bool):Bool
	{
		return !dispatchResultIsNull;
	}

	public static function shouldCallEndpointCallback(dispatchResultIsNull:Bool):Bool
	{
		return dispatchResultIsNull;
	}

	public static function shouldConvertFinalError(responseIsWpError:Bool):Bool
	{
		return responseIsWpError;
	}

	public static function shouldSetMatchedMetadata():Bool
	{
		return true;
	}

	static function contains(values:Array<String>, value:String):Bool
	{
		for (entry in values)
		{
			if (entry == value)
			{
				return true;
			}
		}
		return false;
	}
}
