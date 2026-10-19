# Munajjam audit — can it tell us what a learner actually SPOKE? (research only, 2026-10-06)

Repository: <https://github.com/Itqan-community/Munajjam>, `main` @ 2026-10-04, license **MIT**. Read-only audit of the actual source
(fetched file by file; nothing cloned, installed, copied or run). Also inspected the unmerged branches/PRs that the question names
(`feat/fastconformer-ctc` PR #114, `feat/chirp3-backend` PR #111, open PR #125 + issue #120). Our question is **not** "can it align
professional recordings" but "can any component recover the learner's real words without pulling them toward the canonical text".

## 1. What is actually in `main` (and what is not)

| Item | Status in `main` |
|---|---|
| faster-whisper / Whisper (Transformers) | ✔ `transcription/whisper.py` (default model `OdyAsh/faster-whisper-base-ar-quran`, a CTranslate2 build of `tarteel-ai/whisper-base-ar-quran`, Apache-2.0) |
| WhisperX (+ wav2vec2 CTC aligner `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`) | ✔ `transcription/whisperx.py`; **`server.py` always uses this backend** |
| Breath / pause segmentation | ✔ `transcription/silence.py` (pydub/librosa **energy** thresholds, text-independent) |
| DP / greedy / hybrid / word-level DP aligners, drift/overlap fixing | ✔ `core/*.py` |
| Unaligned-word recovery | ✔ `core/cascade_recovery.py` |
| Phonetic similarity | ✔ `core/phonetic.py` (a letter-confusion table, used by word-level DP) |
| FastConformer CTC, Chirp 3, Deepgram, Replicate | ✘ **not in `main`** — closed/unmerged PRs and branches only |
| Zipformer phoneme model, Silero VAD, `obadx/recitation-segmenter-v2`, `HybridQuranAligner` | ✘ **not implemented** — only model *downloaders* + dependency entries landed (2026-10-04); PR #125's server calls `HybridQuranAligner` and raises `NotImplementedError("Waiting for HybridQuranAligner from Issue #120")` |

## 2. The real pipelines

**A. Server / WhisperX path (the default API):**
`audio → (detect_reciter_breaths: energy) → whisperx.load_model(large-v2, "ar") → transcribe() → raw segments → normalize_arabic() overwrites segment text → whisperx.align (wav2vec2 CTC over the HYPOTHESIS words) → word list {word, start, end, score} →`
**`load_surah_ayahs(surah)` (canonical text is loaded inside `transcribe`) → DP between canonical words and recognized words, `fuzz.ratio ≥ 0.5` counts as a match →`
**emitted word = `ref_words[k]` (the canonical word)**, timing and `score` taken from the recognized word; unmatched canonical words get placeholder time (`prev_end … +0.1`) and `confidence = 0.0` → `cascade_recovery` re-runs `whisperx.align` over the gap audio **with the canonical words as the text** and returns canonical words with the recovered times → `Segment.text = ayah.text` (canonical).

**B. Library / faster-whisper path:**
`audio → faster_whisper.transcribe(beam=5, language="ar", word_timestamps=True)` (no prompt, no canonical text) `→ Segment(text=raw, start, end)` — word timestamps and probabilities are requested but **not copied into the Segment** →
`Aligner` (hybrid/DP/greedy over **segments**, or word-level DP over words with char-proportional estimated times) → `AlignmentResult{ayah, start/end, transcribed_text = merged RAW hypothesis, similarity_score = Indel(merged hypothesis, canonical ayah)}`.
Canonical text is used only to decide *which ayah* a stretch of hypothesis belongs to and to score similarity; `transcribed_text` is never rewritten.

## 3. Component matrix (the eight questions)

| Component | 1 gets canonical text | 2 keeps raw output | 3 can replace observed word with Quran word | 4 acoustic/word confidence | 5 substitution | 6 omission | 7 repetition | 8 stop halfway |
|---|---|---|---|---|---|---|---|---|
| `Whisper` transcriber (B-path front end) | no (surah id only; no prompt) | ✔ segment text (word info dropped) | no | ✘ (probabilities discarded) | only implicitly, as a different raw string | implicit | implicit (raw text) | implicit |
| Quran-tuned Whisper model it loads | no | ✔ | **model-side**: autoregressive + Quran fine-tune ⇒ strong prior to *produce* the Quran word | decoder probs (unused) | — | — | — | — |
| `Whisperx.transcribe` word mapping | **yes** | ✘ hypothesis words discarded in the output | **YES (by design)** | recognized word's align score reused as the canonical word's confidence | ✘ hidden (≥0.5 fuzzy = "match") | placeholder, conf 0 | ✘ dropped as "extra audio word" | placeholder, conf 0 |
| `cascade_recovery` | **yes (text being aligned is canonical)** | n/a | **YES** — fabricates timestamps for canonical words that may never have been said | `0.85` default | ✘ | ✘ hides it | ✘ | ✘ hides it |
| `aligner*` / `dp_core` / `hybrid` / `zone_realigner` | yes (as the target) | ✔ `transcribed_text` untouched | no | no (only ayah-level similarity) | ayah-level similarity dip only | merged text shorter / coverage ratio | merged text longer | coverage ratio < 1 |
| `word_level_dp` | yes | ✔ recognized words kept per ayah | no | no (`probability` default 0; times estimated) | not per word | not per word | kept in the word stream | via coverage |
| `core/phonetic.py` | yes | n/a | makes confusable letters count as near-equal (the kind of leniency we removed) | — | **hides** ص/س, ت/ط, ق/ك, ه/ح… swaps | — | — | — |
| `silence.py` breath / energy | **no** (audio only) | n/a | no | energy only | ✘ | ✘ | ✘ | ✔ can show "speech ended here" |
| Chirp 3 (unmerged) | yes (same fuzzy-map-to-canonical-word pattern) | ✘ | **YES** | word confidence from Google | ✘ | placeholder | ✘ | placeholder |
| FastConformer CTC (unmerged) | yes (**forced alignment of tokenized canonical text** to CTC log-probs) | n/a | forced alignment *assumes* the text was said | CTC log-probs available | ✘ | ✘ | ✘ | ✘ |

## 4. The thought experiment: canonical «الصراط», learner says «الطريق»

1. **Raw recognizer.** *A (WhisperX, general `large-v2`)* — may emit «الطريق», or its LM prior may emit «الصراط» (what the GPT models did). *B (Quran-tuned Tarteel-Whisper base)* — fine-tuned on reciters reading Quran text; we have **not** measured it, and an autoregressive Quran-tuned decoder is the class most likely to "correct" (our own research doc flagged this).
2. **Survives normalization?** Yes: `normalize_arabic` only folds alefs/diacritics; «الطريق» stays «الطريق».
3. **Path A alignment.** Computed with their exact normalization (dagger alef removed) and `rapidfuzz` Indel ratio: «الصرط» vs «الطريق» = **54.5 %**, above the 50 % acceptance line ⇒ DP **matches** them. The emitted word is the canonical «الصراط», timing and score from the learner's actual word. **The learner's «الطريق» is not in the output.** (Had the score been < 50 %: placeholder + `confidence 0.0`, then `cascade_recovery` forced-aligns the canonical word over that audio and returns it as "recovered".) Other swaps their rule also accepts: الضالين→الظالين 85.7 %, نستعين→نستعيذ 83.3 %, الرحمن→الرحيم 83.3 %, إياك→إياه 75 %, المستقيم→المستقبل 75 %.
4. **Path B alignment.** The hypothesis string (whatever it contains) is kept verbatim in `transcribed_text`; the substitution shows only as a small ayah-level similarity drop, with no word identified. Alignment is *to the ayah*, not word-by-word to canonical words, so it is not itself a "forcing" step — but it also does not tell us *which* word differed.

Alignment success in these components therefore **cannot** be read as evidence the learner said the canonical word, and Path A actively manufactures that appearance.

## 5. Classification

| Class | Components |
|---|---|
| **A — safe/relevant for learner recitation** | None as a *recognizer*. Marginal: text-independent energy/breath detection (`silence.py`) can support "speech stopped here" evidence; we already derive pauses from Whisper word timestamps. |
| **B — Quran alignment only** | Ayah-level DP/greedy/hybrid aligners, drift/overlap fixing, breath-group segmentation idea (`obadx/recitation-segmenter-v2`, MIT, w2v-BERT-2.0 based), CTC forced alignment (`ctc-segmentation`, wav2vec2/FastConformer log-probs). Useful for "where is this ayah/word in a long recording"; a possible future Pass-2 reference. |
| **C — dangerous for learner-error detection** | `Whisperx.transcribe` word mapping (emits canonical words), `cascade_recovery` (aligns canonical text over audio and fabricates times), `core/phonetic.py` confusion table, the fuzzy ≥0.5 acceptance, Chirp-3 mapping (same pattern), forced alignment used as if it were recognition (FastConformer branch). |
| **D — not relevant** | Silence/overlap bookkeeping, CLI, formatters, Deepgram/Replicate wrappers, deployment plumbing. |

## 6. Licenses and provenance (what we'd actually reuse)
- Munajjam code: **MIT**. WhisperX / faster-whisper: permissive (not individually re-verified here). 
- `OdyAsh/faster-whisper-base-ar-quran` and `tarteel-ai/whisper-base-ar-quran`: **Apache-2.0** on the model; training data `tarteel-ai/everyayah` has **no license on Hugging Face** — same provenance question as our rejected wav2vec2 CTC.
- `obadx/recitation-segmenter-v2`: MIT (data not audited). `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`: Apache-2.0 (Common Voice + Arabic Speech Corpus).
- `Quran-Lab/zipformer_p-arabic-v3` (the "phoneme-aware" model planned for the hybrid engine): **gated (manual approval), license "other"** — cannot be verified without access ⇒ rejected under our rule. Its card advertises Quran phoneme CTC, tajweed, streaming and a `decode_with_confidence.py`, so it is the only item that *might* matter later; Munajjam contains no code that uses it yet.
- NVIDIA FastConformer (branch only): CC-BY-4.0 model, training-data licenses unstated (same as in our shortlist). Chirp 3: proprietary Google Cloud API (audio leaves our infrastructure).

## 7. Versus our measured failures

| Our failure | Does Munajjam change anything? |
|---|---|
| GPT transcribers silently «الطريق»→«الصراط» | Not addressed; Munajjam's default path would *also* hide it, one stage later, by design. |
| whisper-1 hallucination | Munajjam does not detect hallucination; `similarity_score` would just be low. |
| Quran wav2vec2 CTC literal but 0/7 on real speech | Not addressed; Munajjam's CTC use is forced alignment, not recognition. |
| OmniASR CTC 0/7, mixed scripts | Not addressed. |
| Unmeasured: Quran-tuned Whisper (Munajjam's default recognizer) | Same class as the GPT problem (strong text prior); would be a model test, not a Munajjam component. |

Nothing in Munajjam is technically new at the **recognition** layer. Its contribution is robust *alignment* of known text to long audio, which presupposes the text was recited correctly.

## 8. Decision: **USE LATER FOR ALIGNMENT**
Useful reference for a future Pass 2 (forced alignment inside breath groups, MIT license) once a literal Pass 1 exists; it does not solve Pass-1 fidelity and gives no new reason to reopen recognizer R&D. Hard rules if ever reused: never the WhisperX word-mapping path, never `cascade_recovery`, never `phonetic.py`, never fuzzy ≥0.5 acceptance; keep raw hypothesis words and per-word probabilities. Re-check only if (a) `Quran-Lab/zipformer_p-arabic-v3` becomes accessible with a verified license **and** (b) someone can show it as a reference-blind phoneme/char recognizer on non-reciter speech. Current Beta policy and the MVP checklist are unchanged.
