import type { SplendorAction } from "./actions";
import {
  GEMS,
  TOKEN_COLORS,
  type Card,
  type Gem,
  type Noble,
  type SplendorPlayer,
  type SplendorPlayerColor,
  type SplendorState,
  type SplendorSettings,
  type TokenColor,
  SPLENDOR_DEFAULT_SETTINGS,
} from "./types";
import { CARDS_TIER_1 } from "./data/cardsTier1";
import { CARDS_TIER_2 } from "./data/cardsTier2";
import { CARDS_TIER_3 } from "./data/cardsTier3";
import { NOBLES } from "./data/nobles";

export type ReducerSuccess = { ok: true; state: SplendorState };
export type ReducerError = { ok: false; error: string };
export type ReducerResult = ReducerSuccess | ReducerError;

const fail = (error: string): ReducerError => ({ ok: false, error });

const PRESTIGE_TO_WIN = 15;
const MARKET_SLOTS = 4;
const RESERVE_LIMIT = 3;
const TOKEN_HAND_LIMIT = 10;

// --- Helpers ----------------------------------------------------------------

function makeRng(seed: number): () => number {
  // Mulberry32 — small, deterministic, more-than-good-enough RNG.
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

function emptyTokenMap(): Record<TokenColor, number> {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
}

function emptyGemMap(): Record<Gem, number> {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 };
}

function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

function nextLogId(state: SplendorState): string {
  return `e${state.log.length + 1}`;
}

function log(state: SplendorState, text: string, playerId?: string) {
  state.log = [
    ...state.log,
    { id: nextLogId(state), ts: Date.now(), text, playerId },
  ].slice(-200);
}

function getPlayer(state: SplendorState, id: string): SplendorPlayer | undefined {
  return state.players.find((p) => p.id === id);
}

function currentPlayer(state: SplendorState): SplendorPlayer {
  return state.players[state.currentPlayerIndex];
}

function totalTokens(p: SplendorPlayer): number {
  return TOKEN_COLORS.reduce((sum, c) => sum + p.tokens[c], 0);
}

function recomputeBonusAndPrestige(p: SplendorPlayer) {
  p.bonus = emptyGemMap();
  for (const card of p.bought) p.bonus[card.bonus] += 1;
  const cardPrestige = p.bought.reduce((sum, c) => sum + c.prestige, 0);
  const noblePrestige = p.nobles.reduce((sum, n) => sum + n.prestige, 0);
  p.prestige = cardPrestige + noblePrestige;
}

function tokensPerGem(playerCount: number): number {
  if (playerCount <= 2) return 4;
  if (playerCount === 3) return 5;
  return 7; // 4+ players (rules cap at 4 but we allow more defensively)
}

function noblesForCount(playerCount: number): number {
  return Math.min(NOBLES.length, playerCount + 1);
}

function refillMarketSlot(state: SplendorState, tier: 1 | 2 | 3) {
  const row = state.market[tier];
  for (let i = 0; i < row.length; i++) {
    if (row[i] === null) {
      const next = state.decks[tier].pop() ?? null;
      row[i] = next;
    }
  }
}

function isAffordable(
  card: Card,
  player: SplendorPlayer,
  useGold: Partial<Record<Gem, number>> | undefined,
): { ok: true; spend: Record<Gem, number>; goldSpend: number } | { ok: false; reason: string } {
  // For each gem, the player must cover (cost - bonus). A negative or
  // zero residual costs nothing. Tokens of that gem cover first; gold
  // makes up the rest, capped by how many the player has.
  const spend: Record<Gem, number> = emptyGemMap();
  let goldSpend = 0;
  const goldHave = player.tokens.gold;
  let goldRemaining = goldHave;

  for (const g of GEMS) {
    const need = Math.max(0, card.cost[g] - player.bonus[g]);
    if (need === 0) continue;
    const have = player.tokens[g];
    const useFromColor = Math.min(have, need);
    const shortfall = need - useFromColor;
    spend[g] = useFromColor;
    if (shortfall > 0) {
      // Caller hint: useGold[g] caps how much joker is used here. If
      // omitted we just spend whatever's needed; if specified we
      // require it to match the shortfall.
      const hinted = useGold?.[g];
      const goldForThis = hinted !== undefined ? hinted : shortfall;
      if (goldForThis !== shortfall) {
        return { ok: false, reason: "useGold mismatch for " + g };
      }
      if (goldForThis > goldRemaining) {
        return { ok: false, reason: "not enough gold" };
      }
      goldRemaining -= goldForThis;
      goldSpend += goldForThis;
    }
  }
  return { ok: true, spend, goldSpend };
}

