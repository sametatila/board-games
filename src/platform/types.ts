/**
 * Platform-level types shared across all games. Game-specific state lives
 * inside `src/games/<id>/types.ts` and extends `BaseGameState`.
 *
 * Faz 0 minimum: just enough surface for the registry + game selection
 * page. Splendor / Ticket to Ride will pull on these contracts in Faz 1
 * and Faz 2; richer abstractions (reducer signatures, action discriminators)
 * land then.
 */

export type GameId = "sunny-harbor" | "splendor" | "ticket-to-ride";

export type BasePlayer = {
  id: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
};

export type BaseGameState = {
  roomCode: string;
  phase: "lobby" | "playing" | "finished" | string;
  players: BasePlayer[];
  log: { id: string; ts: number; text: string; playerId?: string }[];
  winnerId: string | null;
};

/**
 * Minimal game registry entry. Each game registers itself so the home page
 * can list available games and the lobby can route to the right party.
 */
export type GameDefinition = {
  id: GameId;
  displayName: string;
  shortDescription: string;
  minPlayers: number;
  maxPlayers: number;
  /** PartyKit party name from `partykit.json` `parties` map. */
  partyId: string;
  /** Lobby/landing route (e.g. "/sunny-harbor"). */
  lobbyPath: string;
  /** Whether the game is playable yet. Splendor + TtR start as false. */
  playable: boolean;
};
