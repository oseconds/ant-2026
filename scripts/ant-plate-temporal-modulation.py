#!/usr/bin/env python3
"""Describe fixed-gain Plate envelopes and detrended modulation-rate shape."""
import argparse
import csv
import gzip
import hashlib
import importlib.util
import io
import itertools
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
NATURAL = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality"
SYNTHETIC = ROOT / "docs/ant/evidence/2026-10-18-synthetic-plate-shape-capability"
NATURAL_RAW = ROOT / "test-results/ant-plate-sonic-individuality-20261013"
EXISTING_ERB = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-position-identity"
OUT = ROOT / "docs/ant/evidence/2026-10-18-plate-temporal-modulation"
PROTOCOL = OUT / "protocol.md"
POSITIONS = ("p25", "p50", "p75")
FFT_SIZE = 1024
HOP_SIZE = 256
RATE = 48_000
MAX_HZ = 8_000
ERB_BANDS = 30
GROUPS = ((0, 10), (10, 20), (20, 30))
GROUP_NAMES = ("low", "mid", "high")
EVENT_START_FRAME = 480
EVENT_PULSE_MS = 3
ANALYSIS_START_SECONDS = 0.050
ANALYSIS_END_SECONDS = 0.500
MIN_MOD_CYCLES = 3
MAX_MOD_HZ_CANDIDATE = 40.0
AM_DEPTH = 0.5
AM_PHASES = (0.0, math.pi / 2)
AM_PROBE_BINS = tuple(range(1, 19)) + (21, 24, 32, 42)
F32 = np.dtype("<f4")
POWER_FLOOR = 1e-30
NULL_MARGIN_DB = 0.001
MIN_SELECTED_MODULATION_POWER_FRACTION = 0.01
EXPECTED_NATURAL_BASELINE = "d45823d40c9a87c1b333fa9872f3c897ee9ab01b"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def load_erb_helper():
    path = ROOT / "scripts/ant-base-born-loss-analysis.py"
    spec = importlib.util.spec_from_file_location("ant_base_born_loss_analysis", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ERB = load_erb_helper()


def unit_sum(values):
    values = np.asarray(values, dtype=np.float64)
    total = float(values.sum())
    if not math.isfinite(total) or total <= 0:
        return None
    return values / total


def cosine(a, b):
    if a is None or b is None or np.shape(a) != np.shape(b):
        return None
    a = np.asarray(a, dtype=np.float64).reshape(-1)
    b = np.asarray(b, dtype=np.float64).reshape(-1)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not math.isfinite(denominator) or denominator <= 0:
        return None
    return float(np.clip(np.dot(a, b) / denominator, -1.0, 1.0))


def summarize(values):
    values = np.asarray([x for x in values if x is not None and math.isfinite(x)], dtype=np.float64)
    if not len(values):
        return {"count": 0}
    q = np.quantile(values, [0.10, 0.25, 0.50, 0.75, 0.90])
    return {"count": int(len(values)), "min": float(values.min()), "p10": float(q[0]),
            "p25": float(q[1]), "median": float(q[2]), "mean": float(values.mean()),
            "p75": float(q[3]), "p90": float(q[4]), "max": float(values.max())}


def distribution_comparison(within, between, higher_is_within=True):
    a = np.asarray([x for x in within if x is not None and math.isfinite(x)], dtype=np.float64)
    b = np.asarray([x for x in between if x is not None and math.isfinite(x)], dtype=np.float64)
    if not len(a) or not len(b):
        return {"within": summarize(a), "between": summarize(b), "medianWithinMinusBetween": None,
                "pairwiseDominanceProbability": None}
    delta = a[:, None] - b[None, :]
    if not higher_is_within:
        delta = -delta
    return {"within": summarize(a), "between": summarize(b),
            "medianWithinMinusBetween": float(np.median(a) - np.median(b)),
            "pairwiseDominanceProbability": float(np.mean((delta > 0) + 0.5 * (delta == 0))),
            "dominanceDefinition": "fraction of all within/between value pairs where the expected within direction is greater; ties count one half"}


def read_float_wave32(data, label):
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"{label}: invalid RIFF/WAVE header")
    if struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
        raise ValueError(f"{label}: RIFF byte count mismatch")
    offset = 12
    fmt = None
    payload = None
    while offset + 8 <= len(data):
        chunk_id = data[offset:offset + 4]
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
        start = offset + 8
        end = start + chunk_size
        if end > len(data):
            raise ValueError(f"{label}: truncated WAVE chunk")
        if chunk_id == b"fmt ":
            if chunk_size < 16:
                raise ValueError(f"{label}: short fmt chunk")
            fmt = struct.unpack_from("<HHIIHH", data, start)
        elif chunk_id == b"data":
            payload = data[start:end]
        offset = end + (chunk_size & 1)
    if fmt is None or payload is None:
        raise ValueError(f"{label}: missing fmt or data chunk")
    format_code, channels, rate, byte_rate, block_align, bits = fmt
    if (format_code, channels, rate, byte_rate, block_align, bits) != (3, 2, RATE, RATE * 8, 8, 32):
        raise ValueError(f"{label}: expected stereo IEEE-float32 at {RATE} Hz")
    if len(payload) != 72_000 * 8:
        raise ValueError(f"{label}: expected 72,000 stereo Float32 frames")
    pcm = np.frombuffer(payload, dtype=F32).astype(np.float64).reshape(72_000, 2)
    if not np.isfinite(pcm).all():
        raise ValueError(f"{label}: non-finite PCM samples")
    return pcm


def checked_path(relative, label):
    path = (ROOT / relative).resolve()
    try:
        path.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise ValueError(f"{label}: source path escapes repository") from exc
    if not path.is_file():
        raise FileNotFoundError(f"{label}: missing source {relative}")
    return path


