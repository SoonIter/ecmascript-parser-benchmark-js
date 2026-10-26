# ECMAScript Parser Benchmark (npm)

Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust).

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

### [SWC Next](https://github.com/swc-project/swc-next)

The next-generation SWC JavaScript and TypeScript parser.

### [Yuku](https://github.com/yuku-toolchain/yuku)

A high-performance & spec-compliant JavaScript/TypeScript compiler written in Zig.

## Benchmarks

### [typescript.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/typescript.js)

**File size:** 7.83 MB

![Bar chart comparing npm parser speeds for typescript.js](charts/typescript.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **32.11 ms** | **±0.67%** | **31.96 ms** | **28.13 ms** | **76.64 ms** | **31.14 ops/s** | **baseline** |
| Yuku | 36.94 ms | ±1.07% | 38.19 ms | 33.45 ms | 62.96 ms | 27.07 ops/s | 1.15× slower |
| Acorn | 115.41 ms | ±1.27% | 115.33 ms | 97.18 ms | 186.00 ms | 8.66 ops/s | 3.59× slower |
| Babel | 134.79 ms | ±2.22% | 133.78 ms | 109.76 ms | 1065.82 ms | 7.42 ops/s | 4.20× slower |
| Oxc | 186.55 ms | ±11.72% | 206.97 ms | 172.45 ms | 1555.67 ms | 5.36 ops/s | 5.81× slower |
| SWC | 352.55 ms | ±26.86% | 493.61 ms | 327.28 ms | 6303.19 ms | 2.84 ops/s | 10.98× slower |

### [checker.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/checker.ts)

**File size:** 2.95 MB

![Bar chart comparing npm parser speeds for checker.ts](charts/checker.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **12.27 ms** | **±0.92%** | **12.75 ms** | **10.86 ms** | **20.71 ms** | **81.53 ops/s** | **baseline** |
| SWC Next | 12.41 ms | ±0.82% | 12.67 ms | 10.84 ms | 99.33 ms | 80.61 ops/s | 1.01× slower |
| Oxc | 53.58 ms | ±0.61% | 54.13 ms | 50.89 ms | 70.16 ms | 18.66 ops/s | 4.37× slower |
| Babel | 56.01 ms | ±1.41% | 56.13 ms | 43.75 ms | 85.09 ms | 17.85 ops/s | 4.57× slower |
| SWC | 108.28 ms | ±1.18% | 109.56 ms | 100.89 ms | 152.98 ms | 9.24 ops/s | 8.83× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [lib.dom.d.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/lib.dom.d.ts)

**File size:** 2.24 MB

![Bar chart comparing npm parser speeds for lib.dom.d.ts](charts/lib_dom.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **5.06 ms** | **±0.93%** | **5.32 ms** | **4.07 ms** | **40.56 ms** | **197.77 ops/s** | **baseline** |
| SWC Next | 5.20 ms | ±0.98% | 5.35 ms | 3.99 ms | 57.95 ms | 192.41 ops/s | 1.03× slower |
| Oxc | 19.97 ms | ±0.45% | 20.19 ms | 18.73 ms | 30.31 ms | 50.08 ops/s | 3.95× slower |
| Babel | 28.64 ms | ±1.07% | 29.18 ms | 23.84 ms | 64.87 ms | 34.92 ops/s | 5.66× slower |
| SWC | 44.83 ms | ±0.71% | 45.15 ms | 41.20 ms | 132.27 ms | 22.31 ops/s | 8.87× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [react.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/react.js)

**File size:** 0.07 MB

![Bar chart comparing npm parser speeds for react.js](charts/react.svg)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **SWC Next** | **0.18 ms** | **±0.72%** | **0.24 ms** | **0.16 ms** | **5.35 ms** | **5476.93 ops/s** | **baseline** |
| Yuku | 0.21 ms | ±0.88% | 0.28 ms | 0.19 ms | 17.95 ms | 4794.25 ops/s | 1.14× slower |
| Acorn | 0.67 ms | ±0.48% | 0.74 ms | 0.59 ms | 10.78 ms | 1495.70 ops/s | 3.66× slower |
| Oxc | 0.97 ms | ±0.47% | 1.07 ms | 0.89 ms | 5.43 ms | 1027.75 ops/s | 5.33× slower |
| Babel | 0.99 ms | ±0.94% | 1.18 ms | 0.68 ms | 8.37 ms | 1006.42 ops/s | 5.44× slower |
| SWC | 1.89 ms | ±0.72% | 2.05 ms | 1.79 ms | 33.18 ms | 528.55 ops/s | 10.36× slower |

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

Oxc, SWC, SWC Next, and Yuku run through their published Node-API bindings on this platform. Yuku 0.24.0 selects its native addon by default here; its WebAssembly fallback is not measured. Measured time includes obtaining the complete JavaScript AST. SWC Next reads `result.program` to include AST decoding. Pure JS parsers (Acorn, Babel) run directly in the JavaScript runtime.

`lib.dom.d.ts` is a global declaration script with no imports or exports. SWC parses it as a script rather than a module, because its npm binding otherwise rejects the file's `...arguments` parameter names under module strict mode.

**Why is Oxc slower than Babel here?** By default, `oxc-parser` serializes the AST to a JSON string on the Rust side and runs `JSON.parse` on the JavaScript side when you access `result.program`. Oxc's Rust-side parsing is extremely fast. It is this serialization boundary that dominates the end-to-end time. (If you call `parseSync` and never touch the result, Oxc looks much faster, because `program` is a lazy getter that defers the `JSON.parse`. The benchmarks above measure the time to actually obtain the full AST, which is what any real consumer of a parser does.)

**What about Oxc's `experimentalRawTransfer`?** Oxc also has a hidden experimental path that removes the JSON step entirely. It is not part of Oxc's documented parser options, but when the flag is passed, Rust parses directly into a huge `ArrayBuffer` shared with JavaScript, and generated JS code deserializes AST nodes straight out of that memory. It is genuinely clever engineering, and with it enabled Oxc's end-to-end numbers land much closer to Yuku's, since the two pipelines become architecturally the same (binary buffer in, ESTree objects out).

It is not part of the results above for a simple reason. This benchmark measures each parser's default, documented, stable API, the code path every user gets from `npm install`. Raw transfer today is an undocumented flag that is none of those things, and it cannot run here at all.

- **It does not work on Bun**, which this benchmark runs on. `oxc-parser`'s own `rawTransferSupported()` check returns `false` on Bun, and on Node < 22 and Deno < 2, because the design requires allocating an `ArrayBuffer` larger than 4 GiB. Enabling the option in this harness would simply throw.
- **It needs gigabytes of reserved memory per parse.** The trick that makes it fast is that the Rust arena is a fixed 2 GiB block aligned to a 4 GiB boundary, so 64-bit Rust pointers can be read from JavaScript as 32-bit buffer offsets. Achieving that alignment means reserving ~6 GiB of address space per buffer. Most of it stays virtual until touched, but every concurrent parse still needs its own dedicated 2 GiB arena, source and AST together must fit inside that block, and only 64-bit little-endian platforms are supported.

If Oxc stabilizes raw transfer as its default path, we will happily benchmark it. That is the fair comparison we want.

**Why is Yuku fast without any of that?** Yuku reaches the same zero-serialization end state, but by construction rather than by workaround. Its Zig parser does not build a pointer graph that later needs remapping. The AST *is already binary*, a flat table of fixed-size 44-byte node records addressed by index, with strings stored as offsets into the source. That layout is its own transfer format. It crosses the native boundary as one small buffer sized to the actual AST, and a generated decoder reads it in JavaScript through typed arrays, conceptually the same read side as Oxc's raw transfer minus the pointer-to-offset machinery that forces the giant fixed arena.

Because there are no pointers to remap, there is no 2 GiB block, no 4 GiB alignment requirement, no multi-gigabyte reservation, and no runtime gate. The same code path runs on Node, Bun, and Deno, parses files in parallel without multiplying memory, and uses only the memory the file actually needs. Zig's comptime generates both the binary layout and the JavaScript decoder from one source of truth, so they can never drift apart. The numbers in the tables above are Yuku's default and only mode. There is no faster experimental path being held back and nothing extra to enable.