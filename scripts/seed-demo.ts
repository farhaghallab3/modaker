/**
 * Seed editorial content (stories, chapters, ayah references, videos) into
 * PostgreSQL from src/content/*. Imports defensively: it scans every module in
 * src/content for exported arrays that look like Story[] / Video[], so it keeps
 * working as the content modules evolve. No Quran text is involved — stories
 * reference ayah ranges by number only.
 *
 *   npx tsx scripts/seed-demo.ts [--dry-run]
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Story, Video } from "@/lib/types";
import { log, parseArgs } from "./_util";

const dryRun = parseArgs().flags.has("dry-run");
const CONTENT_DIR = path.resolve("src/content");

const isStory = (x: unknown): x is Story =>
  !!x && typeof x === "object" && typeof (x as Story).slug === "string" && Array.isArray((x as Story).chapters);
const isVideo = (x: unknown): x is Video =>
  !!x && typeof x === "object" && "youtubeId" in (x as object) && typeof (x as Video).id === "string" && typeof (x as Video).title === "string";

async function collect(): Promise<{ stories: Story[]; videos: Video[] }> {
  const stories = new Map<string, Story>();
  const videos = new Map<string, Video>();
  let files: string[] = [];
  try {
    files = (await readdir(CONTENT_DIR, { recursive: true })).filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts"));
  } catch {
    log(`no ${CONTENT_DIR} directory — nothing to seed`);
  }
  for (const f of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await import(pathToFileURL(path.join(CONTENT_DIR, f)).href);
    } catch (e) {
      log(`skip ${f}: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    for (const value of Object.values(mod)) {
      const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
      for (const item of list) {
        if (isStory(item)) stories.set(item.slug, item);
        else if (isVideo(item)) videos.set(item.id, item);
      }
    }
  }
  return { stories: [...stories.values()], videos: [...videos.values()] };
}

async function main() {
  const { stories, videos } = await collect();
  log(`found ${stories.length} stories, ${videos.length} videos`);
  if (dryRun || (!stories.length && !videos.length)) return;

  const { getPrisma } = await import("@/server/db");
  const prisma = await getPrisma();

  for (const s of stories) {
    // Reviewed content is owned by the review workflow, not by this script.
    const existing = await prisma.story.findUnique({ where: { slug: s.slug }, select: { isDemo: true, reviewState: true } });
    if (existing && !existing.isDemo && existing.reviewState !== "draft") {
      log(`↷ story ${s.slug} is ${existing.reviewState}; leaving it untouched`);
      continue;
    }
    const data = {
      title: s.title,
      subtitle: s.subtitle ?? "",
      intro: s.intro ?? "",
      surahs: s.surahs ?? [],
      accent: s.accent ?? "olive",
      isDemo: s.isDemo === true,
      references: JSON.parse(JSON.stringify(s.references ?? [])),
    };
    // Seeding NEVER sets or changes `reviewState` on existing rows: new rows start as `draft`, and
    // approval/publication only happens through the review workflow (src/server/content/workflow.ts).
    const story = await prisma.story.upsert({
      where: { slug: s.slug },
      create: { slug: s.slug, ...data, reviewState: "draft", origin: "editorial" },
      update: data,
    });
    // Replace chapters + references wholesale (content is versioned in git).
    await prisma.$transaction([
      prisma.storyAyahReference.deleteMany({ where: { storyId: story.id } }),
      prisma.storyChapter.deleteMany({ where: { storyId: story.id } }),
    ]);
    for (const c of s.chapters ?? []) {
      const chapter = await prisma.storyChapter.create({
        data: { storyId: story.id, order: c.order, title: c.title, summary: c.summary ?? "", isDemo: s.isDemo === true, reviewState: "draft" },
      });
      if (c.ranges?.length) {
        await prisma.storyAyahReference.createMany({
          data: c.ranges.map((r) => ({ storyId: story.id, chapterId: chapter.id, surah: r.surah, fromAyah: r.from, toAyah: r.to })),
        });
      }
    }
    log(`✓ story ${s.slug} (${s.chapters?.length ?? 0} chapters)`);
  }

  const storyIds = new Map((await prisma.story.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]));
  for (const v of videos) {
    const data = {
      youtubeId: v.youtubeId ?? null,
      title: v.title,
      channel: v.channel ?? "",
      description: v.description ?? "",
      surah: v.surah ?? null,
      fromAyah: v.range?.from ?? null,
      toAyah: v.range?.to ?? null,
      durationLabel: v.durationLabel ?? null,
      storyId: v.storySlug ? (storyIds.get(v.storySlug) ?? null) : null,
      isDemo: v.isDemo === true,
    };
    await prisma.video.upsert({ where: { id: v.id }, create: { id: v.id, ...data, reviewState: "draft", origin: "editorial" }, update: data });
  }
  if (videos.length) log(`✓ ${videos.length} videos`);
  await prisma.$disconnect();
  log("done. Demo content is NOT indexed into the knowledge base; only published, non-demo content ever is (npm run kb:index).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
