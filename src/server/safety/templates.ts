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
export const TEMPLATE_SET_VERSION = "2026-10-30.1";

const t = (id: string, text: string, approval: TemplateApproval, version = 1): Template => ({ id, version, text, approval });

export const TEMPLATES = {
  /**
   * Used whenever evidence is missing or too weak. The product owner asked (2026-10-30) for the warm voice of a kind
   * teacher instead of a dry refusal: it still says plainly that no reliable material was found, rules nothing, and
   * points to a scholar. New wording, so it waits for scholarly review.
   */
  abstain: t(
    "abstain",
    "سؤالك طيّب، بارك الله فيك وزادك حرصًا على العلم. لم أجد فيما بين يديّ من المصادر الموثّقة ما يكفي لأجيبك جوابًا أطمئنّ إليه، ولا أحبّ أن أقول في دين الله بغير علم. أنصحك أن تسأل عالمًا تثق به، ويسعدني أن أشرح لك معنى أي آية أو ما ورد في القرآن وتفسيره عن موضوع سؤالك.",
    "pending_scholarly_review",
    2,
  ),

  /** Level D — personal fatwa / case. Neutral: names no specific authority or website. */
  referralD: t(
    "referral.personal",
    "بارك الله فيك وجزاك خيرًا على حرصك. هذه المسألة تتعلق بحالتك أنت، وتحتاج إلى فتوى من عالِم أو جهة علمية مؤهلة تسمع منك التفاصيل. وأنا معك في عرض المعلومات العامة والنصوص والمصادر المرتبطة بالموضوع.",
    "pending_scholarly_review",
    2,
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
    "سؤالك مهم، بارك الله فيك. هذه مسألة فقهية قد يكون فيها تفصيل أو خلاف بين أهل العلم، ولا تتوفر في قاعدة المعرفة الحالية مادة فقهية موثوقة أنقل لك منها الجواب بمصدر معتمد، فلا أجيبك فيها من عندي. اسأل عالمًا أو مفتيًا تثق به، وأنا معك في معاني الآيات وتفسيرها.",
    "pending_scholarly_review",
    2,
  ),
  /** Level C when nothing approved is available: the first clause only, then the abstention. */
  sensitiveCNoMaterial: t("sensitive.nomaterial", "هذه المسألة قد تتضمن خلافًا أو تفصيلًا علميًا.", "pending_scholarly_review"),

  noHadithSource: t(
    "hadith.nosource",
    "لا أنقل حديثًا من الذاكرة، ولا أنسب نصًا أو راويًا أو درجة أو مرجعًا إلا من مصدر حديثي معتمد، ولا يتوفر لدي مثل هذا المصدر حاليًا. ارجع إلى كتب الحديث المحقّقة أو اسأل أهل العلم.",
    "pending_scholarly_review",
    2,
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
    "هذا السؤال خارج إطار مُدّكِر؛ فهو منصة إسلامية تختص بالقرآن الكريم والسنة النبوية والعلوم الشرعية. يسعدني أن تسألني عن آية أو حديث أو مسألة في الدين.",
    "operational",
    2,
  ),
  /** Shown under web-sourced answers to ruling (fiqh) questions. */
  consultScholar: t(
    "web.consult",
    "هذا عرض عام لما ورد في المصادر، وليس فتوى. إن كانت المسألة تخص حالتك أنت، فالأفضل أن تستشير عالمًا أو مفتيًا موثوقًا.",
    "pending_scholarly_review",
  ),
  injection: t("safety.injection", "لا يمكنني تغيير قواعد الأمان أو الإجابة بغير الاعتماد على المصادر الموثقة.", "operational"),
  hostile: t("safety.hostile", "سؤالك مهم، وسأجيب عن مضمونه بهدوء من المصادر المتاحة.", "operational"),

  extractiveIntro: t("extractive.intro", "إليك ما ورد في المصادر المعتمدة حول سؤالك، أنقله لك بنصّه مع مصدره:", "operational", 2),
  /**
   * A short kind opening before a sourced answer, like a teacher greeting a student's question. One is picked per answer.
   * Duas, so they wait for scholarly review like the rest of the religious-facing wording.
   */
  warmOpen1: t("warm.open.1", "بارك الله فيك، سؤال طيّب.", "pending_scholarly_review"),
  warmOpen2: t("warm.open.2", "أحسنتَ السؤال، زادك الله علمًا وحرصًا.", "pending_scholarly_review"),
  warmOpen3: t("warm.open.3", "جزاك الله خيرًا على سؤالك.", "pending_scholarly_review"),
  needsRef: t("needsref", "حدّد السورة ورقم الآية حتى أعرض لك النص من المصحف الموثّق، مثل: «اعرض الآية ٥ من سورة الملك».", "operational"),
  outOfRange: t("range.out", "هذه الآية خارج نطاق السورة المذكورة. تأكد من رقم الآية وأعد المحاولة.", "operational"),
  /** «هذه الآية» asked while only a surah (no ayah) is known: ask which ayah instead of guessing one. */
  ayahNeeded: t("ayah.needed", "لم أستطع تحديد الآية التي تقصدها لأن السياق الحالي سورة كاملة. اكتب رقم الآية، مثل: «اشرح لي الآية ٢»، أو افتح الآية في صفحة الحفظ أو التسميع واسأل من هناك.", "operational"),
  quizNeedsSurah: t("quiz.needsurah", "اختر سورة أولًا ثم اطلب الاختبار، مثل: «اختبرني في سورة الملك»، أو افتح السورة في صفحة الحفظ واطلبه من هناك.", "operational"),
  unavailable: t("source.unavailable", "تعذّر الوصول إلى مصدر النصوص الموثّق الآن، فلم أستطع الإجابة. حاول مرة أخرى بعد قليل.", "operational"),
  relatedSources: t("sources.related", "ويمكنك الاطلاع على التفسير المعتمد للآيات المذكورة في المصادر المرفقة.", "operational"),
} as const;

export type TemplateId = keyof typeof TEMPLATES;

/** Templates that still need a qualified reviewer. Surfaced so the admin area can list them later. */
export function templatesPendingReview(): Template[] {
  return Object.values(TEMPLATES).filter((x) => x.approval === "pending_scholarly_review");
}
