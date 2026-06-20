#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import phpParser from "php-parser";

const ROOT = process.cwd();
const SOURCE_INVENTORY = "manifests/source-inventory.jsonl";
const OUT = "manifests/php-abi/wordpress-7.0-core-abi.v1.json";
const RECEIPT = "receipts/php-abi/wphx-201-php-abi-extractor.v1.json";
const RECORDED_AT = process.env.WPHX_PHP_ABI_RECORDED_AT ?? "2026-06-20T05:42:00.000Z";
const BASELINE = "wordpress-7.0.0";
const SOURCE_REPO = "../wordpress-develop";

const parser = new phpParser.Engine({
  parser: {
    extractDoc: true,
    php7: true,
    suppressErrors: true
  },
  ast: {
    withPositions: true,
    withSource: true
  }
});

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function identifierName(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.name === "string") return value.name;
  return value.loc?.source ?? null;
}

function nameSource(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.loc?.source ?? value.name ?? null;
}

function qualifiedName(namespace, name) {
  if (!name) return null;
  return namespace ? `${namespace}\\${name}` : name;
}

function sourceOf(node) {
  return node?.loc?.source ?? null;
}

function locOf(node) {
  if (!node?.loc) return null;
  return {
    start_line: node.loc.start.line,
    start_column: node.loc.start.column,
    start_offset: node.loc.start.offset,
    end_line: node.loc.end.line,
    end_column: node.loc.end.column,
    end_offset: node.loc.end.offset
  };
}

function typeSource(node, nullable) {
  if (!node) return null;
  const source = sourceOf(node) ?? nameSource(node);
  return nullable && source && !source.startsWith("?") ? `?${source}` : source;
}

function normalizeFlags(flags) {
  return Object.fromEntries(Object.entries(flags).sort(([a], [b]) => compareText(a, b)));
}

function signatureHash(payload) {
  return sha256(JSON.stringify(payload));
}

function segment(kind, node, detail = {}) {
  const source = sourceOf(node) ?? "";
  return {
    kind,
    location: locOf(node),
    source_hash: sha256(source),
    ...detail
  };
}

function parameterRecords(params) {
  return (params ?? []).map((param, index) => ({
    name: identifierName(param.name),
    position: index,
    source: sourceOf(param),
    type: typeSource(param.type, param.nullable),
    default_source: sourceOf(param.value),
    by_reference: param.byref === true,
    variadic: param.variadic === true
  }));
}

function declarationTiming(ctx) {
  if (ctx.className) return "class_member";
  if (ctx.enclosingFunction) return "nested_function";
  if (ctx.segments.length > 0) return "conditional_or_segmented";
  return "top_level";
}

function baseEntry(kind, name, node, ctx, details) {
  const source = sourceOf(node) ?? "";
  const normalizedName = name ?? `${ctx.path}:${node?.loc?.start?.line ?? "unknown"}`;
  const payload = {
    kind,
    name: normalizedName,
    namespace: ctx.namespace,
    path: ctx.path,
    declaration_timing: declarationTiming(ctx),
    load_segments: ctx.segments,
    ...details
  };
  return {
    schema: "wphx.php-abi-entry.v1",
    id: `php-abi:${BASELINE}:${kind}:${normalizedName}:${ctx.path}:${node?.loc?.start?.line ?? 0}:${node?.loc?.start?.column ?? 0}`,
    baseline: BASELINE,
    kind,
    name: normalizedName,
    namespace: ctx.namespace,
    source_unit: ctx.sourceUnit,
    repo: ctx.repo,
    commit: ctx.commit,
    path: ctx.path,
    distribution_path: ctx.path.startsWith("src/") ? ctx.path.slice("src/".length) : ctx.path,
    location: locOf(node),
    declaration_timing: payload.declaration_timing,
    load_segments: ctx.segments,
    source_hash: sha256(source),
    signature_hash: signatureHash(payload),
    ...details
  };
}

