#!/usr/bin/env python3
"""Measure q=4-matched Born loss shadows; all results remain descriptive."""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "test-results/ant-base-born-loss-distribution-20261014"
EVIDENCE = ROOT / "docs/ant/evidence/2026-10-14-base-born-loss-distribution"
INDEX = OUTPUT / "render-index.json"
METRICS = OUTPUT / "metrics.json"
FFT_SIZE = 1024
HOP_SIZE = 256
RATE = 48_000
MAX_HZ = 8_000
ERB_BANDS = 30
POWER_FLOOR = 1e-30
F32 = np.dtype("<f4")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def erb_rate(freq):
    return 21.4 * np.log10(1 + 0.00437 * np.asarray(freq, dtype=float))


def hz_from_erb(value):
    return (10 ** (np.asarray(value, dtype=float) / 21.4) - 1) / 0.00437


def erb_edges():
    max_erb = float(erb_rate(MAX_HZ))
    edges_erb = np.linspace(0.0, max_erb, ERB_BANDS + 1)
    edges_hz = hz_from_erb(edges_erb)
    centers_hz = hz_from_erb((edges_erb[:-1] + edges_erb[1:]) / 2)
    return edges_erb, edges_hz, centers_hz


def stft_power(stereo, sample_rate=RATE):
    if stereo.ndim != 2 or stereo.shape[1] != 2 or not len(stereo):
        raise ValueError("STFT input must be non-empty stereo samples")
    if not np.isfinite(stereo).all():
        raise ValueError("STFT input contains non-finite samples")
    window = np.hanning(FFT_SIZE)
    window_sum = float(window.sum())
    bin_hz = sample_rate / FFT_SIZE
    keep = int(math.floor(MAX_HZ / bin_hz)) + 1
    frame_count = max(1, math.ceil(max(0, len(stereo) - FFT_SIZE) / HOP_SIZE) + 1)
    power = np.zeros((frame_count, keep, 2), dtype=np.float64)
    for frame in range(frame_count):
        start = frame * HOP_SIZE
        segment = np.zeros((FFT_SIZE, 2), dtype=np.float64)
        available = stereo[start:min(start + FFT_SIZE, len(stereo))]
        segment[:len(available)] = available
        spectrum = np.fft.rfft(segment * window[:, None], axis=0)
        magnitude = np.abs(spectrum[:keep])
        frame_power = magnitude * magnitude / (window_sum * window_sum)
        frame_power[1:] *= 2
        power[frame] = frame_power
    return power


def erb_aggregate(power):
    _, edges_hz, centers_hz = erb_edges()
    frequencies = np.fft.rfftfreq(FFT_SIZE, 1 / RATE)[:power.shape[1]]
    band_index = np.searchsorted(edges_hz, frequencies, side="right") - 1
    band_index = np.clip(band_index, 0, ERB_BANDS - 1)
    bands = np.zeros((power.shape[0], ERB_BANDS, 2), dtype=np.float64)
    for band in range(ERB_BANDS):
        bins = band_index == band
        if np.any(bins):
            bands[:, band, :] = power[:, bins, :].sum(axis=1)
    return bands, frequencies, band_index, centers_hz


def power_db(power):
    return 10 * np.log10(np.maximum(power, POWER_FLOOR))


def difference_db(a, b):
    if a.shape != b.shape:
        raise ValueError("ERB difference requires aligned arrays")
    return power_db(b) - power_db(a)


def sine_stereo(freq, amplitude=0.5, frames=8192, sample_rate=RATE):
    time = np.arange(frames, dtype=float) / sample_rate
    mono = amplitude * np.sin(2 * np.pi * freq * time)
    return np.column_stack((mono, mono))


