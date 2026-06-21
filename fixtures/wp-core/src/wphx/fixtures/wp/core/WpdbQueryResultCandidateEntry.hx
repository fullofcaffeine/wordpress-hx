package wphx.fixtures.wp.core;

import wphx.wp.db.DbDeltaPlanner;
import wphx.wp.db.LiveDbSchema;
import wphx.wp.db.WpdbResultSelector;

class WpdbQueryResultCandidateEntry
{
	static function main():Void
	{
		LiveDbSchema.tableExists("wp_options", "wp_options");
		DbDeltaPlanner.queryKind("CREATE TABLE wp_options (");
		DbDeltaPlanner.queryObjectName("INSERT INTO wp_options VALUES (1)", "insert");
		DbDeltaPlanner.isFieldLine("option_name");
		DbDeltaPlanner.normalizeIndexType("UNIQUE INDEX");
		WpdbResultSelector.shouldReturnVarValue(true, false);
		WpdbResultSelector.rowOutputKind("object");
		WpdbResultSelector.resultsOutputKind("OBJECT_K");
		WpdbResultSelector.shouldKeepObjectKey(false);
	}
}
