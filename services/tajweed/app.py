"""Modaker tajweed checker: a small free server around the open Quran Muaalem model.

Runs as a free Hugging Face Space (Gradio SDK, ZeroGPU). Modaker calls its API:
  POST /gradio_api/call/check  {"data": [audio_base64, surah, from, to, key]}  → {"event_id": ...}
  GET  /gradio_api/call/check/<event_id>  → server-sent events; "complete" carries [result]
  result = {"ok": true, "notes": [...], "good": [...], "heardAyahs": [...], "pieces": n, "matched": m, "seconds": s}  or  {"ok": false, "error": ...}

The model (obadx/muaalem-model-v3_2, MIT) hears the recitation as phonemes; quran_transcript
builds the correct phonemes for the same words (Hafs) and explains the differences.
Audio is decoded in memory and dropped after the request. Nothing is stored or logged.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import os
import subprocess
import time

import gradio as gr
import numpy as np
import spaces
import torch

from quran_transcript import Aya, alphabet as alph, explain_error, quran_phonetizer
from quran_transcript.phonetics.moshaf_attributes import MoshafAttributes
from quran_transcript.phonetics.search import NoPhonemesSearchResult, PhoneticSearch
from logic import MAX_GOOD, SR, WordRef, finalize, good_from_mappings, join_references, notes_from_errors, split_on_silence, word_offsets
from muaalem_model import greedy_ctc, load_muaalem

MODEL = os.environ.get("MUAALEM_MODEL", "obadx/muaalem-model-v3_2")
SECRET = os.environ.get("MODAKER_KEY", "")
DEBUG = os.environ.get("TAJWEED_DEBUG", "1") == "1"
MAX_BYTES = 15 * 1024 * 1024
MAX_SECONDS = 120

# Hafs 'an 'Asim, the madd lengths most Egyptian teachers use (the checker tolerates ±1).
MOSHAF = MoshafAttributes(
    rewaya="hafs",
    madd_monfasel_len=4,
    madd_mottasel_len=4,
    madd_mottasel_waqf=4,
    madd_aared_len=4,
)

# Loaded once at start-up. On ZeroGPU the model is placed on "cuda" here and really moves to the GPU
# only inside @spaces.GPU calls.
DEVICE = "cuda" if os.environ.get("SPACES_ZERO_GPU") or torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16 if DEVICE == "cuda" else torch.float32  # the model was trained in bfloat16
model, processor, id_to_token = load_muaalem(MODEL)
model.to(DEVICE, dtype=DTYPE)
search = PhoneticSearch()


def _decode_audio(data: bytes) -> np.ndarray:
    """Any browser format (webm/opus, mp4/aac, ogg, wav) → 16 kHz mono float32, via ffmpeg."""
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
        input=data,
        capture_output=True,
        timeout=60,
        check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


@spaces.GPU(duration=60)
@torch.inference_mode()
def _phonemes(pieces: list[np.ndarray]) -> list[str]:
    out = []
    for piece in pieces:
        feats = processor(piece, sampling_rate=SR, return_tensors="pt")
        logits = model(
            input_features=feats["input_features"].to(DEVICE, dtype=DTYPE),
            attention_mask=feats["attention_mask"].to(DEVICE) if "attention_mask" in feats else None,
        )
        out.append(greedy_ctc(logits[0].argmax(dim=-1).tolist(), id_to_token))
    return out


def _locate(ph: str, surah: int, first: int, last: int):
    """Where in the requested ayahs this piece was recited (or None)."""
    for ratio in (0.15, 0.3):
        try:
            results = search.search(ph, error_ratio=ratio)
        except NoPhonemesSearchResult:
            continue
        for r in results:
            if r.start.sura_idx == surah == r.end.sura_idx and first <= r.start.aya_idx <= r.end.aya_idx <= last:
                return r
    return None


def _span_words(r) -> tuple[list[str], list[WordRef]]:
    words: list[str] = []
    refs: list[WordRef] = []
    aya = Aya(r.start.sura_idx, r.start.aya_idx)
    w0 = r.start.uthmani_word_idx
    while True:
        f = aya.get()
        all_words = f.uthmani_words
        end = r.end.uthmani_word_idx + 1 if f.aya_idx == r.end.aya_idx else len(all_words)
        for i in range(w0, min(end, len(all_words))):
            words.append(all_words[i])
            refs.append(WordRef(ayah=f.aya_idx, word=i, words_in_ayah=len(all_words)))
        if f.aya_idx >= r.end.aya_idx:
            break
        w0 = 0
        aya = aya.step(1)
    return words, refs


def _reference(words: list[str], refs: list[WordRef], stop: bool) -> tuple[str, str, list]:
    """Correct phonemes for these words: read joined, or with a stop at the end of each ayah."""
    space = alph.uthmani.space
    if not stop:
        text = space.join(words)
        out = quran_phonetizer(text, MOSHAF, remove_spaces=True)
        return text, out.phonemes, out.mappings
    parts, group, ayah = [], [], None
    for w, ref in zip(words, refs):
        if ayah is not None and ref.ayah != ayah:
            parts.append(group)
            group = []
        group.append(w)
        ayah = ref.ayah
    parts.append(group)
    built = []
    for g in parts:
        text = space.join(g)
        out = quran_phonetizer(text, MOSHAF, remove_spaces=True)
        built.append((text, out.phonemes, out.mappings))
    return join_references(built, space)


def _unique_good(good: list[dict], notes: list[dict]) -> list[dict]:
    noted = {(n["ayah"], n["word"]) for n in notes}
    out, seen = [], set()
    for g in good:
        k = (g["ayah"], g["word"])
        if k not in noted and k not in seen:
            seen.add(k)
            out.append(g)
    return out[:MAX_GOOD]


def check(audio_b64: str, surah: float, from_: float, to: float, key: str) -> dict:
    if not SECRET or not hmac.compare_digest(str(key or ""), SECRET):
        return {"ok": False, "error": "unauthorized"}
    try:
        surah, from_, to = int(surah), int(from_), int(to)
    except (TypeError, ValueError):
        return {"ok": False, "error": "invalid range"}
    if not (1 <= surah <= 114 and 1 <= from_ <= to and to - from_ < 40):
        return {"ok": False, "error": "invalid range"}
    try:
        data = base64.b64decode(audio_b64 or "", validate=True)
    except (binascii.Error, ValueError):
        return {"ok": False, "error": "bad audio"}
    if not data or len(data) > MAX_BYTES:
        return {"ok": False, "error": "audio too large"}

    t0 = time.time()
    try:
        wave = _decode_audio(data)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return {"ok": False, "error": "unreadable audio"}
    del data
    if len(wave) > MAX_SECONDS * SR:
        return {"ok": False, "error": "audio too long"}

    spans = split_on_silence(wave)
    phonemes = _phonemes([wave[s:e] for s, e in spans]) if spans else []
    del wave

    notes: list[dict] = []
    good: list[dict] = []
    heard_ayahs: set[int] = set()
    matched = 0
    space = alph.uthmani.space
    for ph in phonemes:
        if len(ph) < 6:
            continue
        r = _locate(ph, surah, from_, to)
        if r is None:
            continue
        words, refs = _span_words(r)
        if not words:
            continue
        matched += 1
        heard_ayahs.update(range(r.start.aya_idx, r.end.aya_idx + 1))
        offsets_of = lambda text_words: word_offsets(text_words, len(space))  # noqa: E731
        # Readers usually stop at the end of each ayah (then the last vowel drops and the next ayah starts
        # with a hamza); some join ayahs. Build both readings and keep the one closer to what was heard.
        best = None
        for mode in ("stop", "joined"):
            text, ref_ph, mappings = _reference(words, refs, stop=(mode == "stop"))
            errors = explain_error(uthmani_text=text, ref_ph_text=ref_ph, predicted_ph_text=ph, mappings=mappings)
            found = notes_from_errors(errors, refs, offsets_of(words), text)
            if best is None or len(found) < len(best[1]):
                best = (mode, found, ref_ph, errors, mappings, text)
        mode, found, ref_ph, errors, mappings, text = best
        notes.extend(found)
        noted = {(n["ayah"], n["word"]) for n in found}
        if len(mappings) == len(text):  # one mapping per Uthmani character, so positions are words
            good.extend(good_from_mappings(mappings, refs, offsets_of(words), noted))
        if DEBUG:
            # Phoneme strings only (no audio): lets us see why a note was given.
            print(f"[check] {surah}:{r.start.aya_idx}-{r.end.aya_idx} ({mode})\n  expected: {ref_ph}\n  heard:    {ph}", flush=True)
            for e in errors:
                print(f"  {e.error_type}/{e.speech_error_type} pos={e.uthmani_pos} exp={e.expected_ph!r} got={e.preditected_ph!r} len={e.expected_len}/{e.predicted_len}", flush=True)

    return {
        "ok": True,
        "model": MODEL,
        "pieces": len(spans),
        "matched": matched,
        "seconds": round(time.time() - t0, 1),
        "notes": finalize(notes),
        # What was read well (tajweed rules in words without a note), for the teacher's praise.
        "good": _unique_good(good, notes),
        # Ayahs the checker placed some of the recording in (even when the word check missed them).
        "heardAyahs": sorted(heard_ayahs),
    }


demo = gr.Interface(
    fn=check,
    inputs=[
        gr.Textbox(label="audio (base64)"),
        gr.Number(label="surah", precision=0),
        gr.Number(label="from", precision=0),
        gr.Number(label="to", precision=0),
        gr.Textbox(label="key", type="password"),
    ],
    outputs=gr.JSON(label="result"),
    title="Modaker tajweed checker",
    description="Used by the Modaker app. Needs the app's key.",
    api_name="check",
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.queue(max_size=20).launch()