function eligibleNobles(state: SplendorState, p: SplendorPlayer): Noble[] {
  const result: Noble[] = [];
  for (const n of state.nobles) {
    let ok = true;
    for (const g of GEMS) {
      if (p.bonus[g] < n.requirement[g]) {
        ok = false;
        break;
      }
    }
    if (ok) result.push(n);
  }
  return result;
}

/**
 * Run the post-action sequence: discard if >10 tokens, then auto-visit
 * a noble (or trigger picking_noble if multiple), then check end-game,
 * then advance the turn. Mutates state in place.
 */
function finishTurn(state: SplendorState): void {
  const cp = currentPlayer(state);

  if (totalTokens(cp) > TOKEN_HAND_LIMIT) {
    state.subPhase = "discarding";
    return;
  }

  const eligible = eligibleNobles(state, cp);
  if (eligible.length === 1) {
    const n = eligible[0];
    cp.nobles.push(n);
    state.nobles = state.nobles.filter((x) => x.id !== n.id);
    recomputeBonusAndPrestige(cp);
    log(state, `${cp.nickname} ${n.id} soylusunun ziyaretini aldı (+3 prestij).`, cp.id);
  } else if (eligible.length > 1) {
    state.subPhase = "picking_noble";
    return;
  }

  checkEndAndAdvance(state);
}

function checkEndAndAdvance(state: SplendorState): void {
  // Trigger last round if any player has reached the prestige goal.
  // Per the official rules, the player who first reaches the target
  // finishes their current turn, then play continues until everyone
  // has played the same number of turns (i.e. play returns to that
  // same player). We record the trigger player's seat so we can stop
  // exactly when sıra ona geri gelir — without giving them a free
  // extra turn.
  const target = state.settings.prestigeToWin ?? PRESTIGE_TO_WIN;
  if (!state.lastRoundTriggered) {
    if (state.players.some((p) => p.prestige >= target)) {
      state.lastRoundTriggered = true;
      state.lastRoundStartedAt = state.currentPlayerIndex;
    }
  }

  // Advance the active player.
  const next = (state.currentPlayerIndex + 1) % state.turnOrder.length;
  state.currentPlayerIndex = next;
  state.subPhase = "main";

  // End-game check after rotation: the trigger player's seat coming up
  // again means everyone got an equal number of turns and the round
  // is complete.
  if (state.lastRoundTriggered && next === (state.lastRoundStartedAt ?? -1)) {
    finalizeGame(state);
  }
}

function finalizeGame(state: SplendorState): void {
  state.phase = "finished";

  // Tiebreak: highest prestige; if tie, fewest bought cards (Splendor
  // rule). If still tied, no winner is named (rules don't break it).
  let topPrestige = -Infinity;
  for (const p of state.players) topPrestige = Math.max(topPrestige, p.prestige);
  const candidates = state.players.filter((p) => p.prestige === topPrestige);
  let winners = candidates;
  if (candidates.length > 1) {
    const fewest = Math.min(...candidates.map((p) => p.bought.length));
    winners = candidates.filter((p) => p.bought.length === fewest);
  }
  state.winnerId = winners.length === 1 ? winners[0].id : null;

  if (state.winnerId) {
    const w = state.players.find((p) => p.id === state.winnerId)!;
    log(state, `${w.nickname} oyunu kazandı (${w.prestige} prestij).`, w.id);
  } else {
    log(state, `Oyun berabere bitti.`);
  }
}

// --- Public API -------------------------------------------------------------

export function buildInitialState(roomCode: string): SplendorState {
  return {
    roomCode,
    phase: "lobby",
    subPhase: "main",
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    tokens: emptyTokenMap(),
    decks: { 1: [], 2: [], 3: [] },
    market: { 1: [null, null, null, null], 2: [null, null, null, null], 3: [null, null, null, null] },
    nobles: [],
    lastRoundTriggered: false,
    lastRoundStartedAt: null,
    settings: { ...SPLENDOR_DEFAULT_SETTINGS },
    log: [],
    winnerId: null,
  };
}

export function makeSplendorPlayer(
  id: string,
  nickname: string,
  color: SplendorPlayerColor,
  isHost: boolean,
): SplendorPlayer {
  return {
    id,
    nickname,
    color,
    isHost,
    connected: true,
    tokens: emptyTokenMap(),
    bought: [],
    reserved: [],
    bonus: emptyGemMap(),
    prestige: 0,
    nobles: [],
  };
}

/**
 * Pure reducer. Returns either `{ ok: true, state }` with a fresh
 * mutated state, or `{ ok: false, error }` with a machine-readable
 * error code. `state` is never mutated when `ok` is false.
 */
