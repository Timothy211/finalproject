"use client";

import { useEffect, useRef, useState } from "react";
import { useSetting } from "@/lib/settings";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export function GameMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [sound, setSound] = useSetting("sound");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1" ref={ref}>
      <button
        onClick={() => setSound(!sound)}
        className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg"
        aria-label={sound ? "Mute sounds" : "Unmute sounds"}
        title={sound ? "Mute sounds" : "Unmute sounds"}
      >
        {sound ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="m23 9-6 6M17 9l6 6" />
          </svg>
        )}
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-fg"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Game menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {open && (
          <div role="menu" className="pop-in absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl bg-card py-1 shadow-xl ring-1 ring-border">
            {items
              .filter((i) => !i.hidden)
              .map((i) => (
                <button
                  key={i.label}
                  role="menuitem"
                  disabled={i.disabled}
                  onClick={() => {
                    setOpen(false);
                    i.onClick();
                  }}
                  className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-card-2 disabled:opacity-40 ${i.danger ? "text-danger" : ""}`}
                >
                  {i.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
