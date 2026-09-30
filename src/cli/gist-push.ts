import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/load.ts";
import { runCli, StatsError } from "../errors.ts";
import { pushToGist } from "../publish/gist.ts";
import type { OutputFile } from "../render/index.ts";
import { loadEnvFile, requireToken } from "./env.ts";

const DIST_DIR = "dist";

async function readDist(dir: string): Promise<OutputFile[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) {
    throw new StatsError(
      "DIST_EMPTY",
      `No SVG files in ${dir}/; run pnpm svg:render first`,
    );
  }
  return Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(join(dir, name), "utf8"),
    })),
  );
}

await runCli(async () => {
  const { values } = parseArgs({
    options: { "dry-run": { type: "boolean", default: false } },
  });
  const dryRun = values["dry-run"];
  loadEnvFile();
  const config = await loadConfig();
  const files = await readDist(DIST_DIR);
  const token = requireToken();

  const changed = await pushToGist({
    gistId: config.gist.id,
    token,
    files,
    dryRun,
  });

  if (changed.length === 0) {
    process.stdout.write(`up to date (${files.length} files)\n`);
    return;
  }
  const verb = dryRun ? "would update" : "updated";
  process.stdout.write(
    `${[
      `${verb} ${changed.length} of ${files.length} files`,
      ...changed.map((name) => `  ${name}`),
    ].join("\n")}\n`,
  );
});
