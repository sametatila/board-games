"use client";

import { useMemo, useState } from "react";
import type { TtrAction } from "../actions";
import {
  CARD_COLORS,
  TRAIN_COLORS,
  type CardColor,
  type RouteColor,
  type TtrPlayer,
  type TtrPlayerColor,
  type TtrState,
} from "../types";
import { canClaimRoute } from "../reducer";
import { CITIES } from "../data/cities";
import { ROUTES } from "../data/routes";

const CARD_HEX: Record<CardColor, string> = {
  purple: "#a855f7",
  white: "#f8fafc",
  blue: "#3b82f6",
  yellow: "#eab308",
  orange: "#f97316",
  black: "#1f2937",
  red: "#ef4444",
  green: "#22c55e",
  locomotive: "#facc15",
};

const ROUTE_HEX: Record<RouteColor, string> = {
  ...CARD_HEX,
  gray: "#94a3b8",
} as Record<RouteColor, string>;

const TRAIN_PLAYER_HEX: Record<TtrPlayerColor, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#ca8a04",
  black: "#1e293b",
};

export function TtrRoom({
  state,
  selfId,
  sendAction,
}: {
  state: TtrState;
  selfId: string;
  sendAction: (a: TtrAction) => void;
}) {
  const me = useMemo(
    () => state.players.find((p) => p.id === selfId) ?? null,
    [state.players, selfId],
  );
  const cp = state.players[state.currentPlayerIndex];
  const isMyTurn = cp?.id === selfId;

  const [claiming, setClaiming] = useState<{
    routeId: string;
    cards: Partial<Record<CardColor, number>>;
  } | null>(null);

  function commitClaim() {
    if (!claiming || !me) return;
    sendAction({
      type: "TTR/CLAIM_ROUTE",
      playerId: me.id,
      routeId: claiming.routeId,
      cards: claiming.cards,
    });
    setClaiming(null);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Initial ticket pick — every player sees their own pending */}
      {state.subPhase === "initial_tickets" && me?.pendingTickets && (
        <TicketPickPanel
          tickets={me.pendingTickets}
          minKeep={2}
          onSubmit={(keepIds) =>
            sendAction({
              type: "TTR/COMMIT_INITIAL_TICKETS",
              playerId: me.id,
              keepIds,
            })
          }
          title="İlk görev kartların — en az 2 tut"
        />
      )}

      {/* Mid-game ticket pick */}
      {state.subPhase === "picking_tickets" && isMyTurn && me?.pendingTickets && (
        <TicketPickPanel
          tickets={me.pendingTickets}
          minKeep={1}
          onSubmit={(keepIds) =>
            sendAction({
              type: "TTR/COMMIT_PICKED_TICKETS",
              playerId: me.id,
              keepIds,
            })
          }
          title="Yeni görev kartları — en az 1 tut"
        />
      )}

      {/* Top: market + draw deck + ticket deck */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
        <div className="text-xs uppercase tracking-wider text-white/40">
          Tren kartı pazarı
        </div>
        {state.market.map((c, slot) => (
          <CardSlot
            key={slot}
            card={c}
            clickable={
              isMyTurn &&
              (state.subPhase === "main" ||
                (state.subPhase === "drawing_train" && c !== "locomotive"))
            }
            onClick={() =>
              me &&
              sendAction({
                type: "TTR/DRAW_TRAIN",
                playerId: me.id,
                source: { kind: "market", slot: slot as 0 | 1 | 2 | 3 | 4 },
              })
            }
          />
        ))}
        <DeckButton
          label="Kapalı"
          count={state.trainDeck.length}
          clickable={
            isMyTurn &&
            (state.subPhase === "main" || state.subPhase === "drawing_train") &&
            state.trainDeck.length > 0
          }
          onClick={() =>
            me &&
            sendAction({
              type: "TTR/DRAW_TRAIN",
              playerId: me.id,
              source: { kind: "deck" },
            })
          }
        />
        <div className="ml-4 flex flex-col items-center">
          <button
            disabled={
              !isMyTurn ||
              state.subPhase !== "main" ||
              state.ticketDeck.length === 0
            }
            onClick={() =>
              me && sendAction({ type: "TTR/DRAW_TICKETS", playerId: me.id })
            }
            className="rounded-lg border-2 border-amber-300/40 bg-amber-100/10 px-3 py-2 text-xs text-amber-200 transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-amber-100/20"
          >
            Görev kartı çek
            <div className="mt-1 text-[10px] text-amber-300/60">
              ({state.ticketDeck.length} kalan)
            </div>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="relative rounded-2xl border border-white/10 bg-slate-950">
        <MapSvg
          state={state}
          selfId={selfId}
          isMyTurn={isMyTurn}
          onClickRoute={(routeId) => {
            if (!me || !isMyTurn || state.subPhase !== "main") return;
            if (!canClaimRoute(state, me, routeId)) return;
            const route = ROUTES.find((r) => r.id === routeId)!;
            // Auto-fill cards: pick the lowest-locomotive option of any
            // colour the player has enough of. UI lets the player adjust.
            const initialCards = autoFillCards(me, route);
            setClaiming({ routeId, cards: initialCards });
          }}
        />
      </div>

      {/* Players */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {state.players.map((p, i) => (
          <PlayerPanel
            key={p.id}
            player={p}
            isActive={i === state.currentPlayerIndex}
            isMe={p.id === selfId}
          />
        ))}
      </div>

      {/* My hand (only visible to me) */}
      {me && state.phase === "playing" && (
        <div className="rounded-2xl border border-indigo-500/40 bg-slate-900/60 p-3">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/50">
            Senin elin
          </div>
          <div className="flex flex-wrap gap-2">
            {CARD_COLORS.map((c) => {
              const n = me.hand[c];
              if (n === 0) return null;
              return (
                <div
                  key={c}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
                  style={{
                    backgroundColor: CARD_HEX[c],
                    color: c === "white" || c === "yellow" || c === "locomotive" ? "#0f172a" : "#ffffff",
                  }}
                >
                  {c === "locomotive" ? "🚂" : ""}
                  <span>{c}</span>
                  <span className="ml-1">{n}</span>
                </div>
              );
            })}
            {Object.values(me.hand).every((v) => v === 0) && (
              <span className="text-xs text-white/30">elin boş</span>
            )}
          </div>
          {me.tickets.length > 0 && (
            <div className="mt-2">
              <div className="text-xs uppercase tracking-wider text-white/50">
                Görevlerin
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {me.tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-amber-400/30 bg-amber-100/10 px-2 py-1 text-[11px] text-amber-100"
                  >
                    {cityName(t.fromCity)} ↔ {cityName(t.toCity)}{" "}
                    <span className="font-bold">+{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {claiming && me && (
        <ClaimRouteModal
          state={state}
          me={me}
          routeId={claiming.routeId}
          initialCards={claiming.cards}
          onCommit={(cards) => {
            sendAction({
              type: "TTR/CLAIM_ROUTE",
              playerId: me.id,
              routeId: claiming.routeId,
              cards,
            });
            setClaiming(null);
          }}
          onCancel={() => setClaiming(null)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---------------------------------------------------------

function MapSvg({
  state,
  selfId,
  isMyTurn,
  onClickRoute,
}: {
  state: TtrState;
  selfId: string;
  isMyTurn: boolean;
  onClickRoute: (id: string) => void;
}) {
  const me = state.players.find((p) => p.id === selfId);
  return (
    <svg
      viewBox="0 0 100 80"
      className="w-full"
      style={{ minHeight: 320, maxHeight: 540 }}
    >
      {/* Routes */}
      {ROUTES.map((r) => {
        const from = CITIES.find((c) => c.id === r.fromCity)!;
        const to = CITIES.find((c) => c.id === r.toCity)!;
        const owner = state.claimedRoutes[r.id];
        const ownerPlayer = owner
          ? state.players.find((p) => p.id === owner)
          : null;
        const claimable =
          isMyTurn &&
          state.subPhase === "main" &&
          me &&
          canClaimRoute(state, me, r.id);
        const stroke = ownerPlayer
          ? TRAIN_PLAYER_HEX[ownerPlayer.color]
          : ROUTE_HEX[r.color] ?? "#475569";
        // For double routes draw two parallel lines (offset perpendicular).
        // Calculate offset based on parallel position: for routes with
        // `parallelGroupId`, the route position within that group determines
        // which parallel line (above/below midpoint).
        let dx = 0;
        let dy = 0;
        if (r.parallelGroupId) {
          const sibs = ROUTES.filter((o) => o.parallelGroupId === r.parallelGroupId);
          const idx = sibs.findIndex((o) => o.id === r.id);
          const total = sibs.length;
          const slot = idx - (total - 1) / 2;
          // perpendicular vector
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const px = -Math.sin(angle);
          const py = Math.cos(angle);
          dx = px * slot * 1.0;
          dy = py * slot * 1.0;
        }
        return (
          <g key={r.id}>
            <line
              x1={from.x + dx}
              y1={from.y + dy}
              x2={to.x + dx}
              y2={to.y + dy}
              stroke={stroke}
              strokeWidth={ownerPlayer ? 1.3 : 0.9}
              strokeLinecap="round"
              opacity={ownerPlayer ? 1 : 0.85}
            />
            {/* Hairline label area for hover/click */}
            <line
              x1={from.x + dx}
              y1={from.y + dy}
              x2={to.x + dx}
              y2={to.y + dy}
              stroke="transparent"
              strokeWidth={2.5}
              style={{ cursor: claimable ? "pointer" : "default" }}
              onClick={() => onClickRoute(r.id)}
            >
              <title>
                {r.fromCity} ↔ {r.toCity} ({r.length}, {r.color})
              </title>
            </line>
            {/* Length pip */}
            <text
              x={(from.x + to.x) / 2 + dx}
              y={(from.y + to.y) / 2 + dy + 0.4}
              fontSize="1.2"
              textAnchor="middle"
              fill="#fff"
              opacity={0.7}
              pointerEvents="none"
            >
              {r.length}
            </text>
          </g>
        );
      })}
      {/* Cities */}
      {CITIES.map((c) => (
        <g key={c.id}>
          <circle cx={c.x} cy={c.y} r={1.2} fill="#facc15" stroke="#1f2937" strokeWidth={0.2} />
          <text
            x={c.x}
            y={c.y - 1.6}
            fontSize="1.1"
            textAnchor="middle"
            fill="#f8fafc"
            stroke="#0f172a"
            strokeWidth={0.15}
            paintOrder="stroke"
          >
            {c.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CardSlot({
  card,
  clickable,
  onClick,
}: {
  card: CardColor | null;
  clickable: boolean;
  onClick: () => void;
}) {
  if (!card) {
    return (
      <div className="flex h-14 w-10 items-center justify-center rounded-md border border-dashed border-white/10 text-[10px] text-white/30">
        boş
      </div>
    );
  }
  const fg =
    card === "white" || card === "yellow" || card === "locomotive"
      ? "#0f172a"
      : "#ffffff";
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className="flex h-14 w-10 flex-col items-center justify-center rounded-md border border-black/40 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 hover:scale-110"
      style={{ backgroundColor: CARD_HEX[card], color: fg }}
      title={card === "locomotive" ? "Lokomotif (joker)" : card}
    >
      {card === "locomotive" ? "🚂" : card.slice(0, 3).toUpperCase()}
    </button>
  );
}

function DeckButton({
  label,
  count,
  clickable,
  onClick,
}: {
  label: string;
  count: number;
  clickable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      className="flex h-14 w-12 flex-col items-center justify-center rounded-md border-2 border-indigo-500/40 bg-indigo-950/40 text-[10px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-30 hover:bg-indigo-950/60"
    >
      <div>🚂</div>
      <div className="text-[9px] text-white/70">{count}</div>
    </button>
  );
}

function PlayerPanel({
  player,
  isActive,
  isMe,
}: {
  player: TtrPlayer;
  isActive: boolean;
  isMe: boolean;
}) {
  const handTotal = Object.values(player.hand).reduce((a, b) => a + b, 0);
  return (
    <div
      className={`rounded-xl border p-2 transition ${
        isActive
          ? "border-indigo-400/60 bg-indigo-950/30"
          : "border-white/10 bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: TRAIN_PLAYER_HEX[player.color] }}
          />
          <span className="font-medium">{player.nickname}</span>
          {isMe && <span className="text-[10px] text-amber-300">(sen)</span>}
          {!player.connected && (
            <span className="text-[10px] text-rose-400">offline</span>
          )}
        </div>
        <span className="text-sm font-bold text-amber-200">
          {player.routeScore}p
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-white/60">
        <div>🚃 {player.trainsLeft}</div>
        <div>🃏 {handTotal}</div>
        <div>🎫 {player.tickets.length}</div>
      </div>
    </div>
  );
}

function TicketPickPanel({
  tickets,
  minKeep,
  onSubmit,
  title,
}: {
  tickets: { id: string; fromCity: string; toCity: string; value: number }[];
  minKeep: number;
  onSubmit: (keepIds: string[]) => void;
  title: string;
}) {
  const [keep, setKeep] = useState<Set<string>>(new Set(tickets.map((t) => t.id)));

  function toggle(id: string) {
    setKeep((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-950/30 p-4">
      <div className="mb-2 font-semibold">{title}</div>
      <div className="space-y-2">
        {tickets.map((t) => {
          const sel = keep.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`flex w-full items-center justify-between rounded-lg border p-2 text-sm transition ${
                sel
                  ? "border-amber-300/60 bg-amber-100/15"
                  : "border-white/10 bg-slate-950/30"
              }`}
            >
              <span>
                {cityName(t.fromCity)} ↔ {cityName(t.toCity)}
              </span>
              <span className="font-bold text-amber-200">+{t.value}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onSubmit([...keep])}
        disabled={keep.size < minKeep}
        className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-emerald-400"
      >
        Tut ({keep.size}/{tickets.length}) — devam et
      </button>
    </div>
  );
}

function ClaimRouteModal({
  state,
  me,
  routeId,
  initialCards,
  onCommit,
  onCancel,
}: {
  state: TtrState;
  me: TtrPlayer;
  routeId: string;
  initialCards: Partial<Record<CardColor, number>>;
  onCommit: (cards: Partial<Record<CardColor, number>>) => void;
  onCancel: () => void;
}) {
  const route = ROUTES.find((r) => r.id === routeId)!;
  const [cards, setCards] = useState<Partial<Record<CardColor, number>>>(initialCards);

  const total = Object.values(cards).reduce((a, b) => a + (b ?? 0), 0);
  const colorsUsed = (Object.keys(cards) as CardColor[]).filter(
    (c) => (cards[c] ?? 0) > 0 && c !== "locomotive",
  );
  const valid =
    total === route.length &&
    colorsUsed.length <= 1 &&
    (route.color === "gray" || colorsUsed.length === 0 || colorsUsed[0] === route.color);

  function adj(c: CardColor, d: number) {
    const cur = cards[c] ?? 0;
    const next = Math.max(0, Math.min(me.hand[c], cur + d));
    setCards({ ...cards, [c]: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-4">
        <div className="mb-3">
          <div className="text-lg font-semibold">
            Yol al: {cityName(route.fromCity)} ↔ {cityName(route.toCity)}
          </div>
          <div className="text-xs text-white/60">
            Uzunluk {route.length} ·{" "}
            <span style={{ color: ROUTE_HEX[route.color] }}>{route.color}</span>
          </div>
        </div>
        <div className="space-y-2">
          {CARD_COLORS.filter((c) => me.hand[c] > 0).map((c) => (
            <div key={c} className="flex items-center justify-between">
              <span
                className="rounded px-2 py-0.5 text-xs font-bold"
                style={{
                  backgroundColor: CARD_HEX[c],
                  color:
                    c === "white" || c === "yellow" || c === "locomotive"
                      ? "#0f172a"
                      : "#ffffff",
                }}
              >
                {c}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adj(c, -1)}
                  className="rounded bg-slate-700 px-2 text-sm"
                >
                  −
                </button>
                <span className="w-12 text-center text-sm">
                  {cards[c] ?? 0} / {me.hand[c]}
                </span>
                <button
                  onClick={() => adj(c, +1)}
                  className="rounded bg-slate-700 px-2 text-sm"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm">
          Toplam: {total} / {route.length}{" "}
          {colorsUsed.length > 1 && (
            <span className="text-rose-300">— renkleri karıştırma</span>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm"
          >
            İptal
          </button>
          <button
            onClick={() => onCommit(cards)}
            disabled={!valid}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function cityName(id: string): string {
  return CITIES.find((c) => c.id === id)?.name ?? id;
}

function autoFillCards(
  me: TtrPlayer,
  route: { color: RouteColor; length: number },
): Partial<Record<CardColor, number>> {
  // Pick the colour the player has most of (fitting the route colour),
  // top up with locomotives.
  const out: Partial<Record<CardColor, number>> = {};
  const candidates: CardColor[] =
    route.color === "gray" ? [...TRAIN_COLORS] : [route.color];
  let bestColor: CardColor | null = null;
  let bestCount = -1;
  for (const c of candidates) {
    const n = me.hand[c];
    if (n > bestCount) {
      bestCount = n;
      bestColor = c;
    }
  }
  if (bestColor) {
    const useColor = Math.min(me.hand[bestColor], route.length);
    out[bestColor] = useColor;
    const remain = route.length - useColor;
    if (remain > 0) {
      out.locomotive = Math.min(remain, me.hand.locomotive);
    }
  } else {
    out.locomotive = Math.min(me.hand.locomotive, route.length);
  }
  return out;
}
