/**
 * Curated video library.
 *
 * ─── How admins add a curated video ─────────────────────────────────────
 * 1. Pick a video from a trusted scholar / educational channel and have it
 *    reviewed by the content team (accuracy, recitation, adab, no music).
 * 2. Copy its YouTube id — the 11-character value after `watch?v=` in
 *    `https://www.youtube.com/watch?v=XXXXXXXXXXX` (or after `youtu.be/`).
 *    Never guess or invent ids; leave `youtubeId: null` until you have one.
 * 3. Add (or update) an entry below:
 *      id            stable slug used in URLs (/videos?v=<id>) and Story.videoIds
 *      title         Arabic title as shown to learners
 *      youtubeId     the real id, or null while pending (a calm placeholder is shown)
 *      thumbnail     optional; omitted → https://i.ytimg.com/vi/<id>/hqdefault.jpg
 *      channel       channel or speaker name as it appears on YouTube
 *      surah         related surah number (1–114)
 *      storySlug     related story slug from src/content/stories.ts (optional)
 *      range         related ayah range { surah, from, to } (optional)
 *      description   one or two neutral sentences about the video
 *      durationLabel e.g. "١٢ دقيقة" (optional)
 *      isDemo / reviewState: demo videos stay `isDemo: true, reviewState: "draft"` until reviewed
 * 4. If the video belongs to a story, add its `id` to that story's `videoIds`.
 *
 * Embeds always use youtube-nocookie.com behind a click-to-load facade, so no
 * request reaches YouTube until the learner presses play.
 */
import type { Video } from "@/lib/types";

export type CuratedVideo = Video & { thumbnail?: string };

const DEMO_CHANNEL = "قناة تعليمية (تجريبي)";

