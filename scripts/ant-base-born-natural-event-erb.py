#!/usr/bin/env python3
"""Reanalyze frozen Base/Born event stems; this script never simulates or renders."""
import csv
import gzip
import hashlib
import importlib.util
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs/ant/evidence/2026-10-07-base-substrate-debug/audio"
SOURCE_REPORT = SOURCE_DIR / "event-count-matched-substrate/event-count-matched-report.json"
SOURCE_GZIP = SOURCE_DIR / "fresh-seed-20261005-through-first-birth-plus-10s.json.gz"
BASE_WAV = SOURCE_DIR / "event-count-matched-substrate/substrate-matched-parent-groups-raw-worklet-10s-48khz-f32.wav"
BORN_WAV = SOURCE_DIR / "event-count-matched-substrate/born-p1-63-raw-worklet-10s-48khz-f32.wav"
HELPER_PATH = ROOT / "scripts/ant-base-born-loss-analysis.py"
EVIDENCE = ROOT / "docs/ant/evidence/2026-10-14-base-born-natural-event-erb"
RATE = 48_000
FRAMES = RATE * 10
WINDOWS_MS = (100, 250, 500)
PRODUCTION_MAIN = "d45823d40c9a87c1b333fa9872f3c897ee9ab01b"
RESEARCH_BRANCH = "codex/ant-base-born-causal-decomposition-20261014"
RESEARCH_HEAD_AT_PASS_START = "83bcfba64f4b1760d8072488a20c8cc3d1ea9c90"
ERB_ABS_DB_SCALE = (-180.0, 0.0)
ENVELOPE_DBFS_SCALE = (-80.0, 0.0)
DIFF_DB_SCALE = (-120.0, 120.0)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_receipt(path):
    data = path.read_bytes()
    return {"path": str(path.relative_to(ROOT)).replace("\\", "/"), "bytes": len(data), "sha256": sha256(data)}


