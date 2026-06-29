package wphx.fixtures.compiler.php.facade;

/**
	Compiler-owned public base-class ABI for the F4 facade fixture.
**/
@:wp.file("wp-includes/class-wphx-public-class.php")
@:wp.haxeBootstrap("WPHX_F4_CLASS_BOOTSTRAPPED")
@:wp.ifMissing
@:wp.order(20)
@:native("WPHX_Public_Base")
@:keep
class F4PublicBase
{
	@:wp.const
	public static final BASE_KIND:String = "base";

	public var baseValue:String;

	public function new(base_value:String = "base-default")
	{
		this.baseValue = base_value;
	}

	public function base_label():String
	{
		return HaxeClassKernel.baseLabel(this.baseValue);
	}
}
