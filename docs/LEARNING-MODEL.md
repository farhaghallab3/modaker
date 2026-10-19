# Learning model — completion, review state, mastery, resume

Source of truth: `src/lib/review/learning.ts` (definitions), `src/lib/review/scheduler.ts` (spaced review),
`src/lib/store/reducers.ts` (state transitions), `tests/learning-model.test.ts` (19 regression tests).

## 1. Three concepts, three questions

| Concept | Question | Derived from | Shown as |
|---|---|---|---|
| **Completion** (`isMemorized`) | Has the learner memorized this ayah? | The learner **declared** it (marked memorized / onboarding / "add to review"), **or** a recitation **showed recall** (≥ 75 %) | «١٠٠٪ من الحفظ» · «٧ من ٧ آية محفوظة» |
| **Review state** (`isWeak`) | Does it need work now? | The **latest** recitation outcome through the scheduler (grade < 3 ⇒ weak). Independent of completion | «آيتان تحتاجان مراجعة» |
| **Mastery** (`isMastered`) | Is it solid? | Repeated, **spaced**, accurate recitations: streak ≥ 4, accuracy ≥ 92 %, interval ≥ 14 days | count of mastered ayahs; **no mastery percentage is shown** unless it comes from this evidence |

Consequences: a surah can be **100 % complete, with ayahs to review, and 0 mastered**. `memorized ≠ mastered`.
A recitation attempt that **fails** does **not** complete an ayah — it becomes `learning` (tracked, with evidence, not counted).

A separate, honest metric — **دقة التسميع** (recitation accuracy) — is the mean of the *latest* recitation accuracy of each
ayah that has actually been recited. It is not mastery and not completion.

### Evidence
Every ayah keeps its last 5 recitation outcomes (`recent`: `{at, accuracy, mistakes, recId}`); `recId` is the id of the saved
recitation summary that produced it, so any "weak" or "mastered" judgement can be traced to a recitation.

## 2. Resume = the next meaningful continuation

The stored `resume` is only a **hint**. `continuation(state)` derives where to continue:

1. start at the stored ayah and take the first ayah that is **not yet memorized**;
2. if none remains after it, return an earlier **gap**;
3. if the surah has no unmemorized ayah, it is **complete** → continue with the goal surah when it still has work, otherwise nothing (the UI invites the learner to choose / review).

Weak ayahs do **not** block completion or move the continuation — they are review, not unfinished memorization.
Used by: dashboard hero, "today's wird", reminders, Surah page, Quran browser, goals, memorize screen. A stale stored pointer can no longer mislead.

**Completed-surah behaviour:** the Surah page says «أتممت حفظ السورة — ٧ من ٧ آية محفوظة · آيتان تحتاجان مراجعة», hides «احفظ», keeps «سمّع», and shows no «توقفت هنا» marker. The dashboard says «أتممت بفضل الله», offers «اختر سورتك القادمة» and the review.

## 3. Root causes found (audit of the reported Al-Fatihah state)

1. **A saved recitation silently created "memorized" rows.** `recordRecitation` did `progress[key] ?? newAyahProgress(...)`, whose status is `memorized`. Reciting an undeclared ayah — even with **0 %** — made it count as memorized (`memorizedAt` equals the save time). This inflated *completion*: ayahs 6 and 7 were "memorized" because they were *attempted*, not because recall was shown. `addToReview` had the same flaw.
2. **Resume was only written by two actions** (opening an unfamiliar ayah in the memorize screen; marking memorized). Saving recitations created progress without moving it, so the pointer stayed on ayah 2 while every ayah became "memorized".
3. **Weakness had two competing rules**: `status === "weak"` **or** blended accuracy < 75 %. After a good recitation `status` recovered but the slow rolling average kept the ayah in the weak bucket for several sessions.
4. **Mislabels**: the dashboard showed «نسبة الإتقان» (mastery %) for what was a blended recitation accuracy; rings showing «١٠٠٪ من السورة» did not say it was completion.
5. **Evidence was stripped on save**: the server schema is a plain `z.object`, which silently drops unknown fields; the new evidence needed to be added to `ayahProgressSchema`.

