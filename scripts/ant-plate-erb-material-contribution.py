#!/usr/bin/env python3
"""Reanalyze frozen Plate material swaps at ERB scale; never renders audio."""
import argparse
import csv
import gzip
import hashlib
import importlib.util
import io
import json
import math
import subprocess
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality"
POSITION_EVIDENCE = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-position-identity"
OUT = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-material-contribution"
RAW = ROOT / "test-results/ant-plate-sonic-individuality-20261013"
POSITIONS = ("p25", "p50", "p75")
BASELINE = "d45823d40c9a87c1b333fa9872f3c897ee9ab01b"
START_HEAD = "f2496d719eb9db678d235b37eee3ca0a78db7aca"
BRANCH = "codex/ant-base-born-causal-decomposition-20261014"
F32 = np.dtype("<f4")
EARLY_SECONDS = 0.100
LATE_START_SECONDS = 0.5
VISUAL_ABS_PERCENTILE = 99.5


def load_erb_helper():
    path = ROOT / "scripts/ant-base-born-loss-analysis.py"
    spec = importlib.util.spec_from_file_location("ant_base_born_loss_analysis", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ERB = load_erb_helper()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode("utf8")


def compact_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf8")


def unit_sum(values, label):
    values = np.asarray(values, dtype=np.float64)
    total = float(values.sum())
    if not math.isfinite(total) or total <= 0:
        raise ValueError(f"{label}: ERB power must have finite positive mass")
    return values / total


def cosine(a, b):
    a = np.asarray(a, dtype=np.float64).reshape(-1)
    b = np.asarray(b, dtype=np.float64).reshape(-1)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not math.isfinite(denominator) or denominator <= 0:
        raise ValueError("Cosine input has zero or non-finite norm")
    return float(np.clip(np.dot(a, b) / denominator, 0.0, 1.0))


def pearson(a, b):
    x = np.asarray(a, dtype=np.float64).reshape(-1)
    y = np.asarray(b, dtype=np.float64).reshape(-1)
    if x.shape != y.shape or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("Pattern-correlation inputs must be aligned and finite")
    x = x - x.mean()
    y = y - y.mean()
    denominator = float(np.linalg.norm(x) * np.linalg.norm(y))
    return None if denominator <= 0 else float(np.clip(np.dot(x, y) / denominator, -1.0, 1.0))


def summary(values):
    values = np.asarray(values, dtype=np.float64)
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Cannot summarize empty or non-finite values")
    q = np.quantile(values, [0.10, 0.25, 0.50, 0.75, 0.90])
    return {"count": int(len(values)), "min": float(values.min()), "p10": float(q[0]),
            "p25": float(q[1]), "median": float(q[2]), "mean": float(values.mean()),
            "p75": float(q[3]), "p90": float(q[4]), "max": float(values.max())}


def group_power_diagnostic(a_map, b_map, mask):
    groups = (("low", slice(0, 10)), ("mid", slice(10, 20)), ("high", slice(20, 30)))
    a_bands = np.asarray(a_map)[mask].sum(axis=0)
    b_bands = np.asarray(b_map)[mask].sum(axis=0)
    a_total, b_total = float(a_bands.sum()), float(b_bands.sum())
    result = {}
    for name, band_slice in groups:
        a_power = float(a_bands[band_slice].sum())
        b_power = float(b_bands[band_slice].sum())
        result[name] = {
            "aFixedGainLinearPower": a_power, "bFixedGainLinearPower": b_power,
            "aMinusBDbAfterLinearAggregation": float(dB_ratio(a_power, b_power)),
            "aUnitMassFractionDiagnostic": a_power / a_total if a_total else None,
            "bUnitMassFractionDiagnostic": b_power / b_total if b_total else None
        }
    return result


def safe_source_path(relative):
    path = (ROOT / relative).resolve()
    if path != ROOT and ROOT not in path.parents:
        raise ValueError(f"Source path escapes repository: {relative}")
    return path


def artifact_map(manifest, role=None):
    artifacts = [a for a in manifest["artifacts"] if role is None or a.get("role") == role]
    result = {a["path"]: a for a in artifacts}
    if len(result) != len(artifacts):
        raise ValueError("Render manifest contains duplicate artifact paths")
    return result


def path_position(plate, fraction):
    path = plate["principalPath"]
    if not path:
        raise ValueError("Frozen Plate has no principal path")
    distances = [0.0]
    for left, right in zip(path, path[1:]):
        dx = left % 96 - right % 96
        dy = left // 96 - right // 96
        distances.append(distances[-1] + math.hypot(dx, dy))
    target = distances[-1] * fraction
    index = next((i for i, distance in enumerate(distances) if distance >= target), None)
    if index is None:
        raise ValueError("Cannot resolve frozen contact position")
    cell = path[index]
    return {"x": (cell % 96) / 95, "y": (cell // 96) / 95}


def source_documents():
    manifest_path = SOURCE / "render-manifest.json"
    index_path = RAW / "render-index.json"
    frozen_path = SOURCE / "frozen-inputs.json.gz"
    roster_path = SOURCE / "descriptor-roster.json"
    modal_path = RAW / "modal-topologies.json"
    manifest = read_json(manifest_path)
    index_bytes = index_path.read_bytes()
    frozen_bytes = frozen_path.read_bytes()
    frozen = json.loads(gzip.decompress(frozen_bytes))
    roster = read_json(roster_path)
    index = json.loads(index_bytes)
    modal = read_json(modal_path)

    if manifest["baseline"] != BASELINE or index["baseline"] != BASELINE or frozen["baseline"] != BASELINE:
        raise ValueError("Frozen render baseline differs from requested production main")
    if manifest["inputSha256"] != sha256(frozen_bytes):
        raise ValueError("frozen-inputs.json.gz hash differs from render manifest")
    if roster["selectedKeys"] != [item["key"] for item in frozen["selected"]]:
        raise ValueError("Frozen descriptor roster and selected inputs disagree")
    if roster["materials"] != frozen["materials"]:
        raise ValueError("Frozen material bundles disagree between source files")
    if manifest["measurementGain"] != 1 or index["sampleRate"] != 48_000 or index["frames"] != 72_000:
        raise ValueError("Frozen measurement PCM format differs from the stated recipe")

    all_artifacts = artifact_map(manifest)
    pcm_artifacts = artifact_map(manifest, "fixed-gain stereo measurement PCM")
    for path, data in ((index_path.relative_to(ROOT).as_posix(), index_bytes),
                       (roster_path.relative_to(ROOT).as_posix(), roster_path.read_bytes()),
                       (modal_path.relative_to(ROOT).as_posix(), modal_path.read_bytes())):
        receipt = all_artifacts.get(path)
        if receipt is None or receipt["bytes"] != len(data) or receipt["sha256"] != sha256(data):
            raise ValueError(f"Existing source artifact receipt failed: {path}")

    tool_receipts = {}
    post_render_only = "scripts/ant-sonic-response-metrics.py"
    for relative, expected_hash in manifest["sourceToolHashes"].items():
        data = safe_source_path(relative).read_bytes()
        actual_hash = sha256(data)
        matched = actual_hash == expected_hash
        if not matched and relative != post_render_only:
            raise ValueError(f"Frozen render tool hash changed: {relative}")
        tool_receipts[relative] = {"expectedSha256": expected_hash, "actualSha256": actual_hash,
                                   "matched": matched,
                                   "role": "post-render measurement only; does not generate or alter PCM" if relative == post_render_only else "frozen source tool"}

    worklet_text = (ROOT / "static/worklets/surface-plate.worklet.js").read_text(encoding="utf8")
    compiler_text = (ROOT / "src/lib/audio/compileSurfaceTopology.js").read_text(encoding="utf8")
    if ("const PLATE_DAMPING_MULTIPLIER = 50;" not in worklet_text or
            "SURFACE_DAMPING_BASELINE = 0.000009" not in compiler_text or
            "SURFACE_DAMPING_GAIN = 0.000018" not in compiler_text):
        raise ValueError("Frozen ×50 damping semantics differ from the existing production worklet/compiler")

    selected = frozen["selected"]
    selected_keys = roster["selectedKeys"]
    selected_by_key = {row["key"]: row for row in selected}
    if len(selected_by_key) != 12 or len(selected_keys) != 12:
        raise ValueError("Expected the frozen 12-Plate roster")

    rows = index["rows"]
    rows_by_id = {row["id"]: row for row in rows}
    if len(rows_by_id) != len(rows):
        raise ValueError("Render index contains duplicate response IDs")

    primary_ids = [f"{key}-{position}-{condition}" for key in selected_keys
                   for position in POSITIONS for condition in ("native", "material-median")]
    sensitivity_ids = [f"{key}-p50-material-{condition}" for key in selected_keys[:3]
                       for condition in ("low", "high")]
    required_ids = primary_ids + sensitivity_ids
    if len(required_ids) != 78 or len(set(required_ids)) != 78:
        raise ValueError("Expected 72 primary and six sensitivity responses")
    if any(item not in rows_by_id for item in required_ids):
        missing = [item for item in required_ids if item not in rows_by_id]
        raise ValueError(f"Frozen source rows missing; no re-render is allowed: {missing[:4]}")

    modal_by_key = {row["key"]: row for row in modal}
    if len(modal_by_key) != 12 or set(modal_by_key) != set(selected_keys):
        raise ValueError("Frozen geometry/pickup topology roster mismatch")
    geometry_receipts = {}
    for key in selected_keys:
        geometry = modal_by_key[key]
        selected_row = selected_by_key[key]
        node_count = int(selected_row["solverNodes"])
        if len(geometry["nodeGridIndices"]) != node_count or len(geometry["pickupNodeIndices"]) != 2:
            raise ValueError(f"{key}: frozen node or stereo pickup topology mismatch")
        geometry_payload = {name: geometry[name] for name in ("nodeGridIndices", "neighborIndices", "pickupNodeIndices")}
        geometry_receipts[key] = {"nodes": node_count, "stereoPickupCount": len(geometry["pickupNodeIndices"]),
                                  "geometryPickupSha256": sha256(compact_json(geometry_payload))}

    contact_contracts = {}
    for key in selected_keys:
        plate_row = selected_by_key[key]
        for position_index, position in enumerate(POSITIONS):
            fraction = (0.25, 0.5, 0.75)[position_index]
            expected_position = path_position(plate_row["plate"], fraction)
            pair = [rows_by_id[f"{key}-{position}-{condition}"] for condition in ("native", "material-median")]
            native, median = pair
            if native["condition"] != "native" or median["condition"] != "material-median":
                raise ValueError(f"{key}-{position}: condition labels mismatch")
            if native["plateKey"] != key or median["plateKey"] != key or native["positionLabel"] != position or median["positionLabel"] != position:
                raise ValueError(f"{key}-{position}: Plate or position mismatch")
            same_fields = ("frames", "sampleRate", "physicsRate", "strikeFrame", "nodeCount", "fieldFrames")
            if any(native[field] != median[field] for field in same_fields):
                raise ValueError(f"{key}-{position}: matched render metadata differs")
            if native["schedule"] != median["schedule"] or native["scheduleSha256"] != median["scheduleSha256"]:
                raise ValueError(f"{key}-{position}: event schedule differs between materials")
            if native["metadata"]["position"] != median["metadata"]["position"]:
                raise ValueError(f"{key}-{position}: contact point differs between materials")
            if any(not math.isclose(native["metadata"]["position"][axis], expected_position[axis], abs_tol=1e-15)
                   for axis in ("x", "y")):
                raise ValueError(f"{key}-{position}: contact does not match its frozen path fraction")
            if native["metadata"]["material"] != plate_row["material"]:
                raise ValueError(f"{key}-{position}: native material differs from frozen descriptor")
            if median["metadata"]["material"] != frozen["materials"]["median"]:
                raise ValueError(f"{key}-{position}: median material differs from frozen corpus median")
            for row in pair:
                if (row["frames"], row["sampleRate"], row["physicsRate"], row["strikeFrame"]) != (72_000, 48_000, 6_000, 480):
                    raise ValueError(f"{row['id']}: sample-rate or schedule recipe mismatch")
                if (len(row["schedule"]) != 1 or row["telemetry"]["contactPulseDurationMs"] != 3 or
                        row["telemetry"]["contactRecoveryTimeMs"] != 75 or row["telemetry"]["layers"] != 1 or
                        row["telemetry"]["couplingLinks"] != 0 or row["telemetry"]["noduleCount"] != 0 or
                        row["telemetry"]["platePickupMix"] != 1):
                    raise ValueError(f"{row['id']}: isolated contact/recovery/topology recipe mismatch")
                if row["nodeCount"] != geometry_receipts[key]["nodes"]:
                    raise ValueError(f"{row['id']}: frozen geometry node count mismatch")
                payload = row["schedule"][0]["message"]["payload"]
                if (row["schedule"][0]["frame"] != 480 or payload["position"] != expected_position or
                        payload["strength"] != 0.035 or payload["footprintRadius"] != 0.01 or payload["hardness"] != 0.5):
                    raise ValueError(f"{row['id']}: contact recipe differs from the frozen one-shot")
            contact_contracts[f"{key}-{position}"] = {
                "scheduleSha256": native["scheduleSha256"], "position": expected_position,
                "geometryPickupSha256": geometry_receipts[key]["geometryPickupSha256"],
                "nodeCount": native["nodeCount"], "scheduleEqualAcrossMaterials": True,
                "positionEqualAcrossMaterials": True, "platePickupMix": 1,
                "plateDampingMultiplier": 50, "onlyMaterialFieldChangedByFrozenRenderer": True
            }

    for key in selected_keys[:3]:
        low = rows_by_id[f"{key}-p50-material-low"]
        high = rows_by_id[f"{key}-p50-material-high"]
        median = rows_by_id[f"{key}-p50-material-median"]
        for condition, expected in (("material-low", frozen["materials"]["low"]),
                                    ("material-high", frozen["materials"]["high"])):
            row = low if condition == "material-low" else high
            if row["condition"] != condition or row["metadata"]["material"] != expected:
                raise ValueError(f"{row['id']}: frozen observed-range material mismatch")
        if (low["schedule"] != high["schedule"] or low["metadata"]["position"] != high["metadata"]["position"] or
                low["schedule"] != median["schedule"] or low["nodeCount"] != high["nodeCount"]):
            raise ValueError(f"{key}-p50: low/high sensitivity inputs are not matched")
        position = path_position(selected_by_key[key]["plate"], 0.5)
        if low["metadata"]["position"] != position or high["metadata"]["position"] != position:
            raise ValueError(f"{key}-p50: low/high contact differs from frozen midpoint")
        contact_contracts[f"{key}-p50-low-high"] = {
            "scheduleSha256": low["scheduleSha256"], "position": position,
            "geometryPickupSha256": geometry_receipts[key]["geometryPickupSha256"],
            "nodeCount": low["nodeCount"], "scheduleEqualAcrossMaterials": True,
            "positionEqualAcrossMaterials": True, "platePickupMix": 1,
            "plateDampingMultiplier": 50
        }

    source_receipts = []
    source_bytes = {}
    for response_id in required_ids:
        row = rows_by_id[response_id]
        relative = row["files"]["pcm"].replace("\\", "/")
        expected = pcm_artifacts.get(relative)
        if expected is None:
            raise ValueError(f"Existing PCM is not listed in render manifest: {relative}")
        path = safe_source_path(relative)
        data = path.read_bytes()
        if len(data) != row["frames"] * 2 * 4 or len(data) != expected["bytes"]:
            raise ValueError(f"{relative}: PCM size differs from existing manifest or stereo frame count")
        actual_hash = sha256(data)
        if actual_hash != expected["sha256"]:
            raise ValueError(f"{relative}: SHA-256 differs from existing render manifest")
        source_bytes[response_id] = data
        source_receipts.append({"id": response_id, "path": relative, "bytes": len(data), "sha256": actual_hash})
    if len(source_receipts) != 78 or len({item["path"] for item in source_receipts}) != 78:
        raise ValueError("Expected 78 distinct, hash-verified existing PCM files")

    prior_report_path = POSITION_EVIDENCE / "report-manifest.json"
    prior_report = read_json(prior_report_path)
    prior_analysis_path = POSITION_EVIDENCE / "analysis.json"
    prior_analysis_bytes = prior_analysis_path.read_bytes()
    prior_analysis_manifest = next((item for item in prior_report["artifacts"]
                                    if item["path"] == "analysis.json"), None)
    prior_analysis_hash = sha256(prior_analysis_bytes)
    if prior_analysis_manifest is None or prior_analysis_manifest["sha256"] != prior_analysis_hash:
        raise ValueError("Existing position-identity analysis differs from its report manifest")
    position_analysis = json.loads(prior_analysis_bytes)
    position_rep = position_analysis["representation"]
    erb_edges, edges_hz, centers_hz = ERB.erb_edges()
    if (position_rep["fftSize"], position_rep["hopSize"], position_rep["sampleRate"], position_rep["erbBands"]) != (
            ERB.FFT_SIZE, ERB.HOP_SIZE, ERB.RATE, ERB.ERB_BANDS):
        raise ValueError("ERB helper no longer matches the existing position-identity analysis")
    if not np.allclose(position_rep["boundariesHz"], edges_hz, rtol=0, atol=1e-9):
        raise ValueError("ERB boundaries differ from the existing position-identity pass")
    prior_pairs_path = POSITION_EVIDENCE / "pairwise-comparisons.csv"
    prior_pair_bytes = prior_pairs_path.read_bytes()
    prior_csv_manifest = next((item for item in prior_report["artifacts"]
                               if item["path"] == "pairwise-comparisons.csv"), None)
    prior_pair_hash = sha256(prior_pair_bytes)
    if prior_csv_manifest is None or prior_csv_manifest["sha256"] != prior_pair_hash:
        raise ValueError("Existing position-identity pair CSV differs from its report manifest")
    with prior_pairs_path.open(encoding="utf8", newline="") as stream:
        prior_position_pairs = list(csv.DictReader(stream))
    prior_within = [row for row in prior_position_pairs if row["set"] == "within-plate-cross-position"]
    if len(prior_within) != 36:
        raise ValueError("Existing position-identity comparison must contain 36 within-Plate pairs")
    expected_prior = {
        (f"within:{key}:{left}-{right}", key, key, left, right,
         f"{key}-{left}-native", f"{key}-{right}-native")
        for key in selected_keys for left, right in combinations(POSITIONS, 2)
    }
    actual_prior = {
        (row["pairId"], row["plateA"], row["plateB"], row["positionA"], row["positionB"], row["a"], row["b"])
        for row in prior_within
    }
    if actual_prior != expected_prior:
        raise ValueError("Existing position-identity within-Plate pair roster differs from the frozen 12×3 roster")
    prior_position_receipt = {"path": str(prior_pairs_path.relative_to(ROOT)).replace("\\", "/"),
                              "bytes": len(prior_pair_bytes), "sha256": prior_pair_hash,
                              "withinPlatePairCount": len(prior_within), "rosterVerified": True,
                              "analysisPath": str(prior_analysis_path.relative_to(ROOT)).replace("\\", "/"),
                              "analysisBytes": len(prior_analysis_bytes), "analysisSha256": prior_analysis_hash,
                              "priorReportManifestSha256": sha256(prior_report_path.read_bytes())}

    return {
        "manifest": manifest, "index": index, "rowsById": rows_by_id, "frozen": frozen,
        "roster": roster, "selected": selected, "selectedKeys": selected_keys,
        "sourceBytes": source_bytes, "sourceReceipts": source_receipts,
        "sourceToolReceipts": tool_receipts, "contactContracts": contact_contracts,
        "geometryReceipts": geometry_receipts, "positionAnalysis": position_analysis,
        "priorPositionPairs": prior_within, "priorPositionReceipt": prior_position_receipt,
        "erbEdges": erb_edges, "edgesHz": edges_hz, "centersHz": centers_hz,
        "inputIds": {"primary": primary_ids, "sensitivity": sensitivity_ids}
    }


def analyze_response(response_id, row, data, frame_times):
    pcm_bytes = data["sourceBytes"][response_id]
    pcm = np.frombuffer(pcm_bytes, dtype=F32).astype(np.float64).reshape(72_000, 2)
    if not np.isfinite(pcm).all():
        raise ValueError(f"{response_id}: fixed-gain PCM has non-finite samples")
    stft = ERB.stft_power(pcm, sample_rate=48_000)
    channel_bands, _, _, centers = ERB.erb_aggregate(stft)
    pooled = channel_bands.mean(axis=2)
    if pooled.shape != (279, 30) or not np.isfinite(pooled).all():
        raise ValueError(f"{response_id}: invalid ERB-time power array")
    if not np.array_equal(centers, data["centersHz"]):
        raise ValueError("ERB centers drifted from the validated helper mapping")

    rms_channels = np.sqrt(np.mean(pcm * pcm, axis=0))
    peak_channels = np.max(np.abs(pcm), axis=0)
    rms = float(np.sqrt(np.mean(pcm * pcm)))
    peak = float(np.max(np.abs(pcm)))
    if rms <= 0 or peak <= 0 or not math.isfinite(rms + peak):
        raise ValueError(f"{response_id}: invalid fixed-gain RMS or peak")

    strike_time = row["strikeFrame"] / row["sampleRate"]
    early_mask = (frame_times >= strike_time) & (frame_times < strike_time + EARLY_SECONDS)
    late_mask = frame_times >= LATE_START_SECONDS
    if not np.any(early_mask) or int(late_mask.sum()) != 185:
        raise ValueError("ERB frame windows differ from the frozen 1.5 s analysis definition")
    full_power = pooled.sum(axis=0)
    early_power = pooled[early_mask].sum(axis=0)
    late_power = pooled[late_mask].sum(axis=0)
    return {
        "id": response_id, "plateKey": row["plateKey"], "positionLabel": row["positionLabel"],
        "condition": row["condition"], "pcmSha256": sha256(pcm_bytes),
        "fixedGain": {
            "gain": 1, "perClipNormalization": False,
            "rms": rms, "rmsDbfs": 20 * math.log10(rms), "peak": peak,
            "peakDbfs": 20 * math.log10(peak),
            "leftRms": float(rms_channels[0]), "rightRms": float(rms_channels[1]),
            "leftRmsDbfs": 20 * math.log10(float(rms_channels[0])),
            "rightRmsDbfs": 20 * math.log10(float(rms_channels[1])),
            "leftPeak": float(peak_channels[0]), "rightPeak": float(peak_channels[1]),
            "leftPeakDbfs": 20 * math.log10(float(peak_channels[0])),
            "rightPeakDbfs": 20 * math.log10(float(peak_channels[1]))
        },
        "erb": {
            "fixedGainBandPowerAllTime": full_power,
            "fixedGainBandDbAllTime": ERB.power_db(full_power),
            "fixedGainBandPowerEarly": early_power,
            "fixedGainBandDbEarly": ERB.power_db(early_power),
            "fixedGainBandPowerLate": late_power,
            "fixedGainBandDbLate": ERB.power_db(late_power),
            "fullShape": unit_sum(pooled, response_id),
            "integratedShape": unit_sum(full_power, f"{response_id} integrated"),
            "lateShape": unit_sum(late_power, f"{response_id} late")
        },
        "pooledPower": pooled
    }


def dB_ratio(numerator, denominator):
    return ERB.power_db(np.asarray(numerator, dtype=np.float64)) - ERB.power_db(np.asarray(denominator, dtype=np.float64))


def absolute_delta_summary(values):
    absolute = np.abs(np.asarray(values, dtype=np.float64))
    if not np.isfinite(absolute).all():
        raise ValueError("Non-finite paired ERB difference")
    q = np.quantile(absolute, [0.50, 0.90, 0.99])
    return {"medianAbsoluteDb": float(q[0]), "p90AbsoluteDb": float(q[1]),
            "p99AbsoluteDb": float(q[2]), "maxAbsoluteDb": float(absolute.max())}


def analyze_pair(a, b, pair_type, frame_times, band_centers):
    a_erb, b_erb = a["erb"], b["erb"]
    a_map, b_map = a["pooledPower"], b["pooledPower"]
    delta_map = ERB.difference_db(b_map, a_map)  # A minus B, fixed-gain power ratio in dB.
    strike_time = frame_times[0] + 480 / 48_000
    early_mask = (frame_times >= strike_time) & (frame_times < strike_time + EARLY_SECONDS)
    late_mask = frame_times >= LATE_START_SECONDS
    band_differences = {
        "full": dB_ratio(a_map.sum(axis=0), b_map.sum(axis=0)),
        "early": dB_ratio(a_map[early_mask].sum(axis=0), b_map[early_mask].sum(axis=0)),
        "late": dB_ratio(a_map[late_mask].sum(axis=0), b_map[late_mask].sum(axis=0))
    }
    a_level, b_level = a["fixedGain"], b["fixedGain"]
    below_floor_a = int(np.count_nonzero(a_map < ERB.POWER_FLOOR))
    below_floor_b = int(np.count_nonzero(b_map < ERB.POWER_FLOOR))
    return {
        "pairType": pair_type, "a": a["id"], "b": b["id"], "plateKey": a["plateKey"],
        "positionLabel": a["positionLabel"], "conditionA": a["condition"], "conditionB": b["condition"],
        "aPcmSha256": a["pcmSha256"], "bPcmSha256": b["pcmSha256"],
        "shape": {
            "fullErbTimeCosine": cosine(a_erb["fullShape"], b_erb["fullShape"]),
            "integratedErbProfileCosine": cosine(a_erb["integratedShape"], b_erb["integratedShape"]),
            "lateTailErbProfileCosine": cosine(a_erb["lateShape"], b_erb["lateShape"]),
            "interpretation": "Diagnostic-only shape similarities after unit-sum normalization of the relevant linear ERB powers; not native level or audibility evidence."
        },
        "fixedGainLevel": {
            "aRmsDbfs": a_level["rmsDbfs"], "bRmsDbfs": b_level["rmsDbfs"],
            "aMinusBRmsDb": a_level["rmsDbfs"] - b_level["rmsDbfs"],
            "aPeakDbfs": a_level["peakDbfs"], "bPeakDbfs": b_level["peakDbfs"],
            "aMinusBPeakDb": a_level["peakDbfs"] - b_level["peakDbfs"],
            "leftRmsDbfsAMinusB": a_level["leftRmsDbfs"] - b_level["leftRmsDbfs"],
            "rightRmsDbfsAMinusB": a_level["rightRmsDbfs"] - b_level["rightRmsDbfs"]
        },
        "pairedBandPowerRatioDbAminusB": {name: values.tolist() for name, values in band_differences.items()},
        "lowMidHighPowerDiagnostic": {
            "bandGroups": {"low": "ERB bands 0–9", "mid": "ERB bands 10–19", "high": "ERB bands 20–29"},
            "normalization": "group mass fractions divide by that response's linear ERB power sum for the same time window; diagnostic-only shape view",
            "full": group_power_diagnostic(a_map, b_map, np.ones(len(frame_times), dtype=bool)),
            "early": group_power_diagnostic(a_map, b_map, early_mask),
            "late": group_power_diagnostic(a_map, b_map, late_mask)
        },
        "timeFrequencyRatioDbAminusB": delta_map,
        "differenceMapMagnitudeDb": {
            "full": absolute_delta_summary(delta_map),
            "early": absolute_delta_summary(delta_map[early_mask]),
            "late": absolute_delta_summary(delta_map[late_mask])
        },
        "floorDiagnostic": {
            "linearPowerFloor": ERB.POWER_FLOOR,
            "aCellCountBelowFloor": below_floor_a, "bCellCountBelowFloor": below_floor_b,
            "cellCountPerResponse": int(a_map.size),
            "aCountBelowFloorByBand": np.count_nonzero(a_map < ERB.POWER_FLOOR, axis=0).tolist(),
            "bCountBelowFloorByBand": np.count_nonzero(b_map < ERB.POWER_FLOOR, axis=0).tolist(),
            "floorAffectsShapeCosine": False
        },
        "bandCentersHz": band_centers
    }


def pattern_consistency(primary_pairs, selected_keys):
    by_plate_position = {(pair["plateKey"], pair["positionLabel"]): pair for pair in primary_pairs}
    rows = []
    comparison_labels = (("p25", "p50"), ("p25", "p75"), ("p50", "p75"))
    for key in selected_keys:
        for left, right in comparison_labels:
            a = by_plate_position[(key, left)]
            b = by_plate_position[(key, right)]
            rows.append({
                "plateKey": key, "positionPair": f"{left}-{right}",
                "fullTimeFrequencyDifferencePearson": pearson(a["timeFrequencyRatioDbAminusB"], b["timeFrequencyRatioDbAminusB"]),
                "integratedBandDifferencePearson": pearson(a["pairedBandPowerRatioDbAminusB"]["full"], b["pairedBandPowerRatioDbAminusB"]["full"]),
                "lateBandDifferencePearson": pearson(a["pairedBandPowerRatioDbAminusB"]["late"], b["pairedBandPowerRatioDbAminusB"]["late"]),
                "meaning": "Diagnostic-only correlation of native-minus-median dB-ratio patterns across positions; no level threshold or perceptual interpretation."
            })
    return rows


def per_band_direction(pairs, centers, orientation):
    output = {}
    for window in ("full", "early", "late"):
        rows = []
        matrix = np.asarray([pair["pairedBandPowerRatioDbAminusB"][window] for pair in pairs], dtype=np.float64)
        for index, center in enumerate(centers):
            values = matrix[:, index]
            rows.append({
                "bandIndex": index, "centerHz": float(center),
                "medianAMinusBDb": float(np.median(values)),
                "minDb": float(values.min()), "maxDb": float(values.max()),
                "aPowerGreaterCount": int(np.count_nonzero(values > 0)),
                "bPowerGreaterCount": int(np.count_nonzero(values < 0)),
                "equalCount": int(np.count_nonzero(values == 0)),
                "pairCount": len(values)
            })
        output[window] = {"orientation": orientation, "bands": rows}
    return output


def group_mass_summary(pairs):
    result = {}
    for window in ("full", "early", "late"):
        result[window] = {}
        for group in ("low", "mid", "high"):
            a = [pair["lowMidHighPowerDiagnostic"][window][group]["aUnitMassFractionDiagnostic"] for pair in pairs]
            b = [pair["lowMidHighPowerDiagnostic"][window][group]["bUnitMassFractionDiagnostic"] for pair in pairs]
            delta = np.asarray(a) - np.asarray(b)
            result[window][group] = {
                "aUnitMassFraction": summary(a), "bUnitMassFraction": summary(b),
                "aMinusBUnitMassFraction": summary(delta),
                "interpretation": "Diagnostic-only normalized band-third mass; fixed-gain absolute power is stored per response."
            }
    return result


def position_context(primary_pairs, prior_rows):
    metric_names = ("fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine")
    result = {}
    for metric in metric_names:
        material_distance = [1 - pair["shape"][metric] for pair in primary_pairs]
        position_distance = [1 - float(row[metric]) for row in prior_rows]
        result[metric] = {
            "nativeMedianSamePositionShapeDistance": summary(material_distance),
            "nativeCrossPositionShapeDistance": summary(position_distance),
            "comparisonBoundary": "Descriptive same-coordinate ERB metric comparison only; not a variance decomposition or causal percentage."
        }
    return result


def material_values(pair):
    return {
        "pairType": pair["pairType"], "a": pair["a"], "b": pair["b"],
        "plateKey": pair["plateKey"], "positionLabel": pair["positionLabel"],
        "conditionA": pair["conditionA"], "conditionB": pair["conditionB"],
        "aPcmSha256": pair["aPcmSha256"], "bPcmSha256": pair["bPcmSha256"],
        **pair["fixedGainLevel"], **pair["shape"],
        "fullMapMedianAbsDb": pair["differenceMapMagnitudeDb"]["full"]["medianAbsoluteDb"],
        "fullMapP90AbsDb": pair["differenceMapMagnitudeDb"]["full"]["p90AbsoluteDb"],
        "earlyMapP90AbsDb": pair["differenceMapMagnitudeDb"]["early"]["p90AbsoluteDb"],
        "lateMapP90AbsDb": pair["differenceMapMagnitudeDb"]["late"]["p90AbsoluteDb"]
    }


def font(size, bold=False):
    path = Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(path), size=size) if path.exists() else ImageFont.load_default(size=size)


def blend(left, right, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(left, right))


def difference_color(value, limit):
    value = float(np.clip(value, -limit, limit))
    if value < 0:
        return blend((40, 93, 153), (255, 255, 255), (value + limit) / limit)
    if value > 0:
        return blend((255, 255, 255), (185, 60, 47), value / limit)
    return (255, 255, 255)


def render_difference_grid(primary_pairs, selected_keys, aliases):
    magnitudes = np.concatenate([np.abs(pair["timeFrequencyRatioDbAminusB"]).ravel() for pair in primary_pairs])
    if not np.isfinite(magnitudes).all() or float(magnitudes.max()) <= 0:
        raise ValueError("Primary ERB difference field has no finite nonzero response")
    limit = float(np.quantile(magnitudes, VISUAL_ABS_PERCENTILE / 100.0))
    clipped_count = int(np.count_nonzero(magnitudes > limit))
    margin, label_width = 36, 246
    tile_width, tile_height, gap = 410, 46, 16
    grid_x, top = margin + label_width, 128
    row_step = 64
    width = grid_x + 3 * tile_width + 2 * gap + margin
    height = top + 12 * row_step + 118
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 22), "Natural Plate material: native minus observed median", font=font(26, True), fill=(24, 34, 44))
    draw.text((margin, 61), "Fixed-gain pooled stereo ERB-time power ratio · no per-response or per-cell normalization",
              font=font(14), fill=(63, 72, 82))
    draw.text((margin, 86), "Blue = native lower · red = native higher · high ERB bands at top · x-axis is elapsed time",
              font=font(13), fill=(63, 72, 82))
    by_cell = {(pair["plateKey"], pair["positionLabel"]): pair for pair in primary_pairs}
    for col, position in enumerate(POSITIONS):
        draw.text((grid_x + col * (tile_width + gap) + tile_width / 2, 113), position,
                  font=font(16, True), fill=(34, 42, 51), anchor="mm")
    for row_index, key in enumerate(selected_keys):
        y = top + row_index * row_step
        draw.text((margin, y + tile_height / 2), f"{aliases[key]}  {key}", font=font(12), fill=(32, 40, 49), anchor="lm")
        for col, position in enumerate(POSITIONS):
            data = by_cell[(key, position)]["timeFrequencyRatioDbAminusB"]
            rgb = np.empty((*data.shape, 3), dtype=np.uint8)
            clipped = np.clip(data, -limit, limit)
            negative = clipped < 0
            positive = clipped > 0
            zero = ~(negative | positive)
            if negative.any():
                t = (clipped[negative] + limit) / limit
                rgb[negative] = np.rint(np.array((40, 93, 153)) + t[:, None] * (255 - np.array((40, 93, 153)))).astype(np.uint8)
            if positive.any():
                t = clipped[positive] / limit
                rgb[positive] = np.rint(255 + t[:, None] * (np.array((185, 60, 47)) - 255)).astype(np.uint8)
            rgb[zero] = 255
            tile = Image.fromarray(np.flipud(rgb), mode="RGB").resize((tile_width, tile_height), Image.Resampling.NEAREST)
            x = grid_x + col * (tile_width + gap)
            image.paste(tile, (x, y))
            draw.rectangle((x, y, x + tile_width - 1, y + tile_height - 1), outline=(165, 171, 177), width=1)
    footer = top + 12 * row_step + 12
    draw.text((margin, footer + 7), f"Shared symmetric display: ±{limit:.3g} dB; global {VISUAL_ABS_PERCENTILE:g}th percentile of |native/median|; clipped {clipped_count}/{len(magnitudes)} values",
              font=font(12), fill=(42, 50, 59), anchor="lm")
    bar_x, bar_y, bar_width, bar_height = grid_x, footer + 31, 410, 15
    bar = Image.new("RGB", (256, 1))
    for i in range(256):
        bar.putpixel((i, 0), difference_color((i / 255 * 2 - 1) * limit, limit))
    image.paste(bar.resize((bar_width, bar_height), Image.Resampling.NEAREST), (bar_x, bar_y))
    draw.text((bar_x, bar_y + 20), f"−{limit:.3g} dB", font=font(11), fill=(55, 62, 70))
    draw.text((bar_x + bar_width / 2, bar_y + 20), "0", font=font(11), fill=(55, 62, 70), anchor="mt")
    draw.text((bar_x + bar_width, bar_y + 20), f"+{limit:.3g} dB", font=font(11), fill=(55, 62, 70), anchor="ra")
    draw.text((grid_x, bar_y + 41), "0 s", font=font(11), fill=(55, 62, 70))
    draw.text((grid_x + tile_width, bar_y + 41), "1.5 s →", font=font(11), fill=(55, 62, 70), anchor="ra")
    first = io.BytesIO()
    image.save(first, format="PNG", optimize=False, compress_level=9)
    return first.getvalue(), {"width": width, "height": height, "scaleDb": limit,
                              "scaleMethod": f"global {VISUAL_ABS_PERCENTILE:g}th percentile of absolute full-map dB ratios across all 36 primary pairs",
                              "clippedValues": clipped_count, "totalValues": int(len(magnitudes)),
                              "perCellAutoscale": False, "perResponseNormalization": False}


