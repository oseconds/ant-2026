"""Bounded research campaign; never imports or changes ANT production."""
import os
for _thread_var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ[_thread_var] = "1"
import argparse
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from scipy.ndimage import label
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ant_wet_film_core import Grid, heat_step, wet_film_energy, wet_film_step

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-11-02-wet-film-formation-first-probe"
CANONICAL_PACKAGE = PACKAGE
AUTHORITY = "5bdd516b412d03d78c2511ceb372180941206968"
PRIOR = "918764c2d4924eb89fd6874122edc30b73d1499c"
CAPTURE = "docs/ant/evidence/2026-11-01-local-x-audio-reassessment/analysis/seed-20261005-control-capture.json.gz"
CAPTURE_SHA = "4871d4d24b4f235b9626f1e95baa3b79f81ec1c4ad800fc57187202fbfcb1003"
TIMES = [0, .00025, .001, .0025, .005, .01, .02]
LEVELS = [.05, .125, .25]
FOUR = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def extract_input():
    raw = subprocess.check_output(["git", "show", f"{PRIOR}:{CAPTURE}"], cwd=ROOT)
    assert hashlib.sha256(raw).hexdigest() == CAPTURE_SHA
    capture = json.loads(gzip.decompress(raw))
    assert capture["seed"] == "20261005" and capture["arm"] == "control"
    assert capture["audioDuringSimulation"] == "Off"
    rows = []
    for event in capture["contacts"]:
        t = event["payloadSimulationTimeMs"] / 1000
        if not 0 <= t < 60:
            continue
        for foot in event["payload"]["contacts"]:
            x, y = foot["position"]["x"], foot["position"]["y"]
            assert 0 <= x <= 1 and 0 <= y <= 1
            rows.append(dict(time_seconds=t, x=x, y=y, ant_id=event["payload"]["antId"],
                             leg_id=foot["legId"], group=event["payload"]["contactGroup"],
                             event_sequence=event["sequence"], source_tick=event["tick"]))
    value = dict(source_commit=PRIOR, source_path=CAPTURE, source_gzip_sha256=CAPTURE_SHA,
                 source_git_blob="e261774bb7595e99420c821a8fd19f62cfb91514", seed="20261005", arm="control",
                 interval_seconds=[0, 60], individual_feet=len(rows),
                 contact_groups=len(set(r["event_sequence"] for r in rows)), rows=rows)
    data = (json.dumps(value, separators=(",", ":"), allow_nan=False) + "\n").encode()
    path = PACKAGE / "input/seed05-control-feet-0-60s.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(data, mtime=0))
    print(json.dumps({k: v for k, v in value.items() if k != "rows"}))


def capsule(x, y, start, end, width=.08):
    a, c = np.asarray(start), np.asarray(end)
    t = np.clip(((x-a[0])*(c[0]-a[0]) + (y-a[1])*(c[1]-a[1])) / np.sum((c-a)**2), 0, 1)
    r = np.hypot(x-a[0]-t*(c[0]-a[0]), y-a[1]-t*(c[1]-a[1]))
    return np.where(r < width, .5*np.cos(np.pi*np.minimum(r/width, 1)/2)**2, 0)


def coordinates(n):
    c = (np.arange(n)+.5)/n
    return np.meshgrid(c, c)


def obstacle(x, y):
    return (x >= .55) & (x <= .65) & (y >= .3) & (y <= .7)


def initial_field(case, n, b):
    x, y = coordinates(n)
    blocked = obstacle(x, y) if case == "obstacle" else np.zeros((n, n), bool)
    height = np.zeros_like(x)
    for ox in (-.375, -.125, .125, .375):
        for oy in (-.375, -.125, .125, .375):
            xx, yy = x+ox/n, y+oy/n
            if case == "pair":
                h = capsule(xx, yy, (.4, .275), (.4, .725)) + capsule(xx, yy, (.6, .275), (.6, .725))
            elif case == "cross":
                h = capsule(xx, yy, (.275, .5), (.725, .5)) + capsule(xx, yy, (.5, .275), (.5, .725))
            elif case in ("obstacle", "open_obstacle"):
                h = capsule(xx, yy, (.25, .5), (.5, .5))
                h = np.where(obstacle(xx, yy), 0, h)
            else:
                h = np.zeros_like(xx)
            height += h/16
    if case in ("obstacle", "open_obstacle"):
        height[obstacle(x, y)] = 0
    return Grid(n, blocked=blocked, dx=1/n), height+b


