"""Run: python -m unittest test_logic.py  (needs numpy only)."""

import unittest
from types import SimpleNamespace as NS

import numpy as np

from logic import SR, WordRef, classify, finalize, notes_from_errors, split_on_silence, word_at, word_offsets


class NormalMaddRule:  # same class names as quran_transcript's rules
    correctness_type = "count"


class LazemMaddRule:
    correctness_type = "count"


class Qalqalah:
    correctness_type = "match"


def err(etype, op="replace", pos=0, rules=None, exp=None, heard=None, missing=None, replaced=None, e_ph="a", p_ph="b"):
    return NS(error_type=etype, speech_error_type=op, uthmani_pos=(pos, pos + 1), ref_tajweed_rules=rules,
              expected_len=exp, predicted_len=heard, missing_tajweed_rules=missing,
              replaced_tajweed_rules=replaced, expected_ph=e_ph, preditected_ph=p_ph)


class Classify(unittest.TestCase):
    def test_letters_and_harakat(self):
        self.assertEqual(classify(err("normal"))["kind"], "letters")
        self.assertEqual(classify(err("tashkeel"))["kind"], "harakat")

    def test_single_inserted_sound_ignored(self):
        self.assertIsNone(classify(err("normal", op="insert", p_ph="ء")))

    def test_madd_tolerance(self):
        self.assertIsNone(classify(err("tajweed", rules=[LazemMaddRule()], exp=6, heard=5)))
        self.assertIsNone(classify(err("tajweed", rules=[LazemMaddRule()], exp=6, heard=6)))
        n = classify(err("tajweed", rules=[LazemMaddRule()], exp=6, heard=3))
        self.assertEqual((n["rule"], n["expectedLen"], n["heardLen"]), ("madd_lazem", 6, 3))
        self.assertIsNone(classify(err("tajweed", rules=[NormalMaddRule()], exp=2, heard=2)))
        self.assertEqual(classify(err("tajweed", rules=[NormalMaddRule()], exp=2, heard=1))["rule"], "madd_tabii")

    def test_aared_allows_two_four_six(self):
        class AaredMaddRule:
            correctness_type = "count"
        for heard in (2, 4, 6):
            self.assertIsNone(classify(err("tajweed", rules=[AaredMaddRule()], exp=4, heard=heard)))
        self.assertEqual(classify(err("tajweed", rules=[AaredMaddRule()], exp=4, heard=1))["rule"], "madd_aared")

    def test_harakat_length_only_is_not_a_mistake(self):
        self.assertIsNone(classify(err("tashkeel", e_ph="لَاا", p_ph="لَااا")))
        self.assertEqual(classify(err("tashkeel", e_ph="لَ", p_ph="لُ"))["kind"], "harakat")

    def test_qalqalah_only_when_missing(self):
        self.assertIsNone(classify(err("tajweed", rules=[Qalqalah()], replaced=[Qalqalah()])))
        self.assertEqual(classify(err("tajweed", rules=[Qalqalah()], missing=[Qalqalah()]))["rule"], "qalqalah")

    def test_unknown_rule_ignored(self):
        self.assertIsNone(classify(err("tajweed", rules=[object()])))


