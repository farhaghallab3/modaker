"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { SurahCard } from "@/components/quran/SurahCard";
import { Icon } from "@/components/ui/Icon";
import { Button, ButtonLink, EmptyState, inputClass, Segmented } from "@/components/ui/primitives";
import { normalizeArabic } from "@/lib/quran/normalize";
import { getSurahMeta, SURAHS, toArabicDigits } from "@/lib/quran/surahs";
import { ayahCountLabel } from "@/lib/review/labels";
import { useApp } from "@/lib/store/AppProvider";
import { surahProgress } from "@/lib/store/selectors";
import type { SurahMeta } from "@/lib/types";

type Filter = "all" | "meccan" | "medinan" | "progress";

const LATIN_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };

/** Search key for Arabic names: normalized, without "سورة" and leading "ال". */
function arKey(s: string) {
  return normalizeArabic(s)
    .replace(/^سوره\s+/, "")
    .replace(/(^|\s)ال/g, "$1")
    .replace(/\s+/g, "");
}
function enKey(s: string) {
  return s.toLowerCase().replace(/^(al|an|ar|as|ash|at|ad|adh|az)[-\s]/, "").replace(/[^a-z]/g, "");
}

export function matchesSurah(meta: SurahMeta, raw: string): boolean {
  const q = raw.trim();
  if (!q) return true;
  const digits = q.replace(/[٠-٩]/g, (d) => LATIN_DIGITS[d]);
  if (/^\d+$/.test(digits)) return String(meta.number).startsWith(digits);
  if (/[a-z]/i.test(q)) {
    const k = enKey(q);
    return !!k && (enKey(meta.nameEn).includes(k) || meta.nameEn.toLowerCase().includes(q.toLowerCase()));
  }
  const k = arKey(q);
  return !k || arKey(meta.nameAr).includes(k);
}

export function QuranBrowserScreen() {
  const { state } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useDeferredValue(query);

  const rows = useMemo(() => {
    // first not-yet-memorized ayah per surah, for "متابعة"
    const done = new Set(
      Object.values(state.progress)
        .filter((p) => p.status !== "new" && p.status !== "learning")
        .map((p) => p.key),
    );
    return SURAHS.map((meta) => {
      const { memorized, ratio } = surahProgress(state, meta.number);
      let next = 1;
      if (state.resume?.surah === meta.number) next = state.resume.ayah;
      else while (next <= meta.ayahCount && done.has(`${meta.number}:${next}`)) next++;
      const inProgress = (memorized > 0 && ratio < 1) || state.resume?.surah === meta.number;
      return { meta, memorized, inProgress, next: Math.min(next, meta.ayahCount) };
    });
  }, [state]);

  const filtered = rows.filter(
    (r) =>
      (filter === "all" ||
        (filter === "progress" ? r.inProgress : r.meta.revelation === filter)) &&
      matchesSurah(r.meta, q),
  );
  const resume = state.resume;
  const resumeMeta = resume ? getSurahMeta(resume.surah) : undefined;
  const inProgressCount = rows.filter((r) => r.inProgress).length;

  return (
    <Page>
      <PageHeader eyebrow="المصحف" title="سور القرآن الكريم" description="اختر سورة لتقرأها أو تحفظها أو تتأمل معانيها." />

      {resume && resumeMeta ? (
        <section
          aria-label="تابع من حيث توقفت"
          className="relative overflow-hidden rounded-[var(--radius-card)] bg-forest text-cream mb-8 animate-rise"
        >
          <div aria-hidden className="pattern-girih absolute inset-0 opacity-25" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-cream/70">تابع من حيث توقفت</p>
              <p className="mt-1 font-display text-3xl leading-tight">سورة {resumeMeta.nameAr}</p>
              <p className="mt-1 text-sm text-cream/80">
                {resume.mode === "memorize" ? "الحفظ" : resume.mode === "recite" ? "التسميع" : "القراءة"} · الآية {toArabicDigits(resume.ayah)} من{" "}
                {toArabicDigits(resumeMeta.ayahCount)}
              </p>
            </div>
            <div className="flex gap-2">
              <ButtonLink
                href={`/memorize/${resume.surah}?from=${resume.ayah}`}
                variant="onDark"
                className="flex-1 sm:flex-none"
                iconEnd="forward"
              >
                متابعة الحفظ
              </ButtonLink>
              <ButtonLink
                href={`/quran/${resume.surah}#ayah-${resume.ayah}`}
                variant="ghostOnDark"
                icon="mushaf"
              >
                اقرأ
              </ButtonLink>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Search + filter ─────────────────────────────────────── */}
      <div className="sticky top-14 lg:top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 py-3 bg-paper/90 backdrop-blur mb-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <label htmlFor="surah-search" className="sr-only">
              ابحث عن سورة
            </label>
            <Icon name="search" size={19} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="surah-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم السورة أو رقمها… (الكهف، 18، Kahf)"
              className={`${inputClass} ps-11 pe-10`}
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="مسح البحث"
                className="absolute end-2 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-lg text-muted hover:text-forest hover:bg-parchment"
              >
                <Icon name="x" size={16} />
              </button>
            ) : null}
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <Segmented
              label="تصفية السور"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "الكل" },
                { value: "meccan", label: "مكية" },
                { value: "medinan", label: "مدنية" },
                {
                  value: "progress",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      قيد الحفظ
                      {inProgressCount ? <span className="num text-xs text-olive">{toArabicDigits(inProgressCount)}</span> : null}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {filtered.length ? `${toArabicDigits(filtered.length)} سورة` : "لا نتائج"}
      </p>

      {filtered.length ? (
        <ul className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.meta.number}>
              <SurahCard
                meta={r.meta}
                memorized={r.memorized}
                continueHref={r.inProgress ? `/memorize/${r.meta.number}?from=${r.next}` : undefined}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      ) : filter === "progress" && !q ? (
        <EmptyState
          icon="leaf"
          title="لا سور قيد الحفظ بعد"
          body="ابدأ بسورة قصيرة تحبها؛ سنحفظ موضعك ونذكّرك بالمراجعة."
          action={
            <ButtonLink href="/memorize/1?from=1" icon="leaf">
              ابدأ بسورة الفاتحة
            </ButtonLink>
          }
        />
      ) : (
        <EmptyState
          icon="search"
          title="لا توجد سورة بهذا الاسم"
          body={
            <>
              جرّب كتابة الاسم دون «ال» أو برقم السورة.{" "}
              {filter !== "all" ? "أو ابحث في كل السور." : null}
            </>
          }
          action={
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              عرض كل السور
            </Button>
          }
        />
      )}

      {!q && filter === "all" ? (
        <p className="mt-8 text-center text-xs text-muted">
          ١١٤ سورة · {ayahCountLabel(6236)} ·{" "}
          <Link href="/review" className="underline underline-offset-4 hover:text-forest">
            مراجعاتك
          </Link>
        </p>
      ) : null}
    </Page>
  );
}
