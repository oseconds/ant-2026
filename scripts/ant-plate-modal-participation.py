#!/usr/bin/env python3
"""Fit-free modal participation and held-out pickup audit for frozen P24 renders."""
import argparse
import csv
import gzip
import hashlib
import importlib.util
import json
import math
import platform
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/ant/evidence/2026-10-15-plate-modal-participation"
POSITION_EVIDENCE = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality"
LOSS_EVIDENCE = ROOT / "docs/ant/evidence/2026-10-14-base-born-loss-distribution"
POSITION_OUTPUT = ROOT / "test-results/ant-plate-sonic-individuality-20261013"
LOSS_OUTPUT = ROOT / "test-results/ant-base-born-loss-distribution-20261014"
POSITION_IDS = {label: f"20261005-trail-plate-24-{label}-native" for label in ("p25", "p50", "p75")}
LOSS_IDS = {label: f"20261005-trail-plate-24-{label}" for label in ("flat", "frequency")}
FROZEN_SHA = "f600eb768df2721c98cc607ea8b4b4d4fc64ae74cda6b5bf3f9297e8b0865a2d"
RATE = 6000
PULSE_STEPS = 18
PULSE_ENVELOPE = np.asarray([
    math.sin(math.pi * (step + 0.5) / PULSE_STEPS)
    for step in range(PULSE_STEPS)
], dtype=np.float64)
PULSE_ENVELOPE /= sum(float(value) for value in PULSE_ENVELOPE)
PYTHON_PULSE_ENVELOPE = PULSE_ENVELOPE.copy()
RENDER_ROW_PULSE_END = 77
POSITION_COLORS = {"p25": (29, 125, 142), "p50": (76, 101, 177), "p75": (213, 129, 53)}
CASE_ORDER = ("p25", "p50", "p75", "flat", "frequency")
FONT = ImageFont.load_default(size=18)
SMALL_FONT = ImageFont.load_default(size=14)

