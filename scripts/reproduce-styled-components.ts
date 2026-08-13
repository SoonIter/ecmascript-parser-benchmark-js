import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SETTINGS = {
  BENCH_RUNS: "3",
  BENCH_TIME: "5000",
  BENCH_WARMUP: "1000",
  PROFILE_TIME: "5000",
  PROFILE_WARMUP: "1000",
  STYLED_COMPONENTS_COUNT: "240",
} as const;

const RUNTIME_VERSIONS = {
  bun: "1.3.5",
  node: "26.7.0",
} as const;

type RuntimeName = keyof typeof RUNTIME_VERSIONS;

interface ReproductionResult {
  benchmark: {
    runs: number;
    timeMs: number;
    warmupMs: number;
  };
  fixture: {
    styledComponents: number;
  };
  profile: {
    runs: number;
    timeMs: number;
    warmupMs: number;
  };
  reproduction: {
    command: string;
    resultFile: string;
  };
  runtime: string;
}

function runtime(): { name: RuntimeName; version: string } {
  const bunVersion = (process.versions as Record<string, string | undefined>).bun;
  if (bunVersion !== undefined) return { name: "bun", version: bunVersion };
  return { name: "node", version: process.versions.node };
}

function assertRuntime(name: RuntimeName, version: string): void {
  const expected = RUNTIME_VERSIONS[name];
  if (version !== expected) {
    throw new Error(
      `Exact reproduction requires ${name} ${expected}, received ${version}`,
    );
  }
}

function commandFor(name: RuntimeName): string {
  return name === "bun"
    ? "bun run reproduce:styled-components"
    : "node --import tsx scripts/reproduce-styled-components.ts";
}

function resultFileFor(name: RuntimeName): string {
  return name === "bun" ? "styled-components.json" : "styled-components-node.json";
}

function childArguments(name: RuntimeName): string[] {
  if (name === "node") {
    return ["--import", "tsx", "scripts/bench-styled-components.ts"];
  }
  return ["scripts/bench-styled-components.ts"];
}

function assertResult(
  result: ReproductionResult,
  name: RuntimeName,
  version: string,
  command: string,
  resultFile: string,
): void {
  if (result.benchmark.runs !== Number(SETTINGS.BENCH_RUNS)) {
    throw new Error("Reproduction result has an unexpected benchmark run count");
  }
  if (result.benchmark.timeMs !== Number(SETTINGS.BENCH_TIME)) {
    throw new Error("Reproduction result has an unexpected benchmark duration");
  }
  if (result.benchmark.warmupMs !== Number(SETTINGS.BENCH_WARMUP)) {
    throw new Error("Reproduction result has an unexpected benchmark warmup");
  }
  if (result.profile.runs !== Number(SETTINGS.BENCH_RUNS)) {
    throw new Error("Reproduction result has an unexpected profile run count");
  }
  if (result.profile.timeMs !== Number(SETTINGS.PROFILE_TIME)) {
    throw new Error("Reproduction result has an unexpected profile duration");
  }
  if (result.profile.warmupMs !== Number(SETTINGS.PROFILE_WARMUP)) {
    throw new Error("Reproduction result has an unexpected profile warmup");
  }
  if (result.fixture.styledComponents !== Number(SETTINGS.STYLED_COMPONENTS_COUNT)) {
    throw new Error("Reproduction result has an unexpected component count");
  }
  const expectedRuntime = name === "bun" ? `Bun ${version}` : `Node ${version}`;
  if (result.runtime !== expectedRuntime) {
    throw new Error(`Expected runtime ${expectedRuntime}, received ${result.runtime}`);
  }
  if (result.reproduction.command !== command) {
    throw new Error("Reproduction result did not record the invoking command");
  }
  if (result.reproduction.resultFile !== resultFile) {
    throw new Error("Reproduction result did not record its output file");
  }
}

async function main(): Promise<void> {
  const selectedRuntime = runtime();
  assertRuntime(selectedRuntime.name, selectedRuntime.version);
  const command = commandFor(selectedRuntime.name);
  const resultFile = resultFileFor(selectedRuntime.name);

  console.log(
    `\nExact styled-components reproduction with ${selectedRuntime.name} ` +
      `${selectedRuntime.version}`,
  );
  console.table(SETTINGS);

  const child = spawnSync(process.execPath, childArguments(selectedRuntime.name), {
    env: {
      ...process.env,
      ...SETTINGS,
      BENCH_REPRODUCTION_COMMAND: command,
      STYLED_COMPONENTS_RESULT: resultFile,
    },
    stdio: "inherit",
  });
  if (child.error !== undefined) throw child.error;
  if (child.status !== 0) {
    throw new Error(`Benchmark exited with status ${child.status ?? "unknown"}`);
  }

  const resultPath = join(process.cwd(), "result", resultFile);
  const result = JSON.parse(await readFile(resultPath, "utf8")) as ReproductionResult;
  assertResult(
    result,
    selectedRuntime.name,
    selectedRuntime.version,
    command,
    resultFile,
  );
  console.log(`\nVerified reproduction result: ${resultPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
