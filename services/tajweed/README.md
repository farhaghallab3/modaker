---
title: Modaker Tajweed
emoji: 📖
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 6.27.0
python_version: "3.10"
app_file: app.py
pinned: false
license: mit
---

# Modaker tajweed checker

A small free server that listens to a recitation and points out, word by word, where the
letters, harakat or tajweed (madd, ghunnah, qalqalah) differ from the correct Hafs reading.
It wraps the open [Quran Muaalem](https://github.com/obadx/quran-muaalem) model
(`obadx/muaalem-model-v3_2`, MIT) and `quran-transcript`.

It runs on a free Hugging Face Space (Gradio SDK, **ZeroGPU** hardware: free GPU time with a daily
quota). A free Space sleeps after a while without use; the first check after that takes a minute
or two to wake it.

## Set up (once)

1. Create a free account at huggingface.co.
2. New Space → name `modaker-checker` → SDK **Gradio** → template **Blank** → hardware
   **ZeroGPU (free)** → visibility Public (the key below keeps it private to Modaker).
3. Files → Add file → Upload files: `README.md`, `requirements.txt`, `packages.txt`, `app.py`,
   `logic.py` from this folder (replace the README that is already there). Commit.
4. Settings → Variables and secrets → New secret: `MODAKER_KEY` = any long random password.
5. Wait for "Running" (the first build takes about 10 minutes).
6. Optional but recommended: huggingface.co/settings/tokens → New token (Read). GPU time is then
   counted on your free account's daily quota instead of the small anonymous one.
7. In Vercel (the Modaker project) add:
   - `TAJWEED_URL` = `https://<your-hf-name>-modaker-checker.hf.space`
   - `TAJWEED_KEY` = the same password as `MODAKER_KEY`
   - `TAJWEED_HF_TOKEN` = the token from step 6 (optional)
   and redeploy. `/api/v1/status` then shows `"tajweed": { "ready": true }`.

## API (Gradio)

`POST /gradio_api/call/check` with `{"data": [audio_base64, surah, from, to, key]}` returns
`{"event_id"}`; `GET /gradio_api/call/check/<event_id>` streams events, and `complete` carries
`[result]`. `result` is `{ ok, notes: [{ ayah, word, wordsInAyah, kind, op, rule, expectedLen,
heardLen }], pieces, matched, seconds }` or `{ ok: false, error }`. `word` is the 0-based word
index in the ayah; `kind` is `letters`, `harakat` or `tajweed`.

Audio is decoded in memory and dropped after the request; nothing is stored or logged.

## Test

`python -m unittest test_logic.py` (needs numpy only).
