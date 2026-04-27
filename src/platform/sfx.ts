"use client";

// Synthesized sound effects via Web Audio API. Zero asset weight, no licensing.

let audioContext: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Auto-resume on user gesture (browsers suspend AudioContext until interaction).
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

export function setMuted(m: boolean) {
  muted = m;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("sunny-harbor:muted", m ? "1" : "0");
    } catch {
      // ignore
    }
  }
}

export function isMuted(): boolean {
  return muted;
}

if (typeof window !== "undefined") {
  try {
    muted = window.localStorage.getItem("sunny-harbor:muted") === "1";
  } catch {
    // ignore
  }
}

function tone(opts: {
  freq: number;
  type?: OscillatorType;
  duration: number;
  volume?: number;
  freqEnd?: number;
  delay?: number;
  attack?: number;
  release?: number;
}) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(0.0001, opts.freqEnd),
      t0 + opts.duration,
    );
  }
  const vol = opts.volume ?? 0.18;
  const attack = opts.attack ?? 0.005;
  const release = opts.release ?? 0.05;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  gain.gain.linearRampToValueAtTime(
    vol,
    t0 + opts.duration - release,
  );
  gain.gain.linearRampToValueAtTime(0, t0 + opts.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.05);
}

function noise(opts: {
  duration: number;
  volume?: number;
  delay?: number;
  bandFreq?: number;
}) {
  if (muted) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + (opts.delay ?? 0);
  const buffer = ctx.createBuffer(1, ctx.sampleRate * opts.duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(opts.volume ?? 0.12, t0 + 0.005);
  gain.gain.linearRampToValueAtTime(0, t0 + opts.duration);
  if (opts.bandFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.bandFreq;
    filter.Q.value = 4;
    src.connect(filter);
    filter.connect(gain);
  } else {
    src.connect(gain);
  }
  gain.connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + opts.duration);
}

// Public API ----------------------------------------------------------------

export const sfx = {
  diceRoll() {
    // 4 quick clatter ticks
    for (let i = 0; i < 5; i++) {
      noise({
        duration: 0.06,
        volume: 0.14,
        delay: i * 0.08 + Math.random() * 0.04,
        bandFreq: 1500 + Math.random() * 2000,
      });
    }
  },
  build() {
    // Wooden tap: low square + bright noise
    tone({ freq: 220, type: "square", duration: 0.08, volume: 0.12 });
    noise({ duration: 0.08, volume: 0.08, bandFreq: 2200 });
  },
  cardDraw() {
    tone({ freq: 700, type: "triangle", duration: 0.1, freqEnd: 1000, volume: 0.1 });
  },
  trade() {
    tone({ freq: 600, type: "triangle", duration: 0.12, freqEnd: 900, volume: 0.12 });
    tone({ freq: 900, type: "triangle", duration: 0.12, freqEnd: 600, volume: 0.12, delay: 0.12 });
  },
  resourceGain() {
    tone({ freq: 880, type: "sine", duration: 0.12, freqEnd: 1320, volume: 0.1 });
  },
  error() {
    tone({ freq: 220, type: "sawtooth", duration: 0.15, freqEnd: 110, volume: 0.12 });
  },
  win() {
    // Triumphant arpeggio: C E G C
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => {
      tone({
        freq: n,
        type: "triangle",
        duration: 0.2,
        volume: 0.18,
        delay: i * 0.13,
      });
    });
  },
  robber() {
    // Ominous low sweep
    tone({ freq: 200, type: "sawtooth", duration: 0.6, freqEnd: 80, volume: 0.16 });
  },
  notify() {
    tone({ freq: 880, type: "sine", duration: 0.08, volume: 0.12 });
    tone({ freq: 1320, type: "sine", duration: 0.08, volume: 0.12, delay: 0.1 });
  },
  /** "It's your turn now" — louder than other cues, distinctive
   *  rising chime so the player notices even if they alt-tabbed away. */
  yourTurn() {
    // Bell-like rising arpeggio: C5 → E5 → G5 with a sustained final
    // note. Significantly louder than the other ambient cues.
    const notes: { f: number; d: number; t: number }[] = [
      { f: 523, d: 0.16, t: 0 },
      { f: 659, d: 0.16, t: 0.12 },
      { f: 784, d: 0.32, t: 0.24 },
    ];
    for (const n of notes) {
      tone({
        freq: n.f,
        type: "triangle",
        duration: n.d,
        volume: 0.28,
        delay: n.t,
        attack: 0.01,
        release: 0.08,
      });
      // Brighter overtone for clarity on small speakers.
      tone({
        freq: n.f * 2,
        type: "sine",
        duration: n.d,
        volume: 0.08,
        delay: n.t,
        attack: 0.01,
        release: 0.08,
      });
    }
  },
};
