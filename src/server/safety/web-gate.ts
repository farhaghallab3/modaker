/**
 * Who may reach the trusted-web fallback. Deliberately narrow and FAIL-CLOSED: a question must be an ordinary,
 * Level B, general factual question (Islamic history / sirah / people / terminology) that the approved local
 * sources could not answer, and must not read like a ruling, a hadith request, a Quran/tafsir question,
 * a worship-practice or personal question. Anything ambiguous stays on the local path (→ abstention).
 * The router stays authoritative: this only ever NARROWS what it already allowed.
 */
import { normalizeArabic } from "@/lib/quran/normalize";
import type { SafetyLevel } from "@/lib/types";

/** Fragments (normalized, article-less) that mean "ruling / fiqh / hadith / Quran meaning / worship / personal". Matched as word PREFIXES (so names like «الحارث» are not caught by «ارث»). */
const BLOCK_FRAGMENTS = [
  // rulings & permissibility
  "حكم", "يجوز", "جايز", "يحل", "حلال", "حرام", "محرم", "مباح", "مسموح", "ممنوع", "مكروه", "مستحب", "واجب", "فرض", "يصح", "تصح", "يبطل", "تبطل", "ينقض", "ينتقض",
  "يفطر", "يفسد", "ياثم", "اثم", "كفار", "فتو", "افتي", "يلزم", "يجب", "شرعا", "دليل شرع",
  // hadith
  "حديث", "احاديث", "رواه", "روي", "صحيح", "ضعيف", "اسناد", "سند", "تخريج",
  // Quran / tafsir / revelation
  "ايه", "ايات", "تفسير", "نزول", "نزلت", "سوره", "قران", "مصحف", "تلاو", "تجويد",
  // worship practice & personal law
  "صلاه", "صلات", "صيام", "صوم", "زكاه", "حج", "عمره", "وضوء", "طهاره", "غسل", "تيمم", "طلاق", "زواج", "نكاح", "خلع", "ميراث", "ارث", "نذر", "يمين", "ربا", "حيض", "جنابه",
];

/**
 * Positive Islamic anchors: the question must be recognisably about Islam (history, sirah, people, terms). Without one it stays local
 * (→ abstention) — an off-topic question is never sent to a search engine on the strength of the model's own scope check alone.
 * Word PREFIXES, and a few full names of well-known figures (whole-phrase match on the normalized question).
 */
const ANCHOR_PREFIXES = [
  "اسلام", "مسلم", "صحاب", "نبي", "نبو", "انبياء", "رسول", "رسال", "خليف", "خلافه", "غزو", "سريه", "سيره", "هجر", "وحي", "قريش", "امهات المومنين", "ام المومنين",
  "تابع", "فتح", "دعوه", "ايمان", "عقيده", "توحيد", "شهاد", "كعبه", "بعثه", "اسراء", "معراج", "مكه", "المدينه المنوره", "حبشه",
];
const ANCHOR_PHRASES = [
  "ابو بكر", "عمر بن الخطاب", "عثمان بن عفان", "علي بن ابي طالب", "خديجه", "عائشه", "فاطمه الزهراء", "بلال بن رباح", "خالد بن الوليد", "حمزه بن عبد المطلب", "عبد المطلب",
  "ابو طالب", "ابو جهل", "ابو لهب", "عمار بن ياسر", "سميه بنت خياط", "مصعب بن عمير", "سلمان الفارسي", "ابو ذر", "عبد الرحمن بن عوف", "سعد بن ابي وقاص", "صلاح الدين", "طارق بن زياد",
];

/** First-person / family situation markers: a personal case is never a web question. (Not «علي» or «أبي»: they occur in names.) */
const PERSONAL = new Set(["انا", "زوجتي", "زوجي", "امي", "اختي", "اخي", "عندي", "حالتي", "مشكلتي", "ولدي", "بنتي", "ابني"]);

/** word forms to test: as written, without one leading clitic (و ف ب ل ك), and without the article */
function forms(w: string): string[] {
  const out = new Set([w]);
  const c = /^[وفبلك]/.test(w) && w.length > 3 ? w.slice(1) : w;
  out.add(c);
  for (const x of [w, c]) if (x.startsWith("ال") && x.length > 3) out.add(x.slice(2));
  return [...out];
}

export interface WebGateInput {
  question: string;
  level: SafetyLevel;
  intent: string;
  injection: boolean;
  rulingRequest: boolean;
  /** surah/ayah named IN THE QUESTION (not merely on screen) */
  explicitRefs: boolean;
  /** the question was resolved to a mapped Quranic story */
  storyMode: boolean;
}

export function webFallbackEligible(i: WebGateInput): boolean {
  if (i.injection || i.rulingRequest || i.storyMode || i.explicitRefs) return false;
  if (i.level !== "B" || i.intent !== "general") return false;
  const norm = normalizeArabic(i.question);
  const words = norm.split(" ").filter(Boolean);
  const anchored =
    ANCHOR_PHRASES.some((p) => ` ${norm} `.includes(` ${p} `)) ||
    ` ${norm} `.split(" ").some((w) => ANCHOR_PREFIXES.some((p) => !p.includes(" ") && forms(w).some((f) => f.startsWith(p)))) ||
    ANCHOR_PREFIXES.some((p) => p.includes(" ") && norm.includes(p));
  if (!anchored) return false;
  if (words.some((w) => PERSONAL.has(w))) return false;
  for (const w of words) for (const f of forms(w)) for (const frag of BLOCK_FRAGMENTS) if (frag.length <= 3 ? f === frag : f.startsWith(frag)) return false; // short fragments must match the whole word (ربا ≠ رباح)
  return true;
}