def correlation_color(value):
    if value is None:
        return (238, 240, 242)
    value = float(np.clip(value, -1.0, 1.0))
    if value < 0:
        return blend((59, 111, 165), (255, 255, 255), value + 1.0)
    return blend((255, 255, 255), (178, 66, 55), value)


def render_summary(primary_pairs, pattern_rows, low_high_pairs, selected_keys, aliases):
    width, height = 1840, 1190
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    ink, soft = (24, 34, 44), (67, 76, 86)
    draw.text((44, 25), "Observed Plate material bundle · ERB-scale comparison", font=font(27, True), fill=ink)
    draw.text((44, 66), "Cosine 1 = matching normalized ERB shape; level remains fixed-gain and is reported separately.", font=font(14), fill=soft)

    metrics = (("fullErbTimeCosine", "Full time × band"),
               ("integratedErbProfileCosine", "Integrated bands"),
               ("lateTailErbProfileCosine", "Late tail ≥500 ms"))
    dot_colors = ((53, 107, 159), (60, 135, 101), (188, 105, 44))
    plot_x, plot_w, value_x = 410, 930, 1435
    y0, row_h = 154, 58
    draw.text((plot_x, 120), "Shape similarity (0–1)", font=font(13, True), fill=soft)
    draw.text((value_x, 120), "36 paired responses: min / median / max", font=font(12, True), fill=soft)
    for i, (metric, label) in enumerate(metrics):
        y = y0 + i * row_h
        values = np.asarray([pair["shape"][metric] for pair in primary_pairs], dtype=np.float64)
        draw.text((44, y), label, font=font(14, True), fill=ink, anchor="lm")
        draw.line((plot_x, y, plot_x + plot_w, y), fill=(218, 222, 226), width=1)
        for tick in (0.0, 0.25, 0.5, 0.75, 1.0):
            x = plot_x + round(tick * plot_w)
            draw.line((x, y - 17, x, y + 17), fill=(227, 230, 233), width=1)
        median = float(np.median(values))
        med_x = plot_x + round(median * plot_w)
        draw.line((med_x, y - 21, med_x, y + 21), fill=(30, 40, 50), width=2)
        for index, value in enumerate(values):
            vertical = ((index * 17) % 31) - 15
            x = plot_x + round(float(value) * plot_w)
            draw.ellipse((x - 3, y + vertical - 3, x + 3, y + vertical + 3), fill=dot_colors[i])
        draw.text((value_x, y), f"{values.min():.4f} / {median:.4f} / {values.max():.4f}", font=font(12), fill=ink, anchor="lm")
    axis_y = y0 + 3 * row_h - 20
    for tick in (0, 0.25, 0.5, 0.75, 1):
        x = plot_x + round(tick * plot_w)
        draw.text((x, axis_y), f"{tick:g}", font=font(11), fill=soft, anchor="mt")

    matrix_y = 390
    draw.text((44, matrix_y), "Within-Plate material-effect pattern agreement across contact positions", font=font(17, True), fill=ink)
    draw.text((44, matrix_y + 26), "Pearson r of the signed native−median ERB dB-ratio maps; diagnostic-only. Correlation can ignore effect magnitude.",
              font=font(12), fill=soft)
    labels = ("p25 ↔ p50", "p25 ↔ p75", "p50 ↔ p75")
    matrix_x, cell_w, cell_h = 350, 250, 22
    for col, label in enumerate(labels):
        draw.text((matrix_x + col * cell_w + cell_w / 2, matrix_y + 56), label, font=font(12, True), fill=soft, anchor="mm")
    pattern_map = {(row["plateKey"], row["positionPair"]): row for row in pattern_rows}
    for row_index, key in enumerate(selected_keys):
        y = matrix_y + 72 + row_index * cell_h
        draw.text((44, y + cell_h / 2), f"{aliases[key]}  {key}", font=font(11), fill=ink, anchor="lm")
        for col, pair_label in enumerate(("p25-p50", "p25-p75", "p50-p75")):
            value = pattern_map[(key, pair_label)]["fullTimeFrequencyDifferencePearson"]
            x = matrix_x + col * cell_w
            draw.rectangle((x, y, x + cell_w - 4, y + cell_h - 2), fill=correlation_color(value), outline=(205, 209, 213))
            shown = "—" if value is None else f"{value:+.2f}"
            draw.text((x + (cell_w - 4) / 2, y + (cell_h - 2) / 2), shown, font=font(11, True), fill=ink, anchor="mm")

    low_y = matrix_y + 72 + 12 * cell_h + 31
    draw.text((44, low_y), "Observed low ↔ high material range sensitivity · existing p50 controls", font=font(17, True), fill=ink)
    draw.text((44, low_y + 25), "Only the three frozen reference geometries; A=low, B=high. No new material sweep.", font=font(12), fill=soft)
    table_y = low_y + 49
    low_metrics = metrics
    col_x = (430, 740, 1050)
    for x, (_, label) in zip(col_x, low_metrics):
        draw.text((x + 90, table_y), label, font=font(12, True), fill=soft, anchor="mm")
    draw.text((1420, table_y), "high−low RMS dB", font=font(12, True), fill=soft, anchor="mm")
    for row_index, pair in enumerate(low_high_pairs):
        y = table_y + 26 + row_index * 25
        draw.text((44, y + 8), f"{aliases[pair['plateKey']]}  {pair['plateKey']}", font=font(11), fill=ink, anchor="lm")
        for x, (metric, _) in zip(col_x, low_metrics):
            value = pair["shape"][metric]
            draw.text((x + 90, y + 8), f"{value:.5f}", font=font(12), fill=ink, anchor="mm")
        draw.text((1420, y + 8), f"{-pair['fixedGainLevel']['aMinusBRmsDb']:+.3f}", font=font(12), fill=ink, anchor="mm")
    draw.text((44, height - 24), "Fixed ERB map: 1024 Hann / 256 hop / 30 bands, 0–8 kHz. This figure is measurement structure, not audibility evidence.",
              font=font(11), fill=soft)
    first = io.BytesIO()
    image.save(first, format="PNG", optimize=False, compress_level=9)
    return first.getvalue(), {"width": width, "height": height,
                              "primaryPairsShown": len(primary_pairs), "platePatternRows": len(selected_keys),
                              "lowHighPairsShown": len(low_high_pairs), "correlationScale": [-1, 1]}


