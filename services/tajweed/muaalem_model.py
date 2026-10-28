"""Loads the Quran Muaalem model (obadx/muaalem-model-v3_2, MIT) with plain transformers.

The quran-muaalem package pins library versions that clash with today's Gradio, so this file
rebuilds only what the checker needs: the Wav2Vec2-BERT encoder, the "phonemes" output head,
the feature extractor and the phoneme vocabulary. The weights are the published ones.
"""

from __future__ import annotations

import dataclasses
import inspect
import json

import torch
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file
from torch import nn
from transformers import SeamlessM4TFeatureExtractor, Wav2Vec2BertConfig
from transformers.models.wav2vec2_bert.modeling_wav2vec2_bert import Wav2Vec2BertModel

BLANK_ID = 0  # "[PAD]" is the CTC blank in Muaalem's vocabulary


def _config_fields() -> set[str]:
    if dataclasses.is_dataclass(Wav2Vec2BertConfig):
        return {f.name for f in dataclasses.fields(Wav2Vec2BertConfig)}
    return set(inspect.signature(Wav2Vec2BertConfig.__init__).parameters) - {"self", "kwargs"}


def _load_state_dict(repo: str) -> dict[str, torch.Tensor]:
    try:
        return load_file(hf_hub_download(repo, "model.safetensors"))
    except Exception:
        index = json.load(open(hf_hub_download(repo, "model.safetensors.index.json")))
        state: dict[str, torch.Tensor] = {}
        for shard in sorted(set(index["weight_map"].values())):
            state.update(load_file(hf_hub_download(repo, shard)))
        return state


class MuaalemPhonemes(nn.Module):
    """Encoder + phonemes head of Wav2Vec2BertForMultilevelCTC (same weight names)."""

    def __init__(self, config: Wav2Vec2BertConfig, phonemes_vocab_size: int):
        super().__init__()
        self.wav2vec2_bert = Wav2Vec2BertModel(config)
        self.level_to_lm_head = nn.ModuleDict({"phonemes": nn.Linear(config.hidden_size, phonemes_vocab_size)})

    def forward(self, input_features: torch.Tensor, attention_mask: torch.Tensor | None = None) -> torch.Tensor:
        hidden = self.wav2vec2_bert(input_features=input_features, attention_mask=attention_mask)[0]
        return self.level_to_lm_head["phonemes"](hidden)


def load_muaalem(repo: str) -> tuple[MuaalemPhonemes, SeamlessM4TFeatureExtractor, dict[int, str]]:
    raw = json.load(open(hf_hub_download(repo, "config.json")))
    level_to_vocab_size = raw["level_to_vocab_size"]
    fields = _config_fields()
    config = Wav2Vec2BertConfig(**{k: v for k, v in raw.items() if k in fields and k != "vocab_size"})

    model = MuaalemPhonemes(config, level_to_vocab_size["phonemes"])
    state = {k: v for k, v in _load_state_dict(repo).items() if k.startswith(("wav2vec2_bert.", "level_to_lm_head.phonemes."))}
    missing, _unexpected = model.load_state_dict(state, strict=False)
    if missing:
        raise RuntimeError(f"Muaalem weights missing {len(missing)} tensors, e.g. {missing[:3]}")
    model.eval()

    vocab = json.load(open(hf_hub_download(repo, "vocab.json")))
    phonemes = vocab["phonemes"] if "phonemes" in vocab else vocab
    id_to_token = {int(i): t for t, i in phonemes.items()}
    return model, SeamlessM4TFeatureExtractor.from_pretrained(repo), id_to_token


def greedy_ctc(ids: list[int], id_to_token: dict[int, str]) -> str:
    """Best path → text: merge repeats, drop the blank and special tokens."""
    out, prev = [], None
    for i in ids:
        if i != prev and i != BLANK_ID:
            tok = id_to_token.get(i, "")
            if tok and not (tok.startswith("<") or tok.startswith("[")) and tok != "|":
                out.append(tok)
        prev = i
    return "".join(out)
