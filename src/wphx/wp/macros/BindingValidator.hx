package wphx.wp.macros;

#if macro
import haxe.Json;
import haxe.macro.Context;
import haxe.macro.Expr;
import haxe.macro.Type;
import sys.io.File;

using StringTools;
#end

class BindingValidator
{
	#if macro
	static inline final diagnostic = "WPHX-202";
	static final metaKinds = [
		":wp.global" => "function",
		":wp.method" => "method",
		":wp.class" => "class",
		":wp.constant" => "constant"
	];

	static var abi:Null<AbiIndex> = null;

	public static macro function build():Array<Field>
	{
		final fields = Context.getBuildFields();
		final index = loadAbi();
		validateClassMetadata(index);
		for (field in fields)
		{
			validateFieldMetadata(index, field);
		}
		return fields;
	}

	static function validateClassMetadata(index:AbiIndex):Void
	{
		final localClass = Context.getLocalClass();
		if (localClass == null)
		{
			return;
		}
		for (meta in localClass.get().meta.get())
		{
			if (meta.name == ":wp.class")
			{
				final binding = parseBinding(meta);
				resolveEntry(index, binding, "class", meta.pos);
			}
		}
	}

	static function validateFieldMetadata(index:AbiIndex, field:Field):Void
	{
		for (meta in field.meta)
		{
			final expectedKind = metaKinds.get(meta.name);
			if (expectedKind == null || meta.name == ":wp.class")
			{
				continue;
			}
			final binding = parseBinding(meta);
			final entry = resolveEntry(index, binding, expectedKind, meta.pos);
			validateFieldShape(field, meta, binding, entry);
		}
	}

	static function validateFieldShape(field:Field, meta:MetadataEntry, binding:Binding, entry:AbiEntry):Void
	{
		switch field.kind
		{
			case FFun(fn):
				if (meta.name == ":wp.global" && !hasStaticAccess(field))
				{
					fail('${binding.label} must annotate a static function', meta.pos);
				}
				if (meta.name == ":wp.method")
				{
					final expectedStatic = entry.flags != null && Reflect.field(entry.flags, "static") == true;
					if (expectedStatic != hasStaticAccess(field))
					{
						fail('${binding.label} static modifier does not match ABI method ${entry.name}', meta.pos);
					}
				}
				validateArity(binding, entry, fn.args.length, meta.pos);
			default:
				if (meta.name != ":wp.constant")
				{
					fail('${binding.label} must annotate a function field', meta.pos);
				}
		}
	}

	static function validateArity(binding:Binding, entry:AbiEntry, actual:Int, pos:Position):Void
	{
		if (entry.parameters == null)
		{
			return;
		}
		final params:Array<AbiParameter> = entry.parameters;
		var required = 0;
		var variadic = false;
		for (param in params)
		{
			if (param.variadic)
			{
				variadic = true;
			}
			if (param.default_source == null && !param.variadic)
			{
				required++;
			}
		}
		final max = variadic ? null : params.length;
		if (actual < required || (max != null && actual > max))
		{
			final range = max == null ? '${required}..*' : '${required}..${max}';
			fail('${binding.label} expects ${range} parameters, got ${actual}', pos);
		}
	}

	static function hasStaticAccess(field:Field):Bool
	{
		if (field.access == null)
		{
			return false;
		}
		for (access in field.access)
		{
			switch access
			{
				case AStatic:
					return true;
				default:
			}
		}
		return false;
	}

