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
import wphx.compiler.php.WphxPhpWordPressAdapters.WordPressAdapterTemplateProvenance;

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

private typedef AdapterFileDeclaration =
{
	final file:String;
	final declaration:AdapterDeclaration;
}

private enum AdapterDeclaration
{
	GlobalFunctionAdapter(declaration:AdapterGlobalFunction);
	ClassAdapter(declaration:AdapterClass);
	ScriptAdapter(declaration:AdapterScript);
}

private typedef AdapterGlobalFunction =
{
	final phpName:String;
	final guarded:Bool;
	final haxeBootstrap:Null<String>;
	final haxeModule:String;
	final field:ClassField;
	final expr:TypedExpr;
	final source:String;
}

private typedef AdapterClass =
{
	final phpName:String;
	final guarded:Bool;
	final haxeBootstrap:Null<String>;
	final order:Int;
	final classType:ClassType;
	final source:String;
}

private typedef AdapterScript =
{
	final adapter:String;
	final haxeModule:String;
	final source:String;
}

private typedef AdapterFilePlan =
{
	final path:String;
	final haxeBootstrap:Null<String>;
	final declarations:Array<AdapterDeclaration>;
}

private enum AdapterMethodBody
{
	TypedExprMethodBody(expr:TypedExpr);
}

enum PhpCoreStmt
{
	PhpIf(condition:PhpCoreExpr, body:Array<PhpCoreStmt>);
	PhpIfElse(condition:PhpCoreExpr, body:Array<PhpCoreStmt>, elseBody:Array<PhpCoreStmt>);
	PhpFor(init:PhpCoreExpr, condition:PhpCoreExpr, update:PhpCoreExpr, body:Array<PhpCoreStmt>);
	PhpForeach(iterable:PhpCoreExpr, valueVar:String, body:Array<PhpCoreStmt>);
	PhpForeachKeyValue(iterable:PhpCoreExpr, keyVar:String, valueVar:String, body:Array<PhpCoreStmt>);
	PhpTryCatch(tryBody:Array<PhpCoreStmt>, catchType:String, catchVar:String, catchBody:Array<PhpCoreStmt>);
	PhpAssign(target:PhpCoreExpr, value:PhpCoreExpr);
	PhpListAssign(names:Array<String>, value:PhpCoreExpr);
	PhpLocal(name:String, value:PhpCoreExpr);
	PhpStaticLocal(name:String, value:PhpCoreExpr);
	PhpExprStmt(expr:PhpCoreExpr);
	PhpReturn(value:PhpCoreExpr);
	PhpReturnVoid;
	PhpThrow(value:PhpCoreExpr);
	PhpRawBlock(code:String);
	PhpBreak;
	PhpContinue;
}

enum PhpCoreExpr
{
	PhpVar(name:String);
	PhpNull;
	PhpBool(value:Bool);
	PhpInt(value:Int);
	PhpString(value:String);
	PhpConst(name:String);
	PhpArrayRead(base:PhpCoreExpr, key:PhpCoreExpr);
	PhpArrayAppend(base:PhpCoreExpr);
	PhpLongArray(entries:Array<PhpCoreArrayEntry>);
	PhpNew(className:String, args:Array<PhpCoreExpr>);
	PhpNewDynamic(classExpr:PhpCoreExpr, args:Array<PhpCoreExpr>);
	PhpStaticCall(className:String, method:String, args:Array<PhpCoreExpr>);
	PhpClassConst(className:String, constName:String);
	PhpMethodCall(target:PhpCoreExpr, method:String, args:Array<PhpCoreExpr>);
	PhpObjectProperty(target:PhpCoreExpr, property:String);
	PhpDynamicObjectProperty(target:PhpCoreExpr, property:PhpCoreExpr);
	PhpFunctionCall(name:String, args:Array<PhpCoreExpr>);
	PhpBinop(op:String, left:PhpCoreExpr, right:PhpCoreExpr);
	PhpNullCoalesce(left:PhpCoreExpr, right:PhpCoreExpr);
	PhpTernary(condition:PhpCoreExpr, ifTrue:PhpCoreExpr, ifFalse:PhpCoreExpr);
	PhpAssignExpr(target:PhpCoreExpr, value:PhpCoreExpr);
	PhpPostDecrement(target:PhpCoreExpr);
	PhpNot(expr:PhpCoreExpr);
	PhpCastArray(expr:PhpCoreExpr);
	PhpCastBool(expr:PhpCoreExpr);
	PhpCastInt(expr:PhpCoreExpr);
	PhpCastString(expr:PhpCoreExpr);
}

typedef PhpCoreArrayEntry =
{
	final key:Null<PhpCoreExpr>;
	final value:PhpCoreExpr;
}

private enum PhpFileSegment
{
	PhpSegment(code:String);
	OutputSegment(content:String);
}

private typedef EmissionManifest =
{
	final schema:String;
	final generator:String;
	final output_profile:String;
	final bootstrap_error_handler_policy:String;
	final files:Array<EmissionManifestFile>;
	final core_ir_features:Array<String>;
	final segment_plans:Array<EmissionSegmentPlan>;
	final adapter_templates:Array<WordPressAdapterTemplateProvenance>;
	final unsupported:Array<String>;
}

