# ECMAScript Parser Benchmark (npm)

Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust) via NAPI bindings.

## System

| Property | Value |
|----------|-------|
| OS | macOS 25.6.0 (arm64) |
| CPU | Apple M5 Max |
| Cores | 18 |
| Memory | 64 GB |

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

### [typescript.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/typescript.js)

**File size:** 7.83 MB

![Bar chart comparing npm parser speeds for typescript.js](charts/typescript.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **31.53 ms** | **±0.63%** | **31.52 ms** | **27.78 ms** | **59.29 ms** | **31.71 ops/s** | **baseline** |
| Yuku | 34.52 ms | ±0.50% | 34.97 ms | 32.60 ms | 42.02 ms | 28.97 ops/s | 1.09× slower |
| Acorn | 105.02 ms | ±0.96% | 104.55 ms | 90.05 ms | 119.46 ms | 9.52 ops/s | 3.33× slower |
| Babel | 124.93 ms | ±2.53% | 126.46 ms | 101.63 ms | 178.15 ms | 8.00 ops/s | 3.96× slower |
| Oxc | 170.72 ms | ±0.83% | 171.84 ms | 165.39 ms | 202.92 ms | 5.86 ops/s | 5.41× slower |
| SWC | 313.67 ms | ±0.68% | 314.39 ms | 302.34 ms | 347.49 ms | 3.19 ops/s | 9.95× slower |

### [checker.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/checker.ts)

**File size:** 2.95 MB

![Bar chart comparing npm parser speeds for checker.ts](charts/checker.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **12.17 ms** | **±0.69%** | **12.45 ms** | **10.78 ms** | **20.95 ms** | **82.16 ops/s** | **baseline** |
| Yuku | 13.55 ms | ±0.60% | 13.81 ms | 12.19 ms | 19.86 ms | 73.80 ops/s | 1.11× slower |
| Oxc | 52.43 ms | ±0.37% | 52.97 ms | 51.08 ms | 62.69 ms | 19.07 ops/s | 4.31× slower |
| Babel | 52.97 ms | ±1.22% | 53.33 ms | 42.44 ms | 64.66 ms | 18.88 ops/s | 4.35× slower |
| SWC | 103.98 ms | ±0.56% | 104.79 ms | 100.97 ms | 130.25 ms | 9.62 ops/s | 8.54× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [lib.dom.d.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/lib.dom.d.ts)

**File size:** 2.24 MB

![Bar chart comparing npm parser speeds for lib.dom.d.ts](charts/lib_dom.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **5.05 ms** | **±0.57%** | **4.99 ms** | **3.96 ms** | **18.27 ms** | **197.95 ops/s** | **baseline** |
| Yuku | 6.65 ms | ±0.50% | 6.64 ms | 5.70 ms | 11.47 ms | 150.49 ops/s | 1.32× slower |
| Oxc | 20.35 ms | ±0.49% | 20.55 ms | 18.92 ms | 30.64 ms | 49.15 ops/s | 4.03× slower |
| Babel | 28.27 ms | ±0.96% | 28.33 ms | 23.48 ms | 45.28 ms | 35.37 ops/s | 5.60× slower |
| SWC | 43.14 ms | ±0.28% | 43.36 ms | 42.07 ms | 50.65 ms | 23.18 ops/s | 8.54× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [react.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/react.js)

**File size:** 0.07 MB

![Bar chart comparing npm parser speeds for react.js](charts/react.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **0.19 ms** | **±0.81%** | **0.27 ms** | **0.16 ms** | **8.98 ms** | **5381.15 ops/s** | **baseline** |
| Yuku | 0.23 ms | ±0.60% | 0.29 ms | 0.21 ms | 2.22 ms | 4367.61 ops/s | 1.23× slower |
| Acorn | 0.65 ms | ±0.42% | 0.71 ms | 0.58 ms | 2.54 ms | 1535.61 ops/s | 3.50× slower |
| Babel | 0.89 ms | ±0.74% | 1.02 ms | 0.67 ms | 3.91 ms | 1129.46 ops/s | 4.76× slower |
| Oxc | 0.96 ms | ±0.39% | 1.04 ms | 0.90 ms | 8.10 ms | 1041.40 ops/s | 5.17× slower |
| SWC | 1.91 ms | ±0.37% | 2.04 ms | 1.80 ms | 4.39 ms | 522.86 ops/s | 10.29× slower |

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
bun install
```

3. Download the benchmark files:

```bash
bun load-files
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