def self_check():
    edges_erb, edges_hz, centers = erb_edges()
    assert np.isfinite(edges_erb).all() and np.isfinite(edges_hz).all() and np.isfinite(centers).all()
    assert np.all(np.diff(edges_erb) > 0) and np.all(np.diff(edges_hz) > 0) and np.all(np.diff(centers) > 0)
    assert edges_hz[0] == 0 and math.isclose(edges_hz[-1], MAX_HZ, abs_tol=1e-9)
    silence = np.zeros((4096, 2), dtype=np.float64)
    silence_power = stft_power(silence)
    silence_bands, _, _, _ = erb_aggregate(silence_power)
    assert np.isfinite(silence_bands).all() and not np.any(silence_bands)
    assert np.isfinite(power_db(silence_bands)).all()
    low_power = stft_power(sine_stereo(250))
    high_power = stft_power(sine_stereo(4000))
    low_bands, _, _, centers = erb_aggregate(low_power)
    high_bands, _, _, _ = erb_aggregate(high_power)
    low_peak = int(np.argmax(low_bands.sum(axis=(0, 2))))
    high_peak = int(np.argmax(high_bands.sum(axis=(0, 2))))
    assert centers[low_peak] < 600 and centers[high_peak] > 3000 and high_peak > low_peak
    low_half_power = stft_power(sine_stereo(250, amplitude=0.25))
    low_half_bands, _, _, _ = erb_aggregate(low_half_power)
    ratio = float(low_bands.sum() / low_half_bands.sum())
    assert math.isclose(ratio, 4.0, rel_tol=0.02), ratio
    diff = difference_db(low_bands, low_bands)
    assert np.isfinite(diff).all() and np.array_equal(diff, np.zeros_like(diff))
    return {"passed": True, "erbBands": ERB_BANDS, "lowToneHz": 250, "highToneHz": 4000,
            "sameInputDifferenceDb": 0.0, "doubleAmplitudePowerRatio": ratio,
            "silenceFinite": True, "bandBoundariesMonotonic": True}


def read_float(path, expected):
    values = np.fromfile(path, dtype=F32)
    if len(values) != expected:
        raise ValueError(f"{path}: expected {expected} Float32 values, found {len(values)}")
    if not np.isfinite(values).all():
        raise ValueError(f"{path}: non-finite Float32 sample")
    return values.astype(np.float64, copy=False)


def read_stereo(root, relative, frames):
    values = read_float(root / relative, frames * 2)
    return values.reshape(frames, 2)


def slope_db_per_second(values, times, mask):
    selected = np.asarray(values)[mask]
    time = np.asarray(times)[mask]
    valid = np.isfinite(selected) & (selected > 0)
    if int(valid.sum()) < 2:
        return {"dbPerSecond": None, "rSquared": None, "points": int(valid.sum())}
    x = time[valid]
    y = np.log(selected[valid])
    slope, intercept = np.polyfit(x, y, 1)
    fit = intercept + slope * x
    total = float(np.sum((y - np.mean(y)) ** 2))
    residual = float(np.sum((y - fit) ** 2))
    return {"dbPerSecond": float(10 * slope / math.log(10)),
            "rSquared": 1 - residual / total if total else 1.0,
            "points": int(valid.sum())}


