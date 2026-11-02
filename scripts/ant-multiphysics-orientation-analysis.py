#!/usr/bin/env python3
"""Deterministic descriptive analysis for the locked ANT orientation capture."""

from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "docs/ant/evidence/2026-11-02-multiphysics-first-pass/orientation"
GRIDS = (24, 48)
WINDOWS = (5, 20)
SUPPORTS = (1, 3, 5)
ATLAS_TIMES = (60, 120, 180, 240, 300)
EPSILON = 1e-12
NEIGHBOR_QUANTILES = (0.0, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0)
NEIGHBOR_HISTOGRAM_BINS = 12
SEGMENT_LENGTH_QUANTILES = (0.0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=EVIDENCE)
    parser.add_argument("--output", type=Path, default=EVIDENCE)
    parser.add_argument("--selfcheck", action="store_true")
    parser.add_argument("--repair-capture-format", action="store_true")
    parser.add_argument("--finalize-capture-format", action="store_true")
    args = parser.parse_args()
    if args.selfcheck:
        selfcheck()
        print(json.dumps({"selfcheck": "passed"}))
        return

    args.output.mkdir(parents=True, exist_ok=True)
    run = json.loads((args.input / "RUN.json").read_text(encoding="utf-8"))
    reference = json.loads((args.input / "REFERENCE.json").read_text(encoding="utf-8"))
    if run.get("status") != "PASS" or not all((
        reference["contacts"]["match"], reference["topologyStates"]["match"],
        reference["plateBirths"]["match"], reference["noduleBirths"]["match"],
    )):
        raise SystemExit("Natural analysis refused: source, parity, or pinned-history conformance did not pass.")
    if args.repair_capture_format:
        if args.output.resolve() != args.input.resolve():
            raise SystemExit("Format repair requires --output to equal --input so the child manifest stays local.")
        receipt = repair_capture_format(args.input, run)
        (args.output / "REPAIR.json").write_text(
            canonical_json(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
        write_manifest(args.output)
        print(json.dumps(receipt, ensure_ascii=False))
        return
    if args.finalize_capture_format:
        if args.output.resolve() != args.input.resolve():
            raise SystemExit("Format finalization requires --output to equal --input so the child manifest stays local.")
        receipt = finalize_capture_format(args.input)
        print(json.dumps(receipt, ensure_ascii=False))
        return
    for name, expected_sha in run.get("outputHashes", {}).items():
        path = args.input / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha:
            raise SystemExit(f"Canonical capture artifact hash mismatch: {path}")

    materials = load_materials(args.input / "MATERIALS.json.gz")
    segments, zero_count = read_segments(args.input / "TRAJECTORY.ndjson.gz", materials, run["ticksCompleted"])
    if not segments:
        raise SystemExit("No nonzero realized segments were recorded.")
    summary, atlas_fields = analyze_segments(segments, zero_count, run, reference, materials, args.output)
    (args.output / "SUMMARY.json").write_text(canonical_json(summary, indent=2) + "\n", encoding="utf-8", newline="\n")
    (args.output / "ATLAS.svg").write_text(render_atlas(atlas_fields), encoding="utf-8", newline="\n")
    write_manifest(args.output)
    print(json.dumps({"segments": summary["capture"]["nonzeroSegments"],
        "zeroLengthSegments": zero_count, "settings": len(summary["settings"]),
        "output": str(args.output)}, ensure_ascii=False))


def read_segments(path: Path, materials: dict[int, np.ndarray], ticks: int) -> tuple[dict[str, np.ndarray], int]:
    rows: dict[str, list] = {key: [] for key in ("tick", "time", "x", "y", "ux", "uy", "length", "revision")}
    zero_count = 0
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for expected_tick, line in enumerate(stream, start=1):
            row = json.loads(line)
            tick = row["tick"]
            if tick != expected_tick or tick > ticks:
                raise ValueError(f"trajectory tick order error at {expected_tick}")
            time_seconds = (tick - 0.5) / 60
            if abs(row["timeSeconds"] - time_seconds) > 1e-12:
                raise ValueError(f"trajectory timestamp mismatch at tick {tick}")
            revision = row["materialRevision"]
            if revision not in materials:
                raise ValueError(f"material revision {revision} missing at tick {tick}")
            for segment in row["segments"]:
                x0, y0 = segment["from"]
                x1, y1 = segment["to"]
                dx, dy = x1 - x0, y1 - y0
                length = math.hypot(dx, dy)
                if length == 0:
                    zero_count += 1
                    continue
                midpoint_x, midpoint_y = (x0 + x1) * 0.5, (y0 + y1) * 0.5
                if not all(-1e-12 <= value <= 1 + 1e-12 for value in (x0, y0, x1, y1)):
                    raise ValueError(f"out-of-domain surviving segment at tick {tick}")
                rows["tick"].append(tick)
                rows["time"].append(time_seconds)
                rows["x"].append(midpoint_x)
                rows["y"].append(midpoint_y)
                rows["ux"].append(dx / length)
                rows["uy"].append(dy / length)
                rows["length"].append(length)
                rows["revision"].append(revision)
    if expected_tick != ticks:
        raise ValueError(f"trajectory has {expected_tick} ticks; expected {ticks}")
    return {key: np.asarray(value, dtype=np.float64 if key != "revision" and key != "tick" else np.int32)
            for key, value in rows.items()}, zero_count


def load_materials(path: Path) -> dict[int, np.ndarray]:
    raw = json.loads(gzip.decompress(path.read_bytes()))
    width, height = raw["width"], raw["height"]
    output = {}
    for revision in raw["revisions"]:
        values = np.frombuffer(base64.b64decode(revision["unionBase64"]), dtype=np.uint8)
        if values.size != width * height:
            raise ValueError(f"material union size mismatch at revision {revision['revision']}")
        output[revision["revision"]] = values.reshape(height, width).astype(np.float64)
    return output


def iter_json_sequence(stream):
    """Read concatenated JSON values, including records formatted across lines."""
    decoder = json.JSONDecoder()
    buffer = ""
    while True:
        chunk = stream.read(65536)
        if not chunk:
            break
        buffer += chunk
        cursor = 0
        while True:
            while cursor < len(buffer) and buffer[cursor].isspace():
                cursor += 1
            if cursor >= len(buffer):
                break
            try:
                value, end = decoder.raw_decode(buffer, cursor)
            except json.JSONDecodeError:
                break
            yield value
            cursor = end
        buffer = buffer[cursor:]

    cursor = 0
    while cursor < len(buffer):
        while cursor < len(buffer) and buffer[cursor].isspace():
            cursor += 1
        if cursor >= len(buffer):
            break
        value, cursor = decoder.raw_decode(buffer, cursor)
        yield value


def repair_capture_format(folder: Path, run: dict) -> dict:
    """Preserve and normalize the two saved JSON-sequence files to actual NDJSON."""
    files = ("TRAJECTORY.ndjson.gz", "STATE-DIGESTS.jsonl.gz")
    expected_counts = {"TRAJECTORY.ndjson.gz": run["ticksCompleted"],
                       "STATE-DIGESTS.jsonl.gz": run["ticksCompleted"] + 1}
    repaired = []
    for name in files:
        source = folder / name
        archive = folder / name.replace(".ndjson.gz", ".raw-json-sequence.gz").replace(
            ".jsonl.gz", ".raw-json-sequence.gz")
        temporary = folder / f"{name}.normalizing"
        if not source.is_file() or archive.exists() or temporary.exists():
            raise FileExistsError(f"refusing ambiguous format repair for {source}")
        source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
        if source_sha != run["outputHashes"][name]:
            raise ValueError(f"original compressed hash mismatch for {source}")
        rows = 0
        semantic_hasher = hashlib.sha256()
        semantic_hasher.update(b"[")
        with gzip.open(source, "rt", encoding="utf-8", newline="") as stream:
            with temporary.open("wb") as raw_file:
                with gzip.GzipFile(filename="", fileobj=raw_file, mode="wb", compresslevel=9, mtime=0) as output:
                    for value in iter_json_sequence(stream):
                        if name == "TRAJECTORY.ndjson.gz":
                            expected_tick = rows + 1
                            if value.get("tick") != expected_tick:
                                raise ValueError(f"trajectory tick order mismatch: {value.get('tick')} != {expected_tick}")
                        else:
                            expected_tick = rows
                            if value.get("tick") != expected_tick:
                                raise ValueError(f"state-digest tick order mismatch: {value.get('tick')} != {expected_tick}")
                            if value.get("observed") != value.get("plain"):
                                raise ValueError(f"observer/plain state digest mismatch at tick {expected_tick}")
                        if rows:
                            semantic_hasher.update(b",")
                        semantic_hasher.update(canonical_json(value).encode("utf-8"))
                        output.write((canonical_json(value) + "\n").encode("utf-8"))
                        rows += 1
        semantic_hasher.update(b"]")
        if rows != expected_counts[name]:
            temporary.unlink(missing_ok=True)
            raise ValueError(f"format repair found {rows} records in {source}; expected {expected_counts[name]}")
        semantic_sha = semantic_hasher.hexdigest()
        if name == "STATE-DIGESTS.jsonl.gz":
            if not run["peerParity"]["equalEveryTick"] or run["peerParity"]["mismatch"] is not None:
                temporary.unlink(missing_ok=True)
                raise ValueError("RUN.json does not attest every-tick observer/plain parity")
            if semantic_sha != run["peerParity"]["digestStreamSha256"]:
                temporary.unlink(missing_ok=True)
                raise ValueError("parsed digest array hash does not match RUN.json peerParity digest")
        normalized_rows, normalized_semantic_sha = semantic_array_hash(temporary)
        if normalized_rows != rows or normalized_semantic_sha != semantic_sha:
            temporary.unlink(missing_ok=True)
            raise ValueError(f"semantic round-trip mismatch while normalizing {source}")
        normalized_sha = hashlib.sha256(temporary.read_bytes()).hexdigest()
        source.replace(archive)
        temporary.replace(source)
        repaired.append({"sourceArchive": archive.name, "sourceSha256": source_sha,
                         "normalizedFile": name, "normalizedSha256": normalized_sha,
                         "recordCount": rows, "semanticArraySha256": semantic_sha,
                         "roundTripSemanticArraySha256": normalized_semantic_sha,
                         "semanticRoundTripMatch": semantic_sha == normalized_semantic_sha,
                         "runDigestStreamSha256": run["peerParity"]["digestStreamSha256"]
                         if name == "STATE-DIGESTS.jsonl.gz" else None})
    return {"schema": "ant-multiphysics-orientation-format-repair-v1",
            "reason": "Array.map passed its row index as JSON indentation, making later records pretty-printed JSON sequence values rather than one-line NDJSON.",
            "method": "parse each concatenated JSON value, preserve the original compressed bytes under a new name, and rewrite canonical sorted-key one-record-per-line gzip with mtime zero",
            "noTrajectoryReconstruction": True,
            "files": repaired}


def semantic_array_hash(path: Path) -> tuple[int, str]:
    hasher = hashlib.sha256()
    hasher.update(b"[")
    count = 0
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        for value in iter_json_sequence(stream):
            if count:
                hasher.update(b",")
            hasher.update(canonical_json(value).encode("utf-8"))
            count += 1
    hasher.update(b"]")
    return count, hasher.hexdigest()


def finalize_capture_format(folder: Path) -> dict:
    """Preserve the original run receipt and point RUN.outputHashes at current canonical files."""
    run_path = folder / "RUN.json"
    pre_repair_path = folder / "RUN.pre-repair.json"
    receipt_path = folder / "REPAIR.json"
    if not run_path.is_file() or not receipt_path.is_file():
        raise FileNotFoundError("RUN.json or REPAIR.json is missing")
    if not pre_repair_path.exists():
        pre_repair_path.write_bytes(run_path.read_bytes())
    original_run = json.loads(pre_repair_path.read_text(encoding="utf-8"))
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    current_run = json.loads(run_path.read_text(encoding="utf-8"))
    if receipt.get("schema") != "ant-multiphysics-orientation-format-repair-v1":
        raise ValueError("unexpected REPAIR.json schema")

    canonical_hashes = {}
    for item in receipt["files"]:
        source_name, canonical_name = item["sourceArchive"], item["normalizedFile"]
        source_path, canonical_path = folder / source_name, folder / canonical_name
        if hashlib.sha256(source_path.read_bytes()).hexdigest() != item["sourceSha256"]:
            raise ValueError(f"preserved source archive hash mismatch: {source_path}")
        if original_run["outputHashes"].get(canonical_name) != item["sourceSha256"]:
            raise ValueError(f"pre-repair RUN hash does not match preserved source {source_path}")
        canonical_sha = hashlib.sha256(canonical_path.read_bytes()).hexdigest()
        if canonical_sha != item["normalizedSha256"]:
            raise ValueError(f"canonical file hash mismatch: {canonical_path}")
        if not item.get("semanticRoundTripMatch"):
            raise ValueError(f"semantic repair equality was not established for {canonical_name}")
        canonical_hashes[canonical_name] = canonical_sha

    receipt["originalRunReceipt"] = pre_repair_path.name
    receipt["canonicalOutputHashes"] = canonical_hashes
    receipt["conformanceUnchanged"] = True
    receipt["note"] = "RUN.pre-repair.json and the preserved raw JSON-sequence archives retain original capture hashes. RUN.json outputHashes now refer to the canonical files at their current names. Normalization parsed and re-emitted JSON values only; no positions, states, or simulation steps were reconstructed."
    current_run["outputHashes"].update(canonical_hashes)
    current_run["captureFormatRepair"] = {
        "receipt": receipt_path.name,
        "originalRunReceipt": pre_repair_path.name,
        "canonicalFiles": sorted(canonical_hashes),
        "semanticValuesPreserved": True,
        "conformanceUnchanged": True,
    }
    receipt_path.write_text(canonical_json(receipt, indent=2) + "\n", encoding="utf-8", newline="\n")
    run_path.write_text(canonical_json(current_run, indent=2) + "\n", encoding="utf-8", newline="\n")
    write_manifest(folder)
    return {"originalRunReceipt": pre_repair_path.name, "currentRunReceipt": run_path.name,
            "captureFormatRepairReceipt": receipt_path.name, "canonicalOutputHashes": canonical_hashes,
            "manifestSha256": hashlib.sha256((folder / "MANIFEST.sha256").read_bytes()).hexdigest()}


def analyze_segments(segments: dict[str, np.ndarray], zero_count: int, run: dict,
                     reference: dict, materials: dict[int, np.ndarray], output: Path) -> tuple[dict, dict]:
    times, x, y = segments["time"], segments["x"], segments["y"]
    ux, uy, length = segments["ux"], segments["uy"], segments["length"]
    second = np.floor(times).astype(np.int32)
    if np.any((second < 0) | (second >= run["seconds"])):
        raise ValueError("segment midpoint fell outside the registered 0–300 s bins")
    boundary = boundary_summary(x, y, ux, uy)
    plate = plate_summary(segments, materials)

    summary = {
        "schema": "ant-multiphysics-orientation-analysis-v1",
        "authority": {"main": run["mainAuthority"], "production": run["productionAuthority"],
                      "referenceCaptureSha256": reference["sha256"]},
        "capture": {"seed": run["seed"], "seconds": run["seconds"], "ticks": run["ticksCompleted"],
                    "nonzeroSegments": int(len(times)), "zeroLengthSegments": int(zero_count),
                    "retiringExitStepsExcludedBySource": True,
                    "supplementaryDisplacementQuantiles": {
                        "units": "normalized-domain distance per 1/60-second completed segment",
                        "probabilities": list(SEGMENT_LENGTH_QUANTILES),
                        "values": {f"q{probability:g}": float(value)
                                   for probability, value in zip(SEGMENT_LENGTH_QUANTILES,
                                       np.quantile(length, SEGMENT_LENGTH_QUANTILES))},
                        "role": "descriptive stability check only; no displacement is filtered"}},
        "definitions": {"midpointTime": "(tick-0.5)/60; tick is 1-based",
                        "window": "half-open [end-W,end), integer-second endpoints",
                        "N": "count of exact-nonzero realized post-collision segments",
                        "orderZeroTolerance": EPSILON,
                        "winding": "grid loop TL,TR,BR,BL; +x right, +y down; branch interval [-pi,pi)",
                        "neighborMismatch": "undirected horizontal and vertical interior-cell pairs; angular mismatch is acos(clamp(Re(z1*conj(z2))/(|z1||z2|),-1,1)); Q director mismatch is half the complex phase difference; supported cells require N>=support and |z|>1e-12; no segmentation or defect threshold"},
        "boundary": boundary,
        "plateRelation": plate,
        "globalByWindow": [],
        "settings": [],
    }
    atlas_fields = {}
    with (output / "LOCAL-FIELDS.ndjson.gz").open("wb") as raw_file:
        with gzip.GzipFile(filename="", fileobj=raw_file, mode="wb", compresslevel=9, mtime=0) as field_stream:
            for grid in GRIDS:
                cell_x = np.minimum((x * grid).astype(np.int32), grid - 1)
                cell_y = np.minimum((y * grid).astype(np.int32), grid - 1)
                cell = cell_y * grid + cell_x
                flat = second * grid * grid + cell
                size = run["seconds"] * grid * grid
                counts = np.bincount(flat, minlength=size).reshape(run["seconds"], grid, grid).astype(np.int64)
                sum_ux = np.bincount(flat, weights=ux, minlength=size).reshape(run["seconds"], grid, grid)
                sum_uy = np.bincount(flat, weights=uy, minlength=size).reshape(run["seconds"], grid, grid)
                sum_qx = np.bincount(flat, weights=ux * ux - uy * uy, minlength=size).reshape(run["seconds"], grid, grid)
                sum_qy = np.bincount(flat, weights=2 * ux * uy, minlength=size).reshape(run["seconds"], grid, grid)
                prefix = [np.concatenate((np.zeros((1, grid, grid), dtype=np.float64), np.cumsum(array, axis=0)), axis=0)
                          for array in (counts, sum_ux, sum_uy, sum_qx, sum_qy)]
                for window in WINDOWS:
                    field_series: dict[int, tuple[np.ndarray, np.ndarray, np.ndarray]] = {}
                    setting = {"grid": grid, "windowSeconds": window, "endpoints": [], "persistence": []}
                    global_rows = []
                    for end in range(window, run["seconds"] + 1):
                        start_second, end_exclusive = window_bounds(end, window)
                        n = (prefix[0][end_exclusive] - prefix[0][start_second]).astype(np.uint32)
                        sx = prefix[1][end_exclusive] - prefix[1][start_second]
                        sy = prefix[2][end_exclusive] - prefix[2][start_second]
                        qx = prefix[3][end_exclusive] - prefix[3][start_second]
                        qy = prefix[4][end_exclusive] - prefix[4][start_second]
                        denom = np.maximum(n, 1)
                        px, py, qx, qy = sx / denom, sy / denom, qx / denom, qy / denom
                        p = px + 1j * py
                        q = qx + 1j * qy
                        p[n == 0] = 0
                        q[n == 0] = 0
                        field_series[end] = (n, p, q)
                        record = local_field_record(grid, window, end, n, p, q)
                        field_stream.write((json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"))
                        if end in ATLAS_TIMES:
                            atlas_fields[(grid, window, end)] = (n.copy(), p.copy(), q.copy())
                        setting["endpoints"].append(endpoint_summary(end, n, p, q))
                        total_n = int(np.sum(n))
                        if total_n:
                            global_p = complex(np.sum(sx) / total_n, np.sum(sy) / total_n)
                            global_q = complex(np.sum(prefix[3][end_exclusive] - prefix[3][start_second]) / total_n,
                                               np.sum(prefix[4][end_exclusive] - prefix[4][start_second]) / total_n)
                            global_rows.append({"endSeconds": end, "segments": total_n,
                                "polarStrength": float(abs(global_p)), "polarAngleRad": float(np.angle(global_p)) if abs(global_p) > EPSILON else None,
                                "nematicStrength": float(abs(global_q)), "directorAngleRad": float(0.5 * np.angle(global_q)) if abs(global_q) > EPSILON else None})
                        else:
                            global_rows.append({"endSeconds": end, "segments": 0, "polarStrength": None,
                                "polarAngleRad": None, "nematicStrength": None, "directorAngleRad": None})

                    for support in SUPPORTS:
                        for end in setting["endpoints"]:
                            end_support = end["support"][str(support)]
                            end_n, end_p, end_q = field_series[end["endSeconds"]]
                            end_support["polarNeighborMismatch"] = neighbor_mismatch_summary(end_p, end_n, support, "P")
                            end_support["nematicDirectorNeighborMismatch"] = neighbor_mismatch_summary(end_q, end_n, support, "Q")
                        for lag in dict.fromkeys((window, 2 * window, 60)):
                            setting["persistence"].append({"supportN": support, "lagSeconds": lag,
                                "polar": persistence(field_series, support, lag, "P", run["seconds"]),
                                "nematic": persistence(field_series, support, lag, "Q", run["seconds"])})
                    summary["settings"].append(setting)
                    if grid == GRIDS[0]:
                        summary["globalByWindow"].append({"windowSeconds": window, "endpoints": global_rows})
    return summary, atlas_fields


def endpoint_summary(end: int, counts: np.ndarray, p: np.ndarray, q: np.ndarray) -> dict:
    row = {"endSeconds": end, "segments": int(np.sum(counts)), "support": {}}
    for support in SUPPORTS:
        supported = counts >= support
        pvalid = supported & (np.abs(p) > EPSILON)
        qvalid = supported & (np.abs(q) > EPSILON)
        row["support"][str(support)] = {
            "cells": int(np.count_nonzero(supported)),
            "polarValidCells": int(np.count_nonzero(pvalid)),
            "nematicValidCells": int(np.count_nonzero(qvalid)),
            "meanPolarStrength": finite_mean(np.abs(p[supported])),
            "meanNematicStrength": finite_mean(np.abs(q[supported])),
            "polarWinding": winding_summary(p, counts, support, "P"),
            "nematicDirectorCharge": winding_summary(q, counts, support, "Q"),
        }
    return row


def winding_summary(field: np.ndarray, counts: np.ndarray, support: int, kind: str) -> dict:
    valid = []
    magnitudes = np.abs(field)
    for vertices in interior_elementary_loops(counts.shape[0]):
        if any(counts[row, col] < support or magnitudes[row, col] <= EPSILON for row, col in vertices):
            continue
        value = winding_charge([field[row, col] for row, col in vertices], kind)
        valid.append(value)
    histogram = {}
    for value in valid:
        key = f"{value:.10f}".rstrip("0").rstrip(".")
        if key in ("", "-0"):
            key = "0"
        histogram[key] = histogram.get(key, 0) + 1
    nonzero = sum(count for key, count in histogram.items() if key != "0")
    return {"validInteriorLoops": len(valid), "nonzeroChargeLoops": nonzero,
            "chargeHistogram": dict(sorted(histogram.items(), key=lambda item: float(item[0])))}


def winding_charge(values, kind: str) -> float:
    phases = np.angle(np.asarray(values, dtype=np.complex128))
    phase_changes = [wrap_pi(phases[(i + 1) % len(phases)] - phases[i]) for i in range(len(phases))]
    divisor = 2 * math.pi if kind == "P" else 4 * math.pi
    return float(sum(phase_changes) / divisor)


def wrap_pi(value: float) -> float:
    return (value + math.pi) % (2 * math.pi) - math.pi


def window_bounds(end: int, window: int) -> tuple[int, int]:
    """Return the exact per-second prefix slice for [end-window, end)."""
    if window <= 0 or end < window:
        raise ValueError("window must be positive and end must be at least its width")
    return end - window, end


def interior_elementary_loops(grid: int):
    """Enumerate four-neighbor loops whose vertices avoid the outer cell ring."""
    if grid < 4:
        return
    for y in range(grid - 1):
        for x in range(grid - 1):
            vertices = ((y, x), (y, x + 1), (y + 1, x + 1), (y + 1, x))
            if all(0 < row < grid - 1 and 0 < col < grid - 1 for row, col in vertices):
                yield vertices


def neighbor_mismatch_summary(field: np.ndarray, counts: np.ndarray, support: int, kind: str) -> dict:
    """Summarize all supported undirected interior-cell pairs without domain segmentation."""
    if field.shape != counts.shape or field.ndim != 2 or field.shape[0] != field.shape[1]:
        raise ValueError("neighbor fields and support counts must be same-size square arrays")
    grid = field.shape[0]
    if grid < 3:
        return empty_neighbor_summary(kind)

    magnitude = np.abs(field)
    supported = (counts >= support) & (magnitude > EPSILON)
    interior = np.zeros_like(supported)
    interior[1:-1, 1:-1] = True
    valid = supported & interior
    pair_values = []
    pair_counts = []
    for first, second in (
        ((slice(1, -1), slice(1, -2)), (slice(1, -1), slice(2, -1))),
        ((slice(1, -2), slice(1, -1)), (slice(2, -1), slice(1, -1))),
    ):
        pair_mask = valid[first] & valid[second]
        if not np.any(pair_mask):
            continue
        z1, z2 = field[first][pair_mask], field[second][pair_mask]
        m1, m2 = magnitude[first][pair_mask], magnitude[second][pair_mask]
        cosine = np.real(z1 * np.conj(z2)) / (m1 * m2)
        angle = np.arccos(np.clip(cosine, -1.0, 1.0))
        if kind == "Q":
            angle *= 0.5
        pair_values.append(angle)
        pair_counts.append(np.sqrt(counts[first][pair_mask].astype(np.float64)
                                   * counts[second][pair_mask].astype(np.float64)))

    if not pair_values:
        return empty_neighbor_summary(kind)
    values = np.concatenate(pair_values)
    geometric_support = np.concatenate(pair_counts)
    maximum = math.pi if kind == "P" else math.pi / 2
    edges = np.linspace(0.0, maximum, NEIGHBOR_HISTOGRAM_BINS + 1)
    histogram, _ = np.histogram(values, bins=edges)
    correlation = None
    if len(values) > 1 and np.std(values) > 0 and np.std(geometric_support) > 0:
        correlation = float(np.corrcoef(values, geometric_support)[0, 1])
    quantile_values = np.quantile(values, NEIGHBOR_QUANTILES)
    return {
        "validAdjacentInteriorPairs": int(len(values)),
        "mismatchRangeRadians": [0.0, maximum],
        "meanRadians": float(np.mean(values)),
        "quantilesRadians": {f"q{probability:g}": float(value)
                             for probability, value in zip(NEIGHBOR_QUANTILES, quantile_values)},
        "fixedHistogram": [{"rangeRadians": [float(edges[index]), float(edges[index + 1])],
                            "pairs": int(histogram[index])}
                           for index in range(NEIGHBOR_HISTOGRAM_BINS)],
        "pearsonMismatchVsGeometricMeanN": correlation,
    }


def empty_neighbor_summary(kind: str) -> dict:
    maximum = math.pi if kind == "P" else math.pi / 2
    edges = np.linspace(0.0, maximum, NEIGHBOR_HISTOGRAM_BINS + 1)
    return {
        "validAdjacentInteriorPairs": 0,
        "mismatchRangeRadians": [0.0, maximum],
        "meanRadians": None,
        "quantilesRadians": {f"q{probability:g}": None for probability in NEIGHBOR_QUANTILES},
        "fixedHistogram": [{"rangeRadians": [float(edges[index]), float(edges[index + 1])], "pairs": 0}
                           for index in range(NEIGHBOR_HISTOGRAM_BINS)],
        "pearsonMismatchVsGeometricMeanN": None,
    }


def persistence(field_series: dict[int, tuple[np.ndarray, np.ndarray, np.ndarray]],
                support: int, lag: int, kind: str, max_time: int) -> dict:
    numerator = 0.0
    weight_sum = 0.0
    matched = 0
    endpoint_pairs = 0
    series_index = 1 if kind == "P" else 2
    for end in range(min(field_series), max_time - lag + 1):
        next_end = end + lag
        if next_end not in field_series:
            continue
        count_a, p_a, q_a = field_series[end]
        count_b, p_b, q_b = field_series[next_end]
        z_a, z_b = (p_a, p_b) if series_index == 1 else (q_a, q_b)
        magnitude_a, magnitude_b = np.abs(z_a), np.abs(z_b)
        valid = (count_a >= support) & (count_b >= support) & (magnitude_a > EPSILON) & (magnitude_b > EPSILON)
        if not np.any(valid):
            continue
        weights = np.minimum(count_a[valid], count_b[valid]).astype(np.float64)
        correlations = np.real(z_a[valid] * np.conj(z_b[valid])) / (magnitude_a[valid] * magnitude_b[valid])
        numerator += float(np.sum(weights * correlations))
        weight_sum += float(np.sum(weights))
        matched += int(np.count_nonzero(valid))
        endpoint_pairs += 1
    return {"rho": numerator / weight_sum if weight_sum else None,
            "matchedCellPairs": matched, "totalIntersectionWeight": weight_sum,
            "endpointPairsWithSupport": endpoint_pairs}


def boundary_summary(x: np.ndarray, y: np.ndarray, ux: np.ndarray, uy: np.ndarray) -> dict:
    distances = np.column_stack((x, 1 - x, y, 1 - y))
    nearest = np.argmin(distances, axis=1)  # ties: left, right, top, bottom
    distance = distances[np.arange(len(x)), nearest]
    tangent_alignment = np.where(nearest < 2, np.abs(uy), np.abs(ux))
    correlation = None
    if len(distance) > 1 and np.std(distance) > 0 and np.std(tangent_alignment) > 0:
        correlation = float(np.corrcoef(distance, tangent_alignment)[0, 1])
    edges = np.linspace(0.0, 0.5, 11)
    bins = []
    for index in range(10):
        selected = (distance >= edges[index]) & (distance < edges[index + 1])
        if index == 9:
            selected |= distance == 0.5
        bins.append({"distanceFromEdge": [float(edges[index]), float(edges[index + 1])],
                     "segments": int(np.count_nonzero(selected)),
                     "meanAbsoluteTangentAlignment": finite_mean(tangent_alignment[selected])})
    return {"segments": int(len(distance)), "pearsonDistanceVsAbsoluteTangentAlignment": correlation,
            "cornerTieOrder": ["left", "right", "top", "bottom"], "bins": bins}


def nearest_boundary(x: float, y: float) -> tuple[float, str]:
    choices = ((x, "left"), (1 - x, "right"), (y, "top"), (1 - y, "bottom"))
    best_distance, best_edge = choices[0]
    for distance, edge in choices[1:]:
        if distance < best_distance:
            best_distance, best_edge = distance, edge
    return best_distance, best_edge


def bilinear_sample(mask: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    gx, gy = np.clip(x, 0, 1) * (width - 1), np.clip(y, 0, 1) * (height - 1)
    x0, y0 = np.floor(gx).astype(np.int32), np.floor(gy).astype(np.int32)
    x1, y1 = np.minimum(width - 1, x0 + 1), np.minimum(height - 1, y0 + 1)
    tx, ty = gx - x0, gy - y0
    top = mask[y0, x0] * (1 - tx) + mask[y0, x1] * tx
    bottom = mask[y1, x0] * (1 - tx) + mask[y1, x1] * tx
    return top * (1 - ty) + bottom * ty


def plate_summary(segments: dict[str, np.ndarray], materials: dict[int, np.ndarray] | None) -> dict:
    if materials is None:
        return None
    bins = [{"startSeconds": index * 60, "endSeconds": (index + 1) * 60,
             "segments": 0, "distance": 0.0, "observedDistanceInPriorPlate": 0.0,
             "mirroredDistanceInPriorPlate": 0.0} for index in range(5)]
    total = {"segments": 0, "distance": 0.0, "observedDistanceInPriorPlate": 0.0,
             "mirroredDistanceInPriorPlate": 0.0}
    for revision in np.unique(segments["revision"]):
        selected = segments["revision"] == revision
        mask = materials[int(revision)]
        mirrored = mask[:, ::-1]
        observed = bilinear_sample(mask, segments["x"][selected], segments["y"][selected])
        mirror = bilinear_sample(mirrored, segments["x"][selected], segments["y"][selected])
        idx = np.flatnonzero(selected)
        sec = segments["time"][selected]
        length = segments["length"][selected]
        seconds = np.floor(sec).astype(np.int32)
        epochs = np.minimum(seconds // 60, 4)
        for epoch in range(5):
            local = epochs == epoch
            if not np.any(local):
                continue
            row = bins[epoch]
            row["segments"] += int(np.count_nonzero(local))
            row["distance"] += float(np.sum(length[local]))
            row["observedDistanceInPriorPlate"] += float(np.sum(length[local] * observed[local]))
            row["mirroredDistanceInPriorPlate"] += float(np.sum(length[local] * mirror[local]))
        total["segments"] += int(len(idx))
        total["distance"] += float(np.sum(length))
        total["observedDistanceInPriorPlate"] += float(np.sum(length * observed))
        total["mirroredDistanceInPriorPlate"] += float(np.sum(length * mirror))
    rows = bins + [{"startSeconds": 0, "endSeconds": 300, **total}]
    for row in rows:
        denominator = row["distance"]
        row["observedOverlapRate"] = row["observedDistanceInPriorPlate"] / denominator if denominator else None
        row["mirroredOverlapRate"] = row["mirroredDistanceInPriorPlate"] / denominator if denominator else None
        row["observedMinusMirrored"] = (row["observedOverlapRate"] - row["mirroredOverlapRate"]
            if row["observedOverlapRate"] is not None and row["mirroredOverlapRate"] is not None else None)
    return {"referenceType": "same-time horizontal reflection; deterministic descriptive reference, not a statistical null",
            "reflection": "x -> 1-x; preserves row coverage, all four boundary-distance marginals and x=0.5 entrance axis",
            "rows": rows}


def local_field_record(grid: int, window: int, end: int, counts: np.ndarray,
                       p: np.ndarray, q: np.ndarray) -> dict:
    arrays = {"N_u32le": np.asarray(counts, dtype="<u4").tobytes(),
              "P_x_f64le": np.asarray(p.real, dtype="<f8").tobytes(),
              "P_y_f64le": np.asarray(p.imag, dtype="<f8").tobytes(),
              "Q_x_f64le": np.asarray(q.real, dtype="<f8").tobytes(),
              "Q_y_f64le": np.asarray(q.imag, dtype="<f8").tobytes()}
    return {"grid": grid, "windowSeconds": window, "endSeconds": end,
            "N_countsOnlyNonzeroSegments": True,
            **{key: base64.b64encode(value).decode("ascii") for key, value in arrays.items()}}


def render_atlas(atlas_fields: dict) -> str:
    panel_w, row_h, plot = 210, 200, 160
    left, top = 150, 58
    width, height = left + panel_w * len(ATLAS_TIMES) + 20, top + row_h * 8 + 30
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<defs><marker id="arrow" markerWidth="4" markerHeight="4" refX="3.3" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 z" fill="#155e63"/></marker></defs>',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
        '<text x="12" y="23" font-family="Arial,sans-serif" font-size="15" font-weight="bold">ANT realized traffic orientation fields</text>',
        '<text x="12" y="42" font-family="Arial,sans-serif" font-size="10">Fixed strength scale 0–1; maps display only cells with N ≥ 3. All five fixed endpoints shown.</text>']
    for col, end in enumerate(ATLAS_TIMES):
        x = left + col * panel_w + 28
        parts.append(f'<text x="{x}" y="43" font-family="Arial,sans-serif" font-size="11">{end}s</text>')
    row_index = 0
    for grid in GRIDS:
        for window in WINDOWS:
            for kind in ("P", "Q"):
                y0 = top + row_index * row_h
                label = "polar P" if kind == "P" else "nematic Q (director shown headless)"
                parts.append(f'<text x="8" y="{y0 + 22}" font-family="Arial,sans-serif" font-size="11" font-weight="bold">{grid}×{grid}, W={window}s</text>')
                parts.append(f'<text x="8" y="{y0 + 38}" font-family="Arial,sans-serif" font-size="10">{label}</text>')
                for col, end in enumerate(ATLAS_TIMES):
                    counts, p, q = atlas_fields[(grid, window, end)]
                    z = p if kind == "P" else q
                    px = left + col * panel_w + 22
                    py = y0 + 24
                    cell = plot / grid
                    parts.append(f'<rect x="{px}" y="{py}" width="{plot}" height="{plot}" fill="#eef1f3" stroke="#82919b" stroke-width="0.7"/>')
                    for row in range(grid):
                        for column in range(grid):
                            if counts[row, column] < 3 or abs(z[row, column]) <= EPSILON:
                                continue
                            angle = float(np.angle(z[row, column]))
                            if kind == "Q":
                                angle *= 0.5
                            strength = min(1.0, float(abs(z[row, column])))
                            cx, cy = px + (column + 0.5) * cell, py + (row + 0.5) * cell
                            half = cell * 0.43 * strength
                            dx, dy = math.cos(angle) * half, math.sin(angle) * half
                            opacity = 0.15 + 0.85 * strength
                            if kind == "P":
                                parts.append(f'<line x1="{cx:.3f}" y1="{cy:.3f}" x2="{cx + dx:.3f}" y2="{cy + dy:.3f}" stroke="#155e63" stroke-opacity="{opacity:.4f}" stroke-width="0.8" marker-end="url(#arrow)"/>')
                            else:
                                parts.append(f'<line x1="{cx - dx:.3f}" y1="{cy - dy:.3f}" x2="{cx + dx:.3f}" y2="{cy + dy:.3f}" stroke="#155e63" stroke-opacity="{opacity:.4f}" stroke-width="0.9"/>')
                row_index += 1
    parts.append('<text x="12" y="' + str(height - 12) + '" font-family="Arial,sans-serif" font-size="10">P arrows preserve travel direction; Q bars identify an axis and do not distinguish reversal. Unsupported cells are blank.</text>')
    parts.append('</svg>')
    return "\n".join(parts) + "\n"


def write_manifest(folder: Path) -> None:
    entries = []
    for path in sorted(folder.rglob("*")):
        if path.is_file() and path.name != "MANIFEST.sha256":
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            entries.append(f"{digest}  {path.relative_to(folder).as_posix()}")
    (folder / "MANIFEST.sha256").write_text("\n".join(entries) + "\n", encoding="utf-8", newline="\n")


def order_from_angles(angles) -> tuple[complex, complex]:
    unit = np.exp(1j * np.asarray(angles, dtype=np.float64))
    if not len(unit):
        return 0j, 0j
    return complex(np.mean(unit)), complex(np.mean(unit ** 2))


def finite_mean(values) -> float | None:
    return float(np.mean(values)) if len(values) else None


def canonical_json(value, indent=None) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=indent, separators=None if indent else (",", ":"))


def selfcheck() -> None:
    polar, nematic = order_from_angles([0, 0, 0, 0])
    assert abs(abs(polar) - 1) < 1e-12 and abs(abs(nematic) - 1) < 1e-12
    polar, nematic = order_from_angles([0, math.pi])
    assert abs(polar) < 1e-12 and abs(abs(nematic) - 1) < 1e-12
    q = np.exp(1j * np.asarray([0, math.pi / 2, math.pi, 3 * math.pi / 2]))
    assert abs(winding_charge(q, "Q") - 0.5) < 1e-12
    assert abs(winding_charge(q[::-1], "Q") + 0.5) < 1e-12
    assert nearest_boundary(0.1, 0.1) == (0.1, "left")
    assert nearest_boundary(0.75, 0.75) == (0.25, "right")
    assert window_bounds(10, 5) == (5, 10)
    assert len(list(interior_elementary_loops(5))) == 4
    assert bilinear_sample(np.asarray([[0.0, 1.0], [0.0, 1.0]]), np.asarray([0.5]), np.asarray([0.5]))[0] == 0.5


if __name__ == "__main__":
    main()
