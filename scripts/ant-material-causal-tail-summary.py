#!/usr/bin/env python3
"""Summarize the causal-tail runner's JSON/CSV outputs using only the stdlib."""
import argparse
import csv
import json
import math
from pathlib import Path

SEEDS = (20261005, 20261006, 20261007)
AGES = (200, 350, 500)
ROOT = Path(__file__).resolve().parents[1]
LIMITS = {"numeric1e12": 1e-12, "position1e5": 1e-5, "speed1e5": 1e-5, "velocity1e5": 1e-5,
          "heading1e4": 1e-4, "displacement1e7": 1e-7}
EXPECTED_NATURAL = {
    20261005: (4264282984, 382305, 29),
    20261006: (131363990, 380712, 33),
    20261007: (2211568801, 375882, 38),
}


def number(row, name):
    if row is None:
        return None
    value = row.get(name, "")
    if value in (None, ""):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def differs(row):
    values = {"position": abs(number(row, "positionDifference") or 0),
              "speed": abs(number(row, "speedDifference") or 0),
              "velocity": abs(number(row, "velocityDifference") or 0),
              "heading": abs(number(row, "postHeadingDiff") or 0),
              "displacement": abs(number(row, "displacementDiff") or 0)}
    return values


def gait_phase(row, arm):
    raw = row.get(arm + "Gait")
    return json.loads(raw).get("phase") if raw else None


def threshold_stats(rows, threshold):
    active = []
    bout = []
    bouts = []
    previous_tick = None
    for row in rows:
        tick = int(row["tick"])
        values = differs(row)
        delta = max(values.values()) if threshold == "numeric1e12" else values[
            {"position1e5": "position", "speed1e5": "speed", "velocity1e5": "velocity", "heading1e4": "heading",
             "displacement1e7": "displacement"}[threshold]]
        if delta > LIMITS[threshold]:
            active.append(row)
            if bout and tick == previous_tick + 1:
                bout.append(row)
            else:
                if bout:
                    bouts.append((bout[0], bout[-1], len(bout)))
                bout = [row]
            previous_tick = tick
        else:
            if bout:
                bouts.append((bout[0], bout[-1], len(bout)))
                bout = []
            previous_tick = tick
    if bout:
        bouts.append((bout[0], bout[-1], len(bout)))
    return {"samplesAbove": len(active), "proportionAbove": len(active) / len(rows) if rows else 0,
            "boutCount": len(bouts), "longestContiguousBoutTicks": max((b[2] for b in bouts), default=0),
            "longestContiguousBoutSeconds": max((b[2] for b in bouts), default=0) / 60,
            "maxima": {name: max((differs(r)[name] for r in rows), default=0)
                       for name in ("position", "speed", "velocity", "heading", "displacement")},
            "firstAboveTimeSeconds": number(active[0], "timeSeconds") if active else None,
            "lastAboveTimeSeconds": number(active[-1], "timeSeconds") if active else None}


