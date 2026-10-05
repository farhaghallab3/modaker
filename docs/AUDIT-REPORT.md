# Functional audit — مُدّكِر

Date: 2026-10-05 · Scope: existing core experience, no new features, no UI redesign.
Environment: Next.js dev server (port 3001), PostgreSQL 16 + pgvector in Docker, `NEXT_PUBLIC_DATA_MODE=api`, `QURAN_PROVIDER=database`, no API keys configured.
Method: read the code, ran the app in the browser, called the API directly, and checked the database after each step.

## Automated checks

| Check | Result |
|---|---|
| `npm test` | 64 / 64 pass |
| `npm run typecheck` | clean |
| `npm run build` | passes (all 18 pages + 14 API routes) |
| `npm run lint` | **BROKEN** — no ESLint config, `next lint` opens an interactive setup prompt |

## WORKING — tested end to end

| Flow | Evidence |
|---|---|
| Register | User row, session cookie, state snapshot saved, redirect to onboarding. Duplicate email → 409, weak password → 400 |
| Onboarding (8 steps) | Profile, goals, resume point (67:4) and 3 pre-memorized ayahs persisted. Plan maths correct (27 ÷ 5 ≈ 6 days) |
| Dashboard | Shows resume point, % of surah, today's set, streak, "daily set complete" state |
| Quran browser | 114 surahs, Makki/Madani filters, search by Arabic / number / English |
| Memorize | Verses from the DB with source line; short explanation = Muyassar with source; "I memorized these" → 5 `MemorizationProgress` rows, resume moved to 67:6, review set for tomorrow |
| Recitation comparison + feedback | `/recitation/analyze` loads expected text server-side; per-ayah accuracy, omitted / different word / long pause; saved `RecitationSession` + mistakes (no audio, no transcript) |
| Save progress + schedule review | Interval 1 → 3 days after a review, streak and counters updated, daily activity recorded |
| Review center | Empty state, due list with time estimate, upcoming list, completing a review updates progress |
| Logout / login / resume | Session revoked on logout (401). After the fix below, login restores exact resume point and progress |
| Progress screen | Matches DB (5 ayahs, 1 recitation, streak 1) |
| Notification preferences | GET/PUT persist; invalid push subscription rejected; cron endpoint rejects unauthenticated calls |
| Assistant (extractive) | Answer + verified verse + visible sources panel; chats saved server-side |
| Assistant safety routing | Rulings → fixed "needs a scholar" text; off-topic / unknown → "insufficient"; no answer without a source |
| Stories | Chapters link to verified verses; demo banner; references list |
| Mobile (375 px) + RTL | `dir=rtl`, bottom nav, no horizontal overflow on 6 pages checked |
| API security | `X-Frame-Options`, `nosniff`, referrer + permissions policies; same-origin check on POSTs (403); generic login errors; input validation; rate limiting |
| Microphone denied state | Clear Arabic instructions + retry/back |

## FIXED in this audit

1. **Data loss on login** (critical) — `src/lib/store/AppProvider.tsx` `signIn`. After logging in on a fresh session the client reset to an empty state, sent the user back to onboarding, and the autosave **overwrote the user's stored progress with the empty state** (reproduced: `MemorizationProgress` 3 → 0 rows, resume point deleted). `signIn` now loads the server state and never seeds an empty one for a real account. `signOut` also clears the in-memory copy in API mode so progress is not left in memory on a shared device. (`src/lib/store/repository.ts` gains `isApiMode()`.)
2. **Fatwa guard gaps** — `src/server/rag/guard.ts`: "هل الغيبة محرمة" and "هل هذا الفعل جائز" fell through to "insufficient" instead of the needs-scholar reply. Added word forms + regression test (`tests/assistant-guard.test.ts`).
3. **Roles groundwork** — `prisma/schema.prisma`: `enum Role { user content_reviewer admin }` and `User.role` (default `user`), with migration `user_roles`. No behaviour change yet.
4. **Next.js workspace-root warning** — `next.config.mjs` pins `outputFileTracingRoot` (a stray `C:\Users\HELLO\package-lock.json` confused root inference).

## PARTIALLY WORKING

