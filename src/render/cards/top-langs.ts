import type { Config, Theme, TopLangsCardOptions } from "../../config/index.ts";
import type { LanguageStat, Snapshot } from "../../fetch/snapshot.ts";
import {
  BOLD_CSS,
  hex,
  renderCard,
  STAGGER_CSS,
  statCss,
} from "../svg/card.ts";
import { escapeXml, formatPercent, truncate } from "../svg/format.ts";

export interface ShownLanguage {
  name: string;
  color: string;
  percent: number;
}

const DEFAULT_COLOR = "858585";
const MIN_ROW_HEIGHT = 25;
const BASE_LIST_Y = 25;
const BASE_BAR_HEIGHT = 8;
const BASE_TEXT_SIZE = 11;
const CHROME_HEIGHT = 90;
const MIN_COLUMN_X = 150;
const FIRST_ROW_DELAY_MS = 450;
const ROW_DELAY_STEP_MS = 150;
const MIN_SEGMENT_WIDTH = 10;
const TITLE_CHAR_WIDTH_PX = 11;
const CARD_PADDING_X = 25;
const DEFAULT_TITLE = "Most Used Languages";

export function selectLanguages(
  languages: LanguageStat[],
  options: Pick<TopLangsCardOptions, "hide" | "count">,
): ShownLanguage[] {
  const hidden = new Set(options.hide.map((name) => name.toLowerCase()));
  const shown = languages
    .filter((language) => !hidden.has(language.name.toLowerCase()))
    .slice(0, options.count);
  const total = shown.reduce((sum, language) => sum + language.bytes, 0);
  return shown.map((language) => ({
    name: language.name,
    color: language.color ?? DEFAULT_COLOR,
    percent: total === 0 ? 0 : (language.bytes / total) * 100,
  }));
}

export interface ListLayout {
  textSize: number;
  dotRadius: number;
  dotY: number;
  textX: number;
  textY: number;
  charWidth: number;
  barHeight: number;
  barRadius: number;
  listY: number;
  rowHeight: number;
  height: number;
  percentGap: number;
}

function scale(textSize: number, base: number): number {
  return Math.round((textSize * base) / BASE_TEXT_SIZE);
}

export function listLayout(
  options: Pick<TopLangsCardOptions, "textSize" | "height" | "percentGap">,
  languageCount: number,
): ListLayout {
  const { textSize } = options;
  const dotRadius = scale(textSize, 5);
  const barHeight = Math.max(BASE_BAR_HEIGHT, scale(textSize, BASE_BAR_HEIGHT));
  const listY = Math.round((BASE_LIST_Y * barHeight) / BASE_BAR_HEIGHT);
  const rows = Math.ceil(languageCount / 2);
  const fixed = CHROME_HEIGHT + listY - BASE_LIST_Y;
  const height = Math.max(fixed + MIN_ROW_HEIGHT * rows, options.height ?? 0);
  const rowHeight =
    rows === 0
      ? MIN_ROW_HEIGHT
      : Math.max(MIN_ROW_HEIGHT, Math.floor((height - fixed) / rows));
  return {
    textSize,
    dotRadius,
    dotY: scale(textSize, 6),
    textX: 2 * dotRadius + 5,
    textY: scale(textSize, 10),
    charWidth: (textSize * 6) / BASE_TEXT_SIZE,
    barHeight,
    barRadius: Math.round((barHeight * 5) / BASE_BAR_HEIGHT),
    listY,
    rowHeight,
    height,
    percentGap: options.percentGap,
  };
}

function css(theme: Theme, barWidth: number, textSize: number): string {
  return `@keyframes slideInAnimation {
  from {
    width: 0;
  }
  to {
    width: ${barWidth}px;
  }
}
@keyframes growWidthAnimation {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
${statCss(theme)}
${BOLD_CSS}
.lang-name {
  font: 400 ${textSize}px "Segoe UI", Ubuntu, Sans-Serif;
  fill: ${hex(theme.text)};
}
${STAGGER_CSS}
#rect-mask rect{
  animation: slideInAnimation 1s ease-in-out forwards;
}
.lang-progress{
  animation: growWidthAnimation 0.6s ease-in-out forwards;
}`;
}

