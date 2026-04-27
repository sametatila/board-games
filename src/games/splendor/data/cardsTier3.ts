import type { Card, Gem } from "../types";

/**
 * Tier 3 development cards (20 cards) — resmi dağılım: her renk için 4
 * kart. Prestij 3–5. Maliyetler 9–14 arası. Tek-renk-7 kartı 4 prestij;
 * "5/3/3/3" 4 renkten 14 maliyet 3 prestij; "3/3/6/3" mavi/etc karışımı
 * 4 prestij; "3/7" iki renk 5 prestij.
 */

const c = (
  id: string,
  bonus: Gem,
  prestige: number,
  cost: Partial<Record<Gem, number>>,
): Card => ({
  id,
  tier: 3,
  bonus,
  prestige,
  cost: {
    white: cost.white ?? 0,
    blue: cost.blue ?? 0,
    green: cost.green ?? 0,
    red: cost.red ?? 0,
    black: cost.black ?? 0,
  },
});

export const CARDS_TIER_3: Card[] = [
  // White bonus
  c("t3-w-1", "white", 3, { blue: 3, green: 3, red: 5, black: 3 }),
  c("t3-w-2", "white", 4, { black: 7 }),
  c("t3-w-3", "white", 4, { white: 3, red: 3, black: 6 }),
  c("t3-w-4", "white", 5, { white: 3, black: 7 }),

  // Blue bonus
  c("t3-b-1", "blue", 3, { white: 3, green: 3, red: 3, black: 5 }),
  c("t3-b-2", "blue", 4, { white: 7 }),
  c("t3-b-3", "blue", 4, { white: 6, blue: 3, black: 3 }),
  c("t3-b-4", "blue", 5, { white: 7, blue: 3 }),

  // Green bonus
  c("t3-g-1", "green", 3, { white: 5, blue: 3, red: 3, black: 3 }),
  c("t3-g-2", "green", 4, { blue: 7 }),
  c("t3-g-3", "green", 4, { white: 3, blue: 6, green: 3 }),
  c("t3-g-4", "green", 5, { blue: 7, green: 3 }),

  // Red bonus
  c("t3-r-1", "red", 3, { white: 3, blue: 5, green: 3, black: 3 }),
  c("t3-r-2", "red", 4, { green: 7 }),
  c("t3-r-3", "red", 4, { blue: 3, green: 6, red: 3 }),
  c("t3-r-4", "red", 5, { green: 7, red: 3 }),

  // Black bonus
  c("t3-k-1", "black", 3, { white: 3, blue: 3, green: 5, red: 3 }),
  c("t3-k-2", "black", 4, { red: 7 }),
  c("t3-k-3", "black", 4, { green: 3, red: 6, black: 3 }),
  c("t3-k-4", "black", 5, { red: 7, black: 3 }),
];
