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
  clearLastRoomCode,
} from "@/platform/store";

export default function SplendorLanding() {
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
    const room = generateRoomCode();
    router.push(`/splendor/oda/${room}`);
  }

  function handleJoin() {
    setError(null);
    if (!commitNickname()) return;
    const normalized = normalizeRoomCode(code);
    if (!isValidRoomCode(normalized)) {
      setError("Oda kodu 6 karakter olmalı.");
      return;
    }
    router.push(`/splendor/oda/${normalized}`);
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white">
      <header className="mb-6 flex w-full max-w-md items-center justify-between">
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
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-slate-900/60 p-8 shadow-2xl backdrop-blur">
        <header className="space-y-1 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Splendor</h1>
          <p className="text-sm text-white/60">
            Rönesans dönemi mücevher ekonomisi. 2–4 oyuncu, 15 prestij hedefi.
          </p>
        </header>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-white/50">
            Takma ad
          </label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="Örn. Mehmet"
            maxLength={24}
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 outline-none focus:border-indigo-400"
          />
        </div>

        {lastRoom && (
          <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <div className="text-xs uppercase tracking-wider text-emerald-200/80">
              Son aktif odan
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setError(null);
                  if (!commitNickname()) return;
                  router.push(`/splendor/oda/${lastRoom}`);
                }}
                className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-left font-mono text-lg tracking-[0.4em] text-white transition hover:bg-emerald-400"
                title="Bu odaya geri dön"
              >
                ↩ {lastRoom}
              </button>
              <button
                onClick={() => {
                  clearLastRoomCode();
                  setLastRoom(null);
                }}
                className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white/60 hover:bg-slate-700"
                title="Bu kısayolu unut"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-white/50">
              Aynı takma adla geri girdiğinde kaldığın yerden devam edersin.
            </p>
          </div>
        )}

        <button
          onClick={handleCreate}
          className="w-full rounded-xl bg-indigo-500 py-3 font-semibold transition hover:bg-indigo-400"
        >
          Yeni oda kur
        </button>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <div className="h-px flex-1 bg-white/10" />
          veya
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-white/50">
            Oda koduyla katıl
          </label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData("text");
                setCode(normalizeRoomCode(pasted));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoin();
              }}
              placeholder="ABCDEF"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-lg uppercase tracking-[0.4em] outline-none focus:border-indigo-400"
            />
            <button
              onClick={handleJoin}
              className="rounded-xl bg-emerald-500 px-5 font-semibold transition hover:bg-emerald-400"
            >
              Katıl
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <div className="flex items-center justify-center">
          <Link
            href="/stats"
            className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline"
          >
            📊 İstatistiklerim
          </Link>
        </div>

        <p className="text-center text-[11px] text-white/30">
          Bu oyun bir kişisel proje denemesidir. Splendor® markasıyla
          bağlantılı değildir.
        </p>
      </div>
    </main>
  );
}
