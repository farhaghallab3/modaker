---
title: Modaker Tajweed
emoji: 📖
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Modaker tajweed checker

A small free server that listens to a recitation and points out, word by word, where the
letters, harakat or tajweed (madd, ghunnah, qalqalah) differ from the correct Hafs reading.
It wraps the open [Quran Muaalem](https://github.com/obadx/quran-muaalem) model
(`obadx/muaalem-model-v3_2`, MIT) and `quran-transcript`.

It runs on a free Hugging Face Space (CPU basic: 2 vCPU, 16 GB RAM). A free Space sleeps
after two days without use; the first check after that takes a minute or two to wake it.

## Set up (once)

1. Create a free account at huggingface.co.
2. New Space → name `modaker-tajweed` → SDK **Docker** → template **Blank** → hardware
   **CPU basic (free)** → visibility Public (the key below keeps it private to Modaker).
3. Files → Add file → Upload files: `README.md`, `Dockerfile`, `requirements.txt`, `app.py`,
   `logic.py` from this folder. Commit.
4. Settings → Variables and secrets → New secret: `MODAKER_KEY` = any long random password.
5. Wait for "Running" (the first build takes about 10 minutes).
6. In Vercel (the Modaker project) add:
   - `TAJWEED_URL` = `https://<your-hf-name>-modaker-tajweed.hf.space`
   - `TAJWEED_KEY` = the same password as `MODAKER_KEY`
   and redeploy. `/api/v1/status` then shows `"tajweed": { "ready": true }`.

## API

`POST /check` — multipart `audio` (webm/ogg/mp4/wav), form `surah`, `from`, `to`,
header `x-modaker-key`. Returns `{ ok, notes: [{ ayah, word, wordsInAyah, kind, op, rule,
expectedLen, heardLen }], pieces, matched, seconds }`. `word` is the 0-based word index in
the ayah; `kind` is `letters`, `harakat` or `tajweed`.

Audio is decoded in memory and dropped after the request; nothing is stored or logged.

## Test

`python -m unittest test_logic.py` (needs numpy only).