def modal_analysis(geometry, pair_rows):
    nodes = geometry["solverNodes"]
    neighbors = np.asarray(geometry["neighborIndices"], dtype=np.int64).reshape(nodes, 4)
    operator = np.eye(nodes, dtype=np.float64) * 4
    row, column = np.nonzero(neighbors >= 0)
    operator[row, neighbors[row, column]] -= 1
    if not np.allclose(operator, operator.T, rtol=0, atol=0):
        raise ValueError(f"{geometry['key']}: masked four-neighbor operator is not symmetric")
    q, vectors = np.linalg.eigh(operator)
    pivot = np.flatnonzero(np.isclose(q, 4.0, rtol=0, atol=1e-9))
    if abs(float(np.median(q)) - 4) > 1e-9:
        raise ValueError(f"{geometry['key']}: q=4 is not the median eigenvalue")
    groups = {"low_q_lt_4": q < 4 - 1e-9, "q4_pivot": np.isin(np.arange(nodes), pivot),
              "high_q_gt_4": q > 4 + 1e-9}
    if sum(int(mask.sum()) for mask in groups.values()) != nodes:
        raise ValueError("q groups do not cover all modes")
    result = {"key": geometry["key"], "nodeCount": nodes,
        "qQuantiles": {name: float(np.quantile(q, p)) for name, p in
                       (("min", 0), ("p10", .1), ("p25", .25), ("median", .5), ("p75", .75), ("p90", .9), ("max", 1))},
        "q4PivotModes": int(len(pivot)), "groupCounts": {name: int(mask.sum()) for name, mask in groups.items()},
        "groups": {}}
    first_pulse = pair_rows[0]["strikeFrame"] // 8
    pulse_end = first_pulse + 18
    window_frames = RATE // 8 // 40  # 25 ms at 6 kHz.
    projected = {}
    for row in pair_rows:
        fields = read_float(OUTPUT / row["files"]["fields"], row["fieldFrames"] * nodes).reshape(-1, nodes)
        projected[row["condition"]] = fields @ vectors
    for name, mask in groups.items():
        result["groups"][name] = {}
        for row in pair_rows:
            modal = projected[row["condition"]]
            energy = np.sum(modal[:, mask] ** 2, axis=1) / nodes
            pulse_energy = energy[first_pulse:pulse_end]
            post = energy[pulse_end:]
            complete = len(post) // window_frames
            curve = post[:complete * window_frames].reshape(complete, window_frames).mean(axis=1)
            centers_sec = (np.arange(complete) + 0.5) * window_frames / 6000
            slope = slope_db_per_second(curve, centers_sec, np.ones(complete, dtype=bool))
            initial = float(curve[0]) if len(curve) else 0.0
            result["groups"][name][row["condition"]] = {
                "pulseOnsetPeakMeanSquare": float(np.max(pulse_energy)) if len(pulse_energy) else 0.0,
                "pulseEndMeanSquare": float(energy[pulse_end - 1]),
                "firstPostPulse25msMeanSquare": initial,
                "postPulseSlopeDbPerSecond": slope,
                "remainingEnergyCurve": [{"midpointMs": float(t * 1000),
                    "meanSquare": float(value), "fractionOfFirst25ms": float(value / initial) if initial else 0.0}
                    for t, value in zip(centers_sec, curve)],
                "curveWindowMs": 25, "curveReference": "each arm's own first complete post-pulse 25 ms window; onset power is separately reported",
            }
    return result


def summarize_group_bands(bands, frame_times, pulse_end_ms):
    groups = {"low_erb": slice(0, 10), "mid_erb": slice(10, 20), "high_erb": slice(20, 30)}
    windows = {"early_0_100ms": (pulse_end_ms, pulse_end_ms + 100),
               "middle_100_500ms": (pulse_end_ms + 100, pulse_end_ms + 500),
               "late_500_1500ms": (pulse_end_ms + 500, 1500)}
    result = {}
    for name, band_range in groups.items():
        group_power = bands[:, band_range, :].sum(axis=1).mean(axis=1)
        frames = {}
        for window_name, (start, end) in windows.items():
            mask = (frame_times >= start / 1000) & (frame_times < end / 1000)
            mean_power = float(group_power[mask].mean()) if np.any(mask) else 0.0
            frames[window_name] = {"meanLinearPower": mean_power,
                "powerDbfs": float(power_db(mean_power)), "frames": int(mask.sum())}
        slope_mask = frame_times >= pulse_end_ms / 1000
        slope = slope_db_per_second(group_power, frame_times, slope_mask)
        result[name] = {"subbands": [int(band_range.start), int(band_range.stop)],
            "earlyMiddleLateMeanPower": frames, "postPulseSlopeDbPerSecond": slope}
    return result


