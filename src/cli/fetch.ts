import { loadConfig } from "../config/load.ts";
import { runCli } from "../errors.ts";
import { fetchSnapshot } from "../fetch/index.ts";
import { SNAPSHOT_PATH, writeSnapshot } from "../fetch/snapshot.ts";
import { loadEnvFile, requireToken } from "./env.ts";

await runCli(async () => {
  loadEnvFile();
  const config = await loadConfig();
  const token = requireToken();

  const snapshot = await fetchSnapshot(config, token);
  await writeSnapshot(SNAPSHOT_PATH, snapshot);

  const { totals, languages } = snapshot;
  process.stdout.write(
    `${[
      `snapshot written to ${SNAPSHOT_PATH}`,
      `stars: ${totals.stars}`,
      `commits: ${totals.commits}`,
      `prs: ${totals.prs}`,
      `issues: ${totals.issues}`,
      `reviews: ${totals.reviews}`,
      `contributed to: ${totals.contributedTo}`,
      `languages: ${languages.length}`,
    ].join("\n")}\n`,
  );
});