def load_csv(path):
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def summarize_case(seed, trial, rows, world_rows):
    age = trial["requestedAgeSeconds"]
    selected = [r for r in rows if int(r["requestedAgeSeconds"]) == age]
    sample = [r for r in selected if r.get("jointlyUnexposedAtEntry") == "true"
              and all(number(r, n) is not None for n in ("positionDifference", "speedDifference",
                  "velocityDifference", "postHeadingDiff", "displacementDiff"))]
    sample.sort(key=lambda r: int(r["tick"]))
    exit_time = trial.get("firstJointExitSeconds")
    times = [number(r, "timeSeconds") for r in sample]
    first = sample[0] if sample else None
    treatment_end = trial.get("treatmentEndSeconds")
    intervention_tick = round(treatment_end * 60) - 1 if treatment_end is not None else None
    intervention_row = next((r for r in selected if int(r["tick"]) == intervention_tick), None)
    metrics = {name: threshold_stats(sample, name) for name in LIMITS}
    for metric in metrics.values():
        for edge in ("firstAboveTimeSeconds", "lastAboveTimeSeconds"):
            t = metric[edge]
            metric[edge.replace("TimeSeconds", "ElapsedFromJointExitSeconds")] = (
                t - exit_time if t is not None and exit_time is not None else None)
    rng = trial.get("firstDivergence", {}).get("rng")
    rng_time = rng.get("timeSeconds") if rng else None
    pre_rng = [r for r in selected if rng_time is None or
               float(r["timeSeconds"]) + 1 / 60 < rng_time - 1e-9]
    pre_rng_joint = [r for r in pre_rng if r.get("jointlyUnexposedAtEntry") == "true"
                     and all(number(r, n) is not None for n in ("positionDifference", "speedDifference",
                         "velocityDifference", "postHeadingDiff", "displacementDiff"))]
    first_contact = next((r for r in selected if r.get("focalContactPayloadEqual") == "false"
                          or r.get("colonyContactPayloadEqual") == "false"), None)
    first_focal = next((r for r in selected if r.get("focalContactPayloadEqual") == "false"), None)
    first_colony = next((r for r in selected if r.get("colonyContactPayloadEqual") == "false"), None)
    first_occupancy = next((r for r in selected if r.get("occupancyEqual") == "false"), None)
    first_gait = next((r for r in selected if gait_phase(r, "control") != gait_phase(r, "treatment")), None)
    selection_time = trial.get("selectedAtSeconds")
    selection_row = next((r for r in selected if selection_time is not None and abs(float(r["timeSeconds"]) -
                            float(selection_time)) < 1e-9), None)
    selected_plate = (selection_row.get("controlTopId") or selection_row.get("treatmentTopId")) if selection_row else None
    reentries = []
    previous = {arm: (0, None) for arm in ("control", "treatment")}
    for r in selected:
        for arm in previous:
            layer = number(r, arm + "L") or 0
            top = r.get(arm + "TopId")
            was_layer, was_top = previous[arm]
            new_exposure = was_layer == 0 and layer > 0
            new_plate = layer > 0 and top and top != selected_plate and top != was_top
            is_selection_tick = selection_time is not None and number(r, "timeSeconds") <= selection_time
            if (new_exposure or new_plate) and not is_selection_tick:
                movement = abs(number(r, "positionDifference") or 0)
                reentries.append({"arm": arm, "timeSeconds": number(r, "timeSeconds"), "layerCount": layer,
                                  "transition": "zero-to-positive" if new_exposure else "new-top-plate",
                                  "topPlateId": top, "earlierSelectedTopPlateId": selected_plate,
                                  "positionDifference": movement, "movementDifferenceAtLeast1e5": movement >= 1e-5,
                                  "afterJointExit": exit_time is not None and number(r, "timeSeconds") >= exit_time,
                                  "interpretation": "later direct exposure input"})
            previous[arm] = (layer, top)
    branch_world = [r for r in world_rows if r.get("branch") in (f"{age}-control", f"{age}-treatment")]
    last_world = {}
    for row in branch_world:
        last_world[row["branch"]] = row
    branch = trial.get("branchProbes") or {}
    return {"seed": seed, "requestedAgeSeconds": age, "selectedAtSeconds": trial.get("selectedAtSeconds"),
            "focalAntId": trial.get("focalAntId"), "selectedLayerCount": trial.get("selectedL"),
            "initialContinuousExposureSeconds": trial.get("initialExposureSeconds"),
            "selectedTopPlateId": selected_plate, "intervention": trial.get("intervention"),
            "treatmentEndSeconds": trial.get("treatmentEndSeconds"),
            "firstControlExitSeconds": trial.get("firstControlExitSeconds"),
            "firstTreatmentExitSeconds": trial.get("firstTreatmentExitSeconds"),
            "firstJointExitSeconds": exit_time, "rightCensor": trial.get("rightCensored"),
            "jointOffBoutCount": trial.get("jointOffBoutCount"), "jointReentries": trial.get("jointReentries"),
            "jointlyUnexposed": {"samples": len(sample), "firstActualTimeSeconds": times[0] if times else None,
                "lastActualTimeSeconds": times[-1] if times else None,
                "firstElapsedFromJointExitSeconds": times[0] - exit_time if times and exit_time is not None else None,
                "lastElapsedFromJointExitSeconds": times[-1] - exit_time if times and exit_time is not None else None,
                "thresholds": metrics},
            "firstStep": {k: number(intervention_row, k) for k in ("postXDiff", "postYDiff", "postVxDiff",
                "postVyDiff", "postHeadingDiff", "positionDifference", "speedDifference",
                "velocityDifference", "displacementDiff")} if intervention_row else None,
            "firstMaterialDivergence": trial.get("firstDivergence", {}).get("material"),
            "contactDivergence": {"focalFirstTimeSeconds": number(first_focal, "timeSeconds") if first_focal else None,
                "colonyFirstTimeSeconds": number(first_colony, "timeSeconds") if first_colony else None,
                "focalHashEqualAtFirstColonyDifference": first_contact.get("focalContactPayloadEqual") if first_contact else None,
                "colonyHashes": {"control": first_contact.get("controlColonyContactPayloadHash"),
                    "treatment": first_contact.get("treatmentColonyContactPayloadHash")} if first_contact else None},
            "firstOccupancyDifference": {"timeSeconds": number(first_occupancy, "timeSeconds"),
                "control": json.loads(first_occupancy["controlOccupancy"]),
                "treatment": json.loads(first_occupancy["treatmentOccupancy"])} if first_occupancy else None,
            "firstGaitPhaseDifference": {"timeSeconds": number(first_gait, "timeSeconds"),
                "controlPhase": gait_phase(first_gait, "control"),
                "treatmentPhase": gait_phase(first_gait, "treatment")}
                if first_gait else None,
            "firstRngDivergence": rng,
            "differencesBeforeRngDivergence": {"rows": len(pre_rng),
                "maxPosition": max((abs(number(r, "positionDifference") or 0) for r in pre_rng), default=0),
                "maxHeading": max((abs(number(r, "postHeadingDiff") or 0) for r in pre_rng), default=0),
                "focalContactDifference": any(r.get("focalContactPayloadEqual") == "false" for r in pre_rng),
                "colonyContactDifference": any(r.get("colonyContactPayloadEqual") == "false" for r in pre_rng),
                "jointlyUnexposedRows": len(pre_rng_joint),
                "jointlyUnexposedThresholds": {name: threshold_stats(pre_rng_joint, name) for name in LIMITS}},
            "laterExposureTopPlateChanges": reentries,
            "lastWorldRowsAt600Seconds": last_world,
            "branchProbes": branch}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="runner data directory")
    parser.add_argument("--output", type=Path, default=ROOT / "docs/ant/evidence/2026-10-12-material-causal-tail/measurements.json")
    args = parser.parse_args()
    source = args.input.resolve()
    output = args.output.resolve()
    if output.exists():
        raise SystemExit(f"refusing to overwrite {output}")
    trial_data = json.loads((source / "trials.json").read_text(encoding="utf-8"))
    natural_expected = json.loads((ROOT / "docs/ant/evidence/2026-10-12-material-causal-tail/unobserved-natural-replay.json").read_text(encoding="utf-8"))
    expected = {r["seed"]: r for r in natural_expected["results"]}
    cases = []
    for run in trial_data["runs"]:
        seed = run["seed"]
        if seed in EXPECTED_NATURAL:
            natural = run["naturalOn"]
            baseline = expected[seed]
            assert (natural["rngState"], natural["rngCalls"], natural["plateCount"]) == EXPECTED_NATURAL[seed]
            assert (natural["rngState"], natural["rngCalls"], natural["population"], natural["totalSpawned"],
                    natural["totalRetired"], natural["contactPoints"], natural["plateCount"], natural["noduleCount"]) == (
                    baseline["rngState"], baseline["rngCalls"], baseline["population"], baseline["spawned"],
                    baseline["retired"], baseline["contacts"], baseline["plateCount"], baseline["noduleCount"])
            assert (natural["pheromoneSha256"], natural["surfaceSha256"], natural["agentsJsonSha256"]) == (
                baseline["pheromoneSha256"], baseline["surfaceSha256"], baseline["agentsJsonSha256"])
        focal = load_csv(source / f"seed-{seed}-focal-ticks.csv")
        world = load_csv(source / f"seed-{seed}-world-seconds.csv")
        assert len(run["trials"]) == len(AGES)
        cases.extend(summarize_case(seed, trial, focal, world) for trial in run["trials"])
    assert {(c["seed"], c["requestedAgeSeconds"]) for c in cases} == {(s, a) for s in SEEDS for a in AGES}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"interpretation": "Descriptive measurements and conditions only; no memory or sufficiency claim.",
                                  "cases": cases}, indent=2) + "\n", encoding="utf-8")


def _self_check():
    rows = [{"tick": str(t), "positionDifference": str(v), "speedDifference": "0",
             "velocityDifference": "0", "postHeadingDiff": "0", "displacementDiff": "0",
             "timeSeconds": str(t / 60)}
            for t, v in ((0, 2e-5), (1, 2e-5), (3, 2e-5), (4, 0), (5, 2e-5))]
    result = threshold_stats(rows, "position1e5")
    assert (result["samplesAbove"], result["boutCount"], result["longestContiguousBoutTicks"]) == (4, 3, 2)
    assert result["firstAboveTimeSeconds"] == 0 and result["lastAboveTimeSeconds"] == 5 / 60
    assert number(None, "timeSeconds") is None


if __name__ == "__main__":
    _self_check()
    main()
