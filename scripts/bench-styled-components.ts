import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { Bench } from "tinybench";
import {
  createStyledComponentsFixture,
  STYLED_COMPONENTS_COMPONENT_COUNT,
} from "./styled-components-fixture";
import {
  profileStageDefinitions,
  profileStyledComponentsOnce,
} from "./styled-components-profiler";
import {
  STYLED_COMPONENTS_OPTIONS,
  STYLED_COMPONENTS_TRANSFORMERS,
  transformStyledComponentsFor,
  validateStyledComponentsOutput,
  type StyledComponentsTransformerName,
  type StyledComponentsValidation,
} from "./styled-components-transformers";

const BENCH_TIME = Number(process.env.BENCH_TIME ?? 10_000);
const BENCH_WARMUP = Number(process.env.BENCH_WARMUP ?? 2_000);
const BENCH_RUNS = Number(process.env.BENCH_RUNS ?? 3);
const PROFILE_TIME = Number(process.env.PROFILE_TIME ?? BENCH_TIME);
const PROFILE_WARMUP = Number(process.env.PROFILE_WARMUP ?? BENCH_WARMUP);
const PROFILE_ITERATIONS_MAX = 100_000;
const COMPONENT_COUNT = Number(
  process.env.STYLED_COMPONENTS_COUNT ?? STYLED_COMPONENTS_COMPONENT_COUNT,
);

interface RunResult extends StyledComponentsValidation {
  name: StyledComponentsTransformerName;
  mean: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
  rme: number;
  samples: number;
}

interface BenchResult extends RunResult {
  runMedians: number[];
  runs: number;
}

interface ProfileRunResult {
  iterations: number;
  name: StyledComponentsTransformerName;
  outputCodeUnits: number;
  stageTotalsNs: number[];
}

interface ProfileStageResult {
  meanMs: number;
  name: string;
  runMeansMs: number[];
  runtime: string;
  share: number;
}

interface ProfileResult {
  iterations: number;
  meanMs: number;
  name: StyledComponentsTransformerName;
  runs: number;
  stages: ProfileStageResult[];
}

interface StyledComponentsBenchResult {
  benchmark: {
    runs: number;
    timeMs: number;
    warmupMs: number;
  };
  fixture: {
    sourceBytes: number;
    styledComponents: number;
    templates: number;
  };
  options: typeof STYLED_COMPONENTS_OPTIONS;
  profile: {
    results: ProfileResult[];
    runs: number;
    timeMs: number;
    warmupMs: number;
  };
  results: BenchResult[];
  runtime: string;
  system: {
    cores: number;
    cpu: string;
    memoryGb: number;
    os: string;
  };
  versions: {
    babelCore: string;
    babelPlugin: string;
    swcCore: string;
    swcPlugin: string;
    yukuAst: string;
    yukuCodegen: string;
    yukuParser: string;
  };
}

let outputCodeUnitsLast = 0;

function isTransformerName(value: string): value is StyledComponentsTransformerName {
  return STYLED_COMPONENTS_TRANSFORMERS.some((name) => name === value);
}

function createTask(name: StyledComponentsTransformerName, source: string): () => void {
  return () => {
    outputCodeUnitsLast = transformStyledComponentsFor(name, source).length;
  };
}