def load_inputs():
    natural_manifest_path = NATURAL / "render-manifest.json"
    natural_index_path = NATURAL_RAW / "render-index.json"
    roster_path = NATURAL / "descriptor-roster.json"
    synthetic_manifest_path = SYNTHETIC / "render-manifest.json"
    natural_manifest = read_json(natural_manifest_path)
    index = read_json(natural_index_path)
    roster = read_json(roster_path)
    synthetic_manifest = read_json(synthetic_manifest_path)
    if natural_manifest.get("baseline") != EXPECTED_NATURAL_BASELINE or natural_manifest.get("measurementGain") != 1:
        raise ValueError("Natural render manifest baseline or fixed-gain contract changed")
    selected = roster.get("selectedKeys", [])
    if len(selected) != 12 or len(set(selected)) != 12:
        raise ValueError("Expected the frozen 12-Plate natural roster")
    natural_rows = [r for r in index["rows"] if r.get("condition") == "native" and r.get("positionLabel") in POSITIONS]
    if len(natural_rows) != 36:
        raise ValueError(f"Expected 36 native natural responses, found {len(natural_rows)}")
    natural_artifacts = {a["path"]: a for a in natural_manifest["artifacts"]
                         if a.get("role") == "fixed-gain stereo measurement PCM"}
    if len(natural_artifacts) < len(natural_rows):
        raise ValueError("Natural render manifest has fewer fixed-gain PCM receipts than selected native rows")
    if (synthetic_manifest.get("renderCount") != 6 or
            synthetic_manifest.get("productionContracts", {}).get("fixedOutputGain") != 1 or
            synthetic_manifest.get("productionContracts", {}).get("sampleRate") != RATE):
        raise ValueError("Synthetic render manifest does not describe six fixed-gain 48 kHz renders")
    synthetic_artifacts = {a["path"]: a for a in synthetic_manifest["artifacts"]
                           if a.get("role") == "fixed-gain direct render"}
    if len(synthetic_artifacts) != 6 or len(synthetic_manifest.get("cases", [])) != 6:
        raise ValueError("Expected six synthetic fixed-gain render receipts")

    records = []
    receipts = []
    for plate_key in selected:
        plate_rows = sorted((r for r in natural_rows if r["plateKey"] == plate_key),
                            key=lambda r: POSITIONS.index(r["positionLabel"]))
        if [r["positionLabel"] for r in plate_rows] != list(POSITIONS):
            raise ValueError(f"{plate_key}: expected p25/p50/p75 once each")
        if len({r["topologySha256"] for r in plate_rows}) != 1 or len({json.dumps(r["metadata"]["material"], sort_keys=True) for r in plate_rows}) != 1:
            raise ValueError(f"{plate_key}: native geometry or material differs across positions")
        for row in plate_rows:
            if (row["frames"], row["sampleRate"], row["physicsRate"]) != (72_000, RATE, 6_000):
                raise ValueError(f"{row['id']}: unexpected frozen recipe")
            if (len(row["schedule"]) != 1 or row["schedule"][0]["frame"] != EVENT_START_FRAME or
                    row["telemetry"].get("contactPulseDurationMs") != EVENT_PULSE_MS):
                raise ValueError(f"{row['id']}: event frame or 3 ms pulse differs from frozen recipe")
            relative = row["files"]["pcm"]
            expected = natural_artifacts.get(relative)
            if expected is None:
                raise ValueError(f"Natural render manifest lacks PCM receipt: {relative}")
            path = checked_path(relative, row["id"])
            data = path.read_bytes()
            digest = sha256(data)
            if len(data) != expected["bytes"] or len(data) != 72_000 * 2 * 4 or digest != expected["sha256"]:
                raise ValueError(f"{relative}: byte count or SHA-256 differs from manifest")
            pcm = np.frombuffer(data, dtype=F32).astype(np.float64).reshape(72_000, 2)
            if not np.isfinite(pcm).all():
                raise ValueError(f"{relative}: non-finite PCM samples")
            record = {"id": row["id"], "kind": "natural", "plateKey": plate_key,
                      "positionLabel": row["positionLabel"], "path": relative, "pcm": pcm}
            records.append(record)
            receipts.append({"id": row["id"], "kind": "natural", "path": relative,
                             "bytes": len(data), "sha256": digest})

    for case in synthetic_manifest["cases"]:
        relative = case["fixedGain"]["path"]
        expected = synthetic_artifacts.get(relative)
        if expected is None:
            raise ValueError(f"Synthetic manifest lacks fixed-gain WAV receipt: {relative}")
        path = checked_path(relative, case["id"])
        data = path.read_bytes()
        digest = sha256(data)
        if len(data) != expected["bytes"] or digest != expected["sha256"]:
            raise ValueError(f"{relative}: byte count or SHA-256 differs from manifest")
        pcm = read_float_wave32(data, relative)
        if case["fixedGain"].get("gain") != 1:
            raise ValueError(f"{case['id']}: synthetic fixed gain is not 1")
        records.append({"id": case["id"], "kind": "synthetic", "caseId": case["id"],
                        "morphology": case["morphology"], "path": relative, "pcm": pcm})
        receipts.append({"id": case["id"], "kind": "synthetic", "path": relative,
                         "bytes": len(data), "sha256": digest})

    if len(records) != 42 or len(receipts) != 42 or len({r["id"] for r in records}) != 42:
        raise ValueError("Expected 42 unique fixed-gain PCM responses")
    source_paths = [r["path"] for r in receipts]
    for record in records:
        del record["pcm"]
    # Reload bytes after manifest verification so source arrays cannot mutate their byte receipts.
    for record, receipt in zip(records, receipts):
        data = checked_path(receipt["path"], receipt["id"]).read_bytes()
        if sha256(data) != receipt["sha256"]:
            raise ValueError(f"{receipt['path']}: source changed after hash verification")
        if receipt["kind"] == "natural":
            record["pcm"] = np.frombuffer(data, dtype=F32).astype(np.float64).reshape(72_000, 2)
        else:
            record["pcm"] = read_float_wave32(data, receipt["path"])
    manifests = {"naturalRenderManifest": {"path": str(natural_manifest_path.relative_to(ROOT)),
                 "sha256": sha256(natural_manifest_path.read_bytes())},
                 "naturalRenderIndex": {"path": str(natural_index_path.relative_to(ROOT)),
                 "sha256": sha256(natural_index_path.read_bytes())},
                 "naturalRoster": {"path": str(roster_path.relative_to(ROOT)),
                 "sha256": sha256(roster_path.read_bytes())},
                 "syntheticRenderManifest": {"path": str(synthetic_manifest_path.relative_to(ROOT)),
                 "sha256": sha256(synthetic_manifest_path.read_bytes())}}
    return records, receipts, manifests, selected


def frame_geometry():
    starts = np.arange(279, dtype=np.float64) * HOP_SIZE / RATE
    centers = starts + (FFT_SIZE - 1) / (2 * RATE)
    frequencies = np.fft.rfftfreq(FFT_SIZE, 1 / RATE)
    _, edges_hz, erb_centers = ERB.erb_edges()
    band_index = np.searchsorted(edges_hz, frequencies[:171], side="right") - 1
    band_index = np.clip(band_index, 0, ERB_BANDS - 1)
    empty_bands = [i for i in range(ERB_BANDS) if not np.any(band_index == i)]
    model_frames = np.flatnonzero((starts >= EVENT_START_FRAME / RATE + EVENT_PULSE_MS / 1000) &
                                  (centers >= ANALYSIS_START_SECONDS) &
                                  (centers <= ANALYSIS_END_SECONDS) & (np.arange(279) < 278))
    if len(model_frames) != 84:
        raise ValueError(f"Expected 84 complete model frames, found {len(model_frames)}")
    df = RATE / (HOP_SIZE * len(model_frames))
    min_bin = int(math.ceil(MIN_MOD_CYCLES))
    max_bin = int(math.floor(MAX_MOD_HZ_CANDIDATE / df))
    return {"frameStarts": starts, "frameCenters": centers, "bandIndex": band_index,
            "emptyBands": empty_bands, "erbCenters": erb_centers, "modelFrames": model_frames,
            "modulationBinSpacingHz": df, "minCandidateBin": min_bin,
            "maxCandidateBin": max_bin, "modulationFrequencies": np.fft.rfftfreq(len(model_frames), HOP_SIZE / RATE)}


def group_power(bands):
    return np.stack([bands[:, lo:hi].sum(axis=1) for lo, hi in GROUPS], axis=1)