| Item | Limitation | Where / what to change |
|---|---|---|
| Assistant retrieval | Only Muyassar tafsir is searchable. Questions about asbab al-nuzul or stories' narrative return "insufficient" ("سبب نزول سورة الكهف"). Named verses are not resolved ("آية الكرسي") | `src/server/rag/references.ts` (alias table), add an approved asbab source in `sources.ts` |
| Out-of-range ayah request | "الآية ١٠٠ من سورة الملك" answers with the generic "specify surah and ayah" text instead of "this surah has 30 ayahs" | `assistant.ts` `quranText()` |
| Hesitation scoring | An ayah with a long pause can still show 100 % / "mastered" | `src/lib/recitation/compare.ts` — product decision |
| Chat history | Saved in the DB but not reloaded in the UI after refresh | `src/components/assistant/AIChat.tsx` + new GET route |
| Page titles | Several client pages (settings, progress, stories/[slug]) show the site default title | add `generateMetadata` / layout titles |
| Linting | Script exists, config does not | add `eslint.config.mjs` |
| Security headers | No Content-Security-Policy; no HSTS (needed at deploy time) | `next.config.mjs` |
| Dev server | Running two `next dev` on one folder produced a 500 ("Jest worker…"); not an app bug | — |

## BROKEN

None remaining after the login fix. (`npm run lint` is a tooling gap, listed above.)

## MOCK / DEMO

| Item | Detail |
|---|---|
| Recitation simulation button | Dev-only; labelled "simulation result — not a real recitation" in the UI. Correct, but it is the only recitation path that could be exercised here |
| Stories (6) | All `contentStatus = demo`; banner says editorial intros need scholarly review. Verses and tafsir shown are real and sourced |
| Videos (9) | All `demo`, **all `youtubeId = null`** → placeholders "awaiting content team". Embed component is implemented (youtube-nocookie, click-to-load, ID validation) but untested with a real ID |
| Demo account | «جرّب النسخة التجريبية» loads seeded progress (`src/content/demo-seed.ts`), kept separate from verified content |

## MISSING

- **Admin / CMS** and any role checks (only the `Role` column exists).
- Content review workflow: `ContentStatus` has only `verified | demo`; needs `draft | in_review | approved` (+ reviewer, reviewed-at).
- Approved asbab al-nuzul / additional tafsir sources.
- Native push (documented stub), Redis rate limiting (in-process only), English UI strings.
- Cron-driven reminder delivery was not run end-to-end (needs VAPID + `CRON_SECRET`).

## BLOCKED BY CREDENTIALS / EXTERNAL SERVICES

| Integration | What is needed | Status |
|---|---|---|
| Server speech-to-text (Whisper) | `OPENAI_API_KEY`, `NEXT_PUBLIC_STT_MODE=server` | Code reviewed; not run |
| Browser speech recognition | A real microphone + Chrome/Edge | The Browser pane blocks the mic; denied-state verified, live capture **not** verified |
| LLM answers | `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | Pipeline, sanitizer and fallback reviewed; not run. Currently falls back to extractive |
| Semantic search / `kb:index` | `OPENAI_API_KEY` (embeddings) | `KnowledgeChunk` = 0 rows |
| Web push | `VAPID_*` keys, `CRON_SECRET` | Not configured |
| Real YouTube embeds | Reviewed video IDs | Content decision, not a credential |

## Religious-content safety audit

| Requirement | Result |
|---|---|
| Quran text never generated by an LLM | **Pass.** Verses come only from `QuranProvider`; `quran-text` and `quiz` intents never call an LLM; LLM output is sanitised (`sanitize.ts`) and verse-like text is replaced |
| Quran text from a verified source | **Pass.** 6,236 ayahs / 114 surahs; per-surah counts match; checksums verified on import; source shown in the UI |
| Tafsir / story content traceable | **Pass.** Muyassar (approved, publisher shown); every answer and chapter lists its source |
| Assistant cannot invent citations | **Pass.** Citations are built from retrieved passages / the verse provider, not from model output |
| No unsupported fatwas | **Pass** on the tested set, now improved; guard is rule-based and runs before retrieval. It is keyword-based, so unusual phrasings can still slip to "insufficient" (safe) rather than to an answer |
| Demo content distinguishable | **Pass.** `ContentStatus`, banners, "(تجريبي)" labels |
| No tajweed claim | **Pass.** Disclaimer on the recitation and result screens |
| Branding copy | **Review.** `src/lib/brand.ts` and `public/manifest.webmanifest` call the product «شيخك الذكي» ("your smart sheikh"); the spec and README say «رفيقك الذكي». Left unchanged because `brand.ts` is marked official — recommend aligning it |

## Recommended next step

Build the Admin/CMS on top of `User.role`: role guards in `src/server/auth`, an extended `ContentStatus` (`draft → in_review → approved → published`), and CRUD for stories, videos (YouTube IDs), tafsir/knowledge sources and verse links — with the assistant and public pages reading only `approved` content.
