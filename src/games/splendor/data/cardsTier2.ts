import type { Card, Gem } from "../types";

/**
 * Tier 2 development cards (30 cards). 6 cards per gem bonus colour with
 * prestige in the 1–3 range and costs of 5–8 total gems.
 */

const c = (
  id: string,
  bonus: Gem,
  prestige: number,
  cost: Partial<Record<Gem, number>>,
): Card => ({
  id,
  tier: 2,
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

export const CARDS_TIER_2: Card[] = [
  // White bonus
  c("t2-w-1", "white", 1, { green: 3, red: 2, black: 2 }),
  c("t2-w-2", "white", 1, { white: 2, blue: 3, red: 3 }),
  c("t2-w-3", "white", 2, { green: 1, red: 4, black: 2 }),
  c("t2-w-4", "white", 2, { red: 5, black: 3 }),
  c("t2-w-5", "white", 2, { red: 5 }),
  c("t2-w-6", "white", 3, { white: 6 }),

  // Blue bonus
  c("t2-b-1", "blue", 1, { blue: 2, green: 2, red: 3 }),
  c("t2-b-2", "blue", 1, { blue: 2, green: 3, black: 3 }),
  c("t2-b-3", "blue", 2, { white: 5, blue: 3 }),
  c("t2-b-4", "blue", 2, { white: 2, red: 1, black: 4 }),
  c("t2-b-5", "blue", 2, { blue: 5 }),
  c("t2-b-6", "blue", 3, { blue: 6 }),

  // Green bonus
  c("t2-g-1", "green", 1, { white: 3, green: 2, red: 3 }),
  c("t2-g-2", "green", 1, { white: 2, blue: 3, black: 2 }),
  c("t2-g-3", "green", 2, { white: 4, blue: 2, black: 1 }),
  c("t2-g-4", "green", 2, { blue: 5, green: 3 }),
  c("t2-g-5", "green", 2, { green: 5 }),
  c("t2-g-6", "green", 3, { green: 6 }),

  // Red bonus
  c("t2-r-1", "red", 1, { white: 2, red: 2, black: 3 }),
  c("t2-r-2", "red", 1, { blue: 3, red: 2, black: 3 }),
  c("t2-r-3", "red", 2, { white: 1, blue: 4, green: 2 }),
  c("t2-r-4", "red", 2, { black: 5, red: 3 }),
  c("t2-r-5", "red", 2, { black: 5 }),
  c("t2-r-6", "red", 3, { red: 6 }),

  // Black bonus
  c("t2-k-1", "black", 1, { white: 3, blue: 2, green: 2 }),
  c("t2-k-2", "black", 1, { white: 3, green: 3, black: 2 }),
  c("t2-k-3", "black", 2, { white: 1, green: 4, red: 2 }),
  c("t2-k-4", "black", 2, { green: 5, red: 3 }),
  c("t2-k-5", "black", 2, { green: 5 }),
  c("t2-k-6", "black", 3, { black: 6 }),
];
