/**
 * Curated Quranic stories.
 *
 * ─── Editorial rules ────────────────────────────────────────────────────
 * • NO Quran text lives here. Each chapter only points at ayah ranges; the
 *   verses are loaded at runtime from the verified Quran provider
 *   (`api.surah(n)`) and rendered with <QuranVerse>.
 * • `intro` and chapter `summary` are short, neutral narrative framing written
 *   by the editorial team — they are NOT tafsir. Explanations shown to users
 *   always come from an approved tafsir (التفسير الميسر) via `api.tafsir(n)`.
 * • Every story ships as `contentStatus: "demo"` until a qualified reviewer
 *   approves the copy; the UI shows a visible notice for demo content.
 * • Ranges must be contiguous, ascending and within the surah's ayah count —
 *   `validateStories()` below checks this and is cheap enough to run in tests.
 */
import { getSurahMeta } from "@/lib/quran/surahs";
import type { SourceRef, Story, StoryChapter } from "@/lib/types";

export const STORY_REFERENCES: Record<"quran" | "muyassar" | "editorial", SourceRef> = {
  quran: {
    id: "quran-com:uthmani",
    title: "المصحف — الرسم العثماني (رواية حفص عن عاصم)",
    publisher: "Quran.com",
    url: "https://quran.com",
  },
  muyassar: {
    id: "tafsir:muyassar",
    title: "التفسير الميسر",
    publisher: "مجمع الملك فهد لطباعة المصحف الشريف",
    url: "https://quran.com",
  },
  editorial: {
    id: "muzakkir-curated",
    title: "مقدمات تحريرية من مُدّكِر (ليست تفسيرًا)",
    publisher: "فريق مُدّكِر التحريري",
  },
};

const REFS = [STORY_REFERENCES.quran, STORY_REFERENCES.muyassar, STORY_REFERENCES.editorial];

function ch(slug: string, order: number, title: string, summary: string, surah: number, from: number, to: number): StoryChapter {
  return { id: `${slug}-${String(order).padStart(2, "0")}`, order, title, summary, ranges: [{ surah, from, to }] };
}

