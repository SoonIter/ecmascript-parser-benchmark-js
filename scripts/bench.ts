import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { generateOxcAstCache, loadOxcBaseline } from "./ast-cache";
import { Bench } from "tinybench";
import * as acorn from "acorn";
import * as babel from "@babel/parser";
import * as oxc from "oxc-parser";
import swc from "@swc/core";
import { parseSync as swcNextParseSync, type Lang } from "@swc-next/parser";
import type { ParseOptions as SwcParseOptions } from "@swc/types";
import { parse as yukuParseSync, type SourceLang } from "yuku";

const FILES: Record<string, { path: string; lang: SourceLang }> = {
  typescript: { path: "files/typescript.js", lang: "js" },
  checker: { path: "files/checker.ts", lang: "ts" },
  lib_dom: { path: "files/lib.dom.d.ts", lang: "dts" },
  react: { path: "files/react.js", lang: "js" },
};

const BENCH_TIME = Number(process.env.BENCH_TIME ?? 10000);
const BENCH_WARMUP = Number(process.env.BENCH_WARMUP ?? 2000);
const BENCH_RUNS = Number(process.env.BENCH_RUNS ?? 3);
interface RunResult {
  name: string;
  mean: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
  rme: number;
  samples: number;
}

interface BenchResult extends RunResult {
  runs: number;
}

interface FileResult {
  file: string;
  results: BenchResult[];
}

interface FlatComment {
  type: string;
  value: string;
  start?: number;
  end?: number;
}

interface ParseOutput {
  program: unknown;
  comments: readonly FlatComment[] | null;
  diagnostics: string[];
}

interface ParseSummary {
  nodeCount: number;
  nodeTypes: Record<string, number>;
  comments: FlatComment[] | null;
  ast: unknown;
}

type SyntheticBodySpanMap = ReadonlyMap<string, [number, number]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isParseSummary(value: unknown): value is ParseSummary {
  return isRecord(value) &&
    typeof value.nodeCount === "number" &&
    isRecord(value.nodeTypes) &&
    (value.comments === null || Array.isArray(value.comments)) &&
    "ast" in value;
}

async function generateAstCache(fileKeys: string[] = []): Promise<void> {
  await generateOxcAstCache(fileKeys, FILES, (fileKey, source, lang) => {
    const tasks = createParserTasks(source, lang);
    let output: ParseOutput;
    try {
      output = tasks.Oxc!();
    } catch (error) {
      throw new Error(`Oxc failed to generate the expected AST for ${fileKey}: ${String(error)}`);
    }
    if (output.diagnostics.length > 0) {
      throw new Error(`Oxc diagnostics while generating AST for ${fileKey}: ${output.diagnostics.join("; ")}`);
    }
    const summary = summarizeParse(
      output,
      "Oxc",
      source,
      lang === "dts" ? "script" : "module",
    );
    assertParseValid(summary, "Oxc", fileKey);
    return summary;
  });
}

function isTsLang(lang: SourceLang): boolean {
  return lang === "ts" || lang === "tsx" || lang === "dts";
}

function parserNamesFor(lang: SourceLang): string[] {
  return isTsLang(lang)
    ? ["Babel", "Oxc", "SWC", "SWC Next", "Yuku"]
    : ["Acorn", "Babel", "Oxc", "SWC", "SWC Next", "Yuku"];
}

function createParserTasks(source: string, lang: SourceLang): Record<string, () => ParseOutput> {
  const isTs = isTsLang(lang);
  const isJsx = lang === "tsx";
  const isDts = lang === "dts";
  const sourceType = isDts ? "script" : "module";
  const tasks: Record<string, () => ParseOutput> = {};

  if (!isTs) {
    tasks.Acorn = () => {
      const comments: FlatComment[] = [];
      const program = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType,
        preserveParens: true,
        onComment: comments as acorn.Comment[],
      });
      return { program, comments, diagnostics: [] };
    };
  }

  const babelPlugins: babel.ParserPlugin[] = [];
  if (isTs) babelPlugins.push(isDts ? ["typescript", { dts: true }] : "typescript");
  if (isJsx) babelPlugins.push("jsx");
  tasks.Babel = () => {
    const parsed = babel.parse(source, {
      sourceType,
      plugins: babelPlugins,
      createParenthesizedExpressions: true,
    });
    return { program: parsed.program, comments: parsed.comments ?? [], diagnostics: [] };
  };

  const oxcFilename = isDts ? "bench.d.ts" : isJsx ? "bench.tsx" : isTs ? "bench.ts" : "bench.js";
  tasks.Oxc = () => {
    const parsed = oxc.parseSync(oxcFilename, source, {
      lang,
      sourceType,
      preserveParens: true,
    });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.errors.map((error) => error.message),
    };
  };

  const swcSyntax: SwcParseOptions & { isModule?: boolean } = isTs
    ? { syntax: "typescript", tsx: isJsx, isModule: !isDts }
    : { syntax: "ecmascript", isModule: true };
  tasks.SWC = () => {
    const program = swc.parseSync(source, { ...swcSyntax, comments: true });
    return { program, comments: null, diagnostics: [] };
  };

  tasks["SWC Next"] = () => {
    const parsed = swcNextParseSync(source, {
      lang: lang as Lang,
      sourceType,
      comments: "flat",
      preserveParens: true,
    });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.message),
    };
  };

  // Bun 1.4.4 avoids the spurious React EOF diagnostic seen with Bun 1.1.3.
  tasks.Yuku = () => {
    const parsed = yukuParseSync(source, { lang, sourceType, preserveParens: true });
    return {
      program: parsed.program,
      comments: parsed.comments,
      diagnostics: parsed.diagnostics.map(
        (diagnostic) => `${diagnostic.message} at [${diagnostic.start}, ${diagnostic.end})`,
      ),
    };
  };

  return tasks;
}

function summarizeParse(
  output: ParseOutput,
  parserName: string,
  source: string,
  sourceType: "module" | "script",
  syntheticBodySpans?: SyntheticBodySpanMap,
): ParseSummary {
  const ast = normalizeAst(output.program, parserName, source, sourceType, syntheticBodySpans);
  const nodeTypes: Record<string, number> = {};
  function countNodes(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(countNodes);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string") {
      nodeTypes[node.type] = (nodeTypes[node.type] ?? 0) + 1;
    }
    Object.values(node).forEach(countNodes);
  }
  countNodes(ast);
  const sortedNodeTypes = Object.fromEntries(
    Object.entries(nodeTypes).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    nodeCount: Object.values(sortedNodeTypes).reduce((total, count) => total + count, 0),
    nodeTypes: sortedNodeTypes,
    comments: normalizeComments(output.comments),
    ast,
  };
}

