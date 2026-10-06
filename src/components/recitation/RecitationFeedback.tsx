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

/** Persistent Beta statement: automated checking can mishear; only confirmed differences are counted. */
export function BetaNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 text-xs leading-6 text-ink/75", className)}>
      <Badge tone="sand">تجريبي · Beta</Badge>
      <span>
        التحقق الآلي من التلاوة ميزة تجريبية وقد يُخطئ أحيانًا في سماع الكلمات. لا نحتسب عليك إلا ما نتأكد منه، وإذا لم نسمعك بوضوح نطلب منك الإعادة بدل الحكم عليك.
      </span>
    </p>
  );
}

const MISTAKE_META: Record<MistakeType, { label: string; icon: IconName; tone: string }> = {
  omitted: { label: "كلمة ناقصة", icon: "minus", tone: "bg-sand-100 text-sand-700" },
  added: { label: "كلمة زائدة", icon: "plus", tone: "bg-parchment text-ink/70" },
  incorrect: { label: "كلمة مختلفة عن النص — راجعها", icon: "x", tone: "bg-terracotta-50 text-terracotta" },
  order: { label: "ترتيب الآيات", icon: "layers", tone: "bg-olive-100 text-olive-600" },
  hesitation: { label: "توقف طويل", icon: "clock", tone: "bg-parchment text-muted" },
  uncertain: { label: "لم نتأكد من هذه الكلمة — أعد هذا الجزء", icon: "info", tone: "bg-sand-100 text-sand-700" },
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
  const unsure = analysis.ayahs.filter((a) => a.status === "uncertain").length;
  const needs = analysis.ayahs.length - mastered - unsure;
  const shown = filter === "all" ? analysis.ayahs : analysis.ayahs.filter((a) => a.status !== "mastered" || a.mistakes.length);
  const acc = analysis.expectedWords ? analysis.matchedWords / analysis.expectedWords : 0;
  const notHeard = analysis.recognition !== "good";
  const practiceOnly = !notHeard && !analysis.learningEligible;

  return (
    <div className="space-y-6">
      <HeardPanel analysis={analysis} />

      {notHeard ? (
        <section role="alert" className="rounded-[var(--radius-card)] bg-sand-100/70 ring-1 ring-sand/40 px-5 py-6 animate-rise">
          <h2 className="font-display text-3xl text-forest">لم نسمع تلاوتك بوضوح كافٍ للحكم عليها</h2>
          <p className="mt-2 text-[0.95rem] leading-7 text-ink/80">
            لن نحتسب عليك شيئًا من هذه المحاولة، ولن يتغيّر تقدّمك ولا مراجعاتك. اقترب من الميكروفون، واختر مكانًا هادئًا، وتلُ بصوت واضح ثم أعد التسميع. إن تكرّر ذلك فقد يكون الخلل في تعرّف الصوت لا في تلاوتك.
          </p>
          <div className="mt-4 space-y-1.5">
            <BetaNote />
            <TextOnlyNote />
          </div>
        </section>
      ) : (
        <>
      {/* ── Summary ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="fb-title"
        className="relative overflow-hidden rounded-[var(--radius-card)] bg-cream ring-1 ring-sand/25 px-5 py-6 sm:px-8 sm:py-8 animate-rise"
      >
        <div aria-hidden className="pattern-girih absolute inset-0 opacity-[0.07]" />
        <div className="relative flex flex-col sm:flex-row items-center gap-6 text-center sm:text-start">
          <ProgressRing value={acc} size={124} stroke={8} tone={acc >= 0.8 ? "olive" : "sand"} label="تطابق الكلمات مع النص">
            <span className="font-display text-[2.1rem] leading-none text-forest num">{percentLabel(acc)}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <h2 id="fb-title" className="font-display text-3xl text-forest">
              تطابقت {toArabicDigits(analysis.matchedWords)} من {toArabicDigits(analysis.expectedWords)} كلمة
            </h2>
            <p className="mt-1.5 text-[0.95rem] leading-7 text-ink/75" aria-live="polite">
              {analysis.uncertainWords > 0 ? "لم نتأكد من بعض الكلمات، فلا نحكم على تلاوتك فيها. أعد الجزء المظلّل بخط منقّط." : encouragement(acc)}
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
              {unsure ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-parchment px-3.5 py-1.5 text-sm text-ink/75 ring-1 ring-sand/40">
                  <Icon name="info" size={16} />
                  لم نتأكد من {ayahCountLabel(unsure)} — أعد الجزء
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="relative mt-5 border-t border-sand/25 pt-4 space-y-1.5">
          <BetaNote />
          <TextOnlyNote />
          {practiceOnly ? (
            <p className="flex items-start gap-2 text-xs leading-6 text-ink/75">
              <Icon name="info" size={15} className="mt-1 text-sand-700" />
              تسميع تدريبي: لم نتحقق بعدُ من دقّة هذا النوع من التعرّف على الصوت، لذلك يظهر لك التحليل لكنه لا يغيّر تقدّمك ولا مراجعاتك.
            </p>
          ) : null}
          {analysis.uncertainWords > 0 ? (
            <p className="flex items-start gap-2 text-xs leading-6 text-ink/75">
              <Icon name="info" size={15} className="mt-1 text-sand-700" />
              لم نتأكد من {toArabicDigits(analysis.uncertainWords)} {analysis.uncertainWords === 1 ? "كلمة" : analysis.uncertainWords <= 10 ? "كلمات" : "كلمة"} — قد يكون الخلل في تعرّف الصوت لا في تلاوتك، لذلك لم تُحتسب عليك. أعد هذا الجزء للتأكد.
            </p>
          ) : null}
          {note}
        </div>
      </section>

      {/* ── Legend + filter ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="مفتاح الألوان">
          <li className="inline-flex items-center gap-1.5">
            <span className="w-5 border-b-2 border-terracotta" aria-hidden /> كلمة مختلفة (مؤكَّدة)
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="w-5 h-3.5 rounded border border-dashed border-sand" aria-hidden /> كلمة لم تُقرأ
          </li>
          {analysis.uncertainWords > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <span className="w-5 border-b-2 border-dotted border-sand-700" aria-hidden /> لم نتأكد
            </li>
          ) : null}
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

      {/* ── Per-ayah: the COMPARISON with the verified text (separate from what was heard, above) ───── */}
      <h3 className="text-sm font-semibold text-forest">المقارنة بالنص الموثّق</h3>
      <ol className="space-y-3">
        {shown.map((a, i) => (
          <li key={a.key} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <AyahResult result={a} />
          </li>
        ))}
      </ol>

      {analysis.extraWords.length ? (
        <p className="text-xs text-muted">
          كلمات سُمعت ولم نجد لها موضعًا في الآيات (للعلم فقط، لا تُحتسب):{" "}
          <span className="text-ink/70">{analysis.extraWords.slice(0, 12).join("، ")}</span>
        </p>
      ) : null}
        </>
      )}

      {actions}
    </div>
  );
}

