"use client";

import { useMemo, useState } from "react";
import type { SplendorAction } from "../actions";
import {
  GEMS,
  type Card,
  type Gem,
  type SplendorPlayer,
  type SplendorState,
  type TokenColor,
} from "../types";
import { canTakeTwoSame, canReserve, canAffordCard } from "../reducer";

const GEM_COLOR: Record<Gem, string> = {
  white: "#f8fafc",
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  black: "#1f2937",
};
const GEM_TEXT: Record<Gem, string> = {
  white: "#0f172a",
  blue: "#ffffff",
  green: "#ffffff",
  red: "#ffffff",
  black: "#ffffff",
};
const GEM_LABEL: Record<Gem, string> = {
  white: "Elmas",
  blue: "Safir",
  green: "Zümrüt",
  red: "Yakut",
  black: "Oniks",
};
/** Subtle radial highlight gives a 3D "polished gem" look without
 *  needing an SVG asset. */
const GEM_GRADIENT: Record<Gem, string> = {
  white: "radial-gradient(circle at 30% 30%, #ffffff 0%, #e2e8f0 60%, #94a3b8 100%)",
  blue: "radial-gradient(circle at 30% 30%, #93c5fd 0%, #3b82f6 55%, #1e3a8a 100%)",
  green: "radial-gradient(circle at 30% 30%, #86efac 0%, #22c55e 55%, #14532d 100%)",
  red: "radial-gradient(circle at 30% 30%, #fca5a5 0%, #ef4444 55%, #7f1d1d 100%)",
  black: "radial-gradient(circle at 30% 30%, #475569 0%, #1f2937 55%, #0b1120 100%)",
};
const GOLD_GRADIENT =
  "radial-gradient(circle at 30% 30%, #fef3c7 0%, #facc15 55%, #92400e 100%)";
/** Symbol used inside chip / card to identify gem type at a glance. */
const GEM_GLYPH: Record<Gem, string> = {
  white: "◆",
  blue: "♦",
  green: "▲",
  red: "■",
  black: "●",
};

