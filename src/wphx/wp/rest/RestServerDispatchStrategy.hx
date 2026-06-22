package wphx.wp.rest;

using StringTools;

@:keep
class RestServerDispatchStrategy
{
	public static inline final ROUTE_TYPED_HAXE_DISPATCH_PLAN = "typed_haxe_rest_server_dispatch_plan";
	public static inline final ROUTE_UNKNOWN = "unknown";

	public static function ownedServerBodies():Array<String>
	{
		return [
			"serve_request",
			"dispatch",
			"respond_to_request",
			"response_to_data",
			"get_compact_response_links"
		];
	}

	public static function serverBodyRoute(methodName:String):String
	{
		return contains(ownedServerBodies(), methodName) ? ROUTE_TYPED_HAXE_DISPATCH_PLAN : ROUTE_UNKNOWN;
	}

	public static function ownsServerBody(methodName:String):Bool
	{
		return serverBodyRoute(methodName) == ROUTE_TYPED_HAXE_DISPATCH_PLAN;
	}

	public static function shouldClearUnauthenticatedCurrentUser(currentUserIsWpUser:Bool, currentUserExists:Bool):Bool
	{
		return currentUserIsWpUser && !currentUserExists;
	}

	public static function responseContentType(jsonpCallbackPresent:Bool, jsonpEnabled:Bool):String
	{
		return jsonpCallbackPresent && jsonpEnabled ? "application/javascript" : "application/json";
	}

	public static function shouldSendApiRootLink(apiRootIsEmpty:Bool):Bool
	{
		return !apiRootIsEmpty;
	}

	public static function shouldRejectDisabledJsonp(jsonpCallbackPresent:Bool, jsonpEnabled:Bool):Bool
	{
		return jsonpCallbackPresent && !jsonpEnabled;
	}

	public static function shouldRejectInvalidJsonp(jsonpCallbackPresent:Bool, jsonpCallbackIsValid:Bool):Bool
	{
		return jsonpCallbackPresent && !jsonpCallbackIsValid;
	}

	public static function requestPath(path:Null<String>, pathInfo:Null<String>):String
	{
		if (path != null && path != "")
		{
			return path;
		}
		return pathInfo == null ? "/" : pathInfo;
	}

	public static function shouldOverrideMethodFromQuery(queryOverridePresent:Bool):Bool
	{
		return queryOverridePresent;
	}

	public static function shouldOverrideMethodFromHeader(queryOverridePresent:Bool, headerOverridePresent:Bool):Bool
	{
		return !queryOverridePresent && headerOverridePresent;
	}

	public static function shouldDispatchAuthenticatedRequest(authenticationIsWpError:Bool):Bool
	{
		return !authenticationIsWpError;
	}

	public static function shouldConvertServeResultError(resultIsWpError:Bool):Bool
	{
		return resultIsWpError;
	}

	public static function shouldEnvelopeResponse(envelopeRequested:Bool):Bool
	{
		return envelopeRequested;
	}

	public static function shouldSendNoCacheHeaders(sendNoCacheHeaders:Bool, methodOverridden:Bool, responseCodeIs4xx:Bool):Bool
	{
		return sendNoCacheHeaders || (methodOverridden && responseCodeIs4xx);
	}

	public static function shouldServeDefaultResponse(preServed:Bool):Bool
	{
		return !preServed;
	}

	public static function shouldReturnWithoutBodyForHead(methodIsHead:Bool):Bool
	{
		return methodIsHead;
	}

	public static function shouldReturnWithoutBodyForStatus(responseCode:Int, responseDataIsNull:Bool):Bool
	{
		return responseCode == 204 || responseDataIsNull;
	}

	public static function shouldEchoJsonp(jsonpCallbackPresent:Bool):Bool
	{
		return jsonpCallbackPresent;
	}

	public static function shouldAttachResponseLinks(linksAreEmpty:Bool):Bool
	{
		return !linksAreEmpty;
	}

	public static function shouldEmbedResponseData(embedRequested:Bool):Bool
	{
		return embedRequested;
	}

	public static function shouldEmbedNumericArrayData(dataIsNumericArray:Bool):Bool
	{
		return dataIsNumericArray;
	}

	public static function shouldReturnEmptyCompactLinks(linksAreEmpty:Bool):Bool
	{
		return linksAreEmpty;
	}

	public static function shouldAttemptCurieCompaction(rel:String, hrefPrefix:String):Bool
	{
		return rel.startsWith(hrefPrefix);
	}

	public static function shouldInstallCompactedRel(matchesTemplate:Bool):Bool
	{
		return matchesTemplate;
	}

	public static function shouldAppendUsedCuries(usedCuriesAreEmpty:Bool):Bool
	{
		return !usedCuriesAreEmpty;
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
