import type { Noble, Gem } from "../types";

/**
 * The 10 noble tiles from the base game. Each noble visits any player
 * whose permanent bonus meets every gem requirement listed. All nobles
 * are worth 3 prestige.
 */

const n = (id: string, requirement: Partial<Record<Gem, number>>): Noble => ({
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
  n("noble-1", { white: 3, blue: 3, black: 3 }), // Niccolò Machiavelli
  n("noble-2", { white: 3, red: 3, green: 3 }), // Catherine de Medici
  n("noble-3", { white: 3, blue: 3, green: 3 }), // Isabella of Castile
  n("noble-4", { red: 3, green: 3, black: 3 }), // Charles V
  n("noble-5", { blue: 3, green: 3, red: 3 }), // Suleiman the Magnificent
  n("noble-6", { white: 4, blue: 4 }), // Mary Stuart
  n("noble-7", { blue: 4, green: 4 }), // Henry VIII
  n("noble-8", { red: 4, green: 4 }), // Anne of Brittany
  n("noble-9", { red: 4, black: 4 }), // Francis I of France
  n("noble-10", { white: 4, black: 4 }), // Elizabeth of Austria
];
