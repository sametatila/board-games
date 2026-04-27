import type { TtrAction } from "./actions";
import {
  CARD_COLORS,
  TRAIN_COLORS,
  type CardColor,
  type CityId,
  type Route,
  type RouteId,
  type Ticket,
  type TtrPlayer,
  type TtrPlayerColor,
  type TtrState,
  type TtrSettings,
  TTR_DEFAULT_SETTINGS,
} from "./types";
import { CITIES } from "./data/cities";
import { ROUTES } from "./data/routes";
import { DESTINATION_TICKETS } from "./data/destinationTickets";

export type ReducerSuccess = { ok: true; state: TtrState };
export type ReducerError = { ok: false; error: string };
export type ReducerResult = ReducerSuccess | ReducerError;

const fail = (error: string): ReducerError => ({ ok: false, error });

const TRAINS_PER_PLAYER = 45;
const MARKET_SIZE = 5;
const FINAL_TRIGGER_THRESHOLD = 2; // ≤2 trains left
const POINT_TABLE: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 10,
  6: 15,
};
const LOCOMOTIVE_COUNT = 14;
const COLOR_CARD_COUNT = 12; // per non-locomotive colour

// --- helpers ---------------------------------------------------------------

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function emptyHand(): Record<CardColor, number> {
  const m = {} as Record<CardColor, number>;
  for (const c of CARD_COLORS) m[c] = 0;
  return m;
}

/**
 * Recompute the public-facing summary counts that mirror private
 * fields. Called after every mutation so the UI can trust the
 * count fields even when the server redacts the underlying lists.
 */
