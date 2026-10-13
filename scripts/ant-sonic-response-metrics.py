#!/usr/bin/env python3
"""Describe captured ANT sonic responses without ranking listener individuality."""
import argparse
import itertools
import json
import math
from pathlib import Path

import numpy as np


BANDS = ((0, 100), (100, 300), (300, 1000), (1000, 3000), (3000, 24000))
FIXED_BIN_HZ = 50
FIXED_BIN_MAX_HZ = 3000


def require_finite(name, values):
    if not np.isfinite(values).all():
        raise ValueError(f"{name} contains non-finite values")


def read_f32(path, name):
    data = np.fromfile(path, dtype="<f4")
    require_finite(name, data)
    return data.astype(np.float64, copy=False)


def db(value):
    return 20.0 * math.log10(value) if value > 0 else None


def spectrum(signal, sample_rate):
    """Stereo-summed rectangular one-sided power, Parseval-scaled to sample energy."""
    n = len(signal)
    power = np.sum(np.abs(np.fft.rfft(signal, axis=0)) ** 2, axis=1) / n
    power[1:-1] *= 2
    if n % 2 and len(power) > 1:
        power[-1] *= 2
    freq = np.fft.rfftfreq(n, 1.0 / sample_rate)
    return freq, power


def fixed_bin_distribution(freq, power):
    rows = []
    for low in range(0, FIXED_BIN_MAX_HZ, FIXED_BIN_HZ):
        high = low + FIXED_BIN_HZ
        bin_power = float(power[(freq >= low) & (freq < high)].sum())
        rows.append((low, high, bin_power))
    total_power = float(power.sum())
    in_range_power = sum(row[2] for row in rows)
    return rows, total_power, in_range_power


def fixed_bin_rows(freq, power):
    bins, total, in_range = fixed_bin_distribution(freq, power)
    return [{"lowHz": low, "highHz": high, "power": value,
             "fractionOfTotalPower": value / total if total else None,
             "shareWithin0To3000Hz": value / in_range if in_range else None}
            for low, high, value in bins]


def envelope_rms_cosine(a, b, sample_rate_a, sample_rate_b):
    if sample_rate_a != sample_rate_b:
        return None, 0
    window = int(round(sample_rate_a * .025))
    if window <= 0:
        return None, 0
    count = min(len(a), len(b)) // window
    if count == 0:
        return None, 0
    xa = a[:count * window].reshape(count, window, -1)
    xb = b[:count * window].reshape(count, window, -1)
    ea = np.sqrt(np.mean(xa * xa, axis=(1, 2)))
    eb = np.sqrt(np.mean(xb * xb, axis=(1, 2)))
    denom = float(np.linalg.norm(ea) * np.linalg.norm(eb))
    return (float(np.dot(ea, eb) / denom) if denom else None), count


def field_envelope_rms(field_energy, node_count, sample_rate):
    window = int(round(sample_rate * .025))
    count = len(field_energy) // window if window > 0 else 0
    if count == 0:
        return np.empty(0)
    return np.sqrt(field_energy[:count * window].reshape(count, window).mean(axis=1) / node_count)


def local_peaks(freq, power, limit=8):
    if len(power) < 3:
        return []
    candidates = np.flatnonzero((power[1:-1] >= power[:-2]) & (power[1:-1] > power[2:])) + 1
    candidates = [i for i in candidates if freq[i] >= 20]
    candidates.sort(key=lambda i: power[i], reverse=True)
    result = []
    for i in candidates[:limit]:
        # Three-bin parabolic interpolation gives a less bin-locked frequency estimate.
        a, b, c = np.log(np.maximum(power[i - 1:i + 2], np.finfo(float).tiny))
        denom = a - 2 * b + c
        offset = 0.5 * (a - c) / denom if denom else 0.0
        result.append({"frequencyHz": float(freq[i] + offset * (freq[1] - freq[0])),
                       "relativePower": float(power[i] / power.sum())})
    return result


