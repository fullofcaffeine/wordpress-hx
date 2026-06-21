package wphx.fixtures.wp.core;

import wphx.wp.db.WpdbPublicStateDescriptor;
import wphx.wp.db.WpdbPublicStateExpandedStorageAdapter;

@:keep
class WpdbPublicStateExpandedStorageAdapterCandidateEntry
{
	static function main():Void
	{
		WpdbPublicStateDescriptor.declaredPublicProperties();
		WpdbPublicStateExpandedStorageAdapter.expandedPublicStorageProperties();
		WpdbPublicStateExpandedStorageAdapter.expandedMagicStorageProperties();
		WpdbPublicStateExpandedStorageAdapter.lazyMagicNativeBoundaryProperties();
		WpdbPublicStateExpandedStorageAdapter.nativeResourceBoundaryProperties();
		WpdbPublicStateExpandedStorageAdapter.nativeArrayPublicProperties();
		WpdbPublicStateExpandedStorageAdapter.nativeArrayMagicProperties();
		WpdbPublicStateExpandedStorageAdapter.publicDefaultKind("field_types");
		WpdbPublicStateExpandedStorageAdapter.publicStringDefault("last_error");
		WpdbPublicStateExpandedStorageAdapter.publicIntDefault("num_rows");
		WpdbPublicStateExpandedStorageAdapter.publicBoolDefault("ready");
		WpdbPublicStateExpandedStorageAdapter.publicNativeArrayDefaultValues("tables");
		WpdbPublicStateExpandedStorageAdapter.magicDefaultKind("dbhost");
		WpdbPublicStateExpandedStorageAdapter.magicStringDefault("dbhost");
		WpdbPublicStateExpandedStorageAdapter.magicIntDefault("reconnect_retries");
		WpdbPublicStateExpandedStorageAdapter.magicBoolDefault("has_connected");
		WpdbPublicStateExpandedStorageAdapter.magicNativeArrayDefaultValues("incompatible_modes");
		WpdbPublicStateExpandedStorageAdapter.shouldInitializePublicProperty("field_types");
		WpdbPublicStateExpandedStorageAdapter.shouldInitializeMagicStorageProperty("dbhost");
		WpdbPublicStateExpandedStorageAdapter.shouldDeferMagicReadToWordPressLazyBoundary("col_info");
		WpdbPublicStateExpandedStorageAdapter.shouldRoutePublicWriteToPhpProperty("last_error");
		WpdbPublicStateExpandedStorageAdapter.shouldRouteDynamicWriteToPhpProperty("wphx_plugin_extension");
		WpdbPublicStateExpandedStorageAdapter.shouldRouteMagicReadToStorage("dbhost");
		WpdbPublicStateExpandedStorageAdapter.shouldRouteMagicWriteToStorage("dbhost");
		WpdbPublicStateExpandedStorageAdapter.shouldBlockMagicWrite("col_meta");
		WpdbPublicStateExpandedStorageAdapter.writeRoute("dbhost");
		WpdbPublicStateExpandedStorageAdapter.fieldTypesDirectMutationAllowed();
		WpdbPublicStateExpandedStorageAdapter.tablePrefixMutationAllowed();
		WpdbPublicStateExpandedStorageAdapter.dynamicPluginPropertyAllowed();
		WpdbPublicStateExpandedStorageAdapter.preservesDbDropinReplacement();
		WpdbPublicStateExpandedStorageAdapter.completeDeclaredPublicStateCoverage();
	}
}
