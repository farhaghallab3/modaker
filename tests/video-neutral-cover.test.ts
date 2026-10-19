/**
 * `v-musa-khidr` shows a neutral Modaker cover before playback (YouTube's own thumbnail carries a teaser claim Modaker does not endorse).
 * Only that video; its id, title, description and playback URL are untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getVideo, isValidYouTubeId, VIDEOS, videoThumbnail, visibleVideos } from "../src/content/videos";

test("only v-musa-khidr uses the neutral cover; the other three published videos keep their thumbnails", () => {
  assert.deepEqual(VIDEOS.filter((v) => v.neutralCover).map((v) => v.id), ["v-musa-khidr"]);
  const khidr = getVideo("v-musa-khidr")!;
  assert.equal(videoThumbnail(khidr), null, "no YouTube thumbnail is requested for it");
  for (const id of ["v-mulk-fadl", "v-dhul-qarnayn", "v-qabil-habil"]) {
    const v = getVideo(id)!;
    assert.equal(videoThumbnail(v), `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`, id);
  }
  assert.equal(visibleVideos().length, 4);
});

test("the video's id, editorial title and description are unchanged", () => {
  const v = getVideo("v-musa-khidr")!;
  assert.equal(v.youtubeId, "f7j-KVZ6mRw");
  assert.equal(isValidYouTubeId(v.youtubeId), true);
  assert.equal(v.title, "موسى والخضر — أدب طلب العلم");
  assert.equal(v.description, "قصة مروية عن رحلة موسى عليه السلام مع الخضر ومواقفها الثلاثة.");
});

test("every place that shows the player passes the flag, and the facade draws no thumbnail image for it", () => {
  for (const f of ["src/features/videos/VideoLibraryScreen.tsx", "src/features/stories/StoryDetailScreen.tsx", "src/features/quran/SurahScreen.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /neutralCover=\{(?:selected|video|active)\.neutralCover\}/, f);
  }
  const embed = readFileSync("src/components/stories/YouTubeEmbed.tsx", "utf8");
  assert.match(embed, /neutralCover \? \(\s*<span className="pattern-girih/, "neutral branded pattern instead of the <img>");
  assert.match(embed, /youtube-nocookie\.com\/embed\//, "playback still uses the privacy-enhanced embed");
  assert.match(embed, /onClick=\{\(\) => setActive\(true\)\}/, "the embed loads only on play");
});
