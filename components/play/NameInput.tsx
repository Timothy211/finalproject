"use client";

export function NameInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">Your name</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 24))}
        maxLength={24}
        autoFocus={autoFocus}
        autoComplete="nickname"
        placeholder="e.g. Raymond"
        className="w-full rounded-xl bg-card-2 px-3 py-2.5 text-base ring-1 ring-border outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}
