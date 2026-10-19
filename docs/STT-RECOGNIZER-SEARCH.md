# Recognizer search round 2 (research only — nothing implemented, nothing fine-tuned, no new audio)

Date: 2026-10-06. Follows [CTC-FEASIBILITY.md](CTC-FEASIBILITY.md) (the Quran-tuned wav2vec2 CTC was rejected: 0/7 speech clips literal).
Priorities: (1) fidelity to what was spoken, (2) no silent correction, (3) no completion, (4) low hallucination, (5) Arabic strength, (6) acoustic confidence, (7) Quran-domain last.
Hardware: i7-1065G7 (4C/8T), 7.8 GB RAM, no usable GPU (MX230 2 GB), C: has 2 GB free, D: 445 GB free, Docker Desktop (3.7 GB VM).
Figures marked *(est.)* are estimates, not measurements. Benchmark numbers are from papers/leaderboards on public MSA test sets, **not on Quranic recitation or our users**.

## 1. Candidate models, separated into A / B / C

A = technically promising for literal transcription · B = legally usable for production · C = feasible on our hardware.

| model | architecture | A: fidelity | B: license | C: hardware |
|---|---|---|---|---|
| **omniASR-CTC-300M-v2 / 1B-v2** (Meta Omnilingual ASR; ONNX export `EmreAkgul/omniASR-CTC-*-v2-ONNX`, runtime `fast-omniasr`) | wav2vec2-style SSL encoder + CTC head, SentencePiece vocab (10 288), no decoder, no LM | ✔ non-autoregressive, raw `logits [1,frames,10288]` exposed. MSA WER (Arab Voices benchmark, normalized, no LM): 300M-v2 26.2, 1B-v2 16.5, 3B-v2 13.5, 7B-v2 13.8 | model **Apache-2.0**, ONNX conversion Apache-2.0 (third-party, hashes in `config.json`), runtime MIT. Training corpus mixes public + community data; per-source provenance not auditable by us (same class of risk as Whisper) | 300M: 1.3 GB, ✔ CPU. 1B: 3.9 GB, ⚠ fits 7.8 GB RAM but tight |
| **nvidia/stt_ar_fastconformer_hybrid_large_pc_v1.0** | FastConformer hybrid transducer/CTC, 115 M; CTC head usable standalone (`decoder_type="ctc"`) | ✔ acoustic; MSA WER 11.5–12.1 (MASC), 8.2–9.2 (FLEURS). Top of the Open Universal Arabic ASR Leaderboard family. Outputs undiacritized text + punctuation | HF says **CC-BY-4.0**; training data (MASC 690 h auto-labelled, MCV 65 h, FLEURS 5 h) **licenses "not stated"**; the companion paper cites a different "nonexclusive-distrib" license → needs clarification | 115 M ✔ tiny; but NeMo needs Linux → Docker/WSL on a 3.7 GB VM; C: space is a problem |
| nvidia/…_pcd_v1.0 (Classical Arabic, diacritized) | same | ⚠ trained on EveryAyah reciters — the same professional-reciter domain that failed us | CC-BY-4.0 / data unstated | as above |
| facebook/w2v-bert-2.0 (pretrained, MIT) + community Arabic CTC fine-tunes (e.g. `whitefox123/w2v-bert-2.0-arabic-4`, MIT) | w2v-BERT encoder (+CTC in fine-tunes) | encoder ✔; community fine-tunes undocumented | base MIT ✔; fine-tune data unknown ✘ | 580 M, CPU slow-ish |
| Whisper large-v3 / large-v3-turbo (open weights, Apache-2.0 / MIT) | autoregressive encoder-decoder | ✘ strong text prior; known hallucination on silence/noise (our `اشتركوا في القناة`); MSA WER 15.6 / 18.5 | ✔ | large-v3 1.5 B ✘ slow on CPU |
| Cohere Transcribe Arabic (2 B, Apache-2.0, gated auto) | FastConformer encoder + autoregressive decoder | ⚠ autoregressive decoder; vendor itself advises a VAD/noise gate to stop floor noise becoming hallucinations | ✔ Apache-2.0 (gated) | 2 B ✘ |
| OmniASR-LLM, Qwen3-Omni, Voxtral | LLM decoders | ✘ rewrite toward likely text — **rejected by requirement** | various | ✘ |
| seamless-m4t-v2, mms-1b-all | — | — | **CC-BY-NC-4.0 → rejected** | — |
| Quran/Iqra phoneme CTC models (`FatimahEmadEldin/…iqraeval`, `TBOGamer22/…phonetics`, `quranic-orgz/…`) | phoneme CTC | ✔ literal, phoneme-level | ✘ data license unverifiable / NC (already rejected) | ✔ |
| ZIPA (`anyspeech/zipa-*`, multilingual phone recognizer, ONNX) | phone CTC | ✔ literal phones | ✘ **no license declared** | ✔ |
| facebook/wav2vec2-xlsr-53-espeak-cv-ft (Apache-2.0) | multilingual phoneme CTC | ✔ literal; but Arabic coverage unconfirmed and eSpeak Arabic labels are un-vocalized (short vowels guessed) → weak ground truth for a short-vowel-sensitive task | ✔ Apache-2.0, pickle `.bin` | ✔ |

