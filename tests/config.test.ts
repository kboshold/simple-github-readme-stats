import { describe, expect, it } from "vitest";
import { type ConfigInput, defineConfig, mocha } from "../src/config/index.ts";
import { loadConfig, resolveConfig } from "../src/config/load.ts";
import { captureError } from "./helpers.ts";

const minimal = defineConfig({
  username: "octocat",
  gist: { id: "0123456789abcdef0123456789abcdef" },
});

describe("resolveConfig", () => {
  it.each<[string, Partial<ConfigInput>]>([
    ["themes.dark.title", { themes: { dark: { ...mocha, title: "#cba6f7" } } }],
    ["username", { username: "not a login" }],
    ["themes", { themes: {} }],
    ["themes.Dark_Mode", { themes: { Dark_Mode: mocha } }],
    ["cards.stats.width", { cards: { stats: { width: 400 } } }],
    ["cards.stats.width", { cards: { stats: { width: 601 } } }],
    ["cards.topLangs.width", { cards: { topLangs: { width: 299 } } }],
    ["cards.stats.height", { cards: { stats: { height: 149 } } }],
    ["cards.topLangs.height", { cards: { topLangs: { height: 401 } } }],
    ["cards.topLangs.height", { cards: { topLangs: { height: 200.5 } } }],
    ["cards.topLangs.textSize", { cards: { topLangs: { textSize: 9 } } }],
    ["cards.topLangs.textSize", { cards: { topLangs: { textSize: 17 } } }],
    ["cards.topLangs.textSize", { cards: { topLangs: { textSize: 12.5 } } }],
    ["cards.topLangs.percentGap", { cards: { topLangs: { percentGap: -1 } } }],
    ["cards.topLangs.percentGap", { cards: { topLangs: { percentGap: 41 } } }],
    ["cards.topLangs.percentGap", { cards: { topLangs: { percentGap: 2.5 } } }],
    [
      "cards.topLangs.percentSeparator",
      { cards: { topLangs: { percentSeparator: "----" } } },
    ],
    [
      "cards.topLangs.percentSeparator",
      { cards: { topLangs: { percentSeparator: "\n" } } },
    ],
    ["cards.topLangs.title", { cards: { topLangs: { title: "Langs\u0007" } } }],
    ["cards.stats.title", { cards: { stats: { title: "Stats\t" } } }],
  ])("rejects invalid %s", (path, input) => {
    const error = captureError(() =>
      resolveConfig({ ...minimal, ...input }, {}),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain(path);
  });

  it.each<Partial<ConfigInput>>([
    { themes: { dark: { ...mocha, border: "45475a80" } } },
    { cards: { stats: { width: 400, hideRank: true } } },
    {
      cards: {
        stats: { height: 150 },
        topLangs: { textSize: 10, percentGap: 0, percentSeparator: "" },
      },
    },
    {
      cards: {
        topLangs: {
          height: 400,
          textSize: 16,
          percentGap: 40,
          percentSeparator: "···",
        },
      },
    },
  ])("accepts %j", (input) => {
    expect(resolveConfig({ ...minimal, ...input }, {})).toMatchObject(input);
  });

  it("lists every invalid field", () => {
    const error = captureError(() =>
      resolveConfig(
        {
          username: "",
          gist: { id: "xyz" },
          excludeRepos: ["no-slash"],
          cards: { topLangs: { count: 21 } },
        },
        {},
      ),
    );

    expect(error.message).toContain("username");
    expect(error.message).toContain("gist.id");
    expect(error.message).toContain("excludeRepos.0");
    expect(error.message).toContain("cards.topLangs.count");
  });

  it("merges env lists, de-duplicated case-insensitively", () => {
    const config = resolveConfig(
      {
        ...minimal,
        orgs: ["Acme"],
        excludeRepos: ["octocat/secret"],
      },
      {
        STATS_ORGS: "acme, globex ,,initech",
        STATS_EXCLUDE_REPOS: "Octocat/Secret,acme/internal.tool",
      },
    );

    expect(config.orgs).toEqual(["Acme", "globex", "initech"]);
    expect(config.excludeRepos).toEqual([
      "octocat/secret",
      "acme/internal.tool",
    ]);
  });

  it("adds nothing for empty or unset env lists", () => {
    const base = { ...minimal, orgs: ["acme"] };

    for (const env of [
      {},
      { STATS_ORGS: "", STATS_EXCLUDE_REPOS: "" },
      { STATS_ORGS: " , ", STATS_EXCLUDE_REPOS: undefined },
    ]) {
      const config = resolveConfig(base, env);
      expect(config.orgs).toEqual(["acme"]);
      expect(config.excludeRepos).toEqual([]);
    }
  });

  it("rejects invalid env entries without echoing their value", () => {
    const error = captureError(() =>
      resolveConfig(minimal, {
        STATS_ORGS: "bad org",
        STATS_EXCLUDE_REPOS: "private-repo-name",
      }),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("STATS_ORGS.0");
    expect(error.message).toContain("STATS_EXCLUDE_REPOS.0");
    expect(error.message).not.toContain("private-repo-name");
  });
});

describe("loadConfig", () => {
  it("loads stats.config.ts and merges the env lists", async () => {
    const config = await loadConfig({ STATS_ORGS: "acme" });

    expect(config.orgs).toContain("acme");
  });
});
