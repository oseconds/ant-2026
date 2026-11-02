"""Render fixed-scale technical figures for the wet-film first probe."""
import argparse
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe"
DATA = PACKAGE / "data"
VISUAL = PACKAGE / "visual"
HEIGHT_LIMITS = (0.0, 1.2)
DIFFERENCE_LIMITS = (-0.5, 0.5)
PRIMARY = ("pair", "cross", "obstacle", "open_obstacle", "supply_off")
ARMS = ("frozen", "heat", "film")
TIMES = {"primary": [0, .00025, .001, .0025, .005, .01, .02],
         "ant": [0, .001, .003, .006, .009, .012]}
ILLUSTRATIVE_T0_SECONDS = 10000


def check_contract():
    assert HEIGHT_LIMITS == (0.0, 1.2)
    assert DIFFERENCE_LIMITS == (-0.5, 0.5)
    assert len(PRIMARY) == 5 and len(ARMS) == 3
    assert TIMES["primary"] == sorted(TIMES["primary"])
    assert ILLUSTRATIVE_T0_SECONDS == 10000


def run_id(case, arm):
    return f"{case}-{arm}-n64-dt0.0001-b0.1-W0.5"


def load_run(name):
    stem = DATA / name
    for suffix in (".npz", ".csv", ".json"):
        if not (DATA / (name + suffix)).is_file():
            raise FileNotFoundError(DATA / (name + suffix))
    summary = json.loads((DATA / (name + ".json")).read_text(encoding="utf-8"))
    with np.load(DATA / (name + ".npz"), allow_pickle=False) as z:
        heights, times = z["heights"], z["times"]
        blocked, initial = z["blocked"], z["initial"]
    n = summary["n"]
    assert heights.ndim == 3 and heights.shape[1:] == (n, n)
    assert blocked.shape == initial.shape == (n, n)
    assert heights.shape[0] == len(times) == len(summary["snapshots"])
    active = np.broadcast_to(~blocked, heights.shape)
    finite = np.isfinite(heights)
    assert np.all(finite[active]) and np.all(finite | ~active)
    assert np.all(heights[finite] > 0)
    assert np.allclose(times, summary["snapshots"], rtol=0, atol=1e-12)
    return dict(id=name, summary=summary, heights=heights, times=times,
                blocked=blocked.astype(bool), initial=initial)


def time_label(t, case):
    suffix = f"; {t * ILLUSTRATIVE_T0_SECONDS:g} illustrative s"
    return f"t*={t:g}{suffix}"


def case_figure(case, runs, selected_times):
    row_names = (*ARMS, "film − frozen")
    fig, axes = plt.subplots(len(row_names), len(selected_times), figsize=(14, 8.4),
                             sharex=True, sharey=True, constrained_layout=True)
    height_image = difference_image = None
    for ri, arm in enumerate(row_names):
        for ci, target in enumerate(selected_times):
            ax = axes[ri, ci]
            reference = runs["frozen"]
            idx = int(np.argmin(np.abs(reference["times"] - target)))
            actual = float(reference["times"][idx])
            if abs(actual - target) > 1e-9:
                raise ValueError(f"{reference['id']} missing fixed snapshot {target}")
            if arm == "film − frozen":
                reference_idx = int(np.argmin(np.abs(reference["times"] - actual)))
                treated = runs["film"]
                treated_idx = int(np.argmin(np.abs(treated["times"] - actual)))
                difference_image = ax.imshow(treated["heights"][treated_idx] - reference["heights"][reference_idx],
                                             origin="lower", extent=(0, 1, 0, 1), interpolation="nearest",
                                             cmap="coolwarm", vmin=DIFFERENCE_LIMITS[0], vmax=DIFFERENCE_LIMITS[1])
            else:
                run = runs[arm]
                run_idx = int(np.argmin(np.abs(run["times"] - target)))
                height_image = ax.imshow(run["heights"][run_idx], origin="lower", extent=(0, 1, 0, 1),
                                         interpolation="nearest", cmap="viridis", vmin=HEIGHT_LIMITS[0],
                                         vmax=HEIGHT_LIMITS[1])
            blocked = reference["blocked"]
            if blocked.any():
                ax.add_patch(Rectangle((.55, .3), .10, .40, facecolor="#999999", edgecolor="#666666",
                                       hatch="////", alpha=.35, linewidth=.5))
            ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect("equal")
            if ri == 0:
                ax.set_title(time_label(actual, case), fontsize=8)
            if ci == 0:
                ax.set_ylabel(f"{arm}\ny", fontsize=9)
            if ri == len(row_names)-1:
                ax.set_xlabel("x")
            if case in ("supply_off", "ant"):
                source_end = .0015 if case == "supply_off" else .006
                source = "conditional binned foot dose " if case == "ant" else "source "
                source += "ON" if actual <= source_end + 1e-12 else "OFF"
                ax.text(.02, .98, source, transform=ax.transAxes, va="top", ha="left", fontsize=7,
                        color="white", bbox=dict(facecolor="black", alpha=.55, pad=1))
    title_note = "; conditional binned foot dose, not measured film" if case == "ant" else ""
    fig.suptitle(f"{case}: raw h fixed 0–1.2; film − frozen fixed ±0.5; illustrative T0=10000 s only{title_note}", fontsize=12)
    fig.colorbar(height_image, ax=axes[:len(ARMS), :], shrink=.78, extend="both",
                 label="nondimensional height h")
    fig.colorbar(difference_image, ax=axes[len(ARMS):, :], shrink=.78,
                 extend="both", label="Δh")
    return fig


