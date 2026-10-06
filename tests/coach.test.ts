/**
 * Session Coach: facts are computed deterministically from real learner state; the model may only phrase a
 * short message and choose among computed actions; anything else is rejected and the template takes over.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoachFacts, coachInput, templateMessage } from "../src/lib/coach/facts";
import { parseJsonLoose, validateCoachAnswer } from "../src/lib/coach/validate";
import { generateCoach } from "../src/server/coach/generate";
import { coachInputSchema } from "../src/server/validation";
import type { LLMProvider } from "../src/server/llm/provider";
import type { UserState } from "../src/lib/store/state";
import { NOW, scenarioCaughtUp, scenarioDue, scenarioUnfinished, scenarioWeak, SCENARIOS } from "./_helpers/coach-scenarios";

const facts = (b: () => UserState) => buildCoachFacts(b(), NOW);
const fake = (reply: string | (() => Promise<string>)): LLMProvider => ({ id: "fake:coach", complete: async () => (typeof reply === "string" ? reply : reply()) });

// ── deterministic facts per learner state ────────────────────────────────

test("scenario 1 — unfinished memorization, nothing due: memorize first", () => {
  const f = facts(scenarioUnfinished);
  assert.equal(f.order, "memorize-first");
  assert.deepEqual(f.resume, { surah: 67, surahName: "الملك", ayah: 12 });
  assert.deepEqual(f.wird && [f.wird.surah, f.wird.from, f.wird.to], [67, 12, 16]);
  assert.equal(f.due.ranges, 0);
  assert.equal(f.weak.ayahs, 0);
  assert.deepEqual(f.recommended, ["memorize", "recite"]);
  assert.equal(f.actions.find((a) => a.id === "memorize")!.href, "/memorize/67?from=12&to=16");
});

test("scenario 2 — due reviews + unfinished memorization: review BEFORE new memorization", () => {
  const f = facts(scenarioDue);
  assert.equal(f.order, "review-first");
  assert.equal(f.due.ranges, 3, "Al-Mulk 1–10, Al-Mulk 11 and Al-Kahf 1–6 (queue ranges are at most 10 ayahs)");
  assert.equal(f.due.ayahs, 17);
  assert.equal(f.recommended[0], "review");
  assert.equal(f.recommended[1], "memorize");
  assert.match(f.actions.find((a) => a.id === "review")!.href, /^\/recite\?surah=\d+&from=\d+&to=\d+&mode=review$/);
});

test("scenario 3 — weak ayahs: fix them first", () => {
  const f = facts(scenarioWeak);
  assert.equal(f.order, "weak-first");
  assert.equal(f.recommended[0], "fix-weak");
  assert.equal(f.weak.ayahs, 2);
  assert.ok(f.weak.dueRanges >= 1);
  assert.deepEqual(f.lastRecitation && [f.lastRecitation.range.from, f.lastRecitation.range.to, f.lastRecitation.needsReview, f.lastRecitation.daysAgo], [1, 11, 2, 1]);
});

test("scenario 4 — caught up: nothing urgent, offer recitation / reading", () => {
  const f = facts(scenarioCaughtUp);
  assert.equal(f.order, "all-clear");
  assert.equal(f.due.ranges, 0);
  assert.equal(f.recommended[0], "recite");
  assert.equal(f.wird, null);
});

test("different learner states produce different plans and different template text", () => {
  const all = SCENARIOS.map((s) => buildCoachFacts(s.build(), NOW));
  assert.equal(new Set(all.map((f) => f.order)).size, 4);
  assert.equal(new Set(all.map((f) => templateMessage(f))).size, 4);
  assert.ok(new Set(all.map((f) => f.recommended.join(","))).size >= 3);
});

// ── what the model is shown ──────────────────────────────────────────────

test("the model input contains no hrefs, no personal data and no Quran text", () => {
  for (const s of SCENARIOS) {
    const input = coachInput(buildCoachFacts(s.build(), NOW));
    const json = JSON.stringify(input);
    assert.doesNotMatch(json, /private@example|اسم لا يجب|href|\/recite|\/memorize/);
    assert.doesNotMatch(JSON.stringify({ ...input, actions: undefined }), /[ً-ْٰۖ-ۭ]/, "no vocalized (Quranic) text in the facts");
    assert.ok(json.length < 1500, `compact (${json.length} bytes)`);
  }
});

test("the endpoint schema accepts the computed input and rejects out-of-range / malformed facts", () => {
  const input = coachInput(buildCoachFacts(scenarioDue(), NOW));
  assert.ok(coachInputSchema.safeParse({ facts: input }).success);
  assert.ok(!coachInputSchema.safeParse({ facts: { ...input, order: "invented" } }).success);
  assert.ok(!coachInputSchema.safeParse({ facts: { ...input, memorizedAyahs: 10_000_000 } }).success);
  assert.ok(!coachInputSchema.safeParse({ facts: { ...input, recommended: ["hack"] } }).success);
  const stripped = coachInputSchema.parse({ facts: { ...input, quranText: "x", email: "a@b.c" } });
  assert.equal("quranText" in stripped.facts, false);
});

// ── validation of the model's answer ─────────────────────────────────────

const due = coachInput(buildCoachFacts(scenarioDue(), NOW));
const good = { message: "وصلنا إلى سورة الملك، الآية 12. عندنا 3 مراجعات مستحقة، فالأفضل نثبّتها أولًا ثم نكمل الحفظ.", primary: "review", secondary: "memorize" };

test("a grounded answer passes (digits are rendered Arabic-Indic)", () => {
  const ok = validateCoachAnswer(good, due)!;
  assert.ok(ok);
  assert.match(ok.message, /الآية ١٢/);
  assert.equal(ok.primary, "review");
});

test("the model cannot invent progress, ayah numbers, surahs, actions or scripture", () => {
  const bad: Record<string, unknown> = {
    "invented ayah number": { ...good, message: "وصلنا إلى سورة الملك، الآية 25. عندنا مراجعتان مستحقتان فنبدأ بهما." },
    "invented review count": { ...good, message: "عندنا 7 مراجعات مستحقة اليوم فنبدأ بها أولًا." },
    "surah not in facts": { ...good, message: "وصلنا إلى سورة يس، الآية 12. نبدأ بالمراجعة المستحقة أولًا." },
    "action not allowed": { ...good, primary: "launch-rocket" },
    "action not recommended": { ...good, primary: "read" },
    "memorize first although reviews are due": { ...good, primary: "memorize", secondary: null },
    "same primary and secondary": { ...good, secondary: "review" },
    "quran text": { ...good, message: "قال تعالى ما يلي، ووصلنا إلى سورة الملك والآية 12 فنبدأ بالمراجعة أولًا." },
    "vocalized scripture": { ...good, message: "تَبَـٰرَكَ ٱلَّذِى بِيَدِهِ ٱلْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَىْءٍ قَدِيرٌ نبدأ بالمراجعة." },
    "religious ruling": { ...good, message: "حكم المراجعة واجب شرعًا اليوم، فنبدأ بمراجعتين مستحقتين الآن." },
    "tajweed claim": { ...good, message: "تجويدك ممتاز، وعندنا مراجعتان مستحقتان فنبدأ بهما الآن." },
    "too many sentences": { ...good, message: "وصلنا إلى الآية 12. عندنا مراجعتان. نبدأ بهما. ثم نكمل. بإذن الله." },
    "too long": { ...good, message: "نبدأ بالمراجعة ".repeat(40) },
    "missing message": { primary: "review", secondary: null },
  };
  for (const [name, answer] of Object.entries(bad)) assert.equal(validateCoachAnswer(answer, due), null, name);
});

test("JSON is extracted from fenced or chatty replies", () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('نعم: {"a":2} شكرًا'), { a: 2 });
  assert.equal(parseJsonLoose("no json"), null);
});

// ── generation: AI when valid, template on every failure ─────────────────

test("a valid model answer is used and attributed to the AI", async () => {
  const r = await generateCoach(due, fake(JSON.stringify(good)));
  assert.equal(r.source, "ai");
  assert.equal(r.primary, "review");
  assert.equal(r.secondary, "memorize");
  assert.ok(r.message && r.message.length > 20);
  assert.equal(r.model, "fake:coach");
});

test("every failure falls back to the template without throwing (invalid answer, garbage, provider error, timeout, no provider)", async () => {
  const expectTemplate = (r: Awaited<ReturnType<typeof generateCoach>>) => {
    assert.equal(r.source, "template");
    assert.equal(r.message, null, "the device renders its own template text");
    assert.equal(r.primary, due.recommended[0], "the deterministic recommendation is kept");
  };
  expectTemplate(await generateCoach(due, fake(JSON.stringify({ ...good, primary: "memorize" }))));
  expectTemplate(await generateCoach(due, fake("I cannot help with that")));
  expectTemplate(await generateCoach(due, fake(async () => { throw new Error("HTTP 429 secret-detail"); })));
  expectTemplate(await generateCoach(due, fake(() => new Promise<string>(() => {})), 30));
  expectTemplate(await generateCoach(due, null));
});

test("the template is gender-neutral, uses the facts, and carries no AI claim", () => {
  for (const s of SCENARIOS) {
    const f = buildCoachFacts(s.build(), NOW);
    const t = templateMessage(f);
    assert.doesNotMatch(t, /توقفتَ|توقفتِ|توقفت /, s.name);
    assert.ok(t.split(/[.!؟]/).filter((x) => x.trim()).length <= 3, s.name);
  }
  const f = buildCoachFacts(scenarioDue(), NOW);
  assert.match(templateMessage(f), /٣ مراجعات/);
  assert.match(templateMessage(f), /الآية ١٢/);
});

test("derived range sizes are allowed numbers; a number that is not a fact is not", () => {
  const unfinished = coachInput(buildCoachFacts(scenarioUnfinished(), NOW));
  const ok = validateCoachAnswer({ message: "وصلنا إلى الآية 12. نبدأ بحفظ 5 آيات من الآية 12 إلى 16.", primary: "memorize", secondary: "recite" }, unfinished);
  assert.ok(ok, "5 = 16 − 12 + 1 is a fact about today's range");
  assert.equal(validateCoachAnswer({ message: "وصلنا إلى الآية 12. نبدأ بحفظ 6 آيات من الآية 12 إلى 16.", primary: "memorize", secondary: null }, unfinished), null);
});

test("one retry when the first answer fails validation; the second valid answer is used", async () => {
  let calls = 0;
  const flaky: LLMProvider = { id: "fake:flaky", complete: async () => (++calls === 1 ? JSON.stringify({ ...good, message: "عندنا 99 مراجعة مستحقة فنبدأ بها أولًا." }) : JSON.stringify(good)) };
  const r = await generateCoach(due, flaky);
  assert.equal(r.source, "ai");
  assert.equal(calls, 2);
  calls = -10; // never valid
  const never: LLMProvider = { id: "fake:never", complete: async () => { calls++; return "{}"; } };
  assert.equal((await generateCoach(due, never)).source, "template");
});