def energy_times(energy, sample_rate):
    total = float(energy.sum())
    if total <= 0:
        return {"t50Ms": None, "t90Ms": None, "t99Ms": None,
                "tailAfterPeak50Ms": None, "tailAfterPeak10Ms": None,
                "tailAfterPeak1Ms": None}
    cumulative = np.cumsum(energy) / total
    peak = int(np.argmax(energy))
    tail = np.cumsum(energy[peak:][::-1])[::-1] / float(energy[peak:].sum())
    def first(values, threshold):
        ids = np.flatnonzero(values >= threshold)
        return int(ids[0]) if len(ids) else None
    def first_below(values, threshold):
        ids = np.flatnonzero(values <= threshold)
        return int(ids[0]) if len(ids) else None
    def ms(index): return None if index is None else index * 1000.0 / sample_rate
    return {"t50Ms": ms(first(cumulative, .50)), "t90Ms": ms(first(cumulative, .90)),
            "t99Ms": ms(first(cumulative, .99)),
            "tailAfterPeak50Ms": ms(first_below(tail, .50)),
            "tailAfterPeak10Ms": ms(first_below(tail, .10)),
            "tailAfterPeak1Ms": ms(first_below(tail, .01))}


def summarize(signal, sample_rate):
    energy = np.sum(signal * signal, axis=1)
    rms = float(np.sqrt(energy.sum() / (2 * len(signal)))) if len(signal) else 0.0
    freq, power = spectrum(signal, sample_rate)
    total = float(power.sum())
    bands = {}
    for low, high in BANDS:
        mask = (freq >= low) & (freq < high if high < sample_rate / 2 else freq <= high)
        bands[f"{low}-{high}Hz"] = float(power[mask].sum() / total) if total else None
    return {"frames": int(len(signal)), "durationMs": len(signal) * 1000.0 / sample_rate,
            "rms": rms, "rmsDbfs": db(rms),
            "rmsLeft": float(np.sqrt(np.mean(signal[:, 0] ** 2))) if len(signal) else 0.0,
            "rmsRight": float(np.sqrt(np.mean(signal[:, 1] ** 2))) if len(signal) else 0.0,
            "peakAbs": float(np.max(np.abs(signal))) if signal.size else 0.0,
            "peakAbsLeft": float(np.max(np.abs(signal[:, 0]))) if len(signal) else 0.0,
            "peakAbsRight": float(np.max(np.abs(signal[:, 1]))) if len(signal) else 0.0,
            "dcPowerFraction": float(power[0] / total) if total else None,
            "spectralCentroidHz": float((freq * power).sum() / total) if total else None,
            "bandPowerFractions": bands, "strongestPeaks": local_peaks(freq, power),
            "fixedBin50HzAnalysis": "descriptive 50 Hz intervals from 0 to 3000 Hz; not auditory bands or thresholds",
            "power50HzBins": fixed_bin_rows(freq, power),
            "energyTimes": energy_times(energy, sample_rate), "frequencyHz": freq, "power": power}


def resolve_strike(row):
    if isinstance(row.get("strikeFrame"), int):
        return row["strikeFrame"]
    metadata = row.get("metadata") or {}
    for obj in (metadata, metadata.get("event", {}), metadata.get("strike", {})):
        if isinstance(obj, dict) and isinstance(obj.get("strikeFrame"), int):
            return obj["strikeFrame"]
        if isinstance(obj, dict) and isinstance(obj.get("frame"), int):
            return obj["frame"]
    # The current capture contract places the strike at 10 ms for every response.
    return 480