export const STORIES: Story[] = [
  {
    slug: "yusuf",
    title: "قصة يوسف عليه السلام",
    subtitle: "من رؤيا الصغر إلى اجتماع الأسرة",
    intro:
      "قصة متصلة تُروى في سورة يوسف من أولها إلى آخرها تقريبًا: رؤيا يراها يوسف في صغره، ثم ابتلاءات متتابعة بين البئر والبيت والسجن، حتى يجتمع شمل الأسرة من جديد. نتتبعها هنا فصلًا فصلًا مع الآيات من المصحف الموثّق.",
    surahs: [12],
    accent: "olive",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-yusuf-journey", "v-yusuf-brothers"],
    chapters: [
      ch("yusuf", 1, "رؤيا يوسف", "يحدّث يوسف أباه برؤيا رآها، فيوصيه يعقوب أن يكتمها عن إخوته.", 12, 4, 6),
      ch("yusuf", 2, "يوسف وإخوته", "يتشاور الإخوة في أمر يوسف، ثم يأخذونه معهم ويتركونه في البئر، ويعودون إلى أبيهم.", 12, 7, 18),
      ch("yusuf", 3, "في بيت العزيز", "يُباع يوسف وينشأ في بيت العزيز بمصر، ويُبتلى هناك فيختار ما يرضي ربه.", 12, 19, 34),
      ch("yusuf", 4, "السجن", "يدخل يوسف السجن، ويسأله صاحباه عن رؤياهما، فيدعوهما إلى التوحيد قبل أن يجيبهما.", 12, 35, 42),
      ch("yusuf", 5, "رؤيا الملك", "يرى الملك رؤيا تحيّر من حوله، فيُستدعى يوسف لها، ثم تظهر براءته ويتولّى أمرًا عظيمًا في مصر.", 12, 43, 57),
      ch("yusuf", 6, "لقاء يوسف بإخوته", "يأتي الإخوة إلى مصر في سنوات القحط، وتتوالى اللقاءات حتى يكشف لهم يوسف عن نفسه.", 12, 58, 93),
      ch("yusuf", 7, "اجتماع الأسرة", "يقترب موعد اللقاء الذي طال انتظاره، فتجتمع الأسرة في مصر، ويختم يوسف بالدعاء.", 12, 94, 101),
    ],
  },
  {
    slug: "ashab-al-kahf",
    title: "أصحاب الكهف",
    subtitle: "ثبات الفتية على الإيمان",
    intro:
      "فتية مؤمنون يعتزلون قومهم ويلجؤون إلى كهف، فيلبثون فيه زمنًا طويلًا ثم يستيقظون. تُروى قصتهم في مطلع سورة الكهف.",
    surahs: [18],
    accent: "forest",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-kahf-cave"],
    chapters: [
      ch("ashab-al-kahf", 1, "اللجوء إلى الكهف", "تبدأ القصة بالفتية وهم يلجؤون إلى الكهف داعين ربهم، ثم يغشاهم نوم طويل.", 18, 9, 12),
      ch("ashab-al-kahf", 2, "إيمان الفتية", "تفصيل خبرهم: إيمانهم، وثباتهم أمام قومهم، وقرارهم اعتزالهم.", 18, 13, 16),
      ch("ashab-al-kahf", 3, "في الكهف ثم اليقظة", "يُصوَّر حالهم داخل الكهف، ثم يستيقظون ويتساءلون عن مدة بقائهم.", 18, 17, 20),
      ch("ashab-al-kahf", 4, "انكشاف أمرهم", "يطّلع الناس على أمرهم، ويختلفون في عددهم ومدة بقائهم.", 18, 21, 26),
    ],
  },
  {
    slug: "musa-wal-khidr",
    title: "موسى والخضر",
    subtitle: "رحلة في طلب العلم",
    intro: "يرحل موسى عليه السلام مع فتاه ليلقى رجلًا صالحًا أعطاه الله علمًا، فيصحبه في رحلة من ثلاثة مواقف.",
    surahs: [18],
    accent: "sand",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-musa-khidr"],
    chapters: [
      ch("musa-wal-khidr", 1, "الرحلة", "يعزم موسى على الرحلة مع فتاه، وتكون علامة الموضع المقصود فَقْدَ الحوت.", 18, 60, 64),
      ch("musa-wal-khidr", 2, "اللقاء والشرط", "يلقى موسى الرجل الصالح ويطلب صحبته ليتعلّم، فيشترط عليه الصبر وترك السؤال حتى يبيّن له.", 18, 65, 70),
      ch("musa-wal-khidr", 3, "ثلاثة مواقف", "السفينة، ثم الغلام، ثم الجدار — وفي كل موقف يعترض موسى.", 18, 71, 77),
      ch("musa-wal-khidr", 4, "التأويل", "يفترقان، ويبيّن الرجل الصالح لموسى أسباب ما فعل.", 18, 78, 82),
    ],
  },
  {
    slug: "dhul-qarnayn",
    title: "ذو القرنين",
    subtitle: "سلطان وعدل وسدّ منيع",
    intro: "ملك أعطاه الله قوة وسلطانًا، تُروى رحلاته إلى أقصى المغرب وأقصى المشرق ثم بناؤه السدّ، في أواخر سورة الكهف.",
    surahs: [18],
    accent: "olive",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-dhul-qarnayn"],
    chapters: [
      ch("dhul-qarnayn", 1, "نحو المغرب", "يُذكر ما أُعطيه ذو القرنين، ثم وصوله إلى أقصى المغرب وحكمه في القوم الذين وجدهم هناك.", 18, 83, 88),
      ch("dhul-qarnayn", 2, "نحو المشرق", "تمضي الرحلة إلى أقصى المشرق، حيث يجد قومًا آخرين.", 18, 89, 91),
      ch("dhul-qarnayn", 3, "بناء السدّ", "يطلب منه قوم أن يبني حاجزًا يحميهم من يأجوج ومأجوج، فيبنيه ويردّ الفضل إلى ربه.", 18, 92, 98),
    ],
  },
  {
    slug: "maryam",
    title: "مريم عليها السلام",
    subtitle: "البشارة وميلاد عيسى",
    intro: "تعتزل مريم أهلها فتأتيها البشارة، ثم يولد عيسى عليه السلام ويتكلم وهو رضيع. تُروى في سورة مريم.",
    surahs: [19],
    accent: "terracotta",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-maryam-story"],
    chapters: [
      ch("maryam", 1, "البشارة", "تعتزل مريم أهلها، فيأتيها رسول من الله في هيئة بشر ويبشّرها بغلام.", 19, 16, 21),
      ch("maryam", 2, "الميلاد", "تحمل مريم وتبتعد إلى مكان بعيد، ويشتدّ عليها ألم الولادة عند نخلة، فتأتيها الطمأنينة.", 19, 22, 26),
      ch("maryam", 3, "الوليد يتكلم", "تعود مريم بوليدها إلى قومها، فيتكلم عيسى عليه السلام وهو رضيع.", 19, 27, 33),
      ch("maryam", 4, "الحق في عيسى", "تُختم القصة بتقرير الحق في شأن عيسى عليه السلام.", 19, 34, 36),
    ],
  },
  {
    slug: "zakariya-yahya",
    title: "زكريا ويحيى عليهما السلام",
    subtitle: "دعاء في الخفاء وبشارة",
    intro: "يدعو زكريا ربه في خفاء وقد تقدّمت به السنّ، فيُبشَّر بيحيى. بها تُفتتح سورة مريم.",
    surahs: [19],
    accent: "sand",
    contentStatus: "demo",
    references: REFS,
    videoIds: ["v-zakariya"],
    chapters: [
      ch("zakariya-yahya", 1, "دعاء زكريا", "يدعو زكريا ربه أن يهبه ولدًا صالحًا، مع كِبَر سنّه.", 19, 2, 6),
      ch("zakariya-yahya", 2, "البشارة والعلامة", "يُبشَّر زكريا بغلام اسمه يحيى، ويسأل عن علامة فتُجعل له علامة.", 19, 7, 11),
      ch("zakariya-yahya", 3, "يحيى", "يُذكر يحيى عليه السلام وما أعطاه الله، ويُختم الحديث عنه بالسلام عليه.", 19, 12, 15),
    ],
  },
];

