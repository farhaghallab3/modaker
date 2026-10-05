"""
OFFLINE feasibility probe for CTC Quran/Arabic acoustic models — Pass 1 ONLY.

  python probe.py --clips D:/ctc-poc/clips-dir --model rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final

Pass-1 rules (the point of this experiment):
  * greedy argmax per frame -> collapse repeats -> drop CTC blank. NOTHING ELSE.
  * NO language model, NO lexicon, NO fuzzy replacement, NO expected-text prompt, NO canonical text is read here.
  * the literal output is stored exactly as emitted (diacritics included); comparison/normalization happens
    later, in the report, and never feeds back into this output.
Writes <clips>/results-<model>.json. Audio never leaves this machine.
"""
import argparse, hashlib, json, os, time, wave
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import snapshot_download
from transformers import Wav2Vec2ForCTC


def load_wav_16k_mono(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, "expected 16 kHz mono 16-bit WAV"
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True, help="directory containing manifest.jsonl and clips/")
    ap.add_argument("--model", required=True)
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()
    if args.threads:
        torch.set_num_threads(args.threads)

    root = Path(args.clips)
    manifest = [json.loads(l) for l in (root / "manifest.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]

    snap = Path(snapshot_download(args.model, allow_patterns=["*.json", "*.safetensors"]))  # safetensors only: no pickle
    vocab = json.loads((snap / "vocab.json").read_text(encoding="utf-8"))
    cfg = json.loads((snap / "config.json").read_text(encoding="utf-8"))
    id2tok = {i: t for t, i in vocab.items()}
    blank = cfg["pad_token_id"]  # wav2vec2-CTC convention: <pad> is the CTC blank
    special = {blank} | {vocab[t] for t in ("<s>", "</s>", "<unk>") if t in vocab}
    pre = json.loads((snap / "preprocessor_config.json").read_text(encoding="utf-8")) if (snap / "preprocessor_config.json").exists() else {}

    t0 = time.perf_counter()
    model = Wav2Vec2ForCTC.from_pretrained(snap).eval()
    load_s = time.perf_counter() - t0
    n_params = sum(p.numel() for p in model.parameters())
    digest = hashlib.sha256((snap / "model.safetensors").read_bytes()).hexdigest()
    meta = {
        "model": args.model, "revision": snap.name, "safetensors_sha256": digest, "architecture": cfg["architectures"],
        "params_M": round(n_params / 1e6, 1), "vocab_size": cfg["vocab_size"], "load_seconds": round(load_s, 1),
        "device": "cpu", "torch": torch.__version__, "threads": torch.get_num_threads(),
        "frame_stride_ms": 20, "do_normalize": pre.get("do_normalize", True),
    }
    print(json.dumps(meta, ensure_ascii=False))

    results = []
    for clip in manifest:
        x = load_wav_16k_mono(root / clip["file"])
        dur = len(x) / 16000
        if pre.get("do_normalize", True):  # same as Wav2Vec2FeatureExtractor(do_normalize=True)
            x = (x - x.mean()) / np.sqrt(x.var() + 1e-7)
        t = time.perf_counter()
        with torch.inference_mode():
            logits = model(torch.from_numpy(x)[None]).logits[0]  # (frames, vocab): raw frame logits are accessible
            post = logits.softmax(-1)
        latency = time.perf_counter() - t
        top_p, top_i = post.max(-1)
        ids = top_i.tolist()

        # greedy CTC collapse, recording per-emitted-token posteriors from the frames that produced it
        emitted = []
        prev = None
        for f, i in enumerate(ids):
            if i != prev and i not in special:
                emitted.append({"id": i, "frames": [f, f]})
            elif i == prev and i not in special and emitted:
                emitted[-1]["frames"][1] = f
            prev = i
        chars = []
        for e in emitted:
            a, b = e["frames"]
            seg = post[a : b + 1]
            best = int(seg[:, e["id"]].argmax()) + a
            alts = torch.topk(post[best], 3)
            chars.append({
                "ch": " " if id2tok[e["id"]] == "|" else id2tok[e["id"]],
                "t": round(a * 0.02, 2),
                "p": round(float(post[best, e["id"]]), 3),
                "alts": [[" " if id2tok[int(j)] == "|" else id2tok[int(j)] if int(j) != blank else "∅", round(float(p), 3)] for p, j in zip(alts.values, alts.indices)],
            })
        literal = "".join(c["ch"] for c in chars).strip()
        results.append({
            "id": clip["id"], "category": clip["category"], "spoken": clip["spoken"], "canonical": clip.get("canonical"),
            "literal": literal, "chars": chars,
            "blank_frac": round(float((top_i == blank).float().mean()), 3), "frames": int(post.shape[0]),
            "duration_s": round(dur, 2), "latency_s": round(latency, 2), "rtf": round(latency / max(dur, 1e-6), 2),
        })
        print(f"{clip['category']:<13} {latency:5.1f}s  {literal}")

    out = root / f"results-{args.model.replace('/', '__')}.json"
    out.write_text(json.dumps({"meta": meta, "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", out)


if __name__ == "__main__":
    main()
