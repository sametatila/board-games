"use client";

import { create } from "zustand";
import type { GameState } from "@/game/types";
import type { ServerEvent } from "@/game/protocol";

type ConnState = "idle" | "connecting" | "open" | "closed" | "error";

type ServerError = { code: string; message: string; ts: number };
export type ChatMessage = {
  fromPlayerId: string;
  fromNickname: string;
  text: string;
  ts: number;
};

type Store = {
  selfId: string | null;
  nickname: string;
  reconnectId: string | null;
  conn: ConnState;
  state: GameState | null;
  recentEvents: ServerEvent[];
  lastError: ServerError | null;
  chat: ChatMessage[];
  /** True when the server admitted us as a spectator (game already in
   *  progress and we weren't a returning player). Spectators can watch but
   *  cannot send game actions. */
  isSpectator: boolean;
  setNickname: (n: string) => void;
  setSelfId: (id: string) => void;
  setReconnectId: (id: string | null) => void;
  setConn: (s: ConnState) => void;
  setState: (s: GameState) => void;
  applyEvents: (events: ServerEvent[]) => void;
  pushError: (e: { code: string; message: string }) => void;
  clearError: () => void;
  pushChat: (m: ChatMessage) => void;
  setSpectator: (b: boolean) => void;
};

export const useGameStore = create<Store>()((set) => ({
  selfId: null,
  nickname: "",
  reconnectId: null,
  conn: "idle",
  state: null,
  recentEvents: [],
  lastError: null,
  chat: [],
  isSpectator: false,

  setNickname: (nickname) => set({ nickname }),
  setSelfId: (selfId) => set({ selfId }),
  setReconnectId: (reconnectId) => set({ reconnectId }),
  setConn: (conn) => set({ conn }),
  setState: (state) => set({ state }),
  applyEvents: (events) =>
    set((s) => ({ recentEvents: [...s.recentEvents, ...events].slice(-50) })),
  pushError: (e) =>
    set({ lastError: { ...e, ts: Date.now() } }),
  clearError: () => set({ lastError: null }),
  pushChat: (m) =>
    set((s) => ({ chat: [...s.chat, m].slice(-100) })),
  setSpectator: (b) => set({ isSpectator: b }),
}));

const NICK_KEY = "sunny-harbor:nickname";
const RECON_KEY_PREFIX = "sunny-harbor:reconnect:";
const LAST_ROOM_KEY = "sunny-harbor:last-room";

export function loadStoredNickname(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NICK_KEY) ?? "";
}

export function saveNickname(nickname: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NICK_KEY, nickname);
}

export function loadReconnectId(roomCode: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(RECON_KEY_PREFIX + roomCode);
}

export function saveReconnectId(roomCode: string, playerId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECON_KEY_PREFIX + roomCode, playerId);
}

// Track the most recently entered room so the lobby can offer a one-tap
// "rejoin" shortcut. We only persist on actual room visits — clearing
// nickname or stats does not affect this.
export function loadLastRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_ROOM_KEY);
}

export function saveLastRoomCode(roomCode: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ROOM_KEY, roomCode);
}

export function clearLastRoomCode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAST_ROOM_KEY);
}
