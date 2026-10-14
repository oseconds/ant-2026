#!/usr/bin/env python3
"""Reanalyze the existing frozen-world Z one-shots at ERB scale; never renders audio."""
import csv
import gzip
import hashlib
import importlib.util
import io
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
import PIL
from PIL import Image, ImageDraw, ImageFont

sys.dont_write_bytecode = True


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality"
POSITION = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-position-identity"
MATERIAL = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-material-contribution"
RAW = ROOT / "test-results/ant-plate-sonic-individuality-20261013"
OUT = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-z-coupling"
PLATES = (38, 37, 36, 35)
CONDITIONS = ("world-isolated", "world-none", "world-z", "world-zn")
BASELINE = "d45823d40c9a87c1b333fa9872f3c897ee9ab01b"
BRANCH = "codex/ant-base-born-causal-decomposition-20261014"
START_HEAD = "3ec2d3d451de9cdf578a14ad9a64ed03cfcffe08"
F32 = np.dtype("<f4")
EARLY_MS = 100
LATE_MS = 500
VISUAL_PERCENTILE = 99.5


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


def safe_source_path(relative):
    path = (ROOT / relative).resolve()
    if path != ROOT and ROOT not in path.parents:
        raise ValueError(f"Source path escapes repository: {relative}")
    return path


def cosine(a, b):
    a = np.asarray(a, dtype=np.float64).reshape(-1)
    b = np.asarray(b, dtype=np.float64).reshape(-1)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not math.isfinite(denominator) or denominator <= 0:
        raise ValueError("Cosine input has zero or non-finite norm")
    return float(np.clip(np.dot(a, b) / denominator, 0.0, 1.0))


def pearson(a, b):
    x, y = np.asarray(a, dtype=np.float64).reshape(-1), np.asarray(b, dtype=np.float64).reshape(-1)
    if x.shape != y.shape or not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError("Pattern-correlation inputs must be aligned and finite")
    x, y = x - x.mean(), y - y.mean()
    denominator = float(np.linalg.norm(x) * np.linalg.norm(y))
    return None if denominator <= 0 else float(np.clip(np.dot(x, y) / denominator, -1.0, 1.0))


def summarize(values):
    values = np.asarray(values, dtype=np.float64)
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Cannot summarize empty or non-finite values")
    q = np.quantile(values, [0.10, 0.25, 0.50, 0.75, 0.90])
    return {"count": int(len(values)), "min": float(values.min()), "p10": float(q[0]),
            "p25": float(q[1]), "median": float(q[2]), "mean": float(values.mean()),
            "p75": float(q[3]), "p90": float(q[4]), "max": float(values.max())}


def file_receipt(path):
    data = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(data), "sha256": sha256(data)}


def verify_report_artifacts(evidence, required_paths):
    report_path = evidence / "report-manifest.json"
    report = read_json(report_path)
    by_path = {row["path"]: row for row in report["artifacts"]}
    receipts = [file_receipt(evidence / name) for name in required_paths]
    for receipt in receipts:
        row = by_path.get(Path(receipt["path"]).name)
        if row is None or row["bytes"] != receipt["bytes"] or row["sha256"] != receipt["sha256"]:
            raise ValueError(f"Existing context artifact receipt failed: {receipt['path']}")
    return {"reportManifest": file_receipt(report_path), "artifacts": receipts}


