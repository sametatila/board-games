import type { TtrAction } from "./actions";
import type {
  TtrPlayerColor,
  TtrSettings,
  TtrState,
} from "./types";

export type ClientMessage =
  | {
      t: "hello";
      nickname: string;
      color?: TtrPlayerColor;
      reconnectId?: string;
    }
  | { t: "leave" }
  | { t: "set_settings"; settings: Partial<TtrSettings> }
  | { t: "set_color"; color: TtrPlayerColor }
  | { t: "start_game" }
  | { t: "reset_room" }
  | { t: "action"; action: TtrAction }
  | { t: "chat"; text: string }
  | { t: "ping" };

export type ServerMessage =
  | { t: "snapshot"; state: TtrState; selfId: string }
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
  | { kind: "phase_changed"; phase: TtrState["phase"] }
  | { kind: "log"; text: string; playerId?: string; ts?: number };
