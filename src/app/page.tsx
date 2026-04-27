"use client";

import Link from "next/link";
import { allGames } from "@/platform/registry";
import type { GameId } from "@/platform/types";

const GAME_THEME: Record<GameId, { emoji: string; accent: string; gradient: string }> = {
  "sunny-harbor": {
    emoji: "🏝️",
    accent: "from-amber-500 to-rose-500",
    gradient: "from-amber-500/15 via-rose-500/10 to-slate-900/0",
  },
  splendor: {
    emoji: "💎",
    accent: "from-emerald-500 to-cyan-500",
    gradient: "from-emerald-500/15 via-cyan-500/10 to-slate-900/0",
  },
  "ticket-to-ride": {
    emoji: "🚂",
    accent: "from-rose-500 to-indigo-500",
    gradient: "from-rose-500/15 via-indigo-500/10 to-slate-900/0",
  },
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 px-6 py-12 text-white">
      <header className="mb-12 text-center">
        <h1 className="bg-gradient-to-br from-amber-200 via-rose-200 to-indigo-200 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-5xl">
          Akşam masası
        </h1>
        <p className="mt-3 max-w-xl text-sm text-white/60">
          Arkadaşlarınla oynamak için bir oyun seç. Oda kur veya 6 haneli kodla
          katıl — login yok, sadece takma ad.
        </p>
      </header>

      <section className="grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {allGames.map((game) => {
          const theme = GAME_THEME[game.id];
          return (
            <article
              key={game.id}
              className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-6 transition ${
                game.playable
                  ? "hover:-translate-y-0.5 hover:border-white/30 hover:bg-slate-900/80 hover:shadow-2xl"
                  : "opacity-60"
              }`}
            >
              {/* gradient backdrop */}
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${theme.gradient} opacity-50 transition group-hover:opacity-90`}
              />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-3xl">{theme.emoji}</div>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {game.displayName}
                    </h2>
                  </div>
                  {!game.playable && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                      Yakında
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  {game.shortDescription}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs text-white/40">
                  <span>
                    {game.minPlayers}–{game.maxPlayers} oyuncu
                  </span>
                </div>
                <div className="mt-6">
                  {game.playable ? (
                    <Link
                      href={game.lobbyPath}
                      className={`inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r ${theme.accent} px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110`}
                    >
                      Oyna →
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-slate-800/50 px-4 py-2.5 text-sm font-semibold text-white/40"
                    >
                      Yakında açılıyor
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <nav className="mt-10 flex gap-4 text-xs text-white/40">
        <Link
          href="/stats"
          className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-1.5 transition hover:bg-slate-900/80 hover:text-white/80"
        >
          📊 İstatistikler
        </Link>
      </nav>

      <footer className="mt-16 text-center text-[11px] text-white/30">
        <p>
          Sunny Harbor / Splendor / Ticket to Ride · multiplayer · arkadaş
          çevresi için
        </p>
      </footer>
    </main>
  );
}
