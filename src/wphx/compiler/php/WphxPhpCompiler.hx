package wphx.compiler.php;

#if (macro || reflaxe_runtime)
import haxe.Json;
import haxe.io.Path;
import haxe.macro.Context;
import haxe.macro.Expr;
import haxe.macro.Type;
import haxe.macro.TypeTools;
import reflaxe.GenericCompiler;
import reflaxe.data.ClassFuncData;
import reflaxe.data.ClassVarData;
import reflaxe.data.EnumOptionData;
import sys.FileSystem;
import sys.io.File;

using reflaxe.helpers.ClassFieldHelper;

private typedef GeneratedPhpFile =
{
	final path:String;
	final content:String;
	final declarations:Array<EmissionDeclaration>;
}

private typedef EmissionDeclaration =
{
	final kind:String;
	final name:String;
	final haxeModule:String;
	final guarded:Bool;
	final source:String;
}

private typedef PendingFunction =
{
	final file:String;
	final phpName:String;
	final guarded:Bool;
	final haxeBootstrap:Null<String>;
	final haxeModule:String;
	final field:ClassField;
	final expr:TypedExpr;
}

private typedef PendingClass =
{
	final file:String;
	final phpName:String;
	final guarded:Bool;
	final haxeBootstrap:Null<String>;
	final order:Int;
	final classType:ClassType;
}

private typedef EmissionManifest =
{
	final schema:String;
	final generator:String;
	final output_profile:String;
	final files:Array<EmissionManifestFile>;
	final unsupported:Array<String>;
}

private typedef EmissionManifestFile =
{
	final path:String;
	final bytes:Int;
	final declarations:Array<EmissionDeclaration>;
}

private typedef TypedFunctionArg =
{
	final v:TVar;
	final value:Null<TypedExpr>;
}

/**
	Small Reflaxe-backed PHP emitter for WordPress-shaped public files.

	The first implementation is intentionally narrow: annotated module-level
	functions and public classes compile to original-path PHP files plus an
	emission manifest. Wider PHP semantics should be added only with fixture
	pressure from facade or WordPress driver gates.
**/
class WphxPhpCompiler extends GenericCompiler<String, String, String, String, String>
{
	var modules:Array<ModuleType> = [];
	var unsupported:Array<String> = [];

	public function new()
	{
		super();
	}

	override public function filterTypes(moduleTypes:Array<ModuleType>):Array<ModuleType>
	{
		modules = moduleTypes.copy();
		return moduleTypes;
	}

	override public function generateFilesManually():Void
	{
		if (output == null)
		{
			Context.fatalError("WPHX PHP output manager is not initialized", Context.currentPos());
			return;
		}

		final files = buildFiles();
		for (file in files)
		{
			output.saveFile(file.path, file.content);
		}
		output.saveFile(manifestPath(), manifestJson(files));
	}

	public function generateOutputIterator():Iterator<reflaxe.output.DataAndFileInfo<reflaxe.output.StringOrBytes>>
	{
		return [].iterator();
	}

	public function compileClassImpl(classType:ClassType, varFields:Array<ClassVarData>, funcFields:Array<ClassFuncData>):Null<String>
	{
		return null;
	}

	public function compileEnumImpl(enumType:EnumType, options:Array<EnumOptionData>):Null<String>
	{
		if (hasAnyWpMetadata(enumType.meta.get()))
		{
			unsupported.push("enum emission is not supported yet: " + enumType.module + "." + enumType.name);
		}
		return null;
	}

	public function compileExpressionImpl(expr:TypedExpr, topLevel:Bool):Null<String>
	{
		return null;
	}

