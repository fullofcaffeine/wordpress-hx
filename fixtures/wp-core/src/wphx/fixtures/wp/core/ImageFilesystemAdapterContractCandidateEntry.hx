package wphx.fixtures.wp.core;

import wphx.wp.media.ImageFilesystemAdapterContract.directFilesystemIoPlan;
import wphx.wp.media.ImageFilesystemAdapterContract.filesystemCredentialsPlan;
import wphx.wp.media.ImageFilesystemAdapterContract.filesystemMethodPlan;
import wphx.wp.media.ImageFilesystemAdapterContract.imageEditorSelectionPlan;
import wphx.wp.media.ImageFilesystemAdapterContract.intermediateSizePlan;
import wphx.wp.media.ImageFilesystemAdapterContract.metadataUpdatePlan;
import wphx.wp.media.ImageFilesystemAdapterContract.missingSubsizesPlan;

/**
	Deterministic executable probe for the WPHX-313 image/filesystem adapter
	contract. The runner compares each line with a stable expectation before
	recording receipts.
**/
@:keep
class ImageFilesystemAdapterContractCandidateEntry
{
	static function main():Void
	{
		emit("editor:none", imageEditorSelectionPlan(false, true, true, true, true));
		emit("editor:mime", imageEditorSelectionPlan(true, false, true, true, true));
		emit("editor:method", imageEditorSelectionPlan(true, true, false, true, true));
		emit("editor:output", imageEditorSelectionPlan(true, true, true, false, true));
		emit("editor:load", imageEditorSelectionPlan(true, true, true, true, false));
		emit("editor:selected", imageEditorSelectionPlan(true, true, true, true, true));

		emit("intermediate:no-size", intermediateSizePlan(0, 0, true, true, true));
		emit("intermediate:no-editor", intermediateSizePlan(150, 100, false, true, true));
		emit("intermediate:resize-error", intermediateSizePlan(150, 100, true, false, true));
		emit("intermediate:save-error", intermediateSizePlan(150, 100, true, true, false));
		emit("intermediate:ready", intermediateSizePlan(150, 100, true, true, true));

		emit("subsizes:non-image", missingSubsizesPlan(false, 4, 0, 0));
		emit("subsizes:all", missingSubsizesPlan(true, 4, 4, 0));
		emit("subsizes:missing", missingSubsizesPlan(true, 4, 1, 0));
		emit("subsizes:too-large", missingSubsizesPlan(true, 4, 0, 4));

		emit("metadata:invalid", metadataUpdatePlan(false, false, 0));
		emit("metadata:create", metadataUpdatePlan(false, true, 0));
		emit("metadata:return", metadataUpdatePlan(true, true, 0));
		emit("metadata:missing", metadataUpdatePlan(true, true, 2));

		emit("credentials:filtered", filesystemCredentialsPlan(true, false, false, false, false, false));
		emit("credentials:direct", filesystemCredentialsPlan(false, true, false, false, false, false));
		emit("credentials:password", filesystemCredentialsPlan(false, false, true, true, false, false));
		emit("credentials:ssh", filesystemCredentialsPlan(false, false, true, false, true, false));
		emit("credentials:form", filesystemCredentialsPlan(false, false, false, true, false, false));
		emit("credentials:error", filesystemCredentialsPlan(false, false, true, true, false, true));

		emit("method:forced", filesystemMethodPlan(true, false, false, false, false, false, false, false));
		emit("method:owner", filesystemMethodPlan(false, true, true, false, false, false, false, false));
		emit("method:relaxed", filesystemMethodPlan(false, false, true, true, false, false, false, false));
		emit("method:ssh2", filesystemMethodPlan(false, false, false, false, true, true, true, true));
		emit("method:ftpext", filesystemMethodPlan(false, false, false, false, false, false, true, true));
		emit("method:ftpsockets", filesystemMethodPlan(false, false, false, false, false, false, false, true));
		emit("method:unavailable", filesystemMethodPlan(false, false, false, false, false, false, false, false));

		emit("io:write", directFilesystemIoPlan("write", false, false, false, false));
		emit("io:read", directFilesystemIoPlan("read", true, false, false, false));
		emit("io:copy", directFilesystemIoPlan("copy", true, false, false, false));
		emit("io:copy-reject", directFilesystemIoPlan("copy", true, true, false, false));
		emit("io:move-overwrite", directFilesystemIoPlan("move", true, true, true, false));
		emit("io:delete", directFilesystemIoPlan("delete", true, false, false, false));
		emit("io:dirlist", directFilesystemIoPlan("dirlist", true, false, false, false));
		emit("io:unknown", directFilesystemIoPlan("chmod", true, false, false, false));
	}

	static function emit(key:String, value:String):Void
	{
		Sys.println(key + "=" + value);
	}
}
