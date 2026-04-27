import type {
  CardColor,
  RouteId,
  TicketId,
  TtrPlayerColor,
  TtrSettings,
} from "./types";

/**
 * All actions the TtR reducer accepts. `TTR/` prefix prevents collision
 * with other games on the platform.
 */
export type TtrAction =
  // Lobby actions ---------------------------------------------------------
  | { type: "TTR/SET_COLOR"; playerId: string; color: TtrPlayerColor }
  | { type: "TTR/SET_SETTINGS"; playerId: string; settings: Partial<TtrSettings> }
  | { type: "TTR/START_GAME"; playerId: string; seed?: number }
  | { type: "TTR/RESET_ROOM"; playerId: string }

  // Initial tickets ------------------------------------------------------
  /** During subPhase=initial_tickets every player commits at least 2 of
   *  the 3 dealt tickets. We accept this action from any player while
   *  in that phase, not just `currentPlayer`. */
  | { type: "TTR/COMMIT_INITIAL_TICKETS"; playerId: string; keepIds: TicketId[] }

  // Main turn actions (one per turn) ------------------------------------

  /** Draw a train card. `source` is either `deck` (always counts as 1
   *  toward the 2-card draw) or a market slot. Drawing a face-up
   *  locomotive ends the turn — see reducer logic. */
  | {
      type: "TTR/DRAW_TRAIN";
      playerId: string;
      source: { kind: "deck" } | { kind: "market"; slot: 0 | 1 | 2 | 3 | 4 };
    }

  /** Claim a route by spending colour cards + locomotives. The player
   *  specifies exactly which cards to spend; the reducer verifies the
   *  count and color match the route. */
  | {
      type: "TTR/CLAIM_ROUTE";
      playerId: string;
      routeId: RouteId;
      /** Colour-only spend (number of cards of each non-locomotive
       *  colour). Sum of these + `locomotives` must equal route length. */
      cards: Partial<Record<CardColor, number>>;
    }

  /** Draw 3 destination tickets. Pushes the player into
   *  picking_tickets sub-phase to commit at least 1. */
  | { type: "TTR/DRAW_TICKETS"; playerId: string }

  /** Commit a ticket pick (mid-game). Must keep ≥1. */
  | { type: "TTR/COMMIT_PICKED_TICKETS"; playerId: string; keepIds: TicketId[] };
