#!/usr/bin/env python3
"""Describe Base/Born shadow renders; comparisons are measurements, not rankings."""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np


HELPER_PATH = Path(__file__).with_name("ant-sonic-response-metrics.py")
SPEC = importlib.util.spec_from_file_location("sonic_response_metrics", HELPER_PATH)
SONIC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SONIC)


def rate(row, key, fallback=None):
    value = row.get(key, fallback)
    if not isinstance(value, int) or value <= 0:
        raise ValueError(f"{row.get('id')}: {key} must be a positive integer")
    return value


def read_stereo(root, relative, label, expected_frames=None):
    values = SONIC.read_f32(root / relative, label)
    if len(values) % 2:
        raise ValueError(f"{label}: float count must be even (stereo)")
    signal = values.reshape(-1, 2)
    if expected_frames is not None and len(signal) != expected_frames:
        raise ValueError(f"{label}: expected {expected_frames} frames, found {len(signal)}")
    if not len(signal):
        raise ValueError(f"{label}: empty signal")
    return signal


def reconstruct_queued_pcm(soft_physics, output_frames, physics_rate, output_rate=48000):
    if output_rate != 48000 or physics_rate <= 0 or output_rate % physics_rate:
        raise ValueError("queued PCM reconstruction requires a positive integer 48 kHz / physicsRate ratio")
    ratio = output_rate // physics_rate
    result = np.zeros((output_frames, 2), dtype=np.float64)
    first_output = ratio - 1
    if output_frames <= first_output or not len(soft_physics):
        return result
    source_x = np.arange(len(soft_physics), dtype=np.float64)
    source_x = np.concatenate(([-1.0], source_x))
    for channel in range(2):
        source_y = np.concatenate(([0.0], soft_physics[:, channel]))
        output_x = (np.arange(first_output, output_frames, dtype=np.float64) - (2 * ratio - 2)) / ratio
        result[first_output:, channel] = np.interp(output_x, source_x, source_y)
    return result


def field_summary(row, root, strike, audio_rate):
    path = (row.get("files") or {}).get("fields")
    if not path:
        return None
    nodes = row.get("nodeCount")
    if not isinstance(nodes, int) or nodes <= 0:
        raise ValueError(f"{row.get('id')}: nodeCount must be positive")
    values = SONIC.read_f32(root / path, f"{row.get('id')} fields")
    if len(values) % nodes:
        raise ValueError(f"{row.get('id')}: field float count must be divisible by nodeCount")
    matrix = values.reshape(-1, nodes)
    if row.get("fieldFrames") is not None and len(matrix) != int(row["fieldFrames"]):
        raise ValueError(f"{row.get('id')}: field frame count disagrees with render index")
    field_rate = rate(row, "fieldSampleRate", row.get("physicsRate"))
    # A metadata phase may identify a nonzero first solver-step offset.
    first_step = int((row.get("metadata") or {}).get("fieldFirstStep", 0))
    start = max(0, math.ceil(strike * field_rate / audio_rate) - first_step)
    if start >= len(matrix):
        raise ValueError(f"{row.get('id')}: no field frames at/after strike")
    field = matrix[start:]
    n = len(field)
    fft = np.fft.rfft(field, axis=0)
    power = np.sum(np.abs(fft) ** 2, axis=1) / (n * n * nodes)
    power[1:-1] *= 2
    if n % 2 and len(power) > 1:
        power[-1] *= 2
    freq = np.fft.rfftfreq(n, 1.0 / field_rate)
    total = float(power.sum())
    mean_node_power = float(np.mean(field * field))
    field_energy = np.sum(field * field, axis=1)
    if not math.isclose(total, mean_node_power, rel_tol=1e-10, abs_tol=1e-15):
        raise ValueError(f"{row.get('id')}: field PSD failed mean-node Parseval check")
    bands = {}
    for low, high in SONIC.BANDS:
        mask = (freq >= low) & (freq < high if high < field_rate / 2 else freq <= high)
        bands[f"{low}-{high}Hz"] = float(power[mask].sum() / total) if total else None
    envelope_values = SONIC.field_envelope_rms(np.sum(field * field, axis=1), nodes, field_rate).tolist()
    result = {
        "frames": n, "startFrame": start, "fieldSampleRate": field_rate,
        "fieldRms": math.sqrt(mean_node_power),
        "summedNodePower": float(np.mean(np.sum(field * field, axis=1))),
        "meanNodePower": mean_node_power,
        "dcPowerFraction": float(power[0] / total) if total else None,
        "spectralCentroidHz": float(np.dot(freq, power) / total) if total else None,
        "bandPowerFractions": bands,
        "fixedBinAnalysis": "50 Hz intervals from 0 to 3000 Hz; descriptive only",
        "power50HzBins": SONIC.fixed_bin_rows(freq, power),
        "power50HzOutside0To3000Fraction": max(0.0, 1.0 - (sum(x["power"] for x in SONIC.fixed_bin_rows(freq, power)) / total)) if total else None,
        "envelope25msRms": envelope_values,
        "envelope25msWindows": len(envelope_values),
        "remainingEnergyFractionAfterMs": {
            str(ms): (float(np.sum(field_energy[math.ceil(ms * field_rate / 1000):]) /
                                  np.sum(field_energy)) if np.sum(field_energy) else None)
            for ms in (100, 250, 500)},
        "energyTimes": SONIC.energy_times(field_energy, field_rate),
        "parsevalMeaning": "mean squared displacement across captured nodes, not physical joules",
    }
    return {"metrics": result, "power": power, "frequencyHz": freq,
            "envelope": np.asarray(envelope_values), "values": field, "nodeCount": nodes,
            "fieldSampleRate": field_rate, "firstStep": first_step}


