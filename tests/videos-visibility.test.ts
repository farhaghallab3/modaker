/**
 * Restoration of the existing Quran videos: exactly four are published (supplementary external viewing), independently of the
 * story narratives, which stay draft and hidden. Videos are never assistant knowledge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getStory, STORIES, storiesForSurah, visibleStories } from "../src/content/stories";
import { getVideo, isValidYouTubeId, videosForStory, videosForSurah, VIDEOS, visibleVideos } from "../src/content/videos";
import { isLearnerVisible } from "../src/lib/content-state";

const APPROVED: Record<string, { youtubeId: string; title: string; surah: number }> = {
  "v-mulk-fadl": { youtubeId: "tY2OaFA_ZQg", title: "فضل قراءة سورة الملك قبل النوم", surah: 67 },
  "v-dhul-qarnayn": { youtubeId: "ylD7uXIJuI8", title: "ذو القرنين — التمكين والعدل", surah: 18 },
  "v-musa-khidr": { youtubeId: "f7j-KVZ6mRw", title: "موسى والخضر — أدب طلب العلم", surah: 18 },
  "v-qabil-habil": { youtubeId: "9khWy9230ZU", title: "قصة ابنَي آدم: قابيل وهابيل", surah: 5 },
};

test("«المرئيات» shows exactly the four approved videos; the other 11 stay hidden", () => {
  assert.equal(VIDEOS.length, 15);
  assert.deepEqual(visibleVideos().map((v) => v.id).sort(), Object.keys(APPROVED).sort());
  const hidden = VIDEOS.filter((v) => !(v.id in APPROVED));
  assert.equal(hidden.length, 11);
  for (const v of hidden) {
    assert.equal(isLearnerVisible(v), false, v.id);
    assert.equal(v.isDemo, true, v.id);
    assert.equal(v.reviewState, "draft", v.id);
    assert.equal(getVideo(v.id), undefined, `${v.id} cannot be opened through getVideo`);
  }
});

test("the approved records keep their YouTube IDs and our editorial titles (not YouTube's titles)", () => {
  for (const [id, want] of Object.entries(APPROVED)) {
    const v = getVideo(id)!;
    assert.ok(v, id);
    assert.equal(v.youtubeId, want.youtubeId);
    assert.equal(isValidYouTubeId(v.youtubeId), true);
    assert.equal(v.title, want.title);
    assert.equal(v.isDemo, false);
    assert.equal(v.reviewState, "published");
  }
});

test("videos are published independently of stories: all six story narratives stay draft, demo and hidden", () => {
  assert.equal(STORIES.length, 6);
  for (const s of STORIES) {
    assert.equal(s.isDemo, true, s.slug);
    assert.equal(s.reviewState, "draft", s.slug);
    assert.equal(getStory(s.slug), undefined, s.slug);
  }
  assert.deepEqual(visibleStories(), []);
  assert.deepEqual(storiesForSurah(18), []);
});

test("story text does not leak through the video records", () => {
  const storyText = STORIES.flatMap((s) => [s.intro ?? "", s.subtitle ?? "", ...s.chapters.flatMap((c) => [c.summary ?? ""])]).filter((t) => t.length > 25);
  assert.ok(storyText.length > 0);
  for (const v of visibleVideos()) {
    const shown = [v.title, v.description, v.channel].join(" ");
    for (const t of storyText) assert.ok(!shown.includes(t), `${v.id} shows story text`);
  }
});

test("the Videos page's story link needs a visible story: hidden stories are never linked (getStory is undefined)", () => {
  for (const v of visibleVideos()) if (v.storySlug) assert.equal(getStory(v.storySlug), undefined, `${v.id} → ${v.storySlug}`);
});

test("surah screens show the approved videos where expected, through videosForSurah, independently of story visibility", () => {
  assert.deepEqual(videosForSurah(18).map((v) => v.id).sort(), ["v-dhul-qarnayn", "v-musa-khidr"]);
  assert.deepEqual(videosForSurah(67).map((v) => v.id), ["v-mulk-fadl"]);
  assert.deepEqual(videosForSurah(5).map((v) => v.id), ["v-qabil-habil"]);
  for (const n of [1, 2, 11, 12, 19, 27, 114]) assert.deepEqual(videosForSurah(n), [], `surah ${n}`);
  assert.deepEqual(videosForStory("dhul-qarnayn").map((v) => v.id), ["v-dhul-qarnayn"]);
  assert.deepEqual(videosForStory("maryam"), [], "hidden Maryam videos stay hidden");
  assert.deepEqual(videosForStory("yusuf"), []);
});

test("the Musa/al-Khidr record is supplementary only: the stored text makes no claim about al-Khidr being alive", () => {
  const v = getVideo("v-musa-khidr")!;
  assert.doesNotMatch([v.title, v.description].join(" "), /حي|يزال|عاصر|ما زال/);
});

test("videos are never assistant knowledge: no server, RAG, indexing or assistant code reads the video catalogue", () => {
  const roots = ["src/server", "scripts"];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && /content\/videos/.test(readFileSync(p, "utf8"))) hits.push(p);
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(hits, []);
});
