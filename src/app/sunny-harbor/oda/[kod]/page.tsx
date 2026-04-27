"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useGameStore,
  loadStoredNickname,
  saveLastRoomCode,
  saveNickname,
} from "@/platform/store";
import { useParty } from "@/games/sunny-harbor/useParty";
import { isValidRoomCode } from "@/platform/roomCode";
import type { MapTemplateId } from "@/games/sunny-harbor/types";
import type { GameAction } from "@/games/sunny-harbor/actions";
import { Countdown, GameViewContainer, PlayerScores } from "@/games/sunny-harbor/components/GameView";
import { Tooltip } from "@/platform/ui/Tooltip";
import { useConfirm } from "@/platform/ui/ConfirmDialog";
import { Scrollable, type ScrollableHandle } from "@/platform/ui/Scrollable";
import { setMuted, isMuted } from "@/platform/sfx";

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <>{children}</>;
}

function MuteButton() {
  const [m, setM] = useState(false);
  useEffect(() => {
    setM(isMuted());
  }, []);
  function toggle() {
    const next = !m;
    setMuted(next);
    setM(next);
  }
  return (
    <button
      onClick={toggle}
      className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-white/70 transition hover:bg-slate-700"
      title={m ? "Sesi aç" : "Sesi kapat"}
    >
      {m ? "🔇" : "🔊"}
    </button>
  );
}

// Inline nickname prompt shown when somebody opens an /oda/<kod>
// invite link without a saved nickname. Keeps the room code on the
// URL so the user lands directly in the room once they confirm.
function NicknamePrompt({
  roomCode,
  defaultNickname = "",
  onSubmit,
}: {
  roomCode: string;
  defaultNickname?: string;
  onSubmit: (nickname: string) => void;
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
    <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-semibold text-white">
            Sunny Harbor odasına davet
          </h2>
          <p className="text-xs text-white/60">
            Oda kodu:{" "}
            <span className="font-mono tracking-[0.3em] text-white/90">
              {roomCode}
            </span>
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold tracking-wide text-white/50">
            Takma ad
          </span>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            autoFocus
            placeholder="Örn. Mehmet"
            maxLength={24}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-indigo-400"
          />
        </label>
        <button
          onClick={commit}
          className="w-full rounded-xl bg-indigo-500 py-2.5 font-semibold text-white transition hover:bg-indigo-400"
        >
          Odaya katıl
        </button>
        {error && (
          <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
        <p className="text-center text-[11px] text-white/40">
          Takma adın bu cihazda hatırlanır; bir sonraki oda davetinde
          tekrar girmeni gerektirmez.
        </p>
      </div>
    </div>
  );
}

function LoadingPanel({ conn }: { conn: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-900/40 p-8">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <div className="mt-4 text-sm text-white/70">
          {conn === "open"
            ? "Sunucudan oda durumu bekleniyor…"
            : conn === "connecting"
            ? "Sunucuya bağlanılıyor…"
            : conn === "error" || conn === "closed"
            ? "Sunucuya ulaşılamıyor. Sayfayı yenilemeyi dene."
            : "Yükleniyor…"}
        </div>
      </div>
    </div>
  );
}

function ErrorToast() {
  const lastError = useGameStore((s) => s.lastError);
  const clearError = useGameStore((s) => s.clearError);

  useEffect(() => {
    if (!lastError) return;
    const timeoutId = setTimeout(() => clearError(), 3500);
    return () => clearTimeout(timeoutId);
  }, [lastError, clearError]);

  if (!lastError) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-rose-500/40 bg-slate-900/95 px-4 py-2 text-sm text-rose-100 shadow-2xl backdrop-blur">
        <span>⚠ {lastError.message}</span>
        <button
          onClick={clearError}
          className="text-xs text-white/40 hover:text-white"
          aria-label="Kapat"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Map metadata is now sourced from the canonical MAP_TEMPLATES so the lobby
// stays in sync with the gameplay rules (ships, win condition, etc.).
import { MAP_TEMPLATES, MAP_GUIDES } from "@/games/sunny-harbor/mapTemplates";

const MAP_OPTIONS: { id: MapTemplateId; label: string; description: string }[] =
  (Object.keys(MAP_TEMPLATES) as MapTemplateId[]).map((id) => ({
    id,
    label: MAP_TEMPLATES[id].name,
    description: MAP_TEMPLATES[id].description,
  }));

// Render the actual hex layout for a template at a fixed player count, so
// each lobby card shows a real silhouette (not a hand-drawn icon). We use
// pointy-top axial → svg pixel: x = sqrt(3) * (q + r/2), y = 1.5 * r.
function MapPreview({ id }: { id: MapTemplateId }) {
  const slots = useMemo(
    () => MAP_TEMPLATES[id].buildSlots(4),
    [id],
  );
  // Compute pixel positions and bounding box.
  const pts = slots.map((s) => {
    const x = Math.sqrt(3) * (s.coord.q + s.coord.r / 2);
    const y = 1.5 * s.coord.r;
    return { x, y, slot: s };
  });
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const padding = 1.2;
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = maxX - minX + padding * 2;
  const vbH = maxY - minY + padding * 2;
  const colorFor = (slot: { forced?: string; hidden?: boolean }) => {
    if (slot.hidden) return "#475569"; // fog grey
    switch (slot.forced) {
      case "sea":
        return "#1e3a5f";
      case "desert":
        return "#c8a974";
      case "gold":
        return "#facc15";
      default:
        return "#4d7c2a"; // generic land
    }
  };
  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className="h-16 w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {pts.map((p, i) => (
        <polygon
          key={i}
          points={hexagonPoints(p.x, p.y, 0.92)}
          fill={colorFor(p.slot)}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth={0.04}
        />
      ))}
    </svg>
  );
}

