import type { Config } from "../config/schema.ts";
import type { CommitInputs } from "./queries/commits.ts";
import type { RepoNode } from "./queries/repos.ts";
import type { LanguageStat } from "./snapshot.ts";

export type RepoFilter = Pick<Config, "username" | "orgs" | "excludeRepos">;

export interface RepoTotals {
  stars: number;
  languages: LanguageStat[];
}

function normalizeColor(color: string | null): string | null {
  const hex = color?.trim().replace(/^#/, "") ?? "";
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [...hex].map((digit) => digit + digit).join("");
  }
  return null;
}

function countedRepos(repos: RepoNode[], filter: RepoFilter): RepoNode[] {
  const owners = new Set(
    [filter.username, ...filter.orgs].map((login) => login.toLowerCase()),
  );
  const excluded = new Set(
    filter.excludeRepos.map((name) => name.toLowerCase()),
  );
  const seen = new Set<string>();

  return repos.filter((repo) => {
    const key = repo.nameWithOwner.toLowerCase();
    if (
      !owners.has(repo.ownerLogin.toLowerCase()) ||
      excluded.has(key) ||
      seen.has(key)
    ) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function aggregateRepos(
  repos: RepoNode[],
  filter: RepoFilter,
): RepoTotals {
  const counted = countedRepos(repos, filter);
  const languages = new Map<string, LanguageStat>();

  for (const repo of counted) {
    if (repo.isFork) {
      continue;
    }
    for (const language of repo.languages) {
      const color = normalizeColor(language.color);
      const entry = languages.get(language.name);
      if (entry === undefined) {
        languages.set(language.name, {
          name: language.name,
          color,
          bytes: language.size,
        });
      } else {
        entry.bytes += language.size;
        entry.color ??= color;
      }
    }
  }

  return {
    stars: counted.reduce((total, repo) => total + repo.stars, 0),
    languages: [...languages.values()].sort(
      (a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name, "en"),
    ),
  };
}

export function estimateCommits(
  inputs: CommitInputs,
  totals: { prs: number; issues: number },
): number {
  const privatePrs = (inputs.windowPrs ?? totals.prs) - inputs.prContributions;
  const privateIssues =
    (inputs.windowIssues ?? totals.issues) - inputs.issueContributions;
  const privateCommits =
    inputs.restricted - Math.max(0, privatePrs) - Math.max(0, privateIssues);

  return inputs.visibleCommits + Math.max(0, privateCommits);
}
