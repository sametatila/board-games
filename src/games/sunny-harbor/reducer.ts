import type {
  BuiltPiece,
  GameEventLogEntry,
  GameState,
  HexTerrain,
  Player,
  PortKind,
  Resource,
} from "./types";
import { BUILD_COSTS, DEV_CARD_COST, type GameAction } from "./actions";
import type { DevelopmentCard } from "./types";
import {
  edgeEndpointVertices,
  hexEdgeIds,
  hexVertexIds,
  vertexAdjacentVertices,
  vertexEdges,
} from "./hex";
import { generateBoard } from "./board";
import { getMapTemplate } from "./mapTemplates";

export type ReducerError = { ok: false; error: string };
export type ReducerSuccess = { ok: true; state: GameState };
export type ReducerResult = ReducerSuccess | ReducerError;

function fail(error: string): ReducerError {
  return { ok: false, error };
}

const RESOURCE_EMOJI: Record<Resource, string> = {
  wood: "🌲",
  brick: "🧱",
  wheat: "🍞",
  sheep: "🐑",
  ore: "⛏️",
};

// Compute the next turn deadline (or null if disabled). Used after dice roll,
// trade resolution, etc., whenever the active player gets fresh control.
function nextTurnDeadline(state: GameState): number | null {
  const sec = state.settings?.turnTimerSec ?? 0;
  if (sec <= 0) return null;
  return Date.now() + sec * 1000;
}

function nextTradeDeadline(state: GameState): number | null {
  const sec = state.settings?.tradeTimerSec ?? 0;
  if (sec <= 0) return null;
  return Date.now() + sec * 1000;
}

function nextDiscardDeadline(state: GameState): number | null {
  const sec = state.settings?.discardTimerSec ?? 0;
  if (sec <= 0) return null;
  return Date.now() + sec * 1000;
}

function formatResourceMap(map: Partial<Record<Resource, number>>): string {
  const parts: string[] = [];
  for (const r of ["wood", "brick", "wheat", "sheep", "ore"] as Resource[]) {
    const n = map[r] ?? 0;
    if (n > 0) parts.push(`${n}${RESOURCE_EMOJI[r]}`);
  }
  return parts.join(" ") || "(yok)";
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function nextLogId(state: GameState) {
  return `l${state.log.length}_${Date.now().toString(36)}`;
}

function log(state: GameState, text: string, playerId?: string) {
  const entry: GameEventLogEntry = {
    id: nextLogId(state),
    ts: Date.now(),
    playerId,
    text,
  };
  state.log = [...state.log, entry].slice(-200);
}

function getPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

function totalCards(player: Player): number {
  return Object.values(player.resources).reduce((a, b) => a + b, 0);
}

function payCost(
  player: Player,
  cost: Partial<Record<Resource, number>>,
): boolean {
  for (const [r, n] of Object.entries(cost)) {
    if ((player.resources[r as Resource] ?? 0) < (n ?? 0)) return false;
  }
  for (const [r, n] of Object.entries(cost)) {
    player.resources[r as Resource] -= n ?? 0;
  }
  return true;
}

function refundToBank(state: GameState, cost: Partial<Record<Resource, number>>) {
  for (const [r, n] of Object.entries(cost)) {
    state.bank[r as Resource] += n ?? 0;
  }
}

// Hex coord lookup helpers (we keep state.hexes as a flat list).
function indexHexes(state: GameState) {
  const byId = new Map<string, (typeof state.hexes)[number]>();
  for (const h of state.hexes) byId.set(h.id, h);
  return byId;
}

// Build a vertex -> hex IDs index from current state.hexes.
function indexVertexToHexes(state: GameState): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const h of state.hexes) {
    for (const v of hexVertexIds(h.coord)) {
      const list = map.get(v) ?? [];
      list.push(h.id);
      map.set(v, list);
    }
  }
  return map;
}

function indexEdgeToHexes(state: GameState): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const h of state.hexes) {
    for (const e of hexEdgeIds(h.coord)) {
      const list = map.get(e) ?? [];
      list.push(h.id);
      map.set(e, list);
    }
  }
  return map;
}

function isVertexOnBoard(state: GameState, vId: string): boolean {
  const idx = indexVertexToHexes(state);
  return idx.has(vId);
}

function isEdgeOnBoard(state: GameState, eId: string): boolean {
  const idx = indexEdgeToHexes(state);
  return idx.has(eId);
}

// Find all vertex neighbors of a vertex (the 2-3 vertices connected by edges).
// We do this by scanning all hexes that share this vertex and collecting adjacent vertices.
function adjacentVertices(state: GameState, vId: string): string[] {
  const result = new Set<string>();
  for (const h of state.hexes) {
    const verts = hexVertexIds(h.coord);
    const cornerIndex = verts.indexOf(vId);
    if (cornerIndex < 0) continue;
    for (const adj of vertexAdjacentVertices(h.coord, cornerIndex)) {
      result.add(adj);
    }
  }
  return [...result];
}

// Edges incident to a given vertex.
function edgesAtVertex(state: GameState, vId: string): string[] {
  const result = new Set<string>();
  for (const h of state.hexes) {
    const verts = hexVertexIds(h.coord);
    const cornerIndex = verts.indexOf(vId);
    if (cornerIndex < 0) continue;
    for (const e of vertexEdges(h.coord, cornerIndex)) {
      result.add(e);
    }
  }
  return [...result];
}

// Two vertex endpoints of an edge.
function edgeEndpoints(state: GameState, eId: string): string[] {
  for (const h of state.hexes) {
    const edges = hexEdgeIds(h.coord);
    const sideIdx = edges.indexOf(eId);
    if (sideIdx < 0) continue;
    return edgeEndpointVertices(h.coord, sideIdx);
  }
  return [];
}

function pieceAtVertex(state: GameState, vId: string) {
  return state.pieces.find(
    (p) => (p.kind === "settlement" || p.kind === "city") && p.vertexId === vId,
  );
}

function pieceAtEdge(state: GameState, eId: string) {
  return state.pieces.find((p) => p.kind === "road" && p.edgeId === eId);
}

function isValidSettlementPlacement(
  state: GameState,
  vId: string,
  playerId: string,
  isInitial: boolean,
): { ok: boolean; reason?: string } {
  if (!isVertexOnBoard(state, vId)) return { ok: false, reason: "vertex_off_board" };
  if (pieceAtVertex(state, vId)) return { ok: false, reason: "vertex_occupied" };
  // Distance-2 rule: no settlement on adjacent vertices.
  for (const adj of adjacentVertices(state, vId)) {
    if (pieceAtVertex(state, adj)) return { ok: false, reason: "too_close" };
  }
  if (!isInitial) {
    // Must be connected to one of player's own roads.
    const incidentEdges = edgesAtVertex(state, vId);
    const hasOwnRoad = incidentEdges.some((e) => {
      const piece = pieceAtEdge(state, e);
      return piece?.kind === "road" && piece.playerId === playerId;
    });
    if (!hasOwnRoad) return { ok: false, reason: "no_connecting_road" };
  }
  return { ok: true };
}

function isValidRoadPlacement(
  state: GameState,
  eId: string,
  playerId: string,
  isInitial: boolean,
  initialAttachVertex?: string,
): { ok: boolean; reason?: string } {
  if (!isEdgeOnBoard(state, eId)) return { ok: false, reason: "edge_off_board" };
  if (pieceAtEdge(state, eId)) return { ok: false, reason: "edge_occupied" };
  const endpoints = edgeEndpoints(state, eId);
  if (endpoints.length !== 2) return { ok: false, reason: "edge_invalid" };

  if (isInitial) {
    // Road must touch the just-placed initial settlement.
    if (!initialAttachVertex) return { ok: false, reason: "missing_attach" };
    if (!endpoints.includes(initialAttachVertex)) {
      return { ok: false, reason: "road_must_attach_to_settlement" };
    }
    return { ok: true };
  }

  // Normal: at least one endpoint must connect to an existing road or settlement of the player,
  // AND that endpoint must not be blocked by an enemy settlement.
  for (const v of endpoints) {
    const occupant = pieceAtVertex(state, v);
    if (occupant && occupant.playerId !== playerId) continue; // blocked
    // Check if any incident edge has player's road, or this vertex has player's settlement/city.
    if (occupant?.playerId === playerId) return { ok: true };
    const incidentEdges = edgesAtVertex(state, v).filter((e) => e !== eId);
    for (const e of incidentEdges) {
      const piece = pieceAtEdge(state, e);
      if (piece?.kind === "road" && piece.playerId === playerId) return { ok: true };
    }
  }
  return { ok: false, reason: "road_not_connected" };
}

// Edge classification for ship placement: an edge is valid for a ship if at
// least one of its two adjacent hexes is sea (i.e. the edge actually borders
// water). On classic boards there are no sea hexes so ships are never valid.
function isEdgeOnSea(state: GameState, eId: string): boolean {
  const idx = indexEdgeToHexes(state);
  const hexIds = idx.get(eId) ?? [];
  if (hexIds.length === 0) return false;
  const hexById = indexHexes(state);
  return hexIds.some((id) => hexById.get(id)?.terrain === "sea");
}

function isValidShipPlacement(
  state: GameState,
  eId: string,
  playerId: string,
): { ok: boolean; reason?: string } {
  if (!isEdgeOnBoard(state, eId)) return { ok: false, reason: "edge_off_board" };
  if (pieceAtEdge(state, eId)) return { ok: false, reason: "edge_occupied" };
  if (!isEdgeOnSea(state, eId)) return { ok: false, reason: "ship_not_on_sea" };
  const endpoints = edgeEndpoints(state, eId);
  if (endpoints.length !== 2) return { ok: false, reason: "edge_invalid" };

  // At least one endpoint must connect to: own settlement/city, OR own ship,
  // OR own road (allowing road→ship transitions at coastal vertices).
  for (const v of endpoints) {
    const occupant = pieceAtVertex(state, v);
    if (occupant && occupant.playerId !== playerId) continue;
    if (occupant?.playerId === playerId) return { ok: true };
    const incidentEdges = edgesAtVertex(state, v).filter((e) => e !== eId);
    for (const e of incidentEdges) {
      const piece = pieceAtEdge(state, e);
      if (
        piece &&
        piece.playerId === playerId &&
        (piece.kind === "ship" ||
          piece.kind === "warship" ||
          piece.kind === "road")
      ) {
        return { ok: true };
      }
    }
  }
  return { ok: false, reason: "ship_not_connected" };
}