// Pointy-top hex with given center and radius — corners at 30°, 90°, 150°, ...
function hexagonPoints(cx: number, cy: number, r: number): string {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i + 30);
    out.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return out.join(" ");
}

export default function RoomPage() {
  const params = useParams<{ kod: string }>();
  const router = useRouter();
  const roomCode = (params.kod ?? "").toUpperCase();

  const nickFromStore = useGameStore((s) => s.nickname);
  const [nickname, setNickname] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    // Bad room code: only case where we still kick the user back to
    // the lobby. Missing nickname is handled inline below so a shared
    // invite link doesn't dump the recipient on the home page.
    if (!isValidRoomCode(roomCode)) {
      router.replace("/sunny-harbor");
      return;
    }
    // Remember this room so the lobby can offer a one-tap rejoin if the
    // user navigates away (e.g. accidentally hits the header back button).
    saveLastRoomCode(roomCode);
  }, [roomCode, router]);

  // Suggested nickname pre-filled into the prompt: store value first,
  // then the persisted last-used name. The user can confirm as-is or
  // override it before joining the room.
  const suggestedNickname = nickFromStore || loadStoredNickname() || "";

  const conn = useGameStore((s) => s.conn);
  const state = useGameStore((s) => s.state);
  const selfId = useGameStore((s) => s.selfId);

  const { send } = useParty(
    nickname && isValidRoomCode(roomCode) ? roomCode : null,
    nickname,
  );

  const me = useMemo(
    () => state?.players.find((p) => p.id === selfId) ?? null,
    [state, selfId],
  );

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/60 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-xs text-white/60 hover:text-white"
            title="Tüm oyunlar"
          >
            ← Tüm oyunlar
          </button>
          <button
            onClick={() => router.push("/sunny-harbor")}
            className="text-xs text-white/60 hover:text-white"
            title="Sunny Harbor lobisine çık (oda burada açık kalır, geri dönebilirsin)"
          >
            Lobi
          </button>
          <h1 className="text-lg font-semibold">Sunny Harbor</h1>
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-sm tracking-[0.3em]">
            {roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setSidePanelOpen((s) => !s)}
            className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-white/80 transition hover:bg-slate-700 lg:hidden"
            title="Yan paneli aç/kapat"
          >
            📋 Panel
          </button>
          <button
            onClick={() => setGuideOpen(true)}
            className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-white/80 transition hover:bg-slate-700"
            title="Bu harita nasıl oynanır?"
          >
            ❓ Rehber
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-white/80 transition hover:bg-slate-700"
            title="Oyun ayarları"
          >
            ⚙ Ayarlar
          </button>
          {(me?.isHost || !state || state.phase === "lobby") && (
            <button
              onClick={async () => {
                const inGame = state && state.phase !== "lobby";
                const ok = await confirm(
                  inGame
                    ? {
                        title: "Oyunu bitir?",
                        body:
                          "Mevcut oyun erken bitirilecek. Tüm ilerleme silinir ve herkes lobiye geri döner.",
                        confirmLabel: "Oyunu bitir",
                        cancelLabel: "Vazgeç",
                        tone: "danger",
                      }
                    : {
                        title: "Odayı sıfırla?",
                        body:
                          "Board ve oyun ilerleyişi silinir. Lobby ayarları (harita, zorluk, oyuncular) korunur.",
                        confirmLabel: "Sıfırla",
                        cancelLabel: "Vazgeç",
                        tone: "warning",
                      },
                );
                if (ok) send({ t: "reset_room" });
              }}
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-200 transition hover:bg-rose-500/20"
              title={
                state && state.phase !== "lobby"
                  ? "Oyunu erken bitir ve herkesi lobiye gönder"
                  : "Odayı sıfırla"
              }
            >
              {state && state.phase !== "lobby" ? "🏁 Oyunu bitir" : "↻ Sıfırla"}
            </button>
          )}
          <MuteButton />
          <span
            className={`inline-flex h-2 w-2 rounded-full ${
              conn === "open"
                ? "bg-emerald-400"
                : conn === "connecting"
                ? "bg-amber-400"
                : "bg-rose-400"
            }`}
          />
          <span className="text-white/60">
            {conn === "open"
              ? "Bağlı"
              : conn === "connecting"
              ? "Bağlanıyor"
              : conn === "closed"
              ? "Bağlantı kesildi"
              : conn === "error"
              ? "Bağlantı hatası"
              : "Boşta"}
          </span>
        </div>
      </header>

      <ErrorToast />

      <div className="grid flex-1 grid-cols-1 gap-4 p-2 sm:p-4 lg:grid-cols-[1fr_320px] lg:min-h-0 lg:overflow-hidden">
        <div className="relative flex min-h-[480px] flex-col lg:min-h-0 lg:overflow-y-auto">
          {!nickname ? (
            <NicknamePrompt
              roomCode={roomCode}
              defaultNickname={suggestedNickname}
              onSubmit={(n) => {
                saveNickname(n);
                useGameStore.getState().setNickname(n);
                setNickname(n);
              }}
            />
          ) : !state ? (
            <LoadingPanel conn={conn} />
          ) : state.phase === "lobby" ? (
            <LobbyPanel
              nickname={nickname}
              roomCode={roomCode}
              onSetMap={(id) => send({ t: "set_map", mapTemplateId: id })}
              onSetDifficulty={(d) => send({ t: "set_difficulty", difficulty: d })}
              onSetColor={(c) => send({ t: "set_color", color: c })}
              onSetSettings={(s) => send({ t: "set_settings", settings: s })}
              onStart={() => send({ t: "start_game" })}
            />
          ) : (
            <ClientOnly>
              <GameViewContainer
                sendAction={(action: GameAction) =>
                  send({ t: "action", action })
                }
                onResetRoom={() => send({ t: "reset_room" })}
              />
            </ClientOnly>
          )}
        </div>

        <aside
          className={`show-scrollbar flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto ${
            !nickname
              ? "hidden"
              : sidePanelOpen
              ? "fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto bg-slate-950/95 p-4 backdrop-blur lg:static lg:bg-transparent lg:p-0"
              : "hidden lg:flex"
          }`}
        >
          {sidePanelOpen && (
            <button
              onClick={() => setSidePanelOpen(false)}
              className="lg:hidden self-end rounded bg-slate-700 px-3 py-1 text-xs"
            >
              ✕ Kapat
            </button>
          )}
          {state?.phase === "lobby" ? <PlayersPanel /> : state ? <PlayerScores state={state} /> : null}
          {state?.pendingTrade && (
            <ActiveTradePanel
              state={state}
              myId={selfId}
              onAccept={() =>
                selfId &&
                send({
                  t: "action",
                  action: { type: "ACCEPT_TRADE_OFFER", playerId: selfId },
                })
              }
              onReject={() =>
                selfId &&
                send({
                  t: "action",
                  action: { type: "REJECT_TRADE_OFFER", playerId: selfId },
                })
              }
              onFinalize={(partnerId) =>
                selfId &&
                send({
                  t: "action",
                  action: {
                    type: "FINALIZE_TRADE",
                    playerId: selfId,
                    partnerId,
                  },
                })
              }
              onCancel={() =>
                selfId &&
                send({
                  t: "action",
                  action: { type: "CANCEL_TRADE", playerId: selfId },
                })
              }
            />
          )}
          <LogPanel />
          <ChatPanel onSend={(text) => send({ t: "chat", text })} selfId={selfId} />
        </aside>
      </div>

      {settingsOpen && state && (
        <SettingsModal
          state={state}
          isHost={!!me?.isHost}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => {
            send({ t: "set_settings", settings });
          }}
        />
      )}
      {guideOpen && (
        <GuideModal
          state={state}
          onClose={() => setGuideOpen(false)}
        />
      )}
      {confirmDialog}
    </main>
  );
}

