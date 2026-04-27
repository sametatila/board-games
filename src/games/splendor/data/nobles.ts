import type { Noble, Gem } from "../types";

/**
 * Resmi 10 noble tile (Splendor 2014 base game). Gereksinimler ve
 * isimler resmi rulebook + AssortedMeeples / BGG referans listesiyle
 * doğrulanmıştır. Her noble 3 prestij değerinde.
 *
 * 5 noble: 4-of-2-colors (10 maliyet)
 * 5 noble: 3-of-3-colors (9 maliyet)
 *
 * Color codes: w=white(diamond), b=blue(sapphire), g=green(emerald),
 * r=red(ruby), k=black(onyx).
 */

const n = (
  id: string,
  requirement: Partial<Record<Gem, number>>,
): Noble => ({
  id,
  prestige: 3,
  requirement: {
    white: requirement.white ?? 0,
    blue: requirement.blue ?? 0,
    green: requirement.green ?? 0,
    red: requirement.red ?? 0,
    black: requirement.black ?? 0,
  },
});

export const NOBLES: Noble[] = [
  // 4-of-2-colors (5 noble)
  n("noble-mary-stuart", { green: 4, red: 4 }), // Mary Stuart
  n("noble-machiavelli", { white: 4, blue: 4 }), // Niccolò Machiavelli
  n("noble-isabella", { white: 4, black: 4 }), // Isabella of Castile
  n("noble-suleiman", { blue: 4, green: 4 }), // Suleiman the Magnificent
  n("noble-henry-viii", { green: 4, black: 4 }), // Henry VIII

  // 3-of-3-colors (5 noble)
  n("noble-charles-v", { white: 3, red: 3, black: 3 }), // Charles V
  n("noble-medici", { blue: 3, green: 3, red: 3 }), // Catherine de' Medici
  n("noble-anne-brittany", { white: 3, blue: 3, green: 3 }), // Anne of Brittany
  n("noble-elisabeth", { white: 3, blue: 3, black: 3 }), // Elisabeth of Austria
  n("noble-francis-i", { green: 3, red: 3, black: 3 }), // Francis I of France
];
