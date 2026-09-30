import type { Theme } from "../../config/index.ts";
import { escapeXml } from "./format.ts";

export const FONT_STACK = "'Segoe UI', Ubuntu, Sans-Serif";

export interface CardInput {
  width: number;
  height: number;
  title: string;
  a11yTitle: string;
  a11yDesc: string;
  theme: Theme;
  css: string;
  body: string;
  reducedMotionCss?: string;
}

export function hex(color: string): string {
  return `#${color}`;
}

export function statCss(theme: Theme): string {
  return `.stat {
  font: 600 14px 'Segoe UI', Ubuntu, "Helvetica Neue", Sans-Serif; fill: ${hex(theme.text)};
}
@supports(-moz-appearance: auto) {
  /* Selector detects Firefox */
  .stat { font-size:12px; }
}`;
}

export const STAGGER_CSS = `.stagger {
  opacity: 0;
  animation: fadeInAnimation 0.3s ease-in-out forwards;
}`;

export const BOLD_CSS = ".bold { font-weight: 700 }";

export function iconCss(theme: Theme): string {
  return `.icon {
  fill: ${hex(theme.icon)};
  display: block;
}`;
}

function headerCss(theme: Theme): string {
  return `.header {
  font: 600 18px ${FONT_STACK};
  fill: ${hex(theme.title)};
  animation: fadeInAnimation 0.8s ease-in-out forwards;
}
@supports(-moz-appearance: auto) {
  /* Selector detects Firefox */
  .header { font-size: 15.5px; }
}`;
}

const ANIMATION_CSS = `/* Animations */
@keyframes scaleInAnimation {
  from {
    transform: translate(-5px, 5px) scale(0);
  }
  to {
    transform: translate(-5px, 5px) scale(1);
  }
}
@keyframes fadeInAnimation {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}`;

// Contract: card CSS must set final animated values (e.g. ring stroke-dashoffset) as base styles;
// final states that differ from the base style go into `reducedMotionCss`.
function reducedMotionCss(extra: string): string {
  const rules = [
    "* {\n  animation: none !important;\n}",
    ".stagger {\n  opacity: 1;\n}",
  ];
  if (extra.trim() !== "") rules.push(extra.trim());
  return `@media (prefers-reduced-motion: reduce) {\n${indent(rules.join("\n"), 2)}\n}`;
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}

export function renderCard(input: CardInput): string {
  const { width, height, theme } = input;
  const style = [
    headerCss(theme),
    input.css.trim(),
    ANIMATION_CSS,
    reducedMotionCss(input.reducedMotionCss ?? ""),
  ]
    .filter((block) => block !== "")
    .join("\n");

  return `<svg
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="titleId descId"
>
  <title id="titleId">${escapeXml(input.a11yTitle)}</title>
  <desc id="descId">${escapeXml(input.a11yDesc)}</desc>
  <style>
${indent(style, 4)}
  </style>

  <rect
    data-testid="card-bg"
    x="0.5"
    y="0.5"
    rx="4.5"
    height="99%"
    stroke="${hex(theme.border)}"
    width="${width - 1}"
    fill="${hex(theme.background)}"
    stroke-opacity="1"
  />

  <g data-testid="card-title" transform="translate(25, 35)">
    <g transform="translate(0, 0)">
      <text x="0" y="0" class="header" data-testid="header">${escapeXml(input.title)}</text>
    </g>
  </g>

  <g data-testid="main-card-body" transform="translate(0, 55)">
${indent(input.body.trim(), 4)}
  </g>
</svg>
`;
}