export function getStory(slug: string): Story | undefined {
  return STORIES.find((s) => s.slug === slug);
}

export function storiesForSurah(n: number): Story[] {
  return STORIES.filter((s) => s.surahs.includes(n));
}

/** Overall ayah span of a story (first chapter start → last chapter end). */
export function storySpan(story: Story) {
  const all = story.chapters.flatMap((c) => c.ranges);
  return { surah: all[0].surah, from: Math.min(...all.map((r) => r.from)), to: Math.max(...all.map((r) => r.to)) };
}

/** Returns a list of problems; empty when every range is valid. */
export function validateStories(stories: Story[] = STORIES): string[] {
  const errors: string[] = [];
  for (const s of stories) {
    let prev: { surah: number; to: number } | null = null;
    for (const c of [...s.chapters].sort((a, b) => a.order - b.order)) {
      for (const r of c.ranges) {
        const meta = getSurahMeta(r.surah);
        if (!meta) errors.push(`${c.id}: unknown surah ${r.surah}`);
        else if (r.from < 1 || r.to > meta.ayahCount || r.from > r.to) errors.push(`${c.id}: invalid range ${r.surah}:${r.from}-${r.to}`);
        if (prev && prev.surah === r.surah && r.from !== prev.to + 1) errors.push(`${c.id}: not contiguous after ${prev.to}`);
        prev = { surah: r.surah, to: r.to };
      }
    }
  }
  return errors;
}