function distributeResources(state: GameState, roll: number) {
  if (roll === 7) return;
  const vertexHexIdx = indexVertexToHexes(state);
  const hexById = indexHexes(state);
  const robberHexId = state.robberHexId;

  // Compute pending grants per player per resource, then satisfy from bank.
  const grants = new Map<string, Partial<Record<Resource, number>>>();
  for (const piece of state.pieces) {
    if (piece.kind !== "settlement" && piece.kind !== "city") continue;
    const hexIds = vertexHexIdx.get(piece.vertexId) ?? [];
    for (const hid of hexIds) {
      const hex = hexById.get(hid);
      if (!hex || hex.numberToken !== roll) continue;
      if (hex.id === robberHexId) continue;
      const r = hex.terrain;
      if (r === "desert" || r === "sea" || r === "fog") continue;
      const amt = piece.kind === "city" ? 2 : 1;
      if (r === "gold") {
        // Gold field: queue a player choice instead of granting immediately.
        // The player picks a resource via CHOOSE_GOLD_RESOURCE; until they
        // pick, no resource is added.
        for (let i = 0; i < amt; i++) {
          state.pendingGoldChoices.push({
            playerId: piece.playerId,
            hexId: hex.id,
          });
        }
        continue;
      }
      const g = grants.get(piece.playerId) ?? {};
      g[r as Resource] = (g[r as Resource] ?? 0) + amt;
      grants.set(piece.playerId, g);
    }
  }

  // Catan rule: if bank can't satisfy ALL claims of a single resource, NONE get it.
  const totalsPerResource: Partial<Record<Resource, number>> = {};
  for (const g of grants.values()) {
    for (const [r, n] of Object.entries(g)) {
      totalsPerResource[r as Resource] =
        (totalsPerResource[r as Resource] ?? 0) + (n ?? 0);
    }
  }
  const skipped = new Set<Resource>();
  for (const [r, total] of Object.entries(totalsPerResource)) {
    if ((state.bank[r as Resource] ?? 0) < (total ?? 0)) {
      // If only one player claims it, give as many as possible. Otherwise skip all.
      const claimants = [...grants.entries()].filter(
        ([, g]) => (g[r as Resource] ?? 0) > 0,
      );
      if (claimants.length > 1) skipped.add(r as Resource);
    }
  }

  for (const [pid, g] of grants) {
    const player = getPlayer(state, pid);
    if (!player) continue;
    for (const [r, n] of Object.entries(g)) {
      if (skipped.has(r as Resource)) continue;
      const give = Math.min(n ?? 0, state.bank[r as Resource] ?? 0);
      player.resources[r as Resource] += give;
      state.bank[r as Resource] -= give;
    }
  }

  if (skipped.size > 0) {
    log(
      state,
      `Bank yetersiz: ${[...skipped].join(", ")} dağıtılmadı.`,
    );
  }
}

// Largest army: the player who has played the most knights, with at least 3.
// Award is held until someone surpasses the holder.
function updateLargestArmy(state: GameState) {
  const threshold = state.rules.largestArmyThreshold;
  let topPlayerId: string | null = null;
  let topCount = threshold - 1;
  for (const p of state.players) {
    if (p.knightsPlayed > topCount) {
      topCount = p.knightsPlayed;
      topPlayerId = p.id;
    }
  }
  // If holder still has the most (or ties), they keep it. Largest army goes to
  // strict majority over current holder.
  if (state.largestArmy) {
    const currentHolder = state.players.find(
      (p) => p.id === state.largestArmy!.playerId,
    );
    if (currentHolder && currentHolder.knightsPlayed >= topCount) {
      // Holder still ties for top, no change.
      return;
    }
    // Update holder.
  }
  if (topPlayerId) {
    const newHolder = state.players.find((p) => p.id === topPlayerId);
    if (
      newHolder &&
      (!state.largestArmy || state.largestArmy.playerId !== topPlayerId)
    ) {
      state.largestArmy = {
        playerId: topPlayerId,
        size: newHolder.knightsPlayed,
      };
      log(state, `${newHolder.nickname} en büyük orduyu aldı!`, topPlayerId);
    } else if (state.largestArmy?.playerId === topPlayerId) {
      state.largestArmy.size = topCount;
    }
  }
}

// Longest road: per-player DFS over the road network, blocked by enemy settlements.
function longestRoadFor(state: GameState, playerId: string): number {
  const myRoads = state.pieces.filter(
    (p): p is Extract<typeof p, { kind: "road" }> =>
      p.kind === "road" && p.playerId === playerId,
  );
  if (myRoads.length === 0) return 0;

  // Build adjacency: vertex -> list of {edge, otherVertex} pairs (player's roads only).
  const adj = new Map<string, { edge: string; other: string }[]>();
  for (const road of myRoads) {
    const ends = edgeEndpointVerticesForEdgeId(state, road.edgeId);
    if (ends.length !== 2) continue;
    const [a, b] = ends;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ edge: road.edgeId, other: b });
    adj.get(b)!.push({ edge: road.edgeId, other: a });
  }

  // Vertices blocked by enemy buildings (you can't transit through them, but you
  // can start/end there if it's yours).
  const enemyVerts = new Set(
    state.pieces
      .filter(
        (p) =>
          (p.kind === "settlement" || p.kind === "city") &&
          p.playerId !== playerId,
      )
      .map((p) => (p as { vertexId: string }).vertexId),
  );

  let best = 0;
  function dfs(at: string, usedEdges: Set<string>) {
    if (usedEdges.size > best) best = usedEdges.size;
    const neighbors = adj.get(at) ?? [];
    for (const { edge, other } of neighbors) {
      if (usedEdges.has(edge)) continue;
      // Cannot pass THROUGH enemy vertex; but walking INTO it is allowed only
      // if the edge ends there as terminal. We treat as blocked if `at` is enemy
      // (we just came in; can't continue).
      if (enemyVerts.has(at) && usedEdges.size > 0) {
        // We are at enemy vertex; cannot continue, but we already counted the edge.
        continue;
      }
      usedEdges.add(edge);
      dfs(other, usedEdges);
      usedEdges.delete(edge);
    }
  }

  for (const start of adj.keys()) {
    dfs(start, new Set());
  }
  return best;
}

function updateLongestRoad(state: GameState) {
  const threshold = state.rules.longestRoadThreshold;
  let topPlayerId: string | null = null;
  let topLength = threshold - 1;
  for (const p of state.players) {
    const n = longestRoadFor(state, p.id);
    if (n > topLength) {
      topLength = n;
      topPlayerId = p.id;
    }
  }
  if (state.longestRoad) {
    const currentHolder = state.players.find(
      (p) => p.id === state.longestRoad!.playerId,
    );
    if (currentHolder) {
      const currentLen = longestRoadFor(state, currentHolder.id);
      if (currentLen >= topLength) {
        // Holder maintains.
        state.longestRoad.length = currentLen;
        return;
      }
    }
  }
  if (topPlayerId) {
    const newHolder = state.players.find((p) => p.id === topPlayerId);
    if (
      newHolder &&
      (!state.longestRoad || state.longestRoad.playerId !== topPlayerId)
    ) {
      state.longestRoad = { playerId: topPlayerId, length: topLength };
      log(state, `${newHolder.nickname} en uzun yolu aldı!`, topPlayerId);
    } else if (state.longestRoad?.playerId === topPlayerId) {
      state.longestRoad.length = topLength;
    }
  } else if (state.longestRoad) {
    // Nobody has it any more (e.g. road broken below threshold).
    state.longestRoad = null;
  }
}

function checkWinner(state: GameState) {
  for (const p of state.players) {
    const visiblePoints =
      countSettlementVP(state, p.id) +
      (state.longestRoad?.playerId === p.id ? 2 : 0) +
      (state.largestArmy?.playerId === p.id ? 2 : 0);
    const bonus = state.bonusVP[p.id] ?? 0;
    const total = visiblePoints + p.hiddenVictoryPoints + bonus;
    p.victoryPoints = total;
    if (total >= state.rules.victoryPointsToWin) {
      state.winnerId = p.id;
      state.phase = "finished";
      log(state, `${p.nickname} oyunu kazandı! 🏆`, p.id);
      return;
    }
  }
}

function countSettlementVP(state: GameState, playerId: string): number {
  let n = 0;
  for (const p of state.pieces) {
    if (p.kind === "settlement" && p.playerId === playerId) n += 1;
    else if (p.kind === "city" && p.playerId === playerId) n += 2;
  }
  return n;
}

// Setup phase: snake order. Round 1: index 0 -> last. Round 2: last -> 0.
function nextSetupTurn(state: GameState): {
  phase: GameState["phase"];
  index: number;
} {
  const n = state.players.length;
  if (state.phase === "setup_round_1") {
    if (state.currentPlayerIndex < n - 1) {
      return { phase: "setup_round_1", index: state.currentPlayerIndex + 1 };
    }
    return { phase: "setup_round_2", index: n - 1 };
  }
  // setup_round_2
  if (state.currentPlayerIndex > 0) {
    return { phase: "setup_round_2", index: state.currentPlayerIndex - 1 };
  }
  return { phase: "playing", index: 0 };
}

// Track which initial settlement a player just placed (for next-road validation).
function lastInitialSettlementVertex(
  state: GameState,
  playerId: string,
  round: 1 | 2,
): string | null {
  const settlements = state.pieces.filter(
    (p) => p.kind === "settlement" && p.playerId === playerId,
  );
  // Round 1: player has 1 settlement, may already have 1 road too.
  // Round 2: player has 2 settlements; the 2nd (most recent) is the relevant one.
  if (round === 1) {
    return settlements[0]?.kind === "settlement" ? settlements[0].vertexId : null;
  }
  return settlements[1]?.kind === "settlement" ? settlements[1].vertexId : null;
}

function setupRoundIndex(state: GameState): 1 | 2 {
  return state.phase === "setup_round_1" ? 1 : 2;
}