function syncCounts(state: TtrState): void {
  state.trainDeckCount = state.trainDeck.length;
  state.discardPileCount = state.discardPile.length;
  state.ticketDeckCount = state.ticketDeck.length;
  for (const p of state.players) {
    let total = 0;
    for (const c of CARD_COLORS) total += p.hand[c];
    p.handCount = total;
    p.ticketCount = p.tickets.length;
  }
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function nextLogId(state: TtrState): string {
  return `e${state.log.length + 1}`;
}

function log(state: TtrState, text: string, playerId?: string) {
  state.log = [
    ...state.log,
    { id: nextLogId(state), ts: Date.now(), text, playerId },
  ].slice(-300);
}

function getPlayer(state: TtrState, id: string): TtrPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

function currentPlayer(state: TtrState): TtrPlayer {
  return state.players[state.currentPlayerIndex];
}

function buildFreshDeck(): CardColor[] {
  const cards: CardColor[] = [];
  for (let i = 0; i < LOCOMOTIVE_COUNT; i++) cards.push("locomotive");
  for (const c of TRAIN_COLORS) {
    for (let i = 0; i < COLOR_CARD_COUNT; i++) cards.push(c);
  }
  return cards;
}

function reshuffleDiscardIfNeeded(state: TtrState, rng: () => number) {
  if (state.trainDeck.length === 0 && state.discardPile.length > 0) {
    state.trainDeck = shuffle(state.discardPile, rng);
    state.discardPile = [];
  }
}

/**
 * Refill empty market slots from the deck. After refilling, if the
 * market has ≥3 locomotives, dump all 5 to discard and refill again.
 * The rule re-applies (rare double dumps) until <3 locomotives or the
 * deck+discard cannot fill enough.
 */
function refillMarket(state: TtrState, rng: () => number) {
  // First: fill empties
  const fill = () => {
    for (let i = 0; i < MARKET_SIZE; i++) {
      if (state.market[i] === null) {
        if (state.trainDeck.length === 0) reshuffleDiscardIfNeeded(state, rng);
        const next = state.trainDeck.pop();
        state.market[i] = next ?? null;
      }
    }
  };
  fill();
  // Then: while ≥3 locomotives in market, dump and refill
  let safety = 5;
  while (safety-- > 0) {
    let locos = 0;
    let nonNull = 0;
    for (const c of state.market) {
      if (c !== null) {
        nonNull += 1;
        if (c === "locomotive") locos += 1;
      }
    }
    // Rule applies only if all 5 slots are filled and ≥3 locomotives.
    if (nonNull < MARKET_SIZE || locos < 3) break;
    // Dump all 5
    for (let i = 0; i < MARKET_SIZE; i++) {
      const c = state.market[i];
      if (c !== null) state.discardPile.push(c);
      state.market[i] = null;
    }
    fill();
  }
}

function dealTickets(state: TtrState, count: number): Ticket[] {
  const out: Ticket[] = [];
  for (let i = 0; i < count; i++) {
    const next = state.ticketDeck.shift();
    if (!next) break;
    out.push(next);
  }
  return out;
}

function returnTicketsToBottom(state: TtrState, tickets: Ticket[]) {
  state.ticketDeck.push(...tickets);
}

// --- public API ------------------------------------------------------------

export function buildInitialState(roomCode: string): TtrState {
  return {
    roomCode,
    phase: "lobby",
    subPhase: "main", // unused in lobby
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    trainDeck: [],
    trainDeckCount: 0,
    market: [null, null, null, null, null],
    discardPile: [],
    discardPileCount: 0,
    ticketDeck: [],
    ticketDeckCount: 0,
    claimedRoutes: {},
    finalRoundTriggered: false,
    finalRoundStartedAt: null,
    settings: { ...TTR_DEFAULT_SETTINGS },
    log: [],
    winnerId: null,
    finalScores: null,
  };
}

export function makeTtrPlayer(
  id: string,
  nickname: string,
  color: TtrPlayerColor,
  isHost: boolean,
): TtrPlayer {
  return {
    id,
    nickname,
    color,
    isHost,
    connected: true,
    hand: emptyHand(),
    handCount: 0,
    tickets: [],
    ticketCount: 0,
    pendingTickets: null,
    trainsLeft: TRAINS_PER_PLAYER,
    claimedRoutes: [],
    routeScore: 0,
  };
}

// --- Reducer ---------------------------------------------------------------

export function reduce(prev: TtrState, action: TtrAction): ReducerResult {
  const result = reduceInner(prev, action);
  // After every successful mutation, refresh public-facing counts so
  // `handCount`, `ticketCount`, `trainDeckCount`, etc. stay in sync
  // with the underlying private fields. The server uses these counts
  // when redacting state for opponents.
  if (result.ok) syncCounts(result.state);
  return result;
}

function reduceInner(prev: TtrState, action: TtrAction): ReducerResult {
  const state = clone(prev);
  // RNG for any actions that need to draw from the deck. Seed mixes
  // the room state so action handlers stay deterministic-per-state but
  // still feel random across sessions.
  const rng = makeRng((state.log.length + 1) * 1009 + state.trainDeck.length);

  switch (action.type) {
    case "TTR/SET_COLOR": {
      if (state.phase !== "lobby") return fail("not_in_lobby");
      const p = getPlayer(state, action.playerId);
      if (!p) return fail("no_such_player");
      if (state.players.some((q) => q.id !== p.id && q.color === action.color))
        return fail("color_taken");
      p.color = action.color;
      return { ok: true, state };
    }

    case "TTR/SET_SETTINGS": {
      if (state.phase !== "lobby") return fail("not_in_lobby");
      const p = getPlayer(state, action.playerId);
      if (!p?.isHost) return fail("not_host");
      state.settings = { ...state.settings, ...action.settings };
      return { ok: true, state };
    }

    case "TTR/RESET_ROOM": {
      const p = getPlayer(state, action.playerId);
      if (!p?.isHost) return fail("not_host");
      const next = buildInitialState(state.roomCode);
      next.players = state.players.map((pl) => ({
        ...pl,
        hand: emptyHand(),
        tickets: [],
        pendingTickets: null,
        trainsLeft: TRAINS_PER_PLAYER,
        claimedRoutes: [],
        routeScore: 0,
      }));
      next.settings = state.settings;
      log(next, "Oda sıfırlandı.");
      return { ok: true, state: next };
    }

    case "TTR/START_GAME": {
      if (state.phase !== "lobby") return fail("already_started");
      const host = getPlayer(state, action.playerId);
      if (!host?.isHost) return fail("not_host");
      if (state.players.length < 2) return fail("not_enough_players");
      if (state.players.length > 5) return fail("too_many_players");

      const seed = action.seed ?? Date.now();
      const startRng = makeRng(seed);

      state.trainDeck = shuffle(buildFreshDeck(), startRng);
      state.discardPile = [];
      state.market = [null, null, null, null, null];
      state.ticketDeck = shuffle(DESTINATION_TICKETS, startRng);

      // Deal 4 train cards to each player
      for (const p of state.players) {
        p.hand = emptyHand();
        for (let i = 0; i < 4; i++) {
          const c = state.trainDeck.pop();
          if (c) p.hand[c] += 1;
        }
        p.trainsLeft = TRAINS_PER_PLAYER;
        p.claimedRoutes = [];
        p.routeScore = 0;
        p.tickets = [];
        p.pendingTickets = dealTickets(state, 3);
      }

      // Open market (apply 3+ loco rule)
      refillMarket(state, startRng);

      state.turnOrder = shuffle(
        state.players.map((p) => p.id),
        startRng,
      );
      const byId = new Map(state.players.map((p) => [p.id, p]));
      state.players = state.turnOrder.map((id) => byId.get(id)!);
      state.currentPlayerIndex = 0;

      state.phase = "playing";
      state.subPhase = "initial_tickets";
      log(state, "Oyun başladı — herkes ilk görev kartlarını seçsin.");
      return { ok: true, state };
    }

    case "TTR/COMMIT_INITIAL_TICKETS": {
      if (state.phase !== "playing" || state.subPhase !== "initial_tickets")
        return fail("wrong_subphase");
      const p = getPlayer(state, action.playerId);
      if (!p) return fail("no_such_player");
      if (!p.pendingTickets) return fail("no_pending_tickets");
      const offered = p.pendingTickets;
      const keep = offered.filter((t) => action.keepIds.includes(t.id));
      const drop = offered.filter((t) => !action.keepIds.includes(t.id));
      if (keep.length < 2) return fail("must_keep_at_least_2");
      if (keep.length > offered.length) return fail("invalid_keep_set");
      p.tickets.push(...keep);
      returnTicketsToBottom(state, drop);
      p.pendingTickets = null;
      log(state, `${p.nickname} ${keep.length} görev seçti.`, p.id);

      // When everyone has committed, switch to main phase.
      const allDone = state.players.every((q) => q.pendingTickets === null);
      if (allDone) {
        state.subPhase = "main";
        log(state, `Sıra ${currentPlayer(state).nickname}'da.`);
      }
      return { ok: true, state };
    }

    case "TTR/DRAW_TRAIN": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main" && state.subPhase !== "drawing_train")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      const isFirstDraw = state.subPhase === "main";

      // Determine the card actually drawn.
      let drawn: CardColor | null = null;
      if (action.source.kind === "deck") {
        reshuffleDiscardIfNeeded(state, rng);
        drawn = state.trainDeck.pop() ?? null;
        if (!drawn) return fail("deck_empty");
      } else {
        const slot = action.source.slot;
        const c = state.market[slot];
        if (!c) return fail("empty_slot");
        // Rule: drawing a face-up locomotive on the SECOND draw is illegal.
        if (!isFirstDraw && c === "locomotive") return fail("locomotive_second_draw");
        state.market[slot] = null;
        drawn = c;
      }

      cp.hand[drawn] += 1;

      // After-draw bookkeeping
      refillMarket(state, rng);

      const drawnFaceUpLoco =
        action.source.kind === "market" && drawn === "locomotive";

      if (isFirstDraw && drawnFaceUpLoco) {
        // Whole turn was just a locomotive — end turn.
        log(state, `${cp.nickname} açık lokomotif aldı (tur sonu).`, cp.id);
        finishTurn(state);
      } else if (isFirstDraw) {
        // One more card to go.
        state.subPhase = "drawing_train";
      } else {
        // Second draw complete.
        log(state, `${cp.nickname} 2 tren kartı çekti.`, cp.id);
        finishTurn(state);
      }

      return { ok: true, state };
    }

    case "TTR/CLAIM_ROUTE": {
      if (state.phase !== "playing" || state.subPhase !== "main")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      const route = ROUTES.find((r) => r.id === action.routeId);
      if (!route) return fail("no_such_route");
      if (state.claimedRoutes[route.id]) return fail("already_claimed");

      // Parallel-route rule: at <4 player counts only one of the
      // parallel pair can be claimed at all. At 4-5 both are open but
      // the same player cannot claim both sides.
      if (route.parallelGroupId) {
        const parallels = ROUTES.filter(
          (r) => r.parallelGroupId === route.parallelGroupId && r.id !== route.id,
        );
        const playerCount = state.players.length;
        for (const par of parallels) {
          const owner = state.claimedRoutes[par.id];
          if (!owner) continue;
          if (playerCount < 4) return fail("parallel_locked_at_low_count");
          if (owner === cp.id) return fail("cannot_claim_both_parallels");
        }
      }

      // Trains check
      if (cp.trainsLeft < route.length) return fail("not_enough_trains");

      // Cards check: total (colour + locomotives) === route.length
      const cards = action.cards;
      let totalCards = 0;
      for (const c of CARD_COLORS) {
        const n = cards[c] ?? 0;
        if (n < 0) return fail("negative_card_count");
        if (n > cp.hand[c]) return fail("not_enough_cards");
        totalCards += n;
      }
      if (totalCards !== route.length) return fail("card_count_mismatch");

      // Color rule: at most ONE non-locomotive colour. For grey routes
      // the colour is whatever the player picked. For coloured routes
      // it must match.
      const colorsUsed = (Object.keys(cards) as CardColor[]).filter(
        (c) => (cards[c] ?? 0) > 0 && c !== "locomotive",
      );
      if (colorsUsed.length > 1) return fail("multiple_colours");
      if (colorsUsed.length === 1) {
        if (route.color !== "gray" && colorsUsed[0] !== route.color)
          return fail("color_mismatch");
      } else {
        // 0 colour cards used → all locomotives. Allowed for grey routes
        // and for coloured routes (locomotives are wild).
      }

      // Pay
      for (const c of CARD_COLORS) {
        const n = cards[c] ?? 0;
        cp.hand[c] -= n;
        for (let i = 0; i < n; i++) state.discardPile.push(c);
      }
      cp.trainsLeft -= route.length;
      cp.claimedRoutes.push(route.id);
      state.claimedRoutes[route.id] = cp.id;
      const points = POINT_TABLE[route.length] ?? 0;
      cp.routeScore += points;

      log(
        state,
        `${cp.nickname} ${route.fromCity}↔${route.toCity} (${route.length}) yolunu aldı (+${points}).`,
        cp.id,
      );

      // End trigger?
      if (!state.finalRoundTriggered && cp.trainsLeft <= FINAL_TRIGGER_THRESHOLD) {
        state.finalRoundTriggered = true;
        state.finalRoundStartedAt = state.currentPlayerIndex;
        log(
          state,
          `${cp.nickname} son tur tetikledi (${cp.trainsLeft} vagon kaldı).`,
          cp.id,
        );
      }

      finishTurn(state);
      return { ok: true, state };
    }

    case "TTR/DRAW_TICKETS": {
      if (state.phase !== "playing" || state.subPhase !== "main")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (state.ticketDeck.length === 0) return fail("ticket_deck_empty");

      cp.pendingTickets = dealTickets(state, 3);
      state.subPhase = "picking_tickets";
      log(state, `${cp.nickname} görev kartı çekiyor.`, cp.id);
      return { ok: true, state };
    }

    case "TTR/COMMIT_PICKED_TICKETS": {
      if (state.phase !== "playing" || state.subPhase !== "picking_tickets")
        return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (!cp.pendingTickets) return fail("no_pending_tickets");
      const offered = cp.pendingTickets;
      const keep = offered.filter((t) => action.keepIds.includes(t.id));
      const drop = offered.filter((t) => !action.keepIds.includes(t.id));
      if (keep.length < 1) return fail("must_keep_at_least_1");
      cp.tickets.push(...keep);
      returnTicketsToBottom(state, drop);
      cp.pendingTickets = null;
      log(state, `${cp.nickname} ${keep.length} görev tuttu.`, cp.id);
      finishTurn(state);
      return { ok: true, state };
    }
  }

  return fail("unknown_action");
}

