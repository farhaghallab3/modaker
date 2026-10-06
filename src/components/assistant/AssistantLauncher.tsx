"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
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
  const routeContext = useMemo(() => contextFromPath(pathname), [pathname]);
  const [cleared, setCleared] = useState(false);
  useEffect(() => setCleared(false), [pathname]);
  const context = cleared ? undefined : routeContext;


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

      <AssistantSheet open={open} onClose={() => setOpen(false)} context={context} onClearContext={() => setCleared(true)} />
    </>
  );
}

/**
 * The assistant side sheet, controlled by its owner so any screen (memorize, recite…) can open it with an exact
 * ayah context. Native <dialog>: focus containment, Esc to close, focus return.
 * `ayahRange` shows a small «‹ الآية n ›» picker so the learner always sees — and can change — which ayah "هذه الآية" means.
 */
export function AssistantSheet({
  open,
  onClose,
  context,
  onClearContext,
  ayahRange,
  onAyahChange,
}: {
  open: boolean;
  onClose: () => void;
  context?: AssistantContext;
  onClearContext?: () => void;
  ayahRange?: { from: number; to: number };
  onAyahChange?: (ayah: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const ayah = context?.ayah;
  const picker = ayahRange && ayah && onAyahChange && ayahRange.to > ayahRange.from;
  return (
      <dialog
        ref={ref}
        onClose={onClose}
        onClick={(e) => {
          if (e.target === ref.current) onClose();
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
                <p className="text-[0.7rem] text-muted mt-1">مساعد ذكي · إجابات موثّقة بمصادرها</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/assistant"
                className="hidden sm:inline-flex h-9 items-center rounded-xl px-3 text-xs text-muted hover:bg-parchment hover:text-forest"
              >
                فتح في صفحة كاملة
              </Link>
              <IconButton icon="x" label="إغلاق" onClick={onClose} size={38} />
            </div>
          </header>
          {picker ? (
            <div className="flex items-center justify-center gap-3 border-b hairline bg-parchment/50 px-4 py-2 text-sm" role="group" aria-label="اختيار الآية">
              <button type="button" onClick={() => onAyahChange!(Math.max(ayahRange!.from, ayah! - 1))} disabled={ayah! <= ayahRange!.from} aria-label="الآية السابقة" className="grid size-8 place-items-center rounded-lg text-forest hover:bg-white disabled:opacity-30">
                <Icon name="forward" size={16} />
              </button>
              <span className="text-forest">
                أسأل عن <strong className="num">الآية {toArabicDigits(ayah!)}</strong> من سورة {getSurahMeta(context!.surah!)?.nameAr}
              </span>
              <button type="button" onClick={() => onAyahChange!(Math.min(ayahRange!.to, ayah! + 1))} disabled={ayah! >= ayahRange!.to} aria-label="الآية التالية" className="grid size-8 place-items-center rounded-lg text-forest hover:bg-white disabled:opacity-30">
                <Icon name="back" size={16} />
              </button>
            </div>
          ) : null}
          <AIChat key={`${context?.surah ?? 0}:${context?.ayah ?? 0}`} variant="sheet" context={context} onClearContext={onClearContext} className="flex-1 min-h-0" />
        </div>
      </dialog>
  );
}