	function buildFiles():Array<GeneratedPhpFile>
	{
		final functions = new Array<PendingFunction>();
		final classes = new Array<PendingClass>();

		for (moduleType in modules)
		{
			switch (moduleType)
			{
				case TClassDecl(classRef):
					final classType = classRef.get();
					collectClass(classType, functions, classes);
				case TEnumDecl(_), TTypeDecl(_), TAbstract(_):
			}
		}

		classes.sort((left, right) ->
		{
			final fileCompare = Reflect.compare(left.file, right.file);
			if (fileCompare != 0)
			{
				return fileCompare;
			}
			final orderCompare = Reflect.compare(left.order, right.order);
			return orderCompare != 0 ? orderCompare : Reflect.compare(left.phpName, right.phpName);
		});

		final byPath = new Map<String, Array<String>>();
		final declarationsByPath = new Map<String, Array<EmissionDeclaration>>();
		final haxeBootstrapsByPath = new Map<String, String>();

		for (pending in functions)
		{
			rememberHaxeBootstrap(haxeBootstrapsByPath, pending.file, pending.haxeBootstrap);
			appendFilePart(byPath, declarationsByPath, pending.file, emitFunction(pending), {
				kind: "global-function",
				name: pending.phpName,
				haxeModule: pending.haxeModule,
				guarded: pending.guarded,
				source: sourceLabel(pending.field.pos)
			});
		}

		for (pending in classes)
		{
			rememberHaxeBootstrap(haxeBootstrapsByPath, pending.file, pending.haxeBootstrap);
			appendFilePart(byPath, declarationsByPath, pending.file, emitClass(pending), {
				kind: pending.classType.isInterface ? "interface" : "class",
				name: pending.phpName,
				haxeModule: pending.classType.module,
				guarded: pending.guarded,
				source: sourceLabel(pending.classType.pos)
			});
		}

		final paths = [for (path in byPath.keys()) path];
		paths.sort(Reflect.compare);

		final files = new Array<GeneratedPhpFile>();
		for (path in paths)
		{
			final parts = byPath.get(path);
			final declarations = declarationsByPath.get(path);
			final prologue = haxeBootstrapsByPath.exists(path) ? [emitHaxeBootstrap(haxeBootstrapsByPath.get(path))] : [];
			final contentParts = prologue.concat(parts);
			files.push({
				path: path,
				content: "<?php\n" + contentParts.join("\n\n") + "\n",
				declarations: declarations == null ? [] : declarations
			});
		}
		return files;
	}

	function collectClass(classType:ClassType, functions:Array<PendingFunction>, classes:Array<PendingClass>):Void
	{
		final classFile = metadataString(classType.meta.get(), "wp.file");
		final className = metadataString(classType.meta.get(), "native");
		if (classFile != null && className != null && !isModuleFieldsClass(classType))
		{
			classes.push({
				file: classFile,
				phpName: className,
				guarded: hasMetadata(classType.meta.get(), "wp.ifMissing"),
				haxeBootstrap: metadataString(classType.meta.get(), "wp.haxeBootstrap"),
				order: metadataInt(classType.meta.get(), "wp.order") ?? 0,
				classType: classType
			});
		}

		for (field in classType.statics.get())
		{
			final phpName = metadataString(field.meta.get(), "wp.global");
			if (phpName == null)
			{
				continue;
			}
			final file = metadataString(field.meta.get(), "wp.file") ?? classFile;
			if (file == null)
			{
				reportUnsupported("missing @:wp.file for global function " + field.name);
				continue;
			}
			final expr = field.expr();
			if (expr == null)
			{
				reportUnsupported("missing body for global function " + field.name);
				continue;
			}
			functions.push({
				file: file,
				phpName: phpName,
				guarded: hasMetadata(field.meta.get(), "wp.ifMissing"),
				haxeBootstrap: metadataString(field.meta.get(), "wp.haxeBootstrap") ?? metadataString(classType.meta.get(), "wp.haxeBootstrap"),
				haxeModule: classType.module,
				field: field,
				expr: expr
			});
		}
	}

	function emitFunction(pending:PendingFunction):String
	{
		final fn = functionOf(pending.expr, "global function " + pending.phpName);
		final body = emitBody(fn.expr);
		final header = "function " + pending.phpName + "(" + emitArgs(fn.args) + ")";
		final decl = header + "\n{\n" + indent(body) + "\n}";
		if (!pending.guarded)
		{
			return decl;
		}
		return "if (!function_exists('" + pending.phpName + "')) {\n" + indent(decl) + "\n}";
	}