function recordFunction(node, ctx) {
  const localName = identifierName(node.name);
  const name = qualifiedName(ctx.namespace, localName);
  const params = parameterRecords(node.arguments);
  const flags = normalizeFlags({
    by_reference_return: node.byref === true
  });
  return baseEntry("function", name, node, ctx, {
    local_name: localName,
    qualified_name: name,
    flags,
    parameters: params,
    return_type: typeSource(node.type, node.nullable),
    doc_comment: node.leadingComments?.map((comment) => comment.value).join("\n") ?? null,
    enclosing_function: ctx.enclosingFunction,
    conditional_declaration: functionExistsGuard(ctx.segments, localName)
  });
}

function recordClassLike(kind, node, ctx) {
  const localName = identifierName(node.name);
  const name = qualifiedName(ctx.namespace, localName);
  const flags = normalizeFlags({
    abstract: node.isAbstract === true,
    final: node.isFinal === true,
    readonly: node.isReadonly === true,
    anonymous: node.isAnonymous === true
  });
  return baseEntry(kind, name, node, ctx, {
    local_name: localName,
    qualified_name: name,
    flags,
    extends: nameSource(node.extends),
    implements: (node.implements ?? []).map(nameSource).filter(Boolean),
    doc_comment: node.leadingComments?.map((comment) => comment.value).join("\n") ?? null
  });
}

function recordMethod(node, ctx) {
  const localName = identifierName(node.name);
  const name = `${ctx.className}::${localName}`;
  const params = parameterRecords(node.arguments);
  const flags = normalizeFlags({
    abstract: node.isAbstract === true,
    final: node.isFinal === true,
    readonly: node.isReadonly === true,
    static: node.isStatic === true,
    by_reference_return: node.byref === true,
    visibility: node.visibility ?? "public"
  });
  return baseEntry("method", name, node, ctx, {
    local_name: localName,
    qualified_name: name,
    class_name: ctx.className,
    class_kind: ctx.classKind,
    flags,
    parameters: params,
    return_type: typeSource(node.type, node.nullable),
    doc_comment: node.leadingComments?.map((comment) => comment.value).join("\n") ?? null
  });
}

function recordClassConstant(statement, constant, ctx) {
  const localName = identifierName(constant.name);
  const name = `${ctx.className}::${localName}`;
  const flags = normalizeFlags({
    final: statement.final === true,
    visibility: statement.visibility ?? "public"
  });
  return baseEntry("class_constant", name, constant, ctx, {
    local_name: localName,
    qualified_name: name,
    class_name: ctx.className,
    class_kind: ctx.classKind,
    flags,
    type: typeSource(statement.type, statement.nullable),
    value_source: sourceOf(constant.value)
  });
}

function recordProperty(statement, property, ctx) {
  const localName = identifierName(property.name);
  const name = `${ctx.className}::$${localName}`;
  const flags = normalizeFlags({
    abstract: statement.isAbstract === true,
    final: statement.isFinal === true,
    readonly: property.readonly === true,
    static: statement.isStatic === true,
    visibility: statement.visibility ?? "public"
  });
  return baseEntry("property", name, property, ctx, {
    local_name: localName,
    qualified_name: name,
    class_name: ctx.className,
    class_kind: ctx.classKind,
    flags,
    type: typeSource(property.type, property.nullable),
    default_source: sourceOf(property.value)
  });
}

function recordConstant(constant, ctx) {
  const localName = identifierName(constant.name);
  const name = qualifiedName(ctx.namespace, localName);
  return baseEntry("constant", name, constant, ctx, {
    local_name: localName,
    qualified_name: name,
    value_source: sourceOf(constant.value),
    declaration_form: "const"
  });
}

function recordDefine(call, ctx) {
  const first = call.arguments?.[0];
  const constantName = first?.kind === "string" ? first.value : sourceOf(first);
  if (!constantName) return null;
  return baseEntry("constant", constantName, call, ctx, {
    local_name: constantName,
    qualified_name: constantName,
    value_source: sourceOf(call.arguments?.[1]),
    declaration_form: "define",
    case_insensitive_source: sourceOf(call.arguments?.[2])
  });
}

