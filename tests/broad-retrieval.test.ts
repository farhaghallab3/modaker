/**
 * Whole-Muyassar grounded retrieval + Quranic-story mapping.
 *  - a general Quran-based question with no surah/ayah is answered ONLY from approved tafsir passages found by search;
 *  - no evidence → abstain (the model is never asked, nothing is invented);
 *  - fiqh rulings, personal rulings, hadith and asbab keep their boundaries (broad search is for Level B only);
 *  - a Quranic story resolves to a fixed Quran range and is answered from that range's tafsir, never from the demo story copy.
 * No Quran text lives here: the tafsir below is ordinary invented prose used as a corpus.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompletionRequest, LLMProvider } from "../src/server/llm/provider";
import type { TafsirEntry } from "../src/lib/types";
import { createAssistant } from "../src/server/rag/assistant";
import { TafsirRetriever } from "../src/server/rag/retriever";
import { resolveStoryRanges } from "../src/server/rag/story-ranges";
import type { WebAnswer, WebAnswerer } from "../src/server/rag/web-answer";
import { FakeQuran, fakeSurah } from "./_fixtures";

/** A corpus where only a few positions carry the topic words; everything else is neutral filler. */
const SPECIAL: Record<string, string> = {
  "2:62": "بيّنت الآية حال اليهود والنصارى والصابئين وأن من آمن منهم بالله واليوم الآخر وعمل صالحًا فله أجره عند ربه.",
  "5:14": "ومن الذين قالوا نحن نصارى أخذ الله عليهم العهد فنسوا نصيبًا مما ذُكّروا به، فأوقع بينهم العداوة والبغضاء.",
  "5:6": "أمر الله المؤمنين إذا أرادوا الصلاة بغسل الوجوه والأيدي في الوضوء، وبالتيمم عند فقد الماء.",
  "56:79": "لا يمس هذا المصحف المحفوظ إلا الملائكة المطهرون، وفي الآية تعظيم للقرآن.",
  "18:10": "حين لجأ الفتية إلى الكهف دعوا ربهم أن يؤتيهم رحمة من عنده وأن يهيئ لهم من أمرهم رشدًا.",
  "18:13": "نقصّ عليك خبر أصحاب الكهف بالحق: فتية آمنوا بربهم وزادهم الله هدى.",
  "18:19": "بعثهم الله من نومهم الطويل في الكهف فتساءلوا كم لبثوا، ثم أرسلوا أحدهم بنقودهم إلى المدينة ليشتري طعامًا.",
};

class CorpusQuran extends FakeQuran {
  override async getTafsir(n: number): Promise<TafsirEntry[]> {
    return fakeSurah(n).ayahs.map((a) => ({
      key: a.key,
      text: SPECIAL[a.key] ?? `نص عام رقم ${a.ayah} لا صلة له بموضوع السؤال.`,
      source: { id: "tafsir:muyassar", title: "التفسير الميسر" },
    }));
  }
}

class FakeLlm implements LLMProvider {
  readonly id = "fake-llm";
  requests: CompletionRequest[] = [];
  constructor(private reply: string | ((req: CompletionRequest) => string)) {}
  async complete(req: CompletionRequest) {
    this.requests.push(req);
    return typeof this.reply === "function" ? this.reply(req) : this.reply;
  }
}
class FakeWeb implements WebAnswerer {
  readonly id = "fake-web";
  calls = 0;
  async answer(): Promise<WebAnswer> {
    this.calls++;
    return { status: "answered", text: "x", citations: [], model: "fake" };
  }
}

function make(llm: FakeLlm | null, web?: FakeWeb) {
  const quran = new CorpusQuran();
  return createAssistant({ quran, retriever: new TafsirRetriever(quran, "muyassar"), llm, generationEnabled: Boolean(llm), web });
}

// ── broad Quran-grounded factual questions ───────────────────────────────

test("«من هم النصارى؟» with no ayah: answered from the approved tafsir passages that mention them, cited, verified", async () => {
  const web = new FakeWeb();
  const llm = new FakeLlm("ذكر التفسير أن النصارى جماعة من أهل الكتاب، وأن من آمن منهم بالله واليوم الآخر فله أجره [1]. وبيّن أن بينهم العداوة والبغضاء [2].");
  const a = await make(llm, web).answer({ question: "من هم النصارى؟" });
  assert.equal(a.abstained, false);
  assert.equal(a.generation?.used, true);
  assert.ok(a.citations.length >= 1 && a.citations.every((c) => c.sourceId === "tafsir:muyassar"));
  const sent = llm.requests[0].messages[0].content;
  assert.match(sent, /النصارى/);
  assert.doesNotMatch(sent, /نص عام رقم/, "only passages that matched the question reach the model");
  assert.equal(web.calls, 0);
});

