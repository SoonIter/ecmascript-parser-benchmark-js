# ECMAScript Parser Benchmark (npm)

Benchmarks for ECMAScript parsers available as npm packages, including pure JavaScript parsers and native parsers (Zig, Rust) via NAPI bindings.

## System

| Property | Value |
|----------|-------|
| OS | macOS 25.6.0 (arm64) |
| CPU | Apple M3 |
| Cores | 8 |
| Memory | 16 GB |

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

## Benchmarks

### [typescript.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/typescript.js)

**File size:** 7.83 MB

![Bar chart comparing npm parser speeds for typescript.js](charts/typescript.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **42.67 ms** | **±0.90%** | **43.25 ms** | **39.90 ms** | **104.48 ms** | **23.44 ops/s** | **baseline** |
| Acorn | 142.74 ms | ±2.92% | 146.52 ms | 127.31 ms | 276.63 ms | 7.01 ops/s | 3.35× slower |
| Babel | 173.73 ms | ±5.11% | 183.17 ms | 134.40 ms | 416.32 ms | 5.76 ops/s | 4.07× slower |
| Oxc | 218.35 ms | ±1.67% | 224.04 ms | 205.26 ms | 373.63 ms | 4.58 ops/s | 5.12× slower |
| SWC | 433.36 ms | ±3.73% | 440.36 ms | 371.84 ms | 1316.07 ms | 2.31 ops/s | 10.16× slower |

### [checker.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/checker.ts)

**File size:** 2.95 MB

![Bar chart comparing npm parser speeds for checker.ts](charts/checker.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **16.15 ms** | **±1.12%** | **16.60 ms** | **14.63 ms** | **55.30 ms** | **61.93 ops/s** | **baseline** |
| Oxc | 62.78 ms | ±1.07% | 64.33 ms | 60.55 ms | 115.69 ms | 15.93 ops/s | 3.89× slower |
| Babel | 66.34 ms | ±1.38% | 66.74 ms | 52.88 ms | 114.67 ms | 15.07 ops/s | 4.11× slower |
| SWC | 123.45 ms | ±1.11% | 126.84 ms | 118.83 ms | 179.16 ms | 8.10 ops/s | 7.65× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [lib.dom.d.ts](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/lib.dom.d.ts)

**File size:** 2.24 MB

![Bar chart comparing npm parser speeds for lib.dom.d.ts](charts/lib_dom.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **8.66 ms** | **±0.77%** | **8.73 ms** | **7.62 ms** | **48.86 ms** | **115.47 ops/s** | **baseline** |
| Oxc | 24.08 ms | ±0.75% | 24.41 ms | 22.88 ms | 55.53 ms | 41.53 ops/s | 2.78× slower |
| Babel | 37.90 ms | ±1.32% | 38.60 ms | 30.87 ms | 73.67 ms | 26.39 ops/s | 4.38× slower |
| SWC | 50.62 ms | ±0.74% | 50.91 ms | 48.80 ms | 89.26 ms | 19.76 ops/s | 5.84× slower |
| Acorn | Failed to parse | - | - | - | - | - | - |

### [react.js](https://raw.githubusercontent.com/yuku-toolchain/parser-benchmark-files/refs/heads/main/react.js)

**File size:** 0.07 MB

![Bar chart comparing npm parser speeds for react.js](charts/react.png)

| Parser | Median | RME | Mean | Min | Max | Ops/sec | Relative |
|--------|--------|-----|------|-----|-----|---------|----------|
| **Yuku** | **0.28 ms** | **±0.51%** | **0.33 ms** | **0.26 ms** | **15.58 ms** | **3593.35 ops/s** | **baseline** |
| Acorn | 0.86 ms | ±0.46% | 0.91 ms | 0.79 ms | 17.66 ms | 1167.20 ops/s | 3.08× slower |
| Babel | 1.12 ms | ±0.89% | 1.28 ms | 0.90 ms | 30.19 ms | 892.66 ops/s | 4.03× slower |
| Oxc | 1.13 ms | ±0.58% | 1.22 ms | 1.08 ms | 20.31 ms | 888.56 ops/s | 4.04× slower |
| SWC | 2.12 ms | ±0.47% | 2.22 ms | 2.05 ms | 36.86 ms | 472.41 ops/s | 7.61× slower |

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

Native parsers (Oxc, SWC, Yuku) run through their respective NAPI bindings, so measured time includes the binding overhead. Pure JS parsers (Acorn, Babel) run directly in the JavaScript runtime.

`lib.dom.d.ts` is a global declaration script with no imports or exports. SWC parses it as a script rather than a module, because its npm binding otherwise rejects the file's `...arguments` parameter names under module strict mode.

**Why is Oxc slower than Babel here?** By default, `oxc-parser` serializes the AST to a JSON string on the Rust side and runs `JSON.parse` on the JavaScript side when you access `result.program`. Oxc's Rust-side parsing is extremely fast. It is this serialization boundary that dominates the end-to-end time. (If you call `parseSync` and never touch the result, Oxc looks much faster, because `program` is a lazy getter that defers the `JSON.parse`. The benchmarks above measure the time to actually obtain the full AST, which is what any real consumer of a parser does.)

**What about Oxc's `experimentalRawTransfer`?** Oxc also has a hidden experimental path that removes the JSON step entirely. It is not part of Oxc's documented parser options, but when the flag is passed, Rust parses directly into a huge `ArrayBuffer` shared with JavaScript, and generated JS code deserializes AST nodes straight out of that memory. It is genuinely clever engineering, and with it enabled Oxc's end-to-end numbers land much closer to Yuku's, since the two pipelines become architecturally the same (binary buffer in, ESTree objects out).

It is not part of the results above for a simple reason. This benchmark measures each parser's default, documented, stable API, the code path every user gets from `npm install`. Raw transfer today is an undocumented flag that is none of those things, and it cannot run here at all.

- **It does not work on Bun**, which this benchmark runs on. `oxc-parser`'s own `rawTransferSupported()` check returns `false` on Bun, and on Node < 22 and Deno < 2, because the design requires allocating an `ArrayBuffer` larger than 4 GiB. Enabling the option in this harness would simply throw.
- **It needs gigabytes of reserved memory per parse.** The trick that makes it fast is that the Rust arena is a fixed 2 GiB block aligned to a 4 GiB boundary, so 64-bit Rust pointers can be read from JavaScript as 32-bit buffer offsets. Achieving that alignment means reserving ~6 GiB of address space per buffer. Most of it stays virtual until touched, but every concurrent parse still needs its own dedicated 2 GiB arena, source and AST together must fit inside that block, and only 64-bit little-endian platforms are supported.

If Oxc stabilizes raw transfer as its default path, we will happily benchmark it. That is the fair comparison we want.

**Why is Yuku fast without any of that?** Yuku reaches the same zero-serialization end state, but by construction rather than by workaround. Its Zig parser does not build a pointer graph that later needs remapping. The AST *is already binary*, a flat table of fixed-size 44-byte node records addressed by index, with strings stored as offsets into the source. That layout is its own transfer format. It crosses the NAPI boundary as one small buffer sized to the actual AST, and a generated decoder reads it in JavaScript through typed arrays, conceptually the same read side as Oxc's raw transfer minus the pointer-to-offset machinery that forces the giant fixed arena.

Because there are no pointers to remap, there is no 2 GiB block, no 4 GiB alignment requirement, no multi-gigabyte reservation, and no runtime gate. The same code path runs on Node, Bun, and Deno, parses files in parallel without multiplying memory, and uses only the memory the file actually needs. Zig's comptime generates both the binary layout and the JavaScript decoder from one source of truth, so they can never drift apart. The numbers in the tables above are Yuku's default and only mode. There is no faster experimental path being held back and nothing extra to enable.