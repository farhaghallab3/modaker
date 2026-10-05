/**
 * Hadith policy (architecture only — NO hadith integration exists yet).
 *
 * Rules, enforced now:
 *   - The assistant never produces hadith text, narrator, grading or reference from memory.
 *   - A hadith is shown only when an approved hadith source returns it WITH its grade and a
 *     reference; those fields are never inferred.
 *   - With no approved source (today), any request that needs a hadith abstains.
 *
 * When the hadith layer is built (HadeethEnc / Dorar, tier 4) it implements `HadithProvider`; the
 * assistant already calls it and renders its results as typed `hadith` blocks.
 */
import type { AnswerBlock } from "@/lib/types";

export type HadithBlock = Extract<AnswerBlock, { type: "hadith" }>;

export interface HadithProvider {
  readonly id: string;
  /** False until an approved, enabled hadith source is wired in. */
  readonly available: boolean;
  /** Returns graded hadith matching the query; every result must carry grade + reference. */
  find(query: string): Promise<HadithBlock[]>;
}

export const NO_HADITH_PROVIDER: HadithProvider = {
  id: "none",
  available: false,
  async find() {
    return [];
  },
};
