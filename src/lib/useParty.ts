"use client";

import { useEffect, useRef } from "react";
import PartySocket from "partysocket";
import type { ClientMessage, ServerMessage } from "@/game/protocol";
import { useGameStore, loadReconnectId, saveReconnectId } from "./store";

// Map server error codes to friendly user-facing strings.
// Returning `null` swallows the error silently (used when the UI already
// prevents the action visually so the rejection would only confuse the user).
function friendlyErrorMessage(code: string, raw: string): string | null {
  switch (code) {
    case "spectator":
      return "Oyun başlamış — izleyici olarak bağlandın.";
    case "full":
      return "Oda dolu (8 oyuncu).";
    case "not_host":
      return "Bu işlem sadece host tarafından yapılabilir.";
    case "not_enough_players":
      return "Oyunu başlatmak için en az 2 oyuncu gerekli.";
    case "start_failed":
      return `Oyun başlatılamadı: ${raw}`;
    case "not_allowed":
      return raw;
    case "bad_json":
      return "Geçersiz mesaj.";
    case "action_rejected": {
      // Most action_rejected reasons are filtered out by client validation now;
      // surface only ones the player actually needs to know about.
      const visibleReasons = new Set([
        "not_enough_resources",
        "not_enough_to_give",
        "not_enough_to_receive",
        "bank_empty",
        "deck_empty",
        "no_settlements_left",
        "no_cities_left",
        "no_roads_left",
        "already_played_dev",
        "no_knight_card",
        "no_card",
        "wrong_phase",
        "wrong_subphase",
      ]);
      if (visibleReasons.has(raw)) {
        return reasonLabel(raw);
      }
      return null; // silently ignore, UI already prevents this
    }
    default:
      return raw;
  }
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    not_enough_resources: "Yeterli kaynağın yok.",
    not_enough_to_give: "Vermek istediğin kaynaklar elinde yok.",
    not_enough_to_receive: "Karşı tarafta gereken kaynak yok.",
    bank_empty: "Banka tükendi.",
    deck_empty: "Gelişme kartı kalmadı.",
    no_settlements_left: "Yerleştirilebilir yerleşim kalmadı.",
    no_cities_left: "Yerleştirilebilir şehir kalmadı.",
    no_roads_left: "Yerleştirilebilir yol kalmadı.",
    already_played_dev: "Bu turda zaten bir gelişme kartı oynadın.",
    no_knight_card: "Şövalye kartın yok.",
    no_card: "Bu kart elinde yok.",
    wrong_phase: "Şu an bunu yapamazsın (yanlış aşama).",
    wrong_subphase: "Şu an bunu yapamazsın (sıra başkasında veya başka eylem bekleniyor).",
  };
  return labels[reason] ?? reason;
}

const PARTY_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";

export function useParty(roomCode: string | null, nickname: string) {
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!roomCode || !nickname) return;

    const store = useGameStore.getState();
    const reconnectId = loadReconnectId(roomCode);
    store.setConn("connecting");
    // Reset the spectator flag whenever we (re)open the socket — the server
    // will set it again via an "error: spectator" if applicable.
    store.setSpectator(false);

    const socket = new PartySocket({
      host: PARTY_HOST,
      room: roomCode,
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      useGameStore.getState().setConn("open");
      const hello: ClientMessage = {
        t: "hello",
        nickname,
        reconnectId: reconnectId ?? undefined,
      };
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener("close", () =>
      useGameStore.getState().setConn("closed"),
    );
    socket.addEventListener("error", () =>
      useGameStore.getState().setConn("error"),
    );

    socket.addEventListener("message", (e: MessageEvent<string>) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      const s = useGameStore.getState();
      switch (msg.t) {
        case "snapshot": {
          if (process.env.NODE_ENV !== "production") {
            console.debug(
              "[party] snapshot",
              msg.state.players.length,
              "players",
              msg.state.players.map((p) => p.nickname),
              "selfId=",
              msg.selfId || "(broadcast)",
            );
          }
          s.setState(msg.state);
          if (msg.selfId) {
            s.setSelfId(msg.selfId);
            saveReconnectId(roomCode, msg.selfId);
          }
          break;
        }
        case "patch":
          s.applyEvents(msg.events);
          break;
        case "error": {
          console.warn("[party error]", msg.code, msg.message);
          if (msg.code === "spectator") {
            // Server admitted us as a spectator — record it so the UI can
            // hide action controls and show a banner.
            s.setSpectator(true);
          }
          // Friendly mapping for common rejection codes; collapse to a soft toast.
          const friendly = friendlyErrorMessage(msg.code, msg.message);
          if (friendly) {
            s.pushError({ code: msg.code, message: friendly });
          }
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
  }, [roomCode, nickname]);

  function send(msg: ClientMessage) {
    socketRef.current?.send(JSON.stringify(msg));
  }

  return { send };
}