def source_stamp(grid, x, y, radius, volume):
    xx, yy = coordinates(grid.n)
    r = np.hypot(xx-x, yy-y)
    w = np.where(r < radius, np.cos(np.pi*np.minimum(r/radius, 1)/2)**2, 0)
    v = grid.pack(w)
    if not v.sum() > 0:
        raise ValueError("source footprint is unresolved")
    return v * (volume/(v.sum()*grid.dx**2))


def source_schedule(case, grid):
    if case == "supply_off":
        return [(t, source_stamp(grid, .5, .5, .08, .001)) for t in (0, .0005, .001, .0015)], None
    if case != "ant":
        return [], None
    path = PACKAGE / "input/seed05-control-feet-0-60s.json.gz"
    if not path.exists():
        path = CANONICAL_PACKAGE / "input/seed05-control-feet-0-60s.json.gz"
    source = json.loads(gzip.decompress(path.read_bytes()))
    assert source["source_gzip_sha256"] == CAPTURE_SHA and source["individual_feet"] == len(source["rows"])
    bins = {}
    for row in source["rows"]:
        boundary = int(np.floor(row["time_seconds"]))+1
        bins.setdefault(boundary, np.zeros(grid.size))
        bins[boundary] += source_stamp(grid, row["x"], row["y"], .04, 1e-5)
    return [(second/10000, field) for second, field in sorted(bins.items())], source


def heat_diffusivity():
    b, W, href, k = .1, .5, .35, np.pi/(2*.08)
    phi_second = 3*W*b*b/href**7*(2*b**3-href**3)
    return float(href**3*(k*k+phi_second))


