"use client";

import { readSetting } from "./settings";

/** Tiny Web Audio synth — no audio files. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  const peak = opts.gain ?? 0.15;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseThud(dur = 0.09, gain = 0.25) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start();
}

export type SoundName = "move" | "wall" | "tick" | "lowtime" | "win" | "lose" | "notify" | "illegal" | "start";

export function play(name: SoundName) {
  if (!readSetting("sound")) return;
  if (name === "tick" && !readSetting("tickSound")) return;
  try {
    switch (name) {
      case "move":
        tone(520, 0.08, { type: "triangle", gain: 0.12, slide: 660 });
        break;
      case "wall":
        noiseThud();
        tone(140, 0.12, { type: "sine", gain: 0.18 });
        break;
      case "tick":
        tone(1400, 0.03, { type: "square", gain: 0.04 });
        break;
      case "lowtime":
        tone(880, 0.12, { type: "square", gain: 0.06 });
        tone(880, 0.12, { type: "square", gain: 0.06, delay: 0.18 });
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: "triangle", gain: 0.12, delay: i * 0.1 }));
        break;
      case "lose":
        [392, 330, 262].forEach((f, i) => tone(f, 0.25, { type: "sine", gain: 0.12, delay: i * 0.15 }));
        break;
      case "notify":
        tone(660, 0.09, { type: "sine", gain: 0.1 });
        tone(990, 0.12, { type: "sine", gain: 0.1, delay: 0.09 });
        break;
      case "illegal":
        tone(200, 0.12, { type: "sawtooth", gain: 0.05 });
        break;
      case "start":
        tone(440, 0.1, { gain: 0.12 });
        tone(880, 0.2, { gain: 0.12, delay: 0.12 });
        break;
    }
  } catch {
    /* audio is best-effort */
  }
}

/** Call from a user gesture to unlock audio on iOS. */
export function unlockAudio() {
  ac();
}
