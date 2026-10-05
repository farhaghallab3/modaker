/**
 * Detector data for the safety router. Everything here is DATA that feeds named signals (see
 * router.ts); nothing here decides an answer by itself. Lists are deliberately grouped by the
 * signal they feed so a reviewer can read and extend them.
 *
 * All Arabic patterns run on normalizeArabic() output: no diacritics, أ/إ/آ→ا, ة→ه, ى→ي,
 * punctuation and digits removed. English patterns run on the lowercased raw text.
 */
import { normalizeArabic } from "@/lib/quran/normalize";

const n = (s: string) => normalizeArabic(s);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Substring match on normalized text. */
export function phrases(list: string[]): RegExp {
  return new RegExp(`(?:${list.map((w) => esc(n(w))).join("|")})`);
}
/** Whole-word match (optional و/ف clitic) on normalized text padded with spaces. */
export function words(list: string[]): RegExp {
  return new RegExp(`(^|\\s)(?:[وف]?)(?:${list.map((w) => esc(n(w))).join("|")})(?=\\s|$)`);
}
const en = (list: string[]) => new RegExp(`\\b(?:${list.map(esc).join("|")})\\b`, "i");

// ── ruling / fatwa signals ───────────────────────────────────────────────

/** The user asks for a ruling. Whether it is a PERSONAL case is decided separately. */
export const RULING_FRAMING = phrases([
  "هل يجوز", "يجوز لي", "هل يحل", "ما حكم", "ماحكم", "حكم من", "هل علي", "هل يجب", "هل يلزم", "هل يسقط", "يسقط عني", "ما حكمي", "هل يصح", "هل تصح", "هل تبطل",
  "هل يبطل", "هل يفسد", "هل افطر", "هل اثم", "حكم الشرع", "الحكم الشرعي", "شرعا",
]);
/** Asking outright for a fatwa is always a Level D request. */
export const EXPLICIT_FATWA = phrases(["افتني", "افتوني", "اريد فتوى", "فتوى", "فتوي", "استفتاء", "استفتي"]);
/** Jurisprudence topics; a ruling topic unless the question is explanatory about a text. */
export const RULING_TOPIC = words([
  "حلال", "حرام", "محرم", "محرمه", "جائز", "مكروه", "طلاق", "الطلاق", "طلقت", "طلقني", "خلع", "ميراث", "الميراث", "ورث", "الورثه", "نصيب",
  "زكاه مالي", "زكاه", "الزكاه", "كفاره", "الكفاره", "نذرت", "نذر", "يمين", "حلفت", "صلاتي", "صيامي", "وضوئي", "مفطر", "يفطر", "ربا",
  "الربا", "قرض", "فوائد البنك", "عقد زواج", "الحيض", "حائض", "الجنابه",
]);
/** Explanatory framing about a text: turns a ruling TOPIC into a plain explanation request. */
export const EXPLANATORY = phrases([
  "ما معني", "معني", "ما تفسير", "تفسير", "فسر", "اشرح", "شرح", "وضح", "ما المقصود", "المقصود ب", "سبب نزول", "ما سبب", "ما الحكمه",
  "قصه", "في سوره", "في الايه", "ايات", "الايات",
]);
/** Tajweed "rules" (حكم الإدغام…) are recitation terminology, not fiqh. */
export const TAJWEED = words([
  "تجويد", "التجويد", "ادغام", "الادغام", "اخفاء", "الاخفاء", "اظهار", "الاظهار", "اقلاب", "الاقلاب", "المد", "مد", "غنه", "الغنه",
  "قلقله", "القلقله", "الوقف", "الترقيق", "التفخيم",
]);

/**
 * PERSONAL FACTS — what makes a question a personal case (Level D) rather than a general one.
 *
 * First-person WORDING does not: «هل يجوز لي لمس المصحف بدون وضوء؟» or «هل يجوز لي قراءة القرآن وأنا
 * مستلقٍ؟» ask a general fiqh question in the first person (Level C). A question becomes personal
 * when it supplies facts about the asker's own situation that a ruling would depend on:
 *
 *   strong (2)  circumstance (illness, pregnancy, a medical condition…), a narrated event
 *               («نسيت», «حدث», «حلفت»), a relationship or possession («زواجي», «عقدي», «زوجتي»),
 *               a jurisdiction («في دولة كذا»), a request for what to DO («ماذا أفعل»),
 *               an unspecified act of the asker («هل هذا العمل حلال؟»)
 *   weak   (1)  self/possession statements («أنا», «لدي») and bare causes («بسبب»)
 *
 * Level D needs at least one STRONG kind, a total of 2+, and a fiqh context (a ruling framing, a
 * religious-practice topic, or a request for what to do). Weak kinds alone never make a case personal.
 */
