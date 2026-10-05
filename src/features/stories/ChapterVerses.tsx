"use client";

import { useState } from "react";
import { QuranVerse, SourceLine } from "@/components/quran/QuranVerse";
import { Icon } from "@/components/ui/Icon";
import { Button, ButtonLink, ErrorState, LoadingSkeleton } from "@/components/ui/primitives";
import { api, useAsync, useSurah } from "@/lib/api";
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import type { AyahRange } from "@/lib/types";

const PREVIEW = 10;

/** Verified verses for one range + reading/memorizing links + collapsible التفسير الميسر. */
export function ChapterVerses({ range }: { range: AyahRange }) {
  const { data, error, loading, retry } = useSurah(range.surah);
  const [expanded, setExpanded] = useState(false);
  const meta = getSurahMeta(range.surah);

  const ayahs = data?.ayahs.filter((a) => a.ayah >= range.from && a.ayah <= range.to) ?? [];
  const shown = expanded ? ayahs : ayahs.slice(0, PREVIEW);
  const hiddenCount = ayahs.length - shown.length;

  return (
    <div className="space-y-5">
      <div className="relative rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line px-5 sm:px-8 py-6 sm:py-8">
        <p className="mb-3 flex items-center gap-2 text-xs text-olive font-medium">
          <Icon name="mushaf" size={15} />
          سورة {meta?.nameAr} · الآيات {toArabicDigits(range.from)}–{toArabicDigits(range.to)}
        </p>

        {loading ? (
          <div aria-busy="true" aria-label="جارٍ تحميل الآيات" className="space-y-5 py-2">
            {[96, 88, 92, 70].map((w, i) => (
              <div key={i} className="skeleton h-7" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : error || !ayahs.length ? (
          <ErrorState
            icon="shield"
            title="تعذّر تحميل الآيات من المصدر الموثّق"
            body="لا نعرض نص القرآن إلا من مصدر موثّق، لذلك ستظهر الآيات حين يعود المصدر متاحًا."
            onRetry={retry}
          />
        ) : (
          <>
            <p lang="ar" dir="rtl" className="text-start">
              {shown.map((a) => (
                <QuranVerse key={a.key} ayah={a} as="span" />
              ))}
            </p>
            {hiddenCount > 0 ? (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setExpanded(true)}>
                  عرض بقية الآيات ({toArabicDigits(hiddenCount)})
                </Button>
              </div>
            ) : null}
            <div className="mt-5 border-t hairline pt-3">
              <SourceLine title={data!.source.title} url={data!.source.url} />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/memorize/${range.surah}?from=${range.from}&to=${range.to}`} icon="repeat">
          احفظ هذا المقطع
        </ButtonLink>
        <ButtonLink href={`/quran/${range.surah}#ayah-${range.from}`} variant="ghost" icon="mushaf">
          اقرأ في المصحف
        </ButtonLink>
      </div>

      <TafsirBlock range={range} />
    </div>
  );
}

function TafsirBlock({ range }: { range: AyahRange }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="group rounded-[var(--radius-card)] bg-parchment/70"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--radius-card)] px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <Icon name="book" size={18} className="text-olive" />
          <span className="font-medium text-forest">التفسير الميسر</span>
          <span className="text-xs text-muted">للآيات {toArabicDigits(range.from)}–{toArabicDigits(range.to)}</span>
        </span>
        <Icon name={open ? "minus" : "plus"} size={18} className="text-muted" />
      </summary>
      {open ? (
        <div className="px-5 pb-5">
          <TafsirContent range={range} />
        </div>
      ) : null}
    </details>
  );
}

function TafsirContent({ range }: { range: AyahRange }) {
  const { data, error, loading, retry } = useAsync(() => api.tafsir(range.surah), [range.surah]);
  if (loading) return <LoadingSkeleton lines={5} className="py-2" />;
  const entries =
    data?.entries.filter((e) => {
      const ayah = Number(e.key.split(":")[1]);
      return ayah >= range.from && ayah <= range.to;
    }) ?? [];
  if (error || !entries.length) {
    return (
      <ErrorState
        title="التفسير غير متاح الآن"
        body="نعرض التفسير من مصدره المعتمد فقط، وتعذّر الوصول إليه في هذه اللحظة."
        onRetry={retry}
      />
    );
  }
  return (
    <div className="border-t hairline pt-4">
      <dl className="space-y-4">
        {entries.map((e) => (
          <div key={e.key}>
            <dt className="text-xs font-medium text-olive">الآية {toArabicDigits(e.key.split(":")[1])}</dt>
            <dd className="mt-1 text-[0.95rem] leading-8 text-ink/85">{e.text}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <SourceLine
          title={`${data!.source.title}${data!.source.publisher ? ` — ${data!.source.publisher}` : ""}`}
          url={data!.source.url}
        />
      </div>
    </div>
  );
}
