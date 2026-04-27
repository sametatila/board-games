"use client";

/**
 * Local-only oyun istatistikleri. Hiçbir şey sunucuda tutulmuyor:
 * her tarayıcı kendi kazanma/kaybetme kayıtlarını localStorage'da
 * tutar. Honor sistem — kolay silinir, kolay sahte yapılır, kazara
 * partiler için yeterli.
 *
 * v2 generic shape: oyun-bağımsız, her oyunun metadata'sı esnek.
 */

import type { GameId } from "./types";

// --- v2 (current) shape ---------------------------------------------------

export type GameRecord = {
  /** Stabil benzersiz id — tekrarlı çağrılarda duplicate engellemek için. */
  gameKey: string;
  /** Hangi oyun. */
  game: GameId;
  finishedAt: number;
  result: "win" | "loss";
  /** Oyun-spesifik nihai skor (Catan: VP, Splendor: prestige, TtR: total). */
  finalScore: number;
  playerCount: number;
  nickname: string;
  /** Oyun-spesifik ek alan; UI breakdown için kullanılır.
   *  Catan: { mapTemplateId, difficulty }
   *  Splendor: { cardsBought, noblesTaken }
   *  TtR: { trainsRemaining, ticketsCompleted, longestPath } */
  metadata?: Record<string, string | number | boolean>;
};

// --- v1 legacy shape (Catan only) ----------------------------------------

type LegacyV1Record = {
  finishedAt: number;
  result: "win" | "loss";
  vp: number;
  playerCount: number;
  mapTemplateId: string;
  difficulty: string;
  nickname: string;
  gameKey: string;
};

// --- storage --------------------------------------------------------------

const STATS_KEY_V2 = "platform:stats:v2";
const SEEN_KEY_V2 = "platform:stats-seen:v2";
const STATS_KEY_V1 = "sunny-harbor:stats:v1";
const SEEN_KEY_V1 = "sunny-harbor:stats-seen:v1";

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

/**
 * Mevcut v1 (Catan-only) kayıtlarını v2 generic shape'e çevirir.
 * Idempotent: zaten v2 kaydı varsa migration yapmaz.
 */
function migrateV1ToV2() {
  if (typeof window === "undefined") return;
  // V2'de zaten kayıt varsa veya hiç v1 yoksa hiçbir şey yapma.
  const v2Existing = window.localStorage.getItem(STATS_KEY_V2);
  if (v2Existing !== null) return;
  const v1Raw = window.localStorage.getItem(STATS_KEY_V1);
  if (!v1Raw) return;

  let v1: LegacyV1Record[] = [];
  try {
    v1 = JSON.parse(v1Raw);
  } catch {
    return;
  }

  const migrated: GameRecord[] = v1.map((r) => ({
    gameKey: r.gameKey,
    game: "sunny-harbor",
    finishedAt: r.finishedAt,
    result: r.result,
    finalScore: r.vp,
    playerCount: r.playerCount,
    nickname: r.nickname,
    metadata: {
      mapTemplateId: r.mapTemplateId,
      difficulty: r.difficulty,
    },
  }));

  writeJson(STATS_KEY_V2, migrated);
  // Seen list de migrate et
  const seenV1 = readJson<string[]>(SEEN_KEY_V1, []);
  writeJson(SEEN_KEY_V2, seenV1);
  // V1 dosyalarını silmiyoruz (rollback güvenliği) — sadece artık okumayız.
}

// Module load anında bir kere çalış (browser side):
if (typeof window !== "undefined") {
  migrateV1ToV2();
}

// --- public API -----------------------------------------------------------

export function loadAllRecords(): GameRecord[] {
  return readJson<GameRecord[]>(STATS_KEY_V2, []);
}

export function loadRecordsForGame(game: GameId): GameRecord[] {
  return loadAllRecords().filter((r) => r.game === game);
}

export function clearAllRecords() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STATS_KEY_V2);
  window.localStorage.removeItem(SEEN_KEY_V2);
}

/** Yeni bitmiş oyun kaydı ekle. `gameKey` üzerinden idempotent. */
export function recordGame(record: GameRecord) {
  const seen = readJson<string[]>(SEEN_KEY_V2, []);
  if (seen.includes(record.gameKey)) return;
  const records = loadAllRecords();
  records.push(record);
  writeJson(STATS_KEY_V2, records.slice(-300)); // cap at 300
  writeJson(SEEN_KEY_V2, [...seen, record.gameKey].slice(-300));
}

export type StatsSummary = {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  bestScore: number;
  byMetadata: Record<string, Record<string, { games: number; wins: number }>>;
  recent: GameRecord[];
};

export function summarize(records: GameRecord[]): StatsSummary {
  const byMetadata: Record<
    string,
    Record<string, { games: number; wins: number }>
  > = {};
  let wins = 0;
  let bestScore = 0;
  for (const r of records) {
    if (r.result === "win") wins += 1;
    if (r.finalScore > bestScore) bestScore = r.finalScore;
    const md = r.metadata ?? {};
    for (const [k, v] of Object.entries(md)) {
      const sv = String(v);
      byMetadata[k] = byMetadata[k] ?? {};
      byMetadata[k][sv] = byMetadata[k][sv] ?? { games: 0, wins: 0 };
      byMetadata[k][sv].games += 1;
      if (r.result === "win") byMetadata[k][sv].wins += 1;
    }
  }
  const total = records.length;
  return {
    total,
    wins,
    losses: total - wins,
    winRate: total === 0 ? 0 : wins / total,
    bestScore,
    byMetadata,
    recent: records.slice(-10).reverse(),
  };
}
