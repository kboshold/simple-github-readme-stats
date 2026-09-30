import type { Config } from "../config/schema.ts";
import { aggregateRepos, estimateCommits } from "./aggregate.ts";
import { type ClientOptions, createClient } from "./client.ts";
import { fetchCommitInputs } from "./queries/commits.ts";
import { fetchRepos } from "./queries/repos.ts";
import { fetchUser } from "./queries/user.ts";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./snapshot.ts";

export interface FetchSnapshotOptions extends ClientOptions {
  now?: Date;
}

export async function fetchSnapshot(
  config: Config,
  token: string,
  options: FetchSnapshotOptions = {},
): Promise<Snapshot> {
  const now = options.now ?? new Date();
  const client = createClient(token, options);

  const user = await fetchUser(client, config.username);
  const [commitInputs, repos] = await Promise.all([
    fetchCommitInputs(client, config.username, {
      window: config.commitsWindow,
      createdAt: user.createdAt,
      now,
    }),
    fetchRepos(client, config.username),
  ]);
  const { stars, languages } = aggregateRepos(repos, config);

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: now.toISOString(),
    user: {
      login: user.login,
      name: user.name,
      followers: user.followers,
    },
    totals: {
      stars,
      commits: estimateCommits(commitInputs, user),
      prs: user.prs,
      issues: user.issues,
      reviews: user.reviews,
      contributedTo: user.contributedTo,
    },
    languages,
  };
}
