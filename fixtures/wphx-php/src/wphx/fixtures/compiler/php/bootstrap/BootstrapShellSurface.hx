package wphx.fixtures.compiler.php.bootstrap;

/**
	Two original-path public adapters sharing one Haxe bootstrap constant.
**/
@:wp.file("wp-includes/wphx-bootstrap-a.php")
@:wp.haxeBootstrap("WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED")
@:wp.global("wphx_bootstrap_probe_a")
@:wp.ifMissing
@:keep
function probeA(label:String = "a"):String
{
	return HaxeBootstrapKernel.mark(label);
}

@:wp.file("wp-includes/wphx-bootstrap-b.php")
@:wp.haxeBootstrap("WPHX_BOOTSTRAP_AUTOLOAD_BOOTSTRAPPED")
@:wp.global("wphx_bootstrap_probe_b")
@:wp.ifMissing
@:keep
function probeB(label:String = "b"):String
{
	return HaxeBootstrapKernel.mark(label);
}
