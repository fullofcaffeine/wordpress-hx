package wphx.fixtures.wp.core;

import wphx.wp.db.WpdbPublicStateDescriptor;

@:keep
class WpdbPublicStateDescriptorCandidateEntry
{
	static function main():Void
	{
		WpdbPublicStateDescriptor.declaredPublicProperties();
		WpdbPublicStateDescriptor.magicVisibleInternalProperties();
		WpdbPublicStateDescriptor.publicMagicMethods();
		WpdbPublicStateDescriptor.protectedWriteBlockedProperties();
		WpdbPublicStateDescriptor.dynamicPropertiesAllowed();
		WpdbPublicStateDescriptor.preservesDbDropinReplacement();
		WpdbPublicStateDescriptor.requireWpDbReturnsWhenGlobalIsSet();
		WpdbPublicStateDescriptor.fieldTypesUsesDirectPublicMutation();
		WpdbPublicStateDescriptor.hasDeclaredPublicProperty("field_types");
		WpdbPublicStateDescriptor.hasMagicVisibleInternalProperty("dbh");
		WpdbPublicStateDescriptor.blocksMagicWrite("col_meta");
		WpdbPublicStateDescriptor.category("last_result");
		WpdbPublicStateDescriptor.mutationPolicy("allow_unsafe_unquoted_parameters");
	}
}
