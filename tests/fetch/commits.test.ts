import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { GraphQLClient } from "../../src/fetch/client.ts";
import {
  buildAllCommitsQuery,
  fetchCommitInputs,
  yearRanges,
} from "../../src/fetch/queries/commits.ts";

const createdAt = new Date("2024-05-17T10:30:00Z");
const now = new Date("2026-09-30T12:00:00Z");

function collection(
  commits: number,
  restricted: number,
  prs: number,
  issues: number,
) {
  return {
    totalCommitContributions: commits,
    restrictedContributionsCount: restricted,
    totalPullRequestContributions: prs,
    totalIssueContributions: issues,
  };
}

function fakeClient(response: unknown) {
  const calls: { document: string; variables: Record<string, unknown> }[] = [];
  const client: GraphQLClient = {
    async query<T>(
      document: string,
      variables: Record<string, unknown>,
      schema: z.ZodType<T>,
    ) {
      calls.push({ document, variables });
      return schema.parse(response);
    },
  };
  return { client, calls };
}

describe("yearRanges", () => {
  it("creates one UTC range per calendar year and ends the last one at now", () => {
    expect(yearRanges(createdAt, now)).toEqual([
      {
        alias: "y2024",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
      },
      {
        alias: "y2025",
        from: "2025-01-01T00:00:00.000Z",
        to: "2025-12-31T23:59:59.000Z",
      },
      {
        alias: "y2026",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-09-30T12:00:00.000Z",
      },
    ]);
  });

  it("creates a single range for an account created this year", () => {
    expect(yearRanges(new Date("2026-02-01T00:00:00Z"), now)).toHaveLength(1);
  });
});

describe("buildAllCommitsQuery", () => {
  it("emits one aliased contributionsCollection per range", () => {
    const document = buildAllCommitsQuery(yearRanges(createdAt, now));

    expect(document.match(/contributionsCollection\(/g)).toHaveLength(3);
    expect(document).toContain(
      'y2026: contributionsCollection(from: "2026-01-01T00:00:00.000Z", to: "2026-09-30T12:00:00.000Z")',
    );
  });
});

describe("fetchCommitInputs", () => {
  it("sums all yearly aliases in one request for window all", async () => {
    const { client, calls } = fakeClient({
      user: {
        y2024: collection(100, 10, 5, 2),
        y2025: collection(200, 20, 6, 3),
        y2026: collection(300, 30, 7, 4),
      },
    });

    const inputs = await fetchCommitInputs(client, "octocat", {
      window: "all",
      createdAt,
      now,
    });

    expect(inputs).toEqual({
      visibleCommits: 600,
      restricted: 60,
      prContributions: 18,
      issueContributions: 9,
      windowPrs: null,
      windowIssues: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables).toEqual({ login: "octocat" });
    expect(calls[0]?.document).not.toContain("search(");
  });

  it("uses the default collection and two searches for window year", async () => {
    const { client, calls } = fakeClient({
      user: { contributionsCollection: collection(444, 5905, 40, 12) },
      prs: { issueCount: 754 },
      issues: { issueCount: 290 },
    });

    const inputs = await fetchCommitInputs(client, "octocat", {
      window: "year",
      createdAt,
      now,
    });

    expect(inputs).toEqual({
      visibleCommits: 444,
      restricted: 5905,
      prContributions: 40,
      issueContributions: 12,
      windowPrs: 754,
      windowIssues: 290,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables).toEqual({
      login: "octocat",
      prQuery: "author:octocat is:pr created:>=2025-09-30",
      issueQuery: "author:octocat is:issue created:>=2025-09-30",
    });
    expect(calls[0]?.document).toContain("contributionsCollection {");
  });
});