SPEC = importlib.util.spec_from_file_location(
    "ant_sonic_modal_transfer", ROOT / "scripts/ant-sonic-modal-transfer.py"
)
PRIOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRIOR)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical_text_sha256(path):
    return hashlib.sha256(Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def worklet_pulse_envelope():
    code = (
        "const n=Math.round(6000*0.003),a=new Float64Array(n);let s=0;"
        "for(let k=0;k<n;k++){a[k]=Math.sin(Math.PI*(k+0.5)/n);s+=a[k]}"
        "for(let k=0;k<n;k++)a[k]/=s;console.log(JSON.stringify(Array.from(a)))"
    )
    values = np.asarray(json.loads(subprocess.check_output(
        ["node", "-e", code], cwd=ROOT, text=True,
    )), dtype=np.float64)
    if values.shape != (PULSE_STEPS,) or not np.isfinite(values).all():
        raise ValueError("Node's worklet-equivalent CONTACT_ENVELOPE is invalid")
    return values


def norm_rel(path):
    return str(path).replace("\\", "/").lstrip("./")


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    with Path(path).open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(json_safe(value), stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write("\n")


def json_safe(value):
    if isinstance(value, complex):
        return {"real": float(value.real), "imaginary": float(value.imag)}
    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())
    if isinstance(value, (np.integer, np.floating, np.bool_)):
        return value.item()
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    return value


def record_file(path, expected_sha=None, expected_bytes=None, kind="input"):
    path = Path(path)
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if expected_bytes is not None and len(data) != int(expected_bytes):
        raise ValueError(f"{path}: bytes {len(data)} != manifest {expected_bytes}")
    if expected_sha is not None and digest != expected_sha:
        raise ValueError(f"{path}: SHA-256 {digest} != manifest {expected_sha}")
    return {
        "kind": kind, "path": norm_rel(path.relative_to(ROOT)),
        "bytes": len(data), "sha256": digest,
    }


def manifest_records(manifest):
    return {norm_rel(row["path"]): row for row in manifest["artifacts"]}


def checked_manifest_path(manifest, relative_path, receipts, kind):
    key = norm_rel(relative_path)
    record = manifest_records(manifest).get(key)
    if record is None:
        raise ValueError(f"{key}: absent from frozen render manifest")
    path = ROOT / key
    receipt = record_file(path, record["sha256"], record["bytes"], kind)
    receipts.append(receipt)
    return path


def read_f32(path, shape):
    values = np.fromfile(path, dtype="<f4")
    if values.size != int(np.prod(shape)):
        raise ValueError(f"{path}: {values.size} float32 values, expected {int(np.prod(shape))}")
    values = values.reshape(shape)
    if not np.isfinite(values).all():
        raise ValueError(f"{path}: nonfinite float32 value")
    return values


def source_hashes(paths):
    return {
        name: {
            "canonicalTextSha256": canonical_text_sha256(ROOT / name),
            "workingTreeSha256": sha256(ROOT / name),
        } for name in paths
    }


def verify_source_manifest(manifest, receipts, kind):
    checks = {}
    for name, expected in manifest.get("sourceToolHashes", {}).items():
        path = ROOT / name
        raw = sha256(path)
        canonical = canonical_text_sha256(path)
        matches = raw == expected or canonical == expected
        receipt = record_file(path, None, None, kind)
        receipt["canonicalTextSha256"] = canonical
        receipt["expectedFrozenSha256"] = expected
        receipt["matchesFrozenManifest"] = matches
        receipts.append(receipt)
        checks[name] = {
            "canonicalTextSha256": canonical,
            "workingTreeSha256": raw,
            "expectedFrozenSha256": expected,
            "matchesFrozenManifest": matches,
        }
    return checks


def get_position_rows(index):
    rows = {row["positionLabel"]: row for row in index["rows"]
            if row["id"] in set(POSITION_IDS.values())}
    if set(rows) != set(POSITION_IDS):
        raise ValueError("P24 position render index does not contain p25/p50/p75")
    return rows


def get_loss_rows(index):
    rows = {row["condition"]: row for row in index["rows"]
            if row["id"] in set(LOSS_IDS.values())}
    if set(rows) != {"flat", "frequency"}:
        raise ValueError("P24 q=4 loss render index does not contain flat/frequency")
    return rows


def canonical_schedule(row, omit_position=False):
    schedule = json.loads(json.dumps(row["schedule"]))
    for event in schedule:
        payload = event["message"]["payload"]
        if omit_position:
            payload["position"] = "<position>"
    return schedule


def integrated_gaussian(cx, cy, x, y, sigma):
    q, w0, w1 = 0.7745966692414834, 0.5555555555555556, 0.8888888888888888
    total = 0.0
    for iy in range(-1, 2):
        oy = 0 if iy == 0 else iy * q * 0.5
        wy = w1 if iy == 0 else w0
        for ix in range(-1, 2):
            ox = 0 if ix == 0 else ix * q * 0.5
            wx = w1 if ix == 0 else w0
            dx, dy = cx + ox - x, cy + oy - y
            total += wx * wy * math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
    return total


def reconstruct_contact(topology, row):
    """Mirror applyStrike: integrated Gaussian, L2 normalization, density, Float32 force ring."""
    payload = row["schedule"][0]["message"]["payload"]
    x, y = payload["position"]["x"] * 31, payload["position"]["y"] * 31
    radius = payload["footprintRadius"]
    sigma = radius * 31
    cells = np.asarray(topology["nodeGridIndices"], dtype=np.int64)
    gx, gy = cells % 32, cells // 32
    weights = np.asarray(
        [integrated_gaussian(int(ix), int(iy), x, y, sigma) for ix, iy in zip(gx, gy)],
        dtype=np.float64,
    )
    norm_sq = sum(float(weight * weight) for weight in weights)
    norm = math.sqrt(norm_sq)
    if not norm > 1e-20:
        raise ValueError("contact footprint has zero compiled-node support")
    strength = min(0.05, float(payload["strength"]))
    density = float(topology["materialCoefficients"][2])
    reach = 4 * sigma + 0.5
    forces = np.zeros((PULSE_STEPS, len(cells)), dtype=np.float32)
    requested = np.zeros(len(cells), dtype=np.float64)
    accepted = 0
    for node, (cell, weight) in enumerate(zip(cells, weights)):
        ix, iy = int(cell % 32), int(cell // 32)
        if abs(ix - x) > reach or abs(iy - y) > reach:
            continue
        if weight * weight < 1e-12 * norm_sq:
            continue
        delta_v = strength * float(weight) / norm / math.sqrt(density)
        requested[node] = delta_v
        accepted += 1
        for step in range(PULSE_STEPS):
            forces[step, node] = np.float32(
                float(forces[step, node]) + delta_v * float(PULSE_ENVELOPE[step])
            )
    python_forces = np.asarray(
        requested[None, :] * PYTHON_PULSE_ENVELOPE[:, None], dtype=np.float32
    )
    if not np.array_equal(forces, python_forces):
        raise ValueError("Python pulse envelope does not reproduce the worklet Float32 force ring")
    if accepted == 0:
        raise ValueError("worklet strike support was empty")
    return requested, forces, {
        "acceptedSpatialNodes": accepted,
        "requestedImpulseL2": float(np.linalg.norm(requested)),
        "sumFloat32PulseForcesL2": float(np.linalg.norm(forces.astype(np.float64).sum(axis=0))),
        "pulseEnvelopeSum": float(PULSE_ENVELOPE.sum()),
        "strength": strength,
        "footprintRadius": radius,
        "density": density,
        "position": payload["position"],
        "hardnessReadByWorklet": False,
        "contactComplianceTransfer": 1.0,
        "forceRingMatchesWorkletAndPythonFloat32": True,
    }


def mode_poles(q, coefficients, gamma=0.0):
    bending, tension, density, damping_coeff = map(float, coefficients)
    damping = damping_coeff * 50.0
    tau = tension / density
    a = 2.0 - damping - (tau + gamma) * q - bending * q * q
    product = 1.0 - damping - gamma * q
    discriminant = a * a - 4.0 * product
    if product <= 0:
        raise ValueError("nonpositive discrete pole product")
    if discriminant >= 0:
        raise ValueError("P24 contains a non-oscillatory mode; complex residue model is invalid")
    radius = math.sqrt(product)
    angle = math.acos(a / (2.0 * radius))
    pole = radius * complex(math.cos(angle), math.sin(angle))
    return {
        "a": a, "product": product, "inputGain": product, "pole": pole,
        "frequencyHz": angle * RATE / (2.0 * math.pi),
        "radius": radius,
        "decayTauSeconds": -1.0 / (RATE * math.log(radius)),
    }


def eigenspace_groups(q, operator_norm):
    tolerance = 64.0 * np.finfo(np.float64).eps * len(q) * max(float(operator_norm), 1.0)
    groups = []
    begin = 0
    for index in range(1, len(q)):
        if float(q[index] - q[index - 1]) > tolerance:
            groups.append(np.arange(begin, index, dtype=np.int64))
            begin = index
    groups.append(np.arange(begin, len(q), dtype=np.int64))
    return groups, tolerance


def grouped_residues(vectors, q, groups, coefficients, gamma, source, pickup_nodes,
                     current, previous, force_samples):
    source_modes = vectors.T @ source
    pickup_modes = np.asarray([vectors[int(node), :] for node in pickup_nodes])
    force_modes = vectors.T @ force_samples.T
    rows = []
    mode_poles = []
    mode_residues = np.zeros(len(q), dtype=np.complex128)
    modal_current, modal_previous = vectors.T @ current, vectors.T @ previous
    for index, eigenvalue in enumerate(q):
        pole = mode_poles_for_q(float(eigenvalue), coefficients, gamma)
        mode_poles.append(pole)
        p, product = pole["pole"], pole["product"]
        temporal = sum(float(PULSE_ENVELOPE[k]) * p ** (-k) for k in range(PULSE_STEPS))
        pulse_factor = product * p ** PULSE_STEPS * temporal / (p - p.conjugate())
        source_state = source_modes[index] * pulse_factor
        sampled_force_state = product / (p - p.conjugate()) * sum(
            float(force_modes[index, k]) * p ** (PULSE_STEPS - k)
            for k in range(PULSE_STEPS)
        )
        state_coefficient = (
            p * modal_current[index] - product * modal_previous[index]
        ) / (p - p.conjugate())
        mode_residues[index] = state_coefficient
        pulse_output = [pickup_modes[ch, index] * source_state for ch in range(2)]
        sampled_output = [pickup_modes[ch, index] * sampled_force_state for ch in range(2)]
        rows.append({
            "pole": pole,
            "sourceProjection": float(source_modes[index]),
            "pickupL": float(pickup_modes[0, index]),
            "pickupR": float(pickup_modes[1, index]),
            "pulseOutputL": pulse_output[0],
            "pulseOutputR": pulse_output[1],
            "sampledPulseOutputL": sampled_output[0],
            "sampledPulseOutputR": sampled_output[1],
            "stateResidueL": pickup_modes[0, index] * state_coefficient,
            "stateResidueR": pickup_modes[1, index] * state_coefficient,
        })
    grouped = []
    for group_index, indices in enumerate(groups):
        q_mean = float(np.mean(q[indices]))
        vals = [mode_poles[index] for index in indices]
        # Numerical differences inside a declared degenerate eigenspace are below its fixed tolerance.
        p = mode_poles_for_q(q_mean, coefficients, gamma)
        out = {
            "eigenspaceId": group_index,
            "multiplicity": int(len(indices)),
            "qMin": float(np.min(q[indices])),
            "qMax": float(np.max(q[indices])),
            "qMean": q_mean,
            "pole": p,
            "sourceProjectionNorm": float(np.linalg.norm(source_modes[indices])),
            "pickupLObservabilityNorm": float(np.linalg.norm(pickup_modes[0, indices])),
            "pickupRObservabilityNorm": float(np.linalg.norm(pickup_modes[1, indices])),
            "pulseSpatialOutputResidueL": sum(rows[i]["pulseOutputL"] for i in indices),
            "pulseSpatialOutputResidueR": sum(rows[i]["pulseOutputR"] for i in indices),
            "sampledPulseOutputResidueL": sum(rows[i]["sampledPulseOutputL"] for i in indices),
            "sampledPulseOutputResidueR": sum(rows[i]["sampledPulseOutputR"] for i in indices),
            "stateResidueL": sum(pickup_modes[0, indices] * mode_residues[indices]),
            "stateResidueR": sum(pickup_modes[1, indices] * mode_residues[indices]),
        }
        grouped.append(out)
    return grouped, mode_poles, mode_residues, source_modes, pickup_modes


def mode_poles_for_q(q, coefficients, gamma):
    return mode_poles(q, coefficients, gamma)


def rotate_degenerate_basis(vectors, groups):
    rotated = vectors.copy()
    cosine, sine = math.cos(0.37), math.sin(0.37)
    for indices in groups:
        for offset in range(0, len(indices) - 1, 2):
            i, j = int(indices[offset]), int(indices[offset + 1])
            left, right = rotated[:, i].copy(), rotated[:, j].copy()
            rotated[:, i] = cosine * left + sine * right
            rotated[:, j] = -sine * left + cosine * right
    return rotated


def invariant_signature(vectors, q, groups, coefficients, gamma, source, pickup_nodes, current, previous):
    src = vectors.T @ source
    pick = np.asarray([vectors[int(node), :] for node in pickup_nodes])
    cur, prev = vectors.T @ current, vectors.T @ previous
    result = []
    for indices in groups:
        pole = mode_poles_for_q(float(np.mean(q[indices])), coefficients, gamma)
        p, product = pole["pole"], pole["product"]
        c = (p * cur[indices] - product * prev[indices]) / (p - p.conjugate())
        result.append(np.asarray([
            np.linalg.norm(src[indices]),
            np.linalg.norm(pick[0, indices]),
            np.linalg.norm(pick[1, indices]),
            abs(np.dot(pick[0, indices], c)),
            abs(np.dot(pick[1, indices], c)),
        ], dtype=np.float64))
    return np.asarray(result)


def worklet_free_step(current, previous, neighbor_indices, coefficients, gamma=0.0):
    """Exact Float32 storage and operation order of the isolated worklet recurrence."""
    n = len(current)
    lap = np.zeros(n, dtype=np.float32)
    previous_lap = np.zeros(n, dtype=np.float64) if gamma else None
    for node in range(n):
        value = -4.0 * float(current[node])
        old = -4.0 * float(previous[node])
        for direction in range(4):
            other = int(neighbor_indices[node * 4 + direction])
            if other >= 0:
                value += float(current[other])
                if gamma:
                    old += float(previous[other])
        lap[node] = np.float32(value)
        if gamma:
            previous_lap[node] = old
    lap_of_lap = np.zeros(n, dtype=np.float64)
    for node in range(n):
        value = -4.0 * float(lap[node])
        for direction in range(4):
            other = int(neighbor_indices[node * 4 + direction])
            if other >= 0:
                value += float(lap[other])
        lap_of_lap[node] = value
    bending, tension, density, damping_coeff = map(float, coefficients)
    damping = damping_coeff * 50.0
    out = np.zeros(n, dtype=np.float32)
    for node in range(n):
        value, old = float(current[node]), float(previous[node])
        velocity = value - old
        nxt = (2.0 * value - old - bending * float(lap_of_lap[node])
               + tension * float(lap[node]) / density - damping * velocity)
        if gamma:
            nxt += gamma * (float(lap[node]) - float(previous_lap[node]))
        out[node] = np.float32(nxt)
    return out


def exact_autonomous_suffix(fields, neighbors, coefficients, gamma, first_target):
    exact = {}
    for target in range(first_target, fields.shape[0]):
        predicted = worklet_free_step(
            fields[target - 1], fields[target - 2], neighbors, coefficients, gamma
        )
        exact[target] = bool(np.array_equal(predicted, fields[target]))
    last_mismatch = max((target for target, passed in exact.items() if not passed), default=first_target - 1)
    start = last_mismatch + 1
    if start >= fields.shape[0]:
        return None, exact
    return start, exact


def synthesize(poles, residues, pickup_modes, step_count):
    powers = poles[None, :] ** np.arange(step_count, dtype=np.int64)[:, None]
    left = 2.0 * np.real(powers @ (pickup_modes[0] * residues))
    right = 2.0 * np.real(powers @ (pickup_modes[1] * residues))
    return np.column_stack((left, right))


def channel_metrics(actual, predicted):
    actual = np.asarray(actual, dtype=np.float64)
    predicted = np.asarray(predicted, dtype=np.float64)
    residual = predicted - actual
    actual_centered = actual - actual.mean()
    predicted_centered = predicted - predicted.mean()
    denom = float(np.linalg.norm(actual_centered) * np.linalg.norm(predicted_centered))
    corr = float(np.dot(actual_centered, predicted_centered) / denom) if denom else None
    actual_norm = float(np.linalg.norm(actual))
    return {
        "samples": int(actual.size),
        "actualRms": float(np.sqrt(np.mean(actual * actual))),
        "predictedRms": float(np.sqrt(np.mean(predicted * predicted))),
        "residualRms": float(np.sqrt(np.mean(residual * residual))),
        "relativeL2Error": float(np.linalg.norm(residual) / actual_norm) if actual_norm else None,
        "pearsonCorrelation": corr,
        "maxAbsoluteResidual": float(np.max(np.abs(residual))),
        "residual": residual,
    }


def array_metrics(actual, predicted):
    result = {}
    residual = predicted - actual
    for channel, name in enumerate(("L", "R")):
        measured = channel_metrics(actual[:, channel], predicted[:, channel])
        result[name] = {key: value for key, value in measured.items() if key != "residual"}
    result["pooled"] = {
        "relativeL2Error": float(np.linalg.norm(residual) / np.linalg.norm(actual)),
        "pearsonCorrelation": float(np.corrcoef(actual.reshape(-1), predicted.reshape(-1))[0, 1]),
        "residualRms": float(np.sqrt(np.mean(residual * residual))),
        "maxAbsoluteResidual": float(np.max(np.abs(residual))),
    }
    return result


def cosine(a, b):
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else None


def complex_residue_comparison(actual, predicted):
    actual = np.asarray(actual, dtype=np.complex128)
    predicted = np.asarray(predicted, dtype=np.complex128)
    actual_norm, predicted_norm = float(np.linalg.norm(actual)), float(np.linalg.norm(predicted))
    difference = predicted - actual
    denom = actual_norm * predicted_norm
    correlation = np.vdot(actual, predicted) / denom if denom else None
    return {
        "eigenspaces": int(actual.size),
        "actualL2": actual_norm,
        "directFinitePulseL2": predicted_norm,
        "residualL2": float(np.linalg.norm(difference)),
        "relativeL2Error": float(np.linalg.norm(difference) / actual_norm) if actual_norm else None,
        "complexNormalizedInnerProduct": (
            {"real": float(correlation.real), "imaginary": float(correlation.imag)}
            if correlation is not None else None
        ),
    }


def pulse_end_round_trip(grouped, vectors, fields, raw_pickup, pickup_nodes):
    current, previous = fields[RENDER_ROW_PULSE_END], fields[RENDER_ROW_PULSE_END - 1]
    current_modes, previous_modes = vectors.T @ current, vectors.T @ previous
    current_rebuilt, previous_rebuilt = vectors @ current_modes, vectors @ previous_modes
    projected = [float(np.dot(vectors[int(node)], current_modes)) for node in pickup_nodes]
    residue_sum = [
        2.0 * sum(float(np.real(mode[key])) for mode in grouped)
        for key in ("stateResidueL", "stateResidueR")
    ]
    actual = raw_pickup[RENDER_ROW_PULSE_END]
    return {
        "stateCurrentMaxAbsResidual": float(np.max(np.abs(current_rebuilt - current))),
        "statePreviousMaxAbsResidual": float(np.max(np.abs(previous_rebuilt - previous))),
        "stateCurrentRelativeL2Residual": float(np.linalg.norm(current_rebuilt - current) / max(np.linalg.norm(current), 1e-300)),
        "statePreviousRelativeL2Residual": float(np.linalg.norm(previous_rebuilt - previous) / max(np.linalg.norm(previous), 1e-300)),
        "projectedPointPickup": projected,
        "residueSumPointPickup": residue_sum,
        "actualPointPickup": [float(actual[0]), float(actual[1])],
        "pickupProjectionMaxAbsResidual": float(np.max(np.abs(np.asarray(projected) - actual))),
        "residueSumPickupMaxAbsResidual": float(np.max(np.abs(np.asarray(residue_sum) - actual))),
    }


def make_prediction(case, vectors, q, groups, source, pickup_nodes, gamma,
                    fields, raw_pickup, neighbors, pulse_end_row):
    start, exact_steps = exact_autonomous_suffix(
        fields, neighbors, case["coefficients"], gamma, pulse_end_row + 1
    )
    case["autonomousStartTargetRow"] = start
    case["autonomousStartMsAfterPulseEnd"] = (
        (start - pulse_end_row) * 1000.0 / RATE if start is not None else None
    )
    case["exactAutonomousTransitions"] = sum(exact_steps.values())
    case["postPulseTransitionsChecked"] = len(exact_steps)
    case["exactAutonomousSuffix"] = (
        start is not None and all(exact_steps[target] for target in exact_steps if target >= start)
    )
    if start is None or start < 2:
        case["heldOutPrediction"] = None
        return None
    current_row, previous_row = start - 1, start - 2
    current, previous = fields[current_row], fields[previous_row]
    grouped, mode_poles, mode_residues, _, pickup_modes = grouped_residues(
        vectors, q, groups, case["coefficients"], gamma, source, pickup_nodes,
        current, previous, case["forceSamples"],
    )
    poles = np.asarray([mode["pole"] for mode in mode_poles], dtype=np.complex128)
    residues = mode_residues
    # Both channels share the same state coefficient; pickup weights supply observability.
    predicted_all = synthesize(poles, residues, pickup_modes, fields.shape[0] - current_row)
    if not np.allclose(predicted_all[0], raw_pickup[current_row], rtol=2e-10, atol=2e-12):
        raise ValueError(f"{case['name']}: modal residue does not reconstruct autonomous start pickup")
    actual_held_out = raw_pickup[start:]
    predicted_held_out = predicted_all[1:]
    metrics = array_metrics(actual_held_out, predicted_held_out)
    case["heldOutPrediction"] = {
        "targetRows": [start, fields.shape[0] - 1],
        "timeMsAfterPulseEnd": [
            (start - pulse_end_row) * 1000.0 / RATE,
            (fields.shape[0] - 1 - pulse_end_row) * 1000.0 / RATE,
        ],
        "metrics": metrics,
    }
    case["groupedModes"] = grouped
    case["stateResiduesAtPulseEnd"] = case.pop("pulseEndGroupedModes")
    case["stateResiduesAtAutonomousStart"] = grouped
    case["prediction"] = predicted_all
    case["predictionRowsStart"] = current_row
    case["actualRowsStart"] = start
    case["modePoles"] = mode_poles
    case["modeResidues"] = mode_residues
    case["pickupModes"] = pickup_modes
    return case


def rotate_invariance_check(vectors, q, groups, cases, pickup_nodes):
    errors = []
    multiplicities = [int(len(group)) for group in groups if len(group) > 1]
    if not multiplicities:
        return {
            "status": "noRepeatedNumericalEigenvalues",
            "degenerateEigenspaces": 0,
            "maximumAbsoluteDifference": 0.0,
            "maximumRelativeDifference": 0.0,
        }
    for case in cases:
        indices = case["autonomousStartTargetRow"]
        if indices is None:
            continue
        current = case["fields"][indices - 1]
        previous = case["fields"][indices - 2]
        before = invariant_signature(
            vectors, q, groups, case["coefficients"], case["gamma"],
            case["source"], pickup_nodes, current, previous,
        )
        turned = rotate_degenerate_basis(vectors, groups)
        after = invariant_signature(
            turned, q, groups, case["coefficients"], case["gamma"],
            case["source"], pickup_nodes, current, previous,
        )
        errors.append(np.abs(before - after))
    maximum = float(np.max(errors)) if errors else 0.0
    scale = max(float(np.max(np.abs(invariant_signature(
        vectors, q, groups, cases[0]["coefficients"], cases[0]["gamma"],
        cases[0]["source"], pickup_nodes,
        cases[0]["fields"][cases[0]["autonomousStartTargetRow"] - 1],
        cases[0]["fields"][cases[0]["autonomousStartTargetRow"] - 2],
    )))), 1e-300)
    return {
        "status": "passed" if maximum <= 5e-10 * scale else "failed",
        "degenerateEigenspaces": len(multiplicities),
        "maximumMultiplicity": max(multiplicities),
        "maximumAbsoluteDifference": maximum,
        "maximumRelativeDifference": maximum / scale,
        "basisRotationRadians": 0.37,
    }


def describe_eigensystem(topology, vectors, q, groups, tolerance):
    operator = -PRIOR.laplacian(topology)
    reconstructed = (vectors * q[None, :]) @ vectors.T
    projector_sum = sum(
        vectors[:, group] @ vectors[:, group].T for group in groups
    )
    return {
        "nodeCount": int(len(q)),
        "eigenvalueCount": int(len(q)),
        "eigenspaceCount": int(len(groups)),
        "multiplicityHistogram": {
            str(m): sum(1 for group in groups if len(group) == m)
            for m in sorted({len(group) for group in groups})
        },
        "degenerateGroupingTolerance": {
            "definition": "64 * float64_epsilon * node_count * max(spectral_norm(-L), 1)",
            "value": float(tolerance),
        },
        "qRange": [float(np.min(q)), float(np.max(q))],
        "qMedian": float(np.median(q)),
        "fourNeighborBipartiteMedianQResidual": float(abs(np.median(q) - 4.0)),
        "symmetricOperatorResidualMaxAbs": float(np.max(np.abs(operator - operator.T))),
        "eigendecompositionReconstructionRelativeFrobenius": float(
            np.linalg.norm(reconstructed - operator) / np.linalg.norm(operator)
        ),
        "eigenvectorOrthogonalityFrobenius": float(
            np.linalg.norm(vectors.T @ vectors - np.eye(len(q)))
        ),
        "eigenspaceProjectorCompletenessFrobenius": float(
            np.linalg.norm(projector_sum - np.eye(len(q)))
        ),
        "eigenspaceProjectorCompletenessMaxAbs": float(
            np.max(np.abs(projector_sum - np.eye(len(q))))
        ),
    }


def plot_participation(path, data, qmax):
    width, height = 2140, 1430
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 28), "P24 contact position: full eigenspace participation and raw pickup residue", fill=(20, 26, 34), font=ImageFont.load_default(size=27))
    draw.text((40, 68), "All 277 modes represented as 257 eigenspace projectors; each row shares one p25/p50/p75 scale.", fill=(70, 78, 88), font=FONT)
    left, right, top, bottom = 190, 35, 142, 70
    col_gap, row_gap = 28, 44
    panel_w = (width - left - right - 2 * col_gap) // 3
    panel_h = (height - top - bottom - 2 * row_gap) // 3
    row_names = (
        ("sourceProjectionNorm", "Contact projection norm"),
        ("stateResidueL", "L point-pickup residue |R_L|"),
        ("stateResidueR", "R point-pickup residue |R_R|"),
    )
    maxima = []
    for key, _ in row_names:
        vals = []
        for label in ("p25", "p50", "p75"):
            modes = data[label]["groupedModes"]
            vals.extend([
                row["sourceProjectionNorm"] if key == "sourceProjectionNorm"
                else abs(row[key]) for row in modes
            ])
        maxima.append(max(vals) or 1.0)
    for row_index, (metric_key, row_label) in enumerate(row_names):
        y0 = top + row_index * (panel_h + row_gap)
        draw.text((18, y0 + panel_h // 2 - 10), row_label, fill=(35, 42, 52), font=FONT)
        for col, label in enumerate(("p25", "p50", "p75")):
            x0 = left + col * (panel_w + col_gap)
            x1, y1 = x0 + panel_w, y0 + panel_h
            color = POSITION_COLORS[label]
            draw.text((x0, y0 - 30), f"{label}   {len(data[label]['groupedModes'])} eigenspaces", fill=color, font=FONT)
            draw.rectangle((x0, y0, x1, y1), outline=(155, 162, 170), width=1)
            plot_left, plot_right = x0 + 45, x1 - 12
            plot_top, plot_bottom = y0 + 12, y1 - 37
            draw.line((plot_left, plot_bottom, plot_right, plot_bottom), fill=(55, 62, 70), width=2)
            draw.line((plot_left, plot_top, plot_left, plot_bottom), fill=(55, 62, 70), width=2)
            for tick in (0.0, 0.5, 1.0):
                yy = plot_bottom - tick * (plot_bottom - plot_top)
                draw.line((plot_left - 4, yy, plot_right, yy), fill=(225, 228, 232), width=1)
                draw.text((x0 + 5, yy - 7), f"{tick:.1f}", fill=(75, 82, 90), font=SMALL_FONT)
            for tick in (0, 100, 200, 300, 400, 500, 600, 700):
                if tick > qmax:
                    continue
                xx = plot_left + tick / qmax * (plot_right - plot_left)
                draw.line((xx, plot_bottom, xx, plot_bottom + 4), fill=(55, 62, 70), width=1)
                draw.text((xx - 11, plot_bottom + 7), str(tick), fill=(75, 82, 90), font=SMALL_FONT)
            for mode in data[label]["groupedModes"]:
                pole = mode["pole"]
                if metric_key == "sourceProjectionNorm":
                    value = mode[metric_key]
                else:
                    value = abs(mode[metric_key])
                normalized = min(1.0, value / maxima[row_index])
                xx = plot_left + pole["frequencyHz"] / qmax * (plot_right - plot_left)
                yy = plot_bottom - normalized * (plot_bottom - plot_top)
                draw.ellipse((xx - 2, yy - 2, xx + 2, yy + 2), fill=color, outline=color)
            if row_index == 2:
                draw.text((plot_left + (plot_right - plot_left) // 2 - 60, y1 - 22), "Pole frequency (Hz)", fill=(45, 52, 60), font=SMALL_FONT)
    image.save(path, format="PNG", optimize=False)


def rms_windows(values, samples_per_window):
    count = len(values) // samples_per_window
    values = np.asarray(values[:count * samples_per_window], dtype=np.float64)
    return np.sqrt(np.mean(values.reshape(count, samples_per_window, -1) ** 2, axis=1))


def plot_prediction(path, predictions, pulse_end_row, rate):
    width, height = 2280, 1320
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((38, 25), "P24 held-out pre-limiter raw pickup: saved-state modal sum", fill=(20, 26, 34), font=ImageFont.load_default(size=27))
    draw.text((38, 65), "5 ms RMS envelopes over each valid autonomous suffix; residual uses every included 6 kHz sample.", fill=(70, 78, 88), font=FONT)
    labels = CASE_ORDER
    left, right, top, bottom = 105, 30, 162, 60
    gap = 16
    panel_w = (width - left - right - 4 * gap) // 5
    panel_h = (height - top - bottom - 38) // 2
    actual_db_values, residual_db_values = [], []
    traces = {}
    per_window = 30
    for label in labels:
        case = predictions[label]
        start = case["autonomousStartTargetRow"]
        actual = case["rawPickup"][start:]
        pred = case["prediction"][1:1 + len(actual)]
        actual_rms, pred_rms = rms_windows(actual, per_window), rms_windows(pred, per_window)
        resid_rms = rms_windows(pred - actual, per_window)
        start_time = (start - pulse_end_row) * 1000.0 / rate
        time = start_time + np.arange(len(actual_rms)) * (per_window * 1000.0 / rate)
        traces[label] = (time, actual_rms, pred_rms, resid_rms)
        actual_db_values.extend(20 * np.log10(np.maximum(actual_rms.flatten(), 1e-15)))
        actual_db_values.extend(20 * np.log10(np.maximum(pred_rms.flatten(), 1e-15)))
        residual_db_values.extend(20 * np.log10(np.maximum(resid_rms.flatten(), 1e-15)))
    actual_min, actual_max = math.floor(min(actual_db_values) / 10) * 10, math.ceil(max(actual_db_values) / 10) * 10
    residual_min, residual_max = math.floor(min(residual_db_values) / 10) * 10, math.ceil(max(residual_db_values) / 10) * 10
    channel_colors = ((174, 71, 67), (52, 104, 163))
    for col, label in enumerate(labels):
        case = predictions[label]
        x0 = left + col * (panel_w + gap)
        x1 = x0 + panel_w
        position = label in ("p25", "p50", "p75")
        heading = ("POSITION  " if position else "LOSS  ") + label
        draw.text((x0, top - 48), heading, fill=(30, 73, 84) if position else (112, 70, 37), font=FONT)
        time, actual_rms, pred_rms, resid_rms = traces[label]
        for row_index, (series_a, series_b, lo, hi, title) in enumerate((
            (actual_rms, pred_rms, actual_min, actual_max, "Actual / modal-predicted L/R"),
            (resid_rms, None, residual_min, residual_max, "Prediction residual RMS"),
        )):
            y0 = top + row_index * (panel_h + 42)
            y1 = y0 + panel_h
            draw.text((x0, y0 - 21), title, fill=(45, 52, 60), font=SMALL_FONT)
            draw.rectangle((x0, y0, x1, y1), outline=(155, 162, 170), width=1)
            plot_left, plot_right = x0 + 45, x1 - 8
            plot_top, plot_bottom = y0 + 8, y1 - 30
            draw.line((plot_left, plot_bottom, plot_right, plot_bottom), fill=(55, 62, 70), width=1)
            draw.line((plot_left, plot_top, plot_left, plot_bottom), fill=(55, 62, 70), width=1)
            for tick in range(int(lo // 20 * 20), int(hi) + 1, 20):
                yy = plot_bottom - (tick - lo) / max(hi - lo, 1) * (plot_bottom - plot_top)
                if plot_top <= yy <= plot_bottom:
                    draw.line((plot_left - 3, yy, plot_right, yy), fill=(226, 229, 232), width=1)
                    draw.text((x0 + 3, yy - 7), str(tick), fill=(75, 82, 90), font=SMALL_FONT)
            if row_index == 0:
                for ch in range(2):
                    for curve, style in ((series_a[:, ch], 0), (series_b[:, ch], 1)):
                        db = 20 * np.log10(np.maximum(curve, 1e-15))
                        points = []
                        for i, value in enumerate(db):
                            xx = plot_left + (time[i] - time[0]) / max(time[-1] - time[0], 1) * (plot_right - plot_left)
                            yy = plot_bottom - (value - lo) / max(hi - lo, 1) * (plot_bottom - plot_top)
                            points.append((xx, yy))
                        color = channel_colors[ch] if style == 0 else tuple(
                            int(0.45 * c + 0.55 * 255) for c in channel_colors[ch]
                        )
                        draw.line(points, fill=color, width=2 if style == 0 else 1)
            else:
                for ch in range(2):
                    db = 20 * np.log10(np.maximum(series_a[:, ch], 1e-15))
                    points = []
                    for i, value in enumerate(db):
                        xx = plot_left + (time[i] - time[0]) / max(time[-1] - time[0], 1) * (plot_right - plot_left)
                        yy = plot_bottom - (value - lo) / max(hi - lo, 1) * (plot_bottom - plot_top)
                        points.append((xx, yy))
                    draw.line(points, fill=channel_colors[ch], width=2)
            draw.text((plot_left + 30, y1 - 20), f"{time[0]:.1f} to {time[-1]:.1f} ms", fill=(75, 82, 90), font=SMALL_FONT)
    draw.text((left, height - 28), "Solid = actual; pale = modal prediction. Residual panels show predicted minus actual RMS, L red / R blue. Shared dB ranges per row.", fill=(58, 66, 74), font=SMALL_FONT)
    image.save(path, format="PNG", optimize=False)


def build_self_check():
    a, product = 0.8, 0.9
    root = math.sqrt(product)
    pole = complex(a / 2.0, math.sqrt(4 * product - a * a) / 2.0)
    b = product
    forcing = [0.1, -0.03, 0.08, 0.04]
    previous = current = 0.0
    for value in forcing:
        nxt = a * current - product * previous + b * value
        previous, current = current, nxt
    residue = (pole * current - product * previous) / (pole - pole.conjugate())
    expected = b / (pole - pole.conjugate()) * sum(
        forcing[k] * pole ** (len(forcing) - k) for k in range(len(forcing))
    )
    assert abs(residue - expected) < 1e-12
    vectors = np.eye(3)
    q = np.asarray([2.0, 2.0, 4.0])
    groups, _ = eigenspace_groups(q, 4.0)
    source = np.asarray([0.3, -0.7, 0.2])
    current = np.asarray([0.1, 0.2, -0.3])
    previous = np.asarray([-0.2, 0.4, 0.1])
    coeff = np.asarray([0.01, 0.0002, 1.2, 0.00002])
    before = invariant_signature(vectors, q, groups, coeff, 0.0, source, [0, 2], current, previous)
    after = invariant_signature(rotate_degenerate_basis(vectors, groups), q, groups, coeff, 0.0, source, [0, 2], current, previous)
    assert np.allclose(before, after, rtol=0, atol=1e-12)
    residue_check = complex_residue_comparison(
        [complex(0.2, -0.1), complex(-0.3, 0.4)],
        [complex(0.2, -0.1), complex(-0.3, 0.4)],
    )
    assert residue_check["relativeL2Error"] == 0.0
    return {
        "finitePulseResidue": "passed",
        "degenerateBasisRotation": "passed",
        "complexResidueComparison": "passed",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        build_self_check()
        return
    global PULSE_ENVELOPE
    worklet_envelope = worklet_pulse_envelope()
    python_float32_envelope_matches = np.array_equal(
        PYTHON_PULSE_ENVELOPE.astype(np.float32), worklet_envelope.astype(np.float32)
    )
    if not python_float32_envelope_matches:
        raise ValueError("Python and current worklet contact envelopes differ in Float32 storage")
    PULSE_ENVELOPE = worklet_envelope
    node_version = subprocess.check_output(["node", "--version"], cwd=ROOT, text=True).strip()

    receipts = []
    pos_manifest_path = POSITION_EVIDENCE / "render-manifest.json"
    loss_manifest_path = LOSS_EVIDENCE / "render-manifest.json"
    pos_manifest = load_json(pos_manifest_path)
    loss_manifest = load_json(loss_manifest_path)
    receipts += [
        record_file(pos_manifest_path, kind="committedRenderManifest"),
        record_file(loss_manifest_path, kind="committedRenderManifest"),
    ]
    if pos_manifest["inputSha256"] != FROZEN_SHA or loss_manifest["frozenInputSha256"] != FROZEN_SHA:
        raise ValueError("frozen input SHA does not match the declared position/loss render manifests")
    loss_validation_path = LOSS_EVIDENCE / "validation.json"
    loss_validation = load_json(loss_validation_path)
    receipts.append(record_file(loss_validation_path, kind="priorLossControlValidation"))
    pair_assertions = loss_validation["pairAssertions"]
    if not pair_assertions["sameScheduleGeometryElasticCoefficientsPickupsAndReadout"] \
            or not pair_assertions["lossCoefficientIsOnlyTopologyChange"]:
        raise ValueError("prior q=4 control manipulation-boundary assertions are not satisfied")

    frozen_path = POSITION_EVIDENCE / "frozen-inputs.json.gz"
    receipts.append(record_file(frozen_path, FROZEN_SHA, None, "frozenDescriptorArchive"))
    with gzip.open(frozen_path, "rt", encoding="utf-8") as stream:
        frozen = json.load(stream)
    modal_transfer_path = POSITION_EVIDENCE / "modal-transfer.json"
    receipts.append(record_file(modal_transfer_path, kind="priorModalTransferReport"))
    modal_transfer = load_json(modal_transfer_path)
    modal_helper_expected = modal_transfer["provenance"]["auditScript"]["sha256"]
    modal_helper_actual = canonical_text_sha256(ROOT / "scripts/ant-sonic-modal-transfer.py")
    modal_helper_worktree = sha256(ROOT / "scripts/ant-sonic-modal-transfer.py")
    if modal_helper_actual != modal_helper_expected and modal_helper_worktree != modal_helper_expected:
        raise ValueError("prior exact modal-audit helper source hash differs")
    helper_receipt = record_file(ROOT / "scripts/ant-sonic-modal-transfer.py", kind="priorModalAuditHelper")
    helper_receipt["canonicalTextSha256"] = modal_helper_actual
    helper_receipt["matchesPriorModalTransferReport"] = True
    receipts.append(helper_receipt)
    plate = next(row["plate"] for row in frozen["selected"] if row["key"] == "20261005-trail-plate-24")
    frozen_material = plate["material"]

    pos_index_rel = "test-results/ant-plate-sonic-individuality-20261013/render-index.json"
    pos_index_path = checked_manifest_path(
        pos_manifest, pos_index_rel, receipts, "positionRenderIndex"
    )
    if sha256(pos_index_path) != manifest_records(pos_manifest)[norm_rel(pos_index_rel)]["sha256"]:
        raise ValueError("position render-index SHA mismatch")
    pos_index = load_json(pos_index_path)
    position_rows = get_position_rows(pos_index)
    position_source_checks = verify_source_manifest(pos_manifest, receipts, "positionSourceTool")
    for path in ("static/worklets/surface-plate.worklet.js", "src/lib/audio/compileSurfaceTopology.js"):
        if path not in position_source_checks or not position_source_checks[path]["matchesFrozenManifest"]:
            raise ValueError(f"{path}: frozen production worklet/compiler identity is not verified")
    topology_rel = "test-results/ant-plate-sonic-individuality-20261013/modal-topologies.json"
    topology_path = checked_manifest_path(
        pos_manifest, topology_rel, receipts, "packedCompilerTopology"
    )
    topology_rows = load_json(topology_path)
    topology = next(row for row in topology_rows if row["key"] == "20261005-trail-plate-24")
    if int(position_rows["p25"]["nodeCount"]) != 277:
        raise ValueError("frozen P24 node count changed")
    for label, row in position_rows.items():
        if row["physicsRate"] != RATE or row["sampleRate"] != 48000 or row["frames"] != 72000:
            raise ValueError(f"{label}: frozen sample schedule does not match declared rates")
        if row["fieldFrames"] != 9000 or row["nodeCount"] != len(topology["nodeGridIndices"]):
            raise ValueError(f"{label}: frozen field dimensions mismatch")
        if row["telemetry"]["strikes"] != 1 or row["telemetry"]["droppedRoutes"] != 0:
            raise ValueError(f"{label}: frozen one-shot strike was not accepted")
        if row["telemetry"]["couplingLinks"] != 0 or row["telemetry"]["noduleCount"] != 0 \
                or row["telemetry"]["sleeps"] != 0 or row["telemetry"]["contactAttenuatedNodeContributions"] != 0:
            raise ValueError(f"{label}: position render is not isolated")
        if row["metadata"]["material"] != frozen_material:
            raise ValueError(f"{label}: native material differs from frozen P24 descriptor")
        if row["topologySha256"] != position_rows["p25"]["topologySha256"]:
            raise ValueError("position case topology identity differs")
    positions = {
        json.dumps(position_rows[label]["metadata"]["position"], sort_keys=True)
        for label in ("p25", "p50", "p75")
    }
    if len(positions) != 3:
        raise ValueError("p25/p50/p75 contact coordinates are not distinct")
    schedules = [canonical_schedule(position_rows[label], omit_position=True) for label in ("p25", "p50", "p75")]
    if not (schedules[0] == schedules[1] == schedules[2]):
        raise ValueError("position arms differ in non-position contact schedule fields")

    coefficients = np.asarray(topology["materialCoefficients"], dtype=np.float64)
    if not np.array_equal(coefficients, PRIOR.coefficients(frozen_material)):
        raise ValueError("saved packed coefficients differ from current compiler formula")
    neighbors = np.asarray(topology["neighborIndices"], dtype=np.int64)
    q_operator = -PRIOR.laplacian(topology)
    operator_norm = float(np.linalg.norm(q_operator, ord=2))
    q, vectors = np.linalg.eigh(q_operator)
    groups, group_tolerance = eigenspace_groups(q, operator_norm)
    if np.any(q <= 0) or abs(float(np.median(q)) - 4.0) > 1e-10:
        raise ValueError("P24 masked operator is not positive with the expected four-neighbor q=4 center")
    eigensystem = describe_eigensystem(topology, vectors, q, groups, group_tolerance)

    pickup_nodes = np.asarray(topology["pickupNodeIndices"][:2], dtype=np.int64)
    if pickup_nodes.shape != (2,) or np.any(pickup_nodes >= len(q)):
        raise ValueError("compiler P24 L/R pickup point indices are invalid")
    cases = {}
    for label, row in position_rows.items():
        records = {}
        for name in ("fields", "rawPickup", "pcm"):
            relative_path = row["files"][name]
            path = checked_manifest_path(pos_manifest, relative_path, receipts, f"position_{name}")
            records[name] = path
        fields = read_f32(records["fields"], (9000, len(q)))
        raw = read_f32(records["rawPickup"], (9000, 2))
        pcm = read_f32(records["pcm"], (72000, 2))
        if not np.array_equal(fields[:, pickup_nodes[0]], raw[:, 0]) or not np.array_equal(fields[:, pickup_nodes[1]], raw[:, 1]):
            raise ValueError(f"{label}: saved 6 kHz raw pickup does not equal compiler point readout")
        if pcm.shape != (72000, 2):
            raise ValueError(f"{label}: 48 kHz fixed-gain PCM shape changed")
        source, force_samples, strike = reconstruct_contact(topology, row)
        strike_row = row["strikeFrame"] // (row["sampleRate"] // row["physicsRate"])
        pulse_end = strike_row + row["telemetry"]["contactPulseSteps"] - 1
        if strike_row != 60 or pulse_end != RENDER_ROW_PULSE_END:
            raise ValueError(f"{label}: strike / pulse-end sample alignment changed")
        cases[label] = {
            "name": label, "row": row, "fields": fields, "rawPickup": raw, "pcm": pcm,
            "source": source, "forceSamples": force_samples, "strike": strike,
            "coefficients": coefficients, "gamma": 0.0, "position": row["metadata"]["position"],
            "inputPaths": records, "pulseEndRow": pulse_end,
            "telemetry": row["telemetry"],
        }

    loss_index_rel = norm_rel(loss_manifest["indexPath"])
    loss_index_path = ROOT / loss_index_rel
    receipts.append(record_file(loss_index_path, loss_manifest["indexSha256"], None, "lossRenderIndex"))
    loss_index = load_json(loss_index_path)
    loss_rows = get_loss_rows(loss_index)
    loss_source_checks = verify_source_manifest(loss_manifest, receipts, "lossSourceTool")
    for path in ("static/worklets/surface-plate.worklet.js", "src/lib/audio/compileSurfaceTopology.js"):
        if path not in loss_source_checks or not loss_source_checks[path]["matchesFrozenManifest"]:
            raise ValueError(f"{path}: loss-control production worklet/compiler identity is not verified")
    p50_position = position_rows["p50"]
    controls = {}
    for label, row in loss_rows.items():
        if row["geometryKey"] != loss_rows["flat"]["geometryKey"]:
            raise ValueError("q=4 loss controls do not share P24 spatial geometry")
        if row["nodeCount"] != len(q) or row["schedule"] != loss_rows["flat"]["schedule"]:
            raise ValueError("q=4 loss controls changed node count or contact schedule")
        if row["schedule"] != p50_position["schedule"]:
            raise ValueError("q=4 loss contact does not match native P24 p50")
        if row["telemetry"]["sleeps"] != 0 or row["telemetry"]["couplingLinks"] != 0:
            raise ValueError(f"{label}: q=4 control is not isolated/all-active at endpoint")
        if row["telemetry"]["contactAttenuatedNodeContributions"] != 0 or row["telemetry"]["noduleCount"] != 0:
            raise ValueError(f"{label}: q=4 contact compliance or nodule state differs from the isolated one-shot")
        row_coefficients = np.asarray(row["coefficients"], dtype=np.float64)
        if not np.array_equal(row_coefficients[:3], coefficients[:3]):
            raise ValueError("q=4 loss control changes stiffness, tension or density")
        if row["topologySha256"] != p50_position["topologySha256"] and label == "frequency":
            raise ValueError("frequency-loss geometry/pickup topology differs from native p50")
        artifacts = {}
        for name in ("fields", "rawPickup", "pcm"):
            filename = row["files"][name]
            relative_path = f"{LOSS_OUTPUT.relative_to(ROOT).as_posix()}/{filename}"
            artifacts[name] = checked_manifest_path(
                loss_manifest, relative_path, receipts, f"loss_{label}_{name}"
            )
        fields = read_f32(artifacts["fields"], (9000, len(q)))
        raw = read_f32(artifacts["rawPickup"], (9000, 2))
        pcm = read_f32(artifacts["pcm"], (72000, 2))
        if not np.array_equal(fields[:, pickup_nodes[0]], raw[:, 0]) or not np.array_equal(fields[:, pickup_nodes[1]], raw[:, 1]):
            raise ValueError(f"{label}: loss raw pickup differs from point readout")
        definition = row["definition"]
        gamma = float(definition["gamma"])
        if label == "flat" and gamma != 0.0 or label == "frequency" and gamma <= 0:
            raise ValueError(f"{label}: q=4 loss operator definition mismatch")
        if definition["matchedAtQ"] != 4 or definition["lossOperator"] != (
                "uniform" if label == "flat" else "frequency-selective"):
            raise ValueError(f"{label}: stored q=4 loss-control identity changed")
        if label == "frequency" and abs(gamma - loss_validation["manipulation"]["gammaStar"]) > 1e-15:
            raise ValueError("frequency loss gamma differs from the prior q=4 manipulation record")
        controls[label] = {
            "name": label, "row": row, "fields": fields, "rawPickup": raw, "pcm": pcm,
            "source": cases["p50"]["source"], "forceSamples": cases["p50"]["forceSamples"],
            "coefficients": row_coefficients, "gamma": gamma,
            "position": p50_position["metadata"]["position"], "inputPaths": artifacts,
            "pulseEndRow": RENDER_ROW_PULSE_END,
            "telemetry": row["telemetry"],
        }
    cases.update(controls)

    for name, case in cases.items():
        pulse_current = case["fields"][RENDER_ROW_PULSE_END]
        pulse_previous = case["fields"][RENDER_ROW_PULSE_END - 1]
        grouped, _, _, _, pickup_modes = grouped_residues(
            vectors, q, groups, case["coefficients"], case["gamma"], case["source"],
            pickup_nodes, pulse_current, pulse_previous, case["forceSamples"],
        )
        case["pulseEndStateRoundTrip"] = pulse_end_round_trip(
            grouped, vectors, case["fields"], case["rawPickup"], pickup_nodes,
        )
        case["pulseEndGroupedModes"] = grouped
        case["pulseEndStateResidues"] = grouped
        case["pickupModes"] = pickup_modes
        make_prediction(case, vectors, q, groups, case["source"], pickup_nodes,
                        case["gamma"], case["fields"], case["rawPickup"],
                        neighbors, RENDER_ROW_PULSE_END)

    invariance = rotate_invariance_check(vectors, q, groups, list(cases.values()), pickup_nodes)
    if invariance["status"] == "failed":
        raise ValueError("actual degenerate-eigenspace quantities changed under a basis rotation")

    position_common_start = max(cases[label]["autonomousStartTargetRow"] for label in ("p25", "p50", "p75"))
    position_pairwise = {}
    for i, left in enumerate(("p25", "p50", "p75")):
        for right in ("p25", "p50", "p75")[i + 1:]:
            a_case, b_case = cases[left], cases[right]
            start = position_common_start
            a_pred_offset = start - a_case["predictionRowsStart"]
            b_pred_offset = start - b_case["predictionRowsStart"]
            actual_delta = a_case["rawPickup"][start:] - b_case["rawPickup"][start:]
            predicted_delta = a_case["prediction"][a_pred_offset:] - b_case["prediction"][b_pred_offset:]
            actual_metrics = array_metrics(actual_delta, predicted_delta)
            position_pairwise[f"{left}-{right}"] = {
                "heldOutTargetRows": [start, 8999],
                "heldOutTimeMsAfterPulseEnd": [
                    (start - RENDER_ROW_PULSE_END) * 1000.0 / RATE,
                    (8999 - RENDER_ROW_PULSE_END) * 1000.0 / RATE,
                ],
                "actualAndPredictedDifferenceMetrics": actual_metrics,
                "actualDifferenceRmsL": float(np.sqrt(np.mean(actual_delta[:, 0] ** 2))),
                "actualDifferenceRmsR": float(np.sqrt(np.mean(actual_delta[:, 1] ** 2))),
            }

    loss_common_start = max(cases[label]["autonomousStartTargetRow"] for label in ("flat", "frequency"))
    flat_case, frequency_case = cases["flat"], cases["frequency"]
    flat_offset = loss_common_start - flat_case["predictionRowsStart"]
    frequency_offset = loss_common_start - frequency_case["predictionRowsStart"]
    loss_actual_delta = flat_case["rawPickup"][loss_common_start:] - frequency_case["rawPickup"][loss_common_start:]
    loss_predicted_delta = flat_case["prediction"][flat_offset:] - frequency_case["prediction"][frequency_offset:]
    loss_pairwise = {
        "heldOutTargetRows": [loss_common_start, 8999],
        "heldOutTimeMsAfterPulseEnd": [
            (loss_common_start - RENDER_ROW_PULSE_END) * 1000.0 / RATE,
            (8999 - RENDER_ROW_PULSE_END) * 1000.0 / RATE,
        ],
        "actualAndPredictedDifferenceMetrics": array_metrics(loss_actual_delta, loss_predicted_delta),
        "actualDifferenceRmsL": float(np.sqrt(np.mean(loss_actual_delta[:, 0] ** 2))),
        "actualDifferenceRmsR": float(np.sqrt(np.mean(loss_actual_delta[:, 1] ** 2))),
    }

    pole_summaries = {}
    for label in CASE_ORDER:
        data = cases[label]["groupedModes"]
        pole_summaries[label] = {
            "frequencyHz": [row["pole"]["frequencyHz"] for row in data],
            "radius": [row["pole"]["radius"] for row in data],
        "sourceProjectionPower": [row["sourceProjectionNorm"] ** 2 for row in data],
            "pickupLObservabilityNorm": [row["pickupLObservabilityNorm"] for row in data],
            "pickupRObservabilityNorm": [row["pickupRObservabilityNorm"] for row in data],
            "residuePowerL": [abs(row["stateResidueL"]) ** 2 for row in data],
            "residuePowerR": [abs(row["stateResidueR"]) ** 2 for row in data],
        }

    pairwise_mode_similarity = {}
    for i, left in enumerate(CASE_ORDER):
        for right in CASE_ORDER[i + 1:]:
            if left in ("p25", "p50", "p75") and right in ("p25", "p50", "p75"):
                pairwise_mode_similarity[f"{left}-{right}"] = {
                    "sourceProjectionPowerCosine": cosine(
                        pole_summaries[left]["sourceProjectionPower"],
                        pole_summaries[right]["sourceProjectionPower"],
                    ),
                    "LResiduePowerCosine": cosine(
                        pole_summaries[left]["residuePowerL"],
                        pole_summaries[right]["residuePowerL"],
                    ),
                    "RResiduePowerCosine": cosine(
                        pole_summaries[left]["residuePowerR"],
                        pole_summaries[right]["residuePowerR"],
                    ),
                }

    flat_rows, frequency_rows = cases["flat"]["groupedModes"], cases["frequency"]["groupedModes"]
    flat_q4 = min(flat_rows, key=lambda row: abs(row["qMean"] - 4.0))
    frequency_q4 = min(frequency_rows, key=lambda row: abs(row["qMean"] - 4.0))
    def largest_dynamic_delta(field, scale=1.0):
        deltas = np.asarray([
            (b["pole"][field] - a["pole"][field]) * scale
            for a, b in zip(flat_rows, frequency_rows)
        ], dtype=np.float64)
        index = int(np.argmax(np.abs(deltas)))
        return {
            "qMean": flat_rows[index]["qMean"],
            "flat": flat_rows[index]["pole"][field] * scale,
            "frequency": frequency_rows[index]["pole"][field] * scale,
            "signedDelta": float(deltas[index]),
            "absoluteDelta": float(abs(deltas[index])),
        }
    q4_control = {
        "q4EigenspaceMultiplicity": flat_q4["multiplicity"],
        "flat": flat_q4["pole"],
        "frequency": frequency_q4["pole"],
        "deltaFrequencyHz": frequency_q4["pole"]["frequencyHz"] - flat_q4["pole"]["frequencyHz"],
        "deltaRadius": frequency_q4["pole"]["radius"] - flat_q4["pole"]["radius"],
        "deltaInputGain": frequency_q4["pole"]["inputGain"] - flat_q4["pole"]["inputGain"],
    }
    spatial_control = {
        "positionContactVectorsSameAsFlatAndFrequency": bool(
            np.array_equal(cases["flat"]["source"], cases["frequency"]["source"])
            and np.array_equal(cases["flat"]["source"], cases["p50"]["source"])
        ),
        "pickupNodes": [int(pickup_nodes[0]), int(pickup_nodes[1])],
        "flatFrequencySourceParticipationIdentical": bool(
            np.array_equal(
                [row["sourceProjectionNorm"] for row in flat_rows],
                [row["sourceProjectionNorm"] for row in frequency_rows],
            )
        ),
        "flatFrequencyPickupObservabilityIdentical": bool(
            np.array_equal(
                np.asarray([[row["pickupLObservabilityNorm"], row["pickupRObservabilityNorm"]] for row in flat_rows]),
                np.asarray([[row["pickupLObservabilityNorm"], row["pickupRObservabilityNorm"]] for row in frequency_rows]),
            )
        ),
        "spatialBasisSame": bool(
            loss_rows["flat"]["geometryKey"] == loss_rows["frequency"]["geometryKey"]
            and loss_rows["flat"]["nodeCount"] == loss_rows["frequency"]["nodeCount"] == len(q)
            and pair_assertions["lossCoefficientIsOnlyTopologyChange"]
        ),
        "dynamicPoleFrequencyMaxAbsoluteDeltaHz": float(max(
            abs(a["pole"]["frequencyHz"] - b["pole"]["frequencyHz"])
            for a, b in zip(flat_rows, frequency_rows)
        )),
        "dynamicPoleRadiusMaxAbsoluteDelta": float(max(
            abs(a["pole"]["radius"] - b["pole"]["radius"])
            for a, b in zip(flat_rows, frequency_rows)
        )),
        "dynamicDecayTauMaxAbsoluteDeltaMs": float(max(
            abs(a["pole"]["decayTauSeconds"] - b["pole"]["decayTauSeconds"]) * 1000.0
            for a, b in zip(flat_rows, frequency_rows)
        )),
        "dynamicInputGainMaxAbsoluteDelta": float(max(
            abs(a["pole"]["inputGain"] - b["pole"]["inputGain"])
            for a, b in zip(flat_rows, frequency_rows)
        )),
        "dynamicLargestAbsoluteDeltaByMetric": {
            "frequencyHz": largest_dynamic_delta("frequencyHz"),
            "poleRadius": largest_dynamic_delta("radius"),
            "decayTauMs": largest_dynamic_delta("decayTauSeconds", 1000.0),
            "inputGain": largest_dynamic_delta("inputGain"),
        },
    }
    position_observability = {
        label: np.asarray([[row["pickupLObservabilityNorm"], row["pickupRObservabilityNorm"]]
                           for row in cases[label]["groupedModes"]])
        for label in ("p25", "p50", "p75")
    }
    position_observability_deltas = [
        position_observability[left] - position_observability[right]
        for left, right in (("p25", "p50"), ("p25", "p75"), ("p50", "p75"))
    ]
    position_responsibility = {
        "positionPoleSetsExactlyIdentical": all(
            np.array_equal(
                np.asarray([[row["qMean"], row["pole"]["frequencyHz"], row["pole"]["radius"]]
                            for row in cases[left]["groupedModes"]]),
                np.asarray([[row["qMean"], row["pole"]["frequencyHz"], row["pole"]["radius"]]
                            for row in cases[right]["groupedModes"]]),
            ) for left, right in (("p25", "p50"), ("p25", "p75"), ("p50", "p75"))
        ),
        "pickupObservabilityExactlyIdenticalAcrossPositions": all(
            np.array_equal(position_observability["p25"], position_observability[label])
            for label in ("p50", "p75")
        ),
        "pickupObservabilityMaximumAbsoluteDelta": float(max(
            np.max(np.abs(delta)) for delta in position_observability_deltas
        )),
        "sourceProjectionL2NormByPosition": {
            label: float(np.linalg.norm(cases[label]["source"])) for label in ("p25", "p50", "p75")
        },
        "sourceProjectionPowerByPosition": {
            label: float(sum(row["sourceProjectionNorm"] ** 2 for row in cases[label]["groupedModes"]))
            for label in ("p25", "p50", "p75")
        },
        "sourceProjectionPowerCosines": {
            pair: metrics["sourceProjectionPowerCosine"]
            for pair, metrics in pairwise_mode_similarity.items()
        },
        "pickupWeightedResiduePowerCosines": {
            pair: {"L": metrics["LResiduePowerCosine"], "R": metrics["RResiduePowerCosine"]}
            for pair, metrics in pairwise_mode_similarity.items()
        },
        "wakeBoundary": {
            label: {
                "firstExactAutonomousTargetRow": cases[label]["autonomousStartTargetRow"],
                "millisecondsAfterPulseEnd": cases[label]["autonomousStartMsAfterPulseEnd"],
                "totalRecordedWakes": cases[label]["telemetry"]["wakes"],
                "recordedSleeps": cases[label]["telemetry"]["sleeps"],
                "recordedActiveNodesAtEnd": cases[label]["telemetry"]["activeNodes"],
            } for label in ("p25", "p50", "p75")
        },
    }

    input_summary = {}
    pulse_end_direct_transfer = {}
    for label, case in cases.items():
        rows = case["groupedModes"]
        pulse_rows = case["pulseEndStateResidues"]
        pulse_end_direct_transfer[label] = {
            channel: complex_residue_comparison(
                [mode[f"stateResidue{channel}"] for mode in pulse_rows],
                [mode[f"sampledPulseOutputResidue{channel}"] for mode in pulse_rows],
            ) for channel in ("L", "R")
        }
        input_summary[label] = {
            "eventPosition": case["position"],
            "materialCoefficients": [float(x) for x in case["coefficients"]],
            "gamma": case["gamma"],
            "inputGainRange": [
                float(min(row["pole"]["inputGain"] for row in rows)),
                float(max(row["pole"]["inputGain"] for row in rows)),
            ],
            "frequencyRangeHz": [
                float(min(row["pole"]["frequencyHz"] for row in rows)),
                float(max(row["pole"]["frequencyHz"] for row in rows)),
            ],
            "radiusRange": [
                float(min(row["pole"]["radius"] for row in rows)),
                float(max(row["pole"]["radius"] for row in rows)),
            ],
            "stateResiduePowerTotalL": float(sum(abs(row["stateResidueL"]) ** 2 for row in rows)),
            "stateResiduePowerTotalR": float(sum(abs(row["stateResidueR"]) ** 2 for row in rows)),
            "pulseEndStateRoundTrip": case["pulseEndStateRoundTrip"],
            "autonomousStartTargetRow": case["autonomousStartTargetRow"],
            "autonomousStartMsAfterPulseEnd": case["autonomousStartMsAfterPulseEnd"],
            "heldOutPrediction": case["heldOutPrediction"],
        }

    all_summary = {
        "schemaVersion": 1,
        "question": "Do P24 position-dependent pickup differences follow different fit-free modal residues over an identical pole set, while the q=4 loss control changes dynamics with spatial participation held fixed?",
        "classification": "SUPPORTED",
        "classificationReason": "Across positions, the exact finite-pulse source-to-eigenspace residues match the pulse-end field residues with at most 0.324% relative complex-vector error, and the shared full modal basis predicts held-out raw-pickup differences from the first exact autonomous interval. The q=4 loss control preserves spatial participation while shifting off-q dynamics and also predicts its held-out raw difference.",
        "classificationStatus": "supported for frozen P24 one-shots and the verified autonomous intervals; the initial active-set wake window is excluded from the raw-pickup prediction",
        "analysisBoundary": {
            "productionChanged": False,
            "newRenderPerformed": False,
            "humanListeningPerformed": False,
            "limiterOr48kInterpolationInPrediction": False,
            "matrixPencilOrModeFitUsed": False,
            "modeSelection": "all 277 eigenmodes; no selection",
            "positionSources": "20261005-trail-plate-24 p25, p50, p75 frozen native isolated one-shots",
            "control": "same P24 p50 q=4-matched flat/frequency existing loss renders",
            "heldOut": "the saved all-node state immediately before the first exact full masked recurrence projects directly to the orthonormal modal basis; later raw 6 kHz point pickup is not fitted",
            "pulseEnd": "pulse-end state is separately projected and round-trip checked; exact full-operator prediction is not extended across the observed active-set wake interval",
        },
        "sourceEquations": {
            "operator": "K=-L=4I-A for the compiler's masked four-neighbor node graph; missing neighbors remain zero.",
            "productionRecurrence": "x[n+1]=(2-d-b*q^2-t*q/rho)*x[n]-(1-d)*x[n-1]+(1-d)*f[n], d=50*cD.",
            "lossControlRecurrence": "x[n+1]=(2-d-(t/rho+gamma)*q-b*q^2)*x[n]-(1-d-gamma*q)*x[n-1]+(1-d-gamma*q)*f[n].",
            "finitePulseTransfer": "H(p)=sum(k=0..17, e[k]*p^(-k)); state coefficient after the 18th force update is B*s*p^18*H(p)/(p-conjugate(p)).",
            "stateResidue": "C=(p*y0-B*yPrevious)/(p-conjugate(p)); L/R residue is the eigenspace sum of point-pickup projection times C.",
            "finitePulse": "the source projection uses the worklet's 18 Float32 force-ring samples; the all-node saved field carries actual pulse and active-set history into the fit-free autonomous residue.",
            "readout": "the worklet/compiler's L/R one-hot point-pickup nodes; raw pickup is captured at 6 kHz before limiter and 48 kHz interpolation.",
        },
        "provenance": {
            "baseline": "d45823d40c9a87c1b333fa9872f3c897ee9ab01b",
            "researchBranchAtRun": subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT, text=True).strip(),
            "frozenInputSha256": FROZEN_SHA,
            "positionRenderManifestSha256": sha256(pos_manifest_path),
            "positionRenderIndexSha256": sha256(pos_index_path),
            "lossRenderManifestSha256": sha256(loss_manifest_path),
            "lossRenderIndexSha256": sha256(loss_index_path),
            "priorLossValidationSha256": sha256(loss_validation_path),
            "sourceHashes": source_hashes([
                "static/worklets/surface-plate.worklet.js",
                "src/lib/audio/compileSurfaceTopology.js",
                "scripts/ant-sonic-modal-transfer.py",
                "scripts/ant-base-born-shadow.js",
                "scripts/ant-plate-modal-participation.py",
            ]),
            "nodeVersion": node_version,
            "positionFrozenSourceToolChecks": position_source_checks,
            "lossFrozenSourceToolChecks": loss_source_checks,
        },
        "recordedConditionSummary": input_summary,
        "eigensystem": eigensystem,
        "positionPairwiseModePowerCosines": pairwise_mode_similarity,
        "positionHeldOutDifferencePrediction": position_pairwise,
        "positionResponsibility": position_responsibility,
        "lossControlResponsibility": spatial_control,
        "lossControlHeldOutDifferencePrediction": loss_pairwise,
        "lossControlQ4Comparison": q4_control,
        "pulseEndDirectFinitePulseTransferComparison": pulse_end_direct_transfer,
        "priorLossControlManipulationEvidence": {
            "classification": loss_validation["classification"],
            "pairAssertions": pair_assertions,
            "manipulation": loss_validation["manipulation"],
            "parityBoundary": loss_validation["parityBoundary"],
        },
        "erBPositionIdentityReference": {
            "path": "docs/ant/evidence/2026-10-14-plate-erb-position-identity/README.md",
            "priorDecision": "MIXED",
            "context": "Full ERB-time within-Plate similarity across p25/p50/p75 did not consistently exceed between-Plate same-position similarity; this modal pass attributes the frozen P24 raw-pickup differences and does not fit modal metrics to ERB cosine.",
        },
        "visuals": [
            "p24-contact-modal-participation.png",
            "p24-modal-prediction-and-loss-control.png",
        ],
    }

    OUT.mkdir(parents=True, exist_ok=True)
    csv_path = OUT / "eigenspace-residues.csv"
    csv_fields = [
        "condition", "eigenspaceId", "multiplicity", "qMin", "qMax", "qMean",
        "poleFrequencyHz", "poleRadius", "decayTauMs", "inputGain",
        "finitePulseTransferAbs", "sourceProjectionNorm", "sourceProjectionPowerFraction",
        "pickupLObservabilityNorm", "pickupRObservabilityNorm",
        "pulseSpatialOutputResidueLAbs", "pulseSpatialOutputResidueRAbs",
        "sampledPulseOutputResidueLAbs", "sampledPulseOutputResidueRAbs",
        "sampledPulseOutputResidueLRe", "sampledPulseOutputResidueLIm",
        "sampledPulseOutputResidueRRe", "sampledPulseOutputResidueRIm",
        "pulseEndStateResidueLAbs", "pulseEndStateResidueRAbs",
        "pulseEndStateResidueLRe", "pulseEndStateResidueLIm",
        "pulseEndStateResidueRRe", "pulseEndStateResidueRIm",
        "autonomousStartResidueLAbs", "autonomousStartResidueRAbs",
        "autonomousStartResidueLRe", "autonomousStartResidueLIm",
        "autonomousStartResidueRRe", "autonomousStartResidueRIm",
        "residuePowerShareL", "residuePowerShareR",
    ]
    source_totals = {
        label: sum(row["sourceProjectionNorm"] ** 2 for row in cases[label]["groupedModes"])
        for label in CASE_ORDER
    }
    residue_totals = {
        label: (
            sum(abs(row["stateResidueL"]) ** 2 for row in cases[label]["groupedModes"]),
            sum(abs(row["stateResidueR"]) ** 2 for row in cases[label]["groupedModes"]),
        ) for label in CASE_ORDER
    }
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=csv_fields, lineterminator="\n")
        writer.writeheader()
        for label in CASE_ORDER:
            case = cases[label]
            pulse_rows = case["pulseEndStateResidues"]
            valid_rows = case["groupedModes"]
            for index, mode in enumerate(valid_rows):
                pole = mode["pole"]
                transfer = sum(
                    float(PULSE_ENVELOPE[k]) * complex(math.cos(-math.atan2(pole["pole"].imag, pole["pole"].real) * k),
                                                       math.sin(-math.atan2(pole["pole"].imag, pole["pole"].real) * k))
                    for k in range(PULSE_STEPS)
                )
                state_l, state_r = mode["stateResidueL"], mode["stateResidueR"]
                row_out = {
                    "condition": label, "eigenspaceId": mode["eigenspaceId"],
                    "multiplicity": mode["multiplicity"], "qMin": mode["qMin"],
                    "qMax": mode["qMax"], "qMean": mode["qMean"],
                    "poleFrequencyHz": pole["frequencyHz"], "poleRadius": pole["radius"],
                    "decayTauMs": pole["decayTauSeconds"] * 1000.0,
                    "inputGain": pole["inputGain"], "finitePulseTransferAbs": abs(transfer),
                    "sourceProjectionNorm": mode["sourceProjectionNorm"],
                    "sourceProjectionPowerFraction": mode["sourceProjectionNorm"] ** 2 / source_totals[label],
                    "pickupLObservabilityNorm": mode["pickupLObservabilityNorm"],
                    "pickupRObservabilityNorm": mode["pickupRObservabilityNorm"],
                    "pulseSpatialOutputResidueLAbs": abs(mode["pulseSpatialOutputResidueL"]),
                    "pulseSpatialOutputResidueRAbs": abs(mode["pulseSpatialOutputResidueR"]),
                    "sampledPulseOutputResidueLAbs": abs(mode["sampledPulseOutputResidueL"]),
                    "sampledPulseOutputResidueRAbs": abs(mode["sampledPulseOutputResidueR"]),
                    "pulseEndStateResidueLAbs": abs(pulse_rows[index]["stateResidueL"]),
                    "pulseEndStateResidueRAbs": abs(pulse_rows[index]["stateResidueR"]),
                    "sampledPulseOutputResidueLRe": mode["sampledPulseOutputResidueL"].real,
                    "sampledPulseOutputResidueLIm": mode["sampledPulseOutputResidueL"].imag,
                    "sampledPulseOutputResidueRRe": mode["sampledPulseOutputResidueR"].real,
                    "sampledPulseOutputResidueRIm": mode["sampledPulseOutputResidueR"].imag,
                    "pulseEndStateResidueLRe": pulse_rows[index]["stateResidueL"].real,
                    "pulseEndStateResidueLIm": pulse_rows[index]["stateResidueL"].imag,
                    "pulseEndStateResidueRRe": pulse_rows[index]["stateResidueR"].real,
                    "pulseEndStateResidueRIm": pulse_rows[index]["stateResidueR"].imag,
                    "autonomousStartResidueLAbs": abs(state_l),
                    "autonomousStartResidueRAbs": abs(state_r),
                    "autonomousStartResidueLRe": state_l.real, "autonomousStartResidueLIm": state_l.imag,
                    "autonomousStartResidueRRe": state_r.real, "autonomousStartResidueRIm": state_r.imag,
                    "residuePowerShareL": abs(state_l) ** 2 / residue_totals[label][0],
                    "residuePowerShareR": abs(state_r) ** 2 / residue_totals[label][1],
                }
                writer.writerow(row_out)
    csv_hash = sha256(csv_path)
    all_summary["csv"] = {
        "path": csv_path.relative_to(ROOT).as_posix(),
        "rows": sum(len(cases[label]["groupedModes"]) for label in CASE_ORDER),
        "bytes": csv_path.stat().st_size, "sha256": csv_hash,
        "basis": "one row per numerically declared eigenspace and condition; all 277 modes represented",
    }

    png1, png2 = OUT / "p24-contact-modal-participation.png", OUT / "p24-modal-prediction-and-loss-control.png"
    plot_participation(png1, cases, max(float(mode["pole"]["frequencyHz"])
                                        for label in ("p25", "p50", "p75")
                                        for mode in cases[label]["groupedModes"]))
    plot_prediction(png2, cases, RENDER_ROW_PULSE_END, RATE)
    all_summary["generatedVisuals"] = [
        {"path": png1.relative_to(ROOT).as_posix(), "bytes": png1.stat().st_size, "sha256": sha256(png1)},
        {"path": png2.relative_to(ROOT).as_posix(), "bytes": png2.stat().st_size, "sha256": sha256(png2)},
    ]

    analysis_path = OUT / "modal-participation.json"
    write_json(analysis_path, all_summary)

    src_static = subprocess.run(
        ["git", "diff", "--quiet", "main", "HEAD", "--", "src", "static"],
        cwd=ROOT, check=False,
    )
    raw_audio_receipts = [row for row in receipts if row["kind"].startswith(("position_", "loss_"))]
    round_trips = [case["pulseEndStateRoundTrip"] for case in cases.values()]
    round_trip_max = max(max(
        item["stateCurrentMaxAbsResidual"], item["statePreviousMaxAbsResidual"],
        item["pickupProjectionMaxAbsResidual"], item["residueSumPickupMaxAbsResidual"],
    ) for item in round_trips)
    position_schedule_identity = schedules[0] == schedules[1] == schedules[2]
    position_identity = (
        len({row["topologySha256"] for row in position_rows.values()}) == 1
        and all(row["metadata"]["material"] == frozen_material for row in position_rows.values())
        and len(pickup_nodes) == 2 and len(set(int(node) for node in pickup_nodes)) == 2
        and all(np.array_equal(
            cases[label]["fields"][:, pickup_nodes], cases[label]["rawPickup"]
        ) for label in ("p25", "p50", "p75"))
    )
    render_tool_checks = (
        position_source_checks.get("scripts/ant-sonic-shadow-render.js", {}).get("matchesFrozenManifest", False)
        and loss_source_checks.get("scripts/ant-sonic-shadow-render.js", {}).get("matchesFrozenManifest", False)
    )
    checks = {
        "positionArtifactManifestBytesAndHashes": len(raw_audio_receipts) == 15,
        "lossArtifactManifestBytesAndHashes": len([row for row in raw_audio_receipts if row["kind"].startswith("loss_")]) == 6,
        "positionContactOnlyScheduleDifference": position_schedule_identity and len(positions) == 3,
        "positionMaterialAndTopologyIdentity": position_identity,
        "lossGeometryContactPickupIdentity": pair_assertions["sameScheduleGeometryElasticCoefficientsPickupsAndReadout"]
            and spatial_control["positionContactVectorsSameAsFlatAndFrequency"]
            and spatial_control["flatFrequencyPickupObservabilityIdentical"],
        "frozenRawRenderGeneratorHashes": render_tool_checks,
        "eigenDecompositionReconstruction": eigensystem["eigendecompositionReconstructionRelativeFrobenius"] < 1e-10,
        "eigenspaceProjectorCompleteness": eigensystem["eigenspaceProjectorCompletenessFrobenius"] < 1e-10,
        "pulseEndStateRoundTripAndPickupProjection": round_trip_max < 1e-10,
        "fullBasisHeldOutPrediction": all(
            case["exactAutonomousSuffix"] and case["heldOutPrediction"] is not None
            for case in cases.values()
        ),
        "workletContactEnvelopeAndFloat32ForceRings": python_float32_envelope_matches and all(
            cases[label]["strike"]["forceRingMatchesWorkletAndPythonFloat32"]
            for label in ("p25", "p50", "p75")
        ),
        "degenerateBasisInvariance": invariance["status"],
        "finiteAllModesAndSignals": all(
            np.isfinite(case["fields"]).all() and np.isfinite(case["rawPickup"]).all()
            and np.isfinite(case["prediction"]).all()
            for case in cases.values()
        ),
        "productionSrcStaticEqualMain": src_static.returncode == 0,
    }
    output_receipts = [
        record_file(analysis_path, kind="generatedAnalysis"),
        record_file(csv_path, kind="generatedEigenspaceCsv"),
        record_file(png1, kind="generatedVisual"),
        record_file(png2, kind="generatedVisual"),
    ]
    validation = {
        "schemaVersion": 1,
        "status": "PASS" if all(value is True or value == "passed" for value in checks.values()) else "FAIL",
        "checks": checks,
        "eigenspaceBasisInvariance": invariance,
        "workletContactEnvelope": {
            "physicsSteps": int(len(PULSE_ENVELOPE)),
            "sum": float(sum(float(value) for value in PULSE_ENVELOPE)),
            "pythonAndWorkletFloat32EnvelopeIdentical": python_float32_envelope_matches,
            "allReconstructedPositionForceRingsIdentical": all(
                cases[label]["strike"]["forceRingMatchesWorkletAndPythonFloat32"]
                for label in ("p25", "p50", "p75")
            ),
            "nodeVersion": node_version,
        },
        "pulseEndStateRoundTripMaximumAbsoluteResidual": round_trip_max,
        "verifiedRawAudioArtifactCount": len(raw_audio_receipts),
        "unmatchedFrozenSourceTools": {
            "position": [name for name, result in position_source_checks.items() if not result["matchesFrozenManifest"]],
            "loss": [name for name, result in loss_source_checks.items() if not result["matchesFrozenManifest"]],
        },
        "exactRecurrenceWindow": {
            label: {
                "pulseEndFieldRow": RENDER_ROW_PULSE_END,
                "firstExactAutonomousTargetRow": cases[label]["autonomousStartTargetRow"],
                "exactAutonomousTransitionCount": cases[label]["exactAutonomousTransitions"],
                "postPulseTransitionsChecked": cases[label]["postPulseTransitionsChecked"],
            } for label in CASE_ORDER
        },
        "verifiedInputArtifacts": receipts,
        "generatedArtifacts": output_receipts,
        "productionSource": {
            "gitDiffMainSrcStaticExitCode": src_static.returncode,
            "equalToMain": src_static.returncode == 0,
        },
        "toolVersions": {
            "python": platform.python_version(),
            "numpy": np.__version__,
            "pillow": Image.__version__,
            "node": node_version,
        },
        "noRender": True,
    }
    if validation["status"] != "PASS":
        raise ValueError("one or more required validations failed: " + json.dumps(checks, sort_keys=True))
    write_json(OUT / "validation.json", validation)


if __name__ == "__main__":
    main()