export function reduce(
  prev: SplendorState,
  action: SplendorAction,
): ReducerResult {
  const state = clone(prev);

  switch (action.type) {
    case "SP/SET_COLOR": {
      if (state.phase !== "lobby") return fail("not_in_lobby");
      const p = getPlayer(state, action.playerId);
      if (!p) return fail("no_such_player");
      if (state.players.some((q) => q.id !== p.id && q.color === action.color))
        return fail("color_taken");
      p.color = action.color;
      return { ok: true, state };
    }

    case "SP/SET_SETTINGS": {
      if (state.phase !== "lobby") return fail("not_in_lobby");
      const p = getPlayer(state, action.playerId);
      if (!p?.isHost) return fail("not_host");
      state.settings = { ...state.settings, ...action.settings };
      return { ok: true, state };
    }

    case "SP/RESET_ROOM": {
      const p = getPlayer(state, action.playerId);
      if (!p?.isHost) return fail("not_host");
      const nextState = buildInitialState(state.roomCode);
      nextState.players = state.players.map((pl) => ({
        ...pl,
        tokens: emptyTokenMap(),
        bought: [],
        reserved: [],
        bonus: emptyGemMap(),
        prestige: 0,
        nobles: [],
      }));
      nextState.turnOrder = state.players.map((pl) => pl.id);
      nextState.settings = state.settings;
      log(nextState, "Oda sıfırlandı.");
      return { ok: true, state: nextState };
    }

    case "SP/START_GAME": {
      if (state.phase !== "lobby") return fail("already_started");
      const host = getPlayer(state, action.playerId);
      if (!host?.isHost) return fail("not_host");
      if (state.players.length < 2) return fail("not_enough_players");
      if (state.players.length > 4) return fail("too_many_players");

      const seed = action.seed ?? Date.now();
      const rng = makeRng(seed);

      // Bank tokens scale with player count (gold always 5).
      const perGem = tokensPerGem(state.players.length);
      state.tokens = {
        white: perGem,
        blue: perGem,
        green: perGem,
        red: perGem,
        black: perGem,
        gold: 5,
      };

      // Decks: shuffled, top-of-deck = end of array (so .pop() draws).
      state.decks[1] = shuffle(CARDS_TIER_1, rng);
      state.decks[2] = shuffle(CARDS_TIER_2, rng);
      state.decks[3] = shuffle(CARDS_TIER_3, rng);

      // Market: deal 4 face-up per tier.
      for (const tier of [1, 2, 3] as const) {
        state.market[tier] = [null, null, null, null];
        refillMarketSlot(state, tier);
      }

      // Nobles: pick (player count + 1).
      const nobleCount = noblesForCount(state.players.length);
      state.nobles = shuffle(NOBLES, rng).slice(0, nobleCount);

      // Turn order: shuffle players.
      state.turnOrder = shuffle(
        state.players.map((p) => p.id),
        rng,
      );
      // Reorder `players` to match turn order so `currentPlayerIndex`
      // is consistent across server/client.
      const byId = new Map(state.players.map((p) => [p.id, p]));
      state.players = state.turnOrder.map((id) => byId.get(id)!);
      state.currentPlayerIndex = 0;

      state.phase = "playing";
      state.subPhase = "main";
      log(state, "Oyun başladı.");
      return { ok: true, state };
    }

    // --- Main turn actions ---------------------------------------------

    case "SP/TAKE_3_DIFFERENT": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      const gems = action.gems;
      // Validate: all distinct, no gold, all available in bank.
      // Per the official 2014 Asmodee rulebook the player picks UP TO
      // 3 different gem colours. The action requires at least 1; the
      // upper bound shrinks to whatever distinct colours the bank
      // still has (so if only 2 colours are non-empty, you take 2).
      const distinct = new Set(gems);
      if (distinct.size !== gems.length) return fail("must_be_distinct");
      if (gems.length === 0 || gems.length > 3) return fail("invalid_count");
      for (const g of gems) {
        if (!GEMS.includes(g)) return fail("invalid_gem");
        if (state.tokens[g] <= 0) return fail("token_unavailable");
      }
      for (const g of gems) {
        state.tokens[g] -= 1;
        cp.tokens[g] += 1;
      }
      log(state, `${cp.nickname} ${gems.join(", ")} aldı.`, cp.id);
      finishTurn(state);
      return { ok: true, state };
    }

    case "SP/TAKE_2_SAME": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      const g = action.gem;
      if (!GEMS.includes(g)) return fail("invalid_gem");
      // Rule: bank must have ≥ 4 of that gem AT THE MOMENT.
      if (state.tokens[g] < 4) return fail("need_4_in_bank");
      state.tokens[g] -= 2;
      cp.tokens[g] += 2;
      log(state, `${cp.nickname} 2 ${g} aldı.`, cp.id);
      finishTurn(state);
      return { ok: true, state };
    }

    case "SP/RESERVE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");
      if (cp.reserved.length >= RESERVE_LIMIT) return fail("reserve_full");

      let card: Card | null = null;
      const src = action.source;
      if (src.kind === "market") {
        card = state.market[src.tier][src.slot];
        if (!card) return fail("empty_slot");
        state.market[src.tier][src.slot] = null;
        refillMarketSlot(state, src.tier);
      } else {
        const top = state.decks[src.tier].pop() ?? null;
        if (!top) return fail("deck_empty");
        card = top;
      }
      cp.reserved.push(card);

      // Take a gold token if any are left.
      if (state.tokens.gold > 0) {
        state.tokens.gold -= 1;
        cp.tokens.gold += 1;
      }

      log(state, `${cp.nickname} bir kart rezerve etti.`, cp.id);
      finishTurn(state);
      return { ok: true, state };
    }

    case "SP/PURCHASE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "main") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      const src = action.source;
      let card: Card | null = null;
      if (src.kind === "market") {
        card = state.market[src.tier][src.slot];
        if (!card) return fail("empty_slot");
      } else {
        if (src.index < 0 || src.index >= cp.reserved.length)
          return fail("no_reserved_at_index");
        card = cp.reserved[src.index];
      }

      const afford = isAffordable(card, cp, action.useGold);
      if (!afford.ok) return fail(afford.reason);

      // Pay tokens
      for (const g of GEMS) {
        cp.tokens[g] -= afford.spend[g];
        state.tokens[g] += afford.spend[g];
      }
      cp.tokens.gold -= afford.goldSpend;
      state.tokens.gold += afford.goldSpend;

      // Move card to bought
      if (src.kind === "market") {
        state.market[src.tier][src.slot] = null;
        refillMarketSlot(state, src.tier);
      } else {
        cp.reserved.splice(src.index, 1);
      }
      cp.bought.push(card);
      recomputeBonusAndPrestige(cp);

      log(
        state,
        `${cp.nickname} bir tier-${card.tier} kart aldı (+${card.prestige} prestij).`,
        cp.id,
      );
      finishTurn(state);
      return { ok: true, state };
    }

    // --- Sub-phase actions ---------------------------------------------

    case "SP/CHOOSE_DISCARD": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "discarding") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      let totalDiscard = 0;
      for (const c of TOKEN_COLORS) {
        const n = action.tokens[c] ?? 0;
        if (n < 0) return fail("negative_discard");
        if (n > cp.tokens[c]) return fail("not_enough_to_discard");
        totalDiscard += n;
      }
      const newTotal = totalTokens(cp) - totalDiscard;
      if (newTotal !== TOKEN_HAND_LIMIT) return fail("must_discard_to_10");

      for (const c of TOKEN_COLORS) {
        const n = action.tokens[c] ?? 0;
        cp.tokens[c] -= n;
        state.tokens[c] += n;
      }
      log(state, `${cp.nickname} fazla token attı.`, cp.id);

      // Move on to noble check.
      const eligible = eligibleNobles(state, cp);
      if (eligible.length === 1) {
        cp.nobles.push(eligible[0]);
        state.nobles = state.nobles.filter((x) => x.id !== eligible[0].id);
        recomputeBonusAndPrestige(cp);
        log(state, `${cp.nickname} bir soyluyu ağırladı (+3 prestij).`, cp.id);
        checkEndAndAdvance(state);
      } else if (eligible.length > 1) {
        state.subPhase = "picking_noble";
      } else {
        checkEndAndAdvance(state);
      }
      return { ok: true, state };
    }

    case "SP/CHOOSE_NOBLE": {
      if (state.phase !== "playing") return fail("wrong_phase");
      if (state.subPhase !== "picking_noble") return fail("wrong_subphase");
      const cp = currentPlayer(state);
      if (cp.id !== action.playerId) return fail("not_your_turn");

      const eligible = eligibleNobles(state, cp);
      const pick = eligible.find((n) => n.id === action.nobleId);
      if (!pick) return fail("not_eligible");
      cp.nobles.push(pick);
      state.nobles = state.nobles.filter((x) => x.id !== pick.id);
      recomputeBonusAndPrestige(cp);
      log(state, `${cp.nickname} bir soyluyu seçti (+3 prestij).`, cp.id);
      checkEndAndAdvance(state);
      return { ok: true, state };
    }
  }

  return fail("unknown_action");
}

// --- Read helpers (UI uses these) ------------------------------------------

export function canTakeTwoSame(state: SplendorState, gem: Gem): boolean {
  return state.tokens[gem] >= 4;
}

export function canReserve(player: SplendorPlayer): boolean {
  return player.reserved.length < RESERVE_LIMIT;
}

export function canAffordCard(
  card: Card,
  player: SplendorPlayer,
  useGold?: Partial<Record<Gem, number>>,
): boolean {
  return isAffordable(card, player, useGold).ok;
}

export function settingsClampedTarget(s: SplendorSettings): number {
  return s.prestigeToWin ?? PRESTIGE_TO_WIN;
}
