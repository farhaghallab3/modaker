/**
 * «ما معنى كلمة الصمد؟» → "الصمد". The word is then looked up in the verified Quran text and the
 * question is answered from the tafsir of the ayah it is in — not from any tafsir passage that
 * happens to mention the word elsewhere. Pure.
 */
import { normalizeArabic } from "@/lib/quran/normalize";

/** Words that follow «معنى» but are not the word being asked about. */
const NOT_A_TARGET = new Set(["كلمه", "لفظ", "لفظه", "مفرده", "قوله", "قول", "الايه", "ايه", "سوره", "هذه", "هذا", "ذلك"]);

export function wordMeaningTarget(question: string): string | null {
  const words = normalizeArabic(question).split(" ");
  const i = words.findIndex((w) => w === "معني" || w === "معاني");
  if (i < 0) return null;
  // «ما معنى كلمة الصمد في القرآن» → the first word after «معنى» that is not a filler like «كلمة».
  const rest = words.slice(i + 1).filter((w) => w && !NOT_A_TARGET.has(w));
  const target = rest[0];
  // Only a single word is looked up; a phrase or a whole ayah goes through the normal pipeline.
  if (!target || target.length < 3 || rest.length > 3) return null;
  return target;
}
