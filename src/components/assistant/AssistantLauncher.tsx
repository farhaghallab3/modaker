"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/primitives";
import { getStory } from "@/content/stories";
import { AIChat, type AssistantContext } from "./AIChat";

/** Derive assistant context from the current route. */
export function contextFromPath(pathname: string): AssistantContext | undefined {
  const quran = /^\/(?:quran|memorize)\/(\d{1,3})(?:\/|$)/.exec(pathname);
  if (quran) {
    const surah = Number(quran[1]);
    return surah >= 1 && surah <= 114 ? { surah } : undefined;
  }
  const story = /^\/stories\/([a-z0-9-]+)/.exec(pathname);
  if (story) {
    const s = getStory(story[1]);
    return s ? { storySlug: s.slug, surah: s.surahs[0] } : undefined;
  }
  return undefined;
}

/**
 * Floating "اسأل مُدّكِر" pill (bottom-start, above the mobile bottom nav) that opens
 * the assistant in a modal side sheet. Native <dialog> gives focus containment,
 * Esc-to-close and focus return to the pill.
 */
export function AssistantLauncher() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const routeContext = useMemo(() => contextFromPath(pathname), [pathname]);
  const [cleared, setCleared] = useState(false);
  useEffect(() => setCleared(false), [pathname]);
  const context = cleared ? undefined : routeContext;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // close the sheet when navigating (e.g. following a citation into the mushaf)
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed z-40 bottom-20 end-4 sm:end-auto sm:start-4 lg:bottom-6 lg:start-[calc(17rem+1.5rem)] inline-flex items-center gap-2 h-12 ps-2 pe-2 sm:pe-5 rounded-full bg-forest text-cream shadow-[var(--shadow-lift)] ring-1 ring-cream/10 transition-[background-color,transform] hover:bg-forest-700 active:scale-[0.98] print:hidden"
      >
        <span className="grid place-items-center size-8 rounded-full bg-cream/10 text-sand" aria-hidden>
          <Icon name="lamp" size={18} />
        </span>
        <span className="sr-only sm:not-sr-only text-sm font-medium">اسأل مُدّكِر</span>
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
        aria-labelledby="assistant-sheet-title"
        className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-dvh w-full max-w-full sm:w-[30rem] lg:w-[34rem] p-0 bg-paper text-ink shadow-[var(--shadow-lift)] backdrop:bg-scrim/30 backdrop:backdrop-blur-[2px] open:animate-rise"
      >
        {/* Inner wrapper stops backdrop-click detection from firing inside the sheet */}
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b hairline px-5 h-16 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid place-items-center size-9 rounded-xl bg-forest text-sand" aria-hidden>
                <Icon name="lamp" size={18} />
              </span>
              <div className="min-w-0">
                <h2 id="assistant-sheet-title" className="font-display text-xl leading-none text-forest">
                  اسأل مُدّكِر
                </h2>
                <p className="text-[0.7rem] text-muted mt-1">إجابات موثّقة بمصادرها</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/assistant"
                className="hidden sm:inline-flex h-9 items-center rounded-xl px-3 text-xs text-muted hover:bg-parchment hover:text-forest"
              >
                فتح في صفحة كاملة
              </Link>
              <IconButton icon="x" label="إغلاق" onClick={() => setOpen(false)} size={38} />
            </div>
          </header>
          <AIChat variant="sheet" context={context} onClearContext={() => setCleared(true)} className="flex-1 min-h-0" />
        </div>
      </dialog>
    </>
  );
}
