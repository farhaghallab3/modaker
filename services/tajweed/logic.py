"""Pure helpers for the tajweed checker (no model, no torch): easy to test.

- split_on_silence: cut a 16 kHz recording into pieces the model accepts (≤ 14 s),
  preferring the pauses the reciter makes between ayahs.
- word_at: map a character position in the joined Uthmani text to (ayah, word).
- notes_from_errors: turn Muaalem's ReciterError list into a short list of notes,
  one per word at most, dropping what a teacher would not correct.
"""

from __future__ import annotations

from dataclasses import dataclass
import unicodedata
from typing import Any, Iterable, Optional

import numpy as np

SR = 16000
MAX_CHUNK_SEC = 14.0
MAX_NOTES = 12

# Rules we can name in the app (class name of the quran_transcript rule → stable key).
MADD_RULES = {
    "NormalMaddRule": "madd_tabii",
    "MonfaselMaddRule": "madd_monfasel",
    "MottaselMaddRule": "madd_mottasel",
    "MottaselMaddPauseRule": "madd_mottasel",
    "LazemMaddRule": "madd_lazem",
    "AaredMaddRule": "madd_aared",
    "LeenMaddRule": "madd_leen",
    "MoshaddadOrModghamNoonRule": "ghunnah",
}
OTHER_RULES = {"Qalqalah": "qalqalah", "Ghonnah": "ghunnah", "IdghamKamel": "idgham"}

# The three short vowels in the phonetic script (fatha, damma, kasra).
HARAKAT = "\u064e\u064f\u0650"
# Phoneme strings sent back with a note are cut to this length (a few letters around the mistake, never a whole word list).
PH_MAX = 8

# Most important first: a wrong letter matters more than a short madd.
KIND_ORDER = {"letters": 0, "harakat": 1, "tajweed": 2}


# ---------------------------------------------------------------- audio pieces


def _frame_rms(wave: np.ndarray, frame: int, hop: int) -> np.ndarray:
    if len(wave) < frame:
        return np.array([float(np.sqrt(np.mean(wave**2))) if len(wave) else 0.0])
    n = 1 + (len(wave) - frame) // hop
    idx = np.arange(frame)[None, :] + hop * np.arange(n)[:, None]
    return np.sqrt(np.mean(wave[idx] ** 2, axis=1))


