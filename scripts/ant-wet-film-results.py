"""Deterministic comparisons for the preregistered wet-film campaign."""
import argparse
import csv
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe/data"
OUT = ROOT / "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe/analysis/comparisons.json"
LEVELS = (0.05, 0.125, 0.25)


def read_run(run_id):
    meta = json.loads((DATA / f"{run_id}.json").read_text(encoding="utf-8"))
    with (DATA / f"{run_id}.csv").open(newline="", encoding="utf-8") as f:
        history = list(csv.DictReader(f))
    with np.load(DATA / f"{run_id}.npz") as z:
        arrays = {k: z[k].copy() for k in z.files}
    return meta, history, arrays


def number(row, key):
    v = row.get(key, "")
    return None if v in (None, "") else float(v)


def contours(history):
    result = {}
    ts = [float(r["time"]) for r in history]
    for level in LEVELS:
        key = f"components_{level}"
        counts = [int(float(r[key])) for r in history]
        first = next((ts[i] for i, c in enumerate(counts) if c == 1 and any(x > 1 for x in counts[:i])), None)
        # Count zero is absence above this observer level, not a merger.
        tail = len(counts) - 1
        while tail >= 0 and counts[tail] == 1:
            tail -= 1
        duration = ts[-1] - ts[tail + 1] if tail + 1 < len(ts) and counts[tail + 1] == 1 else 0.0
        result[str(level)] = {"first_one_component_after_multi_time": first,
                              "terminal_persistent_one_component_duration": duration,
                              "counts": counts, "times": ts}
    return result


def run_record(run_id):
    meta, history, arrays = read_run(run_id)
    final = history[-1]
    numeric_max = {}
    for key in ("mass_error", "maximum_height", "energy_inequality_defect",
                "physical_slope_upper_bound", "cumulative_dt_dissipation", "source_energy_work"):
        vals = [number(r, key) for r in history]
        vals = [v for v in vals if v is not None]
        if vals:
            numeric_max[key] = max(abs(v) if key == "mass_error" else v for v in vals)
    final_field = arrays["heights"][-1]
    active = np.isfinite(final_field)
    b = float(meta["b"])
    deficit = np.maximum(b-final_field[active], 0)
    return {"id": run_id, "parameters": {k: meta.get(k) for k in ("case", "arm", "n", "dt", "b", "W")},
            "final": {k: number(final, k) for k in ("time", "maximum_height", "excess_volume", "positive_excess_volume",
                      "energy", "mass_error", "physical_slope_upper_bound", "cumulative_dt_dissipation",
                      "source_energy_work", "cumulative_absolute_edge_transport", "signed_midplane_transfer",
                      "absolute_midplane_transfer")},
            "history_maxima": numeric_max, "max_mass_error": meta.get("max_absolute_mass_error"),
            "minimum_height_over_history": min(number(r, "minimum_height") for r in history),
            "final_minimum_height_snapshot": float(np.min(final_field[active])),
            "final_precursor_deficit_volume": float(deficit.sum() / (meta["n"]**2)),
            "final_area_below_precursor": float(np.count_nonzero(final_field[active] < b) / (meta["n"]**2)),
            "retry_count": meta.get("numerical_retry_count"), "contours": contours(history),
            "snapshot_times": [float(x) for x in arrays["times"]]}


def metrics_at(run_id, target):
    _, history, _ = read_run(run_id)
    row = next((r for r in history if abs(float(r["time"]) - target) < 1e-12), None)
    if row is None:
        raise ValueError(f"{run_id}: missing CSV history row at {target}")
    keys = ("time", "mass", "expected_mass", "mass_error", "minimum_height", "maximum_height",
            "excess_volume", "positive_excess_volume", "energy", "supplied_volume", "source_energy_work",
            "cumulative_dt_dissipation", "cumulative_absolute_edge_transport", "signed_midplane_transfer",
            "absolute_midplane_transfer", "physical_slope_upper_bound")
    return {k: number(row, k) for k in keys}


def pair_id(n, dt=1e-4, b=.1, W=.5):
    return f"pair-film-n{n}-dt{dt:g}-b{b:g}-W{W:g}"


def snapshot_at(run_id, target):
    _, _, z = read_run(run_id)
    i = np.flatnonzero(np.isclose(z["times"], target, rtol=0, atol=1e-12))
    if not len(i):
        raise ValueError(f"{run_id}: missing exact stored snapshot {target}")
    return z["heights"][i[0]], z


def normalized_l1(a, b, initial):
    mass = float(np.abs(initial - .1).sum() / initial.size)
    return None if mass == 0 else float(np.abs(a-b).sum()/initial.size/mass)


