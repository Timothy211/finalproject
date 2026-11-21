"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Kind = "info" | "error" | "success";
interface ToastItem {
  id: number;
  text: string;
  kind: Kind;
}

interface ToastApi {
  show: (text: string, kind?: Kind) => void;
  error: (text: string) => void;
  success: (text: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((text: string, kind: Kind = "info") => {
    const id = nextId.current++;
    setItems((xs) => [...xs.filter((x) => x.text !== text).slice(-3), { id, text, kind }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === "error" ? 4500 : 2800);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ show, error: (t) => show(t, "error"), success: (t) => show(t, "success") }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pop-in pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ring-1 ring-black/10 ${
              t.kind === "error"
                ? "bg-danger text-white"
                : t.kind === "success"
                  ? "bg-accent text-accent-fg"
                  : "bg-fg text-bg"
            }`}
            onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
