"use client";

// Local-only player statistics. We don't persist anything on the server: each
// client tracks its own win/loss record in localStorage, keyed by nickname.
// Honor system — easy to clear, easy to fake, but fine for casual play.

import type { MapTemplateId } from "@/game/types";

export type GameRecord = {
  finishedAt: number;
  result: "win" | "loss";
  vp: number;
  playerCount: number;
  mapTemplateId: MapTemplateId;
  difficulty: string;
  nickname: string;
  /** Stable identifier so we don't double-count the same finished game. */
  gameKey: string;
};

const STATS_KEY = "sunny-harbor:stats:v1";
const SEEN_KEY = "sunny-harbor:stats-seen:v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode
  }
}

export function loadAllRecords(): GameRecord[] {
  return readJson<GameRecord[]>(STATS_KEY, []);
}

export function clearAllRecords() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STATS_KEY);
  window.localStorage.removeItem(SEEN_KEY);
}

/** Append a new finished-game record, idempotent on `gameKey` so calling it
 *  twice for the same game (e.g. from re-renders) only stores once. */
export function recordGame(record: GameRecord) {
  const seen = readJson<string[]>(SEEN_KEY, []);
  if (seen.includes(record.gameKey)) return;
  const records = loadAllRecords();
  records.push(record);
  writeJson(STATS_KEY, records.slice(-200)); // cap at 200
  writeJson(SEEN_KEY, [...seen, record.gameKey].slice(-200));
}

export type StatsSummary = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  byMap: Record<string, { games: number; wins: number }>;
  byDifficulty: Record<string, { games: number; wins: number }>;
  bestVp: number;
  recent: GameRecord[];
};

export function summarize(records: GameRecord[]): StatsSummary {
  const byMap: Record<string, { games: number; wins: number }> = {};
  const byDifficulty: Record<string, { games: number; wins: number }> = {};
  let wins = 0;
  let bestVp = 0;
  for (const r of records) {
    if (r.result === "win") wins += 1;
    if (r.vp > bestVp) bestVp = r.vp;
    byMap[r.mapTemplateId] = byMap[r.mapTemplateId] ?? { games: 0, wins: 0 };
    byMap[r.mapTemplateId].games += 1;
    if (r.result === "win") byMap[r.mapTemplateId].wins += 1;
    byDifficulty[r.difficulty] = byDifficulty[r.difficulty] ?? {
      games: 0,
      wins: 0,
    };
    byDifficulty[r.difficulty].games += 1;
    if (r.result === "win") byDifficulty[r.difficulty].wins += 1;
  }
  const total = records.length;
  return {
    total,
    wins,
    losses: total - wins,
    winRate: total === 0 ? 0 : wins / total,
    byMap,
    byDifficulty,
    bestVp,
    recent: records.slice(-10).reverse(),
  };
}
