import type { Gem, TokenColor, SplendorPlayerColor, SplendorSettings } from "./types";

/**
 * All actions a Splendor reducer accepts. Action types use a `SP/` prefix
 * so they don't collide with other games on the platform.
 */
export type SplendorAction =
  // Lobby actions ---------------------------------------------------------
  | { type: "SP/SET_COLOR"; playerId: string; color: SplendorPlayerColor }
  | { type: "SP/SET_SETTINGS"; playerId: string; settings: Partial<SplendorSettings> }
  | { type: "SP/START_GAME"; playerId: string; seed?: number }
  | { type: "SP/RESET_ROOM"; playerId: string }

  // Main turn actions (exactly one per turn) ------------------------------

  /** Take 3 different gem tokens (no gold). If fewer distinct colours are
   *  available in the bank, the player takes whatever is offered. */
  | { type: "SP/TAKE_3_DIFFERENT"; playerId: string; gems: Gem[] }

  /** Take 2 of one gem. The bank must have ≥4 of that gem at the moment. */
  | { type: "SP/TAKE_2_SAME"; playerId: string; gem: Gem }

  /** Reserve a card. Source is either a market slot or the top of a
   *  deck. If gold is available the player also takes 1 gold token. */
  | {
      type: "SP/RESERVE";
      playerId: string;
      source:
        | { kind: "market"; tier: 1 | 2 | 3; slot: 0 | 1 | 2 | 3 }
        | { kind: "deck"; tier: 1 | 2 | 3 };
    }

  /** Buy a development card. Pays with tokens + gold + permanent bonus.
   *  `useGold` per-gem tells the reducer how to split joker spending so
   *  it can validate the buy with no further input. */
  | {
      type: "SP/PURCHASE";
      playerId: string;
      source:
        | { kind: "market"; tier: 1 | 2 | 3; slot: 0 | 1 | 2 | 3 }
        | { kind: "reserved"; index: number };
      useGold?: Partial<Record<Gem, number>>;
    }

  // Sub-phase actions -----------------------------------------------------

  /** Discard tokens down to 10 at the end of the active player's turn.
   *  Sent by the player when subPhase === "discarding". */
  | {
      type: "SP/CHOOSE_DISCARD";
      playerId: string;
      tokens: Partial<Record<TokenColor, number>>;
    }

  /** Pick which noble visits when more than one is newly eligible.
   *  Sent by the player when subPhase === "picking_noble". */
  | { type: "SP/CHOOSE_NOBLE"; playerId: string; nobleId: string };