def run():
    index_bytes = INDEX.read_bytes()
    metrics_bytes = METRICS.read_bytes()
    index = json.loads(index_bytes)
    metrics = json.loads(metrics_bytes)
    if index["productionMain"] != "d45823d40c9a87c1b333fa9872f3c897ee9ab01b":
        raise ValueError("render index production baseline does not match main")
    if index["researchHead"] != "7761c4b10d77c657bc23c1691c95c04ea78bb739":
        raise ValueError("render index source commit differs from the requested research baseline")
    if len(index["rows"]) != 6 or len(metrics["cases"]) != 6:
        raise ValueError("expected exactly six isolated single-contact renders")
    metric_by_id = {item["id"]: item for item in metrics["cases"]}
    geometries = {item["key"]: item for item in index["geometries"]}
    rows_by_key = {}
    for row in index["rows"]:
        rows_by_key.setdefault(row["plateKey"], {})[row["condition"]] = row
    edge_erb, edge_hz, centers_hz = erb_edges()
    frequency_bins = np.fft.rfftfreq(FFT_SIZE, 1 / RATE)[:int(math.floor(MAX_HZ / (RATE / FFT_SIZE))) + 1]
    _, edges_hz_check, _ = erb_edges()
    band_index = np.clip(np.searchsorted(edges_hz_check, frequency_bins, side="right") - 1, 0, ERB_BANDS - 1)
    if not np.all(np.diff(edge_hz) > 0) or not np.isfinite(edge_hz).all():
        raise ValueError("ERB band boundaries are invalid")

    pair_reports, series = [], {"schemaVersion": 1, "timeAxis": "left-aligned STFT frame start; 1024 samples, 256-sample hop",
        "erbBands": ERB_BANDS, "nativeFixedGain": True, "perClipNormalization": False, "plates": {}}
    pulse_end_ms = 13.0
    for key, arms in rows_by_key.items():
        if set(arms) != {"flat", "frequency"}:
            raise ValueError(f"{key}: both matched arms required")
        flat, frequency = arms["flat"], arms["frequency"]
        for a, b in (("scheduleSha256", "scheduleSha256"), ("geometryKey", "geometryKey"),
                     ("fieldFrames", "fieldFrames"), ("nodeCount", "nodeCount"), ("strikeFrame", "strikeFrame")):
            if flat[a] != frequency[b]:
                raise ValueError(f"{key}: arms differ in {a}")
        geom = geometries[key]
        modal = modal_analysis(geom, [flat, frequency])
        arm_data, erb_power = {}, {}
        for row in (flat, frequency):
            case = metric_by_id[row["id"]]
            pcm = read_stereo(OUTPUT, row["files"]["pcm"], row["frames"])
            pickup = read_stereo(OUTPUT, row["files"]["rawPickup"], row["fieldFrames"])
            post_pcm = pcm[row["strikeFrame"]:]
            post_raw = pickup[(row["strikeFrame"] + 7) // 8:]
            out_window = RATE // 40  # 25 ms.
            raw_window = 6000 // 40
            pcm_windows = post_pcm[:len(post_pcm) // out_window * out_window].reshape(-1, out_window, 2)
            raw_windows = post_raw[:len(post_raw) // raw_window * raw_window].reshape(-1, raw_window, 2)
            pcm_env = np.sqrt(np.mean(pcm_windows ** 2, axis=(1, 2)))
            raw_env = np.sqrt(np.mean(raw_windows ** 2, axis=(1, 2)))
            early_pcm = post_pcm[:out_window]
            late_pcm = post_pcm[min(len(post_pcm), RATE // 2):]
            early_raw = post_raw[:raw_window]
            late_raw = post_raw[min(len(post_raw), 6000 // 2):]
            power = stft_power(pcm)
            band_power, _, _, _ = erb_aggregate(power)
            frame_times = np.arange(len(band_power), dtype=float) * HOP_SIZE / RATE
            erb_power[row["condition"]] = band_power
            arm_data[row["condition"]] = {
                "fixedGainOutputMetrics": case["metrics"],
                "fixedGainOutputEarly25msRms": float(np.sqrt(np.mean(early_pcm ** 2))),
                "fixedGainOutputLate500msToEndRms": float(np.sqrt(np.mean(late_pcm ** 2))),
                "fixedGainOutput25msEnvelopeRms": pcm_env.tolist(),
                "fixedGainRawPickupMetrics": case["metrics"].get("rawPickup"),
                "fixedGainRawPickupEarly25msRms": float(np.sqrt(np.mean(early_raw ** 2))),
                "fixedGainRawPickupLate500msToEndRms": float(np.sqrt(np.mean(late_raw ** 2))),
                "fixedGainRawPickup25msEnvelopeRms": raw_env.tolist(),
                "limiterContribution": case["metrics"].get("limiterContribution"),
                "stftFrameCount": len(power),
                "stereoCorrelation": float(np.corrcoef(post_pcm[:, 0], post_pcm[:, 1])[0, 1]),
                "erbBandDecay": {"left": [slope_db_per_second(band_power[:, band, 0], frame_times,
                        frame_times >= pulse_end_ms / 1000) for band in range(ERB_BANDS)],
                    "right": [slope_db_per_second(band_power[:, band, 1], frame_times,
                        frame_times >= pulse_end_ms / 1000) for band in range(ERB_BANDS)]},
                "erbGroupTails": summarize_group_bands(band_power, frame_times, pulse_end_ms),
            }
        diff = {"outputRmsDeltaDb": metric_by_id[frequency["id"]]["metrics"]["rmsDbfs"] -
                                      metric_by_id[flat["id"]]["metrics"]["rmsDbfs"],
            "outputPeakDelta": metric_by_id[frequency["id"]]["metrics"]["peakAbs"] - metric_by_id[flat["id"]]["metrics"]["peakAbs"],
            "leftRmsDeltaDb": 20 * math.log10(metric_by_id[frequency["id"]]["metrics"]["rmsLeft"] /
                                               metric_by_id[flat["id"]]["metrics"]["rmsLeft"]),
            "rightRmsDeltaDb": 20 * math.log10(metric_by_id[frequency["id"]]["metrics"]["rmsRight"] /
                                                metric_by_id[flat["id"]]["metrics"]["rmsRight"]),
            "centroidDeltaHz": metric_by_id[frequency["id"]]["metrics"]["spectralCentroidHz"] -
                               metric_by_id[flat["id"]]["metrics"]["spectralCentroidHz"]}
        diff["erbDifferenceDb"] = {channel: difference_db(erb_power["flat"][:, :, ch],
                                             erb_power["frequency"][:, :, ch]).astype(np.float32).tolist()
                                    for ch, channel in enumerate(("left", "right"))}
        diff["erbGroupTailDeltaDb"] = {}
        for group_name in ("low_erb", "mid_erb", "high_erb"):
            diff["erbGroupTailDeltaDb"][group_name] = {
                window_name: arm_data["frequency"]["erbGroupTails"][group_name]["earlyMiddleLateMeanPower"][window_name]["powerDbfs"]
                    - arm_data["flat"]["erbGroupTails"][group_name]["earlyMiddleLateMeanPower"][window_name]["powerDbfs"]
                for window_name in ("early_0_100ms", "middle_100_500ms", "late_500_1500ms")}
        pair_reports.append({"key": key, "nodeCount": geom["solverNodes"], "lossArms": arm_data,
            "fieldModes": modal, "actualPickupDifference": diff})
        series["plates"][key] = {"timesSeconds": frame_times.tolist(),
            "flat": {"left": erb_power["flat"][:, :, 0].astype(np.float32).tolist(),
                     "right": erb_power["flat"][:, :, 1].astype(np.float32).tolist()},
            "frequency": {"left": erb_power["frequency"][:, :, 0].astype(np.float32).tolist(),
                          "right": erb_power["frequency"][:, :, 1].astype(np.float32).tolist()},
            "differenceDb": diff["erbDifferenceDb"]}
        del modal, erb_power

    stft_meta = {"fftSize": FFT_SIZE, "window": "symmetric Hann: 0.5 - 0.5*cos(2*pi*n/(N-1))",
        "hopSize": HOP_SIZE, "sampleRate": RATE, "frameCount": pair_reports[0]["lossArms"]["flat"]["stftFrameCount"],
        "frequencyBinSpacingHz": RATE / FFT_SIZE,
        "displayedFrequencyBins": int(len(frequency_bins)), "displayedFrequencyRangeHz": [0, float(frequency_bins[-1])],
        "frequencyBinUpperSelection": "bin centers <= 8000 Hz; last included center is 7968.75 Hz",
        "displayScaleDbfs": [-100, 0], "nativeScale": "fixed gain; no per-clip normalization",
        "existingRenderer": "scripts/audio-snapshot-renderer.js buildAudioSnapshot defaults, same FFT/window/hop and fixed dBFS scale"}
    erb_meta = {"rateDefinition": "E(f)=21.4*log10(1+0.00437*f)", "bands": ERB_BANDS,
        "boundariesErbRate": edge_erb.tolist(), "boundariesHz": edge_hz.tolist(), "centersHz": centers_hz.tolist(),
        "boundaryRule": "half-open [low, high); DC belongs to first band; bin centers through 7968.75 Hz included",
        "dcTreatment": "include DC bin as undoubled one-sided linear power in first band",
        "linearPower": "|rFFT|^2 / sum(Hann)^2; double positive-frequency bins except DC and Nyquist; sum linear bin power by band before 10*log10",
        "stft": {"fftSize": FFT_SIZE, "window": "same symmetric Hann as existing fixed-scale renderer",
            "hopSize": HOP_SIZE, "sampleRate": RATE, "frameCount": stft_meta["frameCount"],
            "displayedFrequencyRangeHz": [0, float(frequency_bins[-1])]},
        "nativeFixedGain": True, "perClipNormalization": False, "logFloorLinearPower": POWER_FLOOR,
        "visualDisplayScaleDbfs": [-100, 0],
        "descriptiveGroups": {"low_erb": [0, 10], "mid_erb": [10, 20], "high_erb": [20, 30],
            "definition": "three equal ERB-rate thirds, ten equal-ERB subbands each; descriptive grouping, not a perceptual threshold"}}
    series["definition"] = erb_meta
    series_bytes = json.dumps(series, separators=(",", ":"), allow_nan=False).encode()
    series_gzip = gzip.compress(series_bytes, compresslevel=9, mtime=0)
    (EVIDENCE / "erb-time-series.json.gz").write_bytes(series_gzip)
    report = {"schemaVersion": 1, "decision" : None, "renderIndexSha256": sha256(index_bytes),
        "fixedGainMetricsSha256": sha256(metrics_bytes), "renderCount": len(index["rows"]),
        "fixedScaleStft": stft_meta, "erb": erb_meta, "manipulation": index["manipulation"],
        "pairs": pair_reports, "series": {"path": "erb-time-series.json.gz", "bytes": len(series_gzip),
            "sha256": sha256(series_gzip)},
        "interpretationLimits": ["Power shares are pickup/readout measurements, not joules.",
            "ERB-rate binning is an STFT sidecar, not a gammatone filterbank or cochleogram.",
            "ERB absolute levels use |rFFT|^2/sum(Hann)^2 and are descriptive, not Parseval-calibrated broadband energy.",
            "Band decay slopes are aggregate finite-window measurements, not free-pole estimates.",
            "Off-q4 input gain also changes; actual pickup deltas combine onset participation and post-pulse decay.",
            "No level-normalized character view or automatic audibility judgment was run."]}
    (EVIDENCE / "analysis.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf8")
    print(json.dumps({"pairs": [{"key": item["key"],
        "flatRms": item["lossArms"]["flat"]["fixedGainOutputMetrics"]["rms"],
        "frequencyRms": item["lossArms"]["frequency"]["fixedGainOutputMetrics"]["rms"],
        "deltaRmsDb": item["actualPickupDifference"]["outputRmsDeltaDb"],
        "flatModalSlope": item["fieldModes"]["groups"]["low_q_lt_4"]["flat"]["postPulseSlopeDbPerSecond"]["dbPerSecond"],
        "frequencyModalSlope": item["fieldModes"]["groups"]["low_q_lt_4"]["frequency"]["postPulseSlopeDbPerSecond"]["dbPerSecond"]}
        for item in pair_reports], "stft": stft_meta, "erbBands": ERB_BANDS}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        print(json.dumps(self_check(), indent=2))
    else:
        check = self_check()
        print(json.dumps({"selfCheck": check}, indent=2))
        run()