// --- Turn management -------------------------------------------------------

function finishTurn(state: TtrState): void {
  const next = (state.currentPlayerIndex + 1) % state.turnOrder.length;
  state.currentPlayerIndex = next;
  state.subPhase = "main";

  // End-of-game check.
  if (
    state.finalRoundTriggered &&
    state.finalRoundStartedAt !== null &&
    next === state.finalRoundStartedAt
  ) {
    finalizeGame(state);
    return;
  }
}

// --- Final scoring --------------------------------------------------------

function citiesConnected(
  ownedRoutes: Route[],
  fromCity: CityId,
  toCity: CityId,
): boolean {
  if (fromCity === toCity) return true;
  const adj = new Map<CityId, CityId[]>();
  for (const r of ownedRoutes) {
    if (!adj.has(r.fromCity)) adj.set(r.fromCity, []);
    if (!adj.has(r.toCity)) adj.set(r.toCity, []);
    adj.get(r.fromCity)!.push(r.toCity);
    adj.get(r.toCity)!.push(r.fromCity);
  }
  // BFS
  const visited = new Set<CityId>([fromCity]);
  const queue: CityId[] = [fromCity];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === toCity) return true;
    for (const nxt of adj.get(cur) ?? []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  return false;
}

/**
 * Longest continuous path = max sum of route lengths along a trail
 * (each route used at most once, cities can be revisited). Implemented
 * as DFS over edges; fine for ≤45 trains worth of segments per player.
 */
