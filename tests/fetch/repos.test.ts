import { describe, expect, it } from "vitest";
import { fetchRepo, fetchRepos } from "../../src/fetch/queries/repos.ts";
import { captureError, fakeClient } from "../helpers.ts";

function page(nodes: unknown[], endCursor: string | null) {
  return {
    user: {
      repositories: {
        nodes,
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
      },
    },
  };
}

function repo(name: string) {
  return {
    nameWithOwner: `octocat/${name}`,
    isFork: false,
    owner: { login: "octocat" },
    stargazers: { totalCount: 3 },
    languages: {
      edges: [{ size: 120, node: { name: "TypeScript", color: "#3178c6" } }],
    },
  };
}

describe("fetchRepos", () => {
  it("maps null language edges to an empty list", async () => {
    const { client } = fakeClient(() =>
      page([{ ...repo("one"), languages: { edges: null } }], null),
    );

    const [first] = await fetchRepos(client, "octocat");

    expect(first?.languages).toEqual([]);
  });

  it("follows the cursor and maps nodes", async () => {
    const { client, calls } = fakeClient((call) =>
      call === 1
        ? page([repo("one"), null], "cursor-1")
        : page([{ ...repo("two"), isFork: true, languages: null }], null),
    );

    const repos = await fetchRepos(client, "octocat");

    expect(repos).toEqual([
      {
        nameWithOwner: "octocat/one",
        ownerLogin: "octocat",
        isFork: false,
        stars: 3,
        languages: [{ name: "TypeScript", color: "#3178c6", size: 120 }],
      },
      {
        nameWithOwner: "octocat/two",
        ownerLogin: "octocat",
        isFork: true,
        stars: 3,
        languages: [],
      },
    ]);
    expect(calls.map((call) => call.variables)).toEqual([
      { login: "octocat", after: null },
      { login: "octocat", after: "cursor-1" },
    ]);
  });

  it("stops after 20 pages", async () => {
    const { client, calls } = fakeClient((call) =>
      page([repo(`r${call}`)], `cursor-${call}`),
    );

    await expect(fetchRepos(client, "octocat")).rejects.toMatchObject({
      code: "API_ERROR",
    });
    expect(calls).toHaveLength(20);
  });
});

describe("fetchRepo", () => {
  it("queries by owner and name and maps the node", async () => {
    const { client, calls } = fakeClient(() => ({
      repository: {
        ...repo("tool.kit"),
        nameWithOwner: "Acme/tool.kit",
        owner: { login: "Acme" },
      },
    }));

    const node = await fetchRepo(client, "acme/tool.kit");

    expect(node).toEqual({
      nameWithOwner: "Acme/tool.kit",
      ownerLogin: "Acme",
      isFork: false,
      stars: 3,
      languages: [{ name: "TypeScript", color: "#3178c6", size: 120 }],
    });
    expect(calls.map((call) => call.variables)).toEqual([
      { owner: "acme", name: "tool.kit" },
    ]);
  });

  it.each([
    ["missing", { repository: null }],
    ["renamed", { repository: repo("new-name") }],
  ])("throws REPO_NOT_FOUND without the name when %s", async (_, response) => {
    const { client } = fakeClient(() => response);

    const error = await captureError(fetchRepo(client, "octocat/old-name"));

    expect(error.code).toBe("REPO_NOT_FOUND");
    expect(error.message).not.toContain("old-name");
  });
});