export const FACT_CIRCUMSTANCE = words([
  "مريض", "مريضه", "مرض", "مصاب", "مصابه", "حامل", "عذر", "ظرف", "ظروف", "طبي", "طبيه", "طبيب", "الطبيب", "عمليه", "اعاقه", "عاجز", "عاجزه",
  "كبير في السن",
]);
/** First-person narrated events: inherently about the speaker. */
export const FACT_EVENT = words([
  "نسيت", "فعلت", "قمت", "عملت", "وقعت", "حلفت", "نذرت", "طلقت", "طلقتها", "طلقني", "تزوجت", "اشتريت", "اقترضت", "ذهبت",
  "اخطات", "تاخرت", "فاتتني", "فاتني", "كنت", "اصبحت", "قلت", "اخبرني",
]);
/** Third-person events («حدث كذا») describe an event but not WHOSE: they need an anchor to count. */
export const FACT_EVENT_3P = words(["حدث", "حصل", "وقع"]);
export const FACT_RELATION = words([
  "زوجتي", "زوجي", "ابي", "امي", "اخي", "اختي", "ابني", "بنتي", "عقدي", "زواجي", "طلاقي", "صلاتي", "صيامي", "وضوئي", "حجي", "مالي", "بلدي",
  "عملي", "وظيفتي", "شركتي", "حالتي", "قضيتي",
]);
export const FACT_ACTION_SEEKING = phrases(["ماذا افعل", "ماذا اعمل", "ما العمل", "ماذا علي", "ما الحل", "كيف اتصرف", "ماذا يجب علي", "ما واجبي"]);
/** Explicitly the speaker's own place/situation. */
export const FACT_JURISDICTION = phrases(["في بلدي", "اعيش في", "اسكن في", "اقيم في", "في حالتي"]);
/** A jurisdiction named without a possessive («في دولة كذا») needs an anchor to count. */
export const FACT_JURISDICTION_GENERIC = phrases(["في دوله", "في بلد", "في بلاد"]);
/** "Is THIS act halal?" — a verdict on a concrete, unspecified act of the asker. */
export const FACT_SPECIFIC_ACT = /هل (?:هذا|هذه|ذلك|تلك) (?:\S+ ){0,2}(?:حلال|حرام|جايز|يجوز|مباح|محرم|يصح)/;
export const FACT_WEAK_SELF = words(["انا", "عندي", "لدي", "معي"]);
export const FACT_WEAK_CAUSE = words(["بسبب", "لاني", "لانني", "نظرا"]);

/**
 * Asking whether one is ABLE/ALLOWED to do something, in first person («هل أستطيع…», «هل يمكنني…»).
 * Only a ruling request when the subject is a religious practice (see PRACTICE_TOPIC), so «هل أستطيع
 * حفظ سورة الملك في أسبوع؟» stays an ordinary question.
 */
export const PERMISSION_FRAMING = phrases(["هل استطيع", "هل اقدر", "هل يمكنني", "هل يمكن", "هل اتمكن", "هل يسمح"]);

/** A religious-practice or transaction topic: the question is about fiqh, not about learning/memorising. */
export const PRACTICE_TOPIC = phrases([
  "وضوء", "الوضوء", "صلاه", "الصلاه", "صلاتي", "صيام", "الصيام", "زكاه", "حج", "عمره", "طهاره", "غسل", "تيمم", "عقد", "زواج", "الزواج", "نكاح",
  "طلاق", "ميراث", "نذر", "يمين", "كفاره", "حيض", "نفاس", "جنابه", "ربا", "قرض", "افطار", "الافطار",
]);

export const EN_FACT_STRONG = en([
  "my wife", "my husband", "my marriage", "my contract", "my doctor", "in my case", "my situation", "i am sick", "i am ill", "i am pregnant",
  "i'm sick", "i'm ill", "i'm pregnant", "i have a medical", "i am disabled", "i live in", "i am in a", "what should i do", "what do i do",
  "i forgot", "i made a vow", "i swore",
]);
export const EN_FACT_WEAK = en(["i am", "i'm", "for me", "can i", "may i", "am i allowed", "should i", "do i have to"]);
/** English ruling framing that is only first-person modal wording. */
export const EN_MODAL_FRAMING = en(["can i", "may i", "am i allowed", "should i", "do i have to"]);

export const EN_RULING = en(["halal", "haram", "permissible", "allowed", "forbidden", "fatwa", "ruling", "sinful", "valid"]);
export const EN_EXPLICIT_FATWA = en(["fatwa", "give me a ruling", "issue a ruling"]);

// ── disagreement / sensitivity signals (Level C) ─────────────────────────

