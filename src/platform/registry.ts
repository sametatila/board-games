import type { GameDefinition, GameId } from "./types";

/**
 * Registry of all games available on the platform. The home page reads
 * this to render game cards; per-game lobby pages link via `lobbyPath`.
 *
 * Splendor and Ticket to Ride are listed but `playable: false` until
 * their reducers + party servers are implemented (Faz 1, Faz 2).
 */
export const gameRegistry: Record<GameId, GameDefinition> = {
  "sunny-harbor": {
    id: "sunny-harbor",
    displayName: "Sunny Harbor",
    shortDescription:
      "Catan-tarzı kaynak ve yerleşim oyunu. 2–8 oyuncu, 6 farklı harita.",
    minPlayers: 2,
    maxPlayers: 8,
    partyId: "sunny_harbor",
    lobbyPath: "/sunny-harbor",
    playable: true,
  },
  splendor: {
    id: "splendor",
    displayName: "Splendor",
    shortDescription:
      "Rönesans dönemi mücevher ekonomisi. 2–4 oyuncu, 15 prestij hedefi.",
    minPlayers: 2,
    maxPlayers: 4,
    partyId: "splendor",
    lobbyPath: "/splendor",
    playable: true,
  },
  "ticket-to-ride": {
    id: "ticket-to-ride",
    displayName: "Ticket to Ride",
    shortDescription:
      "ABD haritası üzerinde tren yolu inşa et. 2–5 oyuncu, en uzun rota +10.",
    minPlayers: 2,
    maxPlayers: 5,
    partyId: "ticket_to_ride",
    lobbyPath: "/ticket-to-ride",
    playable: true,
  },
};

export const allGames: GameDefinition[] = Object.values(gameRegistry);
