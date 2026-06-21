package wphx.fixtures.wp.core;

import wphx.wp.db.WpdbClassShellStrategy;
import wphx.wp.db.WpdbPublicStateExpandedStorageAdapter;

@:keep
class WpdbClassShellResourceStrategyCandidateEntry
{
	static function main():Void
	{
		WpdbPublicStateExpandedStorageAdapter.expandedPublicStorageProperties();
		WpdbClassShellStrategy.classShellKind();
		WpdbClassShellStrategy.constructorArgumentProperties();
		WpdbClassShellStrategy.constructorSideEffectProperties();
		WpdbClassShellStrategy.parentVisibleNativeResourceProperties();
		WpdbClassShellStrategy.lazyParentLoadedProperties();
		WpdbClassShellStrategy.pluginAbiCompatibilityProperties();
		WpdbClassShellStrategy.bootstrapEntryPoints();
		WpdbClassShellStrategy.nativeResourceWriteRoute("result");
		WpdbClassShellStrategy.lazyReadRoute("col_info");
		WpdbClassShellStrategy.bootstrapRoute("require_wp_db");
		WpdbClassShellStrategy.shouldStoreNativeResourceInParentVisibleSlot("dbh");
		WpdbClassShellStrategy.shouldDelegateLazyReadToParentLoader("col_info");
		WpdbClassShellStrategy.preservesPluginAbiCompatibility();
		WpdbClassShellStrategy.preservesRequireWpDbDropinReplacement();
		WpdbClassShellStrategy.usesExpandedPublicStateAdapter();
	}
}
