"use client";

import { create } from "zustand";

type ConnState = "idle" | "connecting" | "open" | "closed" | "error";

type ServerError = { code: string; message: string; ts: number };
export type ChatMessage = {
  fromPlayerId: string;
  fromNickname: string;
  text: string;
  ts: number;
};

/**
 * Generic per-game store. Each game module instantiates its own copy
 * via `createGameStore<MyState>()` so the platform doesn't need to know
 * the shape of every game's state up front.
 */
export type GameStore<S, E> = {
  selfId: string | null;
  nickname: string;
  reconnectId: string | null;
  conn: ConnState;
  state: S | null;
  recentEvents: E[];
  lastError: ServerError | null;
  chat: ChatMessage[];
  isSpectator: boolean;
  setNickname: (n: string) => void;
  setSelfId: (id: string) => void;
  setReconnectId: (id: string | null) => void;
  setConn: (s: ConnState) => void;
  setState: (s: S) => void;
  applyEvents: (events: E[]) => void;
  pushError: (e: { code: string; message: string }) => void;
  clearError: () => void;
  pushChat: (m: ChatMessage) => void;
  setSpectator: (b: boolean) => void;
};

export function createGameStore<S, E>() {
  return create<GameStore<S, E>>()((set) => ({
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
    pushError: (e) => set({ lastError: { ...e, ts: Date.now() } }),
    clearError: () => set({ lastError: null }),
    pushChat: (m) =>
      set((s) => ({ chat: [...s.chat, m].slice(-100) })),
    setSpectator: (b) => set({ isSpectator: b }),
  }));
}

// --- Default Sunny Harbor store (legacy: components import `useGameStore`)
// We keep the original singleton for the existing Catan code path so the
// refactor stays minimal. New games create their own stores via
// `createGameStore<TheirState, TheirEvents>()`.

import type { GameState } from "@/games/sunny-harbor/types";
import type { ServerEvent } from "@/games/sunny-harbor/protocol";

export const useGameStore = createGameStore<GameState, ServerEvent>();

// --- localStorage helpers (shared across all games) -----------------------

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
