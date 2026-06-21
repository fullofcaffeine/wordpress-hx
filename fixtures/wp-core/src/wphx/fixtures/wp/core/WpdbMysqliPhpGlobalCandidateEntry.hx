package wphx.fixtures.wp.core;

import wphx.wp.db.DbDeltaPlanner;
import wphx.wp.db.LiveDbSchema;
import wphx.wp.db.WpdbMysqliCallGate;
import wphx.wp.db.WpdbMysqliExecution;
import wphx.wp.db.WpdbNativeExecution;
import wphx.wp.db.WpdbQueryState;
import wphx.wp.db.WpdbRawResource;
import wphx.wp.db.WpdbResultPopulation;
import wphx.wp.db.WpdbResultSelector;
import wphx.wp.db.WpdbRowTraversal;

class WpdbMysqliPhpGlobalCandidateEntry
{
	static function main():Void
	{
		LiveDbSchema.tableExists("wp_options", "wp_options");
		DbDeltaPlanner.queryKind("CREATE TABLE wp_options (");
		DbDeltaPlanner.queryObjectName("INSERT INTO wp_options VALUES (1)", "insert");
		DbDeltaPlanner.isFieldLine("option_name");
		DbDeltaPlanner.normalizeIndexType("UNIQUE INDEX");
		WpdbQueryState.shouldRunQuery("SELECT 1");
		WpdbQueryState.queryKind(" INSERT INTO wp_options VALUES (1)");
		WpdbQueryState.shouldUseAffectedRows("insert_or_replace");
		WpdbQueryState.shouldClearInsertIdAfterError(12, "insert_or_replace");
		WpdbNativeExecution.shouldCaptureQueryLog(true);
		WpdbNativeExecution.shouldExecuteNativeQuery(true);
		WpdbNativeExecution.nextQueryCount(1);
		WpdbNativeExecution.shouldAttemptReconnect(false, WpdbNativeExecution.MYSQL_SERVER_GONE_AWAY);
		WpdbMysqliCallGate.shouldCallQuery(true);
		WpdbMysqliCallGate.shouldFetchRows(true);
		WpdbMysqliExecution.query(null, "SELECT 1");
		WpdbMysqliExecution.fetchObject(null);
		WpdbRawResource.shouldReadMysqliErrno(true);
		WpdbRawResource.invalidHandleErrno();
		WpdbRawResource.shouldReadMysqliError(true);
		WpdbRawResource.shouldReadAffectedRows(true, true);
		WpdbRawResource.shouldReadInsertId(true, true);
		WpdbResultPopulation.shouldPopulateRows(true);
		WpdbResultPopulation.initialSelectedRowCount();
		WpdbResultPopulation.nextSelectedRowCount(1);
		WpdbResultPopulation.selectedRowsReturnValue(2);
		WpdbRowTraversal.hasFetchedRow(true);
		WpdbRowTraversal.assignmentIndex(1);
		WpdbRowTraversal.nextFetchedRowCount(1);
		WpdbResultSelector.shouldReturnVarValue(true, false);
		WpdbResultSelector.resultsOutputKind("OBJECT_K");
	}
}
