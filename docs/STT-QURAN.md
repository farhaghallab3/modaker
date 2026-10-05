# Speech recognition for Quran recitation — configuration, evidence, uncertainty, limits

## The rule
The transcript is **what the recognizer heard**. It is never replaced, "corrected" or conditioned toward the
canonical text. Comparison with the Quran text happens afterwards (`src/lib/recitation/compare.ts`) and
reports **memorized-word differences only — not tajweed**.

## Pipeline & the reported case («الصراط» → «الطرق»)
raw STT text → normalize (diacritics/alef/hamza folded, **letters never changed**) → match keys → weighted
alignment against the canonical words → differences → per-ayah score → learning state. Tracing a real session
(`STT_TRACE=on`, or `traceRecitation()`): normalization and alignment were correct; **the recognizer returned a
different word** (whisper-1 gives a different wrong word for the same spoken word across attempts). Root cause:
recognition error, previously scored as a memorization error.

## Request (OpenAI)
| model | params |
|---|---|
| whisper-1 | `language=ar`, `temperature=0`, `response_format=verbose_json`, `timestamp_granularities[]=word,segment`, `prompt` |
| gpt-4o-transcribe / mini | `language=ar`, `response_format=json`, `include[]=logprobs`, `prompt` |

`STT_PROMPT` (`off|domain|surah`): the prompt is generic prose about the audio (plus the surah *name* in `surah`
mode). It **never contains ayah text** — conditioning text pulls the recognizer toward itself, so a wrong
recitation would come back "correct". Whether it improves accuracy must be measured on real audio.

## Evidence that actually exists (nothing is invented)
- whisper-1: word timestamps; **segment-level** `avg_logprob`, `no_speech_prob`, `compression_ratio` — **no word confidence**.
- gpt-4o-transcribe: per-token log-probabilities → per-word confidence; **no word timings**.
- `STT_SECOND_OPINION=<model>`: an independent second recognizer; agreement/disagreement per word.
- Last resort: a letter-confusion plausibility heuristic (ص/ط/س/ض/ظ/ق/ك… neighbours). It is a heuristic, not a measurement.

## Uncertainty state
A difference is **learner error** (`incorrect`) only if nothing suggests the recognizer misheard: another word of
the passage (genuine slip), both recognizers agreeing, high word confidence, or a not-plausible confusion.
Otherwise it is **uncertain** («لم نتأكد من هذه الكلمة — أعد هذا الجزء»): excluded from the score (numerator and
denominator), never marks an ayah weak, never schedules review, never counts as reviewed. Certain differences in
the same ayah are still scored.

## Limits (be honest)
- Quranic Arabic is a small, highly constrained vocabulary; general ASR has a language-model prior toward common words (e.g. الطرق).
- whisper-1 has no word-level confidence; gpt-4o has no timings.
- The confusion heuristic, thresholds and second-opinion value have **not** been validated on real Arabic recitation audio; use `STT_TRACE` to collect measurements.
- Different readings (qira'at), elongation, fast/slurred speech and background noise all degrade recognition.
- Uncertain ≠ correct: a user who truly says a wrong word the recognizer renders plausibly will be asked to repeat, not marked wrong, until a second signal confirms it.
