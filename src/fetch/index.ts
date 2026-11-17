import type { Config } from "../config/schema.ts";
import { aggregateRepos, estimateCommits } from "./aggregate.ts";
import { type ClientOptions, createClient } from "./client.ts";
import { fetchCommitInputs } from "./queries/commits.ts";
import { fetchRepo, fetchRepos, type RepoNode } from "./queries/repos.ts";
import { fetchUser } from "./queries/user.ts";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./snapshot.ts";

export interface FetchSnapshotOptions extends ClientOptions {
  now?: Date;
}

function unlistedIncludes(listed: RepoNode[], config: Config): string[] {
  const known = new Set(
    [...listed.map((repo) => repo.nameWithOwner), ...config.excludeRepos].map(
      (name) => name.toLowerCase(),
    ),
  );
  return config.includeRepos.filter((name) => !known.has(name.toLowerCase()));
}

export async function fetchSnapshot(
  config: Config,
  token: string,
  options: FetchSnapshotOptions = {},
): Promise<Snapshot> {
  const now = options.now ?? new Date();
  const client = createClient(token, options);

  const user = await fetchUser(client, config.username);
  const [commitInputs, listed] = await Promise.all([
    fetchCommitInputs(client, config.username, {
      window: config.commitsWindow,
      createdAt: user.createdAt,
      now,
    }),
    fetchRepos(client, config.username),
  ]);
  const included = await Promise.all(
    unlistedIncludes(listed, config).map((name) => fetchRepo(client, name)),
  );
  const { stars, languages } = aggregateRepos([...listed, ...included], config);

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
