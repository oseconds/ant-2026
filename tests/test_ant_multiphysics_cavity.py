import importlib.util
import math
from pathlib import Path
import unittest

import numpy as np


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "ant-multiphysics-cavity.py"
SPEC = importlib.util.spec_from_file_location("ant_multiphysics_cavity", SCRIPT)
CAVITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CAVITY)


class CavityPhysicalMinimumTests(unittest.TestCase):
    def test_open_top_cases_reject_sealed_volume_and_resonance(self):
        cases = CAVITY.open_geometry_cases()
        self.assertEqual([case["sealed_cavity_volume_m3"] for case in cases], [None, None])
        self.assertEqual([case["frequency_hz"] for case in cases], [None, None])
        self.assertEqual([case["pressure_pa"] for case in cases], [None, None])
        self.assertGreater(cases[0]["geometric_void_m3"], 0.0)
        self.assertIsNone(cases[0]["neck_area_m2"])
        self.assertEqual(cases[0]["roof_coverage_fraction"], 0.0)
        self.assertEqual(cases[1]["roof_coverage_fraction"], 0.2)

    def test_accepted_frequency_sweep_stays_inside_compactness_screen(self):
        max_dimension = max(CAVITY.CHAMBER_M, CAVITY.CHAMBER_W, CAVITY.CHAMBER_H)
        max_kd = 2.0 * math.pi * CAVITY.FREQUENCY_HZ[-1] * max_dimension / CAVITY.SOUND_SPEED
        self.assertEqual(CAVITY.FREQUENCY_HZ[0], 1.0)
        self.assertEqual(CAVITY.FREQUENCY_HZ[-1], 340.0)
        self.assertLessEqual(max_kd, CAVITY.FREQUENCY_KD_LIMIT)

    def test_roofed_duct_is_a_distinct_open_open_reference(self):
        duct = CAVITY.roofed_duct_reference(0.1)
        self.assertAlmostEqual(duct["first_mode_hz"], CAVITY.SOUND_SPEED / 0.2)
        self.assertIn("added_roof", duct["name"])
        with self.assertRaises(ValueError):
            CAVITY.roofed_duct_reference(0.0)

    def test_nonpositive_or_nonfinite_neck_geometry_is_rejected(self):
        for radius in (0.0, -0.001, float("nan"), float("inf")):
            with self.assertRaises(ValueError):
                CAVITY.make_resonator(radius)

    def test_aperture_sweep_raises_helmholtz_frequency(self):
        frequencies = [CAVITY.make_resonator(radius)["frequency_0_hz"]
                       for radius in CAVITY.NECK_RADII_M]
        self.assertTrue(all(left < right for left, right in zip(frequencies, frequencies[1:])))
        for radius in CAVITY.NECK_RADII_M:
            resonator = CAVITY.make_resonator(radius)
            response = CAVITY.frequency_response(resonator)
            peak = response["frequency_hz"][np.argmax(np.abs(response["cavity_pressure_pa"]))]
            self.assertLess(abs(peak - resonator["frequency_0_hz"]) / resonator["frequency_0_hz"], 0.005)
            exact_f0 = CAVITY.frequency_response(
                resonator, np.asarray([resonator["frequency_0_hz"]]))
            self.assertAlmostEqual(abs(exact_f0["cavity_pressure_pa"][0]), resonator["q_total"])

    def test_frequency_domain_power_and_far_field_receipts_close(self):
        resonator = CAVITY.make_resonator(0.004)
        response = CAVITY.frequency_response(resonator, np.array([resonator["frequency_0_hz"]]))
        np.testing.assert_allclose(response["input_power_w"],
                                   response["internal_loss_w"] + response["radiation_power_w"],
                                   rtol=1e-12, atol=1e-20)
        u = abs(response["volume_velocity_m3_s"][0])
        far_field = response["far_field_pressure_pa_at_1m"][0]
        integrated_power = 2.0 * math.pi * (far_field**2) / (CAVITY.RHO * CAVITY.SOUND_SPEED)
        np.testing.assert_allclose(integrated_power, response["radiation_power_w"][0], rtol=1e-12)
        self.assertGreater(u, 0.0)

    def test_rk4_pulse_matches_exact_solution_and_energy_closes(self):
        transient = CAVITY.integrate_pulse(CAVITY.make_resonator(0.004))
        self.assertLess(transient["peak_pressure_error_fraction"], 0.002)
        self.assertLess(transient["pressure_trace_error_fraction"], 0.002)
        self.assertLess(transient["velocity_trace_error_fraction"], 0.002)
        self.assertLess(transient["closure_fraction"], 0.005)

    def test_compliant_wall_example_changes_rigid_wall_modes(self):
        resonator = CAVITY.make_resonator(0.004)
        wall = CAVITY.wall_compliance_case(resonator)
        self.assertGreater(wall["wall_to_air_compliance_ratio"], 1.0)
        self.assertEqual(len(wall["coupled_undamped_frequencies_hz"]), 2)
        modes = wall["coupled_mode_compactness"]["modes"]
        self.assertEqual(modes[0]["screen_status"], "INSIDE_COMPACT_SCREEN")
        self.assertEqual(
            modes[1]["screen_status"],
            "OUTSIDE_SCREEN_SURROGATE_ROOT_ONLY_NO_PHYSICAL_VALIDATION",
        )
        self.assertTrue(any(abs(mode - resonator["frequency_0_hz"]) / resonator["frequency_0_hz"] > 0.05
                            for mode in wall["coupled_undamped_frequencies_hz"]))
        self.assertLess(wall["eigenvalue_root_relative_error"], 1e-12)

    def test_coupled_wall_ode_conserves_energy_and_pressure_work(self):
        resonator = CAVITY.make_resonator(0.003)
        coupled = CAVITY.integrate_wall_coupling(resonator)
        self.assertLess(coupled["total_energy_drift_fraction"], 0.001)
        self.assertLess(coupled["pressure_work_error_fraction"], 0.001)
        self.assertGreater(np.ptp(coupled["wall_energy_j"]), 0.0)


if __name__ == "__main__":
    unittest.main()
