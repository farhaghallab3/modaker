/**
 * «الشيخ المعلّم» (server): writes what the teacher says after a recitation, with a free AI model when one is set up
 * (Groq's free tier; OpenAI when that key exists instead), from the FACTS the app computed. The model only phrases:
 * praise, encouragement, and the order of the corrections. Its answer is validated (no Quran text, no ruling, only
 * the words and numbers in the facts) and replaced by the fixed template on ANY failure.
 */
import { parseScriptJson, templateScript, validateScript, type ScriptSegment, type TeacherFacts } from "@/lib/recitation/teacher-script";
import { env } from "./env";
import type { LLMProvider } from "./llm/provider";
import { OpenAiChatProvider } from "./llm/openai";

const TIMEOUT_MS = 9_000;

export const TEACHER_SYSTEM = `أنت «الشيخ المعلّم» في تطبيق مُدّكِر لحفظ القرآن الكريم: شيخ حنون صبور يسمع تلاوة المتعلّم ثم يكلّمه بصوته.
ستُعطى حقائق تلاوته الآن في JSON (حسبها التطبيق، فلا تخترع غيرها). اكتب ما تقوله له بعد أن ظهرت النتيجة.

معنى الحقول:
- ayahs: كل آية: status (mastered متقنة، needs-review فيها ما يُراجع، uncertain لم نتأكد، missed فائتة)، wordsTotal وwordsCorrect، وheardByTajweedChecker (سُمع صوته فيها).
- wordProblems: كلمات فيها شيء: omitted لم يقرأها، different قرأها بشكل مختلف (وقد يكون الخطأ في السماع الآلي، فلا تجزم)، unclear لم نتبيّنها. place: موضعها بالكلام.
- notRecited: آيات لم نسمع منها كلمة. إن كانت heardByTajweedChecker فقد سُمع صوته فيها لكن لم تُتبيَّن الكلمات.
- tajweedNotes: ملاحظات تجويد، وwhat هو الشرح الصحيح الذي تقوله (يمكنك تبسيطه قليلًا دون تغيير معناه).
- tajweedGood: أحكام تجويد قرأها جيدًا (للمديح المحدّد).
- alreadySaid: جملة قلتها له قبل قليل؛ لا تكرّرها، بل أكمل بعدها.

كيف تتكلم:
1) ابدأ بمديح صادق ومحدّد مما أصاب فيه (آيات متقنة، حكم أحسنه من tajweedGood). إن كانت النتيجة ضعيفة فشجّعه بلطف.
2) قل له بوضوح ما قرأه وما لم نسمعه (notRecited) بالآيات.
3) لكل كلمة فيها شيء (wordProblems ثم tajweedNotes، أربع على الأكثر): اذكر موضعها (place) وما المطلوب ببساطة، ثم قل «اسمعها من الشيخ» وضع بعدها مقطع الكلمة {"word":"<id>"} ليسمعها بصوت القارئ.
4) اختم بتشجيع ودعوة لإعادة المحاولة.

قواعد صارمة:
- لا تكتب أي كلمة من القرآن ولا آية ولا جزءًا منها أبدًا. للإشارة إلى كلمة استعمل مقطع {"word":"<id>"} من الحقائق فقط؛ صوتك لا يقرأ القرآن.
- عربية فصحى بسيطة جدًا، جمل قصيرة دافئة، بلا مبالغة ولا تكرار. خاطبه بصيغة عامة.
- لا حديث ولا فتوى ولا حكم شرعي، ولا شرح تجويد غير الموجود في الحقائق، ولا رقم غير موجود فيها.
- إن لم يكن شيء يُصحَّح فامدحه وادعُ له باختصار.

أجب بـ JSON فقط:
{"segments":[{"say":"…"},{"say":"… اسمعها من الشيخ:"},{"word":"w2_0"},{"say":"…"}]}
اثنا عشر مقطعًا على الأكثر، وكل say جملة أو جملتان.`;

/** The free model for the teacher: Groq when its key is set (also used for speech recognition), else OpenAI, else none. */
export function teacherModel(): LLMProvider | null {
  if (!env.coachAi()) return null;
  if (env.groqApiKey()) return new OpenAiChatProvider(env.groqApiKey(), env.teacherModel(), env.groqBaseUrl());
  if (env.openaiApiKey()) return new OpenAiChatProvider(env.openaiApiKey(), env.coachModel());
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("teacher timeout")), ms))]);
}

export interface TeacherScriptResult {
  source: "ai" | "template";
  segments: ScriptSegment[];
}

export async function writeTeacherScript(
  facts: TeacherFacts,
  ayahTexts: string[],
  seed: number,
  llm: LLMProvider | null = teacherModel(),
  timeoutMs = TIMEOUT_MS,
): Promise<TeacherScriptResult> {
  if (llm) {
    const started = Date.now();
    try {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const left = timeoutMs - (Date.now() - started);
        if (left <= 500) break;
        const text = await withTimeout(
          llm.complete({ system: TEACHER_SYSTEM, messages: [{ role: "user", content: JSON.stringify({ facts }) }], maxTokens: 900, temperature: 0.6 }),
          left,
        );
        const segments = validateScript(parseScriptJson(text), facts, ayahTexts);
        if (segments) return { source: "ai", segments };
        console.warn(`[teacher] model script rejected by validation (attempt ${attempt})`);
      }
    } catch (e) {
      console.warn("[teacher] AI unavailable; using template:", (e as Error).message);
    }
  }
  return { source: "template", segments: templateScript(facts, seed) };
}
