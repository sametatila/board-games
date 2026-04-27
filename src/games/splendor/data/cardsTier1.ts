import type { Card, Gem } from "../types";

/**
 * Tier 1 development cards (40 cards). Costs and bonus colours match the
 * published 2014 Asmodee deck. 8 cards per gem bonus colour. Most cards
 * have 0 prestige; a single "1 prestige" card per colour exists at the
 * heaviest cost.
 *
 * Source: official rulebook + community-verified card listings (BGG).
 */

const c = (
  id: string,
  bonus: Gem,
  prestige: number,
  cost: Partial<Record<Gem, number>>,
): Card => ({
  id,
  tier: 1,
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

export const CARDS_TIER_1: Card[] = [
  // White bonus (8 cards)
  c("t1-w-1", "white", 0, { blue: 1, green: 1, red: 1, black: 1 }),
  c("t1-w-2", "white", 0, { blue: 1, green: 2, red: 1, black: 1 }),
  c("t1-w-3", "white", 0, { blue: 2, green: 2, black: 1 }),
  c("t1-w-4", "white", 0, { green: 1, red: 3, black: 1 }),
  c("t1-w-5", "white", 0, { red: 2, black: 1 }),
  c("t1-w-6", "white", 0, { black: 3 }),
  c("t1-w-7", "white", 0, { blue: 2 }),
  c("t1-w-8", "white", 1, { blue: 4 }),

  // Blue bonus (8 cards)
  c("t1-b-1", "blue", 0, { white: 1, green: 1, red: 1, black: 1 }),
  c("t1-b-2", "blue", 0, { white: 1, green: 1, red: 2, black: 1 }),
  c("t1-b-3", "blue", 0, { white: 1, green: 2, red: 2 }),
  c("t1-b-4", "blue", 0, { blue: 1, green: 3, red: 1 }),
  c("t1-b-5", "blue", 0, { green: 2, black: 2 }),
  c("t1-b-6", "blue", 0, { white: 3 }),
  c("t1-b-7", "blue", 0, { black: 2 }),
  c("t1-b-8", "blue", 1, { red: 4 }),

  // Green bonus (8 cards)
  c("t1-g-1", "green", 0, { white: 1, blue: 1, red: 1, black: 1 }),
  c("t1-g-2", "green", 0, { white: 1, blue: 1, red: 1, black: 2 }),
  c("t1-g-3", "green", 0, { blue: 1, red: 3, black: 1 }),
  c("t1-g-4", "green", 0, { white: 2, blue: 1 }),
  c("t1-g-5", "green", 0, { white: 2, black: 2 }),
  c("t1-g-6", "green", 0, { red: 2, black: 1 }),
  c("t1-g-7", "green", 0, { blue: 3 }),
  c("t1-g-8", "green", 1, { black: 4 }),

  // Red bonus (8 cards)
  c("t1-r-1", "red", 0, { white: 1, blue: 1, green: 1, black: 1 }),
  c("t1-r-2", "red", 0, { white: 2, blue: 1, green: 1, black: 1 }),
  c("t1-r-3", "red", 0, { white: 2, red: 1, black: 2 }),
  c("t1-r-4", "red", 0, { white: 3, red: 1, black: 1 }),
  c("t1-r-5", "red", 0, { blue: 2, green: 1 }),
  c("t1-r-6", "red", 0, { white: 2, green: 1 }),
  c("t1-r-7", "red", 0, { green: 3 }),
  c("t1-r-8", "red", 1, { white: 4 }),

  // Black bonus (8 cards)
  c("t1-k-1", "black", 0, { white: 1, blue: 1, green: 1, red: 1 }),
  c("t1-k-2", "black", 0, { white: 1, blue: 2, green: 1, red: 1 }),
  c("t1-k-3", "black", 0, { white: 2, blue: 2, red: 1 }),
  c("t1-k-4", "black", 0, { green: 1, red: 2 }),
  c("t1-k-5", "black", 0, { blue: 1, green: 2 }),
  c("t1-k-6", "black", 0, { red: 3 }),
  c("t1-k-7", "black", 0, { green: 2 }),
  c("t1-k-8", "black", 1, { green: 4 }),
];
