/**
 * Guard classification, LLM-output sanitisation and the full assistant
 * pipeline with fake providers.
 *
 * As everywhere in this repo, NO Quran text appears here: the fake provider
 * serves ordinary Arabic sentences, and surah names are metadata only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getSurahMeta } from "../src/lib/quran/surahs";
import type { Ayah, SurahText, TafsirEntry } from "../src/lib/types";
import { QuranSourceUnavailableError } from "../src/server/errors";
import type { LLMProvider, CompletionRequest } from "../src/server/llm/provider";
import type { QuranProvider } from "../src/server/quran/common";
import { createAssistant } from "../src/server/rag/assistant";
import { classifyQuestion, NEEDS_SCHOLAR_TEXT, OFF_TOPIC_TEXT } from "../src/server/rag/guard";
import { INSUFFICIENT_SENTINEL } from "../src/server/rag/prompt";
import { seededRandom } from "../src/server/rag/quiz";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { looksLikeVerse, sanitizeLlmOutput, VERSE_PLACEHOLDER } from "../src/server/rag/sanitize";

// ── classifyQuestion ─────────────────────────────────────────────────────

test("fatwa: personal rulings and jurisprudence", () => {
  for (const q of [
    "هل يجوز أن أصلي وأنا جالس؟",
    "ما حكم قراءة القرآن بدون وضوء؟",
    "هل علي كفارة إذا نسيت النذر؟",
    "أريد فتوى في مسألة طلاق",
    "كم نصيب البنت من الميراث؟",
    "كيف أحسب زكاة مالي؟",
    "هل صلاتي صحيحة إذا أخطأت في الفاتحة؟",
    "هل هذا العمل حلال أم حرام؟",
    "طلقت زوجتي مرتين فماذا أفعل",
  ]) {
    assert.equal(classifyQuestion(q), "fatwa", q);
  }
});

test("'ما معنى' and explanatory framings are NOT fatwa", () => {
  assert.equal(classifyQuestion("ما معنى الآية ٣٢ من سورة مريم؟"), "explain");
  assert.equal(classifyQuestion("ما معنى كلمة الحلال في سورة البقرة"), "word-meaning");
  assert.equal(classifyQuestion("اشرح لي آيات الميراث في سورة النساء"), "explain");
  assert.notEqual(classifyQuestion("ما المقصود بالمسجد الحرام في سورة الإسراء"), "fatwa");
  assert.notEqual(classifyQuestion("ما معنى الزكاة في هذه الآية"), "fatwa");
});

test("tajweed 'rules' are not treated as fiqh rulings", () => {
  assert.notEqual(classifyQuestion("ما حكم الإدغام في هذه الآية؟"), "fatwa");
});

test("quran-text, quiz, story, word-meaning, explain, general", () => {
  assert.equal(classifyQuestion("اعرض الآية 5 من سورة الملك"), "quran-text");
  assert.equal(classifyQuestion("اكتب لي الآيات من 1 إلى 3 من سورة الكهف"), "quran-text");
  assert.equal(classifyQuestion("اختبرني في سورة الملك"), "quiz");
  assert.equal(classifyQuestion("سمّع لي سورة يس"), "quiz");
  assert.equal(classifyQuestion("ما قصة أصحاب الكهف؟"), "story");
  assert.equal(classifyQuestion("ماذا حدث ليوسف مع إخوته؟"), "story");
  assert.equal(classifyQuestion("ما معنى كلمة الصمد؟"), "word-meaning");
  assert.equal(classifyQuestion("لماذا سميت سورة البقرة بهذا الاسم؟"), "explain");
  assert.equal(classifyQuestion("كم عدد آيات سورة الملك؟"), "general");
});

test("the word 'اختبار' inside an explanatory question is not a quiz request", () => {
  assert.notEqual(classifyQuestion("ما الحكمة من الاختبار في سورة الملك؟"), "quiz");
});

test("off-topic: coding, sports, weather — unless tied to the Quran", () => {
  assert.equal(classifyQuestion("كيف أكتب كود بايثون لترتيب قائمة؟"), "off-topic");
  assert.equal(classifyQuestion("من سيفوز في مباراة ريال مدريد؟"), "off-topic");
  assert.equal(classifyQuestion("what is the weather tomorrow"), "off-topic");
  assert.notEqual(classifyQuestion("هل يوجد تطبيق برمجة يساعد في حفظ القرآن؟"), "off-topic");
});

// ── sanitizeLlmOutput ────────────────────────────────────────────────────

test("sanitize strips ornate-bracket quotes", () => {
  const r = sanitizeLlmOutput("المعنى العام هو الصبر ﴿نص طويل هنا بين قوسين﴾ والثبات [1]");
  assert.ok(!r.text.includes("﴿") && !r.text.includes("نص طويل"));
  assert.ok(r.text.includes(VERSE_PLACEHOLDER));
  assert.ok(r.text.includes("[1]"));
});

test("sanitize strips Uthmani-marked fragments and vocalised quotes, keeps plain quotes", () => {
  const marked = sanitizeLlmOutput("قال المفسر كذا. ثم كتب ٱلطَّالِبُ ذَهَبَ ۖ إلى المدرسة. والخلاصة واضحة.");
  assert.ok(!marked.text.includes("ٱلطَّالِبُ"));
  assert.ok(marked.text.includes("والخلاصة واضحة"));

  const vocalised = "«ذَهَبَ الطَّالِبُ إِلَى المَدْرَسَةِ صَبَاحًا»";
  assert.ok(looksLikeVerse(vocalised.slice(1, -1)));
  assert.ok(!sanitizeLlmOutput(`وفي ذلك ${vocalised} عبرة`).text.includes("المَدْرَسَةِ"));

  const plain = "قال صاحب التفسير «إن المقصود هنا هو الحث على العمل والاجتهاد» [1]";
  assert.equal(sanitizeLlmOutput(plain).text, plain);
});

test("sanitize treats a quote introduced by 'قال تعالى' as a verse", () => {
  const r = sanitizeLlmOutput("قال تعالى: «جملة عادية بلا تشكيل هنا» [1]");
  assert.ok(!r.text.includes("جملة عادية"));
});

test("sanitize removes 5+ word runs that match a known verified verse", () => {
  const known = ["ذَهَبَ ٱلطَّالِبُ إِلَى ٱلْمَدْرَسَةِ صَبَاحًا مَعَ أَصْدِقَائِهِ"];
  const r = sanitizeLlmOutput("يبين النص أن ذهب الطالب الى المدرسة صباحا مع اصدقائه وهذا يدل على الجد [1]", { knownVerses: known });
  assert.ok(!r.text.includes("المدرسة"));
  assert.ok(r.text.includes("يدل على الجد"));
  assert.equal(r.removed, 1);
});

// ── Pipeline with fakes ──────────────────────────────────────────────────

const SENTENCES = ["ذهب الطالب إلى المدرسة مبكرا", "وقرأ الكتاب في المكتبة الهادئة", "ثم ساعد صديقه في حل الواجب", "وعاد إلى البيت سعيدا بما تعلم"];

function fakeSurah(n: number): SurahText {
  const meta = getSurahMeta(n)!;
  const ayahs: Ayah[] = Array.from({ length: meta.ayahCount }, (_, i) => ({
    surah: n,
    ayah: i + 1,
    key: `${n}:${i + 1}`,
    textUthmani: `${SENTENCES[i % SENTENCES.length]} في اليوم رقم ${i + 1}`,
  }));
  return { meta, ayahs, source: { id: "test:quran", title: "مصدر اختبار" } };
}

class FakeQuran implements QuranProvider {
  readonly id = "fake";
  calls = 0;
  constructor(private down = false) {}
  async getSurah(n: number) {
    this.calls++;
    if (this.down) throw new QuranSourceUnavailableError("down");
    return fakeSurah(n);
  }
  async getAyahs(r: { surah: number; from: number; to: number }) {
    return (await this.getSurah(r.surah)).ayahs.slice(r.from - 1, r.to);
  }
  async getTafsir(n: number): Promise<TafsirEntry[]> {
    if (this.down) throw new QuranSourceUnavailableError("down");
    return fakeSurah(n).ayahs.map((a) => ({
      key: a.key,
      text: `شرح تجريبي للموضع ${a.ayah}: يتحدث عن ${a.ayah % 2 ? "الصبر والثبات" : "العمل والاجتهاد"} في طلب العلم.`,
      source: { id: "tafsir:muyassar", title: "التفسير الميسر" },
    }));
  }
}

class FakeLlm implements LLMProvider {
  readonly id = "fake-llm";
  requests: CompletionRequest[] = [];
  constructor(private reply: string) {}
  async complete(req: CompletionRequest) {
    this.requests.push(req);
    return this.reply;
  }
}

function make(opts: { llm?: FakeLlm | null; down?: boolean } = {}) {
  const quran = new FakeQuran(opts.down);
  const assistant = createAssistant({
    quran,
    retriever: new TafsirRetriever(quran, "muyassar"),
    llm: opts.llm ?? null,
    random: seededRandom(42),
  });
  return { quran, assistant };
}

test("fatwa → needs-scholar with the exact required text, never calls the LLM", async () => {
  const llm = new FakeLlm("should not be used");
  const { assistant } = make({ llm });
  const a = await assistant.answer({ question: "هل يجوز تأخير الصلاة بسبب العمل؟" });
  assert.equal(a.kind, "needs-scholar");
  assert.ok(a.text.startsWith(NEEDS_SCHOLAR_TEXT));
  assert.equal(llm.requests.length, 0);
});

test("fatwa about a referenced ayah offers related tafsir sources", async () => {
  const { assistant } = make();
  const a = await assistant.answer({ question: "ما حكم من ترك العمل بالآية 3 من سورة الملك؟" });
  assert.equal(a.kind, "needs-scholar");
  assert.ok(a.text.startsWith(NEEDS_SCHOLAR_TEXT));
  assert.ok(a.citations.length >= 1);
  assert.equal(a.citations[0].sourceId, "tafsir:muyassar");
});

test("off-topic → polite redirect, no retrieval", async () => {
  const { assistant, quran } = make();
  const a = await assistant.answer({ question: "كيف أتعلم البرمجة بلغة بايثون؟" });
  assert.equal(a.kind, "insufficient");
  assert.equal(a.text, OFF_TOPIC_TEXT);
  assert.equal(quran.calls, 0);
});

test("extractive mode quotes retrieved tafsir verbatim with citations and attaches verses", async () => {
  const { assistant } = make();
  const a = await assistant.answer({ question: "ما معنى الآية 5 من سورة الملك؟" });
  assert.equal(a.kind, "grounded");
  assert.equal(a.provider, "extractive");
  assert.ok(a.text.includes("شرح تجريبي للموضع 5"));
  assert.equal(a.citations[0].sourceId, "tafsir:muyassar");
  assert.equal(a.verses?.length, 1);
  assert.equal(a.verses?.[0].key, "67:5");
});

test("UI context supplies the ayah when the question says 'هذه الآية'", async () => {
  const { assistant } = make();
  const a = await assistant.answer({ question: "ما معنى هذه الآية؟", context: { surah: 67, ayah: 7 } });
  assert.equal(a.kind, "grounded");
  assert.equal(a.verses?.[0].key, "67:7");
});

test("LLM answer is sanitised and citations are renumbered to the cited passages", async () => {
  const llm = new FakeLlm("الآية تحث على الاجتهاد [2] وتذكر الصبر [1] ﴿نص مقتبس لا يجوز﴾");
  const { assistant } = make({ llm });
  const a = await assistant.answer({ question: "اشرح الآيات 1-3 من سورة الملك" });
  assert.equal(a.kind, "grounded");
  assert.equal(a.provider, "fake-llm");
  assert.ok(!a.text.includes("﴿"));
  assert.ok(a.text.includes("[1]") && a.text.includes("[2]"));
  assert.equal(a.citations.length, 2);
  // the model's [2] (ayah 2) is now citation 1
  assert.ok(a.citations[0].ref.includes("٢"));
  // the prompt carried the numbered passages and the no-verses rule
  assert.match(llm.requests[0].system, /لا تكتب نص أي آية/);
  assert.match(llm.requests[0].messages[0].content, /\[1\] \(التفسير الميسر/);
});

test("LLM sentinel → insufficient", async () => {
  const { assistant } = make({ llm: new FakeLlm(INSUFFICIENT_SENTINEL) });
  const a = await assistant.answer({ question: "ما معنى الآية 4 من سورة الملك؟" });
  assert.equal(a.kind, "insufficient");
});

test("no references and no semantic index → insufficient (never guesses)", async () => {
  const { assistant } = make({ llm: new FakeLlm("لن يُستخدم") });
  const a = await assistant.answer({ question: "ما فضل الصبر؟" });
  assert.equal(a.kind, "insufficient");
  assert.equal(a.citations.length, 0);
});

test("quran-text returns provider verses and a citation, without the LLM", async () => {
  const llm = new FakeLlm("x");
  const { assistant } = make({ llm });
  const a = await assistant.answer({ question: "اعرض الآية 3 من سورة الملك" });
  assert.equal(a.kind, "quran-text");
  assert.deepEqual(a.verses?.map((v) => v.key), ["67:3"]);
  assert.equal(a.citations.length, 1);
  assert.equal(llm.requests.length, 0);
});

test("quiz uses three verified ayahs and shows only their opening words", async () => {
  const { assistant } = make();
  const a = await assistant.answer({ question: "اختبرني في سورة الملك" });
  assert.equal(a.kind, "quran-text");
  assert.equal(a.verses?.length, 3);
  for (const v of a.verses!) {
    const opening = v.textUthmani.split(" ").slice(0, 3).join(" ");
    assert.ok(a.text.includes(opening), "prompt shows the opening words");
    assert.ok(!a.text.includes(v.textUthmani), "never the full ayah");
  }
});

test("quiz without a surah asks the user to pick one", async () => {
  const { assistant } = make();
  const a = await assistant.answer({ question: "اختبرني" });
  assert.equal(a.kind, "insufficient");
});

test("provider outage → unavailable", async () => {
  const { assistant } = make({ down: true });
  const a = await assistant.answer({ question: "ما معنى الآية 2 من سورة الملك؟" });
  assert.equal(a.kind, "unavailable");
});
