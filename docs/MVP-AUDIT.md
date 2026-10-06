# Core MVP audit — 2026-10-06

Method: walked the production build (`next start`) as a new local test account (since deleted) through
onboarding → dashboard → memorize → progress → review → quran → assistant → stories/videos → settings/notifications,
checked the database rows behind each step, probed the assistant API, and measured mobile (375×812) overflow.
Not verified: real microphone recitation (the Browser pane has no mic), push delivery, long-term scheduling over days.
Classes: COMPLETE / PARTIAL / MOCK / BLOCKED / MISSING.

| Area | Class | Evidence | Smallest work for MVP |
|---|---|---|---|
| Onboarding | **PARTIAL** | 8 questions → plan; profile, goal, reminder time and resume point persisted. But "how much do you memorize?" (e.g. جزء عمّ) is only stored as a label: only ayahs before the stop point in the CURRENT surah become memorized. Previously memorized surahs never enter progress/review. | Bulk "I already know these surahs" step (checkbox list + juz' presets) that calls `declareMemorized` per ayah |
| Dashboard / resume | **COMPLETE** | After declaring 1–5: resume moved to 6, «محفوظاتك» lists the surah, wird marked done, streak 1; derived continuation verified. Tile «دقة التسميع» should read «تطابق التسميع» (Beta wording). | rename label only |
| Understand | **PARTIAL** | Per-ayah brief tafsir (التفسير الميسر, sourced) in memorize and surah screens; assistant explains ayahs with the same source. No word-by-word meanings; free-text questions without an ayah abstain (see Assistant). | none for MVP beyond fixing the assistant index |
| Memorize | **COMPLETE** | Listen per ayah/range, repeat, hide ayahs, tafsir, "حفظت هذه الآيات" → DB rows `MemorizationProgress` (exact surah/ayah, `nextReviewAt` +1 day) and `ResumePoint`. Minor: 13 px horizontal overflow on mobile `/memorize`. | fix overflow |
| Recite | **PARTIAL (Beta by design)** | Now conservative Beta: whisper-1 only; unvalidated/on-device = practice only; unconfirmed differences = uncertain; poor audio = repeat; transcript shown separately from Quran comparison. Real-mic flow and real-recording accuracy not verified here. With a single recognizer almost no difference is ever "counted", so only exact matches move state. | none (policy decided); optionally enable `STT_SECOND_OPINION` after measuring |
| Review | **PARTIAL / effectively BLOCKED by Beta** | Schedule list, due/weak buckets, "تسميع" and "اقرأ" shortcuts. There is **no non-recitation way to complete a review**: the only way to advance the schedule is a fully matched recitation by the validated recognizer. A learner whose recitation is "uncertain" or practice-only can never clear a due item. | Add self-assessed review (ثبتت / ترددت / نسيت) feeding `recordOutcome` with a `self` source (lower weight, cannot reach mastery alone) |
| Progress | **COMPLETE** | Counts, streak, weekly bars, surah list trace to persisted data. Page title is the generic site title; "جودة الحفظ" heading actually shows weekly consistency. | set page metadata; clarify heading |
| Quran / surah browsing | **COMPLETE** | 114 surahs, text from DB (`quran-com:uthmani`, verified), tabs surah/memorize/tafsir, per-ayah audio, bookmarks, meaning, add-to-review. Minor: ayah-count wording «٢٠٦ آيات» in onboarding list (should be آية). | fix pluralization |
| Persisted exact progress | **COMPLETE** | `MemorizationProgress` rows per ayah, `ResumePoint`, `UserStateSnapshot`, `DailyActivity`, goals, prefs. Tables `ReviewSchedule`, `ReviewAttempt`, `MemorizationSession` exist but are unused (the snapshot is the source of truth). | none for MVP (needed later for analytics/Admin) |
| Review scheduling | **COMPLETE (logic) / UNPROVEN over time** | SM-2-like scheduler, tested; first review +1 day verified in DB. No multi-day run observed. | one-day-later smoke test |
| Reminders | **PARTIAL** | Preferences UI, server sweep, web-push backend, service worker all exist, but `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` are empty ("browser notifications unavailable"), and nothing schedules `/api/v1/cron/reminders`. In-app dashboard reminder works only while the app is open. | generate VAPID keys, set CRON_SECRET, run the sweep every 15 min (host cron/GitHub Action), test one push |
| Assistant (approved sources) | **PARTIAL** | Ayah-scoped questions return the Muyassar quote + verse + citation (verified). Free-text questions («ما فضل سورة الملك؟») all abstain `no_evidence`: `KnowledgeChunk` has 0 rows (the index was never built). General fiqh abstains by design (sources are draft). Only 2 of 12 sources are published. | run `npm run kb:index` for the published sources; add a reviewed "how to memorize" source; keep fiqh/hadith sources draft until reviewed |
| Stories | **PARTIAL (content pending review)** | 6 stories with chapters, verses from the verified Quran and tafsir; all `isDemo/draft`, badged «تجريبي». | scholarly review of the text, or ship 1–2 approved stories |
| Videos | **MOCK** | 9 entries, none has a real `youtubeId` ("بانتظار إضافة المقطع"). | hide the tab until ≥1 approved video, or add real IDs |
| Mobile / responsive | **COMPLETE (minor)** | 375 px: no overflow on dashboard, quran, recite, progress, assistant; bottom nav; large mic button. `/memorize` overflows by 13 px. | fix that overflow |

## Prioritized remaining MVP checklist
1. **Self-assessed review** (review is otherwise blocked by the Beta policy) — highest.
2. **Import existing memorization at onboarding** (juz' presets / surah checklist).
3. **Assistant index**: `npm run kb:index`, then re-test free-text questions; add a reviewed study-method source.
4. **Reminders**: VAPID keys, `CRON_SECRET`, a scheduler, one real push test.
5. **Real-microphone Beta pass** on the production build with a real account (recognition quality, copy, uncertain UX) — then decide on `STT_SECOND_OPINION`.
6. Hide **Videos** (MOCK) until real content; mark/approve **Stories**.
7. Polish: «تطابق التسميع» label, Arabic plurals, `/memorize` overflow, page titles for progress/assistant/stories/videos/settings/notifications.
8. Legal/rights blocker for any future acoustic model stays deferred (see CTC-FEASIBILITY.md).