export const DISAGREEMENT = phrases([
  "خلاف", "اختلف", "مختلف", "اختلاف", "اقوال العلماء", "اراء العلماء", "اقوال الفقهاء", "المذاهب", "المذهب", "الراجح", "الارجح", "الاصح",
  "هل كل المسلمين", "هل يتفق", "هل اتفق", "هل اجمع", "اجماع",
]);
export const EN_DISAGREEMENT = en(["scholars differ", "difference of opinion", "do all muslims agree", "madhhab", "disagree", "consensus"]);

export interface SensitiveTopic {
  id: string;
  patterns: RegExp;
}
/**
 * Registry of topics that are disputed or politically/historically charged. Each hit routes to
 * Level C. PENDING SCHOLARLY REVIEW: the list and its membership should be confirmed by a qualified
 * reviewer; it is intentionally easy to extend.
 */
export const SENSITIVE_TOPICS: SensitiveTopic[] = [
  { id: "takfir", patterns: words(["تكفير", "يكفر", "تكفيري"]) },
  { id: "sects", patterns: words(["الشيعه", "السنه والشيعه", "الاباضيه", "الصوفيه", "السلفيه", "الوهابيه", "الاشاعره", "الماتريديه", "القاديانيه", "البهائيه"]) },
  { id: "companions_conflict", patterns: phrases(["الفتنه الكبري", "موقعه الجمل", "معركه الجمل", "صفين", "معاويه وعلي", "علي ومعاويه"]) },
  { id: "jihad_violence", patterns: words(["الجهاد", "الارهاب", "العمليات الانتحاريه", "حد الردة", "الردة", "المرتد", "قتل المرتد"]) },
  { id: "gender_family", patterns: phrases(["تعدد الزوجات", "ضرب الزوجه", "الحجاب", "الاختلاط", "ولايه المراه", "شهاده المراه", "ميراث المراه"]) },
  { id: "music_arts", patterns: words(["الموسيقي", "المعازف", "الغناء", "التصوير", "النحت"]) },
  { id: "slavery", patterns: phrases(["الرق", "العبوديه", "ملك اليمين", "السبايا"]) },
  { id: "politics", patterns: words(["الديمقراطيه", "الانتخابات", "الخلافه", "الحكم الاسلامي"]) },
  { id: "aqeedah_disputes", patterns: phrases(["خلق القران", "رؤيه الله", "التاويل والتفويض", "عصمه الانبياء"]) },
  { id: "history_disputes", patterns: phrases(["انتشر بالسيف", "حروب الردة", "الفتوحات", "الاسلام والعنف"]) },
];
export const EN_SENSITIVE: SensitiveTopic[] = [
  { id: "spread_by_sword", patterns: en(["spread by the sword", "spread by sword"]) },
  { id: "jihad_violence", patterns: en(["jihad", "terrorism", "terrorist"]) },
  { id: "sects", patterns: en(["shia", "sunni", "sufi", "salafi", "wahhabi"]) },
  { id: "gender_family", patterns: en(["hijab", "polygamy", "wife beating"]) },
  { id: "music_arts", patterns: en(["music"]) },
];

// ── intent patterns ──────────────────────────────────────────────────────

export const QURAN_TEXT = phrases([
  "اعرض الايه", "اعرض الايات", "اعرض لي", "اكتب الايه", "اكتب الايات", "اكتب لي الايه", "اكتب لي الايات", "نص الايه", "نص الايات", "ما نص",
  "اقرا لي", "ارني الايه", "ارني الايات", "اعطني الايه", "اعطني نص", "اريد نص", "هات الايه", "هات الايات",
]);
export const QUIZ = words([
  "اختبرني", "اختبر حفظي", "اختبار حفظ", "اختبار تسميع", "اعمل لي اختبار", "اعطني اختبار", "اريد اختبار", "امتحني", "امتحن حفظي",
  "سمع لي", "سمعني", "تسميع", "اسالني", "راجع معي", "كويز",
]);
export const WORD_MEANING = phrases(["معني كلمه", "معني لفظ", "ما معني كلمه", "معاني الكلمات", "معاني المفردات", "مفردات", "غريب القران", "معني مفرده", "ما معني لفظه"]);
export const STORY = phrases(["قصه", "قصص", "ماذا حدث", "ما الذي حدث", "ماذا جري", "حكايه", "ما حدث"]);
export const EXPLAIN = phrases([
  "ما معني", "معني", "ما تفسير", "تفسير", "فسر", "اشرح", "وضح", "ما المقصود", "لماذا", "سبب نزول", "ما الحكمه", "ما الدرس", "ما الفوايد",
  "فوايد", "عبر", "دروس",
]);
/** Asking for a hadith (or its grading/source). Needs an approved hadith source; none exists yet. */
export const HADITH_REQUEST = phrases([
  "حديثا", "حديث", "احاديث", "الحديث", "رواه البخاري", "رواه مسلم", "صحيح البخاري", "صحيح مسلم", "قال رسول الله", "قال النبي", "عن النبي",
  "سنه نبويه",
]);
export const EN_HADITH = en(["hadith", "hadeeth", "narrated", "sahih bukhari", "sahih muslim", "prophet said"]);

