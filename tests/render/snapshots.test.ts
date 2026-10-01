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
  main: {
    path: "fixtures/data.json",
    files: [
      "stats-dark.svg",
      "stats-light.svg",
      "top-langs-dark.svg",
      "top-langs-light.svg",
    ],
  },
  zeros: {
    path: "tests/fixtures/zeros.json",
    files: ["stats-dark.svg", "top-langs-dark.svg"],
  },
  "long-name": {
    path: "tests/fixtures/long-name.json",
    files: ["stats-dark.svg"],
  },
  "one-language": {
    path: "tests/fixtures/one-language.json",
    files: ["top-langs-dark.svg"],
  },
  "no-color": {
    path: "tests/fixtures/no-color.json",
    files: ["top-langs-dark.svg"],
  },
};

const FORBIDDEN = [
  /<script/i,
  /<foreignObject/i,
  /<image/i,
  /@import/i,
  /href=/i,
  /url\((?!#)/i,
];

const equalSizeConfig = ConfigSchema.parse({
  username: "octocat",
  gist: { id: "a".repeat(32) },
  themes: { dark: config.themes.dark },
  cards: {
    stats: { enabled: false },
    topLangs: {
      width: 437,
      height: 195,
      textSize: 13,
      percentGap: 10,
      percentSeparator: "•",
      hide: ["html", "scss", "css"],
    },
  },
});

describe.each(Object.entries(FIXTURES))(
  "fixture %s",
  (fixture, { path, files }) => {
    it("matches the snapshots", async () => {
      const rendered = renderAll(await readSnapshot(path), config);
      for (const name of files) {
        const file = rendered.find((output) => output.name === name);
        await expect(file?.content).toMatchFileSnapshot(
          `__snapshots__/${fixture}/${name}`,
        );
      }
    });
  },
);

describe("equal size layout", () => {
  it("renders top-langs at 437x195", async () => {
    const snapshot = await readSnapshot(FIXTURES.main.path);
    const [file] = renderAll(snapshot, equalSizeConfig);
    expect(file?.name).toBe("top-langs-dark.svg");
    await expect(file?.content).toMatchFileSnapshot(
      "__snapshots__/equal-size/top-langs-dark.svg",
    );
  });
});

describe("renderAll", () => {
  it("uses no scripts or external resources", async () => {
    const outputs = [];
    for (const { path } of Object.values(FIXTURES)) {
      const snapshot = await readSnapshot(path);
      outputs.push(
        ...renderAll(snapshot, config),
        ...renderAll(snapshot, equalSizeConfig),
      );
    }
    for (const { content } of outputs) {
      for (const pattern of FORBIDDEN) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it("skips disabled cards", async () => {
    const snapshot = await readSnapshot(FIXTURES.main.path);
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
