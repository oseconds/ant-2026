#!/usr/bin/env python3
"""Render common-scale checkpoint maps for the material attenuation screen."""
import gzip
import hashlib
import json
import io
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs/ant/evidence/2026-10-30-material-pheromone-attenuation-screen/data"
OUTPUT = ROOT / "docs/ant/evidence/2026-10-30-material-pheromone-attenuation-screen/atlas.png"
BG, TEXT, MUTED = (13, 18, 25), (230, 236, 242), (160, 174, 188)
GRID, CELL, MAP = 96, 3, 288
TIMES = (300, 600)
PANELS = (("control", 300), ("candidate", 300), ("control", 600), ("candidate", 600))


def read_gz(path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return json.load(stream)


def font(size):
    try:
        return ImageFont.truetype("C:/Windows/Fonts/arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def validate():
    paired = read_gz(DATA / "paired-input.json.gz")
    analysis = json.loads((DATA / "ANALYSIS.json").read_text(encoding="utf-8"))
    expected = json.loads((DATA / "SOURCE-HASHES.json").read_text(encoding="utf-8"))
    for rel, digest in expected.items():
        path = DATA / rel
        if path.is_file():
            assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, f"source hash mismatch: {rel}"
    for arm in ("control", "candidate"):
        masks = paired[arm]["actualBirthMasks"]
        assert masks and all(len(item["mask"]) == GRID * GRID for item in masks)
        for sec in TIMES:
            frame = read_gz(DATA / arm / f"seed20261005-G-{sec}s.json.gz")
            assert (frame["pheromone"]["width"], frame["pheromone"]["height"]) == (GRID, GRID)
            assert (frame["surface"]["width"], frame["surface"]["height"]) == (GRID, GRID)
            assert (frame["occupancy"]["width"], frame["occupancy"]["height"]) == (64, 64)
            assert len(frame["occupancy"]["recent30sAntSeconds"]) == 4096
    return paired, analysis


def actual_layers(masks, seconds):
    values = [0] * (GRID * GRID)
    cutoff = seconds * 1000
    for birth in masks:
        if birth["bornAtSimulationTimeMs"] <= cutoff:
            for i, present in enumerate(birth["mask"]):
                values[i] += bool(present)
    return values


def color(value, maximum):
    t = 0 if maximum == 0 else max(0, min(1, value / maximum))
    return (int(17 + 45*t), int(30 + 184*t), int(43 + 197*t))


def draw_map(draw, values, maximum, x, y, width=GRID):
    cell = MAP / width
    for i, value in enumerate(values):
        px, py = i % width, i // width
        draw.rectangle((x + px*cell, y + py*cell, x + (px+1)*cell-1, y + (py+1)*cell-1), fill=color(value, maximum))


def build(paired, analysis):
    metrics = {round(row["seconds"]): row for row in analysis["checkpointComparison"]}
    maps = {}
    for arm, sec in PANELS:
        data = read_gz(DATA / arm / f"seed20261005-G-{sec}s.json.gz")
        maps[(arm, sec)] = {
            "chemical": data["pheromone"]["values"],
            "surface": data["surface"]["values"],
            "layers": actual_layers(paired[arm]["actualBirthMasks"], sec),
            "occupancy": data["occupancy"]["recent30sAntSeconds"],
        }
    scales = {row: max(max(maps[key][row]) for key in maps) for row in ("chemical", "surface", "layers", "occupancy")}
    # Chemical has a fixed display cap of 2; values above it remain labeled and counted.
    scales["chemical"] = 2.0
    panel_w, top, row_h = 340, 118, 350
    img = Image.new("RGB", (4*panel_w+36, top+4*row_h+38), BG)
    d = ImageDraw.Draw(img)
    d.text((20, 16), "Material attenuation screen | fixed-scale checkpoint fields", fill=TEXT, font=font(23))
    d.text((20, 48), "Seed 20261005 · control / treatment · shared coordinates within each map row", fill=MUTED, font=font(14))
    rows = (("chemical", "Chemical field · projected 96×96 (not native 316×316)", "0–2; values above 2 clipped"),
            ("surface", "C surface field · 96×96", "0–1"),
            ("layers", "Actual layer count · reconstructed from birth masks", "0–global maximum"),
            ("occupancy", "Recent 30 s occupancy · ant-seconds per 64×64 cell", "0–global maximum"))
    for ri, (key, title, scale_label) in enumerate(rows):
        y = top + ri*row_h
        d.text((20, y-22), title, fill=TEXT, font=font(14))
        if key == "chemical":
            d.text((20, y+MAP+7), "Common scale 0–2 fixed; values above 2 annotated", fill=MUTED, font=font(11))
        else:
            d.text((20, y+MAP+7), f"Common scale {scale_label}; max={scales[key]:.3g}", fill=MUTED, font=font(11))
        for ci, (arm, sec) in enumerate(PANELS):
            x = 20 + ci*panel_w
            if ri == 0:
                d.text((x, 76), f"{arm.upper()} · {sec}s", fill=TEXT, font=font(14))
            vals = maps[(arm, sec)][key]
            if key == "chemical": vals = [min(v, scales[key]) for v in vals]
            draw_map(d, vals, scales[key], x, y, 64 if key == "occupancy" else GRID)
            if key == "chemical":
                over = sum(v > scales[key] for v in maps[(arm, sec)][key])
                actual_max = max(maps[(arm, sec)][key])
                d.text((x, y+MAP+23), f"cells >2: {over} · actual max {actual_max:.3g}", fill=MUTED, font=font(10))
            if ri == 3:
                m = metrics[sec][arm]
                d.text((x, y+MAP+38), f"Pheromone Σ {m['pheromoneNodeSum']:.1f} · C Σ {m['C']['surfaceSum']:.1f}", fill=MUTED, font=font(10))
                d.text((x, y+MAP+52), f"Plates {m['material']['plateCount']} · accepted feet {m['material']['totalAcceptedFootContacts']}", fill=MUTED, font=font(10))
    d.text((20, img.height-22), "Panels share row scales; coordinate frames are preserved. Treatment label follows stored candidate arm. Descriptive maps only.", fill=MUTED, font=font(10))
    return img


if __name__ == "__main__":
    paired_data, analysis_data = validate()
    image = build(paired_data, analysis_data)
    stream = io.BytesIO()
    image.save(stream, format="PNG", optimize=False)
    encoded = stream.getvalue()
    if "--check" in sys.argv:
        assert OUTPUT.read_bytes() == encoded, "atlas regeneration must be byte-identical"
    else:
        OUTPUT.write_bytes(encoded)
    check = Image.open(io.BytesIO(encoded))
    assert check.format == "PNG" and check.size == image.size and check.mode == "RGB"
    print(f"{OUTPUT} {check.width}x{check.height} sha256={hashlib.sha256(OUTPUT.read_bytes()).hexdigest()} png={check.format}")