def git_value(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def source_documents():
    manifest_path = SOURCE / "render-manifest.json"
    index_path = RAW / "render-index.json"
    frozen_path = SOURCE / "frozen-inputs.json.gz"
    analysis_manifest_path = SOURCE / "analysis-manifest.json"
    manifest_bytes, index_bytes, frozen_bytes = manifest_path.read_bytes(), index_path.read_bytes(), frozen_path.read_bytes()
    manifest, index = json.loads(manifest_bytes), json.loads(index_bytes)
    frozen = json.loads(gzip.decompress(frozen_bytes))
    analysis_manifest = read_json(analysis_manifest_path)
    if manifest["baseline"] != BASELINE or index["baseline"] != BASELINE or frozen["baseline"] != BASELINE:
        raise ValueError("Frozen source baseline differs from current production main")
    if manifest["inputSha256"] != sha256(frozen_bytes):
        raise ValueError("Frozen world input bytes differ from the existing render manifest")
    if index["sourceSha256"] != manifest["sourceToolHashes"]["static/worklets/surface-plate.worklet.js"]:
        raise ValueError("Frozen render index source worklet does not match the capture manifest")
    if (index["frames"], index["sampleRate"], index["strikeFrame"]) != (72_000, 48_000, 480):
        raise ValueError("Frozen one-shot frame/rate/schedule differs from expected evidence")
    index_receipt = next((row for row in analysis_manifest["artifacts"]
                          if row["path"] == "test-results/ant-plate-sonic-individuality-20261013/render-index.json"), None)
    if (index_receipt is None or index_receipt["bytes"] != len(index_bytes)
            or index_receipt["sha256"] != sha256(index_bytes)):
        raise ValueError("Frozen render index differs from its existing analysis-manifest receipt")
    if len(frozen["world"]["plates"]) != 38 or len(frozen["world"]["nodules"]) != 32:
        raise ValueError("Frozen seed-07 world roster differs from existing evidence")

    if git_value("rev-parse", "main") != BASELINE or git_value("rev-parse", "origin/main") != BASELINE:
        raise ValueError("Current main or origin/main moved from the verified production baseline")
    if git_value("branch", "--show-current") != BRANCH:
        raise ValueError("Research branch differs from the requested branch")
    source_match = subprocess.run(["git", "diff", "--quiet", "main", "--", "src", "static"], cwd=ROOT).returncode == 0
    if not source_match:
        raise ValueError("Production src/ or static/ differs from main")

    generator = (ROOT / "scripts/ant-plate-sonic-individuality.js").read_text(encoding="utf8")
    expected_constructs = (
        "const worldZ=compileSurfaceTopology({plates:inputs.world.plates});",
        "const worldNone={...worldZ,adjacentLinkOffsets:new Int32Array(1025),adjacentLinkNodes:new Uint32Array(0),adjacentLinkCoefficients:new Float32Array(0)};",
        "['world-none',worldNone],['world-z',worldZ]",
    )
    if any(anchor not in generator for anchor in expected_constructs):
        raise ValueError("Frozen generator no longer documents world-none as removal of Z links only")
    source_tool_receipts = {}
    for relative, expected in manifest["sourceToolHashes"].items():
        actual = sha256(safe_source_path(relative).read_bytes())
        matched = actual == expected
        if not matched and relative != "scripts/ant-sonic-response-metrics.py":
            raise ValueError(f"Frozen source tool changed since capture: {relative}")
        source_tool_receipts[relative] = {"expectedSha256": expected, "actualSha256": actual,
            "matched": matched, "role": "post-render metrics only" if not matched else "frozen capture source"}

    rows_by_id = {row["id"]: row for row in index["rows"]}
    artifacts = {row["path"]: row for row in manifest["artifacts"]
                 if row.get("role") == "fixed-gain stereo measurement PCM"}
    if len(artifacts) != len([row for row in manifest["artifacts"]
                              if row.get("role") == "fixed-gain stereo measurement PCM"]):
        raise ValueError("Render manifest contains duplicate PCM paths")
    source_bytes, source_receipts, pair_rows, control_rows, pair_contracts = {}, [], [], [], []
    frozen_plates = {row["id"]: row for row in frozen["world"]["plates"]}
    for number in PLATES:
        plate_key = f"world-seed07-trail-plate-{number}"
        plate_id = f"trail-plate-{number}"
        if plate_id not in frozen_plates:
            raise ValueError(f"Frozen seed-07 world lacks Plate {number}")
        arm_rows = {}
        for condition in CONDITIONS:
            response_id = f"world-trail-plate-{number}-{condition}"
            row = rows_by_id.get(response_id)
            if row is None:
                raise ValueError(f"Missing frozen render-index response: {response_id}")
            if row["plateKey"] != plate_key or row["positionLabel"] != "exposed":
                raise ValueError(f"Frozen response roster or position label mismatch: {response_id}")
            relative = row["files"]["pcm"].replace("\\", "/")
            expected = artifacts.get(relative)
            if expected is None:
                raise ValueError(f"PCM absent from original render manifest: {relative}")
            raw_path = safe_source_path(relative)
            data = raw_path.read_bytes()
            actual_hash = sha256(data)
            if len(data) != row["frames"] * 2 * 4 or len(data) != expected["bytes"] or actual_hash != expected["sha256"]:
                raise ValueError(f"PCM path/size/SHA-256 mismatch: {relative}")
            source_bytes[response_id] = data
            source_receipts.append({"id": response_id, "path": relative, "bytes": len(data), "sha256": actual_hash})
            arm_rows[condition] = row
        isolated, none, z, zn = (arm_rows[name] for name in CONDITIONS)
        for control_name, left, right, left_id, right_id in (
            ("isolated-equals-none", isolated, none,
             f"world-trail-plate-{number}-world-isolated", f"world-trail-plate-{number}-world-none"),
            ("z-equals-zn", z, zn,
             f"world-trail-plate-{number}-world-z", f"world-trail-plate-{number}-world-zn")):
            exact = source_bytes[left_id] == source_bytes[right_id]
            if not exact:
                raise ValueError(f"Manipulation control failed for Plate {number}: {control_name}")
            control_rows.append({"plate": number, "control": control_name, "exactPcmMatch": exact,
                                 "sha256": sha256(source_bytes[left_id])})

        pair_fields = ("frames", "sampleRate", "physicsRate", "strikeFrame", "positionLabel", "nodeCount", "schedule", "scheduleSha256")
        if any(none[field] != z[field] for field in pair_fields):
            raise ValueError(f"Plate {number}: world-none and world-z contact or solver metadata differs")
        for field in ("position", "exposedCells", "nodules"):
            if none["metadata"][field] != z["metadata"][field]:
                raise ValueError(f"Plate {number}: world-none and world-z {field} differs")
        if none["metadata"]["nodules"] != 0 or z["metadata"]["nodules"] != 0:
            raise ValueError(f"Plate {number}: selected exposure unexpectedly hosts a Nodule")
        if (none["metadata"]["totalLinks"], z["metadata"]["totalLinks"]) != (0, 14_772):
            raise ValueError(f"Plate {number}: frozen Z-link manipulation differs from the recorded topology")
        if len(none["schedule"]) != 1 or none["schedule"][0]["frame"] != 480:
            raise ValueError(f"Plate {number}: frozen render is not the expected one-contact schedule")
        payload = none["schedule"][0]["message"]["payload"]
        if (none["metadata"]["position"] != payload["position"] or payload["strength"] != 0.035
                or payload["footprintRadius"] != 0.01 or payload["hardness"] != 0.5):
            raise ValueError(f"Plate {number}: frozen contact position/strength/footprint differs")
        for row in (none, z):
            telemetry = row["telemetry"]
            if (telemetry["layers"], telemetry["noduleCount"], telemetry["integratedSphereModes"],
                telemetry["contactPulseDurationMs"], telemetry["contactRecoveryTimeMs"], telemetry["platePickupMix"]) != (38, 0, 0, 3, 75, 1):
                raise ValueError(f"Plate {number}: frozen pickup, pulse, recovery, or world topology contract differs")
        if frozen_plates[plate_id].get("material") is None:
            raise ValueError(f"Frozen Plate {number} material is unavailable")
        pair_rows.append({"plate": number, "plateKey": plate_key, "none": none, "z": z,
                          "noneId": f"world-trail-plate-{number}-world-none",
                          "zId": f"world-trail-plate-{number}-world-z",
                          "material": frozen_plates[plate_id]["material"]})
        pair_contracts.append({"plate": number, "positionLabel": "exposed",
            "position": none["metadata"]["position"], "exposedCells": none["metadata"]["exposedCells"],
            "scheduleSha256": none["scheduleSha256"], "contact": payload,
            "geometryNodeCount": none["nodeCount"], "frozenMaterial": frozen_plates[plate_id]["material"],
            "worldLayerCount": none["telemetry"]["layers"],
            "worldNoneZLinkCount": none["metadata"]["totalLinks"], "worldZLinkCount": z["metadata"]["totalLinks"],
            "pickupMix": none["telemetry"]["platePickupMix"],
            "sameFrozenWorldInputAndPickups": True,
            "onlyTopologyArraysZeroedByWorldNone": True})
    if len(pair_rows) != 4 or len(source_receipts) != 16 or len({row["path"] for row in source_receipts}) != 16:
        raise ValueError("Expected four paired Plate responses and sixteen distinct verified condition PCM files")

    # The prior ERB passes are the fixed coordinate and shape-distance reference for context only.
    position_receipt = verify_report_artifacts(POSITION, ("analysis.json", "pairwise-comparisons.csv"))
    material_receipt = verify_report_artifacts(MATERIAL, ("analysis.json", "matched-pairs.csv"))
    position_analysis = read_json(POSITION / "analysis.json")
    material_analysis = read_json(MATERIAL / "analysis.json")
    edges_erb, edges_hz, centers_hz = ERB.erb_edges()
    frequency_bins = np.fft.rfftfreq(ERB.FFT_SIZE, 1 / ERB.RATE)[
        :int(math.floor(ERB.MAX_HZ / (ERB.RATE / ERB.FFT_SIZE))) + 1]
    bin_bands = np.clip(np.searchsorted(edges_hz, frequency_bins, side="right") - 1,
                        0, ERB.ERB_BANDS - 1)
    populated_bands = np.unique(bin_bands)
    empty_bands = np.setdiff1d(np.arange(ERB.ERB_BANDS), populated_bands)
    if len(populated_bands) != 29 or not np.array_equal(empty_bands, np.array([3])):
        raise ValueError("The reused ERB map no longer has the verified 29 populated bands and empty band 3")
    for analysis in (position_analysis, material_analysis):
        representation = analysis["representation"]
        if (representation["fftSize"], representation["hopSize"], representation["sampleRate"], representation["erbBands"]) != (
            ERB.FFT_SIZE, ERB.HOP_SIZE, ERB.RATE, ERB.ERB_BANDS):
            raise ValueError("Existing ERB context uses a different transform or band count")
        if not np.allclose(representation["boundariesHz"], edges_hz, rtol=0, atol=1e-9):
            raise ValueError("Existing ERB context band edges differ from the reused helper")

    with (POSITION / "pairwise-comparisons.csv").open(encoding="utf8", newline="") as stream:
        position_pairs = [row for row in csv.DictReader(stream) if row["set"] == "within-plate-cross-position"]
    with (MATERIAL / "matched-pairs.csv").open(encoding="utf8", newline="") as stream:
        material_pairs = [row for row in csv.DictReader(stream) if row["pairType"] == "native-vs-material-median"]
    if len(position_pairs) != 36 or len(material_pairs) != 36:
        raise ValueError("Existing position/material context pair counts differ from verified prior evidence")
    return {
        "manifest": manifest, "index": index, "frozen": frozen, "sourceBytes": source_bytes,
        "sourceReceipts": source_receipts, "sourceToolReceipts": source_tool_receipts,
        "pairs": pair_rows, "pairContracts": pair_contracts, "controls": control_rows, "edgesErb": edges_erb,
        "edgesHz": edges_hz, "centersHz": centers_hz,
        "populatedBandIndices": populated_bands.tolist(), "emptyBandIndices": empty_bands.tolist(),
        "positionPairs": position_pairs,
        "materialPairs": material_pairs,
        "contextReceipts": {"position": position_receipt, "material": material_receipt},
        "priorReportReceipts": {"position": file_receipt(POSITION / "report-manifest.json"),
                                "material": file_receipt(MATERIAL / "report-manifest.json")},
        "git": {"main": BASELINE, "originMain": BASELINE, "branch": BRANCH, "srcAndStaticMatchMain": True}
    }


def self_check():
    helper = ERB.self_check()
    silence = np.zeros((4096, 2), dtype=np.float64)
    silence_bands, _, _, _ = ERB.erb_aggregate(ERB.stft_power(silence))
    assert np.isfinite(silence_bands).all() and not np.any(silence_bands)
    assert np.isfinite(ERB.power_db(silence_bands)).all()
    sine = ERB.stft_power(ERB.sine_stereo(1000, frames=8192))
    band_power, _, _, centers = ERB.erb_aggregate(sine)
    pooled = band_power.mean(axis=2)
    scaled = pooled * 13.0
    assert cosine(pooled, pooled.copy()) == 1.0
    assert math.isclose(cosine(pooled / pooled.sum(), scaled / scaled.sum()), 1.0, abs_tol=1e-14)
    difference = ERB.difference_db(pooled, pooled.copy())
    assert np.array_equal(difference, np.zeros_like(difference))
    edges_erb, edges_hz, centers_hz = ERB.erb_edges()
    assert len(centers) == ERB.ERB_BANDS and np.isfinite(edges_hz).all() and np.isfinite(centers_hz).all()
    assert np.all(np.diff(edges_erb) > 0) and np.all(np.diff(edges_hz) > 0) and np.all(np.diff(centers_hz) > 0)
    assert edges_hz[0] == 0 and math.isclose(edges_hz[-1], 8000, abs_tol=1e-9)
    return {"passed": True, "helper": "scripts/ant-base-born-loss-analysis.py", "helperCheck": helper,
            "silenceFiniteAndZero": True, "toneBandsFinite": True, "sameInputDifferenceDbZero": True,
            "identicalCosine": 1.0, "positiveScaleInvariantCosine": 1.0,
            "monotonicFiniteBandMapping": True}


def erb_response(response_id, pcm_bytes, frame_times, centers):
    pcm = np.frombuffer(pcm_bytes, dtype=F32).astype(np.float64).reshape(72_000, 2)
    if not np.isfinite(pcm).all():
        raise ValueError(f"{response_id}: PCM contains non-finite samples")
    channel_power = ERB.stft_power(pcm, sample_rate=48_000)
    bands, _, _, actual_centers = ERB.erb_aggregate(channel_power)
    pooled = bands.mean(axis=2)
    if pooled.shape != (279, 30) or not np.isfinite(pooled).all() or not np.array_equal(actual_centers, centers):
        raise ValueError(f"{response_id}: ERB transform or band mapping mismatch")
    strike_sample = 480
    early_samples = pcm[strike_sample:strike_sample + 4_800]
    late_samples = pcm[24_000:]
    rms_channels = np.sqrt(np.mean(pcm * pcm, axis=0))
    peak_channels = np.max(np.abs(pcm), axis=0)
    rms = float(np.sqrt(np.mean(pcm * pcm)))
    peak = float(np.max(np.abs(pcm)))
    if min(rms, peak) <= 0:
        raise ValueError(f"{response_id}: invalid fixed-gain level")
    early_mask = (frame_times >= 0.010) & (frame_times < 0.110)
    late_mask = frame_times >= 0.500
    if int(early_mask.sum()) != 19 or int(late_mask.sum()) != 185:
        raise ValueError("ERB time windows differ from the prior frozen-analysis convention")
    return {
        "pcm": pcm, "power": pooled,
        "fullBands": pooled.sum(axis=0), "earlyBands": pooled[early_mask].sum(axis=0),
        "lateBands": pooled[late_mask].sum(axis=0),
        "fullShape": pooled / pooled.sum(),
        "integratedShape": pooled.sum(axis=0) / pooled.sum(),
        "lateShape": pooled[late_mask].sum(axis=0) / pooled[late_mask].sum(),
        "fixed": {"rms": rms, "rmsDbfs": 20 * math.log10(rms), "peak": peak,
                  "peakDbfs": 20 * math.log10(peak),
                  "leftRms": float(rms_channels[0]), "rightRms": float(rms_channels[1]),
                  "leftRmsDbfs": 20 * math.log10(float(rms_channels[0])),
                  "rightRmsDbfs": 20 * math.log10(float(rms_channels[1])),
                  "leftPeak": float(peak_channels[0]), "rightPeak": float(peak_channels[1]),
                  "leftPeakDbfs": 20 * math.log10(float(peak_channels[0])),
                  "rightPeakDbfs": 20 * math.log10(float(peak_channels[1])),
                  "earlyEnergy": float(np.sum(early_samples * early_samples)),
                  "earlyRms": float(np.sqrt(np.mean(early_samples * early_samples))),
                  "lateEnergy": float(np.sum(late_samples * late_samples)),
                  "lateRms": float(np.sqrt(np.mean(late_samples * late_samples)))},
        "masks": {"early": early_mask, "late": late_mask}
    }


def delta_db(a, b):
    return ERB.power_db(np.asarray(b, dtype=np.float64)) - ERB.power_db(np.asarray(a, dtype=np.float64))


def abs_summary(values):
    absolute = np.abs(np.asarray(values, dtype=np.float64))
    q = np.quantile(absolute, [0.5, 0.9, 0.99])
    return {"medianAbsoluteDb": float(q[0]), "p90AbsoluteDb": float(q[1]),
            "p99AbsoluteDb": float(q[2]), "maxAbsoluteDb": float(absolute.max())}


def read_context_distance(rows, cosine_field, filter_fn):
    selected = [row for row in rows if filter_fn(row)]
    values = [1 - float(row[cosine_field]) for row in selected]
    return summarize(values)


def analyze(data):
    helper_check = self_check()
    frame_times = np.arange(279, dtype=np.float64) * 256 / 48_000
    center_hz = data["centersHz"]
    responses, pair_results, series_pairs = {}, [], []
    for pair in data["pairs"]:
        none = erb_response(pair["noneId"], data["sourceBytes"][pair["noneId"]], frame_times, center_hz)
        z = erb_response(pair["zId"], data["sourceBytes"][pair["zId"]], frame_times, center_hz)
        responses[pair["noneId"]], responses[pair["zId"]] = none, z
        full_delta = delta_db(none["power"], z["power"])
        bands = {"full": delta_db(none["fullBands"], z["fullBands"]),
                 "early": delta_db(none["earlyBands"], z["earlyBands"]),
                 "late": delta_db(none["lateBands"], z["lateBands"])}
        fixed = {}
        for metric in ("rmsDbfs", "peakDbfs", "leftRmsDbfs", "rightRmsDbfs", "leftPeakDbfs", "rightPeakDbfs"):
            fixed[metric + "DeltaZMinusNone"] = z["fixed"][metric] - none["fixed"][metric]
        for metric in ("earlyEnergy", "earlyRms", "lateEnergy", "lateRms"):
            fixed[metric + "RatioZOverNone"] = z["fixed"][metric] / none["fixed"][metric]
        fixed["earlyEnergyDbZMinusNone"] = 10 * math.log10(fixed["earlyEnergyRatioZOverNone"])
        fixed["lateEnergyDbZMinusNone"] = 10 * math.log10(fixed["lateEnergyRatioZOverNone"])
        fixed["lateRmsDbZMinusNone"] = 20 * math.log10(fixed["lateRmsRatioZOverNone"])
        metric_row = {
            "plate": pair["plate"], "noneId": pair["noneId"], "zId": pair["zId"],
            "nonePcmSha256": sha256(data["sourceBytes"][pair["noneId"]]),
            "zPcmSha256": sha256(data["sourceBytes"][pair["zId"]]),
            "shape": {"fullErbTimeCosine": cosine(none["fullShape"], z["fullShape"]),
                      "integratedErbProfileCosine": cosine(none["integratedShape"], z["integratedShape"]),
                      "lateTailErbProfileCosine": cosine(none["lateShape"], z["lateShape"]),
                      "normalization": "For each response and selected domain, divide pooled nonnegative linear ERB power by its total; diagnostic only."},
            "fixedGain": fixed,
            "differenceMapMagnitudeDb": {"full": abs_summary(full_delta),
                                          "early": abs_summary(full_delta[none["masks"]["early"]]),
                                          "late": abs_summary(full_delta[none["masks"]["late"]])},
            "bandDifferenceDbZMinusNone": {name: values.tolist() for name, values in bands.items()},
            "bandCentersHz": center_hz.tolist(),
            "differenceSignsByBand": {name: {"positive": int(np.sum(values > 0)),
                "negative": int(np.sum(values < 0)), "zero": int(np.sum(values == 0))}
                for name, values in bands.items()},
            "floorDiagnostics": {"displayFloorPower": ERB.POWER_FLOOR,
                "fullMapCellsBelowFloorBothArms": int(np.sum((none["power"] < ERB.POWER_FLOOR) & (z["power"] < ERB.POWER_FLOOR))),
                "fullMapCells": int(none["power"].size),
                "positiveNativePowerBelowFloor": int(np.sum((none["power"] > 0) & (none["power"] < ERB.POWER_FLOOR))),
                "positiveZPowerBelowFloor": int(np.sum((z["power"] > 0) & (z["power"] < ERB.POWER_FLOOR)))}
        }
        pair_results.append(metric_row)
        series_pairs.append({"plate": pair["plate"], "noneId": pair["noneId"], "zId": pair["zId"],
                             "noneSha256": metric_row["nonePcmSha256"], "zSha256": metric_row["zPcmSha256"],
                             "zMinusNoneDb": full_delta.astype(np.float32).tolist(),
                             "bandDeltaDb": {k: v.astype(np.float32).tolist() for k, v in bands.items()}})

    profiles = {"full": [], "early": [], "late": []}
    for pair in data["pairs"]:
        none, z = responses[pair["noneId"]], responses[pair["zId"]]
        for name, key in (("full", "fullBands"), ("early", "earlyBands"), ("late", "lateBands")):
            profiles[name].append(delta_db(none[key], z[key]))
    consistency = {}
    populated = np.asarray(data["populatedBandIndices"], dtype=np.int64)
    for name, values in profiles.items():
        corr_rows = []
        for left in range(4):
            for right in range(left + 1, 4):
                corr_rows.append({"plateA": data["pairs"][left]["plate"],
                                  "plateB": data["pairs"][right]["plate"],
                                  "pearsonPopulatedBandDeltaDb": pearson(values[left][populated], values[right][populated])})
        valid = [row["pearsonPopulatedBandDeltaDb"] for row in corr_rows
                 if row["pearsonPopulatedBandDeltaDb"] is not None]
        same_sign_bands = []
        for band in populated:
            signs = {int(np.sign(values[plate][band])) for plate in range(4)}
            if len(signs) == 1 and 0 not in signs:
                same_sign_bands.append({"bandIndex": int(band), "centerHz": float(center_hz[band]),
                    "direction": "positive" if next(iter(signs)) > 0 else "negative" if next(iter(signs)) < 0 else "zero",
                    "zMinusNoneDbByPlate": [float(values[plate][band]) for plate in range(4)]})
        consistency[name] = {"method": "Pearson correlation across 29 populated ERB-band signed Z-minus-none power-ratio dB profiles; six Plate pairs, descriptive only.",
                             "pairwise": corr_rows,
                             "correlationSummary": summarize(valid) if valid else None,
                             "sameSignAcrossAllFourPlatesBandCount": len(same_sign_bands),
                             "sameSignAcrossAllFourPlatesBands": same_sign_bands}

    context = {
        "metric": "1 minus cosine similarity; within each prior response, pooled linear ERB power is unit-sum normalized; same transform and 30 bands.",
        "descriptiveOnly": True,
        "formalVarianceDecomposition": False,
        "fullErbTime": {
            "ZCoupling": summarize([1 - row["shape"]["fullErbTimeCosine"] for row in pair_results]),
            "naturalMaterialNativeVsMedian": read_context_distance(data["materialPairs"], "fullErbTimeCosine",
                lambda row: row["pairType"] == "native-vs-material-median"),
            "samePlateCrossPosition": read_context_distance(data["positionPairs"], "fullErbTimeCosine",
                lambda row: row["set"] == "within-plate-cross-position")},
        "integratedErbProfile": {
            "ZCoupling": summarize([1 - row["shape"]["integratedErbProfileCosine"] for row in pair_results]),
            "naturalMaterialNativeVsMedian": read_context_distance(data["materialPairs"], "integratedErbProfileCosine",
                lambda row: row["pairType"] == "native-vs-material-median"),
            "samePlateCrossPosition": read_context_distance(data["positionPairs"], "integratedErbProfileCosine",
                lambda row: row["set"] == "within-plate-cross-position")},
        "lateTailErbProfile": {
            "ZCoupling": summarize([1 - row["shape"]["lateTailErbProfileCosine"] for row in pair_results]),
            "naturalMaterialNativeVsMedian": read_context_distance(data["materialPairs"], "lateTailErbProfileCosine",
                lambda row: row["pairType"] == "native-vs-material-median"),
            "samePlateCrossPosition": read_context_distance(data["positionPairs"], "lateTailErbProfileCosine",
                lambda row: row["set"] == "within-plate-cross-position")}}

    analysis = {
        "schemaVersion": 1,
        "question": "Do existing frozen-world one-shots show Z coupling beyond fine phase/transfer changes, in actual stereo pickup broad ERB-time/spectral-tail structure?",
        "decision": {"status": "MIXED", "rationale": "The four pickups show partly repeated full and late signed ERB-band delta patterns, but native integrated and late-tail shape and fixed-gain tail energy remain nearly unchanged. Full-response distances overlap the natural-material range, and all Z distances are far below the prior contact-position variation."},
        "implementationFact": "The existing frozen seed-07 world render rows were reanalyzed; no new simulation or render was produced. The matched world-none shadow removes inter-layer Z-link arrays only; the world-z row restores those links.",
        "measurement": {"pairCount": len(pair_results), "pairs": pair_results,
                        "zDifferencePatternConsistency": consistency,
                        "contextDistanceComparison": context},
        "representation": {
            "source": "existing fixed-gain stereo PCM; no rerender",
            "sampleRate": 48_000, "frames": 72_000, "durationSeconds": 1.5,
            "fftSize": ERB.FFT_SIZE, "window": "symmetric Hann: 0.5 - 0.5*cos(2*pi*n/(N-1))",
            "hopSize": ERB.HOP_SIZE, "frameCount": 279,
            "frameTime": "left-aligned frame start, n*256/48000 seconds",
            "frequencyRangeHz": [0, 7968.75], "erbBands": ERB.ERB_BANDS,
            "erbRate": "E(f)=21.4*log10(1+0.00437*f)",
            "equalErbRateEdges": data["edgesErb"].tolist(), "boundariesHz": data["edgesHz"].tolist(),
            "centersHz": center_hz.tolist(),
            "populatedBandIndices": data["populatedBandIndices"], "emptyBandIndices": data["emptyBandIndices"],
            "bandOccupancyRule": "FFT bin-center assignment using the reused helper; all 30 planned bands remain in the representation, while empty band 3 is omitted only from cross-Plate correlation and shared-sign counts.",
            "binBoundaryRule": "half-open [low, high); frequency-bin centers mapped to equal ERB-rate bands; DC included in band zero",
            "dcTreatment": "DC one-sided linear power is undoubled; included positive-frequency bins are doubled",
            "stereoPooling": "mean left/right linear ERB-band power per frame before profiles, shape metrics, and dB conversion",
            "nativeFixedGain": {"gain": 1, "perClipNormalization": False,
                "linearPower": "|rFFT|^2/sum(Hann)^2; double positive-frequency bins except DC; sum bin power inside ERB band before dB",
                "displayPowerFloor": ERB.POWER_FLOOR, "displayRangeDb": [-100, 0],
                "absoluteScaleNotParsevalCalibrated": True},
            "shapeOnlyDiagnostic": {"normalization": "For each arm, divide the pooled linear ERB-time power over the compared domain by total power for that domain.",
                "domains": {"full": "all 279 frames × 30 bands", "integrated": "sum over all frames into 30 bands",
                            "lateTail": "sum frames with left-aligned frame time >=500 ms into 30 bands"},
                "metric": "cosine similarity; no power floor; separate from native fixed-gain levels; diagnostic only, not audibility evidence"},
            "windows": {"early": {"fromStrikeMs": 0, "durationMs": EARLY_MS, "startTimeSeconds": 0.010, "endExclusiveSeconds": 0.110},
                        "late": {"startTimeMs": LATE_MS, "endTimeMs": 1500}}},
        "controls": {"worldIsolatedEqualsWorldNone": True, "worldZEqualsWorldZn": True,
                     "pairSourceConditionDifference": "inter-layer Z-link arrays; the fixed-world generator source and equal schedule/material/pickup/topology metadata were checked"},
        "interpretationBoundary": {"researchInterpretation": "Z is a property of this frozen stratigraphic network context, not an intrinsic property of any one Plate.",
            "artisticOrPerceptualClaim": False, "humanListeningPerformed": False, "productionAdoption": False},
        "provenance": {"productionBaseline": BASELINE, "researchBranch": BRANCH, "researchHeadAtPassStart": START_HEAD,
                        "sourceManifest": "../2026-10-13-plate-sonic-individuality/render-manifest.json",
                        "sourceIndex": "test-results/ant-plate-sonic-individuality-20261013/render-index.json",
                        "frozenInput": "../2026-10-13-plate-sonic-individuality/frozen-inputs.json.gz",
                        "sourcePCMCount": 16, "sourcePCM": data["sourceReceipts"],
                        "sourceTools": data["sourceToolReceipts"],
                        "priorContext": data["contextReceipts"]},
        "artifacts": {"matchedPairs": "matched-pairs.csv", "differenceSeries": "erb-difference-series.json.gz",
                      "differenceFigure": "plate-erb-z-coupling-difference.png",
                      "summaryFigure": "plate-erb-z-coupling-summary.png"},
        "validationSelfCheck": helper_check
    }
    return analysis, pair_results, series_pairs, responses, consistency, context


def font(size, bold=False):
    candidate = Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(str(candidate), size=size) if candidate.exists() else ImageFont.load_default(size=size)


def blend(a, b, t):
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def diff_color(value, limit):
    value = float(np.clip(value, -limit, limit))
    if value < 0:
        return blend((40, 93, 153), (255, 255, 255), (value + limit) / limit)
    if value > 0:
        return blend((255, 255, 255), (185, 60, 47), value / limit)
    return (255, 255, 255)


def draw_difference_figure(responses, pairs):
    maps = []
    for pair in pairs:
        none = responses[pair["noneId"]]["power"]
        z = responses[pair["zId"]]["power"]
        maps.append(ERB.difference_db(none, z))
    absolute = np.concatenate([np.abs(values).ravel() for values in maps])
    limit = float(np.quantile(absolute, VISUAL_PERCENTILE / 100.0))
    if not math.isfinite(limit) or limit <= 0:
        raise ValueError("Global Z difference display scale must be finite and nonzero")
    clipped = int(np.sum(absolute > limit))
    margin, label_width, tile_w, tile_h, gap = 36, 230, 450, 58, 18
    grid_x, top = margin + label_width, 118
    row_step = 94
    width, height = grid_x + 3 * tile_w + 2 * gap + margin, top + 4 * row_step + 110
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 22), "Frozen-world Z coupling at the stereo Plate pickups", font=font(26, True), fill=(24, 34, 44))
    draw.text((margin, 58), "Existing fixed-gain pooled stereo ERB-time · 279 × 30 · no per-response normalization",
              font=font(14), fill=(63, 72, 82))
    draw.text((margin, 83), "Absolute: common −100…0 dB display · Difference: Z − none power ratio in dB; blue = Z lower, red = Z higher",
              font=font(13), fill=(63, 72, 82))
    columns = ("world-none", "world-z", "Z − none")
    for col, label in enumerate(columns):
        draw.text((grid_x + col * (tile_w + gap) + tile_w / 2, 107), label, font=font(16, True), fill=(34, 42, 51), anchor="mm")
    for row_index, (pair, diff) in enumerate(zip(pairs, maps)):
        y = top + row_index * row_step
        draw.text((margin, y + tile_h / 2), f"Plate {pair['plate']}", font=font(18, True), fill=(32, 40, 49), anchor="lm")
        for col, key in enumerate((pair["noneId"], pair["zId"])):
            db = ERB.power_db(responses[key]["power"])
            gray = np.rint(np.clip((db + 100.0) / 100.0, 0.0, 1.0) * 255).astype(np.uint8)
            tile = Image.fromarray(np.flipud(gray)).convert("RGB").resize((tile_w, tile_h), Image.Resampling.NEAREST)
            x = grid_x + col * (tile_w + gap)
            image.paste(tile, (x, y))
            draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline=(165, 171, 177), width=1)
        rgb = np.empty((*diff.shape, 3), dtype=np.uint8)
        values = np.clip(diff, -limit, limit)
        negative, positive = values < 0, values > 0
        if negative.any():
            t = (values[negative] + limit) / limit
            rgb[negative] = np.rint(np.array((40, 93, 153)) + t[:, None] * (255 - np.array((40, 93, 153)))).astype(np.uint8)
        if positive.any():
            t = values[positive] / limit
            rgb[positive] = np.rint(255 + t[:, None] * (np.array((185, 60, 47)) - 255)).astype(np.uint8)
        rgb[~(negative | positive)] = 255
        tile = Image.fromarray(np.flipud(rgb)).resize((tile_w, tile_h), Image.Resampling.NEAREST)
        x = grid_x + 2 * (tile_w + gap)
        image.paste(tile, (x, y))
        draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline=(165, 171, 177), width=1)
    footer = top + 4 * row_step + 5
    draw.text((margin, footer), f"Shared symmetric difference scale ±{limit:.4g} dB · global {VISUAL_PERCENTILE:g}th percentile of |Z − none|; clipped {clipped}/{absolute.size}",
              font=font(12), fill=(42, 50, 59))
    bx, by, bw, bh = grid_x + 2 * (tile_w + gap), footer + 23, tile_w, 14
    strip = Image.new("RGB", (256, 1))
    for x in range(256):
        strip.putpixel((x, 0), diff_color((x / 255 * 2 - 1) * limit, limit))
    image.paste(strip.resize((bw, bh), Image.Resampling.NEAREST), (bx, by))
    draw.text((bx, by + 18), f"−{limit:.3g} dB", font=font(10), fill=(55, 62, 70))
    draw.text((bx + bw, by + 18), f"+{limit:.3g} dB", font=font(10), fill=(55, 62, 70), anchor="ra")
    draw.text((grid_x, by + 39), "0 s", font=font(11), fill=(55, 62, 70))
    draw.text((grid_x + tile_w, by + 39), "1.5 s →", font=font(11), fill=(55, 62, 70), anchor="ra")
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=False, compress_level=9)
    return out.getvalue(), {"width": width, "height": height, "scaleDb": limit,
        "scaleMethod": "global 99.5th percentile of absolute Z-minus-none ERB-time dB ratios across four Plates",
        "clippedValues": clipped, "totalValues": int(absolute.size),
        "absoluteScaleDbfs": [-100, 0], "perRowAutoscale": False, "perResponseNormalization": False}


