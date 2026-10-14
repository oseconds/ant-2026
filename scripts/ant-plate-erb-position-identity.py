#!/usr/bin/env python3
"""Reanalyze frozen natural Plate one-shots for cross-position ERB response identity."""
import argparse
import csv
import gzip
import hashlib
import importlib.util
import json
import math
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, __version__ as PILLOW_VERSION

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/ant/evidence/2026-10-13-plate-sonic-individuality"
LOSS = ROOT / "docs/ant/evidence/2026-10-14-base-born-loss-distribution"
OUT = ROOT / "docs/ant/evidence/2026-10-14-plate-erb-position-identity"
RAW = ROOT / "test-results/ant-plate-sonic-individuality-20261013"
POSITIONS = ("p25", "p50", "p75")
F32 = np.dtype("<f4")
POWER_FLOOR = 1e-30


def load_loss_analysis():
    path = ROOT / "scripts/ant-base-born-loss-analysis.py"
    spec = importlib.util.spec_from_file_location("ant_base_born_loss_analysis", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LOSS_ANALYSIS = load_loss_analysis()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def unit_sum(values, label):
    values = np.asarray(values, dtype=np.float64)
    total = float(values.sum())
    if not math.isfinite(total) or total <= 0:
        raise ValueError(f"{label}: ERB-time power mass must be finite and positive")
    return values / total


def cosine(a, b):
    a = np.asarray(a, dtype=np.float64).reshape(-1)
    b = np.asarray(b, dtype=np.float64).reshape(-1)
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not math.isfinite(denominator) or denominator <= 0:
        raise ValueError("Cosine input has zero or non-finite norm")
    return float(np.clip(np.dot(a, b) / denominator, 0.0, 1.0))


def summarize(values):
    values = np.asarray(values, dtype=np.float64)
    if not len(values) or not np.isfinite(values).all():
        raise ValueError("Cannot summarize empty or non-finite measurements")
    q = np.quantile(values, [0.10, 0.25, 0.50, 0.75, 0.90])
    return {"count": int(len(values)), "min": float(values.min()), "p10": float(q[0]),
            "p25": float(q[1]), "median": float(q[2]), "mean": float(values.mean()),
            "p75": float(q[3]), "p90": float(q[4]), "max": float(values.max())}


def distribution_comparison(within, between):
    within = np.asarray(within, dtype=np.float64)
    between = np.asarray(between, dtype=np.float64)
    differences = within[:, None] - between[None, :]
    dominance = float(np.mean((differences > 0) + 0.5 * (differences == 0)))
    return {"within": summarize(within), "between": summarize(between),
            "medianWithinMinusBetween": float(np.median(within) - np.median(between)),
            "pairwiseDominanceProbability": dominance,
            "dominanceDefinition": "fraction of all within/between value pairs where within is greater; ties count one half"}


def compare_responses(a, b):
    return {
        "fullErbTimeCosine": cosine(a["fullShape"], b["fullShape"]),
        "integratedErbProfileCosine": cosine(a["integratedShape"], b["integratedShape"]),
        "lateTailErbProfileCosine": cosine(a["lateShape"], b["lateShape"]),
        "rmsDeltaDbBMinusA": float(b["rmsDbfs"] - a["rmsDbfs"]),
        "absRmsGapDb": float(abs(b["rmsDbfs"] - a["rmsDbfs"]))
    }


def load_inputs():
    render_manifest_path = SOURCE / "render-manifest.json"
    index_path = RAW / "render-index.json"
    roster_path = SOURCE / "descriptor-roster.json"
    summary_path = SOURCE / "measurement-summary.json"
    loss_analysis_path = LOSS / "analysis.json"
    render_manifest = read_json(render_manifest_path)
    index = read_json(index_path)
    roster = read_json(roster_path)
    prior_summary = read_json(summary_path)
    prior_loss = read_json(loss_analysis_path)

    expected_baseline = "d45823d40c9a87c1b333fa9872f3c897ee9ab01b"
    if render_manifest["baseline"] != expected_baseline:
        raise ValueError("Frozen source manifest production baseline changed")
    if render_manifest["measurementGain"] != 1:
        raise ValueError("Frozen inputs are not fixed-gain 1 measurement PCM")
    if not roster.get("selectedKeys") or len(roster["selectedKeys"]) != 12:
        raise ValueError("Expected the frozen 12-Plate selected roster")

    rows = [row for row in index["rows"] if row["condition"] == "native" and row["positionLabel"] in POSITIONS]
    if len(rows) != 36:
        raise ValueError(f"Expected 36 native position responses, found {len(rows)}")
    selected = roster["selectedKeys"]
    if len({row["plateKey"] for row in rows}) != 12 or set(row["plateKey"] for row in rows) != set(selected):
        raise ValueError("Native response roster does not match descriptor-roster.json")

    artifact_rows = [item for item in render_manifest["artifacts"]
                     if item["role"] == "fixed-gain stereo measurement PCM"]
    artifacts = {item["path"]: item for item in artifact_rows}
    if len(artifacts) != len(artifact_rows):
        raise ValueError("Render manifest contains duplicate PCM paths")

    source_receipts = []
    pending_pcm = []
    records = []
    aliases = {key: f"P{index + 1:02d}" for index, key in enumerate(selected)}
    frame_times = None
    expected_topology = {}
    for plate_key in selected:
        plate_rows = sorted([row for row in rows if row["plateKey"] == plate_key],
                             key=lambda row: POSITIONS.index(row["positionLabel"]))
        if [row["positionLabel"] for row in plate_rows] != list(POSITIONS):
            raise ValueError(f"{plate_key}: expected p25/p50/p75 exactly once")
        topology_hashes = {row["topologySha256"] for row in plate_rows}
        materials = {json.dumps(row["metadata"]["material"], sort_keys=True) for row in plate_rows}
        nodes = {row["nodeCount"] for row in plate_rows}
        if len(topology_hashes) != 1 or len(materials) != 1 or len(nodes) != 1:
            raise ValueError(f"{plate_key}: native geometry/material changed across positions")
        expected_topology[plate_key] = next(iter(topology_hashes))

        for row in plate_rows:
            if (row["frames"], row["sampleRate"], row["physicsRate"]) != (72_000, 48_000, 6_000):
                raise ValueError(f"{row['id']}: sample rate/frame count differs from frozen recipe")
            if len(row["schedule"]) != 1 or row["telemetry"]["contactPulseDurationMs"] != 3:
                raise ValueError(f"{row['id']}: expected existing isolated 3 ms one-contact render")
            if row["telemetry"]["contactRecoveryTimeMs"] != 75 or row["telemetry"]["noduleCount"] != 0:
                raise ValueError(f"{row['id']}: recovery or isolated topology differs from frozen recipe")
            if row["telemetry"]["couplingLinks"] != 0 or row["telemetry"]["layers"] != 1:
                raise ValueError(f"{row['id']}: expected uncoupled single-Plate native response")

            relative = row["files"]["pcm"]
            expected = artifacts.get(relative)
            if expected is None:
                raise ValueError(f"Missing PCM hash receipt in render-manifest.json: {relative}")
            pcm_bytes = (ROOT / relative).read_bytes()
            actual_hash = sha256(pcm_bytes)
            if len(pcm_bytes) != row["frames"] * 2 * 4 or len(pcm_bytes) != expected["bytes"]:
                raise ValueError(f"{relative}: PCM byte size does not match stereo Float32 frame count")
            if actual_hash != expected["sha256"]:
                raise ValueError(f"{relative}: SHA-256 differs from render-manifest.json")
            pending_pcm.append((plate_key, row, relative, pcm_bytes, actual_hash))
            source_receipts.append({"id": row["id"], "plateKey": plate_key,
                                    "positionLabel": row["positionLabel"], "path": relative,
                                    "bytes": len(pcm_bytes), "sha256": actual_hash})

    if len(source_receipts) != 36 or len({item["path"] for item in source_receipts}) != 36:
        raise ValueError("Expected 36 distinct source PCM paths verified before analysis")

    frame_times = None
    for plate_key, row, relative, pcm_bytes, actual_hash in pending_pcm:
        pcm = np.frombuffer(pcm_bytes, dtype=F32).astype(np.float64).reshape(row["frames"], 2)
        if not np.isfinite(pcm).all():
            raise ValueError(f"{relative}: PCM contains non-finite samples")

        stft = LOSS_ANALYSIS.stft_power(pcm, sample_rate=48_000)
        bands, frequencies, band_index, centers = LOSS_ANALYSIS.erb_aggregate(stft)
        pooled = bands.mean(axis=2)
        if pooled.shape != (279, 30) or not np.isfinite(pooled).all():
            raise ValueError(f"{row['id']}: ERB-time array has wrong shape or non-finite values")
        if frame_times is None:
            frame_times = np.arange(pooled.shape[0], dtype=np.float64) * 256 / 48_000
        elif len(frame_times) != pooled.shape[0]:
            raise ValueError("STFT frame counts are not aligned")
        full_shape = unit_sum(pooled, row["id"])
        integrated = pooled.sum(axis=0)
        late_mask = frame_times >= 0.5
        late = pooled[late_mask].sum(axis=0)
        integrated_shape = unit_sum(integrated, f"{row['id']} integrated profile")
        late_shape = unit_sum(late, f"{row['id']} late-tail profile")
        rms = float(np.sqrt(np.mean(pcm * pcm)))
        peak = float(np.max(np.abs(pcm)))
        if rms <= 0 or not math.isfinite(rms) or not math.isfinite(peak):
            raise ValueError(f"{row['id']}: invalid fixed-gain RMS or peak")
        rms_dbfs = 20 * math.log10(rms)
        zero_bins = int(np.count_nonzero(pooled == 0))
        below_floor = pooled < POWER_FLOOR
        below_floor_mass = float(pooled[below_floor].sum() / pooled.sum())
        record = {
            "id": row["id"], "plateKey": plate_key, "alias": aliases[plate_key],
            "positionLabel": row["positionLabel"], "nodeCount": row["nodeCount"],
            "inputPath": relative, "inputBytes": len(pcm_bytes), "inputSha256": actual_hash,
            "rms": rms, "rmsDbfs": rms_dbfs, "peak": peak,
            "erbTimePowerMass": float(pooled.sum()), "exactZeroCells": zero_bins,
            "exactZeroCellFraction": zero_bins / pooled.size,
            "subFloorPowerMassFraction": below_floor_mass,
            "minPositiveErbPower": float(pooled[pooled > 0].min()),
            "fullShape": full_shape, "integratedShape": integrated_shape,
            "lateShape": late_shape, "pooledErbPower": pooled
        }
        records.append(record)

    previous_stft = prior_loss["fixedScaleStft"]
    previous_erb = prior_loss["erb"]
    edge_erb, edge_hz, centers_hz = LOSS_ANALYSIS.erb_edges()
    if (previous_stft["fftSize"], previous_stft["hopSize"], previous_stft["sampleRate"],
        previous_stft["frameCount"], previous_erb["bands"]) != (1024, 256, 48_000, 279, 30):
        raise ValueError("Loss-distribution STFT/ERB contract differs from requested settings")
    if previous_erb["rateDefinition"] != "E(f)=21.4*log10(1+0.00437*f)":
        raise ValueError("Existing ERB-rate formula changed")
    if not np.allclose(edge_hz, previous_erb["boundariesHz"], rtol=0, atol=1e-9):
        raise ValueError("New ERB boundaries differ from the loss-distribution sidecar")
    if len(frequencies) != 171 or len(band_index) != 171 or len(centers) != 30:
        raise ValueError("ERB bin map dimensions differ from the established sidecar")

    return {
        "renderManifest": render_manifest, "index": index, "roster": roster,
        "priorSummary": prior_summary, "priorLoss": prior_loss,
        "sourceReceipts": source_receipts, "records": records, "aliases": aliases,
        "frameTimes": frame_times, "edgeErb": edge_erb, "edgeHz": edge_hz,
        "centersHz": centers_hz, "frequencies": frequencies, "bandIndex": band_index,
        "expectedTopology": expected_topology, "renderManifestPath": render_manifest_path,
        "indexPath": index_path, "rosterPath": roster_path, "summaryPath": summary_path,
        "lossAnalysisPath": loss_analysis_path
    }


def make_pairs(records, selected):
    by_plate_pos = {(r["plateKey"], r["positionLabel"]): r for r in records}
    rows = []
    within = []
    for plate in selected:
        for a_pos, b_pos in combinations(POSITIONS, 2):
            a, b = by_plate_pos[(plate, a_pos)], by_plate_pos[(plate, b_pos)]
            measures = compare_responses(a, b)
            row = {"set": "within-plate-cross-position", "pairId": f"within:{plate}:{a_pos}-{b_pos}",
                   "a": a["id"], "b": b["id"], "plateA": plate, "plateB": plate,
                   "positionA": a_pos, "positionB": b_pos, **measures}
            rows.append(row)
            within.append(row)
    between = []
    for position in POSITIONS:
        for plate_a, plate_b in combinations(selected, 2):
            a, b = by_plate_pos[(plate_a, position)], by_plate_pos[(plate_b, position)]
            measures = compare_responses(a, b)
            row = {"set": "between-plate-same-position", "pairId": f"between:{position}:{plate_a}:{plate_b}",
                   "a": a["id"], "b": b["id"], "plateA": plate_a, "plateB": plate_b,
                   "positionA": position, "positionB": position, **measures}
            rows.append(row)
            between.append(row)
    if len(within) != 36 or len(between) != 198:
        raise ValueError(f"Pair set mismatch: within={len(within)}, between={len(between)}")

    metrics = ("fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine")
    comparison = {metric: distribution_comparison([r[metric] for r in within], [r[metric] for r in between])
                  for metric in metrics}
    position_pairs = {}
    for a_pos, b_pos in combinations(POSITIONS, 2):
        key = f"{a_pos}-{b_pos}"
        group = [row for row in within if row["positionA"] == a_pos and row["positionB"] == b_pos]
        position_pairs[key] = {metric: summarize([row[metric] for row in group]) for metric in metrics}
    between_same_position = {}
    for position in POSITIONS:
        group = [row for row in between if row["positionA"] == position]
        between_same_position[position] = {metric: summarize([row[metric] for row in group]) for metric in metrics}

    per_plate = []
    alias_by_plate = {record["plateKey"]: record["alias"] for record in records}
    for plate in selected:
        group = [row for row in within if row["plateA"] == plate]
        per_plate.append({"plateKey": plate, "alias": alias_by_plate[plate],
                          "pairs": [row["pairId"] for row in group],
                          **{metric: summarize([row[metric] for row in group]) for metric in metrics}})

    order = sorted(records, key=lambda item: (selected.index(item["plateKey"]), POSITIONS.index(item["positionLabel"])))
    full_matrix = [[cosine(a["fullShape"], b["fullShape"]) for b in order] for a in order]
    late_matrix = [[cosine(a["lateShape"], b["lateShape"]) for b in order] for a in order]
    if len(order) != 36 or any(abs(full_matrix[i][i] - 1) > 1e-12 for i in range(36)):
        raise ValueError("Identity matrix dimensions or diagonal self-similarity failed")

    retrieval_rows = []
    same_plate_nearest = 0
    same_position_nearest = 0
    for query_index, query in enumerate(order):
        candidates = [(full_matrix[query_index][j], candidate)
                      for j, candidate in enumerate(order) if j != query_index]
        candidates.sort(key=lambda item: (-item[0], item[1]["id"]))
        score, nearest = candidates[0]
        same_plate = nearest["plateKey"] == query["plateKey"]
        nearest_same_position = nearest["positionLabel"] == query["positionLabel"]
        same_plate_nearest += int(same_plate)
        same_position_nearest += int(nearest_same_position and not same_plate)
        retrieval_rows.append({"query": query["id"], "nearest": nearest["id"],
                               "similarity": score, "samePlateOtherPosition": same_plate,
                               "samePositionOtherPlate": nearest_same_position and not same_plate})

    return {
        "pairRows": rows, "within": within, "between": between,
        "comparison": comparison, "withinPositionPairs": position_pairs,
        "betweenSamePosition": between_same_position, "perPlate": per_plate,
        "fullMatrix": full_matrix, "lateMatrix": late_matrix,
        "matrixOrder": [r["id"] for r in order],
        "retrieval": {"method": "nearest of the other 35 by full unit-sum ERB-time cosine; ties ordered by response id",
                      "samePlateOtherPositionNearestCount": same_plate_nearest,
                      "samePositionOtherPlateNearestCount": same_position_nearest,
                      "queryCount": len(order), "rows": retrieval_rows},
    }


def font(size, bold=False):
    root = Path("C:/Windows/Fonts")
    candidate = root / ("arialbd.ttf" if bold else "arial.ttf")
    if candidate.exists():
        return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default(size=size)


def text_center(draw, xy, text, used_font, fill=(25, 30, 36)):
    draw.text(xy, text, font=used_font, fill=fill, anchor="mm")


def render_position_grid(records, selected, aliases, output):
    margin, label_width = 42, 286
    tile_width, tile_height, tile_gap, row_step = 390, 44, 18, 62
    grid_x, top = margin + label_width, 126
    column_step = tile_width + tile_gap
    width = grid_x + 3 * tile_width + 2 * tile_gap + margin
    height = top + 12 * row_step + 120
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 24), "Natural Plate ERB-time response across contact position", font=font(27, True), fill=(23, 33, 43))
    draw.text((margin, 65), "Native fixed-gain pooled stereo · common absolute display −100 to 0 dBFS · no per-response normalization",
              font=font(15), fill=(65, 73, 82))
    draw.text((margin, 91), "ERB-time bins: 279 frames / 1.5 s × 30 equal ERB-rate bands; high bands at top, low bands at bottom",
              font=font(13), fill=(65, 73, 82))
    for col, position in enumerate(POSITIONS):
        x = grid_x + col * column_step + tile_width / 2
        text_center(draw, (x, 112), position, font(16, True))
    by_plate_pos = {(r["plateKey"], r["positionLabel"]): r for r in records}
    for row_index, plate in enumerate(selected):
        y = top + row_index * row_step
        seed, plate_no = plate.split("-trail-plate-")
        label = f"{aliases[plate]}   seed {seed[-2:]} / Plate {plate_no}"
        draw.text((margin, y + tile_height / 2), label, font=font(15), fill=(30, 38, 47), anchor="lm")
        for col, position in enumerate(POSITIONS):
            record = by_plate_pos[(plate, position)]
            db = LOSS_ANALYSIS.power_db(record["pooledErbPower"])
            grayscale = np.rint(np.clip((db + 100.0) / 100.0, 0.0, 1.0) * 255).astype(np.uint8)
            tile = Image.fromarray(np.flipud(grayscale)).convert("RGB")
            tile = tile.resize((tile_width, tile_height), Image.Resampling.NEAREST)
            x = grid_x + col * column_step
            image.paste(tile, (x, y))
            draw.rectangle((x, y, x + tile_width - 1, y + tile_height - 1), outline=(160, 166, 173), width=1)
    footer_y = top + 12 * row_step + 13
    draw.text((margin, footer_y + 8), "Fixed display scale", font=font(13, True), fill=(40, 48, 58), anchor="lm")
    bar_x, bar_y, bar_width, bar_height = grid_x, footer_y, 390, 16
    bar = Image.fromarray(np.tile(np.arange(256, dtype=np.uint8), (bar_height, 1))).convert("RGB")
    image.paste(bar.resize((bar_width, bar_height), Image.Resampling.NEAREST), (bar_x, bar_y))
    draw.rectangle((bar_x, bar_y, bar_x + bar_width - 1, bar_y + bar_height - 1), outline=(125, 132, 140))
    draw.text((bar_x, bar_y + 22), "−100 dBFS", font=font(12), fill=(55, 62, 70))
    draw.text((bar_x + bar_width, bar_y + 22), "0 dBFS", font=font(12), fill=(55, 62, 70), anchor="ra")
    time_y = bar_y + 48
    draw.text((grid_x, time_y), "0 s", font=font(12), fill=(55, 62, 70))
    draw.text((grid_x + tile_width, time_y), "1.5 s →", font=font(12), fill=(55, 62, 70), anchor="ra")
    image.save(output, format="PNG", optimize=False, compress_level=9)
    return {"width": image.width, "height": image.height, "bytes": output.stat().st_size}