def signal_case(row, root):
    ident = row.get("id")
    if not ident:
        raise ValueError("every render row requires id")
    frames = row.get("frames")
    if not isinstance(frames, int) or frames <= 0:
        raise ValueError(f"{ident}: frames must be positive")
    audio_rate = rate(row, "sampleRate")
    strike = row.get("strikeFrame")
    if not isinstance(strike, int) or strike < 0 or strike >= frames:
        raise ValueError(f"{ident}: strikeFrame must be within PCM")
    files = row.get("files") or {}
    if not files.get("pcm"):
        raise ValueError(f"{ident}: files.pcm is required")
    pcm = read_stereo(root, files["pcm"], f"{ident} PCM", frames)
    post = pcm[strike:]
    post_summary = SONIC.summarize(post, audio_rate)
    metrics = {k: v for k, v in post_summary.items() if k not in ("frequencyHz", "power")}
    env_window = round(audio_rate * .025)
    env_count = len(post) // env_window
    metrics["envelope25msRms"] = np.sqrt(np.mean(post[:env_count * env_window].reshape(env_count, env_window, 2) ** 2,
                                                   axis=(1, 2))).tolist() if env_count else []
    case = {"row": row, "strikeFrame": strike, "sampleRate": audio_rate,
            "signal": post, "summary": post_summary, "metrics": metrics}
    field = field_summary(row, root, strike, audio_rate)
    if field:
        case["field"] = field
        metrics["field"] = field["metrics"]
    pickup_path = files.get("rawPickup")
    if pickup_path:
        pickup = read_stereo(root, pickup_path, f"{ident} rawPickup")
        pickup_rate = rate(row, "fieldSampleRate", row.get("physicsRate"))
        start = max(0, math.ceil(strike * pickup_rate / audio_rate) - int((row.get("metadata") or {}).get("rawPickupFirstStep", 0)))
        if start >= len(pickup):
            raise ValueError(f"{ident}: no rawPickup frames at/after strike")
        sm = SONIC.summarize(pickup[start:], pickup_rate)
        for key in ("frequencyHz", "power", "power50HzBins", "fixedBin50HzAnalysis"):
            sm.pop(key, None)
        metrics["rawPickup"] = sm
    pre_path = files.get("preLimiter")
    if pre_path:
        pre_rate = rate(row, "physicsRate", audio_rate)
        expected_pre_frames = math.ceil(frames * pre_rate / audio_rate)
        pre_full = read_stereo(root, pre_path, f"{ident} preLimiter", expected_pre_frames)
        pre_start = math.ceil(strike * pre_rate / audio_rate)
        pre = pre_full[pre_start:]
        pre_summary = SONIC.summarize(pre, pre_rate)
        soft_full = pre_full / (1.0 + np.abs(pre_full))
        soft = soft_full[pre_start:]
        soft_summary = SONIC.summarize(soft, pre_rate)
        soft_at_output_rate_full = reconstruct_queued_pcm(soft_full, frames, pre_rate, audio_rate)
        soft_at_output_rate = soft_at_output_rate_full[strike:]
        soft_output_summary = SONIC.summarize(soft_at_output_rate, audio_rate)
        metrics["preLimiter"] = {k: v for k, v in pre_summary.items() if k not in ("frequencyHz", "power")}
        metrics["softLimitedPhysicsRate"] = {k: v for k, v in soft_summary.items() if k not in ("frequencyHz", "power")}
        metrics["limiterContribution"] = {
            "comparison": "measured full preLimiter physics output -> soft limiter y=x/(1+abs(x)) -> exact forward process queue interpolation; no inverse transforms",
            "preSampleRate": pre_rate, "preStartFrame": pre_start,
            "savedPcmSampleRate": audio_rate,
            "forwardQueueRatio": audio_rate // pre_rate,
            "forwardQueueAlignment": "first r-1 output frames zero; output j interpolates full soft physics at (j-(2*r-2))/r using prepended (-1,0); crop at strikeFrame after reconstruction",
            "preToSoftLimiter": SONIC.paired_metrics({"signal": pre, "summary": pre_summary, "sampleRate": pre_rate},
                                                       {"signal": soft, "summary": soft_summary, "sampleRate": pre_rate}),
            "softLimitedAtOutputRate": {k: v for k, v in soft_output_summary.items() if k not in ("frequencyHz", "power")},
            "softInterpolationToSavedPCM": SONIC.paired_metrics(
                {"signal": soft_at_output_rate, "summary": soft_output_summary, "sampleRate": audio_rate},
                {"signal": post, "summary": post_summary, "sampleRate": audio_rate}),
            "peakAbsChangePreToSoft": float(np.max(np.abs(soft)) - np.max(np.abs(pre))),
            "peakAbsChangeSoftToSavedPcm": float(np.max(np.abs(post)) - np.max(np.abs(soft_at_output_rate))),
            "clippedOrLimitedFramesAtOrAbove1": int(np.count_nonzero(np.max(np.abs(pre), axis=1) >= 1)),
        }
        if row.get("condition") == "baseline":
            raw_readout8_full = pre_full * 8.0
            soft_readout8_full = raw_readout8_full / (1.0 + np.abs(raw_readout8_full))
            raw_readout8 = raw_readout8_full[pre_start:]
            soft_readout8 = soft_readout8_full[pre_start:]
            readout8_full_pcm = reconstruct_queued_pcm(soft_readout8_full, frames, pre_rate, audio_rate)
            readout8_pcm = readout8_full_pcm[strike:]
            raw8_summary = SONIC.summarize(raw_readout8, pre_rate)
            soft8_summary = SONIC.summarize(soft_readout8, pre_rate)
            pcm8_summary = SONIC.summarize(readout8_pcm, audio_rate)
            metrics["baselineReadoutGain8Control"] = {
                "label": "offline scalar pre-limiter readout-gain control; not a solver render",
                "readoutGain": 8,
                "sourcePreLimiterFile": pre_path,
                "inputAndFieldScope": "only a copy of the measured Born raw pickup is scaled; solver input, field, geometry, and physics are unchanged",
                "forwardTransform": "gain raw pickup by 8, apply y=x/(1+abs(x)) at physics rate, reconstruct the delayed forward queue with the declared integer ratio, then crop at strikeFrame",
                "physicsRate": pre_rate,
                "forwardQueueRatio": audio_rate // pre_rate,
                "linearReadoutGain8PhysicsRate": {k: v for k, v in raw8_summary.items() if k not in ("frequencyHz", "power")},
                "softLimitedReadoutGain8PhysicsRate": {k: v for k, v in soft8_summary.items() if k not in ("frequencyHz", "power")},
                "limiterCompressionRelativeTo8xRaw": SONIC.paired_metrics(
                    {"signal": raw_readout8, "summary": raw8_summary, "sampleRate": pre_rate},
                    {"signal": soft_readout8, "summary": soft8_summary, "sampleRate": pre_rate}),
                "softLimitedReadoutGain8OutputRate": {k: v for k, v in pcm8_summary.items() if k not in ("frequencyHz", "power")},
                "savedBaselineToSoftLimitedReadoutGain8": SONIC.paired_metrics(
                    case, {"signal": readout8_pcm, "summary": pcm8_summary, "sampleRate": audio_rate}),
            }
    return case


