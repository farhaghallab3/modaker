# Religious safety, sourcing and content governance (P1 + P2)

Implements the requirements of `review.pdf` and the decisions recorded in `docs/PROPOSAL-content-governance.md`.
Companion docs: `docs/PRIVACY-DATA-INVENTORY.md`, `docs/QURAN-SOURCE-MIGRATION-PLAN.md`.

## 1. Principles (all enforced in code, all covered by tests)

1. Quran text comes only from the verified `QuranProvider` — never from a model, never from this repository.
2. Every religious claim shown is traceable to a source the answer actually retrieved.
3. The assistant never rules independently (Level D) and never picks one scholarly opinion (Level C).
4. No hadith text, narrator, grade or reference is ever produced from memory.
5. When evidence is missing or weak the assistant abstains: «لا تتوفر لدي مادة موثوقة كافية للإجابة عن هذا السؤال.»
6. Demo content is not knowledge. `isDemo` (nature) and `reviewState` (approval) are independent.
7. Generation is **off** unless explicitly enabled, and even then limited to Level B and verified after the fact.

## 2. Content state model (P1)

```
isDemo       nature of the content  — placeholder copy nobody has reviewed
reviewState  editorial approval     — draft → in_review → approved → published (+ rejected, archived)
```

| Rule | Where |
|---|---|
| Assistant / knowledge base use only `published AND NOT isDemo` | `src/lib/content-state.ts` (`isAssistantEligible`), `scripts/index-knowledge.ts`, `retriever.ts` SQL |
| Demo content stays visible in development, always labelled «محتوى تجريبي — لم تتم مراجعته واعتماده بعد» | `isPubliclyVisible`, `needsDemoNotice`, story/video screens |
| Seeding never sets or changes `reviewState` of existing rows; reviewed content is skipped | `scripts/seed-demo.ts` |
| Migration mapping: `demo → isDemo=true, draft`; `verified → approved` (never published) | `prisma/migrations/20261005150000_content_governance` |

### Workflow and separation of duties — `src/server/content/workflow.ts`

```
draft ─submit→ in_review ─approve→ approved ─publish→ published
                   └─reject→ rejected              archive (admin) from any state
```

| Action | user | content_reviewer | admin |
|---|:-:|:-:|:-:|
| submit | — | ✔ | ✔ |
| approve / reject (needs note) | — | ✔ (not own work when strict) | ✔ (not own work when strict) |
| publish / archive | — | — | ✔ |
| reopen | — | ✔ | ✔ |

* `strict` separation (author ≠ reviewer, even for admins) is **on in production**, off in development (`CONTENT_STRICT_SEPARATION=on|off` overrides). In development an admin can walk content through every step, but **every transition writes a `ContentReviewEvent`** (actor, role, from/to, note) in the same transaction.
* Demo content can be submitted for review but can never be approved or published.
* The logic is pure (`decideTransition`); persistence goes through a `WorkflowStore` (Prisma implementation in `prisma-store.ts`, in-memory in tests). No UI yet (P3).

### Source registry — `src/server/rag/sources.ts` → `KnowledgeSource` table

A source is usable only if `enabled` **and** `reviewState ∈ {approved, published}`. Fields: tier, authority type, languages, API availability + docs, MCP availability, auto-retrieval suitability, human-review requirement, licence note + `licenseVerified`, last sync. No credentials ever. `npm run registry:sync` creates missing rows and refreshes metadata but **never changes `enabled`/`reviewState`** of an existing row.

| Tier | Sources (state) |
|---|---|
| 1 Quran | Quran.com ✔ in use · Tanzil ✔ in use · **King Fahd Complex (planned, disabled)** · QuranEnc (planned) |
| 2 Understanding | Muyassar ✔ in use · Ibn Kathir (planned, disabled) |
| 3 Learning | Terminology / Jamhara (planned) · `muzakkir-curated` (**disabled** — demo stories) |
| 4 Hadith & broader | HadeethEnc (planned) · Dorar verification (planned) |

Planned sources are inert: `licenseVerified = false`, disabled, draft. Nothing is integrated until a person has read the official terms.

### Knowledge-chunk provenance

`KnowledgeChunk` now stores `title, kind, author, language, url, locator, grade/gradedBy (hadith only), origin, isDemo, reviewState, reviewerId, reviewedAt, importBatchId` next to `surah, ayahFrom, ayahTo, sourceId, text`. The Quran's canonical text is **not** a chunk: it lives in `Surah`/`Ayah` and is cited by reference only. Retrieval filters on `source.enabled`, `source.reviewState`, `chunk.reviewState = published`, `chunk.isDemo = false`.

### Prepared for later (schema only, no features)