def draw_summary(pairs, pair_results, consistency, context):
    width, height = 1680, 930
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((38, 24), "Z coupling: ERB shape change and frozen-set context", font=font(26, True), fill=(24, 34, 44))
    draw.text((38, 60), "Four matched frozen Plate pickups · native fixed-gain levels are separate from unit-sum shape diagnostics",
              font=font(14), fill=(63, 72, 82))
    table_x, table_y = 38, 108
    widths = (130, 160, 170, 175, 115, 145)
    headers = ("Plate", "Full cosine", "Integrated cosine", "Late cosine", "Δ RMS dB", "Δ late energy dB")
    x = table_x
    for label, w in zip(headers, widths):
        draw.text((x + 5, table_y), label, font=font(13, True), fill=(32, 40, 49))
        x += w
    by_number = {row["plate"]: row for row in pair_results}
    for idx, plate in enumerate(pairs):
        row, y = by_number[plate["plate"]], table_y + 27 + idx * 30
        values = (f"Plate {plate['plate']}",
                  f"{row['shape']['fullErbTimeCosine']:.8f}",
                  f"{row['shape']['integratedErbProfileCosine']:.8f}",
                  f"{row['shape']['lateTailErbProfileCosine']:.8f}",
                  f"{row['fixedGain']['rmsDbfsDeltaZMinusNone']:+.4f}",
                  f"{row['fixedGain']['lateEnergyDbZMinusNone']:+.4f}")
        x = table_x
        for value, w in zip(values, widths):
            draw.text((x + 5, y), value, font=font(13), fill=(35, 43, 52))
            x += w
        draw.line((table_x, y + 22, table_x + sum(widths), y + 22), fill=(226, 229, 232), width=1)

    draw.text((38, 275), "Distance context · 1 − cosine (same ERB-time / band-profile coordinates)",
              font=font(17, True), fill=(32, 40, 49))
    draw.text((38, 300), "Markers = medians; lines = observed ranges. All rows share the bounded 0–1 axis. Context comparisons are descriptive only.",
              font=font(12), fill=(63, 72, 82))
    metrics = (("Full ERB-time", "fullErbTime"), ("Integrated ERB profile", "integratedErbProfile"),
               ("Late tail ≥500 ms", "lateTailErbProfile"))
    groups = (("Z coupling · n=4", "ZCoupling", (175, 82, 60)),
              ("Material native↔median · n=36", "naturalMaterialNativeVsMedian", (49, 116, 88)),
              ("Same-Plate position · n=36", "samePlateCrossPosition", (61, 103, 160)))
    chart_x, chart_w, chart_y = 405, 870, 342
    row_h, group_h = 28, 132
    for metric_i, (metric_label, metric_key) in enumerate(metrics):
        section_y = chart_y + metric_i * group_h
        draw.text((38, section_y + 3), metric_label, font=font(14, True), fill=(35, 43, 52))
        for group_i, (label, group_key, color) in enumerate(groups):
            stats = context[metric_key][group_key]
            y = section_y + group_i * row_h + 30
            draw.text((150, y), label, font=font(11), fill=(53, 61, 70))
            x0 = chart_x + chart_w * stats["min"]
            x1 = chart_x + chart_w * stats["max"]
            xm = chart_x + chart_w * stats["median"]
            draw.line((x0, y + 7, x1, y + 7), fill=color, width=3)
            draw.ellipse((xm - 5, y + 2, xm + 5, y + 12), fill=color)
            draw.text((chart_x + chart_w + 18, y),
                      f"med {stats['median']:.2g}  [{stats['min']:.2g}, {stats['max']:.2g}]",
                      font=font(11), fill=(53, 61, 70))
        axis_y = section_y + 119
        draw.line((chart_x, axis_y, chart_x + chart_w, axis_y), fill=(105, 112, 119), width=1)
        draw.text((chart_x, axis_y + 5), "0", font=font(10), fill=(70, 76, 83))
        draw.text((chart_x + chart_w, axis_y + 5), "1", font=font(10), fill=(70, 76, 83), anchor="ra")
    # Pattern agreement is summarized independently; no correlation is treated as an audibility score.
    panel_y = 758
    draw.text((38, panel_y), "Cross-Plate difference-profile consistency", font=font(16, True), fill=(32, 40, 49))
    draw.text((38, panel_y + 25), "Pearson correlation over 29 populated signed ERB-band Z−none dB ratios; 6 Plate pairs per window.",
              font=font(12), fill=(63, 72, 82))
    for idx, window in enumerate(("full", "early", "late")):
        stats = consistency[window]["correlationSummary"]
        same = consistency[window]["sameSignAcrossAllFourPlatesBandCount"]
        text = (f"{window}: median r {stats['median']:+.3f}, range {stats['min']:+.3f}…{stats['max']:+.3f}; "
                f"all-Plate same-sign bands {same}/29")
        draw.text((38, panel_y + 51 + idx * 23), text, font=font(12), fill=(42, 50, 59))
    draw.text((38, 900), "Network-context result only; no human listening, preference, or production-quality claim.",
              font=font(12, True), fill=(52, 60, 68))
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=False, compress_level=9)
    return out.getvalue(), {"width": width, "height": height, "distanceAxis": [0, 1],
        "distanceMark": "median with min-to-max range", "perMetricAutoscale": False}


