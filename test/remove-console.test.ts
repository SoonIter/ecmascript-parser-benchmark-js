import { expect, test } from "bun:test";
import { transformSync } from "@babel/core";
import { generate } from "yuku-codegen";
import { parse } from "yuku-parser";
import {
  babelRemoveConsolePlugin,
  removeConsoleYuku,
} from "../scripts/remove-console";

const source = `
console.log("statement");
function value() {
  return console.error("nested");
}
const keep = external();
`;

test("Babel remove-console plugin removes statement and expression calls", () => {
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [babelRemoveConsolePlugin],
  });
  expect(result?.code).not.toContain("console.");
  expect(result?.code).toContain("return void 0");
  expect(result?.code).toContain("external()");
  expect(parse(result!.code!).diagnostics).toEqual([]);
});

test("Yuku remove-console plugin removes statement and expression calls", () => {
  const { program } = parse(source);
  removeConsoleYuku(program);
  const result = generate(program, { comments: "none" });
  expect(result.errors).toEqual([]);
  expect(result.code).not.toContain("console.");
  expect(result.code).toContain("return void 0");
  expect(result.code).toContain("external()");
  expect(parse(result.code).diagnostics).toEqual([]);
});