private typedef EmissionManifestFile =
{
	final path:String;
	final bytes:Int;
	final declarations:Array<EmissionDeclaration>;
}

private typedef EmissionSegmentPlan =
{
	final path:String;
	final adapter:String;
	final adoption_mode:String;
	final segments:Array<String>;
	final caller_scope:Array<EmissionSegmentFact>;
	final include_semantics:Array<String>;
	final observable_effects:Array<String>;
	final unsupported:Array<String>;
}

private typedef EmissionSegmentFact =
{
	final kind:String;
	final names:Array<String>;
}

private typedef TypedFunctionArg =
{
	final v:TVar;
	final value:Null<TypedExpr>;
}

/**
	Small Reflaxe-backed PHP emitter for WordPress-shaped public files.

	The first implementation is intentionally narrow: annotated module-level
	functions and public classes lower into Adapter IR file/declaration plans,
	then print to original-path PHP files plus an emission manifest. Wider PHP
	semantics should be added only with fixture pressure from facade or
	WordPress driver gates.
**/
class WphxPhpCompiler extends GenericCompiler<String, String, String, String, String>
{
	var modules:Array<ModuleType> = [];
	var unsupported:Array<String> = [];
	var coreIrFeatures:Array<String> = [];
	var segmentPlans:Array<EmissionSegmentPlan> = [];
	var adapterTemplates:Array<WordPressAdapterTemplateProvenance> = [];

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
		segmentPlans = [];
		adapterTemplates = [];
		return buildAdapterFilePlans(collectAdapterDeclarations()).map(emitAdapterFile);
	}

	function collectAdapterDeclarations():Array<AdapterFileDeclaration>
	{
		final functions = new Array<AdapterFileDeclaration>();
		final classes = new Array<AdapterFileDeclaration>();
		final scripts = new Array<AdapterFileDeclaration>();

		for (moduleType in modules)
		{
			switch (moduleType)
			{
				case TClassDecl(classRef):
					final classType = classRef.get();
					collectClassAdapters(classType, functions, classes, scripts);
				case TEnumDecl(_), TTypeDecl(_), TAbstract(_):
			}
		}

		classes.sort(sortAdapterClasses);
		return scripts.concat(functions).concat(classes);
	}

	function buildAdapterFilePlans(declarations:Array<AdapterFileDeclaration>):Array<AdapterFilePlan>
	{
		final declarationsByPath = new Map<String, Array<AdapterDeclaration>>();
		final haxeBootstrapsByPath = new Map<String, String>();

		for (fileDeclaration in declarations)
		{
			rememberAdapterHaxeBootstrap(haxeBootstrapsByPath, fileDeclaration.file, adapterHaxeBootstrap(fileDeclaration.declaration));
			appendAdapterDeclaration(declarationsByPath, fileDeclaration.file, fileDeclaration.declaration);
		}

		final paths = [for (path in declarationsByPath.keys()) path];
		paths.sort(Reflect.compare);

		final plans = new Array<AdapterFilePlan>();
		for (path in paths)
		{
			plans.push({
				path: path,
				haxeBootstrap: haxeBootstrapsByPath.exists(path) ? haxeBootstrapsByPath.get(path) : null,
				declarations: declarationsByPath.get(path)
			});
		}
		return plans;
	}

	function emitAdapterFile(plan:AdapterFilePlan):GeneratedPhpFile
	{
		final prologue = plan.haxeBootstrap == null ? [] : [emitHaxeBootstrap(plan.haxeBootstrap)];
		final contentParts = prologue.concat(plan.declarations.map(declaration -> emitAdapterDeclaration(plan.path, declaration)));
		return {
			path: plan.path,
			content: "<?php\n" + contentParts.join("\n\n") + "\n",
			declarations: plan.declarations.map(adapterManifestDeclaration)
		};
	}

	function collectClassAdapters(classType:ClassType, functions:Array<AdapterFileDeclaration>, classes:Array<AdapterFileDeclaration>,
			scripts:Array<AdapterFileDeclaration>):Void
	{
		final classFile = metadataString(classType.meta.get(), "wp.file");
		final scriptAdapter = metadataString(classType.meta.get(), "wp.scriptAdapter");
		if (classFile != null && scriptAdapter != null)
		{
			scripts.push({
				file: classFile,
				declaration: ScriptAdapter({
					adapter: scriptAdapter,
					haxeModule: classType.module,
					source: sourceLabel(classType.pos)
				})
			});
		}

		final className = metadataString(classType.meta.get(), "native");
		if (classFile != null && className != null && !isModuleFieldsClass(classType))
		{
			classes.push({
				file: classFile,
				declaration: ClassAdapter({
					phpName: className,
					guarded: hasMetadata(classType.meta.get(), "wp.ifMissing"),
					haxeBootstrap: metadataString(classType.meta.get(), "wp.haxeBootstrap"),
					order: metadataInt(classType.meta.get(), "wp.order") ?? 0,
					classType: classType,
					source: sourceLabel(classType.pos)
				})
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
				declaration: GlobalFunctionAdapter({
					phpName: phpName,
					guarded: hasMetadata(field.meta.get(), "wp.ifMissing"),
					haxeBootstrap: metadataString(field.meta.get(), "wp.haxeBootstrap") ?? metadataString(classType.meta.get(), "wp.haxeBootstrap"),
					haxeModule: classType.module,
					field: field,
					expr: expr,
					source: sourceLabel(field.pos)
				})
			});
		}
	}

	function sortAdapterClasses(left:AdapterFileDeclaration, right:AdapterFileDeclaration):Int
	{
		final leftClass = adapterClass(left.declaration);
		final rightClass = adapterClass(right.declaration);
		final fileCompare = Reflect.compare(left.file, right.file);
		if (fileCompare != 0)
		{
			return fileCompare;
		}
		final orderCompare = Reflect.compare(leftClass.order, rightClass.order);
		return orderCompare != 0 ? orderCompare : Reflect.compare(leftClass.phpName, rightClass.phpName);
	}

	function adapterClass(declaration:AdapterDeclaration):AdapterClass
	{
		return switch (declaration)
		{
			case ClassAdapter(declaration):
				declaration;
			case GlobalFunctionAdapter(_) | ScriptAdapter(_):
				throw "Expected WPHX PHP class adapter declaration";
		}
	}

	function appendAdapterDeclaration(declarationsByPath:Map<String, Array<AdapterDeclaration>>, path:String, declaration:AdapterDeclaration):Void
	{
		if (!declarationsByPath.exists(path))
		{
			declarationsByPath.set(path, []);
		}
		declarationsByPath.get(path).push(declaration);
	}

	function rememberAdapterHaxeBootstrap(haxeBootstrapsByPath:Map<String, String>, path:String, constant:Null<String>):Void
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

	function adapterHaxeBootstrap(declaration:AdapterDeclaration):Null<String>
	{
		return switch (declaration)
		{
			case GlobalFunctionAdapter(declaration):
				declaration.haxeBootstrap;
			case ClassAdapter(declaration):
				declaration.haxeBootstrap;
			case ScriptAdapter(_):
				null;
		}
	}

	function emitAdapterDeclaration(path:String, declaration:AdapterDeclaration):String
	{
		return switch (declaration)
		{
			case GlobalFunctionAdapter(declaration):
				emitFunction(declaration);
			case ClassAdapter(declaration):
				emitClass(declaration);
			case ScriptAdapter(declaration):
				emitScript(path, declaration);
		}
	}

	function adapterManifestDeclaration(declaration:AdapterDeclaration):EmissionDeclaration
	{
		return switch (declaration)
		{
			case GlobalFunctionAdapter(declaration):
				{
					kind: "global-function",
					name: declaration.phpName,
					haxeModule: declaration.haxeModule,
					guarded: declaration.guarded,
					source: declaration.source
				};
			case ClassAdapter(declaration):
				{
					kind: declaration.classType.isInterface ? "interface" : "class",
					name: declaration.phpName,
					haxeModule: declaration.classType.module,
					guarded: declaration.guarded,
					source: declaration.source
				};
			case ScriptAdapter(declaration):
				{
					kind: "script",
					name: declaration.adapter,
					haxeModule: declaration.haxeModule,
					guarded: false,
					source: declaration.source
				};
		}
	}

	function emitScript(path:String, pending:AdapterScript):String
	{
		return switch (pending.adapter)
		{
			case "include-side-effects":
				emitIncludeSideEffectsScript(path, pending.adapter);
			case "template-segment-admin-style":
				emitTemplateSegmentAdminStyleScript(path, pending.adapter);
			case "template-segment-nested-parent":
				emitTemplateSegmentNestedParentScript(path, pending.adapter);
			case "template-segment-nested-partial":
				emitTemplateSegmentNestedPartialScript(path, pending.adapter);
			case _:
				reportUnsupported("unsupported WPHX PHP script adapter " + pending.adapter);
				"";
		}
	}

	function emitIncludeSideEffectsScript(path:String, adapter:String):String
	{
		recordCoreIrFeatures([
			"script.top-level-side-effect",
			"script.include-return",
			"script.function-scope-include",
			"script.output"
		]);
		recordSegmentPlan(path, adapter, "direct_script_emission", ["script", "literal_output", "return_exit"], [
			segmentFact("reads_locals", ["wphx_scope_marker", "wphx_local_marker"]),
			segmentFact("globals", ["wphx_include_side_effects"])
		], [
			"repeated_include",
			"include_once_second_return_true",
			"function_scope_include_locals"
		], [
			"top_level_side_effect",
			"output_buffering",
			"include_return_array",
			"include_once_idempotence"
		]);
		return "$GLOBALS['wphx_include_side_effects'][] = array(\n"
			+ "\t'scope_marker' => isset($wphx_scope_marker) ? $wphx_scope_marker : null,\n"
			+ "\t'local_marker' => isset($wphx_local_marker) ? $wphx_local_marker : null,\n"
			+ "\t'run'          => isset($GLOBALS['wphx_include_side_effects']) ? count($GLOBALS['wphx_include_side_effects']) + 1 : 1,\n"
			+ ");\n"
			+ "echo 'wphx-include-output:' . (isset($wphx_scope_marker) ? $wphx_scope_marker : 'none') . \"\\n\";\n"
			+ "return array(\n"
			+ "\t'included'     => true,\n"
			+ "\t'scope_marker' => isset($wphx_scope_marker) ? $wphx_scope_marker : null,\n"
			+ "\t'local_marker' => isset($wphx_local_marker) ? $wphx_local_marker : null,\n"
			+ "\t'run_count'    => count($GLOBALS['wphx_include_side_effects']),\n"
			+ ");";
	}

	function emitSegmentPlan(features:Array<String>, segments:Array<PhpFileSegment>):String
	{
		recordCoreIrFeatures(features.concat(["segment.plan-printer"]));
		var phpOpen = true;
		final parts = new Array<String>();
		for (segment in segments)
		{
			switch (segment)
			{
				case PhpSegment(code):
					if (!phpOpen)
					{
						parts.push("<?php\n");
						phpOpen = true;
					}
					parts.push(code);
				case OutputSegment(content):
					if (phpOpen)
					{
						parts.push("?>\n");
						phpOpen = false;
					}
					parts.push(content);
			}
		}
		return parts.join("");
	}

	function recordSegmentPlan(path:String, adapter:String, adoptionMode:String, segments:Array<String>, callerScope:Array<EmissionSegmentFact>,
			includeSemantics:Array<String>, observableEffects:Array<String>):Void
	{
		segmentPlans.push({
			path: path,
			adapter: adapter,
			adoption_mode: adoptionMode,
			segments: segments,
			caller_scope: callerScope,
			include_semantics: includeSemantics,
			observable_effects: observableEffects,
			unsupported: []
		});
	}

	function segmentFact(kind:String, names:Array<String>):EmissionSegmentFact
	{
		return {
			kind: kind,
			names: names
		};
	}

	function emitTemplateSegmentAdminStyleScript(path:String, adapter:String):String
	{
		recordSegmentPlan(path, adapter, "compiler_emitted_segment_shell", [
			"guard",
			"declaration",
			"script",
			"literal_output",
			"template_expression",
			"control",
			"script",
			"return_exit"
		], [
			segmentFact("reads_locals", ["title", "notice", "items", "screen"]),
			segmentFact("mutates_locals", ["notice", "items"]),
			segmentFact("mutates_objects", ["screen.rendered"]),
			segmentFact("globals", ["wphx_segment_trace"])
		], [], [
			"guard_return",
			"mixed_output_order",
			"escaped_output",
			"local_array_mutation",
			"object_mutation",
			"global_trace",
			"include_return_value"
		]);
		return emitSegmentPlan([
			"segment.guard",
			"segment.declaration",
			"segment.script",
			"segment.literal-output",
			"segment.template-expression",
			"segment.control",
			"segment.return",
			"segment.caller-scope-local",
			"segment.object-mutation",
			"segment.global-mutation"
		], [
			PhpSegment("if (!defined('ABSPATH')) {\n"
				+ "\treturn 'ABSPATH_REQUIRED';\n"
				+ "}\n\n"
				+ "if (!function_exists('wphx_segment_escape')) {\n"
				+ "\tfunction wphx_segment_escape($value) {\n"
				+ "\t\treturn htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');\n"
				+ "\t}\n"
				+ "}\n\n"
				+ "if (!function_exists('wphx_segment_row_class')) {\n"
				+ "\tfunction wphx_segment_row_class($index) {\n"
				+ "\t\treturn 0 === $index % 2 ? 'row even' : 'row odd';\n"
				+ "\t}\n"
				+ "}\n\n"
				+ "$GLOBALS['wphx_segment_trace'][] = array(\n"
				+ "\t'event' => 'admin:begin',\n"
				+ "\t'title' => $title,\n"
				+ "\t'itemCount' => count($items),\n"
				+ ");\n\n"
				+ "$notice = strtoupper($notice);\n"
				+ "$screen->rendered = true;\n"),
			OutputSegment("<div class=\"wrap\" data-screen=\"<?php echo wphx_segment_escape($screen->id); ?>\">\n"
				+ "\t<h1><?php echo wphx_segment_escape($title); ?></h1>\n"
				+ "\t<div class=\"notice\"><?php echo wphx_segment_escape($notice); ?></div>\n"
				+ "\t<ul class=\"wp-list-table\">\n"
				+ "\t\t<?php foreach ($items as $index => $item) : ?>\n"
				+ "\t\t\t<li class=\"<?php echo wphx_segment_escape(wphx_segment_row_class($index)); ?>\""
				+ " data-index=\"<?php echo wphx_segment_escape($index); ?>\">"
				+ "<?php echo wphx_segment_escape($item); ?></li>\n"
				+ "\t\t<?php endforeach; ?>\n"
				+ "\t</ul>\n"
				+ "</div>\n"),
			PhpSegment("$items[] = 'admin-mutated';\n" + "$GLOBALS['wphx_segment_trace'][] = array(\n" + "\t'event' => 'admin:end',\n"
				+ "\t'notice' => $notice,\n" + "\t'itemCount' => count($items),\n" + ");\n\n" + "return array(\n" + "\t'kind' => 'admin-segment',\n"
				+ "\t'notice' => $notice,\n" + "\t'itemCount' => count($items),\n" + "\t'marker' => 'segment:ADMIN',\n" + ");")
		]);
	}

	function emitTemplateSegmentNestedParentScript(path:String, adapter:String):String
	{
		recordSegmentPlan(path, adapter, "compiler_emitted_segment_shell", [
			"guard",
			"declaration",
			"script",
			"literal_output",
			"template_expression",
			"include",
			"script",
			"return_exit"
		], [
			segmentFact("reads_locals", ["title", "items", "screen"]),
			segmentFact("creates_locals", ["partial_marker", "partial_return"]),
			segmentFact("globals", ["wphx_nested_segment_trace"])
		], [
			"nested_include",
			"include_return_value",
			"repeated_include",
			"include_once_second_return_true",
			"function_scope_include_locals"
		], [
			"guard_return",
			"mixed_output_order",
			"escaped_output",
			"global_trace",
			"include_return_value"
		]);
		return emitSegmentPlan([
			"segment.guard",
			"segment.declaration",
			"segment.script",
			"segment.literal-output",
			"segment.template-expression",
			"segment.include",
			"segment.return",
			"segment.caller-scope-local",
			"segment.global-mutation"
		], [
			PhpSegment("if (!defined('ABSPATH')) {\n"
				+ "\treturn 'ABSPATH_REQUIRED';\n"
				+ "}\n\n"
				+ "if (!function_exists('wphx_nested_segment_escape')) {\n"
				+ "\tfunction wphx_nested_segment_escape($value) {\n"
				+ "\t\treturn htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');\n"
				+ "\t}\n"
				+ "}\n\n"
				+ "$GLOBALS['wphx_nested_segment_trace'][] = array(\n"
				+ "\t'event' => 'parent:begin',\n"
				+ "\t'title' => $title,\n"
				+ "\t'itemCount' => count($items),\n"
				+ ");\n"
				+ "$partial_marker = 'from-parent';\n"),
			OutputSegment("<section class=\"wphx-nested\" data-screen=\"<?php echo wphx_nested_segment_escape($screen->id); ?>\">\n"
				+ "\t<h2><?php echo wphx_nested_segment_escape($title); ?></h2>\n"
				+ "\t<?php $partial_return = include __DIR__ . '/includes/wphx-template-nested-partial.php'; ?>\n"
				+ "\t<footer data-count=\"<?php echo wphx_nested_segment_escape(count($items)); ?>\">"
				+ "<?php echo wphx_nested_segment_escape($partial_return['marker']); ?></footer>\n"
				+ "</section>\n"),
			PhpSegment("$GLOBALS['wphx_nested_segment_trace'][] = array(\n" + "\t'event' => 'parent:end',\n" + "\t'partial' => $partial_return,\n"
				+ "\t'itemCount' => count($items),\n" + ");\n\n" + "return array(\n" + "\t'kind' => 'nested-parent',\n" + "\t'partial' => $partial_return,\n"
				+ "\t'itemCount' => count($items),\n" + "\t'marker' => 'segment:NESTED-PARENT',\n" + ");")
		]);
	}

	function emitTemplateSegmentNestedPartialScript(path:String, adapter:String):String
	{
		recordSegmentPlan(path, adapter, "compiler_emitted_segment_shell", ["script", "literal_output", "template_expression", "return_exit"], [
			segmentFact("reads_locals", ["items", "screen", "partial_marker"]),
			segmentFact("mutates_locals", ["items"]),
			segmentFact("mutates_objects", ["screen.partial"]),
			segmentFact("globals", ["wphx_nested_segment_trace"])
		], [
			"nested_include",
			"include_return_value",
			"repeated_include",
			"include_once_second_return_true",
			"function_scope_include_locals"
		], [
			"mixed_output_order",
			"escaped_output",
			"local_array_mutation",
			"object_mutation",
			"global_trace",
			"include_return_value"
		]);
		return emitSegmentPlan([
			"segment.script",
			"segment.literal-output",
			"segment.template-expression",
			"segment.return",
			"segment.include-return",
			"segment.caller-scope-local",
			"segment.caller-scope-local-mutation",
			"segment.object-mutation",
			"segment.global-mutation"
		], [
			PhpSegment("$GLOBALS['wphx_nested_segment_trace'][] = array(\n" + "\t'event' => 'partial:begin',\n" + "\t'marker' => $partial_marker,\n"
				+ "\t'itemCount' => count($items),\n" + ");\n" + "$items[] = 'partial-mutated';\n" + "$screen->partial = $partial_marker;\n"),
			OutputSegment("<div class=\"wphx-partial\" data-marker=\"<?php echo wphx_nested_segment_escape($partial_marker); ?>\">\n"
				+ "\t<span><?php echo wphx_nested_segment_escape(end($items)); ?></span>\n"
				+ "</div>\n"),
			PhpSegment("$GLOBALS['wphx_nested_segment_trace'][] = array(\n" + "\t'event' => 'partial:end',\n" + "\t'itemCount' => count($items),\n"
				+ ");\n\n" + "return array(\n" + "\t'kind' => 'nested-partial',\n" + "\t'marker' => 'segment:NESTED-PARTIAL',\n"
				+ "\t'localMarker' => $partial_marker,\n" + "\t'itemCount' => count($items),\n" + ");")
		]);
	}

	function emitFunction(pending:AdapterGlobalFunction):String
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
		final nonThrowingPolicy = emitNonThrowingHaxeBootstrap();
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
			+ (nonThrowingPolicy ? "\tif (!defined('HAXE_CUSTOM_ERROR_HANDLER')) {\n" + "\t\tdefine('HAXE_CUSTOM_ERROR_HANDLER', true);\n" + "\t}\n" : "")
			+ "\t\\php\\Boot::__hx__init();\n"
			+ "}";
	}

	function emitNonThrowingHaxeBootstrap():Bool
	{
		return switch (bootstrapErrorHandlerPolicy())
		{
			case "stock": false;
			case "wordpress", "nonthrowing": true;
			case value:
				reportUnsupported("unsupported wphx_php_bootstrap_error_handler policy: " + value);
				true;
		}
	}

	function bootstrapErrorHandlerPolicy():String
	{
		final requested = Context.definedValue("wphx_php_bootstrap_error_handler");
		if (requested != null && StringTools.trim(requested) != "")
		{
			return StringTools.trim(requested);
		}
		return outputProfile() == "wordpress" ? "wordpress" : "stock";
	}

	function emitClass(pending:AdapterClass):String
	{
		if (pending.classType.isInterface)
		{
			return emitInterface(pending);
		}

		final lines = new Array<String>();
		if (hasMetadata(pending.classType.meta.get(), "wp.allowDynamicProperties"))
		{
			lines.push("#[AllowDynamicProperties]");
		}
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
			final visibility = phpVisibility(field) ?? "public";
			lines.push("\t" + visibility + " static function " + phpIdent(field.name) + "(" + emitArgs(fn.args) + ")");
			lines.push("\t{");
			lines.push(indent(emitMethodBody(field, TypedExprMethodBody(fn.expr)), "\t\t"));
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
				lines.push(indent(emitMethodBody(field, TypedExprMethodBody(fn.expr)), "\t\t"));
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
			final visibility = phpVisibility(field) ?? "public";
			lines.push("\t" + visibility + " function " + phpName + "(" + emitArgs(fn.args) + ")");
			lines.push("\t{");
			lines.push(indent(emitMethodBody(field, TypedExprMethodBody(fn.expr)), "\t\t"));
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

	function emitInterface(pending:AdapterClass):String
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

	function emitMethodBody(field:ClassField, body:AdapterMethodBody):String
	{
		final adapter = metadataString(field.meta.get(), "wp.adapter");
		if (adapter != null)
		{
			final plan = WphxPhpWordPressAdapters.methodBody(adapter, field.name, metadataString(field.meta.get(), "wp.haxeHelper"));
			if (plan == null)
			{
				reportUnsupported("unsupported WPHX PHP method adapter " + adapter + " for " + field.name);
				return "";
			}
			if (plan.error != null)
			{
				reportUnsupported(plan.error);
				return "";
			}
			recordCoreIrFeatures(plan.features);
			recordAdapterTemplates(plan.templates);
			return emitPhpCoreStatements(plan.statements);
		}

		return switch (body)
		{
			case TypedExprMethodBody(expr):
				emitBody(expr);
		}
	}

	function emitPhpCoreStatements(statements:Array<PhpCoreStmt>, depth:Int = 0):String
	{
		return statements.map(statement -> emitPhpCoreStatement(statement, depth)).join("\n");
	}

	function emitPhpCoreStatement(statement:PhpCoreStmt, depth:Int):String
	{
		final prefix = tabs(depth);
		return switch (statement)
		{
			case PhpIf(condition, body):
				prefix
				+ "if ( "
				+ emitPhpCoreExpr(condition, depth)
				+ " ) {\n"
				+ emitPhpCoreStatements(body, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpIfElse(condition, body, elseBody):
				prefix
				+ "if ( "
				+ emitPhpCoreExpr(condition, depth)
				+ " ) {\n"
				+ emitPhpCoreStatements(body, depth + 1)
				+ "\n"
				+ prefix
				+ "} else {\n"
				+ emitPhpCoreStatements(elseBody, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpFor(init, condition, update, body):
				prefix
				+ "for ( "
				+ emitPhpCoreExpr(init, depth)
				+ "; "
				+ emitPhpCoreExpr(condition, depth)
				+ "; "
				+ emitPhpCoreExpr(update, depth)
				+ " ) {\n"
				+ emitPhpCoreStatements(body, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpForeach(iterable, valueVar, body):
				prefix
				+ "foreach ( "
				+ emitPhpCoreExpr(iterable, depth)
				+ " as $"
				+ phpIdent(valueVar)
				+ " ) {\n"
				+ emitPhpCoreStatements(body, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpForeachKeyValue(iterable, keyVar, valueVar, body):
				prefix
				+ "foreach ( "
				+ emitPhpCoreExpr(iterable, depth)
				+ " as $"
				+ phpIdent(keyVar)
				+ " => $"
				+ phpIdent(valueVar)
				+ " ) {\n"
				+ emitPhpCoreStatements(body, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpTryCatch(tryBody, catchType, catchVar, catchBody):
				prefix
				+ "try {\n"
				+ emitPhpCoreStatements(tryBody, depth + 1)
				+ "\n"
				+ prefix
				+ "} catch ("
				+ catchType
				+ " $"
				+ phpIdent(catchVar)
				+ ") {\n"
				+ emitPhpCoreStatements(catchBody, depth + 1)
				+ "\n"
				+ prefix
				+ "}";
			case PhpAssign(target, value):
				prefix + emitPhpCoreExpr(target, depth) + " = " + emitPhpCoreExpr(value, depth) + ";";
			case PhpListAssign(names, value):
				prefix
				+ "list( "
				+ names.map(name -> "$" + phpIdent(name)).join(", ")
				+ " ) = "
				+ emitPhpCoreExpr(value, depth)
				+ ";";
			case PhpLocal(name, value):
				prefix + "$" + phpIdent(name) + " = " + emitPhpCoreExpr(value, depth) + ";";
			case PhpStaticLocal(name, value):
				prefix + "static $" + phpIdent(name) + " = " + emitPhpCoreExpr(value, depth) + ";";
			case PhpExprStmt(expr):
				prefix + emitPhpCoreExpr(expr, depth) + ";";
			case PhpReturn(value):
				prefix + "return " + emitPhpCoreExpr(value, depth) + ";";
			case PhpReturnVoid:
				prefix + "return;";
			case PhpThrow(value):
				prefix + "throw " + emitPhpCoreExpr(value, depth) + ";";
			case PhpRawBlock(code):
				code.split("\n").map(line -> line.length == 0 ? "" : prefix + line).join("\n");
			case PhpBreak:
				prefix + "break;";
			case PhpContinue:
				prefix + "continue;";
		}
	}

	function emitPhpCoreExpr(expr:PhpCoreExpr, depth:Int):String
	{
		return switch (expr)
		{
			case PhpVar(name):
				"$" + phpIdent(name);
			case PhpNull:
				"null";
			case PhpBool(value):
				value ? "true" : "false";
			case PhpInt(value):
				Std.string(value);
			case PhpString(value):
				quote(value);
			case PhpConst(name):
				name;
			case PhpArrayRead(base, key):
				emitPhpCoreExpr(base, depth) + "[" + emitPhpCoreArrayKey(key, depth) + "]";
			case PhpArrayAppend(base):
				emitPhpCoreExpr(base, depth) + "[]";
			case PhpLongArray(entries):
				emitPhpCoreLongArray(entries, depth, false);
			case PhpNew(className, args):
				emitPhpCoreNew(className, args, depth);
			case PhpNewDynamic(classExpr, args):
				emitPhpCoreNewDynamic(classExpr, args, depth);
			case PhpStaticCall(className, method, args):
				className + "::" + phpIdent(method) + emitPhpCoreCallArgs(args, depth);
			case PhpClassConst(className, constName):
				className + "::" + phpIdent(constName);
			case PhpMethodCall(target, method, args):
				emitPhpCoreExpr(target, depth)
				+ "->"
				+ phpIdent(method)
				+ emitPhpCoreCallArgs(args, depth);
			case PhpObjectProperty(target, property):
				emitPhpCoreExpr(target, depth) + "->" + phpIdent(property);
			case PhpDynamicObjectProperty(target, property):
				emitPhpCoreDynamicObjectProperty(target, property, depth);
			case PhpFunctionCall(name, args):
				name + emitPhpCoreCallArgs(args, depth);
			case PhpBinop(op, left, right):
				emitPhpCoreExpr(left, depth) + " " + op + " " + emitPhpCoreExpr(right, depth);
			case PhpNullCoalesce(left, right):
				emitPhpCoreExpr(left, depth) + " ?? " + emitPhpCoreExpr(right, depth);
			case PhpTernary(condition, ifTrue, ifFalse):
				emitPhpCoreExpr(condition, depth)
				+ " ? "
				+ emitPhpCoreExpr(ifTrue, depth)
				+ " : "
				+ emitPhpCoreExpr(ifFalse, depth);
			case PhpAssignExpr(target, value):
				emitPhpCoreExpr(target, depth) + " = " + emitPhpCoreExpr(value, depth);
			case PhpPostDecrement(target):
				emitPhpCoreExpr(target, depth) + "--";
			case PhpNot(inner):
				"! " + emitPhpCoreExpr(inner, depth);
			case PhpCastArray(inner):
				"(array) " + emitPhpCoreExpr(inner, depth);
			case PhpCastBool(inner):
				"(bool) " + emitPhpCoreExpr(inner, depth);
			case PhpCastInt(inner):
				"(int) " + emitPhpCoreExpr(inner, depth);
			case PhpCastString(inner):
				"(string) " + emitPhpCoreExpr(inner, depth);
		}
	}

	function emitPhpCoreDynamicObjectProperty(target:PhpCoreExpr, property:PhpCoreExpr, depth:Int):String
	{
		final renderedTarget = emitPhpCoreExpr(target, depth);
		return switch (property)
		{
			case PhpVar(name):
				renderedTarget + "->$" + phpIdent(name);
			case _:
				renderedTarget + "->{" + emitPhpCoreExpr(property, depth) + "}";
		}
	}

	function emitPhpCoreArrayKey(key:PhpCoreExpr, depth:Int):String
	{
		return switch (key)
		{
			case PhpString(_):
				emitPhpCoreExpr(key, depth);
			case _:
				" " + emitPhpCoreExpr(key, depth) + " ";
		}
	}

	function emitPhpCoreLongArray(entries:Array<PhpCoreArrayEntry>, depth:Int, indentFirstLine:Bool):String
	{
		if (entries.length == 0)
		{
			return "array()";
		}

		final renderedKeys = entries.map(entry -> entry.key == null ? null : emitPhpCoreExpr(entry.key, depth + 1));
		var keyWidth = 0;
		for (key in renderedKeys)
		{
			if (key != null && key.length > keyWidth)
			{
				keyWidth = key.length;
			}
		}

		final lines = [(indentFirstLine ? tabs(depth) : "") + "array("];
		for (index in 0...entries.length)
		{
			final entry = entries[index];
			final key = renderedKeys[index];
			final value = emitPhpCoreExpr(entry.value, depth + 1);
			if (key == null)
			{
				lines.push(tabs(depth + 1) + value + ",");
			} else
			{
				lines.push(tabs(depth + 1) + key + StringTools.rpad("", " ", keyWidth - key.length + 1) + "=> " + value + ",");
			}
		}
		lines.push(tabs(depth) + ")");
		return lines.join("\n");
	}

	function emitPhpCoreNew(className:String, args:Array<PhpCoreExpr>, depth:Int):String
	{
		if (args.length == 0)
		{
			return "new " + className + "()";
		}
		if (args.length == 1 && phpCoreExprIsMultiline(args[0]))
		{
			return "new " + className + "(\n" + emitPhpCoreMultilineArg(args[0], depth + 1) + "\n" + tabs(depth) + ")";
		}
		return "new " + className + "( " + args.map(arg -> emitPhpCoreExpr(arg, depth)).join(", ") + " )";
	}

	function emitPhpCoreNewDynamic(classExpr:PhpCoreExpr, args:Array<PhpCoreExpr>, depth:Int):String
	{
		final className = emitPhpCoreExpr(classExpr, depth);
		if (args.length == 0)
		{
			return "new " + className + "()";
		}
		return "new " + className + "( " + args.map(arg -> emitPhpCoreExpr(arg, depth)).join(", ") + " )";
	}

	function emitPhpCoreMultilineArg(expr:PhpCoreExpr, depth:Int):String
	{
		return switch (expr)
		{
			case PhpLongArray(entries):
				emitPhpCoreLongArray(entries, depth, true);
			case _:
				emitPhpCoreExpr(expr, depth);
		}
	}

	function emitPhpCoreCallArgs(args:Array<PhpCoreExpr>, depth:Int):String
	{
		return args.length == 0 ? "()" : "( " + args.map(arg -> emitPhpCoreExpr(arg, depth)).join(", ") + " )";
	}

	function phpCoreExprIsMultiline(expr:PhpCoreExpr):Bool
	{
		return switch (expr)
		{
			case PhpLongArray(_): true;
			case _: false;
		}
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
		return args.map(emitArg).join(", ");
	}

	function emitArg(arg:TypedFunctionArg):String
	{
		final reference = tvarHasMetadata(arg.v, "wp.byRef") ? "&" : "";
		return reference + "$" + phpIdent(tvarMetadataString(arg.v, "wp.name") ?? arg.v.name) + emitArgDefault(arg);
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
			output_profile: outputProfile(),
			bootstrap_error_handler_policy: bootstrapErrorHandlerPolicy(),
			files: generated,
			core_ir_features: coreIrFeatures,
			segment_plans: segmentPlans,
			adapter_templates: adapterTemplates,
			unsupported: unsupported
		};
		return Json.stringify(manifest, null, "  ") + "\n";
	}

	function outputProfile():String
	{
		return Context.definedValue("wphx_php_profile") ?? "wordpress";
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

	function recordCoreIrFeatures(features:Array<String>):Void
	{
		for (feature in features)
		{
			if (coreIrFeatures.indexOf(feature) == -1)
			{
				coreIrFeatures.push(feature);
			}
		}
		coreIrFeatures.sort(Reflect.compare);
	}

	function recordAdapterTemplates(templates:Array<WordPressAdapterTemplateProvenance>):Void
	{
		for (template in templates)
		{
			final key = template.adapter + "\n" + template.path + "\n" + template.sha256;
			var exists = false;
			for (recorded in adapterTemplates)
			{
				if (recorded.adapter + "\n" + recorded.path + "\n" + recorded.sha256 == key)
				{
					exists = true;
					break;
				}
			}
			if (!exists)
			{
				adapterTemplates.push(template);
			}
		}
		adapterTemplates.sort((left, right) -> Reflect.compare(left.adapter + left.path, right.adapter + right.path));
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
		if (value.indexOf("\r") != -1 || value.indexOf("\n") != -1 || value.indexOf("\t") != -1)
		{
			return "\""
				+ value.split("\\")
					.join("\\\\")
					.split("\"")
					.join("\\\"")
					.split("\r")
					.join("\\r")
					.split("\n")
					.join("\\n")
					.split("\t")
					.join("\\t") + "\"";
		}
		return "'" + value.split("\\").join("\\\\").split("'").join("\\'") + "'";
	}

	function indent(value:String, prefix:String = "\t"):String
	{
		return value.split("\n").map(line -> line == "" ? line : prefix + line).join("\n");
	}

	function tabs(count:Int):String
	{
		final out = new StringBuf();
		for (_ in 0...count)
		{
			out.add("\t");
		}
		return out.toString();
	}
}
#end
