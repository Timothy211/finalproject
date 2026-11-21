"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/realtime/useGameChannel";
import { useSetting } from "@/lib/settings";

export const EMOTES = ["👍", "😅", "🔥", "GG", "Nice wall!"];
export const MAX_CHAT = 200;

export function Chat({
  messages,
  myId,
  canSend,
  onSend,
}: {
  messages: ChatMessage[];
  myId: string;
  canSend: boolean;
  onSend: (text: string, kind: "text" | "emote") => boolean;
}) {
  const [text, setText] = useState("");
  const [muted, setMuted] = useSetting("muteChat");
  const listRef = useRef<HTMLDivElement>(null);
  const visible = muted ? messages.filter((m) => m.from === myId) : messages;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    if (onSend(t.slice(0, MAX_CHAT), "text")) setText("");
  };

  return (
    <div className="flex flex-col rounded-xl bg-card ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Chat</span>
        <button onClick={() => setMuted(!muted)} className="text-xs text-muted hover:text-fg" aria-pressed={muted}>
          {muted ? "🔇 Muted" : "Mute"}
        </button>
      </div>
      <div ref={listRef} className="h-36 space-y-1 overflow-y-auto px-3 py-2 text-sm" aria-live="polite">
        {visible.length === 0 ? (
          <p className="text-xs text-muted">{muted ? "Chat is muted." : "Say hi 👋"}</p>
        ) : (
          visible.map((m) => (
            <div key={m.id} className={m.from === myId ? "text-right" : ""}>
              <span className="text-xs font-semibold text-muted">{m.from === myId ? "You" : m.name}: </span>
              <span className={m.kind === "emote" ? "text-base font-semibold" : ""}>{m.text}</span>
            </div>
          ))
        )}
      </div>
      {canSend ? (
        <div className="space-y-2 border-t border-border p-2">
          <div className="flex flex-wrap gap-1">
            {EMOTES.map((e) => (
              <button
                key={e}
                onClick={() => onSend(e, "emote")}
                className="rounded-lg bg-card-2 px-2 py-1 text-sm ring-1 ring-border hover:brightness-95"
              >
                {e}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHAT))}
              maxLength={MAX_CHAT}
              placeholder="Message"
              aria-label="Chat message"
              className="min-w-0 flex-1 rounded-lg bg-card-2 px-3 py-1.5 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-accent"
            />
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
              Send
            </button>
          </form>
        </div>
      ) : (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">Spectators can read the chat.</p>
      )}
    </div>
  );
}