// Player has placed a settlement in setup — but not yet the matching road.
function setupNeedsRoad(state: GameState): boolean {
  const cp = currentPlayer(state);
  if (!cp) return false;
  const round = setupRoundIndex(state);
  const settlements = state.pieces.filter(
    (p) => p.kind === "settlement" && p.playerId === cp.id,
  );
  const roads = state.pieces.filter(
    (p) => p.kind === "road" && p.playerId === cp.id,
  );
  // Round 1: needs road if has 1 settlement and 0 roads.
  // Round 2: needs road if has 2 settlements and 1 road.
  if (round === 1) return settlements.length === 1 && roads.length === 0;
  return settlements.length === 2 && roads.length === 1;
}

function setupNeedsSettlement(state: GameState): boolean {
  const cp = currentPlayer(state);
  if (!cp) return false;
  const round = setupRoundIndex(state);
  const settlements = state.pieces.filter(
    (p) => p.kind === "settlement" && p.playerId === cp.id,
  );
  if (round === 1) return settlements.length === 0;
  return settlements.length === 1;
}

function grantSecondSettlementResources(state: GameState, playerId: string) {
  // After round 2 settlement, player gets 1 of each resource adjacent.
  const settlements = state.pieces.filter(
    (p) => p.kind === "settlement" && p.playerId === playerId,
  );
  const second = settlements[1];
  if (!second || second.kind !== "settlement") return;
  const vertexHexIdx = indexVertexToHexes(state);
  const hexById = indexHexes(state);
  const player = getPlayer(state, playerId);
  if (!player) return;
  const hexIds = vertexHexIdx.get(second.vertexId) ?? [];
  for (const hid of hexIds) {
    const hex = hexById.get(hid);
    if (!hex) continue;
    const r = hex.terrain;
    if (r === "desert" || r === "sea" || r === "fog") continue;
    if (r === "gold") {
      state.pendingGoldChoices.push({ playerId, hexId: hex.id });
      continue;
    }
    if ((state.bank[r] ?? 0) > 0) {
      player.resources[r] += 1;
      state.bank[r] -= 1;
    }
  }
}

// Roll 2d6.
function rollDice(rng?: () => number): [number, number] {
  const r = rng ?? Math.random;
  return [Math.floor(r() * 6) + 1, Math.floor(r() * 6) + 1];
}

/** Build a fresh 36-entry dice deck containing every (d1, d2) pair,
 *  shuffled. Used to seed the deck at game start and after each
 *  reshuffle (when the live deck shrinks to 12 cards). */
function makeDiceDeck(rng?: () => number): [number, number][] {
  const r = rng ?? Math.random;
  const deck: [number, number][] = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) deck.push([a, b]);
  }
  // Fisher-Yates shuffle.
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Colonist.io-style "balanced" dice: pull the next pair from the
 *  pre-shuffled deck. If the next pair would repeat the previous total,
 *  there's a 30% chance we skip past it (it stays in the deck and gets
 *  redrawn later) — that's the streak-softening tweak from their
 *  published algorithm. The deck is reshuffled when only 12 cards
 *  remain so streaks late in the cycle don't get too predictable.
 *
 *  Mutates state.diceDeck and state.lastRollTotal. */
function drawDice(state: GameState, rng?: () => number): [number, number] {
  const r = rng ?? Math.random;
  if (!state.diceDeck || state.diceDeck.length === 0) {
    state.diceDeck = makeDiceDeck(rng);
  }
  // Decide which entry to pop. We may skip ahead a few entries to
  // dampen streaks; if every candidate matches the previous total we
  // give up and just take the first one.
  const last = state.lastRollTotal;
  let idx = 0;
  if (last !== null) {
    for (let i = 0; i < state.diceDeck.length; i++) {
      const [a, b] = state.diceDeck[i];
      if (a + b !== last) {
        idx = i;
        break;
      }
      // Same-total candidate — keep with 30% probability (i.e. take
      // it as-is) so the streak protection isn't absolute.
      if (r() < 0.3) {
        idx = i;
        break;
      }
    }
  }
  const pair = state.diceDeck[idx];
  state.diceDeck.splice(idx, 1);
  state.lastRollTotal = pair[0] + pair[1];
  // Reshuffle when the remaining deck is small enough that the
  // distribution would otherwise look noticeably skewed.
  if (state.diceDeck.length <= 12) {
    state.diceDeck = makeDiceDeck(rng);
  }
  return pair;
}