def write_csv(pair_results):
    columns = ("plate", "noneId", "zId", "nonePcmSha256", "zPcmSha256",
        "fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine",
        "rmsDbfsDeltaZMinusNone", "peakDbfsDeltaZMinusNone", "leftRmsDbfsDeltaZMinusNone",
        "rightRmsDbfsDeltaZMinusNone", "leftPeakDbfsDeltaZMinusNone", "rightPeakDbfsDeltaZMinusNone",
        "earlyEnergyDbZMinusNone", "lateEnergyDbZMinusNone", "lateRmsDbZMinusNone",
        "fullMapMedianAbsDb", "fullMapP90AbsDb", "earlyMapP90AbsDb", "lateMapP90AbsDb")
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in pair_results:
        fixed = row["fixedGain"]
        values = {"plate": row["plate"], "noneId": row["noneId"], "zId": row["zId"],
                  "nonePcmSha256": row["nonePcmSha256"], "zPcmSha256": row["zPcmSha256"],
                  "fullErbTimeCosine": row["shape"]["fullErbTimeCosine"],
                  "integratedErbProfileCosine": row["shape"]["integratedErbProfileCosine"],
                  "lateTailErbProfileCosine": row["shape"]["lateTailErbProfileCosine"],
                  "rmsDbfsDeltaZMinusNone": fixed["rmsDbfsDeltaZMinusNone"],
                  "peakDbfsDeltaZMinusNone": fixed["peakDbfsDeltaZMinusNone"],
                  "leftRmsDbfsDeltaZMinusNone": fixed["leftRmsDbfsDeltaZMinusNone"],
                  "rightRmsDbfsDeltaZMinusNone": fixed["rightRmsDbfsDeltaZMinusNone"],
                  "leftPeakDbfsDeltaZMinusNone": fixed["leftPeakDbfsDeltaZMinusNone"],
                  "rightPeakDbfsDeltaZMinusNone": fixed["rightPeakDbfsDeltaZMinusNone"],
                  "earlyEnergyDbZMinusNone": fixed["earlyEnergyDbZMinusNone"],
                  "lateEnergyDbZMinusNone": fixed["lateEnergyDbZMinusNone"],
                  "lateRmsDbZMinusNone": fixed["lateRmsDbZMinusNone"],
                  "fullMapMedianAbsDb": row["differenceMapMagnitudeDb"]["full"]["medianAbsoluteDb"],
                  "fullMapP90AbsDb": row["differenceMapMagnitudeDb"]["full"]["p90AbsoluteDb"],
                  "earlyMapP90AbsDb": row["differenceMapMagnitudeDb"]["early"]["p90AbsoluteDb"],
                  "lateMapP90AbsDb": row["differenceMapMagnitudeDb"]["late"]["p90AbsoluteDb"]}
        writer.writerow({key: f"{value:.12g}" if isinstance(value, float) else value for key, value in values.items()})
    return out.getvalue().encode("utf8")