	function emitHaxeBootstrap(constant:String):String
	{
		return "if (!defined('"
			+ constant
			+ "')) {\n"
			+ "\tdefine('"
			+ constant
			+ "', true);\n"
			+ "\t$wphx_haxe_lib = dirname(__DIR__, 2) . '/haxe/lib';\n"
			+ "\tset_include_path(get_include_path() . PATH_SEPARATOR . $wphx_haxe_lib);\n"
			+ "\tspl_autoload_register(function ($class) {\n"
			+ "\t\t$file = stream_resolve_include_path(str_replace('\\\\', '/', $class) . '.php');\n"
			+ "\t\tif ($file) {\n"
			+ "\t\t\tinclude_once $file;\n"
			+ "\t\t}\n"
			+ "\t});\n"
			+ "\t\\php\\Boot::__hx__init();\n"
			+ "}";
	}

	function emitClass(pending:PendingClass):String
	{
		if (pending.classType.isInterface)
		{
			return emitInterface(pending);
		}

		final lines = new Array<String>();
		lines.push("class " + pending.phpName + emitInheritance(pending.classType));
		lines.push("{");

		for (field in pending.classType.statics.get())
		{
			if (hasMetadata(field.meta.get(), "wp.const"))
			{
				final expr = field.expr();
				if (expr == null)
				{
					reportUnsupported("missing const value for " + pending.phpName + "::" + field.name);
					continue;
				}
				lines.push("\tpublic const " + phpIdent(field.name) + " = " + emitExpr(expr) + ";");
			}
		}

		for (field in pending.classType.statics.get())
		{
			if (hasMetadata(field.meta.get(), "wp.const") || !field.kind.match(FVar(_, _)))
			{
				continue;
			}
			final visibility = phpVisibility(field);
			if (visibility == null)
			{
				continue;
			}
			final expr = field.expr();
			lines.push("\t" + visibility + " static $" + phpIdent(field.name) + (expr == null ? "" : " = " + emitExpr(expr)) + ";");
		}

		for (field in pending.classType.fields.get())
		{
			final visibility = phpVisibility(field);
			if (field.kind.match(FVar(_, _)) && visibility != null)
			{
				lines.push("\t" + visibility + " $" + phpIdent(field.name) + ";");
			}
		}

		for (field in pending.classType.statics.get())
		{
			final expr = field.expr();
			if (expr == null || !field.kind.match(FMethod(_)))
			{
				continue;
			}
			final fn = functionOf(expr, "static method " + field.name);
			lines.push("\tpublic static function " + phpIdent(field.name) + "(" + emitArgs(fn.args) + ")");
			lines.push("\t{");
			lines.push(indent(emitBody(fn.expr), "\t\t"));
			lines.push("\t}");
		}

		if (pending.classType.constructor != null)
		{
			final field = pending.classType.constructor.get();
			final expr = field.expr();
			if (expr != null)
			{
				final fn = functionOf(expr, "constructor " + pending.classType.name);
				lines.push("\tpublic function __construct(" + emitArgs(fn.args) + ")");
				lines.push("\t{");
				lines.push(indent(emitBody(fn.expr), "\t\t"));
				lines.push("\t}");
			}
		}

		for (field in pending.classType.fields.get())
		{
			final expr = field.expr();
			if (expr == null || !field.kind.match(FMethod(_)))
			{
				continue;
			}
			final phpName = field.name == "new" ? "__construct" : phpIdent(field.name);
			final fn = functionOf(expr, "method " + field.name);
			lines.push("\tpublic function " + phpName + "(" + emitArgs(fn.args) + ")");
			lines.push("\t{");
			lines.push(indent(emitBody(fn.expr), "\t\t"));
			lines.push("\t}");
		}

		lines.push("}");
		final decl = lines.join("\n");
		if (!pending.guarded)
		{
			return decl;
		}
		return "if (!class_exists('" + pending.phpName + "', false)) {\n" + indent(decl) + "\n}";
	}

	function emitInterface(pending:PendingClass):String
	{
		final lines = new Array<String>();
		lines.push("interface " + pending.phpName);
		lines.push("{");
		for (field in pending.classType.fields.get())
		{
			if (!field.kind.match(FMethod(_)))
			{
				continue;
			}
			lines.push("\tpublic function " + phpIdent(field.name) + "(" + emitInterfaceArgs(field) + ");");
		}
		lines.push("}");

		final decl = lines.join("\n");
		if (!pending.guarded)
		{
			return decl;
		}
		return "if (!interface_exists('" + pending.phpName + "', false)) {\n" + indent(decl) + "\n}";
	}

