import { mkdir, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import { Bench } from "tinybench";
import { generate as yukuGenerate } from "yuku-codegen";
import { parse as yukuParse } from "yuku-parser";
import { babelRemoveConsolePlugin, removeConsoleYuku } from "./remove-console";

const FILES = {
  react: "files/react.js",
} as const;

const REMOVE_CONSOLE_EXERCISE = `
console.log("remove this statement");
void console.warn("replace this expression");
`;

const TRANSFORMERS = ["Babel", "Yuku"] as const;
const BENCH_TIME = Number(process.env.BENCH_TIME ?? 10000);
const BENCH_WARMUP = Number(process.env.BENCH_WARMUP ?? 2000);
const BENCH_RUNS = Number(process.env.BENCH_RUNS ?? 3);
const CONSOLE_CALL_PATTERN =
  /\bconsole\s*(?:\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\])\s*\(/g;

type FileKey = keyof typeof FILES;
type TransformerName = (typeof TRANSFORMERS)[number];

interface ValidationResult {
  consoleCallsInput: number;
  consoleCallsOutput: number;
  outputBytes: number;
  outputCodeUnits: number;
}

interface RunResult extends ValidationResult {
  name: TransformerName;
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
  file: FileKey;
  input: string;
  sourceBytes: number;
  benchmark: {
    timeMs: number;
    warmupMs: number;
    runs: number;
  };
  runtime: string;
  system: {
    os: string;
    cpu: string;
    cores: number;
    memoryGb: number;
  };
  versions: {
    babel: string;
    yukuAst: string;
    yukuCodegen: string;
    yukuParser: string;
  };
  results: BenchResult[];
}

let outputCodeUnitsLast = 0;

function transformBabel(source: string): string {
  const result = transformSync(source, {
    ast: false,
    babelrc: false,
    code: true,
    comments: false,
    compact: false,
    configFile: false,
    parserOpts: { attachComment: false, sourceType: "module" },
    plugins: [babelRemoveConsolePlugin],
    sourceMaps: false,
  });
  if (result?.code == null) throw new Error("Babel did not generate code");
  return result.code;
}

function transformYuku(source: string): string {
  const { program } = yukuParse(source, { lang: "js", sourceType: "module" });
  removeConsoleYuku(program);
  const result = yukuGenerate(program, { comments: "none", format: "pretty" });
  if (result.errors.length > 0) {
    throw new Error(`Yuku codegen failed: ${result.errors[0]!.message}`);
  }
  return result.code;
}

function transformFor(name: TransformerName, source: string): string {
  return name === "Babel" ? transformBabel(source) : transformYuku(source);
}

function createTask(name: TransformerName, source: string): () => void {
  return () => {
    outputCodeUnitsLast = transformFor(name, source).length;
  };
}

function countConsoleCalls(source: string): number {
  return source.match(CONSOLE_CALL_PATTERN)?.length ?? 0;
}

function validateTransform(name: TransformerName, source: string): ValidationResult {
  const output = transformFor(name, source);
  const consoleCallsInput = countConsoleCalls(source);
  const consoleCallsOutput = countConsoleCalls(output);
  if (output.length === 0) throw new Error(`${name} generated empty output`);
  if (consoleCallsInput === 0) throw new Error("benchmark input has no console calls to remove");
  if (consoleCallsOutput !== 0) {
    throw new Error(`${name} left ${consoleCallsOutput} console calls in the output`);
  }
  const reparsed = yukuParse(output, { lang: "js", sourceType: "module" });
  if (reparsed.diagnostics.length > 0) {
    throw new Error(`${name} generated invalid JavaScript: ${reparsed.diagnostics[0]!.message}`);
  }
  return {
    consoleCallsInput,
    consoleCallsOutput,
    outputBytes: Buffer.byteLength(output),
    outputCodeUnits: output.length,
  };
}

function isFileKey(value: string): value is FileKey {
  return value in FILES;
}

function isTransformerName(value: string): value is TransformerName {
  return TRANSFORMERS.some((name) => name === value);
}

async function readSource(fileKey: FileKey): Promise<string> {
  const source = await readFile(join(process.cwd(), FILES[fileKey]), "utf8");
  return `${source}\n${REMOVE_CONSOLE_EXERCISE}`;
}

async function readPackageVersion(packageName: string): Promise<string> {
  const packagePath = join(process.cwd(), "node_modules", packageName, "package.json");
  const packageData = (await Bun.file(packagePath).json()) as { version?: unknown };
  if (typeof packageData.version !== "string") {
    throw new Error(`Package ${packageName} does not declare a version`);
  }
  return packageData.version;
}

async function runTask(fileKey: FileKey, name: TransformerName): Promise<void> {
  const source = await readSource(fileKey);
  const validation = validateTransform(name, source);
  const bench = new Bench({ time: BENCH_TIME, warmupTime: BENCH_WARMUP });
  bench.add(name, createTask(name, source));
  await bench.run();

  const task = bench.tasks[0];
  if (!task?.result || task.result.state !== "completed") {
    process.stdout.write(JSON.stringify({ ok: false }));
    return;
  }

  if (outputCodeUnitsLast !== validation.outputCodeUnits) {
    throw new Error(`${name} output changed during the benchmark`);
  }
  const latency = task.result.latency;
  const result: RunResult = {
    name,
    mean: latency.mean,
    min: latency.min,
    max: latency.max,
    median: latency.p50,
    stddev: latency.sd,
    rme: latency.rme,
    samples: latency.samplesCount,
    ...validation,
  };
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function aggregateRuns(name: TransformerName, runs: RunResult[]): BenchResult {
  const first = runs[0]!;
  for (const run of runs) {
    if (run.outputBytes !== first.outputBytes) throw new Error(`${name} output size changed`);
    if (run.outputCodeUnits !== first.outputCodeUnits) {
      throw new Error(`${name} output length changed`);
    }
    if (run.consoleCallsInput !== first.consoleCallsInput) {
      throw new Error(`${name} input validation changed`);
    }
    if (run.consoleCallsOutput !== first.consoleCallsOutput) {
      throw new Error(`${name} output validation changed`);
    }
  }
  return {
    name,
    mean: median(runs.map((run) => run.mean)),
    min: Math.min(...runs.map((run) => run.min)),
    max: Math.max(...runs.map((run) => run.max)),
    median: median(runs.map((run) => run.median)),
    stddev: median(runs.map((run) => run.stddev)),
    rme: median(runs.map((run) => run.rme)),
    samples: runs.reduce((sum, run) => sum + run.samples, 0),
    runs: runs.length,
    consoleCallsInput: first.consoleCallsInput,
    consoleCallsOutput: first.consoleCallsOutput,
    outputBytes: first.outputBytes,
    outputCodeUnits: first.outputCodeUnits,
  };
}

async function benchFile(fileKey: FileKey): Promise<FileResult> {
  const source = await readSource(fileKey);
  console.log(`\nBenchmarking remove-console on ${fileKey}...`);

  const results: BenchResult[] = [];
  for (const name of TRANSFORMERS) {
    const runs: RunResult[] = [];
    for (let run = 1; run <= BENCH_RUNS; run++) {
      console.log(`  ${name} (run ${run}/${BENCH_RUNS})`);
      const processResult = Bun.spawnSync({
        cmd: [process.execPath, "scripts/bench-transform.ts", "--task", fileKey, name],
        stdout: "pipe",
        stderr: "inherit",
      });
      if (processResult.exitCode !== 0) {
        console.error(`  ${name} run ${run} failed with exit code ${processResult.exitCode}`);
        continue;
      }
      const output = JSON.parse(processResult.stdout.toString()) as {
        ok: boolean;
        result?: RunResult;
      };
      if (output.ok && output.result) runs.push(output.result);
      else console.error(`  ${name} run ${run} did not complete`);
    }
    if (runs.length !== BENCH_RUNS) {
      throw new Error(`${name} completed ${runs.length} of ${BENCH_RUNS} runs`);
    }
    results.push(aggregateRuns(name, runs));
  }

  results.sort((left, right) => left.median - right.median);
  console.table(
    results.map((result) => ({
      Transformer: result.name,
      "Median (ms)": result.median.toFixed(3),
      "±RME": `${result.rme.toFixed(2)}%`,
      Samples: result.samples,
      Runs: result.runs,
      Removed: result.consoleCallsInput,
      "Output (bytes)": result.outputBytes,
    })),
  );

  return {
    file: fileKey,
    input: `${FILES[fileKey]} with the remove-console exercise appended`,
    sourceBytes: Buffer.byteLength(source),
    benchmark: {
      timeMs: BENCH_TIME,
      warmupMs: BENCH_WARMUP,
      runs: BENCH_RUNS,
    },
    runtime: `Bun ${Bun.version}`,
    system: {
      os: `${platform()} ${release()} (${arch()})`,
      cpu: cpus()[0]?.model ?? "Unknown CPU",
      cores: cpus().length,
      memoryGb: Math.round(totalmem() / (1024 * 1024 * 1024)),
    },
    versions: {
      babel: await readPackageVersion("@babel/core"),
      yukuAst: await readPackageVersion("yuku-ast"),
      yukuCodegen: await readPackageVersion("yuku-codegen"),
      yukuParser: await readPackageVersion("yuku-parser"),
    },
    results,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--task") {
    const [, fileKey, transformerName] = args;
    if (!fileKey || !isFileKey(fileKey)) throw new Error(`Unknown file: ${fileKey}`);
    if (!transformerName || !isTransformerName(transformerName)) {
      throw new Error(`Unknown transformer: ${transformerName}`);
    }
    await runTask(fileKey, transformerName);
    return;
  }

  const filesToBench = args.length === 0 ? Object.keys(FILES) : args;
  await mkdir(join(process.cwd(), "result"), { recursive: true });
  for (const fileKey of filesToBench) {
    if (!isFileKey(fileKey)) throw new Error(`Unknown file: ${fileKey}`);
    const result = await benchFile(fileKey);
    await writeFile(
      join(process.cwd(), "result", `transform-${fileKey}.json`),
      JSON.stringify(result, null, 2),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
