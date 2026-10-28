/**
 * English translation of the meanings (QuranEnc): parsing, validation, source gating.
 * Uses synthetic English text only — no real translation text lives in this repository.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSurahMeta } from "../src/lib/quran/surahs";
import { QuranSourceUnavailableError } from "../src/server/errors";
import { QuranEncTranslationProvider, parseSurahTranslation } from "../src/server/quran/translation";
import { ENGLISH_TRANSLATION_SOURCE_ID, getSource, isApproved, sourceRef } from "../src/server/rag/sources";

const ref = sourceRef(ENGLISH_TRANSLATION_SOURCE_ID);

function rows(n: number, count = getSurahMeta(n)!.ayahCount) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(1000 + i),
    sura: String(n),
    aya: String(i + 1),
    translation: `Synthetic line ${i + 1} <sup>1</sup>`,
    footnotes: i === 0 ? "A synthetic note." : "",
  }));
}

test("the English translation source is approved, display-only and has a QuranEnc key", () => {
  const s = getSource(ENGLISH_TRANSLATION_SOURCE_ID)!;
  assert.equal(isApproved(s.id), true);
  assert.equal(s.kind, "translation");
  assert.equal(s.language, "en");
  assert.equal(s.quranencKey, "english_saheeh");
  assert.equal(s.autoRetrievalSuitable, false, "never indexed as assistant knowledge");
});

test("parses a full surah: string numbers, HTML stripped, footnotes kept only when present", () => {
  const out = parseSurahTranslation(112, { result: rows(112).reverse() }, ref);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((e) => e.key), ["112:1", "112:2", "112:3", "112:4"]);
  assert.equal(out[0].text, "Synthetic line 1 1");
  assert.equal(out[0].footnotes, "A synthetic note.");
  assert.equal("footnotes" in out[1], false);
  assert.equal(out[0].source.id, ENGLISH_TRANSLATION_SOURCE_ID);
});

test("rejects a missing, duplicated, empty or foreign ayah", () => {
  const bad = [
    { result: rows(112, 3) },
    { result: [...rows(112, 3), rows(112)[2]] },
    { result: rows(112).map((r, i) => (i === 1 ? { ...r, translation: " " } : r)) },
    { result: rows(112).map((r, i) => (i === 1 ? { ...r, sura: "113" } : r)) },
    {},
  ];
  for (const data of bad) assert.throws(() => parseSurahTranslation(112, data, ref), QuranSourceUnavailableError);
});

test("provider calls QuranEnc once per surah and maps HTTP failures to source-unavailable", async () => {
  const urls: string[] = [];
  const ok = new QuranEncTranslationProvider(ENGLISH_TRANSLATION_SOURCE_ID, "https://example.test/api/v1", async (url) => {
    urls.push(url);
    return Response.json({ result: rows(112) });
  });
  await ok.getSurah(112);
  await ok.getSurah(112);
  assert.deepEqual(urls, ["https://example.test/api/v1/translation/sura/english_saheeh/112"]);

  const down = new QuranEncTranslationProvider(ENGLISH_TRANSLATION_SOURCE_ID, "https://example.test/api/v1", async () => new Response("", { status: 500 }));
  await assert.rejects(down.getSurah(112), QuranSourceUnavailableError);
});

test("an unapproved source is never fetched", async () => {
  let called = false;
  const p = new QuranEncTranslationProvider("quranenc:translations", "https://example.test", async () => {
    called = true;
    return Response.json({ result: [] });
  });
  await assert.rejects(p.getSurah(1), QuranSourceUnavailableError);
  assert.equal(called, false);
});