def paired_metrics(a, b):
    base = a["signal"]
    other = b["signal"]
    n = min(len(base), len(other))
    if n == 0:
        return {"frames": 0, "relativeL2": None, "rmsDeltaDb": None,
                "zeroLagCorrelation": None, "powerSpectrumCosine": None,
                "powerCosine50HzBins": None, "envelope25msRmsCosine": None,
                "centroidShiftHz": None, "t90ShiftMs": None}
    x, y = base[:n], other[:n]
    denom = float(np.sum(x * x))
    xa, ya = x.ravel(), y.ravel()
    xnorm, ynorm = float(np.linalg.norm(xa)), float(np.linalg.norm(ya))
    correlation = float(np.dot(xa, ya) / (xnorm * ynorm)) if xnorm and ynorm else None
    pa, pb = a["summary"]["power"], b["summary"]["power"]
    pn = min(len(pa), len(pb))
    cosine = float(np.dot(pa[:pn], pb[:pn]) /
                   (np.linalg.norm(pa[:pn]) * np.linalg.norm(pb[:pn]))) if np.linalg.norm(pa[:pn]) and np.linalg.norm(pb[:pn]) else None
    bin_a = np.array([row["power"] for row in a["summary"]["power50HzBins"]])
    bin_b = np.array([row["power"] for row in b["summary"]["power50HzBins"]])
    bin_denom = float(np.linalg.norm(bin_a) * np.linalg.norm(bin_b))
    bin_cosine = float(np.dot(bin_a, bin_b) / bin_denom) if bin_denom else None
    env_cosine, env_windows = envelope_rms_cosine(base, other, a["sampleRate"], b["sampleRate"])
    rms_a = float(np.sqrt(np.mean(x * x)))
    rms_b = float(np.sqrt(np.mean(y * y)))
    return {"frames": n,
            "relativeL2": float(np.sqrt(np.sum((y - x) ** 2) / denom)) if denom else None,
            "rmsDeltaDb": (db(rms_b) - db(rms_a)) if rms_a and rms_b else None,
            "zeroLagCorrelation": correlation, "powerSpectrumCosine": cosine,
            "powerCosine50HzBins": bin_cosine,
            "envelope25msRmsCosine": env_cosine, "envelope25msWindows": env_windows,
            "centroidShiftHz": b["summary"]["spectralCentroidHz"] - a["summary"]["spectralCentroidHz"]
                if a["summary"]["spectralCentroidHz"] is not None and b["summary"]["spectralCentroidHz"] is not None else None,
            "t90ShiftMs": b["summary"]["energyTimes"]["t90Ms"] - a["summary"]["energyTimes"]["t90Ms"]
                if a["summary"]["energyTimes"]["t90Ms"] is not None and b["summary"]["energyTimes"]["t90Ms"] is not None else None,
            "exactPCMMatch": bool(len(base) == len(other) and np.array_equal(base, other)),
            "maxAbsDifference": float(np.max(np.abs(y - x)))}


def load_case(row, root):
    files = row.get("files") or {}
    if not files.get("pcm"):
        raise ValueError(f"{row.get('id')}: files.pcm is required")
    pcm = read_f32(root / files["pcm"], f"{row.get('id')} PCM")
    if len(pcm) % 2:
        raise ValueError(f"{row.get('id')}: PCM float count must be even (stereo)")
    pcm = pcm.reshape(-1, 2)
    if row.get("frames") is not None and len(pcm) != int(row["frames"]):
        raise ValueError(f"{row.get('id')}: PCM frame count disagrees with render index")
    strike = resolve_strike(row)
    if strike < 0 or strike >= len(pcm):
        raise ValueError(f"{row.get('id')}: strikeFrame is outside PCM")
    audio = pcm[strike:]
    rate = int(row.get("sampleRate", 48000))
    if rate <= 0:
        raise ValueError(f"{row.get('id')}: sampleRate must be positive")
    summary = summarize(audio, rate)
    result = {"row": row, "signal": audio, "summary": summary, "strikeFrame": strike, "sampleRate": rate}
    result["metrics"] = {k: v for k, v in summary.items() if k not in ("frequencyHz", "power")}
    fields_path = files.get("fields")
    if fields_path:
        node_count = int(row["nodeCount"])
        raw = read_f32(root / fields_path, f"{row.get('id')} fields")
        if node_count <= 0 or len(raw) % node_count:
            raise ValueError(f"{row.get('id')}: field float count must be divisible by nodeCount")
        matrix = raw.reshape(-1, node_count)
        if row.get("fieldFrames") is not None and len(matrix) != int(row["fieldFrames"]):
            raise ValueError(f"{row.get('id')}: field frame count disagrees with render index")
        start = (strike + 7) // 8
        if start >= len(matrix):
            raise ValueError(f"{row.get('id')}: no field frames at/after strike")
        field = matrix[start:]
        field_energy = np.sum(field * field, axis=1)
        field_rms = float(np.sqrt(np.mean(field * field)))
        fp = np.sum(np.abs(np.fft.rfft(field, axis=0)) ** 2, axis=1) / (len(field) * node_count)
        fp[1:-1] *= 2
        if len(field) % 2 and len(fp) > 1:
            fp[-1] *= 2
        field_rate = int(row.get("fieldSampleRate", 6000))
        if field_rate <= 0:
            raise ValueError(f"{row.get('id')}: fieldSampleRate must be positive")
        hz = np.fft.rfftfreq(len(field), 1 / field_rate)
        norm = float(fp.sum())
        mean_node_power = field_rms ** 2
        if not math.isclose(norm, len(field) * mean_node_power, rel_tol=1e-10, abs_tol=1e-15):
            raise ValueError(f"{row.get('id')}: field PSD failed Parseval energy check")
        field_bands = {}
        for low, high in BANDS:
            mask = (hz >= low) & (hz < high if high < field_rate / 2 else hz <= high)
            field_bands[f"{low}-{high}Hz"] = float(fp[mask].sum() / norm) if norm else None
        field_metrics = {"frames": len(field), "startFrame": start,
                         "fieldRms": field_rms,
                         "summedNodePower": float(field_energy.mean()),
                         "meanNodePower": mean_node_power,
                         "meanNodeCapturedEnergy": norm,
                         "dcPowerFraction": float(fp[0] / norm) if norm else None,
                         "spectralCentroidHz": float((hz * fp).sum() / norm) if norm else None,
                         "bandPowerFractions": field_bands,
                         "fixedBin50HzAnalysis": "descriptive 50 Hz intervals from 0 to 3000 Hz; not auditory bands or thresholds",
                         "power50HzBins": fixed_bin_rows(hz, fp),
                         "energyTimes": energy_times(field_energy, field_rate)}
        result["field"] = {**field_metrics, "power": fp, "frequencyHz": hz,
                           "envelope25msRms": field_envelope_rms(field_energy, node_count, field_rate)}
        result["metrics"]["field"] = field_metrics
    raw_pickup_path = files.get("rawPickup")
    if raw_pickup_path:
        raw = read_f32(root / raw_pickup_path, f"{row.get('id')} rawPickup")
        if len(raw) % 2:
            raise ValueError(f"{row.get('id')}: rawPickup float count must be even (stereo)")
        rp = raw.reshape(-1, 2)
        start = (strike + 7) // 8
        if start < len(rp):
            result["metrics"]["rawPickup"] = summarize(rp[start:], int(row.get("fieldSampleRate", 6000)))
            result["metrics"]["rawPickup"].pop("frequencyHz", None)
            result["metrics"]["rawPickup"].pop("power", None)
            result["metrics"]["rawPickup"].pop("fixedBin50HzAnalysis", None)
            result["metrics"]["rawPickup"].pop("power50HzBins", None)
    return result


