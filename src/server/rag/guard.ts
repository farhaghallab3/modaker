/**
 * Question classifier (pure, rule-based, unit-tested). Runs BEFORE retrieval
 * or any LLM call so that safety routing never depends on a model.
 *
 *   fatwa        → personal rulings / jurisprudence → fixed "needs-scholar" reply
 *   quran-text   → "show me the verse" → verses from the provider, no LLM
 *   quiz         → memorization quiz built from verified verses
 *   word-meaning → meaning of a word/phrase (grounded in tafsir)
 *   story        → Quranic stories (grounded; curated intros are context only)
 *   explain      → tafsir-style explanation (grounded)
 *   off-topic    → polite redirect, no retrieval
 *   general      → anything else Quran-related (grounded)
 *
 * Patterns run on normalizeArabic() output: no diacritics, أ/إ/آ→ا, ة→ه, ى→ي.
 */
import { normalizeArabic } from "@/lib/quran/normalize";

export type QuestionKind = "fatwa" | "quran-text" | "quiz" | "explain" | "story" | "word-meaning" | "off-topic" | "general";

const n = (s: string) => normalizeArabic(s);
/** Build a regex from normalized alternatives, matched on word boundaries. */
function words(list: string[]): RegExp {
  const alts = list.map((w) => n(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(^|\\s)(?:[وف]?)(?:${alts})(?=\\s|$)`);
}
function phrases(list: string[]): RegExp {
  const alts = list.map((w) => n(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?:${alts})`);
}

// Personal-ruling framings: always a fatwa request.
const FATWA_STRONG = phrases([
  "هل يجوز",
  "يجوز لي",
  "هل يحل",
  "ما حكم",
  "ماحكم",
  "حكم من",
  "هل علي",
  "هل يجب علي",
  "هل يلزمني",
  "هل يصح",
  "هل تصح",
  "هل تبطل",
  "هل يبطل",
  "هل يفسد",
  "هل افطر",
  "هل اثم",
  "هل علي اثم",
  "افتني",
  "افتوني",
  "فتوى",
  "فتوي",
  "استفتاء",
  "اريد فتوى",
  "حكم الشرع",
  "الحكم الشرعي",
  "شرعا",
]);

// Jurisprudence topics: fatwa unless the question is explanatory about a text.
const FATWA_TOPIC = words([
  "حلال",
  "حرام",
  "محرم",
  "مكروه",
  "طلاق",
  "الطلاق",
  "طلقت",
  "طلقني",
  "خلع",
  "ميراث",
  "الميراث",
  "ورث",
  "الورثه",
  "نصيب",
  "زكاه مالي",
  "زكاه",
  "الزكاه",
  "كفاره",
  "الكفاره",
  "نذرت",
  "نذر",
  "يمين",
  "حلفت",
  "صلاتي",
  "صيامي",
  "وضوئي",
  "مفطر",
  "يفطر",
  "ربا",
  "الربا",
  "قرض",
  "فوائد البنك",
  "عقد زواج",
  "الحيض",
  "حائض",
  "الجنابه",
]);

// Explanatory framings about a text — these override FATWA_TOPIC (not FATWA_STRONG).
const EXPLANATORY = phrases([
  "ما معني",
  "معني",
  "ما تفسير",
  "تفسير",
  "فسر",
  "اشرح",
  "شرح",
  "وضح",
  "ما المقصود",
  "المقصود ب",
  "سبب نزول",
  "ما سبب",
  "ما الحكمه",
  "قصه",
  "في سوره",
  "في الايه",
  "ايات",
  "الايات",
]);

// Tajweed "rules" (حكم الإدغام…) are recitation terminology, not fiqh.
const TAJWEED = words(["تجويد", "التجويد", "ادغام", "الادغام", "اخفاء", "الاخفاء", "اظهار", "الاظهار", "اقلاب", "الاقلاب", "المد", "مد", "غنه", "الغنه", "قلقله", "القلقله", "الوقف", "الترقيق", "التفخيم"]);

const QURAN_TEXT = phrases([
  "اعرض الايه",
  "اعرض الايات",
  "اعرض لي",
  "اكتب الايه",
  "اكتب الايات",
  "اكتب لي الايه",
  "اكتب لي الايات",
  "نص الايه",
  "نص الايات",
  "ما نص",
  "اقرا لي",
  "ارني الايه",
  "ارني الايات",
  "اعطني الايه",
  "اعطني نص",
  "اريد نص",
  "هات الايه",
  "هات الايات",
]);

const QUIZ = words([
  "اختبرني", "اختبر حفظي", "اختبار حفظ", "اختبار تسميع", "اعمل لي اختبار", "اعطني اختبار", "اريد اختبار",
  "امتحني", "امتحن حفظي", "سمع لي", "سمعني", "تسميع", "اسالني", "راجع معي", "كويز",
]);

const WORD_MEANING = phrases(["معني كلمه", "معني لفظ", "ما معني كلمه", "معاني الكلمات", "معاني المفردات", "مفردات", "غريب القران", "معني مفرده", "ما معني لفظه"]);

const STORY = phrases(["قصه", "قصص", "ماذا حدث", "ما الذي حدث", "ماذا جري", "حكايه", "ما حدث"]);

const EXPLAIN = phrases(["ما معني", "معني", "ما تفسير", "تفسير", "فسر", "اشرح", "وضح", "ما المقصود", "لماذا", "سبب نزول", "ما الحكمه", "ما الدرس", "ما الفوايد", "فوايد", "عبر", "دروس"]);

// Religious/Quranic markers: if present, never off-topic.
const RELIGIOUS = phrases([
  "سوره", "ايه", "ايات", "قران", "القران", "مصحف", "تفسير", "تجويد", "حفظ", "الحفظ", "تلاوه", "النبي", "الرسول",
  "الله", "نبي", "انبياء", "صحابه", "الصحابه", "رسول", "اسلام", "الاسلام", "دين", "صلاه", "الصلاه", "دعاء", "حديث", "قصه",
]);

const OFF_TOPIC = phrases([
  "برمجه", "برمجيات", "كود", "جافا", "بايثون", "javascript", "python", "react", "sql", "html", "css",
  "كره القدم", "كره السله", "مباراه", "الدوري", "ريال مدريد", "برشلونه", "فيلم", "افلام", "مسلسل", "اغنيه", "اغاني",
  "الطقس", "سعر الدولار", "البورصه", "الاسهم", "بيتكوين", "عملات رقميه", "وصفه طبخ", "طبخ", "سياره", "سيارات",
  "رجيم", "تخسيس", "لعبه", "العاب", "football", "movie", "weather", "stock", "recipe",
]);

export function classifyQuestion(question: string): QuestionKind {
  const raw = question.toLowerCase();
  const q = ` ${n(question)} `;

  // 1. Fatwa (most important — must never be answered by retrieval/LLM).
  const tajweed = TAJWEED.test(q);
  if (FATWA_STRONG.test(q) && !tajweed) return "fatwa";
  if (FATWA_TOPIC.test(q) && !EXPLANATORY.test(q) && !tajweed) return "fatwa";

  // 2. Deterministic, non-generative intents.
  if (QURAN_TEXT.test(q)) return "quran-text";
  if (QUIZ.test(q)) return "quiz";

  // 3. Off-topic (only when nothing ties it to the Quran).
  if ((OFF_TOPIC.test(q) || OFF_TOPIC.test(raw)) && !RELIGIOUS.test(q)) return "off-topic";

  // 4. Grounded intents.
  if (WORD_MEANING.test(q)) return "word-meaning";
  if (STORY.test(q)) return "story";
  if (EXPLAIN.test(q)) return "explain";
  return "general";
}

/** Exact text required by product rules for fatwa / jurisprudence questions. */
export const NEEDS_SCHOLAR_TEXT =
  "هذا السؤال يحتاج إلى فتوى من جهة علمية موثوقة، ويمكنني مساعدتك في فهم النصوص والمصادر المرتبطة به.";

export const OFF_TOPIC_TEXT =
  "أنا مساعد مُدّكِر، وأختص بمساعدتك في حفظ القرآن الكريم وفهم معانيه من مصادر موثوقة. يسعدني أن تسألني عن آية أو سورة أو قصة قرآنية.";