	function emitInheritance(classType:ClassType):String
	{
		final parts = new Array<String>();
		if (classType.superClass != null)
		{
			parts.push("extends " + phpClassName(classType.superClass.t.get()));
		}
		if (classType.interfaces.length > 0)
		{
			parts.push("implements " + classType.interfaces.map(item -> phpClassName(item.t.get())).join(", "));
		}
		return parts.length == 0 ? "" : " " + parts.join(" ");
	}

	function emitInterfaceArgs(field:ClassField):String
	{
		return switch (field.type)
		{
			case TFun(args, _):
				args.map(arg -> "$" + phpIdent(arg.name)).join(", ");
			case _:
				reportUnsupported("unsupported interface method type for " + field.name);
				"";
		}
	}

	function emitArgs(args:Array<TypedFunctionArg>):String
	{
		return args.map(arg -> "$" + phpIdent(tvarMetadataString(arg.v, "wp.name") ?? arg.v.name) + emitArgDefault(arg)).join(", ");
	}

	function emitArgDefault(arg:TypedFunctionArg):String
	{
		if (tvarHasMetadata(arg.v, "wp.defaultArray"))
		{
			return " = []";
		}
		return emitDefault(arg.value);
	}

	function emitDefault(value:Null<TypedExpr>):String
	{
		return value == null ? "" : " = " + emitExpr(value);
	}

	function emitBody(expr:TypedExpr):String
	{
		return switch (expr.expr)
		{
			case TBlock(exprs):
				exprs.map(emitStatement).join("\n");
			case _:
				emitStatement(expr);
		}
	}

	function emitStatement(expr:TypedExpr):String
	{
		return switch (expr.expr)
		{
			case TReturn(value):
				value == null ? "return;" : "return " + emitExpr(value) + ";";
			case TVar(v, value):
				final rhs = value == null ? "" : " = " + emitExpr(value);
				"$" + phpVarName(v) + rhs + ";";
			case TBlock(_):
				emitBody(expr);
			case _:
				emitExpr(expr) + ";";
		}
	}

	function emitExpr(expr:TypedExpr):String
	{
		return switch (expr.expr)
		{
			case TConst(constant):
				switch (constant)
				{
					case TInt(value):
						Std.string(value);
					case TFloat(value):
						value;
					case TString(value):
						quote(value);
					case TBool(value):
						value ? "true" : "false";
					case TNull:
						"null";
					case TThis:
						"$this";
					case TSuper:
						"parent";
				}
			case TLocal(v):
				"$" + phpVarName(v);
			case TParenthesis(inner):
				"(" + emitExpr(inner) + ")";
			case TBinop(op, left, right):
				emitBinop(op, left, right);
			case TField(target, access):
				emitField(target, access);
			case TCall(target, args):
				emitCall(target, args);
			case TNew(classRef, _, args):
				"new " + phpClassName(classRef.get()) + "(" + args.map(emitExpr).join(", ") + ")";
			case TArrayDecl(values):
				"[" + values.map(emitExpr).join(", ") + "]";
			case TObjectDecl(fields):
				"[" + fields.map(field -> quote(field.name) + " => " + emitExpr(field.expr)).join(", ") + "]";
			case _:
				reportUnsupported("unsupported expression " + expr.expr.getName() + " at " + sourceLabel(expr.pos));
				"null";
		}
	}

	function emitBinop(op:Binop, left:TypedExpr, right:TypedExpr):String
	{
		if (op.match(OpAdd) && (isStringExpr(left) || isStringExpr(right)))
		{
			return emitExpr(left) + " . " + emitExpr(right);
		}

		final opText = switch (op)
		{
			case OpAdd: "+";
			case OpSub: "-";
			case OpMult: "*";
			case OpDiv: "/";
			case OpEq: "==";
			case OpNotEq: "!=";
			case OpGt: ">";
			case OpGte: ">=";
			case OpLt: "<";
			case OpLte: "<=";
			case OpBoolAnd: "&&";
			case OpBoolOr: "||";
			case OpAssign: "=";
			case OpAssignOp(OpAdd): "+=";
			case OpAssignOp(OpSub): "-=";
			case _: null;
		}
		if (opText == null)
		{
			reportUnsupported("unsupported binary operator " + Std.string(op));
			return "null";
		}
		return emitExpr(left) + " " + opText + " " + emitExpr(right);
	}

