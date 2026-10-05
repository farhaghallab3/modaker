"use client";

import { useState } from "react";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { StoryCard } from "@/components/stories/StoryCard";
import { EmptyState } from "@/components/ui/primitives";
import { STORIES } from "@/content/stories";
import { getSurahMeta } from "@/lib/quran/surahs";
import { FilterChips } from "@/features/shared/FilterChips";

const FEATURED = "yusuf";
const SURAH_FILTERS = [...new Set(STORIES.flatMap((s) => s.surahs))].sort((a, b) => a - b);

export function StoriesScreen() {
  const [surah, setSurah] = useState<number | null>(null);

  const visible = STORIES.filter((s) => surah == null || s.surahs.includes(surah));
  const featured = visible.find((s) => s.slug === FEATURED);
  const rest = visible.filter((s) => s.slug !== FEATURED);

  return (
    <Page>
      <PageHeader
        eyebrow="افهم"
        title="قصص القرآن"
        description="اقرأ القصة فصلًا فصلًا، مع آياتها من المصحف الموثّق وتفسيرها الميسر — ثم احفظ المقطع الذي أحببته."
      />

      <FilterChips
        label="تصفية حسب السورة"
        value={surah}
        onChange={setSurah}
        options={[{ value: null, label: "كل القصص" }, ...SURAH_FILTERS.map((n) => ({ value: n, label: `سورة ${getSurahMeta(n)?.nameAr}` }))]}
        className="mb-8"
      />

      {featured ? (
        <div className="mb-10 animate-rise">
          <StoryCard story={featured} featured />
        </div>
      ) : null}

      {rest.length ? (
        <section aria-labelledby="more-stories">
          <h2 id="more-stories" className="sr-only">
            قصص أخرى
          </h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((s) => (
              <li key={s.slug}>
                <StoryCard story={s} />
              </li>
            ))}
          </ul>
        </section>
      ) : !featured ? (
        <EmptyState icon="scroll" title="لا قصص لهذه السورة بعد" body="نضيف قصصًا جديدة تباعًا بعد مراجعتها علميًا." />
      ) : null}

      <p className="mt-12 border-t hairline pt-5 text-xs leading-6 text-muted max-w-2xl">
        المقدمات وملخصات الفصول محتوى تحريري تجريبي يحتاج مراجعة علمية قبل النشر، وليست تفسيرًا. نص الآيات من المصحف الموثّق، والتفسير من
        التفسير الميسر.
      </p>
    </Page>
  );
}
