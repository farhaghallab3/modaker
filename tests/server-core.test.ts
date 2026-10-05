/**
 * Pure server modules: verification, Quran.com provider (fake fetch),
 * session tokens, password hashing, reminder scheduling, rate limiting,
 * chunking. Synthetic ordinary Arabic only — no Quran text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSurahMeta } from "../src/lib/quran/surahs";
import { EMPTY_STATE, type UserState } from "../src/lib/store/state";
import type { SurahText } from "../src/lib/types";
import { hashPassword, needsRehash, verifyPassword } from "../src/server/auth/password";
import { signSessionToken, verifySessionToken } from "../src/server/auth/session";
import { QuranSourceUnavailableError, QuranVerificationError } from "../src/server/errors";
import { stripHtml } from "../src/server/quran/common";
import { QuranComProvider } from "../src/server/quran/quran-com";
import { assertVerified, verifySurahText } from "../src/server/quran/verification";
import { chunkText } from "../src/server/rag/chunk";
import { MemoryRateLimiter } from "../src/server/rate-limit";
import { computeDueReminders, inPreferredWindow, inQuietHours, isDeliveryDay, localTime } from "../src/server/notifications/schedule";

const LINE = "كتب الطالب درسه بعناية";
function synthetic(n: number, count = getSurahMeta(n)!.ayahCount): SurahText {
  return {
    meta: getSurahMeta(n)!,
    source: { id: "test", title: "test" },
    ayahs: Array.from({ length: count }, (_, i) => ({ surah: n, ayah: i + 1, key: `${n}:${i + 1}`, textUthmani: `${LINE} ${i + 1}` })),
  };
}

// ── verification ─────────────────────────────────────────────────────────

test("verification passes a well-formed surah and is checksum-stable", () => {
  const a = verifySurahText(synthetic(112));
  assert.equal(a.ok, true);
  assert.equal(a.checksum, verifySurahText(synthetic(112)).checksum);
  assert.match(a.checksum, /^[0-9a-f]{64}$/);
});

test("verification catches wrong count, bad keys, empty text and checksum drift", () => {
  assert.ok(verifySurahText(synthetic(112, 3)).problems.some((p) => p.includes("expected 4")));
  const bad = synthetic(112);
  bad.ayahs[1] = { ...bad.ayahs[1], key: "112:9" };
  bad.ayahs[2] = { ...bad.ayahs[2], textUthmani: "  " };
  const r = verifySurahText(bad);
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 2);
  assert.throws(() => assertVerified(synthetic(112), "0".repeat(64)), QuranVerificationError);
});

// ── Quran.com provider with fake fetch ───────────────────────────────────

function fakeFetch(opts: { count?: number; fail?: boolean } = {}) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    if (opts.fail) throw new TypeError("fetch failed");
    const u = new URL(url);
    const page = Number(u.searchParams.get("page"));
    if (u.pathname.includes("/verses/by_chapter/112")) {
      const total = opts.count ?? 4;
      // two pages of 2 to exercise pagination
      const from = (page - 1) * 2 + 1;
      const verses = Array.from({ length: Math.max(0, Math.min(2, total - from + 1)) }, (_, i) => ({
        verse_number: from + i,
        verse_key: `112:${from + i}`,
        text_uthmani: `${LINE} ${from + i}`,
        page_number: 604,
        juz_number: 30,
      }));
      return Response.json({ verses, pagination: { next_page: from + 2 <= total ? page + 1 : null } });
    }
    if (u.pathname.includes("/tafsirs/16/by_chapter/112")) {
      return Response.json({
        tafsirs: [
          { verse_key: "112:1", text: "<p>شرح <b>تجريبي</b> &amp; مختصر</p>" },
          { verse_key: "112:2", text: "" },
        ],
        pagination: { next_page: null },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { fn, urls };
}

test("QuranComProvider paginates, verifies, sets audio URLs and caches", async () => {
  const f = fakeFetch();
  const qc = new QuranComProvider("https://example.test/api/v4", f.fn);
  const s = await qc.getSurah(112);
  assert.equal(s.ayahs.length, 4);
  assert.equal(s.source.id, "quran-com:uthmani");
  assert.match(s.ayahs[0].audioUrl!, /112001\.mp3$/);
  assert.equal(f.urls.length, 2);
  assert.ok(f.urls[0].includes("fields=text_uthmani,page_number,juz_number") && f.urls[0].includes("per_page=50"));
  await qc.getAyahs({ surah: 112, from: 2, to: 3 });
  assert.equal(f.urls.length, 2, "second call served from cache");
});

test("QuranComProvider refuses text that fails verification", async () => {
  const qc = new QuranComProvider("https://example.test/api/v4", fakeFetch({ count: 3 }).fn);
  await assert.rejects(qc.getSurah(112), QuranVerificationError);
});

test("QuranComProvider maps network errors to QuranSourceUnavailableError", async () => {
  const qc = new QuranComProvider("https://example.test/api/v4", fakeFetch({ fail: true }).fn);
  await assert.rejects(qc.getSurah(112), QuranSourceUnavailableError);
});

test("tafsir: HTML stripped, empty grouped entries dropped, source attached", async () => {
  const qc = new QuranComProvider("https://example.test/api/v4", fakeFetch().fn);
  const t = await qc.getTafsir(112, "muyassar");
  assert.equal(t.length, 1);
  assert.equal(t[0].text, "شرح تجريبي & مختصر");
  assert.equal(t[0].source.id, "tafsir:muyassar");
  assert.equal(stripHtml("أ<br/>ب"), "أ\nب");
});

// ── auth ─────────────────────────────────────────────────────────────────

test("session tokens: valid, tampered, expired, wrong key", () => {
  const key = "k".repeat(40);
  const exp = new Date(Date.now() + 3600_000);
  const token = signSessionToken("clsession00000001", exp, key);
  assert.equal(verifySessionToken(token, Date.now(), key)?.sessionId, "clsession00000001");
  assert.equal(verifySessionToken(token.replace("clsession00000001", "clsession00000002"), Date.now(), key), null);
  assert.equal(verifySessionToken(token, exp.getTime() + 1, key), null);
  assert.equal(verifySessionToken(token, Date.now(), "x".repeat(40)), null);
  assert.equal(verifySessionToken("garbage", Date.now(), key), null);
});

test("scrypt password hashing", async () => {
  const h = await hashPassword("كلمة-سر-طويلة");
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("كلمة-سر-طويلة", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(needsRehash(h), false);
});

// ── reminders ────────────────────────────────────────────────────────────

const prefs = { ...EMPTY_STATE.notificationPrefs, preferredTime: "05:30" };

test("local time in the user's zone", () => {
  // 2026-10-04T02:40Z is Sunday 05:40 in Riyadh (UTC+3)
  const t = localTime(new Date("2026-10-04T02:40:00Z"), "Asia/Riyadh");
  assert.deepEqual(t, { date: "2026-10-04", weekday: 0, minutes: 5 * 60 + 40 });
});

test("frequency, quiet hours (wrapping midnight) and preferred window", () => {
  assert.equal(isDeliveryDay({ ...prefs, frequency: "weekdays" }, 5), false); // Friday
  assert.equal(isDeliveryDay({ ...prefs, frequency: "weekdays" }, 0), true);
  assert.equal(isDeliveryDay({ ...prefs, frequency: "custom", customDays: [2] }, 2), true);
  const quiet = { ...prefs, quietHours: { from: "22:00", to: "06:00" } };
  assert.equal(inQuietHours(quiet, 23 * 60), true);
  assert.equal(inQuietHours(quiet, 5 * 60), true);
  assert.equal(inQuietHours(quiet, 12 * 60), false);
  assert.equal(inPreferredWindow(prefs, 5 * 60 + 40, 30), true);
  assert.equal(inPreferredWindow(prefs, 6 * 60 + 10, 30), false);
  assert.equal(inPreferredWindow({ ...prefs, preferredTime: "23:50" }, 5, 30), true);
});

test("computeDueReminders reuses derivedReminders with per-day dedupe keys", () => {
  const now = new Date("2026-10-04T02:40:00Z");
  const state: UserState = {
    ...EMPTY_STATE,
    notificationPrefs: prefs,
    resume: { surah: 67, ayah: 5, mode: "memorize", updatedAt: now.toISOString() },
  };
  const due = computeDueReminders(state, now, { timeZone: "Asia/Riyadh" });
  assert.ok(due.some((d) => d.notification.kind === "daily-wird"));
  assert.ok(due.every((d) => d.dedupeKey.endsWith(":2026-10-04")));
  // outside the window → nothing
  assert.deepEqual(computeDueReminders(state, new Date("2026-10-04T09:00:00Z"), { timeZone: "Asia/Riyadh" }), []);
  // quiet hours win
  const quiet = { ...state, notificationPrefs: { ...prefs, quietHours: { from: "05:00", to: "07:00" } } };
  assert.deepEqual(computeDueReminders(quiet, now, { timeZone: "Asia/Riyadh" }), []);
});

// ── misc ─────────────────────────────────────────────────────────────────

test("rate limiter: sliding window", () => {
  const rl = new MemoryRateLimiter();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rl.check("k", 3, 1000, t0 + i).ok, true);
  const blocked = rl.check("k", 3, 1000, t0 + 10);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(rl.check("k", 3, 1000, t0 + 1001).ok, true);
  assert.equal(rl.check("other", 3, 1000, t0 + 10).ok, true);
});

test("chunkText respects the size budget and keeps short texts whole", () => {
  const long = Array.from({ length: 60 }, (_, i) => `هذه جملة تجريبية رقم ${i} في نص طويل.`).join(" ");
  const chunks = chunkText(long, 300);
  assert.ok(chunks.length > 3);
  assert.ok(chunks.every((c) => c.length <= 300));
  assert.ok(chunks.at(-1)!.includes("رقم 59"));
  assert.deepEqual(chunkText("نص قصير", 300), ["نص قصير"]);
});
