/**
 * Ticket to Ride (USA / Original) — types & state shape.
 *
 * Reflects the official 2004 / 2nd edition rules:
 *   - 110 train cards (96 colour + 14 locomotive)
 *   - 45 trains per player
 *   - 30 destination tickets, 30 cities, ~78 route segments
 *   - 14-card train market (5 face-up; auto-redeal if 3+ locomotives)
 *   - Drawing a face-up locomotive counts as the entire turn (1 card)
 *   - End trigger: any player drops to ≤2 trains; everyone gets one
 *     more turn including the trigger.
 *   - Final scoring: route points + completed tickets − unfinished
 *     tickets + longest continuous path (+10).
 */

export type TrainColor =
  | "purple"
  | "white"
  | "blue"
  | "yellow"
  | "orange"
  | "black"
  | "red"
  | "green";

export type CardColor = TrainColor | "locomotive";
/** Routes can also be "gray" — meaning any single colour can claim them. */
export type RouteColor = TrainColor | "gray";

export const TRAIN_COLORS: TrainColor[] = [
  "purple",
  "white",
  "blue",
  "yellow",
  "orange",
  "black",
  "red",
  "green",
];

export const CARD_COLORS: CardColor[] = [...TRAIN_COLORS, "locomotive"];

export type CityId = string;
export type RouteId = string;
export type TicketId = string;

export type City = {
  id: CityId;
  name: string;
  /** Map coordinates as percentages of the SVG viewbox (0–100). */
  x: number;
  y: number;
};

export type Route = {
  id: RouteId;
  fromCity: CityId;
  toCity: CityId;
  length: number;
  color: RouteColor;
  /** Routes that share a parallelGroupId form a "double route" — at
   *  2-3 player counts only one of them is claimable. */
  parallelGroupId?: string;
};

export type Ticket = {
  id: TicketId;
  fromCity: CityId;
  toCity: CityId;
  value: number;
};

export type TtrPlayerColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "black";

export type TtrPlayer = {
  id: string;
  nickname: string;
  color: TtrPlayerColor;
  isHost: boolean;
  connected: boolean;

  /** Train cards in hand — secret to other players. */
  hand: Record<CardColor, number>;
  /** Tickets in hand — secret. */
  tickets: Ticket[];
  /** When in `pending_initial_tickets` or `pending_extra_tickets`,
   *  the offered set the player must commit on. */
  pendingTickets: Ticket[] | null;
  trainsLeft: number;
  /** Routes the player has claimed (just the ids; lookup map is in state). */
  claimedRoutes: RouteId[];
  /** Score visible to everyone — only includes route points; ticket
   *  scoring is hidden until game end. */
  routeScore: number;
};

export type TtrPhase = "lobby" | "playing" | "finished";

/** Sub-phases describe what the active player is currently doing. */
export type TtrSubPhase =
  | "initial_tickets" // every player picks initial tickets (parallel)
  | "main"            // active player chooses an action
  | "drawing_train"   // active player has drawn 1 card, owes the 2nd
  | "picking_tickets"; // active player drew tickets, must commit

export type TtrSettings = {
  /** Allow chat in-game. */
  allowChat: boolean;
};

export const TTR_DEFAULT_SETTINGS: TtrSettings = {
  allowChat: true,
};

export type TtrLogEntry = {
  id: string;
  ts: number;
  text: string;
  playerId?: string;
};

export type TtrState = {
  roomCode: string;
  phase: TtrPhase;
  subPhase: TtrSubPhase;
  players: TtrPlayer[];
  turnOrder: string[];
  currentPlayerIndex: number;

  /** Face-down train deck (top = end of array → .pop() draws). */
  trainDeck: CardColor[];
  /** Five face-up cards (null = empty if both deck and discard are dry). */
  market: (CardColor | null)[];
  /** Discard pile, shuffled back when the deck runs out. */
  discardPile: CardColor[];
  /** Face-down ticket deck (used cards go to the bottom). */
  ticketDeck: Ticket[];

  /** routeId → ownerPlayerId. */
  claimedRoutes: Record<RouteId, string>;

  /** Triggered when a player drops to ≤2 trains. We finish the round
   *  back at the index that started it. */
  finalRoundTriggered: boolean;
  finalRoundStartedAt: number | null;

  settings: TtrSettings;
  log: TtrLogEntry[];
  winnerId: string | null;

  /** Final scoring breakdown — populated when phase === "finished". */
  finalScores: {
    playerId: string;
    routeScore: number;
    ticketBonus: number; // sum of completed ticket values
    ticketPenalty: number; // sum of unfinished ticket values
    longestPathBonus: number; // 0 or 10
    longestPathLength: number;
    total: number;
  }[] | null;
};
