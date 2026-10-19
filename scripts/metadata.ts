import { arch, cpus, platform, release, totalmem } from "node:os";

export async function collectMetadata(paths: string[], settings: { time: number; warmup: number; runs: number }) {
  const manifest = await Bun.file("package.json").json();
  const packages = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies });
  const hash = async (path: string) => new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path).arrayBuffer()).digest("hex");
  const revision = Bun.spawnSync(["git", "-C", "files", "rev-parse", "HEAD"]);
  if (!revision.success) throw new Error("Cannot resolve fixture revision");
  return {
    startedAt: new Date().toISOString(),
    system: {
      platform: platform(), release: release(), arch: arch(),
      cpu: cpus()[0]?.model ?? "Unknown CPU", cores: cpus().length,
      memoryGB: Math.round(totalmem() / 1024 ** 3),
    },
    bun: Bun.version,
    settings,
    packages: Object.fromEntries(await Promise.all(packages.map(async (name) =>
      [name, (await Bun.file(`node_modules/${name}/package.json`).json()).version as string],
    ))),
    fixturesCommit: revision.stdout.toString().trim(),
    files: await Promise.all(paths.map(async (path) => ({ path, bytes: Bun.file(path).size, sha256: await hash(path) }))),
    lockSha256: await hash("bun.lock"),
  };
}

export type BenchmarkMetadata = Awaited<ReturnType<typeof collectMetadata>>;
