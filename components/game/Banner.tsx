"use client";

export function Banner({ tone = "warn", children }: { tone?: "warn" | "info" | "danger"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "bg-danger text-white"
      : tone === "info"
        ? "bg-card-2 text-fg ring-1 ring-border"
        : "bg-warn text-black";
  return (
    <div role="status" className={`mb-2 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${cls}`}>
      {children}
    </div>
  );
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