def detrended_envelope(group_values, frame_centers, model_frames):
    values = np.asarray(group_values[model_frames], dtype=np.float64)
    db = 10 * np.log10(np.maximum(values, POWER_FLOOR))
    times = frame_centers[model_frames]
    slopes = []
    residuals = []
    group_rms = []
    group_spectra = []
    mean_power = np.mean(values, axis=0)
    total_mean_power = float(mean_power.sum())
    if not math.isfinite(total_mean_power) or total_mean_power <= POWER_FLOOR:
        return {"db": db, "slopes": [None] * 3, "residuals": [None] * 3,
                "groupRmsDb": [None] * 3, "groupPowerWeights": [0.0] * 3,
                "groupSpectrumPower": [None] * 3, "rmsDb": None,
                "spectrumPower": None, "window": np.hanning(len(model_frames))}
    power_weights = mean_power / total_mean_power
    window = np.hanning(len(model_frames))
    for gi in range(3):
        if float(np.max(values[:, gi])) <= POWER_FLOOR:
            slopes.append(None)
            residuals.append(None)
            group_rms.append(None)
            group_spectra.append(None)
            continue
        slope, intercept = np.polyfit(times, db[:, gi], 1)
        resid = db[:, gi] - (slope * times + intercept)
        resid -= float(np.mean(resid))
        slopes.append(float(slope))
        residuals.append(resid)
        group_rms.append(float(np.sqrt(np.mean(resid ** 2))))
        group_spectra.append(np.abs(np.fft.rfft(resid * window)) ** 2)
    valid = np.asarray([r is not None for r in residuals], dtype=bool)
    if not np.any(valid):
        return {"db": db, "slopes": slopes, "residuals": residuals,
                "groupRmsDb": group_rms, "groupPowerWeights": power_weights.tolist(),
                "groupSpectrumPower": group_spectra, "rmsDb": None,
                "spectrumPower": None, "window": window}
    weights = power_weights.copy()
    weights[~valid] = 0
    weight_sum = float(weights.sum())
    if weight_sum <= 0:
        return {"db": db, "slopes": slopes, "residuals": residuals,
                "groupRmsDb": group_rms, "groupPowerWeights": power_weights.tolist(),
                "groupSpectrumPower": group_spectra, "rmsDb": None,
                "spectrumPower": None, "window": window}
    weights /= weight_sum
    rms = float(np.sqrt(sum(weights[i] * group_rms[i] ** 2 for i in range(3) if valid[i])))
    spectrum_size = len(np.fft.rfft(np.zeros(len(model_frames))))
    power = np.zeros(spectrum_size, dtype=np.float64)
    for gi in range(3):
        if valid[gi]:
            power += weights[gi] * group_spectra[gi]
    return {"db": db, "slopes": slopes, "residuals": residuals,
            "groupRmsDb": group_rms, "groupPowerWeights": power_weights.tolist(),
            "groupSpectrumPower": group_spectra, "rmsDb": rms,
            "spectrumPower": power, "window": window}


def amplitude_at_bin(values, window, bin_index):
    spectrum = np.fft.rfft(np.asarray(values, dtype=np.float64) * window)
    return float(2 * abs(spectrum[bin_index]) / max(float(window.sum()), 1e-30))