function functionExistsGuard(segments, functionName) {
  const lowered = functionName?.toLowerCase();
  if (!lowered) return null;
  return (
    segments.find((item) => {
      const source = item.test_source?.toLowerCase() ?? "";
      return source.includes("function_exists") && source.includes(lowered);
    }) ?? null
  );
}

function callName(node) {
  if (node?.kind !== "call") return null;
  return nameSource(node.what);
}

function childNodes(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object" && typeof item.kind === "string");
  return Object.entries(value)
    .filter(([key]) => !["loc", "leadingComments", "trailingComments", "comments", "errors", "attrGroups"].includes(key))
    .flatMap(([, item]) => {
      if (Array.isArray(item)) return item.filter((child) => child && typeof child === "object" && typeof child.kind === "string");
      return item && typeof item === "object" && typeof item.kind === "string" ? [item] : [];
    });
}

function visitList(nodes, ctx, entries) {
  for (const node of nodes ?? []) visit(node, ctx, entries);
}

function visitControlBody(node, ctx, entries, kind, body, detail = {}) {
  const next = { ...ctx, segments: [...ctx.segments, segment(kind, node, detail)] };
  visit(body, next, entries);
}

function visit(node, ctx, entries) {
  if (!node) return;
  switch (node.kind) {
    case "program":
      visitList(node.children, ctx, entries);
      return;
    case "namespace":
      visitList(node.children, { ...ctx, namespace: node.name ?? null }, entries);
      return;
    case "block":
      visitList(node.children, ctx, entries);
      return;
    case "if": {
      visitControlBody(node, ctx, entries, "if", node.body, { test_source: sourceOf(node.test) });
      if (node.alternate) {
        if (node.alternate.kind === "if") {
          visit(node.alternate, ctx, entries);
        } else {
          visitControlBody(node, ctx, entries, "else", node.alternate);
        }
      }
      return;
    }
    case "switch":
    case "while":
    case "do":
    case "for":
    case "foreach":
    case "try":
    case "catch":
    case "finally":
      visitList(childNodes(node), { ...ctx, segments: [...ctx.segments, segment(node.kind, node)] }, entries);
      return;
    case "function": {
      const entry = recordFunction(node, ctx);
      entries.push(entry);
      visit(node.body, { ...ctx, enclosingFunction: entry.qualified_name }, entries);
      return;
    }
    case "class":
    case "interface":
    case "trait": {
      const kind = node.kind;
      const entry = recordClassLike(kind, node, ctx);
      entries.push(entry);
      const classCtx = { ...ctx, className: entry.qualified_name, classKind: kind };
      for (const member of node.body ?? []) {
        if (member.kind === "method") {
          const methodEntry = recordMethod(member, classCtx);
          entries.push(methodEntry);
          visit(member.body, { ...classCtx, enclosingFunction: methodEntry.qualified_name }, entries);
        } else if (member.kind === "classconstant") {
          for (const constant of member.constants ?? []) entries.push(recordClassConstant(member, constant, classCtx));
        } else if (member.kind === "propertystatement") {
          for (const property of member.properties ?? []) entries.push(recordProperty(member, property, classCtx));
        } else {
          visit(member, classCtx, entries);
        }
      }
      return;
    }
    case "constantstatement":
      for (const constant of node.constants ?? []) entries.push(recordConstant(constant, ctx));
      return;
    case "expressionstatement": {
      if (node.expression?.kind === "call" && callName(node.expression)?.toLowerCase() === "define") {
        const entry = recordDefine(node.expression, ctx);
        if (entry) entries.push(entry);
      }
      visitList(childNodes(node), ctx, entries);
      return;
    }
    default:
      visitList(childNodes(node), ctx, entries);
  }
}

function selectedSources() {
  return readJsonl(SOURCE_INVENTORY)
    .filter((entry) => entry.baseline === BASELINE && entry.repo === SOURCE_REPO && entry.language === "php" && entry.path.startsWith("src/"))
    .sort((a, b) => compareText(a.path, b.path));
}

const sourceUnits = selectedSources();
const entries = [];
const parseErrors = [];
const parserRecoveries = [];

