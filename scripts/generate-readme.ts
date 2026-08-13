import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import type { ChartConfiguration } from "chart.js";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

const FILES_SOURCE_URL_PREFIX =
  "https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main";

const PARSERS = {
  acorn: {
    name: "Acorn",
    description: "A tiny, fast JavaScript parser, written completely in JavaScript.",
    url: "https://github.com/acornjs/acorn",
  },
  babel: {
    name: "Babel",
    description: "A JavaScript compiler and parser used by the Babel toolchain.",
    url: "https://github.com/babel/babel/tree/main/packages/babel-parser",
  },
  oxc: {
    name: "Oxc",
    description: "A high-performance JavaScript and TypeScript parser written in Rust.",
    url: "https://github.com/oxc-project/oxc",
  },
  swc: {
    name: "SWC",
    description:
      "An extensible Rust-based platform for compiling and bundling JavaScript and TypeScript.",
    url: "https://github.com/swc-project/swc",
  },
  yuku: {
    name: "Yuku",
    description:
      "A high-performance & spec-compliant JavaScript/TypeScript compiler written in Zig.",
    url: "https://github.com/yuku-toolchain/yuku",
  },
} as const;

const CHART_COLORS: Record<string, string> = {
  acorn: "#4CC9F0",
  babel: "#7209B7",
  oxc: "#F72585",
  swc: "#3A86FF",
  yuku: "#FF6B35",
};

const NAME_TO_KEY: Record<string, string> = {
  Acorn: "acorn",
  Babel: "babel",
  Oxc: "oxc",
  SWC: "swc",
  Yuku: "yuku",
};

const FILES = {
  typescript: {
    path: "files/typescript.js",
    source_url: `${FILES_SOURCE_URL_PREFIX}/typescript.js`,
  },
  checker: {
    path: "files/checker.ts",
    source_url: `${FILES_SOURCE_URL_PREFIX}/checker.ts`,
  },
  react: {
    path: "files/react.js",
    source_url: `${FILES_SOURCE_URL_PREFIX}/react.js`,
  },
} as const;

type FileKey = keyof typeof FILES;

interface BenchResult {
  name: string;
  mean: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
  rme?: number;
  samples: number;
  runs?: number;
}

interface FileResult {
  file: string;
  results: BenchResult[];
}

interface TransformBenchResult extends BenchResult {
  consoleCallsInput: number;
  consoleCallsOutput: number;
  outputBytes: number;
  outputCodeUnits: number;
}

interface TransformFileResult {
  file: string;
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
  results: TransformBenchResult[];
}

interface StyledComponentsTransformResult extends BenchResult {
  componentIds: number;
  displayNames: number;
  minifiedRules: number;
  outputBytes: number;
  outputCodeUnits: number;
  pureAnnotations: number;
  runMedians: number[];
  taggedTemplates: number;
  uniqueComponentIds: number;
  withConfigCalls: number;
}

interface StyledComponentsProfileStage {
  meanMs: number;
  name: string;
  runMeansMs: number[];
  runtime: string;
  share: number;
}

interface StyledComponentsProfileResult {
  iterations: number;
  meanMs: number;
  name: string;
  runs: number;
  stages: StyledComponentsProfileStage[];
}

