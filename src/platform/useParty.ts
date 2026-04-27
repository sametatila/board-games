"use client";

import { useEffect, useRef } from "react";
import PartySocket from "partysocket";
import type { UseBoundStore, StoreApi } from "zustand";
import type { GameStore } from "./store";
import { loadReconnectId, saveReconnectId } from "./store";

// Generic message shapes shared across all games. The specific game
// types (e.g. SplendorAction) live in each game's protocol.ts; this
// hook is parameterised so it can drive any of them.
export type GenericClientMessage =
  | { t: "hello"; nickname: string; color?: string; reconnectId?: string }
  | { t: string; [k: string]: unknown };

export type GenericServerMessage =
  | { t: "snapshot"; state: unknown; selfId: string }
  | { t: "patch"; events: unknown[] }
  | { t: "error"; code: string; message: string }
  | {
      t: "chat_msg";
      fromPlayerId: string;
      fromNickname: string;
      text: string;
      ts: number;
    }
  | { t: "pong" };

const PARTY_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";

type StoreHook<S, E> = UseBoundStore<StoreApi<GameStore<S, E>>>;

/**
 * `gameId` selects which PartyKit party (server bundle) the socket
 * talks to. `store` is the per-game Zustand store created via
 * `createGameStore<MyState, MyEvents>()`. `friendlyError` lets the
 * caller localise / filter rejection codes before showing toasts.
 */
export function useParty<S, E>(
  store: StoreHook<S, E>,
  roomCode: string | null,
  nickname: string,
  gameId: string,
  friendlyError?: (code: string, raw: string) => string | null,
) {
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!roomCode || !nickname) return;

    const s0 = store.getState();
    const reconnectId = loadReconnectId(roomCode);
    s0.setConn("connecting");
    s0.setSpectator(false);

    const socket = new PartySocket({
      host: PARTY_HOST,
      room: roomCode,
      party: gameId,
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      store.getState().setConn("open");
      const hello = {
        t: "hello",
        nickname,
        reconnectId: reconnectId ?? undefined,
      };
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener("close", () => store.getState().setConn("closed"));
    socket.addEventListener("error", () => store.getState().setConn("error"));

    socket.addEventListener("message", (e: MessageEvent<string>) => {
      let msg: GenericServerMessage;
      try {
        msg = JSON.parse(e.data) as GenericServerMessage;
      } catch {
        return;
      }
      const s = store.getState();
      switch (msg.t) {
        case "snapshot": {
          s.setState(msg.state as S);
          if (msg.selfId) {
            s.setSelfId(msg.selfId);
            saveReconnectId(roomCode, msg.selfId);
          }
          break;
        }
        case "patch":
          s.applyEvents(msg.events as E[]);
          break;
        case "error": {
          if (msg.code === "spectator") s.setSpectator(true);
          const friendly = friendlyError
            ? friendlyError(msg.code, msg.message)
            : msg.message;
          if (friendly) s.pushError({ code: msg.code, message: friendly });
          break;
        }
        case "chat_msg":
          s.pushChat({
            fromPlayerId: msg.fromPlayerId,
            fromNickname: msg.fromNickname,
            text: msg.text,
            ts: msg.ts,
          });
          break;
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [store, roomCode, nickname, gameId, friendlyError]);

  function send(msg: GenericClientMessage) {
    socketRef.current?.send(JSON.stringify(msg));
  }

  return { send };
}
