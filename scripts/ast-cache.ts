import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const AST_CACHE_PATH = ".cache/ecmascript-parser-benchmark-js/ast.json";
const AST_CACHE_VERSION = 1;

interface CacheFile<Lang, Summary> {
  sourceHash: string;
  lang: Lang;
  summary: Summary;
}

interface AstCache<Lang, Summary> {
  version: number;
  generatedBy: string;
  files: Record<string, CacheFile<Lang, Summary>>;
}

interface FileConfig<Lang> {
  path: string;
  lang: Lang;
}

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadOxcBaseline<Lang, Summary>(
  fileKey: string,
  source: string,
  lang: Lang,
  isSummary: (value: unknown) => value is Summary,
): Promise<Summary> {
  let contents: string;
  try {
    contents = await readFile(join(process.cwd(), AST_CACHE_PATH), "utf-8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      throw new Error("Oxc AST cache is missing. Run `bun run generate:ast-cache` first.");
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(contents);
  if (
    !isRecord(parsed) ||
    parsed.version !== AST_CACHE_VERSION ||
    parsed.generatedBy !== "Oxc" ||
    !isRecord(parsed.files)
  ) {
    throw new Error("Invalid Oxc AST cache. Run `bun run generate:ast-cache` to rebuild it.");
  }
  const entry = parsed.files[fileKey];
  if (
    !isRecord(entry) ||
    entry.sourceHash !== sourceHash(source) ||
    entry.lang !== lang ||
    !isSummary(entry.summary)
  ) {
    throw new Error(
      `Oxc AST cache is stale or missing ${fileKey}. Run \`bun run generate:ast-cache\` to rebuild it.`,
    );
  }
  return entry.summary;
}

export async function generateOxcAstCache<Lang, Summary>(
  fileKeys: string[],
  files: Record<string, FileConfig<Lang>>,
  createSummary: (fileKey: string, source: string, lang: Lang) => Summary,
): Promise<void> {
  const keys = fileKeys.length > 0 ? fileKeys : Object.keys(files);
  const entries: Record<string, CacheFile<Lang, Summary>> = {};

  for (const fileKey of keys) {
    const file = files[fileKey];
    if (!file) throw new Error(`Unknown file for Oxc AST cache: ${fileKey}`);

    const source = await readFile(join(process.cwd(), file.path), "utf-8");
    entries[fileKey] = {
      sourceHash: sourceHash(source),
      lang: file.lang,
      summary: createSummary(fileKey, source, file.lang),
    };
  }

  const cache: AstCache<Lang, Summary> = {
    version: AST_CACHE_VERSION,
    generatedBy: "Oxc",
    files: entries,
  };
  const cacheDir = join(process.cwd(), ".cache/ecmascript-parser-benchmark-js");
  await mkdir(cacheDir, { recursive: true });
  await writeFile(join(cacheDir, "ast.json"), `${JSON.stringify(cache)}\n`);
}
