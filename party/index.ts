import type * as Party from "partykit/server";
import type {
  ClientMessage,
  ServerMessage,
  ServerEvent,
} from "../src/game/protocol";
import type {
  GameState,
  Player,
  PlayerColor,
  Resource,
} from "../src/game/types";
import { DEFAULT_SETTINGS } from "../src/game/types";
import { reduce } from "../src/game/reducer";

const COLOR_POOL: PlayerColor[] = [
  "red",
  "blue",
  "orange",
  "white",
  "green",
  "brown",
  "purple",
  "cyan",
];

function emptyResources(): Record<Resource, number> {
  return { wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 };
}

function fullBank(): Record<Resource, number> {
  return { wood: 19, brick: 19, wheat: 19, sheep: 19, ore: 19 };
}

function buildInitialState(roomCode: string): GameState {
  return {
    roomCode,
    phase: "lobby",
    subPhase: "main",
    mapTemplateId: "classic",
    difficulty: "normal",
    hexes: [],
    ports: [],
    pieces: [],
    players: [],
    turnOrder: [],
    currentPlayerIndex: 0,
    diceRoll: null,
    robberHexId: null,
    pirateHexId: null,
    longestRoad: null,
    longestRoute: null,
    largestArmy: null,
    bonusVP: {},
    pendingGoldChoices: [],
    fortresses: [],
    pendingTrade: null,
    rules: {
      victoryPointsToWin: 10,
      maxSettlements: 5,
      maxCities: 4,
      maxRoads: 15,
      maxShips: 0,
      bankResourceCount: 19,
      longestRoadThreshold: 5,
      largestArmyThreshold: 3,
    },
    settings: { ...DEFAULT_SETTINGS },
    turnDeadlineMs: null,
    tradeDeadlineMs: null,
    discardDeadlineMs: null,
    log: [],
    bank: fullBank(),
    devDeck: [],
    winnerId: null,
  };
}

// Defensive migration: old persisted states may be missing newer fields after
// a code update. We patch missing fields rather than crash. Rooms still mid-game
// from the previous schema may need to be reset by the host.
function migrateState(stored: GameState, roomId: string): GameState {
  const fresh = buildInitialState(roomId);
  const merged: GameState = { ...fresh, ...stored };
  // Players may be missing new fields.
  merged.players = (merged.players ?? []).map((p) => {
    const dev = p.devCards ?? { available: [], played: [], pendingFromTurn: [] };
    return {
      ...p,
      devCards: {
        available: dev.available ?? [],
        played: dev.played ?? [],
        pendingFromTurn: dev.pendingFromTurn ?? [],
      },
      hasPlayedDevThisTurn: p.hasPlayedDevThisTurn ?? false,
      knightsPlayed: p.knightsPlayed ?? 0,
      hiddenVictoryPoints: p.hiddenVictoryPoints ?? 0,
      shipsRemaining: p.shipsRemaining ?? 0,
    };
  });
  merged.devDeck = merged.devDeck ?? [];
  merged.bank = merged.bank ?? fresh.bank;
  merged.rules = merged.rules ?? fresh.rules;
  merged.log = merged.log ?? [];
  merged.pieces = merged.pieces ?? [];
  merged.hexes = merged.hexes ?? [];
  merged.ports = merged.ports ?? [];
  merged.turnOrder = merged.turnOrder ?? merged.players.map((p) => p.id);
  merged.difficulty = merged.difficulty ?? "normal";
  merged.settings = { ...DEFAULT_SETTINGS, ...(merged.settings ?? {}) };
  merged.turnDeadlineMs = merged.turnDeadlineMs ?? null;
  merged.tradeDeadlineMs = merged.tradeDeadlineMs ?? null;
  merged.discardDeadlineMs = merged.discardDeadlineMs ?? null;
  merged.pirateHexId = merged.pirateHexId ?? null;
  merged.longestRoute = merged.longestRoute ?? null;
  merged.bonusVP = merged.bonusVP ?? {};
  merged.pendingGoldChoices = merged.pendingGoldChoices ?? [];
  merged.fortresses = merged.fortresses ?? [];
  merged.rules = {
    ...merged.rules,
    maxShips: merged.rules?.maxShips ?? 0,
  };
  return merged;
}

function makePlayer(
  id: string,
  nickname: string,
  color: PlayerColor,
  isHost: boolean,
): Player {
  return {
    id,
    nickname,
    color,
    isHost,
    connected: true,
    resources: emptyResources(),
    devCards: { available: [], played: [], pendingFromTurn: [] },
    hasPlayedDevThisTurn: false,
    knightsPlayed: 0,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    roadsRemaining: 15,
    shipsRemaining: 0,
    victoryPoints: 0,
    hiddenVictoryPoints: 0,
  };
}

