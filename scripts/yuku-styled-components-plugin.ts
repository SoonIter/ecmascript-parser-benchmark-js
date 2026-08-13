import { b, walk, type Visitors } from "yuku-ast";
import type {
  Expression,
  ImportDeclaration,
  ObjectProperty,
  Program,
  Super,
  TaggedTemplateExpression,
  VariableDeclarator,
  WalkContext,
} from "yuku-parser";

const STYLED_COMPONENTS_MODULE = "styled-components";
const HELPER_IMPORTS = new Set(["css", "createGlobalStyle", "keyframes"]);
const PLACEHOLDER_PATTERN = /__PLACEHOLDER_(\d+)__/g;
const PLACEHOLDER_SPLIT_PATTERN = /__PLACEHOLDER_\d+__/g;
const SYMBOL_PATTERN = /(\s*[;:{},]\s*)/g;

export interface YukuStyledComponentsOptions {
  displayName: boolean;
  minify: boolean;
  pure: boolean;
  ssr: boolean;
}

interface PluginState {
  componentIndex: number;
  fileLabel: string;
  fileHash: string;
  helperNames: Set<string>;
  options: YukuStyledComponentsOptions;
  styledNames: Set<string>;
}

interface MinifiedTemplate {
  expressionIndexes: number[];
  values: string[];
}

function stringLiteral(value: string) {
  return b.Literal({ value, raw: JSON.stringify(value) });
}

function identifier(name: string) {
  return b.Identifier({ name });
}

function property(name: string, value: string): ObjectProperty {
  return b.Property({
    kind: "init",
    key: identifier(name),
    value: stringLiteral(value),
    method: false,
    shorthand: false,
    computed: false,
  }) as ObjectProperty;
}

function importedName(specifier: ImportDeclaration["specifiers"][number]): string | null {
  if (specifier.type !== "ImportSpecifier") return null;
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return typeof specifier.imported.value === "string" ? specifier.imported.value : null;
}

function collectImports(program: Program): Pick<PluginState, "helperNames" | "styledNames"> {
  const helperNames = new Set<string>();
  const styledNames = new Set<string>();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.source.value !== STYLED_COMPONENTS_MODULE) continue;

    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportDefaultSpecifier") {
        styledNames.add(specifier.local.name);
        continue;
      }
      const name = importedName(specifier);
      if (name === "styled") styledNames.add(specifier.local.name);
      if (name !== null && HELPER_IMPORTS.has(name)) helperNames.add(specifier.local.name);
    }
  }

  return { helperNames, styledNames };
}

function hasStyledRoot(expression: Expression | Super, styledNames: Set<string>): boolean {
  if (expression.type === "Identifier") return styledNames.has(expression.name);
  if (expression.type === "MemberExpression") {
    return hasStyledRoot(expression.object, styledNames);
  }
  if (expression.type === "CallExpression") {
    return hasStyledRoot(expression.callee, styledNames);
  }
  if (expression.type === "ParenthesizedExpression") {
    return hasStyledRoot(expression.expression, styledNames);
  }
  if (expression.type === "ChainExpression") {
    return hasStyledRoot(expression.expression, styledNames);
  }
  return false;
}

function isHelperTag(expression: Expression, helperNames: Set<string>): boolean {
  return expression.type === "Identifier" && helperNames.has(expression.name);
}