export const VIDEOS: CuratedVideo[] = [
  {
    id: "v-yusuf-journey",
    youtubeId: "pYkOlp3Im0Q",
    title: "قصة يوسف عليه السلام",
    channel: "سؤال؟",
    description: "قصة يوسف عليه السلام كاملة، من نشأته ورؤياه إلى اجتماع أسرته في مصر.",
    surah: 12,
    storySlug: "yusuf",
    range: { surah: 12, from: 4, to: 101 },
    durationLabel: "ساعتان و٣٩ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-kahf-cave",
    youtubeId: "zzCigOm8khc",
    title: "أصحاب الكهف — قصة الثبات",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن أصحاب الكهف، ومعها قصص أصحاب الأخدود والفيل والجنة.",
    surah: 18,
    storySlug: "ashab-al-kahf",
    range: { surah: 18, from: 9, to: 26 },
    durationLabel: "٥٥ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-musa-khidr",
    youtubeId: "f7j-KVZ6mRw",
    title: "موسى والخضر — أدب طلب العلم",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن رحلة موسى عليه السلام مع الخضر ومواقفها الثلاثة.",
    surah: 18,
    storySlug: "musa-wal-khidr",
    range: { surah: 18, from: 60, to: 82 },
    durationLabel: "١٧ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-dhul-qarnayn",
    youtubeId: "ylD7uXIJuI8",
    title: "ذو القرنين — التمكين والعدل",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن رحلات ذي القرنين وبناء السدّ في وجه يأجوج ومأجوج.",
    surah: 18,
    storySlug: "dhul-qarnayn",
    range: { surah: 18, from: 83, to: 98 },
    durationLabel: "١٤ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-maryam-story",
    youtubeId: "dG_qj26K1F0",
    title: "قصة مريم عليها السلام — الجزء الأول (رسوم متحركة)",
    channel: "عالم بيبس 🌌",
    description: "الجزء الأول من قصة السيدة مريم بالرسوم المتحركة، من سلسلة «قصص النساء في القرآن».",
    surah: 19,
    storySlug: "maryam",
    range: { surah: 19, from: 16, to: 36 },
    durationLabel: "١٧ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-maryam-story-2",
    youtubeId: "CXfkG3FlVIA",
    title: "قصة مريم عليها السلام — الجزء الثاني (رسوم متحركة)",
    channel: "Cedars Art Production",
    description: "الجزء الثاني من قصة السيدة مريم بالرسوم المتحركة، من سلسلة «قصص النساء في القرآن».",
    surah: 19,
    storySlug: "maryam",
    range: { surah: 19, from: 16, to: 36 },
    durationLabel: "١٦ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-maryam-narrated",
    youtubeId: "oQmtSDkbX50",
    title: "قصة مريم عليها السلام — قصة مروية",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن السيدة مريم أم المسيح عيسى عليهما السلام.",
    surah: 19,
    storySlug: "maryam",
    range: { surah: 19, from: 16, to: 36 },
    durationLabel: "١٥ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-zakariya",
    youtubeId: "b-vcu2erjcE",
    title: "زكريا ويحيى عليهما السلام",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن نبي الله يحيى بن زكريا عليهما السلام.",
    surah: 19,
    storySlug: "zakariya-yahya",
    range: { surah: 19, from: 2, to: 15 },
    durationLabel: "١٧ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-sulayman",
    youtubeId: "6qo8-POCcbo",
    title: "قصة نبي الله سليمان عليه السلام",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن سليمان عليه السلام، ومنها قصته مع ملكة سبأ كما في سورة النمل.",
    surah: 27,
    range: { surah: 27, from: 15, to: 44 },
    durationLabel: "ساعة و٤ دقائق",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-muhammad",
    youtubeId: "RgWwS1zd4fg",
    title: "قصة النبي محمد ﷺ",
    channel: "Imagination Production",
    description: "فيلم عن سيرة النبي محمد ﷺ من مولده إلى وفاته.",
    durationLabel: "ساعة و٤٥ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-adam",
    youtubeId: "jspuPmz6Ym0",
    title: "قصة آدم عليه السلام",
    channel: "قرآني جناتي",
    description: "قصة أبي البشر آدم عليه السلام، من خلقه إلى نزوله إلى الأرض.",
    surah: 2,
    range: { surah: 2, from: 30, to: 39 },
    durationLabel: "٣٣ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-qabil-habil",
    youtubeId: "9khWy9230ZU",
    title: "قصة ابنَي آدم: قابيل وهابيل",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن ابنَي آدم كما وردت في سورة المائدة.",
    surah: 5,
    range: { surah: 5, from: 27, to: 31 },
    durationLabel: "١١ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-hud",
    youtubeId: "KqtzwVWkuJ0",
    title: "قصة نبي الله هود عليه السلام",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن هود عليه السلام ودعوته لقومه عاد.",
    surah: 11,
    range: { surah: 11, from: 50, to: 60 },
    durationLabel: "١٣ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-lut",
    youtubeId: "Ll2y0LeqznA",
    title: "قصة نبي الله لوط عليه السلام",
    channel: "نفحات - Nafahat",
    description: "قصة مروية عن لوط عليه السلام وقومه.",
    surah: 11,
    range: { surah: 11, from: 77, to: 83 },
    durationLabel: "١٩ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-mulk-fadl",
    youtubeId: "tY2OaFA_ZQg",
    title: "فضل قراءة سورة الملك قبل النوم",
    channel: "سؤال وجواب (MGUETTAFAT)",
    description: "مقطع قصير للشيخ أ.د. عبدالعزيز الفوزان عن فضل قراءة سورة الملك كل ليلة قبل النوم.",
    surah: 67,
    durationLabel: "دقيقتان",
    isDemo: true,
    reviewState: "draft",
  },
];

export function getVideo(id: string): CuratedVideo | undefined {
  return VIDEOS.find((v) => v.id === id);
}

export function videosForStory(slug: string): CuratedVideo[] {
  return VIDEOS.filter((v) => v.storySlug === slug);
}

export function videosForSurah(n: number): CuratedVideo[] {
  return VIDEOS.filter((v) => v.surah === n);
}

/** YouTube ids are exactly 11 chars of [A-Za-z0-9_-]. Anything else is treated as missing. */
export function isValidYouTubeId(id: string | null | undefined): id is string {
  return !!id && /^[A-Za-z0-9_-]{11}$/.test(id);
}

export function videoThumbnail(v: Pick<CuratedVideo, "youtubeId" | "thumbnail">): string | null {
  if (v.thumbnail) return v.thumbnail;
  return isValidYouTubeId(v.youtubeId) ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : null;
}