	function emitCall(target:TypedExpr, args:Array<TypedExpr>):String
	{
		switch (target.expr)
		{
			case TConst(TSuper):
				return "parent::__construct(" + args.map(emitExpr).join(", ") + ")";
			case TField(_, FStatic(classRef, fieldRef)):
				final lowered = emitNativeArrayCall(classRef.get(), fieldRef.get(), args);
				if (lowered != null)
				{
					return lowered;
				}
			case _:
		}
		return emitExpr(target) + "(" + args.map(emitExpr).join(", ") + ")";
	}

	function emitNativeArrayCall(classType:ClassType, field:ClassField, args:Array<TypedExpr>):Null<String>
	{
		final phpFunction = metadataString(field.meta.get(), "wp.phpFunction");
		if (phpFunction != null)
		{
			return phpFunction + "(" + args.map(emitExpr).join(", ") + ")";
		}

		if (hasMetadata(field.meta.get(), "wp.phpArrayGet"))
		{
			if (args.length != 3)
			{
				reportUnsupported("php array get lowering expects 3 arguments for " + classType.module + "." + field.name);
				return "null";
			}
			final array = emitExpr(args[0]);
			final key = emitExpr(args[1]);
			final fallback = emitExpr(args[2]);
			return "(array_key_exists(" + key + ", " + array + ") ? " + array + "[" + key + "] : " + fallback + ")";
		}
		return switch (field.name)
		{
			case "keyExists" if (args.length == 2):
				"array_key_exists(" + emitExpr(args[1]) + ", " + emitExpr(args[0]) + ")";
			case _:
				null;
		}
	}

	function isStringExpr(expr:TypedExpr):Bool
	{
		return TypeTools.toString(expr.t) == "String";
	}

	function emitField(target:TypedExpr, access:FieldAccess):String
	{
		return switch (access)
		{
			case FInstance(_, _, field):
				emitExpr(target) + "->" + phpIdent(field.get().name);
			case FStatic(classRef, field):
				final fieldValue = field.get();
				final delimiter = fieldValue.kind.match(FVar(_, _)) ? "::$" : "::";
				phpClassName(classRef.get()) + delimiter + phpIdent(fieldValue.name);
			case FClosure(_, field):
				emitExpr(target) + "->" + phpIdent(field.get().name);
			case FAnon(field):
				emitExpr(target) + "[" + quote(field.get().name) + "]";
			case FDynamic(name):
				emitExpr(target) + "->" + phpIdent(name);
			case _:
				reportUnsupported("unsupported field access at " + sourceLabel(target.pos));
				"null";
		}
	}

	function functionOf(expr:TypedExpr, label:String):TFunc
	{
		return switch (expr.expr)
		{
			case TFunction(fn):
				fn;
			case _:
				Context.fatalError("Expected function body for " + label, expr.pos);
		}
	}

	function appendFilePart(byPath:Map<String, Array<String>>, declarationsByPath:Map<String, Array<EmissionDeclaration>>, path:String, content:String,
			declaration:EmissionDeclaration):Void
	{
		if (!byPath.exists(path))
		{
			byPath.set(path, []);
			declarationsByPath.set(path, []);
		}
		byPath.get(path).push(content);
		declarationsByPath.get(path).push(declaration);
	}

	function rememberHaxeBootstrap(haxeBootstrapsByPath:Map<String, String>, path:String, constant:Null<String>):Void
	{
		if (constant == null)
		{
			return;
		}
		if (haxeBootstrapsByPath.exists(path) && haxeBootstrapsByPath.get(path) != constant)
		{
			reportUnsupported("multiple Haxe bootstrap constants for " + path);
			return;
		}
		haxeBootstrapsByPath.set(path, constant);
	}

