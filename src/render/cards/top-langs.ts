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
const ROW_HEIGHT = 25;
const COLUMN_X = 150;
const FIRST_ROW_DELAY_MS = 450;
const ROW_DELAY_STEP_MS = 150;
const BAR_HEIGHT = 8;
const MIN_SEGMENT_WIDTH = 10;
const TITLE_CHAR_WIDTH_PX = 11;
const LANG_CHAR_WIDTH_PX = 6;
const CARD_PADDING_X = 25;
const TEXT_X = 15;
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

function css(theme: Theme, barWidth: number): string {
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
  font: 400 11px "Segoe UI", Ubuntu, Sans-Serif;
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

function renderBar(languages: ShownLanguage[], barWidth: number): string {
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
  height="${BAR_HEIGHT}"
  fill="${hex(language.color)}"
/>`;
    offset += width;
    return segment;
  });
  return `<mask id="rect-mask">
  <rect x="0" y="0" width="${barWidth}" height="${BAR_HEIGHT}" fill="white" rx="5"/>
</mask>
${segments.join("\n")}`;
}

function columnTextWidths(cardWidth: number): [number, number] {
  return [
    COLUMN_X - TEXT_X,
    cardWidth - 2 * CARD_PADDING_X - COLUMN_X - TEXT_X,
  ];
}

function renderItem(
  language: ShownLanguage,
  index: number,
  textWidthPx: number,
): string {
  const delay = FIRST_ROW_DELAY_MS + index * ROW_DELAY_STEP_MS;
  const percent = `${formatPercent(language.percent)}%`;
  const nameChars =
    Math.floor(textWidthPx / LANG_CHAR_WIDTH_PX) - percent.length - 1;
  const name = truncate(language.name, Math.max(1, nameChars));
  return `<g transform="translate(0, ${index * ROW_HEIGHT})">
  <g class="stagger" style="animation-delay: ${delay}ms">
    <circle cx="5" cy="6" r="5" fill="${hex(language.color)}" />
    <text data-testid="lang-name" x="15" y="10" class="lang-name">${escapeXml(name)} ${percent}</text>
  </g>
</g>`;
}

function renderList(languages: ShownLanguage[], cardWidth: number): string {
  const widths = columnTextWidths(cardWidth);
  const split = Math.ceil(languages.length / 2);
  const columns = [languages.slice(0, split), languages.slice(split)]
    .filter((column) => column.length > 0)
    .map(
      (column, index) =>
        `<g transform="translate(${index * COLUMN_X}, 0)">${column.map((language, row) => renderItem(language, row, widths[index] ?? 0)).join("")}</g>`,
    );
  return `<g transform="translate(0, 25)">
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
  const height = 90 + ROW_HEIGHT * Math.ceil(languages.length / 2);
  const list = languages
    .map((language) => `${language.name} ${formatPercent(language.percent)}%`)
    .join(", ");
  const body =
    languages.length === 0
      ? '<text x="25" y="11" class="stat bold" data-testid="no-languages">No languages found</text>'
      : `<svg data-testid="lang-items" x="25">
${renderBar(languages, barWidth)}
${renderList(languages, options.width)}
</svg>`;

  return renderCard({
    width: options.width,
    height,
    title,
    a11yTitle: fullTitle,
    a11yDesc: languages.length === 0 ? "No languages found" : list,
    theme,
    css: css(theme, barWidth),
    body,
  });
}
