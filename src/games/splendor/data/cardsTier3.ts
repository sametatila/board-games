import type { Card, Gem } from "../types";

/**
 * Tier 3 development cards (20 cards). 4 cards per gem bonus colour,
 * prestige 3–5, costs 9–14 total gems.
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
  c("t3-w-2", "white", 4, { red: 7 }),
  c("t3-w-3", "white", 4, { white: 3, red: 6, black: 3 }),
  c("t3-w-4", "white", 5, { white: 3, red: 7 }),

  // Blue bonus
  c("t3-b-1", "blue", 3, { white: 3, green: 3, red: 3, black: 5 }),
  c("t3-b-2", "blue", 4, { black: 7 }),
  c("t3-b-3", "blue", 4, { white: 6, blue: 3, black: 3 }),
  c("t3-b-4", "blue", 5, { blue: 3, black: 7 }),

  // Green bonus
  c("t3-g-1", "green", 3, { white: 5, blue: 3, red: 3, black: 3 }),
  c("t3-g-2", "green", 4, { blue: 7 }),
  c("t3-g-3", "green", 4, { white: 3, blue: 6, green: 3 }),
  c("t3-g-4", "green", 5, { blue: 7, green: 3 }),

  // Red bonus
  c("t3-r-1", "red", 3, { white: 3, blue: 5, green: 3, black: 3 }),
  c("t3-r-2", "red", 4, { white: 7 }),
  c("t3-r-3", "red", 4, { white: 6, red: 3, green: 3 }),
  c("t3-r-4", "red", 5, { white: 7, red: 3 }),

  // Black bonus
  c("t3-k-1", "black", 3, { white: 3, blue: 3, green: 5, red: 3 }),
  c("t3-k-2", "black", 4, { green: 7 }),
  c("t3-k-3", "black", 4, { green: 6, red: 3, black: 3 }),
  c("t3-k-4", "black", 5, { green: 7, black: 3 }),
];