function LobbyPanel({
  nickname,
  roomCode,
  onSetMap,
  onSetDifficulty,
  onSetColor,
  onSetSettings,
  onStart,
}: {
  nickname: string;
  roomCode: string;
  onSetMap: (id: MapTemplateId) => void;
  onSetDifficulty: (d: import("@/games/sunny-harbor/types").Difficulty) => void;
  onSetColor: (c: import("@/games/sunny-harbor/types").PlayerColor) => void;
  onSetSettings: (s: Partial<import("@/games/sunny-harbor/types").GameSettings>) => void;
  onStart: () => void;
}) {
  const state = useGameStore((s) => s.state);
  const selfId = useGameStore((s) => s.selfId);
  const me = state?.players.find((p) => p.id === selfId);
  const isHost = !!me?.isHost;
  const canStart = (state?.players.length ?? 0) >= 2;
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/oda/${roomCode}`
      : "";
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  async function copy(text: string, kind: "link" | "code") {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && typeof document !== "undefined") {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center gap-5 rounded-2xl border border-white/10 bg-slate-900/40 p-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Hoş geldin, {nickname}.</h2>
        <p className="mt-1 text-sm text-white/60">
          Arkadaşlarına bu kodu paylaş veya linki gönder.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => copy(roomCode, "code")}
          className="rounded-2xl border border-white/10 bg-slate-950 px-6 py-4 font-mono text-3xl tracking-[0.5em] transition hover:border-white/30"
          title="Kodu kopyala"
        >
          {roomCode}
        </button>
        {shareUrl && (
          <button
            onClick={() => copy(shareUrl, "link")}
            className="text-xs text-indigo-300 hover:text-indigo-200"
          >
            {copied === "link"
              ? "✓ Link kopyalandı"
              : copied === "code"
              ? "✓ Kod kopyalandı"
              : "Linki kopyala"}
          </button>
        )}
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-xs uppercase tracking-wider text-white/40">
          Harita
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MAP_OPTIONS.map((opt) => {
            const active = state?.mapTemplateId === opt.id;
            return (
              <button
                key={opt.id}
                disabled={!isHost}
                onClick={() => onSetMap(opt.id)}
                title={opt.description}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-indigo-400 bg-indigo-500/20 text-white"
                    : "border-white/10 bg-slate-950/40 text-white/70 hover:border-white/30"
                } ${!isHost && !active ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="mb-1 overflow-hidden rounded-md bg-slate-950/60 p-1">
                  <MapPreview id={opt.id} />
                </div>
                <div className="font-semibold">{opt.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-white/50">
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-xs uppercase tracking-wider text-white/40">
          Zorluk
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: "easy", label: "Kolay", desc: "Daha hızlı bitiş, çok dengeli harita" },
              { id: "normal", label: "Normal", desc: "Klasik kurallar" },
              { id: "hard", label: "Zor", desc: "Yüksek puan hedefi, rastgele harita" },
            ] as const
          ).map((opt) => {
            const active = (state?.difficulty ?? "normal") === opt.id;
            return (
              <button
                key={opt.id}
                disabled={!isHost}
                onClick={() => onSetDifficulty(opt.id)}
                title={opt.desc}
                className={`rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? "border-amber-400 bg-amber-500/20 text-white"
                    : "border-white/10 bg-slate-950/40 text-white/70 hover:border-white/30"
                } ${!isHost && !active ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[10px] text-white/50">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-xs font-semibold tracking-wide text-white/50">
          Galibiyet puanı hedefi
        </div>
        <VictoryPointPicker
          state={state}
          isHost={isHost}
          onSetSettings={onSetSettings}
        />
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="text-xs font-semibold tracking-wide text-white/50">
          Renk seç
        </div>
        <ColorPicker
          state={state}
          myId={selfId}
          onSetColor={onSetColor}
        />
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={!canStart}
          className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-400"
        >
          {canStart ? "Oyunu başlat" : "En az 2 oyuncu bekleniyor"}
        </button>
      ) : (
        <p className="text-sm text-white/50">
          Hostun başlatmasını bekliyorsun…
        </p>
      )}
    </div>
  );
}