Not a bug: scoring does identify **individual** weak ayahs (not the whole range) — see §5.

## 4. Model changes

* New `learning.ts`: `isMemorized / isWeak / isMastered`, `declareMemorized`, `recordOutcome`, `surahCompletion`, `recitationAccuracy`, `continuation`, `nextToMemorize`, `startAyahFor`.
* `AyahProgress.recent` (evidence); accepted by the server schema.
* `recordOutcome`: memorized ayah → scheduler; undeclared + recited well → memorized (recall shown); undeclared + recited badly → `learning` (not counted).
* Weak = latest outcome only (the second rule in the scheduler's bucket logic and in `weakAyahs` was removed).
* `reducers.ts`: pure `applyMarkMemorized` / `applyRecitation` used by `AppProvider` (and by the tests).
* Existing persisted data is **not rewritten**. Rows created before this change keep their status; they simply have no `recent` (see limitations).

## 5. Data trace — reported account, Al-Fatihah (read-only audit)

Persisted: `UserStateSnapshot` (what the UI reads), projected rows `MemorizationProgress`, `ResumePoint`, `RecitationSession/Result`.

| Value you saw | Stored basis | Verdict |
|---|---|---|
| **7/7 memorized, 100 %** | 7 rows with status memorized/weak. Only ayah 1 was **declared** (onboarding, 15:36). Ayahs 2–6 were created by the 19:22 save (`memorizedAt` = save time); ayah 7 by the 19:23 save. Ayah 6 was created from a **0 %** result, ayah 7 from **33 %** | Arithmetic correct, **semantics inflated by root cause 1**. Left as is (no manual edits); under the new rules ayahs 2–5 would be memorized by recall (100/100/100/75 %), ayahs 6–7 would have stayed `learning` |
| **2 need review (6, 7)** | status `weak`, both from saved outcomes below 75 % | **Correct** — derived from evidence |
| **76 % average accuracy** | mean of stored rolling accuracy over the 6 ayahs that have accuracy: (1+1+1+0.75+0.346+0.466)/6 = 0.760; ayah 1 has none | Arithmetic correct, but it is a **blended** value (latest outcomes would give 85 %) and it was **mislabelled as mastery** |
| **Resume ayah 1/2, «توقفت هنا»** | stored resume = 1:2, written 19:21:41 by the memorize screen when ayah 2 was untracked; never advanced afterwards | **Stale** — the marker sits above ayah 2 (right after ayah 1). Under the new rules the surah reads as complete |
| **Average 76 % vs 14 sessions** | 14 `RecitationSession` rows exist, but only **3** were saved into progress | Not a contradiction: `/recitation/analyze` stores every **attempt**; only the ones the learner **saved** change progress |

Why ayahs 6 and 7 are review items — per saved recitation (analysis time → save time):

| Ayah | Saved 19:22 (range 2–6) | Saved 19:23 (6–7) | Saved 19:25 (6–7) | Result |
|---|---|---|---|---|
| 6 | 0.00 (missed) | 0.33 (missed) | 0.67 (needs review) | latest 0.667 < 0.75 ⇒ grade 2 ⇒ **weak**; rolling 0.346 |
| 7 | — | 0.33 (missed) | 0.67 (needs review) | latest 0.667 < 0.75 ⇒ **weak**; rolling 0.466 |

Scoring is **per ayah**: in the 19:22 session ayahs 2–4 scored 100 %, ayah 5 75 %, ayah 6 0 % — each updated its own row.

Under the new model the same data reads: completion 7/7 (kept), weak 2 (6, 7), mastered 0, recitation accuracy 76 % over 6 ayahs, continuation = **complete**.

## 6. The loop, verified in persisted state

memorization → recitation result → per-ayah weakness → review scheduling → dashboard → next recitation → updated state:

* declare → `MemorizationProgress` row (status memorized, due tomorrow);
* recite + save → that ayah's own outcome through `applyReview` (ease, interval, streak, status) **and** a `recent` entry carrying the summary id;
* weak ⇒ review bucket ⇒ `/review` and the dashboard «تحتاج مراجعة» (same `weakAyahs`/`reviewQueue` derivation);
* a later good recitation ⇒ status memorized, leaves the weak bucket, rescheduled further out; repeated spaced successes ⇒ mastered.

Verified live (production build, real MediaRecorder + Whisper + save): the stored state gained `recent: [{accuracy, mistakes, recId}]` on ayahs 6 and 7 only, with `recId` equal to the saved summary's id; ayah 5 (outside the range) untouched; the data survives the server round trip.

## 7. Limitations / follow-ups

* Rows saved **before** this change have no `recent`, so for them «latest accuracy» falls back to the stored rolling value (e.g. ayah 6 shows 0.35 although its last outcome was 0.67). New saves are exact. A one-time backfill from the saved summaries is possible but would be an edit of user data — not done.
* Existing inflated completion (ayahs whose only evidence is a failed attempt) is not retroactively reverted. Decide whether to offer a "re-declare / re-verify" action.
* `RecitationSession` (server) records every analysed attempt, including unsaved ones; progress only changes on save. If attempts should count, save-on-analyze is a product decision.
* Per-attempt result labels («متقن», «تحتاج مراجعة», «لم تُقرأ») describe **one attempt**, not the ayah's mastery; the wording on the feedback screen was left unchanged.

## Self-assessed review (ثبتت / ترددت / نسيت)

A learner can complete a due review without speech recognition. It **complements** recitation and is never mistaken for it.
Code: `src/lib/review/self-review.ts` (pure), `reducers.applySelfReviewRange`, UI in `src/components/review/SelfReview.tsx`.

| choice | ease | interval | status | streaks |
|---|---|---|---|---|
| ثبتت | unchanged | `min(round(prev×ease), max(7, prev))` (≥1); **unchanged** for recitation-origin weakness (schedule stays as the recitation set it) | self-weak → memorized; recitation-weak stays weak; mastered stays | `selfStreak`+1; verified `streak` unchanged |
| ترددت | −0.14 | `max(1, round(prev/2))` | self-weak → memorized; recitation-weak stays; mastered → memorized | `selfStreak`=0; `streak`−1 |
| نسيت | −0.54 (floor 1.3) | 1 day | weak (`weakBy="self"`; stays `"recitation"` if it already was) | both 0 |

Guarantees (reducer-level, tested in `tests/self-review.test.ts`):
- never touches `recent[]`, `accuracy`, `successCount`, `mistakeCount` (stored in a separate `selfReviews[]` with `source:"self"`);
- self-review alone can never reach `mastered` (30 consecutive ثبتت still ≤ 7-day interval, not mastered);
- **recitation weakness outranks self weakness**: `weakBy="recitation"` is never overwritten, cleared or softened by a self-review; only a later valid recitation clears it (legacy weak rows derive their origin from `recent[]`);
- a recitation made today (passed or failed) decides the day for that ayah; a recitation after a self-review supersedes it (`selfBefore` dropped);
- one credited assessment per ayah per local day; equal/better repeats are ignored; a WORSE one replaces it, recomputed from `selfBefore` (the state before the day's first assessment);
- a ثبتت on an ayah that is not due grows nothing; lowering is always honoured;
- **self evidence may make a recitation-origin weakness more conservative, never less**: on `weakBy="recitation"` a ثبتت only records the review (history, `lastReviewedAt`) — interval, `nextReviewAt`, ease, streaks and status are untouched; ترددت / نسيت may only pull the next review closer, never later;
- applies to the whole ReviewCard range (no per-ayah picker in the MVP).

Offered when: the learner chooses «راجعت دون تسميع» on a due/weak review card; or after a recitation for the ayahs it could not decide (uncertain, poor recognition, practice-only recognizer). Never for ayahs with a confirmed recitation outcome.
UI wording keeps the two kinds of evidence apart: «آخر تقييم: ذاتي — …» and «آخر تسميع مؤكّد: <date>».
Persistence: the snapshot (`UserStateSnapshot`) stays the source of truth; new optional fields are whitelisted in `ayahProgressSchema`; the Prisma review tables are untouched.