// Build the dev card deck. Standard Catan: 14 knight, 5 VP, 2 road, 2 yop, 2 mono = 25.
// For 7-8 player games we double the deck.
function buildDevDeck(playerCount: number): DevelopmentCard[] {
  const counts: Record<DevelopmentCard, number> = {
    knight: 14,
    victory_point: 5,
    road_building: 2,
    year_of_plenty: 2,
    monopoly: 2,
  };
  const multiplier = playerCount >= 7 ? 2 : 1;
  const deck: DevelopmentCard[] = [];
  for (const [k, n] of Object.entries(counts)) {
    for (let i = 0; i < n * multiplier; i++) {
      deck.push(k as DevelopmentCard);
    }
  }
  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Determine the best (lowest) bank trade ratio a player can use for a given resource.
// Default 4:1, port "any" (3:1), or specific port (2:1).
export function bestBankRatio(state: GameState, playerId: string, give: Resource): number {
  let best = 4;
  const playerVerts = new Set(
    state.pieces
      .filter(
        (p) =>
          (p.kind === "settlement" || p.kind === "city") &&
          p.playerId === playerId,
      )
      .map((p) => (p as { vertexId: string }).vertexId),
  );
  if (playerVerts.size === 0) return best;
  // For each port, find the two endpoint vertices of its edge; if any is owned by player.
  for (const port of state.ports) {
    const endpoints = edgeEndpointVerticesForEdgeId(state, port.edgeId);
    if (!endpoints.some((v) => playerVerts.has(v))) continue;
    if (port.kind === "any") {
      best = Math.min(best, 3);
    } else if ((port.kind as PortKind) === give) {
      best = Math.min(best, 2);
    }
  }
  return best;
}

// Helper that goes from edgeId back to its two vertex endpoints.
function edgeEndpointVerticesForEdgeId(state: GameState, edgeId: string): string[] {
  for (const h of state.hexes) {
    const edges = hexEdgeIds(h.coord);
    const sideIdx = edges.indexOf(edgeId);
    if (sideIdx < 0) continue;
    return edgeEndpointVertices(h.coord, sideIdx);
  }
  return [];
}

// When a player builds a road/ship that touches a fog hex, that fog hex is
// revealed: a random terrain is drawn (weighted toward standard resources)
// and assigned, plus a random number token. The explorer also gets +1 of the
// newly revealed resource if the hex is land.
//
// Returns the list of hex ids that were revealed (for logging/audit).
function autoRevealFogHexes(state: GameState, playerId: string): string[] {
  const revealed: string[] = [];
  // Fog hexes touched by the player's pieces. We compute the set by walking
  // every piece they own and looking at each adjacent hex.
  const hexById = indexHexes(state);
  const vertexHexIdx = indexVertexToHexes(state);
  const edgeHexIdx = indexEdgeToHexes(state);
  const touched = new Set<string>();
  for (const piece of state.pieces) {
    if (piece.playerId !== playerId) continue;
    if (piece.kind === "settlement" || piece.kind === "city") {
      for (const hid of vertexHexIdx.get(piece.vertexId) ?? []) {
        const h = hexById.get(hid);
        if (h?.hidden) touched.add(hid);
      }
    } else if (
      piece.kind === "road" ||
      piece.kind === "ship" ||
      piece.kind === "warship"
    ) {
      for (const hid of edgeHexIdx.get(piece.edgeId) ?? []) {
        const h = hexById.get(hid);
        if (h?.hidden) touched.add(hid);
      }
    }
  }
  if (touched.size === 0) return revealed;
  // Reveal each touched fog hex with a random terrain. We use a simple uniform
  // pick over standard resources, with a small chance of sea/desert/gold for
  // variety.
  const FOG_REVEAL_TABLE: Array<[HexTerrain, number]> = [
    ["wood", 5],
    ["wheat", 5],
    ["sheep", 5],
    ["brick", 4],
    ["ore", 4],
    ["gold", 1],
    ["sea", 2],
    ["desert", 1],
  ];
  const total = FOG_REVEAL_TABLE.reduce((a, [, w]) => a + w, 0);
  for (const hid of touched) {
    const hex = hexById.get(hid);
    if (!hex) continue;
    let pick = Math.random() * total;
    let terrain: HexTerrain = "sheep";
    for (const [t, w] of FOG_REVEAL_TABLE) {
      pick -= w;
      if (pick <= 0) {
        terrain = t;
        break;
      }
    }
    let token: number | null = null;
    if (
      terrain !== "desert" &&
      terrain !== "sea" &&
      terrain !== "fog"
    ) {
      // Pick a random non-7 token uniformly. Could be biased, but good enough.
      const tokens = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
      token = tokens[Math.floor(Math.random() * tokens.length)];
    }
    // Mutate the hex directly. (We could route through a REVEAL_FOG_HEX
    // action but that adds a round-trip with no gameplay benefit since the
    // randomness is server-authoritative anyway.)
    hex.terrain = terrain;
    hex.numberToken = token;
    hex.hidden = false;
    revealed.push(hid);
    const player = getPlayer(state, playerId);
    if (
      player &&
      terrain !== "sea" &&
      terrain !== "desert" &&
      terrain !== "fog" &&
      terrain !== "gold"
    ) {
      const r = terrain as Resource;
      if ((state.bank[r] ?? 0) > 0) {
        player.resources[r] += 1;
        state.bank[r] -= 1;
      }
      log(
        state,
        `${player.nickname} sis hex'i açtı: ${r} keşfedildi (+1 ${r}).`,
        player.id,
      );
    } else if (player) {
      log(
        state,
        `${player.nickname} sis hex'i açtı: ${terrain}.`,
        player.id,
      );
    }
  }
  return revealed;
}

// Award the desert-crossing bonus once: the player's first piece on the
// "south" island (or "north", whichever is opposite their home island)
// triggers a one-time bonus on the Through-Desert template.
function maybeAwardDesertCrossingBonus(
  state: GameState,
  playerId: string,
  vertexId: string,
) {
  const template = getMapTemplate(state.mapTemplateId);
  const bonus = template.desertCrossingBonusVP;
  if (bonus <= 0) return;
  const vertexHexIdx = indexVertexToHexes(state);
  const hexById = indexHexes(state);
  const hexIds = vertexHexIdx.get(vertexId) ?? [];
  let touchIsland: string | undefined;
  for (const hid of hexIds) {
    const hex = hexById.get(hid);
    if (!hex) continue;
    if (hex.terrain === "sea" || hex.terrain === "desert") continue;
    touchIsland = hex.islandId;
    if (touchIsland) break;
  }
  if (!touchIsland) return;
  if (touchIsland !== "north" && touchIsland !== "south") return;
  // Find player's home island (their first settlement).
  const myPieces = state.pieces.filter(
    (p) =>
      (p.kind === "settlement" || p.kind === "city") && p.playerId === playerId,
  );
  if (myPieces.length === 0) return;
  const firstHexes =
    vertexHexIdx.get((myPieces[0] as { vertexId: string }).vertexId) ?? [];
  let homeIsland: string | undefined;
  for (const hid of firstHexes) {
    const h = hexById.get(hid);
    if (h && (h.islandId === "north" || h.islandId === "south")) {
      homeIsland = h.islandId;
      break;
    }
  }
  if (!homeIsland) return;
  if (homeIsland === touchIsland) return;
  const awardKey = `${playerId}:desert_crossed`;
  if (state.bonusVP[awardKey]) return;
  state.bonusVP[awardKey] = bonus;
  state.bonusVP[playerId] = (state.bonusVP[playerId] ?? 0) + bonus;
  const player = getPlayer(state, playerId);
  log(
    state,
    `${player?.nickname ?? "Oyuncu"} çölü geçti! +${bonus} GP`,
    playerId,
  );
}

// If the map template grants a "first foreign-island settlement" bonus, and
// this is the player's first settlement on this island (other than their
// "home"), grant the configured bonus VP.
function maybeAwardIslandBonus(
  state: GameState,
  playerId: string,
  vertexId: string,
) {
  const template = getMapTemplate(state.mapTemplateId);
  const bonus = template.foreignIslandBonusVP;
  if (bonus <= 0) return;
  // Find the islandId of the hex at this vertex (any of the 3 will do; pick
  // a non-sea one).
  const vertexHexIdx = indexVertexToHexes(state);
  const hexById = indexHexes(state);
  const hexIds = vertexHexIdx.get(vertexId) ?? [];
  let islandId: string | undefined;
  for (const hid of hexIds) {
    const hex = hexById.get(hid);
    if (!hex) continue;
    if (hex.terrain === "sea") continue;
    islandId = hex.islandId;
    if (islandId) break;
  }
  if (!islandId || islandId === "sea") return;
  // Find the player's first settlement (the very first piece they ever
  // placed) and read its island. If this new vertex is on a different one,
  // we award the bonus, but only ONCE per (player, island).
  const myPieces = state.pieces.filter(
    (p) =>
      (p.kind === "settlement" || p.kind === "city") &&
      p.playerId === playerId,
  );
  if (myPieces.length === 0) return;
  // First piece's island
  const firstHexes =
    vertexHexIdx.get((myPieces[0] as { vertexId: string }).vertexId) ?? [];
  let homeIsland: string | undefined;
  for (const hid of firstHexes) {
    const h = hexById.get(hid);
    if (h && h.terrain !== "sea" && h.islandId) {
      homeIsland = h.islandId;
      break;
    }
  }
  if (!homeIsland) return;
  if (homeIsland === islandId) return;
  // Already awarded for this island?
  const awardKey = `${playerId}:${islandId}`;
  // We track per-(player, island) awards in bonusVP using composite keys.
  // The numeric VP we add to the player is summed under the player id only
  // (so the existing checkWinner sum still works); the awardKey simply
  // prevents double-awarding by storing a sentinel under itself.
  if (state.bonusVP[awardKey]) return;
  state.bonusVP[awardKey] = bonus;
  state.bonusVP[playerId] = (state.bonusVP[playerId] ?? 0) + bonus;
  const player = getPlayer(state, playerId);
  log(
    state,
    `${player?.nickname ?? "Oyuncu"} yeni adada ilk yerleşimi! +${bonus} GP`,
    playerId,
  );
}

// Players (other than mover) who have at least one settlement/city on this hex AND >0 cards.
function robberyVictims(
  state: GameState,
  hexId: string,
  excludePlayerId: string,
): string[] {
  const vertexHexIdx = indexVertexToHexes(state);
  const candidates = new Set<string>();
  for (const piece of state.pieces) {
    if (piece.kind !== "settlement" && piece.kind !== "city") continue;
    if (piece.playerId === excludePlayerId) continue;
    const hexIds = vertexHexIdx.get(piece.vertexId) ?? [];
    if (!hexIds.includes(hexId)) continue;
    const player = getPlayer(state, piece.playerId);
    if (!player) continue;
    if (totalCards(player) <= 0) continue;
    candidates.add(piece.playerId);
  }
  return [...candidates];
}

// Stealing for robber move.
function stealResource(
  state: GameState,
  thiefId: string,
  victimId: string,
): Resource | null {
  const victim = getPlayer(state, victimId);
  const thief = getPlayer(state, thiefId);
  if (!victim || !thief) return null;
  const pool: Resource[] = [];
  for (const [r, n] of Object.entries(victim.resources)) {
    for (let i = 0; i < n; i++) pool.push(r as Resource);
  }
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  const stolen = pool[idx];
  victim.resources[stolen] -= 1;
  thief.resources[stolen] += 1;
  return stolen;
}

export function reduce(prev: GameState, action: GameAction): ReducerResult {
  const state = clone(prev);

  switch (action.type) {
    case "START_GAME": {
      if (state.phase !== "lobby") return fail("not_in_lobby");
      if (state.players.length < 2) return fail("not_enough_players");

      const candidates =
        action.difficulty === "easy"
          ? 500
          : action.difficulty === "hard"
          ? 1
          : 200;
      const board = generateBoard({
        playerCount: state.players.length,
        seed: action.seed,
        candidates,
        mapTemplateId: action.mapTemplateId,
      });
      const template = getMapTemplate(action.mapTemplateId);
      state.hexes = board.hexes;
      state.ports = board.ports;
      state.robberHexId = board.robberHexId;
      state.mapTemplateId = action.mapTemplateId;
      // Pirate starts somewhere on a sea hex if the template uses one.
      if (template.hasPirate) {
        const seaHex = state.hexes.find((h) => h.terrain === "sea");
        state.pirateHexId = seaHex?.id ?? null;
      } else {
        state.pirateHexId = null;
      }
      // Fortresses: any hex flagged with a "fortress_*" islandId becomes a
      // 3-HP neutral fortress the players can attack with warships.
      state.fortresses = state.hexes
        .filter((h) => (h.islandId ?? "").startsWith("fortress_"))
        .map((h) => ({ hexId: h.id, ownerId: null, hpRemaining: 3 }));
      state.pendingGoldChoices = [];
      state.phase = "setup_round_1";
      state.subPhase = "main";
      state.currentPlayerIndex = 0;
      state.devDeck = buildDevDeck(state.players.length);
      // Fresh balanced-dice deck for this game.
      state.diceDeck = makeDiceDeck();
      state.lastRollTotal = null;

      // Scale resource bank to the board / player count. Classic 19-hex board
      // ships 19 of each. We give roughly the same per-resource-hex ratio so
      // larger boards don't run out instantly.
      const resourceHexCount = state.hexes.filter(
        (h) =>
          h.terrain !== "desert" && h.terrain !== "sea" && h.terrain !== "fog",
      ).length;
      const bankPerKind = Math.max(19, Math.round(resourceHexCount * 1.1));
      state.bank = {
        wood: bankPerKind,
        brick: bankPerKind,
        wheat: bankPerKind,
        sheep: bankPerKind,
        ore: bankPerKind,
      };
      state.rules.bankResourceCount = bankPerKind;

      // Apply player-count rule tuning.
      if (state.players.length >= 5 && state.players.length <= 6) {
        // 5-6 players: classic Catan 5-6 extension keeps 10 VP, but each
        // player gets 6 settlements + 16 roads (vs base 5/15).
        state.rules.maxSettlements = 6;
        state.rules.maxRoads = 16;
        for (const p of state.players) {
          p.settlementsRemaining = 6;
          p.roadsRemaining = 16;
        }
      } else if (state.players.length >= 7) {
        // 7-8 players: longer game, more pieces per player.
        state.rules.victoryPointsToWin = 12;
        state.rules.maxSettlements = 6;
        state.rules.maxRoads = 18;
        state.rules.longestRoadThreshold = 6;
        for (const p of state.players) {
          p.settlementsRemaining = 6;
          p.roadsRemaining = 18;
        }
      }

      // Map template adjustments — ships, victory threshold override, etc.
      if (template.hasShips) {
        state.rules.maxShips = 15;
        for (const p of state.players) p.shipsRemaining = 15;
      } else {
        state.rules.maxShips = 0;
        for (const p of state.players) p.shipsRemaining = 0;
      }
      if (template.victoryPointsToWin) {
        state.rules.victoryPointsToWin = template.victoryPointsToWin;
      }
      state.bonusVP = {};

      // Apply difficulty modifiers, if specified by the lobby host.
      const difficulty = action.difficulty ?? state.difficulty ?? "normal";
      state.difficulty = difficulty;
      if (difficulty === "easy") {
        // Faster games + extra-balanced board (already enforced by candidate
        // count tweak in generateBoard call below), and a cheaper VP target.
        state.rules.victoryPointsToWin = Math.max(
          8,
          state.rules.victoryPointsToWin - 2,
        );
      } else if (difficulty === "hard") {
        state.rules.victoryPointsToWin = state.rules.victoryPointsToWin + 2;
      }

      // Host VP override wins over everything else — if the lobby
      // settings explicitly set a target, ignore template defaults,
      // player-count scaling AND difficulty bumps so the host gets
      // exactly the game length they wanted.
      const vpOverride = state.settings.victoryPointsToWin;
      if (typeof vpOverride === "number" && vpOverride >= 3) {
        state.rules.victoryPointsToWin = Math.min(20, Math.floor(vpOverride));
      }

      // Setup phase doesn't use the turn timer (placements are short and the
      // human can think). Activate it once we move into "playing".
      state.turnDeadlineMs = null;
      state.tradeDeadlineMs = null;
      state.discardDeadlineMs = null;

      log(
        state,
        `Oyun başladı (${state.players.length} oyuncu, zorluk: ${difficulty}, ${state.hexes.length} hex).`,
      );
      return { ok: true, state };
    }

    case "PLACE_INITIAL_SETTLEMENT": {
      if (state.phase !== "setup_round_1" && state.phase !== "setup_round_2")
        return fail("wrong_phase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (!setupNeedsSettlement(state)) return fail("settlement_not_needed");

      const valid = isValidSettlementPlacement(
        state,
        action.vertexId,
        action.playerId,
        true,
      );
      if (!valid.ok) return fail(valid.reason ?? "invalid_settlement");

      state.pieces.push({
        kind: "settlement",
        vertexId: action.vertexId,
        playerId: action.playerId,
      });
      cp.settlementsRemaining -= 1;
      log(state, `${cp.nickname} ilk yerleşim yerini koydu.`, cp.id);

      // After round-2 settlement, distribute resources.
      if (state.phase === "setup_round_2") {
        grantSecondSettlementResources(state, action.playerId);
      }
      maybeAwardIslandBonus(state, cp.id, action.vertexId);
      maybeAwardDesertCrossingBonus(state, cp.id, action.vertexId);
      autoRevealFogHexes(state, cp.id);
      return { ok: true, state };
    }

    case "PLACE_INITIAL_ROAD": {
      if (state.phase !== "setup_round_1" && state.phase !== "setup_round_2")
        return fail("wrong_phase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (!setupNeedsRoad(state)) return fail("road_not_needed");

      const round = setupRoundIndex(state);
      const attachVertex = lastInitialSettlementVertex(state, cp.id, round);
      if (!attachVertex) return fail("no_attach_vertex");

      const valid = isValidRoadPlacement(
        state,
        action.edgeId,
        action.playerId,
        true,
        attachVertex,
      );
      if (!valid.ok) return fail(valid.reason ?? "invalid_road");

      state.pieces.push({
        kind: "road",
        edgeId: action.edgeId,
        playerId: action.playerId,
      });
      cp.roadsRemaining -= 1;
      log(state, `${cp.nickname} ilk yolunu koydu.`, cp.id);
      autoRevealFogHexes(state, cp.id);

      // Advance setup turn.
      const next = nextSetupTurn(state);
      state.phase = next.phase;
      state.currentPlayerIndex = next.index;
      if (state.phase === "playing") {
        state.subPhase = "awaiting_roll";
        state.turnDeadlineMs = nextTurnDeadline(state);
        log(state, "Setup tamamlandı. Oyun başlıyor.");
      }
      return { ok: true, state };
    }

    case "ROLL_DICE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "awaiting_roll") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      // Pull from the colonist.io-style balanced deck. action.dice
      // override is still honoured for tests that need a fixed roll.
      const dice = action.dice ?? drawDice(state);
      state.diceRoll = dice;
      const total = dice[0] + dice[1];
      log(state, `${cp.nickname} ${total} attı (${dice[0]} + ${dice[1]}).`, cp.id);

      if (total === 7) {
        // Trigger discards if any player has > 7 cards.
        const discarders = state.players.filter((p) => totalCards(p) > 7);
        if (discarders.length > 0) {
          state.subPhase = "discarding";
          state.discardDeadlineMs = nextDiscardDeadline(state);
        } else {
          state.subPhase = "moving_robber";
        }
      } else {
        distributeResources(state, total);
        state.subPhase = "main";
      }
      return { ok: true, state };
    }

    case "DISCARD_CARDS": {
      if (state.subPhase !== "discarding") return fail("not_discarding");
      const player = getPlayer(state, action.playerId);
      if (!player) return fail("no_player");
      const required = Math.floor(totalCards(player) / 2);
      const total = Object.values(action.cards).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      if (total !== required) return fail("wrong_discard_count");
      // Validate enough cards.
      for (const [r, n] of Object.entries(action.cards)) {
        if ((player.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_cards");
      }
      for (const [r, n] of Object.entries(action.cards)) {
        player.resources[r as Resource] -= n ?? 0;
        state.bank[r as Resource] += n ?? 0;
      }
      log(state, `${player.nickname} ${total} kart attı.`, player.id);

      // Are there other discarders left?
      const remaining = state.players.filter((p) => totalCards(p) > 7);
      if (remaining.length === 0) {
        state.subPhase = "moving_robber";
        state.discardDeadlineMs = null;
      }
      return { ok: true, state };
    }

    case "MOVE_ROBBER": {
      if (state.subPhase !== "moving_robber") return fail("not_moving_robber");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const target = state.hexes.find((h) => h.id === action.hexId);
      if (!target) return fail("no_such_hex");
      if (target.id === state.robberHexId) return fail("must_move");
      if (target.terrain === "sea" || target.terrain === "fog")
        return fail("invalid_hex");

      state.robberHexId = action.hexId;
      log(state, `${cp.nickname} hırsızı taşıdı.`, cp.id);

      // Find candidate victims: players (other than mover) with a settlement/city on this hex AND >0 cards.
      const victimIds = robberyVictims(state, target.id, cp.id);
      if (victimIds.length === 0) {
        state.subPhase = "main";
      } else if (victimIds.length === 1) {
        // Auto-steal from the only candidate.
        const stolen = stealResource(state, cp.id, victimIds[0]);
        const victim = getPlayer(state, victimIds[0]);
        if (stolen && victim) {
          log(
            state,
            `${cp.nickname} ${victim.nickname} oyuncusundan 1 kart çaldı.`,
            cp.id,
          );
        }
        state.subPhase = "main";
      } else {
        state.subPhase = "stealing";
      }
      return { ok: true, state };
    }

    case "STEAL_RESOURCE": {
      if (state.subPhase !== "stealing") return fail("not_stealing");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (!state.robberHexId) return fail("no_robber_hex");
      const candidates = robberyVictims(state, state.robberHexId, cp.id);
      if (!candidates.includes(action.victimId)) return fail("invalid_victim");
      const stolen = stealResource(state, cp.id, action.victimId);
      const victim = getPlayer(state, action.victimId);
      if (stolen && victim) {
        log(
          state,
          `${cp.nickname} ${victim.nickname} oyuncusundan 1 kart çaldı.`,
          cp.id,
        );
      }
      state.subPhase = "main";
      return { ok: true, state };
    }

    case "BUILD_SETTLEMENT": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.settlementsRemaining <= 0) return fail("no_settlements_left");

      const valid = isValidSettlementPlacement(
        state,
        action.vertexId,
        action.playerId,
        false,
      );
      if (!valid.ok) return fail(valid.reason ?? "invalid_settlement");

      const cost = BUILD_COSTS.settlement;
      // Check resources first
      for (const [r, n] of Object.entries(cost)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_resources");
      }
      payCost(cp, cost);
      refundToBank(state, cost);

      state.pieces.push({
        kind: "settlement",
        vertexId: action.vertexId,
        playerId: action.playerId,
      });
      cp.settlementsRemaining -= 1;
      log(state, `${cp.nickname} bir yerleşim yeri kurdu.`, cp.id);
      maybeAwardIslandBonus(state, cp.id, action.vertexId);
      maybeAwardDesertCrossingBonus(state, cp.id, action.vertexId);
      autoRevealFogHexes(state, cp.id);
      updateLongestRoad(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "BUILD_CITY": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.citiesRemaining <= 0) return fail("no_cities_left");

      // Find the settlement to upgrade.
      const settlementIdx = state.pieces.findIndex(
        (p) =>
          p.kind === "settlement" &&
          p.vertexId === action.vertexId &&
          p.playerId === action.playerId,
      );
      if (settlementIdx < 0) return fail("no_settlement_to_upgrade");

      const cost = BUILD_COSTS.city;
      for (const [r, n] of Object.entries(cost)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_resources");
      }
      payCost(cp, cost);
      refundToBank(state, cost);

      state.pieces[settlementIdx] = {
        kind: "city",
        vertexId: action.vertexId,
        playerId: action.playerId,
      };
      cp.settlementsRemaining += 1; // settlement returns to supply
      cp.citiesRemaining -= 1;
      log(state, `${cp.nickname} yerleşimi şehre yükseltti.`, cp.id);
      checkWinner(state);
      return { ok: true, state };
    }

    case "BUILD_ROAD": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.roadsRemaining <= 0) return fail("no_roads_left");

      const valid = isValidRoadPlacement(
        state,
        action.edgeId,
        action.playerId,
        false,
      );
      if (!valid.ok) return fail(valid.reason ?? "invalid_road");

      const cost = BUILD_COSTS.road;
      for (const [r, n] of Object.entries(cost)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_resources");
      }
      payCost(cp, cost);
      refundToBank(state, cost);

      state.pieces.push({
        kind: "road",
        edgeId: action.edgeId,
        playerId: action.playerId,
      });
      cp.roadsRemaining -= 1;
      log(state, `${cp.nickname} bir yol kurdu.`, cp.id);
      autoRevealFogHexes(state, cp.id);
      updateLongestRoad(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "BUILD_SHIP": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (state.rules.maxShips <= 0) return fail("ships_not_allowed");
      if (cp.shipsRemaining <= 0) return fail("no_ships_left");

      const valid = isValidShipPlacement(state, action.edgeId, action.playerId);
      if (!valid.ok) return fail(valid.reason ?? "invalid_ship");

      const cost = BUILD_COSTS.ship;
      for (const [r, n] of Object.entries(cost)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_resources");
      }
      payCost(cp, cost);
      refundToBank(state, cost);

      state.pieces.push({
        kind: "ship",
        edgeId: action.edgeId,
        playerId: action.playerId,
        placedThisTurn: true,
      });
      cp.shipsRemaining -= 1;
      log(state, `${cp.nickname} bir gemi yaptı.`, cp.id);
      autoRevealFogHexes(state, cp.id);
      updateLongestRoad(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "MOVE_SHIP": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const idx = state.pieces.findIndex(
        (p) =>
          p.kind === "ship" &&
          p.edgeId === action.fromEdgeId &&
          p.playerId === cp.id,
      );
      if (idx < 0) return fail("no_ship_to_move");
      const ship = state.pieces[idx] as Extract<
        BuiltPiece,
        { kind: "ship" }
      >;
      if (ship.placedThisTurn) return fail("ship_placed_this_turn");
      // "Open ship" rule (Seafarers): only ships at the END of a chain can
      // move. A ship is open if at least one of its endpoint vertices has no
      // other connecting friendly piece (settlement/city/road/ship/warship)
      // beyond this ship itself.
      const endpoints = edgeEndpoints(state, ship.edgeId);
      let isOpen = false;
      for (const v of endpoints) {
        // Friendly settlement/city anchors the chain — that vertex is closed.
        const occupant = pieceAtVertex(state, v);
        if (occupant?.playerId === cp.id) continue;
        // Count friendly pieces on edges incident to this vertex (excluding
        // the ship itself).
        const incidentEdges = edgesAtVertex(state, v).filter(
          (e) => e !== ship.edgeId,
        );
        const hasFriendlyConnection = incidentEdges.some((e) => {
          const piece = pieceAtEdge(state, e);
          return (
            piece &&
            piece.playerId === cp.id &&
            (piece.kind === "ship" ||
              piece.kind === "warship" ||
              piece.kind === "road")
          );
        });
        if (!hasFriendlyConnection) {
          // This endpoint is "open" — the ship hangs free on this side.
          isOpen = true;
          break;
        }
      }
      if (!isOpen) return fail("ship_not_open");
      // Validate destination as if a fresh ship were placed there, but ignore
      // the fact that the source ship currently occupies its old edge by
      // temporarily removing it.
      state.pieces.splice(idx, 1);
      const valid = isValidShipPlacement(
        state,
        action.toEdgeId,
        action.playerId,
      );
      if (!valid.ok) {
        // Re-insert the ship before returning so state is unchanged on failure.
        state.pieces.splice(idx, 0, ship);
        return fail(valid.reason ?? "invalid_ship_destination");
      }
      state.pieces.push({
        kind: "ship",
        edgeId: action.toEdgeId,
        playerId: action.playerId,
        placedThisTurn: true,
      });
      log(state, `${cp.nickname} bir gemiyi taşıdı.`, cp.id);
      autoRevealFogHexes(state, cp.id);
      updateLongestRoad(state);
      return { ok: true, state };
    }

    case "ATTACK_FORTRESS": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const fortress = state.fortresses.find((f) => f.hexId === action.hexId);
      if (!fortress) return fail("no_fortress");
      if (fortress.ownerId === cp.id) return fail("already_owned");
      // Player must have a warship adjacent to the fortress hex.
      const edgesByHex = indexEdgeToHexes(state);
      const myWarships = state.pieces.filter(
        (p): p is Extract<BuiltPiece, { kind: "warship" }> =>
          p.kind === "warship" && p.playerId === cp.id,
      );
      const adjacent = myWarships.some((w) => {
        const hexes = edgesByHex.get(w.edgeId) ?? [];
        return hexes.includes(fortress.hexId);
      });
      if (!adjacent) return fail("no_adjacent_warship");
      // Both sides roll 1d6: attacker hits if their roll is strictly greater.
      // Tie defends (favors the entrenched fortress).
      const attackRoll = Math.floor(Math.random() * 6) + 1;
      const defenseRoll = Math.floor(Math.random() * 6) + 1;
      if (attackRoll > defenseRoll) {
        fortress.hpRemaining -= 1;
        if (fortress.hpRemaining <= 0) {
          fortress.ownerId = cp.id;
          fortress.hpRemaining = 3; // reset for the new owner to defend
          state.bonusVP[cp.id] = (state.bonusVP[cp.id] ?? 0) + 2;
          log(
            state,
            `${cp.nickname} kaleyi ele geçirdi! Sald: ${attackRoll} - Sav: ${defenseRoll} (+2 GP)`,
            cp.id,
          );
        } else {
          log(
            state,
            `${cp.nickname} kaleyi vurdu (Sald: ${attackRoll} - Sav: ${defenseRoll}). Can: ${fortress.hpRemaining}/3`,
            cp.id,
          );
        }
      } else {
        log(
          state,
          `${cp.nickname} kale saldırısı başarısız (Sald: ${attackRoll} - Sav: ${defenseRoll}).`,
          cp.id,
        );
      }
      checkWinner(state);
      return { ok: true, state };
    }

    case "CHOOSE_GOLD_RESOURCE": {
      const idx = state.pendingGoldChoices.findIndex(
        (c) => c.playerId === action.playerId,
      );
      if (idx < 0) return fail("no_pending_gold");
      if ((state.bank[action.resource] ?? 0) <= 0)
        return fail("bank_empty_for_resource");
      const player = getPlayer(state, action.playerId);
      if (!player) return fail("no_player");
      player.resources[action.resource] += 1;
      state.bank[action.resource] -= 1;
      state.pendingGoldChoices.splice(idx, 1);
      log(
        state,
        `${player.nickname} altın tarladan ${action.resource} aldı.`,
        player.id,
      );
      return { ok: true, state };
    }

    case "REVEAL_FOG_HEX": {
      const hex = state.hexes.find((h) => h.id === action.hexId);
      if (!hex) return fail("no_such_hex");
      if (!hex.hidden) return fail("not_hidden");
      hex.terrain = action.revealedTerrain;
      hex.numberToken = action.numberToken;
      hex.hidden = false;
      const player = getPlayer(state, action.playerId);
      // Reward the explorer with one of the newly-revealed resource on a
      // land hex. Sea/desert/gold/fog reveal nothing.
      if (
        player &&
        action.revealedTerrain !== "sea" &&
        action.revealedTerrain !== "desert" &&
        action.revealedTerrain !== "fog" &&
        action.revealedTerrain !== "gold"
      ) {
        const r = action.revealedTerrain as Resource;
        if ((state.bank[r] ?? 0) > 0) {
          player.resources[r] += 1;
          state.bank[r] -= 1;
        }
        log(
          state,
          `${player.nickname} sis hex'i açtı: ${r} keşfedildi (+1 ${r}).`,
          player.id,
        );
      } else {
        log(state, `Sis hex'i açıldı: ${action.revealedTerrain}.`);
      }
      return { ok: true, state };
    }

    case "UPGRADE_TO_WARSHIP": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const idx = state.pieces.findIndex(
        (p) =>
          p.kind === "ship" &&
          p.edgeId === action.edgeId &&
          p.playerId === cp.id,
      );
      if (idx < 0) return fail("no_ship_at_edge");
      // Must spend a knight card (treated like playing one but stays in
      // played pile so largest army still tracks).
      if (cp.hasPlayedDevThisTurn) return fail("already_played_dev");
      const knightIdx = cp.devCards.available.indexOf("knight");
      if (knightIdx < 0) return fail("no_knight_card");
      cp.devCards.available.splice(knightIdx, 1);
      cp.devCards.played.push("knight");
      cp.knightsPlayed += 1;
      cp.hasPlayedDevThisTurn = true;
      // Replace ship with warship.
      const oldShip = state.pieces[idx] as Extract<BuiltPiece, { kind: "ship" }>;
      state.pieces[idx] = {
        kind: "warship",
        edgeId: oldShip.edgeId,
        playerId: oldShip.playerId,
      };
      log(state, `${cp.nickname} bir gemiyi savaş gemisine yükseltti.`, cp.id);
      updateLargestArmy(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "MOVE_PIRATE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "moving_robber")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const target = state.hexes.find((h) => h.id === action.hexId);
      if (!target) return fail("no_such_hex");
      if (target.terrain !== "sea") return fail("pirate_must_be_at_sea");
      if (target.id === state.pirateHexId) return fail("must_move");
      state.pirateHexId = action.hexId;
      log(state, `${cp.nickname} korsanı taşıdı.`, cp.id);
      // Find ships adjacent to this sea hex and steal from one of those owners.
      const edges = state.pieces.filter(
        (p): p is Extract<BuiltPiece, { kind: "ship" }> =>
          p.kind === "ship" && p.playerId !== cp.id,
      );
      const edgesByHex = indexEdgeToHexes(state);
      const candidates = new Set<string>();
      for (const ship of edges) {
        const hexIds = edgesByHex.get(ship.edgeId) ?? [];
        if (hexIds.includes(target.id)) {
          const victim = getPlayer(state, ship.playerId);
          if (victim && totalCards(victim) > 0) candidates.add(ship.playerId);
        }
      }
      const victims = [...candidates];
      if (victims.length === 0) {
        state.subPhase = "main";
      } else if (victims.length === 1) {
        const stolen = stealResource(state, cp.id, victims[0]);
        const victim = getPlayer(state, victims[0]);
        if (stolen && victim) {
          log(
            state,
            `${cp.nickname} ${victim.nickname} oyuncusunun gemisinden 1 kart çaldı.`,
            cp.id,
          );
        }
        state.subPhase = "main";
      } else {
        state.subPhase = "stealing";
      }
      return { ok: true, state };
    }

    case "BANK_TRADE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (action.give === action.receive) return fail("same_resource");
      const ratio = bestBankRatio(state, cp.id, action.give);
      if ((cp.resources[action.give] ?? 0) < ratio)
        return fail("not_enough_to_trade");
      if ((state.bank[action.receive] ?? 0) < 1)
        return fail("bank_empty");
      cp.resources[action.give] -= ratio;
      state.bank[action.give] += ratio;
      cp.resources[action.receive] += 1;
      state.bank[action.receive] -= 1;
      log(
        state,
        `${cp.nickname} banka ile takas: ${ratio}${RESOURCE_EMOJI[action.give]} → 1${RESOURCE_EMOJI[action.receive]}.`,
        cp.id,
      );
      return { ok: true, state };
    }

    case "OFFER_TRADE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main" && state.subPhase !== "trading")
        return fail("wrong_subphase");
      if (state.settings && !state.settings.allowPlayerTrades)
        return fail("player_trades_disabled");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const giveTotal = Object.values(action.give).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      const recvTotal = Object.values(action.receive).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      if (giveTotal === 0 || recvTotal === 0) return fail("empty_trade");
      // Validate offerer has the resources they want to give.
      for (const [r, n] of Object.entries(action.give)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_to_give");
      }
      // Pre-reject any player who doesn't physically have what the
      // offerer is asking for. Saves them from having to click "Reddet"
      // on an offer they couldn't honour anyway, and lets the offerer
      // see at a glance which seats are still in play.
      const autoRejected: string[] = [];
      for (const p of state.players) {
        if (p.id === cp.id) continue;
        for (const [r, n] of Object.entries(action.receive)) {
          const need = n ?? 0;
          if (need <= 0) continue;
          if ((p.resources[r as Resource] ?? 0) < need) {
            autoRejected.push(p.id);
            break;
          }
        }
      }
      state.pendingTrade = {
        fromPlayerId: cp.id,
        give: { ...action.give },
        receive: { ...action.receive },
        acceptedBy: [],
        rejectedBy: autoRejected,
      };
      state.subPhase = "trading";
      state.tradeDeadlineMs = nextTradeDeadline(state);
      log(
        state,
        `${cp.nickname} ticaret teklifi: ${formatResourceMap(action.give)} → ${formatResourceMap(action.receive)}.`,
        cp.id,
      );
      // Edge case: every other player was auto-rejected. The trade is
      // dead on arrival; clear it so the offerer doesn't have to wait
      // for the timeout. (Mirrors the "all rejected" path in
      // REJECT_TRADE_OFFER.)
      const otherConnected = state.players.filter(
        (p) => p.id !== cp.id && p.connected,
      );
      if (
        otherConnected.length > 0 &&
        otherConnected.every((p) => autoRejected.includes(p.id))
      ) {
        state.pendingTrade = null;
        state.tradeDeadlineMs = null;
        if (state.subPhase === "trading") state.subPhase = "main";
        log(
          state,
          "Hiçbir oyuncu istenen kaynağa sahip değil — teklif iptal edildi.",
        );
      }
      return { ok: true, state };
    }

    case "ACCEPT_TRADE_OFFER": {
      if (!state.pendingTrade) return fail("no_pending_trade");
      const player = getPlayer(state, action.playerId);
      if (!player) return fail("no_player");
      if (player.id === state.pendingTrade.fromPlayerId)
        return fail("offerer_cannot_accept");
      // Check if player can fulfill the receive side.
      for (const [r, n] of Object.entries(state.pendingTrade.receive)) {
        if ((player.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_to_receive");
      }
      if (!state.pendingTrade.acceptedBy.includes(player.id)) {
        state.pendingTrade.acceptedBy.push(player.id);
        // Remove from rejectedBy if present
        state.pendingTrade.rejectedBy = state.pendingTrade.rejectedBy.filter(
          (id) => id !== player.id,
        );
      }
      log(state, `${player.nickname} teklifi kabul ediyor.`, player.id);
      return { ok: true, state };
    }

    case "REJECT_TRADE_OFFER": {
      if (!state.pendingTrade) return fail("no_pending_trade");
      const player = getPlayer(state, action.playerId);
      if (!player) return fail("no_player");
      if (player.id === state.pendingTrade.fromPlayerId)
        return fail("offerer_cannot_reject");
      if (!state.pendingTrade.rejectedBy.includes(player.id)) {
        state.pendingTrade.rejectedBy.push(player.id);
        state.pendingTrade.acceptedBy = state.pendingTrade.acceptedBy.filter(
          (id) => id !== player.id,
        );
      }
      log(state, `${player.nickname} teklifi reddetti.`, player.id);
      // If every other player has rejected, the offer is dead — clear it
      // automatically so the offerer doesn't have to hit "İptal et".
      const otherPlayers = state.players.filter(
        (p) => p.id !== state.pendingTrade!.fromPlayerId && p.connected,
      );
      const allRejected = otherPlayers.every((p) =>
        state.pendingTrade!.rejectedBy.includes(p.id),
      );
      if (otherPlayers.length > 0 && allRejected) {
        state.pendingTrade = null;
        state.tradeDeadlineMs = null;
        if (state.subPhase === "trading") state.subPhase = "main";
        log(state, "Teklif tüm oyuncular tarafından reddedildi.");
      }
      return { ok: true, state };
    }

    case "FINALIZE_TRADE": {
      if (!state.pendingTrade) return fail("no_pending_trade");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (state.pendingTrade.fromPlayerId !== cp.id)
        return fail("not_your_offer");
      if (!state.pendingTrade.acceptedBy.includes(action.partnerId))
        return fail("partner_did_not_accept");
      const partner = getPlayer(state, action.partnerId);
      if (!partner) return fail("no_partner");

      // Re-validate resources both ways.
      for (const [r, n] of Object.entries(state.pendingTrade.give)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("offerer_not_enough");
      }
      for (const [r, n] of Object.entries(state.pendingTrade.receive)) {
        if ((partner.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("partner_not_enough");
      }

      // Execute swap.
      for (const [r, n] of Object.entries(state.pendingTrade.give)) {
        cp.resources[r as Resource] -= n ?? 0;
        partner.resources[r as Resource] += n ?? 0;
      }
      for (const [r, n] of Object.entries(state.pendingTrade.receive)) {
        partner.resources[r as Resource] -= n ?? 0;
        cp.resources[r as Resource] += n ?? 0;
      }
      log(
        state,
        `${cp.nickname} ↔ ${partner.nickname} ticaret tamamlandı.`,
        cp.id,
      );
      state.pendingTrade = null;
      state.tradeDeadlineMs = null;
      state.subPhase = "main";
      return { ok: true, state };
    }

    case "CANCEL_TRADE": {
      if (!state.pendingTrade) return fail("no_pending_trade");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (state.pendingTrade.fromPlayerId !== cp.id)
        return fail("not_your_offer");
      log(state, `${cp.nickname} ticaret teklifini iptal etti.`, cp.id);
      state.pendingTrade = null;
      state.tradeDeadlineMs = null;
      state.subPhase = "main";
      return { ok: true, state };
    }

    case "BUY_DEV_CARD": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (state.devDeck.length === 0) return fail("deck_empty");
      for (const [r, n] of Object.entries(DEV_CARD_COST)) {
        if ((cp.resources[r as Resource] ?? 0) < (n ?? 0))
          return fail("not_enough_resources");
      }
      payCost(cp, DEV_CARD_COST);
      refundToBank(state, DEV_CARD_COST);
      const card = state.devDeck.shift()!;
      cp.devCards.pendingFromTurn.push(card);
      if (card === "victory_point") {
        cp.hiddenVictoryPoints += 1;
      }
      log(state, `${cp.nickname} bir gelişme kartı aldı.`, cp.id);
      checkWinner(state);
      return { ok: true, state };
    }

    case "PLAY_KNIGHT": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main" && state.subPhase !== "awaiting_roll")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.hasPlayedDevThisTurn) return fail("already_played_dev");
      const idx = cp.devCards.available.indexOf("knight");
      if (idx < 0) return fail("no_knight_card");
      const target = state.hexes.find((h) => h.id === action.hexId);
      if (!target) return fail("no_such_hex");
      if (target.terrain === "fog") return fail("invalid_hex");
      const isSea = target.terrain === "sea";
      if (isSea && target.id === state.pirateHexId) return fail("must_move");
      if (!isSea && target.id === state.robberHexId) return fail("must_move");

      cp.devCards.available.splice(idx, 1);
      cp.devCards.played.push("knight");
      cp.knightsPlayed += 1;
      cp.hasPlayedDevThisTurn = true;

      let victims: string[] = [];
      if (isSea) {
        // Knight at sea moves the pirate, steals from a ship-owner adjacent
        // to the new pirate hex.
        state.pirateHexId = action.hexId;
        log(state, `${cp.nickname} şövalye oynadı, korsanı taşıdı.`, cp.id);
        const edgesByHex = indexEdgeToHexes(state);
        const candidates = new Set<string>();
        for (const piece of state.pieces) {
          if (piece.kind !== "ship" && piece.kind !== "warship") continue;
          if (piece.playerId === cp.id) continue;
          const hexIds = edgesByHex.get(piece.edgeId) ?? [];
          if (!hexIds.includes(target.id)) continue;
          const victim = getPlayer(state, piece.playerId);
          if (!victim || totalCards(victim) <= 0) continue;
          candidates.add(piece.playerId);
        }
        victims = [...candidates];
      } else {
        state.robberHexId = action.hexId;
        log(state, `${cp.nickname} şövalye oynadı, hırsızı taşıdı.`, cp.id);
        victims = robberyVictims(state, target.id, cp.id);
      }

      if (victims.length === 0) {
        // Stay in current subphase (main or awaiting_roll).
      } else if (victims.length === 1) {
        const stolen = stealResource(state, cp.id, victims[0]);
        const victim = getPlayer(state, victims[0]);
        if (stolen && victim) {
          log(
            state,
            `${cp.nickname} ${victim.nickname} oyuncusundan 1 kart çaldı.`,
            cp.id,
          );
        }
      } else {
        state.subPhase = "stealing";
      }
      // Update largest army.
      updateLargestArmy(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "PLAY_ROAD_BUILDING": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.hasPlayedDevThisTurn) return fail("already_played_dev");
      const idx = cp.devCards.available.indexOf("road_building");
      if (idx < 0) return fail("no_card");
      if (action.edgeIds.length === 0 || action.edgeIds.length > 2)
        return fail("must_be_1_or_2_edges");
      if (cp.roadsRemaining < action.edgeIds.length)
        return fail("not_enough_roads_left");

      // Validate placements sequentially (placing first may enable second).
      const tentative = clone(state);
      const tentativePlayer = tentative.players.find((p) => p.id === cp.id)!;
      for (const eId of action.edgeIds) {
        const v = isValidRoadPlacement(tentative, eId, cp.id, false);
        if (!v.ok) return fail(v.reason ?? "invalid_road");
        tentative.pieces.push({ kind: "road", edgeId: eId, playerId: cp.id });
        tentativePlayer.roadsRemaining -= 1;
      }

      // Apply on real state.
      cp.devCards.available.splice(idx, 1);
      cp.devCards.played.push("road_building");
      cp.hasPlayedDevThisTurn = true;
      for (const eId of action.edgeIds) {
        state.pieces.push({ kind: "road", edgeId: eId, playerId: cp.id });
        cp.roadsRemaining -= 1;
      }
      log(
        state,
        `${cp.nickname} yol yapımı oynadı (${action.edgeIds.length} yol).`,
        cp.id,
      );
      autoRevealFogHexes(state, cp.id);
      updateLongestRoad(state);
      checkWinner(state);
      return { ok: true, state };
    }

    case "PLAY_YEAR_OF_PLENTY": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.hasPlayedDevThisTurn) return fail("already_played_dev");
      const idx = cp.devCards.available.indexOf("year_of_plenty");
      if (idx < 0) return fail("no_card");
      if (action.resources.length !== 2) return fail("must_be_2_resources");
      for (const r of action.resources) {
        if ((state.bank[r] ?? 0) < 1) return fail("bank_empty_for_" + r);
      }
      cp.devCards.available.splice(idx, 1);
      cp.devCards.played.push("year_of_plenty");
      cp.hasPlayedDevThisTurn = true;
      // Apply distribution.
      for (const r of action.resources) {
        cp.resources[r] += 1;
        state.bank[r] -= 1;
      }
      log(
        state,
        `${cp.nickname} bereket yılı oynadı (${action.resources.join(", ")}).`,
        cp.id,
      );
      return { ok: true, state };
    }

    case "PLAY_MONOPOLY": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.hasPlayedDevThisTurn) return fail("already_played_dev");
      const idx = cp.devCards.available.indexOf("monopoly");
      if (idx < 0) return fail("no_card");
      cp.devCards.available.splice(idx, 1);
      cp.devCards.played.push("monopoly");
      cp.hasPlayedDevThisTurn = true;
      let total = 0;
      for (const p of state.players) {
        if (p.id === cp.id) continue;
        const n = p.resources[action.resource] ?? 0;
        cp.resources[action.resource] += n;
        p.resources[action.resource] = 0;
        total += n;
      }
      log(
        state,
        `${cp.nickname} tekel oynadı: ${action.resource} (${total} kart).`,
        cp.id,
      );
      return { ok: true, state };
    }

    case "END_TURN": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      // Move pendingFromTurn dev cards to available so they can be played next turn.
      cp.devCards.available.push(...cp.devCards.pendingFromTurn);
      cp.devCards.pendingFromTurn = [];
      cp.hasPlayedDevThisTurn = false;
      // Ships built or moved this turn become movable next turn.
      for (const piece of state.pieces) {
        if (
          (piece.kind === "ship" || piece.kind === "warship") &&
          piece.placedThisTurn
        ) {
          piece.placedThisTurn = false;
        }
      }

      state.currentPlayerIndex =
        (state.currentPlayerIndex + 1) % state.players.length;
      state.subPhase = "awaiting_roll";
      state.diceRoll = null;
      state.pendingTrade = null;
      state.tradeDeadlineMs = null;
      state.turnDeadlineMs = nextTurnDeadline(state);
      const next = currentPlayer(state);
      log(state, `Sıra ${next.nickname}'da.`, next.id);
      return { ok: true, state };
    }

    case "TIMER_END_TURN": {
      // Server-side timeout: just like END_TURN but anyone (the server) can
      // trigger it, and it works regardless of whose turn it is — typically
      // fires when a player AFK's during their main phase.
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main" && state.subPhase !== "awaiting_roll")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      // If they hadn't even rolled, just skip the turn — no resource handout.
      cp.devCards.available.push(...cp.devCards.pendingFromTurn);
      cp.devCards.pendingFromTurn = [];
      cp.hasPlayedDevThisTurn = false;
      state.currentPlayerIndex =
        (state.currentPlayerIndex + 1) % state.players.length;
      state.subPhase = "awaiting_roll";
      state.diceRoll = null;
      state.pendingTrade = null;
      state.tradeDeadlineMs = null;
      state.turnDeadlineMs = nextTurnDeadline(state);
      log(
        state,
        `${cp.nickname}'in süresi doldu, sıra atlandı.`,
        cp.id,
      );
      return { ok: true, state };
    }

    case "TIMER_CANCEL_TRADE": {
      if (!state.pendingTrade) return fail("no_pending_trade");
      const offerer = state.players.find(
        (p) => p.id === state.pendingTrade!.fromPlayerId,
      );
      log(
        state,
        `${offerer?.nickname ?? "Oyuncu"} ticaret teklifi süresi doldu.`,
      );
      state.pendingTrade = null;
      state.tradeDeadlineMs = null;
      if (state.subPhase === "trading") state.subPhase = "main";
      return { ok: true, state };
    }

    case "TIMER_FORCE_DISCARD": {
      if (state.subPhase !== "discarding") return fail("not_discarding");
      // For each player still over the limit, randomly discard the required
      // number of cards down to the cap.
      for (const p of state.players) {
        const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
        if (total <= 7) continue;
        const required = Math.floor(total / 2);
        let discarded = 0;
        while (discarded < required) {
          const pool: Resource[] = [];
          for (const [r, n] of Object.entries(p.resources)) {
            for (let i = 0; i < n; i++) pool.push(r as Resource);
          }
          if (pool.length === 0) break;
          const pick = pool[Math.floor(Math.random() * pool.length)];
          p.resources[pick] -= 1;
          state.bank[pick] += 1;
          discarded += 1;
        }
        log(
          state,
          `${p.nickname} süresi doldu, ${discarded} kart rastgele atıldı.`,
          p.id,
        );
      }
      state.discardDeadlineMs = null;
      state.subPhase = "moving_robber";
      return { ok: true, state };
    }
  }
}

