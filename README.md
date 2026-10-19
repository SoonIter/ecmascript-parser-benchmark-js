# ECMAScript Parser Benchmark (npm)

Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust) via NAPI bindings.

## System

| Property | Value |
|----------|-------|
| OS | macOS (Darwin kernel) 25.6.0 (arm64) |
| CPU | Apple M5 Max |
| Cores | 18 |
| Memory | 64 GB |
| Bun | 1.4.0 |
| Run started (UTC) | 2026-10-16T07:54:33.734Z |

Parser versions: `@babel/parser@8.0.7`; `@swc-next/parser@0.3.0`; `@swc/core@1.16.18`; `acorn@8.19.0`; `oxc-parser@0.154.0`; `yuku-parser@0.19.0`.

Run parameters, installed package versions, fixture revision and SHA-256 hashes are saved in [result/metadata.json](result/metadata.json).

## Parsers

### [Acorn](https://github.com/acornjs/acorn)

A tiny, fast JavaScript parser, written completely in JavaScript.

### [Babel](https://github.com/babel/babel/tree/main/packages/babel-parser)

A JavaScript compiler and parser used by the Babel toolchain.

### [Oxc](https://github.com/oxc-project/oxc)

A high-performance JavaScript and TypeScript parser written in Rust.

### [SWC](https://github.com/swc-project/swc)

An extensible Rust-based platform for compiling and bundling JavaScript and TypeScript.

### [Yuku](https://github.com/yuku-toolchain/yuku)

A high-performance & spec-compliant JavaScript/TypeScript compiler written in Zig.

### [SWC Next](https://github.com/swc-project/swc-next)

The next-generation SWC JavaScript and TypeScript parser.

## Benchmarks

### [typescript.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/e25ab06730f743838b2c693d2126ea0162a661c6/typescript.js)

**File size:** 7.83 MB