Rejected outright for our requirements: anything that needs the expected transcript to recognize speech, uses Quran text as a decoding constraint, or has non-commercial/unverifiable terms.

## 2. Do we need full word transcription? Architecture comparison

| approach | preserves substitutions? | detects omission / addition / repetition / stop | needs | main weakness |
|---|---|---|---|---|
| **Free literal ASR → text → align to Quran** | ✔ if the recognizer is literal (CTC) | ✔ by alignment | one robust literal Arabic recognizer | recognizer WER becomes false accusations → needs an *uncertain* state (acoustic posteriors, not spelling heuristics) |
| Phoneme recognition → phoneme comparison | ✔ literal at sound level | ✔ | a phoneme recognizer with licensed data and short-vowel-aware labels | no verified licensed Arabic phone model; high PER on learners; tajweed-adjacent scope |
| Speech embeddings / acoustic similarity vs expected word spans (QbE-STD style, DTW over SSL features) | ✔ never produces text, so cannot "correct" | ✔ via span costs | **reference audio per expected word** (reciter audio rights, or TTS) | speaker/style mismatch; unproven for near-minimal pairs (الصراط/الطريق) across speakers; no human-readable "what you said" |
| MDD systems (Iqra'Eval class) | reference-aware ones bias toward the target (the literature says so); prompt-free ones (CROTTC-IF, F1 ≈ 0.72 on Iqra'Eval2, author claim) preserve it | ✔ | research code + licensed phoneme data | not productized; data licenses |
| **Hybrid: literal CTC posteriors + forced-alignment scoring of the expected text (GOP)** | ✔ Pass 1 never sees the verse | ✔ | any literal CTC recognizer with good-enough acoustics | only as good as the Pass-1 acoustics (the model we rejected would have produced false accusations) |

Conclusion: full word transcription is not strictly required, but the evidence says the first thing to establish is a literal recognizer whose acoustics are robust on our speakers; the posterior-based comparison (hybrid) sits on top of it. Embedding similarity is the only route that needs no good recognizer, and it is the cheapest to test in isolation.

## 3. Shortlist (ranked: cheapest decisive first)

