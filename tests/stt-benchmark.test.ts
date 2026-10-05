import { test } from "node:test";
import assert from "node:assert/strict";
import { exactComparison } from "../src/server/stt/benchmark";

test("benchmark comparison is exact-key only: a different word is never 'close enough'", () => {
  const c = exactComparison("ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ", "اهدنا الطرق المستقيم");
  assert.equal(c.exactMatches, 2);
  assert.deepEqual(c.missing, ["الصرط"]);
  assert.deepEqual(c.extra, ["الطرق"]);
});

test("diacritic/alef variants of the same word still match", () => {
  const c = exactComparison("ٱهْدِنَا ٱلصِّرَٰطَ", "اهدنا الصِّراط");
  assert.equal(c.exactMatches, 2);
});

import { fidelity } from "../src/server/stt/benchmark";
const CANON = "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ";

test("fidelity is measured against what was SPOKEN: a literal transcript of a deliberate mistake passes", () => {
  const f = fidelity("اهدنا السراط المستقيم", CANON, "اهدنا السراط المستقيم");
  assert.equal(f.literal, true);
  assert.equal(f.silentlyCorrected, false);
});

test("silently correcting a deliberate mistake toward the Quran FAILS", () => {
  const f = fidelity("اهدنا السراط المستقيم", CANON, "اهدنا الصراط المستقيم");
  assert.equal(f.literal, false);
  assert.equal(f.silentlyCorrected, true);
  assert.deepEqual(f.towardCanonical, ["الصراط"]);
  assert.deepEqual(f.dropped, ["السراط"]);
});

test("completing a half-recited ayah FAILS; stopping where the speaker stopped passes", () => {
  assert.equal(fidelity("اهدنا الصراط", CANON, "اهدنا الصراط").literal, true);
  const f = fidelity("اهدنا الصراط", CANON, "اهدنا الصراط المستقيم");
  assert.equal(f.literal, false);
  assert.equal(f.silentlyCorrected, true);
  assert.deepEqual(f.towardCanonical, ["المستقيم"]);
});

test("inserting an omitted word FAILS; preserving the omission passes", () => {
  assert.equal(fidelity("اهدنا المستقيم", CANON, "اهدنا المستقيم").literal, true);
  assert.deepEqual(fidelity("اهدنا المستقيم", CANON, "اهدنا الصراط المستقيم").towardCanonical, ["الصراط"]);
});

test("repetition must be preserved; collapsing it is a divergence; an unrelated word is 'other', not 'toward canonical'", () => {
  assert.equal(fidelity("اهدنا الصراط الصراط المستقيم", CANON, "اهدنا الصراط الصراط المستقيم").literal, true);
  const collapsed = fidelity("اهدنا الصراط الصراط المستقيم", CANON, "اهدنا الصراط المستقيم");
  assert.equal(collapsed.literal, false);
  assert.equal(collapsed.silentlyCorrected, true);
  const other = fidelity("اهدنا الصراط", CANON, "اهدنا الطرق");
  assert.deepEqual(other.otherWrong, ["الطرق"]);
  assert.deepEqual(other.towardCanonical, []);
});
