#!/usr/bin/env python3
"""Fixed-gain, fixed-window measurements for the local-X audio reassessment."""
import argparse
import csv
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / ".cache/local-x-audio-reassessment/pcm"
OUTPUT = ROOT / "docs/ant/evidence/2026-11-01-local-x-audio-reassessment/audio-analysis"
SEEDS = ("20261005", "20261006", "20261007")
ARMS = ("control", "replacement")
WINDOWS = (50, 110, 170, 230, 290)
RATE, FFT, HOP, MAX_HZ, BANDS = 48_000, 1024, 256, 8_000, 30
OUTPUT_GAIN = 0.7
GAIN_STAGE = "post-bridge fixed GainNode after worklet soft limiter and interpolation; direct master gain 1"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_wav(path):
    raw = path.read_bytes()
    if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"{path}: expected RIFF/WAVE")
    offset, fmt, payload = 12, None, None
    while offset + 8 <= len(raw):
        name, size = raw[offset:offset + 4], struct.unpack_from("<I", raw, offset + 4)[0]
        start = offset + 8
        if start + size > len(raw):
            raise ValueError(f"{path}: chunk exceeds file length")
        if name == b"fmt ":
            fmt = struct.unpack_from("<HHIIHH", raw, start)
        elif name == b"data" and payload is None:
            payload = raw[start:start + size]
        offset = start + size + (size & 1)
    expected = (3, 2, RATE, RATE * 8, 8, 32)
    frames = 300 * RATE
    if fmt != expected or payload is None or len(payload) != frames * 8 or offset != len(raw):
        raise ValueError(f"{path}: expected exactly 300 s IEEE-float32 stereo at 48 kHz; fmt={fmt}")
    audio = np.frombuffer(payload, dtype="<f4").reshape((-1, 2)).astype(np.float64)
    if not np.isfinite(audio).all():
        raise ValueError(f"{path}: non-finite PCM")
    return audio, {"path": str(path.relative_to(ROOT)).replace("\\", "/"), "bytes": len(raw),
                   "sha256": sha256(path), "framesPerChannel": frames, "sampleRate": RATE,
                   "channels": 2, "format": "IEEE_FLOAT", "bitsPerSample": 32}


def erb_edges():
    rate = lambda f: 21.4 * np.log10(1 + 0.00437 * np.asarray(f, dtype=float))
    hz = lambda e: (10 ** (np.asarray(e, dtype=float) / 21.4) - 1) / 0.00437
    erb = np.linspace(0, float(rate(MAX_HZ)), BANDS + 1)
    return hz(erb), hz((erb[:-1] + erb[1:]) / 2)


def analyze_window(audio):
    if audio.shape != (10 * RATE, 2) or not np.isfinite(audio).all():
        raise ValueError("window must be exactly 10 seconds of finite stereo PCM")
    starts = np.arange(0, len(audio) - FFT + 1, HOP)
    frames = np.lib.stride_tricks.sliding_window_view(audio, FFT, axis=0)[::HOP]
    frames = np.moveaxis(frames, -1, 1)
    window = np.hanning(FFT)
    spectrum = np.fft.rfft(frames * window[None, :, None], axis=1)
    frequency = np.fft.rfftfreq(FFT, 1 / RATE)
    keep = frequency <= MAX_HZ
    power = np.abs(spectrum[:, keep]) ** 2 / window.sum() ** 2
    power[:, 1:, :] *= 2
    edges, centers = erb_edges()
    band_index = np.clip(np.searchsorted(edges, frequency[keep], side="right") - 1, 0, BANDS - 1)
    band_power = np.zeros((len(starts), BANDS, 2), dtype=np.float64)
    for b in range(BANDS):
        band_power[:, b, :] = power[:, band_index == b, :].sum(axis=1)
    left, right = audio[:, 0], audio[:, 1]
    corr = float(np.corrcoef(left, right)[0, 1]) if np.std(left) and np.std(right) else None
    mid, side = (left + right) / 2, (left - right) / 2
    rms_l, rms_r = float(np.sqrt(np.mean(left**2))), float(np.sqrt(np.mean(right**2)))
    total = band_power.mean(axis=2).mean(axis=0)
    shape = total / total.sum() if total.sum() > 0 else None
    return {"starts": starts, "power": band_power, "centers": centers,
            "metrics": {"rmsLeft": rms_l, "rmsRight": rms_r,
                "rmsDbfsLeft": 20 * math.log10(rms_l) if rms_l > 0 else None,
                "rmsDbfsRight": 20 * math.log10(rms_r) if rms_r > 0 else None,
                "isSilentLeft": rms_l == 0, "isSilentRight": rms_r == 0,
                "peakLeft": float(np.max(np.abs(left))), "peakRight": float(np.max(np.abs(right))),
                "lrCorrelation": corr, "midEnergy": float(np.mean(mid**2)),
                "sideEnergy": float(np.mean(side**2)), "frameCount": len(starts),
                "frameSupport": "1024 samples wholly contained in window; starts at window frame 0, hop 256; no padding/interpolation"},
            "meanBandPower": band_power.mean(axis=0), "shape": shape,
            "shapePowerTotal": float(total.sum())}