### 1. omniASR-CTC-300M-v2, then 1B-v2, ONNX on CPU — Pass 1 only
- **Approach:** `fast-omniasr` ONNX FP32 (`EmreAkgul/omniASR-CTC-300M-v2-ONNX`, 1.3 GB; then `…1B-v2-ONNX`, 3.9 GB). Greedy CTC over the raw `logits`; no LM; no language-conditioning text; no expected text.
- **Why it might fix our failures:** the failed model was trained on professional reciters and garbled everyday speaking style. This one is a general MSA recognizer trained at very large scale (4.3 M h SSL, thousands of speakers/mics), non-autoregressive (cannot complete or silently repair), and it already did well on silence/noise class behaviour as a CTC model.
- **License:** Apache-2.0 model + conversion; MIT runtime; training-data provenance not auditable (Whisper-class risk) — flagged, not blocking the experiment.
- **Hardware:** 300M fine; 1B ≈ 4–5 GB RAM, close to the limit when other apps run.
- **Latency *(est.)*:** 300M ≈ 1–3 s per 5 s clip on this CPU (similar to the 315 M wav2vec2); 1B ≈ 3–8 s.
- **Acoustic confidence:** ✔ per-frame logits/posteriors over 10 288 SentencePiece tokens (subword, not character).
- **Biggest risk:** published MSA WER is 16.5 % (1B) / 26 % (300M) — even a "literal" model will make ~1 in 6–4 word errors on ordinary speech, so on its own it cannot decide "learner wrong"; plus third-party ONNX conversion and a very young runtime.
- **Smallest experiment:** run the 9 existing clips (no new audio) through 300M-v2 (≈1 h incl. 1.3 GB download); then 1B-v2 only if 300M is near-miss. **Accept** to continue: `الطريق` preserved (not `الصراط`), stop-halfway not completed, repetition ×2 preserved, ≥ 5/7 speech clips word-literal after orthographic normalization only, silence/noise empty. **Reject** if any substitution is rewritten toward the Quran or ≥ 3 speech clips are garbled.

### 2. Acoustic-similarity probe (no transcription): subsequence DTW on SSL features, existing clips
- **Approach:** `facebook/w2v-bert-2.0` (MIT) or `facebook/wav2vec2-xls-r-300m` (Apache-2.0) mid-layer features. Use the user's own "stop-halfway" clip («اهدنا الصراط») as a query and open-ended subsequence-DTW it against the three full clips: correct («…الصراط المستقيم»), repetition, and the substitution («…الطريق…»).
- **Why it might help:** it never emits text, so it cannot rewrite a wrong word into a Quran word; it directly tests whether the embedding space separates the exact minimal pair that broke the GPT models.
- **License:** MIT / Apache-2.0 base models; **no** reference audio is needed for this test (uses the user's own clips).
- **Hardware / latency:** CPU-only; seconds per clip.
- **Confidence:** a distance/cost profile per span, not probabilities (needs calibration).
- **Biggest risk:** same speaker/session/mic for all clips → optimistic. A production version needs reference audio per word (reciter-audio rights or TTS) and speaker-independent calibration.
- **Smallest experiment:** the DTW cost on the «الصراط» region must be clearly lower for the correct/repetition clips than for the substitution clip, with a margin well outside within-class variation. **Reject** if the margin is within noise. (≈ half a day; no download beyond the ~1.2 GB encoder.)

### 3. NVIDIA FastConformer-hybrid (MSA, `…_pc_v1.0`) CTC head via NeMo (Docker/WSL)
- **Approach:** CTC head only, greedy, no LM; same 9 clips and report.
- **Why:** strongest open Arabic acoustics (leaderboard top family), tiny (115 M), a different training distribution (MASC/MCV/FLEURS: spoken MSA from many speakers) than the rejected model.
- **License:** CC-BY-4.0 on the model; **training-data licenses not stated and the paper cites a different license** → production blocker until clarified.
- **Hardware:** 115 M is easy; the *setup* is the cost: NeMo is Linux-only; Docker VM has 3.7 GB RAM and the image + NeMo is several GB (Docker root is on C: with 2 GB free → must relocate to D: first).
- **Latency *(est.)*:** < 1 s per 5 s clip on CPU.
- **Confidence:** ✔ CTC logits (BPE, 1024 tokens).
- **Biggest risk:** the environment effort (Docker/NeMo on this machine) outweighs the experiment; output is punctuated text, which must not be post-processed.
- **Smallest experiment:** only if #1 fails to separate. Same accept/reject criteria as #1.

## 4. What I did not find / limits
- No public model I could verify is both Quranic-fluent and literal on non-reciter speech; every strong open Arabic recognizer is an MSA/dialect general model.
- No verified, licensed Arabic phoneme recognizer.
- All WER figures above are on public MSA test sets, not on recitation, children, or phone microphones.
- Nothing here was downloaded or run.