// Allow 0 (= disabled) or 10..600 seconds.
function clampTimer(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v < 10) return 10;
  if (v > 600) return 600;
  return Math.round(v);
}

function pickColor(used: Set<PlayerColor>, preferred?: PlayerColor): PlayerColor {
  if (preferred && !used.has(preferred)) return preferred;
  for (const c of COLOR_POOL) if (!used.has(c)) return c;
  return COLOR_POOL[0];
}

function send(conn: Party.Connection, msg: ServerMessage) {
  conn.send(JSON.stringify(msg));
}

function broadcast(party: Party.Room, msg: ServerMessage) {
  party.broadcast(JSON.stringify(msg));
}

function broadcastEvents(party: Party.Room, events: ServerEvent[]) {
  if (events.length === 0) return;
  // Stamp every log event at broadcast time so the UI can show wall-clock
  // times next to the entry. Other event kinds don't need a timestamp.
  const now = Date.now();
  const stamped = events.map((e) =>
    e.kind === "log" && e.ts === undefined ? { ...e, ts: now } : e,
  );
  broadcast(party, { t: "patch", events: stamped });
}

export default class GameRoom implements Party.Server {
  state: GameState;
  // connectionId -> playerId mapping
  conns: Map<string, string> = new Map();
  // Active timeout handles so we can cancel/replace them when state changes.
  turnTimer: ReturnType<typeof setTimeout> | null = null;
  tradeTimer: ReturnType<typeof setTimeout> | null = null;
  discardTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly room: Party.Room) {
    this.state = buildInitialState(room.id);
  }

  async onStart() {
    const stored = await this.room.storage.get<GameState>("state");
    if (stored) {
      try {
        this.state = migrateState(stored, this.room.id);
        for (const p of this.state.players) p.connected = false;
        this.rescheduleTimers();
      } catch {
        this.state = buildInitialState(this.room.id);
        await this.room.storage.put("state", this.state);
      }
    }
  }

  // Re-arm setTimeouts to match current deadlines on the state. Called after
  // every reducer mutation so a deadline can be set, cleared, or extended in
  // a single place.
  rescheduleTimers() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.tradeTimer) {
      clearTimeout(this.tradeTimer);
      this.tradeTimer = null;
    }
    if (this.discardTimer) {
      clearTimeout(this.discardTimer);
      this.discardTimer = null;
    }
    const now = Date.now();
    if (this.state.turnDeadlineMs && this.state.turnDeadlineMs > now) {
      const ms = this.state.turnDeadlineMs - now;
      this.turnTimer = setTimeout(() => {
        this.applyTimer({ type: "TIMER_END_TURN" });
      }, ms);
    }
    if (this.state.tradeDeadlineMs && this.state.tradeDeadlineMs > now) {
      const ms = this.state.tradeDeadlineMs - now;
      this.tradeTimer = setTimeout(() => {
        this.applyTimer({ type: "TIMER_CANCEL_TRADE" });
      }, ms);
    }
    if (this.state.discardDeadlineMs && this.state.discardDeadlineMs > now) {
      const ms = this.state.discardDeadlineMs - now;
      this.discardTimer = setTimeout(() => {
        this.applyTimer({ type: "TIMER_FORCE_DISCARD" });
      }, ms);
    }
  }

  // Apply a server-only timer action and broadcast the result.
  async applyTimer(
    action:
      | { type: "TIMER_END_TURN" }
      | { type: "TIMER_CANCEL_TRADE" }
      | { type: "TIMER_FORCE_DISCARD" },
  ) {
    const result = reduce(this.state, action);
    if (!result.ok) return;
    this.state = result.state;
    this.rescheduleTimers();
    broadcast(this.room, { t: "snapshot", state: this.state, selfId: "" });
    await this.persist();
  }

  async persist() {
    await this.room.storage.put("state", this.state);
  }

  onConnect(conn: Party.Connection) {
    // Wait for hello to identify player.
    send(conn, { t: "snapshot", state: this.state, selfId: conn.id });
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      send(sender, { t: "error", code: "bad_json", message: "Invalid JSON" });
      return;
    }

    const events: ServerEvent[] = [];

    switch (msg.t) {
      case "hello": {
        const nickname = (msg.nickname || "Anonim").slice(0, 24);
        const reconnectId = msg.reconnectId;
        let player: Player | undefined;

        if (reconnectId) {
          player = this.state.players.find((p) => p.id === reconnectId);
          if (player) {
            player.connected = true;
            player.nickname = nickname;
          }
        }

        if (!player) {
          if (this.state.phase === "lobby" && this.state.players.length >= 8) {
            send(sender, {
              t: "error",
              code: "full",
              message: "Oda dolu (8 oyuncu).",
            });
            // Even if rejected, send a snapshot so UI doesn't stay blank.
            send(sender, { t: "snapshot", state: this.state, selfId: "" });
            return;
          }
          if (this.state.phase !== "lobby") {
            // Game already started: connect as spectator (no player added).
            send(sender, {
              t: "error",
              code: "spectator",
              message: "Oyun başlamış, izleyici olarak bağlandın.",
            });
            send(sender, { t: "snapshot", state: this.state, selfId: "" });
            return;
          }
          const used = new Set<PlayerColor>(
            this.state.players.map((p) => p.color),
          );
          const color = pickColor(used, msg.color);
          const isHost = this.state.players.length === 0;
          player = makePlayer(sender.id, nickname, color, isHost);
          this.state.players.push(player);
          this.state.turnOrder.push(player.id);
          events.push({ kind: "player_joined", playerId: player.id });
          events.push({
            kind: "log",
            text: `${nickname} odaya katıldı.`,
            playerId: player.id,
          });
        }

        this.conns.set(sender.id, player.id);
        send(sender, { t: "snapshot", state: this.state, selfId: player.id });
        break;
      }

      case "reset_room": {
        // Allow the host to wipe game state and return to lobby, OR allow
        // anyone to reset if no player is currently connected (rescue stuck rooms).
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        const anyConnected = this.state.players.some((p) => p.connected);
        const allowed = !!player?.isHost || !anyConnected;
        if (!allowed) {
          send(sender, {
            t: "error",
            code: "not_allowed",
            message: "Sadece host odayı sıfırlayabilir (veya kimse bağlı değilken).",
          });
          return;
        }
        // Preserve the player roster so host status doesn't get re-assigned
        // to whichever browser refreshes first. Only the *game* state (board,
        // pieces, turn, dev cards, etc.) is wiped. Each player's resources
        // and inventory are reset, but their seat at the table stays.
        // Lobby selections (map, difficulty, game settings) are also kept so
        // the host doesn't have to re-pick everything after ending a game.
        const fresh = buildInitialState(this.room.id);
        const keptPlayers = this.state.players.map((p) => ({
          ...p,
          resources: emptyResources(),
          devCards: { available: [], played: [], pendingFromTurn: [] },
          hasPlayedDevThisTurn: false,
          knightsPlayed: 0,
          settlementsRemaining: 5,
          citiesRemaining: 4,
          roadsRemaining: 15,
          shipsRemaining: 0,
          victoryPoints: 0,
          hiddenVictoryPoints: 0,
        }));
        const keptOrder = this.state.turnOrder.filter((id) =>
          keptPlayers.some((p) => p.id === id),
        );
        this.state = {
          ...fresh,
          players: keptPlayers,
          turnOrder: keptOrder,
          mapTemplateId: this.state.mapTemplateId,
          difficulty: this.state.difficulty,
          settings: this.state.settings,
        };
        events.push({ kind: "phase_changed", phase: this.state.phase });
        events.push({
          kind: "log",
          text: `${player?.nickname ?? "Host"} oyunu lobiye döndürdü.`,
        });
        break;
      }

      case "set_map": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player?.isHost) {
          send(sender, {
            t: "error",
            code: "not_host",
            message: "Sadece host harita değiştirebilir.",
          });
          return;
        }
        if (this.state.phase !== "lobby") return;
        this.state.mapTemplateId = msg.mapTemplateId;
        events.push({
          kind: "map_changed",
          mapTemplateId: msg.mapTemplateId,
        });
        break;
      }

      case "set_difficulty": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player?.isHost) {
          send(sender, {
            t: "error",
            code: "not_host",
            message: "Sadece host zorluğu değiştirebilir.",
          });
          return;
        }
        if (this.state.phase !== "lobby") return;
        this.state.difficulty = msg.difficulty;
        events.push({
          kind: "log",
          text: `Zorluk: ${msg.difficulty}`,
        });
        break;
      }

      case "set_settings": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player?.isHost) {
          send(sender, {
            t: "error",
            code: "not_host",
            message: "Sadece host ayarları değiştirebilir.",
          });
          return;
        }
        // Patch current settings with the partial payload.
        const next = { ...this.state.settings, ...msg.settings };
        // Clamp timer values to safe ranges (0 = unlimited; otherwise 10..600s).
        next.turnTimerSec = clampTimer(next.turnTimerSec);
        next.tradeTimerSec = clampTimer(next.tradeTimerSec);
        next.discardTimerSec = clampTimer(next.discardTimerSec);
        this.state.settings = next;
        // If trades just got disabled and one is open, cancel it now.
        if (!next.allowPlayerTrades && this.state.pendingTrade) {
          this.state.pendingTrade = null;
          this.state.tradeDeadlineMs = null;
          if (this.state.subPhase === "trading")
            this.state.subPhase = "main";
        }
        // If timers were disabled mid-game, clear deadlines so the UI doesn't
        // keep counting down. If they were just shortened/lengthened, leave
        // the existing deadline alone — it'll roll forward on the next state
        // transition.
        if (next.turnTimerSec === 0) this.state.turnDeadlineMs = null;
        if (next.tradeTimerSec === 0) this.state.tradeDeadlineMs = null;
        if (next.discardTimerSec === 0) this.state.discardDeadlineMs = null;
        events.push({ kind: "log", text: "Oyun ayarları güncellendi." });
        break;
      }

      case "start_game": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player?.isHost) {
          send(sender, {
            t: "error",
            code: "not_host",
            message: "Sadece host oyunu başlatabilir.",
          });
          return;
        }
        if (this.state.phase !== "lobby") return;
        if (this.state.players.length < 2) {
          send(sender, {
            t: "error",
            code: "not_enough_players",
            message: "En az 2 oyuncu gerekli.",
          });
          return;
        }
        const result = reduce(this.state, {
          type: "START_GAME",
          mapTemplateId: this.state.mapTemplateId,
          difficulty: this.state.difficulty,
        });
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "start_failed",
            message: result.error,
          });
          return;
        }
        this.state = result.state;
        events.push({ kind: "phase_changed", phase: this.state.phase });
        break;
      }

      case "action": {
        const playerId = this.conns.get(sender.id);
        if (!playerId) return;
        // Server-authoritative: overwrite playerId on the action to prevent spoofing.
        const action = { ...msg.action, playerId } as typeof msg.action;
        const result = reduce(this.state, action);
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "action_rejected",
            message: result.error,
          });
          return;
        }
        this.state = result.state;
        // Optionally include phase change events.
        events.push({ kind: "phase_changed", phase: this.state.phase });
        break;
      }

      case "leave": {
        this.handleDisconnect(sender, events);
        break;
      }

      case "chat": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player) return;
        // Light validation: trim, cap length, drop empties.
        const text = (msg.text ?? "").trim().slice(0, 280);
        if (!text) return;
        broadcast(this.room, {
          t: "chat_msg",
          fromPlayerId: player.id,
          fromNickname: player.nickname,
          text,
          ts: Date.now(),
        });
        return; // chat doesn't trigger snapshot/persist
      }

      case "ping": {
        send(sender, { t: "pong" });
        return;
      }
    }

    if (events.length > 0) {
      broadcastEvents(this.room, events);
      // Snapshot her major event'te broadcast — Faz 3'te incele.
      broadcast(this.room, {
        t: "snapshot",
        state: this.state,
        selfId: "",
      });
      this.rescheduleTimers();
      await this.persist();
    }
  }

  onClose(conn: Party.Connection) {
    const events: ServerEvent[] = [];
    this.handleDisconnect(conn, events);
    if (events.length > 0) {
      broadcastEvents(this.room, events);
      broadcast(this.room, {
        t: "snapshot",
        state: this.state,
        selfId: "",
      });
    }
  }

  handleDisconnect(conn: Party.Connection, events: ServerEvent[]) {
    const playerId = this.conns.get(conn.id);
    this.conns.delete(conn.id);
    if (!playerId) return;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = false;

    // In lobby, fully remove disconnected players.
    if (this.state.phase === "lobby") {
      this.state.players = this.state.players.filter((p) => p.id !== playerId);
      this.state.turnOrder = this.state.turnOrder.filter((id) => id !== playerId);
      events.push({ kind: "player_left", playerId });
      events.push({
        kind: "log",
        text: `${player.nickname} ayrıldı.`,
      });
      // Promote new host if needed.
      if (player.isHost && this.state.players.length > 0) {
        this.state.players[0].isHost = true;
        events.push({
          kind: "host_changed",
          playerId: this.state.players[0].id,
        });
      }
    } else {
      events.push({
        kind: "log",
        text: `${player.nickname} bağlantısı koptu.`,
      });
    }
  }
}

GameRoom satisfies Party.Worker;