def common_field_spectra(a, b):
    """Compare rate-independent 50 Hz bins in 0..3 kHz with outside power retained."""
    ba, bb = a["metrics"]["power50HzBins"], b["metrics"]["power50HzBins"]
    pa = np.array([x["power"] for x in ba], dtype=float)
    pb = np.array([x["power"] for x in bb], dtype=float)
    na, nb = float(np.linalg.norm(pa)), float(np.linalg.norm(pb))
    return {"analysisRangeHz": [0, 3000], "binWidthHz": 50,
            "powerCosineWithinRange": float(np.dot(pa, pb) / (na * nb)) if na and nb else None,
            "fractionOfTotalPowerOutsideRangeA": a["metrics"]["power50HzOutside0To3000Fraction"],
            "fractionOfTotalPowerOutsideRangeB": b["metrics"]["power50HzOutside0To3000Fraction"],
            "note": "outside-range power is reported separately; it is not silently discarded"}


def field_pair(a, b):
    fa, fb = a.get("field"), b.get("field")
    if not fa or not fb:
        return None
    ma, mb = fa["metrics"], fb["metrics"]
    result = {"coarseSpectra": common_field_spectra(fa, fb),
              "centroidShiftHz": (mb["spectralCentroidHz"] - ma["spectralCentroidHz"])
              if ma["spectralCentroidHz"] is not None and mb["spectralCentroidHz"] is not None else None}
    result["envelope25msRmsCosine"] = SONIC.cosine(fa["envelope"], fb["envelope"])
    result["envelope25msWindows"] = min(len(fa["envelope"]), len(fb["envelope"]))
    result["envelopeComparison"] = "25 ms field RMS windows; different sample rates use equal-duration bins and truncate to common window count"
    aligned = (fa["fieldSampleRate"] == fb["fieldSampleRate"] and fa["nodeCount"] == fb["nodeCount"]
               and fa["firstStep"] == fb["firstStep"] and fa["values"].shape == fb["values"].shape
               and (a["row"].get("geometryKey") is not None and a["row"].get("geometryKey") == b["row"].get("geometryKey")))
    if aligned:
        x, y = fa["values"], fb["values"]
        denom = float(np.linalg.norm(x))
        result["sameGeometryField"] = {"relativeL2": float(np.linalg.norm(y - x) / denom) if denom else None,
                                       "phaseL2Eligible": True}
    else:
        result["sameGeometryField"] = {"relativeL2": None, "phaseL2Eligible": False,
                                       "reason": "requires equal field rate, node ordering/count, frames, phase, and declared geometryKey"}
    return result