async function runTask(name: StyledComponentsTransformerName): Promise<void> {
  const fixture = createStyledComponentsFixture(COMPONENT_COUNT);
  const output = transformStyledComponentsFor(name, fixture.source);
  const validation = validateStyledComponentsOutput(name, output, fixture);
  const bench = new Bench({ time: BENCH_TIME, warmupTime: BENCH_WARMUP });
  bench.add(name, createTask(name, fixture.source));
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

function runProfileTask(name: StyledComponentsTransformerName): void {
  const fixture = createStyledComponentsFixture(COMPONENT_COUNT);
  const validationIteration = profileStyledComponentsOnce(name, fixture.source);
  const validation = validateStyledComponentsOutput(
    name,
    validationIteration.output,
    fixture,
  );
  const stageCount = profileStageDefinitions(name).length;
  if (validationIteration.durationsNs.length !== stageCount) {
    throw new Error(`${name} profile returned an unexpected number of stages`);
  }

  const warmupDeadline = performance.now() + PROFILE_WARMUP;
  for (let iteration = 0; iteration < PROFILE_ITERATIONS_MAX; iteration++) {
    if (performance.now() >= warmupDeadline) break;
    profileStyledComponentsOnce(name, fixture.source);
    if (iteration === PROFILE_ITERATIONS_MAX - 1) {
      throw new Error(`${name} exhausted the profile warmup iteration bound`);
    }
  }

  const stageTotalsNs = Array.from({ length: stageCount }, () => 0);
  const measurementDeadline = performance.now() + PROFILE_TIME;
  let iterations = 0;
  let outputCodeUnits = 0;
  while (iterations < PROFILE_ITERATIONS_MAX) {
    if (performance.now() >= measurementDeadline) break;
    const profile = profileStyledComponentsOnce(name, fixture.source);
    if (profile.durationsNs.length !== stageCount) {
      throw new Error(`${name} profile stage count changed during measurement`);
    }
    for (let index = 0; index < stageCount; index++) {
      stageTotalsNs[index] += profile.durationsNs[index]!;
    }
    outputCodeUnits = profile.output.length;
    iterations++;
  }
  if (iterations === 0) throw new Error(`${name} profile collected no iterations`);
  if (iterations === PROFILE_ITERATIONS_MAX && performance.now() < measurementDeadline) {
    throw new Error(`${name} exhausted the profile measurement iteration bound`);
  }
  if (outputCodeUnits !== validation.outputCodeUnits) {
    throw new Error(`${name} profile output changed during measurement`);
  }

  const result: ProfileRunResult = {
    iterations,
    name,
    outputCodeUnits,
    stageTotalsNs,
  };
  process.stdout.write(JSON.stringify({ ok: true, result }));
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function sameValidation(left: RunResult, right: RunResult): boolean {
  return left.componentIds === right.componentIds &&
    left.displayNames === right.displayNames &&
    left.minifiedRules === right.minifiedRules &&
    left.outputBytes === right.outputBytes &&
    left.outputCodeUnits === right.outputCodeUnits &&
    left.pureAnnotations === right.pureAnnotations &&
    left.taggedTemplates === right.taggedTemplates &&
    left.uniqueComponentIds === right.uniqueComponentIds &&
    left.withConfigCalls === right.withConfigCalls;
}

function aggregateRuns(
  name: StyledComponentsTransformerName,
  runs: RunResult[],
): BenchResult {
  const first = runs[0]!;
  for (const run of runs) {
    if (!sameValidation(first, run)) {
      throw new Error(`${name} validation changed between independent runs`);
    }
  }
  return {
    ...first,
    mean: median(runs.map((run) => run.mean)),
    min: Math.min(...runs.map((run) => run.min)),
    max: Math.max(...runs.map((run) => run.max)),
    median: median(runs.map((run) => run.median)),
    stddev: median(runs.map((run) => run.stddev)),
    rme: median(runs.map((run) => run.rme)),
    samples: runs.reduce((sum, run) => sum + run.samples, 0),
    runMedians: runs.map((run) => run.median),
    runs: runs.length,
  };
}

function aggregateProfileRuns(
  name: StyledComponentsTransformerName,
  runs: ProfileRunResult[],
): ProfileResult {
  const definitions = profileStageDefinitions(name);
  const stageTotalsNs = Array.from({ length: definitions.length }, () => 0);
  let iterations = 0;
  for (const run of runs) {
    if (run.stageTotalsNs.length !== definitions.length) {
      throw new Error(`${name} profile stage count changed between runs`);
    }
    iterations += run.iterations;
    for (let index = 0; index < definitions.length; index++) {
      stageTotalsNs[index] += run.stageTotalsNs[index]!;
    }
  }
  const totalNs = stageTotalsNs.reduce((sum, duration) => sum + duration, 0);
  if (iterations === 0 || totalNs === 0) {
    throw new Error(`${name} profile did not measure any work`);
  }

  return {
    iterations,
    meanMs: totalNs / iterations / 1_000_000,
    name,
    runs: runs.length,
    stages: definitions.map((definition, index) => ({
      meanMs: stageTotalsNs[index]! / iterations / 1_000_000,
      name: definition.name,
      runMeansMs: runs.map(
        (run) => run.stageTotalsNs[index]! / run.iterations / 1_000_000,
      ),
      runtime: definition.runtime,
      share: stageTotalsNs[index]! / totalNs,
    })),
  };
}

function rotatedTransformers(run: number): StyledComponentsTransformerName[] {
  const offset = (run - 1) % STYLED_COMPONENTS_TRANSFORMERS.length;
  return [
    ...STYLED_COMPONENTS_TRANSFORMERS.slice(offset),
    ...STYLED_COMPONENTS_TRANSFORMERS.slice(0, offset),
  ];
}

async function readPackageVersion(packageName: string): Promise<string> {
  const packagePath = join(process.cwd(), "node_modules", packageName, "package.json");
  const packageData = (await Bun.file(packagePath).json()) as { version?: unknown };
  if (typeof packageData.version !== "string") {
    throw new Error(`Package ${packageName} does not declare a version`);
  }
  return packageData.version;
}

function profileStyledComponents(): ProfileResult[] {
  console.log("\nProfiling styled-components stages...");
  const runsByName = new Map<StyledComponentsTransformerName, ProfileRunResult[]>(
    STYLED_COMPONENTS_TRANSFORMERS.map((name) => [name, []]),
  );
  for (let run = 1; run <= BENCH_RUNS; run++) {
    for (const name of rotatedTransformers(run)) {
      console.log(`  ${name} stages (run ${run}/${BENCH_RUNS})`);
      const processResult = Bun.spawnSync({
        cmd: [
          process.execPath,
          "scripts/bench-styled-components.ts",
          "--profile-task",
          name,
        ],
        stderr: "inherit",
        stdout: "pipe",
      });
      if (processResult.exitCode !== 0) {
        throw new Error(
          `${name} profile run ${run} failed with exit code ${processResult.exitCode}`,
        );
      }
      const output = JSON.parse(processResult.stdout.toString()) as {
        ok: boolean;
        result?: ProfileRunResult;
      };
      if (!output.ok || output.result === undefined) {
        throw new Error(`${name} profile run ${run} did not complete`);
      }
      runsByName.get(name)!.push(output.result);
    }
  }

  const results = STYLED_COMPONENTS_TRANSFORMERS.map((name) => {
    const runs = runsByName.get(name)!;
    if (runs.length !== BENCH_RUNS) {
      throw new Error(`${name} completed ${runs.length} of ${BENCH_RUNS} profile runs`);
    }
    return aggregateProfileRuns(name, runs);
  });
  console.table(
    results.flatMap((result) =>
      result.stages.map((stage) => ({
        Transformer: result.name,
        Stage: stage.name,
        Runtime: stage.runtime,
        "Mean (ms)": stage.meanMs.toFixed(3),
        Share: `${(stage.share * 100).toFixed(1)}%`,
      })),
    ),
  );
  return results;
}

async function benchStyledComponents(): Promise<StyledComponentsBenchResult> {
  const fixture = createStyledComponentsFixture(COMPONENT_COUNT);
  console.log(
    `\nBenchmarking styled-components with ${fixture.styledComponentCount} components...`,
  );

  const runsByName = new Map<StyledComponentsTransformerName, RunResult[]>(
    STYLED_COMPONENTS_TRANSFORMERS.map((name) => [name, []]),
  );
  for (let run = 1; run <= BENCH_RUNS; run++) {
    for (const name of rotatedTransformers(run)) {
      console.log(`  ${name} (run ${run}/${BENCH_RUNS})`);
      const processResult = Bun.spawnSync({
        cmd: [process.execPath, "scripts/bench-styled-components.ts", "--task", name],
        stderr: "inherit",
        stdout: "pipe",
      });
      if (processResult.exitCode !== 0) {
        throw new Error(`${name} run ${run} failed with exit code ${processResult.exitCode}`);
      }
      const output = JSON.parse(processResult.stdout.toString()) as {
        ok: boolean;
        result?: RunResult;
      };
      if (!output.ok || output.result === undefined) {
        throw new Error(`${name} run ${run} did not complete`);
      }
      runsByName.get(name)!.push(output.result);
    }
  }

  const results = STYLED_COMPONENTS_TRANSFORMERS.map((name) => {
    const runs = runsByName.get(name)!;
    if (runs.length !== BENCH_RUNS) {
      throw new Error(`${name} completed ${runs.length} of ${BENCH_RUNS} runs`);
    }
    return aggregateRuns(name, runs);
  }).sort((left, right) => left.median - right.median);

  console.table(
    results.map((result) => ({
      Transformer: result.name,
      "Median (ms)": result.median.toFixed(3),
      "±RME": `${result.rme.toFixed(2)}%`,
      Samples: result.samples,
      Components: result.withConfigCalls,
      "Output (bytes)": result.outputBytes,
    })),
  );

  const profileResults = profileStyledComponents();

  return {
    benchmark: {
      runs: BENCH_RUNS,
      timeMs: BENCH_TIME,
      warmupMs: BENCH_WARMUP,
    },
    fixture: {
      sourceBytes: Buffer.byteLength(fixture.source),
      styledComponents: fixture.styledComponentCount,
      templates: fixture.templateCount,
    },
    options: STYLED_COMPONENTS_OPTIONS,
    profile: {
      results: profileResults,
      runs: BENCH_RUNS,
      timeMs: PROFILE_TIME,
      warmupMs: PROFILE_WARMUP,
    },
    results,
    runtime: `Bun ${Bun.version}`,
    system: {
      cores: cpus().length,
      cpu: cpus()[0]?.model ?? "Unknown CPU",
      memoryGb: Math.round(totalmem() / (1024 * 1024 * 1024)),
      os: `${platform()} ${release()} (${arch()})`,
    },
    versions: {
      babelCore: await readPackageVersion("@babel/core"),
      babelPlugin: await readPackageVersion("babel-plugin-styled-components"),
      swcCore: await readPackageVersion("@swc/core"),
      swcPlugin: await readPackageVersion("@swc/plugin-styled-components"),
      yukuAst: await readPackageVersion("yuku-ast"),
      yukuCodegen: await readPackageVersion("yuku-codegen"),
      yukuParser: await readPackageVersion("yuku-parser"),
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--task") {
    const name = args[1];
    if (name === undefined || !isTransformerName(name)) {
      throw new Error(`Unknown transformer: ${name ?? "missing"}`);
    }
    await runTask(name);
    return;
  }
  if (args[0] === "--profile-task") {
    const name = args[1];
    if (name === undefined || !isTransformerName(name)) {
      throw new Error(`Unknown transformer: ${name ?? "missing"}`);
    }
    runProfileTask(name);
    return;
  }

  const result = await benchStyledComponents();
  await mkdir(join(process.cwd(), "result"), { recursive: true });
  await writeFile(
    join(process.cwd(), "result", "styled-components.json"),
    JSON.stringify(result, null, 2),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
