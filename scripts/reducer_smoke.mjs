// End-to-end reducer smoke test: lobby -> start -> setup -> rolls.
// We use tsx to load TypeScript directly. If tsx isn't installed we'll add it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// Run an inline TS-aware script through tsx.
const tsCode = `
import { reduce } from "${path.join(root, "src/games/sunny-harbor/reducer.ts").replace(/\\\\/g, "/")}";
import type { GameState } from "${path.join(root, "src/games/sunny-harbor/types.ts").replace(/\\\\/g, "/")}";
import { hexVertexIds, hexEdgeIds } from "${path.join(root, "src/games/sunny-harbor/hex.ts").replace(/\\\\/g, "/")}";

function emptyResources() {
  return { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 };
}
function fullBank() {
  return { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 };
}
function makePlayer(id: string, n: string, color: any, host: boolean) {
  return {
    id, nickname: n, color, isHost: host, connected: true,
    resources: emptyResources(),
    devCards: { available: [], played: [] },
    knightsPlayed: 0,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    roadsRemaining: 15,
    victoryPoints: 0,
    hiddenVictoryPoints: 0,
  };
}
const initial: GameState = {
  roomCode: "TEST",
  phase: "lobby", subPhase: "main",
  mapTemplateId: "classic",
  hexes: [], ports: [], pieces: [],
  players: [
    makePlayer("p1", "Alice", "red", true),
    makePlayer("p2", "Bob", "blue", false),
  ],
  turnOrder: ["p1", "p2"],
  currentPlayerIndex: 0,
  diceRoll: null, robberHexId: null,
  longestRoad: null, largestArmy: null,
  pendingTrade: null,
  rules: {
    victoryPointsToWin: 10, maxSettlements: 5, maxCities: 4, maxRoads: 15,
    bankResourceCount: 19, longestRoadThreshold: 5, largestArmyThreshold: 3,
  },
  log: [], bank: fullBank(), devDeck: [], winnerId: null,
};

let state = initial;
const apply = (action: any, label: string) => {
  const r = reduce(state, action);
  if (!r.ok) {
    console.log("FAIL @", label, ":", r.error);
    process.exit(1);
  }
  state = r.state;
  console.log("OK", label, "phase=", state.phase, "subPhase=", state.subPhase, "turn=", state.currentPlayerIndex);
};

apply({ type: "START_GAME", mapTemplateId: "classic", seed: 42 }, "START_GAME");
console.log("  hexes:", state.hexes.length, "ports:", state.ports.length, "robberHex:", state.robberHexId);

// Setup round 1: each player places settlement + road, in order p1, p2.
const order: string[] = [];
for (let i = 0; i < 2; i++) order.push("p1", "p2");
// Round 2 reverse:
for (let i = 0; i < 2; i++) order.unshift();

function findValidVertex(playerId: string): string {
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const v of hexVertexIds(h.coord)) {
      const occupied = state.pieces.some((p: any) => p.vertexId === v);
      if (occupied) continue;
      // Check distance-2 manually: no neighbor vertex occupied
      const r = reduce(state, { type: "PLACE_INITIAL_SETTLEMENT", playerId, vertexId: v });
      if (r.ok) return v;
    }
  }
  throw new Error("No valid vertex");
}

function findValidEdgeFrom(playerId: string): string {
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const e of hexEdgeIds(h.coord)) {
      const occupied = state.pieces.some((p: any) => p.edgeId === e);
      if (occupied) continue;
      const r = reduce(state, { type: "PLACE_INITIAL_ROAD", playerId, edgeId: e });
      if (r.ok) return e;
    }
  }
  throw new Error("No valid edge");
}

function curId() { return state.players[state.currentPlayerIndex].id; }

// Round 1 settlement+road for p1 then p2.
for (let i = 0; i < 2; i++) {
  const pid = curId();
  const v = findValidVertex(pid);
  apply({ type: "PLACE_INITIAL_SETTLEMENT", playerId: pid, vertexId: v }, "round1 settlement " + pid);
  const e = findValidEdgeFrom(pid);
  apply({ type: "PLACE_INITIAL_ROAD", playerId: pid, edgeId: e }, "round1 road " + pid);
}

// Round 2: should now be p2 then p1 (snake).
console.log("After round1, expecting setup_round_2, current=", state.currentPlayerIndex);

for (let i = 0; i < 2; i++) {
  const pid = curId();
  const v = findValidVertex(pid);
  apply({ type: "PLACE_INITIAL_SETTLEMENT", playerId: pid, vertexId: v }, "round2 settlement " + pid);
  const e = findValidEdgeFrom(pid);
  apply({ type: "PLACE_INITIAL_ROAD", playerId: pid, edgeId: e }, "round2 road " + pid);
}

console.log("Phase after setup:", state.phase, "subPhase:", state.subPhase);
console.log("Resources:");
for (const p of state.players) {
  console.log("  ", p.nickname, JSON.stringify(p.resources));
}

// Roll dice on p1's turn.
apply({ type: "ROLL_DICE", playerId: curId(), dice: [3, 4] as [number, number] }, "roll 7?");
console.log("subPhase after roll:", state.subPhase);

apply({ type: "END_TURN", playerId: curId() }, "end turn");

apply({ type: "ROLL_DICE", playerId: curId(), dice: [4, 4] as [number, number] }, "roll 8");
console.log("subPhase after roll 8:", state.subPhase);

console.log("PASS — full setup + 2 rolls completed.");
`;

const r = spawnSync("npx", ["--yes", "tsx", "-e", tsCode], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
