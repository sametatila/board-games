export type Resource = "wood" | "brick" | "wheat" | "sheep" | "ore";
export type HexTerrain = Resource | "desert" | "sea" | "fog" | "gold";

export type AxialCoord = { q: number; r: number };

export type Hex = {
  id: string;
  coord: AxialCoord;
  terrain: HexTerrain;
  numberToken: number | null;
  /** True for hexes that start as fog and are revealed via exploration. */
  hidden?: boolean;
  /** Multi-island layouts: every land hex belongs to one island. Sea/fog/gold
   *  do not get an islandId (or get the special id "sea"). */
  islandId?: string;
};

export type VertexId = string;
export type EdgeId = string;

export type PortKind = Resource | "any";

export type Port = {
  edgeId: EdgeId;
  kind: PortKind;
  ratio: 2 | 3;
};

export type PieceKind = "settlement" | "city" | "road" | "ship" | "warship";

export type BuiltPiece =
  | { kind: "settlement" | "city"; vertexId: VertexId; playerId: string }
  | { kind: "road"; edgeId: EdgeId; playerId: string }
  | {
      /** Standard ship — costs 1 wood + 1 sheep, lives on a sea/coast edge. */
      kind: "ship";
      edgeId: EdgeId;
      playerId: string;
      /** True only on the turn the ship was placed (cannot be moved that turn). */
      placedThisTurn?: boolean;
    }
  | {
      /** Knight-upgraded ship. Doesn't exist in classic Catan but is part of
       *  the Pirate Islands scenario. Behaves like a ship that can also fight. */
      kind: "warship";
      edgeId: EdgeId;
      playerId: string;
      placedThisTurn?: boolean;
    };

export type DevelopmentCard =
  | "knight"
  | "victory_point"
  | "road_building"
  | "year_of_plenty"
  | "monopoly";

export type PlayerColor =
  | "red"
  | "blue"
  | "orange"
  | "white"
  | "green"
  | "brown"
  | "purple"
  | "cyan";

export type Player = {
  id: string;
  nickname: string;
  color: PlayerColor;
  isHost: boolean;
  connected: boolean;
  resources: Record<Resource, number>;
  devCards: {
    available: DevelopmentCard[];
    played: DevelopmentCard[];
    pendingFromTurn: DevelopmentCard[];
  };
  hasPlayedDevThisTurn: boolean;
  knightsPlayed: number;
  settlementsRemaining: number;
  citiesRemaining: number;
  roadsRemaining: number;
  shipsRemaining: number;
  victoryPoints: number;
  hiddenVictoryPoints: number;
};

export type GamePhase =
  | "lobby"
  | "setup_round_1"
  | "setup_round_2"
  | "playing"
  | "finished";

export type TurnSubPhase =
  | "awaiting_roll"
  | "discarding"
  | "moving_robber"
  | "stealing"
  | "main"
  | "trading"
  | "ended";

export type TradeOffer = {
  fromPlayerId: string;
  give: Partial<Record<Resource, number>>;
  receive: Partial<Record<Resource, number>>;
  acceptedBy: string[];
  rejectedBy: string[];
};

export type MapTemplateId =
  | "classic"
  | "twin_islands"
  | "archipelago"
  | "fog_frontier"
  | "desert_spiral"
  | "continental_divide";

export type Difficulty = "easy" | "normal" | "hard";

export type GameSettings = {
  /** How long the active player has from "awaiting_roll" through their main
   *  phase before the server auto-ends their turn. 0 = unlimited. */
  turnTimerSec: number;
  /** How long a pending trade offer stays open before it is auto-cancelled. 0 = unlimited. */
  tradeTimerSec: number;
  /** How long discarders have when a 7 is rolled. 0 = unlimited. */
  discardTimerSec: number;
  /** If true, players can trade with each other. If false, only bank trades. */
  allowPlayerTrades: boolean;
  /** If true, log a "your turn" sound to the active player when their turn starts. */
  turnSound: boolean;
  /** Override for the victory-points-to-win target. null/undefined =
   *  use the map template's default (10 for classic, 11–13 for scenarios)
   *  with the usual 5+ player +2 / 7+ player +2 scaling on top. A
   *  number here freezes the target — no scaling, exactly this many VP. */
  victoryPointsToWin?: number | null;
};

export const DEFAULT_SETTINGS: GameSettings = {
  turnTimerSec: 0,
  tradeTimerSec: 60,
  discardTimerSec: 45,
  allowPlayerTrades: true,
  turnSound: true,
  victoryPointsToWin: null,
};

export type GameRules = {
  victoryPointsToWin: number;
  maxSettlements: number;
  maxCities: number;
  maxRoads: number;
  /** Max ships per player. 0 = no ships allowed (classic, no-Seafarers maps). */
  maxShips: number;
  bankResourceCount: number;
  longestRoadThreshold: number;
  largestArmyThreshold: number;
};

export type GameState = {
  roomCode: string;
  phase: GamePhase;
  subPhase: TurnSubPhase;
  mapTemplateId: MapTemplateId;
  difficulty: Difficulty;
  hexes: Hex[];
  ports: Port[];
  pieces: BuiltPiece[];
  players: Player[];
  turnOrder: string[];
  currentPlayerIndex: number;
  diceRoll: [number, number] | null;
  robberHexId: string | null;
  /** Pirate (sea robber) location — only used on Seafarers maps. null = no pirate. */
  pirateHexId: string | null;
  longestRoad: { playerId: string; length: number } | null;
  /** Longest trade route — combined road + ship length on Seafarers maps. */
  longestRoute: { playerId: string; length: number } | null;
  largestArmy: { playerId: string; size: number } | null;
  /** Per-player bonus VP earned for first-settlement-on-foreign-island,
   *  desert-traversal, etc. Keyed by playerId, summed into total VP. */
  bonusVP: Record<string, number>;
  /** Outstanding gold-field rewards waiting for the player to pick a resource.
   *  Each entry represents ONE gold card to be chosen. */
  pendingGoldChoices: { playerId: string; hexId: string }[];
  /** Pirate-Islands fortresses. Empty on every other map. ownerId = null means
   *  the fortress is still neutral (held by NPC pirates); when an attacking
   *  warship lands the killing blow, ownerId becomes that player's id and
   *  hp resets so they can defend. hpRemaining starts at 3. */
  fortresses: { hexId: string; ownerId: string | null; hpRemaining: number }[];
  pendingTrade: TradeOffer | null;
  rules: GameRules;
  settings: GameSettings;
  /** When the current turn auto-ends, in unix ms. null if no timer running. */
  turnDeadlineMs: number | null;
  /** When the current pending trade auto-cancels, in unix ms. */
  tradeDeadlineMs: number | null;
  /** When the discard phase auto-applies a fallback (random discard) for stragglers. */
  discardDeadlineMs: number | null;
  log: GameEventLogEntry[];
  bank: Record<Resource, number>;
  devDeck: DevelopmentCard[];
  winnerId: string | null;
};

export type GameEventLogEntry = {
  id: string;
  ts: number;
  playerId?: string;
  text: string;
};
