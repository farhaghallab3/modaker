# مُدّكِر — Product & Frontend Architecture

Companion to [`ARCHITECTURE-backend.md`](./ARCHITECTURE-backend.md), which covers
the database schema, REST API, AI/RAG pipeline, speech pipeline, notifications
and security in detail. This file covers requirements, information architecture,
the frontend, the design system and the user journeys.

---

## 1. Requirements analysis

**Core loop:** استئناف → فهم → حفظ → تسميع → سؤال → مراجعة
**Companion roles:** يسمّعك (recitation) · يذكّرك (reminders) · يفهّمك (grounded understanding) · يراجعك (spaced review)

| Need | Product answer | Hard constraint |
|---|---|---|
| Never lose your place | `ResumePoint` per user (surah + ayah + mode), updated when new material is opened or memorized; revising old ranges never moves it backwards | — |
| Consistent memorization | Daily wird = next *N* ayahs from the resume point (N from onboarding/goals) | — |
| Recite and get feedback | Speech-to-text → normalized word alignment against verified text → omitted / added / incorrect / order / hesitation | **Text matching only; no tajweed claims** |
| Understand what you memorize | Tafsir from approved sources (التفسير الميسر), always with source line | **No generated tafsir** |
| Remember over time | SM-2-style scheduler per ayah, grouped into contiguous review ranges | — |
| Ask questions | RAG over approved sources, citations on every answer, fatwa guard | **LLM never emits Quran text; insufficient evidence → says so** |
| Stories | Curated stories → chapters → linked ayah ranges → verified text + tafsir + curated videos | Editorial copy flagged until scholarly review |
| Privacy | Recordings transcribed in memory and discarded by default | Keys server-side only |

## 2. Information architecture

```
Public            /                 Landing
                  /login /register  Auth
                  /onboarding       8-step plan builder → "خطتك مع مُدّكِر"

App (guarded)     /dashboard        Where did I stop · today's wird · today's review · weekly rhythm
  المصحف          /quran            Browser: search, مكية/مدنية, in-progress filter, continue strip
                  /quran/[n]        Tabs: السورة · الحفظ · التفسير · القصة* · الفيديوهات*   (*only when curated content exists)
                  /memorize/[n]     Focus mode: range, audio + repeat, hide/reveal, meaning
  التسميع         /recite           Focus mode: range picker → record → processing → feedback → save
  المراجعة        /review           مراجعة اليوم · تحتاج مراجعة · متقن · مراجعات قادمة
  المزيد          /more             (mobile hub)
                  /stories, /stories/[slug]
                  /videos
                  /assistant        + floating «اسأل مُدّكِر» sheet on every non-focus screen
                  /progress /goals /notifications /settings
```

Navigation: desktop sidebar (primary 4 + "اكتشف" group + notifications/settings/profile);
mobile top bar + bottom nav **الرئيسية · المصحف · التسميع · المراجعة · المزيد**.
Focus modes (`/memorize/*`, `/recite`) drop the mobile chrome and the floating assistant
and use their own exit header + thumb-reachable bottom action bar.

## 3. Frontend architecture

```
src/
  app/                    Thin route files (App Router). (app) group = guarded shell, (auth) = split layout
    api/v1/**             Route handlers (see backend doc)
  features/<area>/        Screen components — one per route, client components
  components/
    ui/                   Icon, primitives (Button, Surface, Tabs, Toggle, Segmented, ProgressRing/Bar,
                          Modal, ConfirmationModal, EmptyState, ErrorState, LoadingSkeleton, Stat…), SourceCitation
    layout/               AppShell, Logo, PageHeader/Page
    quran/                QuranVerse, SurahCard, AyahCard, AudioPlayer, useAyahAudio, TafsirNote
    recitation/           RecitationRecorder, RecitationFeedback, useRecitationRecorder
    review/ stories/ assistant/ notifications/
  lib/
    types.ts              Framework-free domain contracts (shared with server & future mobile)
    api.ts                Typed REST client + useAsync/useSurah/useOnline
    quran/                surahs.ts (metadata only), normalize.ts (matching-only folding)
    recitation/           compare.ts (alignment), speech/ (recognizer adapters), simulate.ts (dev only)
    review/scheduler.ts   Spaced repetition
    store/                AppProvider (state + intent actions), repository.ts, selectors.ts
    i18n/                 ar (shipping), en (scaffold), t(), locale → dir
  content/                stories.ts, videos.ts (curated), demo-seed.ts (synthetic progress)
  server/                 Providers & services (see backend doc)
```

**State & persistence.** Screens call intent-named actions (`markMemorized`,
`recordRecitation`, `setResume`, `addToReview`…). Persistence sits behind
`UserDataRepository`: `LocalRepository` (device / demo / offline) or `ApiRepository`
(`NEXT_PUBLIC_DATA_MODE=api`, `/api/v1/me/state`, PostgreSQL). Selectors derive
everything else (streak, weekly consistency, review queue, reminders), so the
same logic can run on the server for push reminders.