/**
 * What the speech recognizer heard — verbatim. Kept visually and conceptually separate from the comparison with
 * the Quran text below: the expected text never alters this transcript.
 */
function HeardPanel({ analysis }: { analysis: RecitationAnalysis }) {
  const text = analysis.transcript.text.trim();
  return (
    <section aria-labelledby="heard-title" className="rounded-[var(--radius-card)] bg-white/70 ring-1 ring-line px-5 py-4">
      <h3 id="heard-title" className="flex items-center gap-2 text-sm font-semibold text-forest">
        <Icon name="volume" size={16} className="text-olive" />
        ما سمعه التعرّف على الكلام
      </h3>
      <p lang="ar" dir="rtl" className="mt-1.5 text-lg leading-9 text-ink select-text">
        {text ? <bdi>{text}</bdi> : <span className="text-muted">(لم يُرجع التعرّف نصًّا)</span>}
      </p>
      <p className="mt-1 text-xs leading-6 text-muted">هذا ما أرجعه التعرّف الآلي كما هو، وقد يخطئ أو ينقص. لا نعدّله بالنص القرآني؛ المقارنة بالنص الموثّق تأتي بعده.</p>
    </section>
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
    ) : result.status === "uncertain" ? (
      <Badge tone="muted">لم نتأكد — أعد هذا الجزء</Badge>
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
        <span className="ms-auto text-xs text-muted num">{result.status === "uncertain" ? "—" : percentLabel(result.accuracy)}</span>
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
  const unsure = word.state === "uncertain";
  if (unsure && word.heard === undefined)
    return (
      <span className="rounded-lg border-b-2 border-dotted border-sand-700 bg-sand-100/30 px-0.5 text-ink/80">
        {word.text}
        <span className="sr-only"> (لم نسمعها بوضوح)</span>
      </span>
    );
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
        aria-label={`${word.text} — ${word.heard ? `سُمِع: ${word.heard}` : "لم نسمعها بوضوح"}${unsure ? " — لم نتأكد" : " — قد يكون خطأً في السماع"}`}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn(
          "underline decoration-2 underline-offset-[0.45em] rounded-md",
          unsure
            ? "decoration-dotted decoration-sand-700 hover:bg-sand-100/60 focus-visible:bg-sand-100/60"
            : "decoration-terracotta hover:bg-terracotta-50 focus-visible:bg-terracotta-50",
        )}
      >
        {word.text}
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="absolute bottom-full start-1/2 z-20 mb-1 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap rounded-xl bg-forest px-3 py-1.5 font-sans text-xs leading-5 text-cream shadow-[var(--shadow-lift)] animate-rise"
        >
          {word.heard ? `سُمِع: «${word.heard}»` : "لم نسمع هذه الكلمة بوضوح"}
          {unsure ? " — لم نتأكد، أعد هذا الجزء" : " — قد يكون خطأً في السماع"}
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
