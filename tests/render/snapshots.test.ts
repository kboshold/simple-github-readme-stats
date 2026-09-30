import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../../src/config/schema.ts";
import { readSnapshot } from "../../src/fetch/snapshot.ts";
import { renderAll } from "../../src/render/index.ts";

const config = ConfigSchema.parse({
  username: "octocat",
  gist: { id: "a".repeat(32) },
  cards: { topLangs: { hide: ["html", "scss", "css"] } },
});

const FIXTURES = {
  main: "fixtures/data.json",
  zeros: "tests/fixtures/zeros.json",
  "long-name": "tests/fixtures/long-name.json",
  "one-language": "tests/fixtures/one-language.json",
  "no-color": "tests/fixtures/no-color.json",
};

describe.each(Object.entries(FIXTURES))("fixture %s", (fixture, path) => {
  it("renders every card and theme", async () => {
    const files = renderAll(await readSnapshot(path), config);
    expect(files.map((file) => file.name)).toEqual([
      "stats-dark.svg",
      "stats-light.svg",
      "top-langs-dark.svg",
      "top-langs-light.svg",
    ]);
    for (const file of files) {
      await expect(file.content).toMatchFileSnapshot(
        `__snapshots__/${fixture}/${file.name}`,
      );
    }
  });
});

describe("equal size layout", () => {
  it("renders top-langs at 437x195", async () => {
    const snapshot = await readSnapshot(FIXTURES.main);
    const equal = ConfigSchema.parse({
      username: "octocat",
      gist: { id: "a".repeat(32) },
      themes: { dark: config.themes.dark },
      cards: {
        stats: { enabled: false },
        topLangs: {
          width: 437,
          height: 195,
          textSize: 13,
          percentGap: 8,
          hide: ["html", "scss", "css"],
        },
      },
    });
    const [file] = renderAll(snapshot, equal);
    expect(file?.name).toBe("top-langs-dark.svg");
    expect(file?.content).toContain('viewBox="0 0 437 195"');
    await expect(file?.content).toMatchFileSnapshot(
      "__snapshots__/equal-size/top-langs-dark.svg",
    );
  });
});

describe("renderAll", () => {
  it("is byte-identical across renders", async () => {
    const snapshot = await readSnapshot(FIXTURES.main);
    expect(renderAll(snapshot, config)).toEqual(renderAll(snapshot, config));
  });

  it("skips disabled cards", async () => {
    const snapshot = await readSnapshot(FIXTURES.main);
    const partial = ConfigSchema.parse({
      username: "octocat",
      gist: { id: "a".repeat(32) },
      themes: { dark: config.themes.dark },
      cards: { stats: { enabled: false } },
    });
    expect(renderAll(snapshot, partial).map((file) => file.name)).toEqual([
      "top-langs-dark.svg",
    ]);
  });
});