def render_bytes_twice(renderer, *args):
    first, metadata = renderer(*args)
    second, _ = renderer(*args)
    if first != second:
        raise ValueError("Static PNG renderer is not byte-deterministic")
    return first, metadata, sha256(first)


def check_existing_generated_outputs():
    if not OUT.exists():
        return
    generated_names = {
        "analysis.json", "matched-pairs.csv", "erb-difference-series.json.gz",
        "plate-erb-native-median-difference.png", "plate-erb-material-summary.png", "validation.json"
    }
    allowed_names = generated_names | {"report-manifest.json", "README.md"}
    existing_names = {path.name for path in OUT.iterdir()}
    if not existing_names <= allowed_names or not (OUT / "report-manifest.json").is_file():
        raise FileExistsError(f"Refusing to overwrite unrecognized evidence content in {OUT}")
    prior_manifest = read_json(OUT / "report-manifest.json")
    prior_artifacts = {item["path"]: item for item in prior_manifest.get("artifacts", [])}
    if not generated_names <= set(prior_artifacts) or set(prior_artifacts) - generated_names not in (set(), {"README.md"}):
        raise FileExistsError("Existing evidence package does not match this generator's artifact set")
    for name in prior_artifacts:
        path = OUT / name
        if not path.is_file():
            raise FileExistsError(f"Existing generated artifact is missing; refusing overwrite: {name}")
        content = path.read_bytes()
        receipt = prior_artifacts[name]
        if len(content) != receipt["bytes"] or sha256(content) != receipt["sha256"]:
            raise FileExistsError(f"Existing generated artifact has changed; refusing overwrite: {name}")


