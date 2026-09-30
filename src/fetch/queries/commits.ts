import { z } from "zod";
import type { GraphQLClient } from "../client.ts";

const WINDOW_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

const CONTRIBUTION_FIELDS = `
  totalCommitContributions
  restrictedContributionsCount
  totalPullRequestContributions
  totalIssueContributions
`;

const amount = z.number().int().nonnegative();

const ContributionsSchema = z.object({
  totalCommitContributions: amount,
  restrictedContributionsCount: amount,
  totalPullRequestContributions: amount,
  totalIssueContributions: amount,
});

const AllResponseSchema = z.object({
  user: z.record(z.string().regex(/^y\d{4}$/), ContributionsSchema),
});

const YearResponseSchema = z.object({
  user: z.object({ contributionsCollection: ContributionsSchema }),
  prs: z.object({ issueCount: amount }),
  issues: z.object({ issueCount: amount }),
});

const YEAR_QUERY = `
  query CommitsYear($login: String!, $prQuery: String!, $issueQuery: String!) {
    user(login: $login) {
      contributionsCollection { ${CONTRIBUTION_FIELDS} }
    }
    prs: search(query: $prQuery, type: ISSUE, first: 1) { issueCount }
    issues: search(query: $issueQuery, type: ISSUE, first: 1) { issueCount }
  }
`;

type Contributions = z.infer<typeof ContributionsSchema>;

export interface CommitInputsOptions {
  window: "all" | "year";
  createdAt: Date;
  now: Date;
}

export interface CommitInputs {
  visibleCommits: number;
  restricted: number;
  prContributions: number;
  issueContributions: number;
  windowPrs: number | null;
  windowIssues: number | null;
}

export interface YearRange {
  alias: string;
  from: string;
  to: string;
}

export function yearRanges(createdAt: Date, now: Date): YearRange[] {
  const first = createdAt.getUTCFullYear();
  const last = Math.max(first, now.getUTCFullYear());

  return Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index;
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    return {
      alias: `y${year}`,
      from: new Date(Date.UTC(year, 0, 1)).toISOString(),
      to: (year === last && now < yearEnd ? now : yearEnd).toISOString(),
    };
  });
}

export function buildAllCommitsQuery(ranges: YearRange[]): string {
  const aliases = ranges.map(
    ({ alias, from, to }) =>
      `${alias}: contributionsCollection(from: "${from}", to: "${to}") { ${CONTRIBUTION_FIELDS} }`,
  );
  return `
    query CommitsAll($login: String!) {
      user(login: $login) {
        ${aliases.join("\n")}
      }
    }
  `;
}

function sum(collections: Contributions[]) {
  return collections.reduce(
    (total, entry) => ({
      visibleCommits: total.visibleCommits + entry.totalCommitContributions,
      restricted: total.restricted + entry.restrictedContributionsCount,
      prContributions:
        total.prContributions + entry.totalPullRequestContributions,
      issueContributions:
        total.issueContributions + entry.totalIssueContributions,
    }),
    {
      visibleCommits: 0,
      restricted: 0,
      prContributions: 0,
      issueContributions: 0,
    },
  );
}

export async function fetchCommitInputs(
  client: GraphQLClient,
  username: string,
  { window, createdAt, now }: CommitInputsOptions,
): Promise<CommitInputs> {
  if (window === "all") {
    const response = await client.query(
      buildAllCommitsQuery(yearRanges(createdAt, now)),
      { login: username },
      AllResponseSchema,
    );
    return {
      ...sum(Object.values(response.user)),
      windowPrs: null,
      windowIssues: null,
    };
  }

  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const response = await client.query(
    YEAR_QUERY,
    {
      login: username,
      prQuery: `author:${username} is:pr created:>=${since}`,
      issueQuery: `author:${username} is:issue created:>=${since}`,
    },
    YearResponseSchema,
  );
  return {
    ...sum([response.user.contributionsCollection]),
    windowPrs: response.prs.issueCount,
    windowIssues: response.issues.issueCount,
  };
}
