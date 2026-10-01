import { describe, expect, it } from "vitest";
import { type ConfigInput, mocha } from "../../src/config/index.ts";
import { ConfigSchema } from "../../src/config/schema.ts";
import type { LanguageStat, Snapshot } from "../../src/fetch/snapshot.ts";
import {
  listLayout,
  renderTopLangsCard,
  selectLanguages,
} from "../../src/render/cards/top-langs.ts";

const LANGUAGES: LanguageStat[] = [
  { name: "TypeScript", color: "3178c6", bytes: 1973074 },
  { name: "HTML", color: "e34c26", bytes: 501855 },
  { name: "Vue", color: "41b883", bytes: 464812 },
  { name: "Shell", color: "89e051", bytes: 305858 },
  { name: "Nix", color: "7e7eff", bytes: 251700 },
  { name: "SCSS", color: "c6538c", bytes: 200000 },
  { name: "Lua", color: "000080", bytes: 195357 },
  { name: "Python", color: "3572A5", bytes: 189116 },
  { name: "CSS", color: "663399", bytes: 150000 },
  { name: "Astro", color: "ff5a03", bytes: 107576 },
  { name: "Kotlin", color: "A97BFF", bytes: 103688 },
  { name: "Go", color: "00ADD8", bytes: 50000 },
];

function snapshot(languages: LanguageStat[]): Snapshot {
  return {
    schemaVersion: 1,
    fetchedAt: "2026-09-30T00:00:00.000Z",
    user: { login: "kboshold", name: "Kevin Boshold", followers: 22 },
    totals: {
      stars: 0,
      commits: 0,
      prs: 0,
      issues: 0,
      reviews: 0,
      contributedTo: 0,
    },
    languages,
  };
}

function render(
  languages: LanguageStat[],
  overrides: Partial<ConfigInput> = {},
) {
  const config = ConfigSchema.parse({
    username: "kboshold",
    gist: { id: "a".repeat(32) },
    cards: { topLangs: { hide: ["html", "scss", "css"] } },
    ...overrides,
  });
  return renderTopLangsCard(snapshot(languages), config, mocha);
}

const LONG = "Microsoft Developer Studio Project";

function names(svg: string): string[] {
  return [...svg.matchAll(/data-testid="lang-name"[^>]*>(.*?)<\/text>/g)].map(
    (m) => (m[1] ?? "").replace(/<[^>]*>/g, ""),
  );
}

describe("selectLanguages", () => {
  it("hides case-insensitively and takes count", () => {
    const shown = selectLanguages(LANGUAGES, {
      hide: ["HTML", "scss", "Css"],
      count: 8,
    });
    expect(shown.map((l) => l.name)).toEqual([
      "TypeScript",
      "Vue",
      "Shell",
      "Nix",
      "Lua",
      "Python",
      "Astro",
      "Kotlin",
    ]);
    expect(selectLanguages(LANGUAGES, { hide: [], count: 3 })).toHaveLength(3);
  });

  it("computes shares among shown languages summing to 100", () => {
    const shown = selectLanguages(LANGUAGES, {
      hide: ["html", "scss", "css"],
      count: 8,
    });
    expect(shown[0]?.percent.toFixed(2)).toBe("54.94");
    const rounded = shown.reduce(
      (sum, l) => sum + Number(l.percent.toFixed(2)),
      0,
    );
    expect(Math.abs(rounded - 100)).toBeLessThanOrEqual(0.05);
  });
});