`KnowledgeKind` gained `hadith`, `seerah`, `glossary` (`asbab` already existed); chunks carry the hadith grading fields; `HadithProvider` (interface) and a typed `hadith` answer block exist, wired to a "no source" default. No hadith/glossary/asbab/seerah tables or content were added.

## 3. Answer pipeline (P2) — `src/server/rag/assistant.ts`

```
question
 └─ safety router ─ level A/B/C/D + intent + flags           src/server/safety/router.ts
      ├─ D  → neutral referral (+ related approved passages)      no ruling, no generation
      ├─ non-Arabic → abstain (language_unsupported)
      ├─ off-topic  → scope redirect
      ├─ hadith request → HadithProvider; none approved → abstain (no_hadith_source)
      ├─ quran-text / quiz → verified verses (Level A)
      └─ explain / story / word / general
           ├─ quote check: misquoted ayah → correction from verified text; low confidence → clarify
           ├─ retrieve (approved + published only) → score ≥ 0.4 else abstain (no_evidence)
           ├─ C → conservative preface + sourced passages (never generated)
           └─ B → extractive quoting, or — only if ASSISTANT_GENERATION=on and allowed — generation
                  that must pass the verifier, else fall back to extractive
```

### Safety router

Signals (`personal_case`, `ruling_request`, `explicit_fatwa`, `disagreement`, `sensitive_topic`, `hadith_request`, `injection`, `hostile`, `non_arabic`, `quran_request`, `off_topic`) are computed by small deterministic detectors over data in `lexicon.ts`; the level is derived from the signals:

* **D** — explicit fatwa request, or a **personal case** (below).
* **C** — a ruling request that is not a personal case, a disagreement marker, or a registered sensitive topic.
* **A** — Quran text / quizzes. **B** — everything else that is answered.

**General fiqh vs personal case (the Level C / Level D line).** First-person *wording* never makes a question personal: «هل يجوز لي لمس المصحف بدون وضوء؟», «هل يجوز لي قراءة القرآن وأنا مستلقٍ؟» and «هل أستطيع قراءة القرآن بدون وضوء؟» are general fiqh questions (C). A question is personal (D) when it supplies **facts about the asker's own situation** that a ruling would depend on — «أنا مريضة ولا أستطيع الوضوء، ماذا أفعل؟», «حدث كذا في زواجي، فهل عقدي صحيح؟», «لدي ظرف طبي معين…». The detector (`detectPersonalFacts`) models this semantically:

* *own* facts (a relationship/possession «زواجي», a first-person event «نسيت/حلفت», a request for what to do «ماذا أفعل», the asker's own place, an unspecified act of the asker) count by themselves;
* *contextual* facts (a condition «حامل/مريض», a third-person event «حدث كذا», a named jurisdiction) count only when a self-statement («أنا», «لدي», «عندي») **anchors** them to the asker — so «هل يجوز للحامل الإفطار؟» is general while «أنا حامل ولا أستطيع الصيام» is personal;
* *weak* signals (a bare «أنا», «بسبب») never suffice.

D needs ≥1 strong fact, a total score ≥ 2, and a fiqh context (ruling framing, religious-practice topic, or a request for what to do). «هل أستطيع/هل يمكنني…» is a ruling request only about a religious practice, so memorisation questions stay ordinary. Regression tests: `tests/personal-vs-general.test.ts`.

Robustness: diacritics, tatweel, zero-width characters, letter-spacing («ي ج و ز»), Persian letter variants and mixed punctuation are normalised before matching. Injection phrases («تجاهل كل التعليمات», «بدون مصادر», «act as a mufti»…) are detected and stripped, **never lower** the level, and switch generation off.

**Classifiers** (`SafetyClassifier`) are an extension point for a future model. `applyClassifiers` can only **raise** the level (raising to C/D also switches generation off); it ignores classifiers once the deterministic level is D, ignores a classifier that tries to lower, and swallows classifier failures. A classifier cannot change the intent.

Sensitive-topic list and the English lexicon are marked **pending scholarly review** — they are designed to be extended.

### Quran quotation verification — `src/server/safety/quote-verifier.ts`

Compares quoted text with the verified corpus (every surah loaded through the provider, so already count/checksum-verified) using a fuzzy word alignment over 1–3 consecutive ayahs; skeleton comparison, so spelling/diacritic differences are not errors.

| Result | Behaviour |
|---|---|
| `exact` | nothing to correct; refs may be inferred for retrieval |
| `corrected` | shows the verified text with surah, ayah and source; a warning block says the wording differs; if the question was explanatory the answer then continues **about the verified ayah only** — the corrupted wording is never sent to retrieval or a model |
| `ambiguous` | asks the user to clarify and offers up to 3 verified candidates; never guesses |
| `none` | normal pipeline |

Explicit quotations (« », ﴿ ﴾, " ", after «قال تعالى») use lower thresholds; a quotation hidden in prose must clear a high bar, so ordinary questions are not rewritten.

### Output verification — `src/server/safety/answer-verifier.ts`

Runs on every model-written answer: verse-like text replaced · invalid `[n]` removed · **every sentence must carry a valid citation** · quotes in « » must be verbatim fragments of retrieved passages · hadith attribution (قال رسول الله, رواه البخاري…) dropped unless that exact attribution is in a retrieved passage · named scholars/books must appear in a retrieved passage or its source labels. Nothing verifiable left → the user gets the quoted sources instead of model text. `filterCitations` is a last guard: a citation must name a usable source **and** a retrieved passage.

### Typed answer envelope

```ts
AssistantAnswer {
  kind, text, verses, citations, provider,           // unchanged contract
  safetyLevel: "A"|"B"|"C"|"D",
  answerType: quran_text | quiz | sourced_explanation | sensitive_sourced | referral
            | abstention | clarification | quote_correction | scope_redirect | unavailable,
  blocks: quran | hadith | source_quote | explanation(origin: template|extractive|generated)
        | warning | referral | citation,
  generation: { allowed, used }, abstained, abstainReason, referral, disclosure
}
```
Persisted per chat message (`safetyLevel, answerType, abstainReason, generationUsed, blocks`).

### Fiqh knowledge gap

A Level C **fiqh** question (a ruling request) with no approved fiqh source abstains with reason `no_fiqh_source` and `TEMPLATES.fiqhNoMaterial` — «هذه المسألة فقهية وقد تتضمن تفصيلًا أو خلافًا. لا تتوفر في قاعدة المعرفة الحالية مادة فقهية موثوقة كافية لعرض الإجابة بمصدر معتمد.» It names OUR knowledge base as the limit, never implies that no Islamic answer exists, and states no ruling. The separate reason makes the gap measurable. Tracked as B-01 in `docs/BACKLOG.md`.

### Fixed wording — `src/server/safety/templates.ts`

Every template has a `version` (and the set a `TEMPLATE_SET_VERSION`); warning/referral blocks carry `templateId` + `templateVersion`, so a stored answer can be traced to the wording it showed. Every fixed text carries an approval status: `owner_provided` (abstain, Level D), `pending_scholarly_review` (Level C preface, no-hadith note), or `operational`. `templatesPendingReview()` lists what still needs a reviewer.

### AI disclosure

`AI_DISCLOSURE` («مساعد ذكي يعتمد على مصادر إسلامية موثقة، وليس بديلاً عن العالم أو المفتي.») is on every answer envelope and shown in the assistant footer (page and side sheet) and subtitle.

## 4. General fiqh support (design — not built; backlog B-01)

Goal: questions like «هل يجوز لي لمس المصحف بدون وضوء؟» eventually return **sourced positions, including disagreement**, without becoming a personal-fatwa system.

* **Sources** (review.pdf): approved books of the four madhhabs, `dorar.net/feqhia`, the Kuwaiti Fiqh Encyclopedia. Registered now as inert `fiqh` sources; nothing integrated or scraped.
* **Chunks:** `kind = fiqh`, `title` = topic, `madhhab`, `locator` (volume/page), `author`, verbatim text, `reviewState`. One chunk states one school's position. Every chunk is reviewed before `published`.
* **Answer (Level C):** conservative preface → positions grouped by madhhab, each a `source_quote` with its citation → an explicit statement that scholars differ when two or more positions exist. No ranking and no «الراجح» unless the source itself states it (attributed to the source). Extractive only at first.
* **Boundary:** the assistant never applies a position to the user's case. A personal variant is Level D and gets the referral; a fiqh answer never says «يجوز لك».
* **Block:** a new typed `fiqh_positions` block, so the UI can show positions apart from tafsir.
* **Admin:** `fiqh` appears in the source taxonomy as a category with a visible gap until a source is approved.

## 5. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ASSISTANT_GENERATION` | `off` | Generation needs this **and** a configured LLM. An API key alone never enables it |
| `CONTENT_STRICT_SEPARATION` | on in production | author ≠ reviewer, also for admins |
| `LLM_PROVIDER` / `ANTHROPIC_API_KEY` | extractive | unchanged |

## 6. What is deliberately NOT built yet

Admin/CMS UI · fiqh sources (design only) · contextual suggestions (backlog B-02) · hadith integration · external source syncing · asbab content · production story replacement · YouTube curation · a model-based safety classifier · King Fahd Complex migration (see its plan).