function renderBar(
  languages: ShownLanguage[],
  barWidth: number,
  layout: ListLayout,
): string {
  let offset = 0;
  const segments = languages.map((language) => {
    const width = Number.parseFloat(
      ((language.percent / 100) * barWidth).toFixed(2),
    );
    const shownWidth =
      width < MIN_SEGMENT_WIDTH ? width + MIN_SEGMENT_WIDTH : width;
    const segment = `<rect
  mask="url(#rect-mask)"
  data-testid="lang-progress"
  x="${offset}"
  y="0"
  width="${shownWidth}"
  height="${layout.barHeight}"
  fill="${hex(language.color)}"
/>`;
    offset += width;
    return segment;
  });
  return `<mask id="rect-mask">
  <rect x="0" y="0" width="${barWidth}" height="${layout.barHeight}" fill="white" rx="${layout.barRadius}"/>
</mask>
${segments.join("\n")}`;
}

export function columnOffset(cardWidth: number): number {
  return Math.max(
    MIN_COLUMN_X,
    Math.round((cardWidth - 2 * CARD_PADDING_X) / 2),
  );
}

function columnTextWidths(cardWidth: number, textX: number): [number, number] {
  const offset = columnOffset(cardWidth);
  return [offset - textX, cardWidth - 2 * CARD_PADDING_X - offset - textX];
}

function renderItem(
  language: ShownLanguage,
  index: number,
  textWidthPx: number,
  layout: ListLayout,
): string {
  const delay = FIRST_ROW_DELAY_MS + index * ROW_DELAY_STEP_MS;
  const percent = `${formatPercent(language.percent)}%`;
  const gap = layout.percentGap;
  const nameChars =
    Math.floor((textWidthPx - gap) / layout.charWidth) - percent.length - 1;
  const name = escapeXml(truncate(language.name, Math.max(1, nameChars)));
  const label =
    gap === 0
      ? `${name} ${percent}`
      : `${name} <tspan dx="${gap}">${percent}</tspan>`;
  const { dotRadius: r } = layout;
  return `<g transform="translate(0, ${index * layout.rowHeight})">
  <g class="stagger" style="animation-delay: ${delay}ms">
    <circle cx="${r}" cy="${layout.dotY}" r="${r}" fill="${hex(language.color)}" />
    <text data-testid="lang-name" x="${layout.textX}" y="${layout.textY}" class="lang-name">${label}</text>
  </g>
</g>`;
}

function renderList(
  languages: ShownLanguage[],
  cardWidth: number,
  layout: ListLayout,
): string {
  const widths = columnTextWidths(cardWidth, layout.textX);
  const offset = columnOffset(cardWidth);
  const split = Math.ceil(languages.length / 2);
  const columns = [languages.slice(0, split), languages.slice(split)]
    .filter((column) => column.length > 0)
    .map(
      (column, index) =>
        `<g transform="translate(${index * offset}, 0)">${column.map((language, row) => renderItem(language, row, widths[index] ?? 0, layout)).join("")}</g>`,
    );
  return `<g transform="translate(0, ${layout.listY})">
${columns.join("")}
</g>`;
}

export function renderTopLangsCard(
  snapshot: Snapshot,
  config: Config,
  theme: Theme,
): string {
  const options = config.cards.topLangs;
  const languages = selectLanguages(snapshot.languages, options);
  const barWidth = options.width - 50;
  const fullTitle = options.title ?? DEFAULT_TITLE;
  const title = truncate(fullTitle, Math.floor(barWidth / TITLE_CHAR_WIDTH_PX));
  const layout = listLayout(options, languages.length);
  const list = languages
    .map((language) => `${language.name} ${formatPercent(language.percent)}%`)
    .join(", ");
  const body =
    languages.length === 0
      ? '<text x="25" y="11" class="stat bold" data-testid="no-languages">No languages found</text>'
      : `<svg data-testid="lang-items" x="25">
${renderBar(languages, barWidth, layout)}
${renderList(languages, options.width, layout)}
</svg>`;

  return renderCard({
    width: options.width,
    height: layout.height,
    title,
    a11yTitle: fullTitle,
    a11yDesc: languages.length === 0 ? "No languages found" : list,
    theme,
    css: css(theme, barWidth, layout.textSize),
    body,
  });
}
