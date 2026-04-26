"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { Board3D, type PlacementMode } from "./Board3D";
import { DiceModal } from "./DiceModal";
import {
  ResourceCard,
  DevCard,
  DEV_CARD_NAMES_TR,
  DEV_CARD_LONG_DESC_TR,
} from "./CardArt";
import { Tooltip, TitledTooltip } from "./Tooltip";
import { sfx, isMuted, setMuted } from "@/lib/sfx";
import { recordGame } from "@/lib/stats";
import { useGameStore } from "@/lib/store";
import { BUILD_COSTS, DEV_CARD_COST, type GameAction } from "@/game/actions";
import type { GameState, Player, Resource } from "@/game/types";
import {
  setupTurnInfo,
  getRobberyVictims,
  getValidSettlementVertices,
  getValidRoadEdges,
  getValidShipEdges,
  getValidCityVertices,
  getValidRobberHexes,
  getValidPirateHexes,
  lastInitialSettlementForPlayer,
} from "@/game/reducer";

const RESOURCE_ICONS: Record<Resource, string> = {
  wood: "🌲",
  brick: "🧱",
  wheat: "🍞",
  sheep: "🐑",
  ore: "⛏️",
};

const RESOURCE_LABELS: Record<Resource, string> = {
  wood: "Tahta",
  brick: "Tuğla",
  wheat: "Buğday",
  sheep: "Koyun",
  ore: "Cevher",
};

// CSS gradient backgrounds for resource cards. Used by HandFan and trade
// modals so the same card visual appears everywhere.
const RESOURCE_CARD_BG: Record<Resource, string> = {
  wood: "linear-gradient(160deg, #2f6b2a 0%, #1f4d1c 100%)",
  brick: "linear-gradient(160deg, #b55a2a 0%, #7e3216 100%)",
  wheat: "linear-gradient(160deg, #e8c84a 0%, #b58e1c 100%)",
  sheep: "linear-gradient(160deg, #9bd16a 0%, #5e9540 100%)",
  ore: "linear-gradient(160deg, #6e7d8c 0%, #3d4a5a 100%)",
};

const HAND_ORDER: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];

