"use client";

import { useId } from "react";
import { Icon } from "@/components/ui/Icon";
import { toArabicDigits } from "@/lib/quran/surahs";

/** Accessible numeric stepper (spinbutton semantics; ↑/↓, PageUp/PageDown, Home/End). */
export function Stepper({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: (v: number) => string;
  hint?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const set = (v: number) => onChange(clamp(v));

  function onKey(e: React.KeyboardEvent) {
    const map: Record<string, number> = {
      ArrowUp: value + step,
      ArrowDown: value - step,
      PageUp: value + step * 5,
      PageDown: value - step * 5,
      Home: min,
      End: max,
    };
    if (e.key in map) {
      e.preventDefault();
      set(map[e.key]);
    }
  }

  const text = unit ? unit(value) : toArabicDigits(value);

  return (
    <div>
      <p id={`${id}-label`} className="text-sm font-medium text-forest">
        {label}
      </p>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted mt-0.5">
          {hint}
        </p>
      ) : null}
      <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-parchment p-1.5">
        <button
          type="button"
          onClick={() => set(value - step)}
          disabled={value <= min}
          aria-label={`إنقاص ${label}`}
          className="grid place-items-center size-10 rounded-xl bg-white text-forest shadow-[var(--shadow-soft)] transition-colors hover:bg-olive-100 disabled:opacity-40"
        >
          <Icon name="minus" size={18} />
        </button>
        <div
          role="spinbutton"
          tabIndex={0}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={text}
          onKeyDown={onKey}
          className="min-w-28 px-3 text-center rounded-lg"
        >
          <span className="font-display text-2xl text-forest">{text}</span>
        </div>
        <button
          type="button"
          onClick={() => set(value + step)}
          disabled={value >= max}
          aria-label={`زيادة ${label}`}
          className="grid place-items-center size-10 rounded-xl bg-white text-forest shadow-[var(--shadow-soft)] transition-colors hover:bg-olive-100 disabled:opacity-40"
        >
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}