	function manifestJson(files:Array<GeneratedPhpFile>):String
	{
		final generated = files.map(file -> ({
			path: file.path,
			bytes: file.content.length,
			declarations: file.declarations
		}));
		final manifest:EmissionManifest = {
			schema: "wphx.php-emission.v1",
			generator: "wphx.compiler.php.WphxPhpCompiler",
			output_profile: Context.definedValue("wphx_php_profile") ?? "wordpress",
			files: generated,
			unsupported: unsupported
		};
		return Json.stringify(manifest, null, "  ") + "\n";
	}

	function manifestPath():String
	{
		final requested = Context.definedValue("wphx_php_manifest");
		if (requested == null || StringTools.trim(requested) == "")
		{
			return "wphx-php-emission.v1.json";
		}

		if (output != null && output.outputDir != null)
		{
			final normalizedOutput = Path.normalize(output.outputDir);
			final normalizedRequested = Path.normalize(requested);
			if (StringTools.startsWith(normalizedRequested, normalizedOutput + "/"))
			{
				return normalizedRequested.substr(normalizedOutput.length + 1);
			}
		}
		return requested;
	}

	function metadataString(entries:Array<MetadataEntry>, name:String):Null<String>
	{
		for (entry in entries)
		{
			if (!metadataNameMatches(entry.name, name) || entry.params.length == 0)
			{
				continue;
			}
			return switch (entry.params[0].expr)
			{
				case EConst(CString(value, _)): value;
				case _: null;
			}
		}
		return null;
	}

	function tvarMetadataString(v:TVar, name:String):Null<String>
	{
		return v.meta == null ? null : metadataString(v.meta.get(), name);
	}

	function tvarHasMetadata(v:TVar, name:String):Bool
	{
		return v.meta != null && hasMetadata(v.meta.get(), name);
	}

	function metadataInt(entries:Array<MetadataEntry>, name:String):Null<Int>
	{
		for (entry in entries)
		{
			if (!metadataNameMatches(entry.name, name) || entry.params.length == 0)
			{
				continue;
			}
			return switch (entry.params[0].expr)
			{
				case EConst(CInt(value, _)): Std.parseInt(value);
				case _: null;
			}
		}
		return null;
	}

	function hasMetadata(entries:Array<MetadataEntry>, name:String):Bool
	{
		for (entry in entries)
		{
			if (metadataNameMatches(entry.name, name))
			{
				return true;
			}
		}
		return false;
	}

	function hasAnyWpMetadata(entries:Array<MetadataEntry>):Bool
	{
		for (entry in entries)
		{
			if (StringTools.startsWith(entry.name, ":wp.") || StringTools.startsWith(entry.name, "wp."))
			{
				return true;
			}
		}
		return false;
	}

	function metadataNameMatches(actual:String, expected:String):Bool
	{
		return actual == expected || actual == ":" + expected;
	}

	function sourceLabel(pos:Position):String
	{
		return Context.getPosInfos(pos).file;
	}

	function reportUnsupported(message:String):Void
	{
		if (unsupported.indexOf(message) == -1)
		{
			unsupported.push(message);
		}
	}

	function isModuleFieldsClass(classType:ClassType):Bool
	{
		return StringTools.endsWith(classType.name, "_Fields_");
	}

	function phpClassName(classType:ClassType):String
	{
		final nativeName = metadataString(classType.meta.get(), "native");
		return nativeName ?? classType.name;
	}

	function phpVisibility(field:ClassField):Null<String>
	{
		final requested = metadataString(field.meta.get(), "wp.visibility");
		if (requested != null)
		{
			return switch (requested)
			{
				case "public", "protected", "private": requested;
				case _:
					reportUnsupported("unsupported visibility " + requested + " for " + field.name);
					null;
			}
		}
		return field.isPublic ? "public" : null;
	}

	function phpVarName(v:TVar):String
	{
		return phpIdent(tvarMetadataString(v, "wp.name") ?? v.name);
	}

	function phpIdent(value:String):String
	{
		return switch (value)
		{
			case "new": "__construct";
			case _: value;
		}
	}

	function quote(value:String):String
	{
		return "'" + value.split("\\").join("\\\\").split("'").join("\\'") + "'";
	}

	function indent(value:String, prefix:String = "\t"):String
	{
		return value.split("\n").map(line -> line == "" ? line : prefix + line).join("\n");
	}
}
#end
