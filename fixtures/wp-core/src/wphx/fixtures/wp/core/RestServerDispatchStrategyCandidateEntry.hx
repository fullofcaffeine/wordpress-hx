package wphx.fixtures.wp.core;

import wphx.wp.rest.RestServerDispatchStrategy;

@:keep
class RestServerDispatchStrategyCandidateEntry
{
	static function main():Void
	{
		RestServerDispatchStrategy.ownedServerBodies();
		RestServerDispatchStrategy.serverBodyRoute("serve_request");
		RestServerDispatchStrategy.ownsServerBody("respond_to_request");
		RestServerDispatchStrategy.shouldClearUnauthenticatedCurrentUser(true, false);
		RestServerDispatchStrategy.responseContentType(true, true);
		RestServerDispatchStrategy.shouldSendApiRootLink(false);
		RestServerDispatchStrategy.shouldRejectDisabledJsonp(true, false);
		RestServerDispatchStrategy.shouldRejectInvalidJsonp(true, false);
		RestServerDispatchStrategy.requestPath(null, "/wp/v2/settings");
		RestServerDispatchStrategy.shouldOverrideMethodFromQuery(true);
		RestServerDispatchStrategy.shouldOverrideMethodFromHeader(false, true);
		RestServerDispatchStrategy.shouldDispatchAuthenticatedRequest(false);
		RestServerDispatchStrategy.shouldConvertServeResultError(true);
		RestServerDispatchStrategy.shouldEnvelopeResponse(true);
		RestServerDispatchStrategy.shouldSendNoCacheHeaders(false, true, true);
		RestServerDispatchStrategy.shouldServeDefaultResponse(false);
		RestServerDispatchStrategy.shouldReturnWithoutBodyForHead(true);
		RestServerDispatchStrategy.shouldReturnWithoutBodyForStatus(204, false);
		RestServerDispatchStrategy.shouldEchoJsonp(true);
		RestServerDispatchStrategy.shouldAttachResponseLinks(false);
		RestServerDispatchStrategy.shouldEmbedResponseData(true);
		RestServerDispatchStrategy.shouldEmbedNumericArrayData(false);
		RestServerDispatchStrategy.shouldReturnEmptyCompactLinks(true);
		RestServerDispatchStrategy.shouldAttemptCurieCompaction("https://api.w.org/foo", "https://api.w.org/");
		RestServerDispatchStrategy.shouldInstallCompactedRel(true);
		RestServerDispatchStrategy.shouldAppendUsedCuries(false);
		RestServerDispatchStrategy.shouldUsePreDispatchResult(false);
		RestServerDispatchStrategy.shouldConvertPreDispatchError(true);
		RestServerDispatchStrategy.shouldReturnMatchedError(true);
		RestServerDispatchStrategy.shouldCreateInvalidHandlerError(false);
		RestServerDispatchStrategy.shouldValidateRequest(false);
		RestServerDispatchStrategy.shouldUseValidationError(true);
		RestServerDispatchStrategy.shouldSanitizeRequest(false);
		RestServerDispatchStrategy.shouldUseSanitizationError(true);
		RestServerDispatchStrategy.shouldRunPermissionCheck(false, true);
		RestServerDispatchStrategy.shouldUsePermissionError(true);
		RestServerDispatchStrategy.shouldCreateForbiddenError(true);
		RestServerDispatchStrategy.shouldRunDispatchRequest(false);
		RestServerDispatchStrategy.shouldUseDispatchFilterResult(false);
		RestServerDispatchStrategy.shouldCallEndpointCallback(true);
		RestServerDispatchStrategy.shouldConvertFinalError(true);
		RestServerDispatchStrategy.shouldSetMatchedMetadata();
	}
}
