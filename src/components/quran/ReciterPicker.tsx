"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cn, inputClass, Modal } from "@/components/ui/primitives";
import { RECITERS, STYLE_LABEL, setReciterId, useReciter, type Reciter, type RecitationStyle } from "@/lib/quran/reciters";

/** Arabic search that ignores vowel marks and the usual spelling differences (أ/إ/آ/ا، ة/ه، ى/ي). */
function norm(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The first letter of the reciter's family name, for the round badge. */
function initial(r: Reciter): string {
  const words = r.name.split(" ").filter((w) => !["عبد", "أبو", "بن", "بو"].includes(w));
  const last = words[words.length - 1] ?? r.name;
  return last.replace(/^ال/, "").charAt(0);
}

const GROUPS: { style: RecitationStyle; title: string }[] = [
  { style: "murattal", title: "مرتّل" },
  { style: "mujawwad", title: "مجوّد" },
  { style: "muallim", title: "المعلّم" },
];

/**
 * Choosing the reciter: a button with the current reciter, opening a list in the app's own style
 * (search by name, grouped by recitation style, the current one marked). The choice is remembered on this device.
 */
export function ReciterPicker({ className }: { className?: string }) {
  const reciter = useReciter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchId = useId();
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    // show the current reciter in the middle of the list
    requestAnimationFrame(() => selectedRef.current?.scrollIntoView({ block: "center" }));
  }, [open]);

  const groups = useMemo(() => {
    const nq = norm(q);
    const hits = RECITERS.filter((r) => !nq || norm(r.name).includes(nq));
    return GROUPS.map((g) => ({ ...g, list: hits.filter((r) => r.style === g.style) })).filter((g) => g.list.length);
  }, [q]);

  const choose = (r: Reciter) => {
    setReciterId(r.id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "group flex w-full min-w-0 items-center gap-3 rounded-2xl bg-white px-3 py-2 text-start ring-1 ring-inset ring-line transition-shadow hover:ring-olive/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-olive",
          className,
        )}
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-olive-100 font-display text-lg text-forest">
          {initial(reciter)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.7rem] text-muted">القارئ</span>
          <span className="block truncate text-sm font-medium text-forest">
            {reciter.name}
            {reciter.style !== "murattal" ? <span className="ms-1.5 text-xs font-normal text-olive">({STYLE_LABEL[reciter.style]})</span> : null}
          </span>
        </span>
        <span className="shrink-0 text-xs text-olive group-hover:text-forest">تغيير</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="اختر القارئ" size="lg">
        <label htmlFor={searchId} className="sr-only">
          ابحث عن قارئ
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-muted">
            <Icon name="search" size={17} />
          </span>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث باسم القارئ"
            className={cn(inputClass, "h-11 ps-10")}
          />
        </div>
        <p className="mt-2 text-xs text-muted">كل القرّاء هنا تُسمع تلاوتهم متصلة، آية بعد آية بلا انقطاع.</p>

        <div className="mt-3 max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain -mx-2 px-2">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">لا يوجد قارئ بهذا الاسم.</p>
          ) : (
            groups.map((g) => (
              <section key={g.style} aria-label={g.title} className="mb-3 last:mb-0">
                {groups.length > 1 || g.style !== "murattal" ? (
                  <h3 className="sticky top-0 z-10 bg-paper/95 py-1.5 text-xs font-semibold text-olive backdrop-blur">{g.title}</h3>
                ) : null}
                <ul className="grid gap-1 sm:grid-cols-2">
                  {g.list.map((r) => {
                    const on = r.id === reciter.id;
                    return (
                      <li key={r.id}>
                        <button
                          ref={on ? selectedRef : undefined}
                          type="button"
                          onClick={() => choose(r)}
                          aria-pressed={on}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-start transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-olive",
                            on ? "bg-forest text-cream" : "hover:bg-olive-100/70 text-ink",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "grid size-9 shrink-0 place-items-center rounded-full font-display text-lg",
                              on ? "bg-cream/15 text-cream" : "bg-olive-100 text-forest",
                            )}
                          >
                            {initial(r)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[0.95rem]">{r.name}</span>
                          {on ? <Icon name="check" size={18} /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}
