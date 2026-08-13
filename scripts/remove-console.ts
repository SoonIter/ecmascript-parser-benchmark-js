import {
  type NodePath,
  type PluginObject,
  types as babelTypes,
} from "@babel/core";
import { b, walk, type Visitors } from "yuku-ast";
import type {
  CallExpression as YukuCallExpression,
  Expression as YukuExpression,
  Program as YukuProgram,
} from "yuku-parser";

function isBabelConsoleCall(expression: babelTypes.Node | null | undefined): boolean {
  if (!babelTypes.isCallExpression(expression)) return false;
  const callee = expression.callee;
  if (!babelTypes.isMemberExpression(callee)) return false;
  return babelTypes.isIdentifier(callee.object, { name: "console" });
}

function isYukuConsoleCall(expression: YukuExpression): expression is YukuCallExpression {
  if (expression.type !== "CallExpression") return false;
  const callee = expression.callee;
  if (callee.type !== "MemberExpression") return false;
  return callee.object.type === "Identifier" && callee.object.name === "console";
}

export function babelRemoveConsolePlugin(): PluginObject {
  return {
    name: "benchmark-remove-console",
    visitor: {
      ExpressionStatement(path: NodePath<babelTypes.ExpressionStatement>) {
        if (isBabelConsoleCall(path.node.expression)) path.remove();
      },
      CallExpression(path: NodePath<babelTypes.CallExpression>) {
        if (!isBabelConsoleCall(path.node)) return;
        path.replaceWith(
          babelTypes.unaryExpression("void", babelTypes.numericLiteral(0), true),
        );
      },
    },
  };
}

const yukuRemoveConsoleVisitors: Visitors = {
  ExpressionStatement(node, context) {
    if (isYukuConsoleCall(node.expression)) context.remove();
  },
  CallExpression(node, context) {
    if (!isYukuConsoleCall(node)) return;
    context.replace(
      b.UnaryExpression({
        operator: "void",
        prefix: true,
        argument: b.Literal({ value: 0, raw: "0" }),
      }),
    );
  },
};

export function removeConsoleYuku(program: YukuProgram): void {
  walk(program, yukuRemoveConsoleVisitors);
}