// "How to play" modal. Renders the guide for the currently-selected
// map template — every map has its own quirks (ships, fog, fortress
// combat) so a one-size-fits-all rule sheet would mislead players.
// Lobby colour picker. Each player owns one of 8 colours; another
// player's pick is shown but disabled. Clicking your own colour does
// nothing. Sends `set_color` to the server, which validates and rejects
// duplicates server-side before broadcasting the change.
const PLAYER_COLOR_OPTIONS: {
  id: import("@/games/sunny-harbor/types").PlayerColor;
  label: string;
  hex: string;
}[] = [
  { id: "red", label: "Kırmızı", hex: "#e23b3b" },
  { id: "blue", label: "Mavi", hex: "#2a76d6" },
  { id: "orange", label: "Turuncu", hex: "#f08a2c" },
  { id: "white", label: "Beyaz", hex: "#eeeeee" },
  { id: "green", label: "Yeşil", hex: "#2da14a" },
  { id: "brown", label: "Kahverengi", hex: "#8b5a2b" },
  { id: "purple", label: "Mor", hex: "#9d3fc4" },
  { id: "cyan", label: "Camgöbeği", hex: "#33c4d8" },
];

// Victory-points-to-win picker. Quick-pick chips for the most common
// targets, plus a number input for anything else. "Otomatik" hands the
// decision back to the map template + player-count scaling. Only the
// host can change the value; everyone else sees the current setting.
function VictoryPointPicker({
  state,
  isHost,
  onSetSettings,
}: {
  state: import("@/games/sunny-harbor/types").GameState | null;
  isHost: boolean;
  onSetSettings: (s: Partial<import("@/games/sunny-harbor/types").GameSettings>) => void;
}) {
  const current = state?.settings.victoryPointsToWin ?? null;
  const presets: { value: number | null; label: string; hint: string }[] = [
    { value: null, label: "Otomatik", hint: "Harita ve oyuncu sayısına göre" },
    { value: 8, label: "8", hint: "Çok hızlı oyun" },
    { value: 10, label: "10", hint: "Klasik" },
    { value: 12, label: "12", hint: "Standart uzun" },
    { value: 15, label: "15", hint: "Çok uzun" },
  ];

  function clampVp(s: string): number | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const v = parseInt(trimmed, 10);
    if (!Number.isFinite(v)) return null;
    if (v < 3) return 3;
    if (v > 20) return 20;
    return v;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = (current ?? null) === p.value;
          return (
            <Tooltip key={String(p.value)} label={p.hint} side="top" width={180}>
              <button
                type="button"
                disabled={!isHost}
                onClick={() => onSetSettings({ victoryPointsToWin: p.value })}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-amber-400 bg-amber-500/20 text-white"
                    : "border-white/10 bg-slate-950/40 text-white/70 hover:border-white/30"
                } ${!isHost && !active ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {p.label}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/50">Özel:</span>
        <input
          type="number"
          min={3}
          max={20}
          step={1}
          disabled={!isHost}
          value={current ?? ""}
          placeholder="3–20"
          onChange={(e) =>
            onSetSettings({ victoryPointsToWin: clampVp(e.target.value) })
          }
          className="w-20 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-sm text-white outline-none focus:border-amber-300 disabled:opacity-60"
        />
        <span className="text-[10px] text-white/40">
          puanına ulaşan kazanır
        </span>
      </div>
    </div>
  );
}

