"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "@/platform/roomCode";
import {
  loadStoredNickname,
  saveNickname,
  loadLastRoomCode,
} from "@/platform/store";

export default function TtrLanding() {
  const router = useRouter();
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastRoom, setLastRoom] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredNickname();
    if (stored) setNick(stored);
    setLastRoom(loadLastRoomCode());
  }, []);

  function commitNickname(): string | null {
    const trimmed = nick.trim();
    if (trimmed.length < 2) {
      setError("En az 2 karakter takma ad gir.");
      return null;
    }
    if (trimmed.length > 24) {
      setError("Takma ad 24 karakteri geçemez.");
      return null;
    }
    saveNickname(trimmed);
    return trimmed;
  }

  function handleCreate() {
    setError(null);
    if (!commitNickname()) return;
    router.push(`/ticket-to-ride/oda/${generateRoomCode()}`);
  }

  function handleJoin() {
    setError(null);
    if (!commitNickname()) return;
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError("6 haneli oda kodu girmen gerek.");
      return;
    }
    router.push(`/ticket-to-ride/oda/${normalized}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 px-6 py-12 text-white">
      <header className="mb-10 flex w-full max-w-md items-center justify-between">
        <Link href="/" className="text-xs text-white/50 hover:text-white">
          ← Tüm oyunlar
        </Link>
        <Link
          href="/stats"
          className="text-xs text-white/50 hover:text-white"
        >
          📊 İstatistikler
        </Link>
      </header>
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-slate-900/60 p-8">
        <div>
          <h1 className="text-3xl font-semibold">Ticket to Ride</h1>
          <p className="mt-2 text-sm text-white/60">
            ABD haritası. 2–5 oyuncu. En uzun rota +10.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-white/50">
            Takma ad
          </label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="Örn. Mehmet"
            maxLength={24}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-2.5 text-white outline-none focus:border-indigo-400"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleCreate}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
          >
            Yeni oda kur
          </button>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-center font-mono uppercase tracking-[0.3em] text-white outline-none focus:border-indigo-400"
            />
            <button
              onClick={handleJoin}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Katıl
            </button>
          </div>
        </div>

        {lastRoom && (
          <button
            onClick={() => {
              if (commitNickname()) router.push(`/ticket-to-ride/oda/${lastRoom}`);
            }}
            className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
          >
            Son oda ({lastRoom})'ya geri dön
          </button>
        )}

        {error && (
          <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
