import { expect, test } from "bun:test";
import { compareSummaries, runAfterPreflight } from "./bench.ts";

function summary(ast, comments = []) {
  return {
    nodeCount: 1,
    nodeTypes: { Identifier: 1 },
    comments,
    ast,
  };
}

test("matching summaries pass silently before timed work", async () => {
  const output = [];
  let timed = false;
  const originalLog = console.log;
  console.log = (...args) => output.push(args.join(" "));
  let result;
  try {
    result = await runAfterPreflight(
      async () => {
        const differences = compareSummaries(
          [
            { label: "Parser A", summary: summary({ type: "Identifier", name: "value", span: [0, 5] }) },
            { label: "Parser B", summary: summary({ type: "Identifier", name: "value", span: [0, 5] }) },
          ],
          "fixture",
        );
        if (differences.length > 0) throw new Error(differences.join("; "));
      },
      async () => {
        timed = true;
        return "timed";
      },
    );
  } finally {
    console.log = originalLog;
  }

  expect(result).toBe("timed");
  expect(timed).toBe(true);
  expect(output).toEqual([]);
});

test("AST comparison works when a parser does not expose flat comments", () => {
  const differences = compareSummaries(
    [
      { label: "Parser A", summary: summary({ type: "Identifier", name: "value", span: [0, 5] }) },
      {
        label: "Parser B",
        summary: summary({ type: "Identifier", name: "value", span: [0, 5] }, null),
      },
    ],
    "fixture",
  );

  expect(differences).toEqual([]);
});

test("flat comments are compared when both parsers expose them", () => {
  const differences = compareSummaries(
    [
      {
        label: "Parser A",
        summary: summary({ type: "Identifier", name: "value", span: [0, 5] }, [
          { type: "Line", value: "baseline", start: 0, end: 9 },
        ]),
      },
      {
        label: "Parser B",
        summary: summary({ type: "Identifier", name: "value", span: [0, 5] }, [
          { type: "Line", value: "changed", start: 0, end: 8 },
        ]),
      },
    ],
    "fixture",
  );

  expect(differences.some((difference) => difference.includes("comments Parser A/Parser B"))).toBe(
    true,
  );
});

test("a mismatch reports a parser-neutral path and prevents timed work", async () => {
  const output = [];
  let timed = false;
  const originalLog = console.log;
  console.log = (...args) => output.push(args.join(" "));
  try {
    await expect(
      runAfterPreflight(
        async () => {
          const differences = compareSummaries(
            [
              { label: "Parser A", summary: summary({ type: "Identifier", name: "expected", span: [0, 8] }) },
              { label: "Parser B", summary: summary({ type: "Identifier", name: "actual", span: [0, 6] }) },
            ],
            "fixture",
          );
          if (differences.length > 0) throw new Error(differences.join("; "));
        },
        async () => {
          timed = true;
          output.push("timer/result");
        },
      ),
    ).rejects.toThrow(
      /Parser A\/Parser B: AST value\/operator mismatch at \$\.name: expected "expected", actual "actual"/,
    );
  } finally {
    console.log = originalLog;
  }

  expect(timed).toBe(false);
  expect(output).toEqual([]);
});