function longestPath(ownedRoutes: Route[]): number {
  if (ownedRoutes.length === 0) return 0;
  // Adjacency: city -> list of {edgeIndex, otherCity, length}
  type Edge = { idx: number; other: CityId; len: number };
  const adj = new Map<CityId, Edge[]>();
  ownedRoutes.forEach((r, idx) => {
    if (!adj.has(r.fromCity)) adj.set(r.fromCity, []);
    if (!adj.has(r.toCity)) adj.set(r.toCity, []);
    adj.get(r.fromCity)!.push({ idx, other: r.toCity, len: r.length });
    adj.get(r.toCity)!.push({ idx, other: r.fromCity, len: r.length });
  });

  let best = 0;
  const used = new Array(ownedRoutes.length).fill(false);

  function dfs(city: CityId, total: number) {
    if (total > best) best = total;
    const neighbours = adj.get(city) ?? [];
    for (const e of neighbours) {
      if (used[e.idx]) continue;
      used[e.idx] = true;
      dfs(e.other, total + e.len);
      used[e.idx] = false;
    }
  }

  for (const startCity of adj.keys()) {
    dfs(startCity, 0);
  }
  return best;
}

function finalizeGame(state: TtrState): void {
  state.phase = "finished";

  // Per-player breakdown
  const breakdowns = state.players.map((p) => {
    const owned = p.claimedRoutes
      .map((rid) => ROUTES.find((r) => r.id === rid)!)
      .filter(Boolean);
    let ticketBonus = 0;
    let ticketPenalty = 0;
    let ticketsCompleted = 0;
    for (const t of p.tickets) {
      if (citiesConnected(owned, t.fromCity, t.toCity)) {
        ticketBonus += t.value;
        ticketsCompleted += 1;
      } else {
        ticketPenalty += t.value;
      }
    }
    const lp = longestPath(owned);
    return {
      playerId: p.id,
      routeScore: p.routeScore,
      ticketBonus,
      ticketPenalty,
      ticketsCompleted,
      ticketsTotal: p.tickets.length,
      longestPathBonus: 0,
      longestPathLength: lp,
      total: p.routeScore + ticketBonus - ticketPenalty,
    };
  });

  // Longest-path bonus: tied players each get +10
  const maxLp = Math.max(...breakdowns.map((b) => b.longestPathLength));
  if (maxLp > 0) {
    for (const b of breakdowns) {
      if (b.longestPathLength === maxLp) {
        b.longestPathBonus = 10;
        b.total += 10;
      }
    }
  }

  state.finalScores = breakdowns;

  // Tiebreak: highest total → most tickets completed → longest path
  // holder. If still tied, no winnerId named.
  let best = -Infinity;
  for (const b of breakdowns) best = Math.max(best, b.total);
  let winners = breakdowns.filter((b) => b.total === best);
  if (winners.length > 1) {
    const maxTickets = Math.max(...winners.map((w) => w.ticketsCompleted));
    winners = winners.filter((w) => w.ticketsCompleted === maxTickets);
  }
  if (winners.length > 1) {
    winners = winners.filter((w) => w.longestPathBonus > 0);
  }

  state.winnerId = winners.length === 1 ? winners[0].playerId : null;

  if (state.winnerId) {
    const w = state.players.find((p) => p.id === state.winnerId)!;
    log(state, `${w.nickname} oyunu kazandı.`, w.id);
  } else {
    log(state, "Oyun berabere bitti.");
  }
}

