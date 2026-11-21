"use client";

import { Modal, Segmented, Toggle } from "@/components/ui/Modal";
import { useSetting, type BoardTheme, type ConfirmPref, type ThemePref } from "@/lib/settings";

export function SettingsModal({ open, onClose, online }: { open: boolean; onClose: () => void; online?: boolean }) {
  const [sound, setSound] = useSetting("sound");
  const [tick, setTick] = useSetting("tickSound");
  const [confirm, setConfirm] = useSetting("confirmMoves");
  const [showPath, setShowPath] = useSetting("showPath");
  const [ghost, setGhost] = useSetting("thinkingGhost");
  const [muteChat, setMuteChat] = useSetting("muteChat");
  const [theme, setTheme] = useSetting("theme");
  const [board, setBoard] = useSetting("boardTheme");

  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-medium">Theme</div>
          <Segmented<ThemePref>
            ariaLabel="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Board</div>
          <Segmented<BoardTheme>
            ariaLabel="Board color theme"
            value={board}
            onChange={setBoard}
            options={[
              { value: "wood", label: "Wood" },
              { value: "slate", label: "Slate" },
              { value: "mint", label: "Mint" },
              { value: "night", label: "Night" },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">Confirm moves</div>
          <Segmented<ConfirmPref>
            ariaLabel="Confirm moves"
            value={confirm}
            onChange={setConfirm}
            options={[
              { value: "auto", label: "On touch", title: "Confirm on touch devices only" },
              { value: "on", label: "Always" },
              { value: "off", label: "Never" },
            ]}
          />
          <p className="mt-1 text-xs text-muted">Walls placed by touch always need a second tap.</p>
        </div>
        <div className="divide-y divide-border">
          <Toggle label="Sounds" checked={sound} onChange={setSound} />
          <Toggle label="Clock tick under 10 s" checked={tick} onChange={setTick} />
          <Toggle label="Show my shortest path" checked={showPath} onChange={setShowPath} />
          {online && (
            <>
              <Toggle
                label="Share my wall preview"
                hint="Your opponent sees a faint ghost of the wall you're hovering."
                checked={ghost}
                onChange={setGhost}
              />
              <Toggle label="Mute chat" checked={muteChat} onChange={setMuteChat} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
