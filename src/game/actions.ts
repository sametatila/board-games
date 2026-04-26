import type {
  Difficulty,
  EdgeId,
  HexTerrain,
  MapTemplateId,
  Resource,
  VertexId,
} from "./types";

export type GameAction =
  | {
      type: "START_GAME";
      mapTemplateId: MapTemplateId;
      seed?: number;
      difficulty?: Difficulty;
    }
  | { type: "PLACE_INITIAL_SETTLEMENT"; playerId: string; vertexId: VertexId }
  | { type: "PLACE_INITIAL_ROAD"; playerId: string; edgeId: EdgeId }
  | { type: "ROLL_DICE"; playerId: string; dice?: [number, number] }
  | { type: "DISCARD_CARDS"; playerId: string; cards: Partial<Record<Resource, number>> }
  | { type: "MOVE_ROBBER"; playerId: string; hexId: string }
  | { type: "STEAL_RESOURCE"; playerId: string; victimId: string }
  | { type: "BUILD_SETTLEMENT"; playerId: string; vertexId: VertexId }
  | { type: "BUILD_CITY"; playerId: string; vertexId: VertexId }
  | { type: "BUILD_ROAD"; playerId: string; edgeId: EdgeId }
  | { type: "BUILD_SHIP"; playerId: string; edgeId: EdgeId }
  | {
      type: "MOVE_SHIP";
      playerId: string;
      fromEdgeId: EdgeId;
      toEdgeId: EdgeId;
    }
  | { type: "MOVE_PIRATE"; playerId: string; hexId: string }
  /** Server-driven: when a player's road/ship reaches a fog hex's vertex, that
   *  fog hex flips to a random terrain. The action lives here for replay
   *  purposes; clients never send it directly. */
  | { type: "REVEAL_FOG_HEX"; hexId: string; revealedTerrain: HexTerrain; numberToken: number | null; playerId: string }
  /** Pirate Islands: spend a knight card to upgrade an existing ship into a
   *  warship that can attack pirate fortresses. */
  | { type: "UPGRADE_TO_WARSHIP"; playerId: string; edgeId: EdgeId }
  /** Resolve one queued gold-field reward: the player picks the resource. */
  | { type: "CHOOSE_GOLD_RESOURCE"; playerId: string; resource: Resource }
  /** Pirate Islands: attack a fortress with a warship. */
  | { type: "ATTACK_FORTRESS"; playerId: string; hexId: string }
  | {
      type: "BANK_TRADE";
      playerId: string;
      give: Resource;
      receive: Resource;
    }
  | {
      type: "OFFER_TRADE";
      playerId: string;
      give: Partial<Record<Resource, number>>;
      receive: Partial<Record<Resource, number>>;
    }
  | { type: "ACCEPT_TRADE_OFFER"; playerId: string }
  | { type: "REJECT_TRADE_OFFER"; playerId: string }
  | { type: "FINALIZE_TRADE"; playerId: string; partnerId: string }
  | { type: "CANCEL_TRADE"; playerId: string }
  | { type: "BUY_DEV_CARD"; playerId: string }
  | { type: "PLAY_KNIGHT"; playerId: string; hexId: string }
  | { type: "PLAY_ROAD_BUILDING"; playerId: string; edgeIds: EdgeId[] }
  | {
      type: "PLAY_YEAR_OF_PLENTY";
      playerId: string;
      resources: Resource[];
    }
  | { type: "PLAY_MONOPOLY"; playerId: string; resource: Resource }
  | { type: "END_TURN"; playerId: string }
  /** Server-only: turn timer expired, force-end the active player's turn. */
  | { type: "TIMER_END_TURN" }
  /** Server-only: trade timer expired, auto-cancel the pending offer. */
  | { type: "TIMER_CANCEL_TRADE" }
  /** Server-only: discard timer expired, randomly discard for stragglers. */
  | { type: "TIMER_FORCE_DISCARD" };

export const BUILD_COSTS: Record<
  "settlement" | "city" | "road" | "ship",
  Partial<Record<Resource, number>>
> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wheat: 1, sheep: 1 },
  city: { wheat: 2, ore: 3 },
  ship: { wood: 1, sheep: 1 },
};

export const DEV_CARD_COST: Partial<Record<Resource, number>> = {
  wheat: 1,
  sheep: 1,
  ore: 1,
};

export const VICTORY_POINTS = {
  settlement: 1,
  city: 2,
  longestRoad: 2,
  largestArmy: 2,
} as const;
