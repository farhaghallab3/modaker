"use client";

import { cn } from "@/components/ui/primitives";

/** Single-select chip row (toggle buttons with aria-pressed). Scrolls horizontally on small screens. */
export function FilterChips<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1 [scrollbar-width:none]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "shrink-0 h-9 rounded-full px-4 text-sm transition-colors",
              active ? "bg-forest text-cream dark:bg-olive" : "bg-white/70 text-forest ring-1 ring-inset ring-line hover:bg-parchment",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
