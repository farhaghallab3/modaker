/**
 * Web-grounded answers for everyday Islamic questions.
 *
 * Claude answers ONLY from what its server-side web search finds on an allow-list of
 * trusted Islamic sites (`allowed_domains` — enforced by the API, not just the prompt).
 * Every answer must carry at least one citation to one of those sites, otherwise it is
 * discarded and the caller falls back to its usual abstention.
 *
 * The model is also a second scope/safety gate (the deterministic router runs first):
 *   [[OUT_OF_SCOPE]]   question is not about Islam / the Quran / the Sunnah
 *   [[NEEDS_SCHOLAR]]  personal case or a question that needs a fatwa
 *   [[INSUFFICIENT]]   the trusted sources do not answer it
 * Quran verses are never written from memory: the model gives references (سورة X: آية Y)
 * and the pipeline shows the verified text itself.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Citation } from "@/lib/types";

/** Default allow-list. Override with ASSISTANT_TRUSTED_DOMAINS (comma separated). */
export const DEFAULT_TRUSTED_DOMAINS = [
  "tafsir.net",
  "islamenc.com",
  "terminologyenc.com",
  "hadeethenc.com",
  "quranenc.com",
  "dorar.net",
  "islamweb.net",
  "quran.com",
  "sunnah.com",
  "alifta.gov.sa",
  "binbaz.org.sa",
];

export type WebAnswer =
  | { status: "answered"; text: string; citations: Citation[]; model: string }
  | { status: "out_of_scope" | "needs_scholar" | "insufficient"; model: string };

export interface WebAnswerer {
  readonly id: string;
  answer(question: string, opts?: { sensitive?: boolean }): Promise<WebAnswer>;
}

const SENTINELS = { out: "[[OUT_OF_SCOPE]]", scholar: "[[NEEDS_SCHOLAR]]", insufficient: "[[INSUFFICIENT]]" } as const;

export const WEB_SYSTEM_PROMPT = `You are the assistant of مُدّكِر, an Arabic platform for memorising and understanding the Quran.

Scope
- You answer questions about Islam: the Quran and its meanings, tafsir, the Sunnah and hadith, the prophets and Quranic stories, seerah, aqeedah basics, acts of worship, Islamic terminology, and general Islamic knowledge.
- If the question is not about Islam, the Quran or the Sunnah (sports, programming, cooking, general science, politics, etc.), reply with exactly ${SENTINELS.out} and nothing else.
- If the person describes their OWN situation and asks what applies to them (a personal fatwa: their marriage, divorce, inheritance, illness, an oath they swore, a specific transaction), or asks you to issue a fatwa, reply with exactly ${SENTINELS.scholar} and nothing else.

How to answer
- Always search first, and base every statement on what the search results say. Do not answer from memory.
- Answer in clear Modern Standard Arabic, briefly (usually 2–6 sentences, or a short list), in a calm, respectful tone suitable for learners.
- Do NOT write Quran verses from memory. Refer to them by reference only, in the form (سورة البقرة: 255) or (سورة الملك: 1-5); the platform displays the verified text itself.
- Mention a hadith only if it appears in the search results, and say where it is from (e.g. رواه البخاري) only as stated there. Never invent a hadith, a grading or a reference.
- If the matter is one where scholars differ, present the main positions neutrally as stated in the sources, without choosing one yourself.
- Never say "يجوز لك" or apply a ruling to the asker's own case.
- If the search results do not contain enough reliable information to answer, reply with exactly ${SENTINELS.insufficient} and nothing else.`;

const SENSITIVE_NOTE =
  "This question touches on a ruling (fiqh). Give the general positions from the sources only, and do not issue a ruling for any individual.";

const isAllowed = (url: string, domains: string[]) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

/**
 * Turns the model's content blocks into answer text with [n] markers and a deduplicated
 * citation list. Pure — exported for tests.
 */
export function parseWebAnswer(
  content: Anthropic.Beta.BetaContentBlock[],
  domains: string[],
  model: string,
): WebAnswer {
  const raw = content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (raw.includes(SENTINELS.out)) return { status: "out_of_scope", model };
  if (raw.includes(SENTINELS.scholar)) return { status: "needs_scholar", model };
  if (!raw || raw.includes(SENTINELS.insufficient)) return { status: "insufficient", model };

  const citations: Citation[] = [];
  const indexOf = new Map<string, number>();
  let text = "";
  for (const block of content) {
    if (block.type !== "text") continue;
    text += block.text;
    const marks = new Set<number>();
    for (const c of block.citations ?? []) {
      if (c.type !== "web_search_result_location" || !isAllowed(c.url, domains)) continue;
      let n = indexOf.get(c.url);
      if (n === undefined) {
        const host = new URL(c.url).hostname.replace(/^www\./, "");
        citations.push({
          sourceId: `web:${host}`,
          title: c.title?.trim() || host,
          ref: host,
          excerpt: c.cited_text.length > 240 ? `${c.cited_text.slice(0, 240)}…` : c.cited_text,
          url: c.url,
          sourceKind: "other",
        });
        n = citations.length;
        indexOf.set(c.url, n);
      }
      marks.add(n);
    }
    if (marks.size) text = text.replace(/\s+$/, "") + " " + [...marks].map((n) => `[${n}]`).join("") + " ";
  }
  // An answer with no citation to a trusted site is never shown.
  if (!citations.length) return { status: "insufficient", model };
  return { status: "answered", text: text.replace(/[ \t]+\n/g, "\n").trim(), citations, model };
}

const MAX_CONTINUATIONS = 3;

export class ClaudeWebAnswerer implements WebAnswerer {
  readonly id: string;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
    private domains: string[] = DEFAULT_TRUSTED_DOMAINS,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1 });
    this.id = `anthropic-web:${model}`;
  }

  async answer(question: string, opts: { sensitive?: boolean } = {}): Promise<WebAnswer> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: opts.sensitive ? `${SENSITIVE_NOTE}\n\nالسؤال: ${question}` : question },
    ];
    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: WEB_SYSTEM_PROMPT,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, allowed_domains: this.domains }],
        messages,
      });
      if (response.stop_reason === "refusal") return { status: "insufficient", model: response.model };
      if (response.stop_reason === "pause_turn") {
        // The server-side search loop paused; resend so it resumes where it stopped.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      return parseWebAnswer(response.content, this.domains, response.model);
    }
    return { status: "insufficient", model: this.model };
  }
}