export function GameView({
  state,
  selfId,
  sendAction,
}: {
  state: GameState;
  selfId: string | null;
  sendAction: (a: GameAction) => void;
}) {
  const me = state.players.find((p) => p.id === selfId) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = !!me && me.id === currentPlayer?.id;
  const isSpectator = useGameStore((s) => s.isSpectator);

  const setupInfo = useMemo(() => setupTurnInfo(state), [state]);
  const inSetup =
    state.phase === "setup_round_1" || state.phase === "setup_round_2";

  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [yopModalOpen, setYopModalOpen] = useState(false);
  const [monoModalOpen, setMonoModalOpen] = useState(false);
  const [pendingRoadBuilding, setPendingRoadBuilding] = useState<string[]>([]);
  /** Step 1 of move-ship: which ship the user already picked (its edge). */
  const [movingShipFrom, setMovingShipFrom] = useState<string | null>(null);
  const [diceModalRoll, setDiceModalRoll] = useState<[number, number] | null>(
    null,
  );
  // Cost being previewed (when user hovers a build button) — used by HandFan
  // to highlight the resources that would be spent.
  const [hoveredCost, setHoveredCost] = useState<
    Partial<Record<Resource, number>> | null
  >(null);
  // Cards that just got spent — used to play a brief "fly off" animation.
  const [flyingCards, setFlyingCards] = useState<Resource[]>([]);
  // Initial value "__init__" lets the dice effect tell "first render"
  // apart from "dice were just cleared at end of turn".
  const lastSeenRollRef = useRef<string | null>("__init__");
  const lastLogIdRef = useRef<string | null>(null);
  // Track the last pointer-down screen position so build animations can fly
  // toward where the user actually clicked (the chosen vertex/edge).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function track(e: PointerEvent) {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("pointerdown", track);
    return () => window.removeEventListener("pointerdown", track);
  }, []);

  // When server-side diceRoll changes (i.e. a new roll happened), show the
  // modal. On first mount we silently absorb whatever roll is already in
  // the snapshot — otherwise refreshing the page or coming back from the
  // lobby would replay the previous turn's animation. We use a sentinel
  // value ("__init__") instead of null so the absorb-on-mount logic can
  // distinguish "we just mounted" from "the dice were cleared between
  // turns", which legitimately happens every turn.
  useEffect(() => {
    const key = state.diceRoll
      ? `${state.diceRoll[0]},${state.diceRoll[1]},${state.currentPlayerIndex}`
      : null;
    // First snapshot of this session — remember whatever's there
    // (including null) so the next change is treated as a real roll.
    if (lastSeenRollRef.current === "__init__") {
      lastSeenRollRef.current = key;
      return;
    }
    if (lastSeenRollRef.current === key) return;
    lastSeenRollRef.current = key;
    if (state.diceRoll) {
      setDiceModalRoll(state.diceRoll);
      sfx.diceRoll();
    }
  }, [state.diceRoll, state.currentPlayerIndex]);

  // SFX based on log changes (cheap pattern matching).
  useEffect(() => {
    if (state.log.length === 0) return;
    const last = state.log[state.log.length - 1];
    if (lastLogIdRef.current === last.id) return;
    const wasFirstSeen = lastLogIdRef.current === null;
    lastLogIdRef.current = last.id;
    if (wasFirstSeen) return; // don't play on initial state load
    const text = last.text;
    if (text.includes("kazandı")) sfx.win();
    else if (text.includes("yerleşim") || text.includes("şehir") || text.includes("yol")) sfx.build();
    else if (text.includes("hırsız")) sfx.robber();
    else if (text.includes("ticaret")) sfx.trade();
    else if (text.includes("gelişme kartı")) sfx.cardDraw();
    else if (text.includes("teklif")) sfx.notify();
  }, [state.log]);

  // Persist this finished game into the local stats store when a winner is
  // declared. We only record once per (room, winnerId, finishedAt) combo via
  // the gameKey, and only for actual players (spectators get nothing).
  useEffect(() => {
    if (!state.winnerId || !me || isSpectator) return;
    const won = state.winnerId === me.id;
    recordGame({
      finishedAt: Date.now(),
      result: won ? "win" : "loss",
      vp: me.victoryPoints,
      playerCount: state.players.length,
      mapTemplateId: state.mapTemplateId,
      difficulty: state.difficulty,
      nickname: me.nickname,
      gameKey: `${state.roomCode}:${state.winnerId}:${state.players
        .map((p) => p.id)
        .sort()
        .join(",")}`,
    });
  }, [state.winnerId, me, isSpectator, state.players, state.mapTemplateId, state.difficulty, state.roomCode]);

  // In setup, force placement mode based on what's needed.
  // For Seafarers maps, "moving_robber" can target either a land hex (regular
  // robber) or a sea hex (pirate). We expose both to the user via two clicks,
  // simplest: one combined picker that allows both.
  const effectivePlacement: PlacementMode = inSetup
    ? isMyTurn && setupInfo?.needs === "settlement"
      ? "settlement"
      : isMyTurn && setupInfo?.needs === "road"
      ? "road"
      : null
    : isMyTurn && state.subPhase === "moving_robber"
    ? "robber"
    : isMyTurn
    ? placementMode
    : null;

  // Compute valid placements for the active mode (proactive UI: only highlight legal targets).
  const validVertexIds = useMemo<string[] | undefined>(() => {
    if (!me) return undefined;
    if (effectivePlacement === "settlement") {
      return getValidSettlementVertices(state, me.id, inSetup);
    }
    if (effectivePlacement === "city") {
      return getValidCityVertices(state, me.id);
    }
    return undefined;
  }, [effectivePlacement, state, me, inSetup]);

  const validEdgeIds = useMemo<string[] | undefined>(() => {
    if (!me) return undefined;
    if (effectivePlacement === "road") {
      const attach = inSetup
        ? lastInitialSettlementForPlayer(state, me.id) ?? undefined
        : undefined;
      return getValidRoadEdges(state, me.id, inSetup, attach);
    }
    if (effectivePlacement === "road_building") {
      // Sequential: validity may depend on already-picked edges in pendingRoadBuilding.
      // For simplicity, we recompute against the current state without assuming
      // the pending edges are placed. They're still validated server-side.
      return getValidRoadEdges(state, me.id, false);
    }
    if (effectivePlacement === "ship") {
      return getValidShipEdges(state, me.id);
    }
    if (effectivePlacement === "move_ship_select") {
      // Highlight every ship the player owns (allowOccupied is set on the
      // picker so the meshes register clicks).
      return state.pieces
        .filter((p) => p.kind === "ship" && p.playerId === me.id)
        .map((p) => (p as { edgeId: string }).edgeId);
    }
    if (effectivePlacement === "move_ship_target") {
      // For the destination step, valid edges are everywhere this player
      // could legally place a fresh ship right now (modulo the source ship).
      return getValidShipEdges(state, me.id);
    }
    if (effectivePlacement === "warship_upgrade") {
      // Player can upgrade any of their existing ships.
      return state.pieces
        .filter((p) => p.kind === "ship" && p.playerId === me.id)
        .map((p) => (p as { edgeId: string }).edgeId);
    }
    return undefined;
  }, [effectivePlacement, state, me, inSetup]);

  const validHexIds = useMemo<string[] | undefined>(() => {
    if (effectivePlacement === "robber" || effectivePlacement === "knight_robber") {
      // Combine land robber hexes + (if pirate enabled) sea pirate hexes so
      // the user can park either piece on the same picker click — applies to
      // both regular robber moves and knight-played-at-sea.
      const land = getValidRobberHexes(state);
      const sea = state.pirateHexId !== null ? getValidPirateHexes(state) : [];
      return [...land, ...sea];
    }
    if (effectivePlacement === "pirate") {
      return getValidPirateHexes(state);
    }
    return undefined;
  }, [effectivePlacement, state]);

  function clearPlacement() {
    setPlacementMode(null);
  }

  function flyCost(
    cost: Partial<Record<Resource, number>>,
    targetX?: number,
    targetY?: number,
  ) {
    const list: Resource[] = [];
    for (const [r, n] of Object.entries(cost)) {
      for (let i = 0; i < (n ?? 0); i++) list.push(r as Resource);
    }
    // GSAP-based imperative fly: clone the resource card DOM at hand-fan
    // location, animate along an arc to (targetX, targetY) — defaults to
    // screen center.
    if (typeof window !== "undefined") {
      const tx = targetX ?? window.innerWidth / 2;
      const ty = targetY ?? window.innerHeight / 2;
      for (const kind of list) {
        const el = document.querySelector<HTMLElement>(
          `[data-card-kind="${kind}"]`,
        );
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const clone = el.cloneNode(true) as HTMLElement;
        clone.style.position = "fixed";
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.margin = "0";
        clone.style.transform = "";
        clone.style.zIndex = "100";
        clone.style.pointerEvents = "none";
        document.body.appendChild(clone);
        // Mid-arc point above the chord between source and target.
        const midX = (rect.left + tx) / 2;
        const midY = Math.min(rect.top, ty) - 100;
        gsap
          .timeline({
            onComplete: () => {
              clone.remove();
            },
          })
          .to(clone, {
            duration: 0.4,
            left: midX,
            top: midY,
            rotate: -25,
            scale: 1.15,
            ease: "power2.out",
          })
          .to(clone, {
            duration: 0.45,
            left: tx - rect.width / 2,
            top: ty - rect.height / 2,
            rotate: 25,
            scale: 0.4,
            opacity: 0,
            ease: "power2.in",
          });
      }
    }
    // Brief grayout in the hand while server state catches up so the spent
    // cards don't visually "stay" until the next snapshot lands.
    setFlyingCards(list);
    window.setTimeout(() => setFlyingCards([]), 200);
  }

  function handleVertexClick(vertexId: string) {
    if (!me || !isMyTurn) return;
    if (inSetup) {
      sendAction({ type: "PLACE_INITIAL_SETTLEMENT", playerId: me.id, vertexId });
    } else if (effectivePlacement === "settlement") {
      sendAction({ type: "BUILD_SETTLEMENT", playerId: me.id, vertexId });
      flyCost(
        BUILD_COSTS.settlement,
        lastPointerRef.current?.x,
        lastPointerRef.current?.y,
      );
      clearPlacement();
    } else if (effectivePlacement === "city") {
      sendAction({ type: "BUILD_CITY", playerId: me.id, vertexId });
      flyCost(
        BUILD_COSTS.city,
        lastPointerRef.current?.x,
        lastPointerRef.current?.y,
      );
      clearPlacement();
    }
  }

  function handleEdgeClick(edgeId: string) {
    if (!me || !isMyTurn) return;
    if (inSetup) {
      sendAction({ type: "PLACE_INITIAL_ROAD", playerId: me.id, edgeId });
    } else if (effectivePlacement === "road") {
      sendAction({ type: "BUILD_ROAD", playerId: me.id, edgeId });
      flyCost(
        BUILD_COSTS.road,
        lastPointerRef.current?.x,
        lastPointerRef.current?.y,
      );
      clearPlacement();
    } else if (effectivePlacement === "ship") {
      sendAction({ type: "BUILD_SHIP", playerId: me.id, edgeId });
      flyCost(
        BUILD_COSTS.ship,
        lastPointerRef.current?.x,
        lastPointerRef.current?.y,
      );
      clearPlacement();
    } else if (effectivePlacement === "move_ship_select") {
      // Step 1: store the source edge and switch to target picker.
      setMovingShipFrom(edgeId);
      setPlacementMode("move_ship_target");
    } else if (effectivePlacement === "move_ship_target") {
      if (!movingShipFrom) return;
      sendAction({
        type: "MOVE_SHIP",
        playerId: me.id,
        fromEdgeId: movingShipFrom,
        toEdgeId: edgeId,
      });
      setMovingShipFrom(null);
      clearPlacement();
    } else if (effectivePlacement === "warship_upgrade") {
      sendAction({ type: "UPGRADE_TO_WARSHIP", playerId: me.id, edgeId });
      clearPlacement();
    } else if (effectivePlacement === "road_building") {
      // Collect 1 or 2 edges then send PLAY_ROAD_BUILDING.
      const next = [...pendingRoadBuilding, edgeId];
      setPendingRoadBuilding(next);
      if (next.length >= 2) {
        sendAction({
          type: "PLAY_ROAD_BUILDING",
          playerId: me.id,
          edgeIds: next,
        });
        setPendingRoadBuilding([]);
        clearPlacement();
      }
    }
  }

  function handleHexClick(hexId: string) {
    if (!me || !isMyTurn) return;
    // Decide whether the click is a robber move or a pirate move, based on
    // the clicked hex's terrain.
    const targetHex = state.hexes.find((h) => h.id === hexId);
    const isSea = targetHex?.terrain === "sea";
    if (effectivePlacement === "robber") {
      sendAction(
        isSea
          ? { type: "MOVE_PIRATE", playerId: me.id, hexId }
          : { type: "MOVE_ROBBER", playerId: me.id, hexId },
      );
    } else if (effectivePlacement === "knight_robber") {
      sendAction({
        type: "PLAY_KNIGHT",
        playerId: me.id,
        hexId,
      });
      clearPlacement();
    } else if (effectivePlacement === "pirate") {
      sendAction({ type: "MOVE_PIRATE", playerId: me.id, hexId });
      clearPlacement();
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative flex-1 min-h-[480px]">
        {isSpectator && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-amber-300/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100 shadow backdrop-blur">
            👁 İzleyici modu — yalnızca takip edebilirsin
          </div>
        )}
        <Board3D
          hexes={state.hexes}
          pieces={state.pieces}
          ports={state.ports}
          robberHexId={state.robberHexId}
          pirateHexId={state.pirateHexId}
          fortresses={state.fortresses}
          players={state.players}
          placementMode={effectivePlacement}
          validVertexIds={validVertexIds}
          validEdgeIds={validEdgeIds}
          validHexIds={validHexIds}
          onVertexClick={handleVertexClick}
          onEdgeClick={handleEdgeClick}
          onHexClick={handleHexClick}
        />
        <TurnBanner
          state={state}
          isMyTurn={isMyTurn}
          currentPlayer={currentPlayer}
          setupInfo={setupInfo}
        />
        {state.winnerId && (
          <WinBanner winner={state.players.find((p) => p.id === state.winnerId)} />
        )}
        {state.subPhase === "stealing" && isMyTurn && me && state.robberHexId && (
          <StealModal
            state={state}
            myId={me.id}
            onSteal={(victimId) =>
              sendAction({
                type: "STEAL_RESOURCE",
                playerId: me.id,
                victimId,
              })
            }
          />
        )}
        {state.subPhase === "discarding" && me && totalCards(me) > 7 && (
          <DiscardModal
            me={me}
            deadlineMs={state.discardDeadlineMs}
            onConfirm={(cards) =>
              sendAction({
                type: "DISCARD_CARDS",
                playerId: me.id,
                cards,
              })
            }
          />
        )}
        {me &&
          state.pendingGoldChoices.some((c) => c.playerId === me.id) && (
            <GoldChoiceModal
              count={state.pendingGoldChoices.filter((c) => c.playerId === me.id).length}
              bank={state.bank}
              onPick={(resource) =>
                sendAction({
                  type: "CHOOSE_GOLD_RESOURCE",
                  playerId: me.id,
                  resource,
                })
              }
            />
          )}
      </div>

      {me && !isSpectator && (
        <ActionBar
          state={state}
          me={me}
          isMyTurn={isMyTurn}
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
          pendingRoadBuilding={pendingRoadBuilding}
          openTrade={() => setTradeOpen(true)}
          openYop={() => setYopModalOpen(true)}
          openMono={() => setMonoModalOpen(true)}
          sendAction={sendAction}
          setHoveredCost={setHoveredCost}
          flyCards={(cards) => {
            setFlyingCards(cards);
            window.setTimeout(() => setFlyingCards([]), 700);
          }}
        />
      )}
      {tradeOpen && me && (
        <TradeModal
          state={state}
          me={me}
          isMyTurn={isMyTurn}
          onClose={() => setTradeOpen(false)}
          sendAction={sendAction}
        />
      )}
      {!tradeOpen && state.pendingTrade && me && state.pendingTrade.fromPlayerId !== me.id && (
        <TradeOfferToast
          state={state}
          me={me}
          onOpen={() => setTradeOpen(true)}
        />
      )}
      {yopModalOpen && me && (
        <YearOfPlentyModal
          onClose={() => setYopModalOpen(false)}
          onConfirm={(resources) => {
            sendAction({
              type: "PLAY_YEAR_OF_PLENTY",
              playerId: me.id,
              resources,
            });
            setYopModalOpen(false);
          }}
        />
      )}
      {monoModalOpen && me && (
        <MonopolyModal
          onClose={() => setMonoModalOpen(false)}
          onConfirm={(resource) => {
            sendAction({
              type: "PLAY_MONOPOLY",
              playerId: me.id,
              resource,
            });
            setMonoModalOpen(false);
          }}
        />
      )}
      {diceModalRoll && (
        <DiceModal
          values={diceModalRoll}
          onDone={() => setDiceModalRoll(null)}
        />
      )}
      {me && !isSpectator && state.phase !== "lobby" && (
        <HandFan
          me={me}
          hoveredCost={hoveredCost}
          flyingCards={flyingCards}
          devActions={{
            canPlayKnight:
              isMyTurn &&
              state.phase === "playing" &&
              !me.hasPlayedDevThisTurn &&
              (state.subPhase === "main" || state.subPhase === "awaiting_roll"),
            canPlayDev:
              isMyTurn &&
              state.phase === "playing" &&
              !me.hasPlayedDevThisTurn &&
              state.subPhase === "main",
            activeKind:
              placementMode === "knight_robber"
                ? "knight"
                : placementMode === "road_building"
                ? "road_building"
                : null,
            onKnight: () =>
              setPlacementMode(
                placementMode === "knight_robber" ? null : "knight_robber",
              ),
            onRoadBuilding: () =>
              setPlacementMode(
                placementMode === "road_building" ? null : "road_building",
              ),
            onYearOfPlenty: () => setYopModalOpen(true),
            onMonopoly: () => setMonoModalOpen(true),
          }}
        />
      )}
    </div>
  );
}

