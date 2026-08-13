import Bun from "bun";
import { stat } from "node:fs/promises";

const DEST = "files";
const REPO_URL = "https://github.com/yuku-toolchain/parser-benchmark-files";

const shouldLoad = await stat(DEST).then(
  (entry) => !entry.isDirectory(),
  () => true,
);

if (!shouldLoad) {
  process.exit(0);
}

console.log("\nDownloading files...");

const result = Bun.spawnSync({
  cmd: [
    "git",
    "clone",
    "--quiet",
    "--no-progress",
    "--single-branch",
    "--depth",
    "1",
    REPO_URL,
    DEST,
  ],
});

if (result.exitCode !== 0) {
  throw new Error(`Could not download benchmark files: ${result.stderr.toString()}`);
}

console.log("\nFiles downloaded\n");
