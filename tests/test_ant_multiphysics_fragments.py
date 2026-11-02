import importlib.util
from pathlib import Path
import sys
import unittest

import numpy as np


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ant-multiphysics-fragments.py"
SPEC = importlib.util.spec_from_file_location("ant_multiphysics_fragments", SCRIPT)
model = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = model
SPEC.loader.exec_module(model)


class FragmentContactTests(unittest.TestCase):
    def test_row_fixture_records_floor_end_stop_and_ceiling_geometry(self):
        _, walls = model._row_scene()
        by_name = {wall.name: wall for wall in walls}
        self.assertEqual(set(by_name), {"floor", "end_stop", "ceiling"})
        np.testing.assert_array_equal(by_name["ceiling"].start, (-10.0, 1.05))
        np.testing.assert_array_equal(by_name["ceiling"].end, (10.0, 1.05))
        np.testing.assert_array_equal(by_name["ceiling"].inward, (0.0, -1.0))
        np.testing.assert_array_equal(by_name["end_stop"].start, (1.5, 0.0))
        np.testing.assert_array_equal(by_name["end_stop"].end, (1.5, 1.05))

    def test_normal_force_cutoff_energy_is_recorded_only_on_contact_transition(self):
        disk = model.Disk("d", np.zeros(2), np.zeros(2))
        normal = np.array((1.0, 0.0))
        key = ("wall", "d", "wall")
        force, torque = np.zeros((1, 2)), np.zeros(1)
        free_overlap = model._contact_force(
            key, normal, 0.01, np.array((10.0, 0.0)), np.array((-0.5, 0.0)), None,
            1.0, disk, None, force.copy(), torque.copy(), {}, model.BASE_DT, model.BASE_K, model.BASE_K, 0.5,
        )
        self.assertEqual(free_overlap[-1], 0.0)
        memories = {key: model.ContactMemory(np.zeros(2), normal.copy(), 0.5 * model.BASE_K * 0.01**2, 0.0)}
        transition = model._contact_force(
            key, normal, 0.01, np.array((10.0, 0.0)), np.array((-0.5, 0.0)), None,
            1.0, disk, None, force.copy(), torque.copy(), memories, model.BASE_DT, model.BASE_K, model.BASE_K, 0.5,
        )
        self.assertAlmostEqual(transition[-1], 0.5 * model.BASE_K * 0.01**2)

    def test_tangential_history_rotates_with_contact_frame(self):
        xi = model._transport_tangent_history(
            np.array((0.0, 0.2)),
            np.array((1.0, 0.0)),
            np.array((0.0, 1.0)),
            np.array((-1.0, 0.0)),
        )
        self.assertAlmostEqual(xi, 0.2, delta=1e-12)

    def test_head_on_measured_restitution_matches_repulsive_force_cutoff(self):
        results = [model.run_pair_impact(0.0, dt, head_on=True) for dt in model.DT_LADDER]
        errors = [r["summary"]["restitution_reference_abs_error"] for r in results]
        coefficients = [r["summary"]["measured_normal_restitution"] for r in results]
        reference = results[-1]["summary"]["repulsive_only_reference_e"]
        self.assertGreater(reference, model.E_RESTITUTION)
        self.assertLess(errors[-1], 0.01)
        self.assertLess(errors[-1], errors[0])
        self.assertTrue(all(not r["summary"]["final_contact_active"] for r in results))
        self.assertTrue(all(e > model.E_RESTITUTION for e in coefficients))

    def test_oblique_friction_generates_spin_and_preserves_pair_angular_momentum(self):
        friction = model.run_pair_impact(0.5, model.BASE_DT)
        null = model.run_pair_impact(0.0, model.BASE_DT)
        self.assertGreater(abs(friction["summary"]["final_omega_A"]), 1e-3)
        self.assertGreater(abs(friction["summary"]["final_omega_B"]), 1e-3)
        self.assertAlmostEqual(null["summary"]["final_omega_A"], 0.0, delta=1e-12)
        self.assertAlmostEqual(null["summary"]["final_omega_B"], 0.0, delta=1e-12)
        self.assertLess(abs(friction["summary"]["angular_momentum_drift"]), 1e-3)
        self.assertLessEqual(friction["summary"]["max_coulomb_excess"], 1e-12)

    def test_floor_coulomb_reduces_slip_near_ideal_arrest_reference(self):
        result = model.run_floor_arrest(0.5, model.BASE_DT)
        summary = result["summary"]
        self.assertAlmostEqual(summary["measured_dx"], summary["analytic_stop_distance"], delta=0.10 * summary["analytic_stop_distance"])
        self.assertLess(abs(summary["measured_vx_final"]), 0.08)
        self.assertLess(abs(summary["measured_omega_final"]), 0.25)
        self.assertLessEqual(summary["max_coulomb_excess"], 1e-12)
        self.assertGreater(summary["tangent_contact_loss_signed"], 0.0)
        self.assertLess(summary["peak_overlap"], 0.03 * 0.5)

    def test_zero_friction_floor_is_a_null(self):
        result = model.run_floor_arrest(0.0, model.BASE_DT)
        summary = result["summary"]
        self.assertAlmostEqual(summary["measured_dx"], 0.5 * 0.14, delta=1e-6)
        self.assertAlmostEqual(summary["measured_vx_final"], 0.5, delta=1e-12)
        self.assertAlmostEqual(summary["measured_omega_final"], 2.0, delta=1e-12)

    def test_forward_load_blocks_row_and_reverse_drive_releases_end_stop(self):
        result = model.run_row_blockage(0.5, model.BASE_DT)
        summary = result["summary"]
        self.assertLess(summary["hold_rightward_dx"], 0.025 * 0.5)
        self.assertGreaterEqual(summary["hold_min_disk_contacts"], 2)
        self.assertGreaterEqual(summary["hold_min_end_stop_contacts"], 1)
        self.assertGreater(summary["hold_min_drive_force_x"], 0.0)
        self.assertGreaterEqual(summary["reverse_leftward_dx"], 0.25 * 0.5)
        self.assertEqual(summary["reverse_final_end_stop_contacts"], 0)
        self.assertIn("not a collective-jam claim", summary["classification"])
        self.assertLessEqual(summary["max_coulomb_excess"], 1e-12)


if __name__ == "__main__":
    unittest.main()
