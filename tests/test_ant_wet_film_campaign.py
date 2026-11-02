import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np

SCRIPT = Path(__file__).resolve().parents[1]/"scripts/ant-wet-film-formation.py"
spec = importlib.util.spec_from_file_location("wet_campaign", SCRIPT)
campaign = importlib.util.module_from_spec(spec)
spec.loader.exec_module(campaign)


class CampaignDefinitions(unittest.TestCase):
    def test_source_is_volume_not_event_strength(self):
        grid = campaign.Grid(16)
        for x, y in ((.5, .5), (0, 0), (1, .5)):
            dose = campaign.source_stamp(grid, x, y, .08, .001)
            self.assertAlmostEqual(float(dose.sum()*grid.dx**2), .001, delta=1e-16)

    def test_primary_pair_initially_has_two_ridges_at_all_declared_levels(self):
        for n in (32, 64, 128):
            grid, full = campaign.initial_field("pair", n, .1)
            h = grid.pack(full)
            metrics = campaign.field_metrics(grid, h, h, .1, .5)
            for level in campaign.LEVELS:
                self.assertEqual(metrics[f"components_{level}"], 2)
            self.assertLess(metrics["physical_slope_upper_bound"], .2)

    def test_null_spectral_match_and_obstacle_excess_source(self):
        self.assertAlmostEqual(campaign.heat_diffusivity(), 16.488801738871686)
        for n in (32, 64, 128):
            wall, a = campaign.initial_field("obstacle", n, .1)
            open_grid, b = campaign.initial_field("open_obstacle", n, .1)
            self.assertAlmostEqual(float((wall.pack(a)-.1).sum()*wall.dx**2),
                                   float((open_grid.pack(b)-.1).sum()*open_grid.dx**2), delta=1e-15)

    def test_face_flux_reconstructs_cell_mass_change(self):
        grid, full = campaign.initial_field("cross", 16, .1)
        h = grid.pack(full)
        new, receipt = campaign.wet_film_step(grid, h, 1e-4)
        residual = (new-h)*grid.dx**2 - grid.B.T@receipt["integrated_signed_edge_flux"]
        self.assertLess(float(np.max(np.abs(residual))), 1e-11)


if __name__ == "__main__":
    unittest.main()
