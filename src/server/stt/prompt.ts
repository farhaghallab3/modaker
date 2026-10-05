/**
 * Transcription context ("prompt") for the speech-to-text request.
 *
 * Goal: tell the recognizer WHAT KIND of audio this is (Quranic recitation, Arabic orthography) so it
 * prefers Quranic vocabulary over everyday words — without handing it the answer.
 *
 * Hard rule: the prompt NEVER contains the expected ayah text. A prompt is conditioning text; the
 * recognizer is strongly pulled toward whatever it contains, so feeding it the expected verse would
 * make a mistaken recitation come back "correct" and the transcript would no longer represent what
 * the user actually said. Modes:
 *
 *   off     no prompt
 *   domain  (default) a generic sentence about the kind of audio — no Quranic words at all
 *   surah   domain + only the SURAH NAME (a label, not recited text)
 *
 * Whether a prompt helps accuracy on real recitation must be measured on real audio (see
 * docs/STT-QURAN.md); it is configurable so it can be A/B tested with STT_TRACE.
 */
export type SttPromptMode = "off" | "domain" | "surah";

export const DOMAIN_PROMPT = "تلاوة للقرآن الكريم بصوت قارئ. تكتب الكلمات كما نطقت بالإملاء العربي الفصيح.";

export function buildSttPrompt(mode: SttPromptMode, ctx: { surahName?: string } = {}): string | undefined {
  switch (mode) {
    case "off":
      return undefined;
    case "surah":
      return ctx.surahName ? `${DOMAIN_PROMPT} سورة ${ctx.surahName}.` : DOMAIN_PROMPT;
    default:
      return DOMAIN_PROMPT;
  }
}
