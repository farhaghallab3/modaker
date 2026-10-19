/**
 * Session Coach — the DETERMINISTIC half. Everything factual about today's session is computed here from the
 * learner's real persisted state; the AI (src/server/coach) may only phrase a short Arabic message and choose
 * among the actions computed below. Pure: used by the dashboard (to compute facts) and by the server (to validate
 * the model's answer and to write the template fallback).
 *
 * What the model receives (`coachInput`): counts, surah names, ayah NUMBERS and ranges — never Quran text, never
 * names/emails, never audio, never history beyond a few counters.
 */
import { getSurahMeta, toArabicDigits } from "@/lib/quran/surahs";
import { continuation } from "@/lib/review/learning";
import { ayahCountLabel, rangeLabel } from "@/lib/review/labels";
import type { UserState } from "@/lib/store/state";
import { memorizedCount, reviewQueue, streakDays, today, todaysWird, weakAyahs, lastNDays } from "@/lib/store/selectors";

export type CoachActionId = "fix-weak" | "review" | "memorize" | "recite" | "read";
export type CoachOrder = "weak-first" | "review-first" | "memorize-first" | "all-clear";

export interface CoachRange {
  surah: number;
  surahName: string;
  from: number;
  to: number;
}

export interface CoachAction {
  id: CoachActionId;
  label: string;
  /** resolved on the device from the learner's own state; never produced by the model */
  href: string;
}

export interface CoachFacts {
  /** where "continue" points (derived, not a stale pointer) */
  resume: { surah: number; surahName: string; ayah: number } | null;
  /** today's NEW memorization portion */
  wird: CoachRange | null;
  wirdDone: boolean;
  memorizedAyahs: number;
  /** reviews due today (weak ones included) */
  due: { ranges: number; ayahs: number; items: (CoachRange & { weak: boolean })[] };
  /** ayahs whose latest outcome needs work (total) and the due weak ranges */
  weak: { ayahs: number; dueRanges: number; items: CoachRange[] };
  lastRecitation: {
    daysAgo: number;
    range: CoachRange;
    mastered: number;
    needsReview: number;
    uncertain: number;
    practice: boolean;
  } | null;
  activity: { activeDaysLast7: number; streakDays: number; reviewedToday: number; memorizedToday: number };
  /** the deterministic recommendation */
  order: CoachOrder;
  recommended: CoachActionId[];
  /** every action the coach may point to (with device-side hrefs) */
  actions: CoachAction[];
}

/** What the LLM sees and what the endpoint accepts: the facts WITHOUT hrefs. */
export type CoachInput = Omit<CoachFacts, "actions"> & { actions: { id: CoachActionId; label: string }[] };

const ACTION_LABEL: Record<CoachActionId, string> = {
  "fix-weak": "راجع المواضع المتعثّرة",
  review: "ابدأ المراجعة",
  memorize: "أكمل الحفظ",
  recite: "سمّع ما حفظت",
  read: "افتح المصحف",
};

function range(surah: number, from: number, to: number): CoachRange {
  return { surah, surahName: getSurahMeta(surah)?.nameAr ?? "", from, to };
}

const reciteReview = (r: { surah: number; from: number; to: number }) => `/recite?surah=${r.surah}&from=${r.from}&to=${r.to}&mode=review`;

