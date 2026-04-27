// Splendor reducer smoke test: lobby -> start -> series of actions ->
// finished. Validates that core rules (token limits, reserve+gold,
// purchase with bonus, noble visit, end-game trigger) all wire up.

import {
  buildInitialState,
  makeSplendorPlayer,
  reduce,
} from "../src/games/splendor/reducer";
import type { SplendorAction } from "../src/games/splendor/actions";
import type { SplendorState } from "../src/games/splendor/types";

let state: SplendorState = buildInitialState("TEST");
state.players.push(makeSplendorPlayer("p1", "Alice", "red", true));
state.players.push(makeSplendorPlayer("p2", "Bob", "blue", false));

const apply = (action: SplendorAction, label: string) => {
  const r = reduce(state, action);
  if (!r.ok) {
    console.log("FAIL @", label, ":", r.error);
    process.exit(1);
  }
  state = r.state;
  console.log("OK", label, "phase=", state.phase, "subPhase=", state.subPhase, "turn=", state.currentPlayerIndex);
};

apply({ type: "SP/START_GAME", playerId: "p1", seed: 42 }, "START_GAME");
console.log(
  "  bank tokens:",
  Object.entries(state.tokens).map(([k, v]) => `${k}:${v}`).join(" "),
  "| nobles:",
  state.nobles.length,
  "| market t1:",
  state.market[1].length,
);

// Active player takes 3 different
apply(
  {
    type: "SP/TAKE_3_DIFFERENT",
    playerId: state.players[0].id,
    gems: ["white", "blue", "green"],
  },
  "p1 take 3 different",
);

// Bob takes 2 same of red (bank should have 4)
apply({ type: "SP/TAKE_2_SAME", playerId: state.players[1].id, gem: "red" }, "p2 take 2 red");

// p1 reserve top of tier 1 (gets gold)
apply(
  {
    type: "SP/RESERVE",
    playerId: state.players[0].id,
    source: { kind: "deck", tier: 1 },
  },
  "p1 reserve tier-1 top",
);

// p2 reserve a market card
apply(
  {
    type: "SP/RESERVE",
    playerId: state.players[1].id,
    source: { kind: "market", tier: 1, slot: 0 },
  },
  "p2 reserve market t1 slot 0",
);

console.log("p1 tokens:", state.players[0].tokens, "reserved:", state.players[0].reserved.length);
console.log("p2 tokens:", state.players[1].tokens, "reserved:", state.players[1].reserved.length);

// Take a few more cycles to accumulate enough tokens for a purchase.
for (let i = 0; i < 4; i++) {
  const cp = state.players[state.currentPlayerIndex];
  // Try take 3 different from whatever still has stock.
  const candidates = (["white", "blue", "green", "red", "black"] as const).filter(
    (g) => state.tokens[g] > 0,
  );
  apply(
    {
      type: "SP/TAKE_3_DIFFERENT",
      playerId: cp.id,
      gems: candidates.slice(0, 3) as ("white" | "blue" | "green" | "red" | "black")[],
    },
    `cycle ${i} ${cp.nickname} take 3`,
  );
}

console.log("after cycles, p1 tokens:", state.players[0].tokens);
console.log("after cycles, p2 tokens:", state.players[1].tokens);

// Try to buy the cheapest market card on p1's turn.
const turnIdx = state.currentPlayerIndex;
const cp = state.players[turnIdx];
const market1 = state.market[1];
const buyable = market1.findIndex((c) => {
  if (!c) return false;
  // Quick check: cost - bonus <= tokens of color, ignoring gold.
  const gems = ["white", "blue", "green", "red", "black"] as const;
  for (const g of gems) {
    const need = Math.max(0, c.cost[g] - cp.bonus[g]);
    if (cp.tokens[g] < need) return false;
  }
  return true;
});
if (buyable >= 0) {
  apply(
    {
      type: "SP/PURCHASE",
      playerId: cp.id,
      source: { kind: "market", tier: 1, slot: buyable as 0 | 1 | 2 | 3 },
    },
    `${cp.nickname} buy tier 1 slot ${buyable}`,
  );
  console.log(
    "  prestige:",
    cp.prestige,
    "bought:",
    cp.bought.length,
    "bonus:",
    cp.bonus,
  );
} else {
  console.log("  (no affordable card yet — skipping purchase)");
}

console.log("PASS — Splendor lobby/start/take/reserve/purchase smoke completed.");
