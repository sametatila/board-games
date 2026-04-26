"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadAllRecords,
  clearAllRecords,
  summarize,
  type GameRecord,
} from "@/lib/stats";
import { MAP_TEMPLATES } from "@/game/mapTemplates";
import type { MapTemplateId } from "@/game/types";
import { useConfirm } from "@/components/ConfirmDialog";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Kolay",
  normal: "Normal",
  hard: "Zor",
};

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

export default function StatsPage() {
  // Load records on mount and re-load whenever the window regains focus
  // (the user might have just finished a game in another tab).
  const [records, setRecords] = useState<GameRecord[]>([]);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setRecords(loadAllRecords());
    function refresh() {
      setRecords(loadAllRecords());
    }
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const summary = summarize(records);

  // Group by nickname so each player on the device gets their own card.
  const byNickname: Record<string, GameRecord[]> = {};
  for (const r of records) {
    byNickname[r.nickname] = byNickname[r.nickname] ?? [];
    byNickname[r.nickname].push(r);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              📊 İstatistikler
            </h1>
            <p className="text-sm text-white/60">
              Bu cihazda oynadığın oyunlar — yerel olarak saklanır.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm hover:bg-slate-800"
            >
              ← Anasayfa
            </Link>
            {records.length > 0 && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: "İstatistikleri sil?",
                    body: "Bu cihazdaki tüm oyun kayıtların kalıcı olarak silinir. Bu işlem geri alınamaz.",
                    confirmLabel: "Evet, sil",
                    cancelLabel: "Vazgeç",
                    tone: "danger",
                  });
                  if (ok) {
                    clearAllRecords();
                    setRecords([]);
                  }
                }}
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
              >
                Temizle
              </button>
            )}
          </div>
        </header>

        {records.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-center text-white/60">
            Henüz tamamlanmış oyun yok. Bir oyun bitir, sonuç buraya düşer.
          </div>
        ) : (
          <>
            {/* Top-level summary */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Oyun" value={summary.total} />
              <StatCard
                label="Galibiyet"
                value={summary.wins}
                accent="text-emerald-300"
              />
              <StatCard
                label="Mağlubiyet"
                value={summary.losses}
                accent="text-rose-300"
              />
              <StatCard
                label="Kazanma %"
                value={`${Math.round(summary.winRate * 100)}%`}
                accent="text-amber-300"
              />
            </section>

            {/* By map */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
                Haritaya göre
              </h2>
              <div className="space-y-1">
                {(
                  Object.keys(MAP_TEMPLATES) as MapTemplateId[]
                ).map((id) => {
                  const stat = summary.byMap[id];
                  if (!stat) return null;
                  const winPct = Math.round((stat.wins / stat.games) * 100);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {MAP_TEMPLATES[id].name}
                      </span>
                      <span className="text-white/70">
                        {stat.wins}/{stat.games}{" "}
                        <span className="text-amber-300">({winPct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* By difficulty */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
                Zorluk seviyesine göre
              </h2>
              <div className="space-y-1">
                {Object.entries(summary.byDifficulty).map(([id, stat]) => {
                  const winPct = Math.round((stat.wins / stat.games) * 100);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {DIFFICULTY_LABEL[id] ?? id}
                      </span>
                      <span className="text-white/70">
                        {stat.wins}/{stat.games}{" "}
                        <span className="text-amber-300">({winPct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Per-nickname breakdown */}
            {Object.keys(byNickname).length > 1 && (
              <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
                  Takma ada göre
                </h2>
                <div className="space-y-1">
                  {Object.entries(byNickname).map(([nick, list]) => {
                    const sum = summarize(list);
                    return (
                      <div
                        key={nick}
                        className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{nick}</span>
                        <span className="text-white/70">
                          {sum.wins}/{sum.total}{" "}
                          <span className="text-amber-300">
                            ({Math.round(sum.winRate * 100)}%)
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent games */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <h2 className="mb-3 text-xs uppercase tracking-wider text-white/40">
                Son oyunlar
              </h2>
              <div className="space-y-1 text-xs">
                {summary.recent.map((r) => (
                  <div
                    key={r.gameKey + r.finishedAt}
                    className="flex items-center justify-between rounded-lg bg-slate-950/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={
                          r.result === "win"
                            ? "rounded bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300"
                            : "rounded bg-rose-500/20 px-2 py-0.5 font-bold text-rose-300"
                        }
                      >
                        {r.result === "win" ? "G" : "K"}
                      </span>
                      <span className="font-medium">{r.nickname}</span>
                      <span className="text-white/50">
                        {MAP_TEMPLATES[r.mapTemplateId]?.name ?? r.mapTemplateId}
                      </span>
                      <span className="text-white/40">
                        {DIFFICULTY_LABEL[r.difficulty] ?? r.difficulty}
                      </span>
                      <span className="text-white/40">
                        {r.playerCount} oyuncu
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-white/50">
                      <span>{r.vp} GP</span>
                      <span>{formatDate(r.finishedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      {confirmDialog}
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = "text-white",
}: {
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