def add_fine_spectrum_pair(item, a, b):
    if a["sampleRate"] == b["sampleRate"] and len(a["signal"]) == len(b["signal"]):
        pa, pb = a["summary"]["power"], b["summary"]["power"]
        denom = float(np.linalg.norm(pa) * np.linalg.norm(pb))
        item["fineSpectrumCosineSameFrames"] = float(np.dot(pa, pb) / denom) if denom else None
    else:
        item["fineSpectrumCosineSameFrames"] = None


def run(index_path, output_path):
    index_path = Path(index_path).resolve()
    doc = json.loads(index_path.read_text(encoding="utf-8"))
    rows = doc if isinstance(doc, list) else doc.get("rows") if isinstance(doc, dict) else None
    if not isinstance(rows, list):
        raise ValueError("render index must be an array or an object with a rows array")
    ids = [r.get("id") for r in rows]
    if len(set(ids)) != len(ids):
        raise ValueError("render index ids must be unique")
    root = index_path.parent
    cases = [signal_case(r, root) for r in rows]
    by_id = {c["row"]["id"]: c for c in cases}
    comparisons = []
    for case in cases:
        row = case["row"]
        baseline_id = row.get("pairBaselineId")
        if baseline_id:
            if baseline_id not in by_id:
                raise ValueError(f"{row['id']}: unknown pairBaselineId {baseline_id}")
            baseline = by_id[baseline_id]
            item = {"kind": "declared-baseline", "a": baseline_id, "b": row["id"],
                    "output": SONIC.paired_metrics(baseline, case)}
            add_fine_spectrum_pair(item, baseline, case)
            fp = field_pair(baseline, case)
            if fp:
                item["field"] = fp
            comparisons.append(item)
    # Optional Base circular reference: only compare declared matching source geometry.
    for case in cases:
        row = case["row"]
        if row.get("isBaseReference") or row.get("referenceType") == "base-circular" or row.get("condition") in ("base", "base-circular", "base-reference"):
            continue
        for base in cases:
            br = base["row"]
            is_base = (br.get("isBaseReference") or br.get("referenceType") == "base-circular"
                       or br.get("condition") in ("base", "base-circular", "base-reference"))
            if not is_base or br.get("plateKey") != row.get("plateKey"):
                continue
            source_key = row.get("sourcePairedGeometryKey")
            if source_key is None or source_key != br.get("sourcePairedGeometryKey"):
                continue
            item = {"kind": "base-reference", "a": br["id"], "b": row["id"],
                    "sourcePairedGeometryKey": source_key,
                    "output": SONIC.paired_metrics(base, case)}
            add_fine_spectrum_pair(item, base, case)
            fp = field_pair(base, case)
            if fp:
                item["field"] = fp
            comparisons.append(item)
    output = {"method": {"version": 1,
                         "alignment": "PCM from strikeFrame; fields and rawPickup from ceil(strikeFrame*fieldSampleRate/sampleRate), adjusted only by declared first-step phase metadata",
                         "fieldSpectrum": "one-sided power summed across nodes and divided by nodeCount; Parseval equals mean squared displacement across captured nodes, not physical joules",
                         "crossRate": "field spectra compared in aligned 50 Hz bins over 0..3000 Hz; power outside the interval is reported separately",
                         "limiter": "when files.preLimiter is present, measure y=x/(1+abs(x)) at physics rate, reconstruct the forward delayed queue at 48 kHz integer ratios, then crop at strikeFrame and compare; no inverse transforms",
                         "interpretation": "descriptive response measurements; no arbitrary similarity score or listener claim"},
              "cases": [{"id": c["row"]["id"], "plateKey": c["row"].get("plateKey"),
                         "condition": c["row"].get("condition"), "positionLabel": c["row"].get("positionLabel"),
                         "strikeFrame": c["strikeFrame"], "metrics": c["metrics"]} for c in cases],
              "comparisons": comparisons}
    Path(output_path).write_text(json.dumps(output, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def self_check():
    # Helper spectra/summary invariants and strike mapping at both capture rates.
    n, sr, tone_bin = 4800, 48000, 100
    t = np.arange(n) / sr
    tone = np.column_stack((np.sin(2 * np.pi * tone_bin * sr / n * t),) * 2)
    summary = SONIC.summarize(tone, sr)
    assert abs(summary["power"].sum() - np.sum(tone * tone)) < 1e-8
    assert abs(SONIC.cosine(summary["power"], summary["power"]) - 1) < 1e-12
    assert math.ceil(480 * 6000 / 48000) == 60 and math.ceil(480 * 48000 / 48000) == 480
    for field_rate in (6000, 48000):
        field_n = field_rate // 10
        fields = np.column_stack((np.sin(2 * np.pi * 100 * np.arange(field_n) / field_rate),
                                  np.zeros(field_n)))
        p = np.sum(np.abs(np.fft.rfft(fields, axis=0)) ** 2, axis=1) / (field_n ** 2 * fields.shape[1])
        p[1:-1] *= 2
        assert math.isclose(float(p.sum()), float(np.mean(fields * fields)), rel_tol=1e-12)
        hz = np.fft.rfftfreq(field_n, 1 / field_rate)
        assert abs(float(hz[np.argmax(p)]) - 100) < field_rate / field_n
    gain = 3.0
    gained = SONIC.summarize(tone * gain, sr)
    assert abs(SONIC.cosine(summary["power"], gained["power"]) - 1) < 1e-12
    pre = np.array([[0.0, 0.0], [0.5, -0.5], [2.0, -2.0]])
    post = pre / (1 + np.abs(pre))
    pre_s, post_s = SONIC.summarize(pre, 48000), SONIC.summarize(post, 48000)
    limiter = SONIC.paired_metrics({"signal": pre, "summary": pre_s, "sampleRate": 48000},
                                  {"signal": post, "summary": post_s, "sampleRate": 48000})
    assert limiter["relativeL2"] > 0 and limiter["exactPCMMatch"] is False
    assert limiter["powerSpectrumCosine"] is not None
    assert np.all(np.abs(post) < 1)
    source = np.column_stack((np.arange(5, dtype=float) / 10, -np.arange(5, dtype=float) / 10))
    observed = reconstruct_queued_pcm(source, 40, 6000)
    assert np.all(observed[:7] == 0)
    assert np.allclose(observed[7], source[0] / 8, atol=1e-12)
    assert np.allclose(observed[8], source[0] / 4, atol=1e-12)
    assert np.allclose(observed[14], source[0], atol=1e-12)
    assert np.allclose(reconstruct_queued_pcm(source, 5, 48000), source[:5], atol=1e-12)
    source_before = source.copy()
    soft_gain8 = (8 * source) / (1 + np.abs(8 * source))
    observed_gain8 = reconstruct_queued_pcm(soft_gain8, 40, 6000)
    observed_gain1 = reconstruct_queued_pcm(source / (1 + np.abs(source)), 40, 6000)
    assert np.array_equal(source, source_before)
    assert np.allclose(soft_gain8, (8 * source) / (1 + np.abs(8 * source)), atol=0)
    assert not np.array_equal(observed_gain8, observed_gain1)
    assert abs(summary["spectralCentroidHz"] - gained["spectralCentroidHz"]) < 1e-9


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
