/**
 * HadeethEnc hadith provider: query shaping, deterministic relevance, verbatim fields, fail-closed behaviour, and its place in the
 * assistant (never for fiqh/personal questions, never the web fallback). The API is faked; the hadith text below is synthetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAssistant } from "../src/server/rag/assistant";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { HadeethEncProvider, relevance, searchPhrase, canonicalUrl } from "../src/server/hadith/hadeethenc";
import { env } from "../src/server/env";
import { getSource, isApproved } from "../src/server/rag/sources";
import type { WebAnswer, WebAnswerer } from "../src/server/rag/web-answer";
import { FakeQuran } from "./_fixtures";

// ── fake API ─────────────────────────────────────────────────────────────

interface Rec {
  id: string;
  title: string;
  hadeeth: string;
  grade?: string;
  attribution?: string;
  reference?: string;
}
const A: Rec = {
  id: "4560",
  title: "إنما الأعمال بالنيات، وإنما لكل امرئ ما نوى",
  hadeeth: "عَنْ راوٍ رضي الله عنه: «إِنَّمَا الْأَعْمَالُ بِالنِّيَّةِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى» نصٌّ تجريبي للاختبار.",
  grade: "صحيح",
  attribution: "متفق عليه",
  reference: "كتاب الاختبار الأول (1/ 6) (1).\nكتاب الاختبار الثاني (3/ 1515) (1907).",
};
const UNRELATED: Rec = { id: "5833", title: "حديث عن الصدقة والصبر", hadeeth: "ما نقص مال عبد من صدقة، وفيه ذكر الأعمال أيضًا.", grade: "صحيح", reference: "مرجع" };

function api(opts: { search: unknown[]; records: Rec[]; failSearch?: number; failMultiple?: number; hang?: boolean }) {
  const log: string[] = [];
  const fetchImpl = (async (url: string) => {
    log.push(url);
    if (opts.hang) throw new Error("The operation was aborted due to timeout");
    if (url.includes("/hadeeths/search/")) {
      if (opts.failSearch) return new Response("{}", { status: opts.failSearch });
      return new Response(JSON.stringify(opts.search), { status: 200 });
    }
    if (url.includes("/hadeeths/multiple/")) {
      if (opts.failMultiple) return new Response("{}", { status: opts.failMultiple });
      const ids = new URL(url).searchParams.get("ids")!.split(",");
      return new Response(JSON.stringify(opts.records.filter((r) => ids.includes(r.id))), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, log };
}
const hit = (r: Rec, mark = false) => ({ id: r.id, title: r.title, hadith_text: mark ? `<mark>${r.hadeeth.slice(0, 20)}</mark>${r.hadeeth.slice(20)}` : r.hadeeth, hadith_text_highlights: [] });
const provider = (a: ReturnType<typeof api>, extra = {}) => new HadeethEncProvider({ fetchImpl: a.fetchImpl, ignoreRegistry: true, ...extra });

// ── query shaping & relevance ────────────────────────────────────────────

test("query shaping removes only the question frame, never invents words", () => {
  assert.equal(searchPhrase("ما صحة حديث إنما الأعمال بالنيات؟"), "إنما الأعمال بالنيات");
  assert.equal(searchPhrase("ما درجة حديث من غشنا فليس منا"), "غشنا فليس منا");
  assert.equal(searchPhrase("اذكر لي حديثا عن الصدق"), "الصدق");
  assert.equal(searchPhrase("ما صحة هذا الحديث؟"), null);
  assert.equal(searchPhrase("هل هذا حديث؟"), null);
});

test("relevance: the phrase in the title or text, or every term in the title; a stray word in a long text does not qualify", () => {
  const p = "إنما الأعمال بالنيات";
  assert.equal(relevance(p, A.title, A.hadeeth).accepted, true);
  assert.equal(relevance(p, "عنوان آخر", "قال: إنما الأعمال بالنيات").accepted, true);
  assert.equal(relevance(p, UNRELATED.title, UNRELATED.hadeeth).accepted, false);
  assert.equal(relevance(p, "الأعمال", "نص يذكر إنما وبالنيات متفرقةً دون الجملة").accepted, false);
});

// ── 1. relevant record, verbatim ─────────────────────────────────────────

test("«ما صحة حديث إنما الأعمال بالنيات؟» → the relevant record, every field verbatim, canonical link", async () => {
  const a = api({ search: [hit(A, true)], records: [A] });
  const out = await provider(a).find("ما صحة حديث إنما الأعمال بالنيات؟");
  assert.equal(out.length, 1);
  const h = out[0];
  assert.equal(h.text, A.hadeeth);
  assert.equal(h.grade, "صحيح");
  assert.equal(h.attribution, "متفق عليه");
  assert.equal(h.reference, A.reference);
  assert.equal(h.id, "4560");
  assert.equal(h.url, "https://hadeethenc.com/ar/browse/hadith/4560");
  assert.equal(canonicalUrl("4560"), h.url);
  assert.equal(h.sourceId, "hadeethenc:hadith");
  assert.match(h.sourceTitle!, /HadeethEnc/);
  assert.ok(!h.text.includes("<mark>"));
  const sent = new URL(a.log[0]);
  assert.equal(sent.searchParams.get("phrase"), "إنما الأعمال بالنيات");
  assert.equal(sent.searchParams.get("language"), "ar");
  assert.ok(a.log[1].includes("/hadeeths/multiple/") && a.log[1].includes("ids=4560"), "full records are fetched by stable id");
});

test("the grade is preserved exactly as returned, nuance included (never normalised to «صحيح»)", async () => {
  const nuanced = { ...A, grade: "قال النووي: حديث صحيح" };
  const out = await provider(api({ search: [hit(nuanced)], records: [nuanced] })).find("ما صحة حديث إنما الأعمال بالنيات؟");
  assert.equal(out[0].grade, "قال النووي: حديث صحيح");
  const hasan = { ...A, grade: "حسن" };
  assert.equal((await provider(api({ search: [hit(hasan)], records: [hasan] })).find("إنما الأعمال بالنيات"))[0].grade, "حسن");
});

// ── 2. search order is never trusted ─────────────────────────────────────

test("with several search candidates the first is NOT taken blindly: only relevant records are fetched and shown", async () => {
  const a = api({ search: [hit(UNRELATED), hit({ ...UNRELATED, id: "5865", title: "حديث الشفاعة" }), hit(A)], records: [A, UNRELATED] });
  const out = await provider(a).find("ما صحة حديث إنما الأعمال بالنيات؟");
  assert.deepEqual(out.map((h) => h.id), ["4560"]);
  assert.ok(!a.log.some((u) => u.includes("5833")), "the irrelevant first hit is never even fetched");
});

test("two matching records are both shown (at most two), best match first", async () => {
  const B: Rec = { ...A, id: "66511", title: "الأعمال بالنية", hadeeth: A.hadeeth };
  const out = await provider(api({ search: [hit(B), hit(A)], records: [A, B] })).find("إنما الأعمال بالنيات");
  assert.equal(out[0].id, "4560");
  assert.ok(out.length <= 2);
});

// ── 3–5. fail closed ─────────────────────────────────────────────────────

test("a record without a grade (or reference, or text) is rejected — nothing is filled in", async () => {
  for (const bad of [{ ...A, grade: undefined }, { ...A, grade: "  " }, { ...A, reference: undefined }, { ...A, hadeeth: "" }]) {
    const out = await provider(api({ search: [hit(A)], records: [bad as Rec] })).find("إنما الأعمال بالنيات");
    assert.deepEqual(out, []);
  }
});

test("no sufficiently relevant candidate → nothing", async () => {
  assert.deepEqual(await provider(api({ search: [hit(UNRELATED)], records: [UNRELATED] })).find("ما صحة حديث إنما الأعمال بالنيات؟"), []);
  assert.deepEqual(await provider(api({ search: [], records: [] })).find("ما صحة حديث إنما الأعمال بالنيات؟"), []);
});

test("a record whose full text does not match after fetching is dropped (the search hit alone is not evidence)", async () => {
  const swapped = { ...A, title: "عنوان مختلف", hadeeth: "نص لا علاقة له بالموضوع إطلاقًا." };
  assert.deepEqual(await provider(api({ search: [hit(A)], records: [swapped] })).find("إنما الأعمال بالنيات"), []);
});

test("a record whose id does not match the requested one is never used", async () => {
  assert.deepEqual(await provider(api({ search: [hit(A)], records: [{ ...A, id: "999" }] })).find("إنما الأعمال بالنيات"), []);
});

test("timeout, API error and malformed data → nothing (the assistant abstains), never an exception", async () => {
  assert.deepEqual(await provider(api({ search: [], records: [], hang: true })).find("إنما الأعمال بالنيات"), []);
  assert.deepEqual(await provider(api({ search: [hit(A)], records: [A], failSearch: 500 })).find("إنما الأعمال بالنيات"), []);
  assert.deepEqual(await provider(api({ search: [hit(A)], records: [A], failMultiple: 503 })).find("إنما الأعمال بالنيات"), []);
  const garbage = { fetchImpl: (async () => new Response('{"not":"an array"}', { status: 200 })) as unknown as typeof fetch };
  assert.deepEqual(await new HadeethEncProvider({ ...garbage, ignoreRegistry: true }).find("إنما الأعمال بالنيات"), []);
});

test("a broad one-word request that matches many hadith is not answered", async () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ id: String(100 + i), title: `حديث عن الصدق رقم ${i}`, hadeeth: "نص", grade: "صحيح", reference: "مرجع" }));
  assert.deepEqual(await provider(api({ search: many.map((r) => hit(r as Rec)), records: many as Rec[] })).find("اذكر لي حديثا عن الصدق"), []);
});

test("a small TTL cache avoids repeating the same requests", async () => {
  const a = api({ search: [hit(A)], records: [A] });
  const p = provider(a);
  await p.find("إنما الأعمال بالنيات");
  const n = a.log.length;
  await p.find("إنما الأعمال بالنيات");
  assert.equal(a.log.length, n, "second identical question is served from the cache");
});

test("not usable unless the registry approves the source", () => {
  assert.equal(isApproved("hadeethenc:hadith"), true);
  assert.equal(getSource("hadeethenc:hadith")?.kind, "hadith");
  assert.equal(new HadeethEncProvider().available, true);
});

test("off by default (HADITH_PROVIDER)", () => {
  const prev = process.env.HADITH_PROVIDER;
  delete process.env.HADITH_PROVIDER;
  assert.equal(env.hadithProvider(), "off");
  process.env.HADITH_PROVIDER = "hadeethenc";
  assert.equal(env.hadithProvider(), "hadeethenc");
  if (prev === undefined) delete process.env.HADITH_PROVIDER;
  else process.env.HADITH_PROVIDER = prev;
});

// ── in the assistant ─────────────────────────────────────────────────────

class FakeWeb implements WebAnswerer {
  readonly id = "fake-web";
  calls = 0;
  async answer(): Promise<WebAnswer> {
    this.calls++;
    return { status: "answered", text: "x", citations: [{ sourceId: "web:dorar.net", title: "t", ref: "dorar.net", excerpt: "", url: "https://dorar.net/x", sourceKind: "other" }], model: "m" };
  }
}
function assistant(h: HadeethEncProvider | undefined, web?: FakeWeb) {
  const quran = new FakeQuran();
  return createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm: null, generationEnabled: false, hadith: h, web });
}

test("assistant: a hadith question returns the verbatim hadith block, citation with the canonical link, plain text with every field", async () => {
  const a = await assistant(provider(api({ search: [hit(A)], records: [A] }))).answer({ question: "ما صحة حديث إنما الأعمال بالنيات؟" });
  assert.equal(a.abstained, false);
  assert.equal(a.provider, "hadith:hadeethenc");
  const block = a.blocks!.find((b) => b.type === "hadith");
  assert.ok(block && block.type === "hadith");
  if (block?.type !== "hadith") return;
  assert.equal(block.text, A.hadeeth);
  assert.equal(block.grade, "صحيح");
  assert.equal(a.citations[0].url, "https://hadeethenc.com/ar/browse/hadith/4560");
  assert.equal(a.citations[0].sourceKind, "hadith");
  for (const part of [A.hadeeth, "الدرجة: صحيح", "العزو: متفق عليه", "المرجع:", "HadeethEnc", "https://hadeethenc.com/ar/browse/hadith/4560"]) assert.ok(a.text.includes(part), part);
  assert.ok(!a.blocks!.some((b) => b.type === "explanation" && b.origin === "generated"), "no generated prose");
});

test("assistant: a hadith question with no result abstains honestly and NEVER reaches the web fallback", async () => {
  for (const p of [provider(api({ search: [], records: [] })), provider(api({ search: [], records: [], hang: true })), undefined]) {
    const web = new FakeWeb();
    const a = await assistant(p, web).answer({ question: "ما صحة حديث إنما الأعمال بالنيات؟" });
    assert.equal(a.abstained, true);
    assert.equal(a.abstainReason, "no_hadith_source");
    assert.equal(web.calls, 0);
    assert.equal(a.citations.length, 0);
  }
});

test("assistant: fiqh and personal questions never call HadeethEnc", async () => {
  for (const q of ["ما حكم لمس المصحف بدون وضوء؟", "هل مسموح لمس المصحف بدون وضوء؟", "هل يجوز لي أن أطلّق زوجتي إذا غضبت؟", "أفتني في مسألة تخصني", "ما حكم الصلاة في هذا الحديث؟"]) {
    const a = api({ search: [hit(A)], records: [A] });
    const out = await assistant(provider(a)).answer({ question: q });
    assert.equal(a.log.length, 0, `${q}: no HadeethEnc request`);
    assert.notEqual(out.provider, "hadith:hadeethenc", q);
  }
});

test("assistant: non-hadith questions are untouched by the hadith provider", async () => {
  const a = api({ search: [hit(A)], records: [A] });
  const out = await assistant(provider(a)).answer({ question: "اشرح لي الآية ٣ من سورة الملك" });
  assert.equal(a.log.length, 0);
  assert.equal(out.abstained, false);
  assert.equal(out.citations[0].sourceId, "tafsir:muyassar");
});
