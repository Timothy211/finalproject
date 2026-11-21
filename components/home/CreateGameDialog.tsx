"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Segmented } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { NameInput } from "@/components/play/NameInput";
import { defaultWalls } from "@/lib/engine";
import { TIME_PRESETS, DEFAULT_PRESET } from "@/lib/timeControl";
import { getSupabase } from "@/lib/supabase/client";
import { ensureSession } from "@/lib/supabase/auth";
import { friendlyError } from "@/lib/errors";
import { useSetting } from "@/lib/settings";
import type { CreateSide } from "@/lib/types";
import { unlockAudio } from "@/lib/sound";

export function CreateGameDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [savedName, setSavedName] = useSetting("name");
  const [name, setName] = useState(savedName);
  const [n, setN] = useState<5 | 7 | 9>(9);
  const [walls, setWalls] = useState(defaultWalls(9));
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET);
  const [customMin, setCustomMin] = useState(5);
  const [customInc, setCustomInc] = useState(3);
  const [side, setSide] = useState<CreateSide>("random");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const nm = name.trim();
    if (!nm) return toast.error(friendlyError("NAME_REQUIRED"));
    unlockAudio();
    setSavedName(nm);
    const p = TIME_PRESETS.find((t) => t.id === preset);
    const initial = preset === "custom" ? Math.round(customMin * 60_000) : p!.initialMs;
    const inc = preset === "custom" ? Math.round(customInc * 1000) : p!.incrementMs;
    if (preset === "custom" && (initial < 30_000 || initial > 3_600_000 || inc < 0 || inc > 60_000)) {
      return toast.error("Custom time must be 0.5–60 minutes with 0–60 seconds increment.");
    }
    setBusy(true);
    try {
      await ensureSession();
      const { data, error } = await getSupabase().rpc("create_game", {
        p_name: nm,
        p_board_size: n,
        p_walls: walls,
        p_initial_time_ms: initial,
        p_increment_ms: inc,
        p_side: side,
      });
      if (error) throw error;
      router.push(`/play/${(data as { code: string }).code}`);
    } catch (e) {
      toast.error(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a game">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <NameInput value={name} onChange={setName} />
        <Field label="Board size">
          <Segmented
            ariaLabel="Board size"
            value={n}
            onChange={(v) => {
              setN(v);
              setWalls(defaultWalls(v));
            }}
            options={[
              { value: 9, label: "9×9" },
              { value: 7, label: "7×7 quick" },
              { value: 5, label: "5×5 quick" },
            ]}
          />
        </Field>
        <Field label={`Walls per player: ${walls}`}>
          <input
            type="range"
            min={0}
            max={20}
            value={walls}
            onChange={(e) => setWalls(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
            aria-label="Walls per player"
          />
        </Field>
        <Field label="Time control">
          <div className="grid grid-cols-3 gap-1.5">
            {[...TIME_PRESETS, { id: "custom", name: "Custom", initialMs: -1, incrementMs: 0 }].map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setPreset(t.id)}
                aria-pressed={preset === t.id}
                className={`rounded-xl px-2 py-2 text-sm ring-1 transition ${
                  preset === t.id ? "bg-accent font-bold text-accent-fg ring-accent" : "bg-card-2 ring-border hover:brightness-95"
                }`}
              >
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs opacity-80">
                  {t.id === "custom" ? "your own" : t.initialMs === 0 ? "no clock" : `${t.initialMs / 60000}+${t.incrementMs / 1000}`}
                </div>
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm">
                Minutes
                <input
                  type="number"
                  min={0.5}
                  max={60}
                  step={0.5}
                  value={customMin}
                  onChange={(e) => setCustomMin(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-card-2 px-2 py-1.5 ring-1 ring-border"
                />
              </label>
              <label className="text-sm">
                Increment (s)
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={customInc}
                  onChange={(e) => setCustomInc(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-card-2 px-2 py-1.5 ring-1 ring-border"
                />
              </label>
            </div>
          )}
        </Field>
        <Field label="You play">
          <Segmented<CreateSide>
            ariaLabel="Side"
            value={side}
            onChange={setSide}
            options={[
              { value: "p0", label: "First" },
              { value: "p1", label: "Second" },
              { value: "random", label: "Random" },
            ]}
          />
        </Field>
        <Button variant="primary" size="lg" className="w-full" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create & get invite link"}
        </Button>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium">{label}</div>
      {children}
    </div>
  );
}