// Public helper for UI: who can be stolen from on the current robber hex?
export function getRobberyVictims(
  state: GameState,
  hexId: string,
  excludePlayerId: string,
): string[] {
  return robberyVictims(state, hexId, excludePlayerId);
}

// Convenience: Iterate setup actions until next player who needs to place.
// Used by client to know what UI to show.
export function setupTurnInfo(state: GameState): {
  playerId: string;
  needs: "settlement" | "road" | null;
} | null {
  if (state.phase !== "setup_round_1" && state.phase !== "setup_round_2") return null;
  const cp = currentPlayer(state);
  if (!cp) return null;
  if (setupNeedsSettlement(state)) return { playerId: cp.id, needs: "settlement" };
  if (setupNeedsRoad(state)) return { playerId: cp.id, needs: "road" };
  return { playerId: cp.id, needs: null };
}

// Collect every vertex on the board (deduped).
function allBoardVertexIds(state: GameState): string[] {
  const set = new Set<string>();
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const v of hexVertexIds(h.coord)) set.add(v);
  }
  return [...set];
}

function allBoardEdgeIds(state: GameState): string[] {
  const set = new Set<string>();
  for (const h of state.hexes) {
    if (h.terrain === "sea" || h.terrain === "fog") continue;
    for (const e of hexEdgeIds(h.coord)) set.add(e);
  }
  return [...set];
}