function TurnBanner({
  state,
  isMyTurn,
  currentPlayer,
  setupInfo,
}: {
  state: GameState;
  isMyTurn: boolean;
  currentPlayer: Player | undefined;
  setupInfo: ReturnType<typeof setupTurnInfo>;
}) {
  const phase = state.phase;
  let text = "";
  if (phase === "setup_round_1" || phase === "setup_round_2") {
    const round = phase === "setup_round_1" ? "1" : "2";
    if (setupInfo?.needs === "settlement") {
      text = `Kurulum ${round}. raunt — ${currentPlayer?.nickname} yerleşim yerini seçiyor`;
    } else if (setupInfo?.needs === "road") {
      text = `Kurulum ${round}. raunt — ${currentPlayer?.nickname} yolunu seçiyor`;
    }
  } else if (phase === "playing") {
    if (state.subPhase === "awaiting_roll") {
      text = `${currentPlayer?.nickname} zar atacak`;
    } else if (state.subPhase === "main") {
      text = state.diceRoll
        ? `${currentPlayer?.nickname} (${state.diceRoll[0] + state.diceRoll[1]} attı)`
        : `${currentPlayer?.nickname} sırada`;
    } else if (state.subPhase === "moving_robber") {
      text = `${currentPlayer?.nickname} hırsızı taşıyor`;
    } else if (state.subPhase === "stealing") {
      text = `${currentPlayer?.nickname} kurban seçiyor`;
    } else if (state.subPhase === "discarding") {
      text = `7 atıldı — kart atma sırası`;
    }
  } else if (phase === "finished") {
    text = "Oyun bitti";
  }

  // Pick the most relevant deadline for this banner.
  const deadline =
    state.subPhase === "discarding"
      ? state.discardDeadlineMs
      : state.subPhase === "trading"
      ? state.tradeDeadlineMs
      : state.turnDeadlineMs;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium backdrop-blur ${
        isMyTurn
          ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100"
          : "border-white/10 bg-slate-900/60 text-white/80"
      }`}
    >
      <span>
        {isMyTurn && phase !== "finished" ? "Senin sıran — " : ""}
        {text}
      </span>
      {deadline && <Countdown deadlineMs={deadline} />}
    </div>
  );
}

// Countdown timer that renders the seconds remaining until `deadlineMs`. Ticks
// every 250 ms (smooth without being expensive). Hides itself once 0 is hit.
export function Countdown({
  deadlineMs,
  className = "",
}: {
  deadlineMs: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
  if (remaining <= 0) return null;
  const urgent = remaining <= 5;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        urgent
          ? "animate-pulse bg-rose-500/30 text-rose-100"
          : "bg-white/10 text-white/80"
      } ${className}`}
    >
      <span aria-hidden>⏱</span>
      <span>{remaining}s</span>
    </span>
  );
}

