/**
 * Demo validation for the Session Coach: for four learner states print
 *   state summary → computed allowed actions → actual coach response (real OpenAI call)
 *   npx tsx --env-file=.env.local scripts/coach-scenarios.ts
 * Dev-only; never prints keys.
 */
import { buildCoachFacts, coachInput, templateMessage } from "../src/lib/coach/facts";
import { generateCoach } from "../src/server/coach/generate";
import { NOW, SCENARIOS } from "../tests/_helpers/coach-scenarios";

async function main() {
  for (const sc of SCENARIOS) {
    const state = sc.build();
    const f = buildCoachFacts(state, NOW);
    console.log("\n" + "=".repeat(78) + `\nSCENARIO ${sc.name}\n` + "=".repeat(78));
    console.log("STATE SUMMARY (what is sent to the model):");
    console.log(JSON.stringify({ ...coachInput(f), actions: undefined }, null, 1).replace(/\n\s+/g, " "));
    console.log("COMPUTED ALLOWED ACTIONS:");
    for (const a of f.actions) console.log(`  ${f.recommended.includes(a.id) ? "★" : " "} ${a.id.padEnd(9)} ${a.label}  →  ${a.href}`);
    console.log(`  order = ${f.order}   recommended = [${f.recommended.join(", ")}]`);
    const t0 = Date.now();
    const r = await generateCoach(coachInput(f));
    console.log(`COACH RESPONSE (${r.source}${r.model ? ` · ${r.model}` : ""} · ${Date.now() - t0}ms):`);
    console.log(`  message : ${r.message ?? "(template) " + templateMessage(f)}`);
    console.log(`  primary : ${r.primary}   secondary: ${r.secondary}`);
    if (r.source === "ai") console.log(`  template for comparison: ${templateMessage(f)}`);
  }
}
main().then(() => process.exit(0));
