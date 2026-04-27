import type * as Party from "partykit/server";
import type {
  ClientMessage,
  ServerMessage,
  ServerEvent,
} from "../src/games/splendor/protocol";
import type {
  SplendorPlayer,
  SplendorPlayerColor,
  SplendorState,
} from "../src/games/splendor/types";
import { TOKEN_COLORS } from "../src/games/splendor/types";
import {
  buildInitialState,
  makeSplendorPlayer,
  reduce,
} from "../src/games/splendor/reducer";

const COLOR_POOL: SplendorPlayerColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "cyan",
  "orange",
  "pink",
];

function pickColor(
  used: Set<SplendorPlayerColor>,
  preferred?: SplendorPlayerColor,
): SplendorPlayerColor {
  if (preferred && !used.has(preferred)) return preferred;
  for (const c of COLOR_POOL) if (!used.has(c)) return c;
  return COLOR_POOL[0];
}

function migrateState(stored: SplendorState, roomId: string): SplendorState {
  const fresh = buildInitialState(roomId);
  const merged: SplendorState = { ...fresh, ...stored };
  // Defensive: rebuild any missing token map fields
  for (const c of TOKEN_COLORS) {
    if (typeof merged.tokens[c] !== "number") merged.tokens[c] = 0;
  }
  merged.players = (merged.players ?? []).map((p) => ({
    ...p,
    connected: false,
    tokens: { ...fresh.tokens, ...p.tokens },
  }));
  return merged;
}

function send(conn: Party.Connection, msg: ServerMessage) {
  conn.send(JSON.stringify(msg));
}

function broadcast(party: Party.Room, msg: ServerMessage) {
  party.broadcast(JSON.stringify(msg));
}

function broadcastEvents(party: Party.Room, events: ServerEvent[]) {
  if (events.length === 0) return;
  const now = Date.now();
  const stamped = events.map((e) =>
    e.kind === "log" && e.ts === undefined ? { ...e, ts: now } : e,
  );
  broadcast(party, { t: "patch", events: stamped });
}

export default class SplendorRoom implements Party.Server {
  state: SplendorState;
  conns: Map<string, string> = new Map(); // connectionId -> playerId

  constructor(readonly room: Party.Room) {
    this.state = buildInitialState(room.id);
  }

  async onStart() {
    const stored = (await this.room.storage.get<SplendorState>("state")) ?? null;
    if (stored) this.state = migrateState(stored, this.room.id);
  }

  async persist() {
    await this.room.storage.put("state", this.state);
  }

  onConnect(conn: Party.Connection) {
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
        let player: SplendorPlayer | undefined;

        if (reconnectId) {
          player = this.state.players.find((p) => p.id === reconnectId);
          if (player) {
            player.connected = true;
            player.nickname = nickname;
          }
        }

        if (!player) {
          if (this.state.phase === "lobby" && this.state.players.length >= 4) {
            send(sender, {
              t: "error",
              code: "full",
              message: "Oda dolu (4 oyuncu).",
            });
            send(sender, { t: "snapshot", state: this.state, selfId: "" });
            return;
          }
          if (this.state.phase !== "lobby") {
            send(sender, {
              t: "error",
              code: "spectator",
              message: "Oyun başlamış, izleyici olarak bağlandın.",
            });
            send(sender, { t: "snapshot", state: this.state, selfId: "" });
            return;
          }
          const used = new Set<SplendorPlayerColor>(
            this.state.players.map((p) => p.color),
          );
          const color = pickColor(used, msg.color);
          const isHost = this.state.players.length === 0;
          player = makeSplendorPlayer(sender.id, nickname, color, isHost);
          this.state.players.push(player);
          events.push({ kind: "player_joined", playerId: player.id });
          events.push({
            kind: "log",
            text: `${player.nickname} odaya katıldı.`,
          });
        }

        this.conns.set(sender.id, player.id);
        send(sender, { t: "snapshot", state: this.state, selfId: player.id });
        break;
      }

      case "leave": {
        this.handleDisconnect(sender, events, true);
        break;
      }

      case "set_color": {
        const playerId = this.conns.get(sender.id);
        if (!playerId) return;
        const result = reduce(this.state, {
          type: "SP/SET_COLOR",
          playerId,
          color: msg.color,
        });
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "set_color_rejected",
            message: result.error,
          });
          return;
        }
        this.state = result.state;
        break;
      }

      case "set_settings": {
        const playerId = this.conns.get(sender.id);
        if (!playerId) return;
        const result = reduce(this.state, {
          type: "SP/SET_SETTINGS",
          playerId,
          settings: msg.settings,
        });
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "set_settings_rejected",
            message: result.error,
          });
          return;
        }
        this.state = result.state;
        events.push({
          kind: "log",
          text: "Ayarlar güncellendi.",
        });
        break;
      }

      case "start_game": {
        const playerId = this.conns.get(sender.id);
        if (!playerId) return;
        const result = reduce(this.state, {
          type: "SP/START_GAME",
          playerId,
          seed: Math.floor(Math.random() * 1_000_000_000),
        });
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "start_rejected",
            message: result.error,
          });
          return;
        }
        this.state = result.state;
        events.push({ kind: "phase_changed", phase: this.state.phase });
        break;
      }

      case "reset_room": {
        const playerId = this.conns.get(sender.id);
        if (!playerId) return;
        const result = reduce(this.state, {
          type: "SP/RESET_ROOM",
          playerId,
        });
        if (!result.ok) {
          send(sender, {
            t: "error",
            code: "reset_rejected",
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
        events.push({ kind: "phase_changed", phase: this.state.phase });
        break;
      }

      case "chat": {
        const playerId = this.conns.get(sender.id);
        const player = this.state.players.find((p) => p.id === playerId);
        if (!player) return;
        const text = (msg.text ?? "").trim().slice(0, 280);
        if (!text) return;
        broadcast(this.room, {
          t: "chat_msg",
          fromPlayerId: player.id,
          fromNickname: player.nickname,
          text,
          ts: Date.now(),
        });
        return;
      }

      case "ping": {
        send(sender, { t: "pong" });
        return;
      }
    }

    if (events.length > 0) {
      broadcastEvents(this.room, events);
      broadcast(this.room, { t: "snapshot", state: this.state, selfId: "" });
      await this.persist();
    }
  }

  onClose(conn: Party.Connection) {
    const events: ServerEvent[] = [];
    this.handleDisconnect(conn, events);
    if (events.length > 0) {
      broadcastEvents(this.room, events);
      broadcast(this.room, { t: "snapshot", state: this.state, selfId: "" });
    }
  }

  handleDisconnect(
    conn: Party.Connection,
    events: ServerEvent[],
    explicitLeave = false,
  ) {
    const playerId = this.conns.get(conn.id);
    if (!playerId) return;
    this.conns.delete(conn.id);

    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return;

    player.connected = false;

    if (this.state.phase === "lobby" && explicitLeave) {
      this.state.players = this.state.players.filter((p) => p.id !== playerId);
      events.push({ kind: "player_left", playerId });
      events.push({
        kind: "log",
        text: `${player.nickname} ayrıldı.`,
      });
      if (player.isHost && this.state.players.length > 0) {
        const nextHost =
          this.state.players.find((p) => p.connected) ?? this.state.players[0];
        nextHost.isHost = true;
        events.push({ kind: "host_changed", playerId: nextHost.id });
      }
    } else {
      events.push({
        kind: "log",
        text: `${player.nickname} bağlantısı koptu.`,
      });
    }
  }
}

SplendorRoom satisfies Party.Worker;
