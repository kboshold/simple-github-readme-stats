import type { Config, Theme } from "../../config/index.ts";
import type { Snapshot } from "../../fetch/snapshot.ts";
import { calculateRank, type RankResult } from "../rank.ts";
import {
  BOLD_CSS,
  FONT_STACK,
  hex,
  iconCss,
  renderCard,
  STAGGER_CSS,
  statTextCss,
} from "../svg/card.ts";
import { escapeXml, formatCount, truncate } from "../svg/format.ts";
import { type IconName, renderIcon } from "../svg/icons.ts";

type StatKey = Config["cards"]["stats"]["hide"][number];

interface StatRow {
  key: StatKey;
  icon: IconName;
  testId: string;
  label: string;
  value: number;
}

const ROW_HEIGHT = 25;
const FIRST_ROW_DELAY_MS = 450;
const ROW_DELAY_STEP_MS = 150;
const VALUE_X_WITH_ICONS = 219.01;
const VALUE_X_WITHOUT_ICONS = 199.01;
const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TITLE_CHAR_WIDTH_PX = 11;
const RANK_TEXT_FINAL_CSS = `.rank-text {
  transform: translate(-5px, 5px);
}`;
const TITLE_SUFFIX = "'s GitHub Stats";

function buildRows(snapshot: Snapshot, config: Config): StatRow[] {
  const { totals } = snapshot;
  const commitsLabel =
    config.commitsWindow === "year"
      ? "Total Commits (last year)"
      : "Total Commits";
  const rows: StatRow[] = [
    {
      key: "stars",
      icon: "star",
      testId: "stars",
      label: "Total Stars Earned",
      value: totals.stars,
    },
    {
      key: "commits",
      icon: "commits",
      testId: "commits",
      label: commitsLabel,
      value: totals.commits,
    },
    {
      key: "prs",
      icon: "prs",
      testId: "prs",
      label: "Total PRs",
      value: totals.prs,
    },
    {
      key: "issues",
      icon: "issues",
      testId: "issues",
      label: "Total Issues",
      value: totals.issues,
    },
    {
      key: "contributedTo",
      icon: "contribs",
      testId: "contribs",
      label: "Contributed to (last year)",
      value: totals.contributedTo,
    },
  ];
  const hidden = new Set(config.cards.stats.hide);
  return rows.filter((row) => !hidden.has(row.key));
}

function displayName(snapshot: Snapshot): string {
  return snapshot.user.name ?? snapshot.user.login;
}

function buildTitle(snapshot: Snapshot, config: Config): string {
  const maxChars = Math.floor(
    (config.cards.stats.width - 50) / TITLE_CHAR_WIDTH_PX,
  );
  const custom = config.cards.stats.title;
  if (custom !== undefined) return truncate(custom, maxChars);
  return `${truncate(displayName(snapshot), maxChars - TITLE_SUFFIX.length)}${TITLE_SUFFIX}`;
}

function renderRow(row: StatRow, index: number, showIcons: boolean): string {
  const delay = FIRST_ROW_DELAY_MS + index * ROW_DELAY_STEP_MS;
  const icon = showIcons
    ? `\n    ${renderIcon(row.icon).replaceAll("\n", "\n    ")}`
    : "";
  const labelX = showIcons ? ' x="25"' : "";
  const valueX = showIcons ? VALUE_X_WITH_ICONS : VALUE_X_WITHOUT_ICONS;
  return `<g transform="translate(0, ${index * ROW_HEIGHT})">
  <g class="stagger" style="animation-delay: ${delay}ms" transform="translate(25, 0)">${icon}
    <text class="stat bold"${labelX} y="12.5">${escapeXml(row.label)}:</text>
    <text
      class="stat bold"
      x="${valueX}"
      y="12.5"
      data-testid="${row.testId}"
    >${formatCount(row.value)}</text>
  </g>
</g>`;
}

function renderRing(rank: RankResult, width: number): string {
  return `<g data-testid="rank-circle" transform="translate(${width - 70}, 47.5)">
  <circle class="rank-circle-rim" cx="-10" cy="8" r="${RING_RADIUS}" />
  <circle class="rank-circle" cx="-10" cy="8" r="${RING_RADIUS}" />
  <g class="rank-text">
    <text x="-5" y="3" alignment-baseline="central" dominant-baseline="central" text-anchor="middle" data-testid="level-rank-icon">${rank.level}</text>
  </g>
</g>`;
}

function ringOffset(percentile: number): number {
  return (percentile / 100) * RING_CIRCUMFERENCE;
}

function statsCss(theme: Theme, rank: RankResult | null): string {
  const blocks = [
    statTextCss(theme),
    STAGGER_CSS,
    `.rank-text {
  font: 800 24px ${FONT_STACK}; fill: ${hex(theme.text)};
  animation: scaleInAnimation 0.3s ease-in-out forwards;
}`,
    BOLD_CSS,
    iconCss(theme),
  ];
  if (rank !== null) {
    const offset = ringOffset(rank.percentile);
    blocks.push(`.rank-circle-rim {
  stroke: ${hex(theme.ring)};
  fill: none;
  stroke-width: 6;
  opacity: 0.2;
}
.rank-circle {
  stroke: ${hex(theme.ring)};
  stroke-dasharray: 250;
  stroke-dashoffset: ${offset};
  fill: none;
  stroke-width: 6;
  stroke-linecap: round;
  opacity: 0.8;
  transform-origin: -10px 8px;
  transform: rotate(-90deg);
  animation: rankAnimation 1s forwards ease-in-out;
}

@keyframes rankAnimation {
  from {
    stroke-dashoffset: ${RING_CIRCUMFERENCE};
  }
  to {
    stroke-dashoffset: ${offset};
  }
}`);
  }
  return blocks.join("\n");
}

export function renderStatsCard(
  snapshot: Snapshot,
  config: Config,
  theme: Theme,
): string {
  const options = config.cards.stats;
  const rows = buildRows(snapshot, config);
  const { totals } = snapshot;
  const shownRank = options.hideRank
    ? null
    : calculateRank({
        commits: totals.commits,
        prs: totals.prs,
        issues: totals.issues,
        reviews: totals.reviews,
        stars: totals.stars,
        followers: snapshot.user.followers,
        allCommits: config.commitsWindow === "all",
      });
  const height = Math.max(
    45 + (rows.length + 1) * ROW_HEIGHT,
    shownRank === null ? 0 : 150,
    options.height ?? 0,
  );
  const title = buildTitle(snapshot, config);
  const fullTitle = options.title ?? `${displayName(snapshot)}${TITLE_SUFFIX}`;
  const rowsSvg = rows
    .map((row, index) => renderRow(row, index, options.showIcons))
    .join("");
  const body = [
    shownRank === null ? "" : renderRing(shownRank, options.width),
    `<svg x="0" y="0">\n${rowsSvg}\n</svg>`,
  ]
    .filter((part) => part !== "")
    .join("\n");

  return renderCard({
    width: options.width,
    height,
    title,
    a11yTitle:
      shownRank === null ? fullTitle : `${fullTitle}, Rank: ${shownRank.level}`,
    a11yDesc: rows.map((row) => `${row.label}: ${row.value}`).join(", "),
    theme,
    css: statsCss(theme, shownRank),
    body,
    reducedMotionCss: shownRank === null ? undefined : RANK_TEXT_FINAL_CSS,
  });
}
