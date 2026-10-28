"""Modaker tajweed checker: a small free server around the open Quran Muaalem model.

POST /check  (multipart: audio file; form fields surah, from, to; header x-modaker-key)
  → {"ok": true, "notes": [...], "pieces": n, "matched": m, "seconds": s}

The model (obadx/muaalem-model-v3_2, MIT) hears the recitation as phonemes; quran_transcript
builds the correct phonemes for the same words (Hafs) and explains the differences.
Audio is decoded in memory and dropped after the request. Nothing is stored or logged.
"""

from __future__ import annotations

import hmac
import os
import subprocess
import threading
import time

import numpy as np
import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from quran_transcript import Aya, alphabet as alph, explain_error, quran_phonetizer
from quran_transcript.phonetics.moshaf_attributes import MoshafAttributes
from quran_transcript.phonetics.search import NoPhonemesSearchResult, PhoneticSearch
from quran_muaalem.decode import phonemes_level_greedy_decode
from quran_muaalem.modeling.modeling_multi_level_ctc import Wav2Vec2BertForMultilevelCTC
from quran_muaalem.modeling.multi_level_tokenizer import MultiLevelTokenizer
from transformers import AutoFeatureExtractor

from logic import SR, WordRef, finalize, notes_from_errors, split_on_silence, word_offsets

MODEL = os.environ.get("MUAALEM_MODEL", "obadx/muaalem-model-v3_2")
SECRET = os.environ.get("MODAKER_KEY", "")
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

torch.set_num_threads(max(1, os.cpu_count() or 1))
app = FastAPI(title="Modaker tajweed checker", docs_url=None, redoc_url=None)

_lock = threading.Lock()
_state: dict = {}


def _load():
    with _lock:
        if not _state:
            model = Wav2Vec2BertForMultilevelCTC.from_pretrained(MODEL)
            model.to("cpu", dtype=torch.float32)  # bfloat16 is slow on most CPUs
            model.eval()
            _state["model"] = model
            _state["processor"] = AutoFeatureExtractor.from_pretrained(MODEL)
            _state["vocab"] = MultiLevelTokenizer(MODEL).id_to_vocab["phonemes"]
            _state["search"] = PhoneticSearch()
    return _state


@app.on_event("startup")
def _warm():
    threading.Thread(target=_load, daemon=True).start()


def _decode_audio(data: bytes) -> np.ndarray:
    """Any browser format (webm/opus, mp4/aac, ogg, wav) → 16 kHz mono float32, via ffmpeg."""
    try:
        out = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"],
            input=data,
            capture_output=True,
            timeout=60,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise HTTPException(415, "unreadable audio")
    return np.frombuffer(out, dtype=np.float32).copy()


@torch.inference_mode()
def _phonemes(st: dict, piece: np.ndarray) -> str:
    feats = st["processor"](piece, sampling_rate=SR, return_tensors="pt")
    feats = {k: v.to("cpu", dtype=torch.float32) for k, v in feats.items()}
    logits = st["model"](**feats, return_dict=False)[0]["phonemes"]
    probs = torch.nn.functional.softmax(logits, dim=-1).to(torch.float32)
    return phonemes_level_greedy_decode(probs, st["vocab"])[0].text


def _locate(st: dict, ph: str, surah: int, first: int, last: int):
    """Where in the requested ayahs this piece was recited (or None)."""
    for ratio in (0.15, 0.3):
        try:
            results = st["search"].search(ph, error_ratio=ratio)
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


@app.get("/")
def health():
    return {"ok": True, "ready": bool(_state), "model": MODEL}


@app.post("/check")
async def check(
    audio: UploadFile = File(...),
    surah: int = Form(...),
    from_: int = Form(..., alias="from"),
    to: int = Form(...),
    x_modaker_key: str = Header(default=""),
):
    if not SECRET or not hmac.compare_digest(x_modaker_key, SECRET):
        raise HTTPException(401, "unauthorized")
    if not (1 <= surah <= 114 and 1 <= from_ <= to and to - from_ < 40):
        raise HTTPException(400, "invalid range")
    data = await audio.read()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(413, "audio too large")

    t0 = time.time()
    wave = _decode_audio(data)
    del data
    if len(wave) > MAX_SECONDS * SR:
        raise HTTPException(413, "audio too long")
    st = _load()

    pieces = split_on_silence(wave)
    notes: list[dict] = []
    matched = 0
    space = alph.uthmani.space
    for s, e in pieces:
        ph = _phonemes(st, wave[s:e])
        if len(ph) < 6:
            continue
        r = _locate(st, ph, surah, from_, to)
        if r is None:
            continue
        words, refs = _span_words(r)
        if not words:
            continue
        matched += 1
        text = space.join(words)
        ref = quran_phonetizer(text, MOSHAF, remove_spaces=True)
        errors = explain_error(uthmani_text=text, ref_ph_text=ref.phonemes, predicted_ph_text=ph, mappings=ref.mappings)
        notes.extend(notes_from_errors(errors, refs, word_offsets(words, len(space))))
    del wave

    return {
        "ok": True,
        "model": MODEL,
        "pieces": len(pieces),
        "matched": matched,
        "seconds": round(time.time() - t0, 1),
        "notes": finalize(notes),
    }
