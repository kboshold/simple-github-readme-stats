import { describe, expect, it } from "vitest";
import { type ConfigInput, mocha } from "../../src/config/index.ts";
import { ConfigSchema } from "../../src/config/schema.ts";
import type { LanguageStat, Snapshot } from "../../src/fetch/snapshot.ts";
import {
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
});
