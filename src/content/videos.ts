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
    youtubeId: null,
    title: "قصة يوسف عليه السلام — رحلة عبر السورة",
    channel: DEMO_CHANNEL,
    description: "جولة هادئة في أحداث سورة يوسف بترتيبها، تمهيدًا لحفظها وفهم سياقها.",
    surah: 12,
    storySlug: "yusuf",
    range: { surah: 12, from: 4, to: 101 },
    durationLabel: "٢٤ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-yusuf-brothers",
    youtubeId: null,
    title: "يوسف وإخوته — وقفات تدبرية",
    channel: DEMO_CHANNEL,
    description: "وقفات مع لقاءات يوسف بإخوته في مصر.",
    surah: 12,
    storySlug: "yusuf",
    range: { surah: 12, from: 58, to: 93 },
    durationLabel: "١٥ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-kahf-cave",
    youtubeId: null,
    title: "أصحاب الكهف — قصة الثبات",
    channel: DEMO_CHANNEL,
    description: "عرض مبسّط لقصة أصحاب الكهف كما وردت في مطلع سورة الكهف.",
    surah: 18,
    storySlug: "ashab-al-kahf",
    range: { surah: 18, from: 9, to: 26 },
    durationLabel: "١٢ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-musa-khidr",
    youtubeId: null,
    title: "موسى والخضر — أدب طلب العلم",
    channel: DEMO_CHANNEL,
    description: "رحلة موسى عليه السلام في طلب العلم ومواقفها الثلاثة.",
    surah: 18,
    storySlug: "musa-wal-khidr",
    range: { surah: 18, from: 60, to: 82 },
    durationLabel: "١٨ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-dhul-qarnayn",
    youtubeId: null,
    title: "ذو القرنين — التمكين والعدل",
    channel: DEMO_CHANNEL,
    description: "قراءة في رحلات ذي القرنين وبناء السدّ.",
    surah: 18,
    storySlug: "dhul-qarnayn",
    range: { surah: 18, from: 83, to: 98 },
    durationLabel: "١٠ دقائق",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-maryam-story",
    youtubeId: null,
    title: "قصة مريم عليها السلام",
    channel: DEMO_CHANNEL,
    description: "البشارة وميلاد عيسى عليه السلام كما وردت في سورة مريم.",
    surah: 19,
    storySlug: "maryam",
    range: { surah: 19, from: 16, to: 36 },
    durationLabel: "١٤ دقيقة",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-zakariya",
    youtubeId: null,
    title: "زكريا ويحيى — دعاء في الخفاء",
    channel: DEMO_CHANNEL,
    description: "مطلع سورة مريم: دعاء زكريا عليه السلام والبشارة بيحيى.",
    surah: 19,
    storySlug: "zakariya-yahya",
    range: { surah: 19, from: 2, to: 15 },
    durationLabel: "٩ دقائق",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-mulk-memorize",
    youtubeId: null,
    title: "سورة الملك — خطة حفظ في أسبوعين",
    channel: DEMO_CHANNEL,
    description: "تقسيم عملي لسورة الملك إلى مقاطع يومية مع نصائح للمراجعة.",
    surah: 67,
    range: { surah: 67, from: 1, to: 30 },
    durationLabel: "٨ دقائق",
    isDemo: true,
    reviewState: "draft",
  },
  {
    id: "v-mulk-tadabbur",
    youtubeId: null,
    title: "تأملات في سورة الملك",
    channel: DEMO_CHANNEL,
    description: "مدخل هادئ إلى موضوعات سورة الملك قبل حفظها.",
    surah: 67,
    durationLabel: "١١ دقيقة",
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