export function buildCoachFacts(s: UserState, now = new Date()): CoachFacts {
  const cont = continuation(s);
  const resumePos = cont.kind === "continue" ? { surah: cont.surah, ayah: cont.ayah } : cont.kind === "complete" ? cont.next : null;
  const resume = resumePos ? { surah: resumePos.surah, surahName: getSurahMeta(resumePos.surah)?.nameAr ?? "", ayah: resumePos.ayah } : null;

  const w = todaysWird(s);
  const act = today(s, now);
  const target = s.profile?.dailyTargetAyahs ?? s.goals.dailyAyahs;
  const wirdDone = !w || act.memorized >= target;

  const queue = reviewQueue(s, now).filter((r) => r.bucket === "today" || r.bucket === "weak");
  const dueItems = queue.slice(0, 3).map((r) => ({ ...range(r.surah, r.from, r.to), weak: r.bucket === "weak" }));
  const weakQueue = queue.filter((r) => r.bucket === "weak");
  const nonWeakQueue = queue.filter((r) => r.bucket !== "weak");

  const memorized = memorizedCount(s);
  const rec = s.recitations[0];
  const lastRecitation = rec
    ? {
        daysAgo: Math.max(0, Math.round((now.getTime() - new Date(rec.at).getTime()) / 86_400_000)),
        range: range(rec.surah, rec.from, rec.to),
        mastered: rec.mastered,
        needsReview: rec.needsReview,
        uncertain: rec.uncertain ?? 0,
        practice: !!rec.practice,
      }
    : null;

  const order: CoachOrder = weakQueue.length ? "weak-first" : nonWeakQueue.length ? "review-first" : w && !wirdDone ? "memorize-first" : "all-clear";

  const memorizeNext: CoachActionId | null = w && !wirdDone ? "memorize" : null;
  const afterwards: CoachActionId = memorized > 0 ? "recite" : "read";
  const recommended: CoachActionId[] =
    order === "weak-first"
      ? ["fix-weak", nonWeakQueue.length ? "review" : (memorizeNext ?? afterwards)]
      : order === "review-first"
        ? ["review", memorizeNext ?? afterwards]
        : order === "memorize-first"
          ? ["memorize", afterwards]
          : [afterwards, "read"];

  const actions: CoachAction[] = [];
  const add = (id: CoachActionId, href: string) => actions.push({ id, label: ACTION_LABEL[id], href });
  if (weakQueue.length) add("fix-weak", reciteReview(weakQueue[0]));
  if (nonWeakQueue.length) add("review", reciteReview(nonWeakQueue[0]));
  if (w) add("memorize", `/memorize/${w.surah}?from=${w.from}&to=${w.to}`);
  if (memorized > 0) add("recite", "/recite");
  add("read", resume ? `/quran/${resume.surah}` : "/quran");

  const dedup = [...new Set(recommended)].filter((id) => actions.some((a) => a.id === id));
  const week = lastNDays(s, 7, now);

  return {
    resume,
    wird: w ? range(w.surah, w.from, w.to) : null,
    wirdDone,
    memorizedAyahs: memorized,
    due: { ranges: queue.length, ayahs: queue.reduce((n, r) => n + (r.to - r.from + 1), 0), items: dueItems },
    weak: {
      ayahs: weakAyahs(s).length,
      dueRanges: weakQueue.length,
      items: weakQueue.slice(0, 3).map((r) => range(r.surah, r.from, r.to)),
    },
    lastRecitation,
    activity: {
      activeDaysLast7: week.filter((d) => d.memorized + d.reviewed + d.recitations > 0).length,
      streakDays: streakDays(s, now),
      reviewedToday: act.reviewed,
      memorizedToday: act.memorized,
    },
    order,
    recommended: dedup.length ? dedup : ["read"],
    actions,
  };
}

/** The model's input: the facts without hrefs. */
export function coachInput(f: CoachFacts): CoachInput {
  return { ...f, actions: f.actions.map(({ id, label }) => ({ id, label })) };
}

// ── deterministic template (also the fallback when the AI is unavailable) ───────────────────────

function reviewsLabel(n: number): string {
  if (n === 1) return "مراجعة واحدة";
  if (n === 2) return "مراجعتان";
  return n >= 3 && n <= 10 ? `${toArabicDigits(n)} مراجعات` : `${toArabicDigits(n)} مراجعة`;
}

/** Gender-neutral on purpose: we do not know whether the learner is a man or a woman. */
export function templateMessage(f: CoachFacts): string {
  const where = f.resume ? `وصلنا إلى سورة ${f.resume.surahName}، الآية ${toArabicDigits(f.resume.ayah)}.` : "";
  const next = f.wird && !f.wirdDone ? `ثم نكمل الحفظ من الآية ${toArabicDigits(f.wird.from)}.` : "ثم نسمّع ما حفظنا.";
  switch (f.order) {
    case "weak-first": {
      const n = f.weak.dueRanges;
      return `${where} عندنا ${reviewsLabel(n)} في مواضع تعثّرنا فيها، فنبدأ بها لنثبّتها ${next}`.trim();
    }
    case "review-first":
      return `${where} عندنا ${reviewsLabel(f.due.ranges)} مستحقة اليوم، فالأفضل نثبّتها أولًا ${next}`.trim();
    case "memorize-first":
      return `${where} لا مراجعات مستحقة الآن، فنكمل الحفظ: ورد اليوم ${rangeLabel(f.wird!.from, f.wird!.to)} من سورة ${f.wird!.surahName}.`.trim();
    default:
      return f.memorizedAyahs
        ? `لا شيء عاجل اليوم${f.activity.streakDays >= 2 ? `، وأنت مداوم منذ ${toArabicDigits(f.activity.streakDays)} أيام` : ""}. نسمّع ما حفظنا لنثبّته، أو نقرأ من المصحف.`
        : "لنبدأ رحلتنا: نختار سورة من المصحف ثم نحفظ أول مقطع منها.";
  }
}

export { ayahCountLabel };