function ModalShell({
  onClose,
  children,
  z = 20,
}: {
  onClose?: () => void;
  children: React.ReactNode;
  z?: number;
}) {
  return (
    <motion.div
      key="modal-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{ zIndex: z }}
      className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function totalCards(p: Player): number {
  return Object.values(p.resources).reduce((a, b) => a + b, 0);
}

function DiscardModal({
  me,
  deadlineMs,
  onConfirm,
}: {
  me: Player;
  deadlineMs: number | null;
  onConfirm: (cards: Partial<Record<Resource, number>>) => void;
}) {
  const required = Math.floor(totalCards(me) / 2);
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  const [picked, setPicked] = useState<Record<Resource, number>>({
    wood: 0,
    brick: 0,
    wheat: 0,
    sheep: 0,
    ore: 0,
  });
  const total = Object.values(picked).reduce((a, b) => a + b, 0);

  function adjust(r: Resource, delta: number) {
    setPicked((cur) => {
      const nextVal = Math.max(0, Math.min(me.resources[r], cur[r] + delta));
      return { ...cur, [r]: nextVal };
    });
  }

  return (
    <ModalShell z={10}>
      <div className="w-full max-w-md">
        <h3 className="mb-1 flex items-center justify-center gap-2 text-center text-lg font-semibold text-white">
          <span>7 atıldı — kart at</span>
          {deadlineMs && <Countdown deadlineMs={deadlineMs} />}
        </h3>
        <p className="mb-4 text-center text-sm text-white/60">
          Toplam {totalCards(me)} kartın var. {required} kartı atman gerek.
        </p>
        <div className="space-y-2">
          {order.map((r) => (
            <div key={r} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/40 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span>{RESOURCE_ICONS[r]}</span>
                <span className="text-white/80">{RESOURCE_LABELS[r]}</span>
                <span className="text-xs text-white/40">({me.resources[r]})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adjust(r, -1)}
                  disabled={picked[r] <= 0}
                  className="h-7 w-7 rounded-md bg-slate-700 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono">{picked[r]}</span>
                <button
                  onClick={() => adjust(r, 1)}
                  disabled={picked[r] >= me.resources[r]}
                  className="h-7 w-7 rounded-md bg-slate-700 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span
            className={`text-sm ${
              total === required ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            Seçili: {total} / {required}
          </span>
          <button
            onClick={() => onConfirm(picked)}
            disabled={total !== required}
            className="rounded-lg bg-rose-500 px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-rose-400"
          >
            Kartları at
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function GoldChoiceModal({
  count,
  bank,
  onPick,
}: {
  count: number;
  bank: Record<Resource, number>;
  onPick: (r: Resource) => void;
}) {
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  return (
    <ModalShell z={15}>
      <div>
        <h3 className="mb-1 text-center text-lg font-semibold text-amber-200">
          ✨ Altın Tarla
        </h3>
        <p className="mb-3 text-center text-sm text-white/70">
          {count > 1
            ? `${count} kart almaya hak kazandın. Birini seç.`
            : "Bir kaynak seç."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {order.map((r) => {
            const empty = (bank[r] ?? 0) <= 0;
            return (
              <button
                key={r}
                onClick={() => onPick(r)}
                disabled={empty}
                className="transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30"
                title={empty ? "Bankada yok" : RESOURCE_LABELS[r]}
              >
                <ResourceCard kind={r} width={64} height={92} />
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function StealModal({
  state,
  myId,
  onSteal,
}: {
  state: GameState;
  myId: string;
  onSteal: (victimId: string) => void;
}) {
  const candidates = state.robberHexId
    ? getRobberyVictims(state, state.robberHexId, myId)
    : [];
  return (
    <ModalShell z={10}>
      <div>
        <h3 className="mb-3 text-center text-lg font-semibold text-white">
          Kart çalmak için bir kurban seç
        </h3>
        <div className="flex flex-wrap justify-center gap-3">
          {candidates.map((id) => {
            const p = state.players.find((pl) => pl.id === id);
            if (!p) return null;
            const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
            return (
              <button
                key={id}
                onClick={() => onSteal(id)}
                className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm transition hover:border-amber-300 hover:bg-amber-500/10"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorFor(p.color) }}
                />
                <span className="font-semibold text-white">{p.nickname}</span>
                <span className="text-xs text-white/60">{total} kart</span>
              </button>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}

function WinBanner({ winner }: { winner: Player | undefined }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.5, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="rounded-2xl border border-amber-300/40 bg-slate-900 p-8 text-center shadow-2xl"
      >
        <motion.div
          animate={{
            rotate: [0, -10, 10, -10, 10, 0],
            scale: [1, 1.2, 1, 1.2, 1],
          }}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.5 }}
          className="text-6xl"
        >
          🏆
        </motion.div>
        <h2 className="mt-2 text-2xl font-semibold text-amber-200">
          {winner?.nickname ?? "Bilinmeyen oyuncu"} kazandı!
        </h2>
      </motion.div>
    </motion.div>
  );
}

function ActionBar({
  state,
  me,
  isMyTurn,
  placementMode,
  setPlacementMode,
  pendingRoadBuilding,
  openTrade,
  openYop,
  openMono,
  sendAction,
  setHoveredCost,
  flyCards,
}: {
  state: GameState;
  me: Player;
  isMyTurn: boolean;
  placementMode: PlacementMode;
  setPlacementMode: (p: PlacementMode) => void;
  pendingRoadBuilding: string[];
  openTrade: () => void;
  openYop: () => void;
  openMono: () => void;
  sendAction: (a: GameAction) => void;
  setHoveredCost: (cost: Partial<Record<Resource, number>> | null) => void;
  flyCards: (cards: Resource[]) => void;
}) {
  const inSetup =
    state.phase === "setup_round_1" || state.phase === "setup_round_2";
  const canRoll =
    isMyTurn && state.phase === "playing" && state.subPhase === "awaiting_roll";
  const canBuild =
    isMyTurn && state.phase === "playing" && state.subPhase === "main";
  const canEndTurn = canBuild;

  function canAfford(cost: Partial<Record<Resource, number>>): boolean {
    for (const [r, n] of Object.entries(cost)) {
      if ((me.resources[r as Resource] ?? 0) < (n ?? 0)) return false;
    }
    return true;
  }
  const canAffordSettlement = canAfford(BUILD_COSTS.settlement);
  const canAffordCity = canAfford(BUILD_COSTS.city) && me.citiesRemaining > 0;
  const canAffordRoad = canAfford(BUILD_COSTS.road) && me.roadsRemaining > 0;
  const canAffordShip = canAfford(BUILD_COSTS.ship) && me.shipsRemaining > 0;
  const canAffordDev = canAfford(DEV_CARD_COST) && state.devDeck.length > 0;
  const hasUnplacedSettlement = me.settlementsRemaining > 0;
  const hasUpgradeableSettlement =
    state.pieces.some(
      (p) => p.kind === "settlement" && p.playerId === me.id,
    );
  const shipsAllowed = state.rules.maxShips > 0;

  function btn(
    label: string,
    onClick: () => void,
    enabled: boolean,
    color: "emerald" | "indigo" | "amber" | "slate" = "slate",
    active = false,
    cost?: Partial<Record<Resource, number>>,
    tooltip?: string,
  ) {
    const base =
      "rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
    const c = active
      ? "bg-amber-400 text-slate-900"
      : {
          emerald: "bg-emerald-500 hover:bg-emerald-400 text-white",
          indigo: "bg-indigo-500 hover:bg-indigo-400 text-white",
          amber: "bg-amber-500 hover:bg-amber-400 text-slate-900",
          slate: "bg-slate-700 hover:bg-slate-600 text-white",
        }[color];
    const buttonEl = (
      <button
        onClick={onClick}
        disabled={!enabled}
        onMouseEnter={cost ? () => setHoveredCost(cost) : undefined}
        onMouseLeave={cost ? () => setHoveredCost(null) : undefined}
        onFocus={cost ? () => setHoveredCost(cost) : undefined}
        onBlur={cost ? () => setHoveredCost(null) : undefined}
        className={`${base} ${c}`}
      >
        {label}
      </button>
    );
    if (!tooltip) return buttonEl;
    return (
      <Tooltip label={tooltip} side="top" align="center" width={240}>
        {buttonEl}
      </Tooltip>
    );
  }

  function costToFlyList(
    cost: Partial<Record<Resource, number>>,
  ): Resource[] {
    const out: Resource[] = [];
    for (const [r, n] of Object.entries(cost)) {
      for (let i = 0; i < (n ?? 0); i++) out.push(r as Resource);
    }
    return out;
  }

  // (Dev card counts and play conditions moved to GameView's HandFan
  // call so they can drive both the inline play actions and the
  // bottom-right hand display from a single source of truth.)

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
      <div className="flex flex-wrap gap-2">
        {btn(
          state.diceRoll
            ? `🎲 ${state.diceRoll[0]} + ${state.diceRoll[1]}`
            : "🎲 Zar at",
          () => sendAction({ type: "ROLL_DICE", playerId: me.id }),
          canRoll,
          "emerald",
          false,
          undefined,
          "Sırada iki zar at. 7 atılırsa hırsız hareket eder ve 7'den fazla kart tutan herkes elini yarıya indirir; diğer sayılar o numaralı hex'lerin komşu yerleşim/şehirlerine kaynak verir.",
        )}
        {btn(
          "🛖 Yerleşim (1🌲 1🧱 1🍞 1🐑)",
          () =>
            setPlacementMode(
              placementMode === "settlement" ? null : "settlement",
            ),
          canBuild && canAffordSettlement && hasUnplacedSettlement,
          "indigo",
          placementMode === "settlement",
          BUILD_COSTS.settlement,
          "Yeni yerleşim kur. Köşede en az iki yol/gemi mesafesinde olmalı, mevcut yapın bağlantısı şart. Her yerleşim 1 GP.",
        )}
        {btn(
          "🏰 Şehir (2🍞 3⛏)",
          () => setPlacementMode(placementMode === "city" ? null : "city"),
          canBuild && canAffordCity && hasUpgradeableSettlement,
          "indigo",
          placementMode === "city",
          BUILD_COSTS.city,
          "Mevcut yerleşimini şehre yükselt. Şehir o köşeden iki kat kaynak üretir ve 2 GP değerindedir.",
        )}
        {btn(
          "🛤 Yol (1🌲 1🧱)",
          () => setPlacementMode(placementMode === "road" ? null : "road"),
          canBuild && canAffordRoad,
          "indigo",
          placementMode === "road",
          BUILD_COSTS.road,
          "Yol inşa et. Mevcut yol/yerleşim bağlantısı olmalı. 5+ ardışık yol En Uzun Yol bonusunu (+2 GP) verir.",
        )}
        {shipsAllowed &&
          btn(
            "🚢 Gemi (1🌲 1🐑)",
            () => setPlacementMode(placementMode === "ship" ? null : "ship"),
            canBuild && canAffordShip,
            "indigo",
            placementMode === "ship",
            BUILD_COSTS.ship,
            "Deniz kenarına gemi inşa et. Gemiler yollar gibi adaları köprüler ve En Uzun Rota bonusuna sayılır.",
          )}
        {shipsAllowed &&
          state.pieces.some(
            (p) => p.kind === "ship" && p.playerId === me.id,
          ) &&
          btn(
            placementMode === "move_ship_select"
              ? "↔ Gemi seç…"
              : placementMode === "move_ship_target"
              ? "↔ Hedef seç…"
              : "↔ Gemi taşı",
            () =>
              setPlacementMode(
                placementMode === "move_ship_select" ||
                  placementMode === "move_ship_target"
                  ? null
                  : "move_ship_select",
              ),
            canBuild,
            "slate",
            placementMode === "move_ship_select" ||
              placementMode === "move_ship_target",
            undefined,
            "Zincirin son ucundaki bir gemiyi başka bir geçerli kenara taşı. Sırada bir gemi taşıyabilirsin (bu turda inşa ettiğin gemi taşınamaz).",
          )}
        {shipsAllowed &&
          state.pieces.some(
            (p) => p.kind === "ship" && p.playerId === me.id,
          ) &&
          me.devCards.available.includes("knight") &&
          btn(
            "⚔️🚢 Savaş gemisi",
            () =>
              setPlacementMode(
                placementMode === "warship_upgrade" ? null : "warship_upgrade",
              ),
            canBuild && !me.hasPlayedDevThisTurn,
            "amber",
            placementMode === "warship_upgrade",
            undefined,
            "1 Şövalye kartını harcayarak normal gemini savaş gemisine yükselt. Savaş gemisi korsana saldırabilir ve kale fethedebilir.",
          )}
        {/* Pirate Islands: attack a fortress if you have a warship adjacent
            to one and the fortress isn't already yours. We render a button
            for every attackable fortress so the user doesn't need a 2-step
            picker. */}
        {state.fortresses
          .filter((f) => f.ownerId !== me.id)
          .filter((f) => {
            // Quick adjacency check — same logic as the reducer's guard.
            const myWarships = state.pieces.filter(
              (p) => p.kind === "warship" && p.playerId === me.id,
            ) as { edgeId: string }[];
            return myWarships.some((w) => {
              for (const h of state.hexes) {
                const edges = w.edgeId;
                void edges;
                // edge → adjacent hexes lookup is expensive client-side; just
                // check whether any hex matches the fortress and the edge
                // string contains a coord substring of that hex.
                if (h.id !== f.hexId) continue;
                const cx = h.coord.q;
                const cy = h.coord.r;
                if (w.edgeId.includes(`${cx},${cy}`)) return true;
              }
              return false;
            });
          })
          .map((f) => (
            <button
              key={f.hexId}
              onClick={() =>
                sendAction({
                  type: "ATTACK_FORTRESS",
                  playerId: me.id,
                  hexId: f.hexId,
                })
              }
              disabled={!canBuild}
              className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
              title={`Kaleye saldır (${f.hpRemaining}/3 can)`}
            >
              ⚔️ Kale saldır ({f.hpRemaining}/3)
            </button>
          ))}
        {btn(
          "🤝 Ticaret",
          openTrade,
          canBuild,
          "indigo",
          false,
          undefined,
          "Diğer oyuncularla veya bankayla kaynak takası yap. Bankada 4:1, kaynak limanında 2:1, genel limanda 3:1.",
        )}
        {btn(
          "🎴 Kart al (1🍞 1🐑 1⛏)",
          () => {
            sendAction({ type: "BUY_DEV_CARD", playerId: me.id });
            flyCards(costToFlyList(DEV_CARD_COST));
          },
          canBuild && canAffordDev,
          "indigo",
          false,
          DEV_CARD_COST,
          "Desteden rastgele bir gelişme kartı çek. Kart o turda oynanamaz; sıra başına en fazla 1 gelişme kartı oynanır.",
        )}
        {btn(
          "Sırayı bitir →",
          () => sendAction({ type: "END_TURN", playerId: me.id }),
          canEndTurn,
          "amber",
          false,
          undefined,
          "Sıranı tamamla ve sonraki oyuncuya geç. Zar atılmadıysa bitiremezsin.",
        )}
      </div>

      {/* Dev cards now live in the bottom-right hand alongside resource
          cards — see HandFan. The dedicated panel was removed so the
          action bar stays compact. */}

      {inSetup && (
        <p className="text-xs text-white/60">
          Kurulum aşamasında haritada **sarı noktaya** tıklayarak yerleşim
          yerini koy, sonra **sarı çubuğa** tıklayarak yolunu yerleştir.
        </p>
      )}
    </div>
  );
}

// Clickable dev card for the action bar. Shows the card art, count badge,
// dims when disabled, glows when active, and supports a small progress label
// for cards that take multiple clicks to play (e.g. road building).
function DevCardButton({
  kind,
  count,
  enabled,
  active = false,
  progressLabel,
  onClick,
}: {
  kind: import("@/game/types").DevelopmentCard;
  count: number;
  enabled: boolean;
  active?: boolean;
  progressLabel?: string;
  onClick: () => void;
}) {
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        disabled={!enabled}
        className={`transition disabled:cursor-not-allowed disabled:opacity-40 ${
          enabled && !active ? "hover:scale-105" : ""
        }`}
      >
        <DevCard
          kind={kind}
          count={count}
          highlighted={active}
          width={48}
          height={70}
          showDesc
        />
      </button>
      {progressLabel && (
        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">
          {progressLabel}
        </span>
      )}
      {/* Hover tooltip with the full card description. Pointer-events
          are off so the tooltip can't trap clicks meant for the card. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-950/95 px-3 py-2 text-[11px] leading-snug text-white shadow-xl backdrop-blur group-hover:block">
        <div className="mb-1 text-xs font-semibold text-amber-200">
          {DEV_CARD_NAMES_TR[kind]}
        </div>
        <div className="text-white/85">{DEV_CARD_LONG_DESC_TR[kind]}</div>
      </div>
    </div>
  );
}

// Bottom-right "hand" of resource cards. We stack same-kind cards into one
// pile with a count badge, so a 12-card hand still fits cleanly. Flying
// animation is driven by the `flyingCards` list — the matching kinds get a
// brief fly-up, fade-out transition.
function HandFan({
  me,
  hoveredCost,
  flyingCards,
  devActions,
}: {
  me: Player;
  hoveredCost?: Partial<Record<Resource, number>> | null;
  flyingCards?: Resource[];
  // Optional: clicking a playable dev card triggers the matching action.
  // Provided by GameView when it's the player's turn AND they haven't
  // already played a dev card this turn.
  devActions?: {
    canPlayKnight: boolean;
    canPlayDev: boolean;
    activeKind: "knight" | "road_building" | null;
    onKnight: () => void;
    onRoadBuilding: () => void;
    onYearOfPlenty: () => void;
    onMonopoly: () => void;
  };
}) {
  // One stack per kind, but only kinds the player actually has.
  const stacks = HAND_ORDER.filter((r) => (me.resources[r] ?? 0) > 0).map(
    (r) => ({ kind: r, count: me.resources[r] ?? 0 }),
  );
  const totalCardCount = stacks.reduce((acc, s) => acc + s.count, 0);

  // Determine which kinds are needed by the currently-hovered cost, and how
  // many of each are missing.
  const highlightedKinds = new Set<Resource>();
  const missingByKind: Partial<Record<Resource, number>> = {};
  if (hoveredCost) {
    for (const [r, n] of Object.entries(hoveredCost)) {
      const need = n ?? 0;
      if (need <= 0) continue;
      const have = me.resources[r as Resource] ?? 0;
      if (have > 0) highlightedKinds.add(r as Resource);
      if (need > have) missingByKind[r as Resource] = need - have;
    }
  }
  const hasMissing = Object.keys(missingByKind).length > 0;

  // Kinds that should play the fly-off animation right now.
  const flyingKinds = new Set<Resource>(flyingCards ?? []);

  // Dev cards: aggregate by kind so the hand shows e.g. "Knight ×3" as
  // a single stack. Pending cards (just-bought, can't play this turn)
  // are kept separate so they render greyed out.
  const devCounts: Record<string, number> = {};
  for (const k of me.devCards.available) {
    devCounts[k] = (devCounts[k] ?? 0) + 1;
  }
  const vpCount = me.hiddenVictoryPoints ?? 0;
  const devStacks: { kind: import("@/game/types").DevelopmentCard; count: number }[] = [];
  for (const k of ["knight", "road_building", "year_of_plenty", "monopoly"] as const) {
    if ((devCounts[k] ?? 0) > 0) devStacks.push({ kind: k, count: devCounts[k] });
  }
  if (vpCount > 0) devStacks.push({ kind: "victory_point", count: vpCount });
  const pendingDev = me.devCards.pendingFromTurn ?? [];

  const totalAll = totalCardCount + devStacks.length + pendingDev.length;
  if (totalAll === 0) {
    return (
      <div className="pointer-events-none fixed bottom-3 right-4 z-20 flex items-end gap-1">
        {HAND_ORDER.map((r) => (
          <div
            key={r}
            className="h-20 w-14 rounded-lg border border-white/10 bg-slate-900/40 opacity-30"
          />
        ))}
      </div>
    );
  }

  // Build a single deck of items (resources + dev cards + pending dev
  // cards) that share one fan rotation. The order matters visually:
  // resources on the left in HAND_ORDER, then playable dev cards, then
  // greyed-out pending dev cards.
  type FanItem =
    | { type: "resource"; kind: Resource; count: number }
    | {
        type: "dev";
        kind: import("@/game/types").DevelopmentCard;
        count: number;
        playable: boolean;
        active: boolean;
        onClick?: () => void;
      }
    | {
        type: "dev_pending";
        kind: import("@/game/types").DevelopmentCard;
      };

  // Order: dev cards (and pending dev) on the LEFT, resources on the
  // RIGHT. The fan rotation lifts left-most cards higher, so the dev
  // tooltip can grow up and to the right without leaving the viewport.
  const items: FanItem[] = [
    ...pendingDev.map((c) => ({ type: "dev_pending" as const, kind: c })),
    ...devStacks.map((d) => {
      const playable =
        !!devActions &&
        d.kind !== "victory_point" &&
        (d.kind === "knight" ? devActions.canPlayKnight : devActions.canPlayDev);
      const active =
        !!devActions &&
        devActions.activeKind !== null &&
        devActions.activeKind === (d.kind as typeof devActions.activeKind);
      const onClick = () => {
        if (!devActions || !playable) return;
        if (d.kind === "knight") devActions.onKnight();
        else if (d.kind === "road_building") devActions.onRoadBuilding();
        else if (d.kind === "year_of_plenty") devActions.onYearOfPlenty();
        else if (d.kind === "monopoly") devActions.onMonopoly();
      };
      return {
        type: "dev" as const,
        kind: d.kind,
        count: d.count,
        playable,
        active,
        onClick,
      };
    }),
    ...stacks.map((s) => ({
      type: "resource" as const,
      kind: s.kind,
      count: s.count,
    })),
  ];

  const maxFan = Math.min(0.35, items.length * 0.08);

  return (
    <div className="pointer-events-none fixed bottom-0 right-6 z-20 flex items-end gap-3 select-none">
      <div
        className="relative flex items-end justify-end"
        style={{
          height: 140,
          width: Math.max(120, items.length * 56),
          paddingRight: 20,
        }}
      >
        {items.map((it, i) => {
          const t = items.length === 1 ? 0.5 : i / (items.length - 1);
          const angle = (-maxFan / 2 + t * maxFan) * (180 / Math.PI);
          const xOffset = -((items.length - 1 - i) * 50);
          const lift = Math.sin(t * Math.PI) * 6;
          const highlighted =
            it.type === "resource" && highlightedKinds.has(it.kind);
          const flying = it.type === "resource" && flyingKinds.has(it.kind);
          const active = it.type === "dev" && it.active;

          const restingTransform = `translate(${xOffset}px, ${-lift}px) rotate(${angle}deg)`;
          const flyingTransform = `translate(${xOffset - 40}px, -240px) rotate(${angle - 18}deg) scale(0.7)`;

          const cardEl =
            it.type === "resource" ? (
              <>
                {it.count > 1 && (
                  <div
                    className="absolute right-0 top-0"
                    style={{ transform: "translate(-4px, -4px)" }}
                  >
                    <ResourceCard
                      kind={it.kind}
                      width={56}
                      height={84}
                      showCount={false}
                    />
                  </div>
                )}
                {it.count > 2 && (
                  <div
                    className="absolute right-0 top-0"
                    style={{ transform: "translate(-2px, -2px)" }}
                  >
                    <ResourceCard
                      kind={it.kind}
                      width={56}
                      height={84}
                      showCount={false}
                    />
                  </div>
                )}
                <ResourceCard
                  kind={it.kind}
                  count={it.count}
                  highlighted={highlighted}
                  width={56}
                  height={84}
                />
              </>
            ) : it.type === "dev" ? (
              <TitledTooltip
                title={DEV_CARD_NAMES_TR[it.kind]}
                body={DEV_CARD_LONG_DESC_TR[it.kind]}
                side="top"
                align="start"
                width={220}
              >
                <button
                  type="button"
                  onClick={it.onClick}
                  disabled={!it.playable}
                  className={`block rounded-md transition disabled:cursor-not-allowed ${
                    it.playable && !it.active ? "hover:scale-[1.02]" : ""
                  }`}
                >
                  <DevCard
                    kind={it.kind}
                    count={it.count}
                    highlighted={it.active}
                    width={56}
                    height={84}
                  />
                </button>
              </TitledTooltip>
            ) : (
              <DevCard
                kind={it.kind}
                pending
                width={56}
                height={84}
                showCount={false}
              />
            );

          return (
            <div
              key={`${it.type}-${
                it.kind
              }-${i}`}
              className={`group pointer-events-auto absolute bottom-0 right-0 ease-out hover:z-30 hover:!translate-y-[-22px] hover:!scale-110 hover:!rotate-0 ${
                flying
                  ? "transition-all duration-700"
                  : "transition-transform duration-200"
              }`}
              style={{
                transform: flying ? flyingTransform : restingTransform,
                transformOrigin: "50% 110%",
                opacity: flying ? 0 : 1,
              }}
            >
              {cardEl}
              {active && (
                <div className="pointer-events-none absolute -inset-1 rounded-md ring-2 ring-amber-300/80" />
              )}
            </div>
          );
        })}

        {hasMissing && (
          <div className="pointer-events-none absolute -top-12 right-0 flex gap-1">
            {Object.entries(missingByKind).map(([r, n]) => (
              <div
                key={r}
                className="flex items-center gap-0.5 rounded-md border border-rose-400/60 bg-rose-500/30 px-1.5 py-0.5 text-xs font-semibold text-rose-100 shadow"
                title={`${RESOURCE_LABELS[r as Resource]} eksik`}
              >
                <span>{RESOURCE_ICONS[r as Resource]}</span>
                <span>−{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="absolute -top-6 right-0 rounded-md bg-slate-900/80 px-2 py-0.5 text-xs font-semibold text-white shadow">
        {totalCardCount} kart
      </div>
    </div>
  );
}

export function PlayerScores({ state }: { state: GameState }) {
  const ordered = state.turnOrder
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p);
  // Resolve who plays now and who plays next, using the current player's
  // index in the turn order list (not the players list — those can drift
  // when players join mid-lobby).
  const currentPlayerId = state.players[state.currentPlayerIndex]?.id;
  const currentIdx = ordered.findIndex((p) => p.id === currentPlayerId);
  const nextIdx =
    ordered.length > 0 && currentIdx >= 0
      ? (currentIdx + 1) % ordered.length
      : -1;
  const showTurnIndicators =
    state.phase === "playing" ||
    state.phase === "setup_round_1" ||
    state.phase === "setup_round_2";
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-white/50">
          Skorlar
        </span>
        {showTurnIndicators && currentIdx >= 0 && (
          <span className="text-[10px] tracking-wide text-emerald-300">
            Sıra: {ordered[currentIdx].nickname}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {ordered.map((p, idx) => {
          const isCurrent = idx === currentIdx;
          const isNext = idx === nextIdx && currentIdx >= 0 && idx !== currentIdx;
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                isCurrent
                  ? "bg-emerald-500/10 ring-1 ring-emerald-400/50"
                  : isNext
                  ? "bg-amber-500/5 ring-1 ring-amber-400/30"
                  : "bg-slate-950/40"
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Fixed-width slot keeps the ▶ and ⌛ glyphs aligned with
                    the empty placeholder, regardless of how wide the
                    underlying glyph happens to be in the user's font. */}
                <span className="inline-flex h-4 w-4 items-center justify-center text-sm leading-none">
                  {showTurnIndicators && isCurrent ? (
                    <Tooltip
                      label="Şu an bu oyuncunun sırası"
                      width={180}
                    >
                      <span className="text-emerald-300">▶</span>
                    </Tooltip>
                  ) : showTurnIndicators && isNext ? (
                    <Tooltip label="Sıradaki oyuncu" width={160}>
                      <span className="text-amber-300/80">⌛</span>
                    </Tooltip>
                  ) : null}
                </span>
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: colorFor(p.color) }}
                />
                <span className={isCurrent ? "font-semibold" : ""}>
                  {p.nickname}
                </span>
                {idx === 0 && state.phase === "lobby" && (
                  <Tooltip
                    label="Odanın hostu — harita, zorluk, ayarlar ve oyunu başlatma yetkisi onda."
                    width={220}
                  >
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-200">
                      host
                    </span>
                  </Tooltip>
                )}
                {showTurnIndicators && isCurrent && (
                  <Tooltip
                    label="Aktif oyuncu — zar atan, inşa eden ve sırayı bitirebilen tek oyuncu bu."
                    width={220}
                  >
                    <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-200">
                      Sıra
                    </span>
                  </Tooltip>
                )}
                {showTurnIndicators && isNext && (
                  <Tooltip
                    label="Mevcut oyuncu sırayı bitirince sıra bu oyuncuya geçer."
                    width={220}
                  >
                    <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-200">
                      Sıradaki
                    </span>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Tooltip
                  label={`Galibiyet Puanı: yerleşim 1, şehir 2, en uzun yol/ordu 2, gizli kart 1. Hedefe ulaşan kazanır.`}
                  side="top"
                  align="end"
                  width={240}
                >
                  <span className="font-semibold">
                    {p.victoryPoints} GP
                  </span>
                </Tooltip>
                <Tooltip
                  label="Bu oyuncunun elindeki toplam kaynak kartı sayısı."
                  side="top"
                  align="end"
                  width={200}
                >
                  <span className="text-white/50">
                    {Object.values(p.resources).reduce((a, b) => a + b, 0)} 🃏
                  </span>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function YearOfPlentyModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (resources: Resource[]) => void;
}) {
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  const [picks, setPicks] = useState<Resource[]>([]);
  const valid = picks.length === 2;

  function toggle(r: Resource) {
    if (picks.length < 2) {
      setPicks([...picks, r]);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div>
        <h3 className="mb-1 text-center text-lg font-semibold text-white">
          🍞 Bereket yılı — 2 kart seç
        </h3>
        <p className="mb-3 text-center text-xs text-white/60">
          Bankadan istediğin 2 kaynağı al (aynı kart x2 olabilir).
        </p>
        <div className="mb-3 flex flex-wrap justify-center gap-3">
          {order.map((r) => {
            const pickedCount = picks.filter((p) => p === r).length;
            return (
              <button
                key={r}
                onClick={() => toggle(r)}
                disabled={picks.length >= 2}
                className="transition hover:scale-105 disabled:opacity-40"
              >
                <ResourceCard
                  kind={r}
                  count={pickedCount}
                  highlighted={pickedCount > 0}
                  width={64}
                  height={92}
                />
              </button>
            );
          })}
        </div>
        <div className="mb-3 text-center text-sm text-white/80">
          Seçili: {picks.map((r) => RESOURCE_ICONS[r]).join(" ") || "(yok)"}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPicks([])}
            className="flex-1 rounded-lg bg-slate-700 py-2 text-sm text-white"
          >
            Sıfırla
          </button>
          <button
            onClick={() => onConfirm(picks)}
            disabled={!valid}
            className="flex-1 rounded-lg bg-emerald-500 py-2 font-semibold text-white disabled:opacity-40 hover:bg-emerald-400"
          >
            Onayla
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MonopolyModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (r: Resource) => void;
}) {
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  return (
    <ModalShell onClose={onClose}>
      <div>
        <h3 className="mb-1 text-center text-lg font-semibold text-white">
          🃏 Tekel — bir kaynak seç
        </h3>
        <p className="mb-3 text-center text-xs text-white/60">
          Tüm rakiplerin elindeki bu kaynağın tamamını al.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {order.map((r) => (
            <button
              key={r}
              onClick={() => onConfirm(r)}
              className="transition hover:scale-105"
            >
              <ResourceCard kind={r} width={64} height={92} />
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

function TradeOfferToast({
  state,
  me,
  onOpen,
}: {
  state: GameState;
  me: Player;
  onOpen: () => void;
}) {
  const trade = state.pendingTrade!;
  const offerer = state.players.find((p) => p.id === trade.fromPlayerId);
  return (
    <motion.button
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      onClick={onOpen}
      className="absolute right-4 top-16 z-10 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm shadow-lg backdrop-blur transition hover:bg-amber-500/20"
    >
      <div className="font-semibold text-amber-200">
        {offerer?.nickname} sana teklif yaptı
      </div>
      <div className="text-xs text-white/70">tıkla, görüntüle</div>
    </motion.button>
  );
}

function TradeModal({
  state,
  me,
  isMyTurn,
  onClose,
  sendAction,
}: {
  state: GameState;
  me: Player;
  isMyTurn: boolean;
  onClose: () => void;
  sendAction: (a: GameAction) => void;
}) {
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  const trade = state.pendingTrade;
  const isOfferer = trade?.fromPlayerId === me.id;

  const [give, setGive] = useState<Record<Resource, number>>({
    wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0,
  });
  const [receive, setReceive] = useState<Record<Resource, number>>({
    wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0,
  });

  function adj(
    setter: typeof setGive,
    cur: Record<Resource, number>,
    r: Resource,
    delta: number,
    max: number,
  ) {
    setter({ ...cur, [r]: Math.max(0, Math.min(max, cur[r] + delta)) });
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Ticaret</h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-md p-1 text-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Pending trade view */}
        {trade && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/5 p-4">
            <div className="mb-2 text-xs font-semibold tracking-wide text-amber-300">
              Açık teklif
            </div>
            <PendingTradeView
              state={state}
              trade={trade}
              me={me}
              sendAction={sendAction}
              onClose={onClose}
            />
          </div>
        )}

        {/* Offer creation (only for current player when no pending trade) */}
        {!trade && isMyTurn && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-slate-950/40 p-3">
              <div className="mb-2 text-xs font-semibold tracking-wide text-white/60">
                Vermek istediğin
              </div>
              <ResourcePicker
                order={order}
                values={give}
                onAdjust={(r, d) => adj(setGive, give, r, d, me.resources[r])}
                limits={me.resources}
              />
            </div>
            <div className="rounded-xl bg-slate-950/40 p-3">
              <div className="mb-2 text-xs font-semibold tracking-wide text-white/60">
                Almak istediğin
              </div>
              <ResourcePicker
                order={order}
                values={receive}
                onAdjust={(r, d) => adj(setReceive, receive, r, d, 99)}
                showHand={me.resources}
              />
            </div>
            <button
              onClick={() => {
                sendAction({
                  type: "OFFER_TRADE",
                  playerId: me.id,
                  give: stripZeros(give),
                  receive: stripZeros(receive),
                });
                setGive({ wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 });
                setReceive({ wood: 0, brick: 0, wheat: 0, sheep: 0, ore: 0 });
              }}
              disabled={
                Object.values(give).reduce((a, b) => a + b, 0) === 0 ||
                Object.values(receive).reduce((a, b) => a + b, 0) === 0
              }
              className="w-full rounded-xl bg-indigo-500 py-2.5 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-indigo-400"
            >
              Diğer oyunculara teklif gönder
            </button>
          </div>
        )}

        {/* Bank trade — only available to current player */}
        {!trade && isMyTurn && (
          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-white/50">
              Bankayla takas
            </div>
            <BankTradeRow me={me} state={state} sendAction={sendAction} />
          </div>
        )}

        {!isMyTurn && !trade && (
          <p className="mt-4 text-center text-sm text-white/60">
            Şu an senin sıran değil — sıradaki oyuncu teklif yapana kadar
            bekleyebilirsin.
          </p>
        )}
      </div>
    </ModalShell>
  );
}

function ResourcePicker({
  order,
  values,
  onAdjust,
  limits,
  showHand,
}: {
  order: Resource[];
  values: Record<Resource, number>;
  onAdjust: (r: Resource, delta: number) => void;
  /** Caps the + button to the player's actual hand. Used by the
   *  "Vermek istediğin" picker so they can't offer more than they own. */
  limits?: Record<Resource, number>;
  /** Independent of `limits` — when provided, every column shows
   *  "Elinde: N" under it as informational text. The "Almak istediğin"
   *  picker passes this without `limits` so the player sees what they
   *  already have without losing the ability to ask for more. */
  showHand?: Record<Resource, number>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {order.map((r) => {
        const count = values[r] ?? 0;
        const max = limits ? limits[r] : 99;
        const reachedMax = count >= max;
        const handShown = showHand ?? limits;
        return (
          <div key={r} className="flex flex-col items-center gap-1.5">
            <div className={count === 0 ? "opacity-60" : ""}>
              <ResourceCard
                kind={r}
                count={count}
                highlighted={count > 0}
                width={60}
                height={88}
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onAdjust(r, -1)}
                disabled={count <= 0}
                className="h-6 w-6 rounded bg-slate-700 text-sm font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <button
                onClick={() => onAdjust(r, 1)}
                disabled={reachedMax}
                className="h-6 w-6 rounded bg-slate-700 text-sm font-bold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </div>
            {handShown && (
              <span className="text-[10px] text-white/50">
                Elinde: {handShown[r] ?? 0}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PendingTradeView({
  state,
  trade,
  me,
  sendAction,
  onClose,
}: {
  state: GameState;
  trade: NonNullable<GameState["pendingTrade"]>;
  me: Player;
  sendAction: (a: GameAction) => void;
  onClose: () => void;
}) {
  const offerer = state.players.find((p) => p.id === trade.fromPlayerId);
  const isOfferer = trade.fromPlayerId === me.id;

  const summarize = (cards: Partial<Record<Resource, number>>) => {
    const parts: string[] = [];
    for (const [r, n] of Object.entries(cards)) {
      if ((n ?? 0) <= 0) continue;
      parts.push(`${n} ${RESOURCE_ICONS[r as Resource]}`);
    }
    return parts.join(" ") || "(hiçbir şey)";
  };

  const acceptedNames = trade.acceptedBy
    .map((id) => state.players.find((p) => p.id === id)?.nickname)
    .filter(Boolean);
  const rejectedNames = trade.rejectedBy
    .map((id) => state.players.find((p) => p.id === id)?.nickname)
    .filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="text-sm text-white/80">
        <span className="font-semibold">{offerer?.nickname}</span> veriyor:{" "}
        <span className="font-mono">{summarize(trade.give)}</span> →{" "}
        almak istiyor: <span className="font-mono">{summarize(trade.receive)}</span>
      </div>
      <div className="text-xs text-white/50">
        {acceptedNames.length > 0 && (
          <span className="text-emerald-300">
            Kabul: {acceptedNames.join(", ")}{" "}
          </span>
        )}
        {rejectedNames.length > 0 && (
          <span className="text-rose-300">
            · Red: {rejectedNames.join(", ")}
          </span>
        )}
      </div>

      {!isOfferer && (
        <div className="flex gap-2">
          <button
            onClick={() => {
              sendAction({ type: "ACCEPT_TRADE_OFFER", playerId: me.id });
            }}
            disabled={trade.acceptedBy.includes(me.id)}
            className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-400"
          >
            {trade.acceptedBy.includes(me.id) ? "Kabul ettin" : "Kabul"}
          </button>
          <button
            onClick={() => {
              sendAction({ type: "REJECT_TRADE_OFFER", playerId: me.id });
            }}
            disabled={trade.rejectedBy.includes(me.id)}
            className="flex-1 rounded-lg bg-rose-500 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-rose-400"
          >
            {trade.rejectedBy.includes(me.id) ? "Reddettin" : "Reddet"}
          </button>
        </div>
      )}

      {isOfferer && (
        <div className="space-y-2">
          {trade.acceptedBy.length === 0 ? (
            <p className="text-xs text-white/50">
              Henüz kimse kabul etmedi. Kabul gelene kadar bekle veya iptal et.
            </p>
          ) : (
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-white/50">
                Hangi oyuncuyla yapayım?
              </div>
              {trade.acceptedBy.map((id) => {
                const partner = state.players.find((p) => p.id === id);
                if (!partner) return null;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      sendAction({
                        type: "FINALIZE_TRADE",
                        playerId: me.id,
                        partnerId: id,
                      });
                      onClose();
                    }}
                    className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
                  >
                    {partner.nickname} ile takas et
                  </button>
                );
              })}
            </div>
          )}
          <button
            onClick={() => {
              sendAction({ type: "CANCEL_TRADE", playerId: me.id });
            }}
            className="w-full rounded-lg bg-slate-700 py-2 text-sm text-white hover:bg-slate-600"
          >
            Teklifi iptal et
          </button>
        </div>
      )}
    </div>
  );
}

function BankTradeRow({
  me,
  state,
  sendAction,
}: {
  me: Player;
  state: GameState;
  sendAction: (a: GameAction) => void;
}) {
  const order: Resource[] = ["wood", "brick", "wheat", "sheep", "ore"];
  const [give, setGiveR] = useState<Resource>("wood");
  const [recv, setRecv] = useState<Resource>("ore");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-950/40 p-3">
      <select
        value={give}
        onChange={(e) => setGiveR(e.target.value as Resource)}
        className="rounded-md bg-slate-800 px-2 py-1 text-sm"
      >
        {order.map((r) => (
          <option key={r} value={r}>
            {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]} ({me.resources[r]})
          </option>
        ))}
      </select>
      <span className="text-white/50">→</span>
      <select
        value={recv}
        onChange={(e) => setRecv(e.target.value as Resource)}
        className="rounded-md bg-slate-800 px-2 py-1 text-sm"
      >
        {order.map((r) => (
          <option key={r} value={r} disabled={r === give}>
            {RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          sendAction({ type: "BANK_TRADE", playerId: me.id, give, receive: recv })
        }
        disabled={give === recv}
        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-400"
      >
        Takas
      </button>
      <span className="text-xs text-white/40">
        (port'a göre 4:1, 3:1 veya 2:1 hesaplanır)
      </span>
    </div>
  );
}

function stripZeros(
  obj: Record<Resource, number>,
): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {};
  for (const [r, n] of Object.entries(obj)) {
    if (n > 0) out[r as Resource] = n;
  }
  return out;
}

function colorFor(name: string): string {
  const m: Record<string, string> = {
    red: "#e23b3b",
    blue: "#2a76d6",
    orange: "#f08a2c",
    white: "#eeeeee",
    green: "#2da14a",
    brown: "#8b5a2b",
    purple: "#9d3fc4",
    cyan: "#33c4d8",
  };
  return m[name] ?? "#cccccc";
}

// Wrap GameView for state pulling
export function GameViewContainer({
  sendAction,
}: {
  sendAction: (a: GameAction) => void;
}) {
  const state = useGameStore((s) => s.state);
  const selfId = useGameStore((s) => s.selfId);
  if (!state) return null;
  return <GameView state={state} selfId={selfId} sendAction={sendAction} />;
}
