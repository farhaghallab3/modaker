"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, cn, ProgressRing, Segmented } from "@/components/ui/primitives";
import { toArabicDigits } from "@/lib/quran/surahs";
import { ayahCountLabel, percentLabel } from "@/lib/review/labels";
import type { AyahRecitationResult, MistakeType, RecitationAnalysis, RecitationMistake } from "@/lib/types";

/** Persistent honesty note: text matching only, no tajweed assessment. */
export function TextOnlyNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs leading-6 text-muted", className)}>
      <Icon name="info" size={15} className="mt-1 text-olive" />
      يقارن مُدّكِر الكلمات المنطوقة بالنص الموثّق؛ لا يقيّم أحكام التجويد.
    </p>
  );
}

const MISTAKE_META: Record<MistakeType, { label: string; icon: IconName; tone: string }> = {
  omitted: { label: "كلمة ناقصة", icon: "minus", tone: "bg-sand-100 text-sand-700" },
  added: { label: "كلمة زائدة", icon: "plus", tone: "bg-parchment text-ink/70" },
  incorrect: { label: "كلمة مختلفة", icon: "x", tone: "bg-terracotta-50 text-terracotta" },
  order: { label: "ترتيب الآيات", icon: "layers", tone: "bg-olive-100 text-olive-600" },
  hesitation: { label: "توقف طويل", icon: "clock", tone: "bg-parchment text-muted" },
};

function encouragement(acc: number) {
  if (acc >= 0.95) return "ما شاء الله، تسميع متقن. ثبّتك الله.";
  if (acc >= 0.8) return "أحسنت، بقيت مواضع يسيرة تستحق نظرة.";
  if (acc >= 0.5) return "بداية طيبة. راجع المواضع المظلّلة ثم أعد المحاولة.";
  return "لا بأس، الحفظ يثبت بالتكرار. استمع للآيات ثم أعد المحاولة.";
}

/**
 * Result of a recitation: overall accuracy, per-ayah word highlighting
 * (words come from `analysis.ayahs[i].words[].text`, i.e. tokens of the
 * verified text), mistake chips and the follow-up actions.
 */
export function RecitationFeedback({
  analysis,
  actions,
  note,
}: {
  analysis: RecitationAnalysis;
  /** action bar (save / retry / listen) rendered by the screen */
  actions?: ReactNode;
  /** small extra line under the summary (e.g. "حُللت على جهازك") */
  note?: ReactNode;
}) {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const mastered = analysis.ayahs.filter((a) => a.status === "mastered").length;
  const needs = analysis.ayahs.length - mastered;
  const shown = filter === "all" ? analysis.ayahs : analysis.ayahs.filter((a) => a.status !== "mastered" || a.mistakes.length);
  const acc = analysis.accuracy;

  return (
    <div className="space-y-6">
      {/* ── Summary ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="fb-title"
        className="relative overflow-hidden rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 px-5 py-6 sm:px-8 sm:py-8 animate-rise"
      >
        <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.07]" />
        <div className="relative flex flex-col sm:flex-row items-center gap-6 text-center sm:text-start">
          <ProgressRing value={acc} size={124} stroke={8} tone={acc >= 0.8 ? "olive" : "sand"} label="دقة التسميع">
            <span className="font-display text-[2.1rem] leading-none text-forest num">{percentLabel(acc)}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <h2 id="fb-title" className="font-display text-3xl text-forest">
              دقة التسميع {percentLabel(acc)}
            </h2>
            <p className="mt-1.5 text-[0.95rem] leading-7 text-ink/75" aria-live="polite">
              {encouragement(acc)}
            </p>
            <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-olive-100 px-3.5 py-1.5 text-sm text-olive-600">
                <Icon name="checkCircle" size={16} />
                متقن {ayahCountLabel(mastered)}
              </span>
              {needs ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-sand-100 px-3.5 py-1.5 text-sm text-sand-700">
                  <Icon name="review" size={16} />
                  تحتاج مراجعة {ayahCountLabel(needs)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="relative mt-5 border-t border-sand/25 pt-4 space-y-1">
          <TextOnlyNote />
          {note}
        </div>
      </section>

      {/* ── Legend + filter ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="مفتاح الألوان">
          <li className="inline-flex items-center gap-1.5">
            <span className="w-5 border-b-2 border-terracotta" aria-hidden /> كلمة مختلفة
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="w-5 h-3.5 rounded border border-dashed border-sand" aria-hidden /> كلمة لم تُقرأ
          </li>
        </ul>
        {needs && mastered ? (
          <Segmented
            label="عرض الآيات"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "كل الآيات" },
              { value: "issues", label: "مواضع المراجعة" },
            ]}
          />
        ) : null}
      </div>

      {/* ── Per-ayah ────────────────────────────────────────────── */}
      <ol className="space-y-3">
        {shown.map((a, i) => (
          <li key={a.key} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <AyahResult result={a} />
          </li>
        ))}
      </ol>

      {analysis.extraWords.length ? (
        <p className="text-xs text-muted">
          كلمات سُمعت ولم نجد لها موضعًا في الآيات:{" "}
          <span className="text-ink/70">{analysis.extraWords.slice(0, 12).join("، ")}</span>
        </p>
      ) : null}

      {actions}
    </div>
  );
}

