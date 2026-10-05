/**
 * Split long source texts (e.g. Ibn Kathir entries) into retrieval chunks on
 * sentence boundaries. Pure; used by scripts/index-knowledge.ts.
 */
import { createHash } from "node:crypto";

export function chunkText(text: string, maxChars = 1200, overlapSentences = 1): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];

  // Sentence-ish units: end punctuation (Arabic and Latin) or paragraph breaks.
  const units = clean.split(/(?<=[.!؟?۔])\s+|\n{1,}/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;
  let fresh = 0; // units added since the last flush (excluding carried-over overlap)

  for (const unit of units) {
    // A single over-long unit is hard-split on whitespace.
    for (const p of unit.length > maxChars ? hardSplit(unit, maxChars) : [unit]) {
      if (len + p.length + 1 > maxChars && fresh > 0) {
        chunks.push(cur.join(" "));
        cur = overlapSentences > 0 ? cur.slice(-overlapSentences) : [];
        len = cur.reduce((n, x) => n + x.length + 1, 0);
        fresh = 0;
      }
      // Drop the overlap if it would push this piece over budget.
      if (len + p.length + 1 > maxChars) {
        cur = [];
        len = 0;
      }
      cur.push(p);
      len += p.length + 1;
      fresh++;
    }
  }
  if (fresh > 0) chunks.push(cur.join(" "));
  return chunks;
}

function hardSplit(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > max * 0.5 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function contentHash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}
