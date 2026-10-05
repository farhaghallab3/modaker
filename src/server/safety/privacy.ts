/**
 * Privacy rules for assistant conversations (PDF: collect sensitive data only as far as needed,
 * never to draw religious conclusions about the user).
 *
 * A Level D question describes a personal religious situation ("my marriage", "my prayer"…).
 * That is exactly the kind of data that must not be kept: the question text is NOT stored, and no
 * profile or inference is ever built from questions. Other exchanges are stored for the signed-in
 * user's own history and are deleted with the account.
 */
import type { AssistantAnswer } from "@/lib/types";

export function shouldPersistExchange(answer: Pick<AssistantAnswer, "safetyLevel" | "referral">): boolean {
  return answer.safetyLevel !== "D" && !answer.referral;
}