**Speech layer (client).** `SpeechRecognizer` → `RecognitionSession` adapters:
`webSpeechRecognizer` (browser, ar-SA, approximate word timings) and
`serverUploadRecognizer` (MediaRecorder → `/api/v1/recitation/transcribe` → server
`SpeechToTextProvider`). Chosen by `NEXT_PUBLIC_STT_MODE`, with fallback. Analysis
runs on the server (which loads the verified verses itself); if unreachable the
client runs the same `analyzeRecitation` on the verses it already loaded from
the verified source.

**Localization.** All layouts use logical properties (`ms/me/ps/pe/start/end`),
directional icons mirror via `rtl:-scale-x-100`, numbers render with Arabic-Indic
digits. `lib/i18n` carries `ar` + an `en` scaffold with the same keys; root layout
reads `lang`/`dir` from the locale config.

**Mobile readiness.** All domain logic is in framework-free modules (`lib/`,
`server/`), the API is versioned, and screens never touch storage directly —
a React Native app can reuse types, scheduler, normalization and the API.

## 4. Design system

| Token | Value | Use |
|---|---|---|
| forest | `#283618` | primary actions, navigation, hero surfaces |
| olive | `#606C38` | progress, success, secondary emphasis |
| cream | `#FEFAE0` | warm highlight surfaces, text on forest |
| sand | `#DDA15E` | sparse accent (ayah markers, ring accents) |
| terracotta | `#BC6C25` | sparse accent; mistakes, unread dots |
| paper / parchment | `#FFFDF6` / `#F4F1E6` | page / quiet surfaces |
| ink / muted | `#1D2218` / `#74776C` | text |
| sage / line | `#DDE3CF` / `#E7E3D3` | tracks, hairlines |

Typography: **Amiri** for Quran (`.quran-text`, line-height 2.35, fluid 1.45–2.05rem),
story titles and display headings; **IBM Plex Sans Arabic** for UI. Radius 1.25rem
cards, 1rem controls. Shadows are soft and rare. `.pattern-girih` (eight-point
star lattice) only as faint background on hero surfaces. Motion: `rise`, `breathe`
(recording), skeleton shimmer — all disabled under `prefers-reduced-motion`.
Sections are separated by whitespace and hairlines; cards are reserved for
actionable units (review items, surah cards, ayah results).

States implemented across screens: loading skeletons, empty, error with retry,
offline banner, microphone denied / missing / busy, unsupported browser,
recording, processing, STT unavailable, rate limited, AI unavailable,
insufficient evidence, needs-scholar, no reviews today, goal completed,
push not configured / denied.

## 5. User journeys

**A. First run → first review (priority flow)**
1. Landing → «ابدأ رحلة الحفظ» → register.
2. Onboarding: amount memorized → current surah → stopped at ayah → daily target → reminder time → review sessions → level → «خطتك مع مُدّكِر» (start point, wird range, review rhythm, days to finish surah).
3. Ayahs before the stopping point enter the review system; resume point = stopping ayah.
4. Dashboard hero «متابعة الحفظ» → `/memorize/n?from=ayah`: listen, repeat, hide/reveal, read meaning.
5. «حفظت هذه الآيات» → progress rows created (first review tomorrow), resume moves to the next ayah.
6. «ابدأ التسميع» → record → feedback beside each ayah → «حفظ النتيجة وجدولة المراجعة» updates each ayah's interval.
7. `/review` shows due/weak ranges; the dashboard and reminders surface them.
8. Returning later: dashboard and «أهلًا بعودتك، توقفت عند …» link to the exact ayah.

**B. Stories:** `/stories` → story → chapter timeline → verified verses + التفسير الميسر → «اقرأ في المصحف» / «احفظ هذا المقطع» → curated video.

**C. Assistant:** floating «اسأل مُدّكِر» (context = current surah) → guard → retrieval → grounded answer with numbered citations, or insufficient / needs-scholar; verses always come from the Quran provider; quizzes reveal answers from verified text.

## 6. Content integrity

- No Quran text exists in the repository. `src/lib/quran/surahs.ts` holds metadata only; tests use ordinary Arabic sentences.
- Verse text: Quran.com API v4 at runtime (cached) or imported into PostgreSQL by `npm run db:seed:quran`, which verifies counts per surah and stores checksums.
- Story intros/summaries are short editorial framing, flagged `contentStatus: "demo"` and shown with a notice until a qualified reviewer approves them.
- Videos are curated by admins only (`youtubeId` null until added); embeds use youtube-nocookie with a click-to-load facade.
- Demo progress (`content/demo-seed.ts`) is synthetic numbers only and labelled «نسخة تجريبية» in the UI.
