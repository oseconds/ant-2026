import gzip
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import unittest

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ant_multiphysics_orientation_analysis",
    ROOT / "scripts/ant-multiphysics-orientation-analysis.py",
)
ANALYSIS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ANALYSIS)


class OrientationDefinitionTests(unittest.TestCase):
    def test_pretty_json_sequence_normalizes_repeatably_to_line_records(self):
        pretty = '{\n  "tick": 1,\n  "segments": []\n}\n{\n  "tick": 2,\n  "segments": []\n}\n'
        values = list(ANALYSIS.iter_json_sequence(io.StringIO(pretty)))
        self.assertEqual(values, [{"tick": 1, "segments": []}, {"tick": 2, "segments": []}])
        normalized_a = "".join(ANALYSIS.canonical_json(value) + "\n" for value in values).encode("utf-8")
        normalized_b = "".join(ANALYSIS.canonical_json(value) + "\n" for value in values).encode("utf-8")
        self.assertEqual(hashlib.sha256(normalized_a).digest(), hashlib.sha256(normalized_b).digest())
        self.assertEqual([json.loads(line) for line in normalized_a.decode("utf-8").splitlines()], values)

    def test_polar_alignment_and_opposing_traffic(self):
        polar, nematic = ANALYSIS.order_from_angles([0, 0, 0, 0])
        self.assertAlmostEqual(abs(polar), 1.0)
        self.assertAlmostEqual(abs(nematic), 1.0)

        polar, nematic = ANALYSIS.order_from_angles([0, math.pi])
        self.assertLess(abs(polar), ANALYSIS.EPSILON)
        self.assertAlmostEqual(abs(nematic), 1.0)

    def test_both_signs_of_nematic_half_charge(self):
        q = np.exp(1j * np.asarray([0, math.pi / 2, math.pi, 3 * math.pi / 2]))
        self.assertAlmostEqual(ANALYSIS.winding_charge(q, "Q"), 0.5)
        self.assertAlmostEqual(ANALYSIS.winding_charge(q[::-1], "Q"), -0.5)

    def test_only_supported_interior_loop_contributes_winding(self):
        vertices = ((1, 1), (1, 2), (2, 2), (2, 1))
        q = np.zeros((5, 5), dtype=np.complex128)
        counts = np.zeros((5, 5), dtype=np.uint32)
        for vertex, value in zip(vertices, np.exp(1j * np.asarray([0, math.pi / 2, math.pi, 3 * math.pi / 2]))):
            q[vertex] = value
            counts[vertex] = 3

        positive = ANALYSIS.winding_summary(q, counts, 3, "Q")
        self.assertEqual(positive["validInteriorLoops"], 1)
        self.assertEqual(positive["chargeHistogram"], {"0.5": 1})
        negative = ANALYSIS.winding_summary(q.conj(), counts, 3, "Q")
        self.assertEqual(negative["chargeHistogram"], {"-0.5": 1})

        counts[vertices[0]] = 2
        unsupported = ANALYSIS.winding_summary(q, counts, 3, "Q")
        self.assertEqual(unsupported["validInteriorLoops"], 0)

    def test_edge_touching_loops_are_not_enumerated(self):
        loops = list(ANALYSIS.interior_elementary_loops(5))
        self.assertEqual(len(loops), 4)
        for loop in loops:
            self.assertTrue(all(0 < row < 4 and 0 < col < 4 for row, col in loop))
        self.assertLess(len(loops), (5 - 1) ** 2)

    def test_exact_half_open_window_bounds(self):
        start, end = ANALYSIS.window_bounds(10, 5)
        self.assertEqual((start, end), (5, 10))
        included = [second for second in range(0, 12) if start <= second < end]
        self.assertEqual(included, [5, 6, 7, 8, 9])
        with self.assertRaises(ValueError):
            ANALYSIS.window_bounds(4, 5)

    def test_persistence_uses_minimum_support_intersection_weights(self):
        p = np.asarray([[1 + 0j, 1 + 0j]])
        q = np.asarray([[1 + 0j, 1 + 0j]])
        p_next = np.asarray([[1 + 0j, -1 + 0j]])
        q_next = p_next.copy()
        series = {
            1: (np.asarray([[5, 3]], dtype=np.uint32), p, q),
            2: (np.asarray([[2, 4]], dtype=np.uint32), p_next, q_next),
        }
        result = ANALYSIS.persistence(series, 1, 1, "P", 2)
        self.assertAlmostEqual(result["rho"], -0.2)
        self.assertEqual(result["matchedCellPairs"], 2)
        self.assertEqual(result["totalIntersectionWeight"], 5.0)

    def test_adjacent_orientation_mismatch_keeps_polar_and_nematic_distinct(self):
        counts = np.ones((5, 5), dtype=np.uint32)
        polar = np.ones((5, 5), dtype=np.complex128)
        polar[1, 2] = -1 + 0j
        nematic = polar ** 2

        p_summary = ANALYSIS.neighbor_mismatch_summary(polar, counts, 1, "P")
        q_summary = ANALYSIS.neighbor_mismatch_summary(nematic, counts, 1, "Q")
        self.assertEqual(p_summary["validAdjacentInteriorPairs"], 12)
        self.assertEqual(q_summary["validAdjacentInteriorPairs"], 12)
        self.assertGreater(p_summary["meanRadians"], 0)
        self.assertAlmostEqual(q_summary["meanRadians"], 0.0)
        self.assertEqual(sum(row["pairs"] for row in p_summary["fixedHistogram"]), 12)
        self.assertEqual(sum(row["pairs"] for row in q_summary["fixedHistogram"]), 12)

    def test_corner_ties_follow_locked_edge_order(self):
        self.assertEqual(ANALYSIS.nearest_boundary(0.25, 0.25), (0.25, "left"))
        self.assertEqual(ANALYSIS.nearest_boundary(0.75, 0.75), (0.25, "right"))

    def test_reanalysis_helpers_produce_repeatable_synthetic_bytes(self):
        counts = np.zeros((48, 48), dtype=np.uint32)
        p = np.zeros((48, 48), dtype=np.complex128)
        q = np.zeros((48, 48), dtype=np.complex128)
        counts[8:10, 8:10] = 3
        p[8:10, 8:10] = 0.5 + 0.25j
        q[8:10, 8:10] = -0.5 + 0.25j
        record = ANALYSIS.local_field_record(48, 5, 60, counts, p, q)
        line = (ANALYSIS.canonical_json(record) + "\n").encode("utf-8")
        compressed_a = gzip.compress(line, compresslevel=9, mtime=0)
        compressed_b = gzip.compress(line, compresslevel=9, mtime=0)
        self.assertEqual(hashlib.sha256(compressed_a).digest(), hashlib.sha256(compressed_b).digest())
        decoded = json.loads(gzip.decompress(compressed_a))
        self.assertEqual(decoded, record)

        atlas = {}
        for grid in ANALYSIS.GRIDS:
            field_n = np.zeros((grid, grid), dtype=np.uint32)
            field_p = np.zeros((grid, grid), dtype=np.complex128)
            field_q = np.zeros((grid, grid), dtype=np.complex128)
            field_n[2, 2] = 3
            field_p[2, 2] = 1 + 0j
            field_q[2, 2] = 1 + 0j
            for window in ANALYSIS.WINDOWS:
                for end in ANALYSIS.ATLAS_TIMES:
                    atlas[(grid, window, end)] = (field_n.copy(), field_p.copy(), field_q.copy())
        atlas_bytes_a = ANALYSIS.render_atlas(atlas).encode("utf-8")
        atlas_bytes_b = ANALYSIS.render_atlas(atlas).encode("utf-8")
        self.assertEqual(hashlib.sha256(atlas_bytes_a).digest(), hashlib.sha256(atlas_bytes_b).digest())


if __name__ == "__main__":
    unittest.main()