def pair_sensitivity(runs):
    fig, ax = plt.subplots(figsize=(7.5, 4.5), constrained_layout=True)
    for run in runs:
        h = run["heights"][-1]
        x = (np.arange(h.shape[1]) + .5) / h.shape[1]
        profile = h[h.shape[0]//2, :]
        s = run["summary"]
        label = f"N={s['n']}, dt={s['dt']:g}, b={s['b']:g}, W={s['W']:g}"
        ax.plot(x, profile, label=label, linewidth=1.1)
    ax.set(xlim=(0, 1), ylim=HEIGHT_LIMITS, xlabel="x at y=0.5 (cell-center profile)",
           ylabel="nondimensional height h", title="Pair / film final centerline sensitivities")
    ax.grid(alpha=.25); ax.legend(fontsize=7, ncol=2)
    return fig


def receipt_bytes(path):
    data = path.read_bytes()
    if path.suffix in (".json", ".csv"):
        data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return data


def sha256(path):
    return hashlib.sha256(receipt_bytes(path)).hexdigest()


def range_receipt(arrays, limits):
    values = np.concatenate([np.asarray(a).ravel() for a in arrays])
    values = values[np.isfinite(values)]
    return dict(finite_samples=int(values.size), below_min=int(np.sum(values < limits[0])),
                above_max=int(np.sum(values > limits[1])), minimum=float(values.min()),
                maximum=float(values.max()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true", help="assert fixed scales and preregistered layout")
    args = parser.parse_args()
    check_contract()
    if args.self_check:
        print("wet-film atlas contract: PASS")
        return
    campaign = json.loads((DATA / "summary.json").read_text(encoding="utf-8"))
    assert campaign["schema"] == "ant-wet-film-first-probe-v1"
    summaries = {r["id"]: r for r in campaign["runs"]}
    runs = {}
    for case in PRIMARY:
        runs[case] = {arm: load_run(run_id(case, arm)) for arm in ARMS}
        for arm in ARMS:
            assert runs[case][arm]["summary"]["id"] == run_id(case, arm)
    ant_ids = [run_id("ant", arm) for arm in ARMS]
    ant_present = [name in summaries for name in ant_ids]
    if any(ant_present) and not all(ant_present):
        raise ValueError("partial optional ANT case: require all three arms or none")
    if all(ant_present):
        ant = {arm: load_run(run_id("ant", arm)) for arm in ARMS}
        for arm in ARMS:
            assert len(ant[arm]["times"]) == len(TIMES["ant"])
        runs["ant"] = ant

    VISUAL.mkdir(parents=True, exist_ok=True)
    outputs = []
    for case, arms in runs.items():
        expected = TIMES["ant"] if case == "ant" else TIMES["primary"]
        for arm, run in arms.items():
            assert np.allclose(run["times"], expected, rtol=0, atol=1e-12)
        fig = case_figure(case, arms, expected)
        path = VISUAL / f"{case}-height-atlas.png"
        fig.savefig(path, dpi=150, metadata={"Software": "ant-wet-film-atlas.py"})
        plt.close(fig)
        outputs.append(path)

    pair_variants = [r for r in summaries.values() if r["case"] == "pair" and r["arm"] == "film"]
    variants = [load_run(r["id"]) for r in sorted(pair_variants, key=lambda r: (r["n"], r["dt"], r["b"], r["W"]))]
    if len(variants) < 7:
        raise ValueError("pair sensitivity comparison requires all seven preregistered film runs")
    fig = pair_sensitivity(variants)
    path = VISUAL / "pair-film-sensitivity.png"
    fig.savefig(path, dpi=150, metadata={"Software": "ant-wet-film-atlas.py"})
    plt.close(fig)
    outputs.append(path)

    all_runs = {r["id"]: r for group in runs.values() for r in group.values()}
    all_runs.update({r["id"]: r for r in variants})
    raw_ranges = [r["heights"] for r in all_runs.values()]
    difference_ranges = []
    for group in runs.values():
        frozen, film = group["frozen"], group["film"]
        if frozen["heights"].shape != film["heights"].shape:
            raise ValueError("film and frozen snapshot grids differ")
        difference_ranges.append(film["heights"] - frozen["heights"])

    receipt = dict(schema="ant-wet-film-atlas-receipt-v1", fixed_height_limits=list(HEIGHT_LIMITS),
                   fixed_difference_limits=list(DIFFERENCE_LIMITS),
                   stored_data_ranges=dict(height=range_receipt(raw_ranges, HEIGHT_LIMITS),
                                           film_minus_frozen=range_receipt(difference_ranges, DIFFERENCE_LIMITS)),
                   times=TIMES, illustrative_T0_seconds=ILLUSTRATIVE_T0_SECONDS,
                   framing=[0, 1, 0, 1], difference_definition="film height minus frozen height at matching snapshot",
                   obstacle_rectangle=[.55, .65, .3, .7],
                   interpretation="Illustrative dimensional seconds are nondimensional t* times 10000 s; not ANT-measured time.",
                   input_runs=sorted({r["id"] for group in runs.values() for r in group.values()} |
                                     {r["id"] for r in variants}),
                   hash_convention="JSON/CSV inputs use LF-normalized UTF-8; NPZ and PNG use raw bytes.",
                   input_files=[dict(path=f"data/{name}{suffix}", bytes=len(receipt_bytes(DATA / f"{name}{suffix}")),
                                     sha256=sha256(DATA / f"{name}{suffix}"))
                                for name in sorted({r["id"] for group in runs.values() for r in group.values()} |
                                                   {r["id"] for r in variants})
                                for suffix in (".npz", ".csv", ".json")],
                   outputs=[dict(path=p.name, bytes=p.stat().st_size, sha256=sha256(p)) for p in outputs])
    (VISUAL / "plot-receipts.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"rendered": [p.name for p in outputs], "receipt": "plot-receipts.json"}))


if __name__ == "__main__":
    main()
