import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from ant_wet_film_core import Grid, heat_step, wet_film_step


class WetFilmCoreTests(unittest.TestCase):
    def test_flat_film_is_invariant_and_unpack_marks_blocked(self):
        blocked = np.zeros((8, 8), bool)
        blocked[3, 3] = True
        grid = Grid(8, blocked)
        h, receipt = wet_film_step(grid, np.ones(grid.size), 0.2)
        np.testing.assert_array_equal(h, np.ones(grid.size))
        self.assertEqual(grid.dx, 1 / 8)
        self.assertTrue(np.isnan(grid.unpack(h)[3, 3]))
        self.assertEqual(receipt["newton_steps"], 0)

    def test_wet_film_conserves_mass_stays_positive_and_dissipates(self):
        grid = Grid(8)
        y, x = np.mgrid[:8, :8]
        old = 1 + 0.08 * np.cos(2 * np.pi * x / 8) * np.cos(2 * np.pi * y / 8)
        new, r = wet_film_step(grid, old, 0.02)
        self.assertGreater(new.min(), 0)
        self.assertAlmostEqual(r["mass_after"], r["mass_before"], delta=1e-12)
        self.assertLessEqual(r["energy_after"], r["energy_before"] + 1e-10)
        self.assertLessEqual(r["residual_norm"], 1.1e-10)
        self.assertEqual(len(r["integrated_signed_edge_flux"]), len(grid.i))
        self.assertLessEqual(r["energy_inequality_defect"], 1e-10)

    def test_obstacle_edges_and_heat_mass(self):
        blocked = np.zeros((8, 8), bool)
        blocked[3, 3] = True
        grid = Grid(8, blocked)
        coords = np.column_stack(np.unravel_index(grid.active, (8, 8)))
        self.assertTrue(all(np.abs(coords[a] - coords[b]).sum() == 1 for a, b in zip(grid.i, grid.j)))
        old = np.arange(grid.size, dtype=float)
        new = heat_step(grid, old, 0.1)
        self.assertAlmostEqual(np.sum(new), np.sum(old), delta=1e-10)

    def test_fourier_mode_and_viscosity_time_rescaling(self):
        grid = Grid(8, boundary="periodic")
        _, x = np.mgrid[:8, :8]
        mode = (1e-5 * np.cos(2 * np.pi * x / 8)).ravel()
        old = np.ones(grid.size) + mode
        dt = 0.01
        fast, _ = wet_film_step(grid, old, dt, viscosity=1)
        slow, _ = wet_film_step(grid, old, 0.02, viscosity=2)
        lam = 4 * np.sin(np.pi / 8)**2 / grid.dx**2
        expected = (1 + 3 * dt * lam * 0.5 * 0.1**2) / (1 + dt * lam * (lam + 6 * 0.5 * 0.1**5))
        self.assertAlmostEqual(np.linalg.norm(fast - 1) / np.linalg.norm(mode), expected, delta=2e-5)
        np.testing.assert_allclose(fast, slow, atol=1e-12)

    def test_invalid_height_and_heat_arguments_rejected(self):
        grid = Grid(8)
        with self.assertRaises(ValueError):
            wet_film_step(grid, np.zeros(grid.size), 0.1)
        with self.assertRaises(ValueError):
            heat_step(grid, np.ones(grid.size), 0)


if __name__ == "__main__":
    unittest.main()
