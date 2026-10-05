/**
 * Compatibility layer. The real decision logic lives in the safety router
 * (src/server/safety/router.ts): named signals → a safety LEVEL (A–D) and an INTENT. This module
 * only maps a router decision onto the older flat "question kind" vocabulary and re-exports the
 * fixed texts, so existing callers and tests keep working.
 */
import { routeDeterministic } from "../safety/router";
import { TEMPLATES } from "../safety/templates";

export type QuestionKind = "fatwa" | "quran-text" | "quiz" | "explain" | "story" | "word-meaning" | "off-topic" | "general" | "hadith";

export function classifyQuestion(question: string): QuestionKind {
  const d = routeDeterministic(question);
  // Personal cases (D) and plain ruling requests (C) are both "fatwa"-type questions in the old vocabulary.
  if (d.level === "D" || (d.level === "C" && d.flags.rulingRequest)) return "fatwa";
  switch (d.intent) {
    case "hadith-request":
      return "hadith";
    case "off-topic":
    case "non-arabic":
      return d.intent === "off-topic" ? "off-topic" : "general";
    case "quran-text":
    case "quiz":
    case "story":
    case "word-meaning":
    case "explain":
    case "general":
      return d.intent;
    default:
      return "general";
  }
}

/** Level D wording (owner-provided). */
export const NEEDS_SCHOLAR_TEXT = TEMPLATES.referralD.text;
export const OFF_TOPIC_TEXT = TEMPLATES.scope.text;
