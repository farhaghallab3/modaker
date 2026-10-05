# Content & UX backlog

Requirements discovered during QA and review, assigned to the phase that must solve them. Nothing here is built unless marked **done**.

| ID | Type | Phase | Status |
|---|---|---|---|
| B-01 | Knowledge gap — general fiqh sources | Knowledge-source phase (after P3) | recorded; taxonomy + registry prepared |
| B-02 | UX — contextual suggestions | UX phase (after P3) | recorded |
| B-03 | Content — scholarly review of religious-facing wording | P3 (template sign-off screen) | recorded |
| B-04 | Admin — source taxonomy includes `fiqh` | P3 | taxonomy **done**, UI pending |

---

## B-01 General fiqh knowledge gap

**Observed.** «هل يجوز لي لمس المصحف بدون وضوء؟» is correctly Level C, but no approved fiqh source is loaded, so the assistant can only state the limitation. The ONLY approved sources today are the Quran text and Muyassar tafsir.

**Requirement.** Support approved *general* fiqh sources so questions like this can eventually return **sourced information, including where scholars differ**, without becoming a personal-fatwa system. `review.pdf` names the sources for general fiqh: any approved fiqh book on one of the four madhhabs, or `dorar.net/feqhia`; the Kuwaiti Fiqh Encyclopedia is described as the reference for fiqh terminology. The PDF's rule is explicit: general fiqh **must not become a personal fatwa or an automatic tarjih**.

**Not in scope until the knowledge-source phase:** integrating, downloading or scraping any fiqh source. Prepared now:

* Taxonomy: `KnowledgeKind` has a `fiqh` value; `KnowledgeChunk.madhhab` exists (one chunk states ONE school's position).
* Registry (inert — disabled, draft, `licenseVerified=false`, human review required): `kuwaiti-fiqh-encyclopedia`, `dorar:fiqh`.
* Behaviour: a recognised fiqh question with no approved fiqh source abstains with reason `no_fiqh_source` (so the gap can be measured) and the wording in `TEMPLATES.fiqhNoMaterial`.

**Prerequisites (decisions needed).** A named content reviewer with fiqh competence · a person reads each source's terms (`licenseVerified`) · which madhhab books are in scope · whether a school's *stated* preference may ever be shown (only if the source itself states it, attributed — never chosen by us).

**Design for the knowledge-source phase** (see `docs/ARCHITECTURE-safety.md` §6):
1. Ingest curated entries as `fiqh` chunks: topic title, the source's own wording, madhhab, volume/page locator, author — each reviewed before `published`.
2. Level C answers compose **positions by madhhab**, each quoted and cited, with the conservative preface, stating disagreement where the sources show it. No ranking, no "الراجح" unless the source itself says so, attributed to it.
3. The assistant never applies a position to the user's case: personal application stays Level D (referral).
4. No generation for fiqh in the first iteration (extractive only).
5. A new typed block (`fiqh_positions`) so the UI can render positions separately from tafsir quotes.
6. Acceptance tests: the reported question returns ≥1 cited position or the honest limitation; disagreement is stated when ≥2 madhhab positions exist; a personal variant of the same question still returns the referral; nothing is shown from an unapproved or demo chunk.

**Not ingested as fiqh:** fatwa collections (IslamQA, Bin Baz, Uthaymeen). They answer individual cases; ingesting them would contradict the Level D rule. They remain candidates for an admin-managed *referral directory* (see decision 6 of the P1/P2 brief).

---

## B-02 Contextual suggestions

**Observed.** After a fiqh abstention the UI still offers fixed prompts: «اشرح لي هذه الآية», «احكِ لي قصة أصحاب الكهف», «اختبرني في سورة مريم», «ما معنى هذه الكلمة؟» (`ASSISTANT_SUGGESTIONS` in `src/components/assistant/AIChat.tsx`). They are unrelated to the answer.

**Requirement.** Suggestions depend on the answer's `answerType` / `safetyLevel` / `abstainReason`, and **only actions that actually work with the available data are shown**. Do not redesign now.

| Situation (from the envelope) | Appropriate actions | Works today? |
|---|---|---|
| Level C abstention (`no_fiqh_source` / `no_evidence`) | عرض المصادر المتاحة · إعادة صياغة السؤال كسؤال عام · اسأل عن آية مرتبطة بالموضوع | only if an approved passage or a related ayah exists |
| Level D referral | عرض المعلومات العامة والنصوص المرتبطة (if citations) | only with citations |
| `clarification` (ambiguous quotation) | pick one of the candidate ayahs | yes (candidates are in the blocks) |
| `quote_correction` | اشرح هذه الآية · استمع للآية | yes |
| `no_hadith_source` | اسأل عن آية / تفسير | yes |
| `language_unsupported` | ask in Arabic | yes |
| `scope_redirect` | the default prompts | yes |
| `sourced_explanation` | آيات ذات صلة · اختبرني في هذه السورة | yes (surah known) |

**Implementation note (later).** Compute suggestions from the answer envelope on the server (or a pure function over it) and filter each by a capability check; never show a chip whose action would end in another abstention.

---

## B-03 Scholarly review of religious-facing wording

Templates are centralized and versioned in `src/server/safety/templates.ts` (`TEMPLATE_SET_VERSION`). Pending scholarly review: Level C preface (`sensitive.preface`), the Level C no-material clause, the fiqh limitation (`fiqh.nomaterial`), the no-hadith note, and the sensitive-topic / English lexicons (`lexicon.ts`). `templatesPendingReview()` lists them. P3 should add a sign-off screen; a reviewer-approved wording bumps the template's `version`.

## B-04 Admin source taxonomy

The registry's `kind` is the taxonomy the Admin screen groups by: `quran · translation · tafsir · asbab · hadith · seerah · glossary · fiqh · curated`. `fiqh` was added with this backlog item (migration `20261006100000_fiqh_kind`). P3's المصادر العلمية screen should show kind, tier, authority, API availability, enabled, last sync, content count and review state, and should surface `fiqh` as an **empty category with a visible "gap"** until a source is approved.

## Carried over from P1/P2 (see `docs/ARCHITECTURE-safety.md`, `docs/PRIVACY-DATA-INVENTORY.md`)

* Runtime source checks still read the in-code registry; make them DB-backed (P3 step 2).
* Chat history retention and a privacy-policy page.
* Real-LLM generation has never been exercised (blocked by credentials); keep it off.
* King Fahd Complex migration plan awaiting source verification.
