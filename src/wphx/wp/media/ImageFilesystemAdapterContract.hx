package wphx.wp.media;

using StringTools;

/**
	Typed WPHX-313 image metadata/editor and filesystem adapter-contract
	decisions.

	This module models narrow decisions proven by the WPHX-313.04 and
	WPHX-313.05 PHP oracle fixtures. Native image libraries, EXIF/IPTC parsing,
	remote FTP/SSH transports, updater orchestration, public PHP files, and
	installed distribution behavior remain provider/public-adapter work.
**/
@:keep
final EDITOR_NO_IMPLEMENTATION = "editor_no_implementation";

@:keep
final EDITOR_UNSUPPORTED_MIME = "editor_unsupported_mime";

@:keep
final EDITOR_MISSING_METHOD = "editor_missing_method";

@:keep
final EDITOR_OUTPUT_FALLBACK = "editor_output_fallback";

@:keep
final EDITOR_SELECTED = "editor_selected";

@:keep
final EDITOR_LOAD_ERROR = "editor_load_error";

@:keep
final INTERMEDIATE_NO_SIZE = "intermediate_no_size";

@:keep
final INTERMEDIATE_NO_EDITOR = "intermediate_no_editor";

@:keep
final INTERMEDIATE_RESIZE_ERROR = "intermediate_resize_error";

@:keep
final INTERMEDIATE_SAVE_ERROR = "intermediate_save_error";

@:keep
final INTERMEDIATE_METADATA_READY = "intermediate_metadata_ready";

@:keep
final SUBSIZES_NON_IMAGE = "subsizes_non_image";

@:keep
final SUBSIZES_ALL_REGISTERED = "subsizes_all_registered";

@:keep
final SUBSIZES_MISSING_SOME = "subsizes_missing_some";

@:keep
final SUBSIZES_SKIP_TOO_LARGE = "subsizes_skip_too_large";

@:keep
final METADATA_INVALID_ATTACHMENT = "metadata_invalid_attachment";

@:keep
final METADATA_CREATE_FROM_FILE = "metadata_create_from_file";

@:keep
final METADATA_RETURN_EXISTING = "metadata_return_existing";

@:keep
final METADATA_MAKE_MISSING = "metadata_make_missing";

@:keep
final CREDENTIALS_FILTERED = "filesystem_credentials_filtered";

@:keep
final CREDENTIALS_DIRECT = "filesystem_credentials_direct";

@:keep
final CREDENTIALS_ACCEPT_PASSWORD = "filesystem_credentials_accept_password";

@:keep
final CREDENTIALS_ACCEPT_SSH_KEYS = "filesystem_credentials_accept_ssh_keys";

@:keep
final CREDENTIALS_FORM = "filesystem_credentials_form";

@:keep
final CREDENTIALS_ERROR_FORM = "filesystem_credentials_error_form";

@:keep
final METHOD_FORCED = "filesystem_method_forced";

@:keep
final METHOD_DIRECT_FILE_OWNER = "filesystem_method_direct_file_owner";

@:keep
final METHOD_DIRECT_RELAXED = "filesystem_method_direct_relaxed";

@:keep
final METHOD_SSH2 = "filesystem_method_ssh2";

@:keep
final METHOD_FTP_EXT = "filesystem_method_ftpext";

@:keep
final METHOD_FTP_SOCKETS = "filesystem_method_ftpsockets";

@:keep
final METHOD_UNAVAILABLE = "filesystem_method_unavailable";

@:keep
final DIRECT_IO_WRITE = "direct_io_write";

@:keep
final DIRECT_IO_READ = "direct_io_read";

@:keep
final DIRECT_IO_COPY = "direct_io_copy";

@:keep
final DIRECT_IO_MOVE = "direct_io_move";

@:keep
final DIRECT_IO_DELETE = "direct_io_delete";

@:keep
final DIRECT_IO_DIRLIST = "direct_io_dirlist";

@:keep
final DIRECT_IO_REJECT = "direct_io_reject";

/**
	Chooses the editor implementation route before a public PHP adapter creates
	or calls a concrete image editor.
**/
@:keep
function imageEditorSelectionPlan(hasImplementation:Bool, supportsInputMime:Bool, supportsRequiredMethods:Bool, supportsOutputMime:Bool,
		loadSucceeded:Bool):String
{
	if (!hasImplementation)
	{
		return EDITOR_NO_IMPLEMENTATION;
	}
	if (!supportsInputMime)
	{
		return EDITOR_UNSUPPORTED_MIME;
	}
	if (!supportsRequiredMethods)
	{
		return EDITOR_MISSING_METHOD;
	}
	if (!supportsOutputMime)
	{
		return EDITOR_OUTPUT_FALLBACK;
	}
	return loadSucceeded ? EDITOR_SELECTED : EDITOR_LOAD_ERROR;
}