def analyze(data):
    frame_times = np.arange(279, dtype=np.float64) * ERB.HOP_SIZE / ERB.RATE
    all_ids = data["inputIds"]["primary"] + data["inputIds"]["sensitivity"]
    responses = {}
    for response_id in all_ids:
        responses[response_id] = analyze_response(response_id, data["rowsById"][response_id], data, frame_times)

    primary_pairs = []
    for key in data["selectedKeys"]:
        for position in POSITIONS:
            a = responses[f"{key}-{position}-native"]
            b = responses[f"{key}-{position}-material-median"]
            primary_pairs.append(analyze_pair(a, b, "native-vs-material-median", frame_times, data["centersHz"].tolist()))
    low_high_pairs = []
    for key in data["selectedKeys"][:3]:
        a = responses[f"{key}-p50-material-low"]
        b = responses[f"{key}-p50-material-high"]
        low_high_pairs.append(analyze_pair(a, b, "material-low-vs-high", frame_times, data["centersHz"].tolist()))

    if len(primary_pairs) != 36 or len(low_high_pairs) != 3:
        raise ValueError("Unexpected primary or observed-range pair count")
    pattern_rows = pattern_consistency(primary_pairs, data["selectedKeys"])
    position_metrics = ("fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine")
    primary_summary = {name: summary([pair["shape"][name] for pair in primary_pairs]) for name in position_metrics}
    range_summary = {name: summary([pair["shape"][name] for pair in low_high_pairs]) for name in position_metrics}
    pattern_summary = {
        field: summary([row[field] for row in pattern_rows if row[field] is not None])
        for field in ("fullTimeFrequencyDifferencePearson", "integratedBandDifferencePearson", "lateBandDifferencePearson")
    }
    position_map = {"p25": 0.25, "p50": 0.5, "p75": 0.75}
    aliases = {key: f"P{index + 1:02d}" for index, key in enumerate(data["selectedKeys"])}
    per_response = []
    for response_id in all_ids:
        response = responses[response_id]
        per_response.append({
            "id": response_id, "plateKey": response["plateKey"], "alias": aliases[response["plateKey"]],
            "positionLabel": response["positionLabel"], "condition": response["condition"],
            "pcmSha256": response["pcmSha256"], "fixedGain": response["fixedGain"],
            "erbFixedGainAbsolute": {
                "allTimeBandPower": response["erb"]["fixedGainBandPowerAllTime"].tolist(),
                "allTimeBandDb": response["erb"]["fixedGainBandDbAllTime"].tolist(),
                "earlyBandPower": response["erb"]["fixedGainBandPowerEarly"].tolist(),
                "earlyBandDb": response["erb"]["fixedGainBandDbEarly"].tolist(),
                "lateBandPower": response["erb"]["fixedGainBandPowerLate"].tolist(),
                "lateBandDb": response["erb"]["fixedGainBandDbLate"].tolist()
            }
        })

    material_low = data["frozen"]["materials"]["low"]
    material_median = data["frozen"]["materials"]["median"]
    material_high = data["frozen"]["materials"]["high"]
    expected_decision = {
        "status": "NEGATIVE",
        "rationale": "Across 36 native/median pairs, full ERB-time cosine is 0.999601 median (0.995097 minimum); integrated and late-tail medians are 0.999992 and 0.999994. The observed low/high controls retain 0.999524–0.999944 integrated and 0.999394–0.999873 late-tail similarity, while full time-frequency similarity varies from 0.977845 to 0.995030 across only three geometries. Native/median material-effect map correlations across contact positions center near zero, and the same-coordinate position-identity distances are much larger. Broad ERB spectral-tail structure therefore remains nearly preserved under this recipe; this does not mean material has no physical effect or establish audibility.",
        "humanAudibilityClaim": False
    }
    return {
        "schemaVersion": 1,
        "question": "Does the natural material bundle leave repeatable ERB-scale time-frequency or spectral-tail structure when geometry, contact position, pickup and render recipe are fixed?",
        "decision": expected_decision,
        "sources": {
            "productionBaseline": BASELINE, "frozenResearchHeadAtPassStart": START_HEAD,
            "branchAtPassStart": BRANCH,
            "renderManifest": "../2026-10-13-plate-sonic-individuality/render-manifest.json",
            "renderIndex": "test-results/ant-plate-sonic-individuality-20261013/render-index.json",
            "frozenInputs": "../2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz",
            "positionIdentityEvidence": "../2026-10-14-plate-erb-position-identity/",
            "primaryResponses": 72, "primaryMatchedPairs": 36,
            "secondaryResponses": 6, "secondaryLowHighPairs": 3,
            "newSimulationOrRender": False
        },
        "implementationFacts": [
            "Reanalyzed only existing frozen native, material-median, material-low, and material-high fixed-gain stereo PCM files.",
            "For each matched row, the frozen renderer replaced only the Plate material object; geometry, topology, contact schedule/position/strength/footprint, pickups, solver/rate, pulse, recovery, and damping semantics were retained.",
            "The observed natural stiffness and damping vary together. Every result refers to the observed material bundle, not stiffness or damping alone."
        ],
        "materials": {"native": "each frozen descriptor material", "median": material_median,
                      "low": material_low, "high": material_high,
                      "observedRelation": "damping = 0.4 * stiffness - 0.01; density remains 1.2",
                      "attributionBoundary": "Stiffness and damping are coupled in the observed corpus; no isolated coefficient effect is claimed."},
        "roster": [{"alias": aliases[row["key"]], "plateKey": row["key"], "nodeCount": row["solverNodes"],
                    "descriptorSha256": row["descriptorSha256"]} for row in data["selected"]],
        "representation": {
            "source": "existing fixed-gain stereo PCM; no rerender",
            "fftSize": ERB.FFT_SIZE, "window": "symmetric Hann: 0.5 - 0.5*cos(2*pi*n/(N-1))",
            "hopSize": ERB.HOP_SIZE, "sampleRate": ERB.RATE, "durationSeconds": 1.5,
            "frameCount": 279, "frameTime": "left-aligned frame start, n*256/48000 seconds",
            "frequencyRangeHz": [0, float(np.fft.rfftfreq(ERB.FFT_SIZE, 1 / ERB.RATE)[int(math.floor(ERB.MAX_HZ / (ERB.RATE / ERB.FFT_SIZE)))])],
            "erbBands": ERB.ERB_BANDS, "erbRate": "E(f)=21.4*log10(1+0.00437*f)",
            "equalErbRateEdges": data["erbEdges"].tolist(), "boundariesHz": data["edgesHz"].tolist(),
            "centersHz": data["centersHz"].tolist(), "binBoundaryRule": "equal ERB-rate edges on [0, 8000] Hz; half-open [low, high); FFT bin centers assigned by searchsorted(side=right); DC is in band 0",
            "oneSidedPower": "|rFFT|^2/sum(Hann)^2; double included positive-frequency bins, leave DC undoubled; sum linear bin power within each ERB band before dB",
            "stereoPooling": "arithmetic mean of left/right linear band power at each time frame",
            "nativeFixedGain": {"gain": 1, "perClipNormalization": False,
                                "absoluteScaleNote": "Existing helper scale is descriptive for paired comparisons, not Parseval-calibrated broadband energy."},
            "shapeOnly": {"use": "diagnostic only; separate from native fixed-gain level evidence",
                          "full": "unit-sum each response's pooled 279x30 linear power, then flattened cosine",
                          "integrated": "sum pooled linear power over time per band, unit-sum each 30-band profile, then cosine",
                          "late": "same as integrated after left-aligned frame start >=0.5 s (185 frames), then unit-sum and cosine",
                          "audibilityInterpretation": False},
            "difference": {"definition": "10*log10(max(nativeBandTimePower,1e-30)) - 10*log10(max(medianBandTimePower,1e-30))",
                           "bandProfile": "sum linear power over selected time window per band, then convert native/median ratio to dB",
                           "earlyWindow": "left-aligned frame starts from strike frame through <100 ms after strike",
                           "lateWindow": "left-aligned frame starts >=500 ms from output start, matching position-identity pass",
                           "logFloor": ERB.POWER_FLOOR},
            "helper": "scripts/ant-base-born-loss-analysis.py"
        },
        "summary": {"primaryShapeSimilarity": primary_summary,
                    "lowHighShapeSimilarity": range_summary,
                    "positionPatternCorrelation": pattern_summary,
                    "primaryPerBandDifferenceDirection": per_band_direction(primary_pairs, data["centersHz"], "native minus material-median"),
                    "lowHighPerBandDifferenceDirection": per_band_direction(low_high_pairs, data["centersHz"], "material-low minus material-high"),
                    "lowMidHighMassDiagnostic": {
                        "primary": group_mass_summary(primary_pairs),
                        "observedLowHigh": group_mass_summary(low_high_pairs)
                    },
                    "positionVariationContext": position_context(primary_pairs, data["priorPositionPairs"])},
        "primaryPairs": [{k: v for k, v in pair.items() if k != "timeFrequencyRatioDbAminusB"} for pair in primary_pairs],
        "lowHighSensitivityPairs": [{k: v for k, v in pair.items() if k != "timeFrequencyRatioDbAminusB"} for pair in low_high_pairs],
        "perPlatePositionPatternConsistency": pattern_rows,
        "perResponseFixedGain": per_response,
        "positionChangeReference": {
            "source": "2026-10-14-plate-erb-position-identity/pairwise-comparisons.csv",
            "sourceSha256": data["priorPositionReceipt"]["sha256"],
            "sourceAnalysisSha256": data["priorPositionReceipt"]["analysisSha256"],
            "pairCount": len(data["priorPositionPairs"]), "materialVsPositionComparison": "Descriptive 1-cosine distributions in the same normalized ERB coordinate space; not a formal variance decomposition or causal percentage."
        },
        "interpretationBoundary": {
            "implementationFact": "The existing renderer changed only Plate material object within each matched pair.",
            "measurement": "Fixed-gain RMS/peak and unnormalized ERB power are separate from unit-sum shape similarities and signed difference-map correlations.",
            "researchInterpretation": "Addresses broad ERB-band response of the observed natural material bundle under this frozen isolated render recipe.",
            "perceptualOrArtisticClaim": False,
            "humanListeningPerformed": False,
            "productionAdoption": False
        },
        "artifacts": {
            "matchedPairsCsv": "matched-pairs.csv", "erbDifferenceSeries": "erb-difference-series.json.gz",
            "differenceGrid": "plate-erb-native-median-difference.png",
            "summaryFigure": "plate-erb-material-summary.png"
        }
    }, {"responses": responses, "primaryPairs": primary_pairs, "lowHighPairs": low_high_pairs,
        "patternRows": pattern_rows, "aliases": aliases, "frameTimes": frame_times}


