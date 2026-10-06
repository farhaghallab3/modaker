# Offline CTC feasibility probe (dev only, Pass 1 only)

Nothing here is wired into the app's recitation flow, scoring or learning state. Audio stays on this machine.

Setup (kept OUTSIDE the repo/OneDrive; ~2 GB incl. model):
```
python -m venv D:/ctc-poc/.venv
D:/ctc-poc/.venv/Scripts/python -m pip install torch numpy --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
D:/ctc-poc/.venv/Scripts/python -m pip install transformers safetensors
```
0. Dev routes exist only when the app runs with `DEV_TOOLS=1` (PowerShell: `$env:DEV_TOOLS=1; npm run dev`); production builds exclude them.
1. `.env.local`: `STT_BENCHMARK="on"`, `CTC_CLIPS_DIR="D:/ctc-poc/clips-data"`; open `/dev/clip-recorder`, record the clips.
2. `HF_HOME=D:/ctc-poc/hf D:/ctc-poc/.venv/Scripts/python tools/ctc-poc/probe.py --clips D:/ctc-poc/clips-data --model <hf-id>`
3. `npx tsx scripts/ctc-report.ts D:/ctc-poc/clips-data D:/ctc-poc/clips-data/results-<id>.json`

Pass 1 = greedy argmax -> collapse repeats -> drop blank. No LM, no lexicon, no canonical text, no post-processing.
Weights are loaded from `.safetensors` only (no pickle).
