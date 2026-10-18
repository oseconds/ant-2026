#!/usr/bin/env python3
"""Compute descriptive event-window ERB overlap from a frozen stem binary."""
import argparse
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
HELPER_SOURCE_PATH = ROOT / "scripts/ant-base-born-natural-event-erb.py"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_stream(raw, entry, default_frames):
    if entry["dtype"] == "float64-le":
        dtype = "<f8"
    elif entry["dtype"] == "float32-le":
        dtype = "<f4"
    else:
        raise ValueError(f"unsupported stream dtype {entry['dtype']}")
    frames = entry.get("frames", default_frames)
    values = np.frombuffer(raw, dtype=dtype, count=frames, offset=entry["offset"])
    if values.size != frames or entry["byteLength"] != values.nbytes or not np.isfinite(values).all():
        raise ValueError("truncated or non-finite stem stream")
    return values.astype(np.float64, copy=False)


def limited_interpolated_window(source, full_mix, event_frame, frame_count, first_boundary_frame):
    delta = event_frame - first_boundary_frame
    if delta < 0:
        raise ValueError("event frame precedes the captured interpolation boundary")
    event_index, phase_offset = divmod(delta, 8)
    if event_index < 1:
        raise ValueError("event frame precedes the captured stem pre-roll")
    limited_source = source / (1.0 + np.abs(full_mix))
    phase = phase_offset + np.arange(frame_count, dtype=np.int64) + 2
    interval = (phase - 1) // 8
    amount = ((phase - interval * 8) / 8)[:, None]
    previous_index = event_index + interval - 1
    current_index = event_index + interval
    if current_index.max(initial=0) >= len(limited_source):
        raise ValueError("captured stem stream ends before an event window")
    output = limited_source[previous_index] + (limited_source[current_index] - limited_source[previous_index]) * amount
    return output.astype("<f4").astype(np.float64)


def erb_metrics(helper_module, frontend, a, b, duration_ms):
    a_bands = frontend.erb_aggregate(frontend.stft_power(a))[0].mean(axis=2)
    b_bands = frontend.erb_aggregate(frontend.stft_power(b))[0].mean(axis=2)
    return helper_module.shape_metrics(a_bands, b_bands, duration_ms)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    index = json.loads((evidence / "pickup-stems-index.json").read_text(encoding="utf-8"))
    inputs = json.loads((evidence / "overlap-input.json").read_text(encoding="utf-8"))
    compressed = (evidence / index["path"]).read_bytes()
    if hashlib.sha256(compressed).hexdigest() != index["sha256"]:
        raise ValueError("compressed stem binary SHA-256 mismatch")
    raw = gzip.decompress(compressed)
    if len(raw) != index["uncompressedBytes"]:
        raise ValueError("stem binary uncompressed size mismatch")
    helper = load_module(HELPER_SOURCE_PATH, "ant_dense_overlap_existing_erb")
    frontend = helper.load_helper()
    frontend.self_check()
    frames = index["frames"]
    streams = {key: read_stream(raw, value, frames) for key, value in index["streams"].items()}
    plate_ids = index["layerIds"]
    plate_streams = {plate_id: np.column_stack((streams[f"plate:{plate_id}:left"],
        streams[f"plate:{plate_id}:right"])) for plate_id in plate_ids}
    sphere = np.column_stack((streams["sphere:left"], streams["sphere:right"]))
    full = np.column_stack((streams["preLimiter:left"], streams["preLimiter:right"]))
    production = np.column_stack((streams["productionPCM:left"], streams["productionPCM:right"]))
    first_boundary = index["startFrame"] + 8
    event_results = {}
    exact_full_samples = 0
    compared_full_samples = 0
    for event_number, event in enumerate(inputs["events"], start=1):
        focal_id = event["message"]["layerId"]
        if focal_id not in plate_streams:
            raise ValueError(f"focal Plate {focal_id} is absent from stem binary")
        rest = np.zeros_like(full)
        for plate_id, signal in plate_streams.items():
            if plate_id != focal_id:
                rest += signal
        focal = plate_streams[focal_id]
        result = {}
        for duration_ms in inputs["windowsMs"]:
            frame_count = inputs["rate"] * duration_ms // 1000
            complete = event["frame"] + frame_count <= inputs["endFrame"]
            if not complete:
                result[str(duration_ms)] = {"complete": False}
                continue
            focal_pcm = limited_interpolated_window(focal, full, event["frame"], frame_count, first_boundary)
            rest_pcm = limited_interpolated_window(rest, full, event["frame"], frame_count, first_boundary)
            full_pcm = limited_interpolated_window(full, full, event["frame"], frame_count, first_boundary)
            production_start = event["frame"] - inputs["startFrame"]
            actual_full = production[production_start:production_start + frame_count]
            actual_as_f32 = full_pcm.astype("<f4")
            exact_full_samples += int(np.count_nonzero(actual_as_f32 == actual_full.astype("<f4")))
            compared_full_samples += actual_full.size
            if not np.array_equal(actual_as_f32, actual_full.astype("<f4")):
                raise ValueError(f"full-mix event interpolation differs from production PCM at route {event['sequence']} / {duration_ms} ms")
            result[str(duration_ms)] = {
                "complete": True,
                "focalVsRest": erb_metrics(helper, frontend, focal_pcm, rest_pcm, duration_ms),
                "focalVsFull": erb_metrics(helper, frontend, focal_pcm, full_pcm, duration_ms),
                "metricScale": "existing 30-band ERB time-frequency power, unit-sum shape; cosine and total variation; descriptive only, not loudness or a masking criterion",
            "sampleAlignment": "left-aligned at the exact routed 48 kHz frame; uses the unchanged current soft limiter and linear 6 kHz to 48 kHz interpolator, including fractional-step event offsets",
            }
        event_results[str(event["sequence"])] = result
        if event_number % 100 == 0:
            print(json.dumps({"stage": "ERB event progress", "events": event_number,
                "total": len(inputs["events"])}), flush=True)
    report = {
        "schemaVersion": 1,
        "frontend": {"source": "scripts/ant-base-born-loss-analysis.py via existing ant-base-born-natural-event-erb helper", "selfCheck": "passed",
            "fftSize": frontend.FFT_SIZE, "hopSize": frontend.HOP_SIZE, "sampleRate": frontend.RATE,
            "erbBands": frontend.ERB_BANDS, "window": "symmetric Hann", "stereoPooling": "mean left/right linear ERB power per time-band cell"},
        "sourceStemSha256": index["sha256"],
        "eventWindows": event_results,
        "fullPcmParity": {"comparedSamples": compared_full_samples, "exactSamples": exact_full_samples,
            "maxAbsoluteError": 0.0, "exact": True},
        "interpretation": "ERB shape overlap is descriptive similarity between readouts from the same coupled solve. It does not establish psychoacoustic masking.",
    }
    (evidence / "erb-overlap.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"events": len(event_results), "windows": sum(len(row) for row in event_results.values()),
        "fullPcmParity": report["fullPcmParity"], "frontendSelfCheck": True}))


if __name__ == "__main__":
    main()