function normalizeComments(comments: readonly FlatComment[] | null): FlatComment[] | null {
  return comments?.map(({ type, value, start, end }) => ({
    type: type === "CommentLine" ? "Line" : type === "CommentBlock" ? "Block" : type,
    value,
    start,
    end,
  })) ?? null;
}

function decodeJsonStringLiteral(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function collectSyntheticBodySpans(ast: unknown): Map<string, [number, number]> {
  const spans = new Map<string, [number, number]>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    const body = value.body;
    const expectedBodyType =
      value.type === "ClassDeclaration" || value.type === "ClassExpression"
        ? "ClassBody"
        : value.type === "TSEnumDeclaration"
          ? "TSEnumBody"
          : undefined;
    if (
      expectedBodyType !== undefined &&
      Array.isArray(value.span) &&
      typeof value.span[0] === "number" &&
      typeof value.span[1] === "number" &&
      isRecord(body) &&
      body.type === expectedBodyType &&
      Array.isArray(body.span) &&
      typeof body.span[0] === "number" &&
      typeof body.span[1] === "number"
    ) {
      spans.set(`${value.span[0]}:${value.span[1]}`, [body.span[0], body.span[1]]);
    }
    Object.values(value).forEach(visit);
  }
  visit(ast);
  return spans;
}