function declarationName(
  context: WalkContext<TaggedTemplateExpression>,
): string | null {
  const ancestors = context.ancestors();
  for (let index = ancestors.length - 1; index >= 0; index--) {
    const ancestor = ancestors[index];
    if (ancestor?.type !== "VariableDeclarator") continue;
    const declaration = ancestor as VariableDeclarator;
    if (declaration.id.type === "Identifier") return declaration.id.name;
  }
  return null;
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function stripLineComment(line: string): string {
  const fragments = line.split("//");
  let result = fragments[0] ?? "";
  for (let index = 1; index < fragments.length; index++) {
    const outsideString = countOccurrences(result, "'") % 2 === 0 &&
      countOccurrences(result, '"') % 2 === 0;
    const outsideParentheses = countOccurrences(result, "(") === countOccurrences(result, ")");
    if (!result.endsWith(":") && outsideString && outsideParentheses) break;
    result += `//${fragments[index]}`;
  }
  return result;
}

function compressSymbols(code: string): string {
  return code.split(SYMBOL_PATTERN).reduce((result, fragment, index) => {
    if (index % 2 === 0) return result + fragment;
    const insideSingleQuote = countOccurrences(result, "'") % 2 !== 0;
    const insideDoubleQuote = countOccurrences(result, '"') % 2 !== 0;
    if (insideSingleQuote || insideDoubleQuote) return result + fragment;
    if (/^\s+:/.test(fragment)) return `${result} ${fragment.trim()}`;
    return result + fragment.trim();
  }, "");
}

function minifyCSS(code: string): string {
  const lines = code
    .replace(/\/\*[^!][\s\S]*?\*\//g, "\n")
    .split(/(?:\\r|\\n|\r|\n)\s*/g)
    .filter((line) => line.length > 0 && !line.trim().startsWith("//"))
    .map(stripLineComment);
  return compressSymbols(lines.join(" "));
}

function minifyTemplate(node: TaggedTemplateExpression): MinifiedTemplate {
  let combined = "";
  for (let index = 0; index < node.quasi.quasis.length; index++) {
    const quasi = node.quasi.quasis[index]!;
    combined += quasi.value.cooked ?? quasi.value.raw;
    if (index < node.quasi.expressions.length) combined += `__PLACEHOLDER_${index}__`;
  }

  const minified = minifyCSS(combined);
  const expressionIndexes = Array.from(
    minified.matchAll(PLACEHOLDER_PATTERN),
    (match) => Number(match[1]),
  );
  return {
    expressionIndexes,
    values: minified.split(PLACEHOLDER_SPLIT_PATTERN),
  };
}

function fileLabel(filename: string): string {
  const normalized = filename.replaceAll("\\", "/");
  const parts = normalized.split("/").filter((part) => part.length > 0);
  const basename = parts.at(-1)?.replace(/\.[^.]+$/, "") ?? "component";
  const meaningful = basename === "index" ? parts.at(-2) ?? basename : basename;
  return meaningful.replace(/[^A-Za-z0-9_-]/g, "");
}

function hashFilename(filename: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < filename.length; index++) {
    hash ^= filename.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function configuredTag(
  tag: Expression,
  displayName: string | null,
  state: PluginState,
): Expression {
  const properties = [];
  if (state.options.displayName && displayName !== null) {
    properties.push(property("displayName", `${state.fileLabel}__${displayName}`));
  }
  if (state.options.ssr) {
    properties.push(
      property("componentId", `sc-${state.fileHash}-${state.componentIndex}`),
    );
  }
  state.componentIndex++;
  if (properties.length === 0) return tag;

  return b.CallExpression({
    callee: b.MemberExpression({
      object: tag,
      property: identifier("withConfig"),
      computed: false,
      optional: false,
    }),
    arguments: [b.ObjectExpression({ properties })],
    optional: false,
  });
}

function transformTemplate(
  node: TaggedTemplateExpression,
  context: WalkContext<TaggedTemplateExpression>,
  state: PluginState,
): void {
  const styled = hasStyledRoot(node.tag, state.styledNames);
  if (!styled && !isHelperTag(node.tag, state.helperNames)) return;

  const template = state.options.minify
    ? minifyTemplate(node)
    : {
        expressionIndexes: node.quasi.expressions.map((_, index) => index),
        values: node.quasi.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw),
      };
  const callee = styled
    ? configuredTag(node.tag, declarationName(context), state)
    : node.tag;
  const expressions = template.expressionIndexes.map(
    (index) => node.quasi.expressions[index]!,
  );
  const call = b.CallExpression({
    callee,
    arguments: [
      b.ArrayExpression({ elements: template.values.map(stringLiteral) }),
      ...expressions,
    ],
    optional: false,
  });
  if (state.options.pure) {
    call.comments = [
      { type: "Block", position: "before", sameLine: true, value: "#__PURE__" },
    ];
  }
  context.replace(call);
}

export function transformStyledComponentsYuku(
  program: Program,
  filename: string,
  options: YukuStyledComponentsOptions,
): void {
  const imports = collectImports(program);
  const state: PluginState = {
    componentIndex: 0,
    fileLabel: fileLabel(filename),
    fileHash: hashFilename(filename),
    helperNames: imports.helperNames,
    options,
    styledNames: imports.styledNames,
  };
  const visitors: Visitors<PluginState> = {
    TaggedTemplateExpression(node, context) {
      transformTemplate(node, context, context.state);
    },
  };
  walk(program, visitors, state);
}