def png_info(data):
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        return {"width": image.width, "height": image.height, "format": image.format}


def render_twice(function, *args):
    first, info = function(*args)
    second, _ = function(*args)
    if first != second:
        raise ValueError("Static PNG renderer is not byte-deterministic within one run")
    return first, info, sha256(first)


def run():
    data = source_documents()
    analysis, pair_results, series_pairs, responses, consistency, context = analyze(data)
    difference_png, difference_info, difference_hash = render_twice(draw_difference_figure, responses, data["pairs"])
    summary_png, summary_info, summary_hash = render_twice(draw_summary, data["pairs"], pair_results, consistency, context)
    difference_info.update({"sha256": difference_hash, **png_info(difference_png)})
    summary_info.update({"sha256": summary_hash, **png_info(summary_png)})
    analysis["visuals"] = {"difference": difference_info, "summary": summary_info}

    diff_payload = {"schemaVersion": 1,
        "definition": {"source": "existing fixed-gain stereo PCM; no rerender",
            "direction": "world-z minus world-none; dB difference is log power ratio after linear ERB band aggregation",
            "shape": [279, 30], "frameTime": "left-aligned frame start n*256/48000 seconds",
            "stereoPooling": "mean left/right linear ERB band power before dB conversion",
            "powerFloor": ERB.POWER_FLOOR, "perClipNormalization": False,
            "bandCentersHz": data["centersHz"].tolist()},
        "pairs": series_pairs}
    diff_gzip = gzip.compress(json_bytes(diff_payload), compresslevel=9, mtime=0)
    outputs = {
        "analysis.json": json_bytes(analysis),
        "matched-pairs.csv": write_csv(pair_results),
        "erb-difference-series.json.gz": diff_gzip,
        "plate-erb-z-coupling-difference.png": difference_png,
        "plate-erb-z-coupling-summary.png": summary_png
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, content in outputs.items():
        (OUT / name).write_bytes(content)

    validation = {"schemaVersion": 1, "passed": True,
        "source": {"conditionCount": 16, "distinctPcmPaths": len(data["sourceReceipts"]),
                   "pathSizeSha256VerifiedAgainstOriginalRenderManifest": True,
                   "receipts": data["sourceReceipts"], "sourceManifestSha256": sha256((SOURCE / "render-manifest.json").read_bytes()),
                   "sourceIndexSha256": sha256((RAW / "render-index.json").read_bytes()),
                   "frozenInputsSha256": sha256((SOURCE / "frozen-inputs.json.gz").read_bytes()),
                   "sourceToolHashes": data["sourceToolReceipts"]},
        "roster": {"plates": list(PLATES), "conditions": list(CONDITIONS), "primaryPairs": 4,
                   "positionLabels": ["exposed"]},
        "manipulationControls": {"worldIsolatedEqualsWorldNone": [row for row in data["controls"] if row["control"] == "isolated-equals-none"],
                   "worldZEqualsWorldZn": [row for row in data["controls"] if row["control"] == "z-equals-zn"],
                   "exactPcmControlCount": len(data["controls"]),
                   "pairMetadataMatched": True,
                   "pairContracts": data["pairContracts"],
                   "onlyWorldNoneTopologyDifference": "frozen generator source zeroes adjacent inter-layer link arrays on a copy of the same world-z topology; matched schedule, exposed position, frozen material, rate, geometry node count, pickup mix, pulse/recovery and routing fields verified"},
        "erbSelfCheck": self_check(),
        "sameMappingAsPriorPasses": True,
        "contextEvidenceReceipts": data["contextReceipts"],
        "identicalInputDifferenceZero": True,
        "identicalAndPositiveScaleInvariantShapeCosine": True,
        "noPerClipNormalization": True,
        "erbBandOccupancy": {"populatedBandIndices": data["populatedBandIndices"],
            "emptyBandIndices": data["emptyBandIndices"],
            "excludedEmptyBandFromCrossPlateCorrelationAndSignCounts": True},
        "fixedAbsoluteDisplayScaleDb": [-100, 0],
        "differenceUsesOneGlobalSymmetricScale": difference_info["scaleDb"],
        "differenceDisplayClippedValues": difference_info["clippedValues"],
        "pngsDeterministicWithinRun": {"difference": difference_hash, "summary": summary_hash},
        "pngsValid": {"difference": difference_info, "summary": summary_info},
        "gitAndProduction": data["git"], "newSimulationOrRender": False}
    (OUT / "validation.json").write_bytes(json_bytes(validation))

    artifact_names = list(outputs) + ["validation.json"]
    if (OUT / "README.md").is_file():
        artifact_names.append("README.md")
    artifacts = []
    for name in artifact_names:
        content = (OUT / name).read_bytes()
        row = {"path": name, "bytes": len(content), "sha256": sha256(content)}
        if name.endswith(".png"):
            row.update(png_info(content))
        artifacts.append(row)
    report = {"schemaVersion": 1, "branch": BRANCH, "researchHeadAtPassStart": START_HEAD,
        "productionBaseline": BASELINE, "productionMainRechecked": True,
        "sourceManifest": "../2026-10-13-plate-sonic-individuality/render-manifest.json",
        "sourceManifestSha256": sha256((SOURCE / "render-manifest.json").read_bytes()),
        "sourceIndex": "test-results/ant-plate-sonic-individuality-20261013/render-index.json",
        "sourceIndexSha256": sha256((RAW / "render-index.json").read_bytes()),
        "frozenInputSha256": sha256((SOURCE / "frozen-inputs.json.gz").read_bytes()),
        "erbHelper": {"path": "scripts/ant-base-born-loss-analysis.py",
                      "sha256": sha256((ROOT / "scripts/ant-base-born-loss-analysis.py").read_bytes())},
        "generator": {"path": "scripts/ant-plate-sonic-individuality.js",
                      "sha256": sha256((ROOT / "scripts/ant-plate-sonic-individuality.js").read_bytes())},
        "analysisScript": {"path": "scripts/ant-plate-erb-z-coupling.py", "sha256": sha256(Path(__file__).read_bytes())},
        "contextInputs": data["contextReceipts"], "command": "python scripts/ant-plate-erb-z-coupling.py",
        "python": sys.version.split()[0], "numpy": np.__version__, "pillow": PIL.__version__,
        "artifacts": artifacts}
    (OUT / "report-manifest.json").write_bytes(json_bytes(report))
    print(json.dumps({"output": str(OUT), "pairs": len(pair_results),
        "pngs": {name: {**png_info((OUT / name).read_bytes()), "sha256": sha256((OUT / name).read_bytes())}
                 for name in ("plate-erb-z-coupling-difference.png", "plate-erb-z-coupling-summary.png")},
        "reportManifest": sha256((OUT / "report-manifest.json").read_bytes()),
        "metrics": [{"plate": row["plate"], "shape": row["shape"], "fixedGain": row["fixedGain"]}
                    for row in pair_results]}, ensure_ascii=False))


if __name__ == "__main__":
    run()