def similarity_color(value):
    value = float(np.clip(value, 0.0, 1.0))
    low, high = np.array((247, 248, 249)), np.array((35, 83, 127))
    return tuple(np.rint(low + value * (high - low)).astype(np.uint8).tolist())


def render_identity_summary(full_matrix, late_matrix, selected, aliases, output):
    cell, matrix_size, top = 14, 36 * 14, 166
    panel_xs = (60, 870)
    matrix_offset_x = 72
    width, height = 1670, 900
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 23), "Plate ERB identity similarity", font=font(27, True), fill=(23, 33, 43))
    draw.text((40, 64), "Responses ordered by frozen Plate roster; within each 3×3 block: p25, p50, p75. Both panels use cosine 0–1.",
              font=font(14), fill=(65, 73, 82))
    matrices = ((full_matrix, "Full ERB-time shape · 279 × 30"),
                (late_matrix, "Late-tail ERB profile · frames ≥500 ms"))
    for panel_x, (matrix, label) in zip(panel_xs, matrices):
        matrix_x = panel_x + matrix_offset_x
        draw.text((matrix_x + matrix_size / 2, 123), label, font=font(17, True), fill=(30, 39, 49), anchor="mm")
        rgb = np.empty((36, 36, 3), dtype=np.uint8)
        for y in range(36):
            for x in range(36):
                rgb[y, x] = similarity_color(matrix[y][x])
        matrix_image = Image.fromarray(rgb).resize((matrix_size, matrix_size), Image.Resampling.NEAREST)
        image.paste(matrix_image, (matrix_x, top))
        for group_index, plate in enumerate(selected):
            center = matrix_x + (group_index * 3 + 1.5) * cell
            text_center(draw, (center, top - 17), aliases[plate], font(10, True), fill=(36, 45, 54))
            text_center(draw, (panel_x + 25, top + (group_index * 3 + 1.5) * cell), aliases[plate], font(10, True), fill=(36, 45, 54))
        for index in range(0, 37, 3):
            offset = index * cell
            color = (194, 102, 52) if index not in (0, 36) else (70, 78, 86)
            draw.line((matrix_x + offset, top, matrix_x + offset, top + matrix_size), fill=color, width=2)
            draw.line((matrix_x, top + offset, matrix_x + matrix_size, top + offset), fill=color, width=2)
        draw.rectangle((matrix_x, top, matrix_x + matrix_size, top + matrix_size), outline=(70, 78, 86), width=2)
        bar_x, bar_y, bar_width, bar_height = matrix_x, top + matrix_size + 23, 220, 13
        strip = np.arange(256, dtype=np.float64) / 255
        bar_image = Image.new("RGB", (256, 1))
        for x, value in enumerate(strip):
            bar_image.putpixel((x, 0), similarity_color(value))
        image.paste(bar_image.resize((bar_width, bar_height), Image.Resampling.NEAREST), (bar_x, bar_y))
        draw.text((bar_x, bar_y + 18), "0 dissimilar", font=font(11), fill=(55, 62, 70))
        draw.text((bar_x + bar_width, bar_y + 18), "1 identical", font=font(11), fill=(55, 62, 70), anchor="ra")
    legend_y = 808
    draw.text((40, legend_y - 16), "Frozen roster alias map (seed suffix / Plate id)", font=font(12, True), fill=(44, 51, 60))
    legend_xs = (40, 310, 580, 850, 1120, 1390)
    for i, plate in enumerate(selected):
        x = legend_xs[i % 6]
        y = legend_y + 5 + (i // 6) * 24
        seed, plate_no = plate.split("-trail-plate-")
        draw.text((x, y), f"{aliases[plate]} = {seed[-2:]}/{plate_no}", font=font(11), fill=(45, 53, 62))
    image.save(output, format="PNG", optimize=False, compress_level=9)
    return {"width": image.width, "height": image.height, "bytes": output.stat().st_size}


def write_outputs(data, pair_data):
    OUT.mkdir(parents=True, exist_ok=True)
    records = data["records"]
    selected = data["roster"]["selectedKeys"]
    report_path = OUT / "analysis.json"
    series_path = OUT / "erb-time-series.json.gz"
    pair_path = OUT / "pairwise-comparisons.csv"
    validation_path = OUT / "validation.json"
    grid_path = OUT / "plate-erb-position-grid.png"
    matrix_path = OUT / "plate-erb-identity-summary.png"

    source_series = {
        "schemaVersion": 1,
        "definition": {
            "source": "existing fixed-gain stereo PCM; no re-render",
            "pooling": "arithmetic mean of left/right one-sided linear ERB-band power at each time frame",
            "fftSize": 1024, "window": "symmetric Hann: 0.5 - 0.5*cos(2*pi*n/(N-1))",
            "hopSize": 256, "sampleRate": 48_000, "frameCount": 279,
            "frameTime": "left-aligned frame start, n*256/48000 seconds",
            "frequencyRangeHz": [0, 7968.75], "bands": 30,
            "erbRate": "E(f)=21.4*log10(1+0.00437*f)",
            "bandMapping": "equal ERB-rate edges on 0-8000 Hz; half-open [low, high); DC in band 0 and undoubled",
            "linearPower": "|rFFT|^2/sum(Hann)^2; double positive-frequency bins except DC; sum bins by band before dB",
            "nativeFixedGain": True, "perClipNormalization": False,
            "storedArray": "pooled left/right mean linear power, serialized Float32 for compact reproducibility",
            "shapeDiagnostic": "analysis-only; divide each response by its full 279x30 linear-power sum; no floor",
            "visualScaleDbfs": [-100, 0], "visualFloorLinearPower": POWER_FLOOR
        },
        "responses": [{"id": r["id"], "plateKey": r["plateKey"], "alias": r["alias"],
                       "positionLabel": r["positionLabel"],
                       "pooledErbPower": r["pooledErbPower"].astype(np.float32).tolist()} for r in records]
    }
    series_json = json.dumps(source_series, separators=(",", ":"), allow_nan=False).encode("utf8")
    series_bytes = gzip.compress(series_json, compresslevel=9, mtime=0)
    series_path.write_bytes(series_bytes)

    columns = ["set", "pairId", "a", "b", "plateA", "plateB", "positionA", "positionB",
               "fullErbTimeCosine", "integratedErbProfileCosine", "lateTailErbProfileCosine",
               "rmsDeltaDbBMinusA", "absRmsGapDb"]
    with pair_path.open("w", encoding="utf8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for row in pair_data["pairRows"]:
            writer.writerow({key: f"{row[key]:.12g}" if key in columns[8:] else row[key] for key in columns})

    grid_dimensions = render_position_grid(records, selected, data["aliases"], grid_path)
    matrix_dimensions = render_identity_summary(pair_data["fullMatrix"], pair_data["lateMatrix"],
                                                selected, data["aliases"], matrix_path)
    analysis = {
        "schemaVersion": 1,
        "question": "Does each natural Plate's pooled stereo ERB-time response remain more consistent across p25/p50/p75 than between different Plates at the same position label?",
        "decision": {
            "status": "MIXED",
            "rationale": "Within-Plate full ERB-time similarity is lower at the median than the same-position between-Plate control (0.480 vs 0.529), with only 47.2% within-over-between pairwise dominance and 0/36 same-Plate nearest neighbors. Time-integrated and late-tail profiles reverse direction (0.828 vs 0.722; 0.805 vs 0.713), while per-Plate grouping varies. This supports partial band-profile retention, not consistent full time-frequency identity across contact position.",
            "audibilityClaim": False
        },
        "sources": {
            "productionBaseline": data["renderManifest"]["baseline"],
            "frozenResearchCommit": data["renderManifest"]["research"],
            "renderManifest": "../2026-10-13-plate-sonic-individuality/render-manifest.json",
            "renderIndex": "test-results/ant-plate-sonic-individuality-20261013/render-index.json",
            "roster": "../2026-10-13-plate-sonic-individuality/descriptor-roster.json",
            "sourceResponses": 36,
            "newSimulationOrRender": False
        },
        "implementationFacts": [
            "Reanalyzed only the 36 existing native fixed-gain isolated PCM outputs: 12 frozen Plates at p25/p50/p75.",
            "Each source PCM path, byte count and SHA-256 matched the existing render manifest before analysis.",
            "Within each Plate, geometry topology, material and node count match across contact positions."
        ],
        "representation": {
            "fftSize": 1024, "window": "symmetric Hann", "hopSize": 256,
            "sampleRate": 48_000, "durationSeconds": 1.5, "frameCount": 279,
            "frequencyRangeHz": [0, 7968.75], "erbBands": 30,
            "erbRate": "E(f)=21.4*log10(1+0.00437*f)",
            "boundariesHz": data["edgeHz"].tolist(), "centersHz": data["centersHz"].tolist(),
            "binBoundaryRule": "half-open [low, high); frequency-bin centers mapped to equal ERB-rate bands; DC included in first band",
            "dcTreatment": "DC one-sided linear power is undoubled; positive-frequency bins are doubled",
            "stereoPooling": "mean left/right linear ERB-band power per frame before all profile and shape calculations",
            "native": {"level": "fixed gain 1", "perClipNormalization": False,
                       "linearPower": "|rFFT|^2/sum(Hann)^2; double positive-frequency bins except DC; sum linear bin power before dB",
                       "dBPowerFloor": POWER_FLOOR, "displayDbfs": [-100, 0]},
            "shapeOnlyDiagnostic": {
                "normalization": "divide pooled nonnegative linear ERB-time power by its total across 279 frames x 30 bands; unit-sum per response",
                "primaryMetric": "cosine similarity on flattened unit-sum full ERB-time distributions; bounded [0,1]",
                "floor": "none; no dB conversion or floor before normalization/similarity",
                "note": "Cosine is scale invariant; unit-sum normalization makes the shape-only intent explicit and remains separate from native level metrics."
            },
            "integratedProfile": "sum pooled linear ERB power across all 279 frames; unit-sum each 30-band profile; cosine similarity",
            "lateTailProfile": "sum pooled linear ERB power at left-aligned frame start >= 0.5 s (185 frames, 501.333... ms through 1.482666... s); unit-sum each 30-band profile; cosine similarity",
            "pairDefinitions": {"within": "36 same-Plate p25-p50, p25-p75, p50-p75 pairs",
                                "between": "198 different-Plate pairs within the same p25, p50 or p75 label"}
        },
        "floorDiagnostics": {
            "perResponse": [{"id": r["id"], "exactZeroCells": r["exactZeroCells"],
                             "exactZeroCellFraction": r["exactZeroCellFraction"],
                             "subFloorPowerMassFraction": r["subFloorPowerMassFraction"],
                             "minPositiveErbPower": r["minPositiveErbPower"]} for r in records],
            "metricUse": "Full/integrated/late shape similarities use unfloored linear power; fixed-scale native display alone uses the existing 1e-30 dB floor."
        },
        "fixedGainResponseLevels": {"rmsDbfs": summarize([r["rmsDbfs"] for r in records]),
                                     "rmsLinear": summarize([r["rms"] for r in records]),
                                     "peak": summarize([r["peak"] for r in records]),
                                     "identityMetricUse": "reported separately; RMS/peak are not included in ERB shape cosine"},
        "pairCounts": {"withinPlateCrossPosition": len(pair_data["within"]),
                       "betweenPlateSamePosition": len(pair_data["between"]),
                       "withinByPositionPair": {key: value["fullErbTimeCosine"]["count"]
                                                for key, value in pair_data["withinPositionPairs"].items()},
                       "betweenByPosition": {key: value["fullErbTimeCosine"]["count"]
                                             for key, value in pair_data["betweenSamePosition"].items()}},
        "primaryComparison": pair_data["comparison"],
        "withinByPositionPair": pair_data["withinPositionPairs"],
        "betweenBySamePosition": pair_data["betweenSamePosition"],
        "perPlateWithin": pair_data["perPlate"],
        "nativeRmsPairGapDb": {"within": summarize([r["absRmsGapDb"] for r in pair_data["within"]]),
                               "between": summarize([r["absRmsGapDb"] for r in pair_data["between"]])},
        "descriptiveNearestNeighbor": pair_data["retrieval"],
        "matrixOrder": pair_data["matrixOrder"],
        "similarityMatrices": {"fullErbTimeCosine": pair_data["fullMatrix"],
                               "lateTailErbProfileCosine": pair_data["lateMatrix"]},
        "artifacts": {"pairwiseCsv": "pairwise-comparisons.csv", "pooledErbSeries": "erb-time-series.json.gz",
                      "positionGrid": "plate-erb-position-grid.png", "identitySummary": "plate-erb-identity-summary.png"},
        "limits": [
            "This is a descriptive comparison within a selected frozen 12-Plate set; nearest-neighbor counts are not classification performance or generalization.",
            "The comparison tests measured auditory-band structure, not human identification, audibility, preference or production sonic quality.",
            "Same-position between-Plate contacts share a path-position label, not identical spatial coordinates or modal projection.",
            "ERB-binned STFT reorganizes fixed-gain STFT power; it is not a gammatone filterbank or cochleogram."
        ]
    }
    report_path.write_bytes((json.dumps(analysis, indent=2, allow_nan=False) + "\n").encode("utf8"))

    check = LOSS_ANALYSIS.self_check()
    identical = cosine(records[0]["fullShape"], records[0]["fullShape"])
    scaled = cosine(records[0]["fullShape"], unit_sum(records[0]["pooledErbPower"] * 7.0, "scaled self-check"))
    if identical != 1.0 or abs(scaled - 1.0) > 1e-12:
        raise ValueError("Identical or gain-scaled shape self-check failed")
    validation = {
        "passed": True,
        "productionBaseline": data["renderManifest"]["baseline"],
        "sourceVerification": {"expectedRoster": 12, "positions": list(POSITIONS),
                               "verifiedPcmCount": len(data["sourceReceipts"]),
                               "verifiedBytes": sum(item["bytes"] for item in data["sourceReceipts"]),
                               "allManifestPathSizeSha256Matched": True,
                               "receipts": data["sourceReceipts"]},
        "samePlateGeometryMaterial": {"allThreePositionsMatch": True,
                                      "topologySha256ByPlate": data["expectedTopology"]},
        "erbContract": {"matchesLossDistributionHelper": True, "helperSelfCheck": check,
                        "boundariesMonotonicFinite": bool(np.isfinite(data["edgeHz"]).all()
                                                           and np.all(np.diff(data["edgeHz"]) > 0)),
                        "frameCount": 279, "frequencyBinsThrough8kCenter": len(data["frequencies"]),
                        "erbBands": len(data["centersHz"])},
        "shapeSelfCheck": {"identicalRepresentationCosine": identical,
                           "positiveScalarRescaleCosine": scaled,
                           "allResponseMassesPositiveFinite": all(math.isfinite(r["erbTimePowerMass"]) and r["erbTimePowerMass"] > 0 for r in records),
                           "noFloorAppliedToIdentityMetrics": True},
        "pairCounts": {"withinPlateCrossPosition": len(pair_data["within"]),
                       "betweenPlateSamePosition": len(pair_data["between"])},
        "visuals": {"positionGrid": grid_dimensions, "identitySummary": matrix_dimensions,
                    "positionGridDeterministicPillowPng": True, "identitySummaryDeterministicPillowPng": True},
        "noNewSimulationOrRender": True
    }
    validation_path.write_bytes((json.dumps(validation, indent=2, allow_nan=False) + "\n").encode("utf8"))

    source_paths = [data["renderManifestPath"], data["indexPath"], data["rosterPath"], data["summaryPath"],
                    data["lossAnalysisPath"], ROOT / "scripts/ant-base-born-loss-analysis.py",
                    Path(__file__)]
    outputs = [report_path, pair_path, series_path, validation_path, grid_path, matrix_path]
    readme = OUT / "README.md"
    if readme.exists():
        outputs.append(readme)
    artifact_manifest = [{"path": str(path.relative_to(OUT)), "bytes": path.stat().st_size,
                          "sha256": sha256(path.read_bytes())} for path in outputs]
    tool_manifest = {
        "python": sys.version.split()[0], "numpy": np.__version__, "Pillow": PILLOW_VERSION,
        "ERBHelper": "scripts/ant-base-born-loss-analysis.py"
    }
    report_manifest = {
        "schemaVersion": 1,
        "command": "python scripts/ant-plate-erb-position-identity.py",
        "sourceManifest": {"path": str(data["renderManifestPath"].relative_to(ROOT)),
                           "sha256": sha256(data["renderManifestPath"].read_bytes()),
                           "renderIndexSha256": sha256(data["indexPath"].read_bytes()),
                           "descriptorRosterSha256": sha256(data["rosterPath"].read_bytes()),
                           "measurementSummarySha256": sha256(data["summaryPath"].read_bytes()),
                           "priorLossAnalysisSha256": sha256(data["lossAnalysisPath"].read_bytes())},
        "sourceToolHashes": {str(path.relative_to(ROOT)): sha256(path.read_bytes()) for path in source_paths[5:]},
        "toolVersions": tool_manifest,
        "visuals": {"format": "Pillow PNG", "positionGrid": grid_dimensions,
                    "identitySummary": matrix_dimensions,
                    "sameAnalysisAndSeriesInputs": True},
        "artifacts": artifact_manifest
    }
    (OUT / "report-manifest.json").write_bytes((json.dumps(report_manifest, indent=2) + "\n").encode("utf8"))
    print(json.dumps({"sourceResponses": len(records), "withinPairs": len(pair_data["within"]),
                      "betweenPairs": len(pair_data["between"]),
                      "full": pair_data["comparison"]["fullErbTimeCosine"],
                      "integrated": pair_data["comparison"]["integratedErbProfileCosine"],
                      "late": pair_data["comparison"]["lateTailErbProfileCosine"],
                      "nearestSamePlate": pair_data["retrieval"]["samePlateOtherPositionNearestCount"],
                      "outputs": artifact_manifest}, indent=2))


def self_check():
    result = LOSS_ANALYSIS.self_check()
    sample = np.asarray([1.0, 0.0, 2.0, 0.0])
    same = cosine(unit_sum(sample, "same-input"), unit_sum(sample, "same-input copy"))
    scaled = cosine(unit_sum(sample, "scaled-input"), unit_sum(sample * 3.0, "scaled-input copy"))
    assert same == 1.0 and abs(scaled - 1.0) < 1e-12
    return {"passed": True, "lossDistributionErbSelfCheck": result,
            "identicalShapeCosine": same, "positiveScalarRescaleCosine": scaled}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        print(json.dumps(self_check(), indent=2))
        return
    data = load_inputs()
    pair_data = make_pairs(data["records"], data["roster"]["selectedKeys"])
    write_outputs(data, pair_data)


if __name__ == "__main__":
    main()
