import { describe, expect, it } from "vitest";
import { type ConfigInput, mocha } from "../../src/config/index.ts";
import { ConfigSchema } from "../../src/config/schema.ts";
import type { Snapshot } from "../../src/fetch/snapshot.ts";
import { renderStatsCard } from "../../src/render/cards/stats.ts";

const RANK_A_RING_OFFSET = 44.290542282932826;

function snapshot(overrides: Partial<Snapshot["user"]> = {}): Snapshot {
  return {
    schemaVersion: 1,
    fetchedAt: "2026-09-30T00:00:00.000Z",
    user: {
      login: "kboshold",
      name: "Kevin Boshold",
      followers: 22,
      ...overrides,
    },
    totals: {
      stars: 61,
      commits: 4528,
      prs: 754,
      issues: 290,
      reviews: 50,
      contributedTo: 51,
    },
    languages: [],
  };
}

function config(overrides: Partial<ConfigInput> = {}) {
  return ConfigSchema.parse({
    username: "kboshold",
    gist: { id: "a".repeat(32) },
    commitsWindow: "year",
    ...overrides,
  });
}

function render(overrides: Partial<ConfigInput> = {}, snap = snapshot()) {
  return renderStatsCard(snap, config(overrides), mocha);
}

function rowCount(svg: string): number {
  return svg.match(/class="stagger"/g)?.length ?? 0;
}

describe("renderStatsCard", () => {
  it("renders five rows by default", () => {
    expect(rowCount(render())).toBe(5);
  });

  it("uses custom title and login fallback", () => {
    expect(render({ cards: { stats: { title: "My <Stats>" } } })).toContain(
      'data-testid="header">My &lt;Stats&gt;<',
    );
    expect(render({}, snapshot({ name: null }))).toContain(
      'data-testid="header">kboshold&#39;s GitHub Stats<',
    );
  });

  it("labels commits by window", () => {
    expect(render({ commitsWindow: "year" })).toContain(
      ">Total Commits (last year):<",
    );
    expect(render({ commitsWindow: "all" })).toContain(">Total Commits:<");
  });

  it("drops hidden rows and shrinks height", () => {
    const svg = render({
      cards: { stats: { hide: ["prs", "issues"], hideRank: true } },
    });
    expect(rowCount(svg)).toBe(3);
    expect(svg).not.toContain('data-testid="prs"');
    expect(svg).toContain('height="145"');
    expect(svg).toContain(
      '<desc id="descId">Total Stars Earned: 61, Total Commits (last year): 4528, Contributed to (last year): 51</desc>',
    );
  });

  it("keeps min height 150 while the ring is shown", () => {
    expect(
      render({ cards: { stats: { hide: ["prs", "issues", "stars"] } } }),
    ).toContain('height="150"');
  });

  it("omits the ring with hideRank", () => {
    const svg = render({ cards: { stats: { hideRank: true } } });
    expect(svg).not.toContain("rank-circle");
    expect(svg).not.toContain("rankAnimation");
    expect(svg).toContain(
      '<title id="titleId">Kevin Boshold&#39;s GitHub Stats</title>',
    );
    expect(
      svg.slice(svg.indexOf("@media (prefers-reduced-motion: reduce)")),
    ).not.toMatch(/\.rank-text/);
  });

  it("omits icons with showIcons false", () => {
    const svg = render({ cards: { stats: { showIcons: false } } });
    expect(svg).not.toContain('class="icon"');
    expect(svg).not.toContain('x="25" y="12.5"');
  });

  it("animates the ring to the rank offset and keeps it for reduced motion", () => {
    const svg = render();
    const to = svg.match(/to \{\s*stroke-dashoffset: ([\d.]+);/)?.[1];
    expect(Number(to)).toBeCloseTo(RANK_A_RING_OFFSET, 2);
    expect(svg).toContain(`stroke-dashoffset: ${2 * Math.PI * 40};`);
    const rule = svg.match(/\.rank-circle \{[^}]*\}/)?.[0] ?? "";
    const base = rule.match(/stroke-dashoffset: ([\d.]+);/)?.[1];
    expect(Number(base)).toBeCloseTo(RANK_A_RING_OFFSET, 2);
    expect(rule).toContain("animation: rankAnimation 1s forwards ease-in-out;");
    expect(
      svg.slice(svg.indexOf("@media (prefers-reduced-motion: reduce)")),
    ).toMatch(/\.rank-text \{\s*transform: translate\(-5px, 5px\);\s*\}/);
  });

  it("treats height as a minimum and keeps the computed height when larger", () => {
    expect(render({ cards: { stats: { height: 150 } } })).toContain(
      'height="195"',
    );
    const padded = render({ cards: { stats: { height: 260 } } });
    expect(padded).toContain('height="260"');
    expect(padded).toContain('viewBox="0 0 437 260"');
    expect(padded).toContain('transform="translate(367, 47.5)"');
  });
});