def comparisons(ids):
    out = {"schema": "ant-wet-film-comparisons-v1", "runs": [run_record(i) for i in ids],
           "mesh": [], "time_step": [], "source_off": {}, "ant_binned_shadow": {}, "obstacle": {}}
    for n0, n1 in ((32, 64), (64, 128)):
        i0, i1 = pair_id(n0), pair_id(n1)
        a, za = snapshot_at(i0, .02); b, zb = snapshot_at(i1, .02)
        # Restrict fine cell-centered heights by exact 2x2 finite-volume averaging.
        restricted = b.reshape(n0, 2, n0, 2).mean(axis=(1, 3))
        init0, init1 = za["initial"], zb["initial"].reshape(n0, 2, n0, 2).mean(axis=(1, 3))
        out["mesh"].append({"n_coarse": n0, "n_fine": n1, "final_time": .02,
                            "normalized_l1_by_initial_excess_mass": normalized_l1(a, restricted, init0),
                            "initial_field_quadrature_l1_error": float(np.abs(init0-init1).mean()),
                            "coarse_initial_excess_mass": float((init0-.1).sum()/n0**2),
                            "restricted_fine_initial_excess_mass": float((init1-.1).sum()/n0**2)})
    for d0, d1 in ((1e-4, 5e-5), (5e-5, 2.5e-5)):
        i0, i1 = pair_id(64, d0), pair_id(64, d1)
        r0, r1 = run_record(i0), run_record(i1)
        out["time_step"].append({"dt_coarse": d0, "dt_fine": d1,
            "final_metrics": {k: [r0["final"].get(k), r1["final"].get(k)] for k in ("maximum_height", "excess_volume", "energy")},
            "contour_times": {str(level): [r0["contours"][str(level)]["first_one_component_after_multi_time"],
                                            r1["contours"][str(level)]["first_one_component_after_multi_time"]] for level in LEVELS}})
    for case, times in (("supply_off", (.002, .02)), ("ant", (.006, .012))):
        runs = [i for i in ids if i.startswith(f"{case}-")]
        arms = sorted({i.split("-")[1] for i in runs})
        dest = out["source_off"] if case == "supply_off" else out["ant_binned_shadow"]
        dest["interpretation"] = "conditional binned-dose shadow; not natural-fluid validation" if case == "ant" else "exact stored source-off comparisons"
        dest["timepoints"] = {}
        for t in times:
            dest["timepoints"][str(t)] = {}
            for arm in arms:
                candidates = [i for i in runs if i.split("-")[1] == arm and "dt0.0001" in i]
                if not candidates: continue
                rid = candidates[0]
                history = read_run(rid)[1]
                prefix = [r for r in history if float(r["time"]) <= t + 1e-12]
                dest["timepoints"][str(t)][arm] = {"run": rid, "metrics": metrics_at(rid, t),
                    "stored_snapshot": any(abs(t-s) < 1e-12 for s in read_run(rid)[2]["times"]),
                    "contours_through_timepoint": contours(prefix)}
        if case == "ant":
            for arm in arms:
                rid = next((i for i in runs if i.split("-")[1] == arm and "dt0.0001" in i), None)
                if rid:
                    a, _ = snapshot_at(rid, .006); b, _ = snapshot_at(rid, .012)
                    dose = metrics_at(rid, .006)["supplied_volume"]
                    dest.setdefault("temporal_excess_l1", {})[arm] = {
                        "from_time": .006, "to_time": .012,
                        "normalizer": "cumulative supplied volume at source-off start",
                        "normalized_l1_by_source_budget": float(np.abs((b-.1)-(a-.1)).sum()/b.size/dose) if dose else None}
    # ANT step-size sensitivity over the source-off interval, scaled by its declared total dose.
    ant_dt0 = "ant-film-n64-dt0.0001-b0.1-W0.5"
    ant_dt1 = "ant-film-n64-dt5e-05-b0.1-W0.5"
    if ant_dt0 in ids and ant_dt1 in ids:
        h0, _ = snapshot_at(ant_dt0, .012); h1, _ = snapshot_at(ant_dt1, .012)
        budget0 = metrics_at(ant_dt0, .012)["supplied_volume"]
        budget1 = metrics_at(ant_dt1, .012)["supplied_volume"]
        peak0, peak1 = run_record(ant_dt0)["final"]["maximum_height"], run_record(ant_dt1)["final"]["maximum_height"]
        out["ant_binned_shadow"]["time_step"] = {
            "runs": [ant_dt0, ant_dt1], "final_time": .012,
            "source_budget": [.05677, .05677], "recorded_supplied_volume": [budget0, budget1],
            "final_excess_height_normalized_l1_by_0.05677_source_budget":
                float(np.abs((h0-.1)-(h1-.1)).sum()/h0.size/.05677),
            "final_peak_height": [peak0, peak1], "absolute_peak_height_difference": abs(peak0-peak1)}
    oi, op = "open_obstacle-film-n64-dt0.0001-b0.1-W0.5", "obstacle-film-n64-dt0.0001-b0.1-W0.5"
    if oi in ids and op in ids:
        a, za = snapshot_at(oi, .02); b, zb = snapshot_at(op, .02)
        mask = zb["blocked"]
        common = float(np.maximum(za["initial"]-.1, 0).sum()/a.size)
        out["obstacle"] = {"common_initial_excess_mass": common,
            "open_final_excess_mass_in_blocked_footprint": float(np.maximum(a[mask]-.1, 0).sum()/a.size),
            "obstacle_final_active_cells_in_footprint": int(np.isfinite(b[mask]).sum()),
            "obstacle_excluded_cells_in_footprint": int(mask.sum()),
            "obstacle_final_excess_mass_in_footprint": 0.0}
    # Temporal resolution and fine-parameter comparisons use excess height so differing
    # precursor backgrounds cannot masquerade as morphology differences.
    for d0, d1 in ((1e-4, 5e-5), (5e-5, 2.5e-5)):
        ids2 = (pair_id(64, d0), pair_id(64, d1))
        arrays = [snapshot_at(r, .02) for r in ids2]
        base = arrays[0][1]["initial"]
        denom = float(np.abs(base-.1).sum()/base.size)
        out["time_step"][(0 if d0 == 1e-4 else 1)]["final_excess_height_normalized_l1"] = float(
            np.abs((arrays[1][0]-.1)-(arrays[0][0]-.1)).sum()/base.size/denom)
    primary = "pair-film-n128-dt0.0001-b0.1-W0.5"
    out["fine_parameter_sensitivities"] = []
    base, zbase = snapshot_at(primary, .02)
    denom = float(np.abs(zbase["initial"]-.1).sum()/base.size)
    for rid, bval, wval in (("pair-film-n128-dt0.0001-b0.1-W2", .1, 2),
                             ("pair-film-n128-dt0.0001-b0.05-W0.5", .05, .5)):
        if rid in ids:
            field, _ = snapshot_at(rid, .02)
            out["fine_parameter_sensitivities"].append({"run": rid, "background_b": bval, "wetting_W": wval,
                "comparison_field": "excess height h-b", "normalized_l1_by_primary_initial_excess_mass":
                float(np.abs((field-bval)-(base-.1)).sum()/base.size/denom)})
    out["film_vs_heat"] = {}
    for case in ("pair", "cross", "obstacle", "open_obstacle", "supply_off", "ant"):
        film = next((i for i in ids if i.startswith(f"{case}-film-n64-dt0.0001-b0.1-W0.5")), None)
        heat = next((i for i in ids if i.startswith(f"{case}-heat-n64-dt0.0001-b0.1-W0.5")), None)
        if film and heat:
            hf, zf = snapshot_at(film, run_record(film)["final"]["time"])
            hh, _ = snapshot_at(heat, run_record(heat)["final"]["time"])
            m, _, _ = read_run(film)
            source_volume = metrics_at(film, run_record(film)["final"]["time"])["supplied_volume"]
            active = np.isfinite(zf["initial"])
            initial_mass = float(np.abs(zf["initial"][active]-m["b"]).sum()/hf.size)
            normalizer = initial_mass if initial_mass > 0 else source_volume
            active = np.isfinite(hf) & np.isfinite(hh)
            out["film_vs_heat"][case] = {"runs": [film, heat], "final_time": run_record(film)["final"]["time"],
                "normalizer": "initial excess mass" if initial_mass > 0 else "cumulative supplied volume",
                "normalized_l1_excess_height": float(np.abs((hf[active]-m["b"])-(hh[active]-m["b"])).sum()/hf.size/normalizer) if normalizer else None,
                "film_peak_height": run_record(film)["final"]["maximum_height"],
                "heat_peak_height": run_record(heat)["final"]["maximum_height"]}
    return out


def self_check():
    h = [{"time": "0", "components_0.05": "2", "components_0.125": "0", "components_0.25": "0"},
         {"time": "1", "components_0.05": "1", "components_0.125": "0", "components_0.25": "0"},
         {"time": "2", "components_0.05": "0", "components_0.125": "1", "components_0.25": "1"}]
    c = contours(h)
    assert c["0.05"]["first_one_component_after_multi_time"] == 1.0
    assert c["0.05"]["terminal_persistent_one_component_duration"] == 0.0
    assert c["0.125"]["first_one_component_after_multi_time"] is None
    assert np.isfinite(normalized_l1(np.ones((2,2)), np.zeros((2,2)), np.ones((2,2))*1.1))
    return "PASS"


def main():
    p = argparse.ArgumentParser(); p.add_argument("--self-check", action="store_true"); p.add_argument("--output", type=Path, default=OUT)
    args = p.parse_args()
    if args.self_check:
        print(self_check()); return
    summary = json.loads((DATA / "summary.json").read_text(encoding="utf-8"))
    ids = [r["id"] for r in summary["runs"]]
    if len(ids) < 25:
        raise SystemExit(f"campaign incomplete: expected 25 runs, found {len(ids)}")
    value = comparisons(ids)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
