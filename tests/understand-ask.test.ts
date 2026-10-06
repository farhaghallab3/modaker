/**
 * Understand & Ask: questions asked about the ayah the learner is on. Covers the new safety rules:
 *  - asbab al-nuzul questions are NEVER answered from ordinary tafsir (explicit abstention without an approved asbab source);
 *  - an ayah that only came from the screen (context) is not used to "answer" unrelated, disputed or personal questions;
 *  - abstentions and referrals carry no misleading citation;
 *  - generated explanations of the current ayah cite their approved source.
 * No Quran text lives here: the fake provider serves ordinary sentences.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompletionRequest, LLMProvider } from "../src/server/llm/provider";
import { createAssistant } from "../src/server/rag/assistant";
import { hasApprovedAsbabSource } from "../src/server/rag/sources";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { routeDeterministic } from "../src/server/safety/router";
import { TEMPLATES } from "../src/server/safety/templates";
import { FakeQuran } from "./_fixtures";

class FakeLlm implements LLMProvider {
  readonly id = "fake-llm";
  requests: CompletionRequest[] = [];
  constructor(private reply = "الشرح يتحدث عن الصبر والثبات [1].") {}
  async complete(req: CompletionRequest) {
    this.requests.push(req);
    return this.reply;
  }
}

function make(llm: FakeLlm | null = null, generation = false) {
  const quran = new FakeQuran();
  return createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm, generationEnabled: generation });
}
const ctx = { surah: 67, ayah: 12 };

// ── asbab al-nuzul ───────────────────────────────────────────────────────

test("the router recognises asbab al-nuzul questions as their own intent (not ordinary explanation)", () => {
  for (const q of ["لماذا نزلت هذه الآية؟", "ما سبب نزول هذه الآية؟", "متى نزلت هذه السورة؟", "في من نزلت هذه الآية؟", "ما أسباب النزول لهذه الآية", "فيم نزلت الآية ١٢"]) {
    assert.equal(routeDeterministic(q, { generationEnabled: true }).intent, "asbab", q);
    assert.equal(routeDeterministic(q, { generationEnabled: true }).generationAllowed, false, `${q}: no generation`);
  }
  for (const q of ["اشرح لي هذه الآية ببساطة", "ما معنى هذه الآية؟", "لماذا يخشى المؤمنون ربهم؟"]) {
    assert.notEqual(routeDeterministic(q, { generationEnabled: true }).intent, "asbab", q);
  }
});

test("there is no approved asbab source yet (the precondition for abstaining)", () => {
  assert.equal(hasApprovedAsbabSource(), false);
});

test("«لماذا نزلت هذه الآية؟» abstains explicitly: no tafsir quote, no generation, no citation presented as a reason of revelation", async () => {
  for (const [llm, gen] of [[null, false], [new FakeLlm(), true]] as const) {
    const a = await make(llm, gen).answer({ question: "لماذا نزلت هذه الآية؟", context: ctx });
    assert.equal(a.answerType, "abstention");
    assert.equal(a.abstained, true);
    assert.equal(a.abstainReason, "no_asbab_source");
    assert.equal(a.generation?.used, false);
    assert.equal(a.citations.length, 0, "tafsir is not offered as the reason of revelation");
    assert.ok(!a.blocks!.some((b) => b.type === "source_quote"));
    assert.match(a.text, /مصدر معتمد لأسباب النزول/);
    assert.equal(a.text.includes(TEMPLATES.noAsbabSource.text), true);
    if (llm) assert.equal(llm.requests.length, 0, "the model was never called");
    // the verified ayah text may be shown (from the Quran provider), never explained
    assert.ok(a.verses?.every((v) => v.surah === 67 && v.ayah === 12));
  }
});

// ── unrelated / disputed / personal questions with an ayah in context ────

test("a personal ruling with an ayah in context is a plain referral: the current ayah's tafsir is NOT attached", async () => {
  const a = await make().answer({ question: "هل يجوز لي أن أطلّق زوجتي إذا غضبت؟", context: ctx });
  assert.equal(a.safetyLevel, "D");
  assert.equal(a.answerType, "referral");
  assert.equal(a.citations.length, 0);
  assert.ok(!a.blocks!.some((b) => b.type === "source_quote"));
});

test("a general fiqh question with an ayah in context abstains (knowledge gap) instead of quoting this ayah's tafsir as a ruling source", async () => {
  const a = await make().answer({ question: "ما حكم لمس المصحف بدون وضوء؟", context: ctx });
  assert.equal(a.safetyLevel, "C");
  assert.equal(a.abstained, true);
  assert.equal(a.abstainReason, "no_fiqh_source");
  assert.equal(a.citations.length, 0);
});

test("an off-topic question with an ayah in context is redirected", async () => {
  const a = await make().answer({ question: "ما سعر الدولار اليوم؟", context: ctx });
  assert.equal(a.answerType, "scope_redirect");
  assert.equal(a.citations.length, 0);
});

test("when the model says the passages are insufficient, the abstention shows no citation and no verses", async () => {
  const llm = new FakeLlm("INSUFFICIENT");
  const a = await make(llm, true).answer({ question: "ما فضل الصدقة؟", context: ctx });
  assert.equal(a.abstained, true);
  assert.equal(a.abstainReason, "no_evidence");
  assert.equal(a.citations.length, 0);
  assert.equal(a.verses, undefined);
});

// ── grounded explanation of the current ayah ─────────────────────────────

test("«اشرح لي هذه الآية ببساطة» with the current ayah: generated text, cited to the approved tafsir, verified", async () => {
  const llm = new FakeLlm("الآية تتحدث عن الصبر والثبات [1]. وهي تدعو إلى الثبات [1].");
  const a = await make(llm, true).answer({ question: "اشرح لي هذه الآية ببساطة", context: ctx });
  assert.equal(a.abstained, false);
  assert.equal(a.generation?.used, true);
  assert.equal(a.citations.length, 1);
  assert.equal(a.citations[0].sourceId, "tafsir:muyassar");
  assert.match(a.citations[0].ref, /١٢/);
  // the model was given ONLY the approved passage of the current ayah
  const sent = llm.requests[0].messages[0].content;
  assert.match(sent, /الملك ١٢|67:12|١٢/);
  assert.match(llm.requests[0].system, /لا تكتب نص أي آية/);
});

test("an explanation sentence without a valid citation is removed (the verifier still guards generation)", async () => {
  const llm = new FakeLlm("جملة بلا توثيق. الآية تتحدث عن الصبر والثبات [1].");
  const a = await make(llm, true).answer({ question: "ما معنى هذه الآية؟", context: ctx });
  assert.equal(a.generation?.used, true);
  assert.doesNotMatch(a.text, /جملة بلا توثيق/);
});

test("with no model configured the same question still returns the sourced tafsir (extractive), never nothing", async () => {
  const a = await make(null, false).answer({ question: "ما معنى هذه الآية؟", context: ctx });
  assert.equal(a.abstained, false);
  assert.equal(a.provider, "extractive");
  assert.ok(a.citations.length >= 1);
});

// ── voice question guard ─────────────────────────────────────────────────
import { looksLikeNoSpeech } from "../src/lib/assistant/voice";

test("voice: a hallucinated transcript of silence (high no-speech probability) is not shown as a question", () => {
  // measured: whisper-1 on 2 s of silence → «اشتركوا في القناة», noSpeechProb 0.94
  const silence = { text: "اشتركوا في القناة", durationSec: 2, evidence: { kind: "segment-logprobs" as const, lowConfidenceSegments: [{ start: 1.06, end: 1.98, avgLogprob: -0.47, noSpeechProb: 0.94, compressionRatio: 0.74 }] } };
  assert.equal(looksLikeNoSpeech(silence), true);
  assert.equal(looksLikeNoSpeech({ text: "", durationSec: 3 }), true);
});

test("voice: real speech passes (no flagged segment, or only a short flagged tail)", () => {
  assert.equal(looksLikeNoSpeech({ text: "ما معنى هذه الآية", durationSec: 3, evidence: { kind: "segment-logprobs", lowConfidenceSegments: [] } }), false);
  assert.equal(
    looksLikeNoSpeech({ text: "ما معنى هذه الآية", durationSec: 6, evidence: { kind: "segment-logprobs", lowConfidenceSegments: [{ start: 5, end: 6, avgLogprob: -0.4, noSpeechProb: 0.8, compressionRatio: 1 }] } }),
    false,
  );
});

// ── optional web answerer: strictly a fallback, never ahead of approved sources or the asbab rule ─────
import type { WebAnswer, WebAnswerer } from "../src/server/rag/web-answer";
import { env } from "../src/server/env";

class FakeWeb implements WebAnswerer {
  readonly id = "fake-web";
  calls = 0;
  async answer(): Promise<WebAnswer> {
    this.calls++;
    return { status: "answered", text: "جواب من موقع موثوق.", citations: [{ sourceId: "web:test", title: "موقع موثوق", ref: "https://example.test/a", excerpt: "…", sourceKind: "other" }], model: "fake" };
  }
}
function makeWithWeb(web: FakeWeb, llm: FakeLlm | null = null, generation = false) {
  const quran = new FakeQuran();
  return createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm, generationEnabled: generation, web });
}

test("the web answerer is OFF unless explicitly configured (key AND ASSISTANT_WEB_SEARCH=on)", () => {
  const prev = process.env.ASSISTANT_WEB_SEARCH;
  delete process.env.ASSISTANT_WEB_SEARCH;
  assert.equal(env.assistantWebSearch(), false);
  process.env.ASSISTANT_WEB_SEARCH = "on";
  assert.equal(env.assistantWebSearch(), true);
  if (prev === undefined) delete process.env.ASSISTANT_WEB_SEARCH;
  else process.env.ASSISTANT_WEB_SEARCH = prev;
});

test("with the web answerer configured, asbab questions STILL abstain and the web is never consulted", async () => {
  const web = new FakeWeb();
  const a = await makeWithWeb(web).answer({ question: "لماذا نزلت هذه الآية؟", context: ctx });
  assert.equal(a.abstainReason, "no_asbab_source");
  assert.equal(web.calls, 0);
});

test("with the web answerer configured, an ayah explanation is still answered from the approved tafsir (web not consulted)", async () => {
  const web = new FakeWeb();
  const llm = new FakeLlm("الآية تتحدث عن الصبر والثبات [1].");
  const a = await makeWithWeb(web, llm, true).answer({ question: "اشرح لي هذه الآية ببساطة", context: ctx });
  assert.equal(a.abstained, false);
  assert.equal(a.citations[0].sourceId, "tafsir:muyassar");
  assert.equal(a.generation?.used, true);
  assert.equal(web.calls, 0, "approved sources are authoritative");
});

test("personal rulings and off-topic questions never reach the web answerer", async () => {
  const web = new FakeWeb();
  for (const q of ["هل يجوز لي أن أطلّق زوجتي إذا غضبت؟", "ما سعر الدولار اليوم؟"]) {
    const a = await makeWithWeb(web).answer({ question: q, context: ctx });
    assert.equal(a.citations.length, 0, q);
  }
  assert.equal(web.calls, 0);
});

test("the web answerer is only a FALLBACK after the approved sources found nothing — and attaches no unrelated ayah from the screen", async () => {
  const web = new FakeWeb();
  const a = await makeWithWeb(web).answer({ question: "ما حكم لمس المصحف بدون وضوء؟", context: ctx });
  assert.equal(web.calls, 1);
  assert.equal(a.provider, "anthropic-web:fake");
  assert.ok(a.citations.every((c) => c.sourceId !== "tafsir:muyassar" && !/١٢/.test(c.ref)), "no citation of the ayah on screen");
  assert.equal(a.verses, undefined);
  // without the web answerer the same question is the plain fiqh-gap abstention
  const plain = await make().answer({ question: "ما حكم لمس المصحف بدون وضوء؟", context: ctx });
  assert.equal(plain.abstainReason, "no_fiqh_source");
});