export function SplendorRoom({
  state,
  selfId,
  sendAction,
}: {
  state: SplendorState;
  selfId: string;
  sendAction: (a: SplendorAction) => void;
}) {
  const me = useMemo(
    () => state.players.find((p) => p.id === selfId) ?? null,
    [state.players, selfId],
  );
  const isMyTurn = state.players[state.currentPlayerIndex]?.id === selfId;

  // Three-different gem picker.
  const [pickedGems, setPickedGems] = useState<Gem[]>([]);

  function togglePick(g: Gem) {
    setPickedGems((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : prev.length < 3 ? [...prev, g] : prev,
    );
  }

  function commitTake3() {
    if (!me) return;
    sendAction({ type: "SP/TAKE_3_DIFFERENT", playerId: me.id, gems: pickedGems });
    setPickedGems([]);
  }

  function take2(g: Gem) {
    if (!me) return;
    sendAction({ type: "SP/TAKE_2_SAME", playerId: me.id, gem: g });
  }

  type ReserveSource = Extract<SplendorAction, { type: "SP/RESERVE" }>["source"];
  function reserve(source: ReserveSource) {
    if (!me) return;
    sendAction({ type: "SP/RESERVE", playerId: me.id, source });
  }

  function purchaseMarket(tier: 1 | 2 | 3, slot: 0 | 1 | 2 | 3) {
    if (!me) return;
    sendAction({
      type: "SP/PURCHASE",
      playerId: me.id,
      source: { kind: "market", tier, slot },
    });
  }

  function purchaseReserved(idx: number) {
    if (!me) return;
    sendAction({
      type: "SP/PURCHASE",
      playerId: me.id,
      source: { kind: "reserved", index: idx },
    });
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Top: bank tokens + nobles */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs uppercase tracking-wider text-white/40">
            Banka
          </div>
          {([...GEMS, "gold"] as TokenColor[]).map((c) => (
            <TokenChip
              key={c}
              color={c}
              count={state.tokens[c]}
              clickable={
                isMyTurn && state.subPhase === "main" && c !== "gold"
              }
              picked={c !== "gold" && pickedGems.includes(c as Gem)}
              onClick={() => c !== "gold" && togglePick(c as Gem)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {state.nobles.map((n) => (
            <NobleCard key={n.id} noble={n} />
          ))}
        </div>
      </div>

      {/* Action bar (only for active player on main phase) */}
      {isMyTurn && state.subPhase === "main" && (() => {
        const distinctAvailable = GEMS.filter((g) => state.tokens[g] > 0).length;
        const maxPickable = Math.min(3, distinctAvailable);
        const canCommit = pickedGems.length >= 1 && pickedGems.length <= maxPickable;
        return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-950/30 p-3 text-sm">
          <span className="text-white/70">Senin sıran —</span>
          <button
            onClick={commitTake3}
            disabled={!canCommit}
            className="rounded-lg bg-indigo-500 px-3 py-1.5 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-indigo-400"
          >
            {maxPickable === 0
              ? "Bankada renk yok"
              : pickedGems.length === 0
              ? `Farklı renk seç (en fazla ${maxPickable})`
              : `${pickedGems.length} farklı al (${pickedGems.join(", ")})`}
          </button>
          <span className="text-white/40">veya</span>
          <span className="text-white/60">aynı renkten 2 al:</span>
          {GEMS.map((g) => (
            <button
              key={g}
              onClick={() => take2(g)}
              disabled={!canTakeTwoSame(state, g)}
              className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-slate-700"
              title={`Bankada ${state.tokens[g]} ${g} — minimum 4 olmalı`}
            >
              2× {GEM_LABEL[g]}
            </button>
          ))}
        </div>
        );
      })()}

      {state.subPhase === "discarding" && isMyTurn && me && (
        <DiscardPanel
          state={state}
          me={me}
          onSubmit={(tokens) =>
            sendAction({ type: "SP/CHOOSE_DISCARD", playerId: me.id, tokens })
          }
        />
      )}

      {state.subPhase === "picking_noble" && isMyTurn && me && (
        <NoblePicker
          state={state}
          me={me}
          onPick={(nobleId) =>
            sendAction({ type: "SP/CHOOSE_NOBLE", playerId: me.id, nobleId })
          }
        />
      )}

      {/* Market */}
      <div className="grid gap-3">
        {([3, 2, 1] as const).map((tier) => (
          <div key={tier} className="flex items-center gap-3">
            <DeckBack
              tier={tier}
              count={state.decks[tier].length}
              clickable={isMyTurn && state.subPhase === "main" && me ? canReserve(me) : false}
              onClick={() => reserve({ kind: "deck", tier })}
            />
            <div className="grid flex-1 grid-cols-4 gap-3">
              {state.market[tier].map((card, slot) => (
                <DevCard
                  key={`t${tier}-s${slot}`}
                  card={card}
                  canAfford={card && me ? canAffordCard(card, me) : false}
                  canReserveHere={
                    isMyTurn && state.subPhase === "main" && me ? canReserve(me) : false
                  }
                  isMyTurn={isMyTurn && state.subPhase === "main"}
                  onPurchase={() => purchaseMarket(tier, slot as 0 | 1 | 2 | 3)}
                  onReserve={() =>
                    reserve({ kind: "market", tier, slot: slot as 0 | 1 | 2 | 3 })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Players */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {state.players.map((p, i) => (
          <PlayerPanel
            key={p.id}
            player={p}
            isActive={i === state.currentPlayerIndex}
            isMe={p.id === selfId}
            onPurchaseReserved={p.id === selfId && isMyTurn ? purchaseReserved : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// --- Sub-components ---------------------------------------------------------

function TokenChip({
  color,
  count,
  clickable,
  picked,
  onClick,
}: {
  color: TokenColor;
  count: number;
  clickable?: boolean;
  picked?: boolean;
  onClick?: () => void;
}) {
  const isGold = color === "gold";
  const fg = isGold ? "#1f2937" : GEM_TEXT[color as Gem];
  const gradient = isGold ? GOLD_GRADIENT : GEM_GRADIENT[color as Gem];
  return (
    <button
      onClick={onClick}
      disabled={!clickable || count <= 0}
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
        picked ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-slate-950" : ""
      } ${clickable && count > 0 ? "hover:scale-110 active:scale-95" : "opacity-60"} ${
        !clickable || count <= 0 ? "cursor-default" : "cursor-pointer"
      }`}
      style={{
        background: gradient,
        color: fg,
        borderColor: isGold ? "#a16207" : "rgba(0,0,0,0.45)",
        boxShadow: count > 0 ? "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.4)" : "none",
        textShadow: isGold ? "none" : "0 1px 1px rgba(0,0,0,0.3)",
      }}
      title={
        isGold
          ? "Altın (joker) — sadece rezerv ile kazanılır"
          : `${GEM_LABEL[color as Gem]} (bankada ${count})`
      }
    >
      <span className="absolute inset-0 flex items-center justify-center text-[10px] opacity-30">
        {isGold ? "★" : GEM_GLYPH[color as Gem]}
      </span>
      <span className="relative">{count}</span>
    </button>
  );
}

function DeckBack({
  tier,
  count,
  clickable,
  onClick,
}: {
  tier: 1 | 2 | 3;
  count: number;
  clickable: boolean;
  onClick: () => void;
}) {
  const tierGradient =
    tier === 3
      ? "linear-gradient(135deg, #7e22ce 0%, #4c1d95 100%)"
      : tier === 2
      ? "linear-gradient(135deg, #0369a1 0%, #0c4a6e 100%)"
      : "linear-gradient(135deg, #15803d 0%, #14532d 100%)";
  return (
    <button
      onClick={onClick}
      disabled={!clickable || count === 0}
      className="flex h-36 w-24 flex-col items-center justify-center rounded-xl border-2 border-white/20 text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-amber-300 hover:scale-[1.03]"
      style={{
        background: tierGradient,
        boxShadow:
          "0 4px 8px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.2)",
      }}
      title={`Tier ${tier} desteği (${count} kart). Tıkla = kapalı rezerv.`}
    >
      <div className="text-3xl drop-shadow">★{tier}</div>
      <div className="mt-1 text-[10px] text-white/70">{count} kart</div>
    </button>
  );
}

function DevCard({
  card,
  canAfford,
  canReserveHere,
  isMyTurn,
  onPurchase,
  onReserve,
}: {
  card: Card | null;
  canAfford: boolean;
  canReserveHere: boolean;
  isMyTurn: boolean;
  onPurchase: () => void;
  onReserve: () => void;
}) {
  if (!card) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border-2 border-dashed border-white/10 text-xs text-white/30">
        boş
      </div>
    );
  }
  const fg = GEM_TEXT[card.bonus];
  // Top half of the card uses a gradient that fades to a lighter tint of
  // the bonus colour so the prestige and bonus markers stay legible.
  return (
    <div
      className={`group relative flex h-36 flex-col overflow-hidden rounded-xl border-2 border-white/20 p-2 transition ${
        isMyTurn && canAfford ? "hover:-translate-y-0.5 hover:shadow-xl" : ""
      }`}
      style={{
        background: GEM_GRADIENT[card.bonus],
        color: fg,
        boxShadow:
          "0 4px 8px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.25)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="text-base font-bold leading-none drop-shadow">
          {card.prestige > 0 ? `${card.prestige}★` : ""}
        </div>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold shadow"
          style={{
            backgroundColor: fg,
            color: GEM_COLOR[card.bonus],
          }}
          title={`+1 ${GEM_LABEL[card.bonus]} kalıcı bonusu`}
        >
          {GEM_GLYPH[card.bonus]}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-start justify-end gap-1">
        {GEMS.map((g) => {
          const c = card.cost[g];
          if (c === 0) return null;
          return (
            <span
              key={g}
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                background: GEM_GRADIENT[g],
                color: GEM_TEXT[g],
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
              }}
              title={`${c} ${GEM_LABEL[g]} gerekli`}
            >
              {c}
            </span>
          );
        })}
      </div>
      {isMyTurn && (
        <div className="absolute inset-x-1 bottom-1 flex gap-1">
          <button
            onClick={onPurchase}
            disabled={!canAfford}
            className="flex-1 rounded bg-emerald-600 px-1 py-0.5 text-[10px] font-bold text-white shadow disabled:opacity-30 hover:bg-emerald-500"
          >
            Al
          </button>
          <button
            onClick={onReserve}
            disabled={!canReserveHere}
            className="flex-1 rounded bg-amber-600 px-1 py-0.5 text-[10px] font-bold text-white shadow disabled:opacity-30 hover:bg-amber-500"
          >
            Rezerv
          </button>
        </div>
      )}
    </div>
  );
}

function NobleCard({ noble }: { noble: { id: string; requirement: Record<Gem, number>; prestige: 3 } }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border-2 border-amber-300/50 px-3 py-2 shadow-lg"
      style={{
        background:
          "linear-gradient(135deg, rgba(254,243,199,0.15) 0%, rgba(245,158,11,0.18) 100%)",
        boxShadow:
          "0 2px 8px rgba(245,158,11,0.25), inset 0 1px 1px rgba(255,255,255,0.15)",
      }}
      title="Soylu — gereksinimleri karşılayan oyuncuyu otomatik ziyaret eder, +3 prestij"
    >
      <div className="text-sm font-bold text-amber-200">⚜ 3★</div>
      <div className="mt-1 flex gap-1">
        {GEMS.map((g) => {
          const n = noble.requirement[g];
          if (n === 0) return null;
          return (
            <span
              key={g}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
              style={{
                background: GEM_GRADIENT[g],
                color: GEM_TEXT[g],
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PlayerPanel({
  player,
  isActive,
  isMe,
  onPurchaseReserved,
}: {
  player: SplendorPlayer;
  isActive: boolean;
  isMe: boolean;
  onPurchaseReserved?: (idx: number) => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition ${
        isActive ? "border-indigo-400/60 bg-indigo-950/30" : "border-white/10 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: COLOR_HEX[player.color] }}
          />
          <span className="font-semibold">{player.nickname}</span>
          {isMe && <span className="text-[10px] text-amber-300">(sen)</span>}
          {!player.connected && (
            <span className="text-[10px] text-rose-400">offline</span>
          )}
        </div>
        <div className="text-lg font-bold">{player.prestige}★</div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {(["white", "blue", "green", "red", "black", "gold"] as TokenColor[]).map((c) => {
          const n = player.tokens[c];
          if (n === 0) return null;
          const bg = c === "gold" ? "#facc15" : GEM_COLOR[c];
          const fg = c === "gold" ? "#1f2937" : GEM_TEXT[c as Gem];
          return (
            <span
              key={c}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ backgroundColor: bg, color: fg }}
            >
              {n}
            </span>
          );
        })}
      </div>

      {/* Permanent bonus row */}
      <div className="mt-2 flex flex-wrap gap-1">
        {GEMS.map((g) => {
          const n = player.bonus[g];
          if (n === 0) return null;
          return (
            <span
              key={g}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-white/10"
              style={{ backgroundColor: GEM_COLOR[g], color: GEM_TEXT[g] }}
              title={`${n} kalıcı ${g} bonusu`}
            >
              +{n}
            </span>
          );
        })}
      </div>

      {/* Reserved cards (visible only to owner) */}
      {isMe && player.reserved.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Rezerv
          </div>
          <div className="mt-1 flex gap-1">
            {player.reserved.map((c, idx) => (
              <button
                key={c.id}
                onClick={() => onPurchaseReserved?.(idx)}
                className="flex h-12 w-9 flex-col items-center justify-center rounded text-[9px] font-bold disabled:opacity-50"
                style={{ backgroundColor: GEM_COLOR[c.bonus], color: GEM_TEXT[c.bonus] }}
                title={`Tier ${c.tier} — ${c.prestige}★ — tıkla satın al`}
                disabled={!onPurchaseReserved}
              >
                T{c.tier}
                <br />
                {c.prestige}★
              </button>
            ))}
          </div>
        </div>
      )}
      {!isMe && player.reserved.length > 0 && (
        <div className="mt-2 text-[10px] text-white/40">
          {player.reserved.length} rezerv kart
        </div>
      )}

      {/* Nobles visited */}
      {player.nobles.length > 0 && (
        <div className="mt-2 flex gap-1 text-[10px] text-amber-200">
          {player.nobles.map((n) => (
            <span key={n.id} className="rounded bg-amber-500/20 px-1.5 py-0.5">
              ⚜ +3
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DiscardPanel({
  state,
  me,
  onSubmit,
}: {
  state: SplendorState;
  me: SplendorPlayer;
  onSubmit: (tokens: Partial<Record<TokenColor, number>>) => void;
}) {
  const [discard, setDiscard] = useState<Record<TokenColor, number>>({
    white: 0,
    blue: 0,
    green: 0,
    red: 0,
    black: 0,
    gold: 0,
  });
  const total = Object.values(me.tokens).reduce((a, b) => a + b, 0);
  const dropping = Object.values(discard).reduce((a, b) => a + b, 0);
  const target = 10;
  const need = total - target;

  function adj(c: TokenColor, d: number) {
    const cur = discard[c];
    const next = Math.max(0, Math.min(me.tokens[c], cur + d));
    setDiscard({ ...discard, [c]: next });
  }

  return (
    <div className="rounded-xl border border-rose-400/40 bg-rose-950/30 p-3 text-sm">
      <div className="mb-2 font-semibold">
        Fazla token at — toplam {total}'dan {target}'a düşür ({dropping}/{need})
      </div>
      <div className="flex flex-wrap gap-2">
        {(["white", "blue", "green", "red", "black", "gold"] as TokenColor[]).map((c) => (
          <div key={c} className="flex items-center gap-1">
            <button
              onClick={() => adj(c, -1)}
              className="rounded bg-slate-700 px-1.5 text-xs"
            >
              −
            </button>
            <span className="w-12 text-center text-xs">
              {discard[c]} / {me.tokens[c]}
            </span>
            <button
              onClick={() => adj(c, +1)}
              className="rounded bg-slate-700 px-1.5 text-xs"
            >
              +
            </button>
            <span className="text-xs text-white/60">{c}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSubmit(discard)}
        disabled={dropping !== need}
        className="mt-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-rose-400"
      >
        At ve devam et
      </button>
    </div>
  );
}

function NoblePicker({
  state,
  me,
  onPick,
}: {
  state: SplendorState;
  me: SplendorPlayer;
  onPick: (nobleId: string) => void;
}) {
  const eligible = state.nobles.filter((n) => {
    return GEMS.every((g) => me.bonus[g] >= n.requirement[g]);
  });
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-3">
      <div className="mb-2 text-sm font-semibold">
        Birden fazla soylu seni ziyaret edebilir — birini seç:
      </div>
      <div className="flex gap-3">
        {eligible.map((n) => (
          <button
            key={n.id}
            onClick={() => onPick(n.id)}
            className="rounded-xl border border-amber-300/40 bg-amber-100/10 px-3 py-2 hover:bg-amber-100/20"
          >
            <NobleCard noble={n} />
          </button>
        ))}
      </div>
    </div>
  );
}

const COLOR_HEX: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
  cyan: "#06b6d4",
  orange: "#f97316",
  pink: "#ec4899",
};