test("the same question with no model configured quotes the matching tafsir (extractive), never nothing", async () => {
  const a = await make(null).answer({ question: "من هم النصارى؟" });
  assert.equal(a.abstained, false);
  assert.equal(a.provider, "extractive");
  assert.ok(a.citations.length >= 1);
  assert.ok(a.blocks!.some((b) => b.type === "source_quote"));
});

test("no matching tafsir → abstain; the model is never asked and nothing is attached", async () => {
  const llm = new FakeLlm("جواب من الذاكرة [1].");
  const a = await make(llm).answer({ question: "ما الحكمة من خلق الذباب؟" });
  assert.equal(a.abstained, true);
  assert.equal(a.abstainReason, "no_evidence");
  assert.equal(a.citations.length, 0);
  assert.equal(llm.requests.length, 0);
});

test("an exact ayah in the question still uses the exact-ayah path (not search)", async () => {
  const a = await make(null).answer({ question: "اشرح لي الآية ٦٢ من سورة البقرة" });
  assert.equal(a.abstained, false);
  assert.match(a.citations[0].ref, /٦٢/);
});

// ── boundaries: broad search is for Level B only ─────────────────────────

test("fiqh questions are NOT answered from tafsir by keyword search (no approved fiqh source → abstain)", async () => {
  for (const q of ["هل مسموح لمس المصحف بدون وضوء؟", "ما حكم لمس المصحف بدون وضوء؟", "هل يجوز مس المصحف بغير وضوء؟"]) {
    const llm = new FakeLlm("لا بأس [1].");
    const a = await make(llm).answer({ question: q });
    assert.equal(a.abstained, true, q);
    assert.equal(a.abstainReason, "no_fiqh_source", q);
    assert.equal(a.citations.length, 0, q);
    assert.equal(llm.requests.length, 0, q);
  }
});

test("a personal situation is still a Level D referral with no citation", async () => {
  const a = await make(new FakeLlm("x [1]")).answer({ question: "هل يجوز لي أن أطلّق زوجتي إذا غضبت؟" });
  assert.equal(a.safetyLevel, "D");
  assert.equal(a.answerType, "referral");
  assert.equal(a.citations.length, 0);
});

test("hadith and asbab questions keep their own boundaries (no search-based answer)", async () => {
  const llm = new FakeLlm("x [1]");
  const h = await make(llm).answer({ question: "ما صحة حديث إنما الأعمال بالنيات؟" });
  assert.equal(h.abstained, true);
  assert.equal(h.abstainReason, "no_hadith_source");
  const s = await make(llm).answer({ question: "لماذا نزلت آية الكرسي؟" });
  assert.equal(s.abstainReason, "no_asbab_source");
  assert.equal(llm.requests.length, 0);
});

// ── Quranic stories ──────────────────────────────────────────────────────

test("story names resolve to explicit Quran ranges (and only to those)", () => {
  const kahf = resolveStoryRanges("احكي لي قصة أصحاب الكهف");
  assert.ok(kahf && kahf.every((r) => r.surah === 18 && r.from >= 9 && r.to <= 26));
  assert.ok(resolveStoryRanges("حدثني عن موسى والخضر")?.every((r) => r.surah === 18 && r.from >= 60 && r.to <= 82));
  assert.ok(resolveStoryRanges("قصة ذي القرنين")?.every((r) => r.surah === 18 && r.from >= 83 && r.to <= 98));
  assert.ok(resolveStoryRanges("قصة يوسف")?.every((r) => r.surah === 12));
  assert.equal(resolveStoryRanges("ما معنى الصبر؟"), null);
  assert.equal(resolveStoryRanges("احكِ لي قصة طالوت"), null);
});

test("«احكي لي قصة أصحاب الكهف»: answered from the tafsir of 18:9–26 only, cited, no demo story copy, no verses attached", async () => {
  const web = new FakeWeb();
  const llm = new FakeLlm("لجأ الفتية إلى الكهف ودعوا ربهم [1]. ثم بعثهم الله من نومهم الطويل [2].");
  const a = await make(llm, web).answer({ question: "احكي لي قصة أصحاب الكهف" });
  assert.equal(a.abstained, false);
  assert.equal(a.generation?.used, true);
  assert.ok(a.citations.length >= 1);
  for (const c of a.citations) {
    assert.equal(c.sourceId, "tafsir:muyassar");
    assert.match(c.ref, /الكهف/);
  }
  const sent = llm.requests[0].messages[0].content;
  assert.match(sent, /الكهف/);
  assert.doesNotMatch(sent, /الرحلة|يوسف|مريم/, "nothing outside the mapped range, no demo story summaries");
  assert.equal(a.verses, undefined, "a story is not a verse selection");
  assert.equal(web.calls, 0);
});

test("a story with no mapping and no matching tafsir abstains", async () => {
  const llm = new FakeLlm("x [1]");
  const a = await make(llm).answer({ question: "احكِ لي قصة طالوت وجالوت" });
  assert.equal(a.abstained, true);
  assert.equal(llm.requests.length, 0);
});
