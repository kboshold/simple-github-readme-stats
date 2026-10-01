import { describe, expect, it } from "vitest";
import { mocha } from "../../src/config/index.ts";
import { type CardInput, renderCard } from "../../src/render/svg/card.ts";

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

  it("appends card final-state css inside the reduced-motion block", () => {
    const svg = renderCard(input({ reducedMotionCss: ".x { opacity: 1; }" }));
    const block = svg.slice(
      svg.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(block).toMatch(
      /\.stagger \{\s*opacity: 1;\s*\}\s*\.x \{ opacity: 1; \}\s*\}/,
    );
  });
});
