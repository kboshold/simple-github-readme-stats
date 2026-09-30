import { describe, expect, it } from "vitest";
import { type ConfigInput, mocha } from "../../src/config/index.ts";
import { ConfigSchema } from "../../src/config/schema.ts";
import type { LanguageStat, Snapshot } from "../../src/fetch/snapshot.ts";
import {
  columnOffset,
  listLayout,
  renderTopLangsCard,
  selectLanguages,
} from "../../src/render/cards/top-langs.ts";

const REFERENCE: LanguageStat[] = [
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

function names(svg: string): string[] {
  return [...svg.matchAll(/data-testid="lang-name"[^>]*>([^<]*)</g)].map(
    (m) => m[1] ?? "",
  );
}

describe("selectLanguages", () => {
  it("hides case-insensitively and takes count", () => {
    const shown = selectLanguages(REFERENCE, {
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
    expect(selectLanguages(REFERENCE, { hide: [], count: 3 })).toHaveLength(3);
  });

  it("computes shares among shown languages summing to 100", () => {
    const shown = selectLanguages(REFERENCE, {
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

  it("uses the default color for null", () => {
    expect(
      selectLanguages([{ name: "X", color: null, bytes: 1 }], {
        hide: [],
        count: 8,
      })[0]?.color,
    ).toBe("858585");
  });
});

describe("renderTopLangsCard", () => {
  it("matches the reference list, order and bar", () => {
    const svg = render(REFERENCE);
    expect(names(svg)).toEqual([
      "TypeScript 54.94%",
      "Vue 12.94%",
      "Shell 8.52%",
      "Nix 7.01%",
      "Lua 5.44%",
      "Python 5.27%",
      "Astro 3.00%",
      "Kotlin 2.89%",
    ]);
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="190"');
    expect(svg).toContain(
      '<rect x="0" y="0" width="270" height="8" fill="white" rx="5"/>',
    );
    expect(svg).toContain('width="148.34"');
    expect(svg).toContain('x="262.21000000000004"');
    expect(svg).toContain('width="17.8"');
    expect(svg).toContain('<g transform="translate(150, 0)">');
    expect(svg).toContain("width: 270px;");
    expect(svg).not.toContain("calc(");
  });

  it("fills title and desc", () => {
    const svg = render(REFERENCE);
    expect(svg).toContain('<title id="titleId">Most Used Languages</title>');
    expect(svg).toMatch(
      /<desc id="descId">TypeScript 54\.94%, Vue 12\.94%, .*Kotlin 2\.89%<\/desc>/,
    );
  });

  it("renders one language", () => {
    const svg = render([{ name: "Go", color: null, bytes: 10 }]);
    expect(names(svg)).toEqual(["Go 100.00%"]);
    expect(svg).toContain('fill="#858585"');
    expect(svg).toContain('height="115"');
  });

  it("renders an empty list", () => {
    const svg = render([]);
    expect(svg).toContain("No languages found");
    expect(svg).toContain('height="90"');
    expect(svg).not.toContain('lang-progress"');
  });

  it("truncates long names per column but keeps them in desc", () => {
    const long = "Microsoft Developer Studio Project";
    const svg = render([
      { name: long, color: "000000", bytes: 60 },
      { name: long, color: "000000", bytes: 40 },
    ]);
    expect(names(svg)).toEqual(["Microsoft Deve… 60.00%", "Microsoft… 40.00%"]);
    expect(svg).toContain(
      `<desc id="descId">${long} 60.00%, ${long} 40.00%</desc>`,
    );
  });

  it("does not truncate the reference names", () => {
    for (const name of names(render(REFERENCE)))
      expect(name).not.toContain("…");
  });

  it("escapes language names", () => {
    expect(render([{ name: "F<#>", color: "000000", bytes: 1 }])).toContain(
      "F&lt;#&gt; 100.00%",
    );
  });

  it("treats height as a minimum and pads below the content", () => {
    expect(
      render(REFERENCE, {
        cards: { topLangs: { hide: ["html", "scss", "css"], height: 150 } },
      }),
    ).toContain('height="190"');
    const padded = render(REFERENCE, {
      cards: { topLangs: { hide: ["html", "scss", "css"], height: 300 } },
    });
    expect(padded).toContain('viewBox="0 0 320 300"');
    expect(padded).toContain(
      '<g data-testid="main-card-body" transform="translate(0, 55)">',
    );
  });

  it("scales the second column with the card width", () => {
    expect(columnOffset(320)).toBe(150);
    expect(columnOffset(300)).toBe(150);
    expect(columnOffset(437)).toBe(194);
    const svg = render(REFERENCE, {
      cards: { topLangs: { hide: ["html", "scss", "css"], width: 437 } },
    });
    expect(svg).toContain('<g transform="translate(194, 0)">');
  });

  it("truncates second-column names against the scaled offset", () => {
    const long = "Microsoft Developer Studio Project";
    const svg = render(
      [
        { name: long, color: "000000", bytes: 60 },
        { name: long, color: "000000", bytes: 40 },
      ],
      { cards: { topLangs: { width: 437 } } },
    );
    expect(names(svg)).toEqual([
      "Microsoft Developer S… 60.00%",
      "Microsoft Developer S… 40.00%",
    ]);
  });

  it("keeps the default text layout at textSize 11", () => {
    const svg = render(REFERENCE);
    expect(svg).toContain('font: 400 11px "Segoe UI", Ubuntu, Sans-Serif;');
    expect(svg).toContain('<circle cx="5" cy="6" r="5"');
    expect(svg).toContain('x="15" y="10" class="lang-name"');
  });

  it("scales dot, text, bar and list offset with textSize", () => {
    const svg = render(REFERENCE, {
      cards: {
        topLangs: { hide: ["html", "scss", "css"], width: 437, textSize: 13 },
      },
    });
    expect(svg).toContain('font: 400 13px "Segoe UI", Ubuntu, Sans-Serif;');
    expect(svg).toContain('<circle cx="6" cy="7" r="6"');
    expect(svg).toContain('x="17" y="12" class="lang-name"');
    expect(svg).toContain('height="9" fill="white" rx="6"/>');
    expect(svg).toContain('<g transform="translate(0, 28)">');
    expect(svg).toContain('viewBox="0 0 437 193"');
  });

  it("truncates with the scaled character width", () => {
    const long = "Microsoft Developer Studio Project";
    const svg = render(
      [
        { name: long, color: "000000", bytes: 60 },
        { name: long, color: "000000", bytes: 40 },
      ],
      { cards: { topLangs: { width: 437, textSize: 16 } } },
    );
    expect(names(svg)).toEqual(["Microsoft De… 60.00%", "Microsoft D… 40.00%"]);
  });

  it("omits the tspan without a percent gap", () => {
    const svg = render(REFERENCE);
    expect(svg).not.toContain("<tspan");
    expect(svg).toContain('class="lang-name">TypeScript 54.94%</text>');
  });

  it("offsets the percentage by the gap", () => {
    const svg = render(REFERENCE, {
      cards: { topLangs: { hide: ["html", "scss", "css"], percentGap: 8 } },
    });
    expect(svg).toContain(
      'class="lang-name">TypeScript <tspan dx="8">54.94%</tspan></text>',
    );
  });

  it("subtracts the gap from the space for the name", () => {
    const long = "Microsoft Developer Studio Project";
    const langs = [
      { name: long, color: "000000", bytes: 60 },
      { name: long, color: "000000", bytes: 40 },
    ];
    const svg = render(langs, { cards: { topLangs: { percentGap: 12 } } });
    expect(svg).toContain(
      'class="lang-name">Microsoft De… <tspan dx="12">60.00%</tspan>',
    );
    expect(svg).toContain(
      'class="lang-name">Microso… <tspan dx="12">40.00%</tspan>',
    );
  });

  it("keeps the gap-only output without a separator", () => {
    const svg = render(REFERENCE, {
      cards: { topLangs: { hide: ["html", "scss", "css"], percentGap: 8 } },
    });
    expect(svg).not.toContain("lang-sep");
    expect(svg).toContain(
      'class="lang-name">TypeScript <tspan dx="8">54.94%</tspan></text>',
    );
  });

  it("centers the separator in the gap", () => {
    const svg = render(REFERENCE, {
      cards: {
        topLangs: {
          hide: ["html", "scss", "css"],
          percentGap: 10,
          percentSeparator: "•",
        },
      },
    });
    expect(svg).toContain(
      'class="lang-name">TypeScript <tspan dx="5" class="lang-sep">•</tspan> <tspan dx="5">54.94%</tspan></text>',
    );
    expect(svg).toMatch(/\.lang-sep \{\s*fill-opacity: 0\.5;\s*\}/);
  });

  it("escapes the separator", () => {
    const svg = render(REFERENCE, {
      cards: { topLangs: { percentSeparator: "<&" } },
    });
    expect(svg).toContain('class="lang-sep">&lt;&amp;</tspan>');
  });

  it("leaves room for the separator when truncating", () => {
    const long = "Microsoft Developer Studio Project";
    const svg = render(
      [
        { name: long, color: "000000", bytes: 60 },
        { name: long, color: "000000", bytes: 40 },
      ],
      { cards: { topLangs: { percentGap: 12, percentSeparator: "•" } } },
    );
    expect(svg).toContain('class="lang-name">Microsoft … <tspan');
    expect(svg).toContain('class="lang-name">Micro… <tspan');
  });
});

describe("listLayout", () => {
  it("keeps 25px rows at the computed height", () => {
    expect(listLayout({ textSize: 11, percentGap: 0 }, 8)).toMatchObject({
      rowHeight: 25,
      listY: 25,
      height: 190,
    });
    expect(listLayout({ textSize: 11, percentGap: 0 }, 0)).toMatchObject({
      rowHeight: 25,
      height: 90,
    });
  });

  it("spreads rows over a larger minimum height", () => {
    expect(
      listLayout({ textSize: 11, height: 195, percentGap: 0 }, 8),
    ).toMatchObject({
      rowHeight: 26,
      height: 195,
    });
    expect(
      listLayout({ textSize: 11, height: 300, percentGap: 0 }, 7),
    ).toMatchObject({
      rowHeight: 52,
      height: 300,
    });
    expect(
      listLayout({ textSize: 13, height: 195, percentGap: 0 }, 8),
    ).toMatchObject({
      rowHeight: 25,
      listY: 28,
      height: 195,
    });
  });

  it("never lets rows shrink below 25px", () => {
    expect(
      listLayout({ textSize: 11, height: 150, percentGap: 0 }, 10).rowHeight,
    ).toBe(25);
  });
});
