/**
 * Restoration of the six existing Quran stories (reviewed against their declared ranges and Tafsir al-Muyassar).
 * Governance: exactly six published, approved references only, no external pages, no story text in assistant evidence,
 * video publication untouched (4 published / 11 hidden).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getStory, STORIES, storiesForSurah, validateStories, visibleStories } from "../src/content/stories";
import { VIDEOS, videosForStory, videosForSurah, visibleVideos } from "../src/content/videos";
import { isApproved } from "../src/server/rag/sources";
import { STORY_RANGES } from "../src/server/rag/story-ranges";

const SLUGS = ["yusuf", "ashab-al-kahf", "musa-wal-khidr", "dhul-qarnayn", "maryam", "zakariya-yahya"];

test("exactly the six existing stories are published and visible — no new stories", () => {
  assert.deepEqual(STORIES.map((s) => s.slug).sort(), [...SLUGS].sort());
  assert.deepEqual(visibleStories().map((s) => s.slug).sort(), [...SLUGS].sort());
  for (const s of STORIES) {
    assert.equal(s.isDemo, false, s.slug);
    assert.equal(s.reviewState, "published", s.slug);
    assert.ok(getStory(s.slug), s.slug);
  }
});

test("story references are ONLY the canonical Quran source and Tafsir al-Muyassar (both approved) — no Twinkl, islamweb or any external page", () => {
  for (const s of STORIES) {
    assert.deepEqual(s.references.map((r) => r.id), ["quran-com:uthmani", "tafsir:muyassar"], s.slug);
    for (const r of s.references) assert.equal(isApproved(r.id), true, `${s.slug}: ${r.id}`);
  }
  const src = readFileSync("src/content/stories.ts", "utf8");
  for (const banned of [/twinkl/i, /islamweb/i, /dorar/i, /youtube/i, /wikipedia/i]) assert.doesNotMatch(src, banned);
  assert.equal(JSON.stringify(STORIES).match(/https?:\/\/(?!quran\.com)/g), null, "no URL other than quran.com in any story");
});

test("Quran text and tafsir are not copied into the story data (ranges only); ranges are valid and contiguous", () => {
  assert.deepEqual(validateStories(), []);
  for (const s of STORIES) for (const c of s.chapters) assert.ok(c.ranges.every((r) => r.from <= r.to && r.surah >= 1), c.id);
});

test("declared ranges are unchanged", () => {
  const span = (slug: string) => {
    const all = getStory(slug)!.chapters.flatMap((c) => c.ranges);
    return `${all[0].surah}:${Math.min(...all.map((r) => r.from))}-${Math.max(...all.map((r) => r.to))}`;
  };
  assert.deepEqual(Object.fromEntries(SLUGS.map((s) => [s, span(s)])), {
    yusuf: "12:4-101",
    "ashab-al-kahf": "18:9-26",
    "musa-wal-khidr": "18:60-82",
    "dhul-qarnayn": "18:83-98",
    maryam: "19:16-36",
    "zakariya-yahya": "19:2-15",
  });
});

test("reviewed editorial corrections are in place", () => {
  const z = getStory("zakariya-yahya")!;
  assert.match(z.intro, /تأتي قصة زكريا ويحيى في مطلع سورة مريم/);
  assert.doesNotMatch(z.intro, /تُفتتح/);

  const d = getStory("dhul-qarnayn")!.chapters[0].summary;
  assert.match(d, /مغرب الشمس/);
  assert.match(d, /يُخيَّر في أمرهم، ثم يبيّن/, "the choice (v86) comes before his stated policy (v87–88)");

  const m = getStory("musa-wal-khidr")!;
  assert.match(m.chapters[1].summary, /لن يستطيع الصبر/);
  assert.match(m.chapters[1].summary, /ألا يسأله عن شيء حتى يبيّن له/);
  assert.doesNotMatch(m.chapters[2].summary, /في كل موقف يعترض/);
  assert.match(m.chapters[2].summary, /أجر/);
  assert.doesNotMatch(JSON.stringify(m), /حي\b|ما زال|لا يزال|عاصر/, "no claim about al-Khidr being alive");

  const k = getStory("ashab-al-kahf")!.chapters[3].summary;
  assert.match(k, /ثلاثمائة سنة وتسع سنين/);
  assert.match(k, /٢٣–٢٤/);
  assert.match(k, /ليستا من سرد القصة/);
  assert.equal(getStory("ashab-al-kahf")!.chapters[3].ranges[0].from, 21);
  assert.equal(getStory("ashab-al-kahf")!.chapters[3].ranges[0].to, 26, "verses 23–24 stay in the canonical range");
});

test("Surah 18 offers story discovery for Ashab al-Kahf, Musa and al-Khidr, Dhul-Qarnayn; the other surahs for theirs", () => {
  assert.deepEqual(storiesForSurah(18).map((s) => s.slug).sort(), ["ashab-al-kahf", "dhul-qarnayn", "musa-wal-khidr"]);
  assert.deepEqual(storiesForSurah(12).map((s) => s.slug), ["yusuf"]);
  assert.deepEqual(storiesForSurah(19).map((s) => s.slug).sort(), ["maryam", "zakariya-yahya"]);
  assert.deepEqual(storiesForSurah(67), []);
});

test("video publication is exactly as before: 4 published / 11 hidden; approved videos still work independently of stories", () => {
  assert.deepEqual(visibleVideos().map((v) => v.id).sort(), ["v-dhul-qarnayn", "v-mulk-fadl", "v-musa-khidr", "v-qabil-habil"]);
  assert.equal(VIDEOS.filter((v) => v.isDemo && v.reviewState === "draft").length, 11);
  assert.deepEqual(videosForSurah(18).map((v) => v.id).sort(), ["v-dhul-qarnayn", "v-musa-khidr"]);
});

test("a story shows videos only when they are associated with that story AND published", () => {
  assert.deepEqual(videosForStory("musa-wal-khidr").map((v) => v.id), ["v-musa-khidr"]);
  assert.deepEqual(videosForStory("dhul-qarnayn").map((v) => v.id), ["v-dhul-qarnayn"]);
  for (const slug of ["yusuf", "ashab-al-kahf", "maryam", "zakariya-yahya"]) assert.deepEqual(videosForStory(slug), [], `${slug}: its videos are unpublished`);
});

test("story text is not assistant evidence: no server/RAG/script code reads the stories or videos; the story→range map is data only", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && /@\/content\/(stories|videos)|\.\.\/content\/(stories|videos)/.test(readFileSync(p, "utf8"))) hits.push(p.replace(/\\/g, "/"));
    }
  };
  for (const r of ["src/server"]) walk(r);
  assert.deepEqual(hits, []);
  // the assistant's story mapping (Quran ranges → Muyassar) is independent of story text and unchanged
  assert.deepEqual(STORY_RANGES.map((s) => s.id).sort(), [...SLUGS].sort());
});
