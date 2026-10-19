/**
 * Session Coach generation (server). The facts are computed on the device from the learner's persisted state; the
 * LLM only writes 2–3 short Arabic sentences and picks among the computed actions. Its answer is validated against
 * the facts (src/lib/coach/validate.ts) and replaced by the deterministic template on ANY failure.
 * No Quran text, religious content or recitation result is ever requested from or accepted from the model.
 */
import { BRAND } from "@/lib/brand";
import type { CoachActionId, CoachInput } from "@/lib/coach/facts";
import { parseJsonLoose, validateCoachAnswer } from "@/lib/coach/validate";
import { env } from "../env";
import type { LLMProvider } from "../llm/provider";
import { OpenAiChatProvider } from "../llm/openai";

export interface CoachResult {
  source: "ai" | "template";
  message: string | null; // null = "use the template on the device" (so the template lives in one place)
  primary: CoachActionId;
  secondary: CoachActionId | null;
  model?: string;
}

const TIMEOUT_MS = 9_000;

export const COACH_SYSTEM = `أنت «منسّق الجلسة» في تطبيق ${BRAND.name} لحفظ القرآن الكريم. تكتب للمتعلّم رسالة قصيرة تبدأ بها جلسته اليوم، مبنيّة حصرًا على حالة حفظه الفعلية في JSON المُعطى.

معنى الحقول:
- resume: النقطة التي يُكمَل منها الحفظ الجديد (سورة وآية). wird: مقدار حفظ اليوم الجديد. wirdDone: هل أتمّ ورد اليوم.
- due: المراجعات المستحقة اليوم (ranges = عدد المقاطع، ayahs = عدد الآيات، items = أهمّها). weak: آيات كان آخر ناتج لها دون المطلوب (dueRanges = مقاطع ضعيفة مستحقة، items = مواضعها).
- lastRecitation: آخر تسميع محفوظ (daysAgo = قبل كم يوم، mastered = آيات متقنة، needsReview = آيات تحتاج مراجعة، uncertain = آيات لم نتأكد منها).
- order: الترتيب الذي حسبه التطبيق، و recommended: الإجراءان المسموح بهما بالترتيب. التزم بهما.

خطة الرسالة (جملتان إلى ثلاث، كل جملة قصيرة):
1) إن وُجد resume فاذكره («وصلنا إلى سورة … الآية …»).
2) قل أهمّ ما نبدأ به ولماذا، بالأرقام وأسماء السور الواردة في الحقائق فقط: مواضع الضعف أولًا (weak.items)، ثم المراجعات المستحقة (due.ranges و due.ayahs)، وإلا فحفظ اليوم (wird)، وإلا فلا شيء عاجل. إن وُجد lastRecitation ومفيدًا فاذكر نتيجته كما هي.
3) الخطوة التالية بعد ذلك.

القواعد الصارمة:
- بعربية فصيحة بسيطة وبصيغة محايدة: لا تخاطب بأفعال مؤنّثة أو مذكّرة (لا «حفظتَ/توقفتِ»)؛ استعمل «نبدأ، نكمل، نراجع، وصلنا، حفظنا».
- لا تخترع رقمًا ولا سورة ولا مراجعة ولا آية ولا نتيجة، ولا تذكر سببًا غير موجود في الحقائق. لا تعدُ بما لا يضمنه التطبيق.
- لا نصّ آية ولا حديث ولا حكم شرعي ولا نصيحة دينية ولا حكم على التجويد.
- لا مبالغة ولا مديح مفرط ولا تكرار. الحدّ الأقصى ثلاث جمل (ثلاث نقاط فقط)؛ لا تزد على ذلك.

أجب بـ JSON فقط، بلا شرح:
{"message":"…","primary":"<معرّف من recommended>","secondary":"<معرّف آخر من recommended أو null>"}`;

export function coachUserMessage(input: CoachInput): string {
  return JSON.stringify({ facts: input });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("coach timeout")), ms))]);
}

/** The template fallback keeps the deterministic recommendation; the device renders its own template text. */
function fallback(input: CoachInput): CoachResult {
  return { source: "template", message: null, primary: input.recommended[0], secondary: input.recommended[1] ?? null };
}

export async function generateCoach(input: CoachInput, llm?: LLMProvider | null, timeoutMs = TIMEOUT_MS): Promise<CoachResult> {
  const provider = llm !== undefined ? llm : env.coachAi() && env.openaiApiKey() ? new OpenAiChatProvider(env.openaiApiKey(), env.coachModel()) : null;
  if (!provider) return fallback(input);
  const started = Date.now();
  try {
    // One retry when the model's answer fails validation (a wrong sentence count or an ungrounded number is
    // common with small models); errors and timeouts go straight to the template.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) break;
      const text = await withTimeout(provider.complete({ system: COACH_SYSTEM, messages: [{ role: "user", content: coachUserMessage(input) }], maxTokens: 300, temperature: 0.3 }), left);
      const ok = validateCoachAnswer(parseJsonLoose(text), input);
      if (ok) return { source: "ai", message: ok.message, primary: ok.primary, secondary: ok.secondary, model: provider.id };
      console.warn(`[coach] model answer rejected by validation (attempt ${attempt})`);
    }
  } catch (e) {
    console.warn("[coach] AI unavailable; using template:", (e as Error).message);
  }
  return fallback(input);
}
