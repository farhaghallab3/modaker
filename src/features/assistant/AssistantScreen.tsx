"use client";

import { useId, useState } from "react";
import { AIChat } from "@/components/assistant/AIChat";
import { Page, PageHeader } from "@/components/layout/PageHeader";
import { useApp } from "@/lib/store/AppProvider";
import { SURAHS, toArabicDigits } from "@/lib/quran/surahs";

/** Full-page assistant with a surah context picker (defaults to where the learner stopped). */
export function AssistantScreen() {
  const { state } = useApp();
  const [surah, setSurah] = useState<number | null>(state.resume?.surah ?? null);
  const id = useId();

  const picker = (
    <div className="flex flex-wrap items-center gap-3 border-b hairline pb-4">
      <label htmlFor={id} className="text-sm text-muted">
        السياق
      </label>
      <select
        id={id}
        value={surah ?? ""}
        onChange={(e) => setSurah(e.target.value ? Number(e.target.value) : null)}
        className="h-10 min-w-48 rounded-xl bg-white ring-1 ring-inset ring-line px-3 text-sm text-forest focus:outline-none focus:ring-2 focus:ring-olive"
      >
        <option value="">بدون سورة محددة</option>
        {SURAHS.map((s) => (
          <option key={s.number} value={s.number}>
            {toArabicDigits(s.number)}. سورة {s.nameAr}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted basis-full sm:basis-auto">يساعد اختيار السورة على فهم أسئلة مثل «اشرح لي هذه الآية».</p>
    </div>
  );

  return (
    <Page narrow>
      <PageHeader
        eyebrow="افهم"
        title="اسأل مُدّكِر"
        description="رفيق يجيبك من التفسير المعتمد والمصحف الموثّق، ويذكر لك مصدر كل إجابة."
      />
      <AIChat context={surah ? { surah } : undefined} header={picker} onClearContext={() => setSurah(null)} />
    </Page>
  );
}
