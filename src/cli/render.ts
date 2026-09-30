import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/load.ts";
import { runCli } from "../errors.ts";
import { readSnapshot, SNAPSHOT_PATH } from "../fetch/snapshot.ts";
import { renderAll } from "../render/index.ts";

const DIST_DIR = "dist";

await runCli(async () => {
  const { values } = parseArgs({
    options: { data: { type: "string", default: SNAPSHOT_PATH } },
  });
  const config = await loadConfig();
  const snapshot = await readSnapshot(values.data);
  const files = renderAll(snapshot, config);

  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });
  for (const file of files) {
    await writeFile(join(DIST_DIR, file.name), file.content);
  }

  process.stdout.write(
    `${[
      `rendered ${files.length} files from ${values.data} to ${DIST_DIR}/`,
      ...files.map((file) => `  ${file.name}`),
    ].join("\n")}\n`,
  );
});