class Words(unittest.TestCase):
    def test_word_at(self):
        offs = word_offsets(["ab", "cde", "f"])
        self.assertEqual(offs, [0, 3, 7])
        self.assertEqual([word_at(p, offs) for p in (0, 2, 3, 6, 7)], [0, 0, 1, 1, 2])

    def test_one_note_per_word_most_important_first(self):
        refs = [WordRef(1, 0, 2), WordRef(1, 1, 2), WordRef(2, 0, 3)]
        offs = word_offsets(["ab", "cd", "ef"])
        errors = [
            err("tajweed", pos=3, rules=[NormalMaddRule()], exp=2, heard=1),
            err("normal", pos=4),
            err("tashkeel", pos=6),
        ]
        notes = notes_from_errors(errors, refs, offs)
        by = {(n["ayah"], n["word"]): n["kind"] for n in notes}
        self.assertEqual(by, {(1, 1): "letters", (2, 0): "harakat"})

    def test_note_names_its_letter_and_sounds(self):
        # synthetic Arabic letters, not Quran text: words "دَبْ" and "سَمِ"
        words = ["\u062f\u064e\u0628\u0652", "\u0633\u064e\u0645\u0650"]
        text = " ".join(words)
        offs = word_offsets(words)
        refs = [WordRef(1, 0, 2), WordRef(1, 1, 2)]
        e = err("tashkeel", pos=0, e_ph="\u062f\u064f", p_ph="\u062f\u064e")  # damma expected, fatha heard
        e.uthmani_pos = (0, 2)
        (n,) = notes_from_errors([e], refs, offs, text)
        self.assertEqual((n["letter"], n["expected"], n["heard"]), ("\u062f", "\u062f\u064f", "\u062f\u064e"))

    def test_stop_on_last_letter_is_allowed(self):
        words = ["\u062f\u064e\u0628\u0652", "\u0633\u064e\u0645\u0650"]
        text = " ".join(words)
        offs = word_offsets(words)
        refs = [WordRef(1, 0, 2), WordRef(1, 1, 2)]
        last = err("tashkeel", op="delete", e_ph="\u0645\u0650", p_ph="\u0645")  # last vowel dropped: a stop
        last.uthmani_pos = (7, 9)
        self.assertEqual(notes_from_errors([last], refs, offs, text), [])
        wrong = err("tashkeel", e_ph="\u0645\u0650", p_ph="\u0645\u064e")  # a different vowel is still a mistake
        wrong.uthmani_pos = (7, 9)
        self.assertEqual(len(notes_from_errors([wrong], refs, offs, text)), 1)
        mid = err("tashkeel", op="delete", e_ph="\u0633\u064e", p_ph="\u0633")  # vowel dropped mid-word
        mid.uthmani_pos = (5, 7)
        self.assertEqual(notes_from_errors([mid], refs, offs, text)[0]["letter"], "\u0633")

    def test_finalize_caps_keeping_letters(self):
        notes = [{"ayah": 1, "word": i, "kind": "tajweed"} for i in range(20)] + [{"ayah": 2, "word": 0, "kind": "letters"}]
        out = finalize(notes, limit=5)
        self.assertEqual(len(out), 5)
        self.assertIn({"ayah": 2, "word": 0, "kind": "letters"}, out)
        self.assertEqual(out, sorted(out, key=lambda n: (n["ayah"], n["word"])))


class Join(unittest.TestCase):
    def test_join_shifts_mappings_and_maps_spaces_to_nothing(self):
        from dataclasses import dataclass
        from logic import join_references

        @dataclass
        class M:
            pos: tuple
            tajweed_rules: object = None
            deleted: bool = False

        a = ("ab", "xyz", [M((0, 2)), M((2, 3), tajweed_rules=["r"])])
        b = ("c", "uv", [M((0, 2))])
        text, ph, maps = join_references([a, b], " ")
        self.assertEqual((text, ph), ("ab c", "xyzuv"))
        self.assertEqual(len(maps), len(text))
        self.assertEqual([m.pos for m in maps], [(0, 2), (2, 3), (3, 3), (3, 5)])
        self.assertTrue(maps[2].deleted and maps[2].tajweed_rules is None)
        self.assertEqual(maps[1].tajweed_rules, ["r"])


class Pieces(unittest.TestCase):
    def tone(self, sec):
        t = np.arange(int(sec * SR)) / SR
        return (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)

    def test_cuts_at_pauses_and_respects_max(self):
        silence = np.zeros(int(0.6 * SR), dtype=np.float32)
        wave = np.concatenate([self.tone(8), silence, self.tone(9), silence, self.tone(5)])
        spans = split_on_silence(wave)
        self.assertGreaterEqual(len(spans), 2)
        for s, e in spans:
            self.assertLessEqual(e - s, 14 * SR)
        self.assertEqual(spans[0][0], 0)

    def test_long_without_pause_is_cut(self):
        spans = split_on_silence(self.tone(30))
        self.assertTrue(all(e - s <= 14 * SR for s, e in spans))
        self.assertEqual(spans[-1][1], 30 * SR)

    def test_silence_only(self):
        self.assertEqual(split_on_silence(np.zeros(SR * 3, dtype=np.float32)), [])


if __name__ == "__main__":
    unittest.main()
