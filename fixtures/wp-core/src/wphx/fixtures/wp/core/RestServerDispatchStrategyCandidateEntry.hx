package wphx.fixtures.wp.core;

import wphx.wp.rest.RestServerDispatchStrategy;

@:keep
class RestServerDispatchStrategyCandidateEntry
{
	static function main():Void
	{
		RestServerDispatchStrategy.ownedServerBodies();
		RestServerDispatchStrategy.serverBodyRoute("dispatch");
		RestServerDispatchStrategy.ownsServerBody("respond_to_request");
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
