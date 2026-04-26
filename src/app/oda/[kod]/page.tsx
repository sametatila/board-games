"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useGameStore,
  loadStoredNickname,
  saveLastRoomCode,
} from "@/lib/store";
import { useParty } from "@/lib/useParty";
import { isValidRoomCode } from "@/game/roomCode";
import type { MapTemplateId } from "@/game/types";
import type { GameAction } from "@/game/actions";
import { Countdown, GameViewContainer, PlayerScores } from "@/components/GameView";
import { setMuted, isMuted } from "@/lib/sfx";

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
import { MAP_TEMPLATES } from "@/game/mapTemplates";

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
  const [sidePanelOpen, setSidePanelOpen] = useState(false);

  useEffect(() => {
    if (!isValidRoomCode(roomCode)) {
      router.replace("/");
      return;
    }
    const n = nickFromStore || loadStoredNickname();
    if (!n) {
      router.replace("/");
      return;
    }
    setNickname(n);
    // Remember this room so the lobby can offer a one-tap rejoin if the
    // user navigates away (e.g. accidentally hits the header back button).
    saveLastRoomCode(roomCode);
  }, [nickFromStore, roomCode, router]);

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
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-slate-900/60 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-xs text-white/60 hover:text-white"
            title="Anasayfaya çık (oda burada açık kalır, geri dönebilirsin)"
          >
            ← Anasayfa
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
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-white/10 bg-slate-800 px-2 py-0.5 text-white/80 transition hover:bg-slate-700"
            title="Oyun ayarları"
          >
            ⚙ Ayarlar
          </button>
          {(me?.isHost || !state || state.phase === "lobby") && (
            <button
              onClick={() => {
                const inGame = state && state.phase !== "lobby";
                const msg = inGame
                  ? "Oyunu erken bitirmek istediğine emin misin? Tüm ilerleme silinir, herkes lobiye döner."
                  : "Odayı sıfırla? Lobby ayarları korunur, board ve oyun ilerleyişi silinir.";
                if (window.confirm(msg)) send({ t: "reset_room" });
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
              ? "bağlı"
              : conn === "connecting"
              ? "bağlanıyor"
              : conn === "closed"
              ? "kapalı"
              : conn === "error"
              ? "hata"
              : "boşta"}
          </span>
        </div>
      </header>

      <ErrorToast />

      <div className="grid flex-1 grid-cols-1 gap-4 p-2 sm:p-4 lg:grid-cols-[1fr_320px]">
        <div className="relative min-h-[480px]">
          {!state ? (
            <LoadingPanel conn={conn} />
          ) : state.phase === "lobby" ? (
            <LobbyPanel
              nickname={nickname}
              roomCode={roomCode}
              onSetMap={(id) => send({ t: "set_map", mapTemplateId: id })}
              onSetDifficulty={(d) => send({ t: "set_difficulty", difficulty: d })}
              onStart={() => send({ t: "start_game" })}
            />
          ) : (
            <ClientOnly>
              <GameViewContainer
                sendAction={(action: GameAction) =>
                  send({ t: "action", action })
                }
              />
            </ClientOnly>
          )}
        </div>

        <aside
          className={`flex flex-col gap-4 ${
            sidePanelOpen
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
          <ChatPanel onSend={(text) => send({ t: "chat", text })} selfId={selfId} />
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
          {me && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm">
              <div className="mb-2 text-xs uppercase tracking-wider text-white/40">
                Sen
              </div>
              <div className="flex items-center gap-3">
                <ColorDot color={me.color} />
                <span className="font-medium">{me.nickname}</span>
                {me.isHost && (
                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                    Host
                  </span>
                )}
              </div>
            </div>
          )}
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
    </main>
  );
}

function LobbyPanel({
  nickname,
  roomCode,
  onSetMap,
  onSetDifficulty,
  onStart,
}: {
  nickname: string;
  roomCode: string;
  onSetMap: (id: MapTemplateId) => void;
  onSetDifficulty: (d: import("@/game/types").Difficulty) => void;
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
    <div className="flex h-full flex-col items-center justify-center gap-6 rounded-2xl border border-white/10 bg-slate-900/40 p-8">
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
  state: import("@/game/types").GameState;
  isHost: boolean;
  onClose: () => void;
  onSave: (s: Partial<import("@/game/types").GameSettings>) => void;
}) {
  const cur = state.settings;
  const [turn, setTurn] = useState(String(cur.turnTimerSec));
  const [trade, setTrade] = useState(String(cur.tradeTimerSec));
  const [discard, setDiscard] = useState(String(cur.discardTimerSec));
  const [allowTrades, setAllowTrades] = useState(cur.allowPlayerTrades);
  const [turnSound, setTurnSound] = useState(cur.turnSound);

  function clamp(s: string): number {
    const v = parseInt(s, 10);
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (v < 10) return 10;
    if (v > 600) return 600;
    return v;
  }

  function save() {
    onSave({
      turnTimerSec: clamp(turn),
      tradeTimerSec: clamp(trade),
      discardTimerSec: clamp(discard),
      allowPlayerTrades: allowTrades,
      turnSound,
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
  state: import("@/game/types").GameState;
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
  const order: import("@/game/types").Resource[] = [
    "wood",
    "brick",
    "wheat",
    "sheep",
    "ore",
  ];
  const ICON: Record<string, string> = {
    wood: "🌲",
    brick: "🧱",
    wheat: "🌾",
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
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

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
      <div
        ref={listRef}
        className="max-h-48 min-h-[6rem] flex-1 overflow-y-auto px-3 py-2 text-xs"
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
      </div>
      <div className="flex gap-1 border-t border-white/10 p-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          maxLength={280}
          placeholder="Mesaj yaz…"
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
  const events = useGameStore((s) => s.recentEvents);
  const logs = events.filter((e) => e.kind === "log");
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="mb-2 text-xs uppercase tracking-wider text-white/40">
        Olaylar
      </div>
      <ul className="max-h-44 space-y-1 overflow-y-auto pr-1 text-xs text-white/70">
        {logs.length === 0 && <li className="text-white/30">…</li>}
        {logs.map((e, i) => (
          <li key={i} className="flex gap-2">
            {"ts" in e && e.ts ? (
              <span className="shrink-0 font-mono text-[10px] text-white/30">
                {formatClock(e.ts)}
              </span>
            ) : null}
            <span>{"text" in e ? e.text : ""}</span>
          </li>
        ))}
      </ul>
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