// Same as `allBoardEdgeIds` but also walks every sea hex's edges, so
// open-water edges (both adjacent hexes are sea) are visible to ship
// placement. Roads use `allBoardEdgeIds`; ships need this one or the
// chain can never leave the coast.
function allBoardEdgeIdsIncludingSea(state: GameState): string[] {
  const set = new Set<string>();
  for (const h of state.hexes) {
    if (h.terrain === "fog") continue;
    for (const e of hexEdgeIds(h.coord)) set.add(e);
  }
  return [...set];
}

// Public: vertices where this player can legally place a NEW settlement right now.
export function getValidSettlementVertices(
  state: GameState,
  playerId: string,
  isInitial: boolean,
): string[] {
  return allBoardVertexIds(state).filter(
    (vId) =>
      isValidSettlementPlacement(state, vId, playerId, isInitial).ok,
  );
}

// Public: edges where this player can legally place a road right now.
// `attachVertex` is required for initial setup (the road must touch the just-placed
// settlement); for normal play pass undefined.
export function getValidRoadEdges(
  state: GameState,
  playerId: string,
  isInitial: boolean,
  attachVertex?: string,
): string[] {
  return allBoardEdgeIds(state).filter(
    (eId) =>
      isValidRoadPlacement(state, eId, playerId, isInitial, attachVertex).ok,
  );
}