function ColorPicker({
  state,
  myId,
  onSetColor,
}: {
  state: import("@/games/sunny-harbor/types").GameState | null;
  myId: string | null;
  onSetColor: (c: import("@/games/sunny-harbor/types").PlayerColor) => void;
}) {
  const me = state?.players.find((p) => p.id === myId);
  const takenByOther = new Map<string, string>(); // colorId -> nickname
  for (const p of state?.players ?? []) {
    if (p.id !== myId) takenByOther.set(p.color, p.nickname);
  }
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {PLAYER_COLOR_OPTIONS.map((opt) => {
        const mine = me?.color === opt.id;
        const taken = takenByOther.get(opt.id);
        const disabled = !!taken || !me;
        const tooltip = taken
          ? `${taken} bu rengi seçti`
          : mine
          ? "Şu anki rengin"
          : `${opt.label} olarak seç`;
        return (
          <Tooltip key={opt.id} label={tooltip} side="top" width={160}>
            <button
              type="button"
              onClick={() => !disabled && !mine && onSetColor(opt.id)}
              disabled={disabled}
              aria-label={opt.label}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full transition ${
                mine
                  ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-900"
                  : taken
                  ? "cursor-not-allowed opacity-30 grayscale"
                  : "hover:scale-110"
              }`}
              style={{ backgroundColor: opt.hex }}
            >
              {mine && (
                <span className="text-sm font-bold text-slate-900">✓</span>
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function GuideModal({
  state,
  onClose,
}: {
  state: import("@/games/sunny-harbor/types").GameState | null;
  onClose: () => void;
}) {
  const mapId = state?.mapTemplateId ?? "classic";
  const guide = MAP_GUIDES[mapId] ?? MAP_GUIDES.classic;

  // Effective VP target. If the game is already running, we trust
  // state.rules.victoryPointsToWin (it's been computed once with all
  // overrides). Otherwise we derive a preview from the host's settings,
  // template default, and player count so the lobby matches what the
  // game will actually start with.
  let activeVp: number;
  let vpExplanation: string;
  if (state && state.phase !== "lobby") {
    activeVp = state.rules.victoryPointsToWin;
    vpExplanation = state.settings.victoryPointsToWin
      ? "Host bu sayıyı manuel ayarladı."
      : "Harita ve oyuncu sayısına göre otomatik belirlendi.";
  } else if (state) {
    if (state.settings.victoryPointsToWin != null) {
      activeVp = state.settings.victoryPointsToWin;
      vpExplanation = "Host bu sayıyı manuel ayarladı.";
    } else {
      const tpl = MAP_TEMPLATES[mapId];
      let base = tpl.victoryPointsToWin ?? 10;
      if (state.players.length >= 7) base += 2;
      else if (state.players.length >= 5) base += 0;
      if (state.difficulty === "easy") base = Math.max(8, base - 2);
      else if (state.difficulty === "hard") base += 2;
      activeVp = base;
      vpExplanation = "Harita ve oyuncu sayısına göre otomatik belirlendi.";
    }
  } else {
    activeVp = MAP_TEMPLATES[mapId].victoryPointsToWin ?? 10;
    vpExplanation = "Harita varsayılanı.";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="show-scrollbar max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            ❓ {guide.title} — Nasıl oynanır?
          </h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md p-1 text-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <span className="text-2xl">🏆</span>
          <div>
            <div className="text-sm font-semibold text-amber-200">
              Galibiyet hedefi: {activeVp} puan
            </div>
            <div className="text-[11px] text-white/60">{vpExplanation}</div>
          </div>
        </div>

        <p className="mb-4 text-xs text-white/50">
          Aşağıdaki kurallar yalnızca bu harita içindir. Diğer haritaların
          kuralları farklı olabilir — host harita değiştirdiğinde rehber
          de güncellenir.
        </p>
        <div className="space-y-4 text-sm">
          {guide.sections.map((s) => (
            <section key={s.heading}>
              <h4 className="mb-1 font-semibold text-amber-200">
                {s.heading}
              </h4>
              <p className="leading-relaxed text-white/80">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// Game settings modal — host can edit, others can view. Settings cover three
// timer durations (0 = unlimited) plus toggles like player-trade allow/deny.
// Each numeric input lets the user type freely but is clamped on save to
// match the server-side `clampTimer` (0 or 10..600).
function SettingsModal({
  state,
  isHost,
  onClose,
  onSave,
}: {
  state: import("@/games/sunny-harbor/types").GameState;
  isHost: boolean;
  onClose: () => void;
  onSave: (s: Partial<import("@/games/sunny-harbor/types").GameSettings>) => void;
}) {
  const cur = state.settings;
  const [turn, setTurn] = useState(String(cur.turnTimerSec));
  const [trade, setTrade] = useState(String(cur.tradeTimerSec));
  const [discard, setDiscard] = useState(String(cur.discardTimerSec));
  const [allowTrades, setAllowTrades] = useState(cur.allowPlayerTrades);
  const [turnSound, setTurnSound] = useState(cur.turnSound);
  // VP target: empty string means "use template default" (null on the
  // wire). Any other input is parsed as a number on save.
  const [vpTarget, setVpTarget] = useState(
    cur.victoryPointsToWin == null ? "" : String(cur.victoryPointsToWin),
  );

  function clamp(s: string): number {
    const v = parseInt(s, 10);
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (v < 10) return 10;
    if (v > 600) return 600;
    return v;
  }

  function clampVp(s: string): number | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const v = parseInt(trimmed, 10);
    if (!Number.isFinite(v)) return null;
    if (v < 3) return 3;
    if (v > 20) return 20;
    return v;
  }

  function save() {
    onSave({
      turnTimerSec: clamp(turn),
      tradeTimerSec: clamp(trade),
      discardTimerSec: clamp(discard),
      allowPlayerTrades: allowTrades,
      turnSound,
      victoryPointsToWin: clampVp(vpTarget),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">⚙ Oyun Ayarları</h3>
          <button
            onClick={onClose}
            className="text-sm text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        {!isHost && (
          <div className="mb-3 rounded-md bg-slate-800/60 px-3 py-2 text-xs text-white/60">
            Sadece host değiştirebilir. Görüntülemen için açık.
          </div>
        )}

        <div className="space-y-3">
          <label className="block">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-white/90">
                Galibiyet puanı hedefi
              </span>
              <span className="text-[10px] text-white/40">
                3–20 (boş = harita varsayılanı)
              </span>
            </div>
            <input
              type="number"
              min={3}
              max={20}
              step={1}
              value={vpTarget}
              disabled={!isHost}
              placeholder="Otomatik"
              onChange={(e) => setVpTarget(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-amber-300 disabled:opacity-60"
            />
            <p className="mt-1 text-[10px] text-white/40">
              Bu sayıya ulaşan ilk oyuncu kazanır. Boş bırakırsan harita
              ve oyuncu sayısına göre otomatik ayarlanır (klasik 10, bazı
              senaryolar 11–13, 7+ oyuncuda +2).
            </p>
          </label>

          <TimerField
            label="Sıra süresi"
            value={turn}
            setValue={setTurn}
            disabled={!isHost}
            help="Aktif oyuncu sırasını otomatik atlayana kadar süre. 0 = sınırsız (10–600 sn)."
          />
          <TimerField
            label="Ticaret süresi"
            value={trade}
            setValue={setTrade}
            disabled={!isHost}
            help="Açık ticaret teklifi otomatik iptal edilene kadar süre."
          />
          <TimerField
            label="Kart atma süresi (7'de)"
            value={discard}
            setValue={setDiscard}
            disabled={!isHost}
            help="7 atıldığında kart atması gerekenler için süre. Süre dolarsa rastgele kart atılır."
          />

          <label className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-white/80">
            <span>
              Oyuncular arası ticaret
              <span className="block text-[10px] text-white/40">
                Kapatılırsa sadece banka takası kalır.
              </span>
            </span>
            <input
              type="checkbox"
              checked={allowTrades}
              disabled={!isHost}
              onChange={(e) => setAllowTrades(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-amber-400 disabled:cursor-not-allowed"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2 text-sm text-white/80">
            <span>
              Sıra geldi sesi
              <span className="block text-[10px] text-white/40">
                Sıran geldiğinde ses çalsın mı?
              </span>
            </span>
            <input
              type="checkbox"
              checked={turnSound}
              disabled={!isHost}
              onChange={(e) => setTurnSound(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-amber-400 disabled:cursor-not-allowed"
            />
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-700 py-2 text-sm text-white hover:bg-slate-600"
          >
            {isHost ? "Vazgeç" : "Kapat"}
          </button>
          {isHost && (
            <button
              onClick={save}
              className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
            >
              Kaydet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TimerField({
  label,
  value,
  setValue,
  disabled,
  help,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  disabled: boolean;
  help: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/90">{label}</span>
        <span className="text-[10px] text-white/40">saniye (0 = sınırsız)</span>
      </div>
      <input
        type="number"
        min={0}
        max={600}
        step={5}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-amber-300 disabled:opacity-60"
      />
      <p className="mt-1 text-[10px] text-white/40">{help}</p>
    </label>
  );
}

// Persistent panel showing the currently-active trade offer to every player.
// Beats the existing toast in two ways: (1) it stays visible until the trade
// resolves, and (2) it shows accept/reject status for every potential partner
// so the offerer doesn't have to dig into a modal.
function ActiveTradePanel({
  state,
  myId,
  onAccept,
  onReject,
  onFinalize,
  onCancel,
}: {
  state: import("@/games/sunny-harbor/types").GameState;
  myId: string | null;
  onAccept: () => void;
  onReject: () => void;
  onFinalize: (partnerId: string) => void;
  onCancel: () => void;
}) {
  const trade = state.pendingTrade!;
  const offerer = state.players.find((p) => p.id === trade.fromPlayerId);
  const isOfferer = trade.fromPlayerId === myId;
  const me = state.players.find((p) => p.id === myId);
  const order: import("@/games/sunny-harbor/types").Resource[] = [
    "wood",
    "brick",
    "wheat",
    "sheep",
    "ore",
  ];
  const ICON: Record<string, string> = {
    wood: "🌲",
    brick: "🧱",
    wheat: "🍞",
    sheep: "🐑",
    ore: "⛏️",
  };

  function summarize(cards: Partial<Record<string, number>>) {
    return order
      .map((r) => {
        const n = cards[r] ?? 0;
        return n > 0 ? `${n}${ICON[r]}` : null;
      })
      .filter(Boolean)
      .join(" ") || "(yok)";
  }

  const myStatus: "pending" | "accepted" | "rejected" =
    !me
      ? "pending"
      : trade.acceptedBy.includes(me.id)
      ? "accepted"
      : trade.rejectedBy.includes(me.id)
      ? "rejected"
      : "pending";

  const hasResources = me
    ? order.every(
        (r) => (me.resources[r] ?? 0) >= (trade.receive[r] ?? 0),
      )
    : false;

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-amber-300">
        <span>Açık ticaret teklifi</span>
        {state.tradeDeadlineMs ? (
          <Countdown deadlineMs={state.tradeDeadlineMs} />
        ) : state.subPhase === "trading" ? (
          <span className="text-[10px] font-normal text-white/50">aktif</span>
        ) : null}
      </div>
      <div className="mb-2 text-sm text-white">
        <span className="font-semibold">{offerer?.nickname}</span> teklif ediyor
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-950/40 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/50">
            Veriyor
          </div>
          <div className="font-mono text-base">{summarize(trade.give)}</div>
        </div>
        <div className="rounded-lg bg-slate-950/40 p-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/50">
            İstiyor
          </div>
          <div className="font-mono text-base">{summarize(trade.receive)}</div>
        </div>
      </div>

      {/* Status list — show every other player and whether they accepted/rejected. */}
      <div className="mb-3 space-y-1">
        {state.players
          .filter((p) => p.id !== trade.fromPlayerId)
          .map((p) => {
            const accepted = trade.acceptedBy.includes(p.id);
            const rejected = trade.rejectedBy.includes(p.id);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded bg-slate-950/40 px-2 py-1 text-xs"
              >
                <div className="flex items-center gap-2">
                  <ColorDot color={p.color} />
                  <span>{p.nickname}</span>
                </div>
                <span
                  className={
                    accepted
                      ? "text-emerald-300"
                      : rejected
                      ? "text-rose-300"
                      : "text-white/40"
                  }
                >
                  {accepted ? "✓ kabul" : rejected ? "✕ red" : "bekliyor"}
                </span>
              </div>
            );
          })}
      </div>

      {/* Actions */}
      {isOfferer ? (
        <div className="space-y-2">
          {trade.acceptedBy.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-white/50">
                Kabul edenden seç:
              </div>
              {trade.acceptedBy.map((id) => {
                const p = state.players.find((pl) => pl.id === id);
                if (!p) return null;
                return (
                  <button
                    key={id}
                    onClick={() => onFinalize(id)}
                    className="w-full rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    {p.nickname} ile takas et
                  </button>
                );
              })}
            </>
          ) : (
            <p className="text-xs text-white/50">
              Henüz kabul yok. İptal edebilir veya beklersin.
            </p>
          )}
          <button
            onClick={onCancel}
            className="w-full rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600"
          >
            Teklifi iptal et
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            disabled={myStatus !== "pending" || !hasResources}
            className="flex-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-emerald-400"
            title={!hasResources ? "Yeterli kaynağın yok" : undefined}
          >
            {myStatus === "accepted" ? "✓ Kabul ettin" : "Kabul"}
          </button>
          <button
            onClick={onReject}
            disabled={myStatus !== "pending"}
            className="flex-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-rose-400"
          >
            {myStatus === "rejected" ? "✕ Reddettin" : "Reddet"}
          </button>
        </div>
      )}
    </div>
  );
}

// Chat panel — lives in the side aside next to PlayersPanel/PlayerScores.
// Messages are ephemeral (server doesn't persist them). Auto-scrolls to the
// newest message on update.
function ChatPanel({
  onSend,
  selfId,
}: {
  onSend: (text: string) => void;
  selfId: string | null;
}) {
  const messages = useGameStore((s) => s.chat);
  const [text, setText] = useState("");
  const listRef = useRef<ScrollableHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollToBottom();
  }, [messages]);

  // Gartic-style: pressing TAB anywhere on the page jumps focus into
  // the chat input. Skipped if the user is already typing into another
  // input (settings modal, lobby fields, etc.) so tabbing through forms
  // still works as usual.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isFormField =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
        (t?.isContentEditable ?? false);
      if (isFormField) return;
      if (!inputRef.current) return;
      e.preventDefault();
      inputRef.current.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/40">
        <span>Sohbet</span>
        <span>{messages.length}</span>
      </div>
      <Scrollable
        ref={listRef}
        className="max-h-48 min-h-[6rem] flex-1 px-3 py-2 text-xs"
      >
        {messages.length === 0 && (
          <div className="text-white/30">Henüz mesaj yok…</div>
        )}
        {messages.map((m, i) => {
          const mine = m.fromPlayerId === selfId;
          return (
            <div key={i} className="mb-1 leading-snug">
              <span className="mr-1 font-mono text-[10px] text-white/30">
                {formatClock(m.ts)}
              </span>
              <span
                className={
                  mine
                    ? "font-semibold text-emerald-300"
                    : "font-semibold text-white/80"
                }
              >
                {m.fromNickname}:
              </span>{" "}
              <span className="text-white/90">{m.text}</span>
            </div>
          );
        })}
      </Scrollable>
      <div className="flex gap-1 border-t border-white/10 p-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
            // Pressing TAB inside the input releases focus back to the
            // page (the global handler will pull it back here on the
            // NEXT TAB press).
          }}
          maxLength={280}
          placeholder="Mesaj yaz… (TAB)"
          className="flex-1 rounded bg-slate-950/80 px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <button
          onClick={send}
          className="rounded bg-indigo-500 px-3 text-xs font-semibold text-white hover:bg-indigo-400"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}

function PlayersPanel() {
  const state = useGameStore((s) => s.state);
  const selfId = useGameStore((s) => s.selfId);
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-white/40">
        <span>Oyuncular</span>
        <span>{state?.players.length ?? 0}/8</span>
      </div>
      <ul className="space-y-2">
        {state?.players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <ColorDot color={p.color} />
              <span className={p.id === selfId ? "font-semibold" : ""}>
                {p.nickname}
              </span>
              {p.isHost && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  host
                </span>
              )}
            </div>
            <span
              className={`text-[10px] ${
                p.connected ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {p.connected ? "online" : "offline"}
            </span>
          </li>
        ))}
        {(!state || state.players.length === 0) && (
          <li className="text-sm text-white/40">Henüz kimse yok…</li>
        )}
      </ul>
    </div>
  );
}

function LogPanel() {
  // Authoritative event log lives on the snapshot (state.log) —
  // every move the reducer recorded since the game started.
  const log = useGameStore((s) => s.state?.log) ?? [];
  // Render in chronological order (oldest → newest top to bottom),
  // matching how a chat reads. Dedupe on `id` defensively in case the
  // server ever ships overlapping snapshots/patches that share an
  // entry (rare but harmless to guard against).
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof log = [];
    for (const e of log.slice(-50)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out;
  }, [log]);
  const listRef = useRef<ScrollableHandle | null>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const last = recent[recent.length - 1];
    if (!last || last.id === lastIdRef.current) return;
    lastIdRef.current = last.id;
    // Defer to the next frame so the freshly-appended row has been
    // laid out before we measure scrollHeight. Without the rAF the
    // scroll target was sometimes the previous content height and
    // the latest entry stayed cropped at the bottom.
    const handle = requestAnimationFrame(() => {
      listRef.current?.scrollToBottom();
    });
    return () => cancelAnimationFrame(handle);
  }, [recent]);

  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/40">
        <span>Olaylar</span>
        <span>{log.length}</span>
      </div>
      <Scrollable
        ref={listRef}
        className="max-h-48 min-h-[6rem] flex-1 px-3 py-2 text-xs"
      >
        {recent.length === 0 && (
          <div className="text-white/30">Henüz olay yok…</div>
        )}
        {recent.map((e) => (
          <div key={e.id} className="mb-1 flex gap-2 leading-snug">
            <span className="shrink-0 font-mono text-[10px] text-white/30">
              {formatClock(e.ts)}
            </span>
            <span className="text-white/90">{e.text}</span>
          </div>
        ))}
      </Scrollable>
    </div>
  );
}

function formatClock(ts: number): string {
  try {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function ColorDot({ color }: { color: string }) {
  const map: Record<string, string> = {
    red: "bg-rose-500",
    blue: "bg-blue-500",
    orange: "bg-orange-500",
    white: "bg-zinc-200",
    green: "bg-emerald-500",
    brown: "bg-amber-700",
    purple: "bg-purple-500",
    cyan: "bg-cyan-400",
  };
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${map[color] ?? "bg-white/40"}`}
    />
  );
}
