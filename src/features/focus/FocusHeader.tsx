"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Minimal header for focus modes (/memorize/*, /recite), where AppShell hides
 * its own top bar and bottom nav. Exit on the start side, title centered.
 */
export function FocusHeader({
  exitHref,
  exitLabel,
  title,
  subtitle,
  end,
}: {
  exitHref: string;
  exitLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur border-b hairline pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-3xl grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 h-14 px-2 sm:px-4">
        <Link
          href={exitHref}
          aria-label={exitLabel}
          title={exitLabel}
          className="grid place-items-center size-11 rounded-xl text-forest hover:bg-parchment transition-colors"
        >
          <Icon name="x" size={21} />
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="font-display text-xl leading-tight text-forest truncate">{title}</h1>
          {subtitle ? <p className="text-[0.72rem] text-muted truncate">{subtitle}</p> : null}
        </div>
        <div className="flex justify-end">{end}</div>
      </div>
    </header>
  );
}

/** Thumb-reachable sticky bottom bar for focus modes (safe-area aware). */
export function FocusActionBar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="sticky bottom-0 z-20 mt-8 border-t hairline bg-paper/92 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="mx-auto max-w-3xl px-4 flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none sm:justify-center">{children}</div>
    </div>
  );
}
