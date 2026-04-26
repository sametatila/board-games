import { reduce } from "../src/game/reducer";
import type { GameState, PlayerColor } from "../src/game/types";
import { DEFAULT_SETTINGS } from "../src/game/types";
import { hexVertexIds, hexEdgeIds } from "../src/game/hex";

function emptyResources() {
  return { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 };
}
function fullBank() {
  return { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 };
}
function makePlayer(id: string, n: string, color: PlayerColor, host: boolean) {
  return {
    id,
    nickname: n,
    color,
    isHost: host,
    connected: true,
    resources: emptyResources(),
    devCards: { available: [], played: [], pendingFromTurn: [] },
    hasPlayedDevThisTurn: false,
    knightsPlayed: 0,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    roadsRemaining: 15,
    shipsRemaining: 0,
    victoryPoints: 0,
    hiddenVictoryPoints: 0,
  };
}

const initial: GameState = {
  roomCode: "TEST",
  phase: "lobby",
  subPhase: "main",
  mapTemplateId: "classic",
  difficulty: "normal",
  hexes: [],
  ports: [],
  pieces: [],
  players: [
    makePlayer("p1", "Alice", "red", true),
    makePlayer("p2", "Bob", "blue", false),
  ],
  turnOrder: ["p1", "p2"],
  currentPlayerIndex: 0,
  diceRoll: null,
  robberHexId: null,
  pirateHexId: null,
  longestRoad: null,
  longestRoute: null,
  largestArmy: null,
  bonusVP: {},
  pendingGoldChoices: [],
  fortresses: [],
  pendingTrade: null,
  rules: {
    victoryPointsToWin: 10,
    maxSettlements: 5,
    maxCities: 4,
    maxRoads: 15,
    maxShips: 0,
    bankResourceCount: 19,
    longestRoadThreshold: 5,
    largestArmyThreshold: 3,
  },
  settings: { ...DEFAULT_SETTINGS },
  turnDeadlineMs: null,
  tradeDeadlineMs: null,
  discardDeadlineMs: null,
  log: [],
  bank: fullBank(),
  devDeck: [],
  winnerId: null,
};

let state = initial;
const apply = (action: any, label: string) => {
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

apply({ type: "START_GAME", mapTemplateId: "classic", seed: 42 }, "START_GAME");
console.log(
  "  hexes:",
  state.hexes.length,
  "ports:",
  state.ports.length,
  "robberHex:",
  state.robberHexId,
);

function findValidVertex(playerId: string): string {
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const v of hexVertexIds(h.coord)) {
      const occupied = state.pieces.some(
        (p: any) => "vertexId" in p && p.vertexId === v,
      );
      if (occupied) continue;
      const r = reduce(state, {
        type: "PLACE_INITIAL_SETTLEMENT",
        playerId,
        vertexId: v,
      });
      if (r.ok) return v;
    }
  }
  throw new Error("No valid vertex");
}

function findValidEdgeFrom(playerId: string): string {
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const e of hexEdgeIds(h.coord)) {
      const occupied = state.pieces.some(
        (p: any) => "edgeId" in p && p.edgeId === e,
      );
      if (occupied) continue;
      const r = reduce(state, {
        type: "PLACE_INITIAL_ROAD",
        playerId,
        edgeId: e,
      });
      if (r.ok) return e;
    }
  }
  throw new Error("No valid edge");
}

function curId() {
  return state.players[state.currentPlayerIndex].id;
}

for (let i = 0; i < 2; i++) {
  const pid = curId();
  const v = findValidVertex(pid);
  apply(
    { type: "PLACE_INITIAL_SETTLEMENT", playerId: pid, vertexId: v },
    "round1 settlement " + pid,
  );
  const e = findValidEdgeFrom(pid);
  apply(
    { type: "PLACE_INITIAL_ROAD", playerId: pid, edgeId: e },
    "round1 road " + pid,
  );
}

console.log("After round1, current=", state.currentPlayerIndex, "phase=", state.phase);

for (let i = 0; i < 2; i++) {
  const pid = curId();
  const v = findValidVertex(pid);
  apply(
    { type: "PLACE_INITIAL_SETTLEMENT", playerId: pid, vertexId: v },
    "round2 settlement " + pid,
  );
  const e = findValidEdgeFrom(pid);
  apply(
    { type: "PLACE_INITIAL_ROAD", playerId: pid, edgeId: e },
    "round2 road " + pid,
  );
}

console.log("Phase after setup:", state.phase, "subPhase:", state.subPhase);
console.log("Resources after setup:");
for (const p of state.players) {
  console.log("  ", p.nickname, JSON.stringify(p.resources));
}

// Roll 8 (no 7): straight path through main subphase.
apply({ type: "ROLL_DICE", playerId: curId(), dice: [4, 4] }, "roll 8");
apply({ type: "END_TURN", playerId: curId() }, "end turn (after 8)");

// Roll 7 on next player's turn: should require robber move.
apply({ type: "ROLL_DICE", playerId: curId(), dice: [3, 4] }, "roll 7");
console.log("subPhase=", state.subPhase);

// Move robber to a non-current hex.
const target = state.hexes.find((h) => h.id !== state.robberHexId && h.terrain !== "sea")!;
apply(
  {
    type: "MOVE_ROBBER",
    playerId: curId(),
    hexId: target.id,
  },
  "move robber",
);
apply({ type: "END_TURN", playerId: curId() }, "end turn (after robber)");

console.log("Resources after a couple rolls:");
for (const p of state.players) {
  console.log("  ", p.nickname, JSON.stringify(p.resources));
}

console.log("PASS — full setup + dice rolls + robber move completed.");