def carrier_bins(geometry):
    # Coherent 187.5-Hz-spaced carriers stay well inside the declared groups.
    selected = [(0, 187.5, 4), (1, 937.5, 20), (2, 4125.0, 88)]
    for group, hz, bin_index in selected:
        if int(geometry["bandIndex"][bin_index] // 10) != group:
            raise ValueError(f"Calibration carrier {hz} Hz no longer maps to {GROUP_NAMES[group]}")
        if not math.isclose(float(np.fft.rfftfreq(FFT_SIZE, 1 / RATE)[bin_index]), hz):
            raise ValueError(f"Calibration carrier {hz} Hz is not coherent with the STFT")
    return selected


def probe_amplitude_modulation(geometry):
    frame_centers = geometry["frameCenters"]
    model_frames = geometry["modelFrames"]
    frequencies = geometry["modulationFrequencies"]
    probes = []
    sample_times = np.arange(72_000, dtype=np.float64) / RATE
    window = np.hanning(len(model_frames))
    for group, carrier_hz, carrier_bin in carrier_bins(geometry):
        for mod_bin in AM_PROBE_BINS:
            mod_hz = float(mod_bin * geometry["modulationBinSpacingHz"])
            for phase in AM_PHASES:
                envelope = 1 + AM_DEPTH * np.cos(2 * math.pi * mod_hz * sample_times + phase)
                signal = (0.25 * envelope * np.sin(2 * math.pi * carrier_hz * sample_times))
                stereo = np.column_stack((signal, signal))
                power = ERB.stft_power(stereo, sample_rate=RATE)
                bands, _, _, _ = ERB.erb_aggregate(power)
                values = group_power(bands.mean(axis=2))
                env = detrended_envelope(values, frame_centers, model_frames)
                residual = env["residuals"][group]
                if residual is None:
                    raise ValueError("AM probe unexpectedly produced an empty carrier group")
                expected_db = 20 * np.log10(1 + AM_DEPTH * np.cos(2 * math.pi * mod_hz * frame_centers[model_frames] + phase))
                expected_db -= np.polyval(np.polyfit(frame_centers[model_frames], expected_db, 1), frame_centers[model_frames])
                expected_db -= float(expected_db.mean())
                observed_amplitude = amplitude_at_bin(residual, window, mod_bin)
                expected_amplitude = amplitude_at_bin(expected_db, window, mod_bin)
                pooled_spec = env["spectrumPower"]
                peak_bin = int(np.argmax(pooled_spec[1:]) + 1)
                selected_lo = MIN_MOD_CYCLES
                selected_hi = int(math.floor(MAX_MOD_HZ_CANDIDATE / geometry["modulationBinSpacingHz"]))
                full_non_dc = float(pooled_spec[1:].sum())
                selected_share = float(pooled_spec[selected_lo:selected_hi + 1].sum() / full_non_dc) if full_non_dc > 0 else 0.0
                ratio = observed_amplitude / expected_amplitude if expected_amplitude > 0 else 0.0
                probes.append({"carrierGroup": GROUP_NAMES[group], "carrierHz": carrier_hz,
                               "carrierFftBin": carrier_bin, "modulationBin": mod_bin,
                               "modulationHz": mod_hz, "phaseRadians": float(phase),
                               "expectedFundamentalDb": expected_amplitude,
                               "measuredFundamentalDb": observed_amplitude,
                               "depthRatio": float(ratio), "peakBin": peak_bin,
                               "peakHz": float(frequencies[peak_bin]),
                               "peakErrorBins": int(abs(peak_bin - mod_bin)),
                               "selectedModulationPowerFraction": selected_share})
    per_bin = {}
    for mod_bin in AM_PROBE_BINS:
        rows = [p for p in probes if p["modulationBin"] == mod_bin]
        per_bin[str(mod_bin)] = {"frequencyHz": rows[0]["modulationHz"],
                                 "minDepthRatioAcrossCarriersAndPhases": min(p["depthRatio"] for p in rows),
                                 "maxPeakErrorBins": max(p["peakErrorBins"] for p in rows),
                                 "minSelectedModulationPowerFraction": min(p["selectedModulationPowerFraction"] for p in rows),
                                 "passes": all(p["depthRatio"] >= 0.5 and p["peakErrorBins"] <= 1 and
                                               p["selectedModulationPowerFraction"] >= MIN_SELECTED_MODULATION_POWER_FRACTION
                                               for p in rows)}
    first_candidate = max(MIN_MOD_CYCLES, 1)
    max_candidate = int(math.floor(MAX_MOD_HZ_CANDIDATE / geometry["modulationBinSpacingHz"]))
    contiguous = []
    for mod_bin in range(first_candidate, max_candidate + 1):
        status = per_bin.get(str(mod_bin))
        if status is None or not status["passes"]:
            if contiguous:
                break
            continue
        contiguous.append(mod_bin)
    if not contiguous:
        raise ValueError("AM probes found no contiguous usable modulation bin range")
    lo, hi = contiguous[0], contiguous[-1]
    for p in probes:
        p["includedInPrimaryRange"] = lo <= p["modulationBin"] <= hi
    w = np.hanning(FFT_SIZE)
    win_power = w * w
    window_response = []
    for hz in np.arange(0, RATE / (2 * HOP_SIZE) + 0.1, 1.0):
        phase_vec = np.exp(-2j * math.pi * hz * np.arange(FFT_SIZE) / RATE)
        response = abs(np.sum(win_power * phase_vec) / np.sum(win_power))
        window_response.append({"frequencyHz": float(hz), "amplitudeTransfer": float(response),
                                "amplitudeTransferDb": float(20 * math.log10(max(response, 1e-15)))})
    return {"probes": probes, "perBin": per_bin,
            "usableBinRange": [lo, hi], "usableFrequencyRangeHz": [lo * geometry["modulationBinSpacingHz"],
                                                                       hi * geometry["modulationBinSpacingHz"]],
            "criterion": "every coherent low/mid/high carrier and both phases: fundamental depth ratio >=0.5, pooled-spectrum peak error <=1 bin, and selected-band share >=1%; contiguous from first bin at or above three-cycle limit; upper candidates <=40 Hz",
            "hannSquaredWindowResponse": window_response,
            "envelopeSampleRateHz": RATE / HOP_SIZE,
            "envelopeNyquistHz": RATE / (2 * HOP_SIZE),
            "stftWindowSupportMs": FFT_SIZE * 1000 / RATE}


def make_probe_pcm(carrier_hz, modulation_hz, phase=0.0, depth=AM_DEPTH, frames=72_000):
    t = np.arange(frames, dtype=np.float64) / RATE
    x = 0.25 * (1 + depth * np.cos(2 * math.pi * modulation_hz * t + phase)) * np.sin(2 * math.pi * carrier_hz * t)
    return np.column_stack((x, x))


def self_check(geometry):
    carrier = carrier_bins(geometry)[1][1]
    t = np.arange(72_000, dtype=np.float64) / RATE
    mod_hz = 8 * geometry["modulationBinSpacingHz"]
    probe = make_probe_pcm(carrier, mod_hz, phase=0.37)
    power = ERB.stft_power(probe)
    bands, _, _, _ = ERB.erb_aggregate(power)
    values = group_power(bands.mean(axis=2))
    first = detrended_envelope(values, geometry["frameCenters"], geometry["modelFrames"])
    repeated = detrended_envelope(values.copy(), geometry["frameCenters"], geometry["modelFrames"])
    assert first["rmsDb"] == repeated["rmsDb"]
    assert np.array_equal(first["spectrumPower"], repeated["spectrumPower"])
    assert int(np.argmax(first["spectrumPower"][1:]) + 1) == 8
    assert len(first["groupPowerWeights"]) == 3 and math.isclose(sum(first["groupPowerWeights"]), 1.0, abs_tol=1e-12)

    scaled = ERB.stft_power(probe * 0.25)
    scaled_bands, _, _, _ = ERB.erb_aggregate(scaled)
    scaled_env = detrended_envelope(group_power(scaled_bands.mean(axis=2)), geometry["frameCenters"], geometry["modelFrames"])
    assert math.isclose(first["rmsDb"], scaled_env["rmsDb"], abs_tol=1e-10)
    assert np.allclose(first["groupPowerWeights"], scaled_env["groupPowerWeights"], atol=1e-12, rtol=1e-12)
    assert cosine(unit_sum(first["spectrumPower"][3:18]), unit_sum(scaled_env["spectrumPower"][3:18])) > 1 - 1e-12
    scale_rms_delta = 20 * math.log10(0.25)
    raw_rms = float(np.sqrt(np.mean(probe ** 2)))
    scaled_raw_rms = float(np.sqrt(np.mean((probe * 0.25) ** 2)))
    assert math.isclose(20 * math.log10(scaled_raw_rms / raw_rms), scale_rms_delta, abs_tol=1e-12)
    raw_attack = raw_metrics(probe)
    scaled_raw_attack = raw_metrics(probe * 0.25)
    attack_ratio_delta = max(abs(raw_attack["levelInvariantAttackRatiosDb"][key] -
                                 scaled_raw_attack["levelInvariantAttackRatiosDb"][key])
                             for key in raw_attack["levelInvariantAttackRatiosDb"])
    assert attack_ratio_delta < 1e-12
    identity = cosine(first["spectrumPower"], first["spectrumPower"])
    assert identity == 1.0

    tau = 0.35
    decay = np.column_stack((0.25 * np.exp(-t / tau) * np.sin(2 * math.pi * carrier * t),
                             0.25 * np.exp(-t / tau) * np.sin(2 * math.pi * carrier * t)))
    decay_bands, _, _, _ = ERB.erb_aggregate(ERB.stft_power(decay))
    decay_env = detrended_envelope(group_power(decay_bands.mean(axis=2)), geometry["frameCenters"], geometry["modelFrames"])
    expected_decay = -20 / math.log(10) / tau
    expected_group = carrier_bins(geometry)[1][0]
    assert abs(decay_env["slopes"][expected_group] - expected_decay) < 0.15
    assert decay_env["rmsDb"] < 0.1

    am_calibration = probe_amplitude_modulation(geometry)
    geometry["usableBinRange"] = am_calibration["usableBinRange"]
    probes = am_calibration["probes"]
    am_per_bin = {}
    for mod_bin in AM_PROBE_BINS:
        rows = [p for p in probes if p["modulationBin"] == mod_bin]
        am_per_bin[str(mod_bin)] = {
            "frequencyHz": rows[0]["modulationHz"],
            "minDepthRatioAcrossCarriersAndPhases": min(p["depthRatio"] for p in rows),
            "maxPeakErrorBins": max(p["peakErrorBins"] for p in rows),
            "minSelectedModulationPowerFraction": min(p["selectedModulationPowerFraction"] for p in rows),
            "passes": all(p["depthRatio"] >= 0.5 and p["peakErrorBins"] <= 1 and
                           p["selectedModulationPowerFraction"] >= MIN_SELECTED_MODULATION_POWER_FRACTION
                           for p in rows)}
    if not am_per_bin["3"]["passes"]:
        raise AssertionError("First three-cycle AM bin failed the frozen exact-pipeline gates")
    for out_of_band_bin in (21, 24, 32, 42):
        if am_per_bin[str(out_of_band_bin)]["minSelectedModulationPowerFraction"] >= MIN_SELECTED_MODULATION_POWER_FRACTION:
            raise AssertionError(f"Out-of-band AM probe bin {out_of_band_bin} passed selected-power gate")

    # A multi-band control checks that energy-weighted pooling retains one shared AM rate.
    multi_envelope = 1 + AM_DEPTH * np.cos(2 * math.pi * 8 * geometry["modulationBinSpacingHz"] * t + 0.21)
    multi_signal = sum(np.sin(2 * math.pi * hz * t) for _, hz, _ in carrier_bins(geometry))
    multi_signal = 0.08 * multi_envelope * multi_signal
    multi_stereo = np.column_stack((multi_signal, multi_signal))
    multi_bands, _, _, _ = ERB.erb_aggregate(ERB.stft_power(multi_stereo))
    multi_env = detrended_envelope(group_power(multi_bands.mean(axis=2)), geometry["frameCenters"], geometry["modelFrames"])
    multi_peak = int(np.argmax(multi_env["spectrumPower"][1:]) + 1)
    multi_share = float(multi_env["spectrumPower"][3:18].sum() / multi_env["spectrumPower"][1:].sum())
    if multi_peak != 8 or multi_share < MIN_SELECTED_MODULATION_POWER_FRACTION:
        raise AssertionError("Multi-band AM pooled estimator failed to retain the injected rate")

    null_records = []
    for group, carrier_hz, carrier_bin in carrier_bins(geometry):
        constant = 0.25 * np.sin(2 * math.pi * carrier_hz * t)
        tone = np.column_stack((constant, constant))
        tone_bands, _, _, _ = ERB.erb_aggregate(ERB.stft_power(tone))
        tone_env = detrended_envelope(group_power(tone_bands.mean(axis=2)), geometry["frameCenters"], geometry["modelFrames"])
        null_records.append({"carrierGroup": GROUP_NAMES[group], "carrierHz": carrier_hz,
                             "residualRmsDb": tone_env["rmsDb"],
                             "groupResidualRmsDb": tone_env["groupRmsDb"],
                             "groupPowerWeights": tone_env["groupPowerWeights"]})
    null_floor = max(x["residualRmsDb"] for x in null_records) + NULL_MARGIN_DB
    bin_spacing = geometry["modulationBinSpacingHz"]
    silent_values = np.zeros((279, ERB_BANDS), dtype=np.float64)
    silent_env = detrended_envelope(group_power(silent_values), geometry["frameCenters"], geometry["modelFrames"])
    if silent_env["spectrumPower"] is not None or silent_env["rmsDb"] is not None:
        raise AssertionError("Silence must not yield a modulation spectrum")
    return {"passed": True, "identicalInputCosine": identity, "repeatedArrayExact": True,
            "positiveScale": {"gain": 0.25, "rawRmsDeltaDb": scale_rms_delta,
                              "measuredRawRmsDeltaDb": 20 * math.log10(scaled_raw_rms / raw_rms),
                              "levelInvariantAttackRatiosMaxAbsDeltaDb": attack_ratio_delta,
                              "residualRmsAbsDeltaDb": abs(first["rmsDb"] - scaled_env["rmsDb"]),
                              "groupWeightsMaxAbsDelta": float(np.max(np.abs(np.asarray(first["groupPowerWeights"]) - np.asarray(scaled_env["groupPowerWeights"])))),
                              "normalizedSelectedSpectrumCosine": cosine(unit_sum(first["spectrumPower"][3:18]), unit_sum(scaled_env["spectrumPower"][3:18]))},
            "exponentialDecay": {"tauSeconds": tau, "expectedSlopeDbPerSecond": expected_decay,
                                 "measuredGroupSlopeDbPerSecond": decay_env["slopes"][expected_group],
                                 "residualRmsDbEnergyWeighted": decay_env["rmsDb"],
                                 "groupResidualRmsDb": decay_env["groupRmsDb"]},
            "nullFloorCalibration": {"noAmProbes": null_records,
                                     "nullResidualFloorDb": null_floor,
                                     "marginDb": NULL_MARGIN_DB},
            "amCalibration": {**am_calibration, "perBin": am_per_bin,
                              "multiBandControl": {"expectedBin": 8, "measuredPeakBin": multi_peak,
                                                   "includedBandShare": multi_share}},
            "silence": {"spectrumUnavailable": silent_env["spectrumPower"] is None},
            "modulationBinSpacingHz": bin_spacing,
            "emptyErbBands": geometry["emptyBands"], "emptyErbBandCount": len(geometry["emptyBands"])}


def raw_metrics(pcm):
    def rms(samples):
        return float(np.sqrt(np.mean(np.asarray(samples, dtype=np.float64) ** 2)))
    ranges = {"full_0_1500ms": (0, 72_000), "pre_event_0_10ms": (0, 480),
              "contact_10_13ms": (480, 624), "post_contact_13_50ms": (624, 2_400),
              "post_contact_13_100ms": (624, 4_800), "post_contact_50_500ms": (2_400, 24_000)}
    result = {"peakAbs": float(np.max(np.abs(pcm)))}
    for name, (start, end) in ranges.items():
        value = rms(pcm[start:end])
        result[name + "Rms"] = value
        result[name + "RmsDbfs"] = 20 * math.log10(max(value, 1e-30))
    result["levelInvariantAttackRatiosDb"] = {
        "peakToFullClipRmsCrestDb": 20 * math.log10(max(result["peakAbs"], 1e-30) /
                                                     max(result["full_0_1500msRms"], 1e-30)),
        "postContact13To50msToFullClipRmsDb": result["post_contact_13_50msRmsDbfs"] - result["full_0_1500msRmsDbfs"],
        "contact10To13msToFullClipRmsDb": result["contact_10_13msRmsDbfs"] - result["full_0_1500msRmsDbfs"]}
    return result


def analyze_response(record, geometry, null_floor_db):
    stft = ERB.stft_power(record["pcm"], sample_rate=RATE)
    bands, frequencies, band_index, centers_hz = ERB.erb_aggregate(stft)
    pooled = bands.mean(axis=2)
    if pooled.shape != (279, ERB_BANDS) or not np.isfinite(pooled).all():
        raise ValueError(f"{record['id']}: unexpected ERB array")
    frame_energy = pooled.sum(axis=1)
    valid_energy = frame_energy[:278]
    total = float(valid_energy.sum())
    if not math.isfinite(total) or total <= 0:
        raise ValueError(f"{record['id']}: zero or invalid pooled ERB energy")
    t90_index = int(np.searchsorted(np.cumsum(valid_energy) / total, 0.90, side="left"))
    t90 = float(geometry["frameCenters"][t90_index])
    early_mask = (geometry["frameCenters"][:278] >= ANALYSIS_START_SECONDS) & (geometry["frameCenters"][:278] < ANALYSIS_END_SECONDS)
    late_mask = geometry["frameCenters"][:278] >= ANALYSIS_END_SECONDS
    early_energy = float(valid_energy[early_mask].sum())
    late_energy = float(valid_energy[late_mask].sum())
    tail_early_db = 10 * math.log10(max(late_energy, POWER_FLOOR) / max(early_energy, POWER_FLOOR))
    group_values = group_power(pooled)
    env = detrended_envelope(group_values, geometry["frameCenters"], geometry["modelFrames"])
    full_shape = unit_sum(pooled)
    # Match the existing integrated ERB profile, which includes all 279 stored frames.
    integrated_shape = unit_sum(pooled.sum(axis=0))
    legacy_late_mask = geometry["frameStarts"] >= 0.5
    legacy_late_shape = unit_sum(pooled[legacy_late_mask].sum(axis=0))
    mod_spectrum = None
    selected_modulation_fraction = None
    full_non_dc_periodogram_power = None
    if env["spectrumPower"] is not None and env["rmsDb"] > null_floor_db:
        lo, hi = geometry["usableBinRange"]
        full_non_dc_periodogram_power = float(env["spectrumPower"][1:].sum())
        selected_power = float(env["spectrumPower"][lo:hi + 1].sum())
        selected_modulation_fraction = selected_power / full_non_dc_periodogram_power if full_non_dc_periodogram_power > 0 else 0.0
        if selected_modulation_fraction >= MIN_SELECTED_MODULATION_POWER_FRACTION:
            mod_spectrum = unit_sum(env["spectrumPower"][lo:hi + 1])
    record_result = {
        "id": record["id"], "kind": record["kind"],
        "plateKey": record.get("plateKey"), "positionLabel": record.get("positionLabel"),
        "caseId": record.get("caseId"), "morphology": record.get("morphology"),
        "rawFixedGain": raw_metrics(record["pcm"]),
        "emptyErbBands": geometry["emptyBands"],
        "decaySlopeDbPerSecondByGroup": dict(zip(GROUP_NAMES, env["slopes"])),
        "groupPowerWeights": env["groupPowerWeights"],
        "modulationResidualRmsDbByGroup": dict(zip(GROUP_NAMES, env["groupRmsDb"])),
        "modulationResidualRmsDb": env["rmsDb"],
        "modulationSpectrum": mod_spectrum.tolist() if mod_spectrum is not None else None,
        "perGroupModulationPeriodogramPowerSelected": [
            (s[geometry["usableBinRange"][0]:geometry["usableBinRange"][1] + 1].tolist()
             if s is not None else None) for s in env["groupSpectrumPower"]],
        "modulationResidualPeriodogramPowerNonDc": full_non_dc_periodogram_power,
        "includedModulationPowerFraction": selected_modulation_fraction,
        "modulationSpectrumUnavailableReason": ("at or below no-AM residual floor" if env["rmsDb"] is None or env["rmsDb"] <= null_floor_db else
                                                  "selected band contains less than 1% of non-DC residual periodogram power" if mod_spectrum is None else None),
        "stftFrameEnergyT90SecondsFromFileStart": t90,
        "stftLateToEarlyEnergyRatioDb": tail_early_db,
        "fullErbTimeShape": full_shape.reshape(-1).tolist(),
        "integratedErbProfile": integrated_shape.tolist(),
        "legacyLateTailErbProfile": legacy_late_shape.tolist(),
        "pooledErbPower": pooled.astype(np.float32).tolist(),
        "groupPower": group_values.astype(np.float32).tolist(),
        "groupEnvelopeDb": (10 * np.log10(np.maximum(group_values, POWER_FLOOR))).astype(np.float32).tolist(),
        "modulationResidualByGroupDb": [r.astype(np.float32).tolist() for r in env["residuals"]]
    }
    return record_result


def classify_pair(a, b):
    if a["kind"] == "natural" and b["kind"] == "natural":
        if a["plateKey"] == b["plateKey"]:
            return "natural_within_plate_cross_position"
        if a["positionLabel"] == b["positionLabel"]:
            return "natural_between_plate_same_position"
        return "natural_between_plate_cross_position_exploratory"
    if a["kind"] != b["kind"]:
        return "natural_synthetic_exploratory"
    return "synthetic_synthetic_exploratory"


def pair_rows(results):
    by_id = {r["id"]: r for r in results}
    rows = []
    for a, b in itertools.combinations(results, 2):
        same = a["kind"] == b["kind"]
        mod_cos = cosine(a["modulationSpectrum"], b["modulationSpectrum"])
        full_cos = cosine(a["fullErbTimeShape"], b["fullErbTimeShape"])
        row = {"pairClass": classify_pair(a, b), "a": a["id"], "b": b["id"],
               "plateA": a.get("plateKey"), "plateB": b.get("plateKey"),
               "positionA": a.get("positionLabel"), "positionB": b.get("positionLabel"),
               "modulationSpectrumCosine": mod_cos,
               "modulationResidualRmsDbA": a["modulationResidualRmsDb"],
               "modulationResidualRmsDbB": b["modulationResidualRmsDb"],
               "absModulationResidualRmsDbGap": (abs(a["modulationResidualRmsDb"] - b["modulationResidualRmsDb"])
                                                  if a["modulationResidualRmsDb"] is not None and b["modulationResidualRmsDb"] is not None else None),
               "lowDecaySlopeDbPerSecondGap": (abs(a["decaySlopeDbPerSecondByGroup"]["low"] - b["decaySlopeDbPerSecondByGroup"]["low"])
                                                if a["decaySlopeDbPerSecondByGroup"]["low"] is not None and b["decaySlopeDbPerSecondByGroup"]["low"] is not None else None),
               "midDecaySlopeDbPerSecondGap": (abs(a["decaySlopeDbPerSecondByGroup"]["mid"] - b["decaySlopeDbPerSecondByGroup"]["mid"])
                                                if a["decaySlopeDbPerSecondByGroup"]["mid"] is not None and b["decaySlopeDbPerSecondByGroup"]["mid"] is not None else None),
               "highDecaySlopeDbPerSecondGap": (abs(a["decaySlopeDbPerSecondByGroup"]["high"] - b["decaySlopeDbPerSecondByGroup"]["high"])
                                                 if a["decaySlopeDbPerSecondByGroup"]["high"] is not None and b["decaySlopeDbPerSecondByGroup"]["high"] is not None else None),
               "fullErbTimeCosine": full_cos,
               "integratedErbProfileCosine": cosine(a["integratedErbProfile"], b["integratedErbProfile"]),
               "lateTailErbProfileCosine": cosine(a["legacyLateTailErbProfile"], b["legacyLateTailErbProfile"]),
               "absRawFullRmsDbfsGap": abs(a["rawFixedGain"]["full_0_1500msRmsDbfs"] - b["rawFixedGain"]["full_0_1500msRmsDbfs"]),
               "stftFrameEnergyT90SecondsGap": abs(a["stftFrameEnergyT90SecondsFromFileStart"] - b["stftFrameEnergyT90SecondsFromFileStart"]),
               "stftLateToEarlyEnergyRatioDbGap": abs(a["stftLateToEarlyEnergyRatioDb"] - b["stftLateToEarlyEnergyRatioDb"])}
        rows.append(row)
    if len(rows) != 861:
        raise ValueError(f"Expected 861 all-pair rows, got {len(rows)}")
    return rows


def compare_existing_erb(rows):
    path = EXISTING_ERB / "pairwise-comparisons.csv"
    with path.open(encoding="utf8", newline="") as stream:
        expected_rows = list(csv.DictReader(stream))
    current = {(r["a"], r["b"]): r for r in rows}
    checked = []
    metric_checks = {name: 0 for name in ("fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine")}
    for old in expected_rows:
        key = (old["a"], old["b"])
        if key not in current:
            raise ValueError(f"Existing ERB pair missing from new analysis: {key}")
        for metric in metric_checks:
            actual = current[key][metric]
            if actual is None or abs(actual - float(old[metric])) > 5e-12:
                raise ValueError(f"Existing ERB {metric} mismatch for {key}: {actual} vs {old[metric]}")
            metric_checks[metric] += 1
        checked.append(key)
    if len(expected_rows) != 234:
        raise ValueError(f"Expected 234 existing natural comparison rows, got {len(expected_rows)}")
    analysis_path = EXISTING_ERB / "analysis.json"
    old_analysis = read_json(analysis_path)
    comparisons = {}
    for metric in metric_checks:
        new_within = [r[metric] for r in rows if r["pairClass"] == "natural_within_plate_cross_position"]
        new_between = [r[metric] for r in rows if r["pairClass"] == "natural_between_plate_same_position"]
        comparison = distribution_comparison(new_within, new_between)
        old_comparison = old_analysis["primaryComparison"][metric]
        if (abs(comparison["within"]["median"] - old_comparison["within"]["median"]) > 1e-12 or
                abs(comparison["between"]["median"] - old_comparison["between"]["median"]) > 1e-12):
            raise ValueError(f"Recomputed natural {metric} median differs from existing report")
        comparisons[metric] = {"recomputed": comparison, "existing": old_comparison}
    return {"existingAnalysisSha256": sha256(analysis_path.read_bytes()),
            "existingPairCsvSha256": sha256(path.read_bytes()),
            "pairRowsChecked": len(checked), "pairMetricsChecked": metric_checks,
            "withinBetweenSummariesMatch": True, "metrics": comparisons}


def build_summaries(rows):
    within = [r for r in rows if r["pairClass"] == "natural_within_plate_cross_position"]
    between = [r for r in rows if r["pairClass"] == "natural_between_plate_same_position"]
    if len(within) != 36 or len(between) != 198:
        raise ValueError(f"Expected 36 within and 198 between natural pairs, got {len(within)}/{len(between)}")
    metrics = ("modulationSpectrumCosine", "absModulationResidualRmsDbGap",
               "fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine",
               "lowDecaySlopeDbPerSecondGap",
               "midDecaySlopeDbPerSecondGap", "highDecaySlopeDbPerSecondGap",
               "stftFrameEnergyT90SecondsGap", "stftLateToEarlyEnergyRatioDbGap")
    out = {"naturalPairCounts": {"withinPlateCrossPosition": len(within), "betweenPlateSamePosition": len(between)},
           "definitions": {"withinPlateCrossPosition": "same natural Plate, different p25/p50/p75 labels",
                           "betweenPlateSamePosition": "different natural Plates, same p25/p50/p75 label",
                           "inferentialTests": False},
           "metrics": {}}
    for metric in metrics:
        higher = metric in ("modulationSpectrumCosine", "fullErbTimeCosine",
                            "integratedErbProfileCosine", "lateTailErbProfileCosine")
        out["metrics"][metric] = distribution_comparison([r[metric] for r in within], [r[metric] for r in between], higher_is_within=higher)
    counts = {}
    for row in rows:
        counts[row["pairClass"]] = counts.get(row["pairClass"], 0) + 1
    out["allPairClassCounts"] = counts
    return out


def json_bytes(value, pretty=True):
    if pretty:
        return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf8")
    return json.dumps(value, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf8")


def build_csv(rows):
    cols = list(rows[0].keys())
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=cols, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({k: ("" if v is None else f"{v:.12g}" if isinstance(v, float) else v) for k, v in row.items()})
    return stream.getvalue().encode("utf8")


def corpus_bytes(records, receipts, manifests, selected, geometry, checks, protocol_sha):
    null_floor = checks["nullFloorCalibration"]["nullResidualFloorDb"]
    results = [analyze_response(r, geometry, null_floor) for r in records]
    pair_data = pair_rows(results)
    existing = compare_existing_erb(pair_data)
    summary = build_summaries(pair_data)
    response_descriptors = []
    for r in results:
        response_descriptors.append({k: r[k] for k in (
            "id", "kind", "plateKey", "positionLabel", "caseId", "morphology",
            "rawFixedGain", "decaySlopeDbPerSecondByGroup", "groupPowerWeights",
            "modulationResidualRmsDbByGroup", "modulationResidualRmsDb",
            "modulationSpectrum", "perGroupModulationPeriodogramPowerSelected",
            "modulationResidualPeriodogramPowerNonDc", "includedModulationPowerFraction",
            "modulationSpectrumUnavailableReason", "stftFrameEnergyT90SecondsFromFileStart",
            "stftLateToEarlyEnergyRatioDb", "integratedErbProfile")})
    # Recheck source bytes immediately before preparing any corpus artifacts.
    for receipt in receipts:
        data = checked_path(receipt["path"], receipt["id"]).read_bytes()
        if len(data) != receipt["bytes"] or sha256(data) != receipt["sha256"]:
            raise ValueError(f"{receipt['path']}: source changed during analysis")
    analysis = {"schemaVersion": 1,
                "protocolPath": str(PROTOCOL.relative_to(ROOT)),
                "protocolSha256": protocol_sha,
                "inputManifests": manifests,
                "sourceReceipts": receipts,
                "responseCount": len(results), "pairCount": len(pair_data),
                "naturalRosterOrder": selected,
                "representation": {"fftSize": FFT_SIZE, "window": "symmetric Hann via numpy.hanning",
                    "hopSize": HOP_SIZE, "sampleRate": RATE, "oneSidedLinearPower": "|rFFT|^2 / sum(Hann)^2; double positive bins; sum by existing 30 equal-ERB-rate 0-8k bins",
                    "stereoPooling": "mean left/right linear band power per frame",
                    "frameTime": "left-aligned frame start n*256/48000; envelope time is window center start + 511.5/48000",
                    "frameCount": 279, "lastPartialFrame": {"index": 278, "startSeconds": 278 * HOP_SIZE / RATE,
                        "realSamples": 832, "zeroPaddedSamples": 192, "excludedFromTemporalMetrics": True},
                    "emptyErbBands": geometry["emptyBands"],
                    "groups": {name: {"bandsHalfOpen": list(bounds), "aggregation": "sum linear ERB power before dB"}
                               for name, bounds in zip(GROUP_NAMES, GROUPS)},
                    "event": {"startFrame": EVENT_START_FRAME, "sampleRate": RATE,
                        "startSeconds": EVENT_START_FRAME / RATE, "pulseDurationMs": EVENT_PULSE_MS,
                        "endSeconds": EVENT_START_FRAME / RATE + EVENT_PULSE_MS / 1000,
                        "overlappingWindowsExcluded": True},
                    "modelWindow": {"frameStartAtOrAfterSeconds": EVENT_START_FRAME / RATE + EVENT_PULSE_MS / 1000,
                        "centerSecondsInclusive": [ANALYSIS_START_SECONDS, ANALYSIS_END_SECONDS],
                        "completeFrameCount": len(geometry["modelFrames"]),
                        "modulationFrequencyBinSpacingHz": geometry["modulationBinSpacingHz"],
                        "threeCycleLowerCandidateHz": MIN_MOD_CYCLES * geometry["modulationBinSpacingHz"],
                        "candidateUpperHz": MAX_MOD_HZ_CANDIDATE,
                        "primaryUsableBinRange": checks["amCalibration"]["usableBinRange"],
                        "primaryUsableFrequencyRangeHz": checks["amCalibration"]["usableFrequencyRangeHz"],
                        "envelopeSampleRateHz": RATE / HOP_SIZE, "envelopeNyquistHz": RATE / (2 * HOP_SIZE),
                        "nominalStftWindowSupportMs": FFT_SIZE * 1000 / RATE},
                    "decay": "OLS dB-power slope (10*log10 pooled group power) over the fixed 50-500 ms center-time window; descriptor only",
                    "modulation": "demean each group OLS residual; weight each group by its share of mean linear group power over the same 84-frame window; pooled spectrum is the weighted sum of group periodograms using a symmetric Hann over 84 frames, restricted to empirical usable bins and unit-summed; pooled residual RMS is the square root of the same energy-weighted mean of per-group residual mean-square values. Unweighted per-group slopes, RMS, and selected-bin periodograms are retained.",
                    "nullFloorDb": null_floor,
                    "fullClipCompanions": "normalized t90 from summed 30-band STFT frame energy over complete frames; late/early ratio compares frame centers >=500ms with 50-500ms",
                    "pairwisePrimary": "unit-sum energy-weighted modulation-rate periodogram cosine; phase/order is discarded"},
                "pairSummaries": summary,
                "responseDescriptors": response_descriptors,
                "existingErbComparison": existing,
                "interpretationLimits": [
                    "The frame hop gives a 187.5 Hz envelope sampling rate and 93.75 Hz Nyquist; the 21.333 ms Hann analysis window smooths envelope variation, so AM probes and the Hann-squared response define the reported useful band.",
                    "30 ERB bands are a sparse STFT grouping, not 30 independent auditory channels; zero-bin bands are listed and not imputed.",
                    "The mod residual can contain slow envelope curvature, modal beating and other response changes after linear log-power detrending; it is not exclusively beating.",
                    "Energy weighting couples the primary modulation coordinate to coarse ERB-group power balance; per-group weights and residual descriptors are retained for interpretation. A normalized modulation spectrum is phase-free and cannot establish aligned envelope timing identity.",
                    "STFT t90 and tail/early ratios describe overlapping frame-power summaries, not physical decay constants or natural termination.",
                    "The 36 within and 198 between pairs share Plates and are descriptive dependent comparisons; no inferential tests or listener data are included.",
                    "Synthetic cases are engineering controls. Their cross-class pair rows are exploratory and not pooled into natural pair summaries."]}
    validation = checks
    series = {"schemaVersion": 1, "timesFrameStartSeconds": geometry["frameStarts"].tolist(),
              "timesEnvelopeCenterSeconds": geometry["frameCenters"].tolist(),
              "excludedPartialFrameIndex": 278,
              "responses": [{"id": r["id"], "kind": r["kind"], "plateKey": r.get("plateKey"),
                             "positionLabel": r.get("positionLabel"), "caseId": r.get("caseId"),
                             "pooledErbPower": r["pooledErbPower"], "groupPower": r["groupPower"],
                             "groupEnvelopeDb": r["groupEnvelopeDb"],
                             "modulationResidualByGroupDb": r["modulationResidualByGroupDb"]} for r in results]}
    artifacts = {"analysis.json": json_bytes(analysis),
                 "pairwise-metrics.csv": build_csv(pair_data),
                 "response-series.json.gz": gzip.compress(json_bytes(series, pretty=False), compresslevel=9, mtime=0),
                 "validation.json": json_bytes(validation)}
    return artifacts, analysis, results, pair_data, summary, existing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-check", action="store_true", help="run synthetic method validation only")
    args = parser.parse_args()
    geometry = frame_geometry()
    checks = self_check(geometry)
    if args.self_check:
        print(json.dumps(checks, indent=2, allow_nan=False))
        return
    if not PROTOCOL.is_file():
        raise FileNotFoundError(f"Document protocol before corpus analysis: {PROTOCOL}")
    protocol_sha = sha256(PROTOCOL.read_bytes())
    records, receipts, manifests, selected = load_inputs()
    first = corpus_bytes(records, receipts, manifests, selected, geometry, checks, protocol_sha)
    second = corpus_bytes(records, receipts, manifests, selected, geometry, checks, protocol_sha)
    if first[0] != second[0]:
        raise ValueError("Full-corpus output bytes changed between deterministic replays")
    artifacts, analysis, results, pairs, summary, existing = first
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in artifacts.items():
        path = OUT / name
        if path.exists():
            if not path.is_file() or path.read_bytes() != data:
                raise FileExistsError(f"Refusing to overwrite frozen or partial artifact: {path}")
        else:
            path.write_bytes(data)
    receipt_rows = [{"path": name, "bytes": len(data), "sha256": sha256(data)}
                    for name, data in sorted(artifacts.items())]
    freeze = {"schemaVersion": 1, "freezeType": "method-and-corpus-output",
              "baselineCommit": EXPECTED_NATURAL_BASELINE,
              "methodFiles": [{"path": "scripts/ant-plate-temporal-modulation.py",
                               "sha256": sha256(Path(__file__).read_bytes())},
                              {"path": str(PROTOCOL.relative_to(ROOT)), "sha256": protocol_sha},
                              {"path": "scripts/ant-base-born-loss-analysis.py",
                               "sha256": sha256((ROOT / "scripts/ant-base-born-loss-analysis.py").read_bytes())}],
              "sourceManifestReceipts": manifests, "sourceReceipts": receipts,
              "artifactReceipts": receipt_rows,
              "determinism": {"fullCorpusReplayCount": 2, "artifactBytesIdentical": True},
              "noTimestamp": True}
    freeze_bytes = json_bytes(freeze)
    freeze_path = OUT / "freeze.json"
    freeze_hash_path = OUT / "freeze.sha256"
    freeze_hash_bytes = (sha256(freeze_bytes) + "  freeze.json\n").encode("ascii")
    if freeze_path.exists() or freeze_hash_path.exists():
        if (not freeze_path.is_file() or not freeze_hash_path.is_file() or
                freeze_path.read_bytes() != freeze_bytes or freeze_hash_path.read_bytes() != freeze_hash_bytes):
            raise FileExistsError("Refusing to overwrite a prior freeze receipt")
    else:
        freeze_path.write_bytes(freeze_bytes)
        freeze_hash_path.write_bytes(freeze_hash_bytes)
    print(json.dumps({"status": "FROZEN", "responses": len(results), "pairs": len(pairs),
                      "within": summary["naturalPairCounts"]["withinPlateCrossPosition"],
                      "between": summary["naturalPairCounts"]["betweenPlateSamePosition"],
                      "usableModulationRangeHz": analysis["representation"]["modelWindow"]["primaryUsableFrequencyRangeHz"],
                      "existingErbPairsVerified": existing["pairRowsChecked"],
                      "freezeSha256": sha256(freeze_bytes)}, indent=2))


if __name__ == "__main__":
    main()