// --- Read helpers (UI uses these) ------------------------------------------

export function canClaimRoute(
  state: TtrState,
  player: TtrPlayer,
  routeId: RouteId,
): boolean {
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) return false;
  if (state.claimedRoutes[routeId]) return false;
  if (player.trainsLeft < route.length) return false;
  // Parallel-route claimability check
  if (route.parallelGroupId) {
    const playerCount = state.players.length;
    const others = ROUTES.filter(
      (r) => r.parallelGroupId === route.parallelGroupId && r.id !== route.id,
    );
    for (const o of others) {
      const owner = state.claimedRoutes[o.id];
      if (!owner) continue;
      if (playerCount < 4) return false;
      if (owner === player.id) return false;
    }
  }
  // Card check: does the player have enough of any single colour
  // (locomotives count as wild)?
  const locos = player.hand.locomotive;
  if (route.color === "gray") {
    for (const c of TRAIN_COLORS) {
      if (player.hand[c] + locos >= route.length) return true;
    }
    if (locos >= route.length) return true;
    return false;
  } else {
    return player.hand[route.color] + locos >= route.length;
  }
}

export function ROUTE_BY_ID(id: RouteId): Route | undefined {
  return ROUTES.find((r) => r.id === id);
}

export function ALL_ROUTES(): Route[] {
  return ROUTES;
}

export function ALL_CITIES() {
  return CITIES;
}
