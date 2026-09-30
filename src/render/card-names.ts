export const CARD_NAMES = ["stats", "top-langs"] as const;

export type CardName = (typeof CARD_NAMES)[number];
