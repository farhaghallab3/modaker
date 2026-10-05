# CTC Quran/Arabic candidates — Step 0A verification (2026-10-06)

Verified directly against the Hugging Face API / raw repo files before any download.

| candidate | arch | license (model / data) | access | vocabulary | verdict |
|---|---|---|---|---|---|
| `rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final` | `Wav2Vec2ForCTC`, 24 layers, 315.5 M params | Apache-2.0 / dataset `rabah2026/Quran-Ayah-Corpus` Apache-2.0 | public, ungated, `model.safetensors` 1.26 GB | 56 Arabic chars incl. harakat, shadda, Uthmani `ٱ ٰ`; blank = `<pad>` (id 0) | **ACCEPTED** (tested) |
| `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` (its base; no-Quran-prior control) | CTC | Apache-2.0 / Common Voice + Arabic Speech Corpus (latter's license not stated on HF) | public, **pickle `.bin` only** | Arabic chars, no harakat | deferred (control; data license partly unverified, pickle weights) |
| `quran-dev/wav2vec2-ctc-quran-phoneme-run66-*` | — | — | **API returns "Invalid username or password"** | 71 phonemes (per paper listing) | **REJECTED: access not verifiable** |
| `quranic-orgz/omni-ctc-ipa-v7-*` | Wav2Vec2ForCTC | **CC-BY-NC-4.0** | public | 71 IPA | **REJECTED: non-commercial** |
| `kuran-kerim-lab/wav2vec2-ctc-quran-stage6` | Wav2Vec2ForCTC | **none declared** | public | 42 | **REJECTED: no license** |
| `FatimahEmadEldin/wav2vec2-xls-r-300m-iqraeval` | Wav2Vec2ForCTC | model Apache-2.0, **training datasets (IqraEval/Iqra_train, Iqra_TTS) declare no license** | public | 72 phonemes | **REJECTED: data license unverifiable** |
| `TBOGamer22/wav2vec2-quran-phonetics` | Wav2Vec2ForCTC (base, English-pretrained) | model Apache-2.0, **dataset (quran-md-words) no license** | public | 40 phonetic | **REJECTED: data license unverifiable** |
| `facebook/mms-1b-all` | CTC adapters | **CC-BY-NC-4.0** | public | — | **REJECTED: non-commercial** |

Accepted candidate details (`rabah2026/…-v_final`, revision `b03a268c6ba1a693752307325ab376c86c3b12da`, safetensors sha256 `bf65674a…99ecb`):
- Acoustic CTC encoder (wav2vec2, no decoder, no language model); greedy decoding needs nothing but the logits; raw frame logits/posteriors are available (`Wav2Vec2ForCTC(...).logits`, 20 ms stride).
- 16 kHz mono, zero-mean/unit-variance normalization (`do_normalize: true`); no attention mask required for single clips.
- All 424 weights load with no missing/unexpected/mismatched keys (verified with `output_loading_info`).
- Hardware: 1.26 GB on disk, ~1.3 GB RAM fp32. Measured on this machine (8-core CPU, no usable GPU — MX230 2 GB): ~3 s to process a 5 s clip (≈0.6× real time), 6.6 s model load.
- Caveat: license is Apache-2.0 on the model and its dataset, but the dataset is a re-packaging of reciter audio (EveryAyah-style); the upstream recordings' own rights are not established by the HF metadata. **Legal review needed before any production use.**

## ⛔ Production blocker (recorded, legal review deferred until after feasibility)
The accepted model/dataset are labelled Apache-2.0 on Hugging Face, but the training data is a re-packaging of professional reciters' recordings. HF metadata does not establish the rights to the original recordings. **Legal review is required before any production use.**

## Step 0B result — Pass 1 only, `rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final` (2026-10-06)
9 real clips, one speaker, one microphone (laptop/browser), converted to 16 kHz mono WAV; audio levels verified normal (RMS 0.035–0.052, no clipping). Greedy CTC, no LM / lexicon / canonical text / post-processing. Literal output exactly as emitted (diacritics included):

| clip | spoken (ground truth) | literal CTC output | fidelity |
|---|---|---|---|
| correct | اهدنا الصراط المستقيم | `لْمُتَّلَةِ مِلتَّخْنَ` | ✘ unrelated |
| (labelled "correct"; actually the substitution) | اهدنا الطريق المستقيم | `نَطَّرْسُمْحُقيمَ` | ✘ garbled (no `الصراط`) |
| correct | قل هو الله أحد | `كُلْ هَوَاءَمْنَاهَ أَحَدٌ` | ✘ partly right (كُلْ، أَحَدٌ) |
| stop-halfway | اهدنا الصراط | `اهْدْ نَفْتْرَع` | ✘ no completion, but الصراط wrong |
| omission | اهدنا المستقيم | `فَهِدْنَا الْمُسْتَقِيمَ` | ≈ (ف for ا; omission preserved) |
| repetition | اهدنا الصراط الصراط المستقيم | `إذْ أَتْرَك قََتَقْ` | ✘ unrelated |
| non-Quran | السلام عليكم كيف حالك اليوم | `اِسْرَمْ عَلَيْكُمْ كُفَالَت الْيَوْمَ` | ✘ 2 of 5 words exact |
| silence | — | (empty) | ✔ no speech |
| noise | — | (empty) | ✔ no speech |

Findings: 0/7 speech clips literal; 0 silent corrections toward the Quran; 0 hallucinations on silence/noise; latency ≈ 0.5–0.9× real time on CPU after warm-up (first clip 12.9 s incl. warm-up). The model neither corrects toward the Quran nor transcribes this speaker's recitation reliably. Verdict: **not feasible as a Pass-1 recognizer for this speaker/microphone as-is.** Not tested: fine-tuning, other speakers, other microphones, other candidates.