def run_self_check():
    # Analytic bin-centered tone validates FFT scaling, ERB placement and silent shape behavior.
    window = np.hanning(FFT)
    n = 10 * RATE
    t = np.arange(n) / RATE
    tone = np.column_stack((0.25 * np.sin(2 * np.pi * 750 * t), np.zeros(n)))
    a = analyze_window(tone)
    assert a["metrics"]["frameCount"] == 1872
    assert np.isclose(a["metrics"]["rmsLeft"], 0.25 / np.sqrt(2), rtol=1e-5)
    assert a["power"].shape == (1872, BANDS, 2)
    assert a["shape"] is not None and np.isclose(a["shape"].sum(), 1)
    z = analyze_window(np.zeros((n, 2)))
    assert z["shape"] is None and not np.any(z["power"])
    assert z["metrics"]["rmsDbfsLeft"] is None and z["metrics"]["rmsDbfsRight"] is None
    assert z["metrics"]["isSilentLeft"] and z["metrics"]["isSilentRight"]
    const = 0.25 * np.ones(FFT)
    const_fft = np.fft.rfft(const * window)
    const_power = np.abs(const_fft) ** 2 / window.sum() ** 2
    const_power[1:] *= 2
    assert np.isclose(const_power[0], 0.25**2, rtol=1e-12)
    assert np.isclose(const_power[1], 2 * abs(const_fft[1])**2 / window.sum()**2, rtol=1e-12)
    tone_frame_power = np.abs(np.fft.rfft(tone[:FFT, 0] * window))**2 / window.sum()**2
    tone_frame_power[1:] *= 2
    tone_frame_power = tone_frame_power[np.fft.rfftfreq(FFT, 1 / RATE) <= MAX_HZ]
    assert np.isclose(tone_frame_power.sum(), a["power"][0, :, 0].sum(), rtol=1e-12)
    tone_power = a["power"].mean(axis=0)
    half_tone = analyze_window(tone * 0.5)
    assert np.isclose(tone_power.sum(), half_tone["power"].mean(axis=0).sum() * 4, rtol=1e-10)
    assert np.all(np.isfinite(tone_power)) and 450 < a["centers"][int(np.argmax(tone_power.mean(axis=1)))] < 950
    # Check the Python display amplitude against the existing browser frontend on the same fixture.
    fixture = 0.25 * np.sin(2 * np.pi * 937.5 * np.arange(FFT) / RATE)
    py_db = 20 * math.log10(2 * abs(np.fft.rfft(fixture * window)[20]) / window.sum())
    renderer = (ROOT / "scripts/audio-snapshot-renderer.js").as_uri()
    js = ("import {buildAudioSnapshot} from " + json.dumps(renderer) + ";"
          "const s=Array.from({length:1024},(_,i)=>0.25*Math.sin(2*Math.PI*937.5*i/48000));"
          "const a=buildAudioSnapshot(s,{sampleRate:48000,fftSize:1024,hopSize:256,maxFrequencyHz:8000,waveformBins:1});"
          "console.log(JSON.stringify(a.spectrogram.dbfs[20]));")
    js_db = float(subprocess.check_output(["node", "--input-type=module", "-e", js], cwd=ROOT, text=True).strip())
    assert abs(py_db - js_db) < 0.05, (py_db, js_db)
    return {"passed": True, "frameCount": a["metrics"]["frameCount"], "toneHz": 750,
            "silenceShapeNull": z["shape"] is None, "dcAmplitudePower": float(const_power[0]),
            "rendererCrosscheckDbDifference": abs(py_db - js_db)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=INPUT)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    check = run_self_check()
    if args.self_check:
        print(json.dumps(check, indent=2)); return
    args.output.mkdir(parents=True, exist_ok=True)
    streams, records, erb_rows, paired, analysis_items = {}, [], [], [], []
    for seed in SEEDS:
        for arm in ARMS:
            path = args.input / f"seed-{seed}-{arm}.wav"
            audio, receipt = read_wav(path)
            windows = {}
            for start in WINDOWS:
                clip = audio[start * RATE:(start + 10) * RATE]
                result = analyze_window(clip)
                windows[start] = result
                record = {"seed": seed, "arm": arm, "startSeconds": start,
                          "endSeconds": start + 10, **result["metrics"]}
                records.append(record)
                analysis_items.append({"seed": seed, "arm": arm, "startSeconds": start,
                    "endSeconds": start + 10, "metrics": result["metrics"],
                    "meanBandPowerByChannel": result["meanBandPower"].T.tolist(),
                    "meanBandPowerStereoMean": result["meanBandPower"].mean(axis=1).tolist(),
                    "shapeUnitSumStereoMean": None if result["shape"] is None else result["shape"].tolist(),
                    "shapePowerTotal": result["shapePowerTotal"]})
                for band, center in enumerate(result["centers"]):
                    for ch, channel in enumerate(("left", "right")):
                        erb_rows.append({"seed": seed, "arm": arm, "startSeconds": start,
                            "band": band + 1, "centerHz": float(center), "channel": channel,
                            "meanLinearPower": float(result["meanBandPower"][band, ch])})
            streams[(seed, arm)] = {"receipt": receipt, "windows": windows}
        for start in WINDOWS:
            a = streams[(seed, "control")]["windows"][start]
            b = streams[(seed, "replacement")]["windows"][start]
            if a["shape"] is None or b["shape"] is None:
                cosine = tv = None
            else:
                cosine = float(np.dot(a["shape"], b["shape"]) / (np.linalg.norm(a["shape"]) * np.linalg.norm(b["shape"])))
                tv = float(0.5 * np.abs(a["shape"] - b["shape"]).sum())
            paired_row = {"seed": seed, "startSeconds": start,
                          "controlReplacementShapeCosine": cosine,
                          "controlReplacementShapeTotalVariation": tv}
            paired.append(paired_row)
    # Shared absolute scale is carried in the JSON manifest for the frontend plotter.
    powers = np.array([row["meanLinearPower"] for row in erb_rows])
    low, high = 0.0, float(powers.max()) if powers.max() > 0 else 1.0
    with (args.output / "windows.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(records[0])); writer.writeheader(); writer.writerows(records)
    with (args.output / "erb-power.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(erb_rows[0])); writer.writeheader(); writer.writerows(erb_rows)
    with (args.output / "paired-shape.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(paired[0])); writer.writeheader(); writer.writerows(paired)
    analysis = {"schemaVersion": 1,
        "frontend": {"sampleRate": RATE, "gain": "post-bridge PCM at fixed output gain 0.7; no RMS matching",
            "outputGain": OUTPUT_GAIN, "gainStage": GAIN_STAGE,
            "powerScaleRelativeToPreBridge": OUTPUT_GAIN**2, "fftSize": FFT,
            "window": "symmetric Hann", "hopSize": HOP, "maxHz": MAX_HZ,
            "erbRate": "21.4*log10(1+0.00437*f)", "erbBands": BANDS,
            "erbPower": "one-sided |rFFT|^2/sum(Hann)^2; double positive bins except DC; sum FFT bins by equal ERB-rate band",
            "frameSupport": "fully-contained frames, start at each window's first sample, hop 256, no padding/interpolation"},
        "streams": [streams[(seed, arm)]["receipt"] for seed in SEEDS for arm in ARMS],
        "windows": analysis_items, "pairedShape": paired,
        "fixedAbsoluteErbPowerRange": [low, high]}
    if len(analysis_items) != 30 or any(len(item["meanBandPowerStereoMean"]) != BANDS
            or len(item["meanBandPowerByChannel"]) != 2
            or any(len(channel) != BANDS for channel in item["meanBandPowerByChannel"])
            or (item["shapeUnitSumStereoMean"] is not None and len(item["shapeUnitSumStereoMean"]) != BANDS)
            or not np.isfinite(item["meanBandPowerByChannel"]).all()
            or (item["shapeUnitSumStereoMean"] is not None and not np.isfinite(item["shapeUnitSumStereoMean"]).all())
            for item in analysis_items):
        raise ValueError("analysis JSON failed the finite 30-window/30-band validation")
    (args.output / "analysis.json").write_text(json.dumps(analysis, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    manifest = {"status": "FIXED_WINDOW_AUDIO_ANALYSIS_COMPLETE", "selfCheck": check,
        "frontend": {"sampleRate": RATE, "gain": "post-bridge PCM at fixed output gain 0.7; no RMS matching",
            "outputGain": OUTPUT_GAIN, "gainStage": GAIN_STAGE,
            "powerScaleRelativeToPreBridge": OUTPUT_GAIN**2, "fftSize": FFT,
            "window": "symmetric Hann", "hopSize": HOP, "maxHz": MAX_HZ,
            "frameSupport": "whole frames only, start at each window's first sample, no padding/interpolation",
            "spectrogram": "20*log10(2*|rFFT|/sum(Hann)), clamped -100..0 dBFS, grayscale linear gamma 1",
            "erb": "30 equal ERB-rate bands; one-sided |rFFT|^2/sum(Hann)^2, positive bins doubled except DC; sum bins per band; preserve L/R",
            "shape": "unit-sum time-mean ERB power; null for silence; cosine and total variation are descriptive"},
        "windowsSeconds": [[s, s + 10] for s in WINDOWS],
        "inputs": [streams[(seed, arm)]["receipt"] for seed in SEEDS for arm in ARMS],
        "outputFiles": ["windows.csv", "erb-power.csv", "paired-shape.csv", "analysis.json"],
        "analysisValidation": {"windowCount": len(analysis_items), "all30BandArraysFinite": True,
            "leftRightArraysPerWindow": True, "silenceShape": "null"},
        "outputReceipts": [{"path": name, "bytes": (args.output / name).stat().st_size,
            "sha256": sha256(args.output / name)} for name in ["windows.csv", "erb-power.csv", "paired-shape.csv", "analysis.json"]],
        "fixedAbsoluteErbPowerRange": [low, high],
        "limitations": ["ERB is an FFT-bin grouping, not a gammatone/cochleogram.",
            "Linear absolute power can span a wide range and hide quiet channels; scale is shared across all 30 windows.",
            "Shape statistics normalize per window and are secondary diagnostics, not perceptual thresholds."]}
    (args.output / "analysis-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "inputs": len(manifest["inputs"]),
                      "windows": len(records), "output": str(args.output)}, indent=2))


if __name__ == "__main__":
    main()
