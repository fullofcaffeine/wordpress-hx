package wphx.fixtures.compiler.php.bootstrap;

/**
	Original-path public adapter that intentionally crosses from WPHX shell
	code into stock Haxe PHP implementation code and throws for debug probes.
**/
@:wp.file("wp-includes/wphx-bootstrap-debug.php")
@:wp.haxeBootstrap("WPHX_BOOTSTRAP_DEBUG_BOOTSTRAPPED")
@:wp.global("wphx_bootstrap_debug_fail")
@:wp.ifMissing
@:keep
function fail(label:String = "debug"):String
{
	return HaxeBootstrapKernel.fail(label);
}