def field_metrics(grid, h, initial, b, W):
    full = grid.unpack(h)
    excess = h-b
    x, y = coordinates(grid.n)
    mass_excess = excess.sum()*grid.dx**2
    weights = np.maximum(excess, 0)
    positive_mass = weights.sum()*grid.dx**2
    edge_slopes = np.abs(grid.B@h)/grid.dx*.01
    directional = np.zeros((grid.size, 2))
    horizontal = (grid.active[grid.i]//grid.n == grid.active[grid.j]//grid.n)
    for axis, keep in enumerate((horizontal, ~horizontal)):
        np.maximum.at(directional[:, axis], grid.i[keep], edge_slopes[keep])
        np.maximum.at(directional[:, axis], grid.j[keep], edge_slopes[keep])
    slope_bound = float(np.sqrt(np.sum(directional**2, axis=1)).max(initial=0))
    centered_columns = full[:, grid.n//2-1:grid.n//2+1]
    center_rows = slice(int(.4*grid.n), int(.6*grid.n))
    result = dict(mass=float(h.sum()*grid.dx**2), excess_volume=float(mass_excess),
                  minimum_height=float(h.min()), maximum_height=float(h.max()),
                  energy=wet_film_energy(grid, h, b, W),
                  l1_from_initial=float(np.abs(h-initial).sum()*grid.dx**2),
                  l2_from_initial=float(np.sqrt(np.sum((h-initial)**2)*grid.dx**2)),
                  excess_outside_initial=float(np.maximum(excess[initial <= b+1e-14], 0).sum()*grid.dx**2),
                  centroid_x=float(np.sum(weights*x.ravel()[grid.active])/weights.sum()) if weights.sum() else None,
                  centroid_y=float(np.sum(weights*y.ravel()[grid.active])/weights.sum()) if weights.sum() else None,
                  positive_excess_volume=float(positive_mass),
                  central_gap_height=float(np.nanmean(centered_columns[center_rows])-b),
                  pressure_std=float(np.std(grid.K@h+W*(b*b/h**3-b**5/h**6))),
                  max_physical_edge_slope=float(edge_slopes.max(initial=0)),
                  physical_slope_upper_bound=slope_bound)
    for level in LEVELS:
        _, count = label((full > b+level) & ~grid.blocked, structure=FOUR)
        result[f"components_{level}"] = int(count)
        result[f"area_{level}"] = float(np.sum(full > b+level)*grid.dx**2)
    return result


def run_case(case, arm, n=64, dt=1e-4, b=.1, W=.5):
    grid, full = initial_field(case, n, b)
    h = grid.pack(full)
    sources, source = source_schedule(case, grid)
    initial = h.copy()
    times = TIMES if case != "ant" else [0, .001, .003, .006, .009, .012]
    end = times[-1]
    events = {round(t, 12): delta for t, delta in sources}
    targets = sorted(set(times + list(events)))
    snapshots, snapshot_times, history = [], [], []
    expected = float(h.sum()*grid.dx**2)
    total_source = source_work = total_transport = cross_transfer = cross_absolute = total_dissipation = 0.0
    max_mass_error = max_energy_defect = 0.0
    retries, time, index = 0, 0.0, 0
    retry_ledger = []
    mid = (grid.active[grid.i] % n < n/2) & (grid.active[grid.j] % n >= n/2)
    while True:
        key = round(time, 12)
        if key in events:
            delta = events[key]
            before = wet_film_energy(grid, h, b, W)
            h = h+delta
            added = float(delta.sum()*grid.dx**2)
            expected += added
            total_source += added
            source_work += wet_film_energy(grid, h, b, W)-before
        metrics = field_metrics(grid, h, initial, b, W)
        mass_error = metrics["mass"]-expected
        max_mass_error = max(max_mass_error, abs(mass_error))
        row = dict(time=time, expected_mass=expected, mass_error=mass_error,
                   supplied_volume=total_source, source_energy_work=source_work,
                   cumulative_absolute_edge_transport=total_transport,
                   signed_midplane_transfer=cross_transfer, absolute_midplane_transfer=cross_absolute,
                   cumulative_dt_dissipation=total_dissipation, **metrics)
        history.append(row)
        if any(abs(time-t) < 1e-12 for t in times):
            snapshots.append(grid.unpack(h))
            snapshot_times.append(time)
        if time >= end-1e-12:
            break
        while index < len(targets) and targets[index] <= time+1e-12:
            index += 1
        step = min(dt, targets[index]-time, end-time)
        while True:
            try:
                if arm == "film":
                    updated, receipt = wet_film_step(grid, h, step, b=b, W=W)
                    if receipt["energy_inequality_defect"] > 1e-8:
                        raise RuntimeError("energy inequality failed")
                    edge_volume = receipt["integrated_signed_edge_flux"]
                elif arm == "heat":
                    updated = heat_step(grid, h, step, heat_diffusivity())
                    flux = -heat_diffusivity()*(updated[grid.j]-updated[grid.i])/grid.dx
                    edge_volume = flux*step*grid.dx
                elif arm == "frozen":
                    updated = h.copy()
                else:
                    raise ValueError(arm)
                assert np.all(np.isfinite(updated)) and np.min(updated) > 0
                if abs(float(updated.sum()*grid.dx**2)-expected) > 1e-8:
                    raise RuntimeError("mass balance failed")
                if arm != "frozen":
                    total_transport += float(np.abs(edge_volume).sum())
                    cross_transfer += float(edge_volume[mid].sum())
                    cross_absolute += float(np.abs(edge_volume[mid]).sum())
                if arm == "film":
                    total_dissipation += receipt["dt_dissipation"]
                    max_energy_defect = max(max_energy_defect, receipt["energy_inequality_defect"])
                    row.update(step=step, newton_steps=receipt["newton_steps"], residual_norm=receipt["residual_norm"],
                               energy_inequality_defect=receipt["energy_inequality_defect"],
                               dt_dissipation=receipt["dt_dissipation"])
                break
            except RuntimeError as error:
                retries += 1
                retry_ledger.append(dict(time=time, attempted_step=step, reason=str(error)))
                step /= 2
                if step < 1e-8:
                    failure = dict(case=case, arm=arm, n=n, dt=dt, b=b, W=W,
                                   time=time, retry_ledger=retry_ledger, last_accepted_state=history[-1])
                    write_json(PACKAGE/"validation/numerical-stop.json", failure)
                    raise
        h = updated
        time = round(time+step, 14)
    name = f"{case}-{arm}-n{n}-dt{dt:g}-b{b:g}-W{W:g}"
    out = PACKAGE / "data"
    out.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out/f"{name}.npz", heights=np.asarray(snapshots), times=np.asarray(snapshot_times),
                        blocked=grid.blocked, initial=grid.unpack(initial))
    columns = sorted(set().union(*(r.keys() for r in history)))
    with (out/f"{name}.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, columns, lineterminator="\n")
        writer.writeheader(); writer.writerows(history)
    summary = dict(id=name, case=case, arm=arm, n=n, dt=dt, b=b, W=W, heat_D=heat_diffusivity(),
                   endpoint=end, initial=history[0], final=history[-1], snapshots=snapshot_times,
                   max_absolute_mass_error=max_mass_error, max_energy_inequality_defect=max_energy_defect,
                   numerical_retry_count=retries, accepted_steps=len(history)-1,
                   numerical_retry_ledger=retry_ledger,
                   active_area=grid.size*grid.dx**2,
                   input_feet=source["individual_feet"] if source else None,
                   film_never_claimed_dry_contact=True)
    return summary


def configs(include_ant=True):
    rows = [(case, arm, 64, 1e-4, .1, .5) for case in ("pair", "cross", "obstacle", "open_obstacle", "supply_off")
            for arm in ("frozen", "heat", "film")]
    rows += [("pair", "film", n, dt, b, W) for n, dt, b, W in
             [(32, 1e-4, .1, .5), (128, 1e-4, .1, .5), (64, 5e-5, .1, .5),
              (64, 2.5e-5, .1, .5), (128, 1e-4, .1, 2), (128, 1e-4, .05, .5)]]
    if include_ant:
        rows += [("ant", arm, 64, dt, .1, .5) for arm, dt in
                 [("frozen", 1e-4), ("heat", 1e-4), ("film", 1e-4), ("film", 5e-5)]]
    return rows


def preflight():
    rows = []
    for case, arm, n, dt, b, W in configs():
        if arm != "film":
            continue
        grid, full = initial_field(case, n, b)
        h = grid.pack(full)
        row = dict(case=case, n=n, dt=dt, b=b, W=W, dx=grid.dx,
                   contact_scale_cells=b/np.sqrt(3*W)*n,
                   **field_metrics(grid, h, h, b, W))
        assert row["physical_slope_upper_bound"] <= .2
        assert row["minimum_height"] >= b
        rows.append(row)
    value = dict(authority=AUTHORITY, prior_audio=PRIOR, heat_D=heat_diffusivity(), cases=rows,
                 note="N32 gap is coarse; no claim of merger-time convergence unless actual contours agree.")
    write_json(PACKAGE/"validation/preflight.json", value)
    print(json.dumps(dict(preflight="PASS", cases=len(rows), heat_D=heat_diffusivity())))


def main():
    global PACKAGE
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract-input", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--case", choices=["pair", "cross", "obstacle", "open_obstacle", "supply_off", "ant"])
    parser.add_argument("--no-ant", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.output:
        PACKAGE = args.output.resolve()
    if args.extract_input:
        extract_input(); return
    if args.preflight:
        preflight(); return
    rows = configs(not args.no_ant)
    summaries = []
    for spec in rows:
        if args.case and spec[0] != args.case:
            continue
        result = run_case(*spec)
        summaries.append(result)
        write_json(PACKAGE/"data"/(result["id"]+".json"), result)
        print(json.dumps(dict(id=result["id"], steps=result["accepted_steps"], retries=result["numerical_retry_count"],
                              mass_error=result["max_absolute_mass_error"], final_peak=result["final"]["maximum_height"])), flush=True)
    write_json(PACKAGE/"data/summary.json", dict(schema="ant-wet-film-first-probe-v1", authority=AUTHORITY,
                                          heat_D=heat_diffusivity(), runs=summaries))


if __name__ == "__main__":
    main()