interface StyledComponentsFileResult {
  benchmark: {
    timeMs: number;
    warmupMs: number;
    runs: number;
  };
  fixture: {
    sourceBytes: number;
    styledComponents: number;
    templates: number;
  };
  profile: {
    results: StyledComponentsProfileResult[];
    runs: number;
    timeMs: number;
    warmupMs: number;
  };
  reproduction: {
    command: string;
    resultFile: string;
  };
  results: StyledComponentsTransformResult[];
  runtime: string;
  system: {
    os: string;
    cpu: string;
    cores: number;
    memoryGb: number;
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

interface ParserEntry {
  key: string;
  name: string;
  result: BenchResult | null;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

function formatOps(medianMs: number): string {
  const ops = 1000 / medianMs;
  return `${ops.toFixed(2)} ops/s`;
}

function formatRme(rme: number | undefined): string {
  return rme != null ? `±${rme.toFixed(2)}%` : "-";
}

async function readBenchmarkResults(fileKey: FileKey): Promise<FileResult> {
  const content = await readFile(join(process.cwd(), "result", `${fileKey}.json`), "utf-8");
  return JSON.parse(content) as FileResult;
}

function getParserEntries(data: FileResult): ParserEntry[] {
  const resultsByKey = new Map<string, BenchResult>();
  for (const result of data.results) {
    const key = NAME_TO_KEY[result.name];
    if (key) resultsByKey.set(key, result);
  }

  const entries: ParserEntry[] = [];
  for (const [key, parser] of Object.entries(PARSERS)) {
    entries.push({ key, name: parser.name, result: resultsByKey.get(key) ?? null });
  }

  entries.sort((a, b) => {
    if (a.result && b.result) return a.result.median - b.result.median;
    if (a.result && !b.result) return -1;
    if (!a.result && b.result) return 1;
    return 0;
  });

  return entries;
}

async function generateChart(entries: ParserEntry[], chartName: string): Promise<string> {
  const data = entries.filter((e) => e.result != null);
  if (data.length === 0) return "";

  const labels = data.map((e) => e.name);
  const medianData = data.map((e) => e.result!.median);
  const colors = data.map((e) => CHART_COLORS[e.key] ?? "#888888");

  const maxTime = Math.max(...medianData);
  const niceSteps = [10, 20, 25, 50, 100, 200, 250, 500];
  const rawStep = maxTime / 4;
  const step = niceSteps.find((s) => s >= rawStep) || Math.ceil(rawStep / 100) * 100;
  const chartMax = Math.ceil(maxTime / step) * step;

  const dpr = 3;
  const chartWidth = 500;
  const chartHeight = data.length * 24 + 28;

  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width: chartWidth * dpr,
    height: chartHeight * dpr,
  });

  const configuration: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: medianData,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 0,
          barPercentage: 0.75,
          categoryPercentage: 0.92,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: false,
      devicePixelRatio: 1,
      layout: {
        padding: { right: 65 * dpr, top: 2 * dpr, bottom: 0 },
      },
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: { display: false, beginAtZero: true, max: chartMax },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#CAC1B0",
            font: { size: 9 * dpr },
            padding: 3 * dpr,
          },
        },
      },
    },
    plugins: [
      {
        id: "value-labels",
        afterDatasetsDraw(chart) {
          const ctx = chart.ctx;
          const meta = chart.getDatasetMeta(0);
          const dataset = chart.data.datasets[0];
          for (let i = 0; i < meta.data.length; i++) {
            const bar = meta.data[i];
            const value = dataset.data[i] as number;
            ctx.save();
            ctx.fillStyle = "#CAC1B0";
            ctx.font = `${9 * dpr}px sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(`${value.toFixed(2)}ms`, bar.x + 8 * dpr, bar.y);
            ctx.restore();
          }
        },
      },
    ],
  };

  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  const chartPath = join(process.cwd(), "charts", `${chartName}.png`);
  await mkdir(join(process.cwd(), "charts"), { recursive: true });
  await writeFile(chartPath, imageBuffer);

  return `charts/${chartName}.png`;
}

function styledComponentsColor(name: string): string {
  if (name.startsWith("Babel")) return CHART_COLORS.babel!;
  if (name.startsWith("SWC")) return CHART_COLORS.swc!;
  return CHART_COLORS.yuku!;
}

async function generateStyledComponentsLatencyChart(
  results: StyledComponentsTransformResult[],
): Promise<string> {
  const dpr = 3;
  const chart = new ChartJSNodeCanvas({ width: 640 * dpr, height: 155 * dpr });
  const maxTime = Math.max(...results.map((result) => result.median));
  const configuration: ChartConfiguration = {
    type: "bar",
    data: {
      labels: results.map((result) => result.name),
      datasets: [
        {
          data: results.map((result) => result.median),
          backgroundColor: results.map((result) => styledComponentsColor(result.name)),
          borderWidth: 0,
          barPercentage: 0.72,
          categoryPercentage: 0.9,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: false,
      devicePixelRatio: 1,
      layout: { padding: { right: 90 * dpr } },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false, beginAtZero: true, max: maxTime * 1.12 },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#CAC1B0", font: { size: 10 * dpr } },
        },
      },
    },
    plugins: [
      {
        id: "styled-components-latency-labels",
        afterDatasetsDraw(chartInstance) {
          const context = chartInstance.ctx;
          const metadata = chartInstance.getDatasetMeta(0);
          for (let index = 0; index < metadata.data.length; index++) {
            const bar = metadata.data[index]!;
            const value = results[index]!.median;
            context.save();
            context.fillStyle = "#CAC1B0";
            context.font = `${10 * dpr}px sans-serif`;
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.fillText(`${value.toFixed(2)} ms`, bar.x + 8 * dpr, bar.y);
            context.restore();
          }
        },
      },
    ],
  };
  const outputPath = join(process.cwd(), "charts", "styled-components-latency.png");
  await mkdir(join(process.cwd(), "charts"), { recursive: true });
  await writeFile(outputPath, await chart.renderToBuffer(configuration));
  return "charts/styled-components-latency.png";
}

function profileStageCategory(
  transformer: string,
  stage: StyledComponentsProfileStage,
): string {
  if (stage.name === "source encode") return "Source encode";
  if (stage.name === "AST decode") return "AST decode";
  if (stage.name === "AST encode") return "AST encode";
  if (stage.name === "parse + AST transfer") return "Parse + AST transfer";
  if (stage.name === "AST transfer + plugin + codegen") {
    return "AST transfer + WASM plugin + codegen";
  }
  if (stage.name === "parse") return "Parse";
  if (stage.name === "codegen") return "Codegen";
  if (stage.name === "plugin transform" && transformer.startsWith("Babel")) {
    return "Babel JS plugin";
  }
  return "Yuku JS plugin";
}

async function generateStyledComponentsProfileChart(
  profiles: StyledComponentsProfileResult[],
): Promise<string> {
  const categories = [
    ["Source encode", "#FFD166"],
    ["Parse", "#4CC9F0"],
    ["Parse + AST transfer", "#4895EF"],
    ["AST decode", "#43AA8B"],
    ["Babel JS plugin", "#7209B7"],
    ["Yuku JS plugin", "#F72585"],
    ["AST encode", "#FF9F1C"],
    ["Codegen", "#90BE6D"],
    ["AST transfer + WASM plugin + codegen", "#3A86FF"],
  ] as const;
  const dpr = 3;
  const chart = new ChartJSNodeCanvas({ width: 760 * dpr, height: 245 * dpr });
  const configuration: ChartConfiguration = {
    type: "bar",
    data: {
      labels: profiles.map((profile) => profile.name),
      datasets: categories.map(([category, color]) => ({
        label: category,
        data: profiles.map((profile) =>
          profile.stages
            .filter((stage) => profileStageCategory(profile.name, stage) === category)
            .reduce((sum, stage) => sum + stage.share * 100, 0),
        ),
        backgroundColor: color,
        borderWidth: 0,
        barPercentage: 0.72,
        categoryPercentage: 0.9,
      })),
    },
    options: {
      indexAxis: "y",
      responsive: false,
      devicePixelRatio: 1,
      plugins: {
        legend: {
          display: true,
          labels: {
            boxHeight: 8 * dpr,
            boxWidth: 8 * dpr,
            color: "#CAC1B0",
            font: { size: 8 * dpr },
          },
          position: "bottom",
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          stacked: true,
          ticks: {
            callback: (value) => `${value}%`,
            color: "#CAC1B0",
            font: { size: 8 * dpr },
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#CAC1B0", font: { size: 9 * dpr } },
        },
      },
    },
  };
  const outputPath = join(process.cwd(), "charts", "styled-components-stages.png");
  await mkdir(join(process.cwd(), "charts"), { recursive: true });
  await writeFile(outputPath, await chart.renderToBuffer(configuration));
  return "charts/styled-components-stages.png";
}

function generateTable(entries: ParserEntry[]): string {
  const lines: string[] = [];

  const fastest = entries.find((e) => e.result != null)?.result ?? null;

  lines.push("| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |");
  lines.push("|--------|--------|-----|------|-----|-----|---------|----------|");

  for (const { name, result } of entries) {
    if (!result) {
      lines.push(`| ${name} | Failed to parse | - | - | - | - | - | - |`);
      continue;
    }
    const isFastest = result === fastest;
    const ratio = fastest ? result.median / fastest.median : 1;
    const relative = isFastest ? "baseline" : `${ratio.toFixed(2)}× slower`;
    const cells = [
      name,
      formatTime(result.median),
      formatRme(result.rme),
      formatTime(result.mean),
      formatTime(result.min),
      formatTime(result.max),
      formatOps(result.median),
      relative,
    ];
    const row = isFastest ? cells.map((c) => `**${c}**`).join(" | ") : cells.join(" | ");
    lines.push(`| ${row} |`);
  }

  return lines.join("\n");
}

async function generateBenchmarksSection(): Promise<string> {
  const lines = ["## Benchmarks", ""];

  for (const [key, file] of Object.entries(FILES)) {
    const fileKey = key as FileKey;
    const fileName = file.path.split("/").pop()!;
    const fileSize = (await stat(join(process.cwd(), file.path))).size;
    const data = await readBenchmarkResults(fileKey);
    const entries = getParserEntries(data);

    lines.push(`### [${fileName}](${file.source_url})`);
    lines.push("");
    lines.push(`**File size:** ${formatBytes(fileSize)}`);
    lines.push("");

    const chartPath = await generateChart(entries, fileKey);
    if (chartPath) {
      lines.push(`![Bar chart comparing npm parser speeds for ${fileName}](${chartPath})`);
      lines.push("");
    }

    lines.push(generateTable(entries));
    lines.push("");
  }

  return lines.join("\n");
}

async function generateTransformSection(): Promise<string> {
  const content = await readFile(
    join(process.cwd(), "result", "transform-react.json"),
    "utf-8",
  );
  const data = JSON.parse(content) as TransformFileResult;
  const results = [...data.results].sort((left, right) => left.median - right.median);
  const fastest = results[0];
  const lines = [
    "## Transform Benchmark",
    "",
    "### Remove console",
    "",
    `**Input:** ${data.input} (${formatBytes(data.sourceBytes)})`,
    "",
    `**Runtime:** ${data.runtime}`,
    "",
    `**System:** ${data.system.os}; ${data.system.cpu}; ` +
      `${data.system.cores} cores; ${data.system.memoryGb} GB`,
    "",
    `**Versions:** Babel ${data.versions.babel}; Yuku parser/codegen/AST ${data.versions.yukuParser}/${data.versions.yukuCodegen}/${data.versions.yukuAst}`,
    "",
    "| Transformer | Median | RME | Mean | Min | Max | Ops/sec | Removed | Output | Relative |",
    "|-------------|--------|-----|------|-----|-----|---------|---------|--------|----------|",
  ];

  for (const result of results) {
    const ratio = fastest ? result.median / fastest.median : 1;
    const relative = result === fastest ? "baseline" : `${ratio.toFixed(2)}× slower`;
    const cells = [
      result.name,
      formatTime(result.median),
      formatRme(result.rme),
      formatTime(result.mean),
      formatTime(result.min),
      formatTime(result.max),
      formatOps(result.median),
      String(result.consoleCallsInput - result.consoleCallsOutput),
      formatBytes(result.outputBytes),
      relative,
    ];
    const row =
      result === fastest
        ? cells.map((cell) => `**${cell}**`).join(" | ")
        : cells.join(" | ");
    lines.push(`| ${row} |`);
  }

  lines.push("");
  lines.push(
    `Each of the ${data.benchmark.runs} independent runs warms up for ${data.benchmark.warmupMs} ms and samples for ${data.benchmark.timeMs} ms. Both implementations remove the same calls and generate JavaScript on every iteration.`,
  );
  lines.push("");
  return lines.join("\n");
}

async function generateStyledComponentsTransformSection(): Promise<string> {
  const content = await readFile(
    join(process.cwd(), "result", "styled-components.json"),
    "utf-8",
  );
  const data = JSON.parse(content) as StyledComponentsFileResult;
  const results = [...data.results].sort((left, right) => left.median - right.median);
  const fastest = results[0];
  const latencyChart = await generateStyledComponentsLatencyChart(results);
  const profileChart = await generateStyledComponentsProfileChart(data.profile.results);
  const lines = [
    "### Styled components",
    "",
    `**Input:** ${data.fixture.styledComponents} styled components and ` +
      `${data.fixture.templates} tagged templates (${formatBytes(data.fixture.sourceBytes)})`,
    "",
    `**Runtime:** ${data.runtime}`,
    "",
    `**System:** ${data.system.os}; ${data.system.cpu}; ` +
      `${data.system.cores} cores; ${data.system.memoryGb} GB`,
    "",
    `**Versions:** Babel/core ${data.versions.babelCore}/${data.versions.babelPlugin}; ` +
      `SWC/core ${data.versions.swcCore}/${data.versions.swcPlugin}; ` +
      `Yuku parser/codegen/AST ${data.versions.yukuParser}/` +
      `${data.versions.yukuCodegen}/${data.versions.yukuAst}`,
    "",
    `**Exact replay:** \`${data.reproduction.command}\` writes ` +
      `\`result/${data.reproduction.resultFile}\``,
    "",
    "The Yuku JS plugin is a fixture-scoped implementation of the core operations exercised " +
      "here, not a complete port of babel-plugin-styled-components. It covers import " +
      "detection, styled factories, attrs chains, helper templates, CSS minification, " +
      "display names, component IDs, PURE annotations, and template lowering. It does not " +
      "claim parity for features such as the css prop, CommonJS detection, namespaces, " +
      "top-level import path configuration, or Babel's exact filename and hashing behavior. " +
      "These results compare the three pipelines on the validated fixture contract, not " +
      "full plugin feature parity.",
    "",
    `![End-to-end styled-components transform latency](${latencyChart})`,
    "",
    "| Transformer | Median | RME | Mean | Min | Max | Ops/sec | Components | PURE | Output | Relative |",
    "|-------------|--------|-----|------|-----|-----|---------|------------|------|--------|----------|",
  ];

  for (const result of results) {
    const ratio = fastest ? result.median / fastest.median : 1;
    const relative = result === fastest ? "baseline" : `${ratio.toFixed(2)}× slower`;
    const cells = [
      result.name,
      formatTime(result.median),
      formatRme(result.rme),
      formatTime(result.mean),
      formatTime(result.min),
      formatTime(result.max),
      formatOps(result.median),
      String(result.withConfigCalls),
      String(result.pureAnnotations),
      formatBytes(result.outputBytes),
      relative,
    ];
    const row = result === fastest
      ? cells.map((cell) => `**${cell}**`).join(" | ")
      : cells.join(" | ");
    lines.push(`| ${row} |`);
  }

  lines.push("");
  lines.push("Independent run medians (ms):");
  lines.push("");
  for (const result of results) {
    lines.push(
      `- ${result.name}: ${result.runMedians.map((value) => value.toFixed(3)).join(", ")}`,
    );
  }
  lines.push("");
  lines.push(
    `Each of the ${data.benchmark.runs} independent runs warms up for ` +
      `${data.benchmark.warmupMs} ms and samples for ${data.benchmark.timeMs} ms. ` +
      "Every output is reparsed and checked for display names, unique component IDs, " +
      "CSS minification, PURE annotations, and complete tagged-template lowering.",
  );
  lines.push("");
  lines.push("#### Stage breakdown");
  lines.push("");
  lines.push(
    "This diagnostic profile splits each implementation at its real callable boundaries. " +
      "Stage means are reported because means are additive; the stages for one transformer " +
      "sum to its profiled pipeline mean.",
  );
  lines.push("");
  lines.push(`![Styled-components stage time shares](${profileChart})`);
  lines.push("");
  lines.push("| Transformer | Stage | Runtime | Mean | Share | Independent run means |");
  lines.push("|-------------|-------|---------|------|-------|-----------------------|");
  for (const result of data.profile.results) {
    for (const stage of result.stages) {
      lines.push(
        `| ${result.name} | ${stage.name} | ${stage.runtime} | ` +
          `${formatTime(stage.meanMs)} | ${(stage.share * 100).toFixed(1)}% | ` +
          `${stage.runMeansMs.map((value) => value.toFixed(3)).join(", ")} ms |`,
      );
    }
  }
  lines.push("");
  lines.push(
    `The stage profile also uses ${data.profile.runs} independent runs, each with ` +
      `${data.profile.warmupMs} ms warmup and ${data.profile.timeMs} ms measurement. ` +
      "Yuku is measured as source UTF-8 encoding, native parse, generated JS AST decode, " +
      "JS plugin transform, generated JS AST encode, and native codegen. Babel is split " +
      "through its public parse and transform-from-AST APIs. SWC's WASM plugin API returns " +
      "generated code rather than the transformed AST, so its AST transfer, WASM plugin, " +
      "and native codegen remain one directly measured stage.",
  );
  lines.push("");
  lines.push(
    "The end-to-end table above remains the cross-tool comparison. Split profiles make " +
      "additional API calls and are intended to explain where each pipeline spends time, " +
      "not to replace the end-to-end latency.",
  );
  lines.push("");
  return lines.join("\n");
}

function generateParsersSection(): string {
  const lines = ["## Parsers", ""];

  for (const [, parser] of Object.entries(PARSERS)) {
    lines.push(`### [${parser.name}](${parser.url})`);
    lines.push("");
    lines.push(parser.description);
    lines.push("");
  }

  return lines.join("\n");
}

function getSystemInfo(): string {
  const cpu = cpus()[0];
  const cpuModel = cpu?.model || "Unknown CPU";
  const cpuCores = cpus().length;
  const totalMemoryGB = (totalmem() / (1024 * 1024 * 1024)).toFixed(0);
  const os = platform();
  const osArch = arch();
  const osRelease = release();
  const osName =
    os === "darwin" ? "macOS" : os === "win32" ? "Windows" : os === "linux" ? "Linux" : os;

  return `## System

| Property | Value |
|----------|-------|
| OS | ${osName} ${osRelease} (${osArch}) |
| CPU | ${cpuModel} |
| Cores | ${cpuCores} |
| Memory | ${totalMemoryGB} GB |`;
}

function generateRunSection(): string {
  return `## Run Benchmarks

### Prerequisites

- [Bun](https://bun.sh/) 1.3.5 - package manager and canonical benchmark runtime
- [Node.js](https://nodejs.org/) 26.7.0 - optional alternate benchmark runtime

### Exact styled-components reproduction

The checked-in styled-components tables were produced from the immutable
\`styled-components-benchmark-v1\` tag. The reproduction script rejects a mismatched runtime,
overrides all benchmark settings with the recorded values, validates the result metadata, and
writes the raw measurements to \`result/styled-components.json\`:

\`\`\`bash
git clone https://github.com/SoonIter/ecmascript-parser-benchmark-js.git
cd ecmascript-parser-benchmark-js
git checkout styled-components-benchmark-v1
bun --version # must print 1.3.5
bun install --frozen-lockfile
bun run reproduce:styled-components
\`\`\`

Absolute latency depends on the CPU, OS load, power mode, and thermal state. Reproduction here
means identical source revision, dependency graph, runtime version, fixture, options, warmup,
duration, process isolation, run count, validation, and aggregation. Compare the new raw result
with the checked-in measurement using:

\`\`\`bash
git diff -- result/styled-components.json
\`\`\`

The harness also runs under Node. This is a separate runtime measurement and therefore writes a
separate result file instead of overwriting the canonical Bun result:

\`\`\`bash
node --version # must print v26.7.0
node --import tsx scripts/reproduce-styled-components.ts
# writes result/styled-components-node.json
\`\`\`

The full Node verification run is checked in at
[\`result/styled-components-node.json\`](result/styled-components-node.json). It is not mixed
into the Bun tables or charts because JavaScript runtime performance is part of the measured
pipeline.

### Steps

1. Clone the repository:

\`\`\`bash
git clone https://github.com/yuku-toolchain/ecmascript-parser-benchmark-js.git
cd ecmascript-parser-benchmark-js
\`\`\`

2. Install dependencies:

\`\`\`bash
bun install
\`\`\`

3. Run benchmarks:

\`\`\`bash
bun bench
\`\`\`

To run only the end-to-end remove-console transform benchmark:

\`\`\`bash
bun run bench:transform
\`\`\`

To run the styled-components plugin comparison:

\`\`\`bash
bun run bench:styled-components
\`\`\`

This will run benchmarks on all test files. Results are saved to the \`result/\` directory.

Benchmark duration is configurable via the environment variables \`BENCH_TIME\` (timed duration per run in ms, default 10000), \`BENCH_WARMUP\` (warmup duration in ms, default 2000), and \`BENCH_RUNS\` (independent runs per parser, default 3). The stage profile inherits those durations; \`PROFILE_TIME\` and \`PROFILE_WARMUP\` override them. \`STYLED_COMPONENTS_COUNT\` changes the styled-components fixture size (default 240). For the most stable numbers, run on AC power with no other applications running.`;
}

function generateMethodologySection(): string {
  return `## Methodology

Each parser is benchmarked using [Tinybench](https://github.com/tinylibs/tinybench) with warmup iterations followed by multiple timed runs. Each run measures the time to parse the source text into an AST. Source files are read from disk once and kept in memory for all iterations.

To keep results stable and fair, every parser × file combination runs in its own freshly spawned process, so JIT state and GC pressure from one parser never affect another. Each combination is benchmarked in multiple independent runs (3 by default), and the reported median is the median across those runs, a statistic that is robust to GC pauses, OS scheduling blips, and other outliers. The RME column shows the relative margin of error (99% confidence) within a run. Differences between parsers smaller than their combined margins should be treated as noise.

Native parsers (Oxc, SWC, Yuku) run through their respective NAPI bindings, so measured time includes the binding overhead. Pure JS parsers (Acorn, Babel) run directly in the JavaScript runtime.

The remove-console transform benchmark measures the complete public API pipeline on every iteration. Babel runs parse, plugin traversal, and code generation through \`@babel/core.transformSync\`. Yuku runs native Zig parse, generated binary decoding into a JavaScript ESTree, the JavaScript visitor, generated binary encoding, and native Zig code generation. The input is held in memory, generated output is consumed, comments and source maps are disabled on both sides, and each transformer runs in a fresh process. The appended exercise contains both a removable statement call and a console call nested in an expression, so the plugin must perform both removal and replacement.

The styled-components benchmark uses the same end-to-end boundary. Babel runs \`babel-plugin-styled-components\` in JavaScript, SWC runs \`@swc/plugin-styled-components\` as a WASM plugin, and Yuku runs the fixture-scoped JavaScript plugin in \`scripts/yuku-styled-components-plugin.ts\` between its generated binary decoder and encoder. All three enable \`displayName\`, \`ssr\`, \`minify\`, and \`pure\`; parse and generate code on every timed iteration; and transform the same mix of \`styled.tag\`, \`styled(Component)\`, \`.attrs()\`, nested \`css\`, \`keyframes\`, \`createGlobalStyle\`, and interpolations. A correctness pass runs before timing, which also moves one-time module loading and SWC WASM compilation outside the measured steady-state transforms. Babel's official plugin does not annotate nested function-body \`css\` helpers as PURE while SWC does, so the result records the actual annotation count instead of claiming byte-for-byte output parity.

**Why is Oxc slower than Babel here?** By default, \`oxc-parser\` serializes the AST to a JSON string on the Rust side and runs \`JSON.parse\` on the JavaScript side when you access \`result.program\`. Oxc's Rust-side parsing is extremely fast. It is this serialization boundary that dominates the end-to-end time. (If you call \`parseSync\` and never touch the result, Oxc looks much faster, because \`program\` is a lazy getter that defers the \`JSON.parse\`. The benchmarks above measure the time to actually obtain the full AST, which is what any real consumer of a parser does.)

**What about Oxc's \`experimentalRawTransfer\`?** Oxc also has a hidden experimental path that removes the JSON step entirely. It is not part of Oxc's documented parser options, but when the flag is passed, Rust parses directly into a huge \`ArrayBuffer\` shared with JavaScript, and generated JS code deserializes AST nodes straight out of that memory. It is genuinely clever engineering, and with it enabled Oxc's end-to-end numbers land much closer to Yuku's, since the two pipelines become architecturally the same (binary buffer in, ESTree objects out).

It is not part of the results above for a simple reason. This benchmark measures each parser's default, documented, stable API, the code path every user gets from \`npm install\`. Raw transfer today is an undocumented flag that is none of those things, and it cannot run here at all.

- **It does not work on Bun**, which this benchmark runs on. \`oxc-parser\`'s own \`rawTransferSupported()\` check returns \`false\` on Bun, and on Node < 22 and Deno < 2, because the design requires allocating an \`ArrayBuffer\` larger than 4 GiB. Enabling the option in this harness would simply throw.
- **It needs gigabytes of reserved memory per parse.** The trick that makes it fast is that the Rust arena is a fixed 2 GiB block aligned to a 4 GiB boundary, so 64-bit Rust pointers can be read from JavaScript as 32-bit buffer offsets. Achieving that alignment means reserving ~6 GiB of address space per buffer. Most of it stays virtual until touched, but every concurrent parse still needs its own dedicated 2 GiB arena, source and AST together must fit inside that block, and only 64-bit little-endian platforms are supported.

If Oxc stabilizes raw transfer as its default path, we will happily benchmark it. That is the fair comparison we want.

**Why is Yuku fast without any of that?** Yuku reaches the same zero-serialization end state, but by construction rather than by workaround. Its Zig parser does not build a pointer graph that later needs remapping. The AST *is already binary*, a flat table of fixed-size 44-byte node records addressed by index, with strings stored as offsets into the source. That layout is its own transfer format. It crosses the NAPI boundary as one small buffer sized to the actual AST, and a generated decoder reads it in JavaScript through typed arrays, conceptually the same read side as Oxc's raw transfer minus the pointer-to-offset machinery that forces the giant fixed arena.

Because there are no pointers to remap, there is no 2 GiB block, no 4 GiB alignment requirement, no multi-gigabyte reservation, and no runtime gate. The same code path runs on Node, Bun, and Deno, parses files in parallel without multiplying memory, and uses only the memory the file actually needs. Zig's comptime generates both the binary layout and the JavaScript decoder from one source of truth, so they can never drift apart. The numbers in the tables above are Yuku's default and only mode. There is no faster experimental path being held back and nothing extra to enable.`;
}

async function main() {
  const readme = [
    "# ECMAScript Parser Benchmark (npm)",
    "",
    "Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust) via NAPI bindings.",
    "",
    getSystemInfo(),
    "",
    generateParsersSection(),
    await generateBenchmarksSection(),
    await generateTransformSection(),
    await generateStyledComponentsTransformSection(),
    generateRunSection(),
    "",
    generateMethodologySection(),
  ].join("\n");

  await writeFile(join(process.cwd(), "README.md"), readme);
  console.log("README.md generated successfully!");
}

main().catch(console.error);
