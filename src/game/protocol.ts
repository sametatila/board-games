import type {
  Difficulty,
  GameSettings,
  GameState,
  MapTemplateId,
  PlayerColor,
} from "./types";
import type { GameAction } from "./actions";

export type ClientMessage =
  | {
      t: "hello";
      nickname: string;
      color?: PlayerColor;
      reconnectId?: string;
    }
  | { t: "leave" }
  | { t: "set_map"; mapTemplateId: MapTemplateId }
  | { t: "set_difficulty"; difficulty: Difficulty }
  | { t: "set_settings"; settings: Partial<GameSettings> }
  | { t: "start_game" }
  | { t: "reset_room" }
  | { t: "action"; action: GameAction }
  | { t: "chat"; text: string }
  | { t: "ping" };

export type ServerMessage =
  | { t: "snapshot"; state: GameState; selfId: string }
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
  | { kind: "map_changed"; mapTemplateId: MapTemplateId }
  | { kind: "phase_changed"; phase: GameState["phase"] }
  | { kind: "log"; text: string; playerId?: string; ts?: number };

export const PROTOCOL_VERSION = 1;