function normalizeAst(
  value: unknown,
  parserName: string,
  source: string,
  sourceType: "module" | "script",
  syntheticBodySpans?: SyntheticBodySpanMap,
): unknown {
  const ignoredKeys = new Set([
    "bodyCtxt",
    "comments",
    "ctxt",
    "extra",
    "innerComments",
    "leadingComments",
    "loc",
    "parent",
    "raw",
    "tokens",
    "trailingComments",
    "__normalizedSpan",
  ]);
  const falseDefaults = new Set([
    "abstract",
    "isAbstract",
    "async",
    "computed",
    "declare",
    "definite",
    "generator",
    "optional",
    "isOptional",
    "shorthand",
    "method",
    "static",
    "isStatic",
    "readonly",
    "expression",
    "override",
    "isOverride",
    "const",
    "in",
    "out",
    "global",
    "typeOnly",
  ]);
  const byteOffsets = parserName === "SWC" ? makeUtf8OffsetMap(source) : undefined;

  function visit(
    item: unknown,
    parentType?: string,
    forcedSpan?: [number, number],
    parentKey?: string,
    withinOptionalChain = false,
  ): unknown {
    if (typeof item === "bigint") return item.toString();
    if (Array.isArray(item)) {
      return item.map((child) =>
        visit(child, parentType, undefined, parentKey, withinOptionalChain),
      );
    }
    if (item === null || typeof item !== "object") return item;

    const node = item as Record<string, unknown>;
    const originalType = typeof node.type === "string" ? node.type : undefined;
    if (
      parserName === "SWC" &&
      originalType === "TsEnumDeclaration" &&
      Array.isArray(node.members)
    ) {
      const span = normalizedSpan(node, byteOffsets);
      const bodySpan = span ? syntheticBodySpans?.get(`${span[0]}:${span[1]}`) : undefined;
      if (bodySpan) {
        return visit(
          {
            ...node,
            type: "TSEnumDeclaration",
            body: {
              type: "TSEnumBody",
              __normalizedSpan: bodySpan,
              members: node.members,
            },
            const: node.isConst,
            isConst: undefined,
            members: undefined,
          },
          parentType,
          forcedSpan,
          parentKey,
          withinOptionalChain,
        );
      }
    }
    if (parserName === "SWC" && originalType === "TsThisParameter") {
      const span = normalizedSpan(node, byteOffsets);
      const annotationSpan = isRecord(node.typeAnnotation)
        ? normalizedSpan(node.typeAnnotation, byteOffsets)
        : undefined;
      return visit(
        {
          type: "Identifier",
          __normalizedSpan:
            span && annotationSpan ? [span[0], annotationSpan[0]] : span,
          name: "this",
          typeAnnotation: node.typeAnnotation,
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      parserName === "SWC" &&
      originalType === "TsTupleElement" &&
      isRecord(node.label)
    ) {
      return visit(
        {
          type: "TSNamedTupleMember",
          __normalizedSpan: normalizedSpan(node, byteOffsets),
          label: node.label,
          elementType: node.ty,
          optional: node.optional === true || node.label.optional === true,
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      parserName === "SWC" &&
      originalType === "ImportSpecifier" &&
      node.imported === null &&
      isRecord(node.local)
    ) {
      return visit(
        { ...node, imported: node.local },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (originalType === "SpreadElement" && "arguments" in node) {
      const spreadSpan = isRecord(node.spread)
        ? normalizedSpan(node.spread, byteOffsets)
        : undefined;
      const argumentSpan = isRecord(node.arguments)
        ? normalizedSpan(node.arguments, byteOffsets)
        : undefined;
      return visit(
        {
          type: "SpreadElement",
          __normalizedSpan:
            spreadSpan && argumentSpan
              ? [spreadSpan[0], argumentSpan[1]]
              : normalizedSpan(node, byteOffsets),
          argument: node.arguments,
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (originalType === "TsConstAssertion") {
      const span = normalizedSpan(node, byteOffsets);
      const expressionSpan = isRecord(node.expression)
        ? normalizedSpan(node.expression, byteOffsets)
        : undefined;
      const typeStart = span ? source.lastIndexOf("const", span[1]) : -1;
      if (
        span &&
        expressionSpan &&
        typeStart >= expressionSpan[1] &&
        typeStart + 5 === span[1] &&
        source.slice(typeStart, typeStart + 5) === "const"
      ) {
        const typeSpan: [number, number] = [typeStart, typeStart + 5];
        return visit(
          {
            type: "TSAsExpression",
            __normalizedSpan: span,
            expression: node.expression,
            typeAnnotation: {
              type: "TSTypeReference",
              __normalizedSpan: typeSpan,
              typeName: {
                type: "Identifier",
                __normalizedSpan: typeSpan,
                name: "const",
              },
            },
          },
          parentType,
          forcedSpan,
          parentKey,
          withinOptionalChain,
        );
      }
    }
    if (
      parserName === "SWC" &&
      (originalType === "ClassDeclaration" || originalType === "ClassExpression") &&
      Array.isArray(node.body)
    ) {
      const span = normalizedSpan(node, byteOffsets);
      const bodySpan = span ? syntheticBodySpans?.get(`${span[0]}:${span[1]}`) : undefined;
      if (bodySpan) {
        return visit(
          {
            ...node,
            body: {
              type: "ClassBody",
              __normalizedSpan: bodySpan,
              body: node.body,
            },
          },
          parentType,
          forcedSpan,
          parentKey,
          withinOptionalChain,
        );
      }
    }
    if (originalType === "SuperPropExpression") {
      const property = node.property as Record<string, unknown> | undefined;
      return visit(
        {
          type: "MemberExpression",
          __normalizedSpan: normalizedSpan(node, byteOffsets),
          object: node.obj,
          property: property?.type === "Computed" ? property.expression : property,
          computed: property?.type === "Computed",
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      originalType === "TsLiteralType" &&
      (node.literal as Record<string, unknown> | undefined)?.type === "TemplateLiteral"
    ) {
      const literal = node.literal as Record<string, unknown>;
      return visit(
        {
          type: "TSTemplateLiteralType",
          __normalizedSpan: normalizedSpan(node, byteOffsets),
          quasis: literal.quasis,
          types: literal.types,
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      originalType === "FunctionDeclaration" &&
      (node.body === null || node.body === undefined)
    ) {
      return visit(
        { ...node, type: "TSDeclareFunction" },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (originalType === "TsTupleElement") {
      if (node.label === null && node.optional !== true && node.rest !== true) {
        return visit(node.ty, parentType, forcedSpan, parentKey, withinOptionalChain);
      }
    }
    if (originalType === "TsGetterSignature" || originalType === "TsSetterSignature") {
      const getter = originalType === "TsGetterSignature";
      return visit(
        {
          type: "TSMethodSignature",
          __normalizedSpan: normalizedSpan(node, byteOffsets),
          key: node.key,
          computed: node.computed ?? false,
          optional: false,
          kind: getter ? "get" : "set",
          typeParameters: null,
          params: getter ? [] : node.param == null ? [] : [node.param],
          returnType: getter ? node.typeAnnotation ?? null : null,
          accessibility: null,
          readonly: false,
          static: false,
        },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      originalType === "TsLiteralType" &&
      (node.literal as Record<string, unknown> | undefined)?.type === "NumericLiteral"
    ) {
      const literal = node.literal as Record<string, unknown>;
      const raw = typeof literal.raw === "string" ? literal.raw : undefined;
      const sourceSpan = normalizedSpan(literal, byteOffsets);
      const value = typeof literal.value === "number" ? literal.value : undefined;
      if (
        raw?.startsWith("-") &&
        sourceSpan &&
        value !== undefined &&
        Number.isFinite(value)
      ) {
        const includesMinus = source.slice(sourceSpan[0], sourceSpan[1]) === raw;
        const unaryStart = includesMinus ? sourceSpan[0] : sourceSpan[0] - 1;
        const argumentStart = includesMinus ? unaryStart + 1 : sourceSpan[0];
        if (
          unaryStart >= 0 &&
          source.slice(unaryStart, sourceSpan[1]) === raw &&
          source[unaryStart] === "-"
        ) {
          return visit(
            {
              ...node,
              literal: {
                type: "UnaryExpression",
                __normalizedSpan: [unaryStart, sourceSpan[1]],
                operator: "-",
                prefix: true,
                argument: {
                  type: "NumericLiteral",
                  __normalizedSpan: [argumentStart, sourceSpan[1]],
                  value: Math.abs(value),
                  raw: raw.slice(1),
                },
              },
            },
            parentType,
            forcedSpan,
            parentKey,
            withinOptionalChain,
          );
        }
      }
    }
    if (
      parentKey === "implements" &&
      (originalType === "TSInterfaceHeritage" ||
        originalType === "TSExpressionWithTypeArguments" ||
        originalType === "TsExpressionWithTypeArguments")
    ) {
      return visit(
        { ...node, type: "TSClassImplements" },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      parentKey === "extends" &&
      parentType === "TSInterfaceDeclaration" &&
      (originalType === "TSExpressionWithTypeArguments" ||
        originalType === "TsExpressionWithTypeArguments")
    ) {
      return visit(
        { ...node, type: "TSInterfaceHeritage" },
        parentType,
        forcedSpan,
        parentKey,
        withinOptionalChain,
      );
    }
    if (
      originalType === "OptionalChainingExpression" ||
      originalType === "OptionalMemberExpression" ||
      originalType === "OptionalCallExpression"
    ) {
      const base = originalType === "OptionalChainingExpression" ? node.base : node;
      if (base === null || typeof base !== "object") return visit(base, parentType);
      const converted =
        originalType === "OptionalChainingExpression"
          ? {
              ...(base as Record<string, unknown>),
              optional: node.optional ?? false,
            }
          : {
              ...node,
              type:
                originalType === "OptionalMemberExpression"
                  ? "MemberExpression"
                  : "CallExpression",
            };
      const normalized = visit(
        converted,
        parentType,
        forcedSpan,
        parentKey,
        true,
      );
      if (withinOptionalChain) return normalized;
      const span = normalizedSpan(node, byteOffsets);
      return {
        type: "ChainExpression",
        ...(span ? { span } : {}),
        expression: normalized,
      };
    }
    if (originalType === "MethodProperty") {
      const propertySpan = normalizedSpan(node, byteOffsets);
      return visit(
        {
          type: "Property",
          __normalizedSpan: propertySpan,
          kind: "init",
          method: true,
          computed: node.computed ?? false,
          key: node.key,
          generator: node.generator ?? false,
          async: node.async ?? false,
          params: node.params ?? [],
          body: node.body,
          typeParameters: node.typeParameters,
          returnType: node.returnType,
        },
        parentType,
      );
    }
    if (originalType === "GetterProperty" || originalType === "SetterProperty") {
      const propertyFunction = (node.function ?? {}) as Record<string, unknown>;
      return visit(
        {
          type: "Property",
          __normalizedSpan: normalizedSpan(node, byteOffsets),
          kind: originalType === "GetterProperty" ? "get" : "set",
          key: node.key,
          params: propertyFunction.params ?? [],
          body: propertyFunction.body,
          generator: propertyFunction.generator ?? false,
          async: propertyFunction.async ?? false,
          typeParameters: propertyFunction.typeParameters,
          returnType: propertyFunction.returnType,
        },
        parentType,
      );
    }
    if (originalType === "AssignmentPatternProperty") {
      const keySpan = normalizedSpan(node.key as Record<string, unknown>, byteOffsets);
      const valueSpan =
        node.value !== null && node.value !== undefined
          ? normalizedSpan(node.value as Record<string, unknown>, byteOffsets)
          : undefined;
      const propertySpan =
        normalizedSpan(node, byteOffsets) ??
        (keySpan && valueSpan ? [keySpan[0], valueSpan[1]] : keySpan);
      let value = node.value ?? node.key;
      if (node.value !== null && node.value !== undefined) {
        value = {
          type: "AssignmentPattern",
          __normalizedSpan:
            keySpan && valueSpan ? [keySpan[0], valueSpan[1]] : propertySpan,
          left: node.key,
          right: node.value,
        };
      }
      return visit(
        {
          type: "Property",
          __normalizedSpan: propertySpan,
          kind: "init",
          shorthand: true,
          key: node.key,
          value,
        },
        parentType,
      );
    }
    if (originalType === "KeyValuePatternProperty") {
      const keySpan = normalizedSpan(node.key as Record<string, unknown>, byteOffsets);
      const valueSpan = normalizedSpan(node.value as Record<string, unknown>, byteOffsets);
      return visit(
        {
          type: "Property",
          __normalizedSpan:
            normalizedSpan(node, byteOffsets) ??
            (keySpan && valueSpan ? [keySpan[0], valueSpan[1]] : undefined),
          kind: "init",
          key: node.key,
          value: node.value,
        },
        parentType,
      );
    }
    if (originalType === "TemplateElement") {
      const sourceValue =
        node.value !== null && typeof node.value === "object"
          ? (node.value as Record<string, unknown>)
          : node;
      const value: Record<string, unknown> = {};
      if ("raw" in sourceValue) value.raw = sourceValue.raw;
      if ("cooked" in sourceValue) value.cooked = sourceValue.cooked;
      const span = forcedSpan ?? normalizedSpan(node, byteOffsets);
      return {
        type: "TemplateElement",
        ...(span ? { span } : {}),
        value,
        ...(node.tail === undefined ? {} : { tail: node.tail }),
      };
    }
    if (originalType === "Identifier" && parentType === "ObjectExpression") {
      const identifier = visit(node, "Property") as Record<string, unknown>;
      return {
        type: "Property",
        ...(identifier.span === undefined ? {} : { span: identifier.span }),
        kind: "init",
        shorthand: true,
        key: identifier,
        value: identifier,
      };
    }
    if (originalType === "Parameter") return visit(node.pat, parentType);
    if (originalType === "Computed") return visit(node.expression, parentType);
    if (originalType === undefined && "expression" in node && "spread" in node) {
      if (node.spread === null) return visit(node.expression, parentType);
      const expression = visit(node.expression, parentType) as Record<string, unknown>;
      return {
        type: "SpreadElement",
        span: [
          normalizedSpan(node.spread as Record<string, unknown>, byteOffsets)?.[0] ??
            (expression.span as number[] | undefined)?.[0] ??
            0,
          (expression.span as number[] | undefined)?.[1] ?? 0,
        ],
        argument: expression,
      };
    }
    if (originalType === "Directive") {
      return {
        type: "ExpressionStatement",
        span: normalizedSpan(node, byteOffsets),
        expression: visit(node.value, "ExpressionStatement"),
      };
    }

    let type = originalType;
    if (type === "Module") type = "Program";
    if (type === "Script") type = "Program";
    if (type === "TsKeywordType") {
      const keyword = typeof node.kind === "string" ? node.kind : "";
      const suffix = keyword ? `${keyword[0]!.toUpperCase()}${keyword.slice(1)}` : "";
      type = suffix ? `TS${suffix}Keyword` : "TSKeywordType";
    }
    if (type === "TSExpressionWithTypeArguments") type = "TSInterfaceHeritage";
    if (type === "Constructor") type = "MethodDefinition";
    if (type === "ExportDeclaration") type = "ExportNamedDeclaration";
    if (
      type === "NumericLiteral" ||
      type === "StringLiteral" ||
      type === "BooleanLiteral" ||
      type === "NullLiteral" ||
      type === "RegExpLiteral" ||
      type === "BigIntLiteral" ||
      type === "DirectiveLiteral"
    ) {
      type = "Literal";
    }
    if (type === "ParenthesisExpression") type = "ParenthesizedExpression";
    if (type === "ObjectProperty" || type === "KeyValueProperty") type = "Property";
    if (type === "ClassMethod") type = "MethodDefinition";
    if (type === "ClassProperty") type = "PropertyDefinition";
    if (type === "ObjectMethod") type = "Property";
    if (
      type === "BinaryExpression" &&
      (node.operator === "&&" || node.operator === "||" || node.operator === "??")
    ) {
      type = "LogicalExpression";
    }
    if (type === "FunctionBody") type = "BlockStatement";
    if (type?.startsWith("Ts")) type = `TS${type.slice(2)}`;
    if (type === "TSBigintKeyword") type = "TSBigIntKeyword";
    if (type === "ComputedMemberExpression" || type === "StaticMemberExpression") {
      type = "MemberExpression";
    }

    const methodFunction =
      type === "MethodDefinition" ||
      (type === "Property" &&
        (node.method === true || node.kind === "get" || node.kind === "set")) ||
      originalType === "ClassMethod" ||
      originalType === "ObjectMethod" ||
      originalType === "Constructor"
        ? originalType === "Constructor"
          ? node
          : ((node.value ?? node.function) as Record<string, unknown> | undefined)
        : undefined;
    const hasMethodFunction =
      methodFunction !== undefined &&
      methodFunction !== null &&
      typeof methodFunction === "object" &&
      ("params" in methodFunction || "body" in methodFunction);

    const output: Record<string, unknown> = {};
    if (type !== undefined) output.type = type;
    if (type === "TSModuleDeclaration" && node.namespace === true) {
      output.kind = "namespace";
    }
    if (type === "Program") {
      output.sourceType =
        typeof node.sourceType === "string" ? node.sourceType : sourceType;
    }
    if (originalType === "Constructor") output.kind = "constructor";
    let span =
      type === "Program"
        ? ([0, source.length] as [number, number])
        : Array.isArray(node.__normalizedSpan)
          ? (node.__normalizedSpan as [number, number])
          : type === "Identifier"
            ? canonicalTypedIdentifierSpan(node, source, byteOffsets) ??
              normalizedSpan(node, byteOffsets)
            : normalizedSpan(node, byteOffsets);
    if (originalType === "RestElement" && span && node.rest && typeof node.rest === "object") {
      const ellipsisSpan = normalizedSpan(node.rest as Record<string, unknown>, byteOffsets);
      if (ellipsisSpan) span = [ellipsisSpan[0], span[1]];
    }
    if (span) output.span = span;

    if (type === "Identifier") {
      output.name = node.name ?? node.value;
    } else if (type === "MemberExpression" && (node.computed === true || (node.property as Record<string, unknown> | undefined)?.type === "Computed")) {
      output.computed = true;
    } else if (type === "Literal") {
      if (originalType === "RegExpLiteral" || node.regex !== undefined) {
        const regex = (node.regex ?? node) as Record<string, unknown>;
        const pattern = regex.pattern ?? regex.exp;
        const flags = typeof regex.flags === "string" ? [...regex.flags].sort().join("") : regex.flags;
        output.regex = {
          ...(pattern === undefined ? {} : { pattern }),
          ...(flags === undefined ? {} : { flags }),
        };
      } else if (originalType === "BigIntLiteral" || typeof node.value === "bigint") {
        output.value = String(node.bigint ?? node.value);
      } else if (originalType === "NullLiteral") {
        output.value = null;
      } else if (node.value !== undefined) {
        output.value =
          parserName === "SWC" && originalType === "StringLiteral"
            ? decodeJsonStringLiteral(node.raw) ?? node.value
            : node.value;
      }
    }
    if (type === "Property") {
      if (output.kind === "method" || output.kind === undefined) output.kind = "init";
      if (node.method === true || (originalType === "ObjectMethod" && node.kind === "method")) {
        output.method = true;
      }
      if (node.computed === true || (node.key as Record<string, unknown> | undefined)?.type === "Computed") {
        output.computed = true;
      }
    }

    const keys = Object.keys(node).sort();
    for (const key of keys) {
      if (
        ignoredKeys.has(key) ||
        key === "type" ||
        key === "start" ||
        key === "end" ||
        key === "span" ||
        key === "thisParam" ||
        ((type === "Program" || type === "BlockStatement") && key === "directives") ||
        (hasMethodFunction && (key === "value" || key === "function")) ||
        (type === "ExpressionStatement" && key === "directive") ||
        (type === "UnaryExpression" && key === "prefix") ||
        (type === "ArrowFunctionExpression" && key === "expression") ||
        (type === "Identifier" && (key === "name" || key === "value")) ||
        (type === "RestElement" && key === "rest") ||
        (type === "Property" && key === "kind") ||
        (type === "TSModuleDeclaration" && key === "namespace") ||
        (type?.endsWith("Keyword") && key === "kind") ||
        (type === "ImportDeclaration" && key === "importKind" && node.importKind === "value") ||
        (type === "ImportDeclaration" && key === "phase" && node.phase === "evaluation") ||
        (type === "Literal" &&
          (key === "value" ||
            key === "bigint" ||
            key === "regex" ||
            key === "exp" ||
            key === "pattern" ||
            key === "flags"))
      ) {
        continue;
      }
      const child = node[key];
      if (
        (key === "decorators" || key === "attributes" || key === "extends" || key === "implements") &&
        Array.isArray(child) &&
        child.length === 0
      ) {
        continue;
      }
      if (child === undefined || (child === null && type !== "Literal") || (child === false && falseDefaults.has(key))) {
        continue;
      }
      const canonicalKey =
        key === "init" && type === "TSEnumMember"
          ? "initializer"
          : key === "typeOnly" && type === "ImportDeclaration"
            ? "importKind"
            : key === "typeOnly" && type === "ExportNamedDeclaration"
              ? "exportKind"
          : key === "isTypeOnly" && type === "ImportSpecifier"
          ? "importKind"
          : key === "isTypeOnly" && type === "ExportSpecifier"
            ? "exportKind"
        : key === "isAbstract"
          ? "abstract"
          : key === "isOptional"
            ? "optional"
            : key === "isOverride"
              ? "override"
              : key === "isStatic"
                ? "static"
        : key === "identifier" &&
          (type === "FunctionDeclaration" ||
            type === "FunctionExpression" ||
            type === "TSDeclareFunction" ||
            type === "ClassDeclaration" ||
            type === "ClassExpression")
          ? "id"
            : key === "typeParams"
              ? type === "TSTypeReference"
                ? "typeArguments"
                : "typeParameters"
            : key === "template" && type === "TaggedTemplateExpression"
              ? "quasi"
            : key === "parameters" && type === "TSTypeParameterDeclaration"
              ? "params"
            : key === "typeAnnotation" &&
                (type === "TSFunctionType" ||
                  type === "TSMethodSignature" ||
                  type === "TSConstructSignatureDeclaration" ||
                  type === "TSCallSignatureDeclaration")
              ? "returnType"
            : key === "typeAnn" &&
                (type === "TSMethodSignature" ||
                  type === "TSConstructSignatureDeclaration" ||
                  type === "TSCallSignatureDeclaration")
              ? "returnType"
            : key === "op" && type === "TSTypeOperator"
              ? "operator"
            : key === "paramName" && type === "TSTypePredicate"
              ? "parameterName"
            : key === "elemTypes" && type === "TSTupleType"
              ? "elementTypes"
            : key === "elemType" && type === "TSArrayType"
              ? "elementType"
            : key === "params" && type === "TSIndexSignature"
              ? "parameters"
          : key === "stmts" &&
              (originalType === "FunctionBody" || originalType === "BlockStatement")
            ? "body"
            : key;
      if (
        key === "quasis" &&
        Array.isArray(child) &&
        (type === "TemplateLiteral" || type === "TSTemplateLiteralType")
      ) {
        const spans = canonicalTemplateQuasiSpans(node, source, byteOffsets);
        output[canonicalKey] = child.map((quasi, index) =>
          visit(quasi, type, spans?.[index], "quasis", false),
        );
      } else {
        const continuesOptionalChain = key === "object" || key === "callee";
        const childIsInOptionalChain =
          continuesOptionalChain &&
          ((originalType === "OptionalMemberExpression" ||
            originalType === "OptionalCallExpression") ||
            (withinOptionalChain &&
              (type === "MemberExpression" || type === "CallExpression")));
        output[canonicalKey] = visit(
          key === "isTypeOnly"
            ? child === true
              ? "type"
              : "value"
            : key === "typeOnly"
              ? child === true
                ? "type"
                : "value"
            : key === "kind" && child === "getter"
              ? "get"
              : key === "kind" && child === "setter"
                ? "set"
                : child,
          type,
          undefined,
          key,
          childIsInOptionalChain,
        );
      }
    }

    if (hasMethodFunction) {
      for (const key of ["id", "generator", "async", "params", "body", "expression", "typeParameters", "returnType"]) {
        const child = methodFunction[key];
        if (child === undefined || child === null || (child === false && falseDefaults.has(key))) continue;
        if (key === "id" && child === null) continue;
        output[key] = visit(child, type);
      }
    }
    const thisParam =
      (methodFunction ?? node).thisParam;
    if (thisParam !== null && thisParam !== undefined) {
      const params = Array.isArray(output.params) ? output.params : [];
      output.params = [visit(thisParam, type), ...params];
    }
    if (
      type === "Property" &&
      span === undefined &&
      (originalType === "ObjectProperty" ||
        originalType === "KeyValueProperty" ||
        originalType === "KeyValuePatternProperty")
    ) {
      const keySpan =
        normalizedSpan(node.key as Record<string, unknown>, byteOffsets) ??
        ((output.key as Record<string, unknown> | undefined)?.span as number[] | undefined);
      const valueSpan = (output.value as Record<string, unknown> | undefined)?.span as number[] | undefined;
      if (keySpan && valueSpan) output.span = [keySpan[0], valueSpan[1]];
    }
    if (type === "ImportDeclaration" && output.importKind === undefined) output.importKind = "value";
    if (type === "ExportNamedDeclaration" && output.exportKind === undefined) output.exportKind = "value";
    if (type === "ExportNamedDeclaration" && output.specifiers === undefined) output.specifiers = [];
    if (type === "TSMethodSignature" && output.kind === undefined) output.kind = "method";

    if (
      (type === "Program" || type === "BlockStatement") &&
      Array.isArray(node.directives) &&
      node.directives.length > 0
    ) {
      const directives = node.directives.map((directive) => visit(directive, type));
      const body = Array.isArray(output.body) ? output.body : [];
      output.body = [...body, ...directives].sort(
        (a, b) =>
          ((((a as Record<string, unknown>).span as number[] | undefined)?.[0] ?? 0) -
            (((b as Record<string, unknown>).span as number[] | undefined)?.[0] ?? 0)),
      );
    }

    if (
      type === "TSNonNullExpression" &&
      output.expression !== null &&
      typeof output.expression === "object" &&
      (output.expression as Record<string, unknown>).type === "ChainExpression"
    ) {
      const chain = output.expression as Record<string, unknown>;
      output.expression = chain.expression;
      return {
        type: "ChainExpression",
        ...(span ? { span } : {}),
        expression: output,
      };
    }

    if (originalType === "FunctionExpression" && parentType === "MethodDefinition") {
      return output;
    }
    return output;
  }

  return visit(value);
}

function normalizedSpan(
  node: Record<string, unknown>,
  byteOffsets: number[] | undefined,
): [number, number] | undefined {
  if (Array.isArray(node.__normalizedSpan)) {
    return node.__normalizedSpan as [number, number];
  }
  const raw = node.span as { start?: number; end?: number } | undefined;
  const start = typeof node.start === "number" ? node.start : raw?.start;
  const end = typeof node.end === "number" ? node.end : raw?.end;
  if (start === undefined || end === undefined) return undefined;
  if (!byteOffsets) return [start, end];
  return [byteOffsets[start - 1] ?? -1, byteOffsets[end - 1] ?? -1];
}

function canonicalTypedIdentifierSpan(
  node: Record<string, unknown>,
  source: string,
  byteOffsets: number[] | undefined,
): [number, number] | undefined {
  const name = node.name ?? node.value;
  const annotation =
    node.typeAnnotation !== null && typeof node.typeAnnotation === "object"
      ? normalizedSpan(node.typeAnnotation as Record<string, unknown>, byteOffsets)
      : undefined;
  const span = normalizedSpan(node, byteOffsets);
  if (typeof name !== "string" || !span) return undefined;
  const tokenEnd = span[0] + name.length;
  const optionalEnd =
    node.optional === true && source[tokenEnd] === "?" ? tokenEnd + 1 : tokenEnd;
  if (!annotation) {
    return optionalEnd === tokenEnd ? undefined : [span[0], optionalEnd];
  }
  if (
    source.slice(span[0], tokenEnd) === name &&
    annotation[0] === optionalEnd &&
    (annotation[1] === span[1] || span[1] === tokenEnd || span[1] === optionalEnd)
  ) {
    return [span[0], optionalEnd];
  }
  return undefined;
}

function canonicalTemplateQuasiSpans(
  node: Record<string, unknown>,
  source: string,
  byteOffsets: number[] | undefined,
): Array<[number, number]> | undefined {
  const templateSpan = normalizedSpan(node, byteOffsets);
  const quasis = node.quasis;
  const expressions = node.expressions ?? node.types;
  if (
    !templateSpan ||
    !Array.isArray(quasis) ||
    !Array.isArray(expressions) ||
    quasis.length !== expressions.length + 1
  ) {
    return undefined;
  }
  const [templateStart, templateEnd] = templateSpan;
  if (source[templateStart] !== "`" || source[templateEnd - 1] !== "`") return undefined;

  const spans: Array<[number, number]> = [];
  let cursor = templateStart + 1;
  for (let index = 0; index < expressions.length; index++) {
    const expression = expressions[index];
    if (expression === null || typeof expression !== "object") return undefined;
    const expressionSpan = normalizedSpan(
      expression as Record<string, unknown>,
      byteOffsets,
    );
    if (!expressionSpan) return undefined;
    const open = findTemplateInterpolation(source, cursor, expressionSpan[0]);
    if (open === undefined || !templateRawMatches(quasis[index], source, cursor, open)) {
      return undefined;
    }
    spans.push([cursor, open]);

    const close = skipTemplateTrivia(source, expressionSpan[1]);
    if (close === undefined || source[close] !== "}") return undefined;
    cursor = close + 1;
  }

  if (!templateRawMatches(quasis.at(-1), source, cursor, templateEnd - 1)) {
    return undefined;
  }
  spans.push([cursor, templateEnd - 1]);
  return spans;
}

function findTemplateInterpolation(
  source: string,
  start: number,
  expressionStart: number,
): number | undefined {
  for (let offset = start; offset + 1 < expressionStart; offset++) {
    if (
      source.startsWith("${", offset) &&
      !isEscapedTemplateDelimiter(source, offset) &&
      isTemplateTrivia(source, offset + 2, expressionStart)
    ) {
      return offset;
    }
  }
  return undefined;
}

function isEscapedTemplateDelimiter(source: string, offset: number): boolean {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && source[index] === "\\"; index--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function isTemplateTrivia(source: string, start: number, end: number): boolean {
  return skipTemplateTrivia(source, start) === end;
}

function skipTemplateTrivia(source: string, start: number): number | undefined {
  let offset = start;
  while (offset < source.length) {
    if (/\s/.test(source[offset]!)) {
      offset++;
    } else if (source.startsWith("//", offset)) {
      const newline = source.indexOf("\n", offset + 2);
      offset = newline === -1 ? source.length : newline + 1;
    } else if (source.startsWith("/*", offset)) {
      const end = source.indexOf("*/", offset + 2);
      if (end === -1) return undefined;
      offset = end + 2;
    } else {
      break;
    }
  }
  return offset;
}

function templateRawMatches(
  quasi: unknown,
  source: string,
  start: number,
  end: number,
): boolean {
  if (quasi === null || typeof quasi !== "object") return false;
  const record = quasi as Record<string, unknown>;
  const value =
    record.value !== null && typeof record.value === "object"
      ? (record.value as Record<string, unknown>)
      : record;
  return typeof value.raw === "string" && source.slice(start, end) === value.raw;
}

function makeUtf8OffsetMap(source: string): number[] {
  const map: number[] = [];
  let bytes = 0;
  for (let offset = 0; offset < source.length; ) {
    const codePoint = source.codePointAt(offset)!;
    const char = String.fromCodePoint(codePoint);
    map[bytes] = offset;
    bytes += Buffer.byteLength(char);
    offset += char.length;
    map[bytes] = offset;
  }
  return map;
}

interface Difference {
  path: string;
  expected: unknown;
  actual: unknown;
  kind: "schema" | "structure" | "node-type" | "value" | "span" | "source-profile";
}

export function firstDifference(expected: unknown, actual: unknown, path = "$"): Difference | undefined {
  if (Object.is(expected, actual)) return undefined;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.min(expected.length, actual.length);
    for (let index = 0; index < length; index++) {
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return expected.length === actual.length
      ? undefined
      : {
          path: `${path}.length`,
          expected: expected.length,
          actual: actual.length,
          kind: "structure",
        };
  }
  if (
    expected !== null &&
    actual !== null &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
    for (const key of keys) {
      if (!(key in expectedRecord) || !(key in actualRecord)) {
        return {
          path: `${path}.${key}`,
          expected: key in expectedRecord ? expectedRecord[key] : "<absent>",
          actual: key in actualRecord ? actualRecord[key] : "<absent>",
          kind: "schema",
        };
      }
      const difference = firstDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return undefined;
  }
  const leaf = path.split(".").at(-1)?.replace(/\[\d+\]$/, "");
  const kind: Difference["kind"] =
    leaf === "sourceType" ||
    (leaf === "type" &&
      (expected === "ParenthesizedExpression" || actual === "ParenthesizedExpression"))
      ? "source-profile"
      : leaf === "type"
    ? "node-type"
    : leaf === "span"
      ? "span"
      : leaf === "value" ||
          leaf === "operator" ||
          leaf === "name" ||
          leaf === "kind" ||
          leaf === "flags" ||
          leaf === "pattern" ||
          leaf === "computed" ||
          leaf === "async" ||
          leaf === "generator" ||
          leaf === "optional" ||
          leaf === "readonly" ||
          leaf === "static" ||
          leaf === "importKind"
        ? "value"
        : "structure";
  return { path, expected, actual, kind };
}

function formatDifference(difference: Difference): string {
  const format = (value: unknown) => {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text.length > 120 ? `${text.slice(0, 117)}...` : text;
  };
  const detail = {
    schema: "schema-normalization mismatch",
    structure: "AST structure mismatch",
    "node-type": "normalized node-type mismatch",
    value: "AST value/operator mismatch",
    span: "source-span mismatch",
    "source-profile": "source-profile mismatch (module/script mode or parenthesis preservation)",
  }[difference.kind];
  return `${detail} at ${difference.path}: expected ${format(difference.expected)}, actual ${format(difference.actual)}`;
}

function assertParseValid(summary: ParseSummary, parserLabel: string, fileKey: string): void {
  if (summary.nodeCount === 0 || Object.keys(summary.nodeTypes).length === 0) {
    throw new Error(`${parserLabel} returned an empty AST for ${fileKey}`);
  }
}

export function compareSummaries(
  summaries: Array<{ label: string; summary: ParseSummary }>,
  fileKey: string,
): string[] {
  const reference = summaries[0]!;
  const mismatches: string[] = [];
  for (const { label, summary } of summaries.slice(1)) {
    if (summary.nodeCount !== reference.summary.nodeCount) {
      mismatches.push(
        `normalized node-count mismatch: ${reference.label} expected ${reference.summary.nodeCount}, ${label} actual ${summary.nodeCount}`,
      );
    }
    const types = new Set([
      ...Object.keys(reference.summary.nodeTypes),
      ...Object.keys(summary.nodeTypes),
    ]);
    const differences = [...types]
      .filter((type) => reference.summary.nodeTypes[type] !== summary.nodeTypes[type])
      .map(
        (type) =>
          `${type}: expected ${reference.summary.nodeTypes[type] ?? 0}, actual ${summary.nodeTypes[type] ?? 0}`,
      );
    if (differences.length > 0) {
      mismatches.push(`node types ${reference.label}/${label}: ${differences.slice(0, 20).join(", ")}`);
    }
    const astDifference = firstDifference(reference.summary.ast, summary.ast);
    if (astDifference) {
      mismatches.push(`AST ${reference.label}/${label}: ${formatDifference(astDifference)}`);
    }
    if (reference.summary.comments !== null && summary.comments !== null) {
      const difference = firstDifference(
        reference.summary.comments,
        summary.comments,
        "$.comments",
      );
      if (difference) {
        mismatches.push(
          `${fileKey}: comments ${reference.label}/${label}: ${formatDifference(difference)}`,
        );
      }
    }
  }

  return mismatches.map((mismatch) => `${fileKey}: ${mismatch}`);
}

  export async function runAfterPreflight<T>(
    preflight: () => Promise<void>,
    timed: () => Promise<T>,
  ): Promise<T> {
    await preflight();
    return timed();
  }

function parserLabel(name: string, parserNames: string[]): string {
  return `Parser ${String.fromCharCode(65 + parserNames.indexOf(name))}`;
}

function spawnChild(args: string[], stderr: "pipe" | "inherit") {
  const runtimeArgs = process.execArgv.includes("--experimental-strip-types")
    ? ["--experimental-strip-types"]
    : [];
  const proc = spawnSync(
    process.execPath,
    [...runtimeArgs, ...args],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", stderr],
    },
  );
  if (proc.error) {
    throw new Error(`Could not start child process: ${proc.error.message}`);
  }
  return proc;
}

async function preflightFile(
  fileKey: string,
  file: { path: string; lang: SourceLang },
): Promise<void> {
  const proc = spawnChild(["scripts/bench.ts", "--check-child", fileKey], "pipe");
  if (proc.status !== 0) {
    const exit = proc.signal ? `signal ${proc.signal}` : `code ${proc.status ?? "unknown"}`;
    throw new Error(proc.stderr?.trim() || `Preflight process exited with ${exit}`);
  }
  const out = JSON.parse(proc.stdout ?? "") as { ok: boolean; error?: string };
  if (!out.ok) throw new Error(out.error ?? `Preflight failed for ${fileKey}`);
}

// Child mode: benchmark a single parser against a single file in a fresh
// process, so JIT state and GC pressure from one parser never affect another.
// Emits a single JSON object on stdout, all logging goes to stderr.

async function runTask(fileKey: string, parserName: string): Promise<void> {
  const file = FILES[fileKey];
  if (!file) throw new Error(`Unknown file: ${fileKey}`);

  const source = await readFile(join(process.cwd(), file.path), "utf-8");
  const tasks = createParserTasks(source, file.lang);
  const fn = tasks[parserName];
  if (!fn) {
    const label = parserLabel(parserName, parserNamesFor(file.lang));
    throw new Error(`${label} does not support ${fileKey}`);
  }

  const parsed = fn();
  if (parsed.diagnostics.length > 0) {
    throw new Error(`Parse diagnostics: ${parsed.diagnostics.join("; ")}`);
  }

  const bench = new Bench({ time: BENCH_TIME, warmupTime: BENCH_WARMUP });
  bench.add(parserName, () => {
    const result = fn();
    if (result.diagnostics.length > 0) {
      throw new Error(`Parse diagnostics: ${result.diagnostics.join("; ")}`);
    }
    return result.program;
  });
  await bench.run();

  const task = bench.tasks[0];
  if (!task?.result || task.result.state !== "completed") {
    process.stdout.write(JSON.stringify({ ok: false }));
    return;
  }

  const latency = task.result.latency;
  const result: RunResult = {
    name: parserName,
    mean: latency.mean,
    min: latency.min,
    max: latency.max,
    median: latency.p50,
    stddev: latency.sd,
    rme: latency.rme,
    samples: latency.samplesCount,
  };
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

async function runFilePreflight(fileKey: string): Promise<void> {
  const file = FILES[fileKey];
  if (!file) throw new Error(`Unknown file: ${fileKey}`);
  const source = await readFile(join(process.cwd(), file.path), "utf-8");
  const expected = await loadOxcBaseline(fileKey, source, file.lang, isParseSummary);
  const syntheticBodySpans = collectSyntheticBodySpans(expected.ast);
  const parserNames = parserNamesFor(file.lang);
  const tasks = createParserTasks(source, file.lang);
  const mismatches: string[] = [];

  for (const name of parserNames) {
    const label = parserLabel(name, parserNames);
    let output: ParseOutput;
    try {
      output = tasks[name]!();
    } catch (error) {
      throw new Error(`${label} parse failed: ${String(error)}`);
    }
    if (output.diagnostics.length > 0) {
      const sourceType = file.lang === "dts" ? "script" : "module";
      throw new Error(
        `${label} parse diagnostics for ${file.path} (lang=${file.lang}, sourceType=${sourceType}; source length=${source.length}): ${output.diagnostics.join("; ")}`,
      );
    }
    const summary = summarizeParse(
      output,
      name,
      source,
      file.lang === "dts" ? "script" : "module",
      syntheticBodySpans,
    );
    assertParseValid(summary, label, fileKey);
    mismatches.push(
      ...compareSummaries(
        [
          { label: "Oxc baseline", summary: expected },
          { label, summary },
        ],
        fileKey,
      ),
    );
  }
  if (mismatches.length > 0) {
    throw new Error(`Preflight mismatch: ${mismatches.join("; ")}`);
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function aggregateRuns(name: string, runs: RunResult[]): BenchResult {
  return {
    name,
    mean: median(runs.map((r) => r.mean)),
    min: Math.min(...runs.map((r) => r.min)),
    max: Math.max(...runs.map((r) => r.max)),
    median: median(runs.map((r) => r.median)),
    stddev: median(runs.map((r) => r.stddev)),
    rme: median(runs.map((r) => r.rme)),
    samples: runs.reduce((sum, r) => sum + r.samples, 0),
    runs: runs.length,
  };
}

async function benchFile(
  fileKey: string,
  file: { path: string; lang: SourceLang },
): Promise<FileResult> {
  console.log(`\nBenchmarking ${fileKey}...`);

  const results: BenchResult[] = [];
  const parserNames = parserNamesFor(file.lang);
  const parserLabelFor = (name: string) => parserLabel(name, parserNames);

  const runsByParser = new Map(parserNames.map((name) => [name, [] as RunResult[]]));
  await runAfterPreflight(() => preflightFile(fileKey, file), async () => {
    for (let run = 1; run <= BENCH_RUNS; run++) {
      const orderedParsers = Array.from({ length: parserNames.length }, (_, i) =>
        parserNames[(i + run - 1) % parserNames.length]!,
      );
      for (const name of orderedParsers) {
        console.log(`  ${parserLabelFor(name)} (run ${run}/${BENCH_RUNS})`);
        const proc = spawnChild(
          ["scripts/bench.ts", "--task", fileKey, name],
          "inherit",
        );
        if (proc.status !== 0) {
          const exit = proc.signal
            ? `signal ${proc.signal}`
            : `exit code ${proc.status ?? "unknown"}`;
          throw new Error(`${parserLabelFor(name)} run ${run} failed with ${exit}`);
        }
        let out: { ok: boolean; result?: RunResult; error?: string };
        try {
          out = JSON.parse(proc.stdout ?? "") as { ok: boolean; result?: RunResult };
        } catch {
          throw new Error(`${parserLabelFor(name)} run ${run} returned invalid benchmark output`);
        }
        if (out.ok && out.result) runsByParser.get(name)!.push(out.result);
        else throw new Error(`${parserLabelFor(name)} run ${run} failed: ${out.error ?? "incomplete result"}`);
      }
    }
  });
  for (const name of parserNames) results.push(aggregateRuns(name, runsByParser.get(name)!));

  results.sort((a, b) => a.median - b.median);
  console.table(
    results.map((r) => ({
      Parser: parserLabelFor(r.name),
      "Median (ms)": r.median.toFixed(3),
      "±RME": `${r.rme.toFixed(2)}%`,
      Samples: r.samples,
      Runs: r.runs,
    })),
  );

  return { file: fileKey, results };
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--generate-ast-cache") {
    await generateAstCache(args.slice(1));
    return;
  }

  if (args[0] === "--task") {
    const [, fileKey, parserName] = args;
    if (!fileKey || !parserName) throw new Error("Usage: bench.ts --task <file> <parser>");
    try {
      await runTask(fileKey, parserName);
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(error) }));
    }
    return;
  }

  if (args[0] === "--check-child") {
    const fileKey = args[1];
    if (!fileKey) throw new Error("Usage: bench.ts --check-child <file>");
    try {
      await runFilePreflight(fileKey);
      process.stdout.write(JSON.stringify({ ok: true }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: String(error) }));
    }
    return;
  }

  if (args[0] === "--validate") {
    const fileKey = args[1];
    const file = FILES[fileKey];
    if (!file) throw new Error("Usage: bench.ts --validate <file>");
    await preflightFile(fileKey, file);
    return;
  }

  const filesToBench =
    args.length > 0
      ? Object.entries(FILES).filter(([key]) => args.includes(key))
      : Object.entries(FILES);

  await mkdir(join(process.cwd(), "result"), { recursive: true });

  for (const [key, file] of filesToBench) {
    const result = await benchFile(key, file);
    await writeFile(join(process.cwd(), "result", `${key}.json`), JSON.stringify(result, null, 2));
  }

  console.log("\nBenchmark complete!");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
