# مُدّكِر — رفيقك الذكي في رحلة حفظ القرآن

Arabic-first (RTL) Quran memorization companion: **احفظ · سمّع · افهم · راجع**.
Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · PostgreSQL + pgvector (Prisma).

- Product, IA, frontend, design system, journeys → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Religious safety, sourcing, content review workflow → [`docs/ARCHITECTURE-safety.md`](docs/ARCHITECTURE-safety.md) · privacy inventory → [`docs/PRIVACY-DATA-INVENTORY.md`](docs/PRIVACY-DATA-INVENTORY.md) · backlog (fiqh gap, contextual suggestions) → [`docs/BACKLOG.md`](docs/BACKLOG.md) · Quran-source migration plan → [`docs/QURAN-SOURCE-MIGRATION-PLAN.md`](docs/QURAN-SOURCE-MIGRATION-PLAN.md)
- Database, REST API, AI/RAG, speech, notifications, security → [`docs/ARCHITECTURE-backend.md`](docs/ARCHITECTURE-backend.md)

## Run it

```bash
npm install
cp .env.example .env.local      # defaults work without a database
npm run dev                     # http://localhost:3000
```

With the defaults:

- **Quran text** is fetched at runtime from Quran.com API v4 (`QURAN_PROVIDER=quran-com`) and cached. An internet connection is required for verses, tafsir and ayah audio.
- **Accounts** fall back to device-only storage when `DATABASE_URL` is unset. Use «جرّب النسخة التجريبية» on the landing page to load demo progress.
- **Recitation** uses the browser's speech recognition (`NEXT_PUBLIC_STT_MODE=browser`, works in Chrome/Edge). Set `STT_PROVIDER=openai` + `OPENAI_API_KEY` and `NEXT_PUBLIC_STT_MODE=server` to use server transcription with word timings (better hesitation detection).
- **Assistant** runs in `extractive` mode (returns cited passages from التفسير الميسر, no LLM). Set `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` for grounded generated answers.
- In development the recitation screen has a «محاكاة تسميع (للتجربة)» button to test feedback without a microphone. It is hidden in production builds.

### Full stack (PostgreSQL)

```bash
docker run -d --name muzakkir-db -e POSTGRES_PASSWORD=muzakkir -e POSTGRES_USER=muzakkir \
  -e POSTGRES_DB=muzakkir -p 5432:5432 pgvector/pgvector:pg16
npx prisma migrate dev --name init
npm run db:seed:quran           # imports & verifies all 114 surahs (or --tanzil path/to/quran-uthmani.txt)
npm run db:seed:tafsir
npm run db:seed:demo            # demo stories/videos (isDemo + draft; never indexed or treated as knowledge)
npm run registry:sync           # source registry → database (planned sources stay disabled)
npm run kb:index                # embeddings for the assistant (needs OPENAI_API_KEY)
# then set QURAN_PROVIDER=database and NEXT_PUBLIC_DATA_MODE=api
```

Push reminders: generate VAPID keys (`npx web-push generate-vapid-keys`), set the
three `VAPID` variables, and call `POST /api/v1/cron/reminders` with
`Authorization: Bearer $CRON_SECRET` on a schedule (e.g. every 15 minutes).

## Checks

```bash
npm test          # 64 unit tests: normalization, alignment, scheduler, guard, references, journey
npm run typecheck
npm run build
```

## Content rules (enforced in code)

- No Quran text lives in this repository; it's always loaded from a verified source and verified on import.
- Tafsir comes only from approved sources and is always shown with its source.
- The assistant cites every answer, says when evidence is insufficient, never issues fatwas, and never generates verse text.
- Recitation feedback is word matching against the verified text. It does **not** assess tajweed.
- Story intros/summaries and seeded videos are marked as demo content until reviewed; add real curated YouTube IDs in `src/content/videos.ts` (or the `Video` table).
- Voice recordings are not kept by default (`RECORDING_RETENTION_DAYS=0`).

## Not yet built / next steps

- Native push (FCM/APNs) channel is a documented stub.
- Rate limiting is in-process; use Redis for multi-instance deployments.
- Opt-in recording storage writes to local disk; swap for S3/R2 behind the same interface.
- Admin UI for stories/videos (content is file/DB managed today).
- English UI strings: the i18n scaffold and RTL/LTR-safe layouts are in place; screens still use Arabic literals.
