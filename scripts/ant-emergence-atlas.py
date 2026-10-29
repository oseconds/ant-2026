#!/usr/bin/env python3
"""Render a deterministic, same-grid atlas for the frozen proposal frames."""
import argparse
import io
import gzip
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs/ant/evidence/2026-10-29-proposal-emergence-exploration"
INPUT = PACKAGE / "data/frozen-inputs.json.gz"
ANALYSIS = PACKAGE / "analysis.json"
OUTPUT = PACKAGE / "atlas.png"
SIZE = 96
CELL = 4
MARGIN = 24
TOP = 47
GAP_X = 24
GAP_Y = 28
PANEL_W = SIZE * CELL
PANEL_H = SIZE * CELL
COLS = ("E / F context", "I production", "A geodesic", "B peak-saddle", "C chord")
COLORS = {"A": (35, 92, 150), "B": (164, 79, 42), "C": (112, 72, 139)}


def load_data():
    digest = hashlib.sha256(INPUT.read_bytes()).hexdigest()
    if digest != "6ff3ec3d6fb8bc0fa1f323532361ab9d19ecc0e75353b1b9ce3d6875c440842d":
        raise ValueError(f"unexpected frozen input SHA-256: {digest}")
    with gzip.open(INPUT, "rt", encoding="utf-8") as f:
        frozen = json.load(f)
    analysis = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    raw = {e["id"]: e for e in frozen["events"]}
    return raw, {e["id"]: e for e in analysis["events"]}


def rect(draw, ox, oy, index, color):
    x, y = index % SIZE, index // SIZE
    x0, y0 = ox + x * CELL, oy + y * CELL
    draw.rectangle((x0, y0, x0 + CELL - 1, y0 + CELL - 1), fill=color)


def draw_map(draw, ox, oy, indices, color):
    for index in indices:
        rect(draw, ox, oy, index, color)


def render():
    frozen, analysis = load_data()
    rows, cols = 2, len(COLS)
    width = MARGIN * 2 + cols * PANEL_W + (cols - 1) * GAP_X
    height = TOP + rows * PANEL_H + (rows - 1) * GAP_Y + 28
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    for col, label in enumerate(COLS):
        x = MARGIN + col * (PANEL_W + GAP_X)
        draw.text((x, 25), label, fill=(35, 35, 35), font=font)

    assertions = []
    for row, event_id in enumerate((1, 2)):
        source = frozen[event_id]["anchors"][-1]
        frame = analysis[event_id]["anchors"][-1]
        maps = source["maps"]
        y = TOP + row * (PANEL_H + GAP_Y)
        draw.text((MARGIN + 82, y - 15), f"P{row + 1}  {source['timeMs'] / 1000:.6f} s", fill=(25, 25, 25), font=font)
        for col in range(cols):
            ox = MARGIN + col * (PANEL_W + GAP_X)
            draw.rectangle((ox, y, ox + PANEL_W - 1, y + PANEL_H - 1), outline=(225, 225, 225))

        # One context panel; every structural panel uses the same unscaled world coordinates.
        context = MARGIN
        draw_map(draw, context, y, [i for i, v in enumerate(maps["E_qualified"]) if v], (225, 226, 226))
        draw_map(draw, context, y, [i for i, v in enumerate(maps["F_skeleton"]) if v], (167, 174, 177))
        draw.text((context + 5, y + 5), "E / F", fill=(40, 40, 40), font=font)

        ox = MARGIN + PANEL_W + GAP_X
        control = [i for i, v in enumerate(maps["I_retained_network"]) if v]
        draw_map(draw, ox, y, control, (35, 35, 35))
        assertions.append(("I", ox, y, control, (35, 35, 35)))

        for col, name in enumerate(("A", "B", "C"), start=2):
            ox = MARGIN + col * (PANEL_W + GAP_X)
            candidate = frame["candidates"][name]
            if name == "B":
                region = candidate["landscape"]["selected"]["premergeRegion"]["cellIndices"]
                draw_map(draw, ox, y, region, (243, 235, 222))
                peak = candidate["landscape"]["selected"]["peakIndex"]
                saddles = candidate["landscape"]["selected"]["saddleIndices"]
                draw_map(draw, ox, y, saddles, (214, 176, 136))
                rect(draw, ox, y, peak, (124, 50, 22))
            path = candidate["path"]
            color = COLORS[name]
            points = [(ox + (i % SIZE) * CELL + CELL // 2,
                       y + (i // SIZE) * CELL + CELL // 2) for i in path]
            if len(points) > 1:
                draw.line(points, fill=color, width=2)
            draw_map(draw, ox, y, path, color)
            assertions.append((name, ox, y, path, color))

    draw.text((MARGIN, height - 19),
              "Same 96 x 96 world frame. B pale lobe is a diagnostic domain, not material. Structural cells only; no BODY width.",
              fill=(65, 65, 65), font=font)
    # Check actual final raster pixels at each control/candidate cell center.
    for name, ox, oy, path, color in assertions:
        for index in path:
            pixel = (ox + (index % SIZE) * CELL + CELL // 2,
                     oy + (index // SIZE) * CELL + CELL // 2)
            if image.getpixel(pixel) != color:
                raise AssertionError(f"{name} cell {index} raster center is {image.getpixel(pixel)}, expected {color}")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False)
    return image, buffer.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="require generated bytes to match existing atlas.png")
    args = parser.parse_args()
    previous = OUTPUT.read_bytes() if args.check else None
    image, generated = render()
    if args.check and generated != previous:
        raise SystemExit("atlas.png differs from deterministic render")
    if not args.check:
        OUTPUT.write_bytes(generated)
    size = image.size
    print(f"atlas: {size[0]}x{size[1]} px; {len(generated)} bytes; raster candidate-cell assertions passed")
    if args.check:
        print("--check: generated bytes match existing atlas.png")


if __name__ == "__main__":
    main()
