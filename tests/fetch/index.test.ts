import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config/load.ts";
import { fetchSnapshot } from "../../src/fetch/index.ts";
import { snapshotSchema } from "../../src/fetch/snapshot.ts";

const config = resolveConfig(
  {
    username: "octocat",
    orgs: ["acme"],
    excludeRepos: ["octocat/hidden-project"],
    gist: { id: "0123456789abcdef0123456789abcdef" },
  },
  {},
);

const userData = {
  user: {
    login: "octocat",
    name: "The Octocat",
    createdAt: "2025-03-01T00:00:00Z",
    followers: { totalCount: 22 },
    pullRequests: { totalCount: 40 },
    openIssues: { totalCount: 4 },
    closedIssues: { totalCount: 6 },
    contributionsCollection: { totalPullRequestReviewContributions: 3 },
    repositoriesContributedTo: { totalCount: 5 },
  },
};

function collection(commits: number, restricted: number) {
  return {
    totalCommitContributions: commits,
    restrictedContributionsCount: restricted,
    totalPullRequestContributions: 15,
    totalIssueContributions: 4,
  };
}

function repo(nameWithOwner: string, stars: number, isFork = false) {
  return {
    nameWithOwner,
    isFork,
    owner: { login: nameWithOwner.split("/")[0] },
    stargazers: { totalCount: stars },
    languages: {
      edges: [{ size: 100, node: { name: "TypeScript", color: "#3178c6" } }],
    },
  };
}

const responses: Record<string, unknown> = {
  User: userData,
  CommitsAll: {
    user: { y2025: collection(100, 50), y2026: collection(200, 30) },
  },
  Repos: {
    user: {
      repositories: {
        nodes: [
          repo("octocat/site", 10),
          repo("octocat/forked", 1, true),
          repo("octocat/hidden-project", 500),
          repo("Acme/secret-service", 7),
          repo("stranger/popular", 9000),
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  },
};

const fakeFetch: typeof fetch = async (_input, init) => {
  const operation = /query (\w+)/.exec(String(init?.body))?.[1] ?? "";
  return new Response(JSON.stringify({ data: responses[operation] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

describe("fetchSnapshot", () => {
  it("combines the queries into a valid, name-free snapshot", async () => {
    const snapshot = await fetchSnapshot(config, "token", {
      fetch: fakeFetch,
      now: new Date("2026-09-30T12:00:00Z"),
    });

    expect(snapshotSchema.parse(snapshot)).toEqual({
      schemaVersion: 1,
      fetchedAt: "2026-09-30T12:00:00.000Z",
      user: { login: "octocat", name: "The Octocat", followers: 22 },
      totals: {
        stars: 18,
        commits: 300 + (80 - 10 - 2),
        prs: 40,
        issues: 10,
        reviews: 3,
        contributedTo: 5,
      },
      languages: [{ name: "TypeScript", color: "3178c6", bytes: 200 }],
    });

    const serialized = JSON.stringify(snapshot).toLowerCase();
    for (const name of ["site", "hidden-project", "secret-service", "acme"]) {
      expect(serialized).not.toContain(name);
    }
  });
});
