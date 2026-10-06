/**
 * Fixed response wording. Religious-facing wording lives HERE (not scattered through the pipeline)
 * so that a qualified reviewer can approve or change it in one place.
 *
 *   approval:
 *     "owner_provided"            — wording supplied by the product owner; not scholar-reviewed
 *     "pending_scholarly_review"  — conservative placeholder; MUST be reviewed before it is treated
 *                                   as final (Level C wording in particular)
 *     "operational"               — no religious content (scope, language, safety notices)
 */
export type TemplateApproval = "owner_provided" | "pending_scholarly_review" | "operational";

export interface Template {
  id: string;
  /** Bump when the wording changes, so stored answers can be traced to the wording they showed. */
  version: number;
  text: string;
  approval: TemplateApproval;
}

/** Identifies the current set of fixed wording; bump together with any template change. */
export const TEMPLATE_SET_VERSION = "2026-10-07.1";

const t = (id: string, text: string, approval: TemplateApproval, version = 1): Template => ({ id, version, text, approval });

export const TEMPLATES = {
  /** Used whenever evidence is missing or too weak. Wording requested by the product owner. */
  abstain: t("abstain", "لا تتوفر لدي مادة موثوقة كافية للإجابة عن هذا السؤال.", "owner_provided"),

  /** Level D — personal fatwa / case. Neutral: names no specific authority or website. */
  referralD: t(
    "referral.personal",
    "هذه المسألة تتعلق بحالة شخصية وتحتاج إلى فتوى من جهة علمية مؤهلة. يمكنني مساعدتك في عرض المعلومات العامة والنصوص والمصادر المرتبطة بالموضوع.",
    "owner_provided",
  ),

  /** Level C — preface before sourced material. Conservative placeholder, pending scholarly review. */
  sensitiveC: t(
    "sensitive.preface",
    "هذه المسألة قد تتضمن خلافًا أو تفصيلًا علميًا، لذلك سأعرض لك المعلومات الموثقة المتاحة دون ترجيح مستقل.",
    "pending_scholarly_review",
  ),
  /**
   * Level C, a FIQH question whose topic was recognised but no approved fiqh source is loaded.
   * Says plainly that the limitation is in OUR current verified knowledge base — it must not imply
   * that Islam has no answer, and it states no ruling.
   */
  fiqhNoMaterial: t(
    "fiqh.nomaterial",
    "هذه المسألة فقهية وقد تتضمن تفصيلًا أو خلافًا. لا تتوفر في قاعدة المعرفة الحالية مادة فقهية موثوقة كافية لعرض الإجابة بمصدر معتمد.",
    "pending_scholarly_review",
  ),
  /** Level C when nothing approved is available: the first clause only, then the abstention. */
  sensitiveCNoMaterial: t("sensitive.nomaterial", "هذه المسألة قد تتضمن خلافًا أو تفصيلًا علميًا.", "pending_scholarly_review"),

  noHadithSource: t(
    "hadith.nosource",
    "لا أنقل حديثًا من الذاكرة، ولا أنسب نصًا أو راويًا أو درجة أو مرجعًا إلا من مصدر حديثي معتمد، ولا يتوفر لدي مثل هذا المصدر حاليًا.",
    "pending_scholarly_review",
  ),

  /** Asbab al-nuzul asked, but no approved asbab source is loaded: say so, never repackage tafsir as a reason of revelation. */
  noAsbabSource: t(
    "asbab.nosource",
    "لا يتوفر لدي حاليًا مصدر معتمد لأسباب النزول، فلا أستطيع الجزم بسبب نزول هذه الآية أو متى نزلت. يمكنني أن أشرح لك معناها من التفسير الميسر، أو تراجع كتب أسباب النزول المعتمدة وأهل العلم.",
    "pending_scholarly_review",
  ),

  quoteCorrection: t("quote.correction", "يبدو أن النص الذي كتبته يختلف عن نص المصحف الموثّق. النص الموثّق هو:", "operational"),
  quoteClarify: t("quote.clarify", "لم أتمكن من تحديد الآية التي تقصدها بدقة، ولا أحب أن أبني على نص غير متأكد منه. هل تقصد إحدى الآيات التالية؟ اكتب السورة ورقم الآية لأعرضها لك.", "operational"),
  quoteContinue: t("quote.continue", "وفيما يلي ما ورد في المصادر المعتمدة عن الآية الموثّقة:", "operational"),

  language: t(
    "language.unsupported",
    "حاليًا أجيب بالعربية اعتمادًا على مصادر عربية معتمدة، ولا تتوفر لدي مادة مراجعة بلغتك بعد. I currently answer in Arabic from approved Arabic sources and do not yet have reviewed material in your language.",
    "operational",
  ),
  scope: t(
    "scope.offtopic",
    "أنا مساعد مُدّكِر، وأختص بمساعدتك في حفظ القرآن الكريم وفهم معانيه من مصادر موثوقة. يسعدني أن تسألني عن آية أو سورة أو قصة قرآنية.",
    "operational",
  ),
  injection: t("safety.injection", "لا يمكنني تغيير قواعد الأمان أو الإجابة بغير الاعتماد على المصادر الموثقة.", "operational"),
  hostile: t("safety.hostile", "سؤالك مهم، وسأجيب عن مضمونه بهدوء من المصادر المتاحة.", "operational"),

  extractiveIntro: t("extractive.intro", "إليك ما ورد في المصادر المعتمدة حول سؤالك:", "operational"),
  needsRef: t("needsref", "حدّد السورة ورقم الآية حتى أعرض لك النص من المصحف الموثّق، مثل: «اعرض الآية ٥ من سورة الملك».", "operational"),
  outOfRange: t("range.out", "هذه الآية خارج نطاق السورة المذكورة. تأكد من رقم الآية وأعد المحاولة.", "operational"),
  quizNeedsSurah: t("quiz.needsurah", "اختر سورة أولًا ثم اطلب الاختبار، مثل: «اختبرني في سورة الملك»، أو افتح السورة في صفحة الحفظ واطلبه من هناك.", "operational"),
  unavailable: t("source.unavailable", "تعذّر الوصول إلى مصدر النصوص الموثّق الآن، فلم أستطع الإجابة. حاول مرة أخرى بعد قليل.", "operational"),
  relatedSources: t("sources.related", "ويمكنك الاطلاع على التفسير المعتمد للآيات المذكورة في المصادر المرفقة.", "operational"),
} as const;

export type TemplateId = keyof typeof TEMPLATES;

/** Templates that still need a qualified reviewer. Surfaced so the admin area can list them later. */
export function templatesPendingReview(): Template[] {
  return Object.values(TEMPLATES).filter((x) => x.approval === "pending_scholarly_review");
}
