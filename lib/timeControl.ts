export interface TimeControl {
  id: string;
  name: string;
  initialMs: number;
  incrementMs: number;
}

export const TIME_PRESETS: TimeControl[] = [
  { id: "bullet", name: "Bullet", initialMs: 60_000, incrementMs: 0 },
  { id: "blitz", name: "Blitz", initialMs: 180_000, incrementMs: 2_000 },
  { id: "rapid", name: "Rapid", initialMs: 300_000, incrementMs: 3_000 },
  { id: "classical", name: "Classical", initialMs: 600_000, incrementMs: 5_000 },
  { id: "untimed", name: "Untimed", initialMs: 0, incrementMs: 0 },
];

export const DEFAULT_PRESET = "rapid";

const fmtMin = (ms: number) => {
  const m = ms / 60_000;
  return Number.isInteger(m) ? String(m) : m.toFixed(1).replace(/\.0$/, "");
};

/** "Rapid 5+3", "Untimed", "Custom 4+1". */
export function timeControlLabel(initialMs: number, incrementMs: number): string {
  if (initialMs === 0) return "Untimed";
  const p = TIME_PRESETS.find((t) => t.initialMs === initialMs && t.incrementMs === incrementMs);
  const short = `${fmtMin(initialMs)}+${Math.round(incrementMs / 1000)}`;
  return p ? `${p.name} ${short}` : `Custom ${short}`;
}

/** Clock display: m:ss, or s.t below 10 s. */
export function formatClock(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 10_000) return (Math.floor(v / 100) / 10).toFixed(1);
  const total = Math.ceil(v / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
