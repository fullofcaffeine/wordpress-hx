package wphx.fixtures.compiler.php.pluggable;

/**
	Minimized pluggable.php-style guarded declarations for load-timing probes.
**/
@:wp.file("wp-includes/pluggable.php")
@:wp.global("wphx_pluggable_token")
@:wp.ifMissing
@:keep
function token(subject:String = "core"):String
{
	return "pluggable:" + subject;
}

@:wp.file("wp-includes/pluggable.php")
@:wp.global("wphx_pluggable_user_id")
@:wp.ifMissing
@:keep
function userId():Int
{
	return 123;
}
