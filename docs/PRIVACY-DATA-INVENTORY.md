# Privacy — sensitive data inventory

Principle (review.pdf): collect personal or sensitive data only as far as needed, under a stated policy, and **never use it to draw religious conclusions about the user**. مُدّكِر does not build religious profiles; this document lists what is stored so that stays true.

Status: documented during P1/P2 (2026-10-05). Not legal advice; a published privacy policy page is still missing.

## What is stored, where, how long

| Data | Why | Stored where | Retention / deletion |
|---|---|---|---|
| **Voice / recitation audio** | transcribe a recitation | **Not stored by default.** Browser speech mode (`NEXT_PUBLIC_STT_MODE=browser`) sends no audio to our server, **but Chrome/Edge's built-in speech recognition may stream it to the browser vendor's own speech service** — disclose this to users. Server mode uploads the audio, transcribes it in memory and discards it. Stored only if the server sets `RECORDING_RETENTION_DAYS > 0` **and** the user opted in (`UserProfile.keepRecordings`) | Default 0 days. When enabled each file has `audioExpiresAt`, purged by the cron job; deleted on account deletion |
| **Recitation history** | show accuracy, schedule review | `RecitationSession` (surah, range, provider id, duration, accuracy), `RecitationResult` (per-ayah accuracy), `RecitationMistake` (type, ayah, word index, expected word, **heard word text**, pause) | Until the user deletes data / the account. The heard words are short fragments of what the user said, not a full transcript |
| **Chat conversations** | the user's own assistant history | `ChatConversation`, `ChatMessage` (question text, answer text, typed blocks, safety level, answer type, abstain reason), `Citation`. **Signed-in users only** | Until account deletion. **Personal-case (Level D) questions are never stored** (`src/server/safety/privacy.ts`). No automatic expiry yet — see risks |
| **Memorization progress** | the product's core function | `MemorizationProgress` (per ayah: status, ease, interval, streak, counts, accuracy, dates), `ResumePoint`, `DailyActivity`, `MemorizationGoal`, `Bookmark` (+ optional note) | Until the user deletes data / the account |
| **Full state snapshot** | offline-first sync | `UserStateSnapshot` (JSON copy of the client state: profile, progress, notifications, preferences) | Replaced on every save; deleted with the account |
| **Profile** | personalise the plan | `UserProfile`: name, **experience level**, **how much Quran memorized**, daily target, review sessions per day, reminder time, time zone, locale | Until account deletion |
| **Notification preferences** | reminders | `NotificationPreference` (on/off, preferred time, frequency, quiet hours, time zone), `Notification` rows | Until account deletion |
| **Push subscription** | web push | `PushSubscription` (endpoint, keys, user agent, failure counters) | Removed on unsubscribe or account deletion; failures are counted (`failureCount`) |
| **Account & sessions** | sign-in | `User` (email, password **hash**, role), `Session` (token hash, expiry, user agent) | Sessions expire; everything deleted with the account |
| **Content-review audit** | accountability for staff actions | `ContentReviewEvent` (staff actor id + role, action, note) — staff only, no learner data | Kept; `actorId` is set to null if the staff account is deleted |
| **Device-only mode** | no-account use | Browser `localStorage` (`muzakkir:v1`) | Cleared with browser data / "delete my data" |

IP addresses are not stored by the application (rate limiting is in-memory). User agents are stored on sessions and push subscriptions only.

## What is deliberately NOT done

* No religious profiling or inference: questions are not analysed to categorise the user, and nothing derived from them is stored. The safety router computes a level for the **current** question only; `safetyLevel` is stored on the answer message, not on the user.
* No public leaderboards or sharing of progress.
* No analytics SDKs or third-party trackers.
* Quran/hadith/tafsir text is never sent to third parties except the configured providers (Quran.com for text when `QURAN_PROVIDER=quran-com`; OpenAI/Anthropic only if their keys are configured).

## Third parties that may receive data (only when configured)

| Provider | Receives | When |
|---|---|---|
| Quran.com API | surah/tafsir requests (no user data) | `QURAN_PROVIDER=quran-com` |
| OpenAI (speech) | recitation audio | `STT_PROVIDER=openai` + `NEXT_PUBLIC_STT_MODE=server` + key |
| OpenAI (embeddings) | tafsir/editorial text at indexing time; the user's **question text** at query time | `EMBEDDING_PROVIDER=openai` + key |
| Anthropic / OpenAI (LLM) | question + retrieved passages | `ASSISTANT_GENERATION=on` + provider key (off by default; never for Level C/D) |

## Remaining risks / recommendations

1. **No retention limit on chat history** — add a user-visible delete control and an automatic expiry (e.g. 90 days).
2. **No published privacy policy page** and no in-app link to this inventory.
3. `RecitationMistake.heard` keeps short recognised words — decide whether to drop it after aggregation.
4. User questions are sent to the embedding provider when semantic search is enabled; disclose this, or embed only a normalised, de-identified query.
5. `UserStateSnapshot` duplicates relational data; keep deletion paths in sync when new tables are added.
