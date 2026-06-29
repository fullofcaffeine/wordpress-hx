package wphx.fixtures.compiler.php.facade;

import wphx.fixtures.php.facade.FacadeKernel.FacadeCallback;

/**
	Compiler-owned public `add_filter` adapter for the F1 facade fixture.
**/
@:wp.file("wp-includes/plugin.php")
@:wp.haxeBootstrap("WPHX_F1_FACADE_BOOTSTRAPPED")
@:wp.global("add_filter")
@:wp.ifMissing
@:keep
function addFilter(hook_name:String, callback:FacadeCallback, priority:Int = 10, accepted_args:Int = 1):Bool
{
	return HaxeFacadeKernel.addFilter(hook_name, callback, priority, accepted_args);
}
