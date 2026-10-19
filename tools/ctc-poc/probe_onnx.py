"""
OFFLINE feasibility probe — omniASR-CTC-300M-v2 (ONNX, CPU) — Pass 1 ONLY.

Identical decoding rules to the earlier probe: raw greedy CTC (argmax per frame -> collapse repeats -> drop
blank id 0 -> SentencePiece detokenize). No language model, no beam search, no lexicon, no prompt, no canonical
text, no fuzzy replacement, no post-processing. Preprocessing = the reference one (mono 16 kHz, zero-mean/unit-var).
  python probe_onnx.py --clips D:/ctc-poc/clips-data
"""
import argparse, hashlib, json, time, wave
from pathlib import Path

import numpy as np
import onnxruntime as ort
import psutil
import sentencepiece as spm
from huggingface_hub import snapshot_download

REPO = "EmreAkgul/omniASR-CTC-300M-v2-ONNX"
REVISION = "79600f7a2b0678b8eccaf257f367ae21e436ba82"
BLANK = 0


def load_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0


def prep(x: np.ndarray) -> np.ndarray:  # same as fast-omniasr audio.prepare_audio
    x = (x - x.mean()) / np.sqrt(x.var() + np.float32(1e-5))
    return np.ascontiguousarray(x[None, :], dtype=np.float32)


def softmax(a: np.ndarray) -> np.ndarray:
    e = np.exp(a - a.max(-1, keepdims=True))
    return e / e.sum(-1, keepdims=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True)
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()
    root = Path(args.clips)
    manifest = [json.loads(l) for l in (root / "manifest.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    proc = psutil.Process()

    snap = Path(snapshot_download(REPO, revision=REVISION))
    cfg = json.loads((snap / "config.json").read_text(encoding="utf-8"))
    for name, meta in cfg["files"].items():  # verify the published hashes
        h = hashlib.sha256((snap / name).read_bytes()).hexdigest()
        assert h == meta["sha256"], f"hash mismatch for {name}"
    sp = spm.SentencePieceProcessor(model_file=str(snap / "tokenizer.model"))

    t0 = time.perf_counter()
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = args.threads
    sess = ort.InferenceSession(str(snap / "model.onnx"), sess_options=opts, providers=["CPUExecutionProvider"])
    load_s = time.perf_counter() - t0
    providers = sess.get_providers()
    assert providers == ["CPUExecutionProvider"], providers

    # warm-up on 1 s of zeros (not a user clip) so per-clip latency excludes one-time graph setup
    tw = time.perf_counter()
    sess.run(["logits"], {"audio": np.zeros((1, 16000), np.float32)})
    warm_s = time.perf_counter() - tw

    results = []
    for clip in manifest:
        x = load_wav(root / clip["file"])
        dur = len(x) / 16000
        t = time.perf_counter()
        logits = sess.run(["logits"], {"audio": prep(x)})[0]  # [1, frames, 10288] raw logits
        latency = time.perf_counter() - t
        post = softmax(logits[0])
        ids = post.argmax(-1)
        keep = np.r_[True, ids[1:] != ids[:-1]]
        runs, start = [], None
        for f in range(len(ids)):  # frame runs of identical argmax, for per-token posteriors
            if keep[f]:
                runs.append([f, f, int(ids[f])])
            else:
                runs[-1][1] = f
        tokens = []
        for a, b, i in runs:
            if i == BLANK:
                continue
            best = a + int(post[a : b + 1, i].argmax())
            top = np.argsort(-post[best])[:3]
            tokens.append({
                "ch": sp.id_to_piece(i), "t": round(a * 0.02, 2), "p": round(float(post[best, i]), 3),
                "alts": [["∅" if int(j) == BLANK else sp.id_to_piece(int(j)), round(float(post[best, j]), 3)] for j in top],
            })
        literal = sp.decode([i for _, _, i in runs if i != BLANK]).strip()
        results.append({
            "id": clip["id"], "category": clip["category"], "spoken": clip["spoken"], "canonical": clip.get("canonical"),
            "literal": literal, "chars": tokens, "blank_frac": round(float((ids == BLANK).mean()), 3),
            "frames": int(post.shape[0]), "duration_s": round(dur, 2), "latency_s": round(latency, 2), "rtf": round(latency / dur, 2),
        })
        print(f"{clip['category']:<13} {latency:5.2f}s  {literal}")

    mi = proc.memory_info()
    meta = {
        "model": REPO, "revision": REVISION, "onnx_sha256": cfg["files"]["model.onnx"]["sha256"], "hashes_verified": True,
        "upstream": cfg["source_model"], "vocab_size": cfg["vocabulary_size"], "onnxruntime": ort.__version__,
        "providers": providers, "threads": args.threads, "load_seconds": round(load_s, 1), "warmup_seconds": round(warm_s, 1),
        "peak_ram_MB": round(getattr(mi, "peak_wset", mi.rss) / 1e6), "final_rss_MB": round(mi.rss / 1e6),
        "frame_stride_ms": 20, "decoding": "greedy CTC, argmax -> collapse -> drop blank(0) -> SentencePiece decode; nothing else",
    }
    print(json.dumps(meta, ensure_ascii=False))
    (root / "results-omniASR-CTC-300M-v2-ONNX.json").write_text(json.dumps({"meta": meta, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