// Religious/Quranic markers: never off-topic when present.
export const RELIGIOUS = phrases([
  "سوره", "ايه", "ايات", "قران", "القران", "مصحف", "تفسير", "تجويد", "حفظ", "الحفظ", "تلاوه", "النبي", "الرسول", "الله", "نبي", "انبياء",
  "صحابه", "الصحابه", "رسول", "اسلام", "الاسلام", "دين", "صلاه", "الصلاه", "دعاء", "حديث", "قصه", "مسلم", "المسلمين", "المسلمون", "كعبه",
  "الكعبه", "توحيد", "ايمان", "عباده", "الاسلام", "شريعه", "محمد",
]);
export const EN_RELIGIOUS = en([
  "islam", "muslim", "muslims", "quran", "qur'an", "koran", "hadith", "sunnah", "prayer", "salah", "salat", "tawhid", "allah", "prophet", "muhammad",
  "halal", "haram", "fatwa", "ramadan", "hajj", "zakat", "sharia", "kaaba", "ka'ba", "surah", "ayah", "ayat", "imam", "mosque", "jihad",
  "pray", "wudu", "ablution", "fasting", "fast", "shahada", "islamic", "divorce", "nikah", "umrah", "vow", "marriage", "mushaf",
]);
export const OFF_TOPIC = phrases([
  "برمجه", "برمجيات", "كود", "جافا", "بايثون", "javascript", "python", "react", "sql", "html", "css", "كره القدم", "كره السله", "مباراه", "الدوري",
  "ريال مدريد", "برشلونه", "فيلم", "افلام", "مسلسل", "اغنيه", "اغاني", "الطقس", "سعر الدولار", "البورصه", "الاسهم", "بيتكوين", "عملات رقميه",
  "وصفه طبخ", "طبخ", "سياره", "سيارات", "رجيم", "تخسيس", "لعبه", "العاب", "football", "movie", "weather", "stock", "recipe", "كاس العالم", "عاصمه",
]);

// ── manipulation signals ─────────────────────────────────────────────────

/** Attempts to remove the assistant's restrictions. Detected, stripped, and never allowed to LOWER a level. */
export const INJECTION_AR: RegExp[] = [
  /تجاهل (?:كل |جميع )?(?:التعليمات|القواعد|الاوامر|القيود|ما سبق)(?: السابقه)?/g,
  /انس (?:كل |جميع )?(?:القواعد|التعليمات|القيود)/g,
  /تخط(?:ي|ى)? (?:القواعد|القيود|التعليمات)/g,
  /بدون (?:اي )?(?:قيود|قواعد|مصادر)/g,
  /لا تلتزم (?:ب\S+ ?){0,3}/g,
  /(?:من الان|منذ الان) (?:انت|ستكون|تصرف|اجب)[^.؟?!]{0,40}/g,
  /(?:تصرف|اعتبر نفسك|تقمص) (?:ك|دور )?(?:مفتي|عالم|شيخ|فقيه)/g,
  /(?:وضع|نمط) (?:المطور|الحريه|بلا قيود)/g,
  /اكسر (?:القيود|القواعد)/g,
  /اجب (?:من )?(?:ذاكرتك|معلوماتك|عندك)/g,
  /(?:لا تذكر|بدون ذكر|لا تستشهد ب) ?(?:المصادر|المراجع)/g,
  /system prompt|jailbreak/gi,
];
export const INJECTION_EN: RegExp[] = [
  /ignore (?:all |any |the )?(?:previous |above |prior )?(?:instructions|rules|restrictions)/gi,
  /disregard (?:all |any |the )?(?:previous |above |prior )?(?:instructions|rules)/gi,
  /you are now [^.?!]{0,60}/gi,
  /act as (?:a |an )?(?:mufti|sheikh|scholar|imam)/gi,
  /developer mode|do anything now|\bdan\b/gi,
  /(?:no|without) (?:restrictions|rules|sources)/gi,
  /answer from (?:your )?memory/gi,
];

/** Insults/hostile framing. Detected so the reply stays calm and answers the substance. */
export const HOSTILE_AR = words([
  "متخلف", "متخلفون", "متخلفين", "ارهابي", "ارهابيون", "ارهابيين", "همج", "غبي", "اغبياء", "تافه", "تافهون", "كذاب", "كذابون", "حقير", "حقيره",
  "حمير", "كلاب", "قتله", "سفاحون", "وحوش",
]);
export const HOSTILE_EN = en(["stupid", "idiots", "idiot", "terrorists", "backward", "barbaric", "i hate", "your religion is"]);
