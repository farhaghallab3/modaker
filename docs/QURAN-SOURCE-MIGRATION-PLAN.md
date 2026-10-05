# Quran source migration plan — King Fahd Complex dataset

Status: **PLAN ONLY. The production Quran source has not been changed and must not be until every gate below passes.**

`review.pdf` names the King Fahd Complex for the Quran printing house (مجمع الملك فهد لطباعة المصحف الشريف) as the reference edition for the Quran text. It is registered as `king-fahd-complex:quran` (tier 1, **disabled, draft, `licenseVerified = false`**). The working sources — Quran.com (`quran-com:uthmani`) and Tanzil (`tanzil:uthmani`) — stay operational throughout; Quran.com remains a secondary/cross-check source afterwards.

> A Quran-source migration is **never** a normal content migration. It changes the text every user reads and memorises, and the text the recitation matcher scores against. It needs explicit verification and an explicit decision.

## Gate 0 — verify the source (a person, not a script)

I could not read the official portal from this environment (automated requests were refused), so none of the following is verified. Record the answers in the registry (`licenseNote`, `licenseVerified`) and in this file:

| Check | Question | Answer (to fill) |
|---|---|---|
| Official dataset | Is `qurancomplex.gov.sa/quran-dev` the official developer channel? Which exact files/endpoints? | |
| Exact edition | Which riwaya and which printing/edition (Hafs 'an 'Asim, Madinah mushaf)? Version/date of the dataset? | |
| Terms & licensing | May we store, cache and redistribute it inside a commercial/non-commercial app? Attribution text? Any prohibition on modification, caching or derived indexes (e.g. our normalised skeleton index)? | |
| Developer conditions | Registration, API keys, rate limits, mandatory fonts, mandatory notices? | |
| Text format | XML/JSON? Encoding, Unicode normalisation form, how marks (small high letters, dagger alef, sajda signs, ayah-end signs) are encoded, whether ayah numbers or end markers are inside the text | |
| Identifiers | Ayah id scheme (surah:ayah? global index?), word-level ids, how to map to our `Ayah.key` ("19:32") and `globalIndex` (1–6236) | |
| Compatibility | Does it contain exactly 114 surahs / 6,236 ayahs with the same ayah division as our current data (e.g. basmala handling in al-Fatiha, the muqatta'at ayahs)? | |

Gate 0 passes only when a named person signs off the table and sets `licenseVerified = true`.

## Gate 1 — import into a **staging** table, not production

* New importer `scripts/import-quran.ts --complex <path>` writes to a separate staging schema/table (e.g. `AyahCandidate`), tagged `sourceId = king-fahd-complex:quran`, with the same per-surah checksum scheme (`src/server/quran/verification.ts`).
* Production `Surah`/`Ayah` rows are untouched. The registry source stays disabled.

## Gate 2 — exact integrity comparison (must be 100%)

An automated report compares the staging dataset with the **currently served** text, for all 6,236 ayahs:

1. Counts: 114 surahs; per-surah ayah counts equal the metadata in `src/lib/quran/surahs.ts`; total 6,236.
2. Identifiers: every `surah:ayah` key maps one-to-one.
3. **Byte comparison** of `textUthmani` after NFC normalisation, ayah by ayah.
4. For every difference, classify: (a) identical, (b) only invisible/ordering differences in combining marks, (c) different rasm/spelling/marks, (d) different words. Anything in (c)/(d) is listed with surah:ayah, both strings, and a side-by-side diff.
5. **Skeleton comparison** (the recitation matcher's `matchKey` form) — the number of ayahs whose skeleton changes must be reported; a change here directly alters recitation scoring.
6. Cross-check against the second independent source (Tanzil/Quran.com): a three-way disagreement is a blocker until a person resolves it.

Pass criterion: zero unexplained differences. Every (b)/(c)/(d) difference needs a written, signed decision ("adopt Complex", "keep current", "needs scholar").

## Gate 3 — downstream impact check

Run before any switch, against staging data:

* `npm test` with the staging provider (the suites use synthetic text, so also add a golden-file test over the real corpus checksum).
* Recitation: re-score a fixed set of recorded/simulated recitations; no ayah may flip between "mastered" and "needs review" unexpectedly.
* Quote verifier: rebuild the index; known-good and known-corrupted quotation fixtures must give identical results.
* Stored user data: `MemorizationProgress`/`Bookmark`/`ResumePoint` reference ayahs by `surah:ayah` numbers only, never by text — confirm numbering is identical, so no user data needs migrating.
* Audio: ayah audio (EveryAyah / future mp3quran) is keyed by number; confirm the numbering matches the new dataset.
* Fonts: if the Complex requires its own Unicode fonts (`fonts.qurancomplex.gov.sa`), plan the licence + loading separately.

## Gate 4 — switch (explicit decision, reversible)

1. A named owner approves in writing.
2. Set the new source `enabled = true`, `reviewState = published` through the review workflow (audit event recorded), and switch `QURAN_PROVIDER` / the `Surah.sourceId` for the new rows in **one transaction**.
3. Keep the previous dataset and its checksums; rollback = flip back and re-run the checksum verification (the providers re-verify on first load).
4. Monitor: verification failures (`QuranVerificationError`), recitation score distribution, error rates for one release.

## Out of scope for P1/P2

No dataset has been downloaded, no importer written, no table created for staging, and no change was made to the Quran text or provider configuration.
