import { describe, expect, it } from "vitest";
import { aggregateRepos, estimateCommits } from "../../src/fetch/aggregate.ts";
import type { CommitInputs } from "../../src/fetch/queries/commits.ts";
import type { RepoNode } from "../../src/fetch/queries/repos.ts";

const filter = { username: "octocat", orgs: [], excludeRepos: [] };

function repo(
  nameWithOwner: string,
  overrides: Partial<RepoNode> = {},
): RepoNode {
  return {
    nameWithOwner,
    ownerLogin: nameWithOwner.split("/")[0] ?? "",
    isFork: false,
    stars: 1,
    languages: [],
    ...overrides,
  };
}

function inputs(overrides: Partial<CommitInputs> = {}): CommitInputs {
  return {
    visibleCommits: 3063,
    restricted: 8059,
    prContributions: 95,
    issueContributions: 67,
    windowPrs: null,
    windowIssues: null,
    ...overrides,
  };
}

describe("aggregateRepos", () => {
  it("counts only repositories owned by the user", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/a", { stars: 5 }),
        repo("OctoCat/b", { stars: 2 }),
        repo("stranger/c", { stars: 1000 }),
      ],
      filter,
    );

    expect(totals.stars).toBe(7);
  });

  it("counts allowlisted organizations case-insensitively", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/a", { stars: 5 }),
        repo("Acme/tool", { stars: 10 }),
        repo("globex/tool", { stars: 100 }),
      ],
      { ...filter, orgs: ["acme"] },
    );

    expect(totals.stars).toBe(15);
  });

  it("drops excluded repositories case-insensitively", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/a", { stars: 5 }),
        repo("octocat/Secret", {
          stars: 3,
          languages: [{ name: "Go", color: "#00ADD8", size: 900 }],
        }),
      ],
      { ...filter, excludeRepos: ["OCTOCAT/secret"] },
    );

    expect(totals).toEqual({ stars: 5, languages: [] });
  });

  it("counts a duplicated repository once", () => {
    const duplicate = repo("octocat/a", {
      stars: 5,
      languages: [{ name: "Go", color: "#00ADD8", size: 100 }],
    });

    const totals = aggregateRepos(
      [duplicate, { ...duplicate, nameWithOwner: "Octocat/A" }],
      filter,
    );

    expect(totals).toEqual({
      stars: 5,
      languages: [{ name: "Go", color: "00ADD8", bytes: 100 }],
    });
  });

  it("counts forks for stars but not for languages", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/own", {
          stars: 60,
          languages: [{ name: "TypeScript", color: "#3178c6", size: 500 }],
        }),
        repo("octocat/fork", {
          stars: 1,
          isFork: true,
          languages: [{ name: "C", color: "#555555", size: 99999 }],
        }),
      ],
      filter,
    );

    expect(totals).toEqual({
      stars: 61,
      languages: [{ name: "TypeScript", color: "3178c6", bytes: 500 }],
    });
  });

  it("sums languages across repositories sorted by bytes descending", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/a", {
          languages: [
            { name: "Vue", color: "#41b883", size: 300 },
            { name: "TypeScript", color: "#3178c6", size: 200 },
          ],
        }),
        repo("octocat/b", {
          languages: [
            { name: "TypeScript", color: "#3178c6", size: 250 },
            { name: "Shell", color: "#89e051", size: 10 },
          ],
        }),
      ],
      filter,
    );

    expect(totals.languages).toEqual([
      { name: "TypeScript", color: "3178c6", bytes: 450 },
      { name: "Vue", color: "41b883", bytes: 300 },
      { name: "Shell", color: "89e051", bytes: 10 },
    ]);
  });

  it("keeps null colors and normalizes the others to 6 hex digits", () => {
    const totals = aggregateRepos(
      [
        repo("octocat/a", {
          languages: [
            { name: "Mystery", color: null, size: 30 },
            { name: "Short", color: "#fa0", size: 20 },
            { name: "Broken", color: "red", size: 10 },
          ],
        }),
      ],
      filter,
    );

    expect(totals.languages).toEqual([
      { name: "Mystery", color: null, bytes: 30 },
      { name: "Short", color: "ffaa00", bytes: 20 },
      { name: "Broken", color: null, bytes: 10 },
    ]);
  });

  it("returns zero totals for an empty list", () => {
    expect(aggregateRepos([], filter)).toEqual({ stars: 0, languages: [] });
  });
});

describe("estimateCommits", () => {
  it("matches the reference values", () => {
    expect(estimateCommits(inputs(), { prs: 754, issues: 290 })).toBe(10240);
  });

  it("uses the window counts instead of the totals when present", () => {
    const year = inputs({
      visibleCommits: 444,
      restricted: 5905,
      prContributions: 62,
      issueContributions: 3,
      windowPrs: 582,
      windowIssues: 184,
    });

    expect(estimateCommits(year, { prs: 754, issues: 290 })).toBe(
      444 + 5905 - 520 - 181,
    );
  });

  it("clamps negative private PR and issue counts to zero", () => {
    const visibleOnly = inputs({
      restricted: 100,
      prContributions: 900,
      issueContributions: 900,
    });

    expect(estimateCommits(visibleOnly, { prs: 754, issues: 290 })).toBe(3163);
  });

  it("clamps the private commit estimate to zero", () => {
    expect(
      estimateCommits(inputs({ restricted: 50 }), { prs: 754, issues: 290 }),
    ).toBe(3063);
  });
});
