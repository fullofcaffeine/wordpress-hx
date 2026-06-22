package wphx.fixtures.wp.core;

import wphx.wp.rest.RestSettingsSchemaStrategy;

@:keep
class RestSettingsSchemaStrategyCandidateEntry
{
	static function main():Void
	{
		RestSettingsSchemaStrategy.ownedControllerBodies();
		RestSettingsSchemaStrategy.controllerBodyRoute("get_registered_options");
		RestSettingsSchemaStrategy.ownsControllerBody("get_registered_options");
		RestSettingsSchemaStrategy.shouldExposeInRest(false);
		RestSettingsSchemaStrategy.shouldUseRestArgs(true);
		RestSettingsSchemaStrategy.restName("title", "blogname");
		RestSettingsSchemaStrategy.schemaType("string");
		RestSettingsSchemaStrategy.shouldSkipSchemaType("");
		RestSettingsSchemaStrategy.isSupportedSchemaType("object");
		RestSettingsSchemaStrategy.shouldDefaultAdditionalPropertiesToFalse("object");
		RestSettingsSchemaStrategy.shouldReturnNullFromSanitize(true);
		RestSettingsSchemaStrategy.requiredCapability();
	}
}
