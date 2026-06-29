package wphx.fixtures.compiler.php.facade;

import wphx.fixtures.compiler.php.facade.F4PhpArray.F4NativeValue;
import wphx.fixtures.compiler.php.facade.F4PhpArray.HaxeClassArray;

/**
	Compiler-owned public class ABI for the F4 facade fixture.
**/
@:wp.file("wp-includes/class-wphx-public-class.php")
@:wp.haxeBootstrap("WPHX_F4_CLASS_BOOTSTRAPPED")
@:wp.ifMissing
@:wp.order(30)
@:native("WPHX_Public_Class")
@:keep
class F4PublicClass extends F4PublicBase implements F4PublicInterface
{
	@:wp.const
	public static final KIND:String = "fixture";

	public static var instances:Int = 0;

	public var name:String;

	@:wp.visibility("protected")
	var meta:Null<F4PhpArray>;

	public function new(name:String, @:wp.defaultArray meta:Null<F4PhpArray> = null)
	{
		super();
		this.baseValue = "base-" + name;
		this.name = name;
		this.meta = meta;
		F4PublicClass.instances = F4PublicClass.instances + 1;
	}

	public static function factory(name:String):F4PublicClass
	{
		return new F4PublicClass(name, {fromFactory: true});
	}

	public function describe():String
	{
		return HaxeClassKernel.describe(this.name, HaxeClassArray.count(this.meta));
	}

	public function get_meta(key:String, @:wp.name("default") defaultValue:Null<F4NativeValue> = null):Null<F4NativeValue>
	{
		return HaxeClassArray.get(this.meta, key, defaultValue);
	}
}
