import { describe, expect, it } from "vitest";
import { mocha } from "../../src/config/index.ts";
import { type CardInput, renderCard } from "../../src/render/svg/card.ts";
import { ICON_PATHS, renderIcon } from "../../src/render/svg/icons.ts";

function input(overrides: Partial<CardInput> = {}): CardInput {
  return {
    width: 437,
    height: 195,
    title: "Kevin's GitHub Stats",
    a11yTitle: "Kevin's GitHub Stats, Rank: A",
    a11yDesc: "Total Stars Earned: 61",
    theme: mocha,
    css: ".extra { fill: red; }",
    body: '<g class="stagger"></g>',
    ...overrides,
  };
}

describe("renderCard", () => {
  it("escapes title and accessibility texts", () => {
    const svg = renderCard(
      input({ title: "<&>", a11yTitle: "a<b", a11yDesc: 'x & "y"' }),
    );
    expect(svg).toContain('data-testid="header">&lt;&amp;&gt;</text>');
    expect(svg).toContain('<title id="titleId">a&lt;b</title>');
    expect(svg).toContain('<desc id="descId">x &amp; &quot;y&quot;</desc>');
    expect(svg).not.toContain("<&>");
  });

  it("has role, title, desc and aria-labelledby", () => {
    const svg = renderCard(input());
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-labelledby="titleId descId"');
    expect(svg).toMatch(/<title id="titleId">[^<]+<\/title>/);
    expect(svg).toMatch(/<desc id="descId">[^<]+<\/desc>/);
  });

  it("emits frame geometry and #-prefixed theme colors", () => {
    const svg = renderCard(input());
    expect(svg).toContain('viewBox="0 0 437 195"');
    expect(svg).toContain('width="436"');
    expect(svg).toContain('rx="4.5"');
    expect(svg).toContain('stroke="#45475a"');
    expect(svg).toContain('fill="#1e1e2e00"');
    expect(svg).toContain("fill: #cba6f7;");
    expect(svg).toContain('transform="translate(25, 35)"');
    expect(svg).toContain('transform="translate(0, 55)"');
  });

  it("includes base css, card css, keyframes and Firefox override", () => {
    const svg = renderCard(input());
    expect(svg).toContain("font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif;");
    expect(svg).toContain("@supports(-moz-appearance: auto)");
    expect(svg).toContain("@keyframes fadeInAnimation");
    expect(svg).toContain("@keyframes scaleInAnimation");
    expect(svg).toContain(".extra { fill: red; }");
    expect(svg).toContain('<g class="stagger"></g>');
  });

  it("disables animations and shows final state with reduced motion", () => {
    const svg = renderCard(input());
    const block = svg.slice(
      svg.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(block).toMatch(/animation: none !important;/);
    expect(block).toMatch(/\.stagger \{\s*opacity: 1;\s*\}/);
    expect(block).not.toContain(".rank-text");
  });

  it("appends card final-state css inside the reduced-motion block", () => {
    const svg = renderCard(input({ reducedMotionCss: ".x { opacity: 1; }" }));
    const block = svg.slice(
      svg.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(block).toMatch(
      /\.stagger \{\s*opacity: 1;\s*\}\s*\.x \{ opacity: 1; \}\s*\}/,
    );
  });

  it("uses no scripts or external resources", () => {
    const svg = renderCard(input());
    for (const forbidden of [
      "<script",
      "<foreignObject",
      "<image",
      "@import",
      "url(",
      "href",
    ]) {
      expect(svg).not.toContain(forbidden);
    }
  });

  it("is deterministic", () => {
    expect(renderCard(input())).toBe(renderCard(input()));
  });
});

describe("icons", () => {
  it("exports the five 16px icons", () => {
    expect(Object.keys(ICON_PATHS)).toEqual([
      "star",
      "commits",
      "prs",
      "issues",
      "contribs",
    ]);
    expect(renderIcon("star")).toContain('width="16" height="16"');
    expect(renderIcon("star")).toContain(`d="${ICON_PATHS.star}"`);
  });
});