def load_helper():
    spec = importlib.util.spec_from_file_location("ant_base_born_loss_analysis", HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_float_wav(path):
    raw = path.read_bytes()
    if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise ValueError(f"{path}: not a RIFF/WAVE file")
    offset, fmt, data = 12, None, None
    while offset + 8 <= len(raw):
        name, size = struct.unpack_from("<4sI", raw, offset)
        start = offset + 8
        chunk = raw[start:start + size]
        if len(chunk) != size:
            raise ValueError(f"{path}: truncated RIFF chunk")
        if name == b"fmt ":
            fmt = chunk
        elif name == b"data":
            data = chunk
        offset = start + size + (size & 1)
    if fmt is None or data is None or len(fmt) < 16:
        raise ValueError(f"{path}: missing fmt or data chunk")
    audio_format, channels, rate, byte_rate, block_align, bits = struct.unpack_from("<HHIIHH", fmt)
    expected = (3, 2, RATE, RATE * 8, 8, 32)
    if (audio_format, channels, rate, byte_rate, block_align, bits) != expected:
        raise ValueError(f"{path}: expected IEEE float stereo 48 kHz, found {(audio_format, channels, rate, byte_rate, block_align, bits)}")
    if len(data) != FRAMES * channels * 4 or len(raw) != 44 + len(data):
        raise ValueError(f"{path}: unexpected payload/file size {len(data)}/{len(raw)}")
    audio = np.frombuffer(data, dtype="<f4").reshape(FRAMES, channels).astype(np.float64)
    if not np.isfinite(audio).all():
        raise ValueError(f"{path}: non-finite audio sample")
    return audio, {"audioFormat": "IEEE_FLOAT", "channels": channels, "sampleRate": rate,
                   "framesPerChannel": FRAMES, "bitsPerSample": bits, "dataBytes": len(data)}


def load_sources():
    report_bytes = SOURCE_REPORT.read_bytes()
    report = json.loads(report_bytes)
    gzip_bytes = SOURCE_GZIP.read_bytes()
    expected_gzip = report["immutableReferences"].get("frozenInputGzipSha256") or report["source"]["inputGzipSha256"]
    if sha256(gzip_bytes) != expected_gzip:
        raise ValueError("frozen seed gzip SHA-256 differs from original event report")
    frozen = json.loads(gzip.decompress(gzip_bytes))
    base, base_header = read_float_wav(BASE_WAV)
    born, born_header = read_float_wav(BORN_WAV)
    for path, wav, header, key in ((BASE_WAV, base, base_header, BASE_WAV.name),
                                   (BORN_WAV, born, born_header, BORN_WAV.name)):
        expected = report["outputs"][key]
        receipt = file_receipt(path)
        if receipt["sha256"] != expected["sha256"] or header["sampleRate"] != expected["sampleRate"] or header["framesPerChannel"] != expected["samplesPerChannel"]:
            raise ValueError(f"{path}: source does not match original frozen output manifest")
        if receipt["bytes"] != 44 + expected["samplesPerChannel"] * 2 * 4:
            raise ValueError(f"{path}: byte size does not match float32 stereo header and frame count")
    return report, frozen, base, born, base_header, born_header, report_bytes, gzip_bytes


def js_round(value):
    return math.floor(value + 0.5)


def validate_mapping(report, frozen):
    source = report["source"]
    rows = report["eventMapping"]["matchedContactGroupRows"]
    accepted = report["eventMapping"]["acceptedP1ToParentGroup"]
    receipts = report["capture"]["workletReports"][0]["receipts"]
    if len(rows) != 44 or len(accepted) != 63 or len(receipts) != 44:
        raise ValueError("expected 44 substrate groups, 63 mapped P1 strikes, and 44 dispatch receipts")
    if {row["bornRecordingIndex"] for row in accepted} != set(range(63)):
        raise ValueError("accepted mapping must cover each frozen Born strike exactly once")
    if len({row["contactIndex"] for row in rows}) != 44:
        raise ValueError("Base parent-group roster contains duplicate contact groups")
    if len(frozen["bornStrikes"]) != 63 or len(frozen["contacts"]) <= max(row["contactIndex"] for row in rows):
        raise ValueError("frozen source roster differs from the saved mapping")
    birth_ms = source["firstPlateBirthSeconds"] * 1000
    by_group = Counter()
    for row in accepted:
        born_index, contact_index = row["bornRecordingIndex"], row["contactIndex"]
        born = frozen["bornStrikes"][born_index]
        contact = frozen["contacts"][contact_index]
        if born["simulationTimeMs"] != row["simulationTimeMs"] or contact["simulationTimeMs"] != row["simulationTimeMs"]:
            raise ValueError(f"born strike {born_index}: timestamp mapping mismatch")
        payload = born["payload"]
        if payload.get("plateId") != "trail-plate-1" or payload.get("layerId") != "trail-plate-1":
            raise ValueError(f"born strike {born_index}: not the frozen P1 response")
        if contact["payload"].get("type") != "FOOT_CONTACT":
            raise ValueError(f"contact {contact_index}: not FOOT_CONTACT")
        born_pos = payload["position"]
        candidates = [response for response in contact["responses"]
                     if response["legId"] == row["contactLegId"] and response["position"] == born_pos]
        if len(candidates) != 1 or contact["payload"]["contacts"][[leg["legId"] for leg in contact["payload"]["contacts"]].index(row["contactLegId"])]["position"] != born_pos:
            raise ValueError(f"born strike {born_index}: exact leg/position response match failed")
        if js_round((row["simulationTimeMs"] - birth_ms) * 48) != row["requestedFrame"]:
            raise ValueError(f"born strike {born_index}: saved sample anchor mismatch")
        by_group[contact_index] += 1
    unique_indices = set(by_group)
    if unique_indices != {row["contactIndex"] for row in rows}:
        raise ValueError("deduplicated Born parent groups differ from saved Base group roster")
    if sorted(by_group.values()) != [1] * 27 + [2] * 15 + [3] * 2:
        raise ValueError("frozen 63-to-44 parent-group multiplicity differs from source report")
    receipts_by_requested = {}
    for receipt in receipts:
        receipts_by_requested.setdefault(receipt["requestedFrame"], []).append(receipt["actualFrame"])
    group_rows = []
    for row in rows:
        contact = frozen["contacts"][row["contactIndex"]]
        requested = js_round((row["simulationTimeMs"] - birth_ms) * 48)
        if contact["simulationTimeMs"] != row["simulationTimeMs"] or contact["payload"] != row["payload"]:
            raise ValueError(f"parent group {row['contactIndex']}: source payload differs")
        expected_actual = math.ceil(requested / 128) * 128
        if expected_actual not in receipts_by_requested.get(requested, []):
            raise ValueError(f"parent group {row['contactIndex']}: saved generic dispatch receipt differs")
        group_rows.append({**row, "requestedFrame": requested, "actualFrame": expected_actual,
                           "acceptedBornStrikeCount": by_group[row["contactIndex"]]})
    group_rows.sort(key=lambda row: (row["requestedFrame"], row["contactIndex"]))
    return group_rows, accepted


def cosine(a, b):
    a, b = np.asarray(a, dtype=np.float64).ravel(), np.asarray(b, dtype=np.float64).ravel()
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom > 0 else None


def shape_metrics(base_bands, born_bands, duration_ms):
    base_total, born_total = float(base_bands.sum()), float(born_bands.sum())
    if base_total <= 0 or born_total <= 0:
        return {"fullTimeFrequencyCosine": None, "integratedErbProfileCosine": None,
                "lateHalfErbProfileCosine": None, "shapeTotalVariation": None}
    base_shape, born_shape = base_bands / base_total, born_bands / born_total
    frame_starts = np.arange(base_bands.shape[0]) * 256
    late = frame_starts >= (RATE * duration_ms / 2000)
    base_late, born_late = base_bands[late].sum(axis=0), born_bands[late].sum(axis=0)
    base_integrated, born_integrated = base_bands.sum(axis=0), born_bands.sum(axis=0)
    return {"fullTimeFrequencyCosine": cosine(base_shape, born_shape),
            "integratedErbProfileCosine": cosine(base_integrated, born_integrated),
            "lateHalfErbProfileCosine": cosine(base_late, born_late),
            "shapeTotalVariation": 0.5 * float(np.abs(base_shape - born_shape).sum())}


def pcm_metrics(audio):
    channels = [audio[:, channel] for channel in range(2)]
    return {"rms": float(np.sqrt(np.mean(audio * audio))),
            "rmsLeft": float(np.sqrt(np.mean(channels[0] ** 2))),
            "rmsRight": float(np.sqrt(np.mean(channels[1] ** 2))),
            "peak": float(np.max(np.abs(audio))),
            "peakLeft": float(np.max(np.abs(channels[0]))),
            "peakRight": float(np.max(np.abs(channels[1])))}


def db_ratio(a, b):
    if a == 0 and b == 0:
        return 0.0
    return 20 * math.log10(a / b) if a > 0 and b > 0 else None


def event_overlap(group_rows, accepted, row, window_frames):
    start, end = row["requestedFrame"], row["requestedFrame"] + window_frames
    other_groups = sum(1 for other in group_rows if other["contactIndex"] != row["contactIndex"] and start <= other["requestedFrame"] < end)
    other_strikes = sum(1 for other in accepted if other["contactIndex"] != row["contactIndex"] and
                        start <= other["requestedFrame"] < end)
    return other_groups, other_strikes


def analyze_pair(group, accepted, base, born, helper):
    event = {"contactIndex": group["contactIndex"], "simulationTimeMs": group["simulationTimeMs"],
             "requestedFrame": group["requestedFrame"], "actualBaseDispatchFrame": group["actualFrame"],
             "baseDispatchOffsetFrames": group["actualFrame"] - group["requestedFrame"],
             "acceptedBornStrikeCount": group["acceptedBornStrikeCount"], "windows": {}}
    metrics_by_window = {}
    for duration_ms in WINDOWS_MS:
        frames = RATE * duration_ms // 1000
        complete = group["requestedFrame"] + frames <= len(base)
        other_groups, other_strikes = event_overlap(ALL_GROUPS, accepted, group, frames)
        item = {"durationMs": duration_ms, "startFrame": group["requestedFrame"],
                "endFrameExclusive": group["requestedFrame"] + frames, "complete": complete,
                "otherParentGroupsStartingInWindow": other_groups,
                "otherBornStrikesStartingInWindow": other_strikes}
        if not complete:
            event["windows"][str(duration_ms)] = item
            continue
        base_slice = base[group["requestedFrame"]:group["requestedFrame"] + frames]
        born_slice = born[group["requestedFrame"]:group["requestedFrame"] + frames]
        base_native, born_native = pcm_metrics(base_slice), pcm_metrics(born_slice)
        base_bands, _, _, _ = helper.erb_aggregate(helper.stft_power(base_slice))
        born_bands, _, _, _ = helper.erb_aggregate(helper.stft_power(born_slice))
        # Stereo is pooled by averaging L/R linear power, matching the recent Plate ERB passes.
        base_pool, born_pool = base_bands.mean(axis=2), born_bands.mean(axis=2)
        early_frames = min(RATE // 40, frames)
        late_start = max(0, frames - RATE // 40)
        base_early, born_early = pcm_metrics(base_slice[:early_frames]), pcm_metrics(born_slice[:early_frames])
        base_late, born_late = pcm_metrics(base_slice[late_start:]), pcm_metrics(born_slice[late_start:])
        delta_db = helper.power_db(born_pool) - helper.power_db(base_pool)
        frame_starts = np.arange(len(base_pool)) * 256
        early_mask = frame_starts < RATE // 40
        late_mask = frame_starts >= max(0, frames - RATE // 40)
        half_mask = frame_starts >= (frames / 2)
        item.update({"fixedGain": {"base": base_native, "born": born_native,
                                   "bornMinusBaseRmsDb": db_ratio(born_native["rms"], base_native["rms"]),
                                   "bornMinusBasePeakDb": db_ratio(born_native["peak"], base_native["peak"]),
                                   "leftRmsDeltaDb": db_ratio(born_native["rmsLeft"], base_native["rmsLeft"]),
                                   "rightRmsDeltaDb": db_ratio(born_native["rmsRight"], base_native["rmsRight"]),
                                   "earlyFirst25msRms": {"base": base_early["rms"], "born": born_early["rms"],
                                                         "bornMinusBaseDb": db_ratio(born_early["rms"], base_early["rms"])},
                                   "lateLast25msRms": {"base": base_late["rms"], "born": born_late["rms"],
                                                       "bornMinusBaseDb": db_ratio(born_late["rms"], base_late["rms"])}},
                      "shapeOnly": shape_metrics(base_pool, born_pool, duration_ms),
                      "nativeErbDifference": {"definition": "Born minus Base, 10*log10(power); native fixed-gain, no per-window normalization",
                                              "medianDb": float(np.median(delta_db)),
                                              "meanAbsoluteDb": float(np.mean(np.abs(delta_db))),
                                              "earlyFirst25msMedianDb": float(np.median(delta_db[early_mask])),
                                              "lateLast25msMedianDb": float(np.median(delta_db[late_mask])),
                                              "lateHalfMedianDb": float(np.median(delta_db[half_mask])),
                                              "integratedBandBornMinusBaseDb": (helper.power_db(born_pool.sum(axis=0)) - helper.power_db(base_pool.sum(axis=0))).tolist()},
                      "stftFrames": int(base_pool.shape[0]),
                      "stftAlignment": "left-aligned at event sample; last partial FFT frame is zero-padded by the reused helper"})
        event["windows"][str(duration_ms)] = item
        metrics_by_window[duration_ms] = {"baseSlice": base_slice, "bornSlice": born_slice,
                                          "baseBands": base_pool, "bornBands": born_pool,
                                          "differenceDb": helper.power_db(born_pool) - helper.power_db(base_pool)}
    return event, metrics_by_window


def rankdata(values):
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    i = 0
    while i < len(order):
        j = i + 1
        while j < len(order) and values[order[j]] == values[order[i]]:
            j += 1
        ranks[order[i:j]] = (i + j - 1) / 2 + 1
        i = j
    return ranks


def spearman(x, y):
    if len(x) < 2 or len(set(x)) < 2 or len(set(y)) < 2:
        return None
    return cosine(rankdata(x) - np.mean(rankdata(x)), rankdata(y) - np.mean(rankdata(y)))


def stats(values):
    values = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not values:
        return {"n": 0, "median": None, "p10": None, "p90": None, "min": None, "max": None}
    return {"n": len(values), "median": float(np.median(values)), "p10": float(np.percentile(values, 10)),
            "p90": float(np.percentile(values, 90)), "min": float(np.min(values)), "max": float(np.max(values))}


def aggregate_500(events_data, events, helper):
    chosen = [(event, data[500]) for event, data in zip(events, events_data) if 500 in data]
    if not chosen:
        raise ValueError("no complete 500 ms parent-group windows")
    base_stack = np.stack([item["baseBands"] for _, item in chosen])
    born_stack = np.stack([item["bornBands"] for _, item in chosen])
    diff_stack = np.stack([item["differenceDb"] for _, item in chosen])
    base_slice, born_slice = [], []
    for _, item in chosen:
        base_slice.append(item["baseSlice"].reshape(20, RATE // 40, 2))
        born_slice.append(item["bornSlice"].reshape(20, RATE // 40, 2))
    base_env = np.sqrt(np.mean(np.stack(base_slice) ** 2, axis=(2, 3)))
    born_env = np.sqrt(np.mean(np.stack(born_slice) ** 2, axis=(2, 3)))
    bands, _, band_index, _ = helper.erb_aggregate(helper.stft_power(np.zeros((RATE, 2), dtype=np.float64)))
    populated = sorted(set(map(int, band_index)))
    def qarray(values, q):
        return np.quantile(values, q, axis=0).tolist()
    return {"eligibleEventIndices": [event["eventIndex"] for event, _ in chosen],
            "eligibleContactIndices": [event["contactIndex"] for event, _ in chosen],
            "frameCountPerWindow": int(base_stack.shape[1]),
            "nativeFixedGainErbDb": {"baseMedianAcrossEvents": qarray(helper.power_db(base_stack), 0.5),
                                     "baseP10AcrossEvents": qarray(helper.power_db(base_stack), 0.1),
                                     "baseP90AcrossEvents": qarray(helper.power_db(base_stack), 0.9),
                                     "bornMedianAcrossEvents": qarray(helper.power_db(born_stack), 0.5),
                                     "bornP10AcrossEvents": qarray(helper.power_db(born_stack), 0.1),
                                     "bornP90AcrossEvents": qarray(helper.power_db(born_stack), 0.9)},
            "pairedNativeDifferenceDbBornMinusBase": {"medianAcrossEvents": qarray(diff_stack, 0.5),
                                                       "p10AcrossEvents": qarray(diff_stack, 0.1),
                                                       "p90AcrossEvents": qarray(diff_stack, 0.9)},
            "medianEnvelope25msRms": {"base": np.median(base_env, axis=0).tolist(),
                                      "baseP10": np.percentile(base_env, 10, axis=0).tolist(),
                                      "baseP90": np.percentile(base_env, 90, axis=0).tolist(),
                                      "born": np.median(born_env, axis=0).tolist(),
                                      "bornP10": np.percentile(born_env, 10, axis=0).tolist(),
                                      "bornP90": np.percentile(born_env, 90, axis=0).tolist(),
                                      "binMs": 25},
            "emptyBandIndicesAt48k1024HzGrid": [i for i in range(30) if i not in populated]}


def effect_consistency(events, events_data):
    vectors = []
    for event, data in zip(events, events_data):
        if 500 not in data:
            continue
        base = data[500]["baseBands"]
        born = data[500]["bornBands"]
        if base.sum() <= 0 or born.sum() <= 0:
            continue
        vectors.append((event, (born / born.sum() - base / base.sum()).ravel()))
    pair_cosines = [cosine(a[1], b[1]) for i, a in enumerate(vectors) for b in vectors[i + 1:]]
    pair_cosines = [value for value in pair_cosines if value is not None]
    band_deltas = []
    for _, vector in vectors:
        matrix = vector.reshape(-1, 30)
        band_deltas.append(matrix.sum(axis=0))
    band_deltas = np.asarray(band_deltas)
    return {"definition": "cosine between event-wise (Born unit-sum ERB-time power minus Base unit-sum ERB-time power) vectors; descriptive cross-event pattern consistency",
            "eventCount": len(vectors), "pairwisePatternCosine": stats(pair_cosines),
            "perBandPositiveEventShareOfIntegratedShapeDelta": [float(np.mean(band_deltas[:, band] > 0)) for band in range(30)],
            "perBandMedianIntegratedShapeDelta": np.median(band_deltas, axis=0).tolist() if len(band_deltas) else []}


def display_font(size=18, bold=False):
    paths = [Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
             Path("C:/Windows/Fonts/arial.ttf")]
    for path in paths:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def clamp_color(value, low, high):
    t = min(1.0, max(0.0, (value - low) / (high - low)))
    stops = [(0.0, (29, 38, 79)), (0.25, (38, 122, 142)), (0.5, (94, 201, 98)),
             (0.75, (253, 231, 37)), (1.0, (255, 255, 238))]
    for index in range(1, len(stops)):
        if t <= stops[index][0]:
            left, right = stops[index - 1], stops[index]
            alpha = (t - left[0]) / (right[0] - left[0])
            return tuple(round(left[1][c] * (1 - alpha) + right[1][c] * alpha) for c in range(3))
    return stops[-1][1]


def diff_color(value, limit):
    t = min(1.0, max(-1.0, value / limit))
    if t < 0:
        a = abs(t)
        return (round(245 * (1 - a) + 40 * a), round(245 * (1 - a) + 85 * a), round(245 * (1 - a) + 190 * a))
    return (round(245 * (1 - t) + 200 * t), round(245 * (1 - t) + 42 * t), round(245 * (1 - t) + 42 * t))


def draw_heatmap(draw, matrix, bounds, box, empty_bands=(), difference=False):
    x0, y0, width, height = box
    rows, cols = matrix.shape
    cell_w, cell_h = width / cols, height / rows
    for r in range(rows):
        for c in range(cols):
            x1, y1 = x0 + c * cell_w, y0 + r * cell_h
            if (rows == 30 and r in empty_bands) or (cols == 30 and c in empty_bands):
                color = (188, 191, 198)
            elif difference:
                color = diff_color(float(matrix[r, c]), bounds[1])
            else:
                color = clamp_color(float(matrix[r, c]), *bounds)
            draw.rectangle((x1, y1, x0 + (c + 1) * cell_w + 0.5, y0 + (r + 1) * cell_h + 0.5), fill=color)


def make_primary_png(path, aggregate):
    width, height = 1560, 1030
    image = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(image)
    title, body, small = display_font(30, True), display_font(19), display_font(15)
    draw.text((54, 30), "Frozen Base / Born natural event stream · 500 ms windows", font=title, fill=(22, 27, 36))
    draw.text((54, 78), "Median across complete parent-group windows; native fixed gain; ERB-binned STFT", font=body, fill=(68, 76, 89))
    bands = aggregate["nativeFixedGainErbDb"]
    diff = aggregate["pairedNativeDifferenceDbBornMinusBase"]["medianAcrossEvents"]
    empty = aggregate["emptyBandIndicesAt48k1024HzGrid"]
    panels = [("Base · fixed −180 to 0 dB power", np.asarray(bands["baseMedianAcrossEvents"]), ERB_ABS_DB_SCALE, False),
              ("Born P1 · fixed −180 to 0 dB power", np.asarray(bands["bornMedianAcrossEvents"]), ERB_ABS_DB_SCALE, False),
              ("Born − Base · symmetric ±120 dB", np.asarray(diff), DIFF_DB_SCALE, True)]
    x_starts = [75, 565, 1055]
    for (label, matrix, bounds, is_diff), x in zip(panels, x_starts):
        draw.text((x, 136), label, font=body, fill=(22, 27, 36))
        draw_heatmap(draw, matrix.T, bounds, (x, 174, 430, 360), empty_bands=empty, difference=is_diff)
        draw.rectangle((x, 174, x + 430, 534), outline=(160, 166, 175), width=1)
        for t, lab in ((0, "0"), (0.5, "250"), (1, "500 ms")):
            xx = x + round(430 * t)
            draw.line((xx, 534, xx, 542), fill=(80, 85, 94), width=1)
            draw.text((xx - 12, 546), lab, font=small, fill=(75, 81, 91))
        draw.text((x - 5, 165), "band 1", font=small, fill=(75, 81, 91))
        draw.text((x - 5, 523), "band 30", font=small, fill=(75, 81, 91))
    draw.text((54, 596), "Median 25 ms pooled stereo RMS envelope · native fixed gain", font=body, fill=(22, 27, 36))
    chart = (100, 650, 1455, 885)
    x0, y0, x1, y1 = chart
    for db in (-80, -70, -60, -50, -40, -30, -20, -10, 0):
        yy = y1 - (db - ENVELOPE_DBFS_SCALE[0]) / (ENVELOPE_DBFS_SCALE[1] - ENVELOPE_DBFS_SCALE[0]) * (y1 - y0)
        draw.line((x0, yy, x1, yy), fill=(220, 223, 228), width=1)
        draw.text((45, yy - 9), str(db), font=small, fill=(75, 81, 91))
    for t in (0, 0.1, 0.2, 0.3, 0.4, 0.5):
        xx = x0 + round((t / 0.5) * (x1 - x0))
        draw.line((xx, y0, xx, y1), fill=(235, 237, 240), width=1)
        draw.text((xx - 15, y1 + 8), f"{round(t * 1000)} ms", font=small, fill=(75, 81, 91))
    env = aggregate["medianEnvelope25msRms"]
    def points(values):
        dbs = 20 * np.log10(np.maximum(np.asarray(values), 1e-30))
        return [(x0 + (i / (len(dbs) - 1)) * (x1 - x0),
                 y1 - (max(ENVELOPE_DBFS_SCALE[0], min(ENVELOPE_DBFS_SCALE[1], value)) - ENVELOPE_DBFS_SCALE[0]) /
                 (ENVELOPE_DBFS_SCALE[1] - ENVELOPE_DBFS_SCALE[0]) * (y1 - y0)) for i, value in enumerate(dbs)]
    draw.line(points(env["base"]), fill=(35, 105, 185), width=4)
    draw.line(points(env["born"]), fill=(203, 77, 64), width=4)
    draw.line((1080, 927, 1120, 927), fill=(35, 105, 185), width=4)
    draw.text((1128, 916), "Base", font=body, fill=(38, 51, 72))
    draw.line((1220, 927, 1260, 927), fill=(203, 77, 64), width=4)
    draw.text((1268, 916), "Born P1", font=body, fill=(38, 51, 72))
    draw.text((54, 984), f"{len(aggregate['eligibleEventIndices'])}/44 complete windows · empty ERB band {', '.join(str(i + 1) for i in empty)} shaded gray · fixed scales; no per-window normalization",
              font=small, fill=(68, 76, 89))
    image.save(path, format="PNG", optimize=False, compress_level=9)
    clipping = {}
    for label, matrix, bounds, is_diff in panels:
        active = np.ones(matrix.shape, dtype=bool)
        active[:, empty] = False
        clipping[label] = {"belowDisplayMin": int(np.sum(matrix[active] < bounds[0])),
                           "aboveDisplayMax": int(np.sum(matrix[active] > bounds[1]))}
    return image.size, clipping


def make_group_png(path, events, aggregate):
    width, height = 1780, 1110
    image = Image.new("RGB", (width, height), (248, 249, 251))
    draw = ImageDraw.Draw(image)
    title, body, small = display_font(29, True), display_font(18), display_font(14)
    draw.text((50, 28), "Parent-group variation and overlap context", font=title, fill=(22, 27, 36))
    draw.text((50, 72), "500 ms integrated native ERB power difference: Born − Base (fixed ±120 dB); row is one unique FOOT_CONTACT group",
              font=body, fill=(68, 76, 89))
    valid = {row["contactIndex"]: row for row in events if row["windows"]["500"]["complete"]}
    matrix = np.full((len(events), 30), np.nan, dtype=float)
    for i, event in enumerate(events):
        window = event["windows"]["500"]
        if not window["complete"]:
            continue
        matrix[i] = window["nativeErbDifference"]["integratedBandBornMinusBaseDb"]
    x0, y0, cell_w, row_h = 145, 150, 37, 19
    heat_w, heat_h = cell_w * 30, row_h * len(events)
    for band in range(30):
        draw.text((x0 + band * cell_w + 10, 125), str(band + 1), font=small, fill=(75, 81, 91))
    draw.text((x0, 106), "ERB band", font=small, fill=(75, 81, 91))
    for i, event in enumerate(events):
        y = y0 + i * row_h
        draw.text((50, y + 1), f"{i + 1:02d}  {event['simulationTimeMs'] / 1000:.3f}s", font=small, fill=(52, 60, 72))
        for band, value in enumerate(matrix[i]):
            color = (188, 191, 198) if band == 3 or not math.isfinite(float(value)) else diff_color(float(value), DIFF_DB_SCALE[1])
            draw.rectangle((x0 + band * cell_w, y, x0 + (band + 1) * cell_w, y + row_h - 1), fill=color)
        window = event["windows"]["500"]
        draw.text((x0 + heat_w + 24, y + 1),
                  f"group {event['contactIndex']:>4} · Born strikes {event['acceptedBornStrikeCount']} · other groups {window['otherParentGroupsStartingInWindow']} · other Born strikes {window['otherBornStrikesStartingInWindow']}",
                  font=small, fill=(52, 60, 72))
    draw.rectangle((x0, y0, x0 + heat_w, y0 + heat_h), outline=(160, 166, 175), width=1)
    draw.text((50, 1018), f"Eligible complete 500 ms windows: {len(valid)}/44. Incomplete rows are blank; event windows are not isolated and counts include other event starts in [anchor, anchor + 500 ms).",
              font=small, fill=(68, 76, 89))
    draw.text((50, 1044), "Gray = FFT-grid ERB band with no bin centers. Differences preserve native gain and therefore include the large Base/Born level offset.",
              font=small, fill=(68, 76, 89))
    image.save(path, format="PNG", optimize=False, compress_level=9)
    valid = np.isfinite(matrix)
    valid[:, 3] = False
    values = matrix[valid]
    return image.size, {"belowDisplayMin": int(np.sum(values < DIFF_DB_SCALE[0])),
                        "aboveDisplayMax": int(np.sum(values > DIFF_DB_SCALE[1]))}


def write_float_wav(path, audio):
    samples = np.asarray(audio, dtype="<f4")
    payload = samples.tobytes(order="C")
    fmt = struct.pack("<HHIIHH", 3, 2, RATE, RATE * 8, 8, 32)
    riff = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt + b"data" + struct.pack("<I", len(payload)) + payload
    path.write_bytes(b"RIFF" + struct.pack("<I", len(riff)) + riff)


def make_listening(events, base, born):
    listening = EVIDENCE / "listening"
    listening.mkdir(parents=True, exist_ok=True)
    eligible = [event for event in events if event["windows"]["500"]["complete"]]
    if len(eligible) < 3:
        raise ValueError("fewer than three complete 500 ms windows for bounded listening prep")
    selections = []
    for quantile, label in ((0.25, "q25"), (0.50, "q50"), (0.75, "q75")):
        index = math.floor(quantile * (len(eligible) - 1) + 0.5)
        event = eligible[index]
        start, end = event["requestedFrame"], event["requestedFrame"] + RATE // 2
        pair = {"label": label, "eligibleIndex": index, "quantile": quantile, "contactIndex": event["contactIndex"],
                "eventIndex": event["eventIndex"], "simulationTimeMs": event["simulationTimeMs"],
                "startFrame": start, "endFrameExclusive": end, "files": {}}
        clips = {"base": base[start:end].copy(), "born": born[start:end].copy()}
        rms = {arm: pcm_metrics(audio)["rms"] for arm, audio in clips.items()}
        target = min(rms.values())
        gains = {arm: (target / value if value > 0 else 1.0) for arm, value in rms.items()}
        for arm, audio in clips.items():
            for mode, output in (("fixed-gain", audio), ("rms-matched-listening-only", audio * gains[arm])):
                filename = f"{label}-{arm}-{mode}.wav"
                path = listening / filename
                write_float_wav(path, output)
                receipt = file_receipt(path)
                pair["files"][mode + ":" + arm] = {**receipt, "rmsBefore": rms[arm],
                    "rmsAfter": pcm_metrics(output)["rms"], "gain": 1.0 if mode == "fixed-gain" else gains[arm],
                    "peakAfter": pcm_metrics(output)["peak"]}
        pair["rmsMatchedTargetRms"] = target
        pair["rmsMatchedRule"] = "shared scalar per stereo clip, target is the lower native pooled RMS; no boosts"
        selections.append(pair)
    manifest = {"schemaVersion": 1, "sourceBaseSha256": file_receipt(BASE_WAV)["sha256"],
                "sourceBornSha256": file_receipt(BORN_WAV)["sha256"], "sampleRate": RATE,
                "selectionRule": "sort complete 500 ms parent groups by requested sample frame; choose nearest rank floor(q*(n-1)+0.5) for q=.25,.50,.75",
                "pairs": selections, "pairCount": 6, "clipCount": 12, "humanListeningAssessmentPerformed": False,
                "automaticAudibilityOrPreferenceJudgment": False,
                "interpretation": "Fixed-gain WAVs are measurement evidence. RMS-matched WAVs are listening-only character comparison artifacts and are not audibility evidence."}
    (EVIDENCE / "listening-manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    return manifest


def jsonable_source_metrics(audio):
    metric = pcm_metrics(audio)
    return metric | {"rmsDbfs": 20 * math.log10(metric["rms"]),
                     "leftRmsDbfs": 20 * math.log10(metric["rmsLeft"]),
                     "rightRmsDbfs": 20 * math.log10(metric["rmsRight"]),
                     "peakDbfs": 20 * math.log10(metric["peak"])}


def run():
    global ALL_GROUPS
    helper = load_helper()
    self_check = helper.self_check()
    if not self_check["passed"]:
        raise ValueError("reused ERB helper self-check failed")
    report, frozen, base, born, base_header, born_header, report_bytes, gzip_bytes = load_sources()
    groups, accepted = validate_mapping(report, frozen)
    ALL_GROUPS = groups
    events, event_data = [], []
    for index, group in enumerate(groups, 1):
        row, data = analyze_pair(group, accepted, base, born, helper)
        row["eventIndex"] = index
        events.append(row)
        event_data.append(data)
    for duration in WINDOWS_MS:
        count = sum(event["windows"][str(duration)]["complete"] for event in events)
        if not 0 < count <= len(events):
            raise ValueError(f"invalid eligible window count for {duration} ms")
    aggregates = aggregate_500(event_data, events, helper)
    consistency = effect_consistency(events, event_data)
    # A zero input and an identical tone input exercise exact difference semantics through the reused helper.
    zero = np.zeros((RATE // 10, 2), dtype=np.float64)
    tone = helper.sine_stereo(250, frames=RATE // 10)
    same_zero = helper.difference_db(helper.erb_aggregate(helper.stft_power(zero))[0], helper.erb_aggregate(helper.stft_power(zero))[0])
    same_tone = helper.difference_db(helper.erb_aggregate(helper.stft_power(tone))[0], helper.erb_aggregate(helper.stft_power(tone))[0])
    _, _, band_index, _ = helper.erb_aggregate(helper.stft_power(tone))
    edges_erb, edges_hz, centers = helper.erb_edges()
    populated = sorted(set(map(int, band_index)))
    validation = {"passed": True, "sourcePathSizeSha256Verified": True,
                  "frozenInputGzipSha256": sha256(gzip_bytes), "bornRawPcmSha256": file_receipt(BORN_WAV)["sha256"],
                  "baseRawPcmSha256": file_receipt(BASE_WAV)["sha256"],
                  "pcmFormat": {"base": base_header, "born": born_header},
                  "mapping": {"sourceAcceptedBornP1Strikes": 63, "uniqueParentFootContactGroups": 44,
                              "baseSubstrateEvents": 44, "groupMultiplicity": {str(k): v for k, v in sorted(Counter(row["acceptedBornStrikeCount"] for row in groups).items())},
                              "sourceMappingRevalidatedAgainstFrozenContactsAndBornStrikes": True},
                  "eligibleCompleteWindowCounts": {str(ms): sum(event["windows"][str(ms)]["complete"] for event in events) for ms in WINDOWS_MS},
                  "windowPolicy": "whole windows only; no truncation; aligned at common parent requestedFrame; actual Base 128-frame dispatch offset is separately retained",
                  "erbSelfCheck": self_check | {"silenceDifferenceZero": bool(np.all(same_zero == 0)),
                                                "identicalToneDifferenceZero": bool(np.all(same_tone == 0)),
                                                "bandBoundariesFiniteMonotonic": bool(np.isfinite(edges_erb).all() and np.isfinite(edges_hz).all() and np.isfinite(centers).all() and np.all(np.diff(edges_hz) > 0)),
                                                "emptyBandIndices": [i for i in range(30) if i not in populated]},
                  "stereoPooling": "mean of left and right linear ERB power per time-band cell",
                  "fixedGainNormalization": "none; unit-sum normalization appears only in explicitly named shape-only metrics",
                  "noPerClipOrPerPanelDisplayNormalization": True,
                  "noSimulationOrAudioRender": True}
    summary_by_duration = {}
    for duration in WINDOWS_MS:
        rows = [event["windows"][str(duration)] for event in events if event["windows"][str(duration)]["complete"]]
        summary_by_duration[str(duration)] = {
            "eligibleEvents": len(rows), "totalEvents": len(events),
            "fullTimeFrequencyCosine": stats([row["shapeOnly"]["fullTimeFrequencyCosine"] for row in rows]),
            "integratedErbProfileCosine": stats([row["shapeOnly"]["integratedErbProfileCosine"] for row in rows]),
            "lateHalfErbProfileCosine": stats([row["shapeOnly"]["lateHalfErbProfileCosine"] for row in rows]),
            "shapeTotalVariation": stats([row["shapeOnly"]["shapeTotalVariation"] for row in rows]),
            "nativeBornMinusBaseRmsDb": stats([row["fixedGain"]["bornMinusBaseRmsDb"] for row in rows]),
            "nativeBornMinusBasePeakDb": stats([row["fixedGain"]["bornMinusBasePeakDb"] for row in rows]),
            "earlyFirst25msBornMinusBaseRmsDb": stats([row["fixedGain"]["earlyFirst25msRms"]["bornMinusBaseDb"] for row in rows]),
            "lateLast25msBornMinusBaseRmsDb": stats([row["fixedGain"]["lateLast25msRms"]["bornMinusBaseDb"] for row in rows]),
            "nativeErbDifferenceBornMinusBaseMedianDb": stats([row["nativeErbDifference"]["medianDb"] for row in rows]),
            "nativeErbDifferenceMeanAbsoluteDb": stats([row["nativeErbDifference"]["meanAbsoluteDb"] for row in rows]),
            "overlapContext": {"otherParentGroupsStartingInWindow": stats([row["otherParentGroupsStartingInWindow"] for row in rows]),
                               "otherBornStrikesStartingInWindow": stats([row["otherBornStrikesStartingInWindow"] for row in rows])},
            "overlapRelationship": {"shapeDistanceVsOtherParentGroupsSpearman": spearman([row["shapeOnly"]["shapeTotalVariation"] for row in rows], [row["otherParentGroupsStartingInWindow"] for row in rows]),
                                   "shapeDistanceVsOtherBornStrikesSpearman": spearman([row["shapeOnly"]["shapeTotalVariation"] for row in rows], [row["otherBornStrikesStartingInWindow"] for row in rows]),
                                   "scope": "descriptive only; windows are not isolated and event pairs overlap"}}
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / "analysis.json").write_text(json.dumps({
        "schemaVersion": 1,
        "question": "In the frozen first-birth 10 s natural contact stream, does matched generic Base substrate versus Born P1 show repeatable ERB-time character across the same 44 parent FOOT_CONTACT groups, or mostly level difference, group-versus-foot semantics, and overlap?",
        "decision": {"status": "MIXED",
                     "rationale": "The native fixed-gain level gap is large, but unit-sum shape comparisons remain dissimilar across 100/250/500 ms windows. Cross-event shape-change patterns are only partly consistent, and the matched event semantics and dense late-window overlap prevent a clean general Base-versus-Born character claim.",
                     "humanAudibilityClaim": False},
        "sources": {"originalEventReport": file_receipt(SOURCE_REPORT), "frozenInputGzip": file_receipt(SOURCE_GZIP),
                    "rawBasePcm": file_receipt(BASE_WAV), "rawBornPcm": file_receipt(BORN_WAV),
                    "seed": frozen["seed"], "firstPlateId": report["source"]["firstPlateId"],
                    "firstPlateBirthSeconds": report["source"]["firstPlateBirthSeconds"],
                    "firstPlateDescriptorSha256": report["source"]["firstPlateDescriptorSha256"],
                    "scheduleHashes": report.get("scheduleHashes", {}),
                    "sourceSettings": report["settings"],
                    "noSimulationOrRender": True, "sourceReportSha256": sha256(report_bytes)},
        "implementationFacts": ["Reanalyzed only the existing frozen generic Base parent-group raw worklet stem and Born P1 raw worklet stem.",
                                 "Base contains one event per 44 unique FOOT_CONTACT groups; Born contains 63 accepted P1 foot strikes mapped to those same parent groups.",
                                 "Base generic worklet randomness realization was not recorded; no replay was used to replace the verified historical PCM.",
                                 "All windows use the common requested parent event sample as anchor. The Base arm's recorded next-128-frame dispatch is retained as metadata and is not shifted out of the measured response."],
        "measurements": {"wholeStemFixedGain": {"base": jsonable_source_metrics(base), "born": jsonable_source_metrics(born),
                                                 "bornMinusBaseRmsDb": db_ratio(pcm_metrics(born)["rms"], pcm_metrics(base)["rms"]),
                                                 "bornMinusBasePeakDb": db_ratio(pcm_metrics(born)["peak"], pcm_metrics(base)["peak"])},
                         "byWindowMs": summary_by_duration,
                         "crossEventShapeEffectConsistency500ms": consistency,
                         "eventAligned500msAggregate": aggregates,
                         "actualBaseDispatchOffsetFrames": stats([row["baseDispatchOffsetFrames"] for row in events])},
        "representation": {"helper": str(HELPER_PATH.relative_to(ROOT)).replace("\\", "/"),
                           "fftSize": 1024, "window": "symmetric Hann via numpy.hanning", "hopSize": 256,
                           "sampleRate": RATE, "rangeHz": [0, 8000], "bands": 30,
                           "erbRate": "E(f)=21.4*log10(1+0.00437*f)",
                           "linearPower": "one-sided |rFFT|^2 / sum(Hann)^2, positive bins doubled except DC; sum bin powers into [low,high) ERB bands before any dB conversion",
                           "stereoPooling": "mean left/right linear ERB power per time-band cell",
                           "nativeFixedGain": True, "perClipNormalization": False,
                           "shapeOnly": "divide each response ERB-time linear power by that response's total ERB-time power; compare cosine, integrated profile and late-half integrated profile; no floor enters shape normalization",
                           "emptyBands": [{"indexZeroBased": i, "indexOneBased": i + 1, "lowHz": float(edges_hz[i]), "highHz": float(edges_hz[i + 1]),
                                           "reason": "no FFT bin center falls in this half-open band"} for i in range(30) if i not in populated],
                           "boundariesErbRate": edges_erb.tolist(), "boundariesHz": edges_hz.tolist(), "centersHz": centers.tolist(),
                           "boundaryRule": "half-open [low,high); DC included in first band; bin centers through 7968.75 Hz",
                           "windowFramePolicy": "each complete PCM segment is analyzed at its exact full length; left-aligned frames; helper zero-pads final partial frame"},
        "eventCountAndOverlap": {"parentGroups": [{"eventIndex": row["eventIndex"], "contactIndex": row["contactIndex"],
                                                       "simulationTimeMs": row["simulationTimeMs"], "requestedFrame": row["requestedFrame"],
                                                       "actualBaseDispatchFrame": row["actualBaseDispatchFrame"],
                                                       "acceptedBornStrikeCount": row["acceptedBornStrikeCount"],
                                                       "windows": {str(ms): {"complete": row["windows"][str(ms)]["complete"],
                                                                            "otherParentGroupsStartingInWindow": row["windows"][str(ms)]["otherParentGroupsStartingInWindow"],
                                                                            "otherBornStrikesStartingInWindow": row["windows"][str(ms)]["otherBornStrikesStartingInWindow"]} for ms in WINDOWS_MS}}
                                                      for row in events],
                              "windowsAreIsolated": False,
                              "otherEventDefinition": "count of other parent-group requested anchors / mapped Born accepted strikes whose start lies in [current anchor, current anchor + duration), excluding the current contact group"},
        "validation": validation,
        "interpretationLimits": ["This compares these frozen raw stems, not a randomized population or a new render.",
                                 "Generic Base uses one group-level excitation per parent contact; Born P1 uses accepted individual foot responses. This event semantic difference is part of the historical stems.",
                                 "Window metrics include overlap from the continuous streams; event windows are not isolated.",
                                 "Shape-only unit-sum metrics describe distribution shape and do not establish audibility.",
                                 "No human listening assessment was performed; no audibility, preference, or production-quality claim is made."]
    }, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    csv_path = EVIDENCE / "event-pairs.csv"
    fields = ["eventIndex", "contactIndex", "simulationTimeMs", "requestedFrame", "actualBaseDispatchFrame",
              "baseDispatchOffsetFrames", "acceptedBornStrikeCount"]
    for ms in WINDOWS_MS:
        fields.extend([f"{ms}msComplete", f"{ms}msOtherParentGroups", f"{ms}msOtherBornStrikes",
                       f"{ms}msBaseRms", f"{ms}msBornRms", f"{ms}msBornMinusBaseRmsDb",
                       f"{ms}msBaseRmsLeft", f"{ms}msBornRmsLeft", f"{ms}msBaseRmsRight", f"{ms}msBornRmsRight",
                       f"{ms}msBasePeak", f"{ms}msBornPeak", f"{ms}msBornMinusBasePeakDb",
                       f"{ms}msEarly25msBornMinusBaseDb", f"{ms}msLate25msBornMinusBaseDb",
                       f"{ms}msFullShapeCosine", f"{ms}msIntegratedCosine", f"{ms}msLateHalfCosine", f"{ms}msShapeTotalVariation",
                       f"{ms}msNativeErbMedianBornMinusBaseDb", f"{ms}msNativeErbMeanAbsoluteDifferenceDb"])
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for event in events:
            line = {key: event.get(key) for key in fields[:7]}
            for ms in WINDOWS_MS:
                row = event["windows"][str(ms)]
                prefix = f"{ms}ms"
                line[prefix + "Complete"] = row["complete"]
                line[prefix + "OtherParentGroups"] = row["otherParentGroupsStartingInWindow"]
                line[prefix + "OtherBornStrikes"] = row["otherBornStrikesStartingInWindow"]
                if row["complete"]:
                    fixed, shape, diff = row["fixedGain"], row["shapeOnly"], row["nativeErbDifference"]
                    for key, value in (("BaseRms", fixed["base"]["rms"]), ("BornRms", fixed["born"]["rms"]),
                                       ("BornMinusBaseRmsDb", fixed["bornMinusBaseRmsDb"]),
                                       ("BaseRmsLeft", fixed["base"]["rmsLeft"]), ("BornRmsLeft", fixed["born"]["rmsLeft"]),
                                       ("BaseRmsRight", fixed["base"]["rmsRight"]), ("BornRmsRight", fixed["born"]["rmsRight"]),
                                       ("BasePeak", fixed["base"]["peak"]), ("BornPeak", fixed["born"]["peak"]),
                                       ("BornMinusBasePeakDb", fixed["bornMinusBasePeakDb"]),
                                       ("Early25msBornMinusBaseDb", fixed["earlyFirst25msRms"]["bornMinusBaseDb"]),
                                       ("Late25msBornMinusBaseDb", fixed["lateLast25msRms"]["bornMinusBaseDb"]),
                                       ("FullShapeCosine", shape["fullTimeFrequencyCosine"]),
                                       ("IntegratedCosine", shape["integratedErbProfileCosine"]),
                                       ("LateHalfCosine", shape["lateHalfErbProfileCosine"]),
                                       ("ShapeTotalVariation", shape["shapeTotalVariation"]),
                                       ("NativeErbMedianBornMinusBaseDb", diff["medianDb"]),
                                       ("NativeErbMeanAbsoluteDifferenceDb", diff["meanAbsoluteDb"])):
                        line[prefix + key] = value
            writer.writerow(line)
    png1_size, png1_clipping = make_primary_png(EVIDENCE / "event-aligned-500ms.png", aggregates)
    png2_size, png2_clipping = make_group_png(EVIDENCE / "event-overlap-groups.png", events, aggregates)
    listening = make_listening(events, base, born)
    image_metadata = {"event-aligned-500ms.png": {"pixels": list(png1_size),
                                                   "fixedNativeErbPowerDbScale": list(ERB_ABS_DB_SCALE),
                                                   "medianEnvelopeDbfsScale": list(ENVELOPE_DBFS_SCALE),
                                                   "symmetricDifferenceDbScale": list(DIFF_DB_SCALE),
                                                   "clipping": png1_clipping},
                      "event-overlap-groups.png": {"pixels": list(png2_size),
                                                   "symmetricDifferenceDbScale": list(DIFF_DB_SCALE),
                                                   "clipping": png2_clipping}}
    report_path = EVIDENCE / "analysis.json"
    report_data = json.loads(report_path.read_text(encoding="utf-8"))
    report_data["measurements"]["eventAligned500msAggregate"]["visualScale"] = image_metadata["event-aligned-500ms.png"]
    report_data["measurements"]["groupHeatmapVisualScale"] = image_metadata["event-overlap-groups.png"]
    report_data["listeningPreparation"] = {"manifest": "listening-manifest.json", "clipCount": listening["clipCount"],
                                             "humanListeningAssessmentPerformed": False}
    # Rewrite with public event records after the temporary plot-only values are removed.
    report_data["eventCountAndOverlap"]["parentGroups"] = [{"eventIndex": row["eventIndex"], "contactIndex": row["contactIndex"],
        "simulationTimeMs": row["simulationTimeMs"], "requestedFrame": row["requestedFrame"],
        "actualBaseDispatchFrame": row["actualBaseDispatchFrame"], "acceptedBornStrikeCount": row["acceptedBornStrikeCount"],
        "windows": {str(ms): {"complete": row["windows"][str(ms)]["complete"],
                               "otherParentGroupsStartingInWindow": row["windows"][str(ms)]["otherParentGroupsStartingInWindow"],
                               "otherBornStrikesStartingInWindow": row["windows"][str(ms)]["otherBornStrikesStartingInWindow"]} for ms in WINDOWS_MS}}
        for row in events]
    report_data["eventDetails"] = events
    report_path.write_text(json.dumps(report_data, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    (EVIDENCE / "validation.json").write_text(json.dumps({
        "schemaVersion": 1, "branchAtPassStart": RESEARCH_BRANCH,
        "researchHeadAtPassStart": RESEARCH_HEAD_AT_PASS_START,
        "productionMain": PRODUCTION_MAIN,
        "sourceAndMapping": validation,
        "deterministicInputsOnly": True,
        "analysisGenerationDoesNotInvokeSimulationOrAudioRenderer": True,
        "productionSourceModification": False
    }, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    artifact_files = sorted(path for path in EVIDENCE.rglob("*") if path.is_file() and path.name != "report-manifest.json")
    artifacts = []
    for path in artifact_files:
        entry = file_receipt(path)
        if path.suffix.lower() == ".png":
            with Image.open(path) as img:
                entry["pixels"] = list(img.size)
        artifacts.append(entry)
    helper_bytes, script_bytes = HELPER_PATH.read_bytes(), Path(__file__).read_bytes()
    manifest = {"schemaVersion": 1, "sourceReportSha256": sha256(report_bytes),
                "sourceBasePcmSha256": file_receipt(BASE_WAV)["sha256"], "sourceBornPcmSha256": file_receipt(BORN_WAV)["sha256"],
                "generator": {"path": str(Path(__file__).relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(script_bytes),
                              "reusedErbHelper": str(HELPER_PATH.relative_to(ROOT)).replace("\\", "/"), "helperSha256": sha256(helper_bytes),
                              "python": sys.version.split()[0], "pillow": Image.__version__, "numpy": np.__version__,
                              "command": "python scripts/ant-base-born-natural-event-erb.py"},
                "artifacts": artifacts,
                "manifestSelfHash": "omitted to avoid recursive hashing"}
    (EVIDENCE / "report-manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    counts = {str(ms): sum(event["windows"][str(ms)]["complete"] for event in events) for ms in WINDOWS_MS}
    print(json.dumps({"sourceVerification": validation["passed"], "groups": len(groups), "bornStrikes": len(accepted),
                      "eligibleWindows": counts, "fullStemRmsDeltaBornMinusBaseDb": report_data["measurements"]["wholeStemFixedGain"]["bornMinusBaseRmsDb"],
                      "500msShape": report_data["measurements"]["byWindowMs"]["500"]["fullTimeFrequencyCosine"],
                      "pngs": image_metadata,
                      "decision": "MIXED"}, indent=2))


if __name__ == "__main__":
    run()