def split_on_silence(
    wave: np.ndarray,
    sr: int = SR,
    max_sec: float = MAX_CHUNK_SEC,
    min_pause_sec: float = 0.3,
) -> list[tuple[int, int]]:
    """Return (start, end) sample spans, each ≤ max_sec, cut at pauses when possible."""
    total = len(wave)
    if total == 0:
        return []
    hop = int(sr * 0.01)
    frame = int(sr * 0.025)
    rms = _frame_rms(wave.astype(np.float32), frame, hop)
    peak = float(rms.max()) if len(rms) else 0.0
    if peak <= 1e-6:
        return []
    quiet = rms < max(0.06 * peak, float(np.percentile(rms, 20)) * 1.5)

    # Pause centres (in samples) long enough to be a breath between ayahs.
    pauses: list[int] = []
    run = 0
    for i, q in enumerate(quiet):
        if q:
            run += 1
        else:
            if run * hop >= min_pause_sec * sr:
                pauses.append((i - run // 2) * hop)
            run = 0

    max_len = int(max_sec * sr)
    spans: list[tuple[int, int]] = []
    start = 0
    while total - start > max_len:
        limit = start + max_len
        inside = [p for p in pauses if start + sr <= p <= limit]
        if inside:
            cut = inside[-1]
        else:
            # No pause: cut at the quietest frame in the last 3 s of the window.
            lo = max(start + 1, limit - 3 * sr) // hop
            hi = max(lo + 1, limit // hop)
            cut = (lo + int(np.argmin(rms[lo:hi]))) * hop if hi <= len(rms) else limit
        spans.append((start, cut))
        start = cut
    spans.append((start, total))

    # Also split at every pause inside a span, then re-merge short pieces up to max_len, so
    # each piece usually ends where the reciter stopped (the model treats the end as a stop).
    out: list[tuple[int, int]] = []
    for s, e in spans:
        cuts = [p for p in pauses if s + sr // 2 < p < e - sr // 2]
        edges = [s, *cuts, e]
        cur_s = edges[0]
        for a, b in zip(edges, edges[1:]):
            if b - cur_s > max_len:
                out.append((cur_s, a))
                cur_s = a
        out.append((cur_s, e))
    return [(s, e) for s, e in out if e - s >= int(0.6 * sr)]


# ---------------------------------------------------------------- word mapping


@dataclass(frozen=True)
class WordRef:
    ayah: int
    word: int  # 0-based index of the word inside its ayah
    words_in_ayah: int


def word_offsets(words: list[str], space_len: int = 1) -> list[int]:
    """Start character of each word in space.join(words)."""
    out, pos = [], 0
    for w in words:
        out.append(pos)
        pos += len(w) + space_len
    return out


def word_at(char_pos: int, offsets: list[int]) -> int:
    """Index of the word containing char_pos (a space belongs to the word before it)."""
    i = 0
    for k, start in enumerate(offsets):
        if start <= char_pos:
            i = k
        else:
            break
    return i


def join_references(parts: list[tuple[str, str, list]], space: str) -> tuple[str, str, list]:
    """Join per-ayah phonetic references (text, phonemes, mappings) into one, as if read with a stop
    at the end of each ayah. Mappings are per Uthmani character with (start, end) phoneme positions;
    they are shifted, and each joining space maps to nothing."""
    import dataclasses

    texts, phonemes, mappings = [], "", []
    for i, (text, ph, maps) in enumerate(parts):
        off = len(phonemes)
        if i:
            proto = maps[0] if maps else (mappings[-1] if mappings else None)
            if proto is None:
                raise ValueError("empty reference")
            for _ in space:
                mappings.append(dataclasses.replace(proto, pos=(off, off), tajweed_rules=None, deleted=True))
        mappings.extend(dataclasses.replace(m, pos=(m.pos[0] + off, m.pos[1] + off)) for m in maps)
        texts.append(text)
        phonemes += ph
    return space.join(texts), phonemes, mappings


# ---------------------------------------------------------------- errors → notes


def _rule_info(rule: Any) -> tuple[Optional[str], str]:
    cls = type(rule).__name__
    if cls in MADD_RULES:
        return MADD_RULES[cls], "count"
    if cls in OTHER_RULES:
        return OTHER_RULES[cls], getattr(rule, "correctness_type", "match")
    return None, getattr(rule, "correctness_type", "match")


def _madd_is_wrong(key: str, expected: Optional[int], heard: Optional[int]) -> bool:
    if expected is None or heard is None:
        return False
    if key == "madd_tabii":
        return heard < 2 or heard > 3
    if key == "ghunnah":
        return heard <= 2
    if key in ("madd_aared", "madd_leen"):
        # At a stop these may be read 2, 4 or 6 counts: only a missing or wildly long madd is a mistake.
        return heard < 2 or heard > 7
    # Longer madds: readers differ by a count (4 or 5, 4 or 6), so only flag clear gaps.
    return abs(heard - expected) >= 2


def _squeeze(s: str) -> str:
    """Collapse repeated characters ("لَاا" → "لَا")."""
    out = []
    for ch in s or "":
        if not out or out[-1] != ch:
            out.append(ch)
    return "".join(out)


def classify(err: Any, at_word_end: bool = False) -> Optional[dict]:
    """One ReciterError → {kind, op, rule, expectedLen, heardLen} or None (not worth a note).

    at_word_end: the mistake is on the last letter of a word. A reader may stop on any word, and a stop
    makes its last letter silent (sakin), so a missing last vowel there is not a mistake."""
    etype = getattr(err, "error_type", "")
    op = getattr(err, "speech_error_type", "replace")
    if etype == "normal":
        # A lone extra sound at a stop is usually breath or a cut piece edge.
        if op == "insert" and len(getattr(err, "preditected_ph", "") or "") <= 1:
            return None
        return {"kind": "letters", "op": op, "rule": None, "expectedLen": None, "heardLen": None}
    if etype == "tashkeel":
        # Same vowels, only held longer or shorter: timing, not a wrong haraka.
        if _squeeze(getattr(err, "expected_ph", "")) == _squeeze(getattr(err, "preditected_ph", "")):
            return None
        if at_word_end and not any(h in (getattr(err, "preditected_ph", "") or "") for h in HARAKAT):
            return None
        return {"kind": "harakat", "op": op, "rule": None, "expectedLen": None, "heardLen": None}
    if etype != "tajweed":
        return None

    rules = list(getattr(err, "ref_tajweed_rules", None) or [])
    if not rules:
        # A deletion on a letter that carries a rule: the letter itself was dropped.
        return {"kind": "letters", "op": op, "rule": None, "expectedLen": None, "heardLen": None}
    key, ctype = _rule_info(rules[0])
    if key is None:
        return None
    exp = getattr(err, "expected_len", None)
    heard = getattr(err, "predicted_len", None)
    if op == "delete":
        return {"kind": "tajweed", "op": "delete", "rule": key, "expectedLen": exp, "heardLen": 0}
    if ctype == "count":
        if exp is None and heard is None:
            # The sound was replaced by a different one (no count possible).
            return {"kind": "letters", "op": "replace", "rule": None, "expectedLen": None, "heardLen": None}
        if not _madd_is_wrong(key, exp, heard):
            return None
        return {"kind": "tajweed", "op": "replace", "rule": key, "expectedLen": exp, "heardLen": heard}
    # "match" rules (qalqalah…): wrong only when the explainer says the rule is missing.
    if getattr(err, "missing_tajweed_rules", None):
        return {"kind": "tajweed", "op": "missing", "rule": key, "expectedLen": None, "heardLen": None}
    if getattr(err, "replaced_tajweed_rules", None) is None and op == "replace" and getattr(err, "expected_ph", "") != getattr(err, "preditected_ph", ""):
        return {"kind": "tajweed", "op": "missing", "rule": key, "expectedLen": None, "heardLen": None}
    return None


def _is_letter(ch: str) -> bool:
    return unicodedata.category(ch) == "Lo"


def _word_end(i: int, offsets: list[int], text: str) -> int:
    """End (exclusive) of word i in the joined text, without the space after it."""
    end = offsets[i + 1] if i + 1 < len(offsets) else len(text)
    while end > offsets[i] and not _is_letter(text[end - 1]) and unicodedata.category(text[end - 1]).startswith("Z"):
        end -= 1
    return end


def _letter_at(text: str, start: int, end: int, word_start: int) -> str:
    """The Uthmani letter a mistake sits on: the first letter in its span, else the nearest one before it."""
    for ch in text[start:end]:
        if _is_letter(ch):
            return ch
    for k in range(min(start, len(text)) - 1, word_start - 1, -1):
        if _is_letter(text[k]):
            return text[k]
    return ""


def notes_from_errors(errors: Iterable[Any], refs: list[WordRef], offsets: list[int], text: Optional[str] = None) -> list[dict]:
    """Errors from one piece → notes keyed by (ayah, word), at most one per word.

    With the joined Uthmani text, each note also says which letter it is about and what was expected and heard
    (a few phonemes), so the app can give a specific reason."""
    best: dict[tuple[int, int], dict] = {}
    for err in errors:
        span = getattr(err, "uthmani_pos", (0, 0))
        pos, pos_end = int(span[0]), int(span[1])
        i = word_at(pos, offsets) if refs else None
        if i is None:
            continue
        ref = refs[i]
        at_end = False
        letter = ""
        if text is not None:
            w_end = _word_end(i, offsets, text)
            at_end = not any(_is_letter(ch) for ch in text[pos_end:w_end])
            letter = _letter_at(text, pos, pos_end, offsets[i])
        c = classify(err, at_word_end=at_end)
        if c is None:
            continue
        note = {
            "ayah": ref.ayah,
            "word": ref.word,
            "wordsInAyah": ref.words_in_ayah,
            **c,
            "letter": letter,
            "expected": (getattr(err, "expected_ph", "") or "")[:PH_MAX],
            "heard": (getattr(err, "preditected_ph", "") or "")[:PH_MAX],
        }
        k = (ref.ayah, ref.word)
        if k not in best or KIND_ORDER[note["kind"]] < KIND_ORDER[best[k]["kind"]]:
            best[k] = note
    return list(best.values())


# Rules worth praising when read well, most notable first.
GOOD_ORDER = ["madd_lazem", "madd_mottasel", "madd_monfasel", "ghunnah", "qalqalah", "idgham", "madd_aared", "madd_leen", "madd_tabii"]
MAX_GOOD = 6


def good_from_mappings(mappings: list, refs: list[WordRef], offsets: list[int], noted: set) -> list[dict]:
    """Tajweed rules inside the words that were heard and got no note: what the reader did well.
    One per word (the most notable rule), at most MAX_GOOD, most notable first."""
    best: dict[tuple[int, int], str] = {}
    for pos, m in enumerate(mappings):
        rules = getattr(m, "tajweed_rules", None) or []
        if getattr(m, "deleted", False) or not rules or not refs:
            continue
        ref = refs[word_at(pos, offsets)]
        k = (ref.ayah, ref.word)
        if k in noted:
            continue
        for rule in rules:
            key, _ = _rule_info(rule)
            if key in GOOD_ORDER and (k not in best or GOOD_ORDER.index(key) < GOOD_ORDER.index(best[k])):
                best[k] = key
    items = [{"ayah": a, "word": w, "wordsInAyah": next(r.words_in_ayah for r in refs if r.ayah == a), "rule": key} for (a, w), key in best.items()]
    items.sort(key=lambda g: (GOOD_ORDER.index(g["rule"]), g["ayah"], g["word"]))
    # One of each rule first, so the praise is varied.
    seen, first, rest = set(), [], []
    for g in items:
        (rest if g["rule"] in seen else first).append(g)
        seen.add(g["rule"])
    return (first + rest)[:MAX_GOOD]


def finalize(notes: Iterable[dict], limit: int = MAX_NOTES) -> list[dict]:
    """Merge notes from all pieces: one per word, ordered by position, capped."""
    best: dict[tuple[int, int], dict] = {}
    for n in notes:
        k = (n["ayah"], n["word"])
        if k not in best or KIND_ORDER[n["kind"]] < KIND_ORDER[best[k]["kind"]]:
            best[k] = n
    ordered = sorted(best.values(), key=lambda n: (n["ayah"], n["word"]))
    if len(ordered) <= limit:
        return ordered
    # Keep the most important ones, still shown in reading order.
    keep = sorted(ordered, key=lambda n: KIND_ORDER[n["kind"]])[:limit]
    return sorted(keep, key=lambda n: (n["ayah"], n["word"]))
