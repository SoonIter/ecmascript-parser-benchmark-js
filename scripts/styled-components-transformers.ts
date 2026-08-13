import { transformSync as babelTransformSync } from "@babel/core";
import { transformSync as swcTransformSync } from "@swc/core";
import babelStyledComponentsPlugin from "babel-plugin-styled-components";
import { walk } from "yuku-ast";
import { generate as yukuGenerate } from "yuku-codegen";
import { parse as yukuParse } from "yuku-parser";
import type { StyledComponentsFixture } from "./styled-components-fixture";
import { STYLED_COMPONENTS_FILENAME } from "./styled-components-fixture";
import {
  transformStyledComponentsYuku,
  type YukuStyledComponentsOptions,
} from "./yuku-styled-components-plugin";

export const STYLED_COMPONENTS_OPTIONS = {
  displayName: true,
  minify: true,
  pure: true,
  ssr: true,
} satisfies YukuStyledComponentsOptions;

export const STYLED_COMPONENTS_TRANSFORMERS = [
  "Babel + JS plugin",
  "SWC + WASM plugin",
  "Yuku + JS plugin",
] as const;

export type StyledComponentsTransformerName =
  (typeof STYLED_COMPONENTS_TRANSFORMERS)[number];

export interface StyledComponentsValidation {
  componentIds: number;
  displayNames: number;
  minifiedRules: number;
  outputBytes: number;
  outputCodeUnits: number;
  pureAnnotations: number;
  taggedTemplates: number;
  uniqueComponentIds: number;
  withConfigCalls: number;
}

export function transformStyledComponentsBabel(source: string): string {
  const result = babelTransformSync(source, {
    ast: false,
    babelrc: false,
    code: true,
    comments: true,
    compact: false,
    configFile: false,
    filename: STYLED_COMPONENTS_FILENAME,
    parserOpts: {
      attachComment: false,
      sourceType: "module",
    },
    plugins: [[babelStyledComponentsPlugin, STYLED_COMPONENTS_OPTIONS]],
    sourceMaps: false,
  });
  if (result?.code == null) throw new Error("Babel did not generate code");
  return result.code;
}

export function transformStyledComponentsSwc(source: string): string {
  return swcTransformSync(source, {
    filename: STYLED_COMPONENTS_FILENAME,
    jsc: {
      experimental: {
        plugins: [["@swc/plugin-styled-components", STYLED_COMPONENTS_OPTIONS]],
      },
      parser: {
        jsx: false,
        syntax: "ecmascript",
      },
      target: "es2022",
    },
    minify: false,
    module: { type: "es6" },
    sourceMaps: false,
  }).code;
}

export function transformStyledComponentsYukuPipeline(source: string): string {
  const parsed = yukuParse(source, {
    attachComments: false,
    lang: "js",
    sourceType: "module",
  });
  transformStyledComponentsYuku(
    parsed.program,
    STYLED_COMPONENTS_FILENAME,
    STYLED_COMPONENTS_OPTIONS,
  );
  const result = yukuGenerate(parsed.program, {
    comments: "some",
    format: "pretty",
  });
  if (result.errors.length > 0) {
    throw new Error(`Yuku codegen failed: ${result.errors[0]!.message}`);
  }
  return result.code;
}

export function transformStyledComponentsFor(
  name: StyledComponentsTransformerName,
  source: string,
): string {
  switch (name) {
    case "Babel + JS plugin":
      return transformStyledComponentsBabel(source);
    case "SWC + WASM plugin":
      return transformStyledComponentsSwc(source);
    case "Yuku + JS plugin":
      return transformStyledComponentsYukuPipeline(source);
  }
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

export function validateStyledComponentsOutput(
  name: StyledComponentsTransformerName,
  output: string,
  fixture: StyledComponentsFixture,
): StyledComponentsValidation {
  if (output.length === 0) throw new Error(`${name} generated empty output`);

  const reparsed = yukuParse(output, { lang: "js", sourceType: "module" });
  if (reparsed.diagnostics.length > 0) {
    throw new Error(`${name} generated invalid JavaScript: ${reparsed.diagnostics[0]!.message}`);
  }

  let taggedTemplates = 0;
  walk(reparsed.program, {
    TaggedTemplateExpression() {
      taggedTemplates++;
    },
  });

  const componentIdValues = Array.from(
    output.matchAll(/\bcomponentId\s*:\s*["'`]([^"'`]+)["'`]/g),
    (match) => match[1]!,
  );
  const validation: StyledComponentsValidation = {
    componentIds: componentIdValues.length,
    displayNames: countMatches(output, /\bdisplayName\s*:/g),
    minifiedRules: countMatches(output, /display:grid/g),
    outputBytes: Buffer.byteLength(output),
    outputCodeUnits: output.length,
    pureAnnotations: countMatches(output, /#__PURE__/g),
    taggedTemplates,
    uniqueComponentIds: new Set(componentIdValues).size,
    withConfigCalls: countMatches(output, /\.withConfig\s*\(/g),
  };

  if (validation.withConfigCalls !== fixture.styledComponentCount) {
    throw new Error(
      `${name} generated ${validation.withConfigCalls} withConfig calls, ` +
        `expected ${fixture.styledComponentCount}`,
    );
  }
  if (validation.displayNames !== fixture.styledComponentCount) {
    throw new Error(
      `${name} generated ${validation.displayNames} display names, ` +
        `expected ${fixture.styledComponentCount}`,
    );
  }
  if (validation.componentIds !== fixture.styledComponentCount) {
    throw new Error(
      `${name} generated ${validation.componentIds} component IDs, ` +
        `expected ${fixture.styledComponentCount}`,
    );
  }
  if (validation.uniqueComponentIds !== fixture.styledComponentCount) {
    throw new Error(`${name} generated duplicate component IDs`);
  }
  const pureAnnotationsMinimum = fixture.styledComponentCount + 3;
  if (validation.pureAnnotations < pureAnnotationsMinimum) {
    throw new Error(
      `${name} generated ${validation.pureAnnotations} PURE annotations, ` +
        `expected at least ${pureAnnotationsMinimum}`,
    );
  }
  if (validation.pureAnnotations > fixture.templateCount) {
    throw new Error(`${name} generated more PURE annotations than transformed templates`);
  }
  if (validation.taggedTemplates !== 0) {
    throw new Error(`${name} left ${validation.taggedTemplates} tagged templates`);
  }
  if (validation.minifiedRules < fixture.styledComponentCount) {
    throw new Error(`${name} did not minify every display rule`);
  }
  return validation;
}