// Public: edges where this player can place a ship right now.
export function getValidShipEdges(
  state: GameState,
  playerId: string,
): string[] {
  return allBoardEdgeIdsIncludingSea(state).filter(
    (eId) => isValidShipPlacement(state, eId, playerId).ok,
  );
}

// Public: hexes where the pirate can be moved (any sea hex except current).
export function getValidPirateHexes(state: GameState): string[] {
  return state.hexes
    .filter((h) => h.terrain === "sea" && h.id !== state.pirateHexId)
    .map((h) => h.id);
}

// Public: vertices where this player can upgrade a settlement to a city
// (must be the player's own existing settlement).
export function getValidCityVertices(
  state: GameState,
  playerId: string,
): string[] {
  const out: string[] = [];
  for (const p of state.pieces) {
    if (p.kind === "settlement" && p.playerId === playerId) {
      out.push(p.vertexId);
    }
  }
  return out;
}

// Public: hexes where the robber can be moved (anywhere except current and non-land).
export function getValidRobberHexes(state: GameState): string[] {
  return state.hexes
    .filter(
      (h) =>
        h.id !== state.robberHexId &&
        h.terrain !== "sea" &&
        h.terrain !== "fog",
    )
    .map((h) => h.id);
}

// Public: helper to know which initial settlement the player most recently placed.
// For setup road validation in the UI.
export function lastInitialSettlementForPlayer(
  state: GameState,
  playerId: string,
): string | null {
  const round = setupRoundIndex(state);
  return lastInitialSettlementVertex(state, playerId, round);
}
