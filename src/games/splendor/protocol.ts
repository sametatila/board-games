import type { SplendorAction } from "./actions";
import type { SplendorState, SplendorPlayerColor, SplendorSettings } from "./types";

/**
 * Wire protocol for the Splendor party server. Same shape as the
 * Sunny Harbor protocol so the platform store/useParty hook can stay
 * generic — only the carried `state` and `action` types differ.
 */
export type ClientMessage =
  | {
      t: "hello";
      nickname: string;
      color?: SplendorPlayerColor;
      reconnectId?: string;
    }
  | { t: "leave" }
  | { t: "set_settings"; settings: Partial<SplendorSettings> }
  | { t: "set_color"; color: SplendorPlayerColor }
  | { t: "start_game" }
  | { t: "reset_room" }
  | { t: "action"; action: SplendorAction }
  | { t: "chat"; text: string }
  | { t: "ping" };

export type ServerMessage =
  | { t: "snapshot"; state: SplendorState; selfId: string }
  | { t: "patch"; events: ServerEvent[] }
  | { t: "error"; code: string; message: string }
  | {
      t: "chat_msg";
      fromPlayerId: string;
      fromNickname: string;
      text: string;
      ts: number;
    }
  | { t: "pong" };

export type ServerEvent =
  | { kind: "player_joined"; playerId: string }
  | { kind: "player_left"; playerId: string }
  | { kind: "host_changed"; playerId: string }
  | { kind: "phase_changed"; phase: SplendorState["phase"] }
  | { kind: "log"; text: string; playerId?: string; ts?: number };
