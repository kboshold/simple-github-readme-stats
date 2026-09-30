import type { Config, Theme } from "../config/index.ts";
import type { Snapshot } from "../fetch/snapshot.ts";
import { CARD_NAMES, type CardName } from "./card-names.ts";
import { renderStatsCard } from "./cards/stats.ts";
import { renderTopLangsCard } from "./cards/top-langs.ts";

export interface OutputFile {
  name: string;
  content: string;
}

interface CardRenderer {
  name: CardName;
  enabled: (config: Config) => boolean;
  render: (snapshot: Snapshot, config: Config, theme: Theme) => string;
}

const CARDS: Record<CardName, CardRenderer> = {
  stats: {
    name: "stats",
    enabled: (config) => config.cards.stats.enabled,
    render: renderStatsCard,
  },
  "top-langs": {
    name: "top-langs",
    enabled: (config) => config.cards.topLangs.enabled,
    render: renderTopLangsCard,
  },
};

export function renderAll(snapshot: Snapshot, config: Config): OutputFile[] {
  return CARD_NAMES.map((name) => CARDS[name])
    .filter((card) => card.enabled(config))
    .flatMap((card) =>
      Object.entries(config.themes).map(([themeKey, theme]) => ({
        name: `${card.name}-${themeKey}.svg`,
        content: card.render(snapshot, config, theme),
      })),
    );
}
