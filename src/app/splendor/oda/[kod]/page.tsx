"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  loadStoredNickname,
  saveNickname,
  saveLastRoomCode,
} from "@/platform/store";
import { recordGame } from "@/platform/stats";
import { useSplendorStore } from "@/games/splendor/store";
import { useParty } from "@/games/splendor/useParty";
import { isValidRoomCode } from "@/platform/roomCode";
import { Scrollable, type ScrollableHandle } from "@/platform/ui/Scrollable";
import { SplendorRoom } from "@/games/splendor/components/SplendorRoom";
import type { SplendorAction } from "@/games/splendor/actions";
import type {
  SplendorPlayerColor,
  SplendorSettings,
} from "@/games/splendor/types";

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

const COLOR_HEX: Record<SplendorPlayerColor, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
};

function NicknamePrompt({
  roomCode,
  defaultNickname = "",
  onSubmit,
}: {
  roomCode: string;
  defaultNickname?: string;
  onSubmit: (n: string) => void;
}) {
  const [nick, setNick] = useState(defaultNickname);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    const trimmed = nick.trim();
    if (trimmed.length < 2) {
      setError("En az 2 karakter takma ad gir.");
      return;
    }
    if (trimmed.length > 24) {
      setError("Takma ad 24 karakteri geçemez.");
      return;
    }
    onSubmit(trimmed);
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
        <div>
          <h2 className="text-xl font-semibold">Splendor odasına davet</h2>
          <p className="text-xs text-white/60">
            Oda kodu:{" "}
            <span className="font-mono tracking-[0.3em] text-white/90">
              {roomCode}
            </span>
          </p>
        </div>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          autoFocus
          placeholder="Takma ad"
          maxLength={24}
          className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-indigo-400"
        />
        <button
          onClick={commit}
          className="w-full rounded-xl bg-indigo-500 py-2.5 font-semibold text-white hover:bg-indigo-400"
        >
          Odaya katıl
        </button>
        {error && (
          <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SplendorRoomPage() {
  const router = useRouter();
  const params = useParams<{ kod: string }>();
  const roomCode = (params?.kod ?? "").toUpperCase();

  const [nickname, setNickname] = useState("");
  const [chatInput, setChatInput] = useState("");
  const chatRef = useRef<ScrollableHandle | null>(null);
  const logRef = useRef<ScrollableHandle | null>(null);

  useEffect(() => {
    if (!isValidRoomCode(roomCode)) {
      router.replace("/splendor");
      return;
    }
    saveLastRoomCode(roomCode);
  }, [roomCode, router]);

  const suggestedNickname = loadStoredNickname() || "";
  const conn = useSplendorStore((s) => s.conn);
  const state = useSplendorStore((s) => s.state);
  const selfId = useSplendorStore((s) => s.selfId);
  const chat = useSplendorStore((s) => s.chat);

  const { send } = useParty(
    nickname && isValidRoomCode(roomCode) ? roomCode : null,
    nickname,
  );

  const me = useMemo(
    () => state?.players.find((p) => p.id === selfId) ?? null,
    [state, selfId],
  );

  const sendAction = (a: SplendorAction) => send({ t: "action", action: a });

  // Persist finished game stats once per (room, winnerId, playerset).
  useEffect(() => {
    if (!state || state.phase !== "finished" || !me) return;
    const won = state.winnerId === me.id;
    recordGame({
      gameKey: `${state.roomCode}:${state.winnerId ?? "draw"}:${state.players
        .map((p) => p.id)
        .sort()
        .join(",")}`,
      game: "splendor",
      finishedAt: Date.now(),
      result: won ? "win" : "loss",
      finalScore: me.prestige,
      playerCount: state.players.length,
      nickname: me.nickname,
      metadata: {
        cardsBought: me.bought.length,
        noblesTaken: me.nobles.length,
      },
    });
  }, [state?.phase, state?.winnerId, me?.id]);

  // auto-scroll chat / log
  useEffect(() => {
    chatRef.current?.scrollToBottom();
  }, [chat.length]);
  useEffect(() => {
    if (state?.log) {
      requestAnimationFrame(() => logRef.current?.scrollToBottom());
    }
  }, [state?.log.length]);

  if (!isValidRoomCode(roomCode)) return null;

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white lg:h-screen lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/60 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/splendor")}
            className="text-xs text-white/60 hover:text-white"
          >
            ← Lobi
          </button>
          <div className="text-sm">
            Splendor —{" "}
            <span className="font-mono tracking-widest text-white/90">
              {roomCode}
            </span>
          </div>
        </div>
        <div className="text-xs text-white/40">
          {conn === "open" ? "✓ bağlı" : conn === "connecting" ? "bağlanıyor…" : conn}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 p-2 sm:p-4 lg:grid-cols-[1fr_320px] lg:min-h-0 lg:overflow-hidden">
        <div className="relative flex min-h-[480px] flex-col lg:min-h-0 lg:overflow-y-auto">
          {!nickname ? (
            <NicknamePrompt
              roomCode={roomCode}
              defaultNickname={suggestedNickname}
              onSubmit={(n) => {
                saveNickname(n);
                setNickname(n);
              }}
            />
          ) : !state ? (
            <div className="flex h-full items-center justify-center text-white/50">
              {conn === "open"
                ? "Sunucudan oda durumu bekleniyor…"
                : conn === "connecting"
                ? "Sunucuya bağlanılıyor…"
                : "Sunucuya ulaşılamıyor."}
            </div>
          ) : state.phase === "lobby" ? (
            <SplendorLobby
              state={state}
              me={me}
              onStart={() => send({ t: "start_game" })}
              onSetColor={(c) => send({ t: "set_color", color: c })}
              onSetSettings={(s) => send({ t: "set_settings", settings: s })}
            />
          ) : state.phase === "finished" ? (
            <SplendorFinished
              state={state}
              isHost={!!me?.isHost}
              onPlayAgain={() => send({ t: "reset_room" })}
              onLeaveLobby={() => router.push("/splendor")}
            />
          ) : (
            <SplendorRoom state={state} selfId={selfId ?? ""} sendAction={sendAction} />
          )}
        </div>

        <aside className="flex flex-col gap-3 lg:overflow-hidden">
          {state && state.phase !== "lobby" && (
            <PlayerScores state={state} selfId={selfId} />
          )}
          {state && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60">
              <div className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/40">
                Olaylar
              </div>
              <Scrollable ref={logRef} className="max-h-48 px-3 py-2 text-xs">
                {state.log.length === 0 && (
                  <div className="text-white/30">Henüz olay yok…</div>
                )}
                {state.log.map((e) => (
                  <div key={e.id} className="mb-1 leading-snug text-white/80">
                    {e.text}
                  </div>
                ))}
              </Scrollable>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-slate-900/60">
            <div className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/40">
              Sohbet
            </div>
            <Scrollable ref={chatRef} className="min-h-0 flex-1 px-3 py-2 text-xs">
              {chat.length === 0 && (
                <div className="text-white/30">Sohbet boş…</div>
              )}
              {chat.map((m, i) => (
                <div key={i} className="mb-1 leading-snug">
                  <span className="font-semibold text-white/70">
                    {m.fromNickname}:
                  </span>{" "}
                  <span className="text-white/90">{m.text}</span>
                </div>
              ))}
            </Scrollable>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                send({ t: "chat", text: chatInput.trim() });
                setChatInput("");
              }}
              className="flex gap-1 border-t border-white/10 p-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="mesaj…"
                className="flex-1 rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-xs outline-none focus:border-indigo-400"
                maxLength={280}
              />
              <button
                type="submit"
                className="rounded-md bg-indigo-500 px-2 py-1 text-xs font-semibold hover:bg-indigo-400"
              >
                ↵
              </button>
            </form>
          </div>
        </aside>
      </div>
    </main>
  );
}

function SplendorLobby({
  state,
  me,
  onStart,
  onSetColor,
  onSetSettings,
}: {
  state: import("@/games/splendor/types").SplendorState;
  me: import("@/games/splendor/types").SplendorPlayer | null;
  onStart: () => void;
  onSetColor: (c: SplendorPlayerColor) => void;
  onSetSettings: (s: Partial<SplendorSettings>) => void;
}) {
  const usedColors = new Set(state.players.map((p) => p.color));
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-2xl font-semibold">Splendor lobisi</h2>
      <p className="text-sm text-white/60">
        Hoş geldin{me ? `, ${me.nickname}` : ""}. 2–4 oyuncu, 15 prestij hedefi.
      </p>

      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/40">
          Oyuncular ({state.players.length}/4)
        </div>
        <div className="space-y-2">
          {state.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLOR_HEX[p.color] }}
                />
                <span className="font-medium">{p.nickname}</span>
                {p.isHost && (
                  <span className="text-[10px] uppercase tracking-wider text-amber-300">
                    host
                  </span>
                )}
                {!p.connected && (
                  <span className="text-[10px] text-rose-400">offline</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {me && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/40">
            Renk seçimi
          </div>
          <div className="flex flex-wrap gap-2">
            {COLOR_POOL.map((c) => {
              const taken = usedColors.has(c) && me.color !== c;
              return (
                <button
                  key={c}
                  onClick={() => onSetColor(c)}
                  disabled={taken}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-30 ${
                    me.color === c
                      ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-950"
                      : ""
                  }`}
                  style={{ backgroundColor: COLOR_HEX[c], borderColor: "rgba(0,0,0,0.4)" }}
                />
              );
            })}
          </div>
        </div>
      )}

      {me?.isHost && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/40">
            Ayarlar
          </div>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={state.settings.allowChat}
              onChange={(e) => onSetSettings({ allowChat: e.target.checked })}
            />
            Sohbete izin ver
          </label>
          <div className="mt-2 text-sm">
            <label className="text-white/70">
              Prestij hedefi:{" "}
              <input
                type="number"
                min={5}
                max={30}
                value={state.settings.prestigeToWin ?? 15}
                onChange={(e) =>
                  onSetSettings({ prestigeToWin: parseInt(e.target.value) || 15 })
                }
                className="ml-2 w-16 rounded border border-white/10 bg-slate-950/60 px-2 py-1 text-white"
              />
            </label>
          </div>
        </div>
      )}

      {me?.isHost && (
        <button
          onClick={onStart}
          disabled={state.players.length < 2}
          className="rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-indigo-400"
        >
          Oyunu başlat
        </button>
      )}
      {me && !me.isHost && (
        <p className="text-sm text-white/50">Host'un oyunu başlatması bekleniyor…</p>
      )}
    </div>
  );
}

function SplendorFinished({
  state,
  isHost,
  onPlayAgain,
  onLeaveLobby,
}: {
  state: import("@/games/splendor/types").SplendorState;
  isHost: boolean;
  onPlayAgain: () => void;
  onLeaveLobby: () => void;
}) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  const sorted = [...state.players].sort((a, b) => b.prestige - a.prestige);
  return (
    <div className="flex flex-col items-center justify-center gap-6 p-12 text-center">
      <h2 className="text-3xl font-bold">
        {winner ? `🏆 ${winner.nickname} kazandı!` : "Berabere"}
      </h2>
      <div className="space-y-1 text-sm">
        {sorted.map((p, i) => (
          <div key={p.id} className="flex items-center justify-center gap-3">
            <span className="text-white/50">#{i + 1}</span>
            <span className="font-semibold">{p.nickname}</span>
            <span className="text-amber-300">{p.prestige}★</span>
            <span className="text-white/40">
              {p.bought.length} kart
              {p.nobles.length > 0 ? ` · ${p.nobles.length} soylu` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-3">
        {isHost && (
          <button
            onClick={onPlayAgain}
            className="rounded-xl bg-indigo-500 px-5 py-2.5 font-semibold text-white hover:bg-indigo-400"
          >
            Tekrar oyna
          </button>
        )}
        <button
          onClick={onLeaveLobby}
          className="rounded-xl border border-white/20 px-5 py-2.5 font-semibold text-white hover:bg-white/10"
        >
          Lobiye dön
        </button>
      </div>
    </div>
  );
}

function PlayerScores({
  state,
  selfId,
}: {
  state: import("@/games/splendor/types").SplendorState;
  selfId: string | null;
}) {
  const sorted = [...state.players].sort((a, b) => b.prestige - a.prestige);
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60">
      <div className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/40">
        Skorlar
      </div>
      <div className="space-y-1 p-2 text-xs">
        {sorted.map((p) => {
          const isActive = state.players[state.currentPlayerIndex]?.id === p.id;
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded px-2 py-1 ${
                isActive ? "bg-indigo-500/20" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLOR_HEX[p.color] }}
                />
                <span className="font-medium text-white/90">
                  {p.nickname}
                  {p.id === selfId && (
                    <span className="ml-1 text-amber-300">(sen)</span>
                  )}
                </span>
              </div>
              <span className="font-bold text-amber-200">{p.prestige}★</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