for (const sourceUnit of sourceUnits) {
  const absolutePath = join(ROOT, sourceUnit.repo, sourceUnit.path);
  const contents = readFileSync(absolutePath, "utf8");
  try {
    const ast = parser.parseCode(contents, sourceUnit.path);
    for (const error of ast.errors ?? []) {
      parserRecoveries.push({
        source_unit: sourceUnit.id,
        path: sourceUnit.path,
        line: error.line ?? error.loc?.start?.line ?? null,
        token: error.token ?? null,
        expected: error.expected ?? null,
        message: error.message
      });
    }
    visit(
      ast,
      {
        namespace: null,
        path: sourceUnit.path,
        sourceUnit: sourceUnit.id,
        repo: sourceUnit.repo,
        commit: sourceUnit.commit,
        segments: [],
        className: null,
        classKind: null,
        enclosingFunction: null
      },
      entries
    );
  } catch (error) {
    parseErrors.push({
      source_unit: sourceUnit.id,
      path: sourceUnit.path,
      message: error.message
    });
  }
}

entries.sort((a, b) => compareText(a.id, b.id));

const countsByKind = entries.reduce((counts, entry) => {
  counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return counts;
}, {});
const conditionalEntries = entries.filter((entry) => entry.declaration_timing === "conditional_or_segmented").length;
const nestedFunctions = entries.filter((entry) => entry.kind === "function" && entry.declaration_timing === "nested_function").length;
const byReferenceParameters = entries
  .filter((entry) => Array.isArray(entry.parameters))
  .reduce((count, entry) => count + entry.parameters.filter((param) => param.by_reference).length, 0);
const byReferenceReturns = entries.filter((entry) => entry.flags?.by_reference_return === true).length;

const manifest = {
  schema: "wphx.php-abi-manifest.v1",
  issue: "WPHX-201",
  generated_at: RECORDED_AT,
  generator: "tools/php-abi/extract-wordpress-abi.mjs",
  parser: {
    package: "php-parser",
    version: "3.7.0"
  },
  inputs: {
    source_inventory: SOURCE_INVENTORY,
    baseline: BASELINE,
    repo: SOURCE_REPO,
    source_files: sourceUnits.map((entry) => ({
      source_unit: entry.id,
      path: entry.path,
      git_object: entry.gitObject
    }))
  },
  outputs: {
    abi_manifest: OUT,
    receipt: RECEIPT
  },
  counts: {
    source_files: sourceUnits.length,
    abi_entries: entries.length,
    by_kind: Object.fromEntries(Object.entries(countsByKind).sort(([a], [b]) => compareText(a, b))),
    conditional_or_segmented_entries: conditionalEntries,
    nested_functions: nestedFunctions,
    by_reference_parameters: byReferenceParameters,
    by_reference_returns: byReferenceReturns,
    parse_errors: parseErrors.length,
    parser_recoveries: parserRecoveries.length
  },
  parse_errors: parseErrors,
  parser_recoveries: parserRecoveries,
  entries
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");

const receipt = {
  schema: "wphx.php-abi-extractor-receipt.v1",
  id: "receipt:wphx-201-php-abi-extractor",
  issue: "WPHX-201",
  recorded_at: RECORDED_AT,
  command: "npm run php:abi",
  status: parseErrors.length === 0 && entries.length > 0 ? "passed" : "failed",
  generator: manifest.generator,
  parser: manifest.parser,
  inputs: {
    source_inventory: SOURCE_INVENTORY,
    baseline: BASELINE,
    repo: SOURCE_REPO,
    source_file_count: sourceUnits.length
  },
  outputs: manifest.outputs,
  counts: manifest.counts,
  manifest_sha256: sha256(JSON.stringify(manifest, null, 2) + "\n")
};

mkdirSync(dirname(RECEIPT), { recursive: true });
writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      status: receipt.status,
      issue: receipt.issue,
      abi_manifest: OUT,
      receipt: RECEIPT,
      counts: receipt.counts
    },
    null,
    2
  )
);
if (receipt.status !== "passed") process.exit(1);
