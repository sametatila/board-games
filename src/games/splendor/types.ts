/**
 * Splendor — types & state shape.
 *
 * Reflects the official 2014 Asmodee/Space Cowboys rules:
 *   - 5 gem colours + gold (joker), played as tokens
 *   - 90 development cards across 3 tiers (40 + 30 + 20)
 *   - 10 nobles (3 prestige each), drawn (player count + 1)
 *   - 15 prestige to win; round completes after the trigger so all
 *     players play an equal number of turns
 */

export type Gem = "white" | "blue" | "green" | "red" | "black";
export type TokenColor = Gem | "gold";

export const GEMS: Gem[] = ["white", "blue", "green", "red", "black"];
export const TOKEN_COLORS: TokenColor[] = [...GEMS, "gold"];

/** A development card. Cost is gem-only (no gold cost); bonus is the
 *  permanent discount gem this card grants when bought. */
export type Card = {
  id: string;
  tier: 1 | 2 | 3;
  cost: Record<Gem, number>;
  bonus: Gem;
  prestige: number;
};

/** A noble visit tile: needs `requirement` permanent bonuses. */
export type Noble = {
  id: string;
  requirement: Record<Gem, number>;
  prestige: 3;
};

export type SplendorPlayerColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple"
  | "cyan"
  | "orange"
  | "pink";

export type SplendorPlayer = {
  id: string;
  nickname: string;
  color: SplendorPlayerColor;
  isHost: boolean;
  connected: boolean;

  /** Tokens currently held (gem + gold). */
  tokens: Record<TokenColor, number>;
  /** Bought (face-up) cards — visible to everyone. */
  bought: Card[];
  /** Reserved cards — only the owner sees the face. Up to 3. */
  reserved: Card[];
  /** Per-gem permanent bonus, derived from `bought`. Cached for ease. */
  bonus: Record<Gem, number>;
  /** Sum of `bought.prestige` + 3 per visited noble. */
  prestige: number;
  /** Nobles that have visited this player. */
  nobles: Noble[];
};

export type SplendorPhase = "lobby" | "playing" | "finished";

/** Sub-phase tracking sub-actions that pause the main turn loop:
 *   - `main`: waiting for the active player's primary action
 *   - `discarding`: active player must shed tokens to drop to ≤10
 *   - `picking_noble`: more than one noble newly eligible, pick one
 */
export type SplendorSubPhase = "main" | "discarding" | "picking_noble";

export type SplendorSettings = {
  /** Override prestige target. null = 15 (rules default). */
  prestigeToWin: number | null;
  /** Allow player chat in-game. */
  allowChat: boolean;
};

export const SPLENDOR_DEFAULT_SETTINGS: SplendorSettings = {
  prestigeToWin: null,
  allowChat: true,
};

export type SplendorLogEntry = {
  id: string;
  ts: number;
  text: string;
  playerId?: string;
};

export type SplendorState = {
  roomCode: string;
  phase: SplendorPhase;
  subPhase: SplendorSubPhase;
  players: SplendorPlayer[];
  turnOrder: string[];
  currentPlayerIndex: number;

  /** Bank: tokens still available to be taken. */
  tokens: Record<TokenColor, number>;

  /** Face-down decks per tier (top of deck = end of array). */
  decks: { 1: Card[]; 2: Card[]; 3: Card[] };
  /** Face-up market: 4 slots per tier. `null` means slot is empty (deck
   *  ran out). */
  market: { 1: (Card | null)[]; 2: (Card | null)[]; 3: (Card | null)[] };

  /** Noble tiles still available on the table. */
  nobles: Noble[];

  /** When set, the prestige threshold has been crossed; the game ends
   *  at the moment `currentPlayerIndex === lastRoundStartedAt`. */
  lastRoundTriggered: boolean;
  /** turnOrder index at which the trigger fired. We finish the round
   *  back at that index. */
  lastRoundStartedAt: number | null;

  settings: SplendorSettings;
  log: SplendorLogEntry[];
  winnerId: string | null;
};
