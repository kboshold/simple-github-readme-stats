import { describe, expect, it } from "vitest";
import { defineConfig, latte, mocha } from "../src/config/index.ts";
import { loadConfig, resolveConfig } from "../src/config/load.ts";
import { StatsError } from "../src/errors.ts";

const minimal = defineConfig({
  username: "octocat",
  gist: { id: "0123456789abcdef0123456789abcdef" },
});

function captureError(run: () => unknown): StatsError {
  try {
    run();
  } catch (error) {
    if (error instanceof StatsError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a StatsError");
}

describe("resolveConfig", () => {
  it("applies all defaults", () => {
    expect(resolveConfig(minimal, {})).toEqual({
      username: "octocat",
      orgs: [],
      excludeRepos: [],
      commitsWindow: "all",
      gist: { id: "0123456789abcdef0123456789abcdef" },
      themes: { dark: mocha, light: latte },
      cards: {
        stats: {
          enabled: true,
          width: 437,
          showIcons: true,
          hide: [],
          hideRank: false,
        },
        topLangs: {
          enabled: true,
          width: 320,
          textSize: 11,
          percentGap: 0,
          count: 8,
          hide: [],
        },
      },
    });
  });

  it("rejects an invalid color and names the field", () => {
    const error = captureError(() =>
      resolveConfig(
        { ...minimal, themes: { dark: { ...mocha, title: "#cba6f7" } } },
        {},
      ),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("themes.dark.title");
  });

  it("accepts 8 digit colors", () => {
    const config = resolveConfig(
      { ...minimal, themes: { dark: { ...mocha, border: "45475a80" } } },
      {},
    );

    expect(config.themes.dark?.border).toBe("45475a80");
  });

  it("rejects an invalid username", () => {
    const error = captureError(() =>
      resolveConfig({ ...minimal, username: "not a login" }, {}),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("username");
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

  it("rejects empty themes and invalid theme keys", () => {
    expect(
      captureError(() => resolveConfig({ ...minimal, themes: {} }, {})).message,
    ).toContain("themes");
    expect(
      captureError(() =>
        resolveConfig({ ...minimal, themes: { Dark_Mode: mocha } }, {}),
      ).message,
    ).toContain("themes.Dark_Mode");
  });

  it("rejects a stats width below 420 while the rank ring is shown", () => {
    const error = captureError(() =>
      resolveConfig({ ...minimal, cards: { stats: { width: 400 } } }, {}),
    );

    expect(error.code).toBe("CONFIG_INVALID");
    expect(error.message).toContain("cards.stats.width");
  });

  it("accepts a stats width below 420 when the rank ring is hidden", () => {
    const config = resolveConfig(
      { ...minimal, cards: { stats: { width: 400, hideRank: true } } },
      {},
    );

    expect(config.cards.stats.width).toBe(400);
  });

  it("rejects widths outside 300-600", () => {
    expect(
      captureError(() =>
        resolveConfig({ ...minimal, cards: { topLangs: { width: 299 } } }, {}),
      ).message,
    ).toContain("cards.topLangs.width");
    expect(
      captureError(() =>
        resolveConfig({ ...minimal, cards: { stats: { width: 601 } } }, {}),
      ).message,
    ).toContain("cards.stats.width");
  });

  it("accepts card heights from 150 to 400 and leaves them unset by default", () => {
    expect(resolveConfig(minimal, {}).cards.topLangs.height).toBeUndefined();
    const config = resolveConfig(
      {
        ...minimal,
        cards: { stats: { height: 150 }, topLangs: { height: 400 } },
      },
      {},
    );
    expect(config.cards.stats.height).toBe(150);
    expect(config.cards.topLangs.height).toBe(400);
  });

  it("rejects card heights outside 150-400 or not integers", () => {
    expect(
      captureError(() =>
        resolveConfig({ ...minimal, cards: { stats: { height: 149 } } }, {}),
      ).message,
    ).toContain("cards.stats.height");
    expect(
      captureError(() =>
        resolveConfig({ ...minimal, cards: { topLangs: { height: 401 } } }, {}),
      ).message,
    ).toContain("cards.topLangs.height");
    expect(
      captureError(() =>
        resolveConfig(
          { ...minimal, cards: { topLangs: { height: 200.5 } } },
          {},
        ),
      ).message,
    ).toContain("cards.topLangs.height");
  });

  it("accepts textSize from 10 to 16 and rejects other values", () => {
    for (const textSize of [10, 16]) {
      expect(
        resolveConfig({ ...minimal, cards: { topLangs: { textSize } } }, {})
          .cards.topLangs.textSize,
      ).toBe(textSize);
    }
    for (const textSize of [9, 17, 12.5]) {
      expect(
        captureError(() =>
          resolveConfig({ ...minimal, cards: { topLangs: { textSize } } }, {}),
        ).message,
      ).toContain("cards.topLangs.textSize");
    }
  });

  it("accepts percentGap from 0 to 40 and rejects other values", () => {
    for (const percentGap of [0, 40]) {
      expect(
        resolveConfig({ ...minimal, cards: { topLangs: { percentGap } } }, {})
          .cards.topLangs.percentGap,
      ).toBe(percentGap);
    }
    for (const percentGap of [-1, 41, 2.5]) {
      expect(
        captureError(() =>
          resolveConfig(
            { ...minimal, cards: { topLangs: { percentGap } } },
            {},
          ),
        ).message,
      ).toContain("cards.topLangs.percentGap");
    }
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

    expect(config.username).toBe("kboshold");
    expect(config.orgs).toEqual(["acme"]);
  });
});