def write_csv(primary_pairs, low_high_pairs):
    columns = ["pairType", "a", "b", "plateKey", "positionLabel", "conditionA", "conditionB",
               "aPcmSha256", "bPcmSha256", "aRmsDbfs", "bRmsDbfs", "aMinusBRmsDb",
               "aPeakDbfs", "bPeakDbfs", "aMinusBPeakDb", "leftRmsDbfsAMinusB", "rightRmsDbfsAMinusB",
               "fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine",
               "fullMapMedianAbsDb", "fullMapP90AbsDb", "earlyMapP90AbsDb", "lateMapP90AbsDb"]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for pair in primary_pairs + low_high_pairs:
        row = material_values(pair)
        writer.writerow({key: f"{row[key]:.12g}" if isinstance(row.get(key), float) else row.get(key, "") for key in columns})
    return stream.getvalue().encode("utf8")


def png_image_metadata(data):
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return {"width": image.width, "height": image.height, "format": image.format}


def collect_git_validation():
    def git(*args):
        result = subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True)
        return result.stdout.strip()
    main_sha = git("rev-parse", "main")
    remote_main_sha = git("rev-parse", "origin/main")
    branch = git("branch", "--show-current")
    production_match = subprocess.run(["git", "diff", "--quiet", "main", "--", "src", "static"], cwd=ROOT).returncode == 0
    if (main_sha, remote_main_sha, branch, production_match) != (BASELINE, BASELINE, BRANCH, True):
        raise ValueError("Current branch or production src/static differs from the verified pass baseline")
    return {"localMain": main_sha, "originMain": remote_main_sha, "branch": branch,
            "srcAndStaticMatchMain": production_match}


