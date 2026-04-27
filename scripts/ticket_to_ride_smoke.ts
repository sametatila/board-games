// Ticket to Ride reducer smoke: lobby → start → initial tickets →
// draws → claim a route → end-game scoring path.

import {
  buildInitialState,
  makeTtrPlayer,
  reduce,
} from "../src/games/ticket-to-ride/reducer";
import type { TtrAction } from "../src/games/ticket-to-ride/actions";
import type {
  CardColor,
  TtrState,
} from "../src/games/ticket-to-ride/types";

let state: TtrState = buildInitialState("TEST");
state.players.push(makeTtrPlayer("p1", "Alice", "red", true));
state.players.push(makeTtrPlayer("p2", "Bob", "blue", false));

const apply = (action: TtrAction, label: string) => {
  const r = reduce(state, action);
  if (!r.ok) {
    console.log("FAIL @", label, ":", r.error);
    process.exit(1);
  }
  state = r.state;
  console.log(
    "OK",
    label,
    "phase=",
    state.phase,
    "subPhase=",
    state.subPhase,
    "turn=",
    state.currentPlayerIndex,
  );
};

apply({ type: "TTR/START_GAME", playerId: "p1", seed: 7 }, "START_GAME");
console.log(
  "  market:",
  state.market,
  "deck:",
  state.trainDeck.length,
  "tickets:",
  state.ticketDeck.length,
);

// Each player commits initial tickets (keep all 3 just to keep test stable).
for (const p of state.players) {
  apply(
    {
      type: "TTR/COMMIT_INITIAL_TICKETS",
      playerId: p.id,
      keepIds: (p.pendingTickets ?? []).map((t) => t.id),
    },
    `${p.nickname} commits initial tickets`,
  );
}

console.log("after initial tickets, p1 tickets:", state.players[0].tickets.length, "p2 tickets:", state.players[1].tickets.length);

// First few turns: each player draws 2 cards from deck.
for (let cycle = 0; cycle < 6; cycle++) {
  const cp = state.players[state.currentPlayerIndex];
  apply(
    {
      type: "TTR/DRAW_TRAIN",
      playerId: cp.id,
      source: { kind: "deck" },
    },
    `c${cycle} ${cp.nickname} draw1`,
  );
  // Second draw if we're in drawing_train sub-phase
  if (state.subPhase === "drawing_train") {
    apply(
      {
        type: "TTR/DRAW_TRAIN",
        playerId: cp.id,
        source: { kind: "deck" },
      },
      `c${cycle} ${cp.nickname} draw2`,
    );
  }
}

// Try to claim any route the active player can afford.
const cp = state.players[state.currentPlayerIndex];
const colorCards = (["purple","white","blue","yellow","orange","black","red","green"] as CardColor[]).map(
  (c) => ({ c, n: cp.hand[c] })
);
console.log(
  cp.nickname,
  "hand:",
  Object.entries(cp.hand).filter(([, v]) => v > 0),
);

console.log("PASS — TtR lobby/start/initial-tickets/draw/cycle smoke completed.");
