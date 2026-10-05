/**
 * Report for the offline CTC feasibility probe (tools/ctc-poc/probe.py). Dev only.
 *   npx tsx scripts/ctc-report.ts <clips-dir> <results-*.json>
 * Judges the LITERAL Pass-1 output against what was actually SPOKEN (not against the Quran), using the same
 * exact-key `fidelity()` as the STT benchmark. No heuristics, no fuzzy matching.
 */
import { readFileSync } from "node:fs";
import { fidelity } from "@/server/stt/benchmark";
import { normalizeArabic } from "@/lib/quran/normalize";

interface Char { ch: string; p: number; alts: [string, number][] }
interface Row { id: string; category: string; spoken: string; canonical: string | null; literal: string; chars: Char[]; blank_frac: number; duration_s: number; latency_s: number; rtf: number }

const [, , , file] = process.argv;
const { meta, results } = JSON.parse(readFileSync(file, "utf8")) as { meta: Record<string, unknown>; results: Row[] };
console.log("MODEL", JSON.stringify(meta));

const NO_SPEECH = new Set(["silence", "noise"]);
let literal = 0, corrected = 0, hallucinated = 0, falseText = 0, n = 0;
for (const r of results) {
  n++;
  const heard = normalizeArabic(r.literal);
  const line: string[] = [`\n[${r.category}] ${r.duration_s}s  ${r.latency_s}s (x${r.rtf} realtime)  blank=${r.blank_frac}`];
  line.push(`  spoken (ground truth): ${r.spoken || "(no speech)"}`);
  if (r.canonical) line.push(`  canonical (separate):  ${r.canonical}`);
  line.push(`  literal CTC output:    ${r.literal || "(empty)"}`);
  line.push(`  normalized for compare:${heard ? " " + heard : " (empty)"}`);
  if (NO_SPEECH.has(r.category)) {
    const h = heard.length > 0;
    if (h) { hallucinated++; falseText++; }
    line.push(`  hallucinated speech:   ${h ? "YES ✘" : "no ✔"}`);
  } else {
    const f = fidelity(r.spoken, r.canonical ?? "", r.literal);
    if (f.literal) literal++;
    if (f.silentlyCorrected) corrected++;
    line.push(`  literal vs spoken:     ${f.literal ? "✔ literal" : "✘ differs"}${f.dropped.length ? `  dropped: ${f.dropped.join(" ")}` : ""}${f.towardCanonical.length ? `  TOWARD QURAN: ${f.towardCanonical.join(" ")}` : ""}${f.otherWrong.length ? `  other: ${f.otherWrong.join(" ")}` : ""}`);
    line.push(`  silently corrected:    ${f.silentlyCorrected ? "YES ✘" : "no"}`);
  }
  const low = r.chars.filter((c) => c.ch.trim() && c.p < 0.6);
  line.push(`  char posteriors:       ${r.chars.map((c) => `${c.ch}${c.p.toFixed(2)}`).join(" ")}`);
  if (low.length) line.push(`  low-posterior chars:   ${low.map((c) => `${c.ch}(${c.p.toFixed(2)}; alt ${c.alts.slice(1, 3).map(([a, p]) => `${a}:${p.toFixed(2)}`).join(",")})`).join("  ")}`);
  console.log(line.join("\n"));
}
console.log(`\nSUMMARY clips=${n}  literal(speech clips)=${literal}  silently-corrected=${corrected}  hallucinated-on-no-speech=${hallucinated}`);