function AyahResult({ result }: { result: AyahRecitationResult }) {
  const n = toArabicDigits(result.ayah);
  const hesitationAt = useMemo(() => {
    const m = new Map<number, number>();
    for (const x of result.mistakes) if (x.type === "hesitation" && x.wordIndex != null) m.set(x.wordIndex, x.pauseSec ?? 0);
    return m;
  }, [result.mistakes]);
  const statusBadge =
    result.status === "mastered" ? (
      <Badge tone="olive">
        <Icon name="check" size={12} /> متقنة
      </Badge>
    ) : result.status === "needs-review" ? (
      <Badge tone="sand">تحتاج مراجعة</Badge>
    ) : (
      <Badge tone="terracotta">لم تُسمَّع بعد</Badge>
    );

  return (
    <article
      aria-label={`نتيجة الآية ${n}`}
      className={cn(
        "rounded-[var(--radius-card)] ring-1 px-4 py-3.5 sm:px-5",
        result.status === "mastered" ? "bg-white/60 ring-line" : "bg-white ring-sand/40",
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-forest">الآية {n}</span>
        {statusBadge}
        <span className="ms-auto text-xs text-muted num">{percentLabel(result.accuracy)}</span>
      </header>

      <p lang="ar" dir="rtl" className="quran-text mt-1">
        {result.words.map((w, i) => (
          <span key={i}>
            {hesitationAt.has(i) ? (
              <span className="inline-block align-middle mx-1 text-[0.5em] text-muted" title="توقف طويل قبل هذه الكلمة">
                <Icon name="clock" size={14} />
                <span className="sr-only">توقف طويل</span>
              </span>
            ) : null}
            <Word word={w} />
            {i < result.words.length - 1 ? " " : null}
          </span>
        ))}
        <span className="ayah-marker" aria-hidden>
          {n}
        </span>
      </p>

      {result.mistakes.length ? <MistakeChips mistakes={result.mistakes} /> : null}
    </article>
  );
}

function Word({ word }: { word: AyahRecitationResult["words"][number] }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  if (word.state === "ok") return <span>{word.text}</span>;
  if (word.state === "omitted")
    return (
      <span className="rounded-lg border border-dashed border-sand bg-sand-100/40 px-1 text-ink/70">
        {word.text}
        <span className="sr-only"> (لم تُقرأ)</span>
      </span>
    );
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={open ? tipId : undefined}
        aria-label={`${word.text} — سُمِع: ${word.heard ?? "؟"}`}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="underline decoration-terracotta decoration-2 underline-offset-[0.45em] rounded-md hover:bg-terracotta-50 focus-visible:bg-terracotta-50"
      >
        {word.text}
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute bottom-full start-1/2 z-20 mb-1 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-xl bg-forest px-3 py-1.5 font-sans text-xs leading-5 text-cream shadow-[var(--shadow-lift)] animate-rise"
        >
          سُمِع: «{word.heard ?? "؟"}»
        </span>
      ) : null}
    </span>
  );
}

function MistakeChips({ mistakes }: { mistakes: RecitationMistake[] }) {
  const groups = useMemo(() => {
    const g = new Map<MistakeType, RecitationMistake[]>();
    for (const m of mistakes) g.set(m.type, [...(g.get(m.type) ?? []), m]);
    return [...g.entries()];
  }, [mistakes]);
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="الملاحظات">
      {groups.map(([type, ms]) => {
        const meta = MISTAKE_META[type];
        let detail = "";
        if (type === "hesitation") {
          const longest = Math.max(...ms.map((m) => m.pauseSec ?? 0));
          detail = `${toArabicDigits(longest.toFixed(1).replace(".", "٫"))} ث`;
        } else if (type === "added") {
          detail = ms
            .map((m) => m.heard)
            .filter(Boolean)
            .slice(0, 3)
            .map((h) => `«${h}»`)
            .join(" ");
        }
        return (
          <li key={type} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", meta.tone)}>
            <Icon name={meta.icon} size={13} />
            {meta.label}
            {detail ? <span className="opacity-80">{detail}</span> : null}
            {ms.length > 1 && type !== "hesitation" && type !== "order" ? <span className="num opacity-80">×{toArabicDigits(ms.length)}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