def cosine(a, b):
    n = min(len(a), len(b))
    x, y = a[:n], b[:n]
    return float(np.dot(x, y) / (np.linalg.norm(x) * np.linalg.norm(y))) if np.linalg.norm(x) and np.linalg.norm(y) else None


def run(index_path, output_path):
    index_path = Path(index_path).resolve()
    doc = json.loads(index_path.read_text(encoding="utf-8"))
    rows = doc if isinstance(doc, list) else doc.get("rows") if isinstance(doc, dict) else None
    if not isinstance(rows, list):
        raise ValueError("render index must be an array or an object with a rows array")
    cases = [load_case(row, Path.cwd()) for row in rows]
    pairwise = []
    grouped = {}
    for case in cases:
        row = case["row"]
        grouped.setdefault((row.get("condition"), row.get("positionLabel")), []).append(case)
    for (condition, position), group in grouped.items():
        for a, b in itertools.combinations(group, 2):
            ra, rb = a["row"], b["row"]
            if ra.get("plateKey") == rb.get("plateKey"):
                continue
            item = {"condition": condition, "positionLabel": position,
                    "a": ra.get("id"), "b": rb.get("id"),
                    "output": paired_metrics(a, b)}
            if "field" in a and "field" in b:
                fa, fb = a["field"], b["field"]
                item["fieldPowerSpectrumCosine"] = cosine(fa["power"], fb["power"])
                fba = np.array([row["power"] for row in fa["power50HzBins"]])
                fbb = np.array([row["power"] for row in fb["power50HzBins"]])
                fden = float(np.linalg.norm(fba) * np.linalg.norm(fbb))
                item["fieldPowerCosine50HzBins"] = float(np.dot(fba, fbb) / fden) if fden else None
                fenv = cosine(fa["envelope25msRms"], fb["envelope25msRms"])
                item["fieldEnvelope25msRmsCosine"] = fenv
                item["fieldEnvelope25msWindows"] = min(len(fa["envelope25msRms"]), len(fb["envelope25msRms"]))
                item["fieldCentroidShiftHz"] = fb["spectralCentroidHz"] - fa["spectralCentroidHz"] \
                    if fa["spectralCentroidHz"] is not None and fb["spectralCentroidHz"] is not None else None
                item["fieldT90ShiftMs"] = fb["energyTimes"]["t90Ms"] - fa["energyTimes"]["t90Ms"] \
                    if fa["energyTimes"]["t90Ms"] is not None and fb["energyTimes"]["t90Ms"] is not None else None
            pairwise.append(item)
    ablations = []
    by_plate_position = {}
    for case in cases:
        r = case["row"]
        by_plate_position.setdefault((r.get("plateKey"), r.get("positionLabel")), {})[r.get("condition")] = case
    for (plate, position), group in by_plate_position.items():
        native = group.get("native")
        if native:
            for condition in ("material-median", "material-low", "material-high"):
                if condition in group:
                    ablations.append({"plateKey": plate, "positionLabel": position,
                                      "condition": condition,
                                      "relativeTo": "native",
                                      "response": paired_metrics(native, group[condition])})
        for left, right in (("world-isolated", "world-none"), ("world-none", "world-z"),
                            ("world-z", "world-zn"), ("world-none", "world-zn")):
            if left in group and right in group:
                ablations.append({"plateKey": plate, "positionLabel": position,
                                  "condition": right, "relativeTo": left,
                                  "response": paired_metrics(group[left], group[right])})
    output = {"method": {"version": 1,
                         "alignment": "PCM from strikeFrame; fields/rawPickup from ceil(strikeFrame/8) physics frame",
                         "spectrum": "whole post-strike rectangular FFT; one-sided power scaled by Parseval, stereo summed; field spectrum sums per-node power then divides by node count",
                         "fixedBinAnalysis": "50 Hz half-open frequency intervals from 0 to 3000 Hz; descriptive resolution only, not auditory bands or thresholds; per-case bin rows include absolute power and normalized shares",
                         "pairedEnvelope": "cosine of disjoint 25 ms RMS windows using only the common complete windows",
                         "timing": "cumulative energy shares and post-peak remaining-energy thresholds; no T60 fit",
                         "interpretation": "descriptive output/material comparisons only; spectral shape does not establish listener distinguishability"},
              "cases": [{"id": c["row"].get("id"), "plateKey": c["row"].get("plateKey"),
                         "condition": c["row"].get("condition"),
                         "positionLabel": c["row"].get("positionLabel"),
                         "strikeFrame": c["strikeFrame"], "metrics": c["metrics"]} for c in cases],
              "pairwise": pairwise, "ablations": ablations}
    Path(output_path).write_text(json.dumps(output, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def self_check():
    n, rate, bin_no = 4096, 48000, 37
    t = np.arange(n) / rate
    tone = np.column_stack((np.sin(2 * np.pi * bin_no * rate / n * t),
                            np.sin(2 * np.pi * bin_no * rate / n * t)))
    s = summarize(tone, rate)
    assert abs(s["strongestPeaks"][0]["frequencyHz"] - bin_no * rate / n) < rate / n
    assert abs(sum(s["bandPowerFractions"].values()) - 1.0) < 1e-12
    assert abs(cosine(s["power"], s["power"]) - 1.0) < 1e-12
    assert abs(s["rms"] - 1 / math.sqrt(2)) < 1e-6
    assert abs(s["power"].sum() - np.sum(tone * tone)) < 1e-8
    bins = s["power50HzBins"]
    assert len(bins) == 60 and abs(max(row["power"] for row in bins) / s["power"].sum() - 1) < 1e-12
    envelope_cos, envelope_windows = envelope_rms_cosine(tone, tone, rate, rate)
    assert envelope_windows == 3 and abs(envelope_cos - 1) < 1e-12
    field = np.column_stack((tone[:128, 0], tone[:128, 1], np.zeros(128)))
    field_rms = float(np.sqrt(np.mean(field * field)))
    field_power = np.sum(np.abs(np.fft.rfft(field, axis=0)) ** 2, axis=1) / (len(field) * field.shape[1])
    field_power[1:-1] *= 2
    if len(field) % 2 and len(field_power) > 1:
        field_power[-1] *= 2
    assert math.isclose(float(field_power.sum()), len(field) * field_rms ** 2,
                        rel_tol=1e-12, abs_tol=1e-15)
    tail = energy_times(np.array([1.0, .25, .0625, 0.0]), rate)
    assert tail["tailAfterPeak50Ms"] > 0
    assert tail["tailAfterPeak10Ms"] > tail["tailAfterPeak50Ms"]
    try:
        require_finite("self-check", np.array([np.nan]))
    except ValueError:
        pass
    else:
        raise AssertionError("non-finite values were accepted")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("index", nargs="?")
    parser.add_argument("output", nargs="?")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.index or not args.output:
        parser.error("index and output are required unless --self-check is used")
    run(args.index, args.output)


if __name__ == "__main__":
    main()
