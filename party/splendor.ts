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

/**
 * Per-recipient state redaction. The full SplendorState is the
 * authoritative game record on the server, but we must not leak each
 * player's reserved cards to opponents. We blank them out (id = "?",
 * neutral cost) for everyone except their owner.
 *
 * The rest of the state (tokens, market, decks, nobles, log) is
 * public information per the official rules.
 */
function redactedStateFor(state: SplendorState, viewerId: string): SplendorState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (p.id === viewerId) return p;
      // Keep the count visible (UI shows "3 reserved cards" for others)
      // but replace each card with an opaque placeholder so face is hidden.
      return {
        ...p,
        reserved: p.reserved.map((_c, i) => ({
          id: `redacted-${p.id}-${i}`,
          tier: 1 as const,
          cost: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
          bonus: "white" as const,
          prestige: 0,
        })),
      };
    }),
  };
}

/**
 * Broadcast a fresh snapshot to every connected client, redacting
 * per-recipient. Replaces direct `party.broadcast({t:"snapshot", ...})`
 * calls so reserved cards stay private.
 */
function broadcastSnapshot(party: Party.Room, conns: Map<string, string>, state: SplendorState) {
  for (const c of party.getConnections()) {
    const playerId = conns.get(c.id) ?? "";
    const redacted = redactedStateFor(state, playerId);
    send(c, { t: "snapshot", state: redacted, selfId: "" });
  }
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
    // We don't know which player slot this connection belongs to until
    // hello arrives, so send a fully-redacted snapshot (anonymous viewer).
    send(conn, {
      t: "snapshot",
      state: redactedStateFor(this.state, ""),
      selfId: conn.id,
    });
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
            send(sender, {
              t: "snapshot",
              state: redactedStateFor(this.state, ""),
              selfId: "",
            });
            return;
          }
          if (this.state.phase !== "lobby") {
            send(sender, {
              t: "error",
              code: "spectator",
              message: "Oyun başlamış, izleyici olarak bağlandın.",
            });
            send(sender, {
              t: "snapshot",
              state: redactedStateFor(this.state, ""),
              selfId: "",
            });
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
        send(sender, {
          t: "snapshot",
          state: redactedStateFor(this.state, player.id),
          selfId: player.id,
        });
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
      broadcastSnapshot(this.room, this.conns, this.state);
      await this.persist();
    }
  }

  onClose(conn: Party.Connection) {
    const events: ServerEvent[] = [];
    this.handleDisconnect(conn, events);
    if (events.length > 0) {
      broadcastEvents(this.room, events);
      broadcastSnapshot(this.room, this.conns, this.state);
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