	static function resolveEntry(index:AbiIndex, binding:Binding, expectedKind:String, pos:Position):AbiEntry
	{
		final matches = index.byKindName.get('${expectedKind}:${binding.name}');
		if (matches == null || matches.length == 0)
		{
			final otherKinds = index.kindsByName.get(binding.name);
			if (otherKinds != null)
			{
				fail('${binding.label} expected ABI kind ${expectedKind}, found ${otherKinds.join(", ")}', pos);
			}
			fail('${binding.label} did not match any ABI entry', pos);
		}

		final narrowed = binding.path == null ? matches : matches.filter((entry) -> entry.path == binding.path);
		if (narrowed.length == 0)
		{
			final candidates = matches.map((entry) -> entry.path).join(", ");
			fail('${binding.label} did not match source path ${binding.path}. Candidates: ${candidates}', pos);
		}
		if (narrowed.length > 1)
		{
			final candidates = narrowed.map((entry) -> entry.path).join(", ");
			fail('${binding.label} is ambiguous; add a source path. Candidates: ${candidates}', pos);
		}
		return narrowed[0];
	}

	static function parseBinding(meta:MetadataEntry):Binding
	{
		if (meta.params.length < 1 || meta.params.length > 2)
		{
			fail('${meta.name} expects one ABI name string and optional source path string', meta.pos);
		}
		final name = stringParam(meta.params[0]);
		final path = meta.params.length == 2 ? stringParam(meta.params[1]) : null;
		final args = path == null ? '"${name}"' : '"${name}", "${path}"';
		return {
			name: name,
			path: path,
			label: '${meta.name}(${args})'
		};
	}

	static function stringParam(expr:Expr):String
	{
		return switch expr.expr
		{
			case EConst(CString(value, _)): value;
			default: fail("WordPress ABI metadata arguments must be string literals", expr.pos);
		}
	}

	static function loadAbi():AbiIndex
	{
		if (abi != null)
		{
			return abi;
		}
		final path = Context.definedValue("wphx.wp.abi");
		if (path == null || path.trim() == "")
		{
			fail('missing -D wphx.wp.abi=<manifest path>', Context.currentPos());
		}
		final manifest:RawAbiJson = Json.parse(File.getContent(path));
		if (Reflect.field(manifest, "schema") != "wphx.php-abi-manifest.v1")
		{
			fail('unexpected ABI manifest schema in ${path}', Context.currentPos());
		}

		final byKindName = new Map<String, Array<AbiEntry>>();
		final kindsByName = new Map<String, Array<String>>();
		final entries:Array<RawAbiJson> = Reflect.field(manifest, "entries");
		for (raw in entries)
		{
			final entry:AbiEntry = {
				kind: Reflect.field(raw, "kind"),
				name: Reflect.field(raw, "name"),
				path: Reflect.field(raw, "path"),
				parameters: Reflect.field(raw, "parameters"),
				flags: Reflect.field(raw, "flags")
			};
			final key = '${entry.kind}:${entry.name}';
			if (!byKindName.exists(key))
			{
				byKindName.set(key, []);
			}
			byKindName.get(key).push(entry);

			if (!kindsByName.exists(entry.name))
			{
				kindsByName.set(entry.name, []);
			}
			final kinds = kindsByName.get(entry.name);
			if (!kinds.contains(entry.kind))
			{
				kinds.push(entry.kind);
				kinds.sort((a, b) -> Reflect.compare(a, b));
			}
		}
		abi = {
			path: path,
			byKindName: byKindName,
			kindsByName: kindsByName
		};
		return abi;
	}

	static function fail<T>(message:String, pos:Position):T
	{
		Context.error('${diagnostic}: ${message}', pos);
		throw message;
	}
	#end
}

#if macro
private typedef Binding =
{
	final name:String;
	final path:Null<String>;
	final label:String;
};

private typedef AbiIndex =
{
	final path:String;
	final byKindName:Map<String, Array<AbiEntry>>;
	final kindsByName:Map<String, Array<String>>;
};

private typedef AbiEntry =
{
	final kind:String;
	final name:String;
	final path:String;
	final parameters:Null<Array<AbiParameter>>;
	final flags:RawAbiJson;
};

private typedef AbiParameter =
{
	final default_source:Null<String>;
	final variadic:Bool;
};

/**
	WPHX-211: ABI manifests enter macros as untyped JSON objects from haxe.Json.
	Reflect-based field reads are isolated to this typedef before indexing.
**/
private typedef RawAbiJson = Dynamic;
#end