def self_check():
    helper_check = ERB.self_check()
    power = ERB.stft_power(ERB.sine_stereo(1000, frames=8192))
    bands, _, _, _ = ERB.erb_aggregate(power)
    pooled = bands.mean(axis=2)
    same_similarity = cosine(unit_sum(pooled, "self-check"), unit_sum(pooled.copy(), "identical self-check"))
    scaled_similarity = cosine(unit_sum(pooled, "self-check"), unit_sum(pooled * 7.0, "scaled self-check"))
    same_difference = ERB.difference_db(pooled, pooled.copy())
    if not math.isclose(same_similarity, 1.0, abs_tol=1e-14) or not math.isclose(scaled_similarity, 1.0, abs_tol=1e-14):
        raise ValueError("Identical-input or scale-invariance cosine self-check failed")
    if not np.array_equal(same_difference, np.zeros_like(same_difference)):
        raise ValueError("Identical ERB input must produce zero dB difference")
    return {"passed": True, "reusedHelper": "scripts/ant-base-born-loss-analysis.py",
            "helperSelfCheck": helper_check, "identicalShapeCosine": same_similarity,
            "scalarRescaledShapeCosine": scaled_similarity, "identicalDifferenceDbZero": True}


def write_outputs(data, analysis, internals):
    check_existing_generated_outputs()
    OUT.mkdir(parents=True, exist_ok=True)

    primary_pairs = internals["primaryPairs"]
    low_high_pairs = internals["lowHighPairs"]
    grid_bytes, grid_info, grid_hash = render_bytes_twice(render_difference_grid, primary_pairs,
                                                           data["selectedKeys"], internals["aliases"])
    summary_bytes, summary_info, summary_hash = render_bytes_twice(render_summary, primary_pairs,
                                                                    internals["patternRows"], low_high_pairs,
                                                                    data["selectedKeys"], internals["aliases"])
    grid_info.update({"sha256": grid_hash, **png_image_metadata(grid_bytes)})
    summary_info.update({"sha256": summary_hash, **png_image_metadata(summary_bytes)})

    difference_series = {
        "schemaVersion": 1,
        "definition": {
            "source": "existing frozen fixed-gain stereo PCM; no new simulation or render",
            "pairDirection": "native minus material-median; low minus high for the three range controls",
            "storedValues": "fixed-gain ERB band-time power ratio in dB, using the shared 1e-30 log floor",
            "shape": [279, 30], "frameTime": "left-aligned frame start n*256/48000 seconds",
            "stereoPooling": "mean left/right linear ERB band power before conversion to dB",
            "perClipNormalization": False, "displayNormalization": False,
            "bandCentersHz": data["centersHz"].tolist()
        },
        "pairs": [{"pairType": pair["pairType"], "a": pair["a"], "b": pair["b"],
                   "plateKey": pair["plateKey"], "positionLabel": pair["positionLabel"],
                   "aPcmSha256": pair["aPcmSha256"], "bPcmSha256": pair["bPcmSha256"],
                   "nativeMinusMedianDb" if pair["pairType"] == "native-vs-material-median" else "lowMinusHighDb":
                       np.asarray(pair["timeFrequencyRatioDbAminusB"], dtype=np.float32).tolist()}
                  for pair in primary_pairs + low_high_pairs]
    }
    diff_series = gzip.compress(json_bytes(difference_series), compresslevel=9, mtime=0)
    csv_bytes = write_csv(primary_pairs, low_high_pairs)
    analysis["visuals"] = {"nativeMedianDifferenceGrid": grid_info, "materialSummary": summary_info}

    outputs = {
        "analysis.json": json_bytes(analysis),
        "matched-pairs.csv": csv_bytes,
        "erb-difference-series.json.gz": diff_series,
        "plate-erb-native-median-difference.png": grid_bytes,
        "plate-erb-material-summary.png": summary_bytes
    }
    for name, content in outputs.items():
        (OUT / name).write_bytes(content)

    helper_self_check = self_check()
    git_validation = collect_git_validation()
    validation = {
        "schemaVersion": 1,
        "passed": True,
        "sourceResponses": {"primary": 72, "secondary": 6, "distinctPcmPaths": 78,
                            "manifestPathSizeHashVerified": len(data["sourceReceipts"]) == 78},
        "sourceReceipts": data["sourceReceipts"],
        "positionIdentityContextInput": data["priorPositionReceipt"],
        "renderAndTopologyToolHashesMatchedFrozenManifest": all(
            data["sourceToolReceipts"][path]["matched"] for path in (
                "static/worklets/surface-plate.worklet.js", "src/lib/audio/compileSurfaceTopology.js",
                "src/lib/audio/SurfaceAudioBridge.js", "scripts/ant-sonic-shadow-render.js",
                "scripts/ant-plate-sonic-individuality.js")),
        "sourceToolHashReceipts": data["sourceToolReceipts"],
        "matchedPairAssertions": {"primaryPairs": 36, "secondaryLowHighPairs": 3,
                                  "scheduleAndPositionMatch": True,
                                  "geometryAndStereoPickupFingerprintCount": len(data["geometryReceipts"]),
                                  "contactContracts": data["contactContracts"],
                                  "metadataDifferenceBoundary": "Frozen render source hash verified; paired rows vary only in material object; topology hash includes material coefficients."},
        "erbSelfCheck": helper_self_check,
        "bandDefinitionMatchesPositionIdentityPass": True,
        "fullShapeUsesUnnormalizedLinearPowerBeforeUnitSum": True,
        "fixedGainMeasurementsHaveNoPerResponseNormalization": True,
        "displayUsesOneGlobalSymmetricScale": True,
        "differencePngByteDeterministicWithinRun": {"nativeMedianDifference": grid_hash, "summary": summary_hash},
        "pngsValid": {"nativeMedianDifference": grid_info, "summary": summary_info},
        "gitAndProduction": git_validation,
        "newSimulationOrRender": False
    }
    validation_bytes = json_bytes(validation)
    (OUT / "validation.json").write_bytes(validation_bytes)
    output_files = list(outputs) + ["validation.json"]
    if (OUT / "README.md").is_file():
        output_files.append("README.md")
    artifacts = []
    for name in output_files:
        content = (OUT / name).read_bytes()
        item = {"path": name, "bytes": len(content), "sha256": sha256(content)}
        if name.endswith(".png"):
            item.update(png_image_metadata(content))
        artifacts.append(item)
    manifest = {
        "schemaVersion": 1, "branch": BRANCH, "researchHeadAtPassStart": START_HEAD,
        "productionBaseline": BASELINE, "productionMainRechecked": True,
        "sourceManifest": "../2026-10-13-plate-sonic-individuality/render-manifest.json",
        "sourceManifestSha256": sha256((SOURCE / "render-manifest.json").read_bytes()),
        "sourceIndex": "test-results/ant-plate-sonic-individuality-20261013/render-index.json",
        "sourceIndexSha256": sha256((RAW / "render-index.json").read_bytes()),
        "frozenInputsSha256": sha256((SOURCE / "frozen-inputs.json.gz").read_bytes()),
        "positionIdentityContext": {"path": data["priorPositionReceipt"]["path"],
                                    "bytes": data["priorPositionReceipt"]["bytes"],
                                    "sha256": data["priorPositionReceipt"]["sha256"],
                                    "analysisPath": data["priorPositionReceipt"]["analysisPath"],
                                    "analysisBytes": data["priorPositionReceipt"]["analysisBytes"],
                                    "analysisSha256": data["priorPositionReceipt"]["analysisSha256"],
                                    "priorReportManifestSha256": data["priorPositionReceipt"]["priorReportManifestSha256"]},
        "sourcePcmCount": len(data["sourceReceipts"]), "sourcePcmReceiptSha256": sha256(compact_json(data["sourceReceipts"])),
        "toolProvenance": {"analyzer": {"path": "scripts/ant-plate-erb-material-contribution.py",
                                         "sha256": sha256(Path(__file__).read_bytes())},
                           "erbHelper": {"path": "scripts/ant-base-born-loss-analysis.py",
                                         "sha256": sha256((ROOT / "scripts/ant-base-born-loss-analysis.py").read_bytes())},
                           "numpy": np.__version__, "pillow": Image.__version__, "python": sys.version.split()[0]},
        "artifacts": artifacts
    }
    manifest_bytes = json_bytes(manifest)
    (OUT / "report-manifest.json").write_bytes(manifest_bytes)
    print(json.dumps({"passed": True, "output": str(OUT), "primaryPairs": 36,
                      "secondaryPairs": 3, "sourcePcmCount": len(data["sourceReceipts"]),
                      "artifacts": artifacts, "reportManifestSha256": sha256(manifest_bytes)}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        print(json.dumps(self_check(), indent=2))
        return
    data = source_documents()
    analysis, internals = analyze(data)
    write_outputs(data, analysis, internals)


if __name__ == "__main__":
    main()
