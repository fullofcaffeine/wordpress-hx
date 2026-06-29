package wphx.fixtures.compiler.php.facade;

/**
	Compiler-owned public interface ABI for the F4 facade fixture.
**/
@:wp.file("wp-includes/class-wphx-public-class.php")
@:wp.haxeBootstrap("WPHX_F4_CLASS_BOOTSTRAPPED")
@:wp.ifMissing
@:wp.order(10)
@:native("WPHX_Public_Interface")
@:keep
interface F4PublicInterface
{
	public function describe():String;
}
