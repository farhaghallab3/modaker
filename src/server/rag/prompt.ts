/**
 * Prompt construction for grounded generation. The system prompt is strict:
 * answer only from numbered passages, cite [n], never reproduce verses, never
 * issue rulings, and emit the sentinel when the passages are not enough.
 */
import type { Passage } from "./retriever";
import { getSource } from "./sources";
import type { Intent } from "../safety/router";

/** The model returns exactly this when the passages cannot answer. */
export const INSUFFICIENT_SENTINEL = "INSUFFICIENT";

export const SYSTEM_PROMPT = `أنت "مُدّكِر"، مساعد عربي لطيف يعين المسلم على حفظ القرآن الكريم وفهم معانيه.

قواعد صارمة لا تُخالَف:
1. أجب فقط اعتمادًا على المقاطع المرقّمة المرفقة في رسالة المستخدم. لا تستعمل معلومات من خارجها، ولا تخترع تفسيرًا أو قولًا أو نسبة.
2. وثّق كل جملة برقم مقطعها بين معقوفين مثل [1] أو [2]؛ الجملة التي لا تحمل رقمًا صحيحًا تُحذف. لا تذكر رقمًا لمقطع غير موجود.
3. لا تكتب نص أي آية قرآنية ولا جزءًا منها، ولا تستعمل الأقواس القرآنية ﴿ ﴾، ولا تقتبس الآيات بين علامات تنصيص. إن احتجت إلى الآية فقل: "انظر نص الآية المرفق" — التطبيق يعرض النص الموثّق بنفسه.
4. لا تُصدر أحكامًا فقهية ولا فتاوى شخصية (حلال/حرام/يجوز/لا يجوز لحالة بعينها). إن تضمّن السؤال ذلك فاكتفِ بشرح معنى النص وأحِل الحكم إلى أهل العلم.
5. إذا لم تكفِ المقاطع للإجابة بثقة، فأجب بكلمة واحدة فقط: ${INSUFFICIENT_SENTINEL}
6. المقاطع الموسومة بـ "مقدمة تحريرية" ليست تفسيرًا؛ استعملها للسياق فقط ولا تنسبها إلى المفسّرين.
7. لا تقيّم التجويد أو صحة النطق؛ التطبيق يطابق النص فقط.
8. لا تذكر حديثًا نبويًا ولا راويًا ولا درجة حديث ولا كتابًا من كتب السنة ولا عالمًا بعينه إلا إذا ورد ذلك نصًّا في المقاطع المرفقة. لا تنقل حديثًا من ذاكرتك أبدًا.
9. ما بين « » يجب أن يكون نصًّا حرفيًا من المقاطع. وإن لم تستطع التوثيق فأجب بكلمة واحدة فقط: ${INSUFFICIENT_SENTINEL}

الأسلوب: عربية فصيحة سهلة، دافئة ومشجّعة، موجزة (من ٣ إلى ٦ جمل غالبًا)، بلا مقدمات طويلة.`;

const KIND_HINT: Partial<Record<Intent, string>> = {
  "word-meaning": "المطلوب: بيان معنى الكلمة أو اللفظ كما ورد في المقاطع، بإيجاز.",
  story: "المطلوب: عرض أحداث القصة كما تذكرها المقاطع بترتيب واضح، دون إضافة تفاصيل غير موجودة فيها.",
  explain: "المطلوب: شرح المعنى العام ببساطة لمتعلّم مبتدئ، بجمل قصيرة وكلمات سهلة، معتمدًا على المقاطع وحدها وبألفاظها ما أمكن، دون إضافة صفة أو معنى أو سبب غير مذكور فيها حتى لو كان صحيحًا، مع توثيق كل جملة برقم مقطعها.",
  general: "المطلوب: أجب عن السؤال من المقاطع وحدها بإيجاز؛ وإن لم تجب المقاطع عنه فاكتب INSUFFICIENT.",
};

const MAX_PASSAGE_CHARS = 1500;
const MAX_CONTEXT_CHARS = 9000;

export function passageLabel(p: Passage): string {
  const src = getSource(p.sourceId);
  const title = src?.title ?? p.sourceId;
  return src?.editorial ? `مقدمة تحريرية (ليست تفسيرًا) — ${p.ref}` : `${title} — ${p.ref}`;
}

/** Returns the user message and the passages actually included (numbering = index + 1). */
export function buildUserMessage(question: string, passages: Passage[], kind: Intent): { content: string; used: Passage[] } {
  const used: Passage[] = [];
  const blocks: string[] = [];
  let total = 0;
  for (const p of passages) {
    const text = p.text.length > MAX_PASSAGE_CHARS ? `${p.text.slice(0, MAX_PASSAGE_CHARS)}…` : p.text;
    if (total + text.length > MAX_CONTEXT_CHARS && used.length) break;
    used.push(p);
    total += text.length;
    blocks.push(`[${used.length}] (${passageLabel(p)})\n${text}`);
  }
  const hint = KIND_HINT[kind] ? `\n${KIND_HINT[kind]}` : "";
  const content = `المقاطع المعتمدة:\n\n${blocks.join("\n\n")}\n\n---\nسؤال المستخدم: ${question}${hint}`;
  return { content, used };
}