![Bar chart comparing npm parser speeds for typescript.js](charts/typescript.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **31.86 ms** | **±1.07%** | **32.05 ms** | **27.53 ms** | **70.94 ms** | **31.39 ops/s** | **baseline** |
| Yuku | 36.97 ms | ±0.68% | 37.59 ms | 34.03 ms | 70.92 ms | 27.05 ops/s | 1.16× slower |
| Acorn | 112.51 ms | ±1.28% | 113.08 ms | 96.39 ms | 151.95 ms | 8.89 ops/s | 3.53× slower |
| Babel | 131.22 ms | ±3.12% | 132.41 ms | 104.21 ms | 413.47 ms | 7.62 ops/s | 4.12× slower |
| Oxc | 172.21 ms | ±1.10% | 177.08 ms | 167.52 ms | 218.78 ms | 5.81 ops/s | 5.41× slower |
| SWC | 324.03 ms | ±1.17% | 329.24 ms | 310.34 ms | 491.05 ms | 3.09 ops/s | 10.17× slower |

### [checker.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/e25ab06730f743838b2c693d2126ea0162a661c6/checker.ts)

**File size:** 2.95 MB

![Bar chart comparing npm parser speeds for checker.ts](charts/checker.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **12.62 ms** | **±0.88%** | **13.05 ms** | **10.78 ms** | **30.71 ms** | **79.22 ops/s** | **baseline** |
| Yuku | 14.67 ms | ±0.71% | 15.03 ms | 12.85 ms | 38.94 ms | 68.18 ops/s | 1.16× slower |
| Oxc | 53.17 ms | ±1.18% | 53.92 ms | 50.85 ms | 112.68 ms | 18.81 ops/s | 4.21× slower |
| Babel | 54.37 ms | ±1.29% | 54.48 ms | 42.84 ms | 110.62 ms | 18.39 ops/s | 4.31× slower |
| SWC | 106.12 ms | ±0.73% | 106.90 ms | 101.27 ms | 176.02 ms | 9.42 ops/s | 8.41× slower |
| Acorn | TypeScript not supported | - | - | - | - | - | - |

### [lib.dom.d.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/e25ab06730f743838b2c693d2126ea0162a661c6/lib.dom.d.ts)

**File size:** 2.24 MB

![Bar chart comparing npm parser speeds for lib.dom.d.ts](charts/lib_dom.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **5.25 ms** | **±0.61%** | **5.28 ms** | **4.11 ms** | **22.12 ms** | **190.49 ops/s** | **baseline** |
| Yuku | 6.43 ms | ±0.45% | 6.73 ms | 6.07 ms | 11.78 ms | 155.53 ops/s | 1.22× slower |
| Oxc | 20.81 ms | ±0.51% | 20.98 ms | 19.09 ms | 72.62 ms | 48.05 ops/s | 3.96× slower |
| Babel | 30.28 ms | ±0.91% | 30.72 ms | 24.68 ms | 65.56 ms | 33.03 ops/s | 5.77× slower |
| SWC | 43.37 ms | ±0.42% | 43.68 ms | 41.88 ms | 53.58 ms | 23.06 ops/s | 8.26× slower |
| Acorn | TypeScript not supported | - | - | - | - | - | - |

### [react.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/e25ab06730f743838b2c693d2126ea0162a661c6/react.js)

**File size:** 0.07 MB

![Bar chart comparing npm parser speeds for react.js](charts/react.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **0.18 ms** | **±0.80%** | **0.26 ms** | **0.15 ms** | **7.02 ms** | **5598.32 ops/s** | **baseline** |
| Yuku | 0.23 ms | ±0.70% | 0.30 ms | 0.20 ms | 7.30 ms | 4271.99 ops/s | 1.31× slower |
| Acorn | 0.66 ms | ±0.46% | 0.73 ms | 0.57 ms | 3.49 ms | 1523.13 ops/s | 3.68× slower |
| Babel | 0.88 ms | ±0.70% | 1.02 ms | 0.65 ms | 4.48 ms | 1131.81 ops/s | 4.95× slower |
| Oxc | 0.95 ms | ±0.49% | 1.03 ms | 0.87 ms | 14.68 ms | 1049.91 ops/s | 5.33× slower |
| SWC | 1.92 ms | ±0.38% | 2.05 ms | 1.75 ms | 6.15 ms | 521.80 ops/s | 10.73× slower |

## Run Benchmarks

### Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and package manager

### Steps

1. Clone the repository:

```bash
git clone https://github.com/yuku-toolchain/ecmascript-parser-benchmark-js.git
cd ecmascript-parser-benchmark-js
```

2. Install dependencies:

```bash
bun install --frozen-lockfile
```

3. Download the benchmark files:

```bash
bun load-files
```

The downloader follows the fixture repository's HEAD. To reproduce the inputs measured here:

```bash
git -C files fetch --depth 1 origin e25ab06730f743838b2c693d2126ea0162a661c6
git -C files checkout --detach e25ab06730f743838b2c693d2126ea0162a661c6
```

4. Run benchmarks:

```bash
bun bench
```

This will run benchmarks on all test files. Results are saved to the `result/` directory.

Benchmark duration is configurable via the environment variables `BENCH_TIME` (timed duration per run in ms, default 10000), `BENCH_WARMUP` (warmup duration in ms, default 2000), and `BENCH_RUNS` (independent runs per parser, default 3). For the most stable numbers, run on AC power with no other applications running.

## Methodology

Each parser is benchmarked using [Tinybench](https://github.com/tinylibs/tinybench) with warmup iterations followed by multiple timed runs. Each run measures the time to parse the source text into an AST. Source files are read from disk once and kept in memory for all iterations.

To keep results stable and fair, every parser × file combination runs in its own freshly spawned process, so JIT state and GC pressure from one parser never affect another. Each combination is benchmarked in multiple independent runs (3 by default), and the reported median is the median across those runs, a statistic that is robust to GC pauses, OS scheduling blips, and other outliers. The RME column shows the relative margin of error (99% confidence) within a run. Differences between parsers smaller than their combined margins should be treated as noise.

Native parsers (Oxc, SWC, SWC Next, Yuku) run through their respective NAPI bindings, so measured time includes the binding overhead. Pure JS parsers (Acorn, Babel) run directly in the JavaScript runtime. SWC Next uses `@swc-next/parser` and reads `result.program` to include full JavaScript AST decoding.

`lib.dom.d.ts` is a global declaration script with no imports or exports. SWC parses it as a script rather than a module, because its npm binding otherwise rejects the file's `...arguments` parameter names under module strict mode.

**Why is Oxc slower than Babel here?** By default, `oxc-parser` serializes the AST to a JSON string on the Rust side and runs `JSON.parse` on the JavaScript side when you access `result.program`. Oxc's Rust-side parsing is extremely fast. It is this serialization boundary that dominates the end-to-end time. (If you call `parseSync` and never touch the result, Oxc looks much faster, because `program` is a lazy getter that defers the `JSON.parse`. The benchmarks above measure the time to actually obtain the full AST, which is what any real consumer of a parser does.)

**What about Oxc's `experimentalRawTransfer`?** Oxc also has a hidden experimental path that removes the JSON step entirely. It is not part of Oxc's documented parser options, but when the flag is passed, Rust parses directly into a huge `ArrayBuffer` shared with JavaScript, and generated JS code deserializes AST nodes straight out of that memory. It is genuinely clever engineering, and with it enabled Oxc's end-to-end numbers land much closer to Yuku's, since the two pipelines become architecturally the same (binary buffer in, ESTree objects out).

It is not part of the results above for a simple reason. This benchmark measures each parser's default, documented, stable API, the code path every user gets from `npm install`. Raw transfer today is an undocumented flag that is none of those things, and it cannot run here at all.

- **It does not work on Bun**, which this benchmark runs on. `oxc-parser`'s own `rawTransferSupported()` check returns `false` on Bun, and on Node < 22 and Deno < 2, because the design requires allocating an `ArrayBuffer` larger than 4 GiB. Enabling the option in this harness would simply throw.
- **It needs gigabytes of reserved memory per parse.** The trick that makes it fast is that the Rust arena is a fixed 2 GiB block aligned to a 4 GiB boundary, so 64-bit Rust pointers can be read from JavaScript as 32-bit buffer offsets. Achieving that alignment means reserving ~6 GiB of address space per buffer. Most of it stays virtual until touched, but every concurrent parse still needs its own dedicated 2 GiB arena, source and AST together must fit inside that block, and only 64-bit little-endian platforms are supported.

If Oxc stabilizes raw transfer as its default path, we will happily benchmark it. That is the fair comparison we want.

**Why is Yuku fast without any of that?** Yuku reaches the same zero-serialization end state, but by construction rather than by workaround. Its Zig parser does not build a pointer graph that later needs remapping. The AST *is already binary*, a flat table of fixed-size 44-byte node records addressed by index, with strings stored as offsets into the source. That layout is its own transfer format. It crosses the NAPI boundary as one small buffer sized to the actual AST, and a generated decoder reads it in JavaScript through typed arrays, conceptually the same read side as Oxc's raw transfer minus the pointer-to-offset machinery that forces the giant fixed arena.

Because there are no pointers to remap, there is no 2 GiB block, no 4 GiB alignment requirement, no multi-gigabyte reservation, and no runtime gate. The same code path runs on Node, Bun, and Deno, parses files in parallel without multiplying memory, and uses only the memory the file actually needs. Zig's comptime generates both the binary layout and the JavaScript decoder from one source of truth, so they can never drift apart. The numbers in the tables above are Yuku's default and only mode. There is no faster experimental path being held back and nothing extra to enable.