describe("renderTopLangsCard", () => {
  it("renders shown languages in order", () => {
    expect(names(render(LANGUAGES))).toEqual([
      "TypeScript 54.94%",
      "Vue 12.94%",
      "Shell 8.52%",
      "Nix 7.01%",
      "Lua 5.44%",
      "Python 5.27%",
      "Astro 3.00%",
      "Kotlin 2.89%",
    ]);
  });

  it.each([
    { topLangs: {}, expected: ["Microsoft Deve… 60.00%", "Microsoft… 40.00%"] },
    {
      topLangs: { width: 437 },
      expected: [
        "Microsoft Developer S… 60.00%",
        "Microsoft Developer S… 40.00%",
      ],
    },
    {
      topLangs: { width: 437, textSize: 16 },
      expected: ["Microsoft De… 60.00%", "Microsoft D… 40.00%"],
    },
    {
      topLangs: { percentGap: 12 },
      expected: ["Microsoft De… 60.00%", "Microso… 40.00%"],
    },
    {
      topLangs: { percentGap: 12, percentSeparator: "•" },
      expected: ["Microsoft… • 60.00%", "Micro… • 40.00%"],
    },
  ])("truncates long names with $topLangs", ({ topLangs, expected }) => {
    const svg = render(
      [
        { name: LONG, color: "000000", bytes: 60 },
        { name: LONG, color: "000000", bytes: 40 },
      ],
      { cards: { topLangs } },
    );
    expect(names(svg)).toEqual(expected);
    expect(svg).toContain(
      `<desc id="descId">${LONG} 60.00%, ${LONG} 40.00%</desc>`,
    );
  });

  it("escapes language names", () => {
    expect(render([{ name: "F<#>", color: "000000", bytes: 1 }])).toContain(
      "F&lt;#&gt; 100.00%",
    );
  });

  it("treats height as a minimum and pads below the content", () => {
    expect(
      render(LANGUAGES, {
        cards: { topLangs: { hide: ["html", "scss", "css"], height: 150 } },
      }),
    ).toContain('height="190"');
    const padded = render(LANGUAGES, {
      cards: { topLangs: { hide: ["html", "scss", "css"], height: 300 } },
    });
    expect(padded).toContain('viewBox="0 0 320 300"');
    expect(padded).toContain(
      '<g data-testid="main-card-body" transform="translate(0, 55)">',
    );
  });

  it("scales the second column with the card width", () => {
    const svg = render(LANGUAGES, {
      cards: { topLangs: { hide: ["html", "scss", "css"], width: 437 } },
    });
    expect(svg).toContain('<g transform="translate(194, 0)">');
  });

  it("offsets the percentage by the gap", () => {
    const svg = render(LANGUAGES, {
      cards: { topLangs: { hide: ["html", "scss", "css"], percentGap: 8 } },
    });
    expect(svg).not.toContain("lang-sep");
    expect(svg).toContain(
      'class="lang-name">TypeScript <tspan dx="8">54.94%</tspan></text>',
    );
  });

  it("escapes the separator", () => {
    const svg = render(LANGUAGES, {
      cards: { topLangs: { percentSeparator: "<&" } },
    });
    expect(svg).toContain('class="lang-sep">&lt;&amp;</tspan>');
  });
});

describe("listLayout", () => {
  it.each([
    {
      options: { textSize: 11 },
      count: 8,
      expected: { rowHeight: 25, listY: 25, height: 190 },
    },
    {
      options: { textSize: 11 },
      count: 0,
      expected: { rowHeight: 25, height: 90 },
    },
    {
      options: { textSize: 11, height: 195 },
      count: 8,
      expected: { rowHeight: 26, height: 195 },
    },
    {
      options: { textSize: 11, height: 300 },
      count: 7,
      expected: { rowHeight: 52, height: 300 },
    },
    {
      options: { textSize: 13, height: 195 },
      count: 8,
      expected: { rowHeight: 25, listY: 28, height: 195 },
    },
    {
      options: { textSize: 16, height: 150 },
      count: 8,
      expected: { rowHeight: 25, listY: 38, height: 203 },
    },
    {
      options: { textSize: 11, height: 150 },
      count: 10,
      expected: { rowHeight: 25 },
    },
  ])("lays out $count rows with $options", ({ options, count, expected }) => {
    expect(listLayout({ ...options, percentGap: 0 }, count)).toMatchObject(
      expected,
    );
  });
});