/**
	Models `image_make_intermediate_size()` branch ownership while the actual
	resize/save operations remain native image-editor behavior.
**/
@:keep
function intermediateSizePlan(width:Int, height:Int, editorAvailable:Bool, resizeSucceeded:Bool, saveSucceeded:Bool):String
{
	if (width <= 0 && height <= 0)
	{
		return INTERMEDIATE_NO_SIZE;
	}
	if (!editorAvailable)
	{
		return INTERMEDIATE_NO_EDITOR;
	}
	if (!resizeSucceeded)
	{
		return INTERMEDIATE_RESIZE_ERROR;
	}
	return saveSucceeded ? INTERMEDIATE_METADATA_READY : INTERMEDIATE_SAVE_ERROR;
}

/**
	Models missing image sub-size classification. `$tooLargeCount` represents
	registered sizes skipped because WordPress image geometry says they cannot
	be generated for the source image.
**/
@:keep
function missingSubsizesPlan(isImage:Bool, registeredCount:Int, existingCount:Int, tooLargeCount:Int):String
{
	if (!isImage)
	{
		return SUBSIZES_NON_IMAGE;
	}
	if (tooLargeCount >= registeredCount && registeredCount > 0)
	{
		return SUBSIZES_SKIP_TOO_LARGE;
	}
	return existingCount >= registeredCount - tooLargeCount ? SUBSIZES_ALL_REGISTERED : SUBSIZES_MISSING_SOME;
}

/**
	Chooses the metadata update path before public PHP mutates postmeta.
**/
@:keep
function metadataUpdatePlan(hasMetadata:Bool, hasOriginalFile:Bool, missingSubsizeCount:Int):String
{
	if (!hasMetadata && !hasOriginalFile)
	{
		return METADATA_INVALID_ATTACHMENT;
	}
	if (!hasMetadata)
	{
		return METADATA_CREATE_FROM_FILE;
	}
	return missingSubsizeCount > 0 ? METADATA_MAKE_MISSING : METADATA_RETURN_EXISTING;
}

/**
	Models credential request routing. Hostname parsing, nonce verification,
	option storage, form HTML, and constant handling remain PHP adapter work.
**/
@:keep
function filesystemCredentialsPlan(filterShortCircuited:Bool, typeIsDirect:Bool, nonceValid:Bool, hasPasswordCredentials:Bool, hasSshKeyCredentials:Bool,
		hasConnectionError:Bool):String
{
	if (filterShortCircuited)
	{
		return CREDENTIALS_FILTERED;
	}
	if (typeIsDirect)
	{
		return CREDENTIALS_DIRECT;
	}
	if (hasConnectionError)
	{
		return CREDENTIALS_ERROR_FORM;
	}
	if (!nonceValid)
	{
		return CREDENTIALS_FORM;
	}
	if (hasPasswordCredentials)
	{
		return CREDENTIALS_ACCEPT_PASSWORD;
	}
	return hasSshKeyCredentials ? CREDENTIALS_ACCEPT_SSH_KEYS : CREDENTIALS_FORM;
}

/**
	Routes filesystem method selection without owning PHP extension discovery,
	file ownership probes, or transport construction.
**/
@:keep
function filesystemMethodPlan(forcedMethod:Bool, directSameOwner:Bool, directWritable:Bool, allowRelaxedOwnership:Bool, requestedSsh:Bool, ssh2Available:Bool,
		ftpExtensionAvailable:Bool, socketsAvailable:Bool):String
{
	if (forcedMethod)
	{
		return METHOD_FORCED;
	}
	if (directSameOwner)
	{
		return METHOD_DIRECT_FILE_OWNER;
	}
	if (directWritable && allowRelaxedOwnership)
	{
		return METHOD_DIRECT_RELAXED;
	}
	if (requestedSsh && ssh2Available)
	{
		return METHOD_SSH2;
	}
	if (ftpExtensionAvailable)
	{
		return METHOD_FTP_EXT;
	}
	return socketsAvailable ? METHOD_FTP_SOCKETS : METHOD_UNAVAILABLE;
}

/**
	Classifies direct local filesystem operation intent. The actual operation
	uses native PHP file APIs in the public adapter/provider.
**/
@:keep
function directFilesystemIoPlan(operation:String, sourceExists:Bool, destinationExists:Bool, overwrite:Bool, recursive:Bool):String
{
	return switch operation.trim().toLowerCase()
	{
		case "put" | "write":
			DIRECT_IO_WRITE;
		case "get" | "read":
			sourceExists ? DIRECT_IO_READ : DIRECT_IO_REJECT;
		case "copy": sourceExists && (!destinationExists || overwrite) ? DIRECT_IO_COPY : DIRECT_IO_REJECT;
		case "move": sourceExists && (!destinationExists || overwrite) ? DIRECT_IO_MOVE : DIRECT_IO_REJECT;
		case "delete": sourceExists && (recursive || !destinationExists) ? DIRECT_IO_DELETE : DIRECT_IO_REJECT;
		case "dirlist":
			sourceExists ? DIRECT_IO_DIRLIST : DIRECT_IO_REJECT;
		case _:
			DIRECT_IO_REJECT;
	}
